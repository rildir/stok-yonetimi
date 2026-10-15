import {
  checkCategoryRules,
  effectiveExpiryType,
  fiscalYearPeriods,
  generateGtin13,
  gs1Date,
  isValidGtin,
  looksLikeGs1,
  lotNumberWarning,
  normalizeExpiryDate,
  parseGs1ElementString,
  restrictedGs1Prefix,
} from '../tr';

const NOW = new Date(Date.UTC(2026, 9, 15));
const GS = '\u001d';

describe('GS1 element strings (R69)', () => {
  it('parses the human readable form with AIs 01 / 10 / 17 / 21', () => {
    const r = parseGs1ElementString('(01)08691234000014(17)271231(10)L2610-UL18(21)SN-0042', NOW);
    expect(r).toMatchObject({ gtin: '08691234000014', expiryDate: '2027-12-31', lot: 'L2610-UL18', serial: 'SN-0042', errors: [] });
  });

  it('parses the raw scanner form with FNC1 (GS) separators and a symbology identifier', () => {
    const r = parseGs1ElementString(`]C1010869123400001411260901${GS}10L2609${GS}17270000${GS}3103001250`, NOW);
    expect(r.gtin).toBe('08691234000014');
    expect(r.productionDate).toBe('2026-09-01');
    expect(r.lot).toBe('L2609');
    // DD = 00 -> last day of the month
    expect(r.expiryDate).toBeNull();
    expect(r.errors).toContain('DATE_INVALID:17');
    expect(r.netWeightKg).toBe(1.25);
  });

  it('applies the DD=00 rule and the century window', () => {
    expect(gs1Date('270200', NOW)).toBe('2027-02-28');
    expect(gs1Date('280200', NOW)).toBe('2028-02-29');
    expect(gs1Date('991231', NOW)).toBe('1999-12-31');
    expect(gs1Date('761231', NOW)).toBe('2076-12-31');
    expect(gs1Date('261332', NOW)).toBeNull();
  });

  it('rejects a GTIN with a wrong check digit and stops at an unknown AI', () => {
    const r = parseGs1ElementString('(01)08691234000015(10)A', NOW);
    expect(r.gtin).toBeNull();
    expect(r.errors[0]).toMatch(/GTIN_INVALID/);
    expect(parseGs1ElementString('9912345', NOW).errors[0]).toMatch(/UNKNOWN_AI/);
    expect(looksLikeGs1('8690000000000')).toBe(false);
    expect(looksLikeGs1('(01)08691234000014')).toBe(true);
  });

  it('generates GTIN-13 from the company prefix and flags restricted prefixes', () => {
    const g = generateGtin13('8691234', 1)!;
    expect(g).toBe('8691234000014');
    expect(isValidGtin(g)).toBe(true);
    expect(generateGtin13('8691234', 100000)).toBeNull();
    expect(restrictedGs1Prefix('2012345678905')).toBe('20');
    expect(restrictedGs1Prefix('0412345678903')).toBe('04');
    expect(restrictedGs1Prefix('02912345678906')).toBe('29');
    expect(restrictedGs1Prefix('8691234000014')).toBeNull();
  });
});

describe('Food rules (Tebliğ 2026/11, Gıda Etiketleme Yön.)', () => {
  it('month / year precision means the last day of the month / year', () => {
    expect(normalizeExpiryDate('2027-02', 'month')).toBe('2027-02-28');
    expect(normalizeExpiryDate('2027-02-10', 'month')).toBe('2027-02-28');
    expect(normalizeExpiryDate('2027', 'year')).toBe('2027-12-31');
    expect(normalizeExpiryDate('2027-02-10', 'day')).toBe('2027-02-10');
    expect(normalizeExpiryDate('', 'day')).toBeNull();
  });

  it('food without an explicit type is use-by; lot prefix is a warning only', () => {
    expect(effectiveExpiryType({ regulatoryCategory: 'food' })).toBe('use_by');
    expect(effectiveExpiryType({ regulatoryCategory: 'food', expiryType: 'best_before' })).toBe('best_before');
    expect(effectiveExpiryType({ regulatoryCategory: 'none' })).toBeNull();
    expect(lotNumberWarning('2610-A', 'food')).toBe('LOT_PREFIX_RECOMMENDED');
    expect(lotNumberWarning('L2610-A', 'food')).toBeNull();
    expect(lotNumberWarning('2610-A', 'none')).toBeNull();
  });

  it('food requires lot tracking and expiry', () => {
    expect(checkCategoryRules({ regulatoryCategory: 'food', trackingType: 'serial', hasExpiry: true }, ['food']).map((i) => i.code)).toEqual(['LOT_REQUIRED_FOR_CATEGORY']);
  });
});

describe('Fiscal periods', () => {
  it('year + 4 quarters, also for a special fiscal year', () => {
    const cal = fiscalYearPeriods(2026);
    expect(cal.map((p) => [p.quarter, p.startDate, p.endDate])).toEqual([
      [0, '2026-01-01', '2026-12-31'],
      [1, '2026-01-01', '2026-03-31'],
      [2, '2026-04-01', '2026-06-30'],
      [3, '2026-07-01', '2026-09-30'],
      [4, '2026-10-01', '2026-12-31'],
    ]);
    const special = fiscalYearPeriods(2026, 7);
    expect(special[0]).toMatchObject({ startDate: '2026-07-01', endDate: '2027-06-30' });
    expect(special[4]).toMatchObject({ startDate: '2027-04-01', endDate: '2027-06-30' });
  });
});
