import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** True for loopback, private, link-local, CGNAT, multicast, unspecified and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    if (s.startsWith('::ffff:')) return isPrivateAddress(s.slice(7));
    return /^(fc|fd|fe[89ab])/.test(s);
  }
  return true;
}

export type UrlCheck = { ok: true } | { ok: false; code: 'WEBHOOK_URL_INVALID' | 'WEBHOOK_URL_BLOCKED' };

/** Dev flag: WEBHOOK_ALLOW_PRIVATE=true allows localhost / private targets (local test receivers). */
export function allowPrivateTargets(): boolean {
  return process.env.WEBHOOK_ALLOW_PRIVATE === 'true';
}

/**
 * SSRF guard: http(s) only, no embedded credentials, and every resolved address must be
 * public unless `allowPrivate`. Checked on create/update AND before every delivery.
 */
export async function checkWebhookUrl(raw: string, allowPrivate = allowPrivateTargets()): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: 'WEBHOOK_URL_INVALID' };
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
    return { ok: false, code: 'WEBHOOK_URL_INVALID' };
  }
  if (allowPrivate) return { ok: true };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(localhost|internal|local)$/.test(host)) {
    return { ok: false, code: 'WEBHOOK_URL_BLOCKED' };
  }
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((r) => r.address);
    } catch {
      return { ok: false, code: 'WEBHOOK_URL_INVALID' };
    }
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) return { ok: false, code: 'WEBHOOK_URL_BLOCKED' };
  return { ok: true };
}
