import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 3:
 *  A. Multi-currency: `currency` on products / orders / purchase_orders,
 *     frozen `exchangeRate` (doc -> base) on documents, `exchange_rates` table.
 *  B. Tax: `tax_rates` table, products.taxRateId, companies.pricesIncludeTax,
 *     line unitPrice/taxRate/taxAmount/lineTotal, doc subtotal/taxTotal/grandTotal.
 *  C. `customers` table, orders.customerId (customerName stays as snapshot).
 *  D. product_warehouse_stocks becomes the single source of truth for stock
 *     (gets companyId), products.warehouses JSON is migrated into it and dropped,
 *     stock_movements.warehouseId, purchase_orders.warehouseId.
 *
 * Backfill rules
 *  - Existing rows get their company's baseCurrency, exchangeRate = 1.
 *  - TR companies get KDV %20 (default) / %10 / %1. Companies that receive a
 *    default rate switch to pricesIncludeTax = 1 and historical line prices are
 *    treated as tax-inclusive, so every existing document keeps its total
 *    (grandTotal = old totalAmount) while tax is extracted from it.
 *  - Customers are created from distinct customerName values per company.
 *  - Warehouse stock: JSON quantities are copied by warehouse name; every
 *    product is then reconciled so SUM(stock rows) = products.quantity (the
 *    figure the app enforced), adjusting the default (oldest) warehouse.
 *    Companies with stock but no warehouse get a "Merkez Depo" (WH-001).
 */
export class AddCurrencyTaxCustomersWarehouseStock1784274124000 implements MigrationInterface {
  name = 'AddCurrencyTaxCustomersWarehouseStock1784274124000';

  public async up(q: QueryRunner): Promise<void> {
    // ─── New tables ───
    await q.query(
      'CREATE TABLE `customers` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `name` varchar(255) NOT NULL, ' +
        "`type` varchar(20) NOT NULL DEFAULT 'individual', `email` varchar(255) NULL, `phone` varchar(255) NULL, " +
        '`taxNumber` varchar(50) NULL, `country` varchar(2) NULL, `address` varchar(255) NULL, `city` varchar(100) NULL, ' +
        '`postalCode` varchar(20) NULL, `currency` varchar(3) NULL, `notes` text NULL, `isDeleted` tinyint NOT NULL DEFAULT 0, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'INDEX `IDX_customers_company_name` (`companyId`, `name`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `tax_rates` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `name` varchar(255) NOT NULL, ' +
        "`rate` decimal(5,2) NOT NULL DEFAULT '0.00', `country` varchar(2) NULL, `isDefault` tinyint NOT NULL DEFAULT 0, " +
        '`isDeleted` tinyint NOT NULL DEFAULT 0, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'INDEX `IDX_tax_rates_companyId` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `exchange_rates` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, ' +
        '`baseCurrency` varchar(3) NOT NULL, `quoteCurrency` varchar(3) NOT NULL, `rate` decimal(18,6) NOT NULL, `date` date NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'UNIQUE INDEX `UQ_exchange_rates_company_pair_date` (`companyId`, `baseCurrency`, `quoteCurrency`, `date`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    for (const t of ['customers', 'tax_rates', 'exchange_rates']) {
      await q.query(
        `ALTER TABLE \`${t}\` ADD CONSTRAINT \`FK_${t}_company\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }

    // ─── Columns ───
    await q.query('ALTER TABLE `companies` ADD `pricesIncludeTax` tinyint NOT NULL DEFAULT 0');

    await q.query("ALTER TABLE `products` ADD `currency` varchar(3) NOT NULL DEFAULT 'TRY'");
    await q.query('ALTER TABLE `products` ADD `taxRateId` varchar(36) NULL');
    await q.query('ALTER TABLE `products` MODIFY `quantity` int NOT NULL DEFAULT 0');
    await q.query('CREATE INDEX `IDX_products_taxRateId` ON `products` (`taxRateId`)');
    await q.query(
      'ALTER TABLE `products` ADD CONSTRAINT `FK_products_tax_rate` FOREIGN KEY (`taxRateId`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );

    for (const t of ['orders', 'purchase_orders']) {
      await q.query(`ALTER TABLE \`${t}\` ADD \`currency\` varchar(3) NOT NULL DEFAULT 'TRY'`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`exchangeRate\` decimal(18,6) NOT NULL DEFAULT '1.000000'`);
      for (const c of ['subtotal', 'taxTotal', 'grandTotal']) {
        await q.query(`ALTER TABLE \`${t}\` ADD \`${c}\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
      }
      await q.query(`ALTER TABLE \`${t}\` MODIFY \`totalAmount\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
    }
    await q.query('ALTER TABLE `orders` ADD `customerId` varchar(36) NULL');
    await q.query('CREATE INDEX `IDX_orders_customerId` ON `orders` (`customerId`)');
    await q.query(
      'ALTER TABLE `orders` ADD CONSTRAINT `FK_orders_customer` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `purchase_orders` ADD `warehouseId` varchar(36) NULL');

    for (const t of ['order_items', 'purchase_order_items']) {
      await q.query(`ALTER TABLE \`${t}\` ADD \`unitPrice\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`taxRate\` decimal(5,2) NOT NULL DEFAULT '0.00'`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`taxAmount\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
      await q.query(`ALTER TABLE \`${t}\` ADD \`lineTotal\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
    }

    await q.query('ALTER TABLE `stock_movements` ADD `warehouseId` varchar(36) NULL');
    await q.query('CREATE INDEX `IDX_stock_movements_warehouseId` ON `stock_movements` (`warehouseId`)');
    await q.query(
      'ALTER TABLE `stock_movements` ADD CONSTRAINT `FK_stock_movements_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );

    // ─── A. Currency backfill ───
    for (const t of ['products', 'orders', 'purchase_orders']) {
      await q.query(`UPDATE \`${t}\` x JOIN \`companies\` c ON c.id = x.companyId SET x.currency = c.baseCurrency`);
    }

    // ─── B. Tax rates + document backfill ───
    const trCompanies: { id: string }[] = await q.query("SELECT id FROM `companies` WHERE country = 'TR'");
    for (const c of trCompanies) {
      for (const [name, rate, isDefault] of [['KDV %20', 20, 1], ['KDV %10', 10, 0], ['KDV %1', 1, 0]] as const) {
        await q.query(
          "INSERT INTO `tax_rates` (`id`, `companyId`, `name`, `rate`, `country`, `isDefault`) VALUES (UUID(), ?, ?, ?, 'TR', ?)",
          [c.id, name, rate, isDefault],
        );
      }
      await q.query('UPDATE `companies` SET `pricesIncludeTax` = 1 WHERE id = ?', [c.id]);
    }
    // Line backfill: historical price*qty is the gross line total; extract tax at the company default rate (0 if none).
    for (const [items, docs, fk] of [
      ['order_items', 'orders', 'orderId'],
      ['purchase_order_items', 'purchase_orders', 'purchaseOrderId'],
    ]) {
      await q.query(
        `UPDATE \`${items}\` i JOIN \`${docs}\` d ON d.id = i.\`${fk}\` ` +
          'LEFT JOIN `tax_rates` tr ON tr.companyId = d.companyId AND tr.isDefault = 1 AND tr.isDeleted = 0 ' +
          'SET i.taxRate = COALESCE(tr.rate, 0), ' +
          'i.lineTotal = ROUND(i.price * i.quantity, 2), ' +
          'i.taxAmount = ROUND(i.price * i.quantity, 2) - ROUND(ROUND(i.price * i.quantity, 2) / (1 + COALESCE(tr.rate, 0) / 100), 2), ' +
          'i.unitPrice = ROUND(ROUND(ROUND(i.price * i.quantity, 2) / (1 + COALESCE(tr.rate, 0) / 100), 2) / GREATEST(i.quantity, 1), 2)',
      );
      await q.query(`UPDATE \`${items}\` SET price = unitPrice`);
      await q.query(
        `UPDATE \`${docs}\` d LEFT JOIN (SELECT \`${fk}\` AS docId, SUM(lineTotal - taxAmount) AS net, SUM(taxAmount) AS tax, SUM(lineTotal) AS gross ` +
          `FROM \`${items}\` GROUP BY \`${fk}\`) s ON s.docId = d.id ` +
          'SET d.subtotal = COALESCE(s.net, d.totalAmount), d.taxTotal = COALESCE(s.tax, 0), ' +
          'd.grandTotal = COALESCE(s.gross, d.totalAmount), d.totalAmount = COALESCE(s.gross, d.totalAmount)',
      );
    }

    // ─── C. Customers from distinct order customer names ───
    await q.query(
      "INSERT INTO `customers` (`id`, `companyId`, `name`, `type`, `country`, `currency`) " +
        "SELECT UUID(), o.companyId, TRIM(o.customerName), " +
        "CASE WHEN TRIM(o.customerName) REGEXP '(A\\\\.Ş\\\\.|Ltd\\\\.?|Şti\\\\.?|Danışmanlık|Yazılım|Inc\\\\.?|LLC|GmbH)' THEN 'company' ELSE 'individual' END, " +
        'c.country, c.baseCurrency ' +
        "FROM (SELECT DISTINCT companyId, TRIM(customerName) AS customerName FROM `orders` WHERE TRIM(customerName) <> '') o " +
        'JOIN `companies` c ON c.id = o.companyId',
    );
    await q.query(
      'UPDATE `orders` o JOIN `customers` cu ON cu.companyId = o.companyId AND cu.name = TRIM(o.customerName) SET o.customerId = cu.id',
    );

    // ─── D. Unified warehouse stock ───
    // product_warehouse_stocks: tenant column + explicit FK / index names.
    const pwsFks: { CONSTRAINT_NAME: string }[] = await q.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_warehouse_stocks' AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
    );
    for (const fk of pwsFks) await q.query(`ALTER TABLE \`product_warehouse_stocks\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
    const pwsIdx: { INDEX_NAME: string }[] = await q.query(
      "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_warehouse_stocks' AND INDEX_NAME <> 'PRIMARY'",
    );
    for (const ix of pwsIdx) await q.query(`DROP INDEX \`${ix.INDEX_NAME}\` ON \`product_warehouse_stocks\``);
    await q.query('ALTER TABLE `product_warehouse_stocks` MODIFY `productId` varchar(36) NOT NULL, MODIFY `warehouseId` varchar(36) NOT NULL');
    await q.query('ALTER TABLE `product_warehouse_stocks` ADD `companyId` varchar(36) NULL');
    await q.query('UPDATE `product_warehouse_stocks` s JOIN `products` p ON p.id = s.productId SET s.companyId = p.companyId');
    await q.query('DELETE FROM `product_warehouse_stocks` WHERE `companyId` IS NULL');
    // Rows pointing at another tenant's warehouse cannot be valid.
    await q.query(
      'DELETE s FROM `product_warehouse_stocks` s JOIN `warehouses` w ON w.id = s.warehouseId WHERE w.companyId <> s.companyId',
    );
    await q.query('ALTER TABLE `product_warehouse_stocks` MODIFY `companyId` varchar(36) NOT NULL');
    await q.query('CREATE UNIQUE INDEX `UQ_pws_product_warehouse` ON `product_warehouse_stocks` (`productId`, `warehouseId`)');
    await q.query('CREATE INDEX `IDX_pws_companyId` ON `product_warehouse_stocks` (`companyId`)');
    await q.query(
      'ALTER TABLE `product_warehouse_stocks` ADD CONSTRAINT `FK_pws_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `product_warehouse_stocks` ADD CONSTRAINT `FK_pws_product` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `product_warehouse_stocks` ADD CONSTRAINT `FK_pws_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );

    // Companies holding stock without any active warehouse get a default one.
    const orphans: { companyId: string }[] = await q.query(
      'SELECT DISTINCT p.companyId FROM `products` p WHERE p.quantity > 0 AND NOT EXISTS ' +
        '(SELECT 1 FROM `warehouses` w WHERE w.companyId = p.companyId AND w.isDeleted = 0)',
    );
    for (const o of orphans) {
      await q.query(
        "INSERT INTO `warehouses` (`id`, `companyId`, `name`, `code`, `isDeleted`) VALUES (UUID(), ?, 'Merkez Depo', 'WH-001', 0)",
        [o.companyId],
      );
    }

    // Copy JSON quantities (by warehouse name) into the table.
    const products: { id: string; companyId: string; quantity: number; warehouses: any }[] = await q.query(
      'SELECT id, companyId, quantity, warehouses FROM `products`',
    );
    const warehouses: { id: string; companyId: string; name: string; isDeleted: number; createdAt: Date }[] = await q.query(
      'SELECT id, companyId, name, isDeleted, createdAt FROM `warehouses` ORDER BY createdAt ASC, name ASC',
    );
    const reconciled: string[] = [];
    for (const p of products) {
      const json = typeof p.warehouses === 'string' ? JSON.parse(p.warehouses || '{}') : p.warehouses || {};
      const own = warehouses.filter((w) => w.companyId === p.companyId);
      for (const [name, qty] of Object.entries(json || {})) {
        const wh = own.find((w) => w.name === name);
        const n = Math.max(0, Math.floor(Number(qty) || 0));
        if (!wh) continue;
        await q.query(
          'INSERT INTO `product_warehouse_stocks` (`id`, `companyId`, `productId`, `warehouseId`, `quantity`) VALUES (UUID(), ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE `quantity` = VALUES(`quantity`)',
          [p.companyId, p.id, wh.id, n],
        );
      }

      // Reconcile SUM(rows) with products.quantity.
      const rows: { id: string; warehouseId: string; quantity: number }[] = await q.query(
        'SELECT id, warehouseId, quantity FROM `product_warehouse_stocks` WHERE productId = ?',
        [p.id],
      );
      const sum = rows.reduce((s, r) => s + Number(r.quantity), 0);
      let diff = Number(p.quantity) - sum;
      if (diff === 0) continue;
      reconciled.push(`${p.id}: rows=${sum} product=${p.quantity}`);
      const active = own.filter((w) => !w.isDeleted);
      if (diff > 0) {
        const target = active[0] || own[0];
        if (!target) continue;
        await q.query(
          'INSERT INTO `product_warehouse_stocks` (`id`, `companyId`, `productId`, `warehouseId`, `quantity`) VALUES (UUID(), ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE `quantity` = `quantity` + VALUES(`quantity`)',
          [p.companyId, p.id, target.id, diff],
        );
      } else {
        for (const r of rows.sort((a, b) => Number(b.quantity) - Number(a.quantity))) {
          if (diff >= 0) break;
          const take = Math.min(Number(r.quantity), -diff);
          await q.query('UPDATE `product_warehouse_stocks` SET quantity = quantity - ? WHERE id = ?', [take, r.id]);
          diff += take;
        }
      }
    }
    if (reconciled.length) {
      // eslint-disable-next-line no-console
      console.log(`[migration] reconciled warehouse stock for ${reconciled.length} product(s):\n  ${reconciled.join('\n  ')}`);
    }
    // Hard guarantee: products.quantity == SUM(rows).
    await q.query(
      'UPDATE `products` p LEFT JOIN (SELECT productId, SUM(quantity) AS total FROM `product_warehouse_stocks` GROUP BY productId) s ' +
        'ON s.productId = p.id SET p.quantity = COALESCE(s.total, 0)',
    );

    await q.query('ALTER TABLE `products` DROP COLUMN `warehouses`');
  }

  public async down(q: QueryRunner): Promise<void> {
    // Rebuild the JSON column from the table.
    await q.query('ALTER TABLE `products` ADD `warehouses` json NULL');
    await q.query(
      'UPDATE `products` p JOIN (SELECT s.productId, JSON_OBJECTAGG(w.name, s.quantity) AS j FROM `product_warehouse_stocks` s ' +
        'JOIN `warehouses` w ON w.id = s.warehouseId GROUP BY s.productId) x ON x.productId = p.id SET p.warehouses = x.j',
    );
    for (const fk of ['FK_pws_company', 'FK_pws_product', 'FK_pws_warehouse']) {
      await q.query(`ALTER TABLE \`product_warehouse_stocks\` DROP FOREIGN KEY \`${fk}\``);
    }
    await q.query('DROP INDEX `IDX_pws_companyId` ON `product_warehouse_stocks`');
    await q.query('ALTER TABLE `product_warehouse_stocks` DROP COLUMN `companyId`');
    await q.query(
      'ALTER TABLE `product_warehouse_stocks` ADD CONSTRAINT `FK_pws_product` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE',
    );
    await q.query(
      'ALTER TABLE `product_warehouse_stocks` ADD CONSTRAINT `FK_pws_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE',
    );

    await q.query('ALTER TABLE `stock_movements` DROP FOREIGN KEY `FK_stock_movements_warehouse`');
    await q.query('DROP INDEX `IDX_stock_movements_warehouseId` ON `stock_movements`');
    await q.query('ALTER TABLE `stock_movements` DROP COLUMN `warehouseId`');

    for (const t of ['order_items', 'purchase_order_items']) {
      // Restore gross legacy prices so totals stay equal to price * qty.
      await q.query(`UPDATE \`${t}\` SET price = ROUND(lineTotal / GREATEST(quantity, 1), 2)`);
      await q.query(`ALTER TABLE \`${t}\` DROP COLUMN \`unitPrice\`, DROP COLUMN \`taxRate\`, DROP COLUMN \`taxAmount\`, DROP COLUMN \`lineTotal\``);
    }
    await q.query('ALTER TABLE `purchase_orders` DROP COLUMN `warehouseId`');
    await q.query('ALTER TABLE `orders` DROP FOREIGN KEY `FK_orders_customer`');
    await q.query('DROP INDEX `IDX_orders_customerId` ON `orders`');
    await q.query('ALTER TABLE `orders` DROP COLUMN `customerId`');
    for (const t of ['orders', 'purchase_orders']) {
      await q.query(
        `ALTER TABLE \`${t}\` DROP COLUMN \`currency\`, DROP COLUMN \`exchangeRate\`, DROP COLUMN \`subtotal\`, DROP COLUMN \`taxTotal\`, DROP COLUMN \`grandTotal\``,
      );
      await q.query(`ALTER TABLE \`${t}\` MODIFY \`totalAmount\` decimal(10,2) NOT NULL DEFAULT '0.00'`);
    }
    await q.query('ALTER TABLE `products` DROP FOREIGN KEY `FK_products_tax_rate`');
    await q.query('DROP INDEX `IDX_products_taxRateId` ON `products`');
    await q.query('ALTER TABLE `products` DROP COLUMN `taxRateId`, DROP COLUMN `currency`');
    await q.query('ALTER TABLE `companies` DROP COLUMN `pricesIncludeTax`');
    await q.query('DROP TABLE `exchange_rates`');
    await q.query('DROP TABLE `tax_rates`');
    await q.query('DROP TABLE `customers`');
  }
}
