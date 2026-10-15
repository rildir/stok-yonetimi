import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP4_FIX_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { dropDocumentTriggers, ensureDocumentTriggers } from '../shared/documents/document-triggers';
import { backfillPurchaseReceived } from '../shared/documents/purchase-received-backfill';
import { pickParameter } from '../shared/services/legal-parameter.service';
import { translate } from '../shared/i18n/messages';
import { dateKeyInZone, withdrawalDates } from '../shared/tr';

/**
 * WP4 review fixes (round 1).
 *
 *  A. returns.goodsHandedOverDate: day the consumer handed the goods to the carrier named in the
 *     pre-contract information (start of the refund period, Mesafeli Sözl. Yön. md. 12/1).
 *  B. Legal parameters per RG 23.08.2022-31932 (in force 01.10.2022): goods-return period 14 days
 *     (md. 13/1, was 10), refund period basis (WITHDRAWAL_REFUND_BASIS: notification before,
 *     goods handed over / returned after), corrected source references.
 *  C. Withdrawal returns: deadlines recomputed with B.
 *  D. purchase_order_items.receivedQuantity rebuilt from the IN movements of each PO (the WP4
 *     backfill marked partially received lines as fully received).
 *  E. Automatically created IN_TRANSIT / QUARANTINE warehouses named with the raw message key.
 * The document triggers are dropped for the data fixes and recreated afterwards (the frozen
 * column list of `returns` includes the new column).
 */
export class DocumentRegimeReviewFixes1784274136000 implements MigrationInterface {
  name = 'DocumentRegimeReviewFixes1784274136000';

  public async up(q: QueryRunner): Promise<void> {
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await dropDocumentTriggers(query);

    // A
    await q.query('ALTER TABLE `returns` ADD `goodsHandedOverDate` date NULL AFTER `refundDueDate`');

    // B
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP4_FIX_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE `validTo` = VALUES(`validTo`), `value` = VALUES(`value`), `sourceRef` = VALUES(`sourceRef`), `confidence` = VALUES(`confidence`), `note` = VALUES(`note`)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'migration'],
      );
    }

    // C
    const params: { country: string; key: string; validFrom: string; validTo: string | null; value: string }[] = await q.query(
      "SELECT `country`, `key`, DATE_FORMAT(`validFrom`, '%Y-%m-%d') AS validFrom, DATE_FORMAT(`validTo`, '%Y-%m-%d') AS validTo, `value` FROM `legal_parameters` WHERE `key` LIKE 'WITHDRAWAL\\_%'",
    );
    const param = (country: string, key: string, day: string, fallback: unknown) => {
      const row = pickParameter(params.filter((r) => r.country === country && r.key === key), day);
      if (!row) return fallback;
      if (typeof row.value !== 'string') return row.value;
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    };
    const utc = (v: unknown) => (v instanceof Date ? v : new Date(`${String(v).replace(' ', 'T').replace(/Z?$/, 'Z')}`));
    const returns: any[] = await q.query(
      "SELECT r.`id`, DATE_FORMAT(r.`deliveryDate`, '%Y-%m-%d') AS deliveryDate, r.`notifiedAt`, r.`goodsMovedAt`, r.`status`, c.`timezone`, c.`country` " +
        "FROM `returns` r JOIN `companies` c ON c.`id` = r.`companyId` WHERE r.`type` = 'WITHDRAWAL' AND r.`deliveryDate` IS NOT NULL",
    );
    for (const r of returns) {
      const tz = r.timezone || 'Europe/Istanbul';
      const country = r.country || 'TR';
      const notified = r.notifiedAt ? dateKeyInZone(utc(r.notifiedAt), tz) : null;
      const day = notified || r.deliveryDate;
      const back = r.status === 'COMPLETED' && r.goodsMovedAt ? dateKeyInZone(utc(r.goodsMovedAt), tz) : null;
      const plan = withdrawalDates(
        r.deliveryDate,
        notified,
        {
          periodDays: Number(param(country, 'WITHDRAWAL_PERIOD_DAYS', day, 14)),
          goodsReturnDays: Number(param(country, 'WITHDRAWAL_GOODS_RETURN_DAYS', day, 14)),
          refundDays: Number(param(country, 'WITHDRAWAL_REFUND_DAYS', day, 14)),
          refundBasis: String(param(country, 'WITHDRAWAL_REFUND_BASIS', day, 'GOODS_RETURNED')),
        },
        back,
      );
      await q.query('UPDATE `returns` SET `withdrawalDeadline` = ?, `goodsReturnDeadline` = ?, `refundDueDate` = ? WHERE `id` = ?', [
        plan.withdrawalDeadline,
        plan.goodsReturnDeadline,
        plan.refundDueDate,
        r.id,
      ]);
    }

    // D
    await backfillPurchaseReceived(query);

    // E
    for (const [key, type] of [
      ['IN_TRANSIT_WAREHOUSE_NAME', 'IN_TRANSIT'],
      ['QUARANTINE_WAREHOUSE_NAME', 'QUARANTINE'],
    ]) {
      const rows: { id: string; companyId: string; name: string }[] = await q.query('SELECT `id`, `companyId`, `name` FROM `warehouses` WHERE `type` = ? AND `name` LIKE ?', [type, `${key}%`]);
      for (const w of rows) {
        const base = translate(key, 'tr');
        let name = w.name.replace(key, base);
        for (let i = 2; (await q.query('SELECT 1 FROM `warehouses` WHERE `companyId` = ? AND `name` = ? AND `id` <> ?', [w.companyId, name, w.id])).length; i++) name = `${base} ${i}`;
        await q.query('UPDATE `warehouses` SET `name` = ? WHERE `id` = ?', [name, w.id]);
      }
    }

    await ensureDocumentTriggers(query, true);
  }

  public async down(q: QueryRunner): Promise<void> {
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await dropDocumentTriggers(query);
    await q.query('ALTER TABLE `returns` DROP COLUMN `goodsHandedOverDate`');
    await q.query("DELETE FROM `legal_parameters` WHERE `createdBy` = 'migration' AND ((`key` = 'WITHDRAWAL_REFUND_BASIS') OR (`key` = 'WITHDRAWAL_GOODS_RETURN_DAYS' AND `validFrom` = '2022-10-01'))");
    await q.query(
      "UPDATE `legal_parameters` SET `validTo` = NULL, `value` = '10', `confidence` = 'low', `sourceRef` = 'Mesafeli Sözleşmeler Yönetmeliği md. 15/1 (tüketici malı bildirimden itibaren 10 gün içinde geri gönderir)' WHERE `key` = 'WITHDRAWAL_GOODS_RETURN_DAYS' AND `validFrom` = '2015-02-27'",
    );
    await q.query(
      "UPDATE `legal_parameters` SET `sourceRef` = 'Mesafeli Sözleşmeler Yönetmeliği md. 12 (cayma bildiriminden itibaren 14 gün içinde iade)' WHERE `key` = 'WITHDRAWAL_REFUND_DAYS' AND `validFrom` = '2015-02-27'",
    );
    // Received quantities and warehouse names stay corrected (data fixes).
    await ensureDocumentTriggers(query, true);
  }
}
