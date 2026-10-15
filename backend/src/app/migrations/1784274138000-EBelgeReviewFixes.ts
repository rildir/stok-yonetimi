import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WP5 review fixes (round 1) - data only, no schema change.
 *
 *  A. İrsaliye Yanıtı (receipt advice) numbers move to DocumentNumberService: every company that
 *     already issued receipt advices gets the EDOCUMENT series "IRY" of kind RECEIPT_ADVICE and a
 *     counter per year continuing after the highest number used (no duplicate, no gap).
 *  B. invoices.gibStatus of cancelled e-documents follows the archive (it kept the last provider
 *     status, e.g. DELIVERED, while e_documents.gibStatus was CANCELLED).
 */
export class EBelgeReviewFixes1784274138000 implements MigrationInterface {
  name = 'EBelgeReviewFixes1784274138000';

  public async up(q: QueryRunner): Promise<void> {
    // A
    const used: { companyId: string; series: string; year: number; lastNumber: number; lastDate: string | Date | null }[] = await q.query(
      "SELECT `companyId`, SUBSTRING(`documentNo`, 1, 3) AS `series`, CAST(SUBSTRING(`documentNo`, 4, 4) AS UNSIGNED) AS `year`, MAX(CAST(SUBSTRING(`documentNo`, 8) AS UNSIGNED)) AS `lastNumber`, MAX(`issueDate`) AS `lastDate` " +
        "FROM `e_documents` WHERE `direction` = 'OUT' AND `documentType` = 'RECEIPT_ADVICE' AND `documentNo` REGEXP '^[A-Z0-9]{3}[0-9]{13}$' GROUP BY `companyId`, `series`, `year`",
    );
    for (const u of used) {
      const hasSeries = await q.query("SELECT 1 FROM `document_series` WHERE `companyId` = ? AND `kind` = 'RECEIPT_ADVICE' AND `mode` = 'EDOCUMENT'", [u.companyId]);
      await q.query(
        "INSERT INTO `document_series` (`id`, `companyId`, `kind`, `mode`, `seriesCode`, `isDefault`, `isActive`, `warehouseId`, `note`) VALUES (?, ?, 'RECEIPT_ADVICE', 'EDOCUMENT', ?, ?, 1, NULL, ?) " +
          'ON DUPLICATE KEY UPDATE `id` = `id`',
        [randomUUID(), u.companyId, u.series, hasSeries.length ? 0 : 1, 'İrsaliye Yanıtı (e-İrsaliye) serisi'],
      );
      const lastDate = u.lastDate instanceof Date ? u.lastDate.toISOString().slice(0, 10) : u.lastDate ? String(u.lastDate).slice(0, 10) : null;
      await q.query(
        "INSERT INTO `document_sequences` (`id`, `companyId`, `kind`, `mode`, `seriesCode`, `year`, `lastNumber`, `lastDate`) VALUES (?, ?, 'RECEIPT_ADVICE', 'EDOCUMENT', ?, ?, ?, ?) " +
          'ON DUPLICATE KEY UPDATE `lastNumber` = GREATEST(`lastNumber`, VALUES(`lastNumber`)), `lastDate` = GREATEST(COALESCE(`lastDate`, VALUES(`lastDate`)), VALUES(`lastDate`))',
        [randomUUID(), u.companyId, u.series, Number(u.year), Number(u.lastNumber), lastDate],
      );
    }

    // B
    await q.query(
      "UPDATE `invoices` i JOIN `e_documents` e ON e.`companyId` = i.`companyId` AND e.`sourceType` = 'invoice' AND e.`sourceId` = i.`id` AND e.`direction` = 'OUT' " +
        "SET i.`gibStatus` = 'CANCELLED' WHERE i.`status` = 'CANCELLED' AND e.`gibStatus` = 'CANCELLED' AND (i.`gibStatus` IS NULL OR i.`gibStatus` <> 'CANCELLED')",
    );
  }

  public async down(): Promise<void> {
    // Data corrections only: the series / counters stay (removing them could reuse numbers), and the
    // previous gibStatus values were wrong.
  }
}
