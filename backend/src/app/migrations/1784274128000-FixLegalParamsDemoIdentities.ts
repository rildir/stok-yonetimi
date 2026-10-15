import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS } from '../shared/legal/legal-parameter-seeds';
import { demoTckn, demoVkn, LEGACY_DEMO_IDENTIFIERS } from '../shared/services/demo-fiscal.seed';
import { tcknCheckDigits, vknCheckDigit } from '../shared/tr';

/**
 * WP1 review fixes (data only, no schema change):
 *  A. legal_parameters: e-Fatura thresholds per 509 IV.1.4(a)(1) (5M 2018-2020, 4M 2021,
 *     3M 2022+), e-İrsaliye 25M from 2018, EARSIV_PAPER_LIMIT_SIMPLE from 1/1/2025,
 *     589 SN source, corporate-event transition (4th month), new EBELGE_SECTOR_RULES and
 *     EBELGE_GIB_NOTICE_MIN_MONTHS. Only rows written by the migration / seed are replaced;
 *     rows added by an operator are kept.
 *  B. Sector flags in company_ebelge_profiles mapped to the 509 item codes; flags with no
 *     509 item (e.g. FOOD_WHOLESALE, PHARMA_ITS) are dropped.
 *  C. Seeded demo accounts that still use their well-known password must change it.
 *  D. Demo VKN / TCKN values replaced by patterned, recognisably fictitious numbers.
 */
const KEYS = [
  'EFATURA_GROSS_SALES_THRESHOLD',
  'EIRSALIYE_GROSS_SALES_THRESHOLD',
  'EARSIV_PAPER_LIMIT_SIMPLE',
  'EBELGE_ALL_INVOICES_FROM_ISLETME_BASIT',
  'EBELGE_TRANSITION_MONTHS',
  'EBELGE_SECTOR_RULES',
  'EBELGE_GIB_NOTICE_MIN_MONTHS',
];

/** Values before this migration (for down()). */
const PREVIOUS: [key: string, validFrom: string, validTo: string | null, value: unknown, sourceRef: string, confidence: string][] = [
  ['EFATURA_GROSS_SALES_THRESHOLD', '2018-01-01', '2021-12-31', 5000000, '509 Sıra No.lu VUK GT IV.1.4 (b)', 'medium'],
  ['EFATURA_GROSS_SALES_THRESHOLD', '2022-01-01', '2022-12-31', 4000000, '509 Sıra No.lu VUK GT IV.1.4 (b), 535 SN ile değişik', 'medium'],
  ['EFATURA_GROSS_SALES_THRESHOLD', '2023-01-01', null, 3000000, '509 Sıra No.lu VUK GT IV.1.4 (b), 545 SN ile değişik', 'medium'],
  ['EIRSALIYE_GROSS_SALES_THRESHOLD', '2019-01-01', '2020-12-31', 25000000, '509 Sıra No.lu VUK GT IV.3.5 (a)', 'medium'],
  ['EIRSALIYE_GROSS_SALES_THRESHOLD', '2021-01-01', null, 10000000, '509 Sıra No.lu VUK GT IV.3.5 (a)', 'medium'],
  ['EARSIV_PAPER_LIMIT_SIMPLE', '2026-01-01', '2026-12-31', 3000, '509 Sıra No.lu VUK GT IV.2.4.3; 589 Sıra No.lu VUK GT', 'medium'],
  ['EBELGE_ALL_INVOICES_FROM_ISLETME_BASIT', '2025-01-01', null, '2027-01-01', '589 Sıra No.lu VUK GT (RG tarihi 30/31.12.2025 teyit edilmeli)', 'medium'],
  ['EBELGE_TRANSITION_MONTHS', '2018-01-01', null, 3, '509 Sıra No.lu VUK GT IV.1.5, IV.3.6 (izleyen 3. ayın başı)', 'medium'],
];

/** Old (pre-review) sector codes -> 509 item codes; null = no 509 item, dropped. */
const FLAG_MAP: Record<string, string | null> = {
  FUEL_LICENSE: 'EPDK_OTV1_LICENSE',
  MINERAL_OIL_LICENSE: 'EPDK_OTV1_LICENSE',
  TOBACCO_ALCOHOL: 'OTV3_GOODS',
  ALCOHOL_TOBACCO_PRODUCER: 'OTV3_GOODS',
  MOTOR_VEHICLE_TRADE: 'REAL_ESTATE_VEHICLE',
  FERTILIZER: 'FERTILIZER_TRACKING',
  IMPORTER_ITS: null,
  GOVERNMENT_SUPPLIER: null,
  FOOD_WHOLESALE: null,
  FURNITURE_MANUFACTURER: null,
  PHARMA_ITS: null,
  MEDICAL_DEVICE_UTS: null,
};

const DEMO_PASSWORDS: Record<string, string> = { manager: 'manager123', viewer: 'viewer123', demo: 'demo123' };

const oldId = (first9: string, kind: 'VKN' | 'TCKN') => first9 + (kind === 'VKN' ? String(vknCheckDigit(first9)) : tcknCheckDigits(first9).join(''));
const newId = (digit: string, kind: 'VKN' | 'TCKN') => (kind === 'VKN' ? demoVkn(digit) : demoTckn(digit));

export class FixLegalParamsDemoIdentities1784274128000 implements MigrationInterface {
  name = 'FixLegalParamsDemoIdentities1784274128000';

  private async insertParam(q: QueryRunner, row: { key: string; validFrom: string; validTo: string | null; value: unknown; sourceRef: string; confidence: string; note?: string | null }) {
    await q.query(
      'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), 'TR', row.key, row.validFrom, row.validTo, JSON.stringify(row.value), row.sourceRef, row.confidence, row.note ?? null, 'migration'],
    );
  }

  private async replaceIdentifiers(q: QueryRunner, forward: boolean) {
    for (const [first9, kind, digit] of LEGACY_DEMO_IDENTIFIERS) {
      const [from, to] = forward ? [oldId(first9, kind), newId(digit, kind)] : [newId(digit, kind), oldId(first9, kind)];
      await q.query('UPDATE `customers` SET `identityNumber` = ? WHERE `identityNumber` = ?', [to, from]);
      if (kind === 'VKN') {
        await q.query('UPDATE `suppliers` SET `identityNumber` = ? WHERE `identityNumber` = ?', [to, from]);
        await q.query('UPDATE `companies` SET `taxId` = ?, `mersisNo` = IF(`mersisNo` = ?, ?, `mersisNo`) WHERE `taxId` = ?', [to, `0${from}00017`, `0${to}00017`, from]);
      }
    }
  }

  public async up(q: QueryRunner): Promise<void> {
    // A. legal parameters
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`country\` = 'TR' AND \`createdBy\` IN ('migration', 'seed') AND \`key\` IN (${KEYS.map(() => '?').join(', ')})`, KEYS);
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => x.country === 'TR' && KEYS.includes(x.key))) await this.insertParam(q, p);

    // B. sector flags
    const profiles: { id: string; sectorFlagsEFatura: unknown; sectorFlagsEIrsaliye: unknown }[] = await q.query(
      'SELECT `id`, `sectorFlagsEFatura`, `sectorFlagsEIrsaliye` FROM `company_ebelge_profiles`',
    );
    const remap = (raw: unknown): { list: unknown[]; changed: boolean } => {
      const list = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { code: string; since: string }[] | null;
      if (!Array.isArray(list)) return { list: [], changed: false };
      let changed = false;
      const out = new Map<string, { code: string; since: string }>();
      for (const f of list) {
        const code = f.code in FLAG_MAP ? FLAG_MAP[f.code] : f.code;
        if (code !== f.code) changed = true;
        if (!code) continue;
        const prev = out.get(code);
        if (!prev || f.since < prev.since) out.set(code, { code, since: f.since });
      }
      return { list: [...out.values()], changed };
    };
    for (const p of profiles) {
      const e = remap(p.sectorFlagsEFatura);
      const i = remap(p.sectorFlagsEIrsaliye);
      if (e.changed || i.changed) {
        await q.query('UPDATE `company_ebelge_profiles` SET `sectorFlagsEFatura` = ?, `sectorFlagsEIrsaliye` = ? WHERE `id` = ?', [JSON.stringify(e.list), JSON.stringify(i.list), p.id]);
      }
    }

    // C. demo accounts still on their well-known password
    const users: { id: string; username: string; password: string }[] = await q.query(
      `SELECT \`id\`, \`username\`, \`password\` FROM \`users\` WHERE \`username\` IN (${Object.keys(DEMO_PASSWORDS).map(() => '?').join(', ')})`,
      Object.keys(DEMO_PASSWORDS),
    );
    for (const u of users) {
      let weak = false;
      try {
        weak = !!u.password && bcrypt.compareSync(DEMO_PASSWORDS[u.username], u.password);
      } catch {
        weak = false;
      }
      if (weak) await q.query('UPDATE `users` SET `mustChangePassword` = 1 WHERE `id` = ?', [u.id]);
    }

    // D. demo identifiers
    await this.replaceIdentifiers(q, true);
  }

  public async down(q: QueryRunner): Promise<void> {
    await this.replaceIdentifiers(q, false);
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`country\` = 'TR' AND \`createdBy\` IN ('migration', 'seed') AND \`key\` IN (${KEYS.map(() => '?').join(', ')})`, KEYS);
    for (const [key, validFrom, validTo, value, sourceRef, confidence] of PREVIOUS) await this.insertParam(q, { key, validFrom, validTo, value, sourceRef, confidence });
    // Sector-flag mapping and forced password changes are not reverted (no information lost that matters).
  }
}
