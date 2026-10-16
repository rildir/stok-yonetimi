import { err } from '../../shared/i18n/app-error';
import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res, BadRequestException, UnauthorizedException, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtService } from '@nestjs/jwt';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CompanyService } from '../company/company.service';
import { buildJwtPayload } from '../../guards/jwt-payload';
import { UserEntity } from '../../entities/user.entity';
import { AuditService } from '../integrations/audit.service';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto, UpdatePasswordDto, LoginDto, ResetPasswordRequestDto, AcceptInviteDto, TotpLoginDto, TotpCodeDto, TotpDisableDto } from '../../dto/user.dto';
import { AllowPendingPasswordChange, AllowTotpSetup, SelfService } from '../../guards/security.decorators';
import { SessionService } from './session.service';
import { effectivePermissions } from '../../shared/kvkk/permissions';
import { companyPolicy, totpSetupBlocking, totpSetupPending } from '../../shared/kvkk/company-policy';
import { DataSource } from 'typeorm';

/** Purpose claim of the short-lived token between the password and the 2FA step. */
const TOTP_CHALLENGE = 'totp-challenge';
import { isStrongPassword } from '../../shared/tr';

@ApiTags('Auth & Users')
@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly stockHelper: StockHelperService,
    private readonly companyService: CompanyService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly dataSource: DataSource,
  ) {}

  /** Access token + refresh cookie; reports the 2FA obligation of administrators. */
  private async completeLogin(user: UserEntity, req: any, res: any, extra: Record<string, unknown> = {}) {
    await this.userService.recordSuccessfulLogin(user);
    await this.audit.record({ companyId: user.companyId, action: 'login', entityType: 'auth', entityId: user.id, userId: user.id, username: user.username, after: { secondFactor: !!user.totpEnabledAt } });
    const policy = await companyPolicy(this.dataSource, user.companyId);
    return {
      token: await this.sessions.start(user, req, res),
      mustChangePassword: !!user.mustChangePassword,
      totpSetupRequired: totpSetupPending(policy, user),
      totpSetupBlocking: totpSetupBlocking(policy, user),
      totpGraceUntil: totpSetupPending(policy, user) ? policy.adminTotpGraceUntil : null,
      ...extra,
    };
  }

  private async toProfile(user: UserEntity) {
    const company = await this.companyService.getCompanyById(user.companyId);
    if (!company) {
      throw new BadRequestException(err('COMPANY_NOT_FOUND'));
    }
    return {
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      avatar: user.avatar,
      createdAt: user.createdAt,
      language: user.language ?? null,
      timezone: user.timezone ?? null,
      isSuperAdmin: !!user.isSuperAdmin,
      mustChangePassword: !!user.mustChangePassword,
      permissions: effectivePermissions(user.role, user.permissions),
      totpEnabled: !!user.totpEnabledAt,
      totpSetupRequired: totpSetupPending(await companyPolicy(this.dataSource, user.companyId), user),
      totpGraceUntil: company.adminTotpGraceUntil ?? null,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        country: company.country,
        defaultLanguage: company.defaultLanguage,
        baseCurrency: company.baseCurrency,
        timezone: company.timezone,
        expiryAlertDays: company.expiryAlertDays,
        pricesIncludeTax: company.pricesIncludeTax,
        isImporterOrOreProducer: company.isImporterOrOreProducer,
        isDesignatedBuyer: company.isDesignatedBuyer,
        fxAutoFetch: company.fxAutoFetch,
        legalName: company.legalName ?? null,
        bookkeepingType: company.bookkeepingType ?? null,
        status: company.status,
        retentionUntil: company.retentionUntil ?? null,
        adminTotpRequired: company.adminTotpRequired,
      },
      locale: this.companyService.resolveLocale(company, user),
    };
  }

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Kullanıcı Girişi (JWT Token al)' })
  @ApiResponse({ status: 200, description: 'Giriş başarılı, JWT token döner' })
  @ApiResponse({ status: 400, description: 'Kullanıcı adı veya şifre hatalı' })
  async login(@Body() dto: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const { username, password } = dto;
    const user = await this.userService.getUserByUsername(username);
    // Account enumeration: unknown user, locked account, pending invitation and wrong password all
    // answer with the same status, code and message (400 AUTH_INVALID_CREDENTIALS), and every path
    // runs one bcrypt comparison so the response time does not tell them apart either. The lockout
    // stays in force: while locked the password is never evaluated (no oracle for brute force) and
    // the reason is only written to the audit log.
    const invalid = () => new BadRequestException(err('AUTH_INVALID_CREDENTIALS'));
    if (!user) {
      this.stockHelper.burnPasswordCheck(password);
      await this.audit.record({ companyId: null, action: 'login_failed', entityType: 'auth', username, after: { reason: 'unknown_user' } });
      throw invalid();
    }
    // Lockout is checked before the password so a locked account cannot be brute-forced.
    if (this.userService.isLockedNow(user)) {
      this.stockHelper.burnPasswordCheck(password);
      await this.audit.record({ companyId: user.companyId, action: 'login_failed', entityType: 'auth', entityId: user.id, userId: user.id, username: user.username, after: { reason: 'locked' } });
      throw invalid();
    }
    // A pending invitation has no usable password: refuse without counting a failure, so that
    // knowing the username is not enough to lock the invitee out. Same response as a wrong password.
    if (user.inviteTokenHash) {
      this.stockHelper.burnPasswordCheck(password);
      await this.audit.record({ companyId: user.companyId, action: 'login_failed', entityType: 'auth', entityId: user.id, userId: user.id, username: user.username, after: { reason: 'invite_pending' } });
      throw invalid();
    }
    const onMigration = async (plainPassword: string) => {
      await this.userService.migratePasswordHash(user, plainPassword);
    };
    const valid = await this.stockHelper.verifyPassword(password, user.password, onMigration);
    if (!valid) {
      const locked = await this.userService.recordFailedLogin(user);
      await this.audit.record({
        companyId: user.companyId,
        action: locked ? 'account_locked' : 'login_failed',
        entityType: 'auth',
        entityId: user.id,
        userId: user.id,
        username: user.username,
        after: { reason: 'invalid_password' },
      });
      throw invalid();
    }
    // Parallel wrong attempts may have locked the account while this password was being checked.
    if (await this.userService.isLockedFresh(user)) {
      await this.audit.record({ companyId: user.companyId, action: 'login_failed', entityType: 'auth', entityId: user.id, userId: user.id, username: user.username, after: { reason: 'locked' } });
      throw invalid();
    }
    // Older accounts may still use a password that predates the policy: the UI suggests a change.
    const passwordPolicyOk = isStrongPassword(password);
    if (user.totpEnabledAt) {
      // 2FA (WP7): a 5-minute challenge token; the session starts after the code is verified.
      const challenge = await this.jwtService.signAsync({ sub: user.id, purpose: TOTP_CHALLENGE, tv: user.tokenVersion, ppo: passwordPolicyOk }, { expiresIn: 300 });
      return { totpRequired: true, challenge };
    }
    return this.completeLogin(user, req, res, { passwordPolicyOk });
  }

  @Public()
  @Post('auth/login/totp')
  @HttpCode(200)
  @ApiOperation({ summary: 'İki adımlı doğrulama: şifre adımından sonra 6 haneli kod veya kurtarma kodu' })
  async loginTotp(@Body() dto: TotpLoginDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    let payload: { sub: string; purpose: string; tv: number; ppo?: boolean };
    try {
      payload = await this.jwtService.verifyAsync(dto.challenge);
    } catch {
      throw new UnauthorizedException(err('TOTP_CHALLENGE_INVALID'));
    }
    if (payload?.purpose !== TOTP_CHALLENGE) throw new UnauthorizedException(err('TOTP_CHALLENGE_INVALID'));
    const user = await this.userService.getUserById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv || !user.totpEnabledAt) throw new UnauthorizedException(err('TOTP_CHALLENGE_INVALID'));
    this.userService.assertNotLocked(user);
    if (!(await this.userService.verifySecondFactor(user, dto.code))) {
      // Wrong codes count as failed sign-ins (lockout after 5) so the 6 digits cannot be brute-forced.
      const locked = await this.userService.recordFailedLogin(user);
      await this.audit.record({ companyId: user.companyId, action: locked ? 'account_locked' : 'login_failed', entityType: 'auth', entityId: user.id, userId: user.id, username: user.username, after: { reason: 'invalid_totp' } });
      if (locked) this.userService.assertNotLocked(user);
      throw new BadRequestException(err('TOTP_INVALID'));
    }
    return this.completeLogin(user, req, res, { passwordPolicyOk: payload.ppo !== false });
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Erişim jetonunu yenile (httpOnly yenileme çerezi ile; jeton döndürülür ve çerez yenilenir)' })
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const { token } = await this.sessions.refresh(req, res);
    return { token };
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Oturumu kapat (yenileme çerezini iptal eder)' })
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    await this.sessions.logout(req, res);
    return { success: true };
  }

  // ------------------------------------------------------------------ 2FA (TOTP)
  @ApiBearerAuth()
  @SelfService()
  @AllowTotpSetup()
  @Post('user/totp/setup')
  @ApiOperation({ summary: 'İki adımlı doğrulama kurulumunu başlat (gizli anahtar + QR)' })
  async totpSetup(@Req() req: any) {
    return this.userService.totpSetup(req.user.username);
  }

  @ApiBearerAuth()
  @SelfService()
  @AllowTotpSetup()
  @Post('user/totp/enable')
  @ApiOperation({ summary: 'İlk kodla iki adımlı doğrulamayı etkinleştir; kurtarma kodları yalnızca bu yanıtta döner' })
  async totpEnable(@Body() dto: TotpCodeDto, @Req() req: any) {
    const r = await this.userService.totpEnable(req.user.username, dto.code);
    await this.audit.record({ companyId: req.user.companyId, action: 'totp_enabled', entityType: 'auth', entityId: req.user.sub, username: req.user.username });
    return r;
  }

  @ApiBearerAuth()
  @SelfService()
  @Post('user/totp/disable')
  @ApiOperation({ summary: 'İki adımlı doğrulamayı kapat (şifre + kod; zorunlu olan yöneticilerde kapatılamaz)' })
  async totpDisable(@Body() dto: TotpDisableDto, @Req() req: any) {
    await this.userService.totpDisable(req.user.username, dto.password, dto.code);
    await this.audit.record({ companyId: req.user.companyId, action: 'totp_disabled', entityType: 'auth', entityId: req.user.sub, username: req.user.username });
    return { success: true };
  }

  @Public()
  @Get('auth/invite/:token')
  @ApiOperation({ summary: 'Davet bağlantısını doğrula' })
  async getInvite(@Param('token') token: string) {
    const user = await this.userService.findByInviteToken(token);
    const company = await this.companyService.getCompanyById(user.companyId);
    return { username: user.username, fullName: user.fullName, companyName: company?.name ?? null, expiresAt: user.inviteExpiresAt };
  }

  @Public()
  @Post('auth/accept-invite')
  @ApiOperation({ summary: 'Daveti kabul et ve ilk şifreyi belirle' })
  async acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const user = await this.userService.acceptInvite(dto.token, dto.password);
    await this.audit.record({ companyId: user.companyId, action: 'invite_accepted', entityType: 'auth', entityId: user.id, userId: user.id, username: user.username });
    return { token: await this.sessions.start(user, req, res) };
  }

  @Public()
  @Post('auth/reset-password-request')
  @ApiOperation({ summary: 'Şifre sıfırlama talebi gönder' })
  @ApiResponse({ status: 200, description: 'Talep yöneticiye iletildi' })
  async resetPasswordRequest(@Body() dto: ResetPasswordRequestDto) {
    return this.userService.requestPasswordReset(dto.username);
  }

  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @AllowTotpSetup()
  @Get('user/profile')
  @ApiOperation({ summary: 'Giriş yapmış kullanıcının profil bilgilerini getir' })
  @ApiResponse({ status: 200, description: 'Kullanıcı profili' })
  async getProfile(@Req() req: any) {
    const user = await this.userService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    return this.toProfile(user);
  }

  @ApiBearerAuth()
  @SelfService()
  @AllowTotpSetup()
  @Put('user/profile')
  @ApiOperation({ summary: 'Profil bilgilerini güncelle' })
  @ApiResponse({ status: 200, description: 'Profil güncellendi' })
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: any) {
    const updatedUser = await this.userService.updateUserProfile(req.user.username, dto);
    return {
      success: true,
      message: 'Profil başarıyla güncellendi',
      data: await this.toProfile(updatedUser),
    };
  }

  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @SelfService()
  @AllowTotpSetup()
  @Put('user/password')
  @ApiOperation({ summary: 'Kullanıcı kendi şifresini değiştirir' })
  @ApiResponse({ status: 200, description: 'Şifre güncellendi' })
  async updatePassword(@Body() dto: UpdatePasswordDto, @Req() req: any) {
    const user = await this.userService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    const isValid = await this.stockHelper.verifyPassword(dto.currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException(err('AUTH_WRONG_CURRENT_PASSWORD'));
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(err('PASSWORD_SAME_AS_OLD'));
    }
    await this.userService.updateUserPassword(req.user.username, dto.newPassword);
    return { success: true, message: 'Şifreniz başarıyla güncellendi.' };
  }

  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @SelfService()
  @AllowTotpSetup()
  @Post('user/sessions/terminate')
  @ApiOperation({ summary: 'Tüm oturumları sonlandır (Token invalidated)' })
  @ApiResponse({ status: 200, description: 'Oturumlar sonlandırıldı' })
  async terminateSessions(@Req() req: any) {
    await this.userService.terminateUserSessions(req.user.username);
    return { success: true, message: 'Tüm oturumlar başarıyla sonlandırıldı.' };
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Get('user/users')
  @ApiOperation({ summary: 'Tüm kullanıcıları listele (Admin)' })
  @ApiResponse({ status: 200, description: 'Kullanıcı listesi' })
  async getAllUsers() {
    return this.userService.getAllUsers();
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('user/users')
  @ApiOperation({ summary: 'Yeni kullanıcı tanımla (Admin)' })
  @ApiResponse({ status: 201, description: 'Kullanıcı oluşturuldu' })
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.userService.createUser(req.user.username, dto);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('user/users/:id')
  @ApiOperation({ summary: 'Kullanıcı düzenle (Admin)' })
  @ApiResponse({ status: 200, description: 'Kullanıcı güncellendi' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('user/users/:id/invite')
  @ApiOperation({ summary: 'Davet bağlantısını yeniden üret (Admin)' })
  async reinviteUser(@Param('id') id: string) {
    return this.userService.reinvite(id);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('user/users/:id/unlock')
  @ApiOperation({ summary: 'Kilitli hesabı aç (Admin)' })
  async unlockUser(@Param('id') id: string) {
    return this.userService.unlock(id);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Delete('user/users/:id')
  @ApiOperation({ summary: 'Kullanıcı sil (Admin)' })
  @ApiResponse({ status: 200, description: 'Kullanıcı silindi' })
  async deleteUser(@Param('id') id: string) {
    return { success: await this.userService.deleteUser(id) };
  }
}
