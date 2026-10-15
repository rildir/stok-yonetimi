import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP3_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { taxCodeSeedStatements } from '../shared/finance/tax-code-seeds';
import { dateKeyInZone, DEFAULT_TIMEZONE } from '../shared/tr';

/**
 * WP3 - tax engine (rate catalog, exemptions, withholding, discounts, FX, tax point).
 *
 *  A. legal_parameters: KDV_RATE_CATALOG (18/8/1 until 09.07.2023, 20/10/1 since 10.07.2023),
 *     KDV_FX_RATE_DAY (low confidence), TCMB_FETCH_TIME.
 *  B. tax_rates: code, taxTypeCode (0015), kind, validFrom / validTo, isSystem, supersedesId.
 *     TR rows become catalog rows (KDV20 / KDV10 / KDV1, system) and each TR company gets the
 *     KDV0 EXEMPT row (0 % is an exemption, not a rate).
 *  C. Global, versioned code tables tax_exemption_codes / withholding_codes / otv_codes, seeded
 *     from GİB UBL-TR Kod Listeleri v1.31 (rows needing confirmation carry confidence / note).
 *  D. products: exemptionCode, withholdingCode, otvCode, otvRate; TR products without a rate
 *     get the company default explicitly (no silent fallback at pricing time any more).
 *     companies: isImporterOrOreProducer, fxAutoFetch (on for TR).
 *  E. exchange_rates: source, rateType, announcedAt, bulletinNo; unique key now per rate type.
 *  F. order / purchase order lines: unit price DECIMAL(18,6), entered price, gross, discounts,
 *     net, rate snapshot (taxRateId, taxCode), exemption / withholding / ÖTV fields; PO lines
 *     deductibleVat / reverseCharge. Backfilled from the stored amounts (no re-pricing).
 *  G. orders / purchase orders: discounts, charges total, withholding / payable totals,
 *     taxBreakdown, TRY equivalents, FX source / date, taxPointDate, invoice type hint,
 *     taxFrozenAt (completed orders and received POs are frozen); orders: shippedAt and sales
 *     channel fields; POs: import / customs declaration fields.
 *  H. order_charges (shipping / packaging / insurance / other).
 */
const LINE_TABLES = ['order_items', 'purchase_order_items'];
const DOC_TABLES = ['orders', 'purchase_orders'];

const LINE_ADD =
  'ADD `enteredUnitPrice` decimal(18,6) NULL, ' +
  "ADD `grossAmount` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `discountRate` decimal(5,2) NOT NULL DEFAULT '0.00', " +
  "ADD `discountAmount` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `documentDiscountShare` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `netAmount` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  'ADD `taxRateId` varchar(36) NULL, ' +
  'ADD `taxCode` varchar(4) NULL, ' +
  'ADD `exemptionCode` varchar(10) NULL, ' +
  'ADD `vatNotCollected` tinyint NOT NULL DEFAULT 0, ' +
  'ADD `withholdingCode` varchar(10) NULL, ' +
  'ADD `withholdingRate` decimal(5,2) NULL, ' +
  "ADD `withheldTaxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  'ADD `otvCode` varchar(10) NULL, ' +
  'ADD `otvRate` decimal(5,2) NULL, ' +
  "ADD `otvAmount` decimal(14,2) NOT NULL DEFAULT '0.00'";

const LINE_DROP = [
  'enteredUnitPrice', 'grossAmount', 'discountRate', 'discountAmount', 'documentDiscountShare', 'netAmount', 'taxRateId', 'taxCode',
  'exemptionCode', 'vatNotCollected', 'withholdingCode', 'withholdingRate', 'withheldTaxAmount', 'otvCode', 'otvRate', 'otvAmount',
];

const DOC_ADD =
  "ADD `documentDiscountAmount` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `documentDiscountEntered` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `chargesTotal` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `otvTotal` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `withheldTaxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `notCollectedTaxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `payableTotal` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  'ADD `taxBreakdown` text NULL, ' +
  "ADD `subtotalTry` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `taxTotalTry` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  "ADD `grandTotalTry` decimal(14,2) NOT NULL DEFAULT '0.00', " +
  'ADD `exchangeRateSource` varchar(10) NULL, ' +
  'ADD `exchangeRateDate` date NULL, ' +
  'ADD `taxPointDate` date NULL, ' +
  'ADD `invoiceTypeHint` varchar(20) NULL, ' +
  'ADD `taxFrozenAt` datetime NULL';

const DOC_DROP = [
  'documentDiscountAmount', 'documentDiscountEntered', 'chargesTotal', 'otvTotal', 'withheldTaxTotal', 'notCollectedTaxTotal', 'payableTotal',
  'taxBreakdown', 'subtotalTry', 'taxTotalTry', 'grandTotalTry', 'exchangeRateSource', 'exchangeRateDate', 'taxPointDate', 'invoiceTypeHint', 'taxFrozenAt',
];

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export class TaxEngine1784274132000 implements MigrationInterface {
  name = 'TaxEngine1784274132000';

  public async up(q: QueryRunner): Promise<void> {
    // A. legal parameters
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP3_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'migration'],
      );
    }

    // B. tax_rates
    await q.query(
      'ALTER TABLE `tax_rates` ADD `code` varchar(20) NULL, ' +
        "ADD `taxTypeCode` varchar(4) NOT NULL DEFAULT '0015', " +
        "ADD `kind` varchar(12) NOT NULL DEFAULT 'STANDARD', " +
        'ADD `validFrom` date NULL, ADD `validTo` date NULL, ' +
        'ADD `isSystem` tinyint NOT NULL DEFAULT 0, ADD `supersedesId` varchar(36) NULL',
    );
    const companies: { id: string; country: string | null; timezone: string | null; baseCurrency: string }[] = await q.query(
      'SELECT `id`, `country`, `timezone`, `baseCurrency` FROM `companies`',
    );
    const trCompanies = companies.filter((c) => (c.country || '').toUpperCase() === 'TR');
    for (const c of trCompanies) {
      // Catalog rates (20 / 10 / 1 since 10.07.2023) become system rows; other TR rates keep their row, flagged by code only.
      await q.query(
        "UPDATE `tax_rates` SET `code` = CONCAT('KDV', CAST(CAST(`rate` AS UNSIGNED) AS CHAR)), `isSystem` = 1, `validFrom` = '2023-07-10' " +
          'WHERE `companyId` = ? AND `rate` IN (20, 10, 1) AND `isDeleted` = 0',
        [c.id],
      );
      const exempt = await q.query("SELECT `id` FROM `tax_rates` WHERE `companyId` = ? AND `rate` = 0 AND `isDeleted` = 0", [c.id]);
      if (exempt.length) {
        await q.query("UPDATE `tax_rates` SET `kind` = 'EXEMPT', `code` = 'KDV0', `isSystem` = 1 WHERE `id` IN (?)", [exempt.map((r: { id: string }) => r.id)]);
      } else {
        await q.query(
          "INSERT INTO `tax_rates` (`id`, `companyId`, `name`, `rate`, `country`, `isDefault`, `isDeleted`, `code`, `taxTypeCode`, `kind`, `validFrom`, `isSystem`) VALUES (?, ?, 'KDV İstisna (%0)', 0, 'TR', 0, 0, 'KDV0', '0015', 'EXEMPT', NULL, 1)",
          [randomUUID(), c.id],
        );
      }
    }

    // C. global code tables
    const meta = "`validFrom` date NOT NULL, `validTo` date NULL, `codeListVersion` varchar(60) NOT NULL, `sourceRef` varchar(255) NOT NULL, " +
      "`confidence` varchar(10) NOT NULL DEFAULT 'high', `note` varchar(500) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)";
    await q.query(
      'CREATE TABLE `tax_exemption_codes` (`id` varchar(36) NOT NULL, `code` varchar(10) NOT NULL, `nameTr` varchar(500) NOT NULL, `nameEn` varchar(500) NOT NULL, ' +
        "`type` varchar(20) NOT NULL, `invoiceType` varchar(20) NOT NULL DEFAULT 'ISTISNA', `vatCalculatedNotCollected` tinyint NOT NULL DEFAULT 0, " +
        '`requiresForeignBuyer` tinyint NOT NULL DEFAULT 0, ' + meta + ', ' +
        'UNIQUE INDEX `UQ_tax_exemption_codes_code_from` (`code`, `validFrom`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `withholding_codes` (`id` varchar(36) NOT NULL, `code` varchar(10) NOT NULL, `nameTr` varchar(500) NOT NULL, `nameEn` varchar(500) NOT NULL, ' +
        '`numerator` decimal(4,1) NOT NULL, `denominator` int NOT NULL DEFAULT 10, `scope` varchar(10) NOT NULL, ' +
        '`requiresDesignatedBuyer` tinyint NOT NULL DEFAULT 0, `exemptForImporterOrOreProducer` tinyint NOT NULL DEFAULT 0, ' + meta + ', ' +
        'UNIQUE INDEX `UQ_withholding_codes_code_from` (`code`, `validFrom`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `otv_codes` (`id` varchar(36) NOT NULL, `code` varchar(10) NOT NULL, `nameTr` varchar(500) NOT NULL, `nameEn` varchar(500) NOT NULL, ' +
        '`list` varchar(10) NOT NULL, ' + meta + ', ' +
        'UNIQUE INDEX `UQ_otv_codes_code_from` (`code`, `validFrom`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    for (const st of taxCodeSeedStatements(randomUUID)) await q.query(st.sql, st.params);

    // D. products / companies
    await q.query('ALTER TABLE `products` ADD `exemptionCode` varchar(10) NULL, ADD `withholdingCode` varchar(10) NULL, ADD `otvCode` varchar(10) NULL, ADD `otvRate` decimal(5,2) NULL');
    for (const c of trCompanies) {
      // Products relied on the company default at pricing time; make it explicit (R12: no silent fallback).
      await q.query(
        'UPDATE `products` p JOIN `tax_rates` t ON t.`companyId` = p.`companyId` AND t.`isDefault` = 1 AND t.`isDeleted` = 0 ' +
          'SET p.`taxRateId` = t.`id` WHERE p.`companyId` = ? AND p.`taxRateId` IS NULL',
        [c.id],
      );
    }
    await q.query('ALTER TABLE `companies` ADD `isImporterOrOreProducer` tinyint NOT NULL DEFAULT 0, ADD `fxAutoFetch` tinyint NOT NULL DEFAULT 0');
    await q.query("UPDATE `companies` SET `fxAutoFetch` = 1 WHERE `country` = 'TR'");

    // E. exchange_rates
    await q.query(
      "ALTER TABLE `exchange_rates` ADD `source` varchar(10) NOT NULL DEFAULT 'MANUAL', ADD `rateType` varchar(20) NOT NULL DEFAULT 'FOREX_BUYING', " +
        'ADD `announcedAt` datetime NULL, ADD `bulletinNo` varchar(20) NULL',
    );
    // New key first: the old one also backs the companyId foreign key.
    await q.query('CREATE UNIQUE INDEX `UQ_exchange_rates_company_pair_date_type` ON `exchange_rates` (`companyId`, `baseCurrency`, `quoteCurrency`, `date`, `rateType`)');
    await q.query('DROP INDEX `UQ_exchange_rates_company_pair_date` ON `exchange_rates`');

    // F. lines
    for (const t of LINE_TABLES) {
      await q.query(`ALTER TABLE \`${t}\` MODIFY \`price\` decimal(18,6) NOT NULL, MODIFY \`unitPrice\` decimal(18,6) NOT NULL DEFAULT '0.000000', ${LINE_ADD}`);
      // Stored amounts stay as they are: net = lineTotal - VAT, no discounts existed.
      await q.query(
        `UPDATE \`${t}\` SET \`netAmount\` = \`lineTotal\` - \`taxAmount\`, \`grossAmount\` = \`lineTotal\` - \`taxAmount\`, \`taxCode\` = '0015'`,
      );
    }
    await q.query("ALTER TABLE `purchase_order_items` ADD `deductibleVat` decimal(14,2) NULL, ADD `reverseCharge` tinyint NOT NULL DEFAULT 0");
    await q.query('UPDATE `purchase_order_items` SET `deductibleVat` = `taxAmount`');
    // Rate snapshot: the company's (TR catalog) row with the same percentage.
    await q.query(
      'UPDATE `order_items` i JOIN `orders` o ON o.`id` = i.`orderId` ' +
        'JOIN `tax_rates` t ON t.`companyId` = o.`companyId` AND t.`rate` = i.`taxRate` AND t.`isDeleted` = 0 AND t.`supersedesId` IS NULL ' +
        'SET i.`taxRateId` = t.`id`',
    );
    await q.query(
      'UPDATE `purchase_order_items` i JOIN `purchase_orders` o ON o.`id` = i.`purchaseOrderId` ' +
        'JOIN `tax_rates` t ON t.`companyId` = o.`companyId` AND t.`rate` = i.`taxRate` AND t.`isDeleted` = 0 AND t.`supersedesId` IS NULL ' +
        'SET i.`taxRateId` = t.`id`',
    );

    // G. documents
    for (const t of DOC_TABLES) await q.query(`ALTER TABLE \`${t}\` ${DOC_ADD}`);
    await q.query(
      'ALTER TABLE `orders` ADD `shippedAt` datetime NULL, ADD `salesChannel` varchar(20) NULL, ADD `isDistanceSale` tinyint NOT NULL DEFAULT 0, ADD `channelOrderRef` varchar(100) NULL',
    );
    await q.query(
      'ALTER TABLE `purchase_orders` ADD `isImport` tinyint NOT NULL DEFAULT 0, ADD `customsDeclarationNo` varchar(30) NULL, ADD `customsDeclarationDate` date NULL, ' +
        'ADD `importVatAmount` decimal(14,2) NULL, ADD `nonDeductibleImportVat` decimal(14,2) NULL',
    );
    await q.query('UPDATE `purchase_orders` po JOIN `suppliers` s ON s.`id` = po.`supplierId` SET po.`isImport` = 1 WHERE s.`isForeign` = 1');

    const tzOf = new Map(companies.map((c) => [c.id, c.timezone || DEFAULT_TIMEZONE]));
    const baseOf = new Map(companies.map((c) => [c.id, (c.baseCurrency || 'TRY').toUpperCase()]));
    const backfill = async (docTable: string, itemTable: string, fk: string, dateCol: string, frozen: string[]) => {
      const docs: any[] = await q.query(
        `SELECT \`id\`, \`companyId\`, \`status\`, \`currency\`, \`exchangeRate\`, \`subtotal\`, \`taxTotal\`, \`grandTotal\`, \`${dateCol}\` AS d, \`updatedAt\` FROM \`${docTable}\``,
      );
      for (const d of docs) {
        const items: { taxRate: string; netAmount: string; taxAmount: string }[] = await q.query(
          `SELECT \`taxRate\`, \`netAmount\`, \`taxAmount\` FROM \`${itemTable}\` WHERE \`${fk}\` = ?`,
          [d.id],
        );
        const groups = new Map<number, { base: number; tax: number }>();
        for (const it of items) {
          const g = groups.get(Number(it.taxRate)) || { base: 0, tax: 0 };
          g.base = r2(g.base + Number(it.netAmount));
          g.tax = r2(g.tax + Number(it.taxAmount));
          groups.set(Number(it.taxRate), g);
        }
        const breakdown = [...groups.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([rate, g]) => ({ taxTypeCode: '0015', rate, exemptionCode: null, withholdingRate: 0, vatNotCollected: false, base: g.base, tax: g.tax, withheld: 0 }));
        const fx = Number(d.exchangeRate) || 1;
        const day = d.d ? dateKeyInZone(new Date(d.d), tzOf.get(d.companyId)) : null;
        const isBase = (d.currency || '').toUpperCase() === baseOf.get(d.companyId);
        await q.query(
          `UPDATE \`${docTable}\` SET \`payableTotal\` = \`grandTotal\`, \`taxBreakdown\` = ?, \`subtotalTry\` = ?, \`taxTotalTry\` = ?, \`grandTotalTry\` = ?, ` +
            '`exchangeRateSource` = ?, `exchangeRateDate` = ?, `taxPointDate` = ?, `invoiceTypeHint` = ?, `taxFrozenAt` = ? WHERE `id` = ?',
          [
            JSON.stringify(breakdown),
            r2(Number(d.subtotal) * fx),
            r2(Number(d.taxTotal) * fx),
            r2(Number(d.grandTotal) * fx),
            isBase ? 'BASE' : 'MANUAL',
            day,
            day,
            'SATIS',
            frozen.includes(d.status) ? d.updatedAt : null,
            d.id,
          ],
        );
      }
    };
    await backfill('orders', 'order_items', 'orderId', 'date', ['Completed']);
    await backfill('purchase_orders', 'purchase_order_items', 'purchaseOrderId', 'createdAt', ['Received', 'Partially Received']);
    // Legacy deduct-on-order mode: a completed order was delivered at its order date.
    await q.query("UPDATE `orders` SET `shippedAt` = `date` WHERE `status` = 'Completed'");

    // H. charges
    await q.query(
      'CREATE TABLE `order_charges` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `orderId` varchar(36) NULL, `purchaseOrderId` varchar(36) NULL, ' +
        '`type` varchar(20) NOT NULL, `description` varchar(255) NULL, ' +
        "`enteredAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `amount` decimal(14,2) NOT NULL DEFAULT '0.00', `taxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', " +
        "`withheldTaxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `lineTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `allocations` text NULL, " +
        'INDEX `IDX_order_charges_companyId` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `order_charges` ADD CONSTRAINT `FK_order_charges_order` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION, ' +
        'ADD CONSTRAINT `FK_order_charges_purchase_order` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `order_charges`');
    await q.query('ALTER TABLE `purchase_orders` DROP COLUMN `isImport`, DROP COLUMN `customsDeclarationNo`, DROP COLUMN `customsDeclarationDate`, DROP COLUMN `importVatAmount`, DROP COLUMN `nonDeductibleImportVat`');
    await q.query('ALTER TABLE `orders` DROP COLUMN `shippedAt`, DROP COLUMN `salesChannel`, DROP COLUMN `isDistanceSale`, DROP COLUMN `channelOrderRef`');
    for (const t of DOC_TABLES) await q.query(`ALTER TABLE \`${t}\` ${DOC_DROP.map((c) => `DROP COLUMN \`${c}\``).join(', ')}`);
    await q.query('ALTER TABLE `purchase_order_items` DROP COLUMN `deductibleVat`, DROP COLUMN `reverseCharge`');
    for (const t of LINE_TABLES) {
      await q.query(`ALTER TABLE \`${t}\` ${LINE_DROP.map((c) => `DROP COLUMN \`${c}\``).join(', ')}`);
      await q.query(`ALTER TABLE \`${t}\` MODIFY \`price\` decimal(10,2) NOT NULL, MODIFY \`unitPrice\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
    }
    // Development only: other rate types cannot survive the old key.
    await q.query("DELETE FROM `exchange_rates` WHERE `rateType` <> 'FOREX_BUYING'");
    await q.query('CREATE UNIQUE INDEX `UQ_exchange_rates_company_pair_date` ON `exchange_rates` (`companyId`, `baseCurrency`, `quoteCurrency`, `date`)');
    await q.query('DROP INDEX `UQ_exchange_rates_company_pair_date_type` ON `exchange_rates`');
    await q.query('ALTER TABLE `exchange_rates` DROP COLUMN `source`, DROP COLUMN `rateType`, DROP COLUMN `announcedAt`, DROP COLUMN `bulletinNo`');
    await q.query('ALTER TABLE `companies` DROP COLUMN `isImporterOrOreProducer`, DROP COLUMN `fxAutoFetch`');
    await q.query('ALTER TABLE `products` DROP COLUMN `exemptionCode`, DROP COLUMN `withholdingCode`, DROP COLUMN `otvCode`, DROP COLUMN `otvRate`');
    await q.query('DROP TABLE `otv_codes`');
    await q.query('DROP TABLE `withholding_codes`');
    await q.query('DROP TABLE `tax_exemption_codes`');
    // Superseded versions fold back into one row per rate; the KDV0 rows created here are removed.
    await q.query("DELETE FROM `tax_rates` WHERE `code` = 'KDV0' AND `kind` = 'EXEMPT' AND `id` NOT IN (SELECT `taxRateId` FROM (SELECT DISTINCT `taxRateId` FROM `products` WHERE `taxRateId` IS NOT NULL) x)");
    await q.query(
      'ALTER TABLE `tax_rates` DROP COLUMN `code`, DROP COLUMN `taxTypeCode`, DROP COLUMN `kind`, DROP COLUMN `validFrom`, DROP COLUMN `validTo`, DROP COLUMN `isSystem`, DROP COLUMN `supersedesId`',
    );
    await q.query("DELETE FROM `legal_parameters` WHERE `key` IN ('KDV_RATE_CATALOG', 'KDV_FX_RATE_DAY', 'TCMB_FETCH_TIME') AND `createdBy` = 'migration'");
  }
}
