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
  status: 'In stock' | 'Low stock' | 'Out of stock';
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
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  // Products
  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}/products`);
  }

  createProduct(product: Omit<Product, 'id' | 'status'>): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/products`, product);
  }

  updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'status'>>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/products/${id}`, updates);
  }

  deleteProduct(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/products/${id}`);
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
}
