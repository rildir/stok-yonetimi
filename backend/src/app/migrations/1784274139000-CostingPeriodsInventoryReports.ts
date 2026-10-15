import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP6_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { IMMUTABILITY_TRIGGERS } from '../shared/inventory/immutability-triggers';
import { dropPeriodTriggers, ensurePeriodTriggers } from '../shared/inventory/period-triggers';
import { CostEvent, replay, roundCost, roundMoney } from '../shared/inventory/costing';
import { addDays, dateKeyInZone, fiscalYearPeriods, zonedDayStart, DEFAULT_TIMEZONE } from '../shared/tr';

/**
 * WP6 - costing, fiscal periods, period-end inventory, tax reports, food traceability (R46-R55,
 * R17, R21, R67-R71).
 *
 *  A. Schema: cost stamp on stock_movements (unitCost, totalCost, costCurrency, fxRate, fxDate,
 *     fxSource, costSource); stock_cost_layers; landed_cost_allocations; fiscal_periods +
 *     inventory_period_balances; disposal_batches; inventory_valuation_adjustments;
 *     account_mappings; journal_export_batches / _items; product_price_history; lot_genealogy;
 *     document_line_tracking; lot_recalls. New columns on companies (costing method, fiscal year
 *     start, count policy, VUK 278/A rate, TETT policy, GS1 prefix), products (expiry type /
 *     precision, wastage rate, warranty, export data, shelf-label net content), categories
 *     (wastage rate), stock_lots (production date, source, supplier lot, status), serial_numbers
 *     (sale / delivery trace) and stock_counts (tutanak fields).
 *  B. Triggers: no movement inside a CLOSED period; closing snapshots and exported journal
 *     batches are append-only.
 *  C. Legal parameters (WP6 keys, all with sourceRef).
 *  D. Backfill of existing data:
 *     - movement costs by replaying each product's ledger with the moving weighted average
 *       (purchases at the purchase-order net price incl. ÖTV / non-deductible VAT, converted
 *       with the order's rate; returns / reversals at the original cost; openings at the last
 *       purchase price, else 60 % of the sales price marked ESTIMATE). The stock_movements
 *       update trigger is lifted for this statement only; the v1 / v2 hashes do not cover
 *       the new columns, so the chain stays valid;
 *     - open cost layers for the stock on hand;
 *     - fiscal years (+ quarters) from the first movement's year to the current year;
 *     - lot source, food expiry type, price history, document_line_tracking from the JSON
 *       `tracking` columns of completed documents, serial sale trace;
 *     - stock-count tutanak fields of existing counts (trigger lifted the same way) and the
 *       company's last physical count date.
 */
const DDL_UP = [
  "CREATE TABLE `stock_cost_layers` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `productId` varchar(36) NOT NULL, `warehouseId` varchar(36) NULL, `lotId` varchar(36) NULL, `lotNumber` varchar(64) NULL, `movementId` varchar(36) NULL, `receivedAt` datetime NOT NULL, `qtyIn` decimal(18,4) NOT NULL, `qtyRemaining` decimal(18,4) NOT NULL, `unitCost` decimal(18,6) NOT NULL DEFAULT '0.000000', `source` varchar(20) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_stock_cost_layers_movement` (`movementId`), INDEX `IDX_stock_cost_layers_company_product` (`companyId`, `productId`, `receivedAt`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `landed_cost_allocations` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `goodsReceiptId` varchar(36) NULL, `receiptNo` varchar(30) NULL, `costType` varchar(30) NOT NULL, `basis` varchar(10) NOT NULL DEFAULT 'AMOUNT', `amount` decimal(18,2) NOT NULL DEFAULT '0.00', `currency` varchar(3) NOT NULL DEFAULT 'TRY', `originalAmount` decimal(18,2) NOT NULL DEFAULT '0.00', `fxRate` decimal(18,6) NOT NULL DEFAULT '1.000000', `documentNo` varchar(50) NULL, `documentDate` date NULL, `vendorName` varchar(255) NULL, `vendorTaxId` varchar(11) NULL, `toInventory` decimal(18,2) NOT NULL DEFAULT '0.00', `toCogs` decimal(18,2) NOT NULL DEFAULT '0.00', `lines` json NOT NULL, `note` varchar(500) NULL, `allocatedOn` date NOT NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_landed_cost_allocations_company_receipt` (`companyId`, `goodsReceiptId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `fiscal_periods` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `periodType` varchar(10) NOT NULL, `fiscalYear` int NOT NULL, `quarter` tinyint NOT NULL DEFAULT '0', `startDate` date NOT NULL, `endDate` date NOT NULL, `startAt` datetime NOT NULL, `endAt` datetime NOT NULL, `status` varchar(10) NOT NULL DEFAULT 'OPEN', `closedAt` datetime NULL, `closedBy` varchar(100) NULL, `closedByUserId` varchar(36) NULL, `snapshotHash` char(64) NULL, `reopenCount` int NOT NULL DEFAULT '0', `lastReopenReason` varchar(500) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_fiscal_periods_company_range` (`companyId`, `startAt`, `endAt`), UNIQUE INDEX `UQ_fiscal_periods_company_type_year_q` (`companyId`, `periodType`, `fiscalYear`, `quarter`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `inventory_period_balances` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `periodId` varchar(36) NOT NULL, `closingSeq` int NOT NULL DEFAULT '1', `productId` varchar(36) NOT NULL, `productName` varchar(255) NOT NULL, `productSku` varchar(255) NULL, `inventoryClass` varchar(30) NULL, `warehouseId` varchar(36) NULL, `lotNumber` varchar(64) NULL, `unitCode` varchar(20) NULL, `quantity` decimal(18,4) NOT NULL, `unitCost` decimal(18,6) NOT NULL DEFAULT '0.000000', `totalCost` decimal(18,2) NOT NULL DEFAULT '0.00', `costingMethod` varchar(30) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_inventory_period_balances_period` (`companyId`, `periodId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `disposal_batches` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `batchNo` varchar(30) NOT NULL, `basis` varchar(30) NOT NULL, `status` varchar(15) NOT NULL DEFAULT 'REQUESTED', `reason` varchar(500) NOT NULL, `disaster` tinyint NOT NULL DEFAULT 0, `warehouseId` varchar(36) NULL, `lines` json NOT NULL, `totalCost` decimal(18,2) NOT NULL DEFAULT '0.00', `applicationDate` date NULL, `applicationRef` varchar(100) NULL, `decisionDate` date NULL, `decisionRef` varchar(100) NULL, `decisionValue` decimal(18,2) NULL, `destroyedAt` datetime NULL, `destructionPlace` varchar(255) NULL, `witnesses` json NULL, `movementIds` json NULL, `requestedBy` varchar(100) NULL, `note` varchar(1000) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_disposal_batches_company_no` (`companyId`, `batchNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `inventory_valuation_adjustments` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `valuationDate` date NOT NULL, `productId` varchar(36) NOT NULL, `productName` varchar(255) NOT NULL, `inventoryClass` varchar(30) NULL, `quantity` decimal(18,4) NOT NULL, `unitCost` decimal(18,6) NOT NULL DEFAULT '0.000000', `costValue` decimal(18,2) NOT NULL DEFAULT '0.00', `emsalUnitPrice` decimal(18,6) NULL, `emsalMonth` varchar(7) NULL, `emsalBasis` varchar(8) NOT NULL, `monthSalesQty` decimal(18,4) NULL, `declinePct` decimal(7,4) NULL, `taxValue` decimal(18,2) NOT NULL DEFAULT '0.00', `bookValue` decimal(18,2) NOT NULL DEFAULT '0.00', `provision` decimal(18,2) NOT NULL DEFAULT '0.00', `requiresCommission` tinyint NOT NULL DEFAULT 0, `status` varchar(10) NOT NULL DEFAULT 'POSTED', `note` varchar(500) NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_inventory_valuation_adjustments_company_date` (`companyId`, `valuationDate`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `account_mappings` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `event` varchar(30) NOT NULL, `inventoryClass` varchar(30) NULL, `categoryId` varchar(36) NULL, `warehouseId` varchar(36) NULL, `debitAccount` varchar(30) NOT NULL, `creditAccount` varchar(30) NOT NULL, `enabled` tinyint NOT NULL DEFAULT 1, `description` varchar(255) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_account_mappings_company_event` (`companyId`, `event`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `journal_export_batches` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `exportBatchId` varchar(64) NOT NULL, `fromDate` date NOT NULL, `toDate` date NOT NULL, `voucherCount` int NOT NULL DEFAULT '0', `sourceCount` int NOT NULL DEFAULT '0', `debitTotal` decimal(18,2) NOT NULL DEFAULT '0.00', `creditTotal` decimal(18,2) NOT NULL DEFAULT '0.00', `contentSha256` char(64) NOT NULL, `content` longtext NOT NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_journal_export_batches_company_batch` (`companyId`, `exportBatchId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `journal_export_items` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `batchId` varchar(36) NOT NULL, `sourceType` varchar(15) NOT NULL, `sourceId` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_journal_export_items_company_source` (`companyId`, `sourceType`, `sourceId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `product_price_history` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `productId` varchar(36) NOT NULL, `price` decimal(18,2) NOT NULL, `currency` varchar(3) NOT NULL DEFAULT 'TRY', `priceInclTax` decimal(18,2) NULL, `validFrom` datetime NOT NULL, `source` varchar(20) NOT NULL DEFAULT 'PRODUCT_UPDATE', `changedBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_product_price_history_company_product` (`companyId`, `productId`, `validFrom`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `lot_genealogy` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `parentProductId` varchar(36) NOT NULL, `parentLotNumber` varchar(64) NOT NULL, `childProductId` varchar(36) NOT NULL, `childLotNumber` varchar(64) NOT NULL, `relation` varchar(10) NOT NULL, `quantity` decimal(18,4) NULL, `note` varchar(500) NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_lot_genealogy_company_child` (`companyId`, `childLotNumber`), INDEX `IDX_lot_genealogy_company_parent` (`companyId`, `parentLotNumber`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `document_line_tracking` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `sourceType` varchar(20) NOT NULL, `sourceId` varchar(36) NOT NULL, `documentType` varchar(30) NULL, `documentId` varchar(36) NULL, `documentNo` varchar(50) NULL, `documentDate` date NULL, `direction` varchar(3) NOT NULL, `productId` varchar(36) NOT NULL, `warehouseId` varchar(36) NULL, `lotId` varchar(36) NULL, `lotNumber` varchar(64) NOT NULL DEFAULT '', `expiryDate` date NULL, `serial` varchar(100) NOT NULL DEFAULT '', `quantity` decimal(18,4) NOT NULL, `partyType` varchar(10) NULL, `partyId` varchar(36) NULL, `partyName` varchar(255) NULL, `partyTaxId` varchar(20) NULL, `movementId` varchar(36) NULL, `occurredAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_document_line_tracking_source` (`companyId`, `sourceType`, `sourceId`, `lotNumber`, `serial`), INDEX `IDX_document_line_tracking_company_serial` (`companyId`, `serial`), INDEX `IDX_document_line_tracking_company_lot` (`companyId`, `productId`, `lotNumber`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `lot_recalls` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `recallNo` varchar(30) NOT NULL, `productId` varchar(36) NOT NULL, `productName` varchar(255) NOT NULL, `lotNumbers` json NOT NULL, `reason` varchar(500) NOT NULL, `isMock` tinyint NOT NULL DEFAULT 0, `status` varchar(10) NOT NULL DEFAULT 'OPEN', `affectedCustomers` json NOT NULL, `quantityShipped` decimal(18,4) NOT NULL DEFAULT '0.0000', `quantityInStock` decimal(18,4) NOT NULL DEFAULT '0.0000', `ministryNotifiedAt` datetime NULL, `ministryNotificationRef` varchar(100) NULL, `consumerNoticeAt` datetime NULL, `consumerNoticeChannel` varchar(255) NULL, `closedAt` datetime NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_lot_recalls_company_no` (`companyId`, `recallNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "ALTER TABLE `companies` ADD `costingMethod` varchar(30) NOT NULL DEFAULT 'WAVG_MOVING', ADD `costingMethodEffectiveFrom` date NULL, ADD `pendingCostingMethod` varchar(30) NULL, ADD `pendingCostingMethodFrom` date NULL, " +
    "ADD `postReceiptFxPolicy` varchar(10) NOT NULL DEFAULT 'EXPENSE', ADD `fiscalYearStartMonth` tinyint NOT NULL DEFAULT '1', ADD `physicalCountPolicy` varchar(30) NOT NULL DEFAULT 'ANNUAL', ADD `lastPhysicalCountDate` date NULL, " +
    "ADD `destructionRatePct` decimal(7,4) NULL, ADD `destructionRateValidUntil` date NULL, ADD `destructionRateRef` varchar(100) NULL, ADD `bestBeforeSalePolicy` varchar(10) NOT NULL DEFAULT 'BLOCK', ADD `gs1CompanyPrefix` varchar(12) NULL",
  'ALTER TABLE `categories` ADD `normalWastageRatePct` decimal(7,4) NULL, ADD `normalWastageSource` varchar(255) NULL',
  "ALTER TABLE `products` ADD `expiryType` varchar(12) NULL, ADD `expiryPrecision` varchar(5) NOT NULL DEFAULT 'day', ADD `perishable` tinyint NOT NULL DEFAULT 0, ADD `normalWastageRatePct` decimal(7,4) NULL, ADD `normalWastageSource` varchar(255) NULL, " +
    'ADD `warrantyRequired` tinyint NOT NULL DEFAULT 0, ADD `warrantyMonths` int NULL, ADD `originCountry` varchar(2) NULL, ADD `gtipCode` varchar(12) NULL, ADD `netWeightKg` decimal(18,4) NULL, ADD `labelNetQuantity` decimal(18,4) NULL, ADD `labelNetUnit` varchar(5) NULL',
  'ALTER TABLE `stock_movements` ADD `unitCost` decimal(18,6) NULL, ADD `totalCost` decimal(18,2) NULL, ADD `costCurrency` varchar(3) NULL, ADD `fxRate` decimal(18,6) NULL, ADD `fxDate` date NULL, ADD `fxSource` varchar(20) NULL, ADD `costSource` varchar(20) NULL',
  "ALTER TABLE `stock_counts` ADD `countType` varchar(15) NOT NULL DEFAULT 'PERIODIC', ADD `countDate` date NULL, ADD `asOfDate` date NULL, ADD `warehouseIds` text NULL, ADD `countedBy` text NULL, ADD `supervisedBy` varchar(100) NULL, " +
    'ADD `approvedBy` varchar(100) NULL, ADD `approvedByUserId` varchar(36) NULL, ADD `approvedAt` datetime NULL, ADD `documentNo` varchar(30) NULL, ADD `snapshotHash` char(64) NULL',
  "ALTER TABLE `stock_lots` ADD `productionDate` date NULL, ADD `lotSource` varchar(20) NULL, ADD `supplierLotNumber` varchar(64) NULL, ADD `status` varchar(10) NOT NULL DEFAULT 'active', ADD `statusReason` varchar(255) NULL",
  'ALTER TABLE `serial_numbers` ADD `soldOrderId` varchar(36) NULL, ADD `soldCustomerId` varchar(36) NULL, ADD `soldAt` datetime NULL, ADD `deliveredAt` datetime NULL',
];

const WP6_TABLES = [
  'stock_cost_layers',
  'landed_cost_allocations',
  'fiscal_periods',
  'inventory_period_balances',
  'disposal_batches',
  'inventory_valuation_adjustments',
  'account_mappings',
  'journal_export_batches',
  'product_price_history',
  'lot_genealogy',
  'document_line_tracking',
  'lot_recalls',
];

const MOVEMENT_UPDATE_TRIGGER = IMMUTABILITY_TRIGGERS.find((t) => t.name === 'trg_stock_movements_no_update')!;
const COUNT_UPDATE_TRIGGER = IMMUTABILITY_TRIGGERS.find((t) => t.name === 'trg_stock_counts_completed_no_update')!;
const TRANSFER_TYPES = ['TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT'];

const dayKey = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
const parseJson = <T>(v: unknown): T | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
};

interface TrackingEntryRow {
  warehouseId?: string;
  quantity?: number;
  lotId?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  serials?: string[];
}

export class CostingPeriodsInventoryReports1784274139000 implements MigrationInterface {
  name = 'CostingPeriodsInventoryReports1784274139000';

  public async up(q: QueryRunner): Promise<void> {
    // A
    for (const sql of DDL_UP) await q.query(sql);
    for (const t of WP6_TABLES) {
      await q.query(`ALTER TABLE \`${t}\` ADD CONSTRAINT \`FK_${t}_company\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    // C
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP6_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration'],
      );
    }

    // D
    const companies: { id: string; timezone: string | null; baseCurrency: string | null }[] = await q.query('SELECT `id`, `timezone`, `baseCurrency` FROM `companies`');
    const nowYear = new Date().getUTCFullYear();
    for (const c of companies) {
      const tz = c.timezone || DEFAULT_TIMEZONE;
      const first: { d: Date | string | null }[] = await q.query('SELECT MIN(`transactionDate`) AS d FROM `stock_movements` WHERE `companyId` = ?', [c.id]);
      const firstYear = first[0]?.d ? Number(dateKeyInZone(new Date(first[0].d as string), tz).slice(0, 4)) : nowYear;
      await q.query('UPDATE `companies` SET `costingMethodEffectiveFrom` = ? WHERE `id` = ?', [`${Math.min(firstYear, nowYear)}-01-01`, c.id]);
      for (let y = Math.min(firstYear, nowYear - 1); y <= nowYear; y++) {
        for (const p of fiscalYearPeriods(y, 1)) {
          await q.query(
            'INSERT IGNORE INTO `fiscal_periods` (`id`, `companyId`, `periodType`, `fiscalYear`, `quarter`, `startDate`, `endDate`, `startAt`, `endAt`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [randomUUID(), c.id, p.periodType, p.fiscalYear, p.quarter, p.startDate, p.endDate, zonedDayStart(p.startDate, tz), zonedDayStart(addDays(p.endDate, 1), tz), 'OPEN'],
          );
        }
      }
      await this.backfillCosts(q, c.id, c.baseCurrency || 'TRY');
    }

    // Food: STT unless stated otherwise; lot source from the first incoming movement of the lot.
    await q.query("UPDATE `products` SET `expiryType` = 'use_by' WHERE `regulatoryCategory` = 'food' AND `expiryType` IS NULL");
    await q.query(
      'UPDATE `stock_lots` l SET l.`lotSource` = (SELECT CASE m.`reasonCode` WHEN \'PURCHASE\' THEN \'PURCHASE\' WHEN \'TESELLUM_SURPLUS\' THEN \'PURCHASE\' WHEN \'OPENING\' THEN \'OPENING\' WHEN \'RETURN\' THEN \'RETURN\' WHEN \'TRANSFER\' THEN \'TRANSFER\' WHEN \'COUNT_SURPLUS\' THEN \'COUNT\' ELSE NULL END ' +
        'FROM `stock_movements` m WHERE m.`lotId` = l.`id` AND m.`quantity` > 0 ORDER BY m.`sequenceNo` ASC LIMIT 1) WHERE l.`lotSource` IS NULL',
    );

    // Price history: the current price from the product's last change.
    await q.query(
      "INSERT INTO `product_price_history` (`id`, `companyId`, `productId`, `price`, `currency`, `priceInclTax`, `validFrom`, `source`, `changedBy`) " +
        "SELECT UUID(), p.`companyId`, p.`id`, p.`price`, p.`currency`, NULL, p.`createdAt`, 'BACKFILL', 'migration' FROM `products` p",
    );

    await this.backfillTracking(q);

    // Stock-count tutanak fields (completed counts are frozen by trigger: lifted for this statement).
    await q.query('DROP TRIGGER IF EXISTS `trg_stock_counts_completed_no_update`');
    try {
      const counts: { id: string; companyId: string; startedAt: Date; completedAt: Date | null; countNumber: string; performedBy: string | null; status: string }[] = await q.query(
        'SELECT sc.`id`, sc.`companyId`, sc.`startedAt`, sc.`completedAt`, sc.`countNumber`, sc.`performedBy`, sc.`status` FROM `stock_counts` sc',
      );
      for (const sc of counts) {
        const tzRow: { timezone: string | null }[] = await q.query('SELECT `timezone` FROM `companies` WHERE `id` = ?', [sc.companyId]);
        const tz = tzRow[0]?.timezone || DEFAULT_TIMEZONE;
        const d = dateKeyInZone(new Date(sc.completedAt || sc.startedAt), tz);
        await q.query(
          'UPDATE `stock_counts` SET `countDate` = ?, `asOfDate` = ?, `documentNo` = `countNumber`, `approvedBy` = IF(`status` = \'Completed\', `performedBy`, NULL), `approvedAt` = IF(`status` = \'Completed\', `completedAt`, NULL) WHERE `id` = ?',
          [d, d, sc.id],
        );
      }
    } finally {
      await q.query(COUNT_UPDATE_TRIGGER.sql);
    }
    await q.query(
      "UPDATE `companies` c SET c.`lastPhysicalCountDate` = (SELECT MAX(sc.`countDate`) FROM `stock_counts` sc WHERE sc.`companyId` = c.`id` AND sc.`status` = 'Completed')",
    );

    // B
    await ensurePeriodTriggers((sql, params) => q.query(sql, params));
  }

  /** Movement costs + open layers of one company (moving weighted average replay per product). */
  private async backfillCosts(q: QueryRunner, companyId: string, baseCurrency: string): Promise<void> {
    const rows: {
      id: string; productId: string; type: string; reasonCode: string; quantity: string; lotId: string | null; lotNumber: string | null; warehouseId: string | null;
      transactionDate: Date; referenceType: string | null; referenceId: string | null; reversesMovementId: string | null;
    }[] = await q.query(
      'SELECT `id`, `productId`, `type`, `reasonCode`, `quantity`, `lotId`, `lotNumber`, `warehouseId`, `transactionDate`, `referenceType`, `referenceId`, `reversesMovementId` ' +
        'FROM `stock_movements` WHERE `companyId` = ? ORDER BY `transactionDate` ASC, `sequenceNo` ASC',
      [companyId],
    );
    // Purchase prices per (PO number, product): net + ÖTV + non-deductible VAT per base unit, in the base currency.
    const po: { poNumber: string; productId: string; netAmount: string; otvAmount: string; taxAmount: string; deductibleVat: string | null; quantity: string; exchangeRate: string; currency: string; exchangeRateDate: string | Date | null; exchangeRateSource: string | null; createdAt: Date }[] =
      await q.query(
        'SELECT po.`poNumber`, poi.`productId`, poi.`netAmount`, poi.`otvAmount`, poi.`taxAmount`, poi.`deductibleVat`, poi.`quantity`, po.`exchangeRate`, po.`currency`, po.`exchangeRateDate`, po.`exchangeRateSource`, po.`createdAt` ' +
          'FROM `purchase_orders` po JOIN `purchase_order_items` poi ON poi.`purchaseOrderId` = po.`id` WHERE po.`companyId` = ? ORDER BY po.`createdAt` ASC',
        [companyId],
      );
    const priceOf = (r: (typeof po)[number]) => {
      const qty = Number(r.quantity) || 0;
      if (!(qty > 0)) return null;
      const nonDeductible = r.deductibleVat === null || r.deductibleVat === undefined ? 0 : Math.max(0, Number(r.taxAmount) - Number(r.deductibleVat));
      return roundCost(((Number(r.netAmount) + Number(r.otvAmount || 0) + nonDeductible) / qty) * (Number(r.exchangeRate) || 1));
    };
    const poPrice = new Map<string, { unit: number; row: (typeof po)[number] }>();
    const lastPrice = new Map<string, number>();
    for (const r of po) {
      const unit = priceOf(r);
      if (unit === null) continue;
      poPrice.set(`${r.poNumber}|${r.productId}`, { unit, row: r });
      lastPrice.set(r.productId, unit);
    }
    const products: { id: string; price: string; quantity: string }[] = await q.query('SELECT `id`, `price`, `quantity` FROM `products` WHERE `companyId` = ?', [companyId]);
    const stockQty = new Map(products.map((p) => [p.id, Number(p.quantity) || 0]));
    const salesPrice = new Map(products.map((p) => [p.id, Number(p.price) || 0]));
    const byProduct = new Map<string, typeof rows>();
    for (const p of products) if (Number(p.quantity) > 0) byProduct.set(p.id, []);
    for (const r of rows) byProduct.set(r.productId, [...(byProduct.get(r.productId) || []), r]);

    await q.query('DROP TRIGGER IF EXISTS `trg_stock_movements_no_update`');
    try {
      for (const [productId, list] of byProduct) {
        const estimate = lastPrice.get(productId) ?? roundCost((salesPrice.get(productId) || 0) * 0.6);
        const meta = new Map<string, { source: string; fx?: (typeof po)[number] | null }>();
        const byId = new Map(list.map((r) => [r.id, r]));
        const events: CostEvent[] = [];
        // Pass 1: decide incoming unit costs that do not depend on the replay.
        for (const r of list) {
          const qty = Number(r.quantity);
          const transfer = TRANSFER_TYPES.includes(r.type);
          let unitCost: number | null = null;
          if (!transfer && qty > 0) {
            const key = r.referenceType === 'purchase_order' && r.referenceId ? `${r.referenceId}|${productId}` : null;
            if ((r.reasonCode === 'PURCHASE' || r.reasonCode === 'TESELLUM_SURPLUS') && key && poPrice.has(key)) {
              unitCost = poPrice.get(key)!.unit;
              meta.set(r.id, { source: 'DOCUMENT', fx: poPrice.get(key)!.row });
            } else if (r.reasonCode === 'OPENING' || r.reasonCode === 'PURCHASE') {
              unitCost = estimate;
              meta.set(r.id, { source: 'ESTIMATE' });
            }
          }
          const original = r.reversesMovementId ? byId.get(r.reversesMovementId) : undefined;
          // Returns / reversals coming back in take the original movement's cost.
          const costFromId = !transfer && qty > 0 && original ? original.id : null;
          events.push({
            id: r.id,
            quantity: qty,
            at: r.transactionDate,
            lotNumber: r.lotNumber,
            unitCost: costFromId ? null : unitCost,
            transfer,
            costFromId,
            preferMovementId: qty < 0 && original && Number(original.quantity) > 0 ? original.id : null,
          });
          if (costFromId) meta.delete(r.id);
        }
        const result = replay('WAVG_MOVING', events, estimate);
        for (const r of list) {
          const c = result.costs.get(r.id);
          if (!c) continue;
          const m = meta.get(r.id);
          const source = m?.source ?? c.source;
          const fx = m?.fx;
          await q.query(
            'UPDATE `stock_movements` SET `unitCost` = ?, `totalCost` = ?, `costCurrency` = ?, `fxRate` = ?, `fxDate` = ?, `fxSource` = ?, `costSource` = ? WHERE `id` = ?',
            [
              roundCost(c.unitCost),
              roundMoney(c.totalCost),
              fx ? fx.currency : baseCurrency,
              fx ? roundCost(Number(fx.exchangeRate) || 1) : null,
              fx ? dayKey(fx.exchangeRateDate) : null,
              fx ? fx.exchangeRateSource || (fx.currency === baseCurrency ? 'BASE' : 'MANUAL') : null,
              source,
              r.id,
            ],
          );
        }
        // Anchor: the open layers must equal the stock on hand. Demo data seeded before the ledger
        // existed leaves differences: surplus layers are consumed oldest first, a shortfall gets an
        // opening (BACKFILL) layer at the current average / estimate.
        const onHand = Number(stockQty.get(productId) || 0);
        let layers = result.layers;
        let layerQty = layers.reduce((s, l) => s + l.qtyRemaining, 0);
        if (layerQty > onHand + 1e-9) {
          let excess = layerQty - onHand;
          for (const l of layers) {
            if (excess <= 1e-9) break;
            const take = Math.min(l.qtyRemaining, excess);
            l.qtyRemaining = Math.round((l.qtyRemaining - take) * 10000) / 10000;
            excess -= take;
          }
          layers = layers.filter((l) => l.qtyRemaining > 0);
          layerQty = onHand;
        }
        if (onHand > layerQty + 1e-9) {
          const avg = layerQty > 0 ? layers.reduce((s, l) => s + l.qtyRemaining * l.unitCost, 0) / layerQty : estimate;
          const qtyMissing = Math.round((onHand - layerQty) * 10000) / 10000;
          layers.unshift({ movementId: null, lotNumber: null, receivedAt: list[0]?.transactionDate || new Date(), qtyIn: qtyMissing, qtyRemaining: qtyMissing, unitCost: roundCost(avg) });
        }
        for (const l of layers) {
          const src = l.movementId ? byId.get(l.movementId) : undefined;
          await q.query(
            'INSERT INTO `stock_cost_layers` (`id`, `companyId`, `productId`, `warehouseId`, `lotId`, `lotNumber`, `movementId`, `receivedAt`, `qtyIn`, `qtyRemaining`, `unitCost`, `source`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [randomUUID(), companyId, productId, src?.warehouseId ?? null, src?.lotId ?? null, l.lotNumber ?? null, l.movementId ?? null, new Date(l.receivedAt), l.qtyIn, Math.round(l.qtyRemaining * 10000) / 10000, roundCost(l.unitCost), 'BACKFILL'],
          );
        }
      }
    } finally {
      await q.query(MOVEMENT_UPDATE_TRIGGER.sql);
    }
  }

  /** document_line_tracking from the JSON `tracking` of completed documents; serial sale trace. */
  private async backfillTracking(q: QueryRunner): Promise<void> {
    const insert = async (r: {
      companyId: string; sourceType: string; sourceId: string; documentType: string; documentId: string; documentNo: string | null; documentDate: string | null; direction: 'IN' | 'OUT';
      productId: string; partyType: string | null; partyId: string | null; partyName: string | null; partyTaxId: string | null; occurredAt: Date | null; tracking: TrackingEntryRow[] | null;
    }) => {
      const agg = new Map<string, { lotNumber: string; serial: string; quantity: number; warehouseId: string | null; lotId: string | null; expiryDate: string | null }>();
      for (const t of r.tracking || []) {
        const serials = Array.isArray(t.serials) ? t.serials : [];
        if (serials.length) {
          for (const s of serials) agg.set(`|${s}`, { lotNumber: t.lotNumber || '', serial: String(s).slice(0, 100), quantity: 1, warehouseId: t.warehouseId || null, lotId: t.lotId || null, expiryDate: dayKey(t.expiryDate) });
        } else if (t.lotNumber) {
          const k = `${t.lotNumber}|`;
          const prev = agg.get(k);
          if (prev) prev.quantity = Math.round((prev.quantity + Number(t.quantity || 0)) * 10000) / 10000;
          else agg.set(k, { lotNumber: String(t.lotNumber).slice(0, 64), serial: '', quantity: Number(t.quantity || 0), warehouseId: t.warehouseId || null, lotId: t.lotId || null, expiryDate: dayKey(t.expiryDate) });
        }
      }
      for (const a of agg.values()) {
        await q.query(
          'INSERT IGNORE INTO `document_line_tracking` (`id`, `companyId`, `sourceType`, `sourceId`, `documentType`, `documentId`, `documentNo`, `documentDate`, `direction`, `productId`, `warehouseId`, `lotId`, `lotNumber`, `expiryDate`, `serial`, `quantity`, `partyType`, `partyId`, `partyName`, `partyTaxId`, `movementId`, `occurredAt`) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
          [randomUUID(), r.companyId, r.sourceType, r.sourceId, r.documentType, r.documentId, r.documentNo, r.documentDate, r.direction, r.productId, a.warehouseId, a.lotId, a.lotNumber, a.expiryDate, a.serial, a.quantity, r.partyType, r.partyId, r.partyName ? String(r.partyName).slice(0, 255) : null, r.partyTaxId, r.occurredAt],
        );
      }
    };
    const snapName = (s: unknown) => parseJson<{ name?: string; legalName?: string; taxId?: string }>(s);

    // Orders that took stock at creation (stockMode 'order').
    const orderItems: any[] = await q.query(
      "SELECT oi.`id`, oi.`productId`, oi.`tracking`, o.`id` AS orderId, o.`companyId`, o.`orderNumber`, o.`date`, o.`customerId`, o.`customerName` FROM `order_items` oi JOIN `orders` o ON o.`id` = oi.`orderId` " +
        "WHERE oi.`tracking` IS NOT NULL AND o.`status` <> 'Cancelled' AND (o.`stockMode` IS NULL OR o.`stockMode` = 'order')",
    );
    for (const r of orderItems) {
      const tracking = parseJson<TrackingEntryRow[]>(r.tracking);
      await insert({ companyId: r.companyId, sourceType: 'order_item', sourceId: r.id, documentType: 'ORDER', documentId: r.orderId, documentNo: r.orderNumber, documentDate: dayKey(r.date), direction: 'OUT', productId: r.productId, partyType: 'CUSTOMER', partyId: r.customerId, partyName: r.customerName, partyTaxId: null, occurredAt: r.date, tracking });
      // Serial warranty trace
      for (const t of tracking || []) {
        if (Array.isArray(t.serials) && t.serials.length) {
          await q.query(
            `UPDATE \`serial_numbers\` SET \`soldOrderId\` = ?, \`soldCustomerId\` = ?, \`soldAt\` = ? WHERE \`companyId\` = ? AND \`productId\` = ? AND \`status\` = 'sold' AND \`serial\` IN (${t.serials.map(() => '?').join(', ')})`,
            [r.orderId, r.customerId, r.date, r.companyId, r.productId, ...t.serials],
          );
        }
      }
    }
    // Approved despatch advices (sale / sample / transfer legs).
    const despatchLines: any[] = await q.query(
      "SELECT dl.`id`, dl.`productId`, dl.`tracking`, d.`id` AS despatchId, d.`companyId`, d.`documentNo`, d.`issueDate`, d.`actualDespatchAt`, d.`customerId`, d.`supplierId`, d.`buyerSnapshot`, d.`purpose`, d.`orderId` FROM `despatch_lines` dl JOIN `despatches` d ON d.`id` = dl.`despatchId` " +
        "WHERE dl.`tracking` IS NOT NULL AND d.`status` NOT IN ('DRAFT', 'CANCELLED') AND d.`stockEffect` = 1",
    );
    for (const r of despatchLines) {
      const buyer = snapName(r.buyerSnapshot);
      const tracking = parseJson<TrackingEntryRow[]>(r.tracking);
      await insert({
        companyId: r.companyId, sourceType: 'despatch_line', sourceId: r.id, documentType: 'DESPATCH', documentId: r.despatchId, documentNo: r.documentNo, documentDate: dayKey(r.issueDate), direction: 'OUT', productId: r.productId,
        partyType: r.purpose === 'SALE' || r.purpose === 'SAMPLE' ? 'CUSTOMER' : null, partyId: r.customerId, partyName: buyer?.legalName || buyer?.name || null, partyTaxId: buyer?.taxId || null, occurredAt: r.actualDespatchAt, tracking,
      });
      for (const t of tracking || []) {
        if (r.purpose === 'SALE' && Array.isArray(t.serials) && t.serials.length) {
          await q.query(
            `UPDATE \`serial_numbers\` SET \`soldOrderId\` = COALESCE(\`soldOrderId\`, ?), \`soldCustomerId\` = COALESCE(\`soldCustomerId\`, ?), \`soldAt\` = COALESCE(\`soldAt\`, ?), \`deliveredAt\` = ? WHERE \`companyId\` = ? AND \`productId\` = ? AND \`serial\` IN (${t.serials.map(() => '?').join(', ')})`,
            [r.orderId, r.customerId, r.actualDespatchAt, r.actualDespatchAt, r.companyId, r.productId, ...t.serials],
          );
        }
      }
    }
    // Completed goods receipts.
    const receiptItems: any[] = await q.query(
      "SELECT gi.`id`, gi.`productId`, gi.`tracking`, g.`id` AS receiptId, g.`companyId`, g.`receiptNo`, g.`receivedAt`, g.`supplierId`, g.`supplierSnapshot`, g.`supplierDespatchNo`, g.`supplierDespatchDate` FROM `goods_receipt_items` gi JOIN `goods_receipts` g ON g.`id` = gi.`goodsReceiptId` " +
        "WHERE gi.`tracking` IS NOT NULL AND g.`status` = 'COMPLETED'",
    );
    for (const r of receiptItems) {
      const sup = snapName(r.supplierSnapshot);
      await insert({
        companyId: r.companyId, sourceType: 'goods_receipt_item', sourceId: r.id, documentType: 'GOODS_RECEIPT', documentId: r.receiptId, documentNo: r.supplierDespatchNo || r.receiptNo, documentDate: dayKey(r.supplierDespatchDate) || dayKey(r.receivedAt), direction: 'IN', productId: r.productId,
        partyType: 'SUPPLIER', partyId: r.supplierId, partyName: sup?.legalName || sup?.name || null, partyTaxId: sup?.taxId || null, occurredAt: r.receivedAt, tracking: parseJson<TrackingEntryRow[]>(r.tracking),
      });
    }
    // Completed returns.
    const returnItems: any[] = await q.query(
      "SELECT ri.`id`, ri.`productId`, ri.`tracking`, r.`id` AS returnId, r.`companyId`, r.`returnNo`, r.`completedAt`, r.`type`, r.`customerId`, r.`supplierId`, r.`partySnapshot` FROM `return_items` ri JOIN `returns` r ON r.`id` = ri.`returnId` " +
        "WHERE ri.`tracking` IS NOT NULL AND r.`status` = 'COMPLETED'",
    );
    for (const r of returnItems) {
      const party = snapName(r.partySnapshot);
      const purchase = r.type === 'PURCHASE_RETURN';
      await insert({
        companyId: r.companyId, sourceType: 'return_item', sourceId: r.id, documentType: 'RETURN', documentId: r.returnId, documentNo: r.returnNo, documentDate: dayKey(r.completedAt), direction: purchase ? 'OUT' : 'IN', productId: r.productId,
        partyType: purchase ? 'SUPPLIER' : 'CUSTOMER', partyId: purchase ? r.supplierId : r.customerId, partyName: party?.legalName || party?.name || null, partyTaxId: party?.taxId || null, occurredAt: r.completedAt, tracking: parseJson<TrackingEntryRow[]>(r.tracking),
      });
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await dropPeriodTriggers((sql, params) => q.query(sql, params));
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`createdBy\` IN ('migration', 'seed') AND \`key\` IN (${WP6_PARAMETER_KEYS.map(() => '?').join(', ')})`, WP6_PARAMETER_KEYS);
    for (const t of [...WP6_TABLES].reverse()) await q.query(`DROP TABLE IF EXISTS \`${t}\``);
    await q.query('DROP TABLE IF EXISTS `journal_export_items`');
    await q.query('ALTER TABLE `serial_numbers` DROP COLUMN `soldOrderId`, DROP COLUMN `soldCustomerId`, DROP COLUMN `soldAt`, DROP COLUMN `deliveredAt`');
    await q.query('ALTER TABLE `stock_lots` DROP COLUMN `productionDate`, DROP COLUMN `lotSource`, DROP COLUMN `supplierLotNumber`, DROP COLUMN `status`, DROP COLUMN `statusReason`');
    await q.query(
      'ALTER TABLE `stock_counts` DROP COLUMN `countType`, DROP COLUMN `countDate`, DROP COLUMN `asOfDate`, DROP COLUMN `warehouseIds`, DROP COLUMN `countedBy`, DROP COLUMN `supervisedBy`, DROP COLUMN `approvedBy`, DROP COLUMN `approvedByUserId`, DROP COLUMN `approvedAt`, DROP COLUMN `documentNo`, DROP COLUMN `snapshotHash`',
    );
    // Development only: dropping columns of stock_movements does not fire the row triggers.
    await q.query('ALTER TABLE `stock_movements` DROP COLUMN `unitCost`, DROP COLUMN `totalCost`, DROP COLUMN `costCurrency`, DROP COLUMN `fxRate`, DROP COLUMN `fxDate`, DROP COLUMN `fxSource`, DROP COLUMN `costSource`');
    await q.query(
      'ALTER TABLE `products` DROP COLUMN `expiryType`, DROP COLUMN `expiryPrecision`, DROP COLUMN `perishable`, DROP COLUMN `normalWastageRatePct`, DROP COLUMN `normalWastageSource`, DROP COLUMN `warrantyRequired`, DROP COLUMN `warrantyMonths`, DROP COLUMN `originCountry`, DROP COLUMN `gtipCode`, DROP COLUMN `netWeightKg`, DROP COLUMN `labelNetQuantity`, DROP COLUMN `labelNetUnit`',
    );
    await q.query('ALTER TABLE `categories` DROP COLUMN `normalWastageRatePct`, DROP COLUMN `normalWastageSource`');
    await q.query(
      'ALTER TABLE `companies` DROP COLUMN `costingMethod`, DROP COLUMN `costingMethodEffectiveFrom`, DROP COLUMN `pendingCostingMethod`, DROP COLUMN `pendingCostingMethodFrom`, DROP COLUMN `postReceiptFxPolicy`, DROP COLUMN `fiscalYearStartMonth`, DROP COLUMN `physicalCountPolicy`, DROP COLUMN `lastPhysicalCountDate`, DROP COLUMN `destructionRatePct`, DROP COLUMN `destructionRateValidUntil`, DROP COLUMN `destructionRateRef`, DROP COLUMN `bestBeforeSalePolicy`, DROP COLUMN `gs1CompanyPrefix`',
    );
  }
}
