/**
 * MySQL triggers that make the legal inventory records append-only at the
 * database level (TTK 65/3, VUK 217/359), independent of the application:
 *  - stock_movements: no UPDATE, no DELETE (corrections are REVERSAL rows);
 *  - stock_counts: a completed count can be neither changed nor deleted;
 *  - purchase orders: received orders and their lines cannot be deleted;
 *  - evidence files of movements: never deleted, only linked once to a movement;
 *  - maker-checker requests: never deleted, frozen once decided.
 *
 * The SIGNAL message is an application error code; I18nExceptionFilter maps it
 * to a localized 409 response. Used by migration 1784274129000 and, for databases
 * built by schema sync, by SeedService (created when missing).
 */
export interface TriggerDef {
  name: string;
  table: string;
  sql: string;
}

const signal = (code: string) => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${code}'`;

export const IMMUTABILITY_TRIGGERS: TriggerDef[] = [
  {
    name: 'trg_stock_movements_no_update',
    table: 'stock_movements',
    sql: `CREATE TRIGGER \`trg_stock_movements_no_update\` BEFORE UPDATE ON \`stock_movements\` FOR EACH ROW BEGIN ${signal('MOVEMENT_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_stock_movements_no_delete',
    table: 'stock_movements',
    sql: `CREATE TRIGGER \`trg_stock_movements_no_delete\` BEFORE DELETE ON \`stock_movements\` FOR EACH ROW BEGIN ${signal('MOVEMENT_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_stock_counts_completed_no_update',
    table: 'stock_counts',
    sql: `CREATE TRIGGER \`trg_stock_counts_completed_no_update\` BEFORE UPDATE ON \`stock_counts\` FOR EACH ROW BEGIN IF OLD.\`status\` = 'Completed' THEN ${signal('STOCK_COUNT_IMMUTABLE')}; END IF; END`,
  },
  {
    name: 'trg_stock_counts_completed_no_delete',
    table: 'stock_counts',
    sql: `CREATE TRIGGER \`trg_stock_counts_completed_no_delete\` BEFORE DELETE ON \`stock_counts\` FOR EACH ROW BEGIN IF OLD.\`status\` = 'Completed' THEN ${signal('STOCK_COUNT_IMMUTABLE')}; END IF; END`,
  },
  {
    name: 'trg_po_items_received_no_delete',
    table: 'purchase_order_items',
    sql:
      `CREATE TRIGGER \`trg_po_items_received_no_delete\` BEFORE DELETE ON \`purchase_order_items\` FOR EACH ROW BEGIN ` +
      `IF EXISTS (SELECT 1 FROM \`purchase_orders\` po WHERE po.\`id\` = OLD.\`purchaseOrderId\` AND po.\`status\` IN ('Received', 'Partially Received')) ` +
      `THEN ${signal('RECEIVED_LINE_UNDELETABLE')}; END IF; END`,
  },
  {
    name: 'trg_purchase_orders_received_no_delete',
    table: 'purchase_orders',
    sql:
      `CREATE TRIGGER \`trg_purchase_orders_received_no_delete\` BEFORE DELETE ON \`purchase_orders\` FOR EACH ROW BEGIN ` +
      `IF OLD.\`status\` IN ('Received', 'Partially Received') THEN ${signal('RECEIVED_LINE_UNDELETABLE')}; END IF; END`,
  },
  // WP2 review (migration 1784274130000): evidence files and decided maker-checker requests.
  {
    name: 'trg_sm_attachments_no_delete',
    table: 'stock_movement_attachments',
    sql: `CREATE TRIGGER \`trg_sm_attachments_no_delete\` BEFORE DELETE ON \`stock_movement_attachments\` FOR EACH ROW BEGIN ${signal('ATTACHMENT_IMMUTABLE')}; END`,
  },
  {
    // The only allowed change: linking a pending request's file to the movement booked on approval.
    name: 'trg_sm_attachments_link_only',
    table: 'stock_movement_attachments',
    sql:
      `CREATE TRIGGER \`trg_sm_attachments_link_only\` BEFORE UPDATE ON \`stock_movement_attachments\` FOR EACH ROW BEGIN ` +
      `IF NOT (OLD.\`movementId\` IS NULL AND NEW.\`id\` <=> OLD.\`id\` AND NEW.\`companyId\` <=> OLD.\`companyId\` ` +
      `AND NEW.\`adjustmentRequestId\` <=> OLD.\`adjustmentRequestId\` AND NEW.\`fileName\` <=> OLD.\`fileName\` AND NEW.\`mimeType\` <=> OLD.\`mimeType\` ` +
      `AND NEW.\`size\` <=> OLD.\`size\` AND NEW.\`sha256\` <=> OLD.\`sha256\` AND NEW.\`content\` <=> OLD.\`content\` ` +
      `AND NEW.\`uploadedBy\` <=> OLD.\`uploadedBy\` AND NEW.\`createdAt\` <=> OLD.\`createdAt\`) ` +
      `THEN ${signal('ATTACHMENT_IMMUTABLE')}; END IF; END`,
  },
  {
    name: 'trg_adjustment_requests_decided_frozen',
    table: 'stock_adjustment_requests',
    sql:
      `CREATE TRIGGER \`trg_adjustment_requests_decided_frozen\` BEFORE UPDATE ON \`stock_adjustment_requests\` FOR EACH ROW BEGIN ` +
      `IF OLD.\`status\` <> 'PENDING' THEN ${signal('ADJUSTMENT_REQUEST_IMMUTABLE')}; END IF; END`,
  },
  {
    name: 'trg_adjustment_requests_no_delete',
    table: 'stock_adjustment_requests',
    sql: `CREATE TRIGGER \`trg_adjustment_requests_no_delete\` BEFORE DELETE ON \`stock_adjustment_requests\` FOR EACH ROW BEGIN ${signal('ADJUSTMENT_REQUEST_IMMUTABLE')}; END`,
  },
];

/** Triggers added by migration 1784274130000 (dropped by its down()). */
export const REVIEW_FIX_TRIGGER_NAMES = [
  'trg_sm_attachments_no_delete',
  'trg_sm_attachments_link_only',
  'trg_adjustment_requests_decided_frozen',
  'trg_adjustment_requests_no_delete',
];

/** Error codes raised by the triggers (mapped to HTTP 409 by the exception filter). */
export const TRIGGER_ERROR_CODES = ['AUDIT_LOG_IMMUTABLE', 'AUDIT_MASK_NOT_MARKER', 'DESTRUCTION_LOG_IMMUTABLE', 'LEGAL_ACCEPTANCE_IMMUTABLE', 'NOTICE_PUBLISHED_IMMUTABLE', 'MOVEMENT_IMMUTABLE', 'STOCK_COUNT_IMMUTABLE', 'RECEIVED_LINE_UNDELETABLE', 'ATTACHMENT_IMMUTABLE', 'ADJUSTMENT_REQUEST_IMMUTABLE', 'DOCUMENT_IMMUTABLE', 'EDOCUMENT_ARCHIVE_IMMUTABLE', 'PERIOD_CLOSED', 'PERIOD_SNAPSHOT_IMMUTABLE', 'JOURNAL_EXPORT_IMMUTABLE'];

type Query = (sql: string, params?: unknown[]) => Promise<any>;

/** Creates the triggers that do not exist yet in the current database. Returns the created names. */
export async function ensureImmutabilityTriggers(query: Query): Promise<string[]> {
  const rows: { TRIGGER_NAME: string }[] = await query(
    'SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()',
  );
  const existing = new Set(rows.map((r) => r.TRIGGER_NAME));
  const created: string[] = [];
  for (const t of IMMUTABILITY_TRIGGERS) {
    if (existing.has(t.name)) continue;
    await query(t.sql);
    created.push(t.name);
  }
  return created;
}

export async function dropImmutabilityTriggers(query: Query): Promise<void> {
  for (const t of IMMUTABILITY_TRIGGERS) await query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
}
