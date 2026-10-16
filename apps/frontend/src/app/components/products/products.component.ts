import { Component, inject, signal, computed, HostListener, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, FormGroup, AbstractControl } from '@angular/forms';
import { checkCategoryRules, INVENTORY_CLASSES, isValidGtin, REGULATORY_CATEGORIES, restrictedGs1Prefix } from '@stok/tr-compliance';
import { AccountingService } from '../../services/accounting.service';
import { EBelgeService } from '../../services/ebelge.service';
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
import { tap, timeout, retry, finalize } from 'rxjs';
import { TaxService } from '../../services/tax.service';
import { ExemptionCode, OtvCode, WithholdingCode } from '../../models/tax.models';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe, QuantityInputDirective, IconComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
.pr-hdr-more { position: relative; }
.pr-hdr-pop { right: 0; top: calc(100% + 6px); width: 232px; }
.pr-toolbar { margin-bottom: 12px; }
.pr-search { width: 300px; }
.pr-cat { width: 196px; }
.pr-sort { position: relative; }
.pr-sort-pop { right: 0; top: calc(100% + 6px); width: 208px; }
.pr-sort .btn .lbl { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.pr-view button { padding: 0 8px; }
.pr-kpis { margin-bottom: 20px; }
.pr-kpis .distbar { margin-top: -2px; }
.pr-kpis .kpi-val b.is-warn { color: var(--warning); }
.pr-kpis .kpi-val b.is-danger { color: var(--danger); }
.pr-kpis .kpi.is-danger .kpi-top { color: var(--danger); }
.pr-kpis .kpi-foot { flex-wrap: wrap; white-space: normal; row-gap: 2px; }
.pr-kpis .kpi-foot > span:not(.delta) { overflow: visible; text-overflow: clip; }
.pr-cat-pending { display: inline-block; width: 72px; max-width: 100%; vertical-align: middle; }
.field.select { padding: 0; }
.pr-table .pr-name-cell { max-width: 340px; }
.pr-table td.pr-cat-cell { max-width: 160px; }
.pr-name { color: var(--fg); font-weight: 500; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pr-name:hover { color: var(--accent-text); text-decoration: underline; text-underline-offset: 2px; }
.cell-prod .thumb { overflow: hidden; }
.cell-prod .thumb img, .pr-thumb img, .mrow .thumb img { width: 100%; height: 100%; object-fit: cover; }
.cell-prod .cell-code { margin-left: 0; flex: none; }
.cell-prod .badge { flex: none; margin-left: 0; }
.pr-table tr.is-highlighted td { box-shadow: inset 0 1px 0 var(--accent), inset 0 -1px 0 var(--accent); background: var(--accent-soft); }
.pr-table td.pr-stock-cell { position: relative; overflow: visible; }
.pr-stock-qty .u { color: var(--fg-3); margin-left: 3px; }
.pr-stock-sub { display: block; font-size: var(--text-2xs); color: var(--fg-3); line-height: 14px; }
.pr-stock-cell .cell-stock .meter { width: 36px; }
.pr-rating { display: inline-flex; align-items: center; gap: 4px; color: var(--fg-2); }
.pr-rating svg { width: 12px; height: 12px; color: var(--fg-3); }
.tbl .w-act.pr-acts { width: 1%; white-space: nowrap; overflow: visible; padding: 0 8px; }
.pr-acts .row-act { vertical-align: middle; }
.warehouse-tooltip { position: absolute; z-index: var(--z-dropdown); top: calc(100% - 6px); right: 12px; min-width: 200px; text-align: left; background: var(--pop-bg); border-radius: var(--radius-md); padding: 6px 10px 8px; box-shadow: var(--shadow-pop); }
.wh-tooltip-title { font-size: var(--text-xs); font-weight: 500; color: var(--fg-3); padding: 2px 0 6px; margin-bottom: 4px; box-shadow: inset 0 -1px 0 var(--line); }
.wh-tooltip-row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; font-size: var(--text-xs); color: var(--fg); }
.wh-tooltip-row strong { font-weight: 500; font-variant-numeric: tabular-nums; }
.pr-mlist .mrow { grid-template-columns: auto minmax(0, 1fr) auto auto; position: relative; }
.pr-mlist .mrow .thumb { grid-column: 1; grid-row: 1 / span 2; overflow: hidden; }
.pr-mlist .mrow b { grid-column: 2; grid-row: 1; cursor: pointer; }
.pr-mlist .mrow .v { grid-column: 3; grid-row: 1; white-space: nowrap; }
.pr-mlist .mrow .v .u { color: var(--fg-3); font-weight: 400; margin-left: 3px; }
.pr-mlist .mrow .s { grid-column: 2; grid-row: 2; }
.pr-mlist .mrow .s.r { grid-column: 3; grid-row: 2; }
.pr-mlist .mrow .pr-mmore { grid-column: 4; grid-row: 1 / span 2; margin-right: -6px; }
.pr-mlist .mrow.is-highlighted { background: var(--accent-soft); }
.pr-rowpop { right: 8px; top: calc(100% - 8px); width: 220px; }
.pr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(264px, 1fr)); gap: 12px; }
.pr-card { gap: 14px; }
.pr-card.is-selected { box-shadow: 0 0 0 1px var(--accent-line), var(--shadow-card); background: var(--accent-soft); }
.pr-card.is-highlighted { box-shadow: var(--focus-ring-field), var(--shadow-card); }
.pr-card-top { display: flex; justify-content: space-between; align-items: center; }
.pr-card-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pr-card-id > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pr-thumb { width: 44px; height: 44px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-md); background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--line); color: var(--fg-3); }
.pr-card-meta { display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--fg-3); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin: 0; padding-top: 12px; box-shadow: inset 0 1px 0 var(--line); }
.pr-card-stats dt { font-size: var(--text-xs); color: var(--fg-3); }
.pr-card-stats dd { margin: 2px 0 0; font-weight: 500; color: var(--fg); font-variant-numeric: tabular-nums; }
.pr-card-actions { display: flex; align-items: center; gap: 6px; margin-top: auto; }
.pr-card-actions .spacer { flex: 1; }
.pr-foot-card { margin-top: 12px; }
.pr-foot .pr-range { color: var(--fg); font-weight: 500; }
.pr-foot .pr-pp { width: 72px; }
.pr-foot .pr-pages { display: flex; align-items: center; gap: 4px; }
.pr-empty-card { padding: 0; }
.pr-form { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.pr-form .drawer-body { gap: 0; padding-top: 0; }
.pr-bc-row { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 14px; align-items: start; }
.pr-bc-prev { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.pr-bc-prev .cap { font-size: var(--text-xs); color: var(--fg-3); }
.pr-bc-prev .svg { max-width: 100%; overflow: hidden; }
.pr-csel { position: relative; }
.pr-csel .field { cursor: pointer; }
.pr-csel-pop { left: 0; right: 0; top: calc(100% + 4px); max-height: 240px; overflow-y: auto; z-index: 2000; }
.pr-subblock { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.pr-subblock-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pr-subblock-h b { font-size: var(--text-sm); font-weight: 500; }
.pr-alt-row { display: grid; grid-template-columns: minmax(0, 1.2fr) 88px minmax(0, 1.4fr) auto; gap: 6px; align-items: center; }
.pr-alt-eq { font-size: var(--text-xs); color: var(--fg-3); margin-top: -4px; }
.pr-check-cell { display: flex; align-items: center; min-height: var(--h-md); padding-top: 18px; }
.pr-lots { width: 100%; }
.pr-lots td, .pr-lots th { padding-left: 8px; padding-right: 8px; }
.pr-serials { display: flex; flex-wrap: wrap; gap: 4px; max-height: 160px; overflow-y: auto; }
.pr-lbl-list { display: flex; flex-direction: column; border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); max-height: 340px; overflow-y: auto; }
.pr-lbl-item { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 8px 12px; box-shadow: inset 0 -1px 0 var(--line); font-size: var(--text-sm); }
.pr-lbl-item:last-child { box-shadow: none; }
.pr-lbl-item b { font-weight: 500; }
.pr-lbl-item .fld-help { flex-basis: 100%; color: var(--warning); }
.pr-xfer-prod { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.pr-xfer-prod > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pr-xfer-prod b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-xfer-prod .cap { font-size: var(--text-xs); color: var(--fg-3); }
.pr-xfer-prod .pr-thumb { width: 36px; height: 36px; }
.pr-xfer-prod .cell-code { margin-left: auto; }
.pr-serial-list { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--ring); background: var(--surface); }
.pr-serial-list .mono { font-size: var(--text-xs); }
.pr-hidden { display: none; }
@media (max-width: 1500px) {
  .pr-table .pr-col-rating { display: none; }
}
@media (max-width: 900px) {
  .pr-search { flex: 1 1 220px; width: auto; }
}
@media (max-width: 640px) {
  .pr-toolbar { gap: 8px; }
  .pr-search { flex: 1 1 100%; }
  .pr-toolbar .pr-status { flex: 1 1 100%; max-width: 100%; overflow-x: auto; }
  .pr-cat { flex: 1 1 0; width: auto; min-width: 0; }
  .pr-sort .btn .lbl { display: none; }
  .pr-toolbar > .spacer { display: none; }
  .pr-foot .pr-pp-label, .pr-foot .pr-pages .page-btn { display: none; }
  .pr-bc-row { grid-template-columns: minmax(0, 1fr); }
  .pr-alt-row { grid-template-columns: minmax(0, 1fr) 72px auto; }
  .pr-alt-row .pr-alt-bc { grid-column: 1 / span 2; }
  .pr-grid { grid-template-columns: minmax(0, 1fr); }
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
        <button type="button" class="btn d-only" (click)="fileInput.click()">
          <app-icon name="upload" />{{ 'products.import' | t }}
        </button>
        <input type="file" #fileInput accept=".csv" class="pr-hidden" (change)="importFromCSV($event)" />
        <span class="pr-hdr-more" (click)="$event.stopPropagation()">
          <button type="button" class="btn btn-icon" [class.is-active]="isMoreMenuOpen()" [attr.aria-label]="'products.ui.more' | t" aria-haspopup="menu" [attr.aria-expanded]="isMoreMenuOpen()" (click)="isMoreMenuOpen.update(v => !v); isSortDropdownOpen.set(false)">
            <app-icon name="more" />
          </button>
          @if (isMoreMenuOpen()) {
            <div class="pop pr-hdr-pop" role="menu">
              <button type="button" class="menu-i m-only" role="menuitem" (click)="isMoreMenuOpen.set(false); fileInput.click()"><app-icon name="upload" />{{ 'products.import' | t }}</button>
              <button type="button" class="menu-i" role="menuitem" (click)="isMoreMenuOpen.set(false); exportToCSV()"><app-icon name="download" />{{ 'products.export' | t }}<span class="meta">.csv</span></button>
              <button type="button" class="menu-i" role="menuitem" (click)="isMoreMenuOpen.set(false); printProducts()"><app-icon name="printer" />{{ 'products.printAction' | t }}</button>
              <button type="button" class="menu-i" role="menuitem" (click)="isMoreMenuOpen.set(false); openScanner()"><app-icon name="scan" />{{ 'products.scanBarcode' | t }}</button>
              <div class="menu-sep"></div>
              <button type="button" class="menu-i" role="menuitemcheckbox" [attr.aria-checked]="showStats()" (click)="isMoreMenuOpen.set(false); toggleStats()">
                <app-icon [name]="showStats() ? 'eyeoff' : 'eye'" />{{ (showStats() ? 'products.ui.hideStats' : 'products.ui.showStats') | t }}
              </button>
            </div>
          }
        </span>
        <button type="button" class="btn btn-primary" (click)="openAddProduct()">
          <app-icon name="plus" /><span class="d-only">{{ 'products.ui.new' | t }}</span><span class="m-only">{{ 'products.ui.newShort' | t }}</span><kbd>N</kbd>
        </button>
      </div>
    </div>

    @if (showStats()) {
      <div class="kpi-grid pr-kpis">
        <div class="kpi">
          <div class="kpi-top"><app-icon name="box" size="sm" />{{ 'products.stats.totalProducts' | t }}</div>
          <div class="kpi-val"><b>{{ state.products().length | num }}</b></div>
          @if (state.products().length > 0) {
            <div class="distbar" aria-hidden="true">
              <i class="ok" [style.width.%]="(state.products().length - state.lowStockCount() - state.outOfStockCount()) / state.products().length * 100"></i>
              <i class="warn" [style.width.%]="state.lowStockCount() / state.products().length * 100"></i>
              <i class="danger" [style.width.%]="state.outOfStockCount() / state.products().length * 100"></i>
            </div>
          }
          <div class="kpi-foot">
            @if (newProductCount() > 0) { <span class="delta up"><app-icon name="up" size="xs" />{{ 'products.stats.newCount' | t: { count: newProductCount() } }}</span> }
            <span>{{ 'products.stats.last30Days' | t }}</span>
          </div>
        </div>
        <div class="kpi">
          <div class="kpi-top"><app-icon name="chart" size="sm" />{{ 'products.stats.totalValue' | t }}</div>
          <div class="kpi-val"><b>{{ totalValue().amount | money: totalValue().currency : 0 }}</b></div>
          <div class="kpi-foot">
            @if (totalValue().unconverted.length) {
              <span class="delta down"><app-icon name="warn" size="xs" /></span><span>{{ 'products.stats.unconverted' | t: { list: totalValue().unconverted.join(', ') } }}</span>
            } @else {
              <span>{{ 'products.stats.inBaseCurrency' | t: { currency: totalValue().currency } }}</span>
            }
          </div>
        </div>
        <button type="button" class="kpi" [class.is-alert]="state.lowStockCount() > 0" (click)="productFilterStatus.set('Low stock')">
          <div class="kpi-top"><app-icon name="warn" size="sm" />{{ 'products.stats.criticalStock' | t }}<app-icon class="go" name="arrowur" size="sm" /></div>
          <div class="kpi-val"><b [class.is-warn]="state.lowStockCount() > 0">{{ state.lowStockCount() | num }}</b></div>
          <div class="kpi-foot"><span>{{ 'products.stats.criticalMeta' | t }}</span></div>
        </button>
        <button type="button" class="kpi" [class.is-danger]="state.outOfStockCount() > 0" (click)="productFilterStatus.set('Out of stock')">
          <div class="kpi-top"><app-icon name="alert" size="sm" />{{ 'products.stats.outOfStock' | t }}<app-icon class="go" name="arrowur" size="sm" /></div>
          <div class="kpi-val"><b [class.is-danger]="state.outOfStockCount() > 0">{{ state.outOfStockCount() | num }}</b></div>
          <div class="kpi-foot"><span>{{ 'products.stats.outMeta' | t }}</span></div>
        </button>
      </div>
    }

    <div class="toolbar pr-toolbar">
      <div class="field pr-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [attr.aria-label]="'common.search' | t" [placeholder]="'products.ui.searchPlaceholder' | t" [value]="productSearch()" (input)="onSearchInput($event)" />
        <span class="trail">
          <button type="button" class="inner-btn" (click)="openScanner()" [attr.aria-label]="'products.scanBarcode' | t" [attr.data-tip]="'products.scanBarcode' | t"><app-icon name="scan" size="sm" /></button>
          <kbd>/</kbd>
        </span>
      </div>
      <div class="seg pr-status" role="group" [attr.aria-label]="'products.filters.stockStatus' | t">
        <button type="button" [attr.aria-pressed]="productFilterStatus() === 'all'" (click)="productFilterStatus.set('all')">{{ 'products.status.all' | t }} <span class="count">{{ state.products().length | num }}</span></button>
        <button type="button" [attr.aria-pressed]="productFilterStatus() === 'In stock'" (click)="productFilterStatus.set('In stock')">{{ 'products.status.inStock' | t }} <span class="count">{{ (state.products().length - state.lowStockCount() - state.outOfStockCount()) | num }}</span></button>
        <button type="button" [attr.aria-pressed]="productFilterStatus() === 'Low stock'" (click)="productFilterStatus.set('Low stock')">{{ 'products.status.lowStock' | t }} <span class="count">{{ state.lowStockCount() | num }}</span></button>
        <button type="button" [attr.aria-pressed]="productFilterStatus() === 'Out of stock'" (click)="productFilterStatus.set('Out of stock')">{{ 'products.status.outOfStock' | t }} <span class="count">{{ state.outOfStockCount() | num }}</span></button>
      </div>
      <div class="field select pr-cat">
        <select [attr.aria-label]="'products.filters.categories' | t" [ngModel]="activeCategory()" (ngModelChange)="productSearch.set($event || '')">
          <option value="">{{ 'products.filters.allCategories' | t }}</option>
          @for (cat of categories(); track cat.id) { <option [value]="cat.name">{{ cat.name }}</option> }
        </select>
      </div>
      @if (selectedWarehouseFilter()) {
        <span class="chip-filter">
          <span><app-icon name="warehouse" size="xs" /><span class="k">{{ 'products.lots.warehouse' | t }}</span></span>
          <span><span class="op">=</span> <span class="v">{{ selectedWarehouseFilter() }}</span></span>
          <button type="button" class="x" (click)="clearWarehouseFilter()" [attr.aria-label]="'common.clear' | t"><app-icon name="x" size="xs" /></button>
        </span>
      }
      <span class="spacer"></span>
      <div class="pr-sort" (click)="$event.stopPropagation()">
        <button type="button" class="btn btn-ghost" [class.is-active]="isSortDropdownOpen()" aria-haspopup="menu" [attr.aria-expanded]="isSortDropdownOpen()" [attr.aria-label]="'products.ui.sort' | t" (click)="isSortDropdownOpen.update(v => !v); isMoreMenuOpen.set(false)">
          <app-icon name="sort" /><span class="lbl">{{ ('products.sort.' + productSortOption()) | t }}</span><app-icon name="chevd" size="sm" />
        </button>
        @if (isSortDropdownOpen()) {
          <div class="pop pr-sort-pop" role="menu">
            <div class="menu-label">{{ 'products.ui.sort' | t }}</div>
            @for (opt of ['default', 'stock-desc', 'stock-asc', 'price-asc', 'price-desc', 'name-asc']; track opt) {
              <button type="button" class="menu-i" role="menuitemradio" [attr.aria-checked]="productSortOption() === opt" [class.is-active]="productSortOption() === opt" (click)="productSortOption.set(opt); isSortDropdownOpen.set(false)">
                {{ ('products.sort.' + opt) | t }}
                @if (productSortOption() === opt) { <span class="meta"><app-icon name="check" size="sm" /></span> }
              </button>
            }
          </div>
        }
      </div>
      <div class="seg pr-view" role="group" [attr.aria-label]="'products.ui.view' | t">
        <button type="button" [attr.aria-pressed]="isTableView()" [attr.aria-label]="'products.view.table' | t" [attr.data-tip]="'products.view.table' | t" (click)="isTableView.set(true)"><app-icon name="rows" size="sm" /></button>
        <button type="button" [attr.aria-pressed]="!isTableView()" [attr.aria-label]="'products.view.card' | t" [attr.data-tip]="'products.view.card' | t" (click)="isTableView.set(false)"><app-icon name="columns" size="sm" /></button>
      </div>
    </div>

    <ng-template #pager>
      <div class="tbl-foot pr-foot">
        <span><span class="pr-range">{{ (currentPage() - 1) * itemsPerPage() + 1 }}–{{ Math.min(currentPage() * itemsPerPage(), filteredProducts().length) }}</span> / {{ 'products.pagination.showing' | t: { count: filteredProducts().length } }}</span>
        <span class="spacer"></span>
        <span class="pr-pp-label">{{ 'products.pagination.perPage' | t }}</span>
        <div class="field field-sm select pr-pp">
          <select [attr.aria-label]="'products.pagination.perPage' | t" [ngModel]="itemsPerPage()" (ngModelChange)="itemsPerPage.set(+$event); currentPage.set(1)">
            <option [ngValue]="10">10</option>
            <option [ngValue]="25">25</option>
            <option [ngValue]="50">50</option>
          </select>
        </div>
        <div class="pr-pages">
          <button type="button" class="btn btn-sm btn-icon" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)" [attr.aria-label]="'products.ui.prev' | t"><app-icon name="chevl" size="sm" /></button>
          @for (pNum of getPagesArray(); track pNum) {
            <button type="button" class="page-btn" [class.active]="currentPage() === pNum" [attr.aria-current]="currentPage() === pNum ? 'page' : null" (click)="goToPage(pNum)">{{ pNum }}</button>
          }
          <button type="button" class="btn btn-sm btn-icon" [disabled]="currentPage() === totalPages()" (click)="goToPage(currentPage() + 1)" [attr.aria-label]="'products.ui.next' | t"><app-icon name="chevr" size="sm" /></button>
        </div>
      </div>
    </ng-template>

    @if (filteredProducts().length === 0) {
      <div class="card pr-empty-card">
        <div class="empty-state">
          <div class="empty-art"><app-icon name="box" /></div>
          <h3>{{ 'products.empty.title' | t }}</h3>
          <p>{{ 'products.empty.body' | t }}</p>
          <div class="cluster actions">
            @if (productSearch() || productFilterStatus() !== 'all' || selectedWarehouseFilter()) {
              <button type="button" class="btn" (click)="productSearch.set(''); productFilterStatus.set('all'); selectedWarehouseFilter() ? clearWarehouseFilter() : null">{{ 'products.empty.clear' | t }}</button>
            }
            <button type="button" class="btn btn-primary" (click)="openAddProduct()"><app-icon name="plus" />{{ 'products.ui.new' | t }}</button>
          </div>
        </div>
      </div>
    } @else if (isTableView()) {
      <div class="table-card d-only">
        <div class="table-scroll">
          <table class="tbl pr-table">
            <thead>
              <tr>
                <th class="w-check"><input type="checkbox" [checked]="isAllSelected()" [indeterminate]="selectedProductIds().length > 0 && !isAllSelected()" (change)="toggleSelectAll()" [attr.aria-label]="'products.selectAll' | t" /></th>
                <th>{{ 'products.col.product' | t }}</th>
                <th>{{ 'products.form.category' | t }}</th>
                <th class="r">{{ 'products.col.price' | t }}</th>
                <th class="r">{{ 'products.col.sales' | t }}</th>
                <th class="r">{{ 'products.col.revenue' | t }}</th>
                <th class="r">{{ 'products.col.stock' | t }}</th>
                <th>{{ 'products.col.status' | t }}</th>
                <th class="r pr-col-rating">{{ 'products.col.rating' | t }}</th>
                <th class="w-act pr-acts"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (p of paginatedProducts(); track p.id) {
                <tr [class.is-selected]="isProductSelected(p.id)" [class.is-highlighted]="highlightedProductId() === p.id">
                  <td class="w-check"><input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" [attr.aria-label]="('products.col.select' | t) + ': ' + p.name" /></td>
                  <td class="pr-name-cell">
                    <div class="cell-prod">
                      <span class="thumb">
                        @if (p.imageUrl) { <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" /> } @else { <app-icon name="box" size="sm" /> }
                      </span>
                      <a href="#" class="pr-name" [title]="p.barcode ? p.name + ' · ' + p.barcode : p.name" (click)="$event.preventDefault(); openEditProduct(p)">{{ p.name }}</a>
                      <span class="cell-code">{{ p.sku }}</span>
                      @if (isTracked(p)) { <span class="badge badge-neutral">{{ trackingBadgeLabel(p) }}</span> }
                    </div>
                  </td>
                  <td class="sec pr-cat-cell">@if (categoriesLoaded()) { {{ getCategoryName(p.category) }} } @else { <span class="skeleton-text pr-cat-pending" aria-hidden="true"></span> }</td>
                  <td class="r">{{ p.price | money: p.currency }}</td>
                  <td class="r sec">{{ getMockSales(p) | num }}</td>
                  <td class="r">{{ getMockRevenue(p) | money: p.currency : 0 }}</td>
                  <td class="r pr-stock-cell" (mouseenter)="hoveredProductId.set(p.id)" (mouseleave)="hoveredProductId.set(null)">
                    <span class="cell-stock">
                      <span class="pr-stock-qty">{{ p.quantity | num }}<span class="u">{{ productUnitLabel(p) }}</span></span>
                      <span class="meter" [class.warn]="p.status === 'Low stock'" [class.danger]="p.status === 'Out of stock'" [class.ok]="p.status === 'In stock'"><i [style.width.%]="p.status === 'Out of stock' ? 0 : Math.min(100, (p.quantity / ((p.minQuantity || 1) * 2)) * 100)"></i></span>
                    </span>
                    @if (sellableQuantity(p) !== null && sellableQuantity(p) !== p.quantity) {
                      <span class="pr-stock-sub" [title]="'products.availableHint' | t">{{ 'products.available' | t: { qty: (sellableQuantity(p) | num) } }}</span>
                    }
                    @if (p.reservedQuantity) {
                      <span class="pr-stock-sub" [title]="'products.reservedHint' | t">{{ 'products.reservedFree' | t: { reserved: (p.reservedQuantity | num), free: (freeQuantity(p) | num) } }}</span>
                    }
                    @if (p.warehouses && hoveredProductId() === p.id) {
                      <div class="warehouse-tooltip">
                        <div class="wh-tooltip-title">{{ 'products.warehouseDistribution' | t }}</div>
                        @for (wh of getWarehouseEntries(p.warehouses); track wh.name) {
                          <div class="wh-tooltip-row"><span>{{ wh.name }}</span><strong>{{ wh.qty | num }}</strong></div>
                        }
                      </div>
                    }
                  </td>
                  <td>
                    <span class="badge" [class.badge-success]="p.status === 'In stock'" [class.badge-warning]="p.status === 'Low stock'" [class.badge-danger]="p.status === 'Out of stock'"><span class="dot"></span>{{ statusLabel(p.status) }}</span>
                  </td>
                  <td class="r pr-col-rating">
                    <span class="pr-rating"><svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 0 0 .95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 0 0-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 0 0-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 0 0-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 0 0 .95-.69l1.07-3.29z"/></svg>{{ getMockRatingValue(p) | num }}</span>
                  </td>
                  <td class="w-act pr-acts">
                    <button type="button" class="icon-btn row-act" (click)="openLabelModal([p])" [attr.aria-label]="'products.label.print' | t" [attr.data-tip]="'products.label.print' | t"><app-icon name="barcode" /></button>
                    <button type="button" class="icon-btn row-act" (click)="openTransferModal(p)" [attr.aria-label]="'products.warehouseTransfer' | t" [attr.data-tip]="'products.warehouseTransfer' | t"><app-icon name="swap" /></button>
                    <button type="button" class="edit-btn row-act" (click)="openEditProduct(p)" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t"><app-icon name="edit" /></button>
                    <button type="button" class="delete-btn row-act" (click)="promptDeleteProduct(p)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ng-container *ngTemplateOutlet="pager" />
      </div>

      <div class="mlist pr-mlist m-only">
        @for (p of paginatedProducts(); track p.id) {
          <div class="mrow" [class.is-selected]="isProductSelected(p.id)" [class.is-highlighted]="highlightedProductId() === p.id">
            <span class="thumb">
              @if (p.imageUrl) { <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" /> } @else { <app-icon name="box" size="sm" /> }
            </span>
            <b role="button" tabindex="0" (click)="openEditProduct(p)" (keydown.enter)="openEditProduct(p)">{{ p.name }}</b>
            <span class="v">{{ p.quantity | num }}<span class="u">{{ productUnitLabel(p) }}</span></span>
            <span class="pr-mmore" (click)="$event.stopPropagation()">
              <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'products.ui.rowActions' | t" aria-haspopup="menu" [attr.aria-expanded]="rowMenuId() === p.id" (click)="rowMenuId.set(rowMenuId() === p.id ? null : p.id)"><app-icon name="more" /></button>
            </span>
            <span class="s"><span class="mono">{{ p.sku }}</span> · {{ p.price | money: p.currency }}</span>
            <span class="s r"><span class="badge" [class.badge-success]="p.status === 'In stock'" [class.badge-warning]="p.status === 'Low stock'" [class.badge-danger]="p.status === 'Out of stock'"><span class="dot"></span>{{ statusLabel(p.status) }}</span></span>
            @if (rowMenuId() === p.id) {
              <div class="pop pr-rowpop" role="menu" (click)="$event.stopPropagation()">
                <button type="button" class="menu-i" role="menuitem" (click)="rowMenuId.set(null); openEditProduct(p)"><app-icon name="edit" />{{ 'common.edit' | t }}</button>
                <button type="button" class="menu-i" role="menuitem" (click)="rowMenuId.set(null); openTransferModal(p)"><app-icon name="swap" />{{ 'products.warehouseTransfer' | t }}</button>
                <button type="button" class="menu-i" role="menuitem" (click)="rowMenuId.set(null); openLabelModal([p])"><app-icon name="barcode" />{{ 'products.label.print' | t }}</button>
                <button type="button" class="menu-i" role="menuitemcheckbox" [attr.aria-checked]="isProductSelected(p.id)" (click)="rowMenuId.set(null); toggleSelectProduct(p.id)"><app-icon [name]="isProductSelected(p.id) ? 'x' : 'check'" />{{ (isProductSelected(p.id) ? 'products.ui.deselect' : 'products.col.select') | t }}</button>
                <div class="menu-sep"></div>
                <button type="button" class="menu-i danger" role="menuitem" (click)="rowMenuId.set(null); promptDeleteProduct(p)"><app-icon name="trash" />{{ 'common.delete' | t }}</button>
              </div>
            }
          </div>
        }
        <ng-container *ngTemplateOutlet="pager" />
      </div>
    } @else {
      <div class="pr-grid">
        @for (p of paginatedProducts(); track p.id) {
          <div class="card pr-card" [class.is-selected]="isProductSelected(p.id)" [class.is-highlighted]="highlightedProductId() === p.id">
            <div class="pr-card-top">
              <input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" [attr.aria-label]="('products.col.select' | t) + ': ' + p.name" />
              <span class="badge" [class.badge-success]="p.status === 'In stock'" [class.badge-warning]="p.status === 'Low stock'" [class.badge-danger]="p.status === 'Out of stock'"><span class="dot"></span>{{ statusLabel(p.status) }}</span>
            </div>
            <div class="pr-card-id">
              <span class="pr-thumb">
                @if (p.imageUrl) { <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" /> } @else { <app-icon name="box" /> }
              </span>
              <div>
                <a href="#" class="pr-name" (click)="$event.preventDefault(); openEditProduct(p)">{{ p.name }}</a>
                <span class="pr-card-meta"><span class="mono">{{ p.sku }}</span>·@if (categoriesLoaded()) { <span>{{ getCategoryName(p.category) }}</span> } @else { <span class="skeleton-text pr-cat-pending" aria-hidden="true"></span> }@if (isTracked(p)) { <span class="badge badge-neutral">{{ trackingBadgeLabel(p) }}</span> }</span>
              </div>
            </div>
            <dl class="pr-card-stats">
              <div><dt>{{ 'products.card.unitPrice' | t }}</dt><dd>{{ p.price | money: p.currency }}</dd></div>
              <div><dt>{{ 'products.card.currentStock' | t }}</dt><dd>{{ p.quantity | num }} <span class="muted">{{ productUnitLabel(p) }}</span></dd></div>
              <div><dt>{{ 'products.card.salesQty' | t }}</dt><dd>{{ getMockSales(p) | num }}</dd></div>
              <div><dt>{{ 'products.card.totalRevenue' | t }}</dt><dd>{{ getMockRevenue(p) | money: p.currency : 0 }}</dd></div>
            </dl>
            <div class="pr-card-actions">
              <button type="button" class="btn btn-sm" (click)="openEditProduct(p)"><app-icon name="edit" />{{ 'common.edit' | t }}</button>
              <button type="button" class="btn btn-sm" (click)="openTransferModal(p)"><app-icon name="swap" />{{ 'products.transfer' | t }}</button>
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="openLabelModal([p])" [attr.aria-label]="'products.label.print' | t" [attr.data-tip]="'products.label.print' | t"><app-icon name="barcode" /></button>
              <button type="button" class="btn btn-danger-ghost btn-sm btn-icon" (click)="promptDeleteProduct(p)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" /></button>
            </div>
          </div>
        }
      </div>
      <div class="table-card pr-foot-card">
        <ng-container *ngTemplateOutlet="pager" />
      </div>
    }

    <!-- ─── Product Drawer ─── -->
    @if (showProductFormModal()) {
      <div class="drawer-overlay" (click)="closeProductForm()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" aria-labelledby="prDrawerTitle" (click)="$event.stopPropagation(); closeDropdowns()">
          <div class="drawer-header">
            <span class="drawer-title" id="prDrawerTitle">{{ (editingProductId() ? 'products.form.editTitle' : 'products.addNew') | t }}</span>
            <div class="drawer-tools">
              @if (editingProductId() && ui.userProfile()?.role === 'admin') {
                <button type="button" class="btn btn-ghost btn-sm" (click)="router.navigate(['/audit-log'], { queryParams: { entityType: 'products', entityId: editingProductId() } })"><app-icon name="audit" />{{ 'auditLog.history' | t }}</button>
              }
              <button type="button" class="drawer-close" (click)="closeProductForm()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </div>

          <form [formGroup]="productForm" (ngSubmit)="saveProduct()" class="pr-form">
            <div class="drawer-body">
              <!-- 1 · Basics -->
              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'products.form.sec.basic' | t }}</h3><p>{{ 'products.form.sec.basicHint' | t }}</p></div>
                <div class="fld">
                  <label class="fld-label" for="productName">{{ 'products.form.name' | t }} <span class="req">*</span></label>
                  <div class="field"><input id="productName" type="text" formControlName="name" [attr.aria-invalid]="isFieldInvalid('name')" [disabled]="isSaveLoading()" /></div>
                  @if (isFieldInvalid('name')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.nameMin' | t }}</div> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="productSku">SKU <span class="req">*</span></label>
                  <div class="field"><input id="productSku" type="text" class="mono" formControlName="sku" [attr.aria-invalid]="isFieldInvalid('sku')" [disabled]="isSaveLoading()" /></div>
                  @if (isFieldInvalid('sku')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.required' | t }}</div> }
                </div>
                <div class="pr-bc-row">
                  <div class="fld">
                    <label class="fld-label" for="productBarcode">{{ 'products.barcode.label' | t }}</label>
                    <div class="field">
                      <span class="lead"><app-icon name="barcode" size="sm" /></span>
                      <input id="productBarcode" type="text" class="mono" formControlName="barcode" autocomplete="off" />
                      <span class="trail"><button type="button" class="inner-btn" (click)="generateEan13()">{{ 'products.barcode.generate' | t }}</button></span>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productBarcodeType">{{ 'products.barcode.type' | t }}</label>
                    <div class="field select">
                      <select id="productBarcodeType" formControlName="barcodeType">
                        <option value="">{{ 'products.barcode.auto' | t }}</option>
                        @for (bt of barcodeTypes; track bt) { <option [value]="bt">{{ bt }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                @if (barcodeHint(); as hint) {
                  @if (hint.ok) { <div class="fld-ok"><app-icon name="check" size="sm" />{{ hint.key | t }}</div> }
                  @else { <div class="fld-error"><app-icon name="alert" size="sm" />{{ hint.key | t }}</div> }
                }
                @if (barcodePreview(); as svg) {
                  <div class="pr-bc-prev">
                    <span class="cap">{{ 'products.form.visualBarcode' | t }}</span>
                    <div class="svg" [innerHTML]="svg"></div>
                  </div>
                }
                <div class="grid-2">
                  <div class="fld">
                    <span class="fld-label">{{ 'products.form.category' | t }}</span>
                    <div class="pr-csel" (click)="toggleCategoryDropdown($event)">
                      <div class="field select" [class.is-disabled]="isSaveLoading()" role="button" tabindex="0" aria-haspopup="listbox" [attr.aria-expanded]="isCategoryDropdownOpen()">
                        <span class="val">{{ getCategoryName(productForm.get('category')?.value) }}</span>
                      </div>
                      @if (isCategoryDropdownOpen()) {
                        <div class="pop pr-csel-pop" role="listbox">
                          @for (cat of categories(); track cat.slug) {
                            <button type="button" class="menu-i" role="option" [class.is-active]="productForm.get('category')?.value === cat.slug" [attr.aria-selected]="productForm.get('category')?.value === cat.slug" (click)="selectCategory(cat.slug); $event.stopPropagation()">{{ cat.name }}</button>
                          }
                        </div>
                      }
                    </div>
                  </div>
                  <div class="fld">
                    <span class="fld-label">{{ 'products.form.supplier' | t }}</span>
                    <div class="pr-csel" (click)="toggleSupplierDropdown($event)">
                      <div class="field select" [class.is-disabled]="isSaveLoading()" role="button" tabindex="0" aria-haspopup="listbox" [attr.aria-expanded]="isSupplierDropdownOpen()">
                        <span class="val">{{ getSupplierName(productForm.get('supplierId')?.value) }}</span>
                      </div>
                      @if (isSupplierDropdownOpen()) {
                        <div class="pop pr-csel-pop" role="listbox">
                          <button type="button" class="menu-i" role="option" [attr.aria-selected]="!productForm.get('supplierId')?.value" (click)="selectSupplier(null); $event.stopPropagation()"><span class="muted">{{ 'products.form.noSupplier' | t }}</span></button>
                          @for (sup of suppliers(); track sup.id) {
                            <button type="button" class="menu-i" role="option" [class.is-active]="productForm.get('supplierId')?.value === sup.id" [attr.aria-selected]="productForm.get('supplierId')?.value === sup.id" (click)="selectSupplier(sup.id); $event.stopPropagation()">{{ sup.name }}</button>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="productImageUrl">{{ 'products.form.imageLink' | t }}<span class="opt">{{ 'common.optional' | t }}</span></label>
                  <div class="field"><span class="lead"><app-icon name="img" size="sm" /></span><input id="productImageUrl" type="text" formControlName="imageUrl" [disabled]="isSaveLoading()" /></div>
                </div>
              </section>

              <!-- 2 · Price & tax -->
              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'products.form.sec.pricing' | t }}</h3><p>{{ 'products.form.sec.pricingHint' | t }}</p></div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productPrice">{{ 'products.form.unitPrice' | t }}</label>
                    <div class="field">
                      <span class="affix pre">{{ productForm.get('currency')?.value }}</span>
                      <input id="productPrice" type="number" class="num" formControlName="price" min="0" step="0.01" [attr.aria-invalid]="isFieldInvalid('price')" [disabled]="isSaveLoading()" />
                    </div>
                    @if (isFieldInvalid('price')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.invalidValue' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productCurrency">{{ 'finance.currency' | t }}</label>
                    <div class="field select">
                      <select id="productCurrency" formControlName="currency">
                        @for (c of currencyOptions(); track c) { <option [value]="c">{{ c }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="productTaxRate">{{ 'finance.taxRate' | t }}</label>
                  <div class="field select" [class.is-error]="productRateIsExempt() && !productForm.get('exemptionCode')?.value">
                    <select id="productTaxRate" formControlName="taxRateId">
                      <option [ngValue]="null">{{ defaultTaxLabel() }}</option>
                      @for (tr of taxRates(); track tr.id) { <option [ngValue]="tr.id">{{ taxRateLabel(tr) }}</option> }
                    </select>
                  </div>
                  @if (productRateIsExempt() && !productForm.get('exemptionCode')?.value) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'finance.exemptionRequired' | t }}</div> }
                </div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productExemption">{{ 'finance.defaultExemptionCode' | t }}</label>
                    <div class="field select">
                      <select id="productExemption" formControlName="exemptionCode">
                        <option [ngValue]="null">{{ 'finance.noExemption' | t }}</option>
                        @for (e of exemptionCodes(); track e.code) { <option [ngValue]="e.code">{{ e.code }} · {{ codeName(e) }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productWithholding">{{ 'finance.defaultWithholdingCode' | t }}</label>
                    <div class="field select">
                      <select id="productWithholding" formControlName="withholdingCode">
                        <option [ngValue]="null">{{ 'finance.noWithholding' | t }}</option>
                        @for (w of withholdingCodes(); track w.code) { <option [ngValue]="w.code">{{ w.code }} · {{ w.numerator }}/{{ w.denominator }} · {{ codeName(w) }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                <div class="fld-help">{{ 'finance.withholdingProductHint' | t }}</div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productOtv">{{ 'finance.otvCode' | t }}</label>
                    <div class="field select">
                      <select id="productOtv" formControlName="otvCode">
                        <option [ngValue]="null">{{ 'finance.noOtv' | t }}</option>
                        @for (o of otvCodes(); track o.code) { <option [ngValue]="o.code">{{ o.code }} · {{ o.list }} · {{ codeName(o) }}</option> }
                      </select>
                    </div>
                  </div>
                  @if (productForm.get('otvCode')?.value) {
                    <div class="fld">
                      <label class="fld-label" for="productOtvRate">{{ 'finance.otvRate' | t }}</label>
                      <div class="field"><input id="productOtvRate" type="number" min="0" step="0.01" formControlName="otvRate" class="num" /><span class="affix inline-suf">%</span></div>
                    </div>
                  }
                </div>
              </section>

              <!-- 3 · Stock & units -->
              <section class="fsec">
                <div class="fsec-h"><span class="n">3</span><h3>{{ 'products.form.sec.stock' | t }}</h3><p>{{ 'products.form.sec.stockHint' | t }}</p></div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productQuantity">{{ (editingProductId() ? 'products.form.currentStock' : 'products.form.openingStock') | t }}</label>
                    <div class="field"><input id="productQuantity" type="text" class="num" appQty [qtyDecimals]="formDecimals()" formControlName="quantity" [attr.aria-invalid]="isFieldInvalid('quantity') || !!productForm.get('quantity')?.errors?.['qtyPrecision']" /></div>
                    @if (productForm.get('quantity')?.errors?.['qtyPrecision']) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.precision' | t: { decimals: formDecimals() } }}</div> }
                    @else if (isFieldInvalid('quantity')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.invalidValue' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productMinQuantity">{{ 'products.form.minQuantity' | t }}</label>
                    <div class="field"><input id="productMinQuantity" type="text" class="num" appQty [qtyDecimals]="formDecimals()" formControlName="minQuantity" [attr.aria-invalid]="isFieldInvalid('minQuantity') || !!productForm.get('minQuantity')?.errors?.['qtyPrecision']" /></div>
                    @if (productForm.get('minQuantity')?.errors?.['qtyPrecision']) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.precision' | t: { decimals: formDecimals() } }}</div> }
                    @else if (isFieldInvalid('minQuantity')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.form.invalidValue' | t }}</div> }
                  </div>
                </div>
                @if (editingProductId()) { <div class="fld-help">{{ 'products.form.qtyEditHint' | t }}</div> }
                @else if (formTracked()) { <div class="fld-help">{{ 'products.tracking.qtyLockedHint' | t }}</div> }
                <div class="grid-2">
                  @if (!editingProductId()) {
                    <div class="fld">
                      <label class="fld-label" for="productWarehouse">{{ 'products.form.initialWarehouse' | t }}</label>
                      <div class="field select">
                        <select id="productWarehouse" formControlName="warehouseId">
                          @for (wh of allWarehouses(); track wh.id) { <option [ngValue]="wh.id">{{ wh.name }}{{ wh.isDefault ? ' (' + ('products.form.defaultWarehouse' | t) + ')' : '' }}</option> }
                        </select>
                      </div>
                    </div>
                  }
                  <div class="fld">
                    <label class="fld-label" for="productBaseUnit">{{ 'products.form.unit' | t }}</label>
                    <div class="field select">
                      <select id="productBaseUnit" formControlName="baseUnitId">
                        <option [ngValue]="null">{{ unitLabel(productForm.get('unit')?.value) }}</option>
                        @for (u of unitsList(); track u.id) { <option [ngValue]="u.id">{{ u | unitLabel }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productTracking">{{ 'products.tracking.label' | t }}</label>
                    <div class="field select">
                      <select id="productTracking" formControlName="trackingType">
                        <option value="none">{{ 'products.tracking.none' | t }}</option>
                        <option value="lot">{{ 'products.tracking.lot' | t }}</option>
                        <option value="serial">{{ 'products.tracking.serial' | t }}</option>
                      </select>
                    </div>
                  </div>
                  @if (productForm.get('trackingType')?.value === 'lot') {
                    <div class="pr-check-cell"><label class="check"><input type="checkbox" formControlName="hasExpiry" />{{ 'products.tracking.hasExpiry' | t }}</label></div>
                  }
                </div>
                @if (productForm.get('trackingType')?.value === 'lot' && (productForm.get('hasExpiry')?.value || productForm.get('regulatoryCategory')?.value === 'food')) {
                  <div class="grid-2">
                    <div class="fld">
                      <label class="fld-label" for="productExpType">{{ 'products.expiryType.label' | t }}</label>
                      <div class="field select">
                        <select id="productExpType" formControlName="expiryType">
                          <option [ngValue]="null">{{ 'products.expiryType.none' | t }}</option>
                          <option value="use_by">{{ 'products.expiryType.use_by' | t }}</option>
                          <option value="best_before">{{ 'products.expiryType.best_before' | t }}</option>
                        </select>
                      </div>
                    </div>
                    <div class="fld">
                      <label class="fld-label" for="productExpPrec">{{ 'products.expiryPrecision.label' | t }}</label>
                      <div class="field select">
                        <select id="productExpPrec" formControlName="expiryPrecision">
                          <option value="day">{{ 'products.expiryPrecision.day' | t }}</option><option value="month">{{ 'products.expiryPrecision.month' | t }}</option><option value="year">{{ 'products.expiryPrecision.year' | t }}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="fld-help">{{ 'products.expiryType.hint' | t }}</div>
                }
                <div class="pr-subblock">
                  <div class="pr-subblock-h">
                    <b>{{ 'products.altUnits.title' | t }}</b>
                    <button type="button" class="btn btn-subtle btn-xs" (click)="addAltUnit()"><app-icon name="plus" size="sm" />{{ 'products.altUnits.add' | t }}</button>
                  </div>
                  @if (altUnits().length === 0) { <span class="fld-help">{{ 'products.altUnits.empty' | t }}</span> }
                  @for (au of altUnits(); track $index; let i = $index) {
                    <div class="pr-alt-row">
                      <div class="field field-sm select">
                        <select [attr.aria-label]="'products.altUnits.selectUnit' | t" (change)="updateAltUnit(i, 'unitId', $any($event.target).value)">
                          <option value="" [selected]="!au.unitId">{{ 'products.altUnits.selectUnit' | t }}</option>
                          @for (u of unitsList(); track u.id) { <option [value]="u.id" [selected]="u.id === au.unitId">{{ u | unitLabel }}</option> }
                        </select>
                      </div>
                      <div class="field field-sm"><input type="number" class="num" min="0.0001" step="any" [value]="au.factor" (input)="updateAltUnit(i, 'factor', $any($event.target).value)" [title]="'products.altUnits.factorHint' | t" [placeholder]="'products.altUnits.factor' | t" [attr.aria-label]="'products.altUnits.factor' | t" /></div>
                      <div class="field field-sm pr-alt-bc"><input type="text" class="mono" [value]="au.barcode || ''" (input)="updateAltUnit(i, 'barcode', $any($event.target).value)" [placeholder]="'products.altUnits.barcode' | t" [attr.aria-label]="'products.altUnits.barcode' | t" /></div>
                      <button type="button" class="btn btn-danger-ghost btn-sm btn-icon" (click)="removeAltUnit(i)" [attr.aria-label]="'common.delete' | t"><app-icon name="trash" size="sm" /></button>
                    </div>
                    @if (au.unitId && au.factor > 0) {
                      <span class="pr-alt-eq">1 {{ unitNameById(au.unitId) }} = {{ au.factor | num }} {{ baseUnitName() }}</span>
                    }
                  }
                </div>
              </section>

              <!-- 4 · Regulatory -->
              <section class="fsec">
                <div class="fsec-h"><span class="n">4</span><h3>{{ 'products.regulatory.section' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productRegCat">{{ 'products.regulatory.category' | t }}</label>
                    <div class="field select">
                      <select id="productRegCat" formControlName="regulatoryCategory">
                        @for (c of regulatoryCategories; track c) {
                          <option [value]="c" [disabled]="c !== 'none' && !enabledModules().includes(c)">{{ 'products.regulatory.' + c | t }}{{ c !== 'none' && !enabledModules().includes(c) ? ' (' + ('products.regulatory.moduleOff' | t) + ')' : '' }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productInvClass">{{ 'products.inventoryClass.label' | t }}</label>
                    <div class="field select">
                      <select id="productInvClass" formControlName="inventoryClass">
                        @for (c of inventoryClasses; track c) { <option [value]="c">{{ 'products.inventoryClass.' + c | t }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="productGtin">{{ 'products.regulatory.gtin' | t }}</label>
                  <div class="field"><input id="productGtin" type="text" inputmode="numeric" maxlength="14" formControlName="gtin14" class="mono" [attr.aria-invalid]="isFieldInvalid('gtin14')" /></div>
                  @if (isFieldInvalid('gtin14')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.regulatory.gtinInvalid' | t }}</div> }
                  @for (h of categoryHints(); track h.code) {
                    @if (h.severity === 'error') { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'products.regulatory.issue.' + h.code | t: h.params }}</div> }
                    @else { <div class="fld-help" [class.text-warning]="h.severity === 'warning'">{{ 'products.regulatory.issue.' + h.code | t: h.params }}</div> }
                  }
                  @if (gtinRestricted()) { <div class="fld-help text-warning">{{ 'products.gs1.restricted' | t }}</div> }
                </div>
              </section>

              <!-- 5 · Cost, wastage, warranty, label, export -->
              <section class="fsec">
                <div class="fsec-h"><span class="n">5</span><h3>{{ 'products.wp6.section' | t }}</h3></div>
                @if (editingProductId()) {
                  <div class="fld-help">{{ 'products.wp6.unitCost' | t }}: <strong>{{ editingCost() === null ? '-' : (editingCost() | money) }}</strong> · {{ 'products.wp6.costReadonly' | t }}</div>
                } @else if (productForm.get('quantity')?.value > 0) {
                  <div class="fld">
                    <label class="fld-label" for="productOpenCost">{{ 'products.wp6.openingUnitCost' | t }}</label>
                    <div class="field"><input id="productOpenCost" type="number" class="num" min="0" step="0.000001" formControlName="openingUnitCost" /></div>
                  </div>
                }
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productWaste">{{ 'products.wp6.wastageRate' | t }}</label>
                    <div class="field"><input id="productWaste" type="number" class="num" min="0" max="100" step="0.01" formControlName="normalWastageRatePct" /><span class="affix inline-suf">%</span></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productWasteSrc">{{ 'products.wp6.wastageSource' | t }}</label>
                    <div class="field"><input id="productWasteSrc" type="text" maxlength="255" formControlName="normalWastageSource" /></div>
                  </div>
                </div>
                <div class="grid-2">
                  <div class="pr-check-cell"><label class="check"><input type="checkbox" formControlName="warrantyRequired" />{{ 'products.wp6.warrantyRequired' | t }}</label></div>
                  <div class="fld">
                    <label class="fld-label" for="productWarranty">{{ 'products.wp6.warrantyMonths' | t }}</label>
                    <div class="field"><input id="productWarranty" type="number" class="num" min="0" step="1" formControlName="warrantyMonths" /></div>
                  </div>
                </div>
                <div class="grid-2">
                  <div class="pr-check-cell"><label class="check"><input type="checkbox" formControlName="perishable" />{{ 'products.wp6.perishable' | t }}</label></div>
                  <div class="fld">
                    <label class="fld-label" for="productOrigin">{{ 'products.wp6.originCountry' | t }}</label>
                    <div class="field"><input id="productOrigin" type="text" maxlength="2" formControlName="originCountry" class="mono" /></div>
                  </div>
                </div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="productLblQty">{{ 'products.wp6.labelNetQuantity' | t }}</label>
                    <div class="field"><input id="productLblQty" type="number" class="num" min="0" step="0.001" formControlName="labelNetQuantity" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="productLblUnit">{{ 'products.wp6.labelNetUnit' | t }}</label>
                    <div class="field select">
                      <select id="productLblUnit" formControlName="labelNetUnit">
                        <option [ngValue]="null">-</option>@for (u of labelUnits; track u) { <option [value]="u">{{ u }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                @if (exportEnabled()) {
                  <div class="grid-2">
                    <div class="fld">
                      <label class="fld-label" for="productGtip">{{ 'products.wp6.gtip' | t }}</label>
                      <div class="field"><input id="productGtip" type="text" inputmode="numeric" maxlength="12" formControlName="gtipCode" class="mono" /></div>
                    </div>
                    <div class="fld">
                      <label class="fld-label" for="productNetW">{{ 'products.wp6.netWeight' | t }}</label>
                      <div class="field"><input id="productNetW" type="number" class="num" min="0" step="0.001" formControlName="netWeightKg" /><span class="affix inline-suf">kg</span></div>
                    </div>
                  </div>
                }
              </section>

              @if (editingProductId() && editingTrackingType() !== 'none') {
                <section class="fsec">
                  <div class="fsec-h"><span class="n">6</span><h3>{{ (editingTrackingType() === 'lot' ? 'products.lots.title' : 'products.serials.title') | t }}</h3>
                    @if (editingTrackingType() === 'serial' && productSerials().length) { <span class="aside">{{ 'products.serials.count' | t: { count: productSerials().length } }}</span> }
                  </div>
                  @if (isLoadingTracking()) {
                    <div class="skeleton-text"></div><div class="skeleton-text short"></div>
                  } @else if (editingTrackingType() === 'lot') {
                    @if (productLots().length === 0) {
                      <span class="fld-help">{{ 'products.lots.empty' | t }}</span>
                    } @else {
                      <div class="table-card">
                        <div class="table-scroll">
                          <table class="tbl dense pr-lots">
                            <thead>
                              <tr>
                                <th>{{ 'products.lots.lot' | t }}</th>
                                <th>{{ 'products.lots.warehouse' | t }}</th>
                                <th>{{ 'products.lots.expiry' | t }}</th>
                                <th class="r">{{ 'products.lots.qty' | t }}</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (lot of productLots(); track lot.id) {
                                <tr>
                                  <td class="mono">{{ lot.lotNumber }}</td>
                                  <td class="sec">{{ lot.warehouseName || warehouseNameById(lot.warehouseId) }}</td>
                                  <td>
                                    @if (lot.expiryDate) {
                                      {{ lot.expiryDate | appDate }}
                                      @if (lotStatus(lot) === 'expired') { <span class="badge badge-danger"><span class="dot"></span>{{ 'products.lots.expired' | t }}</span> }
                                      @else if (lotStatus(lot) === 'soon') { <span class="badge badge-warning"><span class="dot"></span>{{ 'products.lots.expiringSoon' | t }}</span> }
                                    } @else { <span class="muted">-</span> }
                                  </td>
                                  <td class="r">{{ lot.quantity | num }}</td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    }
                  } @else {
                    @if (productSerials().length === 0) {
                      <span class="fld-help">{{ 'products.serials.empty' | t }}</span>
                    } @else {
                      <div class="pr-serials">
                        @for (sn of productSerials(); track sn.id) {
                          <span class="tag" [title]="sn.warehouseName || warehouseNameById(sn.warehouseId)">{{ sn.serial }}</span>
                        }
                      </div>
                    }
                  }
                </section>
              }
            </div>

            <div class="drawer-footer">
              @if (editingProductId()) { <button type="button" class="btn btn-ghost" (click)="printLabel()"><app-icon name="printer" />{{ 'products.wp6.printLabel' | t }}</button> }
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeProductForm()" [disabled]="isSaveLoading()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSaveLoading()" [disabled]="productForm.invalid || productForm.pristine || isSaveLoading()">
                <span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ─── Bulk Actions Bar ─── -->
    @if (selectedProductIds().length > 0) {
      <div class="bulkbar" role="toolbar" [attr.aria-label]="'products.ui.bulkActions' | t">
        <span class="count"><span class="mono">{{ selectedProductIds().length }}</span> {{ 'products.bulk.selected' | t }}</span>
        <span class="sep"></span>
        <div class="bulk-category-select-wrapper">
          <button type="button" class="bb" (click)="toggleBulkCategoryDropdown($event)" [attr.aria-label]="'products.bulk.changeCategory' | t"><app-icon name="tag" /><span class="lbl">{{ 'products.bulk.changeCategory' | t }}</span></button>
          @if (isBulkCategoryDropdownOpen()) {
            <div class="bulk-category-dropdown">
              @for (cat of categories(); track cat.slug) {
                <button type="button" class="menu-i" (click)="applyBulkCategory(cat.slug)">{{ cat.name }}</button>
              }
            </div>
          }
        </div>
        <button type="button" class="bb" (click)="openLabelModal(selectedProducts())" [attr.aria-label]="'products.label.printSelected' | t"><app-icon name="barcode" /><span class="lbl">{{ 'products.label.printSelected' | t }}</span></button>
        <button type="button" class="bb danger" (click)="promptBulkDelete()" [attr.aria-label]="'products.bulk.deleteSelected' | t"><app-icon name="trash" /><span class="lbl">{{ 'products.bulk.deleteSelected' | t }}</span></button>
        <span class="sep"></span>
        <button type="button" class="bb" (click)="clearSelection()" [attr.aria-label]="'products.ui.clearSelection' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
      </div>
    }

    <!-- ─── Barcode Label Print Drawer ─── -->
    @if (labelProducts().length > 0) {
      <div class="drawer-overlay" (click)="closeLabelModal()">
        <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="prLabelTitle" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title" id="prLabelTitle">{{ 'products.label.title' | t }}</span>
            <button type="button" class="drawer-close" (click)="closeLabelModal()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            <p class="fld-help">{{ 'products.label.productCount' | t: { count: labelProducts().length } }}</p>
            <div class="fld">
              <label class="fld-label" for="labelCopies">{{ 'products.label.copies' | t }}</label>
              <div class="field"><input id="labelCopies" type="number" class="num" min="1" max="500" [ngModel]="labelCopies()" (ngModelChange)="labelCopies.set(+$event)" [attr.aria-invalid]="!(labelCopies() >= 1)" /></div>
            </div>
            @if (labelHasAltBarcodes()) {
              <label class="check"><input type="checkbox" [ngModel]="labelIncludeAltUnits()" (ngModelChange)="labelIncludeAltUnits.set($event)" />{{ 'products.label.includeAltUnits' | t }}</label>
            }
            <label class="check"><input type="checkbox" [ngModel]="labelShowPrice()" (ngModelChange)="labelShowPrice.set($event)" />{{ 'products.label.showPrice' | t }}</label>
            <div class="pr-lbl-list">
              @for (lp of labelProducts(); track lp.id) {
                <div class="pr-lbl-item">
                  <b>{{ lp.name }}</b><span class="cell-code">{{ lp.sku }}</span>
                  @if (!lp.barcode) { <span class="fld-help">{{ 'products.label.skuFallback' | t }}</span> }
                </div>
              }
            </div>
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="closeLabelModal()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="printLabels()" [disabled]="!(labelCopies() >= 1)"><app-icon name="printer" />{{ 'products.label.printBtn' | t }}<kbd>Ctrl ↵</kbd></button>
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
        <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="prXferTitle" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2 class="drawer-title" id="prXferTitle">{{ 'products.transferModal.title' | t }}</h2>
            <button type="button" class="drawer-close" (click)="closeTransferModal()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>

          <div class="drawer-body">
            <div class="pr-xfer-prod">
              <span class="pr-thumb"><app-icon name="box" size="sm" /></span>
              <div>
                <span class="cap">{{ 'products.transferModal.selectedProduct' | t }}</span>
                <b>{{ selectedProductForTransfer()?.name }}</b>
              </div>
              <span class="cell-code">{{ selectedProductForTransfer()?.sku }}</span>
            </div>

            <div class="grid-2">
              <div class="fld">
                <label class="fld-label" for="prTrFrom">{{ 'products.transferModal.from' | t }}</label>
                <div class="field select">
                  <select id="prTrFrom" [ngModel]="transferFromWarehouse()" (ngModelChange)="transferFromWarehouse.set($event); onTransferFromWarehouseChange()">
                    <option value="" disabled selected>{{ 'products.transferModal.selectWarehouse' | t }}</option>
                    @for (wh of availableFromWarehouses(); track wh.id) {
                      <option [value]="wh.id">{{ wh.name }} ({{ 'products.transferModal.available' | t: { qty: wh.qty } }})</option>
                    }
                  </select>
                </div>
              </div>
              <div class="fld">
                <label class="fld-label" for="prTrTo">{{ 'products.transferModal.to' | t }}</label>
                <div class="field select">
                  <select id="prTrTo" [ngModel]="transferToWarehouse()" (ngModelChange)="transferToWarehouse.set($event)">
                    <option value="" disabled selected>{{ 'products.transferModal.selectWarehouse' | t }}</option>
                    @for (wh of availableToWarehouses(); track wh.id) { <option [value]="wh.id">{{ wh.name }}</option> }
                  </select>
                </div>
              </div>
            </div>

            @if (transferTracking() === 'lot' && transferFromWarehouse()) {
              <div class="fld">
                <label class="fld-label" for="prTrLot">{{ 'warehouses.transfer.lot' | t }}</label>
                <div class="field select">
                  <select id="prTrLot" [ngModel]="transferLotId()" (ngModelChange)="transferLotId.set($event || '')">
                    <option value="">{{ 'warehouses.transfer.selectLot' | t }}</option>
                    @for (l of transferLots(); track l.id) {
                      <option [value]="l.id">{{ l.lotNumber }}{{ l.expiryDate ? ' · ' + l.expiryDate : '' }} — {{ 'warehouses.transfer.available' | t: { qty: l.quantity } }}</option>
                    }
                  </select>
                </div>
                @if (!transferTrackingLoading() && transferLots().length === 0) { <div class="fld-help">{{ 'warehouses.transfer.noLots' | t }}</div> }
                @else if (!transferTrackingLoading() && !transferLotId()) { <div class="fld-help">{{ 'warehouses.transfer.lotAutoHint' | t }}</div> }
              </div>
            }
            @if (transferTracking() === 'serial' && transferFromWarehouse()) {
              <div class="fld">
                <span class="fld-label">{{ 'warehouses.transfer.serials' | t }}<span class="opt mono">{{ transferSerialSel().size }}</span></span>
                @if (transferTrackingLoading()) {
                  <div class="skeleton-text"></div>
                } @else if (transferSerials().length === 0) {
                  <div class="fld-help">{{ 'warehouses.transfer.noSerials' | t }}</div>
                } @else {
                  <div class="pr-serial-list">
                    @for (sn of transferSerials(); track sn.id) {
                      <label class="check"><input type="checkbox" [checked]="transferSerialSel().has(sn.serial)" (change)="toggleTransferSerial(sn.serial)" /><span class="mono">{{ sn.serial }}</span></label>
                    }
                  </div>
                  <div class="fld-help">{{ 'warehouses.transfer.serialsHint' | t }}</div>
                }
              </div>
            }

            <div class="grid-2">
              <div class="fld">
                <label class="fld-label" for="prTrQty">{{ 'products.transferModal.quantity' | t }}</label>
                <div class="field"><input id="prTrQty" type="text" class="num" appQty [qtyDecimals]="transferDecimals()" [ngModel]="transferQuantity()" (ngModelChange)="transferQuantity.set($event)" [readonly]="transferTracking() === 'serial'" /></div>
                @if (maxTransferQuantity() > 0) { <div class="fld-help">{{ 'products.transferModal.max' | t: { max: maxTransferQuantity() } }}</div> }
              </div>
              <div class="fld">
                <label class="fld-label" for="prTrNote">{{ 'products.transferModal.note' | t }}</label>
                <div class="field"><input id="prTrNote" type="text" [ngModel]="transferNote()" (ngModelChange)="transferNote.set($event)" /></div>
              </div>
            </div>

            @if (transferValidationError(); as ve) {
              <div class="fld-error"><app-icon name="alert" size="sm" />{{ ve | t }}</div>
            }
            @if (transferError()) {
              <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ transferError() }}</span></div>
            }
          </div>

          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="closeTransferModal()" [disabled]="isTransferLoading()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="isTransferLoading()" (click)="executeTransfer()" [disabled]="isTransferLoading() || !isTransferValid()">
              <span>{{ 'products.transferModal.complete' | t }}</span><kbd>Ctrl ↵</kbd>
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
  /** False until the category list has loaded (or failed), so rows never flash raw category values. */
  categoriesLoaded = signal(false);
  
  // Redesign state signals
  showFilters = signal(false);
  showStats = signal(true);
  isTableView = signal(true);
  isViewDropdownOpen = signal(false);
  isSortDropdownOpen = signal(false);
  /** UI-only: header overflow menu and mobile row menu. */
  isMoreMenuOpen = signal(false);
  rowMenuId = signal<string | null>(null);

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

  /** Inventory value at cost (VUK 274) in the company base currency; never the sales-price value. */
  readonly totalValue = computed(() => {
    const s = this.state.summary();
    if (s) return { amount: s.inventoryValue, currency: s.currency, unconverted: s.unconvertedCurrencies || [] };
    // Fallback before summary loads: only sum base-currency products
    const base = this.i18n.currency();
    const prods = this.state.products();
    const amount = prods.reduce((acc, p) => acc + (p.unitCost || 0) * (p.quantity || 0), 0);
    return { amount, currency: base, unconverted: [] as string[] };
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
    return def ? `${label} (${this.taxRateLabel(def)})` : label;
  }

  /** "KDV %20" — appends the rate only when the rate name does not already carry it. */
  taxRateLabel(tr: TaxRate): string {
    const pct = `%${this.i18n.formatNumber(tr.rate)}`;
    const name = (tr.name || '').trim();
    if (!name) return pct;
    const compact = name.replace(/\s+/g, '');
    const hasRate = compact.includes(pct) || compact.includes(`${this.i18n.formatNumber(tr.rate)}%`) || compact.includes(`%${tr.rate}`) || compact.includes(`${tr.rate}%`);
    return hasRate ? name : `${name} ${pct}`;
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
    this.taxService.exemptions().subscribe({ next: (d) => this.exemptionCodes.set(d), error: () => {} });
    this.taxService.withholdings().subscribe({ next: (d) => this.withholdingCodes.set(d), error: () => {} });
    this.taxService.otvCodes().subscribe({ next: (d) => this.otvCodes.set(d), error: () => {} });
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

  /** Stock in sellable warehouses (before reservations); null when the API did not send it. */
  sellableQuantity(p: Product): number | null {
    const v = p.sellableQuantity ?? (p.reservedQuantity ? null : p.availableQuantity);
    return v === undefined || v === null ? null : Number(v);
  }

  /** Sellable stock not yet reserved by pending despatch-mode orders. */
  freeQuantity(p: Product): number {
    // The API returns availableQuantity already net of reservations (sellableQuantity = before them).
    if (p.sellableQuantity !== undefined && p.sellableQuantity !== null) return Math.max(0, Number(p.availableQuantity ?? 0));
    return Math.max(0, Number(p.availableQuantity ?? p.quantity) - Number(p.reservedQuantity || 0));
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
    // A slow or rate-limited request must never leave the Category column as permanent skeletons.
    this.inventoryService.getCategories().pipe(
      timeout(8000),
      retry({ count: 1, delay: 1000 }),
      finalize(() => this.categoriesLoaded.set(true))
    ).subscribe({
      next: (data) => {
        const cleaned = (data || []).filter(c => c && c.name && !c.name.toLowerCase().startsWith('ekle:'));
        this.categories.set(cleaned);
        this.categoriesLoaded.set(true);
      },
      error: () => this.categoriesLoaded.set(true)
    });
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.isCategoryDropdownOpen.set(false);
    this.isSupplierDropdownOpen.set(false);
    this.isBulkCategoryDropdownOpen.set(false);
    this.isViewDropdownOpen.set(false);
    this.isSortDropdownOpen.set(false);
    this.isMoreMenuOpen.set(false);
    this.rowMenuId.set(null);
  }

  /** Esc closes the top-most overlay (drawers first), then the selection. */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showScanner()) return;
    if (this.isMoreMenuOpen() || this.isSortDropdownOpen() || this.rowMenuId() || this.isBulkCategoryDropdownOpen()) { this.closeDropdowns(); return; }
    if (this.isTransferModalOpen()) { this.closeTransferModal(); return; }
    if (this.labelProducts().length > 0) { this.closeLabelModal(); return; }
    if (this.showProductFormModal()) { this.closeProductForm(); return; }
    if (this.selectedProductIds().length > 0) this.clearSelection();
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
    exemptionCode: [null as string | null],
    withholdingCode: [null as string | null],
    otvCode: [null as string | null],
    otvRate: [null as number | null],
    warehouseId: [null as string | null],
    // WP6
    expiryType: [null as string | null],
    expiryPrecision: ['day'],
    perishable: [false],
    normalWastageRatePct: [null as number | null],
    normalWastageSource: [''],
    warrantyRequired: [false],
    warrantyMonths: [null as number | null],
    originCountry: [''],
    gtipCode: [''],
    netWeightKg: [null as number | null],
    labelNetQuantity: [null as number | null],
    labelNetUnit: [null as string | null],
    openingUnitCost: [null as number | null],
  });
  readonly labelUnits = ['kg', 'l', 'm', 'm2', 'adet'];
  exportEnabled = signal(false);
  editingCost = signal<number | null>(null);
  private accounting = inject(AccountingService);
  private ebelge = inject(EBelgeService);
  gtinRestricted = computed(() => {
    const v = this.formState();
    return !!(restrictedGs1Prefix(String(v?.['gtin14'] || '')) || restrictedGs1Prefix(String(v?.['barcode'] || '')));
  });

  printLabel() {
    const id = this.editingProductId();
    if (id) this.accounting.openPrintable('prices/labels', { ids: id });
  }

  // WP3: default exemption / withholding / ÖTV codes
  private taxService = inject(TaxService);
  exemptionCodes = signal<ExemptionCode[]>([]);
  withholdingCodes = signal<WithholdingCode[]>([]);
  otvCodes = signal<OtvCode[]>([]);

  codeName(c: { nameTr: string; nameEn: string }): string {
    const t = this.i18n.lang() === 'en' ? c.nameEn : c.nameTr;
    return t.length > 60 ? t.slice(0, 58) + '…' : t;
  }

  productRateIsExempt(): boolean {
    const id = this.formState()?.['taxRateId'];
    const r = this.taxRates().find(t => t.id === id);
    return !!r && (r.kind === 'EXEMPT' || Number(r.rate) === 0);
  }



  productSearch = signal('');
  productFilterStatus = signal<'all' | 'In stock' | 'Low stock' | 'Out of stock'>('all');
  /** UI-only: the category whose name is the current search text ('' when none). */
  activeCategory = computed(() => this.categories().find(c => c.name === this.productSearch())?.name ?? '');
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
    this.ebelge.settings().subscribe({ next: (st: any) => this.exportEnabled.set(!!st?.exportEnabled), error: () => undefined });
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
      currency: this.i18n.currency(), taxRateId: null, exemptionCode: null, withholdingCode: null, otvCode: null, otvRate: null, warehouseId: this.defaultWarehouseId(),
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
      exemptionCode: p.exemptionCode ?? null,
      withholdingCode: p.withholdingCode ?? null,
      otvCode: p.otvCode ?? null,
      otvRate: p.otvRate ?? null,
      warehouseId: null,
      baseUnitId: p.baseUnitId ?? p.baseUnit?.id ?? null,
      barcode: p.barcode || '',
      barcodeType: p.barcodeType || '',
      trackingType: p.trackingType || 'none',
      hasExpiry: !!p.hasExpiry,
      regulatoryCategory: p.regulatoryCategory || 'none',
      inventoryClass: p.inventoryClass || 'TICARI_MAL_153',
      gtin14: p.gtin14 || '',
      expiryType: p.expiryType ?? null,
      expiryPrecision: p.expiryPrecision || 'day',
      perishable: !!p.perishable,
      normalWastageRatePct: p.normalWastageRatePct ?? null,
      normalWastageSource: p.normalWastageSource || '',
      warrantyRequired: !!p.warrantyRequired,
      warrantyMonths: p.warrantyMonths ?? null,
      originCountry: p.originCountry || '',
      gtipCode: p.gtipCode || '',
      netWeightKg: p.netWeightKg ?? null,
      labelNetQuantity: p.labelNetQuantity ?? null,
      labelNetUnit: p.labelNetUnit ?? null,
      openingUnitCost: null,
    });
    this.editingCost.set(p.unitCost ?? null);
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
    // WP6 fields: empty inputs are sent as null
    const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
    payload.normalWastageRatePct = num(rest.normalWastageRatePct);
    payload.normalWastageSource = String(rest.normalWastageSource || '').trim() || null;
    payload.warrantyMonths = num(rest.warrantyMonths);
    payload.originCountry = String(rest.originCountry || '').trim().toUpperCase() || null;
    payload.gtipCode = String(rest.gtipCode || '').trim() || null;
    payload.netWeightKg = num(rest.netWeightKg);
    payload.labelNetQuantity = num(rest.labelNetQuantity);
    payload.labelNetUnit = rest.labelNetUnit || null;
    payload.expiryType = rest.expiryType || null;
    if (editingId || !num(rest.openingUnitCost)) delete payload.openingUnitCost;
    else payload.openingUnitCost = num(rest.openingUnitCost);
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
