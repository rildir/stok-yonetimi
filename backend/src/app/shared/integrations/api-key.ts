import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export type ApiAccess = 'read' | 'write';
export type ApiScopes = Record<string, ApiAccess>;

/** Resources a key can be scoped to. */
export const API_KEY_RESOURCES = [
  'products',
  'customers',
  'orders',
  'purchase_orders',
  'stock',
  'warehouses',
  'suppliers',
  'categories',
  'reports',
  'export',
] as const;

/** First URL segment after /api -> scope resource. Anything not listed is unreachable with an API key. */
const SEGMENT_TO_RESOURCE: Record<string, string> = {
  products: 'products',
  customers: 'customers',
  orders: 'orders',
  'purchase-orders': 'purchase_orders',
  'stock-movements': 'stock',
  'stock-counts': 'stock',
  warehouses: 'warehouses',
  suppliers: 'suppliers',
  categories: 'categories',
  reports: 'reports',
  export: 'export',
};

export const API_KEY_PREFIX = 'sk_live_';

export interface GeneratedKey {
  /** Full key, shown once: <prefix>.<secret> */
  key: string;
  prefix: string;
  secretHash: string;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateApiKey(): GeneratedKey {
  const prefix = API_KEY_PREFIX + randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  return { key: `${prefix}.${secret}`, prefix, secretHash: hashSecret(secret) };
}

/** Split "sk_live_xxxx.secret" into its parts; null when malformed. */
export function parseApiKey(raw: string | undefined | null): { prefix: string; secret: string } | null {
  if (!raw) return null;
  const value = raw.trim();
  const dot = value.indexOf('.');
  if (!value.startsWith('sk_') || dot <= 0 || dot === value.length - 1) return null;
  return { prefix: value.slice(0, dot), secret: value.slice(dot + 1) };
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(expectedHash || '', 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Map a request path (with or without /api and /v1 prefixes) to a scope resource. */
export function resourceForPath(path: string): string | null {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  if (segments[0] === 'api') segments.shift();
  if (segments[0] === 'v1') segments.shift();
  return SEGMENT_TO_RESOURCE[segments[0]] ?? null;
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when `scopes` grant `method` on `resource` (write implies read). */
export function hasScope(scopes: ApiScopes | null | undefined, resource: string | null, method: string): boolean {
  if (!resource || !scopes) return false;
  const access = scopes[resource];
  if (!access) return false;
  if (READ_METHODS.has(method.toUpperCase())) return access === 'read' || access === 'write';
  return access === 'write';
}

/** Drop unknown resources / invalid levels from user input. */
export function sanitizeScopes(input: unknown): ApiScopes {
  const out: ApiScopes = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if ((API_KEY_RESOURCES as readonly string[]).includes(k) && (v === 'read' || v === 'write')) out[k] = v;
  }
  return out;
}
