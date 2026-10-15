import { createHash } from 'crypto';

/**
 * Tamper-evident audit trail (R61, TTK 64/1, VUK 256): every audit_logs row gets
 *  - payloadDigest = SHA-256 over its content, computed by a BEFORE INSERT trigger in the database
 *    (so it covers rows written by any code path);
 *  - chainSeq / prevHash / hash, assigned in commit order per company by the AuditChainService
 *    sealer: hash = SHA-256(prevHash | chainSeq | payloadDigest).
 *
 * Triggers make the table append-only: the only updates allowed are sealing (hash NULL -> value)
 * and KVKK masking of personal data in the row (sets maskedAt; only with the session flag
 * @kvkk_erasure = 1; a partial erasure may be followed by a full one). Masking keeps the chain verifiable because the hash covers the stored
 * original digest. The trigger records the digest of the masked content (maskedDigest) and every
 * masking writes a chained AUDIT_MASK_ACTION event naming the row and that digest: the verifier
 * reports a masked row as "masked" only when its content matches the digest of such an event,
 * otherwise as "tampered" - a rewrite under the flag is never silent. Production should additionally grant the application's DB user
 * only INSERT and SELECT (plus the sealing columns) on audit_logs - see backend/tools/db/kvkk-grants.sql.
 */
export const GENESIS_HASH = '0'.repeat(64);

/** SQL expression of the payload digest (NEW.* in the trigger, a table alias in the verifier). */
export function auditDigestSql(a: string): string {
  const c = (col: string) => `IFNULL(${a}.\`${col}\`, '')`;
  return (
    `SHA2(CONCAT_WS('|', ${a}.\`id\`, ${c('companyId')}, ${c('userId')}, ${c('username')}, ${c('apiKeyId')}, ${a}.\`action\`, ${a}.\`entityType\`, ${c('entityId')}, ` +
    `IFNULL(CAST(${a}.\`before\` AS CHAR), ''), IFNULL(CAST(${a}.\`after\` AS CHAR), ''), ${c('ip')}, ${c('userAgent')}, DATE_FORMAT(${a}.\`createdAt\`, '%Y-%m-%d %H:%i:%s.%f')), 256)`
  );
}

export function chainHash(prevHash: string, seq: number, digest: string): string {
  return createHash('sha256').update(`${prevHash}|${seq}|${digest}`, 'utf8').digest('hex');
}

export interface ChainRow {
  id: string;
  chainSeq: number | string;
  prevHash: string;
  hash: string;
  payloadDigest: string;
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  firstSeq: number | null;
  lastSeq: number | null;
  brokenAt: { id: string; chainSeq: number; reason: 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' | 'SEQ_GAP' } | null;
}

/**
 * Verifies consecutive sealed rows (ordered by chainSeq). The first row's prevHash is accepted as
 * the anchor (GENESIS or the last hash of rows removed by a documented destruction).
 */
export function verifyChain(rows: ChainRow[], anchor?: string): ChainVerification {
  let prev = anchor ?? (rows[0]?.prevHash ?? GENESIS_HASH);
  let prevSeq: number | null = null;
  for (const r of rows) {
    const seq = Number(r.chainSeq);
    if (prevSeq !== null && seq !== prevSeq + 1) return result(rows, false, { id: r.id, chainSeq: seq, reason: 'SEQ_GAP' });
    if (r.prevHash !== prev) return result(rows, false, { id: r.id, chainSeq: seq, reason: 'PREV_HASH_MISMATCH' });
    if (chainHash(r.prevHash, seq, r.payloadDigest) !== r.hash) return result(rows, false, { id: r.id, chainSeq: seq, reason: 'HASH_MISMATCH' });
    prev = r.hash;
    prevSeq = seq;
  }
  return result(rows, true, null);
}

function result(rows: ChainRow[], ok: boolean, brokenAt: ChainVerification['brokenAt']): ChainVerification {
  return {
    ok,
    checked: rows.length,
    firstSeq: rows.length ? Number(rows[0].chainSeq) : null,
    lastSeq: rows.length ? Number(rows[rows.length - 1].chainSeq) : null,
    brokenAt,
  };
}

const signal = (code: string) => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${code}'`;
const same = (cols: string[]) => cols.map((c) => `NEW.\`${c}\` <=> OLD.\`${c}\``).join(' AND ');
const SEAL = ['chainSeq', 'prevHash', 'hash'];
const MASKABLE = ['userId', 'username', 'before', 'after', 'ip', 'userAgent'];

/**
 * Event written to audit_logs for every batch of masked rows (same transaction): its `after` holds
 * `{ rows: [[auditRowId, maskedDigest], ...] }`. The event is itself a sealed chain row, so a
 * masking is never silent and the masked content is bound to the chain through it.
 */
export const AUDIT_MASK_ACTION = 'kvkk.audit_mask';

const NO_DELETE = {
  name: 'trg_audit_logs_no_delete',
  sql: `CREATE TRIGGER \`trg_audit_logs_no_delete\` BEFORE DELETE ON \`audit_logs\` FOR EACH ROW BEGIN ${signal('AUDIT_LOG_IMMUTABLE')}; END`,
};

/**
 * Version 1 of the audit_logs triggers as installed by migration 1784274141000 (frozen so a fresh
 * database migrates step by step; replaced by AUDIT_TRIGGERS in migration 1784274142000).
 */
const CONTENT_V1 = ['id', 'companyId', 'userId', 'username', 'apiKeyId', 'action', 'entityType', 'entityId', 'before', 'after', 'ip', 'userAgent', 'createdAt', 'payloadDigest', 'maskedAt'];
const AUDIT_LOG_TRIGGERS_V1 = [
  {
    name: 'trg_audit_logs_digest',
    sql: `CREATE TRIGGER \`trg_audit_logs_digest\` BEFORE INSERT ON \`audit_logs\` FOR EACH ROW BEGIN SET NEW.\`payloadDigest\` = ${auditDigestSql('NEW')}; SET NEW.\`chainSeq\` = NULL; SET NEW.\`prevHash\` = NULL; SET NEW.\`hash\` = NULL; SET NEW.\`maskedAt\` = NULL; END`,
  },
  {
    name: 'trg_audit_logs_append_only',
    sql:
      `CREATE TRIGGER \`trg_audit_logs_append_only\` BEFORE UPDATE ON \`audit_logs\` FOR EACH ROW BEGIN ` +
      `IF OLD.\`hash\` IS NULL AND NEW.\`hash\` IS NOT NULL AND ${same(CONTENT_V1)} THEN SET @kvkk_audit_ok = 1; ` +
      `ELSEIF @kvkk_erasure = 1 AND NEW.\`maskedAt\` IS NOT NULL AND ${same(CONTENT_V1.filter((c) => !MASKABLE.includes(c) && c !== 'maskedAt'))} AND ${same(SEAL)} THEN SET @kvkk_audit_ok = 1; ` +
      `ELSE ${signal('AUDIT_LOG_IMMUTABLE')}; END IF; END`,
  },
  NO_DELETE,
];

const CONTENT = [...CONTENT_V1, 'maskedDigest'];
/** Actor columns may only be cleared by a masking, never rewritten. */
const clearedOrSame = (cols: string[]) => cols.map((c) => `(NEW.\`${c}\` <=> OLD.\`${c}\` OR NEW.\`${c}\` IS NULL)`).join(' AND ');
/** A masking replaces values only: the top-level keys of before / after stay the same. */
const sameKeys = (cols: string[]) => cols.map((c) => `JSON_KEYS(NEW.\`${c}\`) <=> JSON_KEYS(OLD.\`${c}\`)`).join(' AND ');

/**
 * Current audit_logs triggers. A KVKK masking (session flag @kvkk_erasure = 1) may only replace
 * values inside before / after (same top-level keys) and clear actor columns; the trigger itself
 * stores the digest of the masked content in `maskedDigest` (a caller cannot supply it). The
 * verifier requires that digest to match the current content and an AUDIT_MASK_ACTION chain event,
 * so a rewrite under the flag is reported as tampered unless it is recorded as a visible masking.
 */
const AUDIT_LOG_TRIGGERS = [
  {
    name: 'trg_audit_logs_digest',
    sql: `CREATE TRIGGER \`trg_audit_logs_digest\` BEFORE INSERT ON \`audit_logs\` FOR EACH ROW BEGIN SET NEW.\`payloadDigest\` = ${auditDigestSql('NEW')}; SET NEW.\`chainSeq\` = NULL; SET NEW.\`prevHash\` = NULL; SET NEW.\`hash\` = NULL; SET NEW.\`maskedAt\` = NULL; SET NEW.\`maskedDigest\` = NULL; END`,
  },
  {
    name: 'trg_audit_logs_append_only',
    sql:
      `CREATE TRIGGER \`trg_audit_logs_append_only\` BEFORE UPDATE ON \`audit_logs\` FOR EACH ROW BEGIN ` +
      // sealing: once, content unchanged
      `IF OLD.\`hash\` IS NULL AND NEW.\`hash\` IS NOT NULL AND ${same(CONTENT)} THEN SET @kvkk_audit_ok = 1; ` +
      // KVKK masking: session flag, values only, actor columns cleared or kept, seal unchanged
      `ELSEIF @kvkk_erasure = 1 AND NEW.\`maskedAt\` IS NOT NULL AND ${same(CONTENT.filter((c) => !MASKABLE.includes(c) && c !== 'maskedAt' && c !== 'maskedDigest'))} AND ${same(SEAL)} ` +
      `AND ${clearedOrSame(['userId', 'username', 'ip', 'userAgent'])} AND ${sameKeys(['before', 'after'])} THEN SET NEW.\`maskedDigest\` = ${auditDigestSql('NEW')}; ` +
      `ELSE ${signal('AUDIT_LOG_IMMUTABLE')}; END IF; END`,
  },
  NO_DELETE,
];

const OTHER_TRIGGERS = [
  {
    // destruction records: append-only, removable only after their retention (at least 3 years)
    name: 'trg_destruction_logs_no_update',
    sql: `CREATE TRIGGER \`trg_destruction_logs_no_update\` BEFORE UPDATE ON \`destruction_logs\` FOR EACH ROW BEGIN ${signal('DESTRUCTION_LOG_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_destruction_logs_retention',
    sql: `CREATE TRIGGER \`trg_destruction_logs_retention\` BEFORE DELETE ON \`destruction_logs\` FOR EACH ROW BEGIN IF OLD.\`retainUntil\` >= CURRENT_DATE() THEN ${signal('DESTRUCTION_LOG_IMMUTABLE')}; END IF; END`,
  },
  {
    name: 'trg_legal_acceptances_no_update',
    sql: `CREATE TRIGGER \`trg_legal_acceptances_no_update\` BEFORE UPDATE ON \`legal_acceptances\` FOR EACH ROW BEGIN ${signal('LEGAL_ACCEPTANCE_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_legal_acceptances_no_delete',
    sql: `CREATE TRIGGER \`trg_legal_acceptances_no_delete\` BEFORE DELETE ON \`legal_acceptances\` FOR EACH ROW BEGIN ${signal('LEGAL_ACCEPTANCE_IMMUTABLE')}; END`,
  },
  {
    // a published notice text is frozen (a new version is published instead)
    name: 'trg_privacy_notices_published_frozen',
    sql:
      `CREATE TRIGGER \`trg_privacy_notices_published_frozen\` BEFORE UPDATE ON \`privacy_notices\` FOR EACH ROW BEGIN ` +
      `IF OLD.\`status\` <> 'DRAFT' AND NOT (${same(['id', 'companyId', 'docType', 'audience', 'language', 'version', 'title', 'body', 'contentSha256', 'publishedAt', 'publishedBy'])}) THEN ${signal('NOTICE_PUBLISHED_IMMUTABLE')}; END IF; END`,
  },
];

/** Triggers installed by migration 1784274141000 (frozen). */
export const AUDIT_TRIGGERS_V1 = [...AUDIT_LOG_TRIGGERS_V1, ...OTHER_TRIGGERS];
/** Current append-only triggers (also used by the KVKK test database). */
export const AUDIT_TRIGGERS = [...AUDIT_LOG_TRIGGERS, ...OTHER_TRIGGERS];
/** The audit_logs triggers replaced by migration 1784274142000. */
export const AUDIT_LOG_TRIGGERS_CURRENT = AUDIT_LOG_TRIGGERS;
export const AUDIT_LOG_TRIGGERS_PREVIOUS = AUDIT_LOG_TRIGGERS_V1;

export const KVKK_TRIGGER_ERROR_CODES = ['AUDIT_LOG_IMMUTABLE', 'DESTRUCTION_LOG_IMMUTABLE', 'LEGAL_ACCEPTANCE_IMMUTABLE', 'NOTICE_PUBLISHED_IMMUTABLE'];

type Query = (sql: string, params?: unknown[]) => Promise<any>;

export async function ensureAuditTriggers(query: Query): Promise<string[]> {
  const rows: { TRIGGER_NAME: string }[] = await query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()');
  const existing = new Set(rows.map((r) => r.TRIGGER_NAME));
  const created: string[] = [];
  for (const t of AUDIT_TRIGGERS) {
    if (existing.has(t.name)) continue;
    await query(t.sql);
    created.push(t.name);
  }
  return created;
}

export async function dropAuditTriggers(query: Query, triggers: { name: string }[] = AUDIT_TRIGGERS): Promise<void> {
  for (const t of triggers) await query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
}

export interface AuditMaskItem {
  id: string;
  companyId: string | null;
  before: unknown;
  after: unknown;
  /** also clear userId / username / ip / userAgent */
  clearActor?: boolean;
}

/**
 * Applies KVKK masking to audit rows and records it: one AUDIT_MASK_ACTION event per company and
 * chunk of rows (`after.rows` = [[auditRowId, maskedDigest], ...]), in the caller's transaction.
 * The maskedDigest is computed by the trigger and read back here.
 */
export async function applyAuditMasks(query: Query, items: AuditMaskItem[], actor: { userId?: string | null; username?: string | null } = {}): Promise<number> {
  if (!items.length) return 0;
  await query('SET @kvkk_erasure = 1');
  try {
    for (const r of items) {
      const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
      await query(
        `UPDATE audit_logs SET \`before\` = ?, \`after\` = ?, maskedAt = UTC_TIMESTAMP()${r.clearActor ? ', userId = NULL, username = NULL, ip = NULL, userAgent = NULL' : ''} WHERE id = ?`,
        [json(r.before), json(r.after), r.id],
      );
    }
  } finally {
    await query('SET @kvkk_erasure = NULL');
  }
  const ids = items.map((r) => r.id);
  const digests: { id: string; companyId: string | null; maskedDigest: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    digests.push(...(await query(`SELECT id, companyId, maskedDigest FROM audit_logs WHERE id IN (${chunk.map(() => '?').join(', ')})`, chunk)));
  }
  const byCompany = new Map<string, [string, string][]>();
  for (const d of digests) {
    const k = d.companyId ?? '';
    if (!byCompany.has(k)) byCompany.set(k, []);
    byCompany.get(k)!.push([d.id, d.maskedDigest]);
  }
  for (const [companyId, rows] of byCompany) {
    for (let i = 0; i < rows.length; i += 200) {
      await query(
        "INSERT INTO audit_logs (id, companyId, userId, username, action, entityType, entityId, `before`, `after`) VALUES (UUID(), ?, ?, ?, ?, 'audit_logs', NULL, NULL, ?)",
        [companyId || null, actor.userId ?? null, actor.username?.slice(0, 100) ?? 'system', AUDIT_MASK_ACTION, JSON.stringify({ rows: rows.slice(i, i + 200) })],
      );
    }
  }
  return items.length;
}

/** Latest masked digest per audit row id, from the company's AUDIT_MASK_ACTION events (chain order). */
export function maskEventDigests(events: { after: unknown }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) {
    const a = (typeof e.after === 'string' ? JSON.parse(e.after) : e.after) as { rows?: [string, string][] } | null;
    for (const [id, digest] of a?.rows ?? []) map.set(id, digest);
  }
  return map;
}
