import { createCipheriv, createDecipheriv, createHash, createHmac } from 'crypto';
import { Logger } from '@nestjs/common';
import { ValueTransformer } from 'typeorm';

/**
 * Field-level encryption of personal identifiers (KVKK md. 12/1, Kişisel Veri Güvenliği Rehberi):
 *  - AES-256-GCM, `enc:v1:<base64(iv | tag | ciphertext)>`. The 96-bit IV is synthetic
 *    (HMAC-SHA256 of the value under a key derived from the encryption key, SIV-style): equal values
 *    give equal ciphertexts, so TypeORM change detection and equality lookups keep working and an IV is
 *    never reused for two different values (it only reveals equality, as the blind index does);
 *  - a keyed HMAC-SHA256 "blind index" column for equality search (identityNumberHash).
 *
 * Keys come from PII_ENCRYPTION_KEY / PII_HMAC_KEY (32 bytes, base64 or hex). Production refuses to
 * start without them (security-config.ts); development derives fixed insecure keys with a warning so
 * local data survives restarts. Values without the `enc:v1:` prefix are legacy clear text and are
 * returned unchanged (migration 1784274141000 encrypts them).
 */
export const PII_PREFIX = 'enc:v1:';
const DEV_SEED = 'dev-only-insecure-pii-key';

type Env = Record<string, string | undefined>;
let warned = false;
let cache: { enc: Buffer; mac: Buffer; envKey: string } | null = null;

function parseKey(raw: string): Buffer | null {
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  try {
    const b = Buffer.from(v, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* not base64 */
  }
  return null;
}

export class PiiKeyError extends Error {}

/** Resolves (and validates) the encryption and blind-index keys. */
export function resolvePiiKeys(env: Env = process.env): { enc: Buffer; mac: Buffer } {
  const envKey = `${env['PII_ENCRYPTION_KEY'] ?? ''}|${env['PII_HMAC_KEY'] ?? ''}|${env['NODE_ENV'] ?? ''}`;
  if (cache && cache.envKey === envKey) return cache;
  const enc = env['PII_ENCRYPTION_KEY'] ? parseKey(env['PII_ENCRYPTION_KEY']) : null;
  const mac = env['PII_HMAC_KEY'] ? parseKey(env['PII_HMAC_KEY']) : null;
  if (enc && mac) {
    cache = { enc, mac, envKey };
    return cache;
  }
  if (env['NODE_ENV'] === 'production') {
    throw new PiiKeyError('PII_ENCRYPTION_KEY and PII_HMAC_KEY must be set to 32-byte keys (base64 or 64 hex characters) in production.');
  }
  if (!warned && !env['JEST_WORKER_ID']) {
    warned = true;
    new Logger('Security').warn('PII_ENCRYPTION_KEY / PII_HMAC_KEY missing or invalid; using insecure development keys. Never deploy like this.');
  }
  cache = {
    enc: enc ?? createHash('sha256').update(`${DEV_SEED}:enc`).digest(),
    mac: mac ?? createHash('sha256').update(`${DEV_SEED}:mac`).digest(),
    envKey,
  };
  return cache;
}

const ivKeys = new WeakMap<Buffer, Buffer>();
function ivKey(enc: Buffer): Buffer {
  let k = ivKeys.get(enc);
  if (!k) {
    k = createHmac('sha256', enc).update('kvkk-pii-siv-v1').digest();
    ivKeys.set(enc, k);
  }
  return k;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PII_PREFIX);
}

export function encryptPii(plain: string | null | undefined, env?: Env): string | null {
  if (plain === null || plain === undefined || plain === '') return plain === '' ? null : (plain ?? null);
  if (isEncrypted(plain)) return plain;
  const { enc } = resolvePiiKeys(env);
  const iv = createHmac('sha256', ivKey(enc)).update(String(plain), 'utf8').digest().subarray(0, 12);
  const cipher = createCipheriv('aes-256-gcm', enc, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PII_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptPii(value: string | null | undefined, env?: Env): string | null {
  if (value === null || value === undefined) return null;
  if (!isEncrypted(value)) return value;
  const { enc } = resolvePiiKeys(env);
  const raw = Buffer.from(value.slice(PII_PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', enc, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** Normalized form used by the blind index (identifiers are compared without spaces, upper case). */
export function normalizeIdentifier(value: string): string {
  return String(value).replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
}

/** Keyed HMAC-SHA256 blind index of an identifier (null for empty values). */
export function piiHash(value: string | null | undefined, env?: Env): string | null {
  if (value === null || value === undefined || value === '' || isEncrypted(value)) return null;
  const { mac } = resolvePiiKeys(env);
  return createHmac('sha256', mac).update(normalizeIdentifier(value), 'utf8').digest('hex');
}

/** TypeORM column transformer: encrypt on write, decrypt on read (deterministic, see above). */
export const encryptedColumnTransformer: ValueTransformer = {
  to: (value: unknown) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value; // FindOperator etc. pass through
    return encryptPii(value);
  },
  from: (value: unknown) => (typeof value === 'string' ? decryptPii(value) : value),
};
