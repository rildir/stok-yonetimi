import { createHash } from 'crypto';

/**
 * Hash chain of stock movements (TTK 65/3-4, VUK 217): every company has its own
 * chain; movement n stores sequenceNo = n, prevHash = hash(n-1) (GENESIS for the
 * first) and hash = SHA-256(prevHash + canonical payload). Changing any hashed
 * field, removing a row or reordering rows breaks verification.
 *
 * The payload is built from values as they are stored and read back:
 * quantities at 4 decimals, DATETIME at whole seconds (UTC), DATE as YYYY-MM-DD.
 */
export const GENESIS_HASH = '0'.repeat(64);

/** Fields covered by the hash, in canonical order. */
export const HASHED_FIELDS = [
  'id',
  'companyId',
  'sequenceNo',
  'productId',
  'productSku',
  'productName',
  'warehouseId',
  'warehouseName',
  'unitCode',
  'type',
  'reasonCode',
  'quantity',
  'previousQuantity',
  'newQuantity',
  'lotId',
  'lotNumber',
  'serials',
  'transactionDate',
  'documentType',
  'documentNo',
  'documentDate',
  'counterpartyTaxId',
  'referenceType',
  'referenceId',
  'reversesMovementId',
  'note',
  'performedBy',
  'performedByUserId',
  'performedViaApiKeyId',
] as const;

const QTY_FIELDS = new Set(['quantity', 'previousQuantity', 'newQuantity']);

/** Truncates to whole seconds (DATETIME(0) precision) so the stored value hashes the same. */
export function toSecond(d: Date | string | number): Date {
  const t = new Date(d).getTime();
  return new Date(Math.floor(t / 1000) * 1000);
}

function norm(field: string, v: unknown): string | number | string[] | null {
  if (v === undefined || v === null || v === '') return null;
  if (QTY_FIELDS.has(field)) return Number(v).toFixed(4);
  if (field === 'sequenceNo') return Number(v);
  if (field === 'transactionDate') return toSecond(v as Date).toISOString();
  if (field === 'documentDate') return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (field === 'serials') {
    const list = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(list) && list.length ? list.map(String) : null;
  }
  return String(v);
}

/** Deterministic JSON of the hashed fields. */
export function canonicalMovement(row: Record<string, unknown>): string {
  return JSON.stringify(HASHED_FIELDS.map((f) => [f, norm(f, row[f])]));
}

export function movementHash(prevHash: string, row: Record<string, unknown>): string {
  return createHash('sha256').update(prevHash).update('|').update(canonicalMovement(row)).digest('hex');
}

export interface ChainIssue {
  sequenceNo: number | null;
  id: string;
  problem: 'SEQUENCE_GAP' | 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' | 'UNSEALED' | 'HEAD_MISMATCH';
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  lastSequenceNo: number;
  lastHash: string;
  issues: ChainIssue[];
}

/**
 * Verifies rows of one company ordered by sequenceNo. Stops collecting after
 * `maxIssues` problems (the first one is the point where the chain broke).
 */
export function verifyChain(rows: Record<string, any>[], maxIssues = 50): ChainVerification {
  const issues: ChainIssue[] = [];
  let prev = GENESIS_HASH;
  let expectedSeq = 1;
  let lastSeq = 0;
  for (const r of rows) {
    if (issues.length >= maxIssues) break;
    const seq = r['sequenceNo'] === null || r['sequenceNo'] === undefined ? null : Number(r['sequenceNo']);
    if (seq === null || !r['hash']) {
      issues.push({ sequenceNo: seq, id: r['id'], problem: 'UNSEALED' });
      continue;
    }
    if (seq !== expectedSeq) issues.push({ sequenceNo: seq, id: r['id'], problem: 'SEQUENCE_GAP' });
    if (r['prevHash'] !== prev) issues.push({ sequenceNo: seq, id: r['id'], problem: 'PREV_HASH_MISMATCH' });
    if (movementHash(r['prevHash'], r) !== r['hash']) issues.push({ sequenceNo: seq, id: r['id'], problem: 'HASH_MISMATCH' });
    prev = r['hash'];
    expectedSeq = seq + 1;
    lastSeq = seq;
  }
  return { ok: issues.length === 0, checked: rows.length, lastSequenceNo: lastSeq, lastHash: prev, issues };
}
