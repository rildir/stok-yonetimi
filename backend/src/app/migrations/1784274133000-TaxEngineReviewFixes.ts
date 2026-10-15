import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP3_FIX_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { CODE_LIST_VERSION, taxCodeSeedStatements } from '../shared/finance/tax-code-seeds';
import { dateKeyInZone, DEFAULT_TIMEZONE } from '../shared/tr';

/**
 * WP3 review fixes (round 1).
 *
 *  A. orders / purchase_orders.taxPointExplicit: a tax point the user entered (invoice before
 *     delivery) survives completion / receipt; a derived one follows shipment / receipt. Backfill:
 *     unfrozen documents whose tax point differs from the derived day.
 *  B. order_items / purchase_order_items.withholdingCodeEntered and discountAmountEntered: what
 *     the user entered, so re-pricing at a new tax point keeps the intent (a line below the
 *     VUK 232 threshold no longer loses the product's default code; amount discounts survive).
 *     Backfill: explicit codes that differ from the product default; amount discounts grossed up
 *     for tax-inclusive companies.
 *  C. companies.isDesignatedBuyer (purchases under codes limited to designated buyers) and
 *     suppliers.isImporterOrOreProducer (627 seller exception on purchases).
 *  D. Code tables brought to GİB UBL-TR Kod Listeleri v1.43 (27.07.2026): full partial / full
 *     exemption lists, 704, 8xx full withholding codes, corrected names and confidence (upsert per
 *     code / validFrom); 555 starts with v1.42 (12.03.2026).
 *  E. legal parameter KDV_FX_MAX_STALE_DAYS (low confidence).
 */
const OLD_EXEMPTIONS = ['201', '202', '213', '220', '230', '231', '232', '235', '250', '301', '302', '303', '304', '308', '311', '312', '313', '317', '322', '325', '326', '335', '338', '350', '351', '555', '701', '702', '703'];
const OLD_WITHHOLDINGS = [...Array.from({ length: 27 }, (_, i) => String(601 + i)), '801', '812', '825'];

export class TaxEngineReviewFixes1784274133000 implements MigrationInterface {
  name = 'TaxEngineReviewFixes1784274133000';

  public async up(q: QueryRunner): Promise<void> {
    // A
    for (const t of ['orders', 'purchase_orders']) await q.query(`ALTER TABLE \`${t}\` ADD \`taxPointExplicit\` tinyint NOT NULL DEFAULT 0`);
    const companies: { id: string; timezone: string | null; pricesIncludeTax: number }[] = await q.query('SELECT `id`, `timezone`, `pricesIncludeTax` FROM `companies`');
    const tz = new Map(companies.map((c) => [c.id, c.timezone || DEFAULT_TIMEZONE]));
    const orders: { id: string; companyId: string; date: Date | string; shippedAt: Date | string | null; taxPointDate: string | null }[] = await q.query(
      'SELECT `id`, `companyId`, `date`, `shippedAt`, `taxPointDate` FROM `orders` WHERE `taxFrozenAt` IS NULL AND `taxPointDate` IS NOT NULL',
    );
    for (const o of orders) {
      const derived = dateKeyInZone(new Date(o.shippedAt || o.date), tz.get(o.companyId));
      if (String(o.taxPointDate).slice(0, 10) !== derived) await q.query('UPDATE `orders` SET `taxPointExplicit` = 1 WHERE `id` = ?', [o.id]);
    }
    const pos: { id: string; companyId: string; createdAt: Date | string; taxPointDate: string | null }[] = await q.query(
      'SELECT `id`, `companyId`, `createdAt`, `taxPointDate` FROM `purchase_orders` WHERE `taxFrozenAt` IS NULL AND `taxPointDate` IS NOT NULL',
    );
    for (const p of pos) {
      if (String(p.taxPointDate).slice(0, 10) !== dateKeyInZone(new Date(p.createdAt), tz.get(p.companyId))) {
        await q.query('UPDATE `purchase_orders` SET `taxPointExplicit` = 1 WHERE `id` = ?', [p.id]);
      }
    }

    // B
    const lineTables: [string, string, string][] = [
      ['order_items', 'orders', 'orderId'],
      ['purchase_order_items', 'purchase_orders', 'purchaseOrderId'],
    ];
    for (const [t, doc, fk] of lineTables) {
      await q.query(`ALTER TABLE \`${t}\` ADD \`discountAmountEntered\` decimal(14,2) NULL, ADD \`withholdingCodeEntered\` varchar(10) NULL`);
      await q.query(
        `UPDATE \`${t}\` i JOIN \`products\` p ON p.\`id\` = i.\`productId\` SET i.\`withholdingCodeEntered\` = i.\`withholdingCode\` ` +
          'WHERE i.`withholdingCode` IS NOT NULL AND (p.`withholdingCode` IS NULL OR p.`withholdingCode` <> i.`withholdingCode`)',
      );
      await q.query(
        `UPDATE \`${t}\` i JOIN \`${doc}\` d ON d.\`id\` = i.\`${fk}\` JOIN \`companies\` c ON c.\`id\` = d.\`companyId\` ` +
          'SET i.`discountAmountEntered` = IF(c.`pricesIncludeTax` = 1, ROUND(i.`discountAmount` * (1 + IFNULL(i.`otvRate`, 0) / 100) * (1 + IF(i.`vatNotCollected` = 1, 0, i.`taxRate`) / 100), 2), i.`discountAmount`) ' +
          'WHERE i.`discountRate` = 0 AND i.`discountAmount` > 0',
      );
    }

    // C
    await q.query('ALTER TABLE `companies` ADD `isDesignatedBuyer` tinyint NOT NULL DEFAULT 0');
    await q.query('ALTER TABLE `suppliers` ADD `isImporterOrOreProducer` tinyint NOT NULL DEFAULT 0');

    // D
    await q.query("UPDATE `tax_exemption_codes` SET `validFrom` = '2026-03-12' WHERE `code` = '555' AND `validFrom` = '2026-03-27'");
    for (const st of taxCodeSeedStatements(randomUUID, 'upsert')) await q.query(st.sql, st.params);

    // E
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP3_FIX_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'migration'],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM `legal_parameters` WHERE `key` IN (?) AND `createdBy` = 'migration'", [WP3_FIX_PARAMETER_KEYS]);
    // Codes added with v1.43 go; rows that existed before keep their v1.43 names (no data loss).
    await q.query('DELETE FROM `tax_exemption_codes` WHERE `codeListVersion` = ? AND `code` NOT IN (?)', [CODE_LIST_VERSION, OLD_EXEMPTIONS]);
    await q.query('DELETE FROM `withholding_codes` WHERE `codeListVersion` = ? AND `code` NOT IN (?)', [CODE_LIST_VERSION, OLD_WITHHOLDINGS]);
    await q.query("UPDATE `tax_exemption_codes` SET `validFrom` = '2026-03-27' WHERE `code` = '555' AND `validFrom` = '2026-03-12'");
    await q.query('ALTER TABLE `suppliers` DROP COLUMN `isImporterOrOreProducer`');
    await q.query('ALTER TABLE `companies` DROP COLUMN `isDesignatedBuyer`');
    for (const t of ['order_items', 'purchase_order_items']) await q.query(`ALTER TABLE \`${t}\` DROP COLUMN \`discountAmountEntered\`, DROP COLUMN \`withholdingCodeEntered\``);
    for (const t of ['orders', 'purchase_orders']) await q.query(`ALTER TABLE \`${t}\` DROP COLUMN \`taxPointExplicit\``);
  }
}
