import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP3_FIX2_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { taxCodeSeedStatements } from '../shared/finance/tax-code-seeds';

/**
 * WP3 review fixes (round 2). Data only, no schema change.
 *
 *  A. legal parameter TCMB_NO_BULLETIN_DAYS (weekday public holidays without a TCMB bulletin,
 *     one row per year): confirms a holiday gap when the TCMB archive cannot (manual rates, outage).
 *  B. Code tables re-upserted: withholding code 818 name per v1.43 ("... Alüminyum ve Kurşun ...").
 */
export class TaxEngineReviewFixes21784274134000 implements MigrationInterface {
  name = 'TaxEngineReviewFixes21784274134000';

  public async up(q: QueryRunner): Promise<void> {
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP3_FIX2_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'migration'],
      );
    }
    for (const st of taxCodeSeedStatements(randomUUID, 'upsert')) await q.query(st.sql, st.params);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM `legal_parameters` WHERE `key` IN (?) AND `createdBy` = 'migration'", [WP3_FIX2_PARAMETER_KEYS]);
    await q.query(
      "UPDATE `withholding_codes` SET `nameTr` = 'Bakır, Çinko ve Alüminyum Ürünlerinin Teslimi (tam tevkifat)', `nameEn` = 'Copper, zinc and aluminium products (full withholding)' WHERE `code` = '818'",
    );
  }
}
