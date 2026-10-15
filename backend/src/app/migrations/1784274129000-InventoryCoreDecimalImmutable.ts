import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS } from '../shared/legal/legal-parameter-seeds';
import { dateKeyInZone, DEFAULT_TIMEZONE, isValidTckn, isValidVkn, STANDARD_UNIT_DECIMALS, toGtin14 } from '../shared/tr';
import { GENESIS_HASH, movementHash, toSecond } from '../shared/inventory/movement-hash';
import { dropImmutabilityTriggers, ensureImmutabilityTriggers } from '../shared/inventory/immutability-triggers';
import { convertQuantityColumnsToDecimal, INT_QUANTITY_DDL, QUANTITY_COLUMNS } from '../shared/inventory/decimal-quantities';

/**
 * WP2 - inventory core: decimal quantities, unit codes, immutable movements, document dates.
 *
 *  A. legal_parameters: UNECE_STANDARD_UNIT_MAP (low confidence for pack / pallet), VUK219_RECORD_DAYS.
 *  B. units: decimals (0-3), uneceCode, allowsFraction. Standard units get the code from the
 *     legal parameter and the default precision; custom units keep uneceCode NULL (flagged in the UI).
 *  C. DecimalQuantities: every stock quantity column int -> DECIMAL(18,4) (values unchanged).
 *  D. warehouses: type / isSellable / ownership. products: regulatoryCategory, inventoryClass,
 *     gtin14 (backfilled from a valid EAN/GTIN barcode). companies: enabledComplianceModules,
 *     adjustmentApprovalThreshold.
 *  E. stock_movements: transactionDate, document fields, counterpartyTaxId, reasonCode, snapshots,
 *     actor ids, reversesMovementId and the per-company SHA-256 chain (sequenceNo / prevHash / hash),
 *     backfilled from the referenced documents; `stock_movement_chains` holds each chain head.
 *  F. FKs of stock_movements -> RESTRICT (company, product, warehouse).
 *  G. stock_movement_attachments, stock_adjustment_requests (maker-checker).
 *  H. Triggers: stock_movements append-only, completed stock_counts frozen, received POs undeletable.
 */
const MOVEMENT_COLUMNS: [string, string][] = [
  ['transactionDate', 'datetime NULL'],
  ['documentType', 'varchar(30) NULL'],
  ['documentNo', 'varchar(50) NULL'],
  ['documentDate', 'date NULL'],
  ['counterpartyTaxId', 'varchar(20) NULL'],
  ['reasonCode', 'varchar(30) NULL'],
  ['sequenceNo', 'bigint NULL'],
  ['prevHash', 'char(64) NULL'],
  ['hash', 'char(64) NULL'],
  ['reversesMovementId', 'varchar(36) NULL'],
  ['performedByUserId', 'varchar(36) NULL'],
  ['performedViaApiKeyId', 'varchar(36) NULL'],
  ['productSku', 'varchar(255) NULL'],
  ['warehouseName', 'varchar(255) NULL'],
  ['unitCode', 'varchar(20) NULL'],
];

/**
 * Legacy movement -> reason code.
 *  - RETURN rows from an order cancellation put a not-yet-delivered sale back: CORRECTION
 *    (the live cancellation flow books the same); customer returns keep RETURN.
 *  - Manual IN rows: only the initial stock entered when a product was created (or seeded)
 *    is an opening balance; any other undocumented stock-in is UNCLASSIFIED_197_397.
 */
const OPENING_NOTE = /(oluşturma|initial|demo lot|açılış|devir|toplu|bulk)/i;
const CANCEL_NOTE = /(iptal|cancel)/i;

function legacyReason(type: string, referenceType: string | null, qty: number, note: string | null): string {
  switch (type) {
    case 'ORDER':
      return 'SALE';
    case 'RETURN':
      return CANCEL_NOTE.test(note || '') ? 'CORRECTION' : 'RETURN';
    case 'TRANSFER_IN':
    case 'TRANSFER_OUT':
      return 'TRANSFER';
    case 'IN':
      if (referenceType === 'purchase_order') return 'PURCHASE';
      return OPENING_NOTE.test(note || '') ? 'OPENING' : 'UNCLASSIFIED_197_397';
    case 'ADJUSTMENT':
      if (referenceType === 'stock_count') return qty >= 0 ? 'COUNT_SURPLUS' : 'COUNT_SHORTAGE';
      return 'UNCLASSIFIED_197_397';
    default:
      return 'UNCLASSIFIED_197_397';
  }
}

const validTaxId = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return isValidVkn(s) || isValidTckn(s) ? s : null;
};

export class InventoryCoreDecimalImmutable1784274129000 implements MigrationInterface {
  name = 'InventoryCoreDecimalImmutable1784274129000';

  public async up(q: QueryRunner): Promise<void> {
    // A. legal parameters
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => x.key === 'UNECE_STANDARD_UNIT_MAP' || x.key === 'VUK219_RECORD_DAYS')) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration'],
      );
    }
    const unece = (LEGAL_PARAMETER_SEEDS.find((x) => x.key === 'UNECE_STANDARD_UNIT_MAP')?.value || {}) as Record<string, string>;

    // B. units
    await q.query("ALTER TABLE `units` ADD `decimals` tinyint NOT NULL DEFAULT '0', ADD `uneceCode` varchar(3) NULL, ADD `allowsFraction` tinyint NOT NULL DEFAULT '0'");
    for (const [code, decimals] of Object.entries(STANDARD_UNIT_DECIMALS)) {
      await q.query('UPDATE `units` SET `decimals` = ?, `allowsFraction` = ?, `uneceCode` = ? WHERE `code` = ? AND `isStandard` = 1', [
        decimals,
        decimals > 0 ? 1 : 0,
        unece[code] ?? null,
        code,
      ]);
    }

    // C. decimal quantities
    await convertQuantityColumnsToDecimal(q);

    // D. warehouses / products / companies
    await q.query(
      "ALTER TABLE `warehouses` ADD `type` varchar(20) NOT NULL DEFAULT 'NORMAL', ADD `isSellable` tinyint NOT NULL DEFAULT 1, ADD `ownership` varchar(20) NOT NULL DEFAULT 'OWN'",
    );
    await q.query(
      "ALTER TABLE `products` ADD `regulatoryCategory` varchar(30) NOT NULL DEFAULT 'none', ADD `inventoryClass` varchar(30) NOT NULL DEFAULT 'TICARI_MAL_153', ADD `gtin14` varchar(14) NULL",
    );
    for (const p of await q.query('SELECT `id`, `barcode` FROM `products` WHERE `barcode` IS NOT NULL')) {
      const gtin = toGtin14(p.barcode);
      if (gtin) await q.query('UPDATE `products` SET `gtin14` = ? WHERE `id` = ?', [gtin, p.id]);
    }
    await q.query('ALTER TABLE `companies` ADD `enabledComplianceModules` text NULL, ADD `adjustmentApprovalThreshold` decimal(18,2) NULL');

    // E. stock movement columns + backfill + hash chain
    await q.query(`ALTER TABLE \`stock_movements\` ${MOVEMENT_COLUMNS.map(([c, t]) => `ADD \`${c}\` ${t}`).join(', ')}`);
    await q.query(
      'CREATE TABLE `stock_movement_chains` (`companyId` varchar(36) NOT NULL, `lastSequenceNo` bigint NOT NULL DEFAULT 0, `lastHash` char(64) NOT NULL, ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`companyId`)) ENGINE=InnoDB',
    );
    await this.backfillMovements(q);
    await q.query(
      'ALTER TABLE `stock_movements` MODIFY `transactionDate` datetime NOT NULL, MODIFY `reasonCode` varchar(30) NOT NULL, ' +
        'MODIFY `sequenceNo` bigint NOT NULL, MODIFY `prevHash` char(64) NOT NULL, MODIFY `hash` char(64) NOT NULL',
    );
    await q.query('CREATE UNIQUE INDEX `UQ_stock_movements_company_seq` ON `stock_movements` (`companyId`, `sequenceNo`)');
    await q.query('CREATE INDEX `IDX_stock_movements_company_txdate` ON `stock_movements` (`companyId`, `transactionDate`)');
    await q.query('CREATE UNIQUE INDEX `UQ_stock_movements_reverses` ON `stock_movements` (`reversesMovementId`)');
    await q.query('CREATE INDEX `IDX_stock_movements_reasonCode` ON `stock_movements` (`reasonCode`)');

    // F. FKs -> RESTRICT
    const fks: { name: string }[] = await q.query(
      "SELECT CONSTRAINT_NAME AS name FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements'",
    );
    for (const fk of fks) await q.query(`ALTER TABLE \`stock_movements\` DROP FOREIGN KEY \`${fk.name}\``);
    await q.query(
      'ALTER TABLE `stock_movements` ' +
        'ADD CONSTRAINT `FK_stock_movements_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION, ' +
        'ADD CONSTRAINT `FK_stock_movements_product` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION, ' +
        'ADD CONSTRAINT `FK_stock_movements_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `stock_movement_chains` ADD CONSTRAINT `FK_stock_movement_chains_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );

    // G. attachments + adjustment requests
    await q.query(
      'CREATE TABLE `stock_adjustment_requests` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `status` varchar(20) NOT NULL DEFAULT \'PENDING\', ' +
        '`productId` varchar(36) NOT NULL, `productName` varchar(255) NOT NULL, `warehouseId` varchar(36) NULL, `quantityDelta` decimal(18,4) NOT NULL, ' +
        '`estimatedValue` decimal(18,2) NOT NULL DEFAULT \'0.00\', `currency` varchar(3) NOT NULL, `threshold` decimal(18,2) NOT NULL DEFAULT \'0.00\', `payload` text NOT NULL, ' +
        '`requestedBy` varchar(100) NOT NULL, `requestedByUserId` varchar(36) NULL, `decidedBy` varchar(100) NULL, `decidedByUserId` varchar(36) NULL, ' +
        '`decisionNote` varchar(500) NULL, `decidedAt` datetime NULL, `movementIds` text NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query('CREATE INDEX `IDX_stock_adjustment_requests_company_status` ON `stock_adjustment_requests` (`companyId`, `status`)');
    await q.query(
      'ALTER TABLE `stock_adjustment_requests` ADD CONSTRAINT `FK_stock_adjustment_requests_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await q.query(
      'CREATE TABLE `stock_movement_attachments` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `movementId` varchar(36) NULL, ' +
        '`adjustmentRequestId` varchar(36) NULL, `fileName` varchar(255) NOT NULL, `mimeType` varchar(100) NOT NULL, `size` int NOT NULL, `sha256` char(64) NOT NULL, ' +
        '`content` mediumblob NOT NULL, `uploadedBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query('CREATE INDEX `IDX_sm_attachments_company` ON `stock_movement_attachments` (`companyId`)');
    await q.query('CREATE INDEX `IDX_sm_attachments_movement` ON `stock_movement_attachments` (`movementId`)');
    await q.query('CREATE INDEX `IDX_sm_attachments_request` ON `stock_movement_attachments` (`adjustmentRequestId`)');
    await q.query(
      'ALTER TABLE `stock_movement_attachments` ' +
        'ADD CONSTRAINT `FK_sm_attachments_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION, ' +
        'ADD CONSTRAINT `FK_sm_attachments_movement` FOREIGN KEY (`movementId`) REFERENCES `stock_movements`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );

    // H. triggers
    await ensureImmutabilityTriggers((sql, params) => q.query(sql, params));
  }

  /** Fills the new movement columns from the documents they reference and builds each company's chain. */
  private async backfillMovements(q: QueryRunner): Promise<void> {
    const companies: { id: string; timezone: string | null }[] = await q.query('SELECT `id`, `timezone` FROM `companies`');
    for (const c of companies) {
      const tz = c.timezone || DEFAULT_TIMEZONE;
      const users = new Map<string, string>(
        (await q.query('SELECT `id`, `username` FROM `users` WHERE `companyId` = ?', [c.id])).map((u: any) => [u.username, u.id]),
      );
      const orders = new Map<string, any>(
        (
          await q.query(
            'SELECT o.`orderNumber`, o.`date`, cu.`identityNumber` FROM `orders` o LEFT JOIN `customers` cu ON cu.`id` = o.`customerId` WHERE o.`companyId` = ?',
            [c.id],
          )
        ).map((o: any) => [o.orderNumber, o]),
      );
      const pos = new Map<string, any>(
        (
          await q.query(
            'SELECT po.`poNumber`, s.`identityNumber` FROM `purchase_orders` po LEFT JOIN `suppliers` s ON s.`id` = po.`supplierId` WHERE po.`companyId` = ?',
            [c.id],
          )
        ).map((p: any) => [p.poNumber, p]),
      );
      const counts = new Map<string, any>(
        (await q.query('SELECT `id`, `countNumber`, `completedAt` FROM `stock_counts` WHERE `companyId` = ?', [c.id])).map((s: any) => [s.id, s]),
      );
      const rows: any[] = await q.query(
        'SELECT sm.*, p.`sku` AS _sku, COALESCE(u.`uneceCode`, p.`unit`) AS _unit, w.`name` AS _wh FROM `stock_movements` sm ' +
          'LEFT JOIN `products` p ON p.`id` = sm.`productId` LEFT JOIN `units` u ON u.`id` = p.`baseUnitId` LEFT JOIN `warehouses` w ON w.`id` = sm.`warehouseId` ' +
          'WHERE sm.`companyId` = ? ORDER BY sm.`createdAt` ASC, sm.`id` ASC',
        [c.id],
      );
      let prev = GENESIS_HASH;
      let seq = 0;
      for (const r of rows) {
        const qty = Number(r.quantity);
        let txDate: Date = r.createdAt;
        let documentType: string | null = null;
        let documentNo: string | null = null;
        let documentDate: string | null = null;
        let counterpartyTaxId: string | null = null;
        if (r.referenceType === 'order' && r.referenceId) {
          const o = orders.get(r.referenceId);
          documentType = 'ORDER';
          documentNo = r.referenceId;
          if (o) {
            if (r.type === 'ORDER' && o.date) txDate = o.date;
            documentDate = dateKeyInZone(new Date(o.date || r.createdAt), tz);
            counterpartyTaxId = validTaxId(o.identityNumber);
          }
        } else if (r.referenceType === 'purchase_order' && r.referenceId) {
          documentType = 'PURCHASE_ORDER';
          documentNo = r.referenceId;
          documentDate = dateKeyInZone(new Date(r.createdAt), tz);
          counterpartyTaxId = validTaxId(pos.get(r.referenceId)?.identityNumber);
        } else if (r.referenceType === 'stock_count' && r.referenceId) {
          const sc = counts.get(r.referenceId);
          documentType = 'STOCK_COUNT';
          documentNo = sc?.countNumber || r.referenceId;
          documentDate = dateKeyInZone(new Date(sc?.completedAt || r.createdAt), tz);
        } else if (r.referenceType === 'warehouse_transfer' && r.referenceId) {
          documentType = 'TRANSFER';
          documentNo = String(r.referenceId).slice(0, 50);
          documentDate = dateKeyInZone(new Date(r.createdAt), tz);
        }
        seq += 1;
        const row = {
          ...r,
          sequenceNo: seq,
          transactionDate: toSecond(txDate),
          documentType,
          documentNo,
          documentDate,
          counterpartyTaxId,
          reasonCode: legacyReason(r.type, r.referenceType, qty, r.note),
          reversesMovementId: null,
          performedByUserId: users.get(r.performedBy) ?? null,
          performedViaApiKeyId: null,
          productSku: r._sku ?? null,
          warehouseName: r._wh ?? null,
          unitCode: r._unit ?? null,
        };
        const hash = movementHash(prev, row);
        await q.query(
          'UPDATE `stock_movements` SET `transactionDate` = ?, `documentType` = ?, `documentNo` = ?, `documentDate` = ?, `counterpartyTaxId` = ?, ' +
            '`reasonCode` = ?, `sequenceNo` = ?, `prevHash` = ?, `hash` = ?, `performedByUserId` = ?, `productSku` = ?, `warehouseName` = ?, `unitCode` = ? WHERE `id` = ?',
          [
            row.transactionDate,
            documentType,
            documentNo,
            documentDate,
            counterpartyTaxId,
            row.reasonCode,
            seq,
            prev,
            hash,
            row.performedByUserId,
            row.productSku,
            row.warehouseName,
            row.unitCode,
            r.id,
          ],
        );
        prev = hash;
      }
      await q.query('INSERT INTO `stock_movement_chains` (`companyId`, `lastSequenceNo`, `lastHash`) VALUES (?, ?, ?)', [c.id, seq, prev]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await dropImmutabilityTriggers((sql, params) => q.query(sql, params));
    await q.query('DROP TABLE `stock_movement_attachments`');
    await q.query('DROP TABLE `stock_adjustment_requests`');
    await q.query('ALTER TABLE `stock_movement_chains` DROP FOREIGN KEY `FK_stock_movement_chains_company`');
    await q.query('DROP TABLE `stock_movement_chains`');
    await q.query(
      'ALTER TABLE `stock_movements` DROP FOREIGN KEY `FK_stock_movements_company`, DROP FOREIGN KEY `FK_stock_movements_product`, DROP FOREIGN KEY `FK_stock_movements_warehouse`',
    );
    await q.query(
      'ALTER TABLE `stock_movements` ' +
        'ADD CONSTRAINT `FK_stock_movements_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION, ' +
        'ADD CONSTRAINT `FK_a3acb59db67e977be45e382fc56` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION, ' +
        'ADD CONSTRAINT `FK_stock_movements_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    for (const idx of ['UQ_stock_movements_company_seq', 'IDX_stock_movements_company_txdate', 'UQ_stock_movements_reverses', 'IDX_stock_movements_reasonCode']) {
      await q.query(`DROP INDEX \`${idx}\` ON \`stock_movements\``);
    }
    // Movements written after this migration (e.g. REVERSAL rows) stay; their type is a plain varchar.
    await q.query(`ALTER TABLE \`stock_movements\` ${MOVEMENT_COLUMNS.map(([c]) => `DROP COLUMN \`${c}\``).join(', ')}`);
    await q.query('ALTER TABLE `companies` DROP COLUMN `adjustmentApprovalThreshold`, DROP COLUMN `enabledComplianceModules`');
    await q.query('ALTER TABLE `products` DROP COLUMN `gtin14`, DROP COLUMN `inventoryClass`, DROP COLUMN `regulatoryCategory`');
    await q.query('ALTER TABLE `warehouses` DROP COLUMN `ownership`, DROP COLUMN `isSellable`, DROP COLUMN `type`');
    // Fractional quantities are rounded when going back to int.
    for (const c of QUANTITY_COLUMNS) {
      const key = `${c.table}.${c.column}`;
      await q.query(`UPDATE \`${c.table}\` SET \`${c.column}\` = ROUND(\`${c.column}\`)`);
      await q.query(`ALTER TABLE \`${c.table}\` MODIFY \`${c.column}\` ${INT_QUANTITY_DDL[key] ?? 'int NOT NULL'}`);
    }
    await q.query('ALTER TABLE `units` DROP COLUMN `allowsFraction`, DROP COLUMN `uneceCode`, DROP COLUMN `decimals`');
    await q.query("DELETE FROM `legal_parameters` WHERE `key` IN ('UNECE_STANDARD_UNIT_MAP', 'VUK219_RECORD_DAYS') AND `createdBy` = 'migration'");
  }
}
