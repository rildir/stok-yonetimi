import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { InventoryService, Product, Order } from '../inventory.service';
import { DashboardSummary } from '../models/inventory.models';
import { UiStateService } from './ui-state.service';
import { I18nService } from '../i18n';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private inventoryService = inject(InventoryService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  products = signal<Product[]>([]);
  orders = signal<Order[]>([]);
  /** Server-side totals in company base currency */
  summary = signal<DashboardSummary | null>(null);

  totalProducts = computed(() => this.products().length);
  lowStockCount = computed(() => this.products().filter(p => p.status === 'Low stock').length);
  outOfStockCount = computed(() => this.products().filter(p => p.status === 'Out of stock').length);
  totalOrders = computed(() => this.orders().length);
  /** Revenue in base currency: server summary, else client-side conversion via exchangeRate */
  totalRevenue = computed(() => this.summary()?.revenue ?? this.orders()
    .filter(o => o.status === 'Completed')
    .reduce((sum, o) => sum + (o.grandTotal ?? o.totalAmount) * (o.exchangeRate ?? 1), 0)
  );

  private summaryTimer: any = null;
  private dataRequested = false;
  /** Refresh base-currency summary whenever orders change (debounced) */
  private ordersEffect = effect(() => {
    this.orders();
    if (!this.dataRequested) return;
    clearTimeout(this.summaryTimer);
    this.summaryTimer = setTimeout(() => this.loadSummary(), 300);
  });

  loadSummary() {
    this.inventoryService.getDashboardSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null)
    });
  }

  loadData() {
    this.dataRequested = true;
    this.loadSummary();
    this.inventoryService.getProducts().subscribe({
      next: (prods) => this.products.set(prods),
      error: () => this.ui.showToast(this.i18n.t('shared.loadProductsError'), 'error')
    });
    this.inventoryService.getOrders().subscribe({
      next: (ords) => this.orders.set(ords),
      error: () => this.ui.showToast(this.i18n.t('shared.loadOrdersError'), 'error')
    });
  }
}
