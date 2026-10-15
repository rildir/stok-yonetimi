import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Encryption of integrator credentials at rest (company_ebelge_settings.credentialsEnc): AES-256-GCM
 * with a key from the environment (EBELGE_CREDENTIALS_KEY: 32 bytes as base64 or 64 hex chars;
 * EBELGE_CREDENTIALS_KEY_ID names it so keys can be rotated: EBELGE_CREDENTIALS_KEY_<ID>). The
 * application never stores a seal / signing key (signing = PROVIDER).
 *
 * Stored format: `v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>`. The company id is bound as
 * additional authenticated data, so a blob copied to another tenant does not decrypt.
 */
type Env = Record<string, string | undefined>;

export class CredentialKeyError extends Error {}

const DEV_KEY_ID = 'dev';
let warned = false;

function parseKey(raw: string): Buffer | null {
  const s = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  const b = Buffer.from(s, 'base64');
  return b.length === 32 ? b : null;
}

/** Active key id and key. Production refuses to run without a configured key. */
export function activeCredentialKey(env: Env = process.env): { keyId: string; key: Buffer } {
  const raw = env['EBELGE_CREDENTIALS_KEY'];
  if (raw) {
    const key = parseKey(raw);
    if (!key) throw new CredentialKeyError('EBELGE_CREDENTIALS_KEY must be 32 bytes (base64) or 64 hex characters.');
    return { keyId: (env['EBELGE_CREDENTIALS_KEY_ID'] || 'k1').trim(), key };
  }
  if (env['NODE_ENV'] === 'production') throw new CredentialKeyError('EBELGE_CREDENTIALS_KEY must be set in production.');
  if (!warned) new Logger('EBelgeCredentials').warn('EBELGE_CREDENTIALS_KEY is not set; using an insecure development key.');
  warned = true;
  return { keyId: DEV_KEY_ID, key: createHash('sha256').update('dev-only-insecure-ebelge-credentials-key').digest() };
}

function keyFor(keyId: string, env: Env): Buffer {
  const active = activeCredentialKey(env);
  if (active.keyId === keyId) return active.key;
  const raw = env[`EBELGE_CREDENTIALS_KEY_${keyId.toUpperCase()}`];
  const key = raw ? parseKey(raw) : null;
  if (!key) throw new CredentialKeyError(`No key configured for credentials key id "${keyId}".`);
  return key;
}

export function encryptCredentials(plain: Record<string, unknown>, companyId: string, env: Env = process.env): string {
  const { keyId, key } = activeCredentialKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(companyId, 'utf8'));
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  return ['v1', keyId, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptCredentials(blob: string | null | undefined, companyId: string, env: Env = process.env): Record<string, unknown> {
  if (!blob) return {};
  const [v, keyId, iv, tag, data] = blob.split(':');
  if (v !== 'v1' || !keyId || !iv || !tag || !data) throw new CredentialKeyError('Unknown credentials format.');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(keyId, env), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(companyId, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

export function credentialKeyId(blob: string | null | undefined): string | null {
  return blob ? blob.split(':')[1] || null : null;
}

/** Secret fields (password, secret, token, key) are shown masked; adapter options are shown as entered (arrays as JSON). */
export function isSecretCredential(key: string): boolean {
  return /pass|secret|token|key/i.test(key);
}

export function maskCredentials(plain: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(plain)) {
    if (isSecretCredential(k)) out[k] = v === null || v === undefined || v === '' ? '' : '••••••••';
    else out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}
