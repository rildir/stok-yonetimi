import {
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
  todayKey,
  validateTaxId,
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

describe('computeObligations', () => {
  const thresholds: Record<string, [number, number, number][]> = {
    EF: [[2018, 2021, 5_000_000], [2022, 2022, 4_000_000], [2023, 9999, 3_000_000]],
    EI: [[2019, 2020, 25_000_000], [2021, 9999, 10_000_000]],
  };
  const lookup = (rows: [number, number, number][]) => (y: number) => rows.find(([a, b]) => y >= a && y <= b)?.[2] ?? null;
  const params: ObligationParams = {
    eFaturaThreshold: lookup(thresholds.EF),
    eIrsaliyeThreshold: lookup(thresholds.EI),
    allInvoicesElectronicFrom: { BILANCO: '2026-01-01', ISLETME: '2027-01-01', BASIT: '2027-01-01' },
    paperInvoiceLimit: { amount: 3000, until: '2026-12-31' },
    thresholdStartMonthDay: '07-01',
    transitionMonths: 3,
    toleranceDayEFatura: 7,
  };

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

  it('e-commerce intermediary -> obligation regardless of turnover', () => {
    const r = computeObligations(
      { annualGrossSales: [{ year: 2025, amount: 50_000 }], sectorFlagsEFatura: [{ code: 'ECOMMERCE_INTERMEDIARY', since: '2026-02-10' }] },
      'ISLETME',
      '2026-03-01',
      params,
    );
    expect(r.eFatura.mandatoryFrom).toBe('2026-05-01');
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
});
