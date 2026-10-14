import { err } from '../shared/i18n/app-error';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request['user'];
    // API keys are authorized by their scopes in AuthGuard (read vs write per resource).
    if (user?.isApiKey) {
      return true;
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
