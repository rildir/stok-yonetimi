import { err } from '../shared/i18n/app-error';
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../modules/user/user.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantContext } from '../shared/tenant/tenant-context.service';
import { ApiKeyService } from '../modules/integrations/api-key.service';
import { hasScope, resourceForPath } from '../shared/integrations/api-key';
import { ALLOW_PENDING_PASSWORD_KEY, ALLOW_TOTP_SETUP_KEY, SELF_SERVICE_KEY } from './security.decorators';
import { DataSource } from 'typeorm';
import { apiKeyPermissions, effectivePermissions } from '../shared/kvkk/permissions';
import { companyPolicy, totpSetupBlocking } from '../shared/kvkk/company-policy';
import { SecurityAlertService } from '../modules/integrations/security-alert.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Raw API key from `X-API-Key` or `Authorization: Bearer sk_...`. */
export function extractApiKey(request: any): string | undefined {
  const header = request.headers?.['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const [type, token] = request.headers?.authorization?.split(' ') ?? [];
  return type === 'Bearer' && token?.startsWith('sk_') ? token : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private userService: UserService,
    private tenant: TenantContext,
    private apiKeys: ApiKeyService,
    private dataSource: DataSource,
    private alerts: SecurityAlertService,
  ) {}

  /** WP7 (R35): a closed tenant is frozen read-only until the end of retention. */
  private async assertTenantWritable(request: any, companyId: string, context: ExecutionContext): Promise<void> {
    if (SAFE_METHODS.has(String(request.method || 'GET').toUpperCase())) return;
    const policy = await companyPolicy(this.dataSource, companyId);
    if (policy.status !== 'CLOSED') return;
    const selfService = this.reflector.getAllAndOverride<boolean>(SELF_SERVICE_KEY, [context.getHandler(), context.getClass()]) === true;
    if (!selfService) throw new ForbiddenException(err('TENANT_UNDER_RETENTION', { date: policy.retentionUntil ?? '-' }));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const rawKey = extractApiKey(request);
    if (rawKey) {
      return this.authenticateApiKey(request, rawKey, context);
    }

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException(err('AUTH_LOGIN_REQUIRED'));
    }
    let pendingPasswordChange = false;
    try {
      // Secret comes from JwtModule (resolveJwtSecret): no per-call fallback.
      const payload = await this.jwtService.verifyAsync(token);

      const user = await this.userService.getUserByUsername(payload.username);
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException(err('AUTH_SESSION_EXPIRED'));
      }

      // The DB row is authoritative for the tenant; a token minted for a
      // different company (or a tampered one) is rejected.
      if (payload.companyId && payload.companyId !== user.companyId) {
        throw new UnauthorizedException(err('AUTH_SESSION_INVALID'));
      }
      request['user'] = {
        ...payload,
        sub: user.id,
        companyId: user.companyId,
        role: user.role,
        isSuperAdmin: !!user.isSuperAdmin,
        mustChangePassword: !!user.mustChangePassword,
        permissions: effectivePermissions(user.role, user.permissions),
        totpEnabled: !!user.totpEnabledAt,
      };
      this.tenant.set(user.companyId, user.username);
      this.tenant.setActor({ userId: user.id });
      pendingPasswordChange = !!user.mustChangePassword;
    } catch {
      throw new UnauthorizedException(err('AUTH_SESSION_EXPIRED'));
    }
    const authUser = request['user'];
    await this.assertTenantWritable(request, authUser.companyId, context);
    // WP7: administrators must use 2FA once the company's grace period is over.
    if (!pendingPasswordChange) {
      const policy = await companyPolicy(this.dataSource, authUser.companyId);
      if (totpSetupBlocking(policy, { role: authUser.role, totpEnabledAt: authUser.totpEnabled ? new Date() : null })) {
        const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_TOTP_SETUP_KEY, [context.getHandler(), context.getClass()]);
        if (!allowed) throw new ForbiddenException(err('TOTP_REQUIRED'));
      }
    }
    // Admin-issued temporary password: only the password change (and profile read) is allowed.
    if (pendingPasswordChange) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [context.getHandler(), context.getClass()]);
      if (!allowed) throw new ForbiddenException(err('PASSWORD_CHANGE_REQUIRED'));
    }
    return true;
  }

  /** API key auth: tenant comes from the key; access is limited to its scopes. */
  private async authenticateApiKey(request: any, rawKey: string, context: ExecutionContext): Promise<boolean> {
    const key = await this.apiKeys.authenticate(rawKey);
    if (!key) {
      throw new UnauthorizedException(err('API_KEY_INVALID'));
    }
    const resource = resourceForPath(request.path || request.url || '');
    if (!hasScope(key.scopes, resource, request.method)) {
      throw new ForbiddenException(err('API_KEY_SCOPE_DENIED', { resource: resource ?? '-', method: request.method }));
    }
    const username = `apikey:${key.name}`;
    request['user'] = { sub: null, username, role: 'apikey', companyId: key.companyId, apiKeyId: key.id, isApiKey: true, permissions: apiKeyPermissions(key.scopes as Record<string, string>) };
    this.tenant.set(key.companyId, username);
    this.tenant.setActor({ apiKeyId: key.id });
    await this.assertTenantWritable(request, key.companyId, context);
    this.alerts.onApiKeyRead(key.companyId, key.id, resource);
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
