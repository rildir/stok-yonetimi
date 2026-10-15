import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30 s, 6 digits) for administrator 2FA
 * (KVKK md. 12/1; Kişisel Veri Güvenliği Rehberi: güçlü kimlik doğrulama). Implemented on Node's
 * crypto instead of otplib (no new dependency); compatible with Google / Microsoft Authenticator.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** New random secret (160 bits, base32). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP value (RFC 4226) of a counter. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(secretB32: string, at: number = Date.now(), step = 30, digits = 6): string {
  return hotp(base32Decode(secretB32), Math.floor(at / 1000 / step), digits);
}

/**
 * Verifies a code within ±window steps. Returns the matched time step (to refuse replays of the
 * same code) or null.
 */
export function verifyTotp(secretB32: string, code: string, at: number = Date.now(), window = 1, step = 30): number | null {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secretB32);
  const now = Math.floor(at / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(hotp(key, now + w));
    if (timingSafeEqual(expected, Buffer.from(c))) return now + w;
  }
  return null;
}

export function otpauthUrl(secretB32: string, account: string, issuer = 'Ecelon'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Ten single-use recovery codes (shown once; stored as SHA-256). */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(6)).slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''), 'utf8').digest('hex');
}
