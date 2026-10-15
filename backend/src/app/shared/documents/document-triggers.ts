/**
 * DB triggers that freeze legal documents once they leave DRAFT (TTK 65/3, VUK 217/359; WP4):
 * after approval / issue only the listed status / workflow columns may change, the row cannot be
 * deleted and its lines can be neither inserted, changed (except the running counters) nor deleted.
 * The SIGNAL text is the application error code DOCUMENT_IMMUTABLE (mapped to HTTP 409).
 *
 * The "frozen" column list is built from information_schema at creation time (all columns except
 * the mutable ones), so the trigger covers every legal field of the table.
 */
type Query = (sql: string, params?: unknown[]) => Promise<any>;

interface DocTable {
  table: string;
  /** Statuses in which the row is still editable */
  draft: string[];
  /** Columns that may change after the document left DRAFT */
  mutable: string[];
  lines?: { table: string; fk: string; mutable: string[] }[];
}

export const DOCUMENT_TABLES: DocTable[] = [
  {
    table: 'invoices',
    draft: ['DRAFT'],
    mutable: ['status', 'gibStatus', 'providerRef', 'objection', 'objectionNote', 'cancelledAt', 'cancelledBy', 'cancelReason', 'updatedAt'],
    lines: [{ table: 'invoice_lines', fk: 'invoiceId', mutable: ['returnedQuantity'] }],
  },
  {
    table: 'despatches',
    draft: ['DRAFT'],
    mutable: ['status', 'gibStatus', 'providerRef', 'deliveryChannel', 'invoiceStatus', 'receivedAt', 'receivedBy', 'updatedAt'],
    lines: [{ table: 'despatch_lines', fk: 'despatchId', mutable: ['invoicedQuantity', 'returnedQuantity'] }],
  },
  {
    table: 'returns',
    draft: ['DRAFT'],
    mutable: ['refundRef', 'returnInvoiceId', 'expenseVoucherId', 'despatchId', 'counterpartyDocNo', 'counterpartyDocDate', 'counterpartyEttn', 'updatedAt'],
    lines: [{ table: 'return_items', fk: 'returnId', mutable: [] }],
  },
  {
    table: 'goods_receipts',
    draft: ['DRAFT'],
    mutable: ['supplierInvoiceNo', 'supplierInvoiceDate', 'supplierInvoiceEttn', 'supplierInvoiceAmount', 'ownDespatchId', 'expenseVoucherId', 'updatedAt'],
    lines: [{ table: 'goods_receipt_items', fk: 'goodsReceiptId', mutable: ['returnedQuantity'] }],
  },
  {
    table: 'expense_vouchers',
    draft: ['DRAFT'],
    mutable: ['status', 'cancelledAt', 'cancelledBy', 'cancelReason', 'signedCopyReceived', 'signedCopyAt', 'paymentRef', 'paidAt', 'updatedAt'],
  },
];

const SIGNAL = "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENT_IMMUTABLE'";
const q = (c: string) => `\`${c}\``;
const list = (v: string[]) => v.map((x) => `'${x}'`).join(', ');

export interface DocumentTriggerDef {
  name: string;
  sql: string;
}

/** Trigger definitions for the given table -> columns map. */
export function documentTriggerDefs(columns: Record<string, string[]>): DocumentTriggerDef[] {
  const out: DocumentTriggerDef[] = [];
  for (const t of DOCUMENT_TABLES) {
    const cols = columns[t.table] || [];
    if (!cols.length) continue;
    const frozen = cols.filter((c) => !t.mutable.includes(c) && c !== 'status');
    const same = frozen.map((c) => `NEW.${q(c)} <=> OLD.${q(c)}`).join(' AND ');
    // status may only move forward from a non-draft state (never back to an editable one)
    out.push({
      name: `trg_${t.table}_frozen`,
      sql:
        `CREATE TRIGGER ${q(`trg_${t.table}_frozen`)} BEFORE UPDATE ON ${q(t.table)} FOR EACH ROW BEGIN ` +
        `IF OLD.${q('status')} NOT IN (${list(t.draft)}) AND (NEW.${q('status')} IN (${list(t.draft)}) OR NOT (${same})) THEN ${SIGNAL}; END IF; END`,
    });
    out.push({
      name: `trg_${t.table}_no_delete`,
      sql: `CREATE TRIGGER ${q(`trg_${t.table}_no_delete`)} BEFORE DELETE ON ${q(t.table)} FOR EACH ROW BEGIN IF OLD.${q('status')} NOT IN (${list(t.draft)}) THEN ${SIGNAL}; END IF; END`,
    });
    for (const l of t.lines || []) {
      const lcols = columns[l.table] || [];
      if (!lcols.length) continue;
      const parentFrozen = (alias: string) =>
        `EXISTS (SELECT 1 FROM ${q(t.table)} p WHERE p.${q('id')} = ${alias}.${q(l.fk)} AND p.${q('status')} NOT IN (${list(t.draft)}))`;
      const lfrozen = lcols.filter((c) => !l.mutable.includes(c));
      const lsame = lfrozen.map((c) => `NEW.${q(c)} <=> OLD.${q(c)}`).join(' AND ');
      out.push({
        name: `trg_${l.table}_frozen`,
        sql: `CREATE TRIGGER ${q(`trg_${l.table}_frozen`)} BEFORE UPDATE ON ${q(l.table)} FOR EACH ROW BEGIN IF ${parentFrozen('OLD')} AND NOT (${lsame}) THEN ${SIGNAL}; END IF; END`,
      });
      out.push({
        name: `trg_${l.table}_no_insert`,
        sql: `CREATE TRIGGER ${q(`trg_${l.table}_no_insert`)} BEFORE INSERT ON ${q(l.table)} FOR EACH ROW BEGIN IF ${parentFrozen('NEW')} THEN ${SIGNAL}; END IF; END`,
      });
      out.push({
        name: `trg_${l.table}_no_delete`,
        sql: `CREATE TRIGGER ${q(`trg_${l.table}_no_delete`)} BEFORE DELETE ON ${q(l.table)} FOR EACH ROW BEGIN IF ${parentFrozen('OLD')} THEN ${SIGNAL}; END IF; END`,
      });
    }
  }
  return out;
}

async function tableColumns(query: Query): Promise<Record<string, string[]>> {
  const tables = DOCUMENT_TABLES.flatMap((t) => [t.table, ...(t.lines || []).map((l) => l.table)]);
  const rows: { TABLE_NAME: string; COLUMN_NAME: string }[] = await query(
    'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) ORDER BY ORDINAL_POSITION',
    [tables],
  );
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.TABLE_NAME] = out[r.TABLE_NAME] || []).push(r.COLUMN_NAME);
  return out;
}

export function documentTriggerNames(): string[] {
  return DOCUMENT_TABLES.flatMap((t) => [
    `trg_${t.table}_frozen`,
    `trg_${t.table}_no_delete`,
    ...(t.lines || []).flatMap((l) => [`trg_${l.table}_frozen`, `trg_${l.table}_no_insert`, `trg_${l.table}_no_delete`]),
  ]);
}

/** Creates the missing document triggers (recreate = drop and create all, after a column change). */
export async function ensureDocumentTriggers(query: Query, recreate = false): Promise<string[]> {
  const existing = new Set(
    ((await query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()')) as { TRIGGER_NAME: string }[]).map((r) => r.TRIGGER_NAME),
  );
  const created: string[] = [];
  for (const t of documentTriggerDefs(await tableColumns(query))) {
    if (existing.has(t.name)) {
      if (!recreate) continue;
      await query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
    }
    await query(t.sql);
    created.push(t.name);
  }
  return created;
}

export async function dropDocumentTriggers(query: Query): Promise<void> {
  for (const n of documentTriggerNames()) await query(`DROP TRIGGER IF EXISTS \`${n}\``);
}
