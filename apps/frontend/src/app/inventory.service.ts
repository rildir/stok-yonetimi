import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  minQuantity: number;
  status: 'In stock' | 'Low stock' | 'Out of stock' | string;
  supplierId?: string;
  imageUrl?: string;
  unit?: string;
  warehouses?: Record<string, number> | null;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  date: string;
  status: 'Completed' | 'Pending' | 'Cancelled';
  totalAmount: number;
  items: OrderItem[];
  carrier?: string;
  trackingNumber?: string;
}

export interface AiResponseCard {
  title: string;
  type: 'chart' | 'table' | 'metric' | 'list';
  description: string;
  chartType?: 'bar' | 'line' | 'pie' | 'doughnut';
  chartData?: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string[];
      borderColor?: string[];
    }[];
  };
  tableData?: {
    headers: string[];
    rows: any[][];
  };
  metrics?: {
    label: string;
    value: string | number;
    change?: string;
    isPositive?: boolean;
  }[];
  thinking?: string;
  action?: {
    type: string;
    payload: any;
  };
}

import { environment } from '../environments/environment';

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

  bulkCreateProducts(products: any[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/products/bulk`, products);
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

  // AI Assistant
  askAi(prompt: string): Observable<AiResponseCard> {
    return this.http.post<AiResponseCard>(`${this.apiUrl}/ai/query`, { prompt });
  }

  // Stock Movements
  getStockMovements(productId?: string, page: number = 1, limit: number = 20, search?: string): Observable<{ data: any[], total: number }> {
    let url = `${this.apiUrl}/stock-movements?page=${page}&limit=${limit}`;
    if (productId) url += `&productId=${productId}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return this.http.get<{ data: any[], total: number }>(url);
  }

  createManualAdjustment(productId: string, newQuantity: number, note: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/stock-movements/adjust`, { productId, newQuantity, note });
  }

  // Suppliers
  getSuppliers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/suppliers`);
  }

  createSupplier(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/suppliers`, data);
  }

  updateSupplier(id: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/suppliers/${id}`, data);
  }

  deleteSupplier(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/suppliers/${id}`);
  }

  // Purchase Orders
  getPurchaseOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/purchase-orders`);
  }

  createPurchaseOrder(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/purchase-orders`, data);
  }

  updatePurchaseOrderStatus(id: string, status: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/purchase-orders/${id}/status`, { status });
  }

  // Categories
  getCategories(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/categories`);
  }

  createCategory(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/categories`, data);
  }

  updateCategory(id: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/categories/${id}`);
  }

  // Stock Counts
  getStockCounts(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/stock-counts`);
  }

  createStockCount(notes?: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/stock-counts`, { notes });
  }

  updateStockCount(id: string, items: any[], notes?: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/stock-counts/${id}`, { items, notes });
  }

  completeStockCount(id: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/stock-counts/${id}/complete`, {});
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
  autoDraftPurchaseOrders(): Observable<{ success: boolean; count: number; orders: any[] }> {
    return this.http.post<{ success: boolean; count: number; orders: any[] }>(`${this.apiUrl}/purchase-orders/auto-draft`, {});
  }

  // Warehouse Management
  getWarehouses(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/warehouses`);
  }

  transferWarehouseStock(productId: string, fromWarehouse: string, toWarehouse: string, quantity: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/warehouses/transfer`, { productId, fromWarehouse, toWarehouse, quantity });
  }
}

