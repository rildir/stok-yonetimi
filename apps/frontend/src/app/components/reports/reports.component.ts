import { Component, computed, inject, signal, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ActivatedRoute } from '@angular/router';
import { ExpiringLot } from '../../models/inventory.models';
import { Chart } from 'chart.js/auto';
import { applyChartDefaults, withAlpha, PRECISION_BAR, precisionScale, ChartTokens } from '../../utils/chart-theme';
import { AppStateService } from '../../services/app-state.service';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe } from '../../i18n';
import { LegalReportsComponent } from './legal-reports.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  host: { '(document:click)': 'moreOpen.set(false)', '(document:keydown.escape)': 'moreOpen.set(false)' },
  imports: [CommonModule, FormsModule, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, LegalReportsComponent, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'reports.title' | t }}</h1>
        <p>{{ 'reports.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn rep-wide" (click)="exportToCsv()" [disabled]="isLoading()">
          <app-icon name="download" />{{ 'reports.downloadCsv' | t }}
        </button>
        <span class="rep-more">
          <button type="button" class="btn btn-icon" [class.is-active]="moreOpen()" aria-haspopup="menu" [attr.aria-expanded]="moreOpen()" [attr.aria-label]="'reports.moreActions' | t" (click)="moreOpen.set(!moreOpen()); $event.stopPropagation()"><app-icon name="more" /></button>
          @if (moreOpen()) {
            <div class="pop rep-more-pop" role="menu">
              <button type="button" class="menu-i" role="menuitem" [disabled]="isLoading()" (click)="moreOpen.set(false); exportToCsv()"><app-icon name="download" />{{ 'reports.downloadCsv' | t }}</button>
            </div>
          }
        </span>
      </div>
    </div>

    <nav class="tabs rep-tabs" role="tablist">
      <button type="button" class="tab" role="tab" [class.active]="view() === 'analytics'" [attr.aria-selected]="view() === 'analytics'" (click)="view.set('analytics')"><span>{{ 'reports.tab.analytics' | t }}</span></button>
      @if (canSeeLegal()) {
        <button type="button" class="tab" role="tab" [class.active]="view() === 'legal'" [attr.aria-selected]="view() === 'legal'" (click)="view.set('legal')"><span>{{ 'reports.tab.legal' | t }}</span></button>
      }
    </nav>
    @if (view() === 'legal' && canSeeLegal()) { <app-legal-reports></app-legal-reports> }
    <div class="rep" [hidden]="view() === 'legal'">
      <!-- Filters -->
      <div class="toolbar rep-toolbar">
        <div class="field field-sm date-f">
          <input type="date" [(ngModel)]="startDate" [title]="'reports.startDate' | t" [attr.aria-label]="'reports.startDate' | t" />
        </div>
        <span class="range-sep" aria-hidden="true">–</span>
        <div class="field field-sm date-f">
          <input type="date" [(ngModel)]="endDate" [title]="'reports.endDate' | t" [attr.aria-label]="'reports.endDate' | t" />
        </div>
        <button type="button" class="btn btn-sm" (click)="loadReports()">{{ 'reports.apply' | t }}</button>
        @if (startDate || endDate) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="clearFilters()"><app-icon name="x" size="sm" />{{ 'reports.clearFilters' | t }}</button>
        }
        <span class="spacer"></span>
        <span class="base-note"><app-icon name="info" size="sm" />{{ 'reports.baseCurrencyNote' | t: { currency: baseCurrency() } }}</span>
      </div>

      @if (isLoading()) {
        <div class="kpi-grid">
          @for (i of [1, 2, 3]; track i) {
            <div class="kpi sk-kpi"><div class="skeleton-text short"></div><div class="skeleton-title"></div><div class="skeleton-text"></div></div>
          }
        </div>
        <div class="grid-12">
          <div class="card col-span-6 sk-chart"><div class="card-h"><div class="skeleton-title"></div></div><div class="card-b sk-fill"><div class="skeleton"></div></div></div>
          <div class="card col-span-6 sk-chart"><div class="card-h"><div class="skeleton-title"></div></div><div class="card-b sk-fill"><div class="skeleton"></div></div></div>
        </div>
        <p class="calc" role="status"><span class="spinner-sm"></span>{{ 'reports.calculating' | t }}</p>
      } @else {
        <!-- Summary KPIs -->
        <div class="kpi-grid">
          <div class="kpi">
            <div class="kpi-top"><app-icon name="up" size="sm" class="tone-in" />{{ 'reports.totalIn' | t }}</div>
            <div class="kpi-val"><b>+{{ summary().totalIn | num }}</b></div>
            <div class="kpi-foot"><span>{{ 'reports.totalInDesc' | t }}</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-top"><app-icon name="down" size="sm" class="tone-out" />{{ 'reports.totalOut' | t }}</div>
            <div class="kpi-val"><b>-{{ summary().totalOut | num }}</b></div>
            <div class="kpi-foot"><span>{{ 'reports.totalOutDesc' | t }}</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-top"><app-icon name="swap" size="sm" />{{ 'reports.netChange' | t }}</div>
            <div class="kpi-val">
              <b>{{ summary().netChange > 0 ? '+' : '' }}{{ summary().netChange | num }}</b>
              @if (summary().netChange !== 0) {
                <span class="delta" [class.up]="summary().netChange > 0" [class.down]="summary().netChange < 0"><app-icon [name]="summary().netChange > 0 ? 'up' : 'down'" size="xs" /></span>
              }
            </div>
            <div class="kpi-foot"><span>{{ 'reports.netChangeDesc' | t }}</span></div>
          </div>
        </div>

        <!-- Charts -->
        <div class="grid-12">
          <section class="card col-span-6">
            <div class="card-h ch2">
              <div class="ht"><h3>{{ 'reports.categoryChartTitle' | t }}</h3><span class="sub">{{ 'reports.categoryChartDesc' | t }}</span></div>
            </div>
            <div class="chart-sum">
              <div><span>{{ 'reports.chartSum.totalValue' | t }}</span><b>{{ categoryTotal() | money: baseCurrency() }}</b></div>
              <div><span>{{ 'reports.chartSum.categories' | t }}</span><b>{{ categoriesDistribution().length | num }}</b></div>
            </div>
            <div class="chart-container"><canvas #catChart></canvas></div>
          </section>
          <section class="card col-span-6">
            <div class="card-h ch2">
              <div class="ht"><h3>{{ 'reports.topChartTitle' | t }}</h3><span class="sub">{{ 'reports.topChartDesc' | t }}</span></div>
              <span class="spacer"></span>
              <div class="legend"><span><i class="c1"></i>{{ 'reports.salesQty' | t }}</span></div>
            </div>
            <div class="chart-sum">
              <div><span>{{ 'reports.chartSum.totalQty' | t }}</span><b>{{ topTotal() | num }}</b></div>
              <div><span>{{ 'reports.chartSum.products' | t }}</span><b>{{ topSelling().length | num }}</b></div>
            </div>
            @if (topSelling().length) {
              <div class="chart-container"><canvas #topChart></canvas></div>
            } @else {
              <div class="chart-container chart-empty"><div class="empty-state"><div class="empty-art"><app-icon name="bars" /></div><p>{{ 'reports.topChartEmpty' | t }}</p></div></div>
            }
          </section>

          <!-- Product movements -->
          <section class="card col-span-6">
            <div class="card-h ch2">
              <div class="ht"><h3>{{ 'reports.movementsTitle' | t }}</h3><span class="sub">{{ 'reports.movementsDesc' | t }}</span></div>
              <span class="spacer"></span>
              @if (productMovements().length) { <span class="badge badge-neutral">{{ productMovements().length | num }}</span> }
            </div>
            <div class="table-scroll capped">
              <table class="tbl table-responsive">
                <thead>
                  <tr>
                    <th>{{ 'reports.col.productName' | t }}</th>
                    <th class="r">{{ 'reports.col.totalIn' | t }}</th>
                    <th class="r">{{ 'reports.col.totalOut' | t }}</th>
                    <th class="r">{{ 'reports.col.netChange' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of productMovements(); track p.productId) {
                    <tr>
                      <td class="td-primary">{{ p.productName }}</td>
                      <td class="r pos" [attr.data-label]="'reports.col.totalIn' | t">+{{ p.totalIn | num }}</td>
                      <td class="r neg" [attr.data-label]="'reports.col.totalOut' | t">-{{ p.totalOut | num }}</td>
                      <td class="r strong" [attr.data-label]="'reports.col.netChange' | t">
                        {{ p.totalIn - p.totalOut > 0 ? '+' : '' }}{{ p.totalIn - p.totalOut | num }}
                      </td>
                    </tr>
                  }
                  @if (productMovements().length === 0) {
                    <tr class="empty-row"><td colspan="4"><div class="empty-state"><div class="empty-art"><app-icon name="swap" /></div><p>{{ 'reports.noMovements' | t }}</p></div></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <!-- Supplier summary -->
          <section class="card col-span-6">
            <div class="card-h ch2">
              <div class="ht"><h3>{{ 'reports.supplierTitle' | t }}</h3><span class="sub">{{ 'reports.supplierDesc' | t }}</span></div>
            </div>
            <div class="table-scroll capped">
              <table class="tbl table-responsive">
                <thead>
                  <tr>
                    <th>{{ 'reports.col.supplier' | t }}</th>
                    <th class="r">{{ 'reports.col.poCount' | t }}</th>
                    <th class="r">{{ 'reports.col.totalPaid' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of supplierSummary(); track s.supplierName) {
                    <tr>
                      <td class="td-primary">{{ s.supplierName }}</td>
                      <td class="r" [attr.data-label]="'reports.col.poCount' | t">{{ s.poCount | num }}</td>
                      <td class="r strong" [attr.data-label]="'reports.col.totalPaid' | t">{{ s.totalAmount | money: baseCurrency() }}</td>
                    </tr>
                  }
                  @if (supplierSummary().length === 0) {
                    <tr class="empty-row"><td colspan="3"><div class="empty-state"><div class="empty-art"><app-icon name="truck" /></div><p>{{ 'reports.noPurchases' | t }}</p></div></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      }

      <!-- Expiring lots -->
      <section id="expiring-report" class="card">
        <div class="card-h ch2 exp-h">
          <div class="ht"><h3>{{ 'reports.expiring.title' | t }}</h3><span class="sub">{{ 'reports.expiring.desc' | t }}</span></div>
          <span class="spacer"></span>
          <div class="toolbar">
            <div class="field field-sm exp-days">
              <input id="expDays" class="num" type="number" min="1" step="1" [(ngModel)]="expiringDays" (keyup.enter)="loadExpiring()" [attr.aria-label]="'reports.expiring.days' | t" />
              <span class="affix suf">{{ 'reports.expiring.daysUnit' | t }}</span>
            </div>
            <button type="button" class="btn btn-sm" [class.is-loading]="expiringLoading()" (click)="loadExpiring()" [disabled]="expiringLoading()"><span>{{ 'reports.apply' | t }}</span></button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="exportExpiringCsv()" [disabled]="expiringLots().length === 0">
              <app-icon name="download" size="sm" />{{ 'reports.expiring.export' | t }}
            </button>
          </div>
        </div>
        <div class="table-scroll capped-lg">
          <table class="tbl table-responsive">
            <thead>
              <tr>
                <th>{{ 'reports.expiring.col.product' | t }}</th>
                <th>{{ 'reports.expiring.col.lot' | t }}</th>
                <th>{{ 'reports.expiring.col.warehouse' | t }}</th>
                <th class="r">{{ 'reports.expiring.col.expiry' | t }}</th>
                <th class="r">{{ 'reports.expiring.col.qty' | t }}</th>
                <th class="r">{{ 'reports.expiring.col.daysLeft' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @if (expiringLoading()) {
                @for (i of [1, 2, 3]; track i) {
                  <tr class="empty-row"><td colspan="6"><div class="skeleton-row"></div></td></tr>
                }
              } @else {
                @for (l of expiringLots(); track l.lotId) {
                  <tr [class.row-expired]="l.daysLeft < 0">
                    <td class="td-primary"><div class="cell-prod"><b>{{ l.productName }}</b><span class="cell-code">{{ l.sku }}</span></div></td>
                    <td class="mono" [attr.data-label]="'reports.expiring.col.lot' | t">{{ l.lotNumber }}</td>
                    <td [attr.data-label]="'reports.expiring.col.warehouse' | t">{{ l.warehouseName }}</td>
                    <td class="r" [attr.data-label]="'reports.expiring.col.expiry' | t">{{ l.expiryDate | appDate }}</td>
                    <td class="r" [attr.data-label]="'reports.expiring.col.qty' | t">{{ l.quantity | num }}</td>
                    <td class="r" [attr.data-label]="'reports.expiring.col.daysLeft' | t">
                      <span class="badge" [class.badge-danger]="l.daysLeft < 0" [class.badge-warning]="l.daysLeft >= 0 && l.daysLeft <= 7" [class.badge-neutral]="l.daysLeft > 7"><span class="dot"></span>{{ l.daysLeft < 0 ? ('reports.expiring.expired' | t) : l.daysLeft }}</span>
                    </td>
                  </tr>
                }
                @if (expiringLots().length === 0) {
                  <tr class="empty-row"><td colspan="6">
                    <div class="empty-state">
                      <div class="empty-art"><app-icon name="calendar" /></div>
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
    .rep-tabs { margin-bottom: 20px; }
    .rep { display: flex; flex-direction: column; gap: 12px; }
    .rep[hidden] { display: none; }
    .rep > .grid-12 { gap: 12px; }
    .rep-toolbar { margin-bottom: 8px; }
    .date-f { width: 168px; }
    .rep-more { position: relative; display: none; }
    .rep-more-pop { top: calc(100% + 4px); right: 0; min-width: 220px; }
    .kpi-foot { white-space: normal; }
    .kpi-foot > span:not(.delta) { overflow: visible; }
    .range-sep { color: var(--fg-3); }
    .base-note { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--fg-3); }
    .sk-kpi { min-height: 104px; }
    .sk-chart { height: 380px; }
    .sk-fill { flex: 1; display: flex; }
    .sk-fill .skeleton { flex: 1; }
    .calc { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--text-sm); color: var(--fg-3); }
    .tone-in { color: var(--success); }
    .tone-out { color: var(--danger); }
    .ch2 { min-height: 56px; padding-block: 8px; }
    .ht { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .legend { display: flex; gap: 12px; font-size: var(--text-xs); color: var(--fg-3); white-space: nowrap; }
    .legend span, .chart-sum span { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 8px; height: 8px; border-radius: 0; display: inline-block; }
    i.c1 { background: var(--chart-1); }
    .chart-sum { display: flex; gap: 28px; padding: 14px 16px 0; }
    .chart-sum > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .chart-sum span { font-size: var(--text-xs); color: var(--fg-3); }
    .chart-sum b { font-size: var(--text-lg); font-weight: 600; letter-spacing: var(--tracking-tighter); font-variant-numeric: tabular-nums; color: var(--fg); }
    .chart-container { position: relative; height: 280px; margin: 12px 16px 16px; }
    .chart-empty { display: grid; place-items: center; }
    .exp-h { flex-wrap: wrap; row-gap: 8px; }
    .exp-days { width: 104px; }
    .capped { max-height: 380px; overflow: auto; }
    .capped-lg { max-height: 460px; overflow: auto; }
    .pos { color: var(--success); }
    .neg { color: var(--danger); }
    td.strong { font-weight: 500; }
    .row-expired td { background: var(--danger-soft); }
    .empty-row td { padding: 0 !important; height: auto; }
    .empty-row td::before { display: none !important; }
    .empty-row:hover td { background: transparent; }
    .empty-row .skeleton-row { margin: 11px 12px; }
    @media (max-width: 640px) {
      .table-responsive td { justify-content: flex-end; gap: 6px; }
      .table-responsive td[data-label]::before { margin-right: auto; }
      .table-responsive .empty-row td { display: block; text-align: center; }
      .rep-wide { display: none; }
      .rep-more { display: inline-flex; }
      .page-header > .page-actions { margin-left: auto; }
      /* Dates share the first row; Apply/Clear wrap below so the placeholders are never clipped. */
      .date-f { width: auto; flex: 1 1 calc(50% - 16px); min-width: 132px; }
      .rep-toolbar > .btn { flex: 1 1 0; }
      .rep-toolbar .spacer { display: none; }
      .base-note { flex-basis: 100%; }
      .capped, .capped-lg { max-height: none; }
      .chart-container { height: 240px; }
      .chart-sum { gap: 20px; }
      .exp-h .toolbar { width: 100%; }
      /* An odd last KPI spans the row instead of leaving an empty cell. */
      .kpi-grid > .kpi:last-child:nth-child(odd) { grid-column: 1 / -1; }
    }
  `]
})
export class ReportsComponent implements OnInit, AfterViewInit, OnDestroy {
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  private appState = inject(AppStateService);
  /** Company base currency: profile locale, then the dashboard summary (the i18n default is TRY until the profile loads). */
  baseCurrency = computed(() => this.ui.userProfile()?.locale?.currency || this.appState.summary()?.currency || this.i18n.currency());

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
  /** Mobile header overflow menu. */
  moreOpen = signal(false);
  
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
  /** Summary numbers shown above the charts (presentation only). */
  categoryTotal = computed(() => this.categoriesDistribution().reduce((a, c) => a + (Number(c.totalValue) || 0), 0));
  topTotal = computed(() => this.topSelling().reduce((a, t) => a + (Number(t.totalQty) || 0), 0));

  // Expiring lots report
  route = inject(ActivatedRoute);
  /** analytics (charts) | legal (WP6 inventory / tax pre-reports) */
  view = signal<'analytics' | 'legal'>(this.route.snapshot.queryParamMap.get('tab') === 'legal' ? 'legal' : 'analytics');
  /** Legal reports carry cost values, tax pre-reports and customer trace data: admin / manager only (backend enforced). */
  canSeeLegal = computed(() => ['admin', 'manager'].includes(String(this.ui.userProfile()?.role || this.tokenRole())));
  private tokenRole(): string {
    try {
      const t = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
      return t ? String(JSON.parse(atob(t.split('.')[1])).role || '') : '';
    } catch {
      return '';
    }
  }
  expiringDays = 30;
  expiringLots = signal<ExpiringLot[]>([]);
  expiringLoading = signal(false);

  ngOnInit() {
    // The summary carries the base currency; load it when the dashboard has not yet.
    if (!this.appState.summary()) this.appState.loadSummary();
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

    const cat = this.donutSlices(
      this.categoriesDistribution().map(c => ({ label: this.getCategoryName(c.category), value: Number(c.totalValue) || 0 })),
      tk
    );

    if (this.catCanvas) {
      const ctx = this.catCanvas.nativeElement.getContext('2d');
      if (ctx) {
        this.catChartInstance = new Chart(ctx, {
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
              legend: { position: 'bottom', labels: { color: tk.text, padding: 14, font: { size: 12 } } },
              tooltip: { callbacks: { label: (c: any) => `${c.label}: ${this.i18n.formatMoney(c.parsed, this.baseCurrency())}` } }
            }
          }
        });
      }
    }

    const topData = this.topSelling();
    const narrow = (this.topCanvas?.nativeElement.parentElement?.clientWidth ?? 600) < 420;
    const maxLen = narrow ? 18 : 28;
    const topNames = topData.map(t => String(t.productName ?? ''));
    const topLabels = topNames.map(n => n.length > maxLen ? n.substring(0, maxLen - 1).trimEnd() + '…' : n);
    const topValues = topData.map(t => t.totalQty);
    const sansTicks = { ...precisionScale(tk).ticks, font: { family: tk.fontSans, size: 11 } };

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
              ...PRECISION_BAR,
              borderRadius: { topRight: 3, bottomRight: 3 },
              borderSkipped: 'left',
              maxBarThickness: 14
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items: any[]) => items.length ? topNames[items[0].dataIndex] : '',
                  label: (c: any) => `${c.dataset.label}: ${this.i18n.formatNumber(c.parsed.x)}`
                }
              }
            },
            scales: {
              x: { ...precisionScale(tk), beginAtZero: true, ticks: { ...sansTicks, maxTicksLimit: 5, callback: (v: any) => this.i18n.formatNumber(Number(v)) } },
              y: { ...precisionScale(tk), grid: { display: false }, ticks: { ...sansTicks, color: tk.text, autoSkip: false, font: { family: tk.fontSans, size: 12 } } }
            }
          }
        });
      }
    }
  }

  /**
   * Donut slices with one distinct palette colour each: the five largest
   * categories keep --chart-1…5 and the rest fold into a neutral "Other" slice,
   * so no two legend entries share a colour.
   */
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

  exportToCsv() {
    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    
    // 1. Stock Summary Section
    const t = (key: string, params?: any) => this.i18n.t(key, params);
    const cur = this.baseCurrency();
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
