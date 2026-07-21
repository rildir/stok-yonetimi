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
  AiResponseCard,
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
  AiResponseCard,
} from './models/inventory.models';

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

  createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'totalAmount'>): Observable<Order> {
    return this.http.post<Order>(`${this.apiUrl}/orders`, order);
  }

  updateOrderStatus(id: string, status: 'Completed' | 'Pending' | 'Cancelled'): Observable<Order> {
    return this.http.put<Order>(`${this.apiUrl}/orders/${id}/status`, { status });
  }

  deleteOrder(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/orders/${id}`);
  }

  // AI Assistant
  askAi(prompt: string): Observable<AiResponseCard> {
    return this.http.post<AiResponseCard>(`${this.apiUrl}/ai/query`, { prompt });
  }

  // Stock Movements
  getStockMovements(
    productId?: string,
    page: number = 1,
    limit: number = 20,
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

  createManualAdjustment(productId: string, newQuantity: number, note: string): Observable<StockMovement> {
    return this.http.post<StockMovement>(`${this.apiUrl}/stock-movements/adjust`, { productId, newQuantity, note });
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

  createPurchaseOrder(data: Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${this.apiUrl}/purchase-orders`, data);
  }

  updatePurchaseOrderStatus(id: string, status: string): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.apiUrl}/purchase-orders/${id}/status`, { status });
  }

  updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>): Observable<PurchaseOrder> {
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

  // AI Demand Forecasting
  getAiForecast(productId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/ai/forecast/${productId}`);
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

  transferWarehouseStock(productId: string, fromWarehouse: string, toWarehouse: string, quantity: number): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/warehouses/transfer`, { productId, fromWarehouse, toWarehouse, quantity });
  }
}
