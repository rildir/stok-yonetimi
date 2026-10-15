/** WP3 tax engine types (mirror backend shared/finance/tax.ts and FinanceService.priceDocumentFor). */

export type ChargeType = 'SHIPPING' | 'PACKAGING' | 'INSURANCE' | 'OTHER';
export const CHARGE_TYPES: ChargeType[] = ['SHIPPING', 'PACKAGING', 'INSURANCE', 'OTHER'];
export const SALES_CHANNELS = ['STORE', 'WEB', 'MARKETPLACE', 'PHONE', 'B2B', 'OTHER'];

export interface TaxBreakdownRow {
  taxTypeCode: string;
  rate: number;
  exemptionCode: string | null;
  withholdingRate: number;
  vatNotCollected: boolean;
  base: number;
  tax: number;
  withheld: number;
}

export interface DocumentCharge {
  id?: string;
  type: ChargeType | string;
  description?: string | null;
  enteredAmount?: number;
  amount: number;
  taxAmount?: number;
  withheldTaxAmount?: number;
  lineTotal?: number;
}

export interface PricedLine {
  unitPrice: number;
  quantity: number;
  grossAmount: number;
  discountRate: number;
  discountAmount: number;
  documentDiscountShare: number;
  netAmount: number;
  otvRate: number;
  otvAmount: number;
  taxRate: number;
  taxAmount: number;
  exemptionCode: string | null;
  vatNotCollected: boolean;
  withholdingCode: string | null;
  withholdingRate: number;
  withheldTaxAmount: number;
  lineTotal: number;
}

export interface PricedDocument {
  lines: PricedLine[];
  charges: DocumentCharge[];
  lineExtensionTotal: number;
  lineDiscountTotal: number;
  documentDiscountAmount: number;
  chargesTotal: number;
  subtotal: number;
  otvTotal: number;
  taxTotal: number;
  notCollectedTaxTotal: number;
  withheldTaxTotal: number;
  grandTotal: number;
  payableTotal: number;
  breakdown: TaxBreakdownRow[];
}

export interface DocWarning {
  code: string;
  params?: Record<string, string | number>;
}

export interface TaxLineMeta {
  enteredUnitPrice: number;
  taxRateId: string | null;
  taxCode: string;
  exemptionCode: string | null;
  withholdingCode: string | null;
  otvCode: string | null;
  reverseCharge: boolean;
  deductibleVat: number;
  label: string | null;
}

/** POST /orders/quote, /purchase-orders/quote */
export interface TaxQuote {
  doc: PricedDocument;
  lineMeta: TaxLineMeta[];
  currency: string;
  exchangeRate: number;
  exchangeRateSource: 'TCMB' | 'MANUAL' | 'BASE';
  exchangeRateDate: string | null;
  taxPointDate: string;
  subtotalTry: number;
  taxTotalTry: number;
  grandTotalTry: number;
  invoiceTypeHint: string;
  withholdingApplied: boolean;
  isImport: boolean;
  pricesIncludeTax: boolean;
  warnings: DocWarning[];
}

/** Tax fields stored on orders and purchase orders. */
export interface DocumentTaxFields {
  documentDiscountAmount?: number;
  documentDiscountEntered?: number;
  chargesTotal?: number;
  otvTotal?: number;
  withheldTaxTotal?: number;
  notCollectedTaxTotal?: number;
  payableTotal?: number;
  taxBreakdown?: TaxBreakdownRow[] | null;
  subtotalTry?: number;
  taxTotalTry?: number;
  grandTotalTry?: number;
  exchangeRateSource?: string | null;
  exchangeRateDate?: string | null;
  taxPointDate?: string | null;
  invoiceTypeHint?: string | null;
  taxFrozenAt?: string | null;
  charges?: DocumentCharge[];
}

/** Tax fields stored on order / purchase order lines. */
export interface LineTaxFields {
  enteredUnitPrice?: number | null;
  grossAmount?: number;
  discountRate?: number;
  discountAmount?: number;
  documentDiscountShare?: number;
  netAmount?: number;
  taxRateId?: string | null;
  taxCode?: string | null;
  exemptionCode?: string | null;
  vatNotCollected?: boolean;
  withholdingCode?: string | null;
  withholdingRate?: number | null;
  withheldTaxAmount?: number;
  otvCode?: string | null;
  otvRate?: number | null;
  otvAmount?: number;
}

export interface ExemptionCode {
  id: string;
  code: string;
  nameTr: string;
  nameEn: string;
  type: 'PARTIAL' | 'FULL' | 'EXPORT_REGISTERED' | 'OTHER' | string;
  invoiceType: string;
  vatCalculatedNotCollected: boolean;
  requiresForeignBuyer: boolean;
  validFrom: string;
  validTo?: string | null;
  codeListVersion: string;
  sourceRef: string;
  confidence: string;
  note?: string | null;
}

export interface WithholdingCode {
  id: string;
  code: string;
  nameTr: string;
  nameEn: string;
  numerator: number;
  denominator: number;
  scope: 'SERVICE' | 'DELIVERY' | 'FULL' | string;
  requiresDesignatedBuyer: boolean;
  exemptForImporterOrOreProducer: boolean;
  validFrom: string;
  codeListVersion: string;
  sourceRef: string;
  confidence: string;
  note?: string | null;
}

export interface OtvCode {
  id: string;
  code: string;
  nameTr: string;
  nameEn: string;
  list: string;
  confidence: string;
}

export interface TaxCatalog {
  country: string;
  date: string;
  locked: boolean;
  rates: { rate: number; code: string; isDefault?: boolean }[];
  sourceRef: string | null;
}

/** Normalized input of the tax summary component (from a quote or a saved document). */
export interface TaxSummaryView {
  currency: string;
  lineExtensionTotal?: number;
  lineDiscountTotal?: number;
  documentDiscountAmount?: number;
  chargesTotal?: number;
  subtotal: number;
  otvTotal?: number;
  taxTotal: number;
  notCollectedTaxTotal?: number;
  withheldTaxTotal?: number;
  grandTotal: number;
  payableTotal?: number;
  breakdown: TaxBreakdownRow[];
  exchangeRate?: number;
  exchangeRateSource?: string | null;
  exchangeRateDate?: string | null;
  taxPointDate?: string | null;
  subtotalTry?: number;
  taxTotalTry?: number;
  grandTotalTry?: number;
  invoiceTypeHint?: string | null;
  frozen?: boolean;
  warnings?: DocWarning[];
}

export function summaryFromQuote(q: TaxQuote): TaxSummaryView {
  return {
    currency: q.currency,
    ...q.doc,
    exchangeRate: q.exchangeRate,
    exchangeRateSource: q.exchangeRateSource,
    exchangeRateDate: q.exchangeRateDate,
    taxPointDate: q.taxPointDate,
    subtotalTry: q.subtotalTry,
    taxTotalTry: q.taxTotalTry,
    grandTotalTry: q.grandTotalTry,
    invoiceTypeHint: q.invoiceTypeHint,
    warnings: q.warnings,
  };
}

const n = (v: unknown) => Number(v) || 0;

/** Saved order / purchase order -> summary (documents from before WP3 get a per-rate breakdown from their lines). */
export function summaryFromDocument(d: DocumentTaxFields & { currency?: string; subtotal?: number; taxTotal?: number; grandTotal?: number; totalAmount?: number; exchangeRate?: number; items?: (LineTaxFields & { taxRate?: number; taxAmount?: number; lineTotal?: number })[] }, fallbackCurrency: string): TaxSummaryView {
  let breakdown = d.taxBreakdown || [];
  if (!breakdown.length && d.items?.length) {
    const map = new Map<number, TaxBreakdownRow>();
    for (const it of d.items) {
      const rate = n(it.taxRate);
      const row = map.get(rate) || { taxTypeCode: '0015', rate, exemptionCode: null, withholdingRate: 0, vatNotCollected: false, base: 0, tax: 0, withheld: 0 };
      row.base = Math.round((row.base + n(it.lineTotal) - n(it.taxAmount)) * 100) / 100;
      row.tax = Math.round((row.tax + n(it.taxAmount)) * 100) / 100;
      map.set(rate, row);
    }
    breakdown = [...map.values()].sort((a, b) => b.rate - a.rate);
  }
  const grand = n(d.grandTotal ?? d.totalAmount);
  return {
    currency: d.currency || fallbackCurrency,
    lineExtensionTotal: (d.items || []).reduce((s, i) => s + n(i.grossAmount), 0) || undefined,
    lineDiscountTotal: (d.items || []).reduce((s, i) => s + n(i.discountAmount), 0),
    documentDiscountAmount: n(d.documentDiscountAmount),
    chargesTotal: n(d.chargesTotal),
    subtotal: n(d.subtotal),
    otvTotal: n(d.otvTotal),
    taxTotal: n(d.taxTotal),
    notCollectedTaxTotal: n(d.notCollectedTaxTotal),
    withheldTaxTotal: n(d.withheldTaxTotal),
    grandTotal: grand,
    payableTotal: d.payableTotal ? n(d.payableTotal) : grand,
    breakdown,
    exchangeRate: d.exchangeRate,
    exchangeRateSource: d.exchangeRateSource,
    exchangeRateDate: d.exchangeRateDate,
    taxPointDate: d.taxPointDate,
    subtotalTry: d.subtotalTry,
    taxTotalTry: d.taxTotalTry,
    grandTotalTry: d.grandTotalTry,
    invoiceTypeHint: d.invoiceTypeHint,
    frozen: !!d.taxFrozenAt,
  };
}
