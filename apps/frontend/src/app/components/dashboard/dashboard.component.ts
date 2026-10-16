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
import { applyChartDefaults, withAlpha, PRECISION_BAR, precisionScale, ChartTokens } from '../../utils/chart-theme';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe } from '../../i18n';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UninvoicedCardComponent, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'dashboard.title' | t }}</h1>
        <p>{{ 'dashboard.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <a class="btn d-only" routerLink="/stock-count"><app-icon name="count" />{{ 'dashboard.quick.startCount' | t }}</a>
        <a class="btn d-only" routerLink="/stock-movements"><app-icon name="swap" />{{ 'dashboard.quick.newMovement' | t }}</a>
        <a class="btn btn-primary" routerLink="/products" [queryParams]="{ action: 'new' }"><app-icon name="plus" />{{ 'dashboard.quick.newProduct' | t }}</a>
      </div>
    </div>

    <div class="dash">
      <!-- KPI tiles -->
      <div class="kpi-grid">
        <a class="kpi kpi-lead" routerLink="/products">
          <div class="kpi-top"><app-icon name="box" size="sm" />{{ 'dashboard.stat.totalProducts' | t }}<app-icon class="go" name="arrowur" size="sm" /></div>
          <div class="kpi-val"><b>{{ state.totalProducts() | num }}</b></div>
          <div class="kpi-foot dist-foot">
            <span class="distbar" aria-hidden="true">
              @if (healthyCount() > 0) { <i class="ok" [style.flex-grow]="healthyCount()"></i> }
              @if (state.lowStockCount() > 0) { <i class="warn" [style.flex-grow]="state.lowStockCount()"></i> }
              @if (state.outOfStockCount() > 0) { <i class="danger" [style.flex-grow]="state.outOfStockCount()"></i> }
            </span>
            <span>{{ 'dashboard.stat.healthy' | t: { n: (healthyCount() | num) } }}</span>
          </div>
        </a>

        <a class="kpi" routerLink="/products" [class.is-alert]="state.lowStockCount() > 0">
          <div class="kpi-top"><app-icon name="warn" size="sm" />{{ 'dashboard.stat.lowStock' | t }}<app-icon class="go" name="arrowur" size="sm" /></div>
          <div class="kpi-val"><b>{{ state.lowStockCount() | num }}</b></div>
          <div class="kpi-foot"><span>{{ 'dashboard.stat.lowStockHint' | t }}</span></div>
        </a>

        <a class="kpi" routerLink="/products" [class.is-danger]="state.outOfStockCount() > 0">
          <div class="kpi-top"><app-icon name="alert" size="sm" />{{ 'dashboard.stat.outOfStock' | t }}<app-icon class="go" name="arrowur" size="sm" /></div>
          <div class="kpi-val"><b>{{ state.outOfStockCount() | num }}</b></div>
          <div class="kpi-foot"><span>{{ 'dashboard.stat.outOfStockHint' | t }}</span></div>
        </a>

        <a class="kpi kpi-wide" routerLink="/orders">
          <div class="kpi-top"><app-icon name="chart" size="sm" />{{ 'dashboard.stat.totalRevenue' | t }}<app-icon class="go" name="arrowur" size="sm" /></div>
          <div class="kpi-val"><b>{{ state.totalRevenue() | money: baseCurrency() }}</b></div>
          @if (state.summary(); as sm) {
            <div class="kpi-foot stack">
              <span>{{ 'dashboard.stat.taxCollected' | t }} <b class="fv">{{ sm.taxCollected | money: sm.currency || baseCurrency() }}</b></span>
              <span>{{ 'dashboard.stat.inventoryValue' | t }} <b class="fv">{{ sm.inventoryValue | money: sm.currency || baseCurrency() }}</b></span>
              @if (sm.unconvertedCurrencies.length) {
                <span class="is-danger"><app-icon name="alert" size="xs" />{{ 'dashboard.unconverted' | t: { currencies: sm.unconvertedCurrencies.join(', ') } }}</span>
              }
            </div>
          }
        </a>
      </div>

      <div class="grid-12">
        <!-- Weekly stock movement -->
        <section class="card col-span-8 dash-card">
          <div class="card-h">
            <h3>{{ 'dashboard.weeklyChart.title' | t }}</h3>
            <span class="spacer"></span>
            <div class="legend">
              <span><i class="c1"></i>{{ 'dashboard.weeklyChart.in' | t }}</span>
              <span><i class="c2"></i>{{ 'dashboard.weeklyChart.out' | t }}</span>
            </div>
          </div>
          @if (!isWeeklyLoading() && !isChartEmpty()) {
            <div class="chart-sum">
              <div><span><i class="c1"></i>{{ 'dashboard.weeklyChart.in' | t }}</span><b>{{ weeklyIn() | num }}</b></div>
              <div><span><i class="c2"></i>{{ 'dashboard.weeklyChart.out' | t }}</span><b>{{ weeklyOut() | num }}</b></div>
              <div><span>{{ 'dashboard.weeklyChart.net' | t }}</span><b>{{ weeklyIn() - weeklyOut() > 0 ? '+' : '' }}{{ weeklyIn() - weeklyOut() | num }}</b></div>
            </div>
          }
          <div class="chart-box">
            <canvas #weeklyChart [class.is-hidden]="isChartEmpty() || isWeeklyLoading()"></canvas>
            @if (isWeeklyLoading()) {
              <div class="bars-skeleton" aria-hidden="true">
                @for (h of skeletonBars; track $index) { <div class="skeleton" [style.height.%]="h"></div> }
              </div>
            } @else if (isChartEmpty()) {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="bars" /></div>
                <h3>{{ 'dashboard.weeklyChart.emptyTitle' | t }}</h3>
                <p>{{ 'dashboard.weeklyChart.emptyText' | t }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Low stock alerts -->
        <section class="card col-span-4 dash-card">
          <div class="card-h">
            <h3>{{ 'dashboard.lowStock.title' | t }}</h3>
            @if (state.lowStockCount() + state.outOfStockCount() > 0) {
              <span class="badge badge-warning">{{ state.lowStockCount() + state.outOfStockCount() | num }}</span>
            }
            <span class="spacer"></span>
            <a class="btn btn-ghost btn-sm" routerLink="/products">{{ 'dashboard.viewAll' | t }}<app-icon name="chevr" size="sm" /></a>
          </div>
          <div class="card-scroll">
            @if (state.lowStockCount() === 0 && state.outOfStockCount() === 0) {
              <div class="empty-state">
                <div class="empty-art ok"><app-icon name="okc" /></div>
                <p>{{ 'dashboard.lowStock.empty' | t }}</p>
              </div>
            } @else {
              <ul class="crit">
                @for (p of state.products(); track p.id) {
                  @if (p.status !== 'In stock') {
                    <li>
                      <span class="n">{{ p.name }}</span>
                      <span class="q">
                        <span class="badge" [class.badge-warning]="p.status === 'Low stock'" [class.badge-danger]="p.status === 'Out of stock'"><span class="dot"></span>{{ p.quantity | num }}</span>
                        <span>/ {{ p.minQuantity | num }}</span>
                      </span>
                      <div class="meter" [class.warn]="p.status === 'Low stock'" [class.danger]="p.status === 'Out of stock'"><i [style.width.%]="stockPct(p.quantity, p.minQuantity)"></i></div>
                    </li>
                  }
                }
              </ul>
            }
          </div>
        </section>

        <!-- VUK 231/5: deliveries to invoice within 7 days -->
        <app-uninvoiced-card class="col-span-8"></app-uninvoiced-card>

        <!-- Top selling -->
        <section class="card col-span-4 dash-card">
          <div class="card-h"><h3>{{ 'dashboard.topSelling.title' | t }}</h3></div>
          <div class="card-scroll">
            @if (topSellingProducts().length === 0) {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="chart" /></div>
                <p>{{ 'dashboard.topSelling.empty' | t }}</p>
              </div>
            } @else {
              <ol class="crit">
                @for (tp of topSellingProducts(); track tp.name; let i = $index) {
                  <li>
                    <span class="n"><span class="rank">{{ i + 1 }}</span>{{ tp.name }}</span>
                    <span class="q"><b>{{ tp.quantity | num }}</b></span>
                    <div class="meter acc"><i [style.width.%]="tp.percentage"></i></div>
                  </li>
                }
              </ol>
            }
          </div>
        </section>

        <!-- Category distribution -->
        <section class="card col-span-6 dash-card fit">
          <div class="card-h"><h3>{{ 'dashboard.categoryChart.title' | t }}</h3></div>
          <div class="chart-box donut">
            <canvas #categoryChart></canvas>
          </div>
        </section>

        <!-- Recent orders -->
        <section class="card col-span-6 dash-card fit">
          <div class="card-h">
            <h3>{{ 'dashboard.recentOrders.title' | t }}</h3>
            <span class="spacer"></span>
            <a class="btn btn-ghost btn-sm" routerLink="/orders">{{ 'dashboard.viewAll' | t }}<app-icon name="chevr" size="sm" /></a>
          </div>
          <div class="card-scroll">
            @for (o of state.orders().slice(0, 5); track o.id) {
              <div class="mrow">
                <span class="thumb">{{ (o.customerName || '?').charAt(0) }}</span>
                <b>{{ o.customerName }}</b>
                <span class="v">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</span>
                <span class="s"><span class="mono">{{ o.orderNumber }}</span> · {{ o.date | appDate }}</span>
                <span class="s r">
                  <span class="badge" [class.badge-success]="o.status === 'Completed'" [class.badge-warning]="o.status === 'Pending'" [class.badge-danger]="o.status !== 'Completed' && o.status !== 'Pending'"><span class="dot"></span>{{ (o.status === 'Completed' ? 'orders.status.completed' : o.status === 'Pending' ? 'orders.status.pending' : 'orders.status.cancelled') | t }}</span>
                </span>
              </div>
            } @empty {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="cart" /></div>
                <p>{{ 'dashboard.recentOrders.empty' | t }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Expiring lots -->
        @if (expiringCount() > 0) {
          <section class="card col-span-12">
            <div class="card-h">
              <h3>{{ 'dashboard.expiring.title' | t }}</h3>
              <span class="badge badge-warning">{{ expiringCount() | num }}</span>
              <span class="spacer"></span>
              <a routerLink="/reports" [queryParams]="{ tab: 'expiring' }" class="btn btn-ghost btn-sm">{{ 'dashboard.expiring.viewAll' | t }}<app-icon name="chevr" size="sm" /></a>
            </div>
            <div class="table-scroll">
              <table class="tbl table-responsive">
                <thead>
                  <tr>
                    <th>{{ 'dashboard.expiring.product' | t }}</th>
                    <th>{{ 'dashboard.expiring.lot' | t }}</th>
                    <th>{{ 'dashboard.expiring.warehouse' | t }}</th>
                    <th class="r">{{ 'dashboard.expiring.expiry' | t }}</th>
                    <th class="r">{{ 'dashboard.expiring.qty' | t }}</th>
                    <th class="r">{{ 'dashboard.expiring.daysLeft' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of expiringTop(); track l.lotId) {
                    <tr>
                      <td class="td-primary"><div class="cell-prod"><b>{{ l.productName }}</b><span class="cell-code">{{ l.sku }}</span></div></td>
                      <td class="mono" [attr.data-label]="'dashboard.expiring.lot' | t">{{ l.lotNumber }}</td>
                      <td [attr.data-label]="'dashboard.expiring.warehouse' | t">{{ l.warehouseName }}</td>
                      <td class="r" [attr.data-label]="'dashboard.expiring.expiry' | t">{{ l.expiryDate | appDate }}</td>
                      <td class="r" [attr.data-label]="'dashboard.expiring.qty' | t">{{ l.quantity | num }}</td>
                      <td class="r" [attr.data-label]="'dashboard.expiring.daysLeft' | t">
                        <span class="badge" [class.badge-danger]="l.daysLeft < 0" [class.badge-warning]="l.daysLeft >= 0"><span class="dot"></span>{{ l.daysLeft < 0 ? ('dashboard.expiring.expired' | t) : ('dashboard.expiring.days' | t: { n: l.daysLeft }) }}</span>
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
    .dash { display: flex; flex-direction: column; gap: 12px; }
    .grid-12 { gap: 12px; }

    /* KPI */
    .kpi.is-danger .kpi-top { color: var(--danger); }
    .kpi-val b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .kpi-foot .fv { font-weight: 500; color: var(--fg-2); margin-left: 2px; }
    .kpi-foot.stack { flex-direction: column; align-items: flex-start; gap: 2px; margin-top: -4px; }
    .kpi-foot.stack > span { max-width: 100%; }
    .kpi-foot .is-danger { display: inline-flex; align-items: center; gap: 4px; color: var(--danger); white-space: normal; }
    .dist-foot .distbar { flex: 0 0 64px; }
    .dist-foot .distbar > i { flex: 1 1 0; min-width: 2px; }

    /* Cards */
    .dash-card { height: 340px; }
    .dash-card.fit { height: auto; min-height: 340px; }
    .dash-card.fit .chart-box.donut { min-height: 300px; }
    .card-scroll { flex: 1; min-height: 0; overflow-y: auto; }
    .card-scroll > .empty-state { min-height: 100%; }
    .empty-art.ok { background: var(--success-soft); color: var(--success); box-shadow: inset 0 0 0 1px var(--success-line); }

    /* Chart */
    .legend { display: flex; gap: 12px; font-size: var(--text-xs); color: var(--fg-3); }
    .legend span, .chart-sum span { display: inline-flex; align-items: center; gap: 6px; }
    .legend i, .chart-sum i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
    i.c1 { background: var(--chart-1); }
    i.c2 { background: var(--chart-2); }
    .chart-sum { display: flex; gap: 28px; padding: 14px 16px 0; }
    .chart-sum > div { display: flex; flex-direction: column; gap: 2px; }
    .chart-sum span { font-size: var(--text-xs); color: var(--fg-3); }
    .chart-sum b { font-size: var(--text-lg); font-weight: 600; letter-spacing: var(--tracking-tighter); font-variant-numeric: tabular-nums; color: var(--fg); }
    .chart-box { flex: 1; position: relative; min-height: 0; margin: 12px 16px 14px; display: flex; align-items: center; justify-content: center; }
    .chart-box canvas { position: absolute; inset: 0; }
    .chart-box canvas.is-hidden { display: none; }
    .chart-box.donut { margin: 16px; }
    .bars-skeleton { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; width: 100%; height: 100%; padding: 8px 8px 0; }
    .bars-skeleton .skeleton { flex: 1; border-radius: 3px 3px 0 0; }

    /* Ranked lists (critical stock / top sellers) */
    .crit { list-style: none; margin: 0; padding: 4px 0; }
    .crit li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; padding: 10px 16px; align-items: center; }
    .crit li + li { box-shadow: inset 0 1px 0 var(--line); }
    .crit .n { font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; color: var(--fg); }
    .crit .q { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; font-size: var(--text-xs); color: var(--fg-3); white-space: nowrap; }
    .crit .q b { color: var(--fg); font-weight: 500; font-size: var(--text-sm); }
    .crit .meter { grid-column: 1 / -1; }
    .meter.acc > i { background: var(--chart-1); }
    .rank { display: inline-grid; place-items: center; width: 18px; height: 18px; margin-right: 8px; border-radius: var(--radius-2xs); background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--line); font: 500 11px/1 var(--font-mono); color: var(--fg-3); vertical-align: 1px; }

    /* Recent orders rows */
    .mrow { padding: 10px 16px; }
    .mrow .s .mono { font-size: var(--text-xs); }

    @media (max-width: 1024px) {
      .dash-card { height: auto; }
      .dash-card .chart-box { min-height: 240px; }
      .card-scroll { max-height: 340px; }
    }
    @media (max-width: 640px) {
      .table-responsive td { justify-content: flex-end; gap: 6px; }
      .table-responsive td[data-label]::before { margin-right: auto; }
      /* 390: lead + pair + wide, never an orphan half-width tile. */
      .kpi-wide, .kpi-lead { grid-column: 1 / -1; }
      .dist-foot .distbar { flex-basis: 36px; }
      .chart-sum { gap: 20px; }
      .chart-box { min-height: 220px; margin: 12px; }
    }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  i18n = inject(I18nService);
  /** Company base currency: the summary's own currency first, then the profile locale (the i18n default is TRY until the profile loads). */
  baseCurrency = computed(() => this.state.summary()?.currency || this.ui.userProfile()?.locale?.currency || this.i18n.currency());
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
  isChartEmpty = signal(false);
  isWeeklyLoading = signal(true);
  /** Weekly totals shown above the chart (presentation only). */
  weeklyIn = signal(0);
  weeklyOut = signal(0);
  readonly skeletonBars = [40, 75, 50, 90, 30, 60, 45];

  healthyCount = computed(() => Math.max(0, this.state.totalProducts() - this.state.lowStockCount() - this.state.outOfStockCount()));

  /** Meter fill for the critical-stock list: on-hand as a share of the minimum level. */
  stockPct(qty: number, min: number): number {
    if (!min || min <= 0) return qty > 0 ? 100 : 0;
    return Math.max(qty > 0 ? 4 : 0, Math.min(100, Math.round((qty / min) * 100)));
  }

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

    this.isWeeklyLoading.set(true);
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
        this.isChartEmpty.set(isDataEmpty);
        this.weeklyIn.set(entries.reduce((a, b) => a + b, 0));
        this.weeklyOut.set(exits.reduce((a, b) => a + b, 0));

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
                    ...PRECISION_BAR
                  },
                  {
                    label: this.i18n.t('dashboard.weeklyChart.out'),
                    data: exits,
                    backgroundColor: tk.palette[1],
                    ...PRECISION_BAR
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
                    ...precisionScale(tk),
                    beginAtZero: true,
                    ticks: { ...precisionScale(tk).ticks, font: { family: tk.fontSans, size: 11 }, maxTicksLimit: 5, callback: (value: any) => this.i18n.formatNumber(Number(value)) }
                  },
                  x: { ...precisionScale(tk), grid: { display: false }, ticks: { ...precisionScale(tk).ticks, font: { family: tk.fontSans, size: 11 } } }
                }
              }
            });
          }
        }
        this.isWeeklyLoading.set(false);
      },
      error: () => {
        this.isWeeklyLoading.set(false);
      }
    });

    this.inventoryService.getCategoryDistributionReport().subscribe(catRes => {
      this.inventoryService.getCategories().subscribe(cats => {
        const cat = this.donutSlices(catRes.map(c => {
          const matched = cats.find(x => x.slug === c.category);
          return { label: matched ? matched.name : c.category, value: Number(c.totalStock) || 0 };
        }), tk);

        if (this.categoryCanvas) {
          const ctx = this.categoryCanvas.nativeElement.getContext('2d');
          if (ctx) {
            this.categoryChartInstance = new Chart(ctx, {
              type: 'doughnut',
              data: {
                labels: cat.labels,
                datasets: [{
                  data: cat.values,
                  backgroundColor: cat.colors,
                  hoverBackgroundColor: cat.colors.map(c => withAlpha(c, 0.85)),
                  borderColor: tk.surface,
                  borderWidth: 2
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                  legend: {
                    position: this.categoryCanvas.nativeElement.parentElement && this.categoryCanvas.nativeElement.parentElement.clientWidth < 460 ? 'bottom' : 'right',
                    labels: { color: tk.text, padding: 12, font: { size: 12 } }
                  },
                  tooltip: { callbacks: { label: (c: any) => `${c.label}: ${this.i18n.t('dashboard.units', { qty: this.i18n.formatNumber(c.parsed) })}` } }
                }
              }
            });
          }
        }
      });
    });
  }

  /** One distinct colour per slice: top five keep --chart-1…5, the rest fold into a neutral "Other". */
  private donutSlices(items: { label: string; value: number }[], tk: ChartTokens) {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const max = tk.palette.length;
    const head = sorted.length > max ? sorted.slice(0, max - 1) : sorted;
    const rest = sorted.slice(head.length);
    const labels = head.map(i => i.label);
    const values = head.map(i => i.value);
    const colors = head.map((_, i) => tk.palette[i]);
    if (rest.length) {
      labels.push(this.i18n.t('reports.chartOther', { count: rest.length }));
      values.push(rest.reduce((a, i) => a + i.value, 0));
      colors.push(tk.muted);
    }
    return { labels, values, colors };
  }
}
