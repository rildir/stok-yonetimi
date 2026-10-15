import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import {
  Product,
  Order,
  Supplier,
  PurchaseOrder,
  Category,
  Warehouse,
  StockMovement,
  StockCount,
  Customer,
  TaxRate,
  ExchangeRate,
  DashboardSummary,
  Unit,
  StockLot,
  SerialNumber,
  BarcodeLookupResult,
  ExpiringLot,
  StockAdjustmentInput,
  StockAdjustmentResult,
  StockAdjustmentRequest,
  MovementAttachment,
  ChainVerification,
  MovementWarning,
  ReasonRule,
} from './models/inventory.models';
import { HttpResponse } from '@angular/common/http';

export type {
  Product,
  Order,
  OrderItem,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  Category,
  Warehouse,
  StockMovement,
  StockCount,
  StockCountItem,
  Customer,
  CustomerType,
  TaxRate,
  ExchangeRate,
  DashboardSummary,
  DocumentAmounts,
  Unit,
  ProductUnit,
  StockLot,
  SerialNumber,
  SerialStatus,
  TrackingEntry,
  TrackingType,
  BarcodeType,
  LineUnitInfo,
  BarcodeLookupResult,
  ExpiringLot,
  StockAdjustmentInput,
  StockAdjustmentResult,
  StockAdjustmentRequest,
  MovementAttachment,
  ChainVerification,
} from './models/inventory.models';

/** Payload for POST /orders (customerId preferred; customerName used when no customer is linked). */
export interface CreateOrderPayload {
  customerId?: string;
  customerName?: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | string;
  currency?: string;
  warehouseId?: string;
  carrier?: string;
  trackingNumber?: string;
  documentDiscountAmount?: number;
  charges?: { type: string; amount: number; description?: string | null }[];
  taxPointDate?: string;
  shippedAt?: string;
  salesChannel?: string;
  isDistanceSale?: boolean;
  channelOrderRef?: string;
  /** quantity is in unitId (base unit when omitted); unitPrice is per that unit.
   *  lots (base-unit quantities) / serials are optional: omitted => FEFO/FIFO auto allocation. */
  items: {
    productId: string;
    productName?: string;
    quantity: number;
    unitId?: string;
    unitPrice?: number;
    warehouseId?: string;
    discountRate?: number;
    discountAmount?: number;
    exemptionCode?: string | null;
    withholdingCode?: string | null;
    lots?: { lotId: string; quantity: number }[];
    serials?: string[];
  }[];
}

/** Lot/serial capture for one PO line when receiving (quantities in base units). */
export interface PurchaseOrderReceipt {
  itemId: string;
  lots?: { lotNumber: string; expiryDate?: string | null; quantity: number }[];
  serials?: string[];
}

/** Payload for POST/PUT /purchase-orders */
export interface PurchaseOrderPayload {
  supplierId?: string;
  currency?: string;
  warehouseId?: string;
  notes?: string;
  /** quantity in unitId (base unit when omitted); unitPrice per that unit */
  items?: {
    productId: string;
    quantity: number;
    unitId?: string;
    unitPrice?: number;
    discountRate?: number;
    discountAmount?: number;
    exemptionCode?: string | null;
    withholdingCode?: string | null;
    reverseCharge?: boolean;
  }[];
  documentDiscountAmount?: number;
  charges?: { type: string; amount: number; description?: string | null }[];
  taxPointDate?: string;
  customsDeclarationNo?: string | null;
  customsDeclarationDate?: string | null;
  importVatAmount?: number | null;
  nonDeductibleImportVat?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Products
  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}/products`);
  }

  bulkCreateProducts(products: Partial<Product>[]): Observable<Product[]> {
    return this.http.post<Product[]>(`${this.apiUrl}/products/bulk`, products);
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/products`, product);
  }

  updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'status'>>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/products/${id}`, updates);
  }

  deleteProduct(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/products/${id}`);
  }

  bulkDeleteProducts(ids: string[]): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/products/bulk-delete`, { ids });
  }

  bulkUpdateProducts(ids: string[], updates: Partial<Product>): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.apiUrl}/products/bulk-update`, { ids, updates });
  }

  // Orders
  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.apiUrl}/orders`);
  }

  createOrder(order: CreateOrderPayload | Omit<Order, 'id' | 'orderNumber' | 'totalAmount'>): Observable<Order> {
    return this.http.post<Order>(`${this.apiUrl}/orders`, order);
  }

  updateOrderStatus(id: string, status: 'Completed' | 'Pending' | 'Cancelled'): Observable<Order> {
    return this.http.put<Order>(`${this.apiUrl}/orders/${id}/status`, { status });
  }

  deleteOrder(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/orders/${id}`);
  }

  // Stock Movements
  getStockMovements(
    productId?: string,
    page = 1,
    limit = 20,
    search?: string,
    startDate?: string,
    endDate?: string,
    type?: string,
    warehouseId?: string,
    reasonCode?: string,
    dateField: 'transactionDate' | 'createdAt' = 'transactionDate',
  ): Observable<{ data: StockMovement[], total: number }> {
    let url = `${this.apiUrl}/stock-movements?page=${page}&limit=${limit}`;
    if (productId) url += `&productId=${productId}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    if (type) url += `&type=${type}`;
    if (warehouseId) url += `&warehouseId=${encodeURIComponent(warehouseId)}`;
    if (reasonCode) url += `&reasonCode=${encodeURIComponent(reasonCode)}`;
    if (dateField !== 'transactionDate') url += `&dateField=${dateField}`;
    return this.http.get<{ data: StockMovement[], total: number }>(url);
  }

  /**
   * Manual adjustment with mandatory reason (and optional document / attachment). The target
   * quantity is the warehouse's (or the lot's) when given. HTTP 202 = waiting for a second approver.
   */
  createManualAdjustment(input: StockAdjustmentInput): Observable<HttpResponse<StockAdjustmentResult>> {
    return this.http.post<StockAdjustmentResult>(`${this.apiUrl}/stock-movements/adjust`, input, { observe: 'response' });
  }

  /**
   * Books the exact opposite of a movement (corrections never edit the original).
   * HTTP 202 = above the approval threshold, waiting for a second administrator.
   */
  reverseMovement(id: string, note: string, transactionDate?: string | null): Observable<HttpResponse<StockAdjustmentResult>> {
    return this.http.post<StockAdjustmentResult>(`${this.apiUrl}/stock-movements/${id}/reverse`, { note, transactionDate: transactionDate || undefined }, { observe: 'response' });
  }

  /** Reason codes with the effective evidence rules (legal parameter MOVEMENT_REASON_EVIDENCE). */
  getReasonRules(): Observable<ReasonRule[]> {
    return this.http.get<ReasonRule[]>(`${this.apiUrl}/stock-movements/reason-rules`);
  }

  getAdjustmentRequests(status = 'PENDING'): Observable<StockAdjustmentRequest[]> {
    return this.http.get<StockAdjustmentRequest[]>(`${this.apiUrl}/stock-movements/adjustment-requests?status=${status}`);
  }

  decideAdjustmentRequest(id: string, approve: boolean, note?: string): Observable<{ request: StockAdjustmentRequest; warnings?: MovementWarning[] }> {
    return this.http.post<{ request: StockAdjustmentRequest; warnings?: MovementWarning[] }>(`${this.apiUrl}/stock-movements/adjustment-requests/${id}/${approve ? 'approve' : 'reject'}`, { note });
  }

  getMovementAttachments(movementId: string): Observable<MovementAttachment[]> {
    return this.http.get<MovementAttachment[]>(`${this.apiUrl}/stock-movements/${movementId}/attachments`);
  }

  downloadMovementAttachment(attachmentId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/stock-movements/attachments/${attachmentId}/download`, { responseType: 'blob' });
  }

  /** Recomputes the company's stock movement hash chain on the server. */
  verifyMovementIntegrity(): Observable<ChainVerification> {
    return this.http.get<ChainVerification>(`${this.apiUrl}/integrity/stock-movements/verify`);
  }

  // Suppliers
  getSuppliers(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${this.apiUrl}/suppliers`);
  }

  createSupplier(data: Partial<Supplier>): Observable<Supplier> {
    return this.http.post<Supplier>(`${this.apiUrl}/suppliers`, data);
  }

  updateSupplier(id: string, data: Partial<Supplier>): Observable<Supplier> {
    return this.http.put<Supplier>(`${this.apiUrl}/suppliers/${id}`, data);
  }

  deleteSupplier(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/suppliers/${id}`);
  }

  // Purchase Orders
  getPurchaseOrders(): Observable<PurchaseOrder[]> {
    return this.http.get<PurchaseOrder[]>(`${this.apiUrl}/purchase-orders`);
  }

  createPurchaseOrder(data: PurchaseOrderPayload | Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${this.apiUrl}/purchase-orders`, data);
  }

  /** warehouseId: receiving warehouse when status becomes Received (default warehouse if omitted) */
  /** receipts are required for lot/serial tracked lines when status = Received */
  /** Receipt metadata: actual receipt time (company local) and the supplier's delivery document. */
  updatePurchaseOrderStatus(
    id: string,
    status: string,
    warehouseId?: string,
    receipts?: PurchaseOrderReceipt[],
    meta?: { transactionDate?: string; documentType?: string; documentNo?: string; documentDate?: string },
  ): Observable<PurchaseOrder> {
    const body: any = { status, ...(meta || {}) };
    if (warehouseId) body.warehouseId = warehouseId;
    if (receipts?.length) body.receipts = receipts;
    return this.http.put<PurchaseOrder>(`${this.apiUrl}/purchase-orders/${id}/status`, body);
  }

  updatePurchaseOrder(id: string, data: PurchaseOrderPayload | Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.apiUrl}/purchase-orders/${id}`, data);
  }

  deletePurchaseOrder(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/purchase-orders/${id}`);
  }

  // Categories
  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`);
  }

  createCategory(data: Partial<Category>): Observable<Category> {
    return this.http.post<Category>(`${this.apiUrl}/categories`, data);
  }

  updateCategory(id: string, data: Partial<Category>): Observable<Category> {
    return this.http.put<Category>(`${this.apiUrl}/categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/categories/${id}`);
  }

  // Stock Counts
  getStockCounts(): Observable<StockCount[]> {
    return this.http.get<StockCount[]>(`${this.apiUrl}/stock-counts`);
  }

  createStockCount(notes?: string): Observable<StockCount> {
    return this.http.post<StockCount>(`${this.apiUrl}/stock-counts`, { notes });
  }

  updateStockCount(id: string, items: any[], notes?: string): Observable<StockCount> {
    return this.http.put<StockCount>(`${this.apiUrl}/stock-counts/${id}`, { items, notes });
  }

  /** 202 + `pendingApprovals` when lines above the approval threshold wait for a second administrator. */
  completeStockCount(id: string): Observable<StockCount & { pendingApprovals?: StockAdjustmentRequest[]; message?: string }> {
    return this.http.post<StockCount & { pendingApprovals?: StockAdjustmentRequest[]; message?: string }>(`${this.apiUrl}/stock-counts/${id}/complete`, {});
  }

  // Reports
  getStockSummary(startDate?: string, endDate?: string): Observable<any> {
    let url = `${this.apiUrl}/reports/stock-summary`;
    const params = [];
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return this.http.get<any>(url);
  }

  getProductMovementsReport(startDate?: string, endDate?: string): Observable<any[]> {
    let url = `${this.apiUrl}/reports/product-movements`;
    const params = [];
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return this.http.get<any[]>(url);
  }

  getCategoryDistributionReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/reports/category-distribution`);
  }

  getTopSellingReport(days = 30): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/reports/top-selling?days=${days}`);
  }

  getSupplierSummaryReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/reports/supplier-summary`);
  }

  // Auto Draft Purchase Orders
  autoDraftPurchaseOrders(): Observable<{ success: boolean; count: number; orders: PurchaseOrder[] }> {
    return this.http.post<{ success: boolean; count: number; orders: PurchaseOrder[] }>(`${this.apiUrl}/purchase-orders/auto-draft`, {});
  }

  // Warehouse Management
  getWarehouses(): Observable<Warehouse[]> {
    return this.http.get<Warehouse[]>(`${this.apiUrl}/warehouses`);
  }

  createWarehouse(data: Partial<Warehouse>): Observable<Warehouse> {
    return this.http.post<Warehouse>(`${this.apiUrl}/warehouses`, data);
  }

  updateWarehouse(id: string, data: Partial<Warehouse>): Observable<Warehouse> {
    return this.http.put<Warehouse>(`${this.apiUrl}/warehouses/${id}`, data);
  }

  deleteWarehouse(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/warehouses/${id}`);
  }

  /**
   * Transactional warehouse-to-warehouse transfer (TRANSFER_OUT + TRANSFER_IN movements).
   * from/to are warehouse ids (names still accepted by the API for older callers). Returns the updated product.
   */
  /** lotId (lot-tracked) / serials (serial-tracked) are optional; omitted => FEFO/FIFO */
  transferWarehouseStock(productId: string, fromWarehouseId: string, toWarehouseId: string, quantity: number, note?: string, lotId?: string, serials?: string[]): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/warehouses/transfer`, { productId, fromWarehouseId, toWarehouseId, quantity, note, lotId, serials });
  }

  getWarehouseStock(id: string): Observable<{ productId: string; productName: string; sku: string; quantity: number }[]> {
    return this.http.get<{ productId: string; productName: string; sku: string; quantity: number }[]>(`${this.apiUrl}/warehouses/${id}/stock`);
  }

  // Customers
  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${this.apiUrl}/customers`);
  }

  createCustomer(data: Partial<Customer>): Observable<Customer> {
    return this.http.post<Customer>(`${this.apiUrl}/customers`, data);
  }

  updateCustomer(id: string, data: Partial<Customer>): Observable<Customer> {
    return this.http.put<Customer>(`${this.apiUrl}/customers/${id}`, data);
  }

  deleteCustomer(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/customers/${id}`);
  }

  // Tax rates (write: admin)
  getTaxRates(): Observable<TaxRate[]> {
    return this.http.get<TaxRate[]>(`${this.apiUrl}/tax-rates`);
  }

  createTaxRate(data: Partial<TaxRate>): Observable<TaxRate> {
    return this.http.post<TaxRate>(`${this.apiUrl}/tax-rates`, data);
  }

  updateTaxRate(id: string, data: Partial<TaxRate>): Observable<TaxRate> {
    return this.http.put<TaxRate>(`${this.apiUrl}/tax-rates/${id}`, data);
  }

  deleteTaxRate(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/tax-rates/${id}`);
  }

  // Exchange rates (write: admin). POST upserts per (pair, date).
  getExchangeRates(): Observable<ExchangeRate[]> {
    return this.http.get<ExchangeRate[]>(`${this.apiUrl}/exchange-rates`);
  }

  createExchangeRate(data: Partial<ExchangeRate>): Observable<ExchangeRate> {
    return this.http.post<ExchangeRate>(`${this.apiUrl}/exchange-rates`, data);
  }

  updateExchangeRate(id: string, data: Partial<ExchangeRate>): Observable<ExchangeRate> {
    return this.http.put<ExchangeRate>(`${this.apiUrl}/exchange-rates/${id}`, data);
  }

  deleteExchangeRate(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/exchange-rates/${id}`);
  }

  convertCurrency(amount: number, from: string, to?: string): Observable<{ amount: number; from: string; to: string; rate: number; result: number }> {
    let url = `${this.apiUrl}/exchange-rates/convert?amount=${amount}&from=${from}`;
    if (to) url += `&to=${to}`;
    return this.http.get<{ amount: number; from: string; to: string; rate: number; result: number }>(url);
  }

  /** Dashboard headline numbers, all converted to the company base currency. */
  getDashboardSummary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.apiUrl}/reports/dashboard-summary`);
  }

  // Units of measure (write: admin/manager)
  getUnits(): Observable<Unit[]> {
    return this.http.get<Unit[]>(`${this.apiUrl}/units`);
  }

  createUnit(data: Partial<Unit>): Observable<Unit> {
    return this.http.post<Unit>(`${this.apiUrl}/units`, data);
  }

  updateUnit(id: string, data: Partial<Unit>): Observable<Unit> {
    return this.http.put<Unit>(`${this.apiUrl}/units/${id}`, data);
  }

  deleteUnit(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/units/${id}`);
  }

  // Barcodes, lots, serials
  /** Finds a product by its barcode, an alternate-unit barcode, or a serial number (404 when unknown). */
  lookupBarcode(code: string): Observable<BarcodeLookupResult> {
    return this.http.get<BarcodeLookupResult>(`${this.apiUrl}/products/lookup/barcode/${encodeURIComponent(code)}`);
  }

  /** In-stock lots in FEFO order (optionally for one warehouse). */
  getProductLots(productId: string, warehouseId?: string): Observable<StockLot[]> {
    const q = warehouseId ? `?warehouseId=${warehouseId}` : '';
    return this.http.get<StockLot[]>(`${this.apiUrl}/products/${productId}/lots${q}`);
  }

  getProductSerials(productId: string, status: string = 'in_stock', warehouseId?: string): Observable<SerialNumber[]> {
    let q = `?status=${status}`;
    if (warehouseId) q += `&warehouseId=${warehouseId}`;
    return this.http.get<SerialNumber[]>(`${this.apiUrl}/products/${productId}/serials${q}`);
  }

  /** Lots expiring within `days` (default: company expiryAlertDays), expired ones included. */
  getExpiringLots(days?: number): Observable<{ days: number; items: ExpiringLot[] }> {
    const q = days !== undefined ? `?days=${days}` : '';
    return this.http.get<{ days: number; items: ExpiringLot[] }>(`${this.apiUrl}/reports/expiring${q}`);
  }
}
