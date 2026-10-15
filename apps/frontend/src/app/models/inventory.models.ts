export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  minQuantity: number;
  status: 'In stock' | 'Low stock' | 'Out of stock' | string;
  supplierId?: string | null;
  imageUrl?: string;
  unit?: string;
  /** ISO 4217 currency of price */
  currency?: string;
  taxRateId?: string | null;
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
  createdAt?: string;
}

export type BarcodeType = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128';
export type TrackingType = 'none' | 'lot' | 'serial';

/** Unit of measure. Standard units (isStandard) are shown via i18n key `units.<code>`. */
export interface Unit {
  id: string;
  code: string;
  name: string;
  isStandard: boolean;
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

export interface OrderItem extends LineUnitInfo {
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
export interface DocumentAmounts {
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
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  leadTimeDays?: number;
}

export interface PurchaseOrderItem extends LineUnitInfo {
  id?: string;
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
  warehouseId?: string | null;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Cancelled';
  items: PurchaseOrderItem[];
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
  address?: string;
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
  taxNumber?: string | null;
  /** ISO 3166-1 alpha-2 */
  country?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** Preferred ISO 4217 currency for orders */
  currency?: string | null;
  notes?: string | null;
  orderCount?: number;
  lastOrderDate?: string | null;
  createdAt?: string;
}

export interface TaxRate {
  id: string;
  name: string;
  /** Percentage, e.g. 20 */
  rate: number;
  country?: string | null;
  isDefault: boolean;
}

/** 1 baseCurrency = rate quoteCurrency, valid from date (YYYY-MM-DD) */
export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  date: string;
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
  inventoryValue: number;
  unconvertedCurrencies: string[];
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'IN' | 'OUT' | 'ORDER' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'TRANSFER';
  warehouseId?: string | null;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  note?: string;
  referenceType?: string;
  performedBy?: string;
  createdAt: string;
  lotId?: string | null;
  lotNumber?: string | null;
  serials?: string[] | null;
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
}

export interface WebhookPayload {
  url?: string;
  description?: string | null;
  events?: string[];
  active?: boolean;
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
export type ExportResource = 'products' | 'customers' | 'orders' | 'stock';
export type ImportResource = 'products' | 'customers';

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
