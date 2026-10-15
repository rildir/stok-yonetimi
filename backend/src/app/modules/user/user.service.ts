import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CreateUserDto, UpdateUserDto } from '../../dto/user.dto';
import { UserRole } from '../../entities/enums';

import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { isLocked, lockoutPolicy, minutesLeft, registerFailedLogin } from '../../shared/security/security-config';
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from '../../shared/kvkk/totp';
import { companyPolicy } from '../../shared/kvkk/company-policy';
import { SessionService } from './session.service';

export const INVITE_TTL_DAYS = 7;
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

export interface InviteInfo {
  token: string;
  url: string;
  expiresAt: Date;
}

/** Public URL of the SPA for invitation links. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env['APP_URL'] || (env['CORS_ORIGIN'] || '').split(',')[0] || 'http://localhost:4200').trim().replace(/\/+$/, '');
}

@Injectable()
export class UserService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly appGateway: AppGateway,
    private readonly sessions: SessionService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /**
   * Forwards a reset request to the company's admins. The response is the same
   * whether or not the user exists, so the endpoint cannot be used to enumerate accounts.
   */
  async requestPasswordReset(username: string): Promise<{ success: boolean; message: string }> {
    const user = await this.getUserByUsername(username);
    if (user) {
      this.appGateway.notifyPasswordResetRequest(user.companyId, {
        username: user.username,
        fullName: user.fullName || user.username,
      });
    }
    return {
      success: true,
      message: 'Şifre sıfırlama talebiniz sistem yöneticisine başarıyla iletildi.',
    };
  }

  private sanitizeUser(user: UserEntity): UserEntity & { invitePending: boolean; locked: boolean; totpEnabled: boolean } {
    const { password, inviteTokenHash, totpSecret, totpPendingSecret, totpRecoveryCodes, totpLastStep, ...sanitized } = user;
    return { ...(sanitized as UserEntity), invitePending: !!inviteTokenHash, locked: isLocked(user, new Date()), totpEnabled: !!user.totpEnabledAt };
  }

  // ------------------------------------------------------------------ 2FA (TOTP, WP7)

  /** Starts the enrolment: a new secret (kept pending until the first valid code), otpauth URL and QR. */
  async totpSetup(username: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.getUserByUsername(username);
    if (!user) throw new BadRequestException(err('USER_NOT_FOUND'));
    if (user.totpEnabledAt) throw new BadRequestException(err('TOTP_ALREADY_ENABLED'));
    const secret = generateTotpSecret();
    await this.userRepo.update({ id: user.id }, { totpPendingSecret: secret });
    const url = otpauthUrl(secret, user.username);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const QRCode = require('qrcode') as typeof import('qrcode');
    return { secret, otpauthUrl: url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
  }

  /** Confirms the enrolment with a code; returns the one-time recovery codes (shown once). */
  async totpEnable(username: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.getUserByUsername(username);
    if (!user) throw new BadRequestException(err('USER_NOT_FOUND'));
    if (user.totpEnabledAt) throw new BadRequestException(err('TOTP_ALREADY_ENABLED'));
    if (!user.totpPendingSecret) throw new BadRequestException(err('TOTP_NOT_ENABLED'));
    const step = verifyTotp(user.totpPendingSecret, code);
    if (step === null) throw new BadRequestException(err('TOTP_INVALID'));
    const codes = generateRecoveryCodes();
    user.totpSecret = user.totpPendingSecret;
    user.totpPendingSecret = null;
    user.totpEnabledAt = new Date();
    user.totpLastStep = String(step);
    user.totpRecoveryCodes = codes.map(hashRecoveryCode);
    await this.userRepo.save(user);
    return { recoveryCodes: codes };
  }

  /** Turns 2FA off (password + code). Refused for administrators of a company that requires it. */
  async totpDisable(username: string, password: string, code: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) throw new BadRequestException(err('USER_NOT_FOUND'));
    if (!user.totpEnabledAt) throw new BadRequestException(err('TOTP_NOT_ENABLED'));
    const policy = await companyPolicy(this.userRepo.manager.connection, user.companyId);
    if (user.role === UserRole.ADMIN && policy.adminTotpRequired) throw new BadRequestException(err('TOTP_REQUIRED'));
    if (!(await this.stockHelper.verifyPassword(password, user.password))) throw new BadRequestException(err('AUTH_WRONG_CURRENT_PASSWORD'));
    if (!(await this.verifySecondFactor(user, code))) throw new BadRequestException(err('TOTP_INVALID'));
    await this.userRepo.update({ id: user.id }, { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: null });
  }

  /**
   * Second factor at sign-in: a TOTP code (a time step is never accepted twice) or a recovery code
   * (consumed). Serialized with a row lock.
   */
  async verifySecondFactor(user: UserEntity, code: string): Promise<boolean> {
    return this.userRepo.manager.transaction(async (m) => {
      const row = await m.findOne(UserEntity, { where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!row?.totpSecret) return false;
      const step = verifyTotp(row.totpSecret, code);
      if (step !== null) {
        if (row.totpLastStep !== null && row.totpLastStep !== undefined && step <= Number(row.totpLastStep)) return false;
        await m.update(UserEntity, { id: row.id }, { totpLastStep: String(step) });
        return true;
      }
      const h = hashRecoveryCode(code);
      const list = row.totpRecoveryCodes || [];
      if (/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(String(code).trim()) && list.includes(h)) {
        await m.update(UserEntity, { id: row.id }, { totpRecoveryCodes: list.filter((x) => x !== h) });
        return true;
      }
      return false;
    });
  }

  /** Generates a one-time invitation token (stored hashed) and an unusable random password. */
  private issueInvite(user: UserEntity): InviteInfo {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
    user.inviteTokenHash = sha256(token);
    user.inviteExpiresAt = expiresAt;
    user.password = this.stockHelper.hashPassword(randomBytes(32).toString('base64url'));
    user.mustChangePassword = false;
    return { token, url: `${appBaseUrl()}/invite/${token}`, expiresAt };
  }

  async findByInviteToken(token: string): Promise<UserEntity> {
    const user = token ? await this.userRepo.findOne({ where: { inviteTokenHash: sha256(token) } }) : null;
    if (!user || !user.inviteExpiresAt || new Date(user.inviteExpiresAt).getTime() < Date.now()) {
      throw new BadRequestException(err('INVITE_INVALID'));
    }
    return user;
  }

  /**
   * The invitee sets the first password; the invitation is consumed. The token is
   * matched again inside the UPDATE so two concurrent requests cannot both use it.
   */
  async acceptInvite(token: string, password: string): Promise<UserEntity> {
    const user = await this.findByInviteToken(token);
    const result = await this.userRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        password: this.stockHelper.hashPassword(password),
        inviteTokenHash: null,
        inviteExpiresAt: null,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
        tokenVersion: () => 'tokenVersion + 1',
      })
      .where('id = :id AND inviteTokenHash = :hash AND inviteExpiresAt >= :now', { id: user.id, hash: sha256(token), now: new Date() })
      .execute();
    if (!result.affected) throw new BadRequestException(err('INVITE_INVALID'));
    return this.userRepo.findOneByOrFail({ id: user.id });
  }

  /** Admin: re-issue the invitation link of a user (replaces any password). */
  async reinvite(id: string): Promise<InviteInfo> {
    const user = await this.userRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!user) throw new BadRequestException(err('USER_NOT_FOUND'));
    const invite = this.issueInvite(user);
    user.tokenVersion++;
    await this.userRepo.save(user);
    return invite;
  }

  /** Admin: clear a lockout. */
  async unlock(id: string) {
    const user = await this.userRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!user) throw new BadRequestException(err('USER_NOT_FOUND'));
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    return this.sanitizeUser(await this.userRepo.save(user));
  }

  /** Throws ACCOUNT_LOCKED (423) while a lockout is active; runs before the password check. */
  assertNotLocked(user: UserEntity, now = new Date()): void {
    if (isLocked(user, now)) {
      throw new HttpException(err('ACCOUNT_LOCKED', { minutes: minutesLeft(user.lockedUntil as Date, now) }), HttpStatus.LOCKED);
    }
  }

  /**
   * Counts a failed sign-in; returns true when the account is (now) locked.
   * Runs in a transaction with a row lock (SELECT ... FOR UPDATE) so concurrent
   * failed attempts are serialized and cannot all compute from the same stale count.
   */
  async recordFailedLogin(user: UserEntity, now = new Date()): Promise<boolean> {
    const next = await this.userRepo.manager.transaction(async (m) => {
      const row = await m.findOne(UserEntity, { where: { id: user.id }, select: ['id', 'failedLoginCount', 'lockedUntil'], lock: { mode: 'pessimistic_write' } });
      if (!row) return { failedLoginCount: 0, lockedUntil: null, locked: false };
      // A concurrent attempt has already locked the account: keep that lock.
      if (isLocked(row, now)) return { failedLoginCount: row.failedLoginCount || 0, lockedUntil: row.lockedUntil as Date, locked: true };
      const r = registerFailedLogin(row, now, lockoutPolicy());
      await m.update(UserEntity, { id: user.id }, { failedLoginCount: r.failedLoginCount, lockedUntil: r.lockedUntil });
      return r;
    });
    user.failedLoginCount = next.failedLoginCount;
    user.lockedUntil = next.lockedUntil;
    return next.locked;
  }

  /** Fresh lock state from the database (a parallel request may have locked the account meanwhile). */
  async assertNotLockedFresh(user: UserEntity, now = new Date()): Promise<void> {
    const row = await this.userRepo.findOne({ where: { id: user.id }, select: ['id', 'lockedUntil'] });
    if (row) user.lockedUntil = row.lockedUntil ?? null;
    this.assertNotLocked(user, now);
  }

  async recordSuccessfulLogin(user: UserEntity): Promise<void> {
    if (user.failedLoginCount || user.lockedUntil) {
      await this.userRepo.update({ id: user.id }, { failedLoginCount: 0, lockedUntil: null });
    }
  }

  async getUserById(id: string): Promise<UserEntity | null> {
    return id ? this.userRepo.findOne({ where: { id } }) : null;
  }

  async getUserByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async updateUserProfile(username: string, updates: Partial<UserEntity>) {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;
    // null clears the override (falls back to company default)
    if (updates.language !== undefined) user.language = updates.language || null;
    if (updates.timezone !== undefined) user.timezone = updates.timezone || null;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async updateUserPassword(username: string, newPasswordPlain: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    user.password = this.stockHelper.hashPassword(newPasswordPlain);
    user.tokenVersion++;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await this.userRepo.save(user);
    await this.sessions.revokeAll(user.id, 'password_changed');
  }

  async terminateUserSessions(username: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    user.tokenVersion++;
    await this.userRepo.save(user);
    await this.sessions.revokeAll(user.id, 'terminated');
  }

  async getAllUsers() {
    const users = await this.userRepo.find({ where: { companyId: this.companyId }, order: { fullName: 'ASC' } });
    return users.map((u) => this.sanitizeUser(u));
  }

  /**
   * Creates a user. Without a password an invitation link is issued (returned once);
   * with an admin-chosen password (policy-checked) the user must change it at first
   * sign-in. There is no default password.
   */
  async createUser(adminUsername: string, data: CreateUserDto) {
    const admin = await this.getUserByUsername(adminUsername);
    if (!admin || admin.companyId !== this.companyId) {
      throw new BadRequestException(err('ADMIN_NOT_FOUND'));
    }

    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) {
      throw new BadRequestException(err('USERNAME_TAKEN', { username: data.username }));
    }

    const newUser = this.userRepo.create({
      companyId: admin.companyId,
      username: data.username,
      role: data.role || UserRole.VIEWER,
      fullName: data.fullName,
      email: data.email,
      department: data.department || '',
      tokenVersion: 0,
      permissions: data.permissions?.length ? data.permissions : null,
    });
    let invite: InviteInfo | undefined;
    if (data.password) {
      newUser.password = this.stockHelper.hashPassword(data.password);
      newUser.mustChangePassword = true;
    } else {
      invite = this.issueInvite(newUser);
    }

    const saved = await this.userRepo.save(newUser);
    return { ...this.sanitizeUser(saved), ...(invite ? { invite } : {}) };
  }

  /** Transparent SHA-256 -> bcrypt upgrade during login (runs before tenant context exists). */
  async migratePasswordHash(user: UserEntity, plainPassword: string): Promise<void> {
    user.password = this.stockHelper.hashPassword(plainPassword);
    await this.userRepo.update({ id: user.id }, { password: user.password });
  }

  async updateUser(id: string, updates: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }

    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.permissions !== undefined) user.permissions = updates.permissions?.length ? updates.permissions : null;

    if (updates.password) {
      // An admin-set password is temporary: the user must choose a new one at next sign-in.
      user.password = this.stockHelper.hashPassword(updates.password);
      user.mustChangePassword = true;
      user.inviteTokenHash = null;
      user.inviteExpiresAt = null;
      user.tokenVersion++;
    }

    const saved = await this.userRepo.save(user);
    if (updates.password) await this.sessions.revokeAll(user.id, 'password_reset');
    return this.sanitizeUser(saved);
  }

  async deleteUser(id: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!user) return false;

    if (user.role === UserRole.ADMIN) {
      const adminCount = await this.userRepo.count({ where: { companyId: this.companyId, role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException(err('USER_LAST_ADMIN'));
      }
    }

    await this.userRepo.remove(user);
    return true;
  }
}
