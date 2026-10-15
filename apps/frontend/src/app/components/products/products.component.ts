import { Component, inject, signal, computed, HostListener, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, FormGroup, AbstractControl } from '@angular/forms';
import { checkCategoryRules, INVENTORY_CLASSES, isValidGtin, REGULATORY_CATEGORIES } from '@stok/tr-compliance';
import { QuantityInputDirective, productDecimals } from '../shared/quantity-input.directive';
import { ComplianceService } from '../../services/compliance.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Product } from '../../inventory.service';
import { TaxRate, Warehouse, Unit, StockLot, SerialNumber, BarcodeType } from '../../models/inventory.models';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import JsBarcode from 'jsbarcode';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { tap } from 'rxjs';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe, QuantityInputDirective],
  styleUrls: ['../../drawer.css'],
  styles: [`
.tracking-badge { display: inline-flex; align-items: center; font-size: var(--text-2xs); font-weight: var(--weight-semibold); padding: 1px 6px; border-radius: var(--radius-full); background: var(--color-primary-subtle); color: var(--color-primary-text); border: 1px solid var(--color-primary-border); white-space: nowrap; }
.btn-scan { flex-shrink: 0; justify-content: center; }
.pr-toolbar { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); }
.pr-toolbar .segmented button { display: inline-flex; align-items: center; gap: var(--space-1); }
.btn.is-active { background: var(--color-surface-muted); border-color: var(--color-border-strong); }
.pr-sort { position: relative; width: 224px; }
.pr-sort-trigger { width: 100%; justify-content: flex-start; }
.pr-menu { position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; right: 0; background: var(--color-surface-raised, var(--color-surface)); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: var(--space-1); }
.pr-menu-item { display: block; width: 100%; text-align: left; padding: var(--space-2) var(--space-3); border: 0; background: none; border-radius: var(--radius-sm); font-size: var(--text-sm); color: var(--color-text); cursor: pointer; }
.pr-menu-item:hover { background: var(--color-surface-muted); }
.pr-menu-item.active { color: var(--color-primary-text); font-weight: var(--weight-semibold); }
.pr-stats-toggle { display: inline-flex; align-items: center; gap: var(--space-2); margin-left: auto; font-size: var(--text-sm); color: var(--color-text-secondary); cursor: pointer; }
.pr-kpis { margin-bottom: var(--space-4); }
.pr-kpi { flex-direction: column; gap: var(--space-2); }
.pr-kpi-row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); width: 100%; }
.pr-layout { display: flex; gap: var(--space-4); align-items: flex-start; }
.pr-refiner { width: 232px; flex-shrink: 0; gap: var(--space-5); }
.pr-ref-group h4 { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 var(--space-2); }
.pr-ref-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: var(--text-sm); }
.pr-ref-list a { display: block; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); color: var(--color-text-secondary); text-decoration: none; }
.pr-ref-list a:hover { background: var(--color-surface-muted); color: var(--color-text); }
.pr-ref-list a.active { background: var(--color-primary-subtle); color: var(--color-primary-text); font-weight: var(--weight-medium); }
.pr-radio { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2); cursor: pointer; color: var(--color-text); }
.pr-radio input, .pr-check-label input, .pr-col-check input, .pr-card-top input { accent-color: var(--color-primary); width: 16px; height: 16px; cursor: pointer; }
.pr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.pr-resultbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; font-size: var(--text-sm); }
.pr-strong { color: var(--color-text); font-weight: var(--weight-semibold); }
.pr-chip-x { display: inline-grid; place-items: center; border: 0; background: none; color: inherit; cursor: pointer; padding: 0 0 0 var(--space-1); }
.pr-check-label { display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; color: var(--color-text-secondary); }
.pr-table td { vertical-align: middle; }
.pr-table .num { white-space: nowrap; }
.pr-col-check { width: 44px; text-align: center; }
.pr-table tr.is-selected td { background: var(--color-primary-subtle); }
.pr-table tr.is-highlighted td { box-shadow: inset 0 2px 0 var(--color-primary), inset 0 -2px 0 var(--color-primary); }
.pr-prod { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.pr-prod-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.pr-thumb { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-sm); background: var(--color-surface-subtle); border: 1px solid var(--color-border-subtle); color: var(--color-text-subtle); }
.pr-thumb-lg { width: 56px; height: 56px; border-radius: var(--radius-md); }
.pr-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pr-name { font-weight: var(--weight-semibold); color: var(--color-text); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.pr-name:hover { color: var(--color-primary-text); }
.pr-meta { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--color-text-muted); }
.pr-stock-cell { position: relative; }
.pr-stock { display: inline-flex; align-items: center; gap: var(--space-1); cursor: default; font-weight: var(--weight-semibold); }
.pr-rating { display: inline-flex; align-items: center; gap: 2px; color: var(--color-warning); }
.pr-rating-val { margin-left: var(--space-1); font-size: var(--text-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.warehouse-tooltip { position: absolute; z-index: 60; bottom: calc(100% - 4px); right: var(--space-3); min-width: 180px; text-align: left; background: var(--color-surface-raised, var(--color-surface)); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); box-shadow: var(--shadow-lg); }
.wh-tooltip-title { font-size: var(--text-2xs); font-weight: var(--weight-semibold); text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); padding-bottom: var(--space-1); margin-bottom: var(--space-1); border-bottom: 1px solid var(--color-border-subtle); }
.wh-tooltip-row { display: flex; justify-content: space-between; gap: var(--space-3); padding: 2px 0; font-size: var(--text-xs); color: var(--color-text); }
.wh-tooltip-row strong { font-variant-numeric: tabular-nums; }
.pr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-4); }
.pr-card { gap: var(--space-3); padding: var(--space-4); }
.pr-card.is-selected { border-color: var(--color-primary-border); background: var(--color-primary-subtle); }
.pr-card.is-highlighted { box-shadow: 0 0 0 2px var(--color-primary); }
.pr-card-top { display: flex; justify-content: space-between; align-items: center; }
.pr-serial-list { max-height: 180px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); background: var(--color-surface); }
.pr-serial-item { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0; cursor: pointer; font-size: var(--text-sm); }
.pr-serial-block { display: flex; flex-direction: column; gap: var(--space-2); }
.pr-serial-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text); }
.pr-tr-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: calc(-1 * var(--space-2)); }
.pr-serial-block .pr-tr-hint { margin-top: 0; }
.pr-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin: 0; padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); }
.pr-card-stats dt { font-size: var(--text-xs); color: var(--color-text-muted); }
.pr-card-stats dd { margin: 0; font-weight: var(--weight-semibold); color: var(--color-text); font-variant-numeric: tabular-nums; }
.pr-card-actions { display: flex; gap: var(--space-2); margin-top: auto; }
.pr-card-actions .btn { flex: 1; }
.pr-range, .pr-perpage { font-size: var(--text-sm); }
.pr-perpage .select { width: auto; height: 32px; padding-top: 0; padding-bottom: 0; }
.pr-pages { gap: var(--space-1); }
@media (max-width: 900px) {
  .pr-layout { flex-direction: column; align-items: stretch; }
  .pr-refiner { width: 100%; }
}
@media (max-width: 640px) {
  .pr-sort { flex: 1 1 auto; width: auto; }
  .pr-stats-toggle { margin-left: 0; }
  .pr-table td.pr-col-check { display: none; }
  .pr-table td.pr-actions-cell .td-actions { justify-content: flex-start; }
  .pr-name { max-width: none; white-space: normal; }
  .warehouse-tooltip { right: 0; }
}
  `],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'products.page.title' | t }}</h1>
        <p>{{ 'products.page.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-secondary" (click)="fileInput.click()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
          {{ 'products.import' | t }}
        </button>
        <input type="file" #fileInput accept=".csv" style="display: none" (change)="importFromCSV($event)" />
        <button type="button" class="btn btn-secondary" (click)="exportToCSV()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          {{ 'products.export' | t }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="printProducts()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          {{ 'products.printAction' | t }}
        </button>
        <button type="button" class="btn btn-primary" (click)="openAddProduct()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          {{ 'products.addNew' | t }}
        </button>
      </div>
    </div>

    <div class="toolbar pr-toolbar">
      <div class="segmented" role="group">
        <button type="button" [class.active]="isTableView()" (click)="isTableView.set(true); isViewDropdownOpen.set(false)">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          <span>{{ 'products.view.table' | t }}</span>
        </button>
        <button type="button" [class.active]="!isTableView()" (click)="isTableView.set(false); isViewDropdownOpen.set(false)">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          <span>{{ 'products.view.card' | t }}</span>
        </button>
      </div>

      <button type="button" class="btn btn-secondary" [class.is-active]="showFilters()" (click)="toggleFilters()">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
        {{ 'products.filter' | t }}
      </button>

      <div class="custom-select-wrapper pr-sort" (click)="$event.stopPropagation()">
        <button type="button" class="btn btn-secondary pr-sort-trigger" (click)="isSortDropdownOpen.update(v => !v); isViewDropdownOpen.set(false)" [class.open]="isSortDropdownOpen()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h9M3 18h6M17 8l4-4 4 4M21 4v16" transform="translate(-3 0)"/></svg>
          <span class="truncate">{{ ('products.sort.' + productSortOption()) | t }}</span>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: auto; color: var(--color-text-muted);"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        @if (isSortDropdownOpen()) {
          <div class="pr-menu">
            @for (opt of [
              {id: 'default', label: 'products.sort.default'},
              {id: 'stock-desc', label: 'products.sort.stock-desc'},
              {id: 'stock-asc', label: 'products.sort.stock-asc'},
              {id: 'price-asc', label: 'products.sort.price-asc'},
              {id: 'price-desc', label: 'products.sort.price-desc'},
              {id: 'name-asc', label: 'products.sort.name-asc'}
            ]; track opt.id) {
              <button type="button" class="pr-menu-item" [class.active]="productSortOption() === opt.id" (click)="productSortOption.set(opt.id); isSortDropdownOpen.set(false)">{{ opt.label | t }}</button>
            }
          </div>
        }
      </div>

      <label class="pr-stats-toggle">
        <span class="switch"><input type="checkbox" [checked]="showStats()" (change)="toggleStats()" /><span class="slider"></span></span>
        <span>{{ 'products.showStats' | t }}</span>
      </label>
    </div>

    @if (showStats()) {
      <div class="kpi-grid pr-kpis">
        <div class="stat-card pr-kpi">
          <span class="stat-label">{{ 'products.stats.totalProducts' | t }}</span>
          <div class="pr-kpi-row">
            <span class="stat-value">{{ state.products().length }}</span>
            @if (newProductCount() > 0) {
              <span class="badge badge-success">{{ 'products.stats.newCount' | t: { count: newProductCount() } }}</span>
            }
          </div>
          <span class="kpi-meta">{{ 'products.stats.last30Days' | t }}</span>
        </div>
        <div class="stat-card pr-kpi">
          <span class="stat-label">{{ 'products.stats.totalValue' | t }}</span>
          <div class="pr-kpi-row">
            <span class="stat-value">{{ totalValue().amount | money: totalValue().currency : 0 }}</span>
          </div>
          <span class="kpi-meta">
            @if (totalValue().unconverted.length) {
              {{ 'products.stats.unconverted' | t: { list: totalValue().unconverted.join(', ') } }}
            } @else {
              {{ 'products.stats.inBaseCurrency' | t: { currency: totalValue().currency } }}
            }
          </span>
        </div>
        <div class="stat-card pr-kpi">
          <span class="stat-label">{{ 'products.stats.criticalStock' | t }}</span>
          <div class="pr-kpi-row">
            <span class="stat-value low">{{ state.lowStockCount() }}</span>
          </div>
          <span class="kpi-meta">{{ 'products.stats.criticalMeta' | t }}</span>
        </div>
        <div class="stat-card pr-kpi">
          <span class="stat-label">{{ 'products.stats.outOfStock' | t }}</span>
          <div class="pr-kpi-row">
            <span class="stat-value out">{{ state.outOfStockCount() }}</span>
          </div>
          <span class="kpi-meta">{{ 'products.stats.outMeta' | t }}</span>
        </div>
      </div>
    }

    <div class="pr-layout">
      @if (showFilters()) {
        <aside class="card pr-refiner">
          <div class="pr-ref-group">
            <h4>{{ 'products.filters.search' | t }}</h4>
            <div class="search-box">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" [placeholder]="'products.filters.searchPlaceholder' | t" [value]="productSearch()" (input)="onSearchInput($event)" />
            </div>
          </div>
          <div class="pr-ref-group">
            <h4>{{ 'products.filters.categories' | t }}</h4>
            <ul class="pr-ref-list">
              <li><a href="#" [class.active]="!productSearch()" (click)="productSearch.set(''); $event.preventDefault()">{{ 'products.filters.allCategories' | t }}</a></li>
              @for (cat of categories(); track cat.id) {
                <li><a href="#" [class.active]="productSearch() === cat.name" (click)="productSearch.set(cat.name); $event.preventDefault()">{{ cat.name }}</a></li>
              }
            </ul>
          </div>
          <div class="pr-ref-group">
            <h4>{{ 'products.filters.stockStatus' | t }}</h4>
            <ul class="pr-ref-list">
              @for (st of [{id:'all', label:'products.status.all'}, {id:'In stock', label:'products.status.inStock'}, {id:'Low stock', label:'products.status.lowStock'}, {id:'Out of stock', label:'products.status.outOfStock'}]; track st.id) {
                <li>
                  <label class="pr-radio">
                    <input type="radio" name="stockFilter" [checked]="productFilterStatus() === st.id" (change)="productFilterStatus.set($any(st.id))" />
                    <span>{{ st.label | t }}</span>
                  </label>
                </li>
              }
            </ul>
          </div>
          <button type="button" class="btn btn-secondary btn-scan" (click)="openScanner()" [title]="'products.scanBarcode' | t">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8"/></svg>
            {{ 'products.scanBarcode' | t }}
          </button>
        </aside>
      }

      <div class="pr-main">
        <div class="pr-resultbar">
          <div class="cluster">
            <span class="text-muted">
              {{ 'products.results.prefix' | t }} <strong class="pr-strong">{{ 'products.results.count' | t: { count: filteredProducts().length } }}</strong> {{ 'products.results.suffix' | t }}
            </span>
            @if (selectedWarehouseFilter()) {
              <span class="badge badge-warning">
                {{ 'products.warehouseFilter' | t: { name: selectedWarehouseFilter() } }}
                <button type="button" class="pr-chip-x" (click)="clearWarehouseFilter()" [title]="'common.clear' | t">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </span>
            }
          </div>
          <label class="pr-check-label">
            <input type="checkbox" [checked]="isAllSelected()" (change)="toggleSelectAll()" />
            <span>{{ 'products.selectAll' | t }}</span>
          </label>
        </div>

        @if (isTableView()) {
          <div class="table-card">
            <div class="table-scroll">
              <table class="table-responsive pr-table">
                <thead>
                  <tr>
                    <th class="pr-col-check"><span class="sr-only">{{ 'products.col.select' | t }}</span></th>
                    <th>{{ 'products.col.product' | t }}</th>
                    <th class="num">{{ 'products.col.price' | t }}</th>
                    <th class="num">{{ 'products.col.sales' | t }}</th>
                    <th class="num">{{ 'products.col.revenue' | t }}</th>
                    <th class="num">{{ 'products.col.stock' | t }}</th>
                    <th>{{ 'products.col.status' | t }}</th>
                    <th>{{ 'products.col.rating' | t }}</th>
                    <th class="num">{{ 'common.actions' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of paginatedProducts(); track p.id) {
                    <tr [class.is-selected]="isProductSelected(p.id)" [class.is-highlighted]="highlightedProductId() === p.id">
                      <td class="pr-col-check">
                        <input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" />
                      </td>
                      <td class="td-primary">
                        <div class="pr-prod">
                          <div class="pr-thumb">
                            @if (p.imageUrl) {
                              <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" />
                            } @else {
                              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                            }
                          </div>
                          <div class="pr-prod-text">
                            <a href="#" class="pr-name" (click)="$event.preventDefault(); openEditProduct(p)">{{ p.name }}</a>
                            <span class="pr-meta"><span class="mono">{{ p.sku }}</span> · {{ getCategoryName(p.category) }}</span>
                            @if (p.barcode || isTracked(p)) {
                              <span class="pr-meta">
                                @if (p.barcode) { <span class="mono">{{ p.barcode }}</span> }
                                @if (isTracked(p)) { <span class="tracking-badge">{{ trackingBadgeLabel(p) }}</span> }
                              </span>
                            }
                          </div>
                        </div>
                      </td>
                      <td class="num pr-strong" [attr.data-label]="'products.col.price' | t">{{ p.price | money: p.currency }}</td>
                      <td class="num text-muted" [attr.data-label]="'products.col.sales' | t">{{ getMockSales(p) }}</td>
                      <td class="num" [attr.data-label]="'products.col.revenue' | t">{{ getMockRevenue(p) | money: null : 0 }}</td>
                      <td class="num pr-stock-cell" [attr.data-label]="'products.col.stock' | t">
                        <span class="pr-stock" (mouseenter)="hoveredProductId.set(p.id)" (mouseleave)="hoveredProductId.set(null)">
                          @if (p.status === 'Low stock') {
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-warning);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                          } @else if (p.status === 'Out of stock') {
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-danger);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                          }
                          {{ p.quantity | num }} <span class="text-muted">{{ productUnitLabel(p) }}</span>
                        </span>
                        @if (p.availableQuantity !== undefined && p.availableQuantity !== null && p.availableQuantity !== p.quantity) {
                          <div class="text-2xs text-muted" [title]="'products.availableHint' | t">{{ 'products.available' | t: { qty: (p.availableQuantity | num) } }}</div>
                        }
                        @if (p.warehouses && hoveredProductId() === p.id) {
                          <div class="warehouse-tooltip">
                            <div class="wh-tooltip-title">{{ 'products.warehouseDistribution' | t }}</div>
                            @for (wh of getWarehouseEntries(p.warehouses); track wh.name) {
                              <div class="wh-tooltip-row"><span>{{ wh.name }}</span><strong>{{ wh.qty }}</strong></div>
                            }
                          </div>
                        }
                      </td>
                      <td [attr.data-label]="'products.col.status' | t">
                        <span class="badge badge-dot" [class.badge-instock]="p.status === 'In stock'" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">{{ statusLabel(p.status) }}</span>
                      </td>
                      <td [attr.data-label]="'products.col.rating' | t">
                        <span class="pr-rating">
                          @for (star of getMockStarsArray(p); track $index) {
                            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                          }
                          @if (getMockStarsRemainder(p)) {
                            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                          }
                          <span class="pr-rating-val">{{ getMockRatingValue(p) }}</span>
                        </span>
                      </td>
                      <td class="pr-actions-cell">
                        <div class="td-actions">
                          <button type="button" class="icon-btn" (click)="openLabelModal([p])" [title]="'products.label.print' | t">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/></svg>
                          </button>
                          <button type="button" class="edit-btn" (click)="openEditProduct(p)" [title]="'common.edit' | t">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                          </button>
                          <button type="button" class="icon-btn" (click)="openTransferModal(p)" [title]="'products.warehouseTransfer' | t">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                          </button>
                          <button type="button" class="delete-btn" (click)="promptDeleteProduct(p)" [title]="'common.delete' | t">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (filteredProducts().length === 0) {
              <div class="empty-state">
                <div class="empty-state-icon"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
                <div class="empty-state-title">{{ 'products.results.count' | t: { count: 0 } }}</div>
              </div>
            }
          </div>
        } @else {
          <div class="pr-grid">
            @for (p of paginatedProducts(); track p.id) {
              <div class="card pr-card" [class.is-selected]="isProductSelected(p.id)" [class.is-highlighted]="highlightedProductId() === p.id">
                <div class="pr-card-top">
                  <input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" />
                  <span class="badge badge-dot" [class.badge-instock]="p.status === 'In stock'" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">{{ statusLabel(p.status) }}</span>
                </div>
                <div class="pr-prod">
                  <div class="pr-thumb pr-thumb-lg">
                    @if (p.imageUrl) {
                      <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" />
                    } @else {
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    }
                  </div>
                  <div class="pr-prod-text">
                    <a href="#" class="pr-name" (click)="$event.preventDefault(); openEditProduct(p)">{{ p.name }}</a>
                    <span class="pr-meta">{{ getCategoryName(p.category) }}</span>
                    <span class="pr-meta mono">{{ p.sku }}</span>
                    @if (p.barcode) { <span class="pr-meta mono">{{ p.barcode }}</span> }
                    @if (isTracked(p)) { <span class="tracking-badge" style="align-self: flex-start;">{{ trackingBadgeLabel(p) }}</span> }
                  </div>
                </div>
                <dl class="pr-card-stats">
                  <div><dt>{{ 'products.card.unitPrice' | t }}</dt><dd>{{ p.price | money: p.currency }}</dd></div>
                  <div><dt>{{ 'products.card.currentStock' | t }}</dt><dd>{{ p.quantity | num }} {{ productUnitLabel(p) }}</dd></div>
                  <div><dt>{{ 'products.card.salesQty' | t }}</dt><dd>{{ getMockSales(p) }}</dd></div>
                  <div><dt>{{ 'products.card.totalRevenue' | t }}</dt><dd>{{ getMockRevenue(p) | money: null : 0 }}</dd></div>
                </dl>
                <span class="pr-rating">
                  @for (star of getMockStarsArray(p); track $index) {
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  }
                  @if (getMockStarsRemainder(p)) {
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  }
                  <span class="pr-rating-val">{{ getMockRatingValue(p) }} / 5.0</span>
                </span>
                <div class="pr-card-actions">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openEditProduct(p)">{{ 'common.edit' | t }}</button>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openTransferModal(p)">{{ 'products.transfer' | t }}</button>
                  <button type="button" class="icon-btn" (click)="openLabelModal([p])" [title]="'products.label.print' | t">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/></svg>
                  </button>
                  <button type="button" class="delete-btn" (click)="promptDeleteProduct(p)" [title]="'common.delete' | t">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </div>
            }
          </div>
        }

        @if (filteredProducts().length > 0) {
          <div class="pagination-bar">
            <div class="text-muted pr-range">
              <strong class="pr-strong">{{ (currentPage() - 1) * itemsPerPage() + 1 }}–{{ Math.min(currentPage() * itemsPerPage(), filteredProducts().length) }}</strong> / {{ 'products.pagination.showing' | t: { count: filteredProducts().length } }}
            </div>
            <div class="cluster">
              <label class="cluster text-muted pr-perpage">
                <span>{{ 'products.pagination.perPage' | t }}</span>
                <select class="select" [ngModel]="itemsPerPage()" (ngModelChange)="itemsPerPage.set(+$event); currentPage.set(1)">
                  <option [value]="10">10</option>
                  <option [value]="25">25</option>
                  <option [value]="50">50</option>
                </select>
              </label>
              <div class="cluster pr-pages">
                <button type="button" class="page-btn" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                @for (pNum of getPagesArray(); track pNum) {
                  <button type="button" class="page-btn" [class.active]="currentPage() === pNum" (click)="goToPage(pNum)">{{ pNum }}</button>
                }
                <button type="button" class="page-btn" [disabled]="currentPage() === totalPages()" (click)="goToPage(currentPage() + 1)">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- ─── Product Drawer ─── -->
    @if (showProductFormModal()) {
      <div class="drawer-overlay" (click)="closeProductForm()">
        <div class="drawer-panel" (click)="$event.stopPropagation(); closeDropdowns()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editingProductId() ? 'products.form.editTitle' : 'products.addNew') | t }}</span>
            @if (editingProductId() && ui.userProfile()?.role === 'admin') {
              <button type="button" class="btn btn-outline btn-sm" style="margin-left: auto; margin-right: 8px;" (click)="router.navigate(['/audit-log'], { queryParams: { entityType: 'products', entityId: editingProductId() } })">{{ 'auditLog.history' | t }}</button>
            }
            <button class="drawer-close" (click)="closeProductForm()">×</button>
          </div>
          
          <form [formGroup]="productForm" (ngSubmit)="saveProduct()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="productName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaveLoading()" />
                <label for="productName" class="form-label">{{ 'products.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">⚠ {{ 'products.form.nameMin' | t }}</div> }
              </div>
              
              <div class="form-field">
                <input id="productSku" type="text" formControlName="sku" class="form-input" [class.has-value]="hasValue('sku')" [disabled]="isSaveLoading()" />
                <label for="productSku" class="form-label">SKU</label>
                @if (isFieldInvalid('sku')) { <div class="form-error">⚠ {{ 'products.form.required' | t }}</div> }
              </div>

              <!-- Barcode -->
              <div style="display: flex; gap: 8px; align-items: flex-start;">
                <div class="form-field" style="flex: 1;">
                  <input id="productBarcode" type="text" formControlName="barcode" class="form-input" [class.has-value]="hasValue('barcode')" autocomplete="off" />
                  <label for="productBarcode" class="form-label">{{ 'products.barcode.label' | t }}</label>
                </div>
                <div class="form-field" style="width: 130px;">
                  <select id="productBarcodeType" formControlName="barcodeType" class="form-input form-select has-value">
                    <option value="">{{ 'products.barcode.auto' | t }}</option>
                    @for (bt of barcodeTypes; track bt) { <option [value]="bt">{{ bt }}</option> }
                  </select>
                  <label for="productBarcodeType" class="form-label">{{ 'products.barcode.type' | t }}</label>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -8px; gap: 8px;">
                @if (barcodeHint(); as hint) {
                  <span style="font-size: 12px;" [style.color]="hint.ok ? 'var(--color-success)' : 'var(--color-danger)'">{{ hint.ok ? '✓' : '⚠' }} {{ hint.key | t }}</span>
                } @else { <span></span> }
                <button type="button" class="btn btn-outline" style="padding: 2px 10px; font-size: 12px;" (click)="generateEan13()">{{ 'products.barcode.generate' | t }}</button>
              </div>
              @if (barcodePreview(); as svg) {
                <div class="barcode-container" style="background: var(--color-surface); border: 1.5px solid var(--color-border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center;">
                  <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-bottom: 4px;">{{ 'products.form.visualBarcode' | t }}</div>
                  <div [innerHTML]="svg" style="max-width: 100%; overflow: hidden;"></div>
                </div>
              }

              <div class="form-field">
                <div class="custom-select-wrapper" (click)="toggleCategoryDropdown($event)">
                  <div class="custom-select-trigger" [class.open]="isCategoryDropdownOpen()" [class.disabled]="isSaveLoading()">
                    <span class="selected-text">
                      {{ getCategoryName(productForm.get('category')?.value) }}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                  @if (isCategoryDropdownOpen()) {
                    <div class="custom-select-dropdown" style="z-index: 2000;">
                      @for (cat of categories(); track cat.slug) {
                        <div class="custom-option" (click)="selectCategory(cat.slug); $event.stopPropagation()" style="padding: 0.75rem 1rem;">
                          <span class="opt-name">{{ cat.name }}</span>
                        </div>
                      }
                    </div>
                  }
                </div>
                <label class="form-label">{{ 'products.form.category' | t }}</label>
              </div>

              <div class="form-field">
                <div class="custom-select-wrapper" (click)="toggleSupplierDropdown($event)">
                  <div class="custom-select-trigger" [class.open]="isSupplierDropdownOpen()" [class.disabled]="isSaveLoading()">
                    <span class="selected-text">
                      {{ getSupplierName(productForm.get('supplierId')?.value) }}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                  @if (isSupplierDropdownOpen()) {
                    <div class="custom-select-dropdown" style="z-index: 2000;">
                      <div class="custom-option" (click)="selectSupplier(null); $event.stopPropagation()" style="padding: 0.75rem 1rem;">
                        <span class="opt-name text-muted">{{ 'products.form.noSupplier' | t }}</span>
                      </div>
                      @for (sup of suppliers(); track sup.id) {
                        <div class="custom-option" (click)="selectSupplier(sup.id); $event.stopPropagation()" style="padding: 0.75rem 1rem;">
                          <span class="opt-name">{{ sup.name }}</span>
                        </div>
                      }
                    </div>
                  }
                </div>
                <label class="form-label">{{ 'products.form.supplier' | t }}</label>
              </div>

              <div class="form-field">
                <input id="productPrice" type="number" formControlName="price" class="form-input form-input--prefix" [class.has-value]="hasValue('price')" min="0" step="0.01" [disabled]="isSaveLoading()" />
                <label for="productPrice" class="form-label">{{ 'products.form.unitPrice' | t }}</label>
                <span class="form-prefix">{{ productForm.get('currency')?.value }}</span>
                @if (isFieldInvalid('price')) { <div class="form-error">⚠ {{ 'products.form.invalidValue' | t }}</div> }
              </div>
              
              <div class="form-field">
                <select id="productCurrency" formControlName="currency" class="form-input form-select" [class.has-value]="hasValue('currency')">
                  @for (c of currencyOptions(); track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
                <label for="productCurrency" class="form-label">{{ 'finance.currency' | t }}</label>
              </div>

              <div class="form-field">
                <select id="productTaxRate" formControlName="taxRateId" class="form-input form-select has-value">
                  <option [ngValue]="null">{{ defaultTaxLabel() }}</option>
                  @for (tr of taxRates(); track tr.id) {
                    <option [ngValue]="tr.id">{{ tr.name }} (%{{ tr.rate | num }})</option>
                  }
                </select>
                <label for="productTaxRate" class="form-label">{{ 'finance.taxRate' | t }}</label>
              </div>

              <div class="form-field">
                <input id="productQuantity" type="text" appQty [qtyDecimals]="formDecimals()" formControlName="quantity" class="form-input" [class.has-value]="hasValue('quantity')" />
                <label for="productQuantity" class="form-label">{{ (editingProductId() ? 'products.form.currentStock' : 'products.form.openingStock') | t }}</label>
                @if (productForm.get('quantity')?.errors?.['qtyPrecision']) { <div class="form-error">⚠ {{ 'products.form.precision' | t: { decimals: formDecimals() } }}</div> }
                @else if (isFieldInvalid('quantity')) { <div class="form-error">⚠ {{ 'products.form.invalidValue' | t }}</div> }
                @if (editingProductId()) { <div class="field-hint">ⓘ {{ 'products.form.qtyEditHint' | t }}</div> }
                @else if (formTracked()) { <div class="field-hint">ⓘ {{ 'products.tracking.qtyLockedHint' | t }}</div> }
              </div>

              @if (!editingProductId()) {
                <div class="form-field">
                  <select id="productWarehouse" formControlName="warehouseId" class="form-input form-select has-value">
                    @for (wh of allWarehouses(); track wh.id) {
                      <option [ngValue]="wh.id">{{ wh.name }}{{ wh.isDefault ? ' (' + ('products.form.defaultWarehouse' | t) + ')' : '' }}</option>
                    }
                  </select>
                  <label for="productWarehouse" class="form-label">{{ 'products.form.initialWarehouse' | t }}</label>
                </div>
              }

              <div class="form-field">
                <select id="productBaseUnit" formControlName="baseUnitId" class="form-input form-select has-value">
                  <option [ngValue]="null">{{ unitLabel(productForm.get('unit')?.value) }}</option>
                  @for (u of unitsList(); track u.id) {
                    <option [ngValue]="u.id">{{ u | unitLabel }}</option>
                  }
                </select>
                <label for="productBaseUnit" class="form-label">{{ 'products.form.unit' | t }}</label>
              </div>

              <!-- Tracking -->
              <div style="display: flex; gap: 8px; align-items: center;">
                <div class="form-field" style="flex: 1;">
                  <select id="productTracking" formControlName="trackingType" class="form-input form-select has-value">
                    <option value="none">{{ 'products.tracking.none' | t }}</option>
                    <option value="lot">{{ 'products.tracking.lot' | t }}</option>
                    <option value="serial">{{ 'products.tracking.serial' | t }}</option>
                  </select>
                  <label for="productTracking" class="form-label">{{ 'products.tracking.label' | t }}</label>
                </div>
                @if (productForm.get('trackingType')?.value === 'lot') {
                  <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; white-space: nowrap;">
                    <input type="checkbox" formControlName="hasExpiry" style="accent-color: var(--color-primary);" />
                    {{ 'products.tracking.hasExpiry' | t }}
                  </label>
                }
              </div>

              <!-- Alternate units -->
              <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="font-size: 13px;">{{ 'products.altUnits.title' | t }}</strong>
                  <button type="button" class="btn btn-outline" style="padding: 2px 10px; font-size: 12px;" (click)="addAltUnit()">+ {{ 'products.altUnits.add' | t }}</button>
                </div>
                @if (altUnits().length === 0) {
                  <span style="font-size: 12px; color: var(--color-text-subtle);">{{ 'products.altUnits.empty' | t }}</span>
                }
                @for (au of altUnits(); track $index; let i = $index) {
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <select class="form-input form-select" style="flex: 1.2; height: 34px; padding: 4px 8px;" (change)="updateAltUnit(i, 'unitId', $any($event.target).value)">
                      <option value="" [selected]="!au.unitId">{{ 'products.altUnits.selectUnit' | t }}</option>
                      @for (u of unitsList(); track u.id) {
                        <option [value]="u.id" [selected]="u.id === au.unitId">{{ u | unitLabel }}</option>
                      }
                    </select>
                    <input type="number" min="0.0001" step="any" class="form-input" style="width: 80px; height: 34px; padding: 4px 8px;" [value]="au.factor" (input)="updateAltUnit(i, 'factor', $any($event.target).value)" [title]="'products.altUnits.factorHint' | t" [placeholder]="'products.altUnits.factor' | t" />
                    <input type="text" class="form-input" style="flex: 1.4; height: 34px; padding: 4px 8px;" [value]="au.barcode || ''" (input)="updateAltUnit(i, 'barcode', $any($event.target).value)" [placeholder]="'products.altUnits.barcode' | t" />
                    <button type="button" (click)="removeAltUnit(i)" style="border: 1px solid var(--color-danger-border); background: var(--color-surface); color: var(--color-danger); width: 28px; height: 28px; border-radius: 6px; cursor: pointer;" [title]="'common.delete' | t">✕</button>
                  </div>
                  @if (au.unitId && au.factor > 0) {
                    <span style="font-size: 11px; color: var(--color-text-muted); margin-top: -4px;">1 {{ unitNameById(au.unitId) }} = {{ au.factor | num }} {{ baseUnitName() }}</span>
                  }
                }
              </div>
              
              <div class="form-field">
                <input id="productMinQuantity" type="text" appQty [qtyDecimals]="formDecimals()" formControlName="minQuantity" class="form-input" [class.has-value]="hasValue('minQuantity')" />
                <label for="productMinQuantity" class="form-label">{{ 'products.form.minQuantity' | t }}</label>
                @if (productForm.get('minQuantity')?.errors?.['qtyPrecision']) { <div class="form-error">⚠ {{ 'products.form.precision' | t: { decimals: formDecimals() } }}</div> }
                @else if (isFieldInvalid('minQuantity')) { <div class="form-error">⚠ {{ 'products.form.invalidValue' | t }}</div> }
              </div>

              <!-- Regulatory category / inventory class / GTIN (WP2) -->
              <div class="form-section-title">{{ 'products.regulatory.section' | t }}</div>
              <div class="form-row">
                <div class="form-field">
                  <select id="productRegCat" formControlName="regulatoryCategory" class="form-input form-select has-value">
                    @for (c of regulatoryCategories; track c) {
                      <option [value]="c" [disabled]="c !== 'none' && !enabledModules().includes(c)">{{ 'products.regulatory.' + c | t }}{{ c !== 'none' && !enabledModules().includes(c) ? ' (' + ('products.regulatory.moduleOff' | t) + ')' : '' }}</option>
                    }
                  </select>
                  <label for="productRegCat" class="form-label">{{ 'products.regulatory.category' | t }}</label>
                </div>
                <div class="form-field">
                  <select id="productInvClass" formControlName="inventoryClass" class="form-input form-select has-value">
                    @for (c of inventoryClasses; track c) { <option [value]="c">{{ 'products.inventoryClass.' + c | t }}</option> }
                  </select>
                  <label for="productInvClass" class="form-label">{{ 'products.inventoryClass.label' | t }}</label>
                </div>
              </div>
              <div class="form-field">
                <input id="productGtin" type="text" inputmode="numeric" maxlength="14" formControlName="gtin14" class="form-input mono" [class.has-value]="hasValue('gtin14')" />
                <label for="productGtin" class="form-label">{{ 'products.regulatory.gtin' | t }}</label>
                @if (isFieldInvalid('gtin14')) { <div class="form-error">⚠ {{ 'products.regulatory.gtinInvalid' | t }}</div> }
                @if (categoryHints().length) {
                  @for (h of categoryHints(); track h.code) {
                    <div class="field-hint" [class.text-danger]="h.severity === 'error'" [class.text-warning]="h.severity === 'warning'">ⓘ {{ 'products.regulatory.issue.' + h.code | t: h.params }}</div>
                  }
                }
              </div>

              <div class="form-field">
                <input id="productImageUrl" type="text" formControlName="imageUrl" class="form-input" [class.has-value]="hasValue('imageUrl')" [disabled]="isSaveLoading()" />
                <label for="productImageUrl" class="form-label">{{ 'products.form.imageUrl' | t }}</label>
              </div>

              @if (editingProductId() && editingTrackingType() !== 'none') {
                <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 12px;">
                  <strong style="font-size: 13px; display: block; margin-bottom: 8px;">
                    {{ (editingTrackingType() === 'lot' ? 'products.lots.title' : 'products.serials.title') | t }}
                  </strong>
                  @if (isLoadingTracking()) {
                    <span style="font-size: 12px; color: var(--color-text-subtle);">{{ 'common.loading' | t }}</span>
                  } @else if (editingTrackingType() === 'lot') {
                    @if (productLots().length === 0) {
                      <span style="font-size: 12px; color: var(--color-text-subtle);">{{ 'products.lots.empty' | t }}</span>
                    } @else {
                      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                        <thead>
                          <tr style="color: var(--color-text-muted); text-align: left;">
                            <th style="padding: 4px;">{{ 'products.lots.lot' | t }}</th>
                            <th style="padding: 4px;">{{ 'products.lots.warehouse' | t }}</th>
                            <th style="padding: 4px;">{{ 'products.lots.expiry' | t }}</th>
                            <th style="padding: 4px; text-align: right;">{{ 'products.lots.qty' | t }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (lot of productLots(); track lot.id) {
                            <tr style="border-top: 1px solid var(--color-border-subtle);" [style.background]="lotStatus(lot) === 'expired' ? 'var(--color-danger-subtle)' : lotStatus(lot) === 'soon' ? 'var(--color-warning-subtle)' : 'transparent'">
                              <td style="padding: 4px; font-family: var(--font-mono);">{{ lot.lotNumber }}</td>
                              <td style="padding: 4px;">{{ lot.warehouseName || warehouseNameById(lot.warehouseId) }}</td>
                              <td style="padding: 4px;">
                                @if (lot.expiryDate) {
                                  {{ lot.expiryDate | appDate }}
                                  @if (lotStatus(lot) === 'expired') { <span style="color: var(--color-danger); font-weight: 600;"> · {{ 'products.lots.expired' | t }}</span> }
                                  @else if (lotStatus(lot) === 'soon') { <span style="color: var(--color-warning); font-weight: 600;"> · {{ 'products.lots.expiringSoon' | t }}</span> }
                                } @else { - }
                              </td>
                              <td style="padding: 4px; text-align: right; font-weight: 600;">{{ lot.quantity | num }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    }
                  } @else {
                    @if (productSerials().length === 0) {
                      <span style="font-size: 12px; color: var(--color-text-subtle);">{{ 'products.serials.empty' | t }}</span>
                    } @else {
                      <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 6px;">{{ 'products.serials.count' | t: { count: productSerials().length } }}</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 160px; overflow-y: auto;">
                        @for (sn of productSerials(); track sn.id) {
                          <span style="font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-muted); border-radius: 4px; padding: 2px 6px;" [title]="sn.warehouseName || warehouseNameById(sn.warehouseId)">{{ sn.serial }}</span>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeProductForm()" [disabled]="isSaveLoading()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="productForm.invalid || productForm.pristine || isSaveLoading()">
                @if (isSaveLoading()) { <span class="spinner-sm spinner-light"></span> {{ 'products.form.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }



    <!-- ─── Bulk Actions Bar ─── -->
    @if (selectedProductIds().length > 0) {
      <div class="bulk-actions-bar">
        <div class="bulk-info">
          <strong>{{ selectedProductIds().length }}</strong> {{ 'products.bulk.selected' | t }}
        </div>
        <div class="bulk-buttons">
          <div class="bulk-category-select-wrapper">
            <button class="btn-outline-light" (click)="toggleBulkCategoryDropdown($event)">
              {{ 'products.bulk.changeCategory' | t }}
            </button>
            @if (isBulkCategoryDropdownOpen()) {
              <div class="bulk-category-dropdown">
                @for (cat of categories(); track cat.slug) {
                  <button type="button" class="bulk-category-option" (click)="applyBulkCategory(cat.slug)">
                    {{ cat.name }}
                  </button>
                }
              </div>
            }
          </div>
          <button class="btn-outline-light" (click)="openLabelModal(selectedProducts())">
            {{ 'products.label.printSelected' | t }}
          </button>
          <button class="btn-danger-dark" (click)="promptBulkDelete()">
            {{ 'products.bulk.deleteSelected' | t }}
          </button>
          <button class="btn-ghost-light" (click)="clearSelection()">
            {{ 'common.cancel' | t }}
          </button>
        </div>
      </div>
    }



    <!-- ─── Barcode Label Print Drawer ─── -->
    @if (labelProducts().length > 0) {
      <div class="drawer-overlay" (click)="closeLabelModal()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'products.label.title' | t }}</span>
            <button class="drawer-close" (click)="closeLabelModal()">×</button>
          </div>
          <div class="drawer-body">
            <p style="font-size: 13px; color: var(--color-text-muted); margin: 0;">{{ 'products.label.productCount' | t: { count: labelProducts().length } }}</p>
            <div class="form-field">
              <input id="labelCopies" type="number" min="1" max="500" class="form-input has-value" [ngModel]="labelCopies()" (ngModelChange)="labelCopies.set(+$event)" />
              <label for="labelCopies" class="form-label">{{ 'products.label.copies' | t }}</label>
            </div>
            @if (labelHasAltBarcodes()) {
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" [ngModel]="labelIncludeAltUnits()" (ngModelChange)="labelIncludeAltUnits.set($event)" style="accent-color: var(--color-primary);" />
                {{ 'products.label.includeAltUnits' | t }}
              </label>
            }
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="checkbox" [ngModel]="labelShowPrice()" (ngModelChange)="labelShowPrice.set($event)" style="accent-color: var(--color-primary);" />
              {{ 'products.label.showPrice' | t }}
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto;">
              @for (lp of labelProducts(); track lp.id) {
                <div style="border: 1px solid var(--color-border); border-radius: 6px; padding: 6px 10px; font-size: 12px;">
                  <strong>{{ lp.name }}</strong> <span style="color: var(--color-text-muted); font-family: var(--font-mono);">({{ lp.sku }})</span>
                  @if (!lp.barcode) { <div style="color: var(--color-warning);">{{ 'products.label.skuFallback' | t }}</div> }
                </div>
              }
            </div>
          </div>
          <div class="drawer-footer">
            <button type="button" class="btn btn-secondary" (click)="closeLabelModal()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="printLabels()" [disabled]="!(labelCopies() >= 1)">{{ 'products.label.printBtn' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Barcode Scanner Modal -->
    @if (showScanner()) {
      <app-barcode-scanner
        [products]="state.products()"
        (scanResult)="onBarcodeScanned($event)"
        (closeScanner)="showScanner.set(false)"
      />
    }

    <!-- ─── Warehouse Stock Transfer Drawer ─── -->
    @if (isTransferModalOpen()) {
      <div class="drawer-overlay" (click)="closeTransferModal()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2 class="drawer-title">{{ 'products.transferModal.title' | t }}</h2>
            <button class="drawer-close" (click)="closeTransferModal()">✕</button>
          </div>
          
          <div class="drawer-body">
            <p style="font-size: 13px; color: var(--text-muted, var(--color-text-muted));">
              {{ 'products.transferModal.selectedProduct' | t }} <strong style="color: var(--text-primary);">{{ selectedProductForTransfer()?.name }}</strong> (SKU: {{ selectedProductForTransfer()?.sku }})
            </p>

            <!-- Kaynak Depo Seçimi -->
            <div class="form-field">
              <select class="form-select" [ngModel]="transferFromWarehouse()" (ngModelChange)="transferFromWarehouse.set($event); onTransferFromWarehouseChange()">
                <option value="" disabled selected>{{ 'products.transferModal.selectWarehouse' | t }}</option>
                @for (wh of availableFromWarehouses(); track wh.id) {
                  <option [value]="wh.id">{{ wh.name }} ({{ 'products.transferModal.available' | t: { qty: wh.qty } }})</option>
                }
              </select>
              <label class="form-label">{{ 'products.transferModal.from' | t }}</label>
            </div>

            <!-- Hedef Depo Seçimi -->
            <div class="form-field">
              <select class="form-select" [ngModel]="transferToWarehouse()" (ngModelChange)="transferToWarehouse.set($event)">
                <option value="" disabled selected>{{ 'products.transferModal.selectWarehouse' | t }}</option>
                @for (wh of availableToWarehouses(); track wh.id) {
                  <option [value]="wh.id">{{ wh.name }}</option>
                }
              </select>
              <label class="form-label">{{ 'products.transferModal.to' | t }}</label>
            </div>

            @if (transferTracking() === 'lot' && transferFromWarehouse()) {
              <div class="form-field">
                <select id="prTrLot" class="form-input form-select has-value" [ngModel]="transferLotId()" (ngModelChange)="transferLotId.set($event || '')">
                  <option value="">{{ 'warehouses.transfer.selectLot' | t }}</option>
                  @for (l of transferLots(); track l.id) {
                    <option [value]="l.id">{{ l.lotNumber }}{{ l.expiryDate ? ' · ' + l.expiryDate : '' }} — {{ 'warehouses.transfer.available' | t: { qty: l.quantity } }}</option>
                  }
                </select>
                <label for="prTrLot" class="form-label">{{ 'warehouses.transfer.lot' | t }}</label>
              </div>
              @if (!transferTrackingLoading() && transferLots().length === 0) { <div class="pr-tr-hint">{{ 'warehouses.transfer.noLots' | t }}</div> }
              @else if (!transferTrackingLoading() && !transferLotId()) { <div class="pr-tr-hint">{{ 'warehouses.transfer.lotAutoHint' | t }}</div> }
            }
            @if (transferTracking() === 'serial' && transferFromWarehouse()) {
              <div class="pr-serial-block">
                <div class="pr-serial-title">{{ 'warehouses.transfer.serials' | t }} ({{ transferSerialSel().size }})</div>
                @if (transferTrackingLoading()) {
                  <div class="pr-tr-hint">…</div>
                } @else if (transferSerials().length === 0) {
                  <div class="pr-tr-hint">{{ 'warehouses.transfer.noSerials' | t }}</div>
                } @else {
                  <div class="pr-serial-list">
                    @for (sn of transferSerials(); track sn.id) {
                      <label class="pr-serial-item">
                        <input type="checkbox" [checked]="transferSerialSel().has(sn.serial)" (change)="toggleTransferSerial(sn.serial)" />
                        <span class="mono">{{ sn.serial }}</span>
                      </label>
                    }
                  </div>
                  <div class="pr-tr-hint">{{ 'warehouses.transfer.serialsHint' | t }}</div>
                }
              </div>
            }

            <!-- Miktar Girişi -->
            <div class="form-field">
              <input type="text" appQty [qtyDecimals]="transferDecimals()" class="form-input" [ngModel]="transferQuantity()" (ngModelChange)="transferQuantity.set($event)" [readonly]="transferTracking() === 'serial'" />
              <label class="form-label">{{ 'products.transferModal.quantity' | t }}</label>
              @if (maxTransferQuantity() > 0) {
                <span class="form-error" style="color: var(--text-muted);">{{ 'products.transferModal.max' | t: { max: maxTransferQuantity() } }}</span>
              }
            </div>

            <div class="form-field">
              <input type="text" class="form-input" [class.has-value]="!!transferNote()" [ngModel]="transferNote()" (ngModelChange)="transferNote.set($event)" />
              <label class="form-label">{{ 'products.transferModal.note' | t }}</label>
            </div>

            @if (transferValidationError(); as ve) {
              <div style="font-size: 12px; color: var(--color-danger);">⚠ {{ ve | t }}</div>
            }

            <!-- Hata ve Bilgi Mesajı -->
            @if (transferError()) {
              <div style="font-size: 12px; color: var(--color-danger); padding: 10px; background: var(--color-danger-subtle); border: 1px solid var(--color-danger-border); border-radius: 6px; display: flex; align-items: center; gap: 6px;">
                <span>⚠ {{ transferError() }}</span>
              </div>
            }
          </div>

          <div class="drawer-footer">
            <button class="btn btn-outline" style="border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); border-radius: 8px; padding: 0.65rem 1rem; cursor: pointer; font-weight: 500;" (click)="closeTransferModal()" [disabled]="isTransferLoading()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" style="background: var(--color-primary); color: var(--color-on-primary); border: none; border-radius: 8px; padding: 0.65rem 1rem; cursor: pointer; font-weight: 500;" (click)="executeTransfer()" [disabled]="isTransferLoading() || !isTransferValid()">
              @if (isTransferLoading()) {
                {{ 'products.transferModal.transferring' | t }}
              } @else {
                {{ 'products.transferModal.complete' | t }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class ProductsComponent implements OnInit {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);
  compliance = inject(ComplianceService);

  readonly units = ['Adet', 'Kg', 'Lt', 'Metre', 'Paket', 'Kutu'];

  unitLabel(unit: string | null | undefined): string {
    const u = unit || 'Adet';
    const key = 'products.units.' + u;
    return this.i18n.has(key) ? this.i18n.t(key) : u;
  }

  statusLabel(status: string): string {
    return this.i18n.t(status === 'In stock' ? 'products.status.inStock' : status === 'Low stock' ? 'products.status.lowStock' : 'products.status.outOfStock');
  }

  categories = signal<any[]>([]);
  
  // Redesign state signals
  showFilters = signal(false);
  showStats = signal(true);
  isTableView = signal(true);
  isViewDropdownOpen = signal(false);
  isSortDropdownOpen = signal(false);

  // Pagination states
  currentPage = signal(1);
  itemsPerPage = signal(10);

  paginatedProducts = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return this.filteredProducts().slice(start, start + this.itemsPerPage());
  });

  totalPages = computed(() => Math.ceil(this.filteredProducts().length / this.itemsPerPage()) || 1);

  goToPage(p: number) {
    if (p >= 1 && p <= this.totalPages()) {
      this.currentPage.set(p);
    }
  }

  getPagesArray(): number[] {
    const total = this.totalPages();
    const arr = [];
    for (let i = 1; i <= total; i++) {
      arr.push(i);
    }
    return arr;
  }

  protected readonly Math = Math;

  // Mock value generators for premium mockup
  getMockSales(p: Product): number {
    let seed = 0;
    const name = p.name || '';
    for (let i = 0; i < name.length; i++) {
      seed += name.charCodeAt(i);
    }
    return (seed % 90) + 10;
  }

  getMockRevenue(p: Product): number {
    return this.getMockSales(p) * p.price;
  }

  getMockRatingValue(p: Product): number {
    let seed = 0;
    const name = p.name || '';
    for (let i = 0; i < name.length; i++) {
      seed += name.charCodeAt(i);
    }
    const val = 4.0 + (seed % 11) * 0.1;
    return Math.min(5.0, Math.max(3.5, Math.round(val * 10) / 10));
  }

  getMockStarsArray(p: Product): number[] {
    const val = this.getMockRatingValue(p);
    const fullStars = Math.floor(val);
    return Array(fullStars).fill(0);
  }

  getMockStarsRemainder(p: Product): boolean {
    const val = this.getMockRatingValue(p);
    return (val % 1) >= 0.3;
  }

  resetPageEffect = effect(() => {
    this.filteredProducts();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });
  
  toggleFilters() {
    this.showFilters.update(v => !v);
  }
  
  toggleStats() {
    this.showStats.update(v => !v);
  }
  
  /** Products created in the last 30 days (real data, from createdAt). */
  readonly newProductCount = computed(() => {
    const since = Date.now() - 30 * 24 * 3600 * 1000;
    return this.state.products().filter(p => p.createdAt && new Date(p.createdAt).getTime() >= since).length;
  });

  /** Inventory value in company base currency (server converts via exchange rates). */
  readonly totalValue = computed(() => {
    const s = this.state.summary();
    if (s) return { amount: s.inventoryValue, currency: s.currency, unconverted: s.unconvertedCurrencies || [] };
    // Fallback before summary loads: only sum base-currency products
    const base = this.i18n.currency();
    const prods = this.state.products();
    const amount = prods.filter(p => !p.currency || p.currency === base).reduce((acc, p) => acc + p.price * (p.quantity || 0), 0);
    const unconverted = [...new Set(prods.map(p => p.currency).filter((c): c is string => !!c && c !== base))];
    return { amount, currency: base, unconverted };
  });

  isCategoryDropdownOpen = signal(false);
  productSortOption = signal<string>('default');

  // Scanner & Warehouse tooltip
  showScanner = signal(false);
  hoveredProductId = signal<string | null>(null);

  // Transfer warehouse stock states
  isTransferModalOpen = signal(false);
  selectedProductForTransfer = signal<Product | null>(null);
  transferFromWarehouse = signal('');
  transferToWarehouse = signal('');
  transferQuantity = signal(1);
  transferDecimals = computed(() => productDecimals(this.selectedProductForTransfer()));
  transferError = signal<string | null>(null);
  isTransferLoading = signal(false);

  transferNote = signal('');

  allWarehouses = signal<Warehouse[]>([]);
  taxRates = signal<TaxRate[]>([]);

  readonly currencyOptions = computed(() => {
    const list = ['TRY', 'USD', 'EUR', 'GBP'];
    const base = this.i18n.currency();
    return list.includes(base) ? list : [base, ...list];
  });

  defaultTaxLabel(): string {
    const def = this.taxRates().find(t => t.isDefault);
    const label = this.i18n.t('finance.defaultTax');
    return def ? `${label} (${def.name} %${this.i18n.formatNumber(def.rate)})` : label;
  }

  defaultWarehouseId(): string | null {
    const list = this.allWarehouses();
    return (list.find(w => w.isDefault) || list[0])?.id ?? null;
  }

  loadWarehouses() {
    this.inventoryService.getWarehouses().subscribe({
      next: (data) => {
        this.allWarehouses.set(data);
        if (!this.editingProductId() && !this.productForm.get('warehouseId')?.value) {
          this.productForm.get('warehouseId')?.setValue(this.defaultWarehouseId());
        }
      }
    });
  }

  loadTaxRates() {
    this.inventoryService.getTaxRates().subscribe({
      next: (data) => this.taxRates.set(data)
    });
  }

  private warehouseQty(prod: Product, wh: Warehouse): number {
    return Number(prod.warehouses?.[wh.name]) || 0;
  }

  availableFromWarehouses = computed(() => {
    const prod = this.selectedProductForTransfer();
    if (!prod) return [];
    return this.allWarehouses()
      .map(wh => ({ id: wh.id, name: wh.name, qty: this.warehouseQty(prod, wh) }))
      .filter(w => w.qty > 0);
  });

  availableToWarehouses = computed(() => {
    if (!this.selectedProductForTransfer()) return [];
    const from = this.transferFromWarehouse();
    return this.allWarehouses().filter(w => w.id !== from);
  });

  // Lot/serial selection (same flow as the warehouses page transfer drawer)
  transferLots = signal<StockLot[]>([]);
  transferSerials = signal<SerialNumber[]>([]);
  transferLotId = signal('');
  transferSerialSel = signal<Set<string>>(new Set());
  transferTrackingLoading = signal(false);
  transferTracking = computed(() => this.selectedProductForTransfer()?.trackingType || 'none');

  maxTransferQuantity = computed(() => {
    const fromId = this.transferFromWarehouse();
    if (!fromId) return 0;
    if (this.transferTracking() === 'lot' && this.transferLotId()) {
      return this.transferLots().find(l => l.id === this.transferLotId())?.quantity ?? 0;
    }
    return this.availableFromWarehouses().find(w => w.id === fromId)?.qty ?? 0;
  });

  transferValidationError = computed<string | null>(() => {
    const from = this.transferFromWarehouse();
    const to = this.transferToWarehouse();
    const qty = Number(this.transferQuantity());
    if (from && to && from === to) return 'products.transferModal.sameWarehouse';
    if (from && qty > this.maxTransferQuantity()) return 'products.transferModal.exceedsAvailable';
    if (from && to && !(qty > 0)) return 'products.transferModal.invalidQuantity';
    if (from && this.transferTracking() === 'serial' && qty !== this.transferSerialSel().size) return 'warehouses.transfer.serialsMismatch';
    return null;
  });

  getBarcodeBars(sku: string): { width: number, isBar: boolean }[] {
    if (!sku) return [];
    const bars: { width: number, isBar: boolean }[] = [];
    
    // Start guard
    bars.push({ width: 2, isBar: true });
    bars.push({ width: 1, isBar: false });
    bars.push({ width: 1, isBar: true });
    bars.push({ width: 2, isBar: false });
    
    // Hash SKU to generate deterministic bars
    let hash = 0;
    for (let i = 0; i < sku.length; i++) {
      hash = (hash << 5) - hash + sku.charCodeAt(i);
      hash |= 0;
    }
    
    for (let i = 0; i < sku.length; i++) {
      const code = sku.charCodeAt(i);
      const pattern = [
        (code & 1) ? 2 : 1,
        (code & 2) ? 1 : 2,
        (code & 4) ? 2 : 1,
        (code & 8) ? 1 : 2,
        (code & 16) ? 2 : 1,
        (code & 32) ? 1 : 2,
      ];
      pattern.forEach((w, index) => {
        bars.push({ width: w * 1.5, isBar: index % 2 === 0 });
      });
      bars.push({ width: 1.5, isBar: false });
    }
    
    // End guard
    bars.push({ width: 2, isBar: true });
    bars.push({ width: 1, isBar: false });
    bars.push({ width: 2, isBar: true });
    return bars;
  }

  // ─── Units, barcode & tracking ─────────────────────────────
  private sanitizer = inject(DomSanitizer);
  private unitLabelPipe = new UnitLabelPipe();
  readonly barcodeTypes: BarcodeType[] = ['EAN13', 'EAN8', 'UPCA', 'CODE128'];
  unitsList = signal<Unit[]>([]);
  altUnits = signal<{ unitId: string; factor: number; barcode: string }[]>([]);
  highlightedProductId = signal<string | null>(null);
  private highlightTimer: any = null;

  // Lots / serials of the product being edited
  editingTrackingType = signal<'none' | 'lot' | 'serial'>('none');
  productLots = signal<StockLot[]>([]);
  productSerials = signal<SerialNumber[]>([]);
  isLoadingTracking = signal(false);

  // Label printing
  labelProducts = signal<Product[]>([]);
  labelCopies = signal(1);
  labelIncludeAltUnits = signal(true);
  labelShowPrice = signal(true);
  labelHasAltBarcodes = computed(() => this.labelProducts().some(p => (p.units || []).some(u => !!u.barcode)));
  selectedProducts = computed(() => {
    const ids = this.selectedProductIds();
    return this.state.products().filter(p => ids.includes(p.id));
  });

  loadUnits() {
    this.inventoryService.getUnits().subscribe({
      next: (list) => {
        this.unitsList.set(list);
        if (!this.editingProductId() && !this.productForm.get('baseUnitId')?.value) {
          this.productForm.get('baseUnitId')?.setValue(this.defaultUnitId(), { emitEvent: false });
        }
      }
    });
  }

  defaultUnitId(): string | null {
    const list = this.unitsList();
    return (list.find(u => u.code === 'pcs') || list[0])?.id ?? null;
  }

  formTracked(): boolean {
    const t = this.productForm.get('trackingType')?.value;
    return !!t && t !== 'none';
  }

  /** Toast text plus regulatory category warnings returned by the server. */
  private withWarnings(key: string, p: Product): string {
    const w = (p.complianceWarnings || []).map((c) => this.i18n.t('products.regulatory.issue.' + c, { category: this.i18n.t('products.regulatory.' + (p.regulatoryCategory || 'none')), tracking: '' }));
    return [this.i18n.t(key), ...w].join(' ');
  }

  private applyTrackingLock() {
    const qty = this.productForm.get('quantity');
    if (!qty) return;
    if (this.editingProductId()) {
      if (qty.enabled) qty.disable({ emitEvent: false });
      return;
    }
    if (this.formTracked()) {
      if (!this.editingProductId()) qty.setValue(0, { emitEvent: false });
      if (qty.enabled) qty.disable({ emitEvent: false });
    } else if (qty.disabled) {
      qty.enable({ emitEvent: false });
    }
  }

  isTracked(p: Product): boolean {
    return !!p.trackingType && p.trackingType !== 'none';
  }

  trackingBadgeLabel(p: Product): string {
    if (p.trackingType === 'serial') return this.i18n.t('products.tracking.serial');
    const lot = this.i18n.t('products.tracking.lot');
    return p.hasExpiry ? `${lot} + ${this.i18n.t('products.tracking.expiry')}` : lot;
  }

  productUnitLabel(p: Product): string {
    if (p.baseUnit) return this.unitLabelPipe.transform(p.baseUnit);
    const byId = p.baseUnitId ? this.unitsList().find(u => u.id === p.baseUnitId) : null;
    return byId ? this.unitLabelPipe.transform(byId) : this.unitLabel(p.unit);
  }

  unitNameById(id: string | null | undefined): string {
    const u = this.unitsList().find(x => x.id === id);
    return u ? this.unitLabelPipe.transform(u) : '';
  }

  baseUnitName(): string {
    const id = this.productForm.get('baseUnitId')?.value;
    return id ? this.unitNameById(id) : this.unitLabel(this.productForm.get('unit')?.value);
  }

  warehouseNameById(id: string | null | undefined): string {
    return this.allWarehouses().find(w => w.id === id)?.name || '';
  }

  addAltUnit() {
    this.altUnits.update(list => [...list, { unitId: '', factor: 1, barcode: '' }]);
    this.productForm.markAsDirty();
  }

  removeAltUnit(index: number) {
    this.altUnits.update(list => list.filter((_, i) => i !== index));
    this.productForm.markAsDirty();
  }

  updateAltUnit(index: number, field: 'unitId' | 'factor' | 'barcode', value: string) {
    this.altUnits.update(list => list.map((u, i) => i !== index ? u : { ...u, [field]: field === 'factor' ? Number(value) : value }));
    this.productForm.markAsDirty();
  }

  /** GS1 mod-10 check digit validation for EAN-8 / UPC-A / EAN-13. */
  static gtinValid(code: string): boolean {
    if (!/^\d+$/.test(code)) return false;
    const digits = code.split('').map(Number);
    const check = digits.pop()!;
    let sum = 0;
    digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === check;
  }

  private static gtinCheckDigit(body: string): number {
    let sum = 0;
    body.split('').map(Number).reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10;
  }

  barcodeHint(): { key: string; ok: boolean } | null {
    const code = String(this.productForm.get('barcode')?.value || '').trim();
    if (!code) return null;
    const type = this.productForm.get('barcodeType')?.value as string;
    const len: Record<string, number> = { EAN13: 13, EAN8: 8, UPCA: 12 };
    if (type && len[type]) {
      if (!new RegExp(`^\\d{${len[type]}}$`).test(code)) return { key: 'products.barcode.lengthInvalid', ok: false };
      return ProductsComponent.gtinValid(code) ? { key: 'products.barcode.checksumOk', ok: true } : { key: 'products.barcode.checksumInvalid', ok: false };
    }
    if (!type && /^(\d{8}|\d{12}|\d{13})$/.test(code)) {
      return ProductsComponent.gtinValid(code) ? { key: 'products.barcode.checksumOk', ok: true } : { key: 'products.barcode.checksumInvalid', ok: false };
    }
    return null;
  }

  generateEan13() {
    // Prefix 2 = GS1 restricted circulation (in-store) numbers
    let body = '2';
    for (let i = 0; i < 11; i++) body += Math.floor(Math.random() * 10);
    const code = body + ProductsComponent.gtinCheckDigit(body);
    this.productForm.patchValue({ barcode: code, barcodeType: 'EAN13' });
    this.productForm.get('barcode')?.markAsDirty();
  }

  /** JsBarcode format for a stored barcode type (or auto-detected from the code). */
  private jsFormat(code: string, type: string | null | undefined): string {
    switch (type) {
      case 'EAN13': return 'EAN13';
      case 'EAN8': return 'EAN8';
      case 'UPCA': return 'UPC';
      case 'CODE128': return 'CODE128';
    }
    if (/^\d{13}$/.test(code)) return 'EAN13';
    if (/^\d{12}$/.test(code)) return 'UPC';
    if (/^\d{8}$/.test(code)) return 'EAN8';
    return 'CODE128';
  }

  /** Renders a barcode as an SVG string; falls back to CODE128 when the value is invalid for its format. */
  barcodeSvg(code: string, type?: string | null, opts: { height?: number; width?: number; fontSize?: number } = {}): string {
    const render = (format: string) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, code, { format, height: opts.height ?? 50, width: opts.width ?? 2, fontSize: opts.fontSize ?? 14, margin: 4, displayValue: true });
      return svg.outerHTML;
    };
    try {
      return render(this.jsFormat(code, type));
    } catch {
      try { return render('CODE128'); } catch { return ''; }
    }
  }

  private previewCache: { key: string; html: SafeHtml | null } = { key: '', html: null };
  barcodePreview(): SafeHtml | null {
    const barcode = String(this.productForm.get('barcode')?.value || '').trim();
    const sku = String(this.productForm.get('sku')?.value || '').trim();
    const type = barcode ? (this.productForm.get('barcodeType')?.value || null) : 'CODE128';
    const code = barcode || sku;
    const key = `${code}|${type}`;
    if (key === this.previewCache.key) return this.previewCache.html;
    const svg = code ? this.barcodeSvg(code, type, { height: 40, width: 1.6, fontSize: 12 }) : '';
    this.previewCache = { key, html: svg ? this.sanitizer.bypassSecurityTrustHtml(svg) : null };
    return this.previewCache.html;
  }

  private highlightProduct(id: string) {
    this.highlightedProductId.set(id);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlightedProductId.set(null), 5000);
  }

  private resetTrackingDetail() {
    this.editingTrackingType.set('none');
    this.productLots.set([]);
    this.productSerials.set([]);
    this.isLoadingTracking.set(false);
  }

  private loadTrackingDetail(p: Product) {
    this.resetTrackingDetail();
    const type = (p.trackingType || 'none') as 'none' | 'lot' | 'serial';
    this.editingTrackingType.set(type);
    if (type === 'none') return;
    this.isLoadingTracking.set(true);
    const done = () => this.isLoadingTracking.set(false);
    if (type === 'lot') {
      this.inventoryService.getProductLots(p.id).subscribe({
        next: (lots) => {
          this.productLots.set([...lots].filter(l => l.quantity > 0).sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999')));
          done();
        },
        error: done,
      });
    } else {
      this.inventoryService.getProductSerials(p.id, 'in_stock').subscribe({
        next: (list) => { this.productSerials.set(list); done(); },
        error: done,
      });
    }
  }

  private expiryAlertDays(): number {
    const d = Number(this.ui.userProfile()?.company?.expiryAlertDays);
    return Number.isFinite(d) && d >= 0 ? d : 30;
  }

  lotStatus(lot: StockLot): 'expired' | 'soon' | 'ok' {
    if (!lot.expiryDate) return 'ok';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp = new Date(lot.expiryDate + 'T00:00:00');
    const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
    if (days < 0) return 'expired';
    return days <= this.expiryAlertDays() ? 'soon' : 'ok';
  }

  private saveErrorMessage(err: any, fallbackKey: string): string {
    const code = err?.error?.code || err?.error?.error;
    const map: Record<string, string> = {
      BARCODE_TAKEN: 'products.errors.barcodeTaken',
      BARCODE_INVALID_CHECKSUM: 'products.errors.barcodeChecksum',
      PRODUCT_TRACKED_QTY_LOCKED: 'products.errors.trackedQtyLocked',
    };
    if (code && map[code]) return this.i18n.t(map[code]);
    const msg = err?.error?.message;
    return (Array.isArray(msg) ? msg[0] : msg) || this.i18n.t(fallbackKey);
  }

  openLabelModal(products: Product[]) {
    if (!products || products.length === 0) {
      this.ui.showToast(this.i18n.t('products.toast.nothingToPrint'), 'error');
      return;
    }
    this.labelProducts.set(products);
    this.labelCopies.set(1);
    this.labelIncludeAltUnits.set(true);
  }

  closeLabelModal() {
    this.labelProducts.set([]);
  }

  printLabels() {
    const products = this.labelProducts();
    const copies = Math.max(1, Math.min(500, Math.floor(Number(this.labelCopies()) || 1)));
    const esc = (v: string) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const showPrice = this.labelShowPrice();
    const labels: string[] = [];
    for (const p of products) {
      const entries: { code: string; type: string | null | undefined; sub: string; price: number }[] = [
        { code: p.barcode || p.sku, type: p.barcode ? p.barcodeType : 'CODE128', sub: this.productUnitLabel(p), price: p.price },
      ];
      if (this.labelIncludeAltUnits()) {
        for (const u of p.units || []) {
          if (!u.barcode) continue;
          const unitName = u.unit ? this.unitLabelPipe.transform(u.unit) : this.unitNameById(u.unitId);
          entries.push({ code: u.barcode, type: null, sub: `${unitName} (×${this.i18n.formatNumber(u.factor)})`, price: p.price * u.factor });
        }
      }
      for (const e of entries) {
        const svg = this.barcodeSvg(e.code, e.type, { height: 40, width: 1.6, fontSize: 12 });
        const html = `<div class="label">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">SKU: ${esc(p.sku)} · ${esc(e.sub)}</div>
          <div class="bc">${svg}</div>
          ${showPrice ? `<div class="price">${esc(this.i18n.formatMoney(e.price, p.currency || undefined))}</div>` : ''}
        </div>`;
        for (let i = 0; i < copies; i++) labels.push(html);
      }
    }
    const w = window.open('', '_blank');
    if (!w) {
      this.ui.showToast(this.i18n.t('products.toast.popupBlocked'), 'error');
      return;
    }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.i18n.t('products.label.title'))}</title>
      <style>
        @page { margin: 6mm; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
        .sheet { display: flex; flex-wrap: wrap; gap: 3mm; }
        .label { width: 60mm; height: 38mm; box-sizing: border-box; border: 1px dashed var(--color-border-strong); padding: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
        .name { font-size: 10pt; font-weight: bold; text-align: center; max-height: 2.4em; overflow: hidden; }
        .meta { font-size: 7pt; color: var(--color-text); }
        .bc svg { max-width: 56mm; height: auto; display: block; }
        .price { font-size: 11pt; font-weight: bold; }
        @media print { .label { border-color: transparent; } }
      </style></head><body><div class="sheet">${labels.join('')}</div>
      <script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 150); };<\/script>
      </body></html>`);
    w.document.close();
    this.closeLabelModal();
  }

  // Bulk selection & operation states
  selectedProductIds = signal<string[]>([]);
  isBulkCategoryDropdownOpen = signal(false);

  isProductSelected(id: string): boolean {
    return this.selectedProductIds().includes(id);
  }

  isAllSelected(): boolean {
    const list = this.filteredProducts();
    if (list.length === 0) return false;
    return list.every(p => this.selectedProductIds().includes(p.id));
  }

  toggleSelectProduct(id: string) {
    this.selectedProductIds.update(ids => {
      if (ids.includes(id)) {
        return ids.filter(x => x !== id);
      } else {
        return [...ids, id];
      }
    });
  }

  toggleSelectAll() {
    const list = this.filteredProducts();
    if (this.isAllSelected()) {
      const filteredIds = list.map(p => p.id);
      this.selectedProductIds.update(ids => ids.filter(id => !filteredIds.includes(id)));
    } else {
      const filteredIds = list.map(p => p.id);
      this.selectedProductIds.update(ids => {
        const newSet = new Set([...ids, ...filteredIds]);
        return Array.from(newSet);
      });
    }
  }

  clearSelection() {
    this.selectedProductIds.set([]);
    this.isBulkCategoryDropdownOpen.set(false);
  }

  toggleBulkCategoryDropdown(event: Event) {
    event.stopPropagation();
    this.isBulkCategoryDropdownOpen.update(v => !v);
  }

  applyBulkCategory(categorySlug: string) {
    const ids = this.selectedProductIds();
    if (ids.length === 0) return;
    this.isBulkCategoryDropdownOpen.set(false);

    this.inventoryService.bulkUpdateProducts(ids, { category: categorySlug }).subscribe({
      next: (res) => {
        if (res.success) {
          this.state.products.update(list => 
            list.map(p => ids.includes(p.id) ? { ...p, category: categorySlug } : p)
          );
          this.ui.showToast(this.i18n.t('products.toast.bulkCategoryUpdated', { count: ids.length }), 'success');
          this.clearSelection();
        } else {
          this.ui.showToast(this.i18n.t('products.toast.bulkCategoryError'), 'error');
        }
      },
      error: () => {
        this.ui.showToast(this.i18n.t('products.toast.bulkCategoryError'), 'error');
      }
    });
  }

  promptBulkDelete() {
    const ids = this.selectedProductIds();
    this.ui.openConfirm({
      title: this.i18n.t('products.confirm.bulkDeleteTitle'),
      message: this.i18n.t('products.confirm.bulkDeleteMessage', { count: ids.length }),
      isDelete: true,
      onConfirm: () => {
        return this.inventoryService.bulkDeleteProducts(ids).pipe(
          tap({
            next: (res) => {
              if (res.success) {
                this.state.products.update(list => list.filter(p => !ids.includes(p.id)));
                this.ui.showToast(this.i18n.t('products.toast.bulkDeleted', { count: ids.length }), 'success');
                this.clearSelection();
              } else {
                this.ui.showToast(this.i18n.t('products.toast.bulkDeleteError'), 'error');
              }
            },
            error: () => {
              this.ui.showToast(this.i18n.t('products.toast.bulkDeleteError'), 'error');
            }
          })
        );
      }
    });
  }

  toggleCategoryDropdown(event: Event) {
    event.stopPropagation();
    if (this.isSaveLoading()) return;
    this.isCategoryDropdownOpen.update(v => !v);
  }

  selectCategory(value: string) {
    this.productForm.patchValue({ category: value });
    this.productForm.get('category')?.markAsDirty();
    this.productForm.get('category')?.markAsTouched();
    this.isCategoryDropdownOpen.set(false);
  }

  getCategoryName(value: string): string {
    return this.categories().find(c => c.slug === value)?.name || value || this.i18n.t('products.form.selectCategory');
  }

  loadCategories() {
    this.inventoryService.getCategories().subscribe({
      next: (data) => {
        const cleaned = data.filter(c => c && c.name && !c.name.toLowerCase().startsWith('ekle:'));
        this.categories.set(cleaned);
      }
    });
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.isCategoryDropdownOpen.set(false);
    this.isSupplierDropdownOpen.set(false);
    this.isBulkCategoryDropdownOpen.set(false);
    this.isViewDropdownOpen.set(false);
    this.isSortDropdownOpen.set(false);
  }

  // Suppliers
  suppliers = signal<any[]>([]);
  isSupplierDropdownOpen = signal(false);

  loadSuppliers() {
    this.inventoryService.getSuppliers().subscribe({
      next: (data) => this.suppliers.set(data)
    });
  }

  toggleSupplierDropdown(event: Event) {
    event.stopPropagation();
    if (this.isSaveLoading()) return;
    this.isCategoryDropdownOpen.set(false);
    this.isSupplierDropdownOpen.update(v => !v);
  }

  selectSupplier(id: string | null) {
    this.productForm.patchValue({ supplierId: id });
    this.productForm.get('supplierId')?.markAsDirty();
    this.productForm.get('supplierId')?.markAsTouched();
    this.isSupplierDropdownOpen.set(false);
  }

  getSupplierName(id: string | null): string {
    if (!id) return this.i18n.t('products.form.noSupplier');
    return this.suppliers().find(s => s.id === id)?.name || this.i18n.t('products.form.noSupplier');
  }

  // Modals & Forms
  showProductFormModal = signal(false);
  editingProductId = signal<string | null>(null);
  isSaveLoading = signal(false);

  readonly regulatoryCategories = REGULATORY_CATEGORIES;
  readonly inventoryClasses = INVENTORY_CLASSES;
  enabledModules = signal<string[]>([]);
  private formState = signal<Record<string, any>>({});
  /** Precision of the selected base unit (kg: 3, pcs: 0; serial-tracked: 0). */
  formDecimals = computed(() => {
    const v = this.formState();
    if (v['trackingType'] === 'serial') return 0;
    return Number(this.unitsList().find((u) => u.id === v['baseUnitId'])?.decimals) || 0;
  });
  /** Live category rule check (same rule table as the server). */
  categoryHints = computed(() => {
    const v = this.formState();
    return checkCategoryRules(
      { regulatoryCategory: v['regulatoryCategory'], trackingType: v['trackingType'], hasExpiry: v['hasExpiry'], gtin14: v['gtin14'] || null },
      this.enabledModules(),
    )
      .filter((i) => i.code !== 'REGULATORY_MODULE_DISABLED')
      .map((i) => ({ ...i, params: { ...(i.params || {}), category: this.i18n.t('products.regulatory.' + (v['regulatoryCategory'] || 'none')), tracking: (i.params?.['tracking'] || '').split('/').map((t: string) => this.i18n.t('products.tracking.' + t)).join(' / ') } }));
  });

  productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    sku: ['', [Validators.required, Validators.minLength(2)]],
    category: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    minQuantity: [5, [Validators.required, Validators.min(0)]],
    unit: ['Adet'],
    baseUnitId: [null as string | null],
    barcode: [''],
    barcodeType: [''],
    trackingType: ['none'],
    hasExpiry: [false],
    regulatoryCategory: ['none'],
    inventoryClass: ['TICARI_MAL_153'],
    gtin14: ['', [(c: AbstractControl) => (c.value && String(c.value).trim() && !isValidGtin(String(c.value).trim()) ? { gtin: true } : null)]],
    supplierId: [null],
    imageUrl: [''],
    currency: ['TRY', Validators.required],
    taxRateId: [null as string | null],
    warehouseId: [null as string | null]
  });



  productSearch = signal('');
  productFilterStatus = signal<'all' | 'In stock' | 'Low stock' | 'Out of stock'>('all');
  selectedWarehouseFilter = signal('');

  clearWarehouseFilter() {
    this.selectedWarehouseFilter.set('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { warehouse: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  filteredProducts = computed(() => {
    let list = this.state.products();
    const search = this.productSearch().toLowerCase().trim();
    const statusFilter = this.productFilterStatus();
    const sortOpt = this.productSortOption();
    const warehouseFilter = this.selectedWarehouseFilter();

    if (search) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search) ||
        (p.barcode || '').toLowerCase().includes(search) ||
        (p.units || []).some(u => (u.barcode || '').toLowerCase() === search) ||
        p.category.toLowerCase().includes(search) ||
        this.getCategoryName(p.category).toLowerCase().includes(search)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    if (warehouseFilter) {
      list = list.filter(p => p.warehouses && p.warehouses[warehouseFilter] > 0);
    }

    // Sort list
    if (sortOpt === 'stock-desc') {
      list = [...list].sort((a, b) => b.quantity - a.quantity);
    } else if (sortOpt === 'stock-asc') {
      list = [...list].sort((a, b) => a.quantity - b.quantity);
    } else if (sortOpt === 'price-asc') {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (sortOpt === 'price-desc') {
      list = [...list].sort((a, b) => b.price - a.price);
    } else if (sortOpt === 'name-asc') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, this.i18n.locale()));
    }

    return list;
  });

  ngOnInit() {
    this.loadSuppliers();
    this.loadCategories();
    this.loadWarehouses();
    this.loadTaxRates();
    this.loadUnits();
    this.productForm.get('trackingType')!.valueChanges.subscribe(() => this.applyTrackingLock());
    this.productForm.valueChanges.subscribe(() => this.formState.set(this.productForm.getRawValue()));
    this.compliance.getCompany().subscribe({ next: (c) => this.enabledModules.set(c.enabledComplianceModules || []), error: () => undefined });
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
    this.route.queryParams.subscribe(params => {
      this.productSearch.set(params['q'] || '');
      this.selectedWarehouseFilter.set(params['warehouse'] || '');
      if (params['open']) {
        const openVal = params['open'];
        if (openVal === 'new') {
          this.openAddProduct();
        } else if (openVal.startsWith('edit-')) {
          const id = openVal.substring(5);
          const found = this.state.products().find(p => p.id === id);
          if (found) {
            this.openEditProduct(found);
          }
        }
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { open: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });
  }

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.productSearch.set(input.value);
  }

  onSortChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.productSortOption.set(select.value);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.productForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasValue(fieldName: string): boolean {
    const val = this.productForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  // Form Operations
  openAddProduct() {
    this.editingProductId.set(null);
    const defaultCat = this.categories().length > 0 ? this.categories()[0].slug : '';
    this.productForm.reset({
      name: '', sku: '', category: defaultCat, price: 0, quantity: 0, minQuantity: 5, unit: 'Adet', supplierId: null, imageUrl: '',
      currency: this.i18n.currency(), taxRateId: null, warehouseId: this.defaultWarehouseId(),
      baseUnitId: this.defaultUnitId(), barcode: '', barcodeType: '', trackingType: 'none', hasExpiry: false,
      regulatoryCategory: 'none', inventoryClass: 'TICARI_MAL_153', gtin14: ''
    });
    this.productForm.get('quantity')!.enable({ emitEvent: false });
    this.applyTrackingLock();
    this.altUnits.set([]);
    this.resetTrackingDetail();
    this.showProductFormModal.set(true);
  }

  openEditProduct(p: Product) {
    this.editingProductId.set(p.id);
    this.productForm.patchValue({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: p.price,
      quantity: p.quantity,
      minQuantity: p.minQuantity,
      unit: p.unit || 'Adet',
      supplierId: p.supplierId,
      imageUrl: p.imageUrl || '',
      currency: p.currency || this.i18n.currency(),
      taxRateId: p.taxRateId ?? null,
      warehouseId: null,
      baseUnitId: p.baseUnitId ?? p.baseUnit?.id ?? null,
      barcode: p.barcode || '',
      barcodeType: p.barcodeType || '',
      trackingType: p.trackingType || 'none',
      hasExpiry: !!p.hasExpiry,
      regulatoryCategory: p.regulatoryCategory || 'none',
      inventoryClass: p.inventoryClass || 'TICARI_MAL_153',
      gtin14: p.gtin14 || ''
    });
    // Stock corrections go through Stock movements (reason code + reversal), not the product form.
    this.productForm.get('quantity')!.disable({ emitEvent: false });
    this.productForm.markAsPristine();
    this.altUnits.set((p.units || []).map(u => ({ unitId: u.unitId || u.unit?.id || '', factor: Number(u.factor) || 1, barcode: u.barcode || '' })));
    this.loadTrackingDetail(p);
    this.showProductFormModal.set(true);
  }



  closeProductForm() {
    this.showProductFormModal.set(false);
  }

  saveProduct() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    if (this.isSaveLoading()) return;
    this.isSaveLoading.set(true);

    const editingId = this.editingProductId();
    const { warehouseId, ...rest } = this.productForm.value;
    // `warehouses` is server-managed; never send it. warehouseId only on create (omitted -> default warehouse).
    const payload: any = { ...rest };
    delete payload.warehouses;
    if (!editingId && warehouseId) payload.warehouseId = warehouseId;
    payload.barcode = String(rest.barcode || '').trim() || null;
    payload.barcodeType = payload.barcode ? (rest.barcodeType || null) : null;
    payload.trackingType = rest.trackingType || 'none';
    payload.hasExpiry = payload.trackingType === 'lot' && !!rest.hasExpiry;
    payload.baseUnitId = rest.baseUnitId || null;
    if (payload.baseUnitId) {
      // Legacy `unit` mirrors the base unit code (server keeps it in sync)
      const bu = this.unitsList().find(u => u.id === payload.baseUnitId);
      if (bu) payload.unit = bu.code;
    }
    payload.units = this.altUnits()
      .filter(u => u.unitId && Number(u.factor) > 0)
      .map(u => ({ unitId: u.unitId, factor: Number(u.factor), barcode: (u.barcode || '').trim() || null }));
    payload.gtin14 = String(rest.gtin14 || '').trim() || null;
    // Edits never change stock (corrections are reason-coded movements); tracked products start at 0.
    if (editingId) delete payload.quantity;
    else if (payload.trackingType !== 'none') payload.quantity = 0;

    if (editingId) {
      // Edit mode
      this.inventoryService.updateProduct(editingId, payload).subscribe({
        next: (updatedProd) => {
          this.state.products.update(list => list.map(p => p.id === editingId ? updatedProd : p));
          this.isSaveLoading.set(false);
          this.closeProductForm();
          this.ui.showToast(this.withWarnings('products.toast.updated', updatedProd), 'success');
        },
        error: (err) => {
          this.isSaveLoading.set(false);
          this.ui.showToast(this.saveErrorMessage(err, 'products.toast.updateError'), 'error');
        }
      });
    } else {
      // Create mode
      this.inventoryService.createProduct(payload).subscribe({
        next: (prod) => {
          this.state.products.update(p => {
            if (p.some(x => x.id === prod.id)) return p;
            return [prod, ...p];
          });
          this.closeProductForm();
          this.isSaveLoading.set(false);
          this.ui.showToast(this.withWarnings('products.toast.created', prod), 'success');
        },
        error: (err) => {
          this.isSaveLoading.set(false);
          this.ui.showToast(this.saveErrorMessage(err, 'products.toast.createError'), 'error');
        }
      });
    }
  }

  // Delete Product
  promptDeleteProduct(product: Product) {
    this.ui.openConfirm({
      title: this.i18n.t('products.confirm.deleteTitle'),
      message: this.i18n.t('products.confirm.deleteMessage', { name: product.name }),
      isDelete: true,
      onConfirm: () => {
        return this.inventoryService.deleteProduct(product.id).pipe(
          tap({
            next: (res) => {
              if (res.success) {
                this.state.products.update(p => p.filter(prod => prod.id !== product.id));
                this.ui.showToast(this.i18n.t('products.toast.deleted'), 'success');
              } else {
                this.ui.showToast(this.i18n.t('products.toast.deleteError'), 'error');
              }
            },
            error: () => {
              this.ui.showToast(this.i18n.t('products.toast.deleteError'), 'error');
            }
          })
        );
      }
    });
  }

  // Export to CSV
  exportToCSV() {
    const list = this.filteredProducts();
    if (!list || list.length === 0) {
      this.ui.showToast(this.i18n.t('products.toast.nothingToExport'), 'error');
      return;
    }

    const headers = ['products.csv.name', 'products.csv.sku', 'products.csv.category', 'products.csv.unitPrice', 'products.csv.currentStock', 'products.csv.minQuantity', 'products.csv.status', 'products.csv.supplierId'].map(k => `"${this.i18n.t(k)}"`);
    const rows = list.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.sku}"`,
      `"${p.category}"`,
      p.price,
      p.quantity,
      p.minQuantity,
      `"${p.status}"`,
      `"${p.supplierId || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob(['\\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `urunler_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    this.ui.showToast(this.i18n.t('products.toast.exported'), 'success');
  }

  // Import from CSV
  importFromCSV(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        this.ui.showToast(this.i18n.t('products.toast.invalidCsv'), 'error');
        return;
      }
      
      // Basic CSV parser
      const parseLine = (line: string) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') {
            inQuotes = !inQuotes;
          } else if (c === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
          } else {
            cur += c;
          }
        }
        result.push(cur);
        return result.map(s => s.trim().replace(/^"|"$/g, ''));
      };

      const newProducts = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        if (cols.length >= 6) {
          newProducts.push({
            name: cols[0],
            sku: cols[1],
            category: cols[2],
            price: parseFloat(cols[3]) || 0,
            quantity: parseInt(cols[4]) || 0,
            minQuantity: parseInt(cols[5]) || 0,
            supplierId: cols[7] || null
          });
        }
      }

      if (newProducts.length > 0) {
        this.inventoryService.bulkCreateProducts(newProducts).subscribe({
          next: () => {
            this.ui.showToast(this.i18n.t('products.toast.imported', { count: newProducts.length }), 'success');
            this.state.loadData();
          },
          error: () => this.ui.showToast(this.i18n.t('products.toast.importError'), 'error')
        });
      } else {
        this.ui.showToast(this.i18n.t('products.toast.noValidProducts'), 'error');
      }
      
      input.value = '';
    };
    
    reader.readAsText(file);
  }

  // ─── Barcode Scanner ─────────────────────────────────────────
  openScanner() {
    this.showScanner.set(true);
  }

  onBarcodeScanned(code: string) {
    this.showScanner.set(false);
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    this.inventoryService.lookupBarcode(trimmed).subscribe({
      next: (res) => {
        const prod = this.state.products().find(p => p.id === res.product.id) || res.product;
        this.productSearch.set(prod.sku);
        this.highlightProduct(prod.id);
        let msg = this.i18n.t('products.toast.scanFound', { name: prod.name, sku: prod.sku });
        if (res.unitCode && res.factor && res.factor !== 1) msg += ' · ' + this.i18n.t('products.toast.scanUnit', { unit: this.unitLabelPipe.transform(res.unitCode), factor: res.factor });
        if (res.serial) msg += ' · ' + this.i18n.t('products.toast.scanSerial', { serial: res.serial });
        this.ui.showToast(msg, 'success');
        this.openEditProduct(prod);
      },
      error: () => this.fallbackScanSearch(trimmed),
    });
  }

  private fallbackScanSearch(sku: string) {
    this.productSearch.set(sku);
    // Check if the scanned product exists
    const found = this.state.products().find(p => p.sku === sku);
    if (found) {
      this.ui.showToast(this.i18n.t('products.toast.scanFound', { name: found.name, sku }), 'success');
    } else {
      this.ui.showToast(this.i18n.t('products.toast.scanNotFound', { sku }), 'error');
    }
  }

  // ─── Warehouse Tooltip ─────────────────────────────────────────
  getWarehouseEntries(warehouses: Record<string, number> | null): { name: string; qty: number }[] {
    if (!warehouses) return [];
    return Object.entries(warehouses).map(([name, qty]) => ({ name, qty }));
  }

  // ─── Print / PDF ─────────────────────────────────────────────
  printProducts() {
    const list = this.filteredProducts();
    if (!list || list.length === 0) {
      this.ui.showToast(this.i18n.t('products.toast.nothingToPrint'), 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.ui.showToast(this.i18n.t('products.toast.popupBlocked'), 'error');
      return;
    }

    const t = (k: string, params?: Record<string, unknown>) => this.i18n.t(k, params);
    const rows = list.map(p => `
      <tr>
        <td>${p.name}</td>
        <td style="font-family: monospace;">${p.sku}</td>
        <td>${this.getCategoryName(p.category)}</td>
        <td style="text-align: right;">${this.i18n.formatMoney(p.price)}</td>
        <td style="text-align: right; font-weight: 600;">${this.i18n.formatNumber(p.quantity)} ${this.unitLabel(p.unit)}</td>
        <td style="text-align: right;">${p.minQuantity}</td>
        <td>${this.statusLabel(p.status)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="${this.i18n.lang()}">
      <head>
        <title>${t('products.print.title')}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', system-ui, sans-serif; padding: 32px; color: var(--color-text); }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: var(--color-surface-muted); text-align: left; padding: 8px 12px; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border-bottom: 2px solid var(--color-border); }
          td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-subtle); }
          tr:nth-child(even) { background: var(--color-surface-subtle); }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1>${t('products.print.title')}</h1>
        <p class="subtitle">${t('products.print.subtitle', { date: this.i18n.formatDate(new Date(), 'datetime'), count: list.length })}</p>
        <table>
          <thead>
            <tr>
              <th>${t('products.csv.name')}</th>
              <th>${t('products.csv.sku')}</th>
              <th>${t('products.csv.category')}</th>
              <th style="text-align:right">${t('products.csv.unitPrice')}</th>
              <th style="text-align:right">${t('products.col.stock')}</th>
              <th style="text-align:right">${t('products.print.minLimit')}</th>
              <th>${t('products.csv.status')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  onTransferFromWarehouseChange() {
    this.transferQuantity.set(1);
    this.transferToWarehouse.set('');
    this.resetTransferTracking();
    const prod = this.selectedProductForTransfer();
    const from = this.transferFromWarehouse();
    if (!prod || !from) return;
    const tracking = this.transferTracking();
    if (tracking === 'lot') {
      this.transferTrackingLoading.set(true);
      this.inventoryService.getProductLots(prod.id, from).subscribe({
        next: (lots) => { this.transferLots.set((lots || []).filter(l => l.quantity > 0)); this.transferTrackingLoading.set(false); },
        error: () => this.transferTrackingLoading.set(false)
      });
    } else if (tracking === 'serial') {
      this.transferQuantity.set(0);
      this.transferTrackingLoading.set(true);
      this.inventoryService.getProductSerials(prod.id, 'in_stock', from).subscribe({
        next: (serials) => { this.transferSerials.set(serials || []); this.transferTrackingLoading.set(false); },
        error: () => this.transferTrackingLoading.set(false)
      });
    }
  }

  private resetTransferTracking() {
    this.transferLots.set([]);
    this.transferSerials.set([]);
    this.transferLotId.set('');
    this.transferSerialSel.set(new Set());
  }

  toggleTransferSerial(serial: string) {
    const next = new Set(this.transferSerialSel());
    if (next.has(serial)) next.delete(serial); else next.add(serial);
    this.transferSerialSel.set(next);
    this.transferQuantity.set(next.size);
  }

  isTransferValid(): boolean {
    const qty = Number(this.transferQuantity());
    return !!this.transferFromWarehouse() &&
           !!this.transferToWarehouse() &&
           this.transferFromWarehouse() !== this.transferToWarehouse() &&
           qty > 0 &&
           qty <= this.maxTransferQuantity() &&
           !this.transferValidationError();
  }

  openTransferModal(product: Product) {
    this.selectedProductForTransfer.set(product);
    this.transferFromWarehouse.set('');
    this.transferToWarehouse.set('');
    this.transferQuantity.set(1);
    this.transferNote.set('');
    this.transferError.set(null);
    this.resetTransferTracking();
    if (this.allWarehouses().length === 0) this.loadWarehouses();
    this.isTransferModalOpen.set(true);
  }

  closeTransferModal() {
    this.isTransferModalOpen.set(false);
    this.selectedProductForTransfer.set(null);
    this.transferFromWarehouse.set('');
    this.transferToWarehouse.set('');
    this.transferQuantity.set(1);
    this.transferError.set(null);
  }

  executeTransfer() {
    const prod = this.selectedProductForTransfer();
    if (!prod || !this.isTransferValid()) return;

    this.isTransferLoading.set(true);
    this.transferError.set(null);

    this.inventoryService.transferWarehouseStock(
      prod.id,
      this.transferFromWarehouse(),
      this.transferToWarehouse(),
      Number(this.transferQuantity()),
      this.transferNote().trim() || undefined,
      this.transferTracking() === 'lot' && this.transferLotId() ? this.transferLotId() : undefined,
      this.transferTracking() === 'serial' ? [...this.transferSerialSel()] : undefined
    ).subscribe({
      next: (updated) => {
        this.isTransferLoading.set(false);
        if (updated && updated.id) {
          this.state.products.update(list => list.map(p => p.id === updated.id ? updated : p));
          this.ui.showToast(this.i18n.t('products.toast.transferDone'), 'success');
          this.closeTransferModal();
        } else {
          this.transferError.set(this.i18n.t('products.toast.transferFailed'));
        }
      },
      error: (err) => {
        this.isTransferLoading.set(false);
        this.transferError.set(err.error?.message || this.i18n.t('products.toast.transferError'));
      }
    });
  }
}
