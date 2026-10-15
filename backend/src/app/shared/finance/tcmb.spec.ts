import * as fs from 'fs';
import * as path from 'path';
import { parseTcmbXml, selectTaxFxRate, tcmbBulletinPath, TaxRateRow } from './currency';

/** Fixture: TCMB today.xml of 14.10.2026 (bulletin 2026/194), saved unchanged. */
const xml = fs.readFileSync(path.join(__dirname, '__fixtures__', 'tcmb-today.xml'), 'utf8');

describe('TCMB bulletin parser', () => {
  const b = parseTcmbXml(xml);

  it('reads the bulletin date and number', () => {
    expect(b.date).toBe('2026-10-14');
    expect(b.bulletinNo).toBe('2026/194');
  });

  it('reads forex buying / selling per currency', () => {
    const usd = b.rates.find((r) => r.currency === 'USD')!;
    expect(usd.forexBuying).toBe(49.3041);
    expect(usd.forexSelling).toBe(49.3929);
    expect(b.rates.find((r) => r.currency === 'EUR')!.forexBuying).toBeGreaterThan(0);
    expect(b.rates.length).toBeGreaterThan(15);
  });

  it('normalises currencies quoted per 100 units (JPY) to 1 unit', () => {
    const jpy = b.rates.find((r) => r.currency === 'JPY')!;
    expect(jpy.forexBuying).toBeLessThan(1);
    const raw = /Kod="JPY"[\s\S]*?<ForexBuying>([0-9.]+)<\/ForexBuying>/.exec(xml)![1];
    expect(jpy.forexBuying).toBeCloseTo(Number(raw) / 100, 6);
  });

  it('skips empty values (XDR has no forex buying)', () => {
    for (const r of b.rates) if (r.forexBuying !== null) expect(r.forexBuying).toBeGreaterThan(0);
  });

  it('rejects other documents', () => {
    expect(() => parseTcmbXml('<html>error</html>')).toThrow('TCMB_XML_INVALID');
  });

  it('builds the archive path', () => {
    expect(tcmbBulletinPath('2026-10-14')).toBe('202610/14102026.xml');
  });
});

describe('tax-point exchange rate (KDVK 26)', () => {
  const rows: TaxRateRow[] = [
    { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 49.1, date: '2026-10-13', source: 'TCMB', rateType: 'FOREX_BUYING' },
    { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 49.3041, date: '2026-10-14', source: 'TCMB', rateType: 'FOREX_BUYING' },
    { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 49.39, date: '2026-10-14', source: 'TCMB', rateType: 'FOREX_SELLING' },
    { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 50, date: '2026-10-15', source: 'MANUAL', rateType: 'FOREX_BUYING' },
    { baseCurrency: 'TRY', quoteCurrency: 'EUR', rate: 0.0175, date: '2026-10-14', source: 'MANUAL', rateType: 'FOREX_BUYING' },
  ];

  it('uses the previous bulletin (D-1) when configured', () => {
    expect(selectTaxFxRate(rows, 'USD', '2026-10-15', true)).toEqual({ rate: 49.3041, date: '2026-10-14', source: 'TCMB' });
  });

  it('uses the same-day rate otherwise', () => {
    expect(selectTaxFxRate(rows, 'USD', '2026-10-15', false)).toEqual({ rate: 50, date: '2026-10-15', source: 'MANUAL' });
  });

  it('never uses selling, inverse or cross rates', () => {
    expect(selectTaxFxRate(rows, 'EUR', '2026-10-15', true)).toBeNull();
    expect(selectTaxFxRate(rows.filter((r) => r.rateType === 'FOREX_SELLING'), 'USD', '2026-10-15', true)).toBeNull();
  });

  it('prefers TCMB over a manual rate of the same day; TRY is 1', () => {
    const both: TaxRateRow[] = [
      { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 48, date: '2026-10-14', source: 'MANUAL', rateType: 'FOREX_BUYING' },
      { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 49.3041, date: '2026-10-14', source: 'TCMB', rateType: 'FOREX_BUYING' },
    ];
    expect(selectTaxFxRate(both, 'USD', '2026-10-15', true)!.source).toBe('TCMB');
    expect(selectTaxFxRate(both, 'TRY', '2026-10-15', true)).toEqual({ rate: 1, date: '2026-10-15', source: 'BASE' });
  });
});
