import { calculateLine, calculateTotals, round2 } from './tax';
import { convertAmount, findRate, RateRow } from './currency';

describe('tax calculation', () => {
  it('adds tax on top of net prices', () => {
    const l = calculateLine({ quantity: 3, unitPrice: 100, taxRate: 20 }, false);
    expect(l).toEqual({ unitPrice: 100, taxRate: 20, netAmount: 300, taxAmount: 60, lineTotal: 360 });
  });

  it('extracts tax from tax-inclusive prices and preserves the gross total', () => {
    const l = calculateLine({ quantity: 2, unitPrice: 29.99, taxRate: 20 }, true);
    expect(l.lineTotal).toBe(59.98);
    expect(l.netAmount).toBe(49.98);
    expect(l.taxAmount).toBe(10);
    expect(round2(l.netAmount + l.taxAmount)).toBe(l.lineTotal);
    expect(l.unitPrice).toBe(24.99);
  });

  it('handles zero tax', () => {
    expect(calculateLine({ quantity: 5, unitPrice: 9.99, taxRate: 0 }, true)).toEqual({
      unitPrice: 9.99, taxRate: 0, netAmount: 49.95, taxAmount: 0, lineTotal: 49.95,
    });
  });

  it('totals documents with a per-rate breakdown', () => {
    const lines = [
      calculateLine({ quantity: 1, unitPrice: 100, taxRate: 20 }, false),
      calculateLine({ quantity: 2, unitPrice: 50, taxRate: 10 }, false),
      calculateLine({ quantity: 1, unitPrice: 10, taxRate: 20 }, false),
    ];
    const t = calculateTotals(lines);
    expect(t.subtotal).toBe(210);
    expect(t.taxTotal).toBe(32);
    expect(t.grandTotal).toBe(242);
    expect(t.breakdown).toEqual([
      { rate: 20, base: 110, tax: 22 },
      { rate: 10, base: 100, tax: 10 },
    ]);
  });

  it('rounds half away from zero', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
  });
});

describe('currency conversion', () => {
  const rates: RateRow[] = [
    { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 30, date: '2026-01-01' },
    { baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 40, date: '2026-10-01' },
    { baseCurrency: 'EUR', quoteCurrency: 'TRY', rate: 45, date: '2026-10-01' },
  ];

  it('is identity for the same currency', () => {
    expect(findRate([], 'TRY', 'TRY')).toBe(1);
    expect(convertAmount(12.34, 'EUR', 'EUR', [])).toBe(12.34);
  });

  it('uses the latest rate on or before the date', () => {
    expect(convertAmount(10, 'USD', 'TRY', rates, '2026-10-14')).toBe(400);
    expect(convertAmount(10, 'USD', 'TRY', rates, '2026-05-01')).toBe(300);
    expect(convertAmount(10, 'USD', 'TRY', rates, '2025-12-31')).toBeNull();
  });

  it('inverts a rate when only the opposite pair exists', () => {
    expect(convertAmount(400, 'TRY', 'USD', rates, '2026-10-14')).toBe(10);
  });

  it('triangulates through the base currency', () => {
    // 1 EUR = 45 TRY, 1 USD = 40 TRY  =>  1 EUR = 1.125 USD
    expect(findRate(rates, 'EUR', 'USD', '2026-10-14', 'TRY')).toBeCloseTo(1.125, 6);
    expect(convertAmount(100, 'EUR', 'USD', rates, '2026-10-14', 'TRY')).toBe(112.5);
  });

  it('returns null when no path exists', () => {
    expect(convertAmount(1, 'GBP', 'TRY', rates, '2026-10-14', 'TRY')).toBeNull();
  });
});
