import { allocate, invoiceTypeHint, priceDocument, priceWithWithholdingThreshold, round2 } from './tax';

/** Deterministic PRNG (mulberry32) for the property-based checks. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATES = [0, 1, 10, 20];

describe('tax engine: line maths (R14)', () => {
  it('property: with VAT-inclusive prices round2(quantity x unitPrice) == net and gross is kept within a cent', () => {
    const r = rng(20261015);
    for (let i = 0; i < 2000; i++) {
      const qty = Math.round(r() * 5000) / (r() < 0.5 ? 1 : 1000); // pieces or kg with 3 decimals
      const price = Math.round(r() * 1000000) / 100;
      const rate = RATES[Math.floor(r() * RATES.length)];
      if (qty <= 0) continue;
      const l = priceDocument({ lines: [{ quantity: qty, unitPrice: price, taxRate: rate, exemptionCode: rate ? null : '351' }], pricesIncludeTax: true }).lines[0];
      expect(round2(l.quantity * l.unitPrice)).toBe(l.netAmount);
      expect(l.netAmount + l.taxAmount).toBeCloseTo(l.lineTotal, 2);
      // the derived net unit price may only shift the gross total by rounding (at most a cent per started 10 000 units)
      expect(round2(Math.abs(l.lineTotal - round2(qty * price)))).toBeLessThanOrEqual(round2(0.01 * Math.max(1, Math.ceil(qty / 10000))));
    }
  });

  it('property: with net prices net = round2(quantity x unitPrice) and VAT = round2(net x rate)', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const qty = Math.round(r() * 100000) / 1000;
      const price = Math.round(r() * 10000000) / 1e6;
      const rate = RATES[Math.floor(r() * RATES.length)];
      const l = priceDocument({ lines: [{ quantity: qty, unitPrice: price, taxRate: rate }], pricesIncludeTax: false }).lines[0];
      expect(l.netAmount).toBe(round2(qty * l.unitPrice));
      expect(l.taxAmount).toBe(round2((l.netAmount * rate) / 100));
    }
  });

  it('applies the line discount before VAT (KDVK 24/a)', () => {
    const d = priceDocument({ lines: [{ quantity: 10, unitPrice: 100, taxRate: 20, discountRate: 15 }], pricesIncludeTax: false });
    expect(d.lines[0]).toMatchObject({ grossAmount: 1000, discountAmount: 150, netAmount: 850, taxAmount: 170, lineTotal: 1020 });
    const a = priceDocument({ lines: [{ quantity: 10, unitPrice: 100, taxRate: 20, discountAmount: 75, discountRate: 50 }], pricesIncludeTax: false });
    expect(a.lines[0].discountAmount).toBe(75); // amount wins over rate
  });
});

describe('tax engine: document discount on a multi-rate document', () => {
  const doc = priceDocument({
    lines: [
      { quantity: 3, unitPrice: 100, taxRate: 20 }, // 300
      { quantity: 1, unitPrice: 200, taxRate: 10 }, // 200
      { quantity: 7, unitPrice: 14.29, taxRate: 1 }, // 100.03
    ],
    documentDiscountAmount: 100,
    pricesIncludeTax: false,
  });

  it('splits the discount pro rata and exactly', () => {
    const shares = doc.lines.map((l) => l.documentDiscountShare);
    expect(round2(shares.reduce((a, b) => a + b, 0))).toBe(100);
    expect(shares[0]).toBeCloseTo((100 * 300) / 600.03, 1);
    expect(shares[1]).toBeCloseTo((100 * 200) / 600.03, 1);
    expect(doc.documentDiscountAmount).toBe(100);
    expect(doc.subtotal).toBe(500.03);
  });

  it('taxes each rate on its discounted base and reports the breakdown', () => {
    for (const l of doc.lines) expect(l.taxAmount).toBe(round2((l.netAmount * l.taxRate) / 100));
    expect(doc.breakdown.map((b) => b.rate)).toEqual([20, 10, 1]);
    expect(round2(doc.breakdown.reduce((s, b) => s + b.base, 0))).toBe(doc.subtotal);
    expect(round2(doc.breakdown.reduce((s, b) => s + b.tax, 0))).toBe(doc.taxTotal);
    expect(doc.grandTotal).toBe(round2(doc.subtotal + doc.taxTotal));
  });

  it('allocate() always sums to the total', () => {
    const r = rng(42);
    for (let i = 0; i < 500; i++) {
      const total = Math.round(r() * 100000) / 100;
      const w = Array.from({ length: 1 + Math.floor(r() * 6) }, () => r() * 1000);
      expect(round2(allocate(total, w).reduce((a, b) => a + b, 0))).toBe(total);
    }
  });
});

describe('tax engine: charges (KDVK 24/b)', () => {
  it('a single-rate document taxes charges at that rate', () => {
    const d = priceDocument({ lines: [{ quantity: 1, unitPrice: 1000, taxRate: 10 }], charges: [{ type: 'SHIPPING', amount: 50 }], pricesIncludeTax: false });
    expect(d.charges[0]).toMatchObject({ amount: 50, taxAmount: 5, lineTotal: 55 });
    expect(d.subtotal).toBe(1050);
    expect(d.taxTotal).toBe(105);
  });

  it('a multi-rate document splits charges pro rata over the rate groups', () => {
    const d = priceDocument({
      lines: [
        { quantity: 1, unitPrice: 750, taxRate: 20 },
        { quantity: 1, unitPrice: 250, taxRate: 10 },
      ],
      charges: [{ type: 'PACKAGING', amount: 40 }],
      pricesIncludeTax: false,
    });
    const al = d.charges[0].allocations;
    expect(al.map((a) => [a.taxRate, a.netAmount])).toEqual([[20, 30], [10, 10]]);
    expect(d.charges[0].taxAmount).toBe(7);
    expect(d.breakdown.find((b) => b.rate === 20)!.base).toBe(780);
  });
});

describe('tax engine: withholding threshold (VUK 232, 2026: 12.000 TL VAT incl.)', () => {
  const LIMIT = 12000;
  const line = (gross: number) => ({ quantity: 1, unitPrice: gross, taxRate: 20, withholdingRate: 50, withholdingCode: '627' });

  it('11.999 TL: no withholding', () => {
    const r = priceWithWithholdingThreshold({ lines: [line(11999)], pricesIncludeTax: true }, LIMIT);
    expect(r.withholdingApplied).toBe(false);
    expect(r.doc.withheldTaxTotal).toBe(0);
    expect(r.doc.payableTotal).toBe(11999);
  });

  it('exactly 12.000 TL: not above the limit, no withholding', () => {
    expect(priceWithWithholdingThreshold({ lines: [line(12000)], pricesIncludeTax: true }, LIMIT).withholdingApplied).toBe(false);
  });

  it('12.001 TL: 5/10 of the VAT is withheld', () => {
    const r = priceWithWithholdingThreshold({ lines: [line(12001)], pricesIncludeTax: true }, LIMIT);
    expect(r.withholdingApplied).toBe(true);
    const vat = r.doc.taxTotal;
    expect(r.doc.withheldTaxTotal).toBe(round2(vat / 2));
    expect(r.doc.payableTotal).toBe(round2(r.doc.grandTotal - r.doc.withheldTaxTotal));
    expect(invoiceTypeHint(r.doc)).toBe('TEVKIFAT');
  });

  it('acceptance: 12.500 TL iron-steel sale -> 5/10 withheld (net 10.416,67 VAT 2.083,33 withheld 1.041,67)', () => {
    const r = priceWithWithholdingThreshold({ lines: [line(12500)], pricesIncludeTax: true }, LIMIT);
    expect(r.doc).toMatchObject({ subtotal: 10416.67, taxTotal: 2083.33, withheldTaxTotal: 1041.67, grandTotal: 12500, payableTotal: 11458.33 });
  });

  it('compares the TRY equivalent of a foreign-currency document', () => {
    const usd = { lines: [{ quantity: 1, unitPrice: 250, taxRate: 20, withholdingRate: 50 }], pricesIncludeTax: false };
    // 250 + 50 VAT = 300 USD
    expect(priceWithWithholdingThreshold(usd, LIMIT, 39.99).withholdingApplied).toBe(false); // 11.997 TL
    expect(priceWithWithholdingThreshold(usd, LIMIT, 40.01).withholdingApplied).toBe(true); // 12.003 TL
  });

  it('full (8xx) withholding ignores the limit', () => {
    const r = priceWithWithholdingThreshold(
      { lines: [{ quantity: 1, unitPrice: 100, taxRate: 20, withholdingRate: 100, withholdingThresholdExempt: true }], pricesIncludeTax: false },
      LIMIT,
    );
    expect(r.doc.withheldTaxTotal).toBe(20);
    expect(r.doc.payableTotal).toBe(100);
  });
});

describe('tax engine: exemptions', () => {
  it('701 ihraç kayıtlı: VAT is calculated but not added to the grand total', () => {
    const d = priceDocument({ lines: [{ quantity: 10, unitPrice: 100, taxRate: 20, exemptionCode: '701', vatNotCollected: true }], pricesIncludeTax: false });
    expect(d.taxTotal).toBe(200);
    expect(d.notCollectedTaxTotal).toBe(200);
    expect(d.grandTotal).toBe(1000);
    expect(d.payableTotal).toBe(1000);
    expect(invoiceTypeHint(d)).toBe('IHRACKAYITLI');
  });

  it('701 with tax-inclusive company prices: the entered price is not reduced by the uncollected VAT', () => {
    const d = priceDocument({ lines: [{ quantity: 1, unitPrice: 1000, taxRate: 20, exemptionCode: '701', vatNotCollected: true }], pricesIncludeTax: true });
    expect(d.lines[0].netAmount).toBe(1000);
    expect(d.grandTotal).toBe(1000);
  });

  it('a fully exempt line (301) has no VAT and makes an ISTISNA invoice', () => {
    const d = priceDocument({ lines: [{ quantity: 2, unitPrice: 500, taxRate: 0, exemptionCode: '301' }], pricesIncludeTax: true });
    expect(d.taxTotal).toBe(0);
    expect(d.grandTotal).toBe(1000);
    expect(d.breakdown[0]).toMatchObject({ rate: 0, exemptionCode: '301', base: 1000 });
    expect(invoiceTypeHint(d)).toBe('ISTISNA');
  });

  it('ÖTV is part of the VAT base (KDVK 24/b)', () => {
    const d = priceDocument({ lines: [{ quantity: 1, unitPrice: 1000, taxRate: 20, otvRate: 25 }], pricesIncludeTax: false });
    expect(d.lines[0]).toMatchObject({ netAmount: 1000, otvAmount: 250, taxAmount: 250, lineTotal: 1500 });
    expect(d.grandTotal).toBe(1500);
  });
});
