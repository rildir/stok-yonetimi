import { Logger } from '@nestjs/common';

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
