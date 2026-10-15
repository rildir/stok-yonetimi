import { createHash, createHmac } from 'crypto';
import { resolvePiiKeys } from './crypto';

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
 * original digest. The trigger only accepts a masking that replaces leaf values by masking markers
 * ([REDACTED], [ANONIMLESTIRILDI], the anonymous names, NULL for text / objects, TCKNs masked inside
 * a text) with the structure unchanged, and records the digest of the masked content (maskedDigest).
 * Every masking writes a chained AUDIT_MASK_ACTION event naming the row, that digest and a MAC keyed
 * with a server-only key (derived from PII_HMAC_KEY, never stored in the database): the verifier
 * reports a masked row as "masked" only when its content matches the digest of such an event and
 * the MAC is valid, otherwise as "tampered" - a session holding only database credentials can
 * neither rewrite business values under the flag nor forge a masking event. Production should additionally grant the application's DB user
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
 * Version 2 (migration 1784274142000, frozen). A KVKK masking (session flag @kvkk_erasure = 1) may only replace
 * values inside before / after (same top-level keys) and clear actor columns; the trigger itself
 * stores the digest of the masked content in `maskedDigest` (a caller cannot supply it). The
 * verifier requires that digest to match the current content and an AUDIT_MASK_ACTION chain event,
 * so a rewrite under the flag is reported as tampered unless it is recorded as a visible masking.
 */
const AUDIT_LOG_TRIGGERS_V2_LIST = [
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

/** Pattern of a TCKN inside a text and its masked form (maskPersonalIdsInText): both sides are normalised. */
const TEXT_ID = `'[1-9][0-9]{6}([0-9]{4})', '*******$1'`;

/**
 * Masking walk of the BEFORE UPDATE trigger (version 3): every leaf of OLD.before / OLD.after is
 * compared with NEW; objects keep their keys and arrays their length, and a changed leaf must be a
 * masking marker - [REDACTED], [ANONIMLESTIRILDI], "Anonim <Müşteri|Tedarikçi> #XXXXXXXX",
 * "anonim-<hex>", JSON null in place of a text / object / array, or the same text with TCKNs
 * masked. A changed number, boolean or free text (a rewrite of business values) is refused with
 * AUDIT_MASK_NOT_MARKER.
 */
const MASK_WALK =
  `SET stk = JSON_ARRAY(JSON_ARRAY(0, '$'), JSON_ARRAY(1, '$')); ` +
  `WHILE ok = 1 AND JSON_LENGTH(stk) > 0 DO ` +
  `SET item = JSON_EXTRACT(stk, '$[last]'); SET stk = JSON_REMOVE(stk, '$[last]'); ` +
  `SET c = JSON_EXTRACT(item, '$[0]'); SET p = JSON_UNQUOTE(JSON_EXTRACT(item, '$[1]')); ` +
  `IF c = 0 THEN SET o = JSON_EXTRACT(OLD.\`before\`, p); SET n = JSON_EXTRACT(NEW.\`before\`, p); ` +
  `ELSE SET o = JSON_EXTRACT(OLD.\`after\`, p); SET n = JSON_EXTRACT(NEW.\`after\`, p); END IF; ` +
  `IF o IS NULL OR n IS NULL THEN IF NOT (o IS NULL AND n IS NULL) THEN SET ok = 0; END IF; ` +
  `ELSEIF o = n THEN SET ok = 1; ` +
  `ELSEIF JSON_TYPE(o) = 'OBJECT' AND JSON_TYPE(n) = 'OBJECT' THEN ` +
  `IF NOT (JSON_KEYS(o) = JSON_KEYS(n)) THEN SET ok = 0; ELSE SET ks = JSON_KEYS(o); SET i = 0; SET len = JSON_LENGTH(ks); ` +
  `WHILE i < len DO SET stk = JSON_ARRAY_APPEND(stk, '$', JSON_ARRAY(c, CONCAT(p, '.', JSON_QUOTE(JSON_UNQUOTE(JSON_EXTRACT(ks, CONCAT('$[', i, ']'))))))); SET i = i + 1; END WHILE; END IF; ` +
  `ELSEIF JSON_TYPE(o) = 'ARRAY' AND JSON_TYPE(n) = 'ARRAY' THEN ` +
  `IF JSON_LENGTH(o) <> JSON_LENGTH(n) THEN SET ok = 0; ELSE SET i = 0; SET len = JSON_LENGTH(o); ` +
  `WHILE i < len DO SET stk = JSON_ARRAY_APPEND(stk, '$', JSON_ARRAY(c, CONCAT(p, '[', i, ']'))); SET i = i + 1; END WHILE; END IF; ` +
  `ELSEIF JSON_TYPE(n) = 'NULL' THEN IF JSON_TYPE(o) NOT IN ('OBJECT', 'ARRAY', 'STRING') THEN SET ok = 0; END IF; ` +
  `ELSEIF JSON_TYPE(n) = 'STRING' THEN SET ns = JSON_UNQUOTE(n); ` +
  `IF NOT (ns IN ('[REDACTED]', '[ANONIMLESTIRILDI]') OR ns REGEXP '^Anonim [^ ]+ #[0-9A-F]{8}$' OR ns REGEXP '^anonim-[0-9a-f]{10}$' ` +
  `OR (JSON_TYPE(o) = 'STRING' AND REGEXP_REPLACE(JSON_UNQUOTE(o), ${TEXT_ID}) = REGEXP_REPLACE(ns, ${TEXT_ID}))) THEN SET ok = 0; END IF; ` +
  `ELSE SET ok = 0; END IF; ` +
  `END WHILE; ` +
  `IF ok = 0 THEN ${signal('AUDIT_MASK_NOT_MARKER')}; END IF; `;

/**
 * Current audit_logs triggers (version 3, migration 1784274143000): version 2 plus the masking walk
 * (values may only become masking markers; replaces the top-level "same keys" rule).
 */
const AUDIT_LOG_TRIGGERS = [
  AUDIT_LOG_TRIGGERS_V2_LIST[0],
  {
    name: 'trg_audit_logs_append_only',
    sql:
      `CREATE TRIGGER \`trg_audit_logs_append_only\` BEFORE UPDATE ON \`audit_logs\` FOR EACH ROW BEGIN ` +
      `DECLARE stk JSON; DECLARE item JSON; DECLARE o JSON; DECLARE n JSON; DECLARE ks JSON; DECLARE p TEXT; DECLARE ns LONGTEXT; ` +
      `DECLARE c INT; DECLARE i INT; DECLARE len INT; DECLARE ok INT DEFAULT 1; ` +
      `IF OLD.\`hash\` IS NULL AND NEW.\`hash\` IS NOT NULL AND ${same(CONTENT)} THEN SET @kvkk_audit_ok = 1; ` +
      `ELSEIF @kvkk_erasure = 1 AND NEW.\`maskedAt\` IS NOT NULL AND ${same(CONTENT.filter((c) => !MASKABLE.includes(c) && c !== 'maskedAt' && c !== 'maskedDigest'))} AND ${same(SEAL)} ` +
      `AND ${clearedOrSame(['userId', 'username', 'ip', 'userAgent'])} THEN ${MASK_WALK}SET NEW.\`maskedDigest\` = ${auditDigestSql('NEW')}; ` +
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
/** Frozen audit_logs trigger versions: V1 (migration 1784274141000), V2 (migration 1784274142000). */
export const AUDIT_LOG_TRIGGERS_VERSION_1 = AUDIT_LOG_TRIGGERS_V1;
export const AUDIT_LOG_TRIGGERS_VERSION_2 = AUDIT_LOG_TRIGGERS_V2_LIST;
/** Current audit_logs triggers (V3, migration 1784274143000) and the version they replace. */
export const AUDIT_LOG_TRIGGERS_CURRENT = AUDIT_LOG_TRIGGERS;
export const AUDIT_LOG_TRIGGERS_PREVIOUS = AUDIT_LOG_TRIGGERS_V2_LIST;

export const KVKK_TRIGGER_ERROR_CODES = ['AUDIT_LOG_IMMUTABLE', 'AUDIT_MASK_NOT_MARKER', 'DESTRUCTION_LOG_IMMUTABLE', 'LEGAL_ACCEPTANCE_IMMUTABLE', 'NOTICE_PUBLISHED_IMMUTABLE'];

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

/** Server-only key of the mask-event MACs (derived from PII_HMAC_KEY; never stored in the database). */
function auditMaskKey(): Buffer {
  return createHmac('sha256', resolvePiiKeys().mac).update('kvkk-audit-mask-v1').digest();
}

/** MAC binding a masked row to its company, its original (chained) digest and its masked digest. */
export function auditMaskMac(companyId: string | null, id: string, payloadDigest: string, maskedDigest: string): string {
  return createHmac('sha256', auditMaskKey()).update(`${companyId ?? ''}|${id}|${payloadDigest}|${maskedDigest}`, 'utf8').digest('hex');
}

/** One mask-event entry: [auditRowId, maskedDigest, mac] (mac null: not attested). */
export type AuditMaskEntry = [string, string, string | null];

const insertMaskEvent = (query: Query, companyId: string | null, actor: { userId?: string | null; username?: string | null }, after: unknown) =>
  query(
    "INSERT INTO audit_logs (id, companyId, userId, username, action, entityType, entityId, `before`, `after`) VALUES (UUID(), ?, ?, ?, ?, 'audit_logs', NULL, NULL, ?)",
    [companyId || null, actor.userId ?? null, actor.username?.slice(0, 100) ?? 'system', AUDIT_MASK_ACTION, JSON.stringify(after)],
  );

/**
 * Writes AUDIT_MASK_ACTION events (one per company and chunk of 200 rows) for masked audit rows,
 * attesting their current content with a MAC. `attest(id)` false (or content no longer matching the
 * stored maskedDigest) records the row without a MAC: the verifier keeps reporting it as tampered.
 */
export async function writeAuditMaskEvents(
  query: Query,
  ids: string[],
  actor: { userId?: string | null; username?: string | null } = {},
  attest: (id: string) => boolean = () => true,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const rows: { id: string; companyId: string | null; payloadDigest: string; maskedDigest: string | null; cur: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    rows.push(
      ...(await query(
        `SELECT a.id, a.companyId, a.payloadDigest, a.maskedDigest, ${auditDigestSql('a')} AS cur FROM audit_logs a WHERE a.id IN (${chunk.map(() => '?').join(', ')})`,
        chunk,
      )),
    );
  }
  const byCompany = new Map<string, AuditMaskEntry[]>();
  for (const d of rows) {
    if (!d.maskedDigest) continue;
    const k = d.companyId ?? '';
    if (!byCompany.has(k)) byCompany.set(k, []);
    const ok = attest(d.id) && d.maskedDigest === d.cur;
    byCompany.get(k)!.push([d.id, d.maskedDigest, ok ? auditMaskMac(d.companyId, d.id, d.payloadDigest, d.maskedDigest) : null]);
  }
  for (const [companyId, entries] of byCompany) {
    for (let i = 0; i < entries.length; i += 200) await insertMaskEvent(query, companyId, actor, { ...extra, rows: entries.slice(i, i + 200) });
  }
  return rows.length;
}

/**
 * Applies KVKK masking to audit rows and records it: one AUDIT_MASK_ACTION event per company and
 * chunk of rows (`after.rows` = [[auditRowId, maskedDigest, mac], ...]), in the caller's
 * transaction. The maskedDigest is computed by the trigger and read back here. A row whose content
 * did not match its digest before the masking (tampered) is masked but not attested, so a masking
 * never launders an earlier rewrite.
 */
export async function applyAuditMasks(query: Query, items: AuditMaskItem[], actor: { userId?: string | null; username?: string | null } = {}): Promise<number> {
  if (!items.length) return 0;
  const ids = items.map((r) => r.id);
  const tamperedBefore = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const bad: { id: string }[] = await query(
      `SELECT a.id FROM audit_logs a WHERE a.id IN (${chunk.map(() => '?').join(', ')}) AND NOT (${auditDigestSql('a')} <=> IF(a.maskedAt IS NULL, a.payloadDigest, a.maskedDigest))`,
      chunk,
    );
    for (const r of bad) tamperedBefore.add(r.id);
  }
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
  await writeAuditMaskEvents(query, ids, actor, (id) => !tamperedBefore.has(id), tamperedBefore.size ? { tamperedBeforeMasking: [...tamperedBefore].slice(0, 200) } : {});
  return items.length;
}

export interface MaskEventEntry {
  digest: string;
  mac: string | null;
}

/** Latest mask-event entry per audit row id, from the company's AUDIT_MASK_ACTION events (chain order). */
export function maskEventDigests(events: { after: unknown }[]): Map<string, MaskEventEntry> {
  const map = new Map<string, MaskEventEntry>();
  for (const e of events) {
    const a = (typeof e.after === 'string' ? JSON.parse(e.after) : e.after) as { rows?: (string | null)[][] } | null;
    for (const [id, digest, mac] of a?.rows ?? []) if (id && digest) map.set(id, { digest, mac: mac ?? null });
  }
  return map;
}

/** True when a masked row is a genuine, attested masking: content = maskedDigest = event digest, and a valid MAC. */
export function isAttestedMask(r: { id: string; companyId: string | null; payloadDigest: string; maskedDigest: string | null; cur: string }, ev: MaskEventEntry | undefined): boolean {
  if (!r.maskedDigest || r.maskedDigest !== r.cur || !ev || ev.digest !== r.maskedDigest || !ev.mac) return false;
  return ev.mac === auditMaskMac(r.companyId, r.id, r.payloadDigest, r.maskedDigest);
}
