import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { err } from '../../shared/i18n/app-error';
import { UserSessionEntity } from '../../entities/kvkk.entity';
import { UserEntity } from '../../entities/user.entity';
import { buildJwtPayload } from '../../guards/jwt-payload';
import { sessionPolicy } from '../../shared/security/security-config';
import { resolvePiiKeys } from '../../shared/kvkk/crypto';

/**
 * Refresh-token sessions (WP7, Kişisel Veri Güvenliği Rehberi): the access token lives 15-60 minutes;
 * the session continues through an opaque refresh token in an httpOnly, SameSite=Strict cookie that
 * is rotated on every use, expires after REFRESH_TOKEN_TTL_HOURS and after SESSION_IDLE_MINUTES
 * without activity (boşta kalınca oturum kapatma). Only the SHA-256 of the token is stored.
 *
 * Theft detection: a refresh token is `<sessionId>.<nonce>.<mac>` (MAC with a server-only key), so
 * every token ever issued for a session is recognisable without storing its history. Presenting any
 * issued token that is no longer the current one revokes the whole session (neither the thief nor
 * the victim can continue with it). The only exception: the immediately previous token within the
 * 30 s grace period from the same client (IP + user agent of the rotation) - two tabs refreshing at
 * the same moment. Legacy tokens (before this format) are still checked against prevTokenHash.
 * Access tokens carry the session id (`sid`): AuthGuard rejects them once the session is revoked
 * (logout, reuse, idle, password change), so logout ends the access token immediately.
 */
/** Two tabs refreshing at the same moment present the same token: not treated as theft. */
const REUSE_GRACE_MS = 30_000;
export const REFRESH_COOKIE = 'rt';
const COOKIE_PATH = '/api/auth';
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const tokenKey = () => createHmac('sha256', resolvePiiKeys().mac).update('refresh-token-v1').digest();
const tokenMac = (sid: string, nonce: string) => createHmac('sha256', tokenKey()).update(`${sid}.${nonce}`).digest('base64url');

/** New refresh token of a session: `<sessionId>.<nonce>.<mac>`. */
export function issueRefreshToken(sid: string): string {
  const nonce = randomBytes(24).toString('base64url');
  return `${sid}.${nonce}.${tokenMac(sid, nonce)}`;
}

/** Session id of a refresh token that was genuinely issued by this server (valid MAC), else null. */
export function issuedSessionId(raw: string): string | null {
  const parts = raw.split('.');
  if (parts.length !== 3 || !/^[0-9a-f-]{36}$/.test(parts[0])) return null;
  const expected = Buffer.from(tokenMac(parts[0], parts[1]));
  const given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? parts[0] : null;
}

const clientIp = (req: any) => (req?.ip || req?.socket?.remoteAddress || '').toString().slice(0, 64) || null;
const clientUa = (req: any) => (req?.headers?.['user-agent'] || '').toString().slice(0, 255) || null;

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
    const now = new Date();
    const expiresAt = new Date(now.getTime() + p.absoluteHours * 3600000);
    const id = randomUUID();
    const raw = issueRefreshToken(id);
    await this.ds.manager.insert(UserSessionEntity, {
      id,
      companyId: user.companyId,
      userId: user.id,
      tokenHash: sha256(raw),
      lastUsedAt: now,
      expiresAt,
      ip: clientIp(req),
      userAgent: clientUa(req),
    });
    this.setCookie(res, raw, expiresAt);
    return this.jwt.signAsync({ ...buildJwtPayload(user), sid: id });
  }

  /** Rotates the refresh token; returns a fresh access token. */
  async refresh(req: any, res: any): Promise<{ token: string; user: UserEntity }> {
    const raw = readCookie(req, REFRESH_COOKIE);
    if (!raw) throw new UnauthorizedException(err('REFRESH_TOKEN_INVALID'));
    const p = sessionPolicy();
    const now = new Date();
    // The transaction returns null instead of throwing, so the revocations below are committed.
    const result = await this.ds.transaction(async (m) => {
      const s = await m.findOne(UserSessionEntity, { where: { tokenHash: sha256(raw), revokedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
      if (!s) {
        // An issued token that is no longer current: possible theft - revoke the session, except the
        // previous token presented again by the same client within the grace period (parallel tabs).
        const hash = sha256(raw);
        const sid = issuedSessionId(raw);
        const reused = sid
          ? await m.findOne(UserSessionEntity, { where: { id: sid, revokedAt: IsNull() }, lock: { mode: 'pessimistic_write' } })
          : await m.findOne(UserSessionEntity, { where: { prevTokenHash: hash, revokedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
        if (reused) {
          const benign = reused.prevTokenHash === hash && now.getTime() - new Date(reused.lastUsedAt).getTime() <= REUSE_GRACE_MS && reused.ip === clientIp(req) && reused.userAgent === clientUa(req);
          if (!benign) await m.update(UserSessionEntity, { id: reused.id }, { revokedAt: now, revokeReason: 'reuse' });
        }
        return null;
      }
      const idleLimit = new Date(new Date(s.lastUsedAt).getTime() + p.idleMinutes * 60000);
      if (new Date(s.expiresAt) <= now || idleLimit <= now) {
        await m.update(UserSessionEntity, { id: s.id }, { revokedAt: now, revokeReason: new Date(s.expiresAt) <= now ? 'expired' : 'idle' });
        return null;
      }
      const user = await m.findOne(UserEntity, { where: { id: s.userId } });
      if (!user || user.companyId !== s.companyId) {
        await m.update(UserSessionEntity, { id: s.id }, { revokedAt: now, revokeReason: 'user' });
        return null;
      }
      const next = issueRefreshToken(s.id);
      // ip / user agent of the latest rotation: the grace rule compares a repeated token against them
      await m.update(UserSessionEntity, { id: s.id }, { tokenHash: sha256(next), prevTokenHash: s.tokenHash, lastUsedAt: now, ip: clientIp(req), userAgent: clientUa(req) });
      return { next, expiresAt: new Date(s.expiresAt), token: await this.jwt.signAsync({ ...buildJwtPayload(user), sid: s.id }), user };
    });
    if (!result) {
      this.clearCookie(res);
      throw new UnauthorizedException(err('REFRESH_TOKEN_INVALID'));
    }
    this.setCookie(res, result.next, result.expiresAt);
    return { token: result.token, user: result.user };
  }

  async logout(req: any, res: any): Promise<void> {
    const raw = readCookie(req, REFRESH_COOKIE);
    const now = new Date();
    if (raw) await this.ds.manager.update(UserSessionEntity, { tokenHash: sha256(raw), revokedAt: IsNull() }, { revokedAt: now, revokeReason: 'logout' });
    // Also the session of the presented access token (logout without the cookie).
    const [type, bearer] = String(req?.headers?.authorization || '').split(' ');
    if (type === 'Bearer' && bearer && !bearer.startsWith('sk_')) {
      try {
        const payload: { sid?: string } = await this.jwt.verifyAsync(bearer);
        if (payload?.sid) await this.ds.manager.update(UserSessionEntity, { id: payload.sid, revokedAt: IsNull() }, { revokedAt: now, revokeReason: 'logout' });
      } catch {
        /* expired / invalid token: nothing to revoke */
      }
    }
    this.clearCookie(res);
  }
  async revokeAll(userId: string, reason: string): Promise<void> {
    await this.ds.manager.update(UserSessionEntity, { userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: reason.slice(0, 30) });
  }
}
