/** Money math helpers (2-decimal, half-away-from-zero rounding). */
export function round2(n: number): number {
  const v = Number(n) || 0;
  return Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}

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

/**
 * Calculates one line. With `pricesIncludeTax` the entered price is gross:
 * the gross line total is preserved exactly and tax is extracted from it.
 */
export function calculateLine(input: LineInput, pricesIncludeTax: boolean): LineAmounts {
  const qty = Number(input.quantity) || 0;
  const rate = Math.max(0, Number(input.taxRate) || 0);
  const price = Number(input.unitPrice) || 0;

  if (pricesIncludeTax) {
    const lineTotal = round2(price * qty);
    const netAmount = round2(lineTotal / (1 + rate / 100));
    const taxAmount = round2(lineTotal - netAmount);
    const unitPrice = qty > 0 ? round2(netAmount / qty) : round2(price / (1 + rate / 100));
    return { unitPrice, taxRate: rate, netAmount, taxAmount, lineTotal };
  }

  const unitPrice = round2(price);
  const netAmount = round2(unitPrice * qty);
  const taxAmount = round2((netAmount * rate) / 100);
  return { unitPrice, taxRate: rate, netAmount, taxAmount, lineTotal: round2(netAmount + taxAmount) };
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
