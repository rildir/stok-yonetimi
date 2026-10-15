import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP6R1_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';

/**
 * WP6 review fixes (round 1) - data only, no schema change.
 *
 *  A. Legal parameters VAT_DEEMED_SUPPLY_REASONS (KDVK 3/a, 27: which exits are taxed at the emsal
 *     value; use inside the taxable business is not a supply) and EMSAL_COST_MARKUP_PCT (VUK 267/2).
 *
 * The demo tenant's closing snapshots are recomputed by the WP6 demo seeder (reopen + close, the
 * old snapshot rows stay because the table is append-only).
 */
export class CostingReviewFixes1784274140000 implements MigrationInterface {
  name = 'CostingReviewFixes1784274140000';

  public async up(q: QueryRunner): Promise<void> {
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP6R1_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration'],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`createdBy\` IN ('migration', 'seed') AND \`key\` IN (${WP6R1_PARAMETER_KEYS.map(() => '?').join(', ')})`, WP6R1_PARAMETER_KEYS);
  }
}
