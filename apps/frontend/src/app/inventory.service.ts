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
} from './models/inventory.models';

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
  items: { productId: string; productName?: string; quantity: number; unitPrice?: number; warehouseId?: string }[];
}

/** Payload for POST/PUT /purchase-orders */
export interface PurchaseOrderPayload {
  supplierId?: string;
  currency?: string;
  warehouseId?: string;
  notes?: string;
  items?: { productId: string; quantity: number; unitPrice?: number }[];
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
    type?: string
  ): Observable<{ data: StockMovement[], total: number }> {
    let url = `${this.apiUrl}/stock-movements?page=${page}&limit=${limit}`;
    if (productId) url += `&productId=${productId}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    if (type) url += `&type=${type}`;
    return this.http.get<{ data: StockMovement[], total: number }>(url);
  }

  /** Sets the product total to newQuantity; the difference is booked on warehouseId (default/greedy if omitted). */
  createManualAdjustment(productId: string, newQuantity: number, note: string, warehouseId?: string): Observable<StockMovement> {
    return this.http.post<StockMovement>(`${this.apiUrl}/stock-movements/adjust`, { productId, newQuantity, note, warehouseId });
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
  updatePurchaseOrderStatus(id: string, status: string, warehouseId?: string): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.apiUrl}/purchase-orders/${id}/status`, warehouseId ? { status, warehouseId } : { status });
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

  completeStockCount(id: string): Observable<StockCount> {
    return this.http.post<StockCount>(`${this.apiUrl}/stock-counts/${id}/complete`, {});
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
  transferWarehouseStock(productId: string, fromWarehouseId: string, toWarehouseId: string, quantity: number, note?: string): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/warehouses/transfer`, { productId, fromWarehouseId, toWarehouseId, quantity, note });
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
}
