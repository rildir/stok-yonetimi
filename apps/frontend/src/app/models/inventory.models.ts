import { DocumentTaxFields, LineTaxFields } from './tax.models';
export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  /** Read-only: stock in sellable warehouses (quarantine / in transit excluded); status follows it */
  availableQuantity?: number;
  /** Held by pending despatch-mode orders (not free to sell). */
  reservedQuantity?: number;
  minQuantity: number;
  status: 'In stock' | 'Low stock' | 'Out of stock' | string;
  supplierId?: string | null;
  imageUrl?: string;
  unit?: string;
  /** ISO 4217 currency of price */
  currency?: string;
  taxRateId?: string | null;
  /** Default KDV exemption code (required when the rate is the EXEMPT row) */
  exemptionCode?: string | null;
  /** Default KDV withholding code (e.g. 627 demir-çelik) */
  withholdingCode?: string | null;
  otvCode?: string | null;
  otvRate?: number | null;
  /** Read-only per-warehouse stock (name -> qty), derived from product_warehouse_stocks */
  warehouses?: Record<string, number> | null;
  /** Primary barcode (unique per company) */
  barcode?: string | null;
  barcodeType?: BarcodeType | null;
  trackingType?: TrackingType;
  hasExpiry?: boolean;
  /** Base (stock) unit; `unit` holds its code for legacy display */
  baseUnitId?: string | null;
  baseUnit?: Unit | null;
  /** Alternate units (factor = base units per 1 alternate unit) */
  units?: ProductUnit[];
  /** none | food | medicine_its | medical_device_uts | cosmetic_uts */
  regulatoryCategory?: string;
  /** TICARI_MAL_153 | ILK_MADDE_150 | YARI_MAMUL_151 | MAMUL_152 | DIGER_157 */
  inventoryClass?: string;
  gtin14?: string | null;
  /** Category rule warnings returned on save (e.g. food without lot / expiry) */
  complianceWarnings?: string[];
  createdAt?: string;
  // WP6
  /** Read-only: average unit cost of the open cost layers (base currency) */
  unitCost?: number | null;
  expiryType?: 'use_by' | 'best_before' | null;
  expiryPrecision?: 'day' | 'month' | 'year';
  perishable?: boolean;
  normalWastageRatePct?: number | null;
  normalWastageSource?: string | null;
  warrantyRequired?: boolean;
  warrantyMonths?: number | null;
  originCountry?: string | null;
  gtipCode?: string | null;
  netWeightKg?: number | null;
  labelNetQuantity?: number | null;
  labelNetUnit?: string | null;
  /** Create only: unit cost of the opening stock */
  openingUnitCost?: number | null;
}

export type BarcodeType = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128';
export type TrackingType = 'none' | 'lot' | 'serial';

/** Unit of measure. Standard units (isStandard) are shown via i18n key `units.<code>`. */
export interface Unit {
  id: string;
  code: string;
  name: string;
  isStandard: boolean;
  /** Allowed decimals for quantities in this unit (0-3) */
  decimals?: number;
  /** UN/ECE Rec. 20 code (C62, KGM, LTR...) */
  uneceCode?: string | null;
  allowsFraction?: boolean;
  /** Not offered for new entries (e.g. lb in a TR company) */
  deprecated?: boolean;
}

export interface ProductUnit {
  id?: string;
  unitId: string;
  /** Base units contained in 1 of this unit, e.g. 12 for a box of 12 */
  factor: number;
  barcode?: string | null;
  unit?: Unit;
}

export interface StockLot {
  id: string;
  productId: string;
  warehouseId: string;
  warehouseName?: string;
  lotNumber: string;
  /** YYYY-MM-DD */
  expiryDate?: string | null;
  quantity: number;
  createdAt?: string;
}

export type SerialStatus = 'in_stock' | 'sold' | 'returned' | 'lost';

export interface SerialNumber {
  id: string;
  productId: string;
  warehouseId?: string | null;
  warehouseName?: string;
  serial: string;
  status: SerialStatus;
  lotId?: string | null;
  createdAt?: string;
}

/** Lot/serial detail of a document line or movement (quantities in base units). */
export interface TrackingEntry {
  warehouseId: string;
  lotId?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  serials?: string[];
}

/** Line unit info shared by order and PO lines. `quantity` is always in base units. */
export interface LineUnitInfo {
  unitId?: string | null;
  unitCode?: string | null;
  /** Base units per entered unit */
  unitFactor?: number;
  /** Quantity as entered, in unitCode (unitPrice is per this unit) */
  unitQuantity?: number;
  tracking?: TrackingEntry[] | null;
}

export interface BarcodeLookupResult {
  product: Product;
  /** Set when the code matched an alternate unit barcode */
  unitId: string | null;
  unitCode: string | null;
  factor: number;
  /** Set when the code matched a serial number */
  serial: string | null;
}

export interface ExpiringLot {
  lotId: string;
  productId: string;
  productName: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  /** Negative when already expired */
  daysLeft: number;
}

export interface OrderItem extends LineUnitInfo, LineTaxFields {
  id?: string;
  /** WP4: base units on approved despatches / on invoices / returned */
  despatchedQuantity?: number;
  invoicedQuantity?: number;
  returnedQuantity?: number;
  productId: string;
  productName: string;
  quantity: number;
  /** Legacy alias of unitPrice */
  price: number;
  /** Net unit price (excl. tax) in document currency */
  unitPrice?: number;
  /** Tax % */
  taxRate?: number;
  taxAmount?: number;
  /** Gross line total (net + tax) */
  lineTotal?: number;
}

/** Fields shared by orders and purchase orders. */
export interface DocumentAmounts extends DocumentTaxFields {
  currency?: string;
  /** 1 unit of currency in company base currency at document time */
  exchangeRate?: number;
  subtotal?: number;
  taxTotal?: number;
  grandTotal?: number;
}

export interface Order extends DocumentAmounts {
  id: string;
  orderNumber: string;
  customerId?: string | null;
  customerName: string;
  date: string;
  status: 'Completed' | 'Pending' | 'Cancelled';
  totalAmount: number;
  items: OrderItem[];
  carrier?: string;
  trackingNumber?: string;
  shippedAt?: string | null;
  salesChannel?: string | null;
  isDistanceSale?: boolean;
  channelOrderRef?: string | null;
  /** WP4: 'order' (stock left at creation) | 'despatch' (reserved; leaves on despatch approval) */
  stockMode?: string;
  documentsLegacy?: boolean;
  /** VUK 232: REQUIRED (merchant / above limit) | OPTIONAL (ÖKC receipt allowed) */
  invoiceRequirement?: 'REQUIRED' | 'OPTIONAL';
  invoiceLimit?: number | null;
  okcReceiptNo?: string | null;
  okcReceiptDate?: string | null;
  /** Response-only: tax engine / VUK 219 warnings */
  warnings?: { code: string; params?: Record<string, unknown> }[];
}

/** Structured address (UBL-TR PostalAddress); TR: provinceCode + districtId from /refdata. */
export interface Address {
  line1?: string | null;
  line2?: string | null;
  districtId?: number | null;
  district?: string | null;
  provinceCode?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  uavtCode?: string | null;
}

export type IdentityType = 'VKN' | 'TCKN' | 'YKN' | 'FOREIGN' | 'ANONYMOUS';

export interface Province { code: string; name: string; }
export interface District { id: number; provinceCode: string; name: string; }
export interface TaxOffice { code: string; name: string; provinceCode: string; district?: string | null; }

export type SupplierType = 'company' | 'individual' | 'farmer';

export interface Supplier {
  id: string;
  name: string;
  type?: SupplierType | string;
  identityType?: IdentityType | string | null;
  identityNumber?: string | null;
  taxOfficeCode?: string | null;
  taxOfficeName?: string | null;
  address?: Address | null;
  isTaxpayer?: boolean;
  isRealTaxationFarmer?: boolean;
  isForeign?: boolean;
  isVatTaxpayer?: boolean;
  isImporterOrOreProducer?: boolean;
  needsReview?: boolean;
  contactPerson?: string;
  email?: string;
  phone?: string;
  notes?: string;
  rating?: number;
  leadTimeDays?: number;
}

export interface PurchaseOrderItem extends LineUnitInfo, LineTaxFields {
  id?: string;
  /** WP4: base units accepted on goods receipts / returned to the supplier */
  receivedQuantity?: number;
  returnedQuantity?: number;
  productId: string;
  productName: string;
  quantity: number;
  /** Legacy (never sent by the API) */
  unitCost?: number;
  price?: number;
  unitPrice?: number;
  taxRate?: number;
  taxAmount?: number;
  lineTotal?: number;
}

export interface PurchaseOrder extends DocumentAmounts {
  id: string;
  /** Response-only: VUK 219 warnings of a back-dated receipt */
  warnings?: MovementWarning[];
  warehouseId?: string | null;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Cancelled';
  items: PurchaseOrderItem[];
  isImport?: boolean;
  customsDeclarationNo?: string | null;
  customsDeclarationDate?: string | null;
  importVatAmount?: number | null;
  nonDeductibleImportVat?: number | null;
  expectedDate?: string | null;
  notes?: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  location?: string;
  capacity?: number;
  address?: Address | null;
  /** One-line address (server formatted) */
  addressText?: string;
  isBranch?: boolean;
  branchCode?: string | null;
  siteGroup?: string | null;
  defaultSeries?: string | null;
  /** NORMAL | QUARANTINE | CONSIGNMENT | IN_TRANSIT */
  type?: string;
  isSellable?: boolean;
  /** OWN | CONSIGNMENT_IN | CONSIGNMENT_OUT */
  ownership?: string;
  /** Oldest active warehouse; receives stock when no warehouse is chosen */
  isDefault?: boolean;
  productCount?: number;
  totalStock?: number;
  totalValue?: number;
}

export type CustomerType = 'individual' | 'company';

export interface Customer {
  id: string;
  name: string;
  type: CustomerType | string;
  email?: string | null;
  phone?: string | null;
  identityType?: IdentityType | string | null;
  identityNumber?: string | null;
  taxOfficeCode?: string | null;
  taxOfficeName?: string | null;
  isVatTaxpayer?: boolean;
  isDesignatedBuyer?: boolean;
  passportNo?: string | null;
  nationality?: string | null;
  foreignTaxId?: string | null;
  address?: Address | null;
  addresses?: CustomerAddress[];
  needsReview?: boolean;
  reviewReason?: string | null;
  /** GİB registry (WP5): e-Fatura / e-İrsaliye registered user */
  eInvoiceRegistered?: boolean | null;
  eInvoiceCheckedAt?: string | null;
  eDespatchRegistered?: boolean | null;
  preferredProfile?: string | null;
  /** Preferred ISO 4217 currency for orders */
  currency?: string | null;
  notes?: string | null;
  orderCount?: number;
  lastOrderDate?: string | null;
  createdAt?: string;
  // WP7 - KVKK
  /** Identity number masked in the response (use POST /customers/:id/reveal) */
  piiMasked?: boolean;
  processingRestricted?: boolean;
  erasureRestrictedUntil?: string | null;
  anonymizedAt?: string | null;
  noticeGivenAt?: string | null;
  noticeVersion?: string | null;
  noticeChannel?: string | null;
  kvkkWarnings?: { code: string; categories: string[] }[];
}

export interface CustomerAddress {
  id?: string;
  kind: 'BILLING' | 'DELIVERY' | string;
  label?: string | null;
  isDefault?: boolean;
  contactName?: string | null;
  phone?: string | null;
  address: Address;
}

export type BookkeepingType = 'BILANCO' | 'ISLETME' | 'BASIT';

export interface FiscalStatus { complete: boolean; missing: string[]; recommended: string[]; }

/** GET /company */
export interface CompanyInfo {
  id: string;
  name: string;
  country: string;
  defaultLanguage: string;
  baseCurrency: string;
  timezone: string;
  pricesIncludeTax: boolean;
  expiryAlertDays: number;
  legalName?: string | null;
  taxIdType?: 'VKN' | 'TCKN' | string | null;
  taxId?: string | null;
  taxOfficeCode?: string | null;
  taxOfficeName?: string | null;
  mersisNo?: string | null;
  tradeRegistryNo?: string | null;
  tradeRegistryOffice?: string | null;
  kepAddress?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: Address | null;
  bookkeepingType?: BookkeepingType | string | null;
  fiscalStatus?: FiscalStatus;
  enabledComplianceModules?: string[] | null;
  /** Manual adjustments above this value (base currency) need a second approver; null = off */
  adjustmentApprovalThreshold?: number | null;
  /** YYYY-MM-DD: no stock movement may be dated on or before it */
  stockLockDate?: string | null;
  /** PUT only: reason for loosening a stock control (lock date back / threshold up) */
  controlChangeReason?: string;
  /** PUT response (HTTP 202): the loosened control waits for a second administrator */
  pendingApproval?: { code: string; message?: string; request: StockAdjustmentRequest };
  // WP6
  costingMethod?: string;
  physicalCountPolicy?: string;
  lastPhysicalCountDate?: string | null;
  destructionRatePct?: number | null;
  destructionRateValidUntil?: string | null;
  destructionRateRef?: string | null;
  bestBeforeSalePolicy?: 'BLOCK' | 'ALLOW' | string;
  gs1CompanyPrefix?: string | null;
  fiscalYearStartMonth?: number;
}

export interface GrossSales { year: number; amount: number; }
export interface SectorFlag { code: string; since: string; }
export interface CorporateEvent { type: string; date: string; counterpartyMandatory?: boolean; note?: string | null; }

export interface EBelgeProfile {
  annualGrossSales?: GrossSales[] | null;
  sectorFlagsEFatura?: SectorFlag[] | null;
  sectorFlagsEIrsaliye?: SectorFlag[] | null;
  eFaturaSince?: string | null;
  eArsivSince?: string | null;
  eIrsaliyeSince?: string | null;
  mandatoryVsVoluntary?: string | null;
  gibWrittenNoticeDate?: string | null;
  corporateEvents?: CorporateEvent[] | null;
}

export interface ObligationResult {
  kind: 'eFatura' | 'eArsiv' | 'eIrsaliye';
  status: 'not_required' | 'upcoming' | 'mandatory' | 'overdue' | 'active' | 'voluntary';
  mandatoryFrom: string | null;
  reason: string | null;
  daysLeft: number | null;
  toleranceUntil: string | null;
  activeSince: string | null;
}

export interface ObligationReport {
  today: string;
  bookkeepingType: string | null;
  eFatura: ObligationResult;
  eArsiv: ObligationResult;
  eIrsaliye: ObligationResult;
  paperInvoice: { allowed: boolean; until: string | null; limit: number | null };
  warnings: string[];
}

export interface ComplianceAlert { code: string; severity: 'error' | 'warning' | 'info'; params?: Record<string, string | number | null>; }

export interface ComplianceReport {
  today: string;
  country: string;
  fiscal: FiscalStatus;
  obligations: ObligationReport | null;
  missingParameters: string[];
  alerts: ComplianceAlert[];
}

export interface LegalParameter {
  id: string;
  country: string;
  key: string;
  validFrom: string;
  validTo?: string | null;
  value: unknown;
  sourceRef: string;
  confidence: string;
  note?: string | null;
  createdBy?: string | null;
}

export interface TaxRate {
  id: string;
  name: string;
  /** Percentage, e.g. 20 */
  rate: number;
  country?: string | null;
  isDefault: boolean;
  /** Catalog code: KDV20 / KDV10 / KDV1 / KDV0 */
  code?: string | null;
  /** STANDARD | EXEMPT (0 %, needs an exemption code) */
  kind?: string;
  taxTypeCode?: string;
  validFrom?: string | null;
  validTo?: string | null;
  /** TR legal catalog row: the rate is locked */
  isSystem?: boolean;
  supersedesId?: string | null;
}

/** 1 baseCurrency = rate quoteCurrency, valid from date (YYYY-MM-DD) */
export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  date: string;
  /** TCMB | MANUAL */
  source?: string;
  /** FOREX_BUYING (used for VAT) | FOREX_SELLING ... */
  rateType?: string;
  bulletinNo?: string | null;
}

export interface DashboardSummary {
  currency: string;
  orderCount: number;
  pendingOrderCount: number;
  revenue: number;
  netRevenue: number;
  taxCollected: number;
  purchasesReceived: number;
  purchasesOpen: number;
  /** Value at cost (VUK 274) */
  inventoryValue: number;
  inventoryCostValue?: number;
  /** Information only: quantity x sales price */
  inventorySalesValue?: number;
  unconvertedCurrencies: string[];
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productSku?: string | null;
  type: 'IN' | 'OUT' | 'ORDER' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'TRANSFER' | 'REVERSAL' | 'DISPOSAL' | 'QUARANTINE_IN' | 'QUARANTINE_OUT' | string;
  reasonCode: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  unitCode?: string | null;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  note?: string;
  referenceType?: string;
  referenceId?: string;
  performedBy?: string;
  /** Maker-checker: second administrator who approved the movement */
  approvedBy?: string | null;
  /** When the goods moved (legal period) */
  transactionDate: string;
  documentType?: string | null;
  documentNo?: string | null;
  documentDate?: string | null;
  counterpartyTaxId?: string | null;
  reversesMovementId?: string | null;
  reversedByMovementId?: string | null;
  reversible?: boolean;
  attachmentCount?: number;
  sequenceNo?: number;
  hash?: string;
  /** When the row was recorded */
  createdAt: string;
  lotId?: string | null;
  lotNumber?: string | null;
  serials?: string[] | null;
}

export interface MovementAttachmentInput { fileName: string; mimeType: string; dataBase64: string; }

export interface StockAdjustmentInput {
  productId: string;
  newQuantity: number;
  warehouseId?: string | null;
  lotId?: string | null;
  reasonCode: string;
  note: string;
  transactionDate?: string | null;
  documentType?: string | null;
  documentNo?: string | null;
  documentDate?: string | null;
  counterpartyTaxId?: string | null;
  attachment?: MovementAttachmentInput | null;
}

/** POST /stock-movements/adjust: booked movement (+warnings) or a pending maker-checker request (HTTP 202). */
export interface StockAdjustmentResult extends Partial<StockMovement> {
  status?: 'PENDING_APPROVAL';
  code?: string;
  message?: string;
  request?: StockAdjustmentRequest;
  warnings?: { code: string; params?: Record<string, unknown> }[];
}

/** VUK 219 late-entry (and similar) warnings returned with booked movements. */
export interface MovementWarning { code: string; params?: Record<string, unknown> }

/** GET /stock-movements/reason-rules: effective evidence rules per reason code. */
export interface ReasonRule { code: string; direction: 'in' | 'out' | 'both'; manual: boolean; needsDocument: boolean; needsAttachment: boolean }

export interface StockAdjustmentRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Null for COMPANY_CONTROL requests */
  productId: string | null;
  productName: string | null;
  warehouseId?: string | null;
  quantityDelta: number;
  estimatedValue: number;
  currency: string;
  threshold: number;
  payload: Partial<StockAdjustmentInput> & {
    kind?: 'ADJUSTMENT' | 'REVERSAL' | 'COUNT' | 'COMPANY_CONTROL';
    reversesMovementId?: string;
    /** COUNT: the stock count the line belongs to */
    document?: { countId?: string; countNumber?: string; countDate?: string };
    /** COMPANY_CONTROL: requested and current values */
    change?: { stockLockDate?: string | null; adjustmentApprovalThreshold?: number | null };
    current?: { stockLockDate?: string | null; adjustmentApprovalThreshold?: number | null };
  };
  requestedBy: string;
  decidedBy?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface MovementAttachment { id: string; fileName: string; mimeType: string; size: number; sha256: string; uploadedBy?: string | null; createdAt: string; }

export interface ChainVerification {
  ok: boolean;
  checked: number;
  lastSequenceNo: number;
  lastHash: string;
  chainHead: { lastSequenceNo: number; lastHash: string };
  issues: { sequenceNo: number | null; id: string; problem: string }[];
  attachmentsChecked?: number;
  verifiedAt: string;
}

export interface StockCountItem {
  productId: string;
  productName: string;
  sku: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  unit: string;
  isModified?: boolean;
  trackingType?: TrackingType;
  /** Lot-tracked: per-lot counts; countedQuantity is their sum */
  lots?: { lotId: string; lotNumber: string; expiryDate?: string | null; warehouseId: string; warehouseName?: string; systemQuantity: number; countedQuantity: number }[];
  /** Serial-tracked: present=false marks a missing serial; countedQuantity = present count */
  serials?: { serial: string; warehouseId: string; warehouseName?: string; present: boolean }[];
  /** Completed counts: the line exceeded the approval threshold and waits for (or got) a second approval */
  approvalRequestId?: string;
}

export interface StockCount {
  id: string;
  countNumber: string;
  status: 'InProgress' | 'Completed';
  items: StockCountItem[];
  notes?: string;
  startedAt: string;
  performedBy: string;
  createdAt: string;
  completedAt?: string;
  // WP6 tutanak
  countType?: 'YEAR_END' | 'PERIODIC' | 'CYCLE' | 'SAMPLING' | string;
  countDate?: string | null;
  asOfDate?: string | null;
  warehouseIds?: string[] | null;
  countedBy?: string[] | null;
  supervisedBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  documentNo?: string | null;
  snapshotHash?: string | null;
}

// ─── Audit log ───
export interface AuditLog {
  id: string;
  companyId: string;
  userId: string | null;
  username: string | null;
  apiKeyId: string | null;
  action: 'create' | 'update' | 'delete' | 'login' | 'login_failed' | string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogMeta {
  entityTypes: string[];
  actions: string[];
  usernames: string[];
}

export interface AuditLogQuery {
  username?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// ─── API keys ───
export type ApiKeyAccess = 'read' | 'write';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Record<string, ApiKeyAccess>;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdBy: string;
  createdAt: string;
  /** Only present in the create response. */
  secret?: string;
}

export interface CreateApiKeyPayload {
  name: string;
  scopes: Record<string, ApiKeyAccess>;
  expiresAt?: string | null;
}

// ─── Webhooks ───
export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Only present in the create response. */
  secret?: string;
  // WP7 - cross-border transfer (KVKK md. 9) and personal data in payloads
  destinationCountry?: string;
  transferBasis?: string;
  sccSignedAt?: string | null;
  sccNotifiedAt?: string | null;
  includePersonalData?: boolean;
  abroad?: boolean;
  sccNotice?: { deadline: string | null; late: boolean };
}

export interface WebhookPayload {
  url?: string;
  description?: string | null;
  events?: string[];
  active?: boolean;
  destinationCountry?: string;
  transferBasis?: string | null;
  sccSignedAt?: string | null;
  sccNotifiedAt?: string | null;
  includePersonalData?: boolean;
}

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseCode: number | null;
  responseBody: string | null;
  error: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

// ─── Import / export ───
export type ExportResource = 'products' | 'customers' | 'suppliers' | 'orders' | 'stock';
export type ImportResource = 'products' | 'customers' | 'suppliers';

export interface ImportRowError {
  row: number;
  field?: string;
  code: string;
  message: string;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}
