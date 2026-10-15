import { ColumnNumericTransformer } from '../utils/numeric-transformer';

/** Column options for an amount with 2 decimals (DECIMAL(14,2)). */
export const moneyColumn = (extra: { default?: number; nullable?: boolean } = { default: 0 }) =>
  ({ type: 'decimal', precision: 14, scale: 2, transformer: new ColumnNumericTransformer(), ...extra }) as const;

/** Unit price, 6 decimals (R14). */
export const priceColumn = (extra: { default?: number; nullable?: boolean } = { default: 0 }) =>
  ({ type: 'decimal', precision: 18, scale: 6, transformer: new ColumnNumericTransformer(), ...extra }) as const;

/** Percentage (VAT, withholding, discount). */
export const rateColumn = (extra: { default?: number; nullable?: boolean } = { default: 0 }) =>
  ({ type: 'decimal', precision: 5, scale: 2, transformer: new ColumnNumericTransformer(), ...extra }) as const;

/** Party as printed on a legal document (frozen when the document is approved / issued). */
export interface PartySnapshot {
  name: string;
  legalName?: string | null;
  /** VKN | TCKN | YKN | FOREIGN | ANONYMOUS */
  taxIdType?: string | null;
  taxId?: string | null;
  taxOfficeCode?: string | null;
  taxOfficeName?: string | null;
  mersisNo?: string | null;
  tradeRegistryNo?: string | null;
  kepAddress?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    district?: string | null;
    districtId?: number | null;
    province?: string | null;
    provinceCode?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  addressText?: string | null;
  /** Not a merchant / VAT taxpayer (VUK 232 limit applies) */
  isFinalConsumer?: boolean;
  isVatTaxpayer?: boolean;
}

export interface DocumentRef {
  id?: string | null;
  documentNo: string | null;
  issueDate: string | null;
  /** e.g. DESPATCH, INVOICE, SUPPLIER_INVOICE */
  type?: string;
  ettn?: string | null;
}

export interface DriverInfo {
  firstName: string;
  lastName: string;
  tckn: string;
}

export interface PlateInfo {
  plate: string;
  /** TRUCK (çekici / kamyon) | TRAILER (dorse) */
  type?: string;
}

export interface CarrierParty {
  name: string;
  taxId?: string | null;
}

export interface InternetSaleInfo {
  webAddress?: string | null;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  carrierName?: string | null;
  carrierTaxId?: string | null;
  shipmentDate?: string | null;
}

/** One tax of an invoice / return line (UBL TaxSubtotal of the line). */
export interface LineTax {
  code: string;
  rate: number;
  base: number;
  amount: number;
  exemptionCode?: string | null;
  withholdingCode?: string | null;
  withholdingRate?: number | null;
  withheld?: number;
}
