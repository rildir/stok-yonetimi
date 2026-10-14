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
}

export interface OrderItem {
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

export interface PurchaseOrderItem {
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
