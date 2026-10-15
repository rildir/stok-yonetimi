import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { err } from '../../shared/i18n/app-error';
import { UserSessionEntity } from '../../entities/kvkk.entity';
import { UserEntity } from '../../entities/user.entity';
import { buildJwtPayload } from '../../guards/jwt-payload';
import { sessionPolicy } from '../../shared/security/security-config';

/**
 * Refresh-token sessions (WP7, Kişisel Veri Güvenliği Rehberi): the access token lives 15-60 minutes;
 * the session continues through an opaque refresh token in an httpOnly, SameSite=Strict cookie that
 * is rotated on every use, expires after REFRESH_TOKEN_TTL_HOURS and after SESSION_IDLE_MINUTES
 * without activity (boşta kalınca oturum kapatma). Only the SHA-256 of the token is stored.
 */
export const REFRESH_COOKIE = 'rt';
const COOKIE_PATH = '/api/auth';
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

export function readCookie(req: any, name: string): string | null {
  const header: string = req?.headers?.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

@Injectable()
export class SessionService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly jwt: JwtService) {}

  private setCookie(res: any, token: string, expires: Date) {
    const p = sessionPolicy();
    res?.cookie?.(REFRESH_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: p.cookieSecure, path: COOKIE_PATH, expires });
  }

  clearCookie(res: any) {
    const p = sessionPolicy();
    res?.clearCookie?.(REFRESH_COOKIE, { httpOnly: true, sameSite: 'strict', secure: p.cookieSecure, path: COOKIE_PATH });
  }

  /** Completes a sign-in: access token + a new refresh session (cookie). */
  async start(user: UserEntity, req: any, res: any): Promise<string> {
    const p = sessionPolicy();
    const raw = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + p.absoluteHours * 3600000);
    await this.ds.manager.insert(UserSessionEntity, {
      companyId: user.companyId,
      userId: user.id,
      tokenHash: sha256(raw),
      lastUsedAt: now,
      expiresAt,
      ip: (req?.ip || req?.socket?.remoteAddress || '').toString().slice(0, 64) || null,
      userAgent: (req?.headers?.['user-agent'] || '').toString().slice(0, 255) || null,
    });
    this.setCookie(res, raw, expiresAt);
    return this.jwt.signAsync(buildJwtPayload(user));
  }

  /** Rotates the refresh token; returns a fresh access token. */
  async refresh(req: any, res: any): Promise<{ token: string; user: UserEntity }> {
    const raw = readCookie(req, REFRESH_COOKIE);
    if (!raw) throw new UnauthorizedException(err('REFRESH_TOKEN_INVALID'));
    const p = sessionPolicy();
    const now = new Date();
    return this.ds.transaction(async (m) => {
      const s = await m.findOne(UserSessionEntity, { where: { tokenHash: sha256(raw), revokedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
      const idleLimit = s ? new Date(new Date(s.lastUsedAt).getTime() + p.idleMinutes * 60000) : null;
      if (!s || new Date(s.expiresAt) <= now || (idleLimit && idleLimit <= now)) {
        if (s) await m.update(UserSessionEntity, { id: s.id }, { revokedAt: now, revokeReason: new Date(s.expiresAt) <= now ? 'expired' : 'idle' });
        this.clearCookie(res);
        throw new UnauthorizedException(err('REFRESH_TOKEN_INVALID'));
      }
      const user = await m.findOne(UserEntity, { where: { id: s.userId } });
      if (!user || user.companyId !== s.companyId) {
        await m.update(UserSessionEntity, { id: s.id }, { revokedAt: now, revokeReason: 'user' });
        throw new UnauthorizedException(err('REFRESH_TOKEN_INVALID'));
      }
      const next = randomBytes(32).toString('base64url');
      await m.update(UserSessionEntity, { id: s.id }, { tokenHash: sha256(next), lastUsedAt: now });
      this.setCookie(res, next, new Date(s.expiresAt));
      return { token: await this.jwt.signAsync(buildJwtPayload(user)), user };
    });
  }

  async logout(req: any, res: any): Promise<void> {
    const raw = readCookie(req, REFRESH_COOKIE);
    if (raw) await this.ds.manager.update(UserSessionEntity, { tokenHash: sha256(raw), revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: 'logout' });
    this.clearCookie(res);
  }

  async revokeAll(userId: string, reason: string): Promise<void> {
    await this.ds.manager.update(UserSessionEntity, { userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: reason.slice(0, 30) });
  }
}
