import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Databases created by the first InitialMigration (before it was rewritten to match the entities)
 * carry the supplier soft-delete index as `IDX_suppliers_isDeleted`; the entity, and a fresh install,
 * name it `IDX_7b53306ed78ff59215a7b77eb4`. Rename it only where the legacy name exists, so
 * `schema:log` is clean on both kinds of database. No data change.
 */
export class RenameLegacySupplierIndex1784274144000 implements MigrationInterface {
  name = 'RenameLegacySupplierIndex1784274144000';

  private async hasIndex(q: QueryRunner, name: string): Promise<boolean> {
    const rows = await q.query(
      `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND index_name = ? LIMIT 1`,
      [name],
    );
    return rows.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if ((await this.hasIndex(q, 'IDX_suppliers_isDeleted')) && !(await this.hasIndex(q, 'IDX_7b53306ed78ff59215a7b77eb4'))) {
      await q.query('ALTER TABLE `suppliers` RENAME INDEX `IDX_suppliers_isDeleted` TO `IDX_7b53306ed78ff59215a7b77eb4`');
    }
  }

  public async down(): Promise<void> {
    // Intentionally a no-op: which name the database had before cannot be known here, and both are equivalent.
  }
}
