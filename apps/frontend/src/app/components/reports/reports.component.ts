import { Component, inject, signal, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ActivatedRoute } from '@angular/router';
import { ExpiringLot } from '../../models/inventory.models';
import { Chart } from 'chart.js/auto';
import { applyChartDefaults, withAlpha } from '../../utils/chart-theme';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe } from '../../i18n';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, MoneyPipe, NumberFormatPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'reports.title' | t }}</h1>
        <p>{{ 'reports.subtitle' | t }}</p>
        <p class="base-note">{{ 'reports.baseCurrencyNote' | t: { currency: i18n.currency() } }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="exportToCsv()" [disabled]="isLoading()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
          {{ 'reports.downloadCsv' | t }}
        </button>
      </div>
    </div>

    <div class="rep">
      <!-- Filters -->
      <div class="filter-bar">
        <span class="filter-label">{{ 'reports.dateRange' | t }}</span>
        <div class="date-range">
          <input type="date" class="input" [(ngModel)]="startDate" [title]="'reports.startDate' | t" />
          <span class="text-muted">–</span>
          <input type="date" class="input" [(ngModel)]="endDate" [title]="'reports.endDate' | t" />
        </div>
        <div class="cluster">
          @if (startDate || endDate) {
            <button class="btn btn-ghost" (click)="clearFilters()">{{ 'reports.clearFilters' | t }}</button>
          }
          <button class="btn btn-secondary" (click)="loadReports()">{{ 'reports.apply' | t }}</button>
        </div>
      </div>

      @if (isLoading()) {
        <div class="kpi-grid">
          @for (i of [1, 2, 3]; track i) {
            <div class="stat-card sk-card"><div class="skeleton-title"></div><div class="skeleton-text short"></div></div>
          }
        </div>
        <div class="grid-12">
          <div class="card col-span-6 sk-chart"><div class="skeleton-title"></div><div class="skeleton fill"></div></div>
          <div class="card col-span-6 sk-chart"><div class="skeleton-title"></div><div class="skeleton fill"></div></div>
        </div>
        <p class="text-muted calc">{{ 'reports.calculating' | t }}</p>
      } @else {
        <!-- Summary KPIs -->
        <div class="kpi-grid">
          <div class="stat-card">
            <div class="stat-icon-box revenue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
            </div>
            <div class="kpi-body">
              <span class="stat-label">{{ 'reports.totalIn' | t }}</span>
              <div class="stat-value good">+{{ summary().totalIn | num }}</div>
              <div class="kpi-meta">{{ 'reports.totalInDesc' | t }}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-box outstock">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
            </div>
            <div class="kpi-body">
              <span class="stat-label">{{ 'reports.totalOut' | t }}</span>
              <div class="stat-value out">-{{ summary().totalOut | num }}</div>
              <div class="kpi-meta">{{ 'reports.totalOutDesc' | t }}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-box products">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
            </div>
            <div class="kpi-body">
              <span class="stat-label">{{ 'reports.netChange' | t }}</span>
              <div class="stat-value" [class.good]="summary().netChange > 0" [class.out]="summary().netChange < 0">
                {{ summary().netChange > 0 ? '+' : '' }}{{ summary().netChange | num }}
              </div>
              <div class="kpi-meta">{{ 'reports.netChangeDesc' | t }}</div>
            </div>
          </div>
        </div>

        <!-- Charts -->
        <div class="grid-12">
          <section class="card col-span-6">
            <div>
              <h3 class="card-title">{{ 'reports.categoryChartTitle' | t }}</h3>
              <p class="card-subtitle">{{ 'reports.categoryChartDesc' | t }}</p>
            </div>
            <div class="chart-container"><canvas #catChart></canvas></div>
          </section>
          <section class="card col-span-6">
            <div>
              <h3 class="card-title">{{ 'reports.topChartTitle' | t }}</h3>
              <p class="card-subtitle">{{ 'reports.topChartDesc' | t }}</p>
            </div>
            <div class="chart-container"><canvas #topChart></canvas></div>
          </section>

          <!-- Product movements -->
          <section class="table-card col-span-6">
            <div class="tc-head">
              <h3 class="card-title">{{ 'reports.movementsTitle' | t }}</h3>
              <p class="card-subtitle">{{ 'reports.movementsDesc' | t }}</p>
            </div>
            <div class="table-scroll capped">
              <table class="table-responsive">
                <thead>
                  <tr>
                    <th>{{ 'reports.col.productName' | t }}</th>
                    <th class="num">{{ 'reports.col.totalIn' | t }}</th>
                    <th class="num">{{ 'reports.col.totalOut' | t }}</th>
                    <th class="num">{{ 'reports.col.netChange' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of productMovements(); track p.productId) {
                    <tr>
                      <td class="font-medium" [attr.data-label]="'reports.col.productName' | t">{{ p.productName }}</td>
                      <td class="num pos" [attr.data-label]="'reports.col.totalIn' | t">+{{ p.totalIn | num }}</td>
                      <td class="num neg" [attr.data-label]="'reports.col.totalOut' | t">-{{ p.totalOut | num }}</td>
                      <td class="num font-medium" [attr.data-label]="'reports.col.netChange' | t" [class.pos]="p.totalIn - p.totalOut > 0" [class.neg]="p.totalIn - p.totalOut < 0">
                        {{ p.totalIn - p.totalOut | num }}
                      </td>
                    </tr>
                  }
                  @if (productMovements().length === 0) {
                    <tr class="empty-row"><td colspan="4"><div class="empty-state compact"><p>{{ 'reports.noMovements' | t }}</p></div></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <!-- Supplier summary -->
          <section class="table-card col-span-6">
            <div class="tc-head">
              <h3 class="card-title">{{ 'reports.supplierTitle' | t }}</h3>
              <p class="card-subtitle">{{ 'reports.supplierDesc' | t }}</p>
            </div>
            <div class="table-scroll capped">
              <table class="table-responsive">
                <thead>
                  <tr>
                    <th>{{ 'reports.col.supplier' | t }}</th>
                    <th class="num">{{ 'reports.col.poCount' | t }}</th>
                    <th class="num">{{ 'reports.col.totalPaid' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of supplierSummary(); track s.supplierName) {
                    <tr>
                      <td class="font-medium" [attr.data-label]="'reports.col.supplier' | t">{{ s.supplierName }}</td>
                      <td class="num" [attr.data-label]="'reports.col.poCount' | t">{{ s.poCount }}</td>
                      <td class="num font-medium" [attr.data-label]="'reports.col.totalPaid' | t">{{ s.totalAmount | money }}</td>
                    </tr>
                  }
                  @if (supplierSummary().length === 0) {
                    <tr class="empty-row"><td colspan="3"><div class="empty-state compact"><p>{{ 'reports.noPurchases' | t }}</p></div></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      }

      <!-- Expiring lots -->
      <section id="expiring-report" class="table-card">
        <div class="tc-head split">
          <div>
            <h3 class="card-title">{{ 'reports.expiring.title' | t }}</h3>
            <p class="card-subtitle">{{ 'reports.expiring.desc' | t }}</p>
          </div>
          <div class="cluster">
            <label for="expDays" class="text-muted exp-label">{{ 'reports.expiring.days' | t }}</label>
            <input id="expDays" type="number" min="1" step="1" [(ngModel)]="expiringDays" class="input exp-days" (keyup.enter)="loadExpiring()" />
            <button class="btn btn-secondary btn-sm" (click)="loadExpiring()" [disabled]="expiringLoading()">{{ 'reports.apply' | t }}</button>
            <button class="btn btn-ghost btn-sm" (click)="exportExpiringCsv()" [disabled]="expiringLots().length === 0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
              {{ 'reports.expiring.export' | t }}
            </button>
          </div>
        </div>
        <div class="table-scroll capped-lg">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'reports.expiring.col.product' | t }}</th>
                <th>{{ 'reports.expiring.col.sku' | t }}</th>
                <th>{{ 'reports.expiring.col.lot' | t }}</th>
                <th>{{ 'reports.expiring.col.warehouse' | t }}</th>
                <th>{{ 'reports.expiring.col.expiry' | t }}</th>
                <th class="num">{{ 'reports.expiring.col.qty' | t }}</th>
                <th class="num">{{ 'reports.expiring.col.daysLeft' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @if (expiringLoading()) {
                @for (i of [1, 2, 3]; track i) {
                  <tr><td colspan="7"><div class="skeleton-row"></div></td></tr>
                }
              } @else {
                @for (l of expiringLots(); track l.lotId) {
                  <tr [class.row-expired]="l.daysLeft < 0">
                    <td class="font-medium" [attr.data-label]="'reports.expiring.col.product' | t">{{ l.productName }}</td>
                    <td class="mono" [attr.data-label]="'reports.expiring.col.sku' | t">{{ l.sku }}</td>
                    <td class="mono" [attr.data-label]="'reports.expiring.col.lot' | t">{{ l.lotNumber }}</td>
                    <td [attr.data-label]="'reports.expiring.col.warehouse' | t">{{ l.warehouseName }}</td>
                    <td class="num" [attr.data-label]="'reports.expiring.col.expiry' | t">{{ l.expiryDate }}</td>
                    <td class="num" [attr.data-label]="'reports.expiring.col.qty' | t">{{ l.quantity | num }}</td>
                    <td class="num" [attr.data-label]="'reports.expiring.col.daysLeft' | t">
                      <span class="badge" [class.badge-danger]="l.daysLeft < 0" [class.badge-warning]="l.daysLeft >= 0 && l.daysLeft <= 7" [class.badge-neutral]="l.daysLeft > 7">{{ l.daysLeft < 0 ? ('reports.expiring.expired' | t) : l.daysLeft }}</span>
                    </td>
                  </tr>
                }
                @if (expiringLots().length === 0) {
                  <tr class="empty-row"><td colspan="7">
                    <div class="empty-state compact">
                      <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg></div>
                      <p>{{ 'reports.expiring.empty' | t }}</p>
                    </div>
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .rep { display: flex; flex-direction: column; gap: var(--space-4); padding-bottom: var(--space-10); }
    .page-header .base-note { font-size: var(--text-xs); color: var(--color-text-subtle); margin-top: var(--space-1); }
    .filter-label { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text-secondary); }
    .date-range { display: flex; align-items: center; gap: var(--space-2); flex: 1 1 280px; min-width: 0; }
    .date-range .input { flex: 1; min-width: 0; max-width: 180px; }
    .kpi-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sk-card { flex-direction: column; gap: var(--space-3); min-height: 104px; }
    .sk-chart { height: 340px; }
    .skeleton.fill { flex: 1; }
    .calc { font-size: var(--text-sm); text-align: center; }
    .chart-container { position: relative; height: 280px; width: 100%; }
    .tc-head { padding: var(--space-4) var(--space-5); border-bottom: var(--border-width) solid var(--color-border-subtle); }
    .tc-head.split { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
    .exp-label { font-size: var(--text-sm); }
    .exp-days { width: 84px; }
    .capped { max-height: 360px; overflow: auto; }
    .capped-lg { max-height: 440px; overflow: auto; }
    .pos { color: var(--color-success-text); }
    .neg { color: var(--color-danger-text); }
    .row-expired td { background: var(--color-danger-subtle); }
    .empty-row td { padding: 0 !important; }
    .empty-row td::before { display: none !important; }
    .empty-state.compact { padding: var(--space-6) var(--space-4); border: 0; background: none; }
    .empty-state.compact p { font-size: var(--text-sm); }
    @media (max-width: 640px) {
      .date-range .input { max-width: none; }
      .capped, .capped-lg { max-height: none; }
      .chart-container { height: 260px; }
    }
  `]
})
export class ReportsComponent implements OnInit, AfterViewInit, OnDestroy {
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);

  constructor() {
    // Re-render charts when the language changes
    effect(() => {
      this.i18n.lang();
      if (!this.isLoading()) setTimeout(() => this.renderCharts(), 0);
    });
  }

  @ViewChild('catChart') catCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topChart') topCanvas!: ElementRef<HTMLCanvasElement>;

  catChartInstance: any = null;
  topChartInstance: any = null;

  isLoading = signal(true);
  
  // Date range inputs
  startDate = '';
  endDate = '';

  // Data signals
  summary = signal<{ totalIn: number, totalOut: number, netChange: number }>({ totalIn: 0, totalOut: 0, netChange: 0 });
  productMovements = signal<any[]>([]);
  categoriesDistribution = signal<any[]>([]);
  topSelling = signal<any[]>([]);
  supplierSummary = signal<any[]>([]);
  categories = signal<any[]>([]);

  // Expiring lots report
  route = inject(ActivatedRoute);
  expiringDays = 30;
  expiringLots = signal<ExpiringLot[]>([]);
  expiringLoading = signal(false);

  ngOnInit() {
    this.loadCategories();
    this.loadReports();
    this.loadExpiring();
    if (this.route.snapshot.queryParamMap.get('tab') === 'expiring') {
      setTimeout(() => document.getElementById('expiring-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }

  loadExpiring() {
    const days = Math.max(1, Math.floor(Number(this.expiringDays) || 30));
    this.expiringDays = days;
    this.expiringLoading.set(true);
    this.inventoryService.getExpiringLots(days).subscribe({
      next: (res) => {
        this.expiringLots.set([...(res?.items || [])].sort((a, b) => a.daysLeft - b.daysLeft));
        this.expiringLoading.set(false);
      },
      error: () => {
        this.expiringLots.set([]);
        this.expiringLoading.set(false);
        this.ui.showToast(this.i18n.t('reports.expiring.loadError'), 'error');
      }
    });
  }

  exportExpiringCsv() {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const esc = (v: unknown) => String(v ?? '').replace(/;/g, ',');
    let csv = '﻿';
    csv += [t('reports.expiring.col.product'), t('reports.expiring.col.sku'), t('reports.expiring.col.lot'), t('reports.expiring.col.warehouse'),
      t('reports.expiring.col.expiry'), t('reports.expiring.col.qty'), t('reports.expiring.col.daysLeft')].join(';') + '\r\n';
    for (const l of this.expiringLots()) {
      csv += [l.productName, l.sku, l.lotNumber, l.warehouseName, l.expiryDate, l.quantity, l.daysLeft].map(esc).join(';') + '\r\n';
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Smart_Inventory_${t('reports.expiring.filePrefix')}_${this.expiringDays}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private onThemeChange = () => { if (!this.isLoading()) this.renderCharts(); };

  ngAfterViewInit() {
    // Render charts once data is loaded and views are checked
    window.addEventListener('themechange', this.onThemeChange);
  }

  ngOnDestroy() {
    window.removeEventListener('themechange', this.onThemeChange);
    this.catChartInstance?.destroy();
    this.topChartInstance?.destroy();
  }

  loadCategories() {
    this.inventoryService.getCategories().subscribe(cats => {
      this.categories.set(cats);
    });
  }

  getCategoryName(slug: string): string {
    return this.categories().find(c => c.slug === slug)?.name || slug || this.i18n.t('reports.otherCategory');
  }

  clearFilters() {
    this.startDate = '';
    this.endDate = '';
    this.loadReports();
  }

  loadReports() {
    this.isLoading.set(true);
    
    // Call all reporting endpoints
    this.inventoryService.getStockSummary(this.startDate, this.endDate).subscribe(summaryRes => {
      this.summary.set(summaryRes);
      
      this.inventoryService.getProductMovementsReport(this.startDate, this.endDate).subscribe(movementsRes => {
        this.productMovements.set(movementsRes);
        
        this.inventoryService.getCategoryDistributionReport().subscribe(catRes => {
          this.categoriesDistribution.set(catRes);
          
          this.inventoryService.getTopSellingReport(30).subscribe(topRes => {
            this.topSelling.set(topRes);
            
            this.inventoryService.getSupplierSummaryReport().subscribe(supRes => {
              this.supplierSummary.set(supRes);
              this.isLoading.set(false);
              
              // Trigger chart rendering in next tick after loading is set to false
              setTimeout(() => this.renderCharts(), 50);
            });
          });
        });
      });
    });
  }

  renderCharts() {
    if (this.catChartInstance) this.catChartInstance.destroy();
    if (this.topChartInstance) this.topChartInstance.destroy();
    this.catChartInstance = null;
    this.topChartInstance = null;
    const tk = applyChartDefaults();

    const catData = this.categoriesDistribution();
    const catLabels = catData.map(c => this.getCategoryName(c.category));
    const catValues = catData.map(c => c.totalValue);

    if (this.catCanvas) {
      const ctx = this.catCanvas.nativeElement.getContext('2d');
      if (ctx) {
        this.catChartInstance = new Chart(ctx, {
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
            cutout: '66%',
            plugins: {
              legend: { position: 'bottom', labels: { color: tk.text, padding: 14, font: { size: 12 } } },
              tooltip: { callbacks: { label: (c: any) => `${c.label}: ${this.i18n.formatMoney(c.parsed)}` } }
            }
          }
        });
      }
    }

    const topData = this.topSelling();
    const topLabels = topData.map(t => t.productName.length > 15 ? t.productName.substring(0, 13) + '..' : t.productName);
    const topValues = topData.map(t => t.totalQty);

    if (this.topCanvas) {
      const ctx = this.topCanvas.nativeElement.getContext('2d');
      if (ctx) {
        this.topChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: topLabels,
            datasets: [{
              label: this.i18n.t('reports.salesQty'),
              data: topValues,
              backgroundColor: tk.palette[0],
              hoverBackgroundColor: withAlpha(tk.palette[0], 0.85),
              borderRadius: 4,
              maxBarThickness: 32
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: tk.grid }, border: { display: false }, ticks: { color: tk.muted, maxTicksLimit: 6, callback: (v: any) => this.i18n.formatNumber(Number(v)) } },
              x: { grid: { display: false }, border: { color: tk.border }, ticks: { color: tk.muted, font: { size: 11 } } }
            }
          }
        });
      }
    }
  }

  exportToCsv() {
    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    
    // 1. Stock Summary Section
    const t = (key: string, params?: any) => this.i18n.t(key, params);
    const cur = this.i18n.currency();
    csvContent += t('reports.csv.summarySection') + '\r\n';
    csvContent += `${t('reports.totalIn')};${this.summary().totalIn}\r\n`;
    csvContent += `${t('reports.totalOut')};${this.summary().totalOut}\r\n`;
    csvContent += `${t('reports.csv.netChange')};${this.summary().netChange}\r\n\r\n`;

    // 2. Product movements report
    csvContent += t('reports.csv.movementsSection') + '\r\n';
    csvContent += [t('reports.col.productName'), t('reports.csv.inQty'), t('reports.csv.outQty'), t('reports.csv.netChange')].join(';') + '\r\n';
    for (const item of this.productMovements()) {
      csvContent += `${item.productName};${item.totalIn};${item.totalOut};${item.totalIn - item.totalOut}\r\n`;
    }
    csvContent += '\r\n';

    // 3. Category distribution
    csvContent += t('reports.csv.categorySection') + '\r\n';
    csvContent += [t('reports.csv.category'), t('reports.csv.productCount'), t('reports.csv.totalStock'), t('reports.csv.totalValue', { currency: cur })].join(';') + '\r\n';
    for (const item of this.categoriesDistribution()) {
      csvContent += `${this.getCategoryName(item.category)};${item.productCount};${item.totalStock};${item.totalValue}\r\n`;
    }
    csvContent += '\r\n';

    // 4. Supplier summary
    csvContent += t('reports.csv.supplierSection') + '\r\n';
    csvContent += [t('reports.csv.supplierName'), t('reports.csv.orderCount'), t('reports.csv.totalPaid', { currency: cur })].join(';') + '\r\n';
    for (const item of this.supplierSummary()) {
      csvContent += `${item.supplierName};${item.poCount};${item.totalAmount}\r\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = this.startDate || t('reports.csv.fileAll');
    const dateEndStr = this.endDate || t('reports.csv.filePeriod');
    link.setAttribute('download', `Smart_Inventory_${t('reports.csv.filePrefix')}_${dateStr}_${dateEndStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
