import { allocateLandedCost, averageCost, consumeLayers, CostLayer, layerTotals, periodicAverage, reconcileParts, replay, splitLandedShare } from './costing';
import { evaluateImpairment, shiftMonth } from './impairment';
import { accountingEvent, buildJournal, DEFAULT_ACCOUNT_RULES, pickRule } from './journal';
import { discountReferencePrice } from './price-reference';
import { distributeWithholding, groupVatLines, totalsOf, VatLine, vatSummary } from './vat-report';
import { buildCsv } from './xlsx';

const layer = (qty: number, unitCost: number, at: string, extra: Partial<CostLayer> = {}): CostLayer => ({ qtyIn: qty, qtyRemaining: qty, unitCost, receivedAt: at, ...extra });

describe('WP6 costing (VUK 274)', () => {
  it('FIFO consumes the oldest layers first at their own cost', () => {
    const layers = [layer(10, 5, '2026-01-02'), layer(10, 6, '2026-01-05'), layer(10, 8, '2026-01-01')];
    const r = consumeLayers('FIFO', layers, 15);
    // 2026-01-01 @8 (10) then 2026-01-02 @5 (5)
    expect(r.totalCost).toBe(105);
    expect(r.unitCost).toBe(7);
    expect(r.layers.map((l) => l.qtyRemaining)).toEqual([5, 10, 0]);
    expect(r.shortfall).toBe(0);
    // Remaining value = 5 x 5 + 10 x 6
    expect(layerTotals(r.layers).value).toBe(85);
  });

  it('moving weighted average values the issue at the average and re-prices the rest', () => {
    const layers = [layer(10, 10, '2026-01-01'), layer(30, 14, '2026-01-02')];
    expect(averageCost(layers)).toBe(13);
    const r = consumeLayers('WAVG_MOVING', layers, 20);
    expect(r.totalCost).toBe(260);
    expect(r.unitCost).toBe(13);
    // 20 left at 13 each: value 260 (520 - 260)
    expect(layerTotals(r.layers)).toEqual({ quantity: 20, value: 260 });
    expect(r.layers.filter((l) => l.qtyRemaining > 0).every((l) => l.unitCost === 13)).toBe(true);
  });

  it('specific lot takes the issued lot first, then FIFO', () => {
    const layers = [layer(5, 4, '2026-01-01', { lotNumber: 'A' }), layer(5, 9, '2026-01-03', { lotNumber: 'B' })];
    const r = consumeLayers('SPECIFIC_LOT', layers, 7, { lotNumber: 'B' });
    expect(r.totalCost).toBe(5 * 9 + 2 * 4);
  });

  it('a shortfall (stock without cost layer) is valued at the fallback cost', () => {
    const r = consumeLayers('FIFO', [layer(2, 10, '2026-01-01')], 5, { fallbackUnitCost: 12 });
    expect(r.shortfall).toBe(3);
    expect(r.totalCost).toBe(20 + 36);
  });

  it('a purchase return takes its own receipt layer at that cost (pooled methods too)', () => {
    const layers = [layer(10, 10, '2026-01-01', { movementId: 'in-1' }), layer(10, 20, '2026-01-02', { movementId: 'in-2' })];
    const r = consumeLayers('WAVG_MOVING', layers, 4, { preferMovementId: 'in-2' });
    expect(r.totalCost).toBe(80);
    // Value left = 300 - 80
    expect(layerTotals(r.layers).value).toBe(220);
  });

  it('a sales return re-enters at the cost the goods left with (replay)', () => {
    const res = replay('FIFO', [
      { id: 'p1', quantity: 10, at: '2026-01-01', unitCost: 10 },
      { id: 'p2', quantity: 10, at: '2026-01-02', unitCost: 20 },
      { id: 's1', quantity: -12, at: '2026-01-03' },
      { id: 'r1', quantity: 2, at: '2026-01-04', costFromId: 's1' },
      { id: 't1', quantity: -3, at: '2026-01-05', transfer: true },
    ]);
    const sale = res.costs.get('s1')!;
    expect(sale.totalCost).toBe(-140);
    expect(res.costs.get('r1')).toMatchObject({ unitCost: Math.abs(sale.unitCost), source: 'RETURN' });
    expect(res.costs.get('t1')!.source).toBe('TRANSFER');
    expect(res.layers.reduce((s, l) => s + l.qtyRemaining, 0)).toBe(10);
  });

  it('periodic weighted average = (opening + receipts) / (opening qty + receipts qty)', () => {
    expect(periodicAverage({ quantity: 10, value: 100 }, [{ quantity: 30, value: 420 }])).toBe(13);
    expect(periodicAverage({ quantity: 0, value: 0 }, [])).toBeNull();
  });

  it('landed costs are split exactly (largest remainder) by amount or quantity', () => {
    const lines = [{ key: 'a', quantity: 1, amount: 100 }, { key: 'b', quantity: 1, amount: 100 }, { key: 'c', quantity: 1, amount: 100 }];
    const byAmount = allocateLandedCost(lines, 100, 'AMOUNT');
    expect(byAmount.reduce((s, x) => s + Math.round(x.share * 100), 0)).toBe(10000);
    expect(byAmount.map((x) => x.share).sort()).toEqual([33.33, 33.33, 33.34]);
    const byQty = allocateLandedCost([{ key: 'a', quantity: 3, amount: 1 }, { key: 'b', quantity: 1, amount: 999 }], 1250, 'QUANTITY');
    expect(byQty).toEqual([{ key: 'a', share: 937.5 }, { key: 'b', share: 312.5 }]);
    // Part on goods already issued goes to cost of sales.
    expect(splitLandedShare(100, 10, 4)).toEqual({ toInventory: 40, toCogs: 60 });
  });
});

describe('WP6 impairment (VUK 274/2, 267/1)', () => {
  const base = { quantity: 100, unitCost: 10, valuationMonth: '2026-12' };
  it('10 % decline is the boundary (inclusive)', () => {
    const r = evaluateImpairment({ ...base, sales: [{ month: '2026-12', quantity: 25, amount: 225 }] });
    expect(r).toMatchObject({ emsalBasis: 'M', emsalUnitPrice: 9, declinePct: 10, qualifies: true, taxValue: 900, bookValue: 900, provision: 100 });
    const r2 = evaluateImpairment({ ...base, sales: [{ month: '2026-12', quantity: 25, amount: 225.25 }] });
    expect(r2.qualifies).toBe(false);
    expect(r2.taxValue).toBe(1000);
  });
  it('25 % monthly sales rule: M -> M-1 -> M-2, else takdir komisyonu', () => {
    const sales = [
      { month: '2026-12', quantity: 24.99, amount: 100 },
      { month: '2026-11', quantity: 25, amount: 175 },
      { month: '2026-10', quantity: 90, amount: 100 },
    ];
    const r = evaluateImpairment({ ...base, sales });
    expect(r).toMatchObject({ emsalBasis: 'M-1', emsalMonth: '2026-11', emsalUnitPrice: 7, declinePct: 30, qualifies: true });
    // No sales in M..M-2 and no sign of decline: not a commission case (not every unsold item).
    const none = evaluateImpairment({ ...base, sales: [{ month: '2026-09', quantity: 100, amount: 100 }] });
    expect(none).toMatchObject({ emsalBasis: 'TAKDIR', requiresCommission: false, indication: null, qualifies: false, provision: 0 });
    // A caller's indication (expired / blocked lots) makes it one.
    expect(evaluateImpairment({ ...base, sales: [], indication: 'EXPIRED_LOTS' })).toMatchObject({ requiresCommission: true, indication: 'EXPIRED_LOTS' });
    // Sales far below cost that fail the 25 % quantity condition are a sign of decline too.
    const low = evaluateImpairment({ ...base, sales: [{ month: '2026-12', quantity: 5, amount: 25 }] });
    expect(low).toMatchObject({ emsalBasis: 'TAKDIR', requiresCommission: true, indication: 'PRICE_DECLINE_LOW_VOLUME' });
    expect(shiftMonth('2026-01', -2)).toBe('2025-11');
  });
});

describe('WP6 valuation breakdown reconciliation', () => {
  it('warehouse / lot parts add up to the product quantity', () => {
    // Legacy movements without a warehouse and a ledger gap: Merkez 47, Şube 30, unknown -25.
    const parts = [
      { warehouseId: 'm', quantity: 47 },
      { warehouseId: 's', quantity: 30 },
      { warehouseId: null, quantity: -25 },
    ];
    const r = reconcileParts(parts, 52);
    expect(r.reduce((s, p) => s + p.quantity, 0)).toBe(52);
    expect(r).toEqual([{ warehouseId: 'm', quantity: 22 }, { warehouseId: 's', quantity: 30 }]);
    // Unknown-location stock goes to the largest known part; none known -> one row without warehouse.
    expect(reconcileParts([{ warehouseId: 'm', quantity: 1 }, { warehouseId: null, quantity: 19 }], 20)).toEqual([{ warehouseId: 'm', quantity: 20 }]);
    expect(reconcileParts([{ warehouseId: null, quantity: 7 }], 7)).toEqual([{ warehouseId: null, quantity: 7 }]);
    expect(reconcileParts([{ warehouseId: 'm', quantity: 3 }, { warehouseId: 's', quantity: -1 }], 2)).toEqual([{ warehouseId: 'm', quantity: 2 }]);
    expect(reconcileParts([{ warehouseId: 'm', quantity: 3 }], 0)).toEqual([]);
  });
});

describe('WP6 KDV-2 withholding from the invoice', () => {
  it('spreads the invoice withholding over its VAT lines', () => {
    const r = distributeWithholding([62000, 0, 18000], { total: 40000, subtotals: [{ code: '627', percent: 50, taxable: 80000, amount: 40000 }] });
    expect(r).toEqual({ withheld: [31000, 0, 9000], code: '627', rate: 50 });
    expect(distributeWithholding([20000], { total: 0, subtotals: [] })).toEqual({ withheld: [0], code: null, rate: null });
    expect(distributeWithholding([1, 1, 1], { total: 1, subtotals: [{ code: '601', percent: 40, taxable: 0, amount: 0.5 }, { code: '627', percent: 50, taxable: 0, amount: 0.5 }] })).toEqual({ withheld: [0.33, 0.33, 0.34], code: 'TEVKIFAT', rate: null });
  });
});

describe('WP6 journal export (R52)', () => {
  it('maps movements to accounting events', () => {
    expect(accountingEvent({ type: 'ORDER', reasonCode: 'SALE', quantity: -2 })).toBe('SALE_COGS');
    expect(accountingEvent({ type: 'IN', reasonCode: 'PURCHASE', quantity: 2 })).toBe('PURCHASE');
    expect(accountingEvent({ type: 'RETURN', reasonCode: 'RETURN', quantity: 2 })).toBe('SALES_RETURN');
    expect(accountingEvent({ type: 'TRANSFER_OUT', reasonCode: 'TRANSFER', quantity: -2 })).toBeNull();
    expect(accountingEvent({ type: 'DISPOSAL', reasonCode: 'LOSS_ZAYI', quantity: -1 })).toBe('LOSS');
  });

  it('every voucher balances (debit = credit) and uses the inventory class accounts', () => {
    const r = buildJournal(
      [
        { id: '1', date: '2026-10-01', event: 'PURCHASE', amount: 1000, inventoryClass: 'TICARI_MAL_153', documentType: 'INVOICE', documentNo: 'A1', description: 'alış' },
        { id: '2', date: '2026-10-01', event: 'SALE_COGS', amount: -333.335, inventoryClass: 'MAMUL_152', documentType: 'DESPATCH', documentNo: 'D1', description: 'satış' },
        { id: '3', date: '2026-10-02', event: 'COUNT_SHORTAGE', amount: -12.5, inventoryClass: 'TICARI_MAL_153', documentType: 'STOCK_COUNT', documentNo: 'SC1', description: 'sayım' },
        { id: '4', date: '2026-10-02', event: 'OPENING', amount: 50, description: 'açılış' },
      ],
      DEFAULT_ACCOUNT_RULES,
      { INVOICE: 'invoice' },
      { DESPATCH: 'Sevk İrsaliyesi' },
    );
    for (const v of r.vouchers) {
      expect(v.debitTotal).toBe(v.creditTotal);
      expect(v.lines.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(v.lines.reduce((s, l) => s + l.credit, 0), 2);
    }
    expect(r.debitTotal).toBe(r.creditTotal);
    const cogs = r.vouchers.find((v) => v.documentNo === 'D1')!;
    expect(cogs.lines.map((l) => l.account)).toEqual(['620', '152']);
    expect(cogs.eDefterDocumentType).toBe('other');
    expect(cogs.eDefterDocumentDescription).toBe('Sevk İrsaliyesi');
    expect(r.vouchers.find((v) => v.documentNo === 'A1')!.eDefterDocumentType).toBe('invoice');
    expect(r.skipped).toEqual([{ id: '4', event: 'OPENING', reason: 'DISABLED' }]);
  });

  it('the most specific account rule wins', () => {
    const rules = [...DEFAULT_ACCOUNT_RULES, { event: 'GIFT_SAMPLE', debitAccount: '760.01', creditAccount: '{STOCK}' }, { event: 'GIFT_SAMPLE', warehouseId: 'w1', debitAccount: '760.02', creditAccount: '{STOCK}' }];
    expect(pickRule(rules, 'GIFT_SAMPLE', { warehouseId: 'w1' })!.debitAccount).toBe('760.02');
  });
});

describe('WP6 discount reference price (Fiyat Etiketi Yön., R70)', () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, d, 9)).toISOString();
  const history = [
    { price: 450, validFrom: day(1) },
    { price: 420, validFrom: day(3) },
    { price: 410, validFrom: day(9) },
    { price: 395.5, validFrom: day(14) },
  ];
  it('is the lowest price of the 10 days before the discount', () => {
    // Discount on day 14: window day 4 .. day 14 -> 420 (in force on day 4) and 410.
    expect(discountReferencePrice(history, day(14), { days: 10 })).toMatchObject({ referencePrice: 410, basis: 'LOWEST_IN_WINDOW' });
    // A price older than 10 days is no longer a reference.
    expect(discountReferencePrice(history.slice(0, 2), day(14), { days: 10 }).referencePrice).toBe(420);
    expect(discountReferencePrice([{ price: 450, validFrom: day(1) }, { price: 300, validFrom: day(2) }, { price: 500, validFrom: day(3) }], day(14), { days: 10 }).referencePrice).toBe(500);
  });
  it('perishable goods use the previous price', () => {
    expect(discountReferencePrice(history, day(14), { days: 10, perishable: true })).toMatchObject({ referencePrice: 410, basis: 'PREVIOUS_PRICE' });
    expect(discountReferencePrice([], day(14)).basis).toBe('NO_HISTORY');
  });
});

describe('WP6 KDV pre-report aggregation (R21)', () => {
  const line = (over: Partial<VatLine>): VatLine => ({
    kind: 'SALE', documentId: 'i1', documentNo: 'A1', documentDate: '2026-10-01', partyTaxId: null, partyName: null, rate: 20, exemptionCode: null, withholdingCode: null, withholdingRate: null, base: 0, tax: 0, withheld: 0, ...over,
  });
  it('groups by rate / exemption / withholding and reconciles with the document totals', () => {
    const docs = [
      { id: 'i1', subtotal: 1500, tax: 300, lines: [line({ documentId: 'i1', base: 1000, tax: 200 }), line({ documentId: 'i1', base: 500, tax: 100 })] },
      { id: 'i2', subtotal: 1100, tax: 110, lines: [line({ documentId: 'i2', rate: 10, base: 1100, tax: 110 })] },
      { id: 'i3', subtotal: 10000, tax: 2000, lines: [line({ documentId: 'i3', withholdingCode: '627', withholdingRate: '5/10' as any, base: 10000, tax: 2000, withheld: 1000 })] },
      { id: 'i4', subtotal: 800, tax: 0, lines: [line({ documentId: 'i4', rate: 0, exemptionCode: '301', base: 800 })] },
    ];
    const lines = docs.flatMap((d) => d.lines);
    const groups = groupVatLines(lines);
    expect(groups.reduce((s, g) => s + g.base, 0)).toBe(docs.reduce((s, d) => s + d.subtotal, 0));
    expect(groups.reduce((s, g) => s + g.tax, 0)).toBe(docs.reduce((s, d) => s + d.tax, 0));
    expect(groups.find((g) => g.withholdingCode === '627')).toMatchObject({ tax: 2000, withheld: 1000, declared: 1000 });
    expect(groups.find((g) => g.exemptionCode === '301')).toMatchObject({ base: 800, tax: 0, documents: 1 });
    const s = vatSummary([...lines, line({ kind: 'PURCHASE', documentId: 'p1', base: 2000, tax: 400 }), line({ kind: 'IMPORT', documentId: 'g1', base: 1000, tax: 200 })]);
    expect(s.computedVat).toBe(2410 - 1000);
    expect(s.deductibleVat).toBe(600);
    expect(s.payable).toBe(810);
    expect(totalsOf([])).toEqual({ base: 0, tax: 0, withheld: 0 });
  });
});

describe('Turkish CSV', () => {
  it('uses ; and decimal comma with a BOM', () => {
    const csv = buildCsv([['a', 'b'], ['x;y', 1.5]], 'tr');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('a;b');
    expect(csv).toContain('"x;y";1,5');
  });
});
