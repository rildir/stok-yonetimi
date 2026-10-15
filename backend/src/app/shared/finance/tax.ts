/**
 * Tax engine (pure, unit tested). KDVK 20-29 / UBL-TR TaxTotal semantics:
 *
 *   gross    = round2(qty x netUnitPrice)                      (R14: net unit price DECIMAL(18,6))
 *   - line discount (rate or amount)                           (KDVK 24/a - matrahtan düşülür)
 *   - share of the document discount (pro rata)
 *   = net    (rounded to 2)
 *   + ÖTV    = round2(net x otv%)                              (KDVK 24/b - ÖTV matraha dahil)
 *   = VAT base;  VAT = round2(base x rate%)
 *   withheld = round2(VAT x withholding%)                      (KDVK 9/1 - tevkifat)
 *
 * Additional charges (shipping, packaging, insurance...) follow the main delivery's rate
 * (KDVK 24/b): a single-rate document taxes them at that rate, a multi-rate document splits
 * them pro rata over the rate groups. Lines flagged `vatNotCollected` (701/702 ihraç kayıtlı,
 * reverse charge) carry a calculated VAT that is not added to the grand total.
 *
 * With tax-inclusive prices every monetary input (unit price, discount amounts, charges) is
 * gross; each is converted to net with its line factor (1+ÖTV)(1+VAT) before the steps above,
 * so `round2(quantity x unitPrice) == grossAmount` always holds for the stored net unit price.
 */

/** Money rounding: 2 decimals, half away from zero. */
export function round2(n: number): number {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100)) / 100;
}

/** Unit price rounding: 6 decimals (DECIMAL(18,6)). */
export function round6(n: number): number {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 1e6)) / 1e6;
}

/**
 * Splits `total` (2 decimals) over `weights` so the parts sum exactly to `total`
 * (largest remainder). Zero / negative weights get nothing; all-zero weights split evenly.
 */
export function allocate(total: number, weights: number[]): number[] {
  const t = round2(total);
  if (!weights.length) return [];
  let w = weights.map((x) => (Number(x) > 0 ? Number(x) : 0));
  let sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    w = weights.map(() => 1);
    sum = w.length;
  }
  const cents = Math.round(t * 100);
  const raw = w.map((x) => (cents * x) / sum);
  const floor = raw.map((x) => Math.floor(x));
  let rest = cents - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) floor[order[k].i] += 1;
  return floor.map((c) => c / 100);
}

export type ChargeType = 'SHIPPING' | 'PACKAGING' | 'INSURANCE' | 'OTHER';
export const CHARGE_TYPES: ChargeType[] = ['SHIPPING', 'PACKAGING', 'INSURANCE', 'OTHER'];

export interface TaxEngineLine {
  quantity: number;
  /** Unit price as entered (gross when pricesIncludeTax) */
  unitPrice: number;
  /** VAT % (0 for exempt lines) */
  taxRate: number;
  /** Line discount % (ignored when discountAmount is given) */
  discountRate?: number | null;
  /** Line discount amount as entered (gross when pricesIncludeTax) */
  discountAmount?: number | null;
  exemptionCode?: string | null;
  /** VAT is calculated but not collected (701/702 ihraç kayıtlı, reverse charge) */
  vatNotCollected?: boolean;
  /** Withheld share of the VAT in % (5/10 -> 50) */
  withholdingRate?: number | null;
  withholdingCode?: string | null;
  /** Withholding applies regardless of the VUK 232 limit (8xx full withholding) */
  withholdingThresholdExempt?: boolean;
  /** ÖTV % (added to the VAT base) */
  otvRate?: number | null;
}

export interface TaxEngineCharge {
  type: ChargeType | string;
  /** As entered (gross when pricesIncludeTax) */
  amount: number;
  description?: string | null;
}

export interface TaxEngineInput {
  lines: TaxEngineLine[];
  charges?: TaxEngineCharge[];
  /** Document discount as entered (gross when pricesIncludeTax) */
  documentDiscountAmount?: number | null;
  pricesIncludeTax: boolean;
}

export interface PricedLine {
  /** Net unit price (excl. taxes), 6 decimals */
  unitPrice: number;
  quantity: number;
  /** round2(quantity x unitPrice) */
  grossAmount: number;
  discountRate: number;
  /** Line discount (net) */
  discountAmount: number;
  /** Share of the document discount (net) */
  documentDiscountShare: number;
  /** Matrah of the line (after all discounts), excl. ÖTV */
  netAmount: number;
  otvRate: number;
  otvAmount: number;
  taxRate: number;
  /** Calculated VAT */
  taxAmount: number;
  exemptionCode: string | null;
  vatNotCollected: boolean;
  withholdingCode: string | null;
  withholdingRate: number;
  withheldTaxAmount: number;
  /** net + ÖTV + VAT */
  lineTotal: number;
}

export interface ChargeAllocation {
  taxRate: number;
  exemptionCode: string | null;
  withholdingRate: number;
  vatNotCollected: boolean;
  netAmount: number;
  taxAmount: number;
  withheldTaxAmount: number;
}

export interface PricedCharge {
  type: string;
  description: string | null;
  /** Net amount */
  amount: number;
  taxAmount: number;
  withheldTaxAmount: number;
  lineTotal: number;
  /** Single entry when the document has one rate; several when split pro rata */
  allocations: ChargeAllocation[];
}

export interface TaxBreakdownRow {
  /** UBL-TR TaxTypeCode (KDV = 0015) */
  taxTypeCode: string;
  rate: number;
  exemptionCode: string | null;
  withholdingRate: number;
  vatNotCollected: boolean;
  base: number;
  tax: number;
  withheld: number;
}

export interface PricedDocument {
  lines: PricedLine[];
  charges: PricedCharge[];
  /** Σ gross line amounts before discounts */
  lineExtensionTotal: number;
  lineDiscountTotal: number;
  /** Document discount, net */
  documentDiscountAmount: number;
  /** Σ net charges */
  chargesTotal: number;
  /** Matrah: Σ net lines + Σ net charges */
  subtotal: number;
  otvTotal: number;
  /** Hesaplanan KDV (incl. VAT not collected) */
  taxTotal: number;
  notCollectedTaxTotal: number;
  /** Tevkif edilen KDV */
  withheldTaxTotal: number;
  /** subtotal + ÖTV + VAT - VAT not collected */
  grandTotal: number;
  /** Ödenecek tutar: grandTotal - withheld VAT */
  payableTotal: number;
  breakdown: TaxBreakdownRow[];
}

const num = (v: unknown) => Number(v) || 0;
const groupKey = (rate: number, ex: string | null, wr: number, nc: boolean) => `${rate}|${ex || ''}|${wr}|${nc ? 1 : 0}`;

/** Prices a whole document (lines, discounts, charges). */
export function priceDocument(input: TaxEngineInput): PricedDocument {
  const inclusive = !!input.pricesIncludeTax;
  const prepared = input.lines.map((l) => {
    const qty = num(l.quantity);
    const rate = Math.max(0, num(l.taxRate));
    const otvRate = Math.max(0, num(l.otvRate));
    const nc = !!l.vatNotCollected;
    const factor = inclusive ? (1 + otvRate / 100) * (1 + (nc ? 0 : rate) / 100) : 1;
    const unitPrice = round6(num(l.unitPrice) / factor);
    const grossAmount = round2(qty * unitPrice);
    const discountRate = Math.min(100, Math.max(0, num(l.discountRate)));
    let discountAmount =
      l.discountAmount !== undefined && l.discountAmount !== null && num(l.discountAmount) > 0
        ? round2(num(l.discountAmount) / factor)
        : round2((grossAmount * discountRate) / 100);
    discountAmount = Math.min(Math.max(0, discountAmount), grossAmount);
    return { l, qty, rate, otvRate, nc, factor, unitPrice, grossAmount, discountRate, discountAmount, after: round2(grossAmount - discountAmount) };
  });

  // Document discount, pro rata over the amounts after line discounts (gross space when inclusive).
  const weights = prepared.map((p) => p.after * p.factor);
  const docEntered = Math.min(Math.max(0, num(input.documentDiscountAmount)), round2(weights.reduce((a, b) => a + b, 0)));
  const docParts = allocate(docEntered, weights);

  const lines: PricedLine[] = prepared.map((p, i) => {
    const share = Math.min(p.after, round2(docParts[i] / p.factor));
    const netAmount = round2(p.after - share);
    const otvAmount = round2((netAmount * p.otvRate) / 100);
    const taxAmount = round2(((netAmount + otvAmount) * p.rate) / 100);
    const withholdingRate = Math.min(100, Math.max(0, num(p.l.withholdingRate)));
    const withheldTaxAmount = p.nc ? 0 : round2((taxAmount * withholdingRate) / 100);
    return {
      unitPrice: p.unitPrice,
      quantity: p.qty,
      grossAmount: p.grossAmount,
      discountRate: p.discountRate,
      discountAmount: p.discountAmount,
      documentDiscountShare: share,
      netAmount,
      otvRate: p.otvRate,
      otvAmount,
      taxRate: p.rate,
      taxAmount,
      exemptionCode: p.l.exemptionCode || null,
      vatNotCollected: p.nc,
      withholdingCode: withholdingRate > 0 ? p.l.withholdingCode || null : null,
      withholdingRate: p.nc ? 0 : withholdingRate,
      withheldTaxAmount,
      lineTotal: round2(netAmount + otvAmount + taxAmount),
    };
  });

  // Rate groups of the lines (charges follow them).
  const groups = new Map<string, { rate: number; ex: string | null; wr: number; nc: boolean; base: number }>();
  for (const l of lines) {
    const k = groupKey(l.taxRate, l.exemptionCode, l.withholdingRate, l.vatNotCollected);
    const g = groups.get(k) || { rate: l.taxRate, ex: l.exemptionCode, wr: l.withholdingRate, nc: l.vatNotCollected, base: 0 };
    g.base = round2(g.base + l.netAmount + l.otvAmount);
    groups.set(k, g);
  }
  const groupList = [...groups.values()];
  if (!groupList.length) groupList.push({ rate: 0, ex: null, wr: 0, nc: false, base: 0 });

  const charges: PricedCharge[] = (input.charges || [])
    .filter((c) => num(c.amount) > 0)
    .map((c) => {
      const parts = groupList.length === 1 ? [round2(num(c.amount))] : allocate(num(c.amount), groupList.map((g) => g.base));
      const allocations: ChargeAllocation[] = groupList
        .map((g, i) => {
          const entered = parts[i] || 0;
          const net = inclusive ? round2(entered / (1 + (g.nc ? 0 : g.rate) / 100)) : round2(entered);
          const tax = round2((net * g.rate) / 100);
          return { taxRate: g.rate, exemptionCode: g.ex, withholdingRate: g.wr, vatNotCollected: g.nc, netAmount: net, taxAmount: tax, withheldTaxAmount: g.nc ? 0 : round2((tax * g.wr) / 100) };
        })
        .filter((a) => a.netAmount !== 0 || groupList.length === 1);
      const amount = round2(allocations.reduce((s, a) => s + a.netAmount, 0));
      const taxAmount = round2(allocations.reduce((s, a) => s + a.taxAmount, 0));
      return {
        type: String(c.type),
        description: c.description || null,
        amount,
        taxAmount,
        withheldTaxAmount: round2(allocations.reduce((s, a) => s + a.withheldTaxAmount, 0)),
        lineTotal: round2(amount + taxAmount),
        allocations,
      };
    });

  // Breakdown per (rate, exemption, withholding, collected).
  const bd = new Map<string, TaxBreakdownRow>();
  const addRow = (rate: number, ex: string | null, wr: number, nc: boolean, base: number, tax: number, withheld: number) => {
    const k = groupKey(rate, ex, wr, nc);
    const r = bd.get(k) || { taxTypeCode: '0015', rate, exemptionCode: ex, withholdingRate: wr, vatNotCollected: nc, base: 0, tax: 0, withheld: 0 };
    r.base = round2(r.base + base);
    r.tax = round2(r.tax + tax);
    r.withheld = round2(r.withheld + withheld);
    bd.set(k, r);
  };
  for (const l of lines) addRow(l.taxRate, l.exemptionCode, l.withholdingRate, l.vatNotCollected, l.netAmount + l.otvAmount, l.taxAmount, l.withheldTaxAmount);
  for (const c of charges) for (const a of c.allocations) addRow(a.taxRate, a.exemptionCode, a.withholdingRate, a.vatNotCollected, a.netAmount, a.taxAmount, a.withheldTaxAmount);

  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const chargesTotal = sum(charges.map((c) => c.amount));
  const subtotal = round2(sum(lines.map((l) => l.netAmount)) + chargesTotal);
  const otvTotal = sum(lines.map((l) => l.otvAmount));
  const taxTotal = round2(sum(lines.map((l) => l.taxAmount)) + sum(charges.map((c) => c.taxAmount)));
  const notCollectedTaxTotal = round2(
    sum(lines.filter((l) => l.vatNotCollected).map((l) => l.taxAmount)) +
      sum(charges.flatMap((c) => c.allocations.filter((a) => a.vatNotCollected).map((a) => a.taxAmount))),
  );
  const withheldTaxTotal = round2(sum(lines.map((l) => l.withheldTaxAmount)) + sum(charges.map((c) => c.withheldTaxAmount)));
  const grandTotal = round2(subtotal + otvTotal + taxTotal - notCollectedTaxTotal);
  return {
    lines,
    charges,
    lineExtensionTotal: sum(lines.map((l) => l.grossAmount)),
    lineDiscountTotal: sum(lines.map((l) => l.discountAmount)),
    documentDiscountAmount: sum(lines.map((l) => l.documentDiscountShare)),
    chargesTotal,
    subtotal,
    otvTotal,
    taxTotal,
    notCollectedTaxTotal,
    withheldTaxTotal,
    grandTotal,
    payableTotal: round2(grandTotal - withheldTaxTotal),
    breakdown: [...bd.values()].sort((a, b) => b.rate - a.rate || (a.exemptionCode || '').localeCompare(b.exemptionCode || '') || a.withholdingRate - b.withholdingRate),
  };
}

/**
 * Partial withholding (KDVGUT I/C-2.1.3) only applies when the VAT-inclusive document total
 * exceeds the VUK 232 invoice limit of the year (2026: 12.000 TL). Prices the document without
 * partial withholding first (full 8xx withholding is kept); when the TRY total (x `rateToTry`) exceeds `limitTry`, prices it again with
 * the requested withholding. Returns whether withholding was applied.
 */
export function priceWithWithholdingThreshold(
  input: TaxEngineInput,
  limitTry: number | null,
  rateToTry = 1,
): { doc: PricedDocument; withholdingApplied: boolean; totalTry: number; requested: boolean } {
  const requested = input.lines.some((l) => num(l.withholdingRate) > 0 && !l.withholdingThresholdExempt);
  const plain = priceDocument({
    ...input,
    lines: input.lines.map((l) => (l.withholdingThresholdExempt ? l : { ...l, withholdingRate: 0, withholdingCode: null })),
  });
  const totalTry = round2(plain.grandTotal * (Number(rateToTry) || 1));
  if (!requested) return { doc: plain, withholdingApplied: false, totalTry, requested };
  if (limitTry !== null && limitTry !== undefined && !(totalTry > Number(limitTry))) {
    return { doc: plain, withholdingApplied: false, totalTry, requested };
  }
  return { doc: priceDocument(input), withholdingApplied: true, totalTry, requested };
}

export type InvoiceTypeHint = 'SATIS' | 'ISTISNA' | 'TEVKIFAT' | 'IHRACKAYITLI' | 'IADE';

/**
 * UBL-TR invoice type the document will most likely be issued as (WP4 decides finally):
 * withholding -> TEVKIFAT, ihraç kayıtlı (VAT not collected with an exemption code) ->
 * IHRACKAYITLI, any fully exempt line -> ISTISNA, otherwise SATIS.
 */
export function invoiceTypeHint(doc: Pick<PricedDocument, 'lines' | 'withheldTaxTotal'>, isReturn = false): InvoiceTypeHint {
  if (isReturn) return 'IADE';
  if (doc.withheldTaxTotal > 0 || doc.lines.some((l) => l.withholdingRate > 0)) return 'TEVKIFAT';
  if (doc.lines.some((l) => l.vatNotCollected && l.exemptionCode)) return 'IHRACKAYITLI';
  if (doc.lines.some((l) => l.exemptionCode && l.taxRate === 0)) return 'ISTISNA';
  return 'SATIS';
}

// ─── Legacy single-line API (seed data, older callers) ───

export interface LineInput {
  quantity: number;
  /** Unit price as entered (gross if pricesIncludeTax, otherwise net) */
  unitPrice: number;
  /** Percentage, e.g. 20 */
  taxRate: number;
}

export interface LineAmounts {
  /** Net unit price (excl. tax) */
  unitPrice: number;
  taxRate: number;
  /** quantity * net unit price */
  netAmount: number;
  taxAmount: number;
  /** Gross line total (net + tax) */
  lineTotal: number;
}

export interface DocumentTotals {
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  /** Tax grouped by rate, e.g. [{ rate: 20, base: 100, tax: 20 }] */
  breakdown: { rate: number; base: number; tax: number }[];
}

/** One line through the engine (no discounts / charges). */
export function calculateLine(input: LineInput, pricesIncludeTax: boolean): LineAmounts {
  const l = priceDocument({ lines: [input], pricesIncludeTax }).lines[0];
  return { unitPrice: l.unitPrice, taxRate: l.taxRate, netAmount: l.netAmount, taxAmount: l.taxAmount, lineTotal: l.lineTotal };
}

export function calculateTotals(lines: LineAmounts[]): DocumentTotals {
  const byRate = new Map<number, { base: number; tax: number }>();
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    subtotal += l.netAmount;
    taxTotal += l.taxAmount;
    const b = byRate.get(l.taxRate) || { base: 0, tax: 0 };
    b.base += l.netAmount;
    b.tax += l.taxAmount;
    byRate.set(l.taxRate, b);
  }
  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);
  return {
    subtotal,
    taxTotal,
    grandTotal: round2(subtotal + taxTotal),
    breakdown: [...byRate.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rate, v]) => ({ rate, base: round2(v.base), tax: round2(v.tax) })),
  };
}
