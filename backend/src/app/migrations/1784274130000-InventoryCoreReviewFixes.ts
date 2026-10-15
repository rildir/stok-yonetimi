import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS } from '../shared/legal/legal-parameter-seeds';
import { ensureImmutabilityTriggers, REVIEW_FIX_TRIGGER_NAMES } from '../shared/inventory/immutability-triggers';
import { INTEGER_UNECE_GROUPS, UNECE_UNIT_CODES } from '../shared/tr';

/**
 * WP2 review fixes.
 *
 *  A. stock_movements: hashVersion (existing rows stay v1), approvedBy / approvedByUserId
 *     (maker-checker: performedBy is the requester), attachmentsSha256 (evidence digest).
 *     New rows are hashed with v2 (adds createdAt, approver and evidence digest).
 *  B. companies.stockLockDate: no movement may be dated on or before it.
 *  C. products.availableQuantity: stock in sellable warehouses; status follows it
 *     (quarantine / in-transit stock no longer shows as "In stock").
 *  D. units with a count / package UN/ECE code are whole units (decimals 0) unless
 *     existing stock already has fractions in them.
 *  E. legal parameter MOVEMENT_REASON_EVIDENCE (zayi / imha / afet / hırsızlık evidence).
 *  F. triggers: evidence files undeletable and only linkable once; decided maker-checker
 *     requests frozen and undeletable.
 */
export class InventoryCoreReviewFixes1784274130000 implements MigrationInterface {
  name = 'InventoryCoreReviewFixes1784274130000';

  public async up(q: QueryRunner): Promise<void> {
    // A. (ADD COLUMN does not fire the append-only triggers; existing hashes stay valid as v1.)
    await q.query(
      "ALTER TABLE `stock_movements` ADD `hashVersion` tinyint NOT NULL DEFAULT 1, ADD `approvedBy` varchar(100) NULL, " +
        'ADD `approvedByUserId` varchar(36) NULL, ADD `attachmentsSha256` char(64) NULL',
    );

    // B.
    await q.query('ALTER TABLE `companies` ADD `stockLockDate` date NULL');

    // C.
    await q.query("ALTER TABLE `products` ADD `availableQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000'");
    await q.query(
      'UPDATE `products` p SET p.`availableQuantity` = COALESCE((SELECT SUM(s.`quantity`) FROM `product_warehouse_stocks` s ' +
        'JOIN `warehouses` w ON w.`id` = s.`warehouseId` WHERE s.`productId` = p.`id` AND w.`isDeleted` = 0 AND w.`isSellable` = 1 ' +
        "AND w.`type` NOT IN ('QUARANTINE', 'IN_TRANSIT')), 0)",
    );
    await q.query(
      "UPDATE `products` SET `status` = CASE WHEN `availableQuantity` <= 0 THEN 'Out of stock' WHEN `availableQuantity` <= `minQuantity` THEN 'Low stock' ELSE 'In stock' END",
    );

    // D.
    const integerCodes = UNECE_UNIT_CODES.filter((u) => (INTEGER_UNECE_GROUPS as readonly string[]).includes(u.group)).map((u) => u.code);
    await q.query(
      'UPDATE `units` u SET u.`decimals` = 0, u.`allowsFraction` = 0 WHERE u.`uneceCode` IN (?) AND u.`decimals` > 0 ' +
        'AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`baseUnitId` = u.`id` AND (p.`quantity` <> ROUND(p.`quantity`) OR p.`minQuantity` <> ROUND(p.`minQuantity`)))',
      [integerCodes],
    );

    // E.
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => x.key === 'MOVEMENT_REASON_EVIDENCE')) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration'],
      );
    }

    // F.
    await ensureImmutabilityTriggers((sql, params) => q.query(sql, params));
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const name of REVIEW_FIX_TRIGGER_NAMES) await q.query(`DROP TRIGGER IF EXISTS \`${name}\``);
    await q.query("DELETE FROM `legal_parameters` WHERE `key` = 'MOVEMENT_REASON_EVIDENCE' AND `createdBy` = 'migration'");
    await q.query(
      "UPDATE `products` SET `status` = CASE WHEN `quantity` <= 0 THEN 'Out of stock' WHEN `quantity` <= `minQuantity` THEN 'Low stock' ELSE 'In stock' END",
    );
    await q.query('ALTER TABLE `products` DROP COLUMN `availableQuantity`');
    await q.query('ALTER TABLE `companies` DROP COLUMN `stockLockDate`');
    // Movements written as v2 cannot be verified once these columns are gone; down() is for development only.
    await q.query('ALTER TABLE `stock_movements` DROP COLUMN `attachmentsSha256`, DROP COLUMN `approvedByUserId`, DROP COLUMN `approvedBy`, DROP COLUMN `hashVersion`');
  }
}
