/**
 * KDV ön raporu aggregation (KDVK 29/3, 39, 41; R21, R17). Pure: the report service collects
 * document lines (already converted to TRY) and this module groups them. The report is a
 * preparation aid for the advisor: "Ön rapordur, beyanname yerine geçmez".
 */
import { roundMoney } from './costing';

export type VatLineKind = 'SALE' | 'SALES_RETURN' | 'PURCHASE' | 'IMPORT' | 'PURCHASE_RETURN';

export interface VatLine {
  kind: VatLineKind;
  documentId: string;
  documentNo: string | null;
  documentDate: string | null;
  partyTaxId: string | null;
  partyName: string | null;
  rate: number;
  exemptionCode: string | null;
  withholdingCode: string | null;
  withholdingRate: number | null;
  /** Matrah (TRY) */
  base: number;
  /** Computed / deductible KDV (TRY) */
  tax: number;
  /** KDV withheld by the buyer (TRY) */
  withheld: number;
  /** Where the line comes from (KDV-2 lists purchase invoices by source) */
  source?: 'SALES_INVOICE' | 'INCOMING_EINVOICE' | 'SUPPLIER_INVOICE' | 'CUSTOMS' | 'RETURN';
}

export interface WithholdingInfo {
  total: number;
  subtotals: { code: string; percent: number; taxable: number; amount: number }[];
}

/**
 * Spreads an incoming invoice's withholding (UBL WithholdingTaxTotal) over its VAT lines in
 * proportion to their VAT (the last line takes the rounding rest) and names the code / rate when
 * the invoice has a single withholding subtotal.
 */
export function distributeWithholding(taxes: number[], info: WithholdingInfo | null | undefined): { withheld: number[]; code: string | null; rate: number | null } {
  const total = roundMoney(Number(info?.total) || 0);
  if (!(total > 0) || !taxes.length) return { withheld: taxes.map(() => 0), code: null, rate: null };
  const subs = info?.subtotals || [];
  const code = subs.length === 1 ? subs[0].code || 'TEVKIFAT' : 'TEVKIFAT';
  const rate = subs.length === 1 && Number(subs[0].percent) > 0 ? Number(subs[0].percent) : null;
  const taxSum = taxes.reduce((s, t) => s + (Number(t) || 0), 0);
  const out: number[] = [];
  let rest = total;
  taxes.forEach((t, i) => {
    if (i === taxes.length - 1) out.push(roundMoney(rest));
    else {
      const share = taxSum > 0 ? roundMoney((total * (Number(t) || 0)) / taxSum) : roundMoney(total / taxes.length);
      out.push(share);
      rest = roundMoney(rest - share);
    }
  });
  return { withheld: out, code, rate };
}

export interface VatGroup {
  rate: number;
  exemptionCode: string | null;
  withholdingCode: string | null;
  withholdingRate: number | null;
  base: number;
  tax: number;
  withheld: number;
  /** tax - withheld: KDV that the seller declares on KDV-1 */
  declared: number;
  documents: number;
}

export interface VatTotals {
  base: number;
  tax: number;
  withheld: number;
}

const keyOf = (l: VatLine) => `${l.rate}|${l.exemptionCode || ''}|${l.withholdingCode || ''}|${l.withholdingRate ?? ''}`;

export function groupVatLines(lines: VatLine[]): VatGroup[] {
  const map = new Map<string, VatGroup & { docs: Set<string> }>();
  for (const l of lines) {
    const k = keyOf(l);
    let g = map.get(k);
    if (!g) {
      g = { rate: l.rate, exemptionCode: l.exemptionCode, withholdingCode: l.withholdingCode, withholdingRate: l.withholdingRate, base: 0, tax: 0, withheld: 0, declared: 0, documents: 0, docs: new Set() };
      map.set(k, g);
    }
    g.base = roundMoney(g.base + l.base);
    g.tax = roundMoney(g.tax + l.tax);
    g.withheld = roundMoney(g.withheld + l.withheld);
    g.docs.add(l.documentId);
  }
  return [...map.values()]
    .map(({ docs, ...g }) => ({ ...g, declared: roundMoney(g.tax - g.withheld), documents: docs.size }))
    .sort((a, b) => b.rate - a.rate || String(a.exemptionCode).localeCompare(String(b.exemptionCode)) || String(a.withholdingCode).localeCompare(String(b.withholdingCode)));
}

export function totalsOf(lines: { base: number; tax: number; withheld: number }[]): VatTotals {
  return {
    base: roundMoney(lines.reduce((s, l) => s + l.base, 0)),
    tax: roundMoney(lines.reduce((s, l) => s + l.tax, 0)),
    withheld: roundMoney(lines.reduce((s, l) => s + l.withheld, 0)),
  };
}

/**
 * KDV-1 summary: computed VAT on sales (minus VAT withheld by buyers, declared by them on KDV-2),
 * less sales returns, less deductible VAT (domestic purchases + import VAT), plus purchase returns.
 * Positive = payable, negative = carried forward (devreden).
 */
export function vatSummary(lines: VatLine[]): {
  sales: VatTotals;
  salesReturns: VatTotals;
  purchases: VatTotals;
  imports: VatTotals;
  purchaseReturns: VatTotals;
  computedVat: number;
  deductibleVat: number;
  payable: number;
} {
  const of = (k: VatLineKind) => totalsOf(lines.filter((l) => l.kind === k));
  const sales = of('SALE');
  const salesReturns = of('SALES_RETURN');
  const purchases = of('PURCHASE');
  const imports = of('IMPORT');
  const purchaseReturns = of('PURCHASE_RETURN');
  const computedVat = roundMoney(sales.tax - sales.withheld + purchaseReturns.tax);
  const deductibleVat = roundMoney(purchases.tax + imports.tax + salesReturns.tax);
  return { sales, salesReturns, purchases, imports, purchaseReturns, computedVat, deductibleVat, payable: roundMoney(computedVat - deductibleVat) };
}
