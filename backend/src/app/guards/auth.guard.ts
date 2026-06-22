import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DbService } from '../db.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private dbService: DbService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Skip if already authenticated by global guard
    if (request['user']) {
      return true;
    }

    const url = request.url || '';
    if (url.includes('/auth/login') || url === '/' || url === '/api') {
      return true;
    }

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Yetkisiz erişim: Oturum açmanız gerekiyor.');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET
      });
      
      const user = await this.dbService.getUserByUsername(payload.username);
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Geçersiz veya süresi dolmuş oturum.');
      }

      request['user'] = payload;
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
