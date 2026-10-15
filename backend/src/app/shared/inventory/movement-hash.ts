import { createHash } from 'crypto';

/**
 * Hash chain of stock movements (TTK 65/3-4, VUK 217): every company has its own
 * chain; movement n stores sequenceNo = n, prevHash = hash(n-1) (GENESIS for the
 * first) and hash = SHA-256(prevHash + canonical payload). Changing any hashed
 * field, removing a row or reordering rows breaks verification.
 *
 * The payload is built from values as they are stored and read back:
 * quantities at 4 decimals, DATETIME at whole seconds (UTC), DATE as YYYY-MM-DD.
 *
 * Versions (`hashVersion` column): v1 = rows written by migration 1784274129000 and
 * WP2; v2 (current) additionally covers the recording time (createdAt, ms precision,
 * proves VUK 219 lateness), the approver of a maker-checker movement and the SHA-256
 * digest of the attached evidence files.
 */
export const CURRENT_HASH_VERSION = 2;
export const GENESIS_HASH = '0'.repeat(64);

/** Fields covered by a v1 hash, in canonical order. */
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

/** Fields covered by a v2 hash: v1 + recording time, approver and evidence digest. */
export const HASHED_FIELDS_V2 = [...HASHED_FIELDS, 'hashVersion', 'createdAt', 'approvedBy', 'approvedByUserId', 'attachmentsSha256'] as const;

/** Digest of a movement's evidence files: SHA-256 over their sorted SHA-256 values. */
export function attachmentsDigest(sha256s: string[]): string | null {
  if (!sha256s.length) return null;
  return createHash('sha256').update([...sha256s].sort().join(',')).digest('hex');
}

/** Truncates to whole milliseconds (what MySQL DATETIME(6) returns to JS). */
function toMs(d: unknown): string {
  return new Date(d as Date).toISOString();
}

const QTY_FIELDS = new Set(['quantity', 'previousQuantity', 'newQuantity']);

/** Truncates to whole seconds (DATETIME(0) precision) so the stored value hashes the same. */
export function toSecond(d: Date | string | number): Date {
  const t = new Date(d).getTime();
  return new Date(Math.floor(t / 1000) * 1000);
}

function norm(field: string, v: unknown): string | number | string[] | null {
  if (v === undefined || v === null || v === '') return null;
  if (QTY_FIELDS.has(field)) return Number(v).toFixed(4);
  if (field === 'sequenceNo' || field === 'hashVersion') return Number(v);
  if (field === 'createdAt') return toMs(v);
  if (field === 'transactionDate') return toSecond(v as Date).toISOString();
  if (field === 'documentDate') return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (field === 'serials') {
    const list = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(list) && list.length ? list.map(String) : null;
  }
  return String(v);
}

function hashVersionOf(row: Record<string, unknown>): number {
  const v = Number(row['hashVersion'] ?? 1);
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

/** Deterministic JSON of the hashed fields (field list chosen by the row's hashVersion). */
export function canonicalMovement(row: Record<string, unknown>): string {
  const fields: readonly string[] = hashVersionOf(row) >= 2 ? HASHED_FIELDS_V2 : HASHED_FIELDS;
  return JSON.stringify(fields.map((f) => [f, norm(f, row[f])]));
}

export function movementHash(prevHash: string, row: Record<string, unknown>): string {
  return createHash('sha256').update(prevHash).update('|').update(canonicalMovement(row)).digest('hex');
}

export interface ChainIssue {
  sequenceNo: number | null;
  id: string;
  problem: 'SEQUENCE_GAP' | 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' | 'UNSEALED' | 'HEAD_MISMATCH' | 'ATTACHMENT_MISMATCH';
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  lastSequenceNo: number;
  lastHash: string;
  issues: ChainIssue[];
}

/**
 * Incremental verifier: feed rows of one company in sequenceNo order (in batches,
 * so large ledgers are not loaded at once), then read `result()`. Stops collecting
 * after `maxIssues` problems (the first one is the point where the chain broke).
 */
export class ChainVerifier {
  private readonly issues: ChainIssue[] = [];
  private prev = GENESIS_HASH;
  private expectedSeq = 1;
  private lastSeq = 0;
  private checked = 0;

  constructor(private readonly maxIssues = 50) {}

  push(rows: Record<string, any>[]): void {
    for (const r of rows) {
      this.checked += 1;
      if (this.issues.length >= this.maxIssues) continue;
      const seq = r['sequenceNo'] === null || r['sequenceNo'] === undefined ? null : Number(r['sequenceNo']);
      if (seq === null || !r['hash']) {
        this.issues.push({ sequenceNo: seq, id: r['id'], problem: 'UNSEALED' });
        continue;
      }
      if (seq !== this.expectedSeq) this.issues.push({ sequenceNo: seq, id: r['id'], problem: 'SEQUENCE_GAP' });
      if (r['prevHash'] !== this.prev) this.issues.push({ sequenceNo: seq, id: r['id'], problem: 'PREV_HASH_MISMATCH' });
      if (movementHash(r['prevHash'], r) !== r['hash']) this.issues.push({ sequenceNo: seq, id: r['id'], problem: 'HASH_MISMATCH' });
      this.prev = r['hash'];
      this.expectedSeq = seq + 1;
      this.lastSeq = seq;
    }
  }

  addIssue(issue: ChainIssue): void {
    if (this.issues.length < this.maxIssues) this.issues.push(issue);
  }

  result(): ChainVerification {
    return { ok: this.issues.length === 0, checked: this.checked, lastSequenceNo: this.lastSeq, lastHash: this.prev, issues: [...this.issues] };
  }
}

/** Verifies rows of one company ordered by sequenceNo (all in memory). */
export function verifyChain(rows: Record<string, any>[], maxIssues = 50): ChainVerification {
  const v = new ChainVerifier(maxIssues);
  v.push(rows);
  return v.result();
}
