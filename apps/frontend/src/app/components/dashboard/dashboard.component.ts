import { UninvoicedCardComponent } from '../documents/uninvoiced-card.component';
import { Component, inject, ViewChild, ElementRef, computed, effect, signal, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { ExpiringLot } from '../../models/inventory.models';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { Chart } from 'chart.js/auto';
import { applyChartDefaults, withAlpha } from '../../utils/chart-theme';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe } from '../../i18n';
import { ComplianceBannersComponent } from '../shared/compliance-banners.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, ComplianceBannersComponent, UninvoicedCardComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'dashboard.title' | t }}</h1>
        <p>{{ 'dashboard.subtitle' | t }}</p>
      </div>
    </div>

    <app-compliance-banners class="dash-compliance"></app-compliance-banners>

    <div class="dash">
      <div class="kpi-grid">
        <div class="stat-card">
          <div class="stat-icon-box products">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
          </div>
          <div class="kpi-body">
            <span class="stat-label">{{ 'dashboard.stat.totalProducts' | t }}</span>
            <div class="stat-value">{{ state.totalProducts() | num }}</div>
          </div>
        </div>

        <div class="stat-card" [class.warning-yellow]="state.lowStockCount() > 0">
          <div class="stat-icon-box lowstock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <div class="kpi-body">
            <span class="stat-label">{{ 'dashboard.stat.lowStock' | t }}</span>
            <div class="stat-value low">{{ state.lowStockCount() | num }}</div>
          </div>
        </div>

        <div class="stat-card" [class.warning-red]="state.outOfStockCount() > 0">
          <div class="stat-icon-box outstock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
          </div>
          <div class="kpi-body">
            <span class="stat-label">{{ 'dashboard.stat.outOfStock' | t }}</span>
            <div class="stat-value out">{{ state.outOfStockCount() | num }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon-box revenue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="kpi-body">
            <span class="stat-label">{{ 'dashboard.stat.totalRevenue' | t }}</span>
            <div class="stat-value good">{{ state.totalRevenue() | money }}</div>
            @if (state.summary(); as sm) {
              <div class="kpi-meta">{{ 'dashboard.stat.taxCollected' | t }}: {{ sm.taxCollected | money }} · {{ 'dashboard.stat.inventoryValue' | t }}: {{ sm.inventoryValue | money }}</div>
              @if (sm.unconvertedCurrencies.length) {
                <div class="kpi-meta danger">{{ 'dashboard.unconverted' | t: { currencies: sm.unconvertedCurrencies.join(', ') } }}</div>
              }
            }
          </div>
        </div>
      </div>

      <!-- VUK 231/5: deliveries to invoice within 7 days -->
      <app-uninvoiced-card></app-uninvoiced-card>

      <div class="grid-12">
        <!-- Weekly stock movement -->
        <section class="card col-span-5 dash-card">
          <div class="card-header"><h3 class="card-title">{{ 'dashboard.weeklyChart.title' | t }}</h3>
            <div class="legend">
              <span><i class="dot c1"></i>{{ 'dashboard.weeklyChart.in' | t }}</span>
              <span><i class="dot c2"></i>{{ 'dashboard.weeklyChart.out' | t }}</span>
            </div>
          </div>
          <div class="chart-box">
            <canvas #weeklyChart [style.display]="(isChartEmpty || isWeeklyLoading) ? 'none' : 'block'"></canvas>
            @if (isWeeklyLoading) {
              <div class="bars-skeleton">
                <div class="skeleton" style="height: 40%"></div>
                <div class="skeleton" style="height: 75%"></div>
                <div class="skeleton" style="height: 50%"></div>
                <div class="skeleton" style="height: 90%"></div>
                <div class="skeleton" style="height: 30%"></div>
                <div class="skeleton" style="height: 60%"></div>
                <div class="skeleton" style="height: 45%"></div>
              </div>
            } @else if (isChartEmpty) {
              <div class="empty-state compact">
                <div class="empty-state-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                </div>
                <div class="empty-state-title">{{ 'dashboard.weeklyChart.emptyTitle' | t }}</div>
                <p>{{ 'dashboard.weeklyChart.emptyText' | t }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Category distribution -->
        <section class="card col-span-4 dash-card cat-card">
          <div class="card-header"><h3 class="card-title">{{ 'dashboard.categoryChart.title' | t }}</h3></div>
          <div class="chart-box">
            <canvas #categoryChart></canvas>
          </div>
        </section>

        <!-- Quick actions -->
        <section class="card col-span-3 dash-card quick-card">
          <div class="card-header"><h3 class="card-title">{{ 'dashboard.quick.title' | t }}</h3></div>
          <div class="quick-list">
            <a routerLink="/products" [queryParams]="{ action: 'new' }" class="quick-action-row-btn">
              <span class="qa-ic primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              </span>
              <span class="qa-text">{{ 'dashboard.quick.newProduct' | t }}</span>
            </a>
            <a routerLink="/stock-movements" class="quick-action-row-btn">
              <span class="qa-ic success">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
              </span>
              <span class="qa-text">{{ 'dashboard.quick.newMovement' | t }}</span>
            </a>
            <a routerLink="/stock-count" class="quick-action-row-btn">
              <span class="qa-ic warning">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
              </span>
              <span class="qa-text">{{ 'dashboard.quick.startCount' | t }}</span>
            </a>
          </div>
        </section>

        <!-- Low stock alerts -->
        <section class="card col-span-4 dash-card">
          <div class="card-header"><h3 class="card-title">{{ 'dashboard.lowStock.title' | t }}</h3></div>
          <div class="scroll-list">
            @for (p of state.products(); track p.id) {
              @if (p.status !== 'In stock') {
                <div class="list-item">
                  <div class="list-item-name">
                    <strong>{{ p.name }}</strong>
                    <span>{{ p.sku }}</span>
                  </div>
                  <span class="badge" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">
                    {{ 'dashboard.units' | t: { qty: (p.quantity | num) } }}
                  </span>
                </div>
              }
            }
            @if (state.lowStockCount() === 0 && state.outOfStockCount() === 0) {
              <div class="empty-state compact">
                <div class="empty-state-icon ok">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
                <p>{{ 'dashboard.lowStock.empty' | t }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Top selling -->
        <section class="card col-span-4 dash-card">
          <div class="card-header"><h3 class="card-title">{{ 'dashboard.topSelling.title' | t }}</h3></div>
          <div class="scroll-list top-list">
            @for (tp of topSellingProducts(); track tp.name) {
              <div class="top-item">
                <div class="top-row">
                  <span class="truncate">{{ tp.name }}</span>
                  <span class="num text-muted">{{ 'dashboard.units' | t: { qty: (tp.quantity | num) } }}</span>
                </div>
                <div class="bar"><div class="bar-fill" [style.width.%]="tp.percentage"></div></div>
              </div>
            }
            @if (topSellingProducts().length === 0) {
              <div class="empty-state compact">
                <div class="empty-state-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/></svg>
                </div>
                <p>{{ 'dashboard.topSelling.empty' | t }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Recent orders -->
        <section class="card col-span-4 dash-card">
          <div class="card-header"><h3 class="card-title">{{ 'dashboard.recentOrders.title' | t }}</h3></div>
          <div class="scroll-list">
            @for (o of state.orders().slice(0, 5); track o.id) {
              <div class="list-item">
                <div class="list-item-name">
                  <strong>{{ o.customerName }}</strong>
                  <span>{{ o.orderNumber }} · {{ o.date | appDate }}</span>
                </div>
                <div class="list-item-right">
                  <strong class="num">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</strong>
                  <span class="sdot" [class.completed]="o.status === 'Completed'" [class.pending]="o.status === 'Pending'" [class.cancelled]="o.status === 'Cancelled'"></span>
                </div>
              </div>
            }
          </div>
        </section>

        <!-- Expiring lots -->
        @if (expiringCount() > 0) {
          <section class="card col-span-12">
            <div class="card-header">
              <h3 class="card-title cluster">{{ 'dashboard.expiring.title' | t }} <span class="badge badge-warning">{{ expiringCount() }}</span></h3>
              <a routerLink="/reports" [queryParams]="{ tab: 'expiring' }" class="btn btn-ghost btn-sm">{{ 'dashboard.expiring.viewAll' | t }} →</a>
            </div>
            <div class="table-scroll">
              <table class="table-responsive">
                <thead>
                  <tr>
                    <th>{{ 'dashboard.expiring.product' | t }}</th>
                    <th>{{ 'dashboard.expiring.lot' | t }}</th>
                    <th>{{ 'dashboard.expiring.warehouse' | t }}</th>
                    <th>{{ 'dashboard.expiring.expiry' | t }}</th>
                    <th class="num">{{ 'dashboard.expiring.qty' | t }}</th>
                    <th class="num">{{ 'dashboard.expiring.daysLeft' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of expiringTop(); track l.lotId) {
                    <tr>
                      <td [attr.data-label]="'dashboard.expiring.product' | t"><strong>{{ l.productName }}</strong> <span class="mono text-muted">{{ l.sku }}</span></td>
                      <td class="mono" [attr.data-label]="'dashboard.expiring.lot' | t">{{ l.lotNumber }}</td>
                      <td [attr.data-label]="'dashboard.expiring.warehouse' | t">{{ l.warehouseName }}</td>
                      <td [attr.data-label]="'dashboard.expiring.expiry' | t">{{ l.expiryDate | appDate }}</td>
                      <td class="num" [attr.data-label]="'dashboard.expiring.qty' | t">{{ l.quantity | num }}</td>
                      <td class="num" [attr.data-label]="'dashboard.expiring.daysLeft' | t">
                        <span class="badge" [class.badge-danger]="l.daysLeft < 0" [class.badge-warning]="l.daysLeft >= 0">{{ l.daysLeft < 0 ? ('dashboard.expiring.expired' | t) : ('dashboard.expiring.days' | t: { n: l.daysLeft }) }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: [`
    .dash-compliance { margin-bottom: var(--space-4); }
    .dash { display: flex; flex-direction: column; gap: var(--space-4); padding-bottom: var(--space-10); }
    .kpi-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .kpi-meta.danger { color: var(--color-danger-text); }
    .dash-card { height: 320px; }
    .chart-box { flex: 1; position: relative; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .chart-box canvas { position: absolute; inset: 0; }
    .legend { display: flex; gap: var(--space-3); font-size: var(--text-xs); color: var(--color-text-muted); }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.c1 { background: var(--chart-1); } .dot.c2 { background: var(--chart-2); }
    .bars-skeleton { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-3); width: 100%; height: 100%; padding: var(--space-2) var(--space-2) 0; }
    .bars-skeleton .skeleton { flex: 1; border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
    .empty-state.compact { padding: var(--space-4); border: 0; background: none; margin: auto; }
    .empty-state.compact p { font-size: var(--text-sm); }
    .empty-state-icon.ok { background: var(--color-success-subtle); color: var(--color-success); }
    .quick-list { display: flex; flex-direction: column; gap: var(--space-2); flex: 1; justify-content: center; }
    .qa-ic { width: 32px; height: 32px; border-radius: var(--radius-md); display: inline-grid; place-items: center; flex-shrink: 0; }
    .qa-ic.primary { background: var(--color-primary-subtle); color: var(--color-primary-text); }
    .qa-ic.success { background: var(--color-success-subtle); color: var(--color-success); }
    .qa-ic.warning { background: var(--color-warning-subtle); color: var(--color-warning); }
    .scroll-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-1); margin: 0 calc(-1 * var(--space-2)); padding: 0 var(--space-2); }
    .top-list { gap: var(--space-4); }
    .top-item { display: flex; flex-direction: column; gap: 6px; }
    .top-row { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text); }
    .bar { height: 6px; background: var(--color-surface-muted); border-radius: var(--radius-full); overflow: hidden; }
    .bar-fill { height: 100%; background: var(--color-primary); border-radius: var(--radius-full); transition: width var(--duration-slow, 320ms) var(--ease-standard, ease-out); }
    @media (max-width: 1280px) and (min-width: 1025px) {
      .col-span-5, .cat-card { grid-column: span 6; }
      .quick-card { grid-column: 1 / -1; height: auto; }
      .quick-card .quick-list { flex-direction: row; flex-wrap: wrap; }
      .quick-card .quick-action-row-btn { flex: 1 1 200px; }
    }
    @media (max-width: 1024px) { .dash-card { height: auto; min-height: 260px; } .chart-box { min-height: 240px; } .scroll-list { max-height: 280px; } }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  i18n = inject(I18nService);
  private viewReady = false;

  // Re-render charts when the language/locale changes
  private langEffect = effect(() => {
    this.i18n.lang();
    this.i18n.locale();
    if (this.viewReady) setTimeout(() => this.renderDashboardCharts(), 0);
  });

  private onThemeChange = () => { if (this.viewReady) this.renderDashboardCharts(); };

  ngOnDestroy() {
    window.removeEventListener('themechange', this.onThemeChange);
    this.weeklyChartInstance?.destroy();
    this.categoryChartInstance?.destroy();
  }
  
  isBannerDismissed = false;
  isChartEmpty = false;
  isWeeklyLoading = true;

  @ViewChild('weeklyChart') weeklyCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryCanvas!: ElementRef<HTMLCanvasElement>;

  weeklyChartInstance: any = null;
  categoryChartInstance: any = null;

  topSellingProducts = computed(() => {
    const completedOrders = this.state.orders().filter(o => o.status === 'Completed');
    const productQuantities: Record<string, { name: string, quantity: number, totalAmount: number }> = {};
    for (const order of completedOrders) {
      for (const item of order.items) {
        if (!productQuantities[item.productId]) {
          productQuantities[item.productId] = { name: item.productName, quantity: 0, totalAmount: 0 };
        }
        productQuantities[item.productId].quantity += item.quantity;
        productQuantities[item.productId].totalAmount += (item.lineTotal ?? item.quantity * item.price) * (order.exchangeRate ?? 1);
      }
    }
    const list = Object.values(productQuantities).sort((a, b) => b.quantity - a.quantity);
    const maxQty = list.length > 0 ? list[0].quantity : 1;
    return list.slice(0, 5).map(item => ({
      ...item,
      percentage: Math.round((item.quantity / maxQty) * 100)
    }));
  });

  ngOnInit() {
    this.isBannerDismissed = localStorage.getItem('ecelon_ai_banner_dismissed') === 'true';
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
    this.inventoryService.getExpiringLots().subscribe({
      next: (res) => {
        const items = [...(res?.items || [])].sort((a, b) => a.daysLeft - b.daysLeft);
        this.expiringCount.set(items.length);
        this.expiringTop.set(items.slice(0, 5));
      },
      error: () => { /* widget is optional; fail silently */ }
    });
  }

  expiringCount = signal(0);
  expiringTop = signal<ExpiringLot[]>([]);

  dismissBanner(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.isBannerDismissed = true;
    localStorage.setItem('ecelon_ai_banner_dismissed', 'true');
  }

  ngAfterViewInit() {
    window.addEventListener('themechange', this.onThemeChange);
    setTimeout(() => { this.viewReady = true; this.renderDashboardCharts(); }, 50);
  }

  renderDashboardCharts() {
    if (this.weeklyChartInstance) this.weeklyChartInstance.destroy();
    if (this.categoryChartInstance) this.categoryChartInstance.destroy();
    this.weeklyChartInstance = null;
    this.categoryChartInstance = null;
    const tk = applyChartDefaults();

    const labels: string[] = [];
    const entries: number[] = [];
    const exits: number[] = [];
    const daysMap: Record<string, { in: number, out: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      daysMap[key] = { in: 0, out: 0 };
      labels.push(new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'short' }).format(d));
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    this.isWeeklyLoading = true;
    this.inventoryService.getStockMovements(undefined, 1, 100).subscribe({
      next: res => {
        const movements = res.data || [];
        for (const m of movements) {
          const mDate = new Date(m.createdAt);
          if (mDate.getTime() >= sevenDaysAgo.getTime()) {
            const key = mDate.toDateString();
            if (daysMap[key]) {
              const qty = m.quantity || 0;
              if (qty > 0) {
                daysMap[key].in += qty;
              } else {
                daysMap[key].out += Math.abs(qty);
              }
            }
          }
        }

        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toDateString();
          entries.push(daysMap[key].in);
          exits.push(daysMap[key].out);
        }

        const isDataEmpty = entries.every(v => v === 0) && exits.every(v => v === 0);
        this.isChartEmpty = isDataEmpty;

        if (!isDataEmpty && this.weeklyCanvas) {
          const ctx = this.weeklyCanvas.nativeElement.getContext('2d');
          if (ctx) {
            this.weeklyChartInstance = new Chart(ctx, {
              type: 'bar',
              data: {
                labels,
                datasets: [
                  {
                    label: this.i18n.t('dashboard.weeklyChart.in'),
                    data: entries,
                    backgroundColor: tk.palette[0],
                    borderRadius: 4,
                    maxBarThickness: 18
                  },
                  {
                    label: this.i18n.t('dashboard.weeklyChart.out'),
                    data: exits,
                    backgroundColor: tk.palette[1],
                    borderRadius: 4,
                    maxBarThickness: 18
                  }
                ]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (context: any) => {
                        let label = context.dataset.label || '';
                        if (label) {
                          label += ': ';
                        }
                        if (context.parsed.y !== null) {
                          label += this.i18n.t('dashboard.units', { qty: this.i18n.formatNumber(context.parsed.y) });
                        }
                        return label;
                      }
                    }
                  }
                },
                scales: {
                  y: { 
                    beginAtZero: true, 
                    grid: { color: tk.grid },
                    border: { display: false },
                    ticks: {
                      color: tk.muted, maxTicksLimit: 5,
                      callback: (value: any) => {
                        return this.i18n.t('dashboard.units', { qty: this.i18n.formatNumber(value) });
                      }
                    } 
                  },
                  x: { grid: { display: false }, border: { color: tk.border }, ticks: { color: tk.muted } }
                }
              }
            });
          }
        }
        this.isWeeklyLoading = false;
      },
      error: () => {
        this.isWeeklyLoading = false;
      }
    });

    this.inventoryService.getCategoryDistributionReport().subscribe(catRes => {
      this.inventoryService.getCategories().subscribe(cats => {
        const catLabels = catRes.map(c => {
          const matched = cats.find(x => x.slug === c.category);
          return matched ? matched.name : c.category;
        });
        const catValues = catRes.map(c => c.totalStock);

        if (this.categoryCanvas) {
          const ctx = this.categoryCanvas.nativeElement.getContext('2d');
          if (ctx) {
            this.categoryChartInstance = new Chart(ctx, {
              type: 'doughnut',
              data: {
                labels: catLabels,
                datasets: [{
                  data: catValues,
                  backgroundColor: catValues.map((_, i) => tk.palette[i % tk.palette.length]),
                  hoverBackgroundColor: catValues.map((_, i) => withAlpha(tk.palette[i % tk.palette.length], 0.85)),
                  borderColor: tk.surface,
                  borderWidth: 2
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                  legend: { position: 'right', labels: { color: tk.text, padding: 12, font: { size: 12 } } }
                }
              }
            });
          }
        }
      });
    });
  }
}
