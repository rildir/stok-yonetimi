import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const WEBHOOK_EVENTS = [
  'product.created',
  'product.updated',
  'product.deleted',
  'stock.changed',
  'order.created',
  'order.updated',
  'order.cancelled',
  'purchase_order.received',
  'transfer.completed',
  'despatch.approved',
  'invoice.issued',
  'invoice.cancelled',
  'return.completed',
  'goods_receipt.completed',
  'invoice.status_changed',
  'despatch.status_changed',
  'edocument.received',
  'lot.recalled',
  'period.closed',
] as const;

export const SIGNATURE_HEADER = 'X-Webhook-Signature';
export const MAX_ATTEMPTS = 6;

export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(24).toString('base64url');
}

/** HMAC-SHA256 over "<timestamp>.<body>", hex encoded. */
export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

/** Header value "t=<unix seconds>,v1=<hex hmac>". */
export function signatureHeader(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, body)}`;
}

/** Receiver-side verification (documented for integrators, used by tests). */
export function verifySignature(secret: string, body: string, header: string, toleranceSec = 300, now = Date.now()): boolean {
  const parts: Record<string, string> = {};
  for (const p of header.split(',')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const t = Number(parts['t']);
  if (!t || !parts['v1']) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(computeSignature(secret, t, body), 'hex');
  const given = Buffer.from(parts['v1'], 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Exponential backoff after the n-th failed attempt (1-based): base, 2x, 4x ... capped at 1h. */
export function retryDelayMs(attempt: number, baseMs = Number(process.env.WEBHOOK_RETRY_BASE_MS) || 30_000): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempt - 1), 3_600_000);
}
