import { EBELGE_SECTOR_RULES_SEED, LEGAL_PARAMETER_SEEDS } from '../legal/legal-parameter-seeds';
import { pickParameter } from '../services/legal-parameter.service';
import {
  addMonths,
  computeObligations,
  guessIdentityType,
  isStrongPassword,
  isValidDriverTckn,
  isValidKepAddress,
  isValidMersis,
  isValidTckn,
  isValidTrPostalCode,
  isValidVkn,
  isValidYkn,
  ObligationParams,
  SpecialTaxId,
  tcknCheckDigits,
  SectorRule,
  todayKey,
  validateTaxId,
  zonedDayEnd,
  zonedDayStart,
  vknCheckDigit,
} from './index';

const SPECIALS: SpecialTaxId[] = [
  { value: '11111111111', type: 'TCKN', scope: ['EIRSALIYE', 'EARSIV'] },
  { value: '2222222222', type: 'VKN', scope: ['EARSIV'] },
];

describe('VKN', () => {
  it('accepts known valid vectors', () => {
    expect(isValidVkn('4890598016')).toBe(true);
    expect(isValidVkn('1460415308')).toBe(true);
    const generated = '847291035' + vknCheckDigit('847291035');
    expect(isValidVkn(generated)).toBe(true);
  });
  it('rejects wrong check digit, length and non-digits', () => {
    expect(isValidVkn('4890598017')).toBe(false);
    expect(isValidVkn('489059801')).toBe(false);
    expect(isValidVkn('48905980160')).toBe(false);
    expect(isValidVkn('48905A8016')).toBe(false);
    expect(isValidVkn('')).toBe(false);
    expect(isValidVkn(null)).toBe(false);
  });
});

describe('TCKN / YKN', () => {
  it('accepts known valid TCKN', () => {
    expect(isValidTckn('11084871202')).toBe(true);
    expect(isValidTckn('10000000146')).toBe(true);
  });
  it('rejects bad checksums and a leading zero', () => {
    expect(isValidTckn('11084871212')).toBe(false);
    expect(isValidTckn('01084871202')).toBe(false);
    expect(isValidTckn('1108487120')).toBe(false);
  });
  it('validates YKN (99 prefix, same algorithm)', () => {
    const ykn = '991234567' + tcknCheckDigits('991234567').join('');
    expect(isValidYkn(ykn)).toBe(true);
    expect(isValidTckn(ykn)).toBe(true);
    expect(isValidYkn('11084871202')).toBe(false);
    expect(guessIdentityType(ykn)).toBe('YKN');
  });
  it('placeholders are not checksum valid and need the whitelist + scope', () => {
    expect(isValidTckn('11111111111')).toBe(false);
    expect(isValidVkn('2222222222')).toBe(false);
    expect(validateTaxId({ identityType: 'TCKN', identityNumber: '11111111111' })).toBe('INVALID_TCKN');
    expect(validateTaxId({ identityType: 'TCKN', identityNumber: '11111111111' }, { specials: SPECIALS, specialScope: 'EIRSALIYE' })).toBeNull();
    expect(validateTaxId({ identityType: 'VKN', identityNumber: '2222222222' }, { specials: SPECIALS, specialScope: 'EIRSALIYE' })).toBe('INVALID_VKN');
    expect(validateTaxId({ identityType: 'VKN', identityNumber: '2222222222' }, { specials: SPECIALS, specialScope: 'EARSIV' })).toBeNull();
  });
  it('a driver TCKN can never be the 11111111111 placeholder', () => {
    expect(isValidDriverTckn('11111111111', SPECIALS)).toBe(false);
    expect(isValidDriverTckn('11084871202', SPECIALS)).toBe(true);
  });
});

describe('validateTaxId (party rules)', () => {
  it('company parties need VKN or TCKN', () => {
    expect(validateTaxId({ identityType: null, identityNumber: null, partyType: 'company' })).toBe('TAX_ID_REQUIRED_FOR_COMPANY');
    expect(validateTaxId({ identityType: 'ANONYMOUS', partyType: 'company' })).toBe('TAX_ID_REQUIRED_FOR_COMPANY');
    expect(validateTaxId({ identityType: 'TCKN', identityNumber: '11084871202', partyType: 'company' })).toBeNull(); // şahıs şirketi
    expect(validateTaxId({ identityType: 'FOREIGN', identityNumber: 'DE811569869', partyType: 'company' })).toBeNull();
  });
  it('final consumers may stay anonymous but cannot carry a number', () => {
    expect(validateTaxId({ identityType: 'ANONYMOUS', partyType: 'individual' })).toBeNull();
    expect(validateTaxId({ identityType: 'ANONYMOUS', identityNumber: '11084871202', partyType: 'individual' })).toBe('IDENTITY_NUMBER_NOT_ALLOWED');
    expect(validateTaxId({ identityType: 'XYZ', identityNumber: '1' })).toBe('INVALID_IDENTITY_TYPE');
  });
});

describe('format checks', () => {
  it('MERSİS is 16 digits (no VKN containment rule)', () => {
    expect(isValidMersis('0123456789012345')).toBe(true);
    expect(isValidMersis('012345678901234')).toBe(false);
  });
  it('KEP addresses end with .kep.tr', () => {
    expect(isValidKepAddress('firma@hs01.kep.tr')).toBe(true);
    expect(isValidKepAddress('firma@gmail.com')).toBe(false);
  });
  it('postal code: 5 digits starting with the plate code', () => {
    expect(isValidTrPostalCode('34746', '34')).toBe(true);
    expect(isValidTrPostalCode('06680', '6')).toBe(true);
    expect(isValidTrPostalCode('34746', '06')).toBe(false);
    expect(isValidTrPostalCode('99746')).toBe(false);
    expect(isValidTrPostalCode('3474')).toBe(false);
  });
  it('password policy: >= 10 chars and 3 classes', () => {
    expect(isStrongPassword('Sunum2026!')).toBe(true);
    expect(isStrongPassword('123456')).toBe(false);
    expect(isStrongPassword('Acme12345')).toBe(false); // 9 chars
    expect(isStrongPassword('abcdefghij')).toBe(false); // 1 class
    expect(isStrongPassword('abcdefgh12')).toBe(false); // 2 classes
    expect(isStrongPassword('Abcdefgh12')).toBe(true);
  });
});

describe('todayKey (company time zone)', () => {
  it('22:30 UTC is already the next day in Istanbul (01:30 TRT)', () => {
    const now = new Date('2026-12-31T22:30:00Z');
    expect(todayKey('Europe/Istanbul', now)).toBe('2027-01-01');
    expect(todayKey('UTC', now)).toBe('2026-12-31');
    expect(todayKey('America/New_York', now)).toBe('2026-12-31');
  });
  it('falls back to Europe/Istanbul for an invalid zone', () => {
    expect(todayKey('Not/AZone', new Date('2026-06-01T21:30:00Z'))).toBe('2026-06-02');
  });
});

describe('legal parameter seeds (509 text)', () => {
  const at = (key: string, date: string) => pickParameter(LEGAL_PARAMETER_SEEDS.filter((p) => p.key === key), date)?.value ?? null;
  it('e-Fatura gross-sales thresholds: 5M for 2018-2020, 4M for 2021, 3M from 2022 (509 IV.1.4(a)(1), 535 SN)', () => {
    expect([2018, 2019, 2020, 2021, 2022, 2025].map((y) => at('EFATURA_GROSS_SALES_THRESHOLD', `${y}-12-31`))).toEqual([5e6, 5e6, 5e6, 4e6, 3e6, 3e6]);
  });
  it('e-Irsaliye thresholds: 25M for 2018-2020, 10M from 2021 (509 IV.3.5(7))', () => {
    expect([2018, 2020, 2021, 2026].map((y) => at('EIRSALIYE_GROSS_SALES_THRESHOLD', `${y}-12-31`))).toEqual([25e6, 25e6, 10e6, 10e6]);
  });
  it('3.000 TL paper limit applies from 1/1/2025 (509 IV.2.4.3)', () => {
    expect(at('EARSIV_PAPER_LIMIT_SIMPLE', '2025-03-01')).toBe(3000);
    expect(at('EARSIV_PAPER_LIMIT_SIMPLE', '2027-01-01')).toBeNull();
  });
});

describe('computeObligations', () => {
  const thresholds: Record<string, [number, number, number][]> = {
    EF: [[2018, 2020, 5_000_000], [2021, 2021, 4_000_000], [2022, 9999, 3_000_000]],
    EI: [[2018, 2020, 25_000_000], [2021, 9999, 10_000_000]],
  };
  const lookup = (rows: [number, number, number][]) => (y: number) => rows.find(([a, b]) => y >= a && y <= b)?.[2] ?? null;
  const params: ObligationParams = {
    eFaturaThreshold: lookup(thresholds.EF),
    eIrsaliyeThreshold: lookup(thresholds.EI),
    allInvoicesElectronicFrom: { BILANCO: '2026-01-01', ISLETME: '2027-01-01', BASIT: '2027-01-01' },
    paperInvoiceLimit: { amount: 3000, until: '2026-12-31' },
    thresholdStartMonthDay: '07-01',
    transitionMonths: 4,
    toleranceDayEFatura: 7,
    sectorRules: EBELGE_SECTOR_RULES_SEED as SectorRule[],
    gibNoticeMinMonths: 3,
  };

  it('2021 turnover of 4.5M -> e-Fatura from 1/7/2022; 2022 turnover of 3.5M -> from 1/7/2023', () => {
    const a = computeObligations({ annualGrossSales: [{ year: 2021, amount: 4_500_000 }] }, 'BILANCO', '2022-01-15', params);
    expect(a.eFatura.mandatoryFrom).toBe('2022-07-01');
    const b = computeObligations({ annualGrossSales: [{ year: 2022, amount: 3_500_000 }] }, 'BILANCO', '2023-01-15', params);
    expect(b.eFatura.mandatoryFrom).toBe('2023-07-01');
  });

  it('sector licence (EPDK, e-Fatura and e-Irsaliye): first day of the 4th month after the licence month', () => {
    const r = computeObligations(
      { sectorFlagsEFatura: [{ code: 'EPDK_OTV1_LICENSE', since: '2026-02-10' }], sectorFlagsEIrsaliye: [{ code: 'EPDK_OTV1_LICENSE', since: '2026-02-10' }] },
      'BILANCO',
      '2026-03-01',
      params,
    );
    expect(r.eFatura.mandatoryFrom).toBe('2026-06-01');
    expect(r.eIrsaliye.mandatoryFrom).toBe('2026-06-01');
  });

  it('hal trader: e-Fatura within 3 months of starting, e-Irsaliye from the 4th month', () => {
    const r = computeObligations(
      { sectorFlagsEFatura: [{ code: 'HAL_TRADER', since: '2026-02-10' }], sectorFlagsEIrsaliye: [{ code: 'HAL_TRADER', since: '2026-02-10' }] },
      'ISLETME',
      '2026-03-01',
      params,
    );
    expect(r.eFatura.mandatoryFrom).toBe('2026-05-10');
    expect(r.eIrsaliye.mandatoryFrom).toBe('2026-06-01');
  });

  it('online seller: only with 500k TL turnover (2022+), from 1 July of the following year', () => {
    const flag = { sectorFlagsEFatura: [{ code: 'ECOMMERCE_SELLER', since: '2023-05-01' }] };
    const small = computeObligations({ ...flag, annualGrossSales: [{ year: 2025, amount: 400_000 }] }, 'ISLETME', '2026-03-01', params);
    expect(small.eFatura.mandatoryFrom).toBeNull();
    const big = computeObligations({ ...flag, annualGrossSales: [{ year: 2025, amount: 600_000 }] }, 'ISLETME', '2026-03-01', params);
    expect(big.eFatura.mandatoryFrom).toBe('2026-07-01');
    expect(big.eFatura.reason).toBe('SECTOR:ECOMMERCE_SELLER:2025');
  });

  it('construction steel tracking needs 1M TL turnover; iron and steel does not apply to BASIT', () => {
    const r = computeObligations(
      { annualGrossSales: [{ year: 2025, amount: 1_200_000 }], sectorFlagsEIrsaliye: [{ code: 'CONSTRUCTION_STEEL_TRACKING', since: '2025-01-01' }] },
      'BILANCO',
      '2026-01-15',
      params,
    );
    expect(r.eIrsaliye.mandatoryFrom).toBe('2026-04-01');
    const basit = computeObligations({ sectorFlagsEIrsaliye: [{ code: 'IRON_STEEL', since: '2026-01-05' }] }, 'BASIT', '2026-02-01', params);
    expect(basit.eIrsaliye.mandatoryFrom).toBeNull();
  });

  it('unknown sector codes and GIB written notices', () => {
    const r = computeObligations({ sectorFlagsEIrsaliye: [{ code: 'FOOD_WHOLESALE', since: '2026-01-05' }], gibWrittenNoticeDate: '2026-09-15' }, 'BILANCO', '2026-10-01', params);
    expect(r.eIrsaliye.mandatoryFrom).toBeNull();
    expect(r.warnings).toContain('SECTOR_RULE_MISSING:EIRSALIYE:FOOD_WHOLESALE');
    expect(r.eFatura.mandatoryFrom).toBe('2026-12-15');
    expect(r.eFatura.reason).toBe('GIB_NOTICE');
    expect(r.warnings).toContain('GIB_NOTICE_CHECK_LETTER');
  });

  it('2025 gross sales of 3M TL -> e-Fatura from 1 July 2026', () => {
    const r = computeObligations({ annualGrossSales: [{ year: 2025, amount: 3_000_000 }] }, 'ISLETME', '2026-03-01', params);
    expect(r.eFatura.mandatoryFrom).toBe('2026-07-01');
    expect(r.eFatura.reason).toBe('THRESHOLD:2025');
    expect(r.eFatura.status).toBe('mandatory');
    expect(r.eArsiv.mandatoryFrom).toBe('2026-07-01');
    expect(r.eIrsaliye.mandatoryFrom).toBeNull();
    expect(r.eFatura.toleranceUntil).toBe('2026-07-07');
  });

  it('2025 gross sales of 10M TL -> e-İrsaliye from 1 July 2026', () => {
    const r = computeObligations({ annualGrossSales: [{ year: 2025, amount: 10_000_000 }] }, 'BILANCO', '2026-06-15', params);
    expect(r.eIrsaliye.mandatoryFrom).toBe('2026-07-01');
    expect(r.eIrsaliye.status).toBe('upcoming');
    expect(r.eIrsaliye.daysLeft).toBe(16);
    expect(r.eIrsaliye.toleranceUntil).toBe('2026-07-31');
  });

  it('below thresholds: BASIT keeps paper invoices until 31.12.2026, BILANCO does not', () => {
    const small = { annualGrossSales: [{ year: 2025, amount: 900_000 }] };
    const basit = computeObligations(small, 'BASIT', '2026-10-15', params);
    expect(basit.paperInvoice).toEqual({ allowed: true, until: '2026-12-31', limit: 3000 });
    expect(basit.eArsiv.mandatoryFrom).toBe('2027-01-01');
    expect(basit.eFatura.status).toBe('not_required');
    const bilanco = computeObligations(small, 'BILANCO', '2026-10-15', params);
    expect(bilanco.paperInvoice.allowed).toBe(false);
    expect(bilanco.eArsiv.mandatoryFrom).toBe('2026-01-01');
    expect(bilanco.eArsiv.status).toBe('overdue');
  });

  it('e-commerce intermediary -> obligation regardless of turnover, within 3 months of starting', () => {
    const r = computeObligations(
      { annualGrossSales: [{ year: 2025, amount: 50_000 }], sectorFlagsEFatura: [{ code: 'ECOMMERCE_INTERMEDIARY', since: '2026-02-10' }] },
      'ISLETME',
      '2026-03-01',
      params,
    );
    expect(r.eFatura.mandatoryFrom).toBe('2026-05-10');
    expect(r.eFatura.reason).toBe('SECTOR:ECOMMERCE_INTERMEDIARY');
  });

  it('declared use, corporate events and warnings', () => {
    const r = computeObligations(
      { annualGrossSales: [{ year: 2024, amount: 20_000_000 }], eFaturaSince: '2025-07-01', corporateEvents: [{ type: 'MERGER', date: '2026-08-20', counterpartyMandatory: true }] },
      null,
      '2026-10-15',
      params,
    );
    expect(r.eFatura.status).toBe('active');
    expect(r.eIrsaliye.mandatoryFrom).toBe('2025-07-01');
    expect(r.eIrsaliye.status).toBe('overdue');
    expect(r.warnings).toContain('BOOKKEEPING_TYPE_MISSING');
    expect(r.warnings).toContain('GROSS_SALES_MISSING:2025');
  });

  it('reports a missing threshold parameter instead of guessing', () => {
    const r = computeObligations({ annualGrossSales: [{ year: 2017, amount: 9_000_000 }, { year: 2025, amount: 1 }] }, 'BILANCO', '2026-10-15', params);
    expect(r.warnings).toContain('THRESHOLD_PARAM_MISSING:EFATURA:2017');
  });

  it('merger with an obliged taxpayer: 3 months from the start of the month after registration (e-Fatura only)', () => {
    const r = computeObligations({ corporateEvents: [{ type: 'MERGER', date: '2026-02-10', counterpartyMandatory: true }] }, 'BILANCO', '2026-03-01', params);
    expect(r.eFatura.mandatoryFrom).toBe('2026-06-01');
    expect(r.eIrsaliye.mandatoryFrom).toBeNull();
  });
});

describe('date helpers', () => {
  it('addMonths clamps to the end of month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('company day boundaries in UTC (Europe/Istanbul is UTC+3)', () => {
    expect(zonedDayStart('2026-10-15', 'Europe/Istanbul').toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(zonedDayEnd('2026-10-15', 'Europe/Istanbul').toISOString()).toBe('2026-10-15T21:00:00.000Z');
    expect(zonedDayStart('2026-03-29', 'Europe/Berlin').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(zonedDayStart('2026-03-30', 'Europe/Berlin').toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });
});
