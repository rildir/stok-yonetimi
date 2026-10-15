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
 * @kvkk_erasure = 1; a partial erasure may be followed by a full one). Masking keeps the chain verifiable because the hash covers the stored digest;
 * the content of a masked row can no longer be compared with its digest, which the verifier reports
 * as "masked" instead of "tampered". Production should additionally grant the application's DB user
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
const CONTENT = ['id', 'companyId', 'userId', 'username', 'apiKeyId', 'action', 'entityType', 'entityId', 'before', 'after', 'ip', 'userAgent', 'createdAt', 'payloadDigest', 'maskedAt'];
const SEAL = ['chainSeq', 'prevHash', 'hash'];
const MASKABLE = ['userId', 'username', 'before', 'after', 'ip', 'userAgent'];

/** Append-only triggers of audit_logs (also used by the KVKK test database). */
export const AUDIT_TRIGGERS = [
  {
    name: 'trg_audit_logs_digest',
    sql: `CREATE TRIGGER \`trg_audit_logs_digest\` BEFORE INSERT ON \`audit_logs\` FOR EACH ROW BEGIN SET NEW.\`payloadDigest\` = ${auditDigestSql('NEW')}; SET NEW.\`chainSeq\` = NULL; SET NEW.\`prevHash\` = NULL; SET NEW.\`hash\` = NULL; SET NEW.\`maskedAt\` = NULL; END`,
  },
  {
    name: 'trg_audit_logs_append_only',
    sql:
      `CREATE TRIGGER \`trg_audit_logs_append_only\` BEFORE UPDATE ON \`audit_logs\` FOR EACH ROW BEGIN ` +
      // sealing: once, content unchanged
      `IF OLD.\`hash\` IS NULL AND NEW.\`hash\` IS NOT NULL AND ${same(CONTENT)} THEN SET @kvkk_audit_ok = 1; ` +
      // KVKK masking: once, with the session flag, only the personal columns change, seal unchanged
      `ELSEIF @kvkk_erasure = 1 AND NEW.\`maskedAt\` IS NOT NULL AND ${same(CONTENT.filter((c) => !MASKABLE.includes(c) && c !== 'maskedAt'))} AND ${same(SEAL)} THEN SET @kvkk_audit_ok = 1; ` +
      `ELSE ${signal('AUDIT_LOG_IMMUTABLE')}; END IF; END`,
  },
  {
    name: 'trg_audit_logs_no_delete',
    sql: `CREATE TRIGGER \`trg_audit_logs_no_delete\` BEFORE DELETE ON \`audit_logs\` FOR EACH ROW BEGIN ${signal('AUDIT_LOG_IMMUTABLE')}; END`,
  },
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

export async function dropAuditTriggers(query: Query): Promise<void> {
  for (const t of AUDIT_TRIGGERS) await query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
}
