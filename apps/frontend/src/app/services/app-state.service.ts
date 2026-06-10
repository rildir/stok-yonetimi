import { Injectable, signal, computed, inject } from '@angular/core';
import { InventoryService, Product, Order } from '../inventory.service';
import { UiStateService } from './ui-state.service';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private inventoryService = inject(InventoryService);
  private ui = inject(UiStateService);

  products = signal<Product[]>([]);
  orders = signal<Order[]>([]);

  totalProducts = computed(() => this.products().length);
  lowStockCount = computed(() => this.products().filter(p => p.status === 'Low stock').length);
  outOfStockCount = computed(() => this.products().filter(p => p.status === 'Out of stock').length);
  totalOrders = computed(() => this.orders().length);
  totalRevenue = computed(() => this.orders()
    .filter(o => o.status === 'Completed')
    .reduce((sum, o) => sum + o.totalAmount, 0)
  );

  loadData() {
    this.inventoryService.getProducts().subscribe({
      next: (prods) => this.products.set(prods),
      error: () => this.ui.showToast('Ürünler yüklenirken hata oluştu.', 'error')
    });
    this.inventoryService.getOrders().subscribe({
      next: (ords) => this.orders.set(ords),
      error: () => this.ui.showToast('Siparişler yüklenirken hata oluştu.', 'error')
    });
  }
}
