import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Product, Order } from '../inventory.service';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalAmount: number;
  expectedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  rating: number;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address?: string;
}

export interface GlobalSearchResult {
  products: Product[];
  orders: Order[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  search(query: string, limit = 10): Observable<GlobalSearchResult> {
    return this.http.get<GlobalSearchResult>(
      `${this.apiUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
  }
}
