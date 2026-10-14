import { err } from '../shared/i18n/app-error';
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../modules/user/user.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantContext } from '../shared/tenant/tenant-context.service';
import { ApiKeyService } from '../modules/integrations/api-key.service';
import { hasScope, resourceForPath } from '../shared/integrations/api-key';

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
  ) {}

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
      return this.authenticateApiKey(request, rawKey);
    }

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException(err('AUTH_LOGIN_REQUIRED'));
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET
      });
      
      const user = await this.userService.getUserByUsername(payload.username);
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException(err('AUTH_SESSION_EXPIRED'));
      }

      // The DB row is authoritative for the tenant; a token minted for a
      // different company (or a tampered one) is rejected.
      if (payload.companyId && payload.companyId !== user.companyId) {
        throw new UnauthorizedException(err('AUTH_SESSION_INVALID'));
      }
      request['user'] = { ...payload, sub: user.id, companyId: user.companyId };
      this.tenant.set(user.companyId, user.username);
      this.tenant.setActor({ userId: user.id });
    } catch {
      throw new UnauthorizedException(err('AUTH_SESSION_EXPIRED'));
    }
    return true;
  }

  /** API key auth: tenant comes from the key; access is limited to its scopes. */
  private async authenticateApiKey(request: any, rawKey: string): Promise<boolean> {
    const key = await this.apiKeys.authenticate(rawKey);
    if (!key) {
      throw new UnauthorizedException(err('API_KEY_INVALID'));
    }
    const resource = resourceForPath(request.path || request.url || '');
    if (!hasScope(key.scopes, resource, request.method)) {
      throw new ForbiddenException(err('API_KEY_SCOPE_DENIED', { resource: resource ?? '-', method: request.method }));
    }
    const username = `apikey:${key.name}`;
    request['user'] = { sub: null, username, role: 'apikey', companyId: key.companyId, apiKeyId: key.id, isApiKey: true };
    this.tenant.set(key.companyId, username);
    this.tenant.setActor({ apiKeyId: key.id });
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
