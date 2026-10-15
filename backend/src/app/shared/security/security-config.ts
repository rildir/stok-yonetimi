import { Logger } from '@nestjs/common';
import { resolvePiiKeys } from '../kvkk/crypto';

/** Secrets that shipped in earlier versions of the code base and must never be used in production. */
const KNOWN_DEFAULT_SECRETS = new Set(['secret_smart_inventory_2026', 'secret', 'changeme', 'dev-only-insecure-jwt-secret']);
const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret';
export const JWT_SECRET_MIN_LENGTH = 16;

type Env = Record<string, string | undefined>;

export class SecurityConfigError extends Error {}

const isProduction = (env: Env) => env['NODE_ENV'] === 'production';

/**
 * JWT signing secret. Production refuses to start without a non-default secret
 * of at least 16 characters; development falls back to an insecure constant
 * with a warning (so local tokens survive restarts).
 */
export function resolveJwtSecret(env: Env = process.env): string {
  const secret = (env['JWT_SECRET'] || '').trim();
  const usable = secret.length >= JWT_SECRET_MIN_LENGTH && !KNOWN_DEFAULT_SECRETS.has(secret);
  if (usable) return secret;
  if (isProduction(env)) {
    throw new SecurityConfigError(
      `JWT_SECRET must be set to a non-default value of at least ${JWT_SECRET_MIN_LENGTH} characters in production.`,
    );
  }
  new Logger('Security').warn('JWT_SECRET is missing or weak; using an insecure development secret. Never deploy like this.');
  return secret || DEV_FALLBACK_SECRET;
}

/** Called before Nest bootstraps: fails fast on insecure production configuration. */
export function assertSecurityConfig(env: Env = process.env): void {
  resolveJwtSecret(env);
  // WP7: every secret is mandatory in production (PII keys, database password).
  resolvePiiKeys(env);
  if (isProduction(env) && !(env['DB_PASSWORD'] || '').trim()) {
    throw new SecurityConfigError('DB_PASSWORD must be set in production.');
  }
}

/**
 * Access-token lifetime (KVKK Kişisel Veri Güvenliği Rehberi: short sessions): ACCESS_TOKEN_TTL_MINUTES,
 * clamped to 15-60 minutes, default 30. Sessions continue through the httpOnly refresh cookie.
 */
export function accessTokenTtlSeconds(env: Env = process.env): number {
  const v = Number(env['ACCESS_TOKEN_TTL_MINUTES']);
  const minutes = Number.isFinite(v) && v > 0 ? Math.min(60, Math.max(15, v)) : 30;
  return minutes * 60;
}

/** Refresh session policy: absolute lifetime and idle timeout (boşta kalınca oturum kapatma). */
export function sessionPolicy(env: Env = process.env): { absoluteHours: number; idleMinutes: number; cookieSecure: boolean } {
  const n = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
  return {
    absoluteHours: n(env['REFRESH_TOKEN_TTL_HOURS'], 12),
    idleMinutes: n(env['SESSION_IDLE_MINUTES'], 30),
    cookieSecure: isProduction(env) || env['COOKIE_SECURE'] === 'true',
  };
}

/**
 * TLS to MySQL (KVKK md. 12/1: encryption in transit). DB_SSL=true enables it (DB_SSL_CA: CA file,
 * DB_SSL_REJECT_UNAUTHORIZED=false for self-signed server certificates). Production enables it unless
 * DB_SSL=false is set explicitly (e.g. a database on the same host / private network), with a warning.
 */
export function dbSslOptions(env: Env = process.env): false | { ca?: string; rejectUnauthorized: boolean } {
  const flag = (env['DB_SSL'] || '').toLowerCase();
  const enabled = flag === 'true' || (isProduction(env) && flag !== 'false');
  if (!enabled) {
    if (isProduction(env)) new Logger('Security').warn('DB_SSL=false: the database connection is not encrypted.');
    return false;
  }
  let ca: string | undefined;
  if (env['DB_SSL_CA']) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ca = require('fs').readFileSync(env['DB_SSL_CA'], 'utf8');
    } catch {
      throw new SecurityConfigError(`DB_SSL_CA file cannot be read: ${env['DB_SSL_CA']}`);
    }
  }
  return { ...(ca ? { ca } : {}), rejectUnauthorized: env['DB_SSL_REJECT_UNAUTHORIZED'] === 'false' ? false : !!ca };
}

/** Account lockout policy (KVKK Kişisel Veri Güvenliği Rehberi good practice). Overridable via env. */
export function lockoutPolicy(env: Env = process.env): { maxAttempts: number; lockMinutes: number } {
  const n = (v: string | undefined, d: number) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { maxAttempts: n(env['AUTH_MAX_FAILED_LOGINS'], 5), lockMinutes: n(env['AUTH_LOCK_MINUTES'], 15) };
}

/** Pure lockout state transition for a failed sign-in. */
export function registerFailedLogin(
  state: { failedLoginCount: number; lockedUntil?: Date | null },
  now: Date,
  policy = lockoutPolicy(),
): { failedLoginCount: number; lockedUntil: Date | null; locked: boolean } {
  const count = (state.failedLoginCount || 0) + 1;
  if (count >= policy.maxAttempts) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + policy.lockMinutes * 60000), locked: true };
  }
  return { failedLoginCount: count, lockedUntil: null, locked: false };
}

export function isLocked(state: { lockedUntil?: Date | string | null }, now: Date): boolean {
  return !!state.lockedUntil && new Date(state.lockedUntil).getTime() > now.getTime();
}

export function minutesLeft(lockedUntil: Date | string, now: Date): number {
  // DATETIME rounding can add up to a second; do not report 16 minutes for a 15-minute lock.
  return Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - now.getTime() - 1000) / 60000));
}
