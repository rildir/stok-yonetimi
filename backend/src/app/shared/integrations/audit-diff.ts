/** Pure helpers for audit-log diffs and secret redaction. */

export const REDACTED = '[REDACTED]';

/** Field names that must never reach the audit log in clear text. */
const SENSITIVE = /(password|secret|hash|token|apikey|api_key|authorization)/i;

/** Noise fields that are never interesting in a diff. */
const IGNORED = new Set(['updatedAt', 'createdAt']);

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (value && typeof value === 'object') return JSON.parse(JSON.stringify(value));
  return value;
}

/** Loaded relations (objects / arrays of objects with an id) are dropped to keep rows small. */
function isRelation(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => v && typeof v === 'object' && 'id' in (v as object));
  return !!value && typeof value === 'object' && !(value instanceof Date) && 'id' in (value as object);
}

/** Shallow, JSON-safe, redacted copy of an entity (relations dropped). */
export function redact(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'function' || isRelation(v)) continue;
    out[k] = SENSITIVE.test(k) ? (v === null || v === undefined ? null : REDACTED) : normalize(v);
  }
  return out;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // decimals arrive as strings from MySQL and as numbers from code
  if ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string')) {
    if (String(a).trim() !== '' && String(b).trim() !== '') {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
    }
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface AuditDiff {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[];
}

/**
 * Diff two entity snapshots and return only the changed fields (redacted).
 * When one side is missing (insert / delete / query-builder update) the other side is kept whole.
 */
export function computeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditDiff {
  const b = redact(before);
  const a = redact(after);
  if (!b || !a) {
    return { before: b, after: a, changed: Object.keys(a || b || {}).filter((k) => !IGNORED.has(k)) };
  }
  const changed: string[] = [];
  const outB: Record<string, unknown> = {};
  const outA: Record<string, unknown> = {};
  for (const key of Object.keys(a)) {
    if (IGNORED.has(key) || !(key in b)) continue;
    if (!same(b[key], a[key])) {
      changed.push(key);
      outB[key] = b[key];
      outA[key] = a[key];
    }
  }
  return { before: outB, after: outA, changed };
}
