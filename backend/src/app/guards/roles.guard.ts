import { err } from '../shared/i18n/app-error';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY, SELF_SERVICE_KEY, SUPER_ADMIN_KEY } from './security.decorators';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, targets);
    if (superAdminOnly === true) {
      const u = context.switchToHttp().getRequest()['user'];
      if (!u || u.isApiKey || !u.isSuperAdmin) throw new ForbiddenException(err('SUPER_ADMIN_REQUIRED'));
    }
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', targets);
    const permission = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION_KEY, targets);
    const request = context.switchToHttp?.()?.getRequest?.();
    const user = request?.['user'];

    // WP7 (R65): the auditor (denetçi) role reads everything staff can read and writes nothing
    // except its own account (profile, password, 2FA, notice acceptance).
    if (user?.role === 'auditor' && !user.isApiKey) {
      const selfService = this.reflector.getAllAndOverride<boolean>(SELF_SERVICE_KEY, targets) === true;
      if (!SAFE_METHODS.has(String(request?.method || 'GET').toUpperCase()) && !selfService) {
        throw new ForbiddenException(err('AUDITOR_READ_ONLY'));
      }
    }

    // WP7: fine-grained permissions (customers.pii.*, kvkk.manage) for users and API keys.
    if (typeof permission === 'string' && user && !(user.permissions || []).includes(permission)) {
      throw new ForbiddenException(err(permission.startsWith('customers.pii') ? 'PII_READ_FORBIDDEN' : 'AUTH_FORBIDDEN'));
    }

    if (!requiredRoles) {
      return true;
    }
    // API keys are authorized by their scopes in AuthGuard (read vs write per resource).
    if (user?.isApiKey) {
      return true;
    }
    if (user?.role === 'auditor' && (requiredRoles.includes('admin') || requiredRoles.includes('manager'))) {
      return true; // read-only access (writes were refused above)
    }
    if (!user || !requiredRoles.includes(user.role)) {
      if (user?.role === 'viewer') {
        throw new ForbiddenException(err('AUTH_DEMO_READONLY'));
      }
      throw new ForbiddenException(err('AUTH_FORBIDDEN'));
    }
    return true;
  }
}
