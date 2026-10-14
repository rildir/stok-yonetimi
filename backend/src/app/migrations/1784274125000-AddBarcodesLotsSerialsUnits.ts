import { MigrationInterface, QueryRunner } from 'typeorm';
import { STANDARD_UNITS, legacyUnitCode } from '../shared/inventory/units';

/**
 * Step 4:
 *  A. Barcodes: products.barcode / barcodeType (unique per company).
 *  B. Lot / serial / expiry tracking: products.trackingType / hasExpiry,
 *     `stock_lots`, `serial_numbers`, stock_movements.lotId / lotNumber / serials,
 *     line `tracking` JSON, companies.expiryAlertDays.
 *  C. Units of measure: `units` (per company, standard set seeded),
 *     `product_units` (alternate units with factor + optional barcode),
 *     products.baseUnitId, line unitId / unitCode / unitFactor / unitQuantity.
 *
 * Backfill rules
 *  - Every company gets the standard units (pcs, box, pack, pallet, kg, g, lb, l, ml, m).
 *  - products.unit free text ('Adet', 'Kg', 'Kutu', ...) is mapped to a standard unit;
 *    unknown values become a custom unit of the company. products.unit then holds the unit code.
 *  - Existing products stay trackingType 'none'; existing lines get unitFactor 1,
 *    unitQuantity = quantity and the product's base unit code.
 *  Demo lots/serials/box units are created by SeedService (demo company only).
 */
export class AddBarcodesLotsSerialsUnits1784274125000 implements MigrationInterface {
  name = 'AddBarcodesLotsSerialsUnits1784274125000';

  public async up(q: QueryRunner): Promise<void> {
    const ts = '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
    await q.query(
      'CREATE TABLE `units` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `code` varchar(20) NOT NULL, `name` varchar(100) NOT NULL, ' +
        '`isStandard` tinyint NOT NULL DEFAULT 0, ' + ts + ', UNIQUE INDEX `UQ_units_company_code` (`companyId`, `code`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `product_units` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `productId` varchar(36) NOT NULL, `unitId` varchar(36) NOT NULL, ' +
        '`factor` decimal(12,4) NOT NULL, `barcode` varchar(64) NULL, UNIQUE INDEX `UQ_product_units_product_unit` (`productId`, `unitId`), ' +
        'UNIQUE INDEX `UQ_product_units_company_barcode` (`companyId`, `barcode`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `stock_lots` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `productId` varchar(36) NOT NULL, `warehouseId` varchar(36) NOT NULL, ' +
        "`lotNumber` varchar(64) NOT NULL, `expiryDate` date NULL, `quantity` int NOT NULL DEFAULT '0', " + ts + ', ' +
        'UNIQUE INDEX `UQ_stock_lots_product_wh_lot` (`productId`, `warehouseId`, `lotNumber`), INDEX `IDX_stock_lots_company_expiry` (`companyId`, `expiryDate`), ' +
        'CONSTRAINT `CHK_stock_lots_quantity` CHECK (quantity >= 0), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `serial_numbers` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `productId` varchar(36) NOT NULL, `warehouseId` varchar(36) NULL, ' +
        "`serial` varchar(100) NOT NULL, `status` varchar(20) NOT NULL DEFAULT 'in_stock', `lotId` varchar(36) NULL, " + ts + ', ' +
        'UNIQUE INDEX `UQ_serial_numbers_company_product_serial` (`companyId`, `productId`, `serial`), INDEX `IDX_serial_numbers_product_status` (`productId`, `status`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    const fk = (t: string, name: string, col: string, ref: string, onDelete: string) =>
      q.query(`ALTER TABLE \`${t}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${col}\`) REFERENCES \`${ref}\`(\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`);
    await fk('units', 'FK_units_company', 'companyId', 'companies', 'CASCADE');
    await fk('product_units', 'FK_product_units_company', 'companyId', 'companies', 'CASCADE');
    await fk('product_units', 'FK_product_units_product', 'productId', 'products', 'CASCADE');
    await fk('product_units', 'FK_product_units_unit', 'unitId', 'units', 'RESTRICT');
    await fk('stock_lots', 'FK_stock_lots_company', 'companyId', 'companies', 'CASCADE');
    await fk('stock_lots', 'FK_stock_lots_product', 'productId', 'products', 'CASCADE');
    await fk('stock_lots', 'FK_stock_lots_warehouse', 'warehouseId', 'warehouses', 'CASCADE');
    await fk('serial_numbers', 'FK_serial_numbers_company', 'companyId', 'companies', 'CASCADE');
    await fk('serial_numbers', 'FK_serial_numbers_product', 'productId', 'products', 'CASCADE');
    await fk('serial_numbers', 'FK_serial_numbers_warehouse', 'warehouseId', 'warehouses', 'SET NULL');
    await fk('serial_numbers', 'FK_serial_numbers_lot', 'lotId', 'stock_lots', 'SET NULL');

    // ─── Columns ───
    await q.query("ALTER TABLE `companies` ADD `expiryAlertDays` int NOT NULL DEFAULT '30'");
    await q.query('ALTER TABLE `products` ADD `baseUnitId` varchar(36) NULL');
    await q.query('ALTER TABLE `products` ADD `barcode` varchar(64) NULL');
    await q.query('ALTER TABLE `products` ADD `barcodeType` varchar(10) NULL');
    await q.query("ALTER TABLE `products` ADD `trackingType` varchar(10) NOT NULL DEFAULT 'none'");
    await q.query('ALTER TABLE `products` ADD `hasExpiry` tinyint NOT NULL DEFAULT 0');
    await q.query('CREATE INDEX `IDX_products_baseUnitId` ON `products` (`baseUnitId`)');
    await q.query('CREATE UNIQUE INDEX `UQ_products_company_barcode` ON `products` (`companyId`, `barcode`)');
    await fk('products', 'FK_products_base_unit', 'baseUnitId', 'units', 'SET NULL');

    await q.query('ALTER TABLE `stock_movements` ADD `lotId` varchar(36) NULL');
    await q.query('ALTER TABLE `stock_movements` ADD `lotNumber` varchar(64) NULL');
    await q.query('ALTER TABLE `stock_movements` ADD `serials` text NULL');
    await q.query('CREATE INDEX `IDX_stock_movements_lotId` ON `stock_movements` (`lotId`)');

    for (const t of ['order_items', 'purchase_order_items']) {
      await q.query(`ALTER TABLE \`${t}\` ADD \`unitId\` varchar(36) NULL`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`unitCode\` varchar(20) NULL`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`unitFactor\` decimal(12,4) NOT NULL DEFAULT '1.0000'`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`unitQuantity\` decimal(12,4) NOT NULL DEFAULT '0.0000'`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`tracking\` text NULL`);
    }

    // ─── Backfill units ───
    const companies: { id: string }[] = await q.query('SELECT id FROM companies');
    for (const c of companies) {
      for (const u of STANDARD_UNITS) {
        await q.query('INSERT INTO `units` (id, companyId, code, name, isStandard) VALUES (UUID(), ?, ?, ?, 1)', [c.id, u.code, u.name]);
      }
      const legacy: { unit: string | null }[] = await q.query('SELECT DISTINCT unit FROM products WHERE companyId = ?', [c.id]);
      for (const { unit } of legacy) {
        let code = legacyUnitCode(unit);
        if (!code) {
          code = String(unit).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 20) || 'unit';
          await q.query('INSERT IGNORE INTO `units` (id, companyId, code, name, isStandard) VALUES (UUID(), ?, ?, ?, 0)', [c.id, code, String(unit).trim()]);
        }
        await q.query(
          'UPDATE products p JOIN units u ON u.companyId = p.companyId AND u.code = ? SET p.baseUnitId = u.id, p.unit = u.code ' +
            'WHERE p.companyId = ? AND ' + (unit === null ? 'p.unit IS NULL' : 'p.unit = ?'),
          unit === null ? [code, c.id] : [code, c.id, unit],
        );
      }
    }
    await q.query("ALTER TABLE `products` MODIFY `unit` varchar(255) NOT NULL DEFAULT 'pcs'");

    for (const t of ['order_items', 'purchase_order_items']) {
      await q.query(
        `UPDATE \`${t}\` i LEFT JOIN products p ON p.id = i.productId SET i.unitQuantity = i.quantity, i.unitFactor = 1, i.unitCode = COALESCE(p.unit, 'pcs')`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['order_items', 'purchase_order_items']) {
      await q.query(`ALTER TABLE \`${t}\` DROP COLUMN \`tracking\`, DROP COLUMN \`unitQuantity\`, DROP COLUMN \`unitFactor\`, DROP COLUMN \`unitCode\`, DROP COLUMN \`unitId\``);
    }
    await q.query('DROP INDEX `IDX_stock_movements_lotId` ON `stock_movements`');
    await q.query('ALTER TABLE `stock_movements` DROP COLUMN `serials`, DROP COLUMN `lotNumber`, DROP COLUMN `lotId`');
    // Restore the legacy display text from the unit names.
    await q.query("UPDATE products p LEFT JOIN units u ON u.id = p.baseUnitId SET p.unit = COALESCE(u.name, 'Adet')");
    await q.query("ALTER TABLE `products` MODIFY `unit` varchar(255) NOT NULL DEFAULT 'Adet'");
    await q.query('ALTER TABLE `products` DROP FOREIGN KEY `FK_products_base_unit`');
    await q.query('DROP INDEX `UQ_products_company_barcode` ON `products`');
    await q.query('DROP INDEX `IDX_products_baseUnitId` ON `products`');
    await q.query('ALTER TABLE `products` DROP COLUMN `hasExpiry`, DROP COLUMN `trackingType`, DROP COLUMN `barcodeType`, DROP COLUMN `barcode`, DROP COLUMN `baseUnitId`');
    await q.query('ALTER TABLE `companies` DROP COLUMN `expiryAlertDays`');
    await q.query('DROP TABLE `serial_numbers`');
    await q.query('DROP TABLE `stock_lots`');
    await q.query('DROP TABLE `product_units`');
    await q.query('DROP TABLE `units`');
  }
}
