import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../modules/user/user.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantContext } from '../shared/tenant/tenant-context.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private userService: UserService,
    private tenant: TenantContext,
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

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Yetkisiz erişim: Oturum açmanız gerekiyor.');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET
      });
      
      const user = await this.userService.getUserByUsername(payload.username);
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Geçersiz veya süresi dolmuş oturum.');
      }

      // The DB row is authoritative for the tenant; a token minted for a
      // different company (or a tampered one) is rejected.
      if (payload.companyId && payload.companyId !== user.companyId) {
        throw new UnauthorizedException('Geçersiz oturum.');
      }
      request['user'] = { ...payload, sub: user.id, companyId: user.companyId };
      this.tenant.set(user.companyId, user.username);
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş oturum.');
    }
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
