import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces multi-tenancy:
 *  - `companies` table (tenant root + locale settings)
 *  - `companyId` FK on users and every business table, backfilled to a default
 *    "Demo Şirketi" company so existing data survives
 *  - global unique constraints (sku, orderNumber, poNumber, countNumber,
 *    warehouse name/code, category slug) become per-company
 *  - per-user language/timezone overrides
 *
 * Index / FK names are explicit in the entities so `synchronize` and this
 * migration agree on the final schema.
 */
const DEFAULT_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const TENANT_TABLES = [
  'users',
  'categories',
  'suppliers',
  'warehouses',
  'products',
  'orders',
  'stock_movements',
  'purchase_orders',
  'stock_counts',
];

// [table, old global unique index (TypeORM generated name), column, new composite unique name]
const UNIQUE_SWAPS: [string, string, string, string][] = [
  ['categories', 'IDX_420d9f679d41281f282f5bc7d0', 'slug', 'UQ_categories_company_slug'],
  ['warehouses', 'IDX_be9dd3cc2931f11f7440f2eeb1', 'name', 'UQ_warehouses_company_name'],
  ['warehouses', 'IDX_d8b96d60ff9a288f5ed862280d', 'code', 'UQ_warehouses_company_code'],
  ['products', 'IDX_c44ac33a05b144dd0d9ddcf932', 'sku', 'UQ_products_company_sku'],
  ['orders', 'IDX_59b0c3b34ea0fa5562342f2414', 'orderNumber', 'UQ_orders_company_orderNumber'],
  ['purchase_orders', 'IDX_2e0fc7a6605393a9bd691cdceb', 'poNumber', 'UQ_purchase_orders_company_poNumber'],
  ['stock_counts', 'IDX_c9e9db360be03a918059dfcafc', 'countNumber', 'UQ_stock_counts_company_countNumber'],
];

// Tables without a composite unique starting with companyId get a plain index.
const PLAIN_INDEX_TABLES = ['users', 'suppliers', 'stock_movements'];

export class AddMultiTenancy1784274123000 implements MigrationInterface {
  name = 'AddMultiTenancy1784274123000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TABLE `companies` (`id` varchar(36) NOT NULL, `name` varchar(255) NOT NULL, `slug` varchar(100) NOT NULL, " +
        "`country` varchar(2) NOT NULL DEFAULT 'TR', `defaultLanguage` varchar(5) NOT NULL DEFAULT 'tr', " +
        "`baseCurrency` varchar(3) NOT NULL DEFAULT 'TRY', `timezone` varchar(64) NOT NULL DEFAULT 'Europe/Istanbul', " +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'UNIQUE INDEX `UQ_companies_slug` (`slug`), PRIMARY KEY (`id`)) ENGINE=InnoDB'
    );

    // Default tenant that owns all pre-existing data.
    await queryRunner.query(
      'INSERT INTO `companies` (`id`, `name`, `slug`, `country`, `defaultLanguage`, `baseCurrency`, `timezone`) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [DEFAULT_COMPANY_ID, 'Demo Şirketi', 'demo-sirketi', 'TR', 'tr', 'TRY', 'Europe/Istanbul']
    );

    // Add nullable, backfill, then enforce NOT NULL (safe on populated tables).
    for (const table of TENANT_TABLES) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD \`companyId\` varchar(36) NULL`);
      await queryRunner.query(`UPDATE \`${table}\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`, [DEFAULT_COMPANY_ID]);
      await queryRunner.query(`ALTER TABLE \`${table}\` MODIFY \`companyId\` varchar(36) NOT NULL`);
    }

    await queryRunner.query('ALTER TABLE `users` ADD `language` varchar(5) NULL');
    await queryRunner.query('ALTER TABLE `users` ADD `timezone` varchar(64) NULL');

    for (const [table, oldIdx, column, newIdx] of UNIQUE_SWAPS) {
      await queryRunner.query(`DROP INDEX \`${oldIdx}\` ON \`${table}\``);
      await queryRunner.query(`CREATE UNIQUE INDEX \`${newIdx}\` ON \`${table}\` (\`companyId\`, \`${column}\`)`);
    }
    for (const table of PLAIN_INDEX_TABLES) {
      await queryRunner.query(`CREATE INDEX \`IDX_${table}_companyId\` ON \`${table}\` (\`companyId\`)`);
    }

    for (const table of TENANT_TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`FK_${table}_company\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TENANT_TABLES) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`FK_${table}_company\``);
    }
    for (const table of PLAIN_INDEX_TABLES) {
      await queryRunner.query(`DROP INDEX \`IDX_${table}_companyId\` ON \`${table}\``);
    }
    // NOTE: restoring global uniques fails if two companies share a value.
    for (const [table, oldIdx, column, newIdx] of UNIQUE_SWAPS) {
      await queryRunner.query(`DROP INDEX \`${newIdx}\` ON \`${table}\``);
      await queryRunner.query(`CREATE UNIQUE INDEX \`${oldIdx}\` ON \`${table}\` (\`${column}\`)`);
    }
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `timezone`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `language`');
    for (const table of TENANT_TABLES) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`companyId\``);
    }
    await queryRunner.query('DROP TABLE `companies`');
  }
}
