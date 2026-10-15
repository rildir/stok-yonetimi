/**
 * DB triggers of the e-document archive (WP5; TTK 82, VUK 253, 509 VI): rows of `e_documents`
 * can never be deleted; the XML, its hash and all identifying columns are frozen; the signed XML
 * can be set once; the retention date can only be extended. The status timeline
 * (`edocument_events`) is append-only. SIGNAL text = error code EDOCUMENT_ARCHIVE_IMMUTABLE (409).
 */
type Query = (sql: string, params?: unknown[]) => Promise<any>;

export const EDOC_TRIGGER_CODE = 'EDOCUMENT_ARCHIVE_IMMUTABLE';
const SIGNAL = `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${EDOC_TRIGGER_CODE}'`;
const q = (c: string) => `\`${c}\``;

/** Columns of e_documents that may change after insert (status, signature, hold, integrity bookkeeping). */
export const EDOC_MUTABLE_COLUMNS = [
  'signedXml',
  'signedSha256',
  'signedAt',
  'gibStatus',
  'lastStatusAt',
  'providerRef',
  'retentionUntil',
  'legalHold',
  'legalHoldReason',
  'legalHoldBy',
  'integrityCheckedAt',
  'integrityOk',
  'updatedAt',
];

export const EDOC_TRIGGER_NAMES = ['trg_e_documents_frozen', 'trg_e_documents_no_delete', 'trg_edocument_events_no_update', 'trg_edocument_events_no_delete'];

export function edocTriggerDefs(columns: string[]): { name: string; sql: string }[] {
  const frozen = columns.filter((c) => !EDOC_MUTABLE_COLUMNS.includes(c));
  const same = frozen.map((c) => `NEW.${q(c)} <=> OLD.${q(c)}`).join(' AND ');
  return [
    {
      name: 'trg_e_documents_frozen',
      sql:
        'CREATE TRIGGER `trg_e_documents_frozen` BEFORE UPDATE ON `e_documents` FOR EACH ROW BEGIN ' +
        `IF NOT (${same}) ` +
        'OR (OLD.`signedXml` IS NOT NULL AND NOT (NEW.`signedXml` <=> OLD.`signedXml`)) ' +
        'OR (OLD.`signedSha256` IS NOT NULL AND NOT (NEW.`signedSha256` <=> OLD.`signedSha256`)) ' +
        'OR NEW.`retentionUntil` < OLD.`retentionUntil` ' +
        `THEN ${SIGNAL}; END IF; END`,
    },
    { name: 'trg_e_documents_no_delete', sql: `CREATE TRIGGER \`trg_e_documents_no_delete\` BEFORE DELETE ON \`e_documents\` FOR EACH ROW BEGIN ${SIGNAL}; END` },
    { name: 'trg_edocument_events_no_update', sql: `CREATE TRIGGER \`trg_edocument_events_no_update\` BEFORE UPDATE ON \`edocument_events\` FOR EACH ROW BEGIN ${SIGNAL}; END` },
    { name: 'trg_edocument_events_no_delete', sql: `CREATE TRIGGER \`trg_edocument_events_no_delete\` BEFORE DELETE ON \`edocument_events\` FOR EACH ROW BEGIN ${SIGNAL}; END` },
  ];
}

export async function ensureEdocTriggers(query: Query, recreate = false): Promise<string[]> {
  const cols: { COLUMN_NAME: string }[] = await query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'e_documents' ORDER BY ORDINAL_POSITION",
  );
  if (!cols.length) return [];
  const existing = new Set(((await query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()')) as { TRIGGER_NAME: string }[]).map((r) => r.TRIGGER_NAME));
  const created: string[] = [];
  for (const t of edocTriggerDefs(cols.map((c) => c.COLUMN_NAME))) {
    if (existing.has(t.name)) {
      if (!recreate) continue;
      await query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
    }
    await query(t.sql);
    created.push(t.name);
  }
  return created;
}

export async function dropEdocTriggers(query: Query): Promise<void> {
  for (const n of EDOC_TRIGGER_NAMES) await query(`DROP TRIGGER IF EXISTS \`${n}\``);
}
