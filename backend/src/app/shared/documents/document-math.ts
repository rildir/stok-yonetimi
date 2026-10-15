import { round2, TaxBreakdownRow, ChargeAllocation } from '../finance/tax';
import { roundQty } from '../tr';
import type { StockAllocation } from '../services/warehouse-stock.service';

/** Frozen amounts of a priced source line (order line, invoice line) in its own unit. */
export interface SourceLineAmounts {
  /** Base-unit quantity of the source line */
  baseQuantity: number;
  unitFactor: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  documentDiscountShare?: number;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  exemptionCode?: string | null;
  vatNotCollected?: boolean;
  withholdingCode?: string | null;
  withholdingRate?: number | null;
  withheldTaxAmount: number;
  otvRate?: number | null;
  otvAmount: number;
  lineTotal: number;
}

export interface PartAmounts {
  quantity: number;
  baseQuantity: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  otvAmount: number;
  taxAmount: number;
  withheldTaxAmount: number;
  lineTotal: number;
}

const AMOUNT_KEYS = ['grossAmount', 'discountAmount', 'netAmount', 'otvAmount', 'taxAmount', 'withheldTaxAmount', 'lineTotal'] as const;

/**
 * Amounts of `baseQty` base units of a frozen source line, pro rata. `already` = the amounts of
 * the earlier parts (same source line, not cancelled): when this part completes the line, it takes
 * the exact remainder, so the parts always add up to the source line (no rounding drift).
 */
export function proRataPart(src: SourceLineAmounts, baseQty: number, alreadyBase: number, already: Partial<Record<(typeof AMOUNT_KEYS)[number], number>> = {}): PartAmounts {
  const total = roundQty(src.baseQuantity);
  const q = roundQty(baseQty);
  const completes = roundQty(alreadyBase + q) >= total;
  const f = total > 0 ? q / total : 0;
  const discountTotal = round2((Number(src.discountAmount) || 0) + (Number(src.documentDiscountShare) || 0));
  const full: Record<(typeof AMOUNT_KEYS)[number], number> = {
    grossAmount: Number(src.grossAmount) || 0,
    discountAmount: discountTotal,
    netAmount: Number(src.netAmount) || 0,
    otvAmount: Number(src.otvAmount) || 0,
    taxAmount: Number(src.taxAmount) || 0,
    withheldTaxAmount: Number(src.withheldTaxAmount) || 0,
    lineTotal: Number(src.lineTotal) || 0,
  };
  const out = {} as Record<(typeof AMOUNT_KEYS)[number], number>;
  for (const k of AMOUNT_KEYS) {
    out[k] = completes ? round2(full[k] - (Number(already[k]) || 0)) : round2(full[k] * f);
  }
  const factor = Number(src.unitFactor) || 1;
  return { quantity: roundQty(q / factor), baseQuantity: q, ...out };
}

export interface BreakdownLine {
  taxRate: number;
  exemptionCode?: string | null;
  withholdingRate?: number | null;
  vatNotCollected?: boolean;
  netAmount: number;
  otvAmount?: number;
  taxAmount: number;
  withheldTaxAmount: number;
}

/** UBL TaxSubtotal rows: VAT grouped by (rate, exemption, withholding, not collected), charges included. */
export function buildBreakdown(lines: BreakdownLine[], charges: ChargeAllocation[] = []): TaxBreakdownRow[] {
  const map = new Map<string, TaxBreakdownRow>();
  const add = (rate: number, ex: string | null, wr: number, nc: boolean, base: number, tax: number, withheld: number) => {
    const key = `${rate}|${ex || ''}|${wr}|${nc ? 1 : 0}`;
    const row = map.get(key) || { taxTypeCode: '0015', rate, exemptionCode: ex || null, withholdingRate: wr, vatNotCollected: nc, base: 0, tax: 0, withheld: 0 };
    row.base = round2(row.base + base);
    row.tax = round2(row.tax + tax);
    row.withheld = round2(row.withheld + withheld);
    map.set(key, row);
  };
  for (const l of lines) {
    add(Number(l.taxRate) || 0, l.exemptionCode || null, Number(l.withholdingRate) || 0, !!l.vatNotCollected, round2((Number(l.netAmount) || 0) + (Number(l.otvAmount) || 0)), Number(l.taxAmount) || 0, Number(l.withheldTaxAmount) || 0);
  }
  for (const c of charges) {
    add(Number(c.taxRate) || 0, c.exemptionCode || null, Number(c.withholdingRate) || 0, !!c.vatNotCollected, Number(c.netAmount) || 0, Number(c.taxAmount) || 0, Number(c.withheldTaxAmount) || 0);
  }
  return [...map.values()];
}

export interface DocumentTotalsInput {
  lines: { grossAmount: number; discountAmount: number; netAmount: number; otvAmount: number; taxAmount: number; withheldTaxAmount: number; vatNotCollected?: boolean }[];
  charges?: { amount: number; taxAmount: number; withheldTaxAmount: number; allocations?: ChargeAllocation[] }[];
}

/** Document totals from frozen line / charge amounts (same definitions as the tax engine). */
export function documentTotals(input: DocumentTotalsInput) {
  const sum = (v: number[]) => round2(v.reduce((s, x) => s + (Number(x) || 0), 0));
  const lines = input.lines;
  const charges = input.charges || [];
  const notCollected = sum(lines.filter((l) => l.vatNotCollected).map((l) => l.taxAmount)) +
    sum(charges.flatMap((c) => (c.allocations || []).filter((a) => a.vatNotCollected).map((a) => a.taxAmount)));
  const chargesTotal = sum(charges.map((c) => c.amount));
  const subtotal = round2(sum(lines.map((l) => l.netAmount)) + chargesTotal);
  const otvTotal = sum(lines.map((l) => l.otvAmount));
  const taxTotal = round2(sum(lines.map((l) => l.taxAmount)) + sum(charges.map((c) => c.taxAmount)));
  const withheldTaxTotal = round2(sum(lines.map((l) => l.withheldTaxAmount)) + sum(charges.map((c) => c.withheldTaxAmount)));
  const grandTotal = round2(subtotal + otvTotal + taxTotal - round2(notCollected));
  return {
    subtotal,
    chargesTotal,
    documentDiscountAmount: 0,
    otvTotal,
    taxTotal,
    notCollectedTaxTotal: round2(notCollected),
    withheldTaxTotal,
    grandTotal,
    payableTotal: round2(grandTotal - withheldTaxTotal),
  };
}

/**
 * Splits stock allocations into the first `firstQty` base units and the rest (lot allocations are
 * cut in two, serial lists sliced), e.g. a receipt into "against the supplier's document" and
 * "tesellüm fazlası".
 */
export function splitAllocations(allocations: StockAllocation[], firstQty: number): [StockAllocation[], StockAllocation[]] {
  const first: StockAllocation[] = [];
  const rest: StockAllocation[] = [];
  let left = roundQty(firstQty);
  for (const a of allocations) {
    const qty = Math.abs(a.delta);
    const sign = a.delta < 0 ? -1 : 1;
    if (left <= 0) {
      rest.push(a);
      continue;
    }
    if (qty <= left) {
      first.push(a);
      left = roundQty(left - qty);
      continue;
    }
    const take = left;
    const n = Math.round(take);
    first.push({ ...a, delta: sign * take, ...(a.serials ? { serials: a.serials.slice(0, n) } : {}) });
    rest.push({ ...a, delta: sign * roundQty(qty - take), ...(a.serials ? { serials: a.serials.slice(n) } : {}) });
    left = 0;
  }
  return [first, rest];
}
