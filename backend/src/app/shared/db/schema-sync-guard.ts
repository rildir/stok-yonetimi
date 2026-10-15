import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Development schema sync with guard rails.
 *
 * TypeORM's `synchronize` resolves a column-type mismatch by DROP COLUMN + ADD COLUMN,
 * which bypasses the ledger's BEFORE UPDATE / DELETE triggers and silently wipes data
 * (this is how the WP2 dev ledger was lost). Once migrations are the source of truth
 * the app therefore:
 *  - refuses to start while migrations are pending or the database ran migrations the
 *    code does not know (sync would "fix" the schema the wrong way round);
 *  - refuses to start when the sync would drop a column or a table;
 *  - otherwise applies the remaining additive changes.
 * A database without a `migrations` table (built by schema sync only) skips the
 * migration check. DB_SYNCHRONIZE=false (or production) disables sync altogether.
 */
export interface SchemaSyncPlan {
  pending: string[];
  unknown: string[];
  destructive: string[];
  statements: number;
}

const DESTRUCTIVE = /\bDROP\s+(COLUMN|TABLE)\b/i;

export function isDestructiveStatement(sql: string): boolean {
  return DESTRUCTIVE.test(sql);
}

export function syncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['NODE_ENV'] !== 'production' && env['DB_SYNCHRONIZE'] !== 'false';
}

export async function planSchemaSync(ds: DataSource): Promise<SchemaSyncPlan> {
  const table = ds.options.migrationsTableName || 'migrations';
  const hasTable = (await ds.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]))[0];
  let pending: string[] = [];
  let unknown: string[] = [];
  if (Number(hasTable?.n || 0) > 0) {
    const executed = new Set<string>((await ds.query(`SELECT \`name\` FROM \`${table}\``)).map((r: { name: string }) => r.name));
    const known = ds.migrations.map((m) => m.name || m.constructor.name);
    pending = known.filter((n) => !executed.has(n));
    unknown = [...executed].filter((n) => !known.includes(n));
  }
  const log = await ds.driver.createSchemaBuilder().log();
  const destructive = log.upQueries.map((q) => q.query).filter(isDestructiveStatement);
  return { pending, unknown, destructive, statements: log.upQueries.length };
}

/** Runs the guarded sync; throws (the app does not start) when it would be unsafe. */
export async function guardedSynchronize(ds: DataSource, logger = new Logger('SchemaSync')): Promise<void> {
  if (!syncEnabled()) return;
  const plan = await planSchemaSync(ds);
  const problems: string[] = [];
  if (plan.pending.length) problems.push(`pending migrations: ${plan.pending.join(', ')} (run: npx nx run backend:migration:run)`);
  if (plan.unknown.length) problems.push(`database has migrations unknown to this code: ${plan.unknown.join(', ')}`);
  if (plan.destructive.length) problems.push(`schema sync would drop data:\n  ${plan.destructive.join('\n  ')}\n  -> write a migration for this change`);
  if (problems.length) {
    throw new Error(`Schema sync refused (set DB_SYNCHRONIZE=false to start without sync):\n- ${problems.join('\n- ')}`);
  }
  if (plan.statements) {
    logger.log(`Applying ${plan.statements} additive schema change(s)`);
    await ds.synchronize();
  }
}
