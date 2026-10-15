/**
 * Input model of the UBL-TR builders (WP5). Builders are pure functions of this model; the
 * mapping from invoices / despatch advices / incoming documents lives in mapper.ts.
 */

export interface UblAddress {
  street?: string | null;
  buildingNumber?: string | null;
  /** İlçe (cbc:CitySubdivisionName) */
  district: string;
  /** İl (cbc:CityName) */
  city: string;
  postalZone?: string | null;
  /** Country name as printed (Türkiye) */
  country: string;
  /** ISO 3166-1 alpha-2 (cbc:IdentificationCode) */
  countryCode?: string | null;
}

export interface UblIdentifier {
  /** VKN | TCKN | MERSISNO | TICARETSICILNO | PASAPORTNO | DISTRIBUTORNO ... (UBL-TR schemeID list) */
  schemeID: string;
  value: string;
}

export interface UblParty {
  name?: string | null;
  /** Natural persons (TCKN): first / family name are mandatory (UBL-TR Ortak Elemanlar) */
  person?: { firstName: string; familyName: string; nationalityId?: string | null } | null;
  identifiers: UblIdentifier[];
  taxOffice?: string | null;
  /** cac:PartyLegalEntity/cbc:RegistrationName (IHRACAT foreign buyer) */
  legalName?: string | null;
  address: UblAddress;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface UblDocumentRef {
  id: string;
  issueDate: string;
  documentTypeCode?: string | null;
  documentType?: string | null;
  description?: string | null;
}

export interface UblAttachment {
  id: string;
  issueDate: string;
  documentType: string;
  fileName: string;
  mimeCode: string;
  base64: string;
}

export interface UblLineTax {
  /** 0015 KDV, 0071 ÖTV (I) ... */
  code: string;
  name: string;
  percent: number;
  taxable: number;
  amount: number;
  /** Tax exemption (istisna) code and text (TaxCategory) */
  exemptionCode?: string | null;
  exemptionReason?: string | null;
}

export interface UblWithholding {
  /** 6xx / 8xx (WithholdingTaxType) */
  code: string;
  name: string;
  percent: number;
  taxable: number;
  amount: number;
}

export interface UblAllowanceCharge {
  charge: boolean;
  reason?: string | null;
  /** 0..1 (e.g. 0.05 = %5) */
  multiplier?: number | null;
  amount: number;
  base?: number | null;
}

export interface UblInvoiceLine {
  id: number;
  name: string;
  sellersItemId?: string | null;
  buyersItemId?: string | null;
  /** Sectoral / additional identifiers (R45; ILAC, TIBBICIHAZ, IMEI, KUNYENO ...) — only when the flag is on */
  additionalItemIds?: UblIdentifier[];
  quantity: number;
  unitCode: string;
  unitPrice: number;
  /** Net line amount after line allowances (LineExtensionAmount) */
  lineExtension: number;
  allowances?: UblAllowanceCharge[];
  taxes: UblLineTax[];
  withholding?: UblWithholding[];
  note?: string | null;
  /** Export (IHRACAT): GTİP, origin, delivery terms, packaging */
  export?: UblExportLine | null;
  lots?: { lot?: string | null; serial?: string | null; expiry?: string | null }[];
}

export interface UblExportLine {
  gtip: string;
  incoterms: string;
  originCountry?: string | null;
  packagingTypeCode?: string | null;
  packageCount?: number | null;
  grossWeightKg?: number | null;
  netWeightKg?: number | null;
  transportModeCode?: string | null;
}

export interface UblInternetSale {
  webAddress?: string | null;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  carrierName?: string | null;
  carrierTaxId?: string | null;
  shipmentDate?: string | null;
}

export interface UblInvoiceInput {
  ettn: string;
  documentNo: string;
  profileId: string;
  typeCode: string;
  issueDate: string;
  issueTime: string;
  currency: string;
  /** TRY per 1 unit of `currency` (PricingExchangeRate), required when currency != TRY */
  exchangeRate?: number | null;
  exchangeRateDate?: string | null;
  notes: string[];
  orderRef?: { id: string; issueDate: string } | null;
  billingRefs?: UblDocumentRef[];
  despatchRefs?: UblDocumentRef[];
  additionalRefs?: UblDocumentRef[];
  attachments?: UblAttachment[];
  supplier: UblParty;
  customer: UblParty;
  /** IHRACAT: the real foreign buyer (BuyerCustomerParty); `customer` is the customs office (GTB) */
  buyerCustomer?: UblParty | null;
  delivery?: {
    carrier?: { name: string; taxId?: string | null } | null;
    actualDate?: string | null;
    address?: UblAddress | null;
  } | null;
  paymentMeans?: { code: string; dueDate?: string | null; note?: string | null } | null;
  documentAllowances?: UblAllowanceCharge[];
  lines: UblInvoiceLine[];
  /** Totals (UBL LegalMonetaryTotal) */
  totals: {
    lineExtension: number;
    taxExclusive: number;
    taxInclusive: number;
    allowanceTotal: number;
    chargeTotal: number;
    payable: number;
  };
  internetSale?: UblInternetSale | null;
}

export interface UblDespatchLine {
  id: number;
  name: string;
  sellersItemId?: string | null;
  quantity: number;
  unitCode: string;
  orderLineId?: string | null;
  unitPrice?: number | null;
  currency?: string | null;
  lots?: { lot?: string | null; serial?: string | null; expiry?: string | null }[];
}

export interface UblDespatchInput {
  ettn: string;
  documentNo: string;
  profileId: string;
  /** SEVK | MATBUDAN */
  typeCode: string;
  issueDate: string;
  issueTime: string;
  notes: string[];
  orderRef?: { id: string; issueDate: string } | null;
  /** MATBUDAN: the paper despatch (DocumentType MATBU) */
  paperRef?: { id: string; issueDate: string } | null;
  attachments?: UblAttachment[];
  supplier: UblParty;
  customer: UblParty;
  /** Buyer when different from the delivery customer (consignment, transfer to own branch...) */
  buyerCustomer?: UblParty | null;
  deliveryAddress: UblAddress;
  despatchAddress?: UblAddress | null;
  carrier?: { name: string; taxId: string; address?: UblAddress | null } | null;
  drivers: { firstName: string; familyName: string; tckn: string }[];
  /** Truck plates (LicensePlateID schemeID=PLAKA) and trailers (TransportEquipment DORSEPLAKA) */
  plates: string[];
  trailerPlates: string[];
  actualDespatchDate: string;
  actualDespatchTime: string;
  totalValue?: { amount: number; currency: string } | null;
  lines: UblDespatchLine[];
}

export interface UblReceiptLine {
  id: number;
  despatchLineId: string;
  name: string;
  sellersItemId?: string | null;
  unitCode: string;
  received: number;
  rejected?: number;
  rejectReason?: string | null;
  short?: number;
  oversupply?: number;
}

export interface UblReceiptAdviceInput {
  ettn: string;
  documentNo: string;
  profileId: string;
  issueDate: string;
  issueTime: string;
  notes: string[];
  /** The despatch advice answered */
  despatch: { ettn: string; documentNo: string; issueDate: string };
  orderRef?: { id: string; issueDate: string } | null;
  /** Receiver of the goods (issuer of the receipt advice) */
  deliveryCustomer: UblParty;
  /** Sender of the despatch */
  despatchSupplier: UblParty;
  actualDespatchDate?: string | null;
  lines: UblReceiptLine[];
}

export interface UblApplicationResponseInput {
  ettn: string;
  /** Response number (free; UBL-TR: 16 characters like other documents) */
  documentNo: string;
  profileId: string;
  issueDate: string;
  issueTime: string;
  notes: string[];
  sender: UblParty;
  receiver: UblParty;
  /** KABUL | RED */
  responseCode: string;
  description?: string | null;
  /** The invoice answered */
  invoice: { ettn: string; documentNo: string; issueDate: string };
}
