/**
 * WP6 database guards (independent of the application):
 *  - no stock movement may be inserted with a transaction date inside a CLOSED fiscal period
 *    (VUK 174; TTK 66/2) - the service layer checks first, the trigger is the backstop;
 *  - closing snapshots (inventory_period_balances) are append-only;
 *  - exported journal batches are never changed or deleted.
 * Created by migration 1784274139000 and, for schema-sync databases, by SeedService.
 */
import { TriggerDef } from './immutability-triggers';

const signal = (code: string) => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${code}'`;

export const PERIOD_TRIGGERS: TriggerDef[] = [
  {
    name: 'trg_stock_movements_period_closed',
    table: 'stock_movements',
    sql:
      'CREATE TRIGGER `trg_stock_movements_period_closed` BEFORE INSERT ON `stock_movements` FOR EACH ROW BEGIN ' +
      "IF EXISTS (SELECT 1 FROM `fiscal_periods` fp WHERE fp.`companyId` = NEW.`companyId` AND fp.`status` = 'CLOSED' " +
      'AND NEW.`transactionDate` >= fp.`startAt` AND NEW.`transactionDate` < fp.`endAt`) ' +
      `THEN ${signal('PERIOD_CLOSED')}; END IF; END`,
  },
  {
    name: 'trg_inventory_period_balances_no_update',
    table: 'inventory_period_balances',
    sql: `CREATE TRIGGER \`trg_inventory_period_balances_no_update\` BEFORE UPDATE ON \`inventory_period_balances\` FOR EACH ROW BEGIN ${signal('PERIOD_SNAPSHOT_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_inventory_period_balances_no_delete',
    table: 'inventory_period_balances',
    sql: `CREATE TRIGGER \`trg_inventory_period_balances_no_delete\` BEFORE DELETE ON \`inventory_period_balances\` FOR EACH ROW BEGIN ${signal('PERIOD_SNAPSHOT_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_journal_export_batches_no_update',
    table: 'journal_export_batches',
    sql: `CREATE TRIGGER \`trg_journal_export_batches_no_update\` BEFORE UPDATE ON \`journal_export_batches\` FOR EACH ROW BEGIN ${signal('JOURNAL_EXPORT_IMMUTABLE')}; END`,
  },
  {
    name: 'trg_journal_export_batches_no_delete',
    table: 'journal_export_batches',
    sql: `CREATE TRIGGER \`trg_journal_export_batches_no_delete\` BEFORE DELETE ON \`journal_export_batches\` FOR EACH ROW BEGIN ${signal('JOURNAL_EXPORT_IMMUTABLE')}; END`,
  },
];

export const PERIOD_TRIGGER_ERROR_CODES = ['PERIOD_CLOSED', 'PERIOD_SNAPSHOT_IMMUTABLE', 'JOURNAL_EXPORT_IMMUTABLE'];

type Query = (sql: string, params?: unknown[]) => Promise<any>;

export async function ensurePeriodTriggers(query: Query): Promise<string[]> {
  const rows: { TRIGGER_NAME: string }[] = await query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()');
  const existing = new Set(rows.map((r) => r.TRIGGER_NAME));
  const created: string[] = [];
  for (const t of PERIOD_TRIGGERS) {
    if (existing.has(t.name)) continue;
    await query(t.sql);
    created.push(t.name);
  }
  return created;
}

export async function dropPeriodTriggers(query: Query): Promise<void> {
  for (const t of PERIOD_TRIGGERS) await query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
}
