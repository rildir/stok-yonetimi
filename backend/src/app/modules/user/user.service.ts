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
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async requestPasswordReset(username: string): Promise<{ success: boolean; message: string }> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND_BY_USERNAME'));
    }
    this.appGateway.notifyPasswordResetRequest(user.companyId, {
      username: user.username,
      fullName: user.fullName || user.username,
    });
    return {
      success: true,
      message: 'Şifre sıfırlama talebiniz sistem yöneticisine başarıyla iletildi.',
    };
  }

  private sanitizeUser(user: UserEntity): UserEntity & { invitePending: boolean; locked: boolean } {
    const { password, inviteTokenHash, ...sanitized } = user;
    return { ...(sanitized as UserEntity), invitePending: !!inviteTokenHash, locked: isLocked(user, new Date()) };
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

  /** The invitee sets the first password; the invitation is consumed. */
  async acceptInvite(token: string, password: string): Promise<UserEntity> {
    const user = await this.findByInviteToken(token);
    await this.userRepo.update(
      { id: user.id },
      {
        password: this.stockHelper.hashPassword(password),
        inviteTokenHash: null,
        inviteExpiresAt: null,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
        tokenVersion: user.tokenVersion + 1,
      },
    );
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

  /** Counts a failed sign-in; returns true when the account has just been locked. */
  async recordFailedLogin(user: UserEntity, now = new Date()): Promise<boolean> {
    const next = registerFailedLogin(user, now, lockoutPolicy());
    await this.userRepo.update({ id: user.id }, { failedLoginCount: next.failedLoginCount, lockedUntil: next.lockedUntil });
    user.failedLoginCount = next.failedLoginCount;
    user.lockedUntil = next.lockedUntil;
    return next.locked;
  }

  async recordSuccessfulLogin(user: UserEntity): Promise<void> {
    if (user.failedLoginCount || user.lockedUntil) {
      await this.userRepo.update({ id: user.id }, { failedLoginCount: 0, lockedUntil: null });
    }
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
  }

  async terminateUserSessions(username: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    user.tokenVersion++;
    await this.userRepo.save(user);
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

    if (updates.password) {
      // An admin-set password is temporary: the user must choose a new one at next sign-in.
      user.password = this.stockHelper.hashPassword(updates.password);
      user.mustChangePassword = true;
      user.inviteTokenHash = null;
      user.inviteExpiresAt = null;
      user.tokenVersion++;
    }

    const saved = await this.userRepo.save(user);
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
