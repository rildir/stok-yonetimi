import { Component, inject, signal, computed, HostListener, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Product } from '../../inventory.service';
import { TaxRate, Warehouse } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { tap } from 'rxjs';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe } from '../../i18n';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
/* SCAN BUTTON */
.btn-scan {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* TRANSFER BUTTON */
.transfer-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.25rem;
  border-radius: 4px;
  transition: all 0.15s;
  margin-right: 0.25rem;
}
.transfer-btn:hover {
  color: var(--brand, #3ecf8e);
  background: rgba(62, 207, 142, 0.08);
}
.transfer-btn svg {
  width: 16px;
  height: 16px;
}

/* WAREHOUSE TOOLTIP */
.warehouse-tooltip {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: var(--bg-overlay, #2a2a2a);
  border: 1px solid var(--border-default, #383838);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  animation: tooltipIn 0.15s ease;
}
@keyframes tooltipIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.wh-tooltip-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #6b6b6b);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-default, #383838);
}
.wh-tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
  color: var(--text-primary, #ededed);
}
.wh-tooltip-row strong {
  font-family: var(--font-mono, monospace);
  color: var(--brand, #3ecf8e);
}
  `],
  template: `
    <!-- Redesigned Mockup Sub-Header Controls Toolbar -->
    <div class="toolbar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 12px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px 16px;">
      <!-- Left side: Dropdown selectors & toggles -->
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <!-- Table View / Grid View Selector Dropdown -->
        <div class="custom-select-wrapper" style="width: 170px;" (click)="$event.stopPropagation()">
          <div class="custom-select-trigger" (click)="isViewDropdownOpen.update(v => !v); isSortDropdownOpen.set(false)" [class.open]="isViewDropdownOpen()" style="height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 0.8rem; font-weight: 500; font-family: var(--font-body); padding: 0 12px; background: #FFFFFF; color: #0F172A; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s ease;">
            <span class="selected-text" style="display: flex; align-items: center; gap: 8px;">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="color: #64748B;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
              {{ (isTableView() ? 'products.view.table' : 'products.view.card') | t }}
            </span>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="color: #64748B;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
          @if (isViewDropdownOpen()) {
            <div class="custom-select-dropdown" style="z-index: 2000; width: 100%; border-radius: 8px; position: absolute; top: calc(100% + 4px); left: 0; background: #FFFFFF; border: 1px solid #E2E8F0; box-shadow: var(--shadow-lg); max-height: 220px; overflow-y: auto;">
              <div class="custom-option" (click)="isTableView.set(true); isViewDropdownOpen.set(false)" style="padding: 0.65rem 0.85rem; font-size: 0.8rem; font-family: var(--font-body); display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-bottom: 1px solid #F1F5F9;">
                <span class="opt-name" [style.fontWeight]="isTableView() ? 'bold' : 'normal'">{{ 'products.view.table' | t }}</span>
              </div>
              <div class="custom-option" (click)="isTableView.set(false); isViewDropdownOpen.set(false)" style="padding: 0.65rem 0.85rem; font-size: 0.8rem; font-family: var(--font-body); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                <span class="opt-name" [style.fontWeight]="!isTableView() ? 'bold' : 'normal'">{{ 'products.view.card' | t }}</span>
              </div>
            </div>
          }
        </div>

        <!-- Filter toggle -->
        <button type="button" class="btn" (click)="toggleFilters()" style="border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; border-radius: 8px; height: 38px; font-size: 0.8rem; padding: 0 12px; display: flex; align-items: center; gap: 6px; box-shadow: none; cursor: pointer; transition: all 0.2s;" [style.backgroundColor]="showFilters() ? '#F8FAFC' : '#FFFFFF'">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
          {{ 'products.filter' | t }}
        </button>

        <!-- Sort Select Box redesigned as custom select -->
        <div class="custom-select-wrapper" style="width: 190px;" (click)="$event.stopPropagation()">
          <div class="custom-select-trigger" (click)="isSortDropdownOpen.update(v => !v); isViewDropdownOpen.set(false)" [class.open]="isSortDropdownOpen()" style="height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 0.8rem; font-weight: 500; font-family: var(--font-body); padding: 0 12px; background: #FFFFFF; color: #0F172A; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s ease;">
            <span class="selected-text" style="display: flex; align-items: center; gap: 8px;">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="color: #64748B;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
              {{ ('products.sort.' + productSortOption()) | t }}
            </span>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="color: #64748B;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
          @if (isSortDropdownOpen()) {
            <div class="custom-select-dropdown" style="z-index: 2000; width: 100%; border-radius: 8px; position: absolute; top: calc(100% + 4px); left: 0; background: #FFFFFF; border: 1px solid #E2E8F0; box-shadow: var(--shadow-lg); max-height: 220px; overflow-y: auto;">
              @for (opt of [
                {id: 'default', label: 'products.sort.default'},
                {id: 'stock-desc', label: 'products.sort.stock-desc'},
                {id: 'stock-asc', label: 'products.sort.stock-asc'},
                {id: 'price-asc', label: 'products.sort.price-asc'},
                {id: 'price-desc', label: 'products.sort.price-desc'},
                {id: 'name-asc', label: 'products.sort.name-asc'}
              ]; track opt.id) {
                <div class="custom-option" (click)="productSortOption.set(opt.id); isSortDropdownOpen.set(false)" style="padding: 0.65rem 0.85rem; font-size: 0.8rem; font-family: var(--font-body); display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-bottom: 1px solid #F1F5F9;">
                  <span class="opt-name" [style.fontWeight]="productSortOption() === opt.id ? 'bold' : 'normal'">{{ opt.label | t }}</span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Show Statistics Toggle Redesigned -->
        <div style="display: flex; align-items: center; gap: 8px; margin-left: 8px;">
          <span style="font-size: 0.8rem; color: #64748B; font-weight: 500;">{{ 'products.showStats' | t }}</span>
          <button type="button" (click)="toggleStats()" style="border: none; background: none; padding: 0; cursor: pointer; display: flex; align-items: center; width: 44px; height: 24px; border-radius: 12px; border: 1px solid #E2E8F0; transition: background-color 0.2s;" [style.backgroundColor]="showStats() ? '#FF5A1F' : '#E2E8F0'">
            <div style="width: 18px; height: 18px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: transform 0.2s;" [style.transform]="showStats() ? 'translateX(22px)' : 'translateX(2px)'"></div>
          </button>
        </div>
      </div>

      <!-- Right side: Export, Customize, Add Product -->
      <div style="display: flex; align-items: center; gap: 8px;">
        <button type="button" class="btn" (click)="fileInput.click()" style="border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; border-radius: 8px; height: 38px; font-size: 0.8rem; padding: 0 14px; display: flex; align-items: center; gap: 6px; box-shadow: none; cursor: pointer;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          {{ 'products.import' | t }}
        </button>
        <input type="file" #fileInput accept=".csv" style="display: none" (change)="importFromCSV($event)" />

        <button type="button" class="btn" (click)="exportToCSV()" style="border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; border-radius: 8px; height: 38px; font-size: 0.8rem; padding: 0 14px; display: flex; align-items: center; gap: 6px; box-shadow: none; cursor: pointer;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          {{ 'products.export' | t }}
        </button>

        <button type="button" class="btn" (click)="printProducts()" style="border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; border-radius: 8px; height: 38px; font-size: 0.8rem; padding: 0 14px; display: flex; align-items: center; gap: 6px; box-shadow: none; cursor: pointer;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          {{ 'products.printAction' | t }}
        </button>

        <button type="button" class="btn" (click)="openAddProduct()" style="border: none; background: #0F172A; color: #FFFFFF; border-radius: 8px; height: 38px; font-size: 0.8rem; padding: 0 16px; font-weight: 600; display: flex; align-items: center; gap: 6px; box-shadow: var(--shadow-sm); transition: background-color 0.2s; cursor: pointer;" onmouseover="this.style.backgroundColor='#1F2937'" onmouseout="this.style.backgroundColor='#0F172A'">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          {{ 'products.addNew' | t }}
        </button>
      </div>
    </div>

    <!-- Redesigned Mockup Statistics Grid (Collapsible) -->
    @if (showStats()) {
      <div class="stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 1.5rem;">
        <!-- Card 1: Toplam Ürün -->
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 0.8rem; color: #64748B; font-weight: 500;">{{ 'products.stats.totalProducts' | t }}</span>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 1.85rem; font-weight: bold; color: #0F172A;">{{ state.products().length }}</span>
            <span class="badge-instock" style="font-size: 0.72rem; font-weight: 600; padding: 2px 6px; border-radius: 4px;">{{ 'products.stats.newCount' | t: { count: 3 } }}</span>
          </div>
          <span style="font-size: 0.72rem; color: #64748B;">{{ 'products.stats.vsLastMonth' | t }}</span>
        </div>

        <!-- Card 2: Toplam Değer (Gelir) -->
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 0.8rem; color: #64748B; font-weight: 500;">{{ 'products.stats.totalValue' | t }}</span>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 1.85rem; font-weight: bold; color: #0F172A; font-family: var(--font-mono);">{{ getTotalValue() | money: null : 0 }}</span>
            <span class="badge-instock" style="font-size: 0.72rem; font-weight: 600; padding: 2px 6px; border-radius: 4px;">↑ 9%</span>
          </div>
          <span style="font-size: 0.72rem; color: #64748B;">{{ 'products.stats.vsLastMonth' | t }}</span>
        </div>

        <!-- Card 3: Kritik Stoktaki Ürünler -->
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 0.8rem; color: #64748B; font-weight: 500;">{{ 'products.stats.criticalStock' | t }}</span>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 1.85rem; font-weight: bold; color: #F97316;">{{ state.lowStockCount() }}</span>
            <span class="badge-lowstock" style="font-size: 0.72rem; font-weight: 600; padding: 2px 6px; border-radius: 4px;">↑ 7%</span>
          </div>
          <span style="font-size: 0.72rem; color: #64748B;">{{ 'products.stats.vsLastMonth' | t }}</span>
        </div>

        <!-- Card 4: Tükenen Ürünler -->
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 0.8rem; color: #64748B; font-weight: 500;">{{ 'products.stats.outOfStock' | t }}</span>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 1.85rem; font-weight: bold; color: #EF4444;">{{ state.outOfStockCount() }}</span>
            <span class="badge-outstock" style="font-size: 0.72rem; font-weight: 600; padding: 2px 6px; border-radius: 4px;">↓ 5%</span>
          </div>
          <span style="font-size: 0.72rem; color: #64748B;">{{ 'products.stats.vsLastMonth' | t }}</span>
        </div>
      </div>
    }

    <!-- Ecelon Style Two-Column Layout -->
    <div class="ecelon-search-layout" style="display: flex; gap: 1.5rem; align-items: start; width: 100%;">
      <!-- Left Sidebar Refinements (Collapsible) -->
      @if (showFilters()) {
        <aside class="ecelon-refiner" style="width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 1.25rem; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px;">
          <!-- Arama Input inside filters -->
          <div>
            <h4 style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #0F1111; border-bottom: 1px solid #F0F2F2; padding-bottom: 4px;">{{ 'products.filters.search' | t }}</h4>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="text" [placeholder]="'products.filters.searchPlaceholder' | t" [value]="productSearch()" (input)="onSearchInput($event)" style="width:100%; border: 1px solid #E2E8F0; border-radius:6px; padding:6px 28px 6px 10px; font-size:13px; outline:none;"/>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="position: absolute; right: 8px; color: #64748B;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          </div>

          <!-- Category refinement -->
          <div>
            <h4 style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #0F1111; border-bottom: 1px solid #F0F2F2; padding-bottom: 4px;">{{ 'products.filters.categories' | t }}</h4>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
              <li>
                <a href="#" (click)="productSearch.set(''); $event.preventDefault()" [style.fontWeight]="!productSearch() ? 'bold' : 'normal'" style="color: #007185; text-decoration: none;">{{ 'products.filters.allCategories' | t }}</a>
              </li>
              @for (cat of categories(); track cat.id) {
                <li>
                  <a href="#" (click)="productSearch.set(cat.name); $event.preventDefault()" [style.fontWeight]="productSearch() === cat.name ? 'bold' : 'normal'" style="color: #007185; text-decoration: none;">{{ cat.name }}</a>
                </li>
              }
            </ul>
          </div>
          
          <!-- Stock status refinement -->
          <div>
            <h4 style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #0F1111; border-bottom: 1px solid #F0F2F2; padding-bottom: 4px;">{{ 'products.filters.stockStatus' | t }}</h4>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
              @for (st of [{id:'all', label:'products.status.all'}, {id:'In stock', label:'products.status.inStock'}, {id:'Low stock', label:'products.status.lowStock'}, {id:'Out of stock', label:'products.status.outOfStock'}]; track st.id) {
                <li>
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #0F1111; font-size: 13px;">
                    <input type="radio" name="stockFilter" [checked]="productFilterStatus() === st.id" (change)="productFilterStatus.set($any(st.id))" style="cursor: pointer;" />
                    <span>{{ st.label | t }}</span>
                  </label>
                </li>
              }
            </ul>
          </div>

          <!-- Barkod Tara Button -->
          <button class="btn btn-outline btn-scan" (click)="openScanner()" [title]="'products.scanBarcode' | t" style="border-radius: 20px; height: 38px; justify-content: center; cursor: pointer;">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
            {{ 'products.scanBarcode' | t }}
          </button>
        </aside>
      }

      <!-- Right Main Content Panel -->
      <!-- Right Main Content Panel -->
      <div class="ecelon-results-main" style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
        <!-- Header with item count and sorting selection -->
        <div style="display: flex; justify-content: space-between; align-items: center; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px 16px;">
          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <div style="font-size: 14px; color: #565959;">
              {{ 'products.results.prefix' | t }} <strong>{{ 'products.results.count' | t: { count: filteredProducts().length } }}</strong> {{ 'products.results.suffix' | t }}
            </div>
            @if (selectedWarehouseFilter()) {
              <div class="badge badge-lowstock" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; background: rgba(217, 119, 6, 0.08); color: var(--status-lowstock); border: 1px solid rgba(217, 119, 6, 0.2);">
                {{ 'products.warehouseFilter' | t: { name: selectedWarehouseFilter() } }}
                <button (click)="clearWarehouseFilter()" style="background: none; border: none; color: inherit; cursor: pointer; font-weight: bold; margin-left: 2px; font-size: 0.85rem; padding: 0 2px; line-height: 1;">✕</button>
              </div>
            }
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <!-- Select all checkbox -->
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #0F172A; font-weight: 500;">
              <input type="checkbox" [checked]="isAllSelected()" (change)="toggleSelectAll()" style="cursor: pointer; accent-color: #FF5A1F;" />
              <span>{{ 'products.selectAll' | t }}</span>
            </label>
          </div>
        </div>

        @if (isTableView()) {
          <!-- Sticky Column Headers -->
          <div class="list-headers" style="display: flex; align-items: center; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; padding: 12px 16px; margin-bottom: 4px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 8px 8px 0 0;">
            <div style="width: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">{{ 'products.col.select' | t }}</div>
            <div style="flex: 2; text-align: left; padding-left: 12px; min-width: 240px;">{{ 'products.col.product' | t }}</div>
            <div style="flex: 1; text-align: right; padding-right: 12px; min-width: 100px;">{{ 'products.col.price' | t }}</div>
            <div style="flex: 0.8; text-align: right; padding-right: 12px; min-width: 80px;">{{ 'products.col.sales' | t }}</div>
            <div style="flex: 1; text-align: right; padding-right: 12px; min-width: 100px;">{{ 'products.col.revenue' | t }}</div>
            <div style="flex: 1; text-align: left; padding-left: 12px; min-width: 100px;">{{ 'products.col.stock' | t }}</div>
            <div style="flex: 1; text-align: left; padding-left: 12px; min-width: 110px;">{{ 'products.col.status' | t }}</div>
            <div style="flex: 1; text-align: left; padding-left: 12px; min-width: 100px;">{{ 'products.col.rating' | t }}</div>
            <div style="width: 140px; text-align: right; padding-right: 8px; flex-shrink: 0;">{{ 'common.actions' | t }}</div>
          </div>

          <!-- Result Cards Stack -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            @for (p of paginatedProducts(); track p.id) {
              <div class="ecelon-search-result-card" [class.selected]="isProductSelected(p.id)" 
                   style="display: flex; align-items: center; padding: 10px 16px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; transition: all 0.2s; position: relative;"
                   [style.borderLeft]="isProductSelected(p.id) ? '4px solid #FF5A1F' : '1px solid #E2E8F0'"
                   [style.backgroundColor]="isProductSelected(p.id) ? '#FFF7F5' : '#FFFFFF'">
                
                <!-- Checkbox -->
                <div style="width: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" style="cursor: pointer; width: 15px; height: 15px; accent-color: #FF5A1F;" />
                </div>
                
                <!-- Product (Görsel & Name & SKU & Kategori) -->
                <div style="flex: 2; display: flex; align-items: center; gap: 12px; padding-left: 12px; min-width: 240px; overflow: hidden;">
                  <!-- Product Image -->
                  <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden;">
                    @if (p.imageUrl) {
                      <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                    } @else {
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="opacity: 0.3;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    }
                  </div>
                  <!-- Details -->
                  <div style="display: flex; flex-direction: column; overflow: hidden;">
                    <a href="#" (click)="$event.preventDefault(); openEditProduct(p)" style="font-size: 0.85rem; font-weight: 600; color: #0F172A; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" onmouseover="this.style.color='#FF5A1F'" onmouseout="this.style.color='#0F172A'">
                      {{ p.name }}
                    </a>
                    <span style="font-size: 0.72rem; color: #64748B; font-family: var(--font-mono); margin-top: 1px;">
                      SKU: {{ p.sku }} • {{ getCategoryName(p.category) }}
                    </span>
                  </div>
                </div>

                <!-- Price -->
                <div style="flex: 1; text-align: right; padding-right: 12px; min-width: 100px; font-weight: 600; color: #0F172A; font-family: var(--font-mono); font-size: 0.85rem;">
                  {{ p.price | money: p.currency }}
                </div>

                <!-- Sales (Mocked) -->
                <div style="flex: 0.8; text-align: right; padding-right: 12px; min-width: 80px; font-size: 0.85rem; color: #475569; font-weight: 500;">
                  {{ getMockSales(p) }}
                </div>

                <!-- Revenue (Mocked) -->
                <div style="flex: 1; text-align: right; padding-right: 12px; min-width: 100px; font-weight: 600; color: #0F172A; font-family: var(--font-mono); font-size: 0.85rem;">
                  {{ getMockRevenue(p) | money: null : 0 }}
                </div>

                <!-- Stock -->
                <div style="flex: 1; text-align: left; padding-left: 12px; min-width: 100px; font-size: 0.85rem; color: #475569; position: relative;">
                  <span (mouseenter)="hoveredProductId.set(p.id)" (mouseleave)="hoveredProductId.set(null)" style="cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                    {{ p.quantity | num }} {{ unitLabel(p.unit) }}
                    @if (p.quantity <= p.minQuantity && p.quantity > 0) {
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#F97316" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    } @else if (p.quantity === 0) {
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#EF4444" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    }
                  </span>
                  
                  <!-- Warehouse Tooltip -->
                  @if (p.warehouses && hoveredProductId() === p.id) {
                    <div class="warehouse-tooltip" style="display:block; position: absolute; bottom: 25px; left: 12px;">
                      <div class="wh-tooltip-title">{{ 'products.warehouseDistribution' | t }}</div>
                      @for (wh of getWarehouseEntries(p.warehouses); track wh.name) {
                        <div class="wh-tooltip-row">
                          <span>{{ wh.name }}</span>
                          <strong>{{ wh.qty }}</strong>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Status -->
                <div style="flex: 1; text-align: left; padding-left: 12px; min-width: 110px;">
                  <span class="badge" [class.badge-instock]="p.status === 'In stock'" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">
                    {{ statusLabel(p.status) }}
                  </span>
                </div>

                <!-- Rating (Mocked Stars) -->
                <div style="flex: 1; text-align: left; padding-left: 12px; min-width: 100px; display: flex; align-items: center; gap: 2px;">
                  @for (star of getMockStarsArray(p); track $index) {
                    <svg width="13" height="13" fill="#FBBF24" viewBox="0 0 20 20" style="color: #FBBF24;">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  }
                  @if (getMockStarsRemainder(p)) {
                    <svg width="13" height="13" fill="none" viewBox="0 0 20 20" stroke="#FBBF24" stroke-width="2" style="position: relative; display: inline-block;">
                      <defs>
                        <linearGradient id="halfStar">
                          <stop offset="50%" stop-color="#FBBF24"/>
                          <stop offset="50%" stop-color="transparent"/>
                        </linearGradient>
                      </defs>
                      <path fill="url(#halfStar)" stroke="#FBBF24" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  }
                  <span style="font-size: 0.72rem; color: #64748B; margin-left: 2px;">{{ getMockRatingValue(p) }}</span>
                </div>

                <!-- Actions (circular buttons or mockup-themed options) -->
                <div style="width: 140px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; padding-right: 8px;">
                  <button type="button" (click)="openEditProduct(p)" style="border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: none;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'" [title]="'common.edit' | t">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                  </button>
                  <button type="button" (click)="openTransferModal(p)" style="border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: none;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'" [title]="'products.warehouseTransfer' | t">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                  </button>
                  <button type="button" (click)="promptDeleteProduct(p)" style="border: 1px solid #FEE2E2; background: #FFFFFF; color: #EF4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: none;" onmouseover="this.style.backgroundColor='#FEF2F2'; this.style.borderColor='#FCA5A5'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#FEE2E2'" [title]="'common.delete' | t">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>

              </div>
            }
          </div>
        } @else {
          <!-- Card View Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
            @for (p of paginatedProducts(); track p.id) {
              <div class="ecelon-search-result-card" [class.selected]="isProductSelected(p.id)" 
                   style="display: flex; flex-direction: column; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; transition: all 0.2s; position: relative; gap: 12px;"
                   [style.borderLeft]="isProductSelected(p.id) ? '4px solid #FF5A1F' : '1px solid #E2E8F0'"
                   [style.backgroundColor]="isProductSelected(p.id) ? '#FFF7F5' : '#FFFFFF'">
                
                <!-- Card Header: Checkbox + Status badge -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" style="cursor: pointer; width: 16px; height: 16px; accent-color: #FF5A1F;" />
                  <span class="badge" [class.badge-instock]="p.status === 'In stock'" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">
                    {{ statusLabel(p.status) }}
                  </span>
                </div>
                
                <!-- Card Body: Image + Title + SKU -->
                <div style="display: flex; gap: 12px; align-items: center;">
                  <!-- Product Image -->
                  <div style="width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; padding: 4px;">
                    @if (p.imageUrl) {
                      <img [src]="p.imageUrl" [alt]="'products.imageAlt' | t" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                    } @else {
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="opacity: 0.3;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    }
                  </div>
                  <!-- Details -->
                  <div style="display: flex; flex-direction: column; overflow: hidden; flex: 1;">
                    <a href="#" (click)="$event.preventDefault(); openEditProduct(p)" style="font-size: 0.88rem; font-weight: 700; color: #0F172A; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" onmouseover="this.style.color='#FF5A1F'" onmouseout="this.style.color='#0F172A'">
                      {{ p.name }}
                    </a>
                    <span style="font-size: 0.72rem; color: #64748B; font-family: var(--font-mono); margin-top: 2px;">
                      {{ getCategoryName(p.category) }}
                    </span>
                    <span style="font-size: 0.68rem; color: #94A3B8; font-family: var(--font-mono); margin-top: 1px;">
                      SKU: {{ p.sku }}
                    </span>
                  </div>
                </div>
                
                <!-- Card Divider -->
                <div style="height: 1px; background: #F1F5F9; margin: 4px 0;"></div>
                
                <!-- Card Stats: Price, Stock, Sales, Revenue -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
                  <div>
                    <span style="color: #64748B; display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 500;">{{ 'products.card.unitPrice' | t }}</span>
                    <strong style="color: #0F172A; font-family: var(--font-mono);">{{ p.price | money: p.currency }}</strong>
                  </div>
                  <div>
                    <span style="color: #64748B; display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 500;">{{ 'products.card.currentStock' | t }}</span>
                    <strong style="color: #0F172A;">{{ p.quantity | num }} {{ unitLabel(p.unit) }}</strong>
                  </div>
                  <div>
                    <span style="color: #64748B; display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 500;">{{ 'products.card.salesQty' | t }}</span>
                    <strong style="color: #475569;">{{ getMockSales(p) }}</strong>
                  </div>
                  <div>
                    <span style="color: #64748B; display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 500;">{{ 'products.card.totalRevenue' | t }}</span>
                    <strong style="color: #0F172A; font-family: var(--font-mono);">{{ getMockRevenue(p) | money: null : 0 }}</strong>
                  </div>
                </div>

                <!-- Card Rating -->
                <div style="display: flex; align-items: center; gap: 4px; background: #F8FAFC; padding: 6px 10px; border-radius: 6px; justify-content: center;">
                  <div style="display: flex; align-items: center; gap: 2px;">
                    @for (star of getMockStarsArray(p); track $index) {
                      <svg width="12" height="12" fill="#FBBF24" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    }
                    @if (getMockStarsRemainder(p)) {
                      <svg width="12" height="12" fill="none" viewBox="0 0 20 20" stroke="#FBBF24" stroke-width="2" style="position: relative; display: inline-block;">
                        <defs>
                          <linearGradient id="halfStarCard">
                            <stop offset="50%" stop-color="#FBBF24"/>
                            <stop offset="50%" stop-color="transparent"/>
                          </linearGradient>
                        </defs>
                        <path fill="url(#halfStarCard)" stroke="#FBBF24" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    }
                  </div>
                  <span style="font-size: 0.72rem; color: #475569; font-weight: 600;">{{ getMockRatingValue(p) }} / 5.0</span>
                </div>

                <!-- Card Actions -->
                <div style="display: flex; gap: 6px; margin-top: auto;">
                  <button type="button" class="btn" (click)="openEditProduct(p)" style="flex: 1; border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; height: 32px; font-size: 0.75rem; font-weight: 600; border-radius: 6px; padding: 0;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'">
                    {{ 'common.edit' | t }}
                  </button>
                  <button type="button" class="btn" (click)="openTransferModal(p)" style="flex: 1; border: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; height: 32px; font-size: 0.75rem; font-weight: 600; border-radius: 6px; padding: 0;" onmouseover="this.style.backgroundColor='#F8FAFC'; this.style.borderColor='#CBD5E1'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#E2E8F0'">
                    {{ 'products.transfer' | t }}
                  </button>
                  <button type="button" class="btn" (click)="promptDeleteProduct(p)" style="border: 1px solid #FEE2E2; background: #FFFFFF; color: #EF4444; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 0;" onmouseover="this.style.backgroundColor='#FEF2F2'; this.style.borderColor='#FCA5A5'" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.borderColor='#FEE2E2'">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>

              </div>
            }
          </div>
        }

        <!-- Pagination Footer -->
        @if (filteredProducts().length > 0) {
          <div style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px; padding: 12px 16px; flex-wrap: wrap; gap: 12px; margin-top: -12px;">
            <div style="font-size: 0.8rem; color: #64748B;">
              <strong>{{ (currentPage() - 1) * itemsPerPage() + 1 }}</strong> - <strong>{{ Math.min(currentPage() * itemsPerPage(), filteredProducts().length) }}</strong> / {{ 'products.pagination.showing' | t: { count: filteredProducts().length } }}
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
              <!-- Items per page -->
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.8rem; color: #64748B;">{{ 'products.pagination.perPage' | t }}</span>
                <select [ngModel]="itemsPerPage()" (ngModelChange)="itemsPerPage.set(+$event); currentPage.set(1)" style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 8px; font-size: 0.8rem; background: #FFFFFF; outline: none; cursor: pointer; color: #0F172A;">
                  <option [value]="10">10</option>
                  <option [value]="25">25</option>
                  <option [value]="50">50</option>
                </select>
              </div>
              <!-- Page selectors -->
              <div style="display: flex; align-items: center; gap: 4px;">
                <button type="button" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid #E2E8F0; background: #FFFFFF; display: flex; align-items: center; justify-content: center; color: #475569;" [style.opacity]="currentPage() === 1 ? '0.5' : '1'" [style.cursor]="currentPage() === 1 ? 'not-allowed' : 'pointer'">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                @for (pNum of getPagesArray(); track pNum) {
                  <button type="button" (click)="goToPage(pNum)" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid #E2E8F0; background: #FFFFFF; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; justify-content: center;"
                          [style.backgroundColor]="currentPage() === pNum ? '#FF5A1F' : '#FFFFFF'"
                          [style.borderColor]="currentPage() === pNum ? '#FF5A1F' : '#E2E8F0'"
                          [style.color]="currentPage() === pNum ? '#FFFFFF' : '#475569'">
                    {{ pNum }}
                  </button>
                }
                <button type="button" [disabled]="currentPage() === totalPages()" (click)="goToPage(currentPage() + 1)" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid #E2E8F0; background: #FFFFFF; display: flex; align-items: center; justify-content: center; color: #475569;" [style.opacity]="currentPage() === totalPages() ? '0.5' : '1'" [style.cursor]="currentPage() === totalPages() ? 'not-allowed' : 'pointer'">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
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

              <!-- Visual Barcode Block -->
              @if (productForm.get('sku')?.value) {
                <div class="barcode-container" style="background: #ffffff; border: 1.5px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                  <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 6px;">{{ 'products.form.visualBarcode' | t }}</div>
                  <div style="display: flex; align-items: stretch; justify-content: center; height: 36px; background: #fff; width: 100%; max-width: 200px;">
                    @for (bar of getBarcodeBars(productForm.get('sku')?.value); track $index) {
                      <div [style.flex-grow]="bar.width" [style.background-color]="bar.isBar ? '#000000' : 'transparent'" style="height: 100%;"></div>
                    }
                  </div>
                  <div style="font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: bold; margin-top: 4px; letter-spacing: 2px; color: #111;">*{{ productForm.get('sku')?.value }}*</div>
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
                <input id="productQuantity" type="number" formControlName="quantity" class="form-input" [class.has-value]="hasValue('quantity')" min="0" [disabled]="isSaveLoading()" />
                <label for="productQuantity" class="form-label">{{ 'products.form.currentStock' | t }}</label>
                @if (isFieldInvalid('quantity')) { <div class="form-error">⚠ {{ 'products.form.invalidValue' | t }}</div> }
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
                <select id="productUnit" formControlName="unit" class="form-input form-select" [class.has-value]="hasValue('unit')" [disabled]="isSaveLoading()">
                  @for (u of units; track u) {
                    <option [value]="u">{{ unitLabel(u) }}</option>
                  }
                </select>
                <label for="productUnit" class="form-label">{{ 'products.form.unit' | t }}</label>
                @if (isFieldInvalid('unit')) { <div class="form-error">⚠ {{ 'products.form.unitRequired' | t }}</div> }
              </div>
              
              <div class="form-field">
                <input id="productMinQuantity" type="number" formControlName="minQuantity" class="form-input" [class.has-value]="hasValue('minQuantity')" min="0" [disabled]="isSaveLoading()" />
                <label for="productMinQuantity" class="form-label">{{ 'products.form.minQuantity' | t }}</label>
                @if (isFieldInvalid('minQuantity')) { <div class="form-error">⚠ {{ 'products.form.invalidValue' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="productImageUrl" type="text" formControlName="imageUrl" class="form-input" [class.has-value]="hasValue('imageUrl')" [disabled]="isSaveLoading()" />
                <label for="productImageUrl" class="form-label">{{ 'products.form.imageUrl' | t }}</label>
              </div>
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
          <button class="btn-danger-dark" (click)="promptBulkDelete()">
            {{ 'products.bulk.deleteSelected' | t }}
          </button>
          <button class="btn-ghost-light" (click)="clearSelection()">
            {{ 'common.cancel' | t }}
          </button>
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
            <p style="font-size: 13px; color: var(--text-muted, #6b7280);">
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

            <!-- Miktar Girişi -->
            <div class="form-field">
              <input type="number" class="form-input" [ngModel]="transferQuantity()" (ngModelChange)="transferQuantity.set($event)" min="1" [max]="maxTransferQuantity()" />
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
              <div style="font-size: 12px; color: #dc2626;">⚠ {{ ve | t }}</div>
            }

            <!-- Hata ve Bilgi Mesajı -->
            @if (transferError()) {
              <div style="font-size: 12px; color: #dc2626; padding: 10px; background: rgba(220, 38, 38, 0.05); border: 1px solid rgba(220, 38, 38, 0.15); border-radius: 6px; display: flex; align-items: center; gap: 6px;">
                <span>⚠ {{ transferError() }}</span>
              </div>
            }
          </div>

          <div class="drawer-footer">
            <button class="btn btn-outline" style="border: 1px solid #d5d9d9; background: #fff; color: #0f1111; border-radius: 8px; padding: 0.65rem 1rem; cursor: pointer; font-weight: 500;" (click)="closeTransferModal()" [disabled]="isTransferLoading()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" style="background: #0f1111; color: #fff; border: none; border-radius: 8px; padding: 0.65rem 1rem; cursor: pointer; font-weight: 500;" (click)="executeTransfer()" [disabled]="isTransferLoading() || !isTransferValid()">
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
  
  getTotalValue(): number {
    return this.state.products().reduce((acc, p) => acc + (p.price * (p.quantity || 0)), 0);
  }

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

  maxTransferQuantity = computed(() => {
    const fromId = this.transferFromWarehouse();
    if (!fromId) return 0;
    return this.availableFromWarehouses().find(w => w.id === fromId)?.qty ?? 0;
  });

  transferValidationError = computed<string | null>(() => {
    const from = this.transferFromWarehouse();
    const to = this.transferToWarehouse();
    const qty = Number(this.transferQuantity());
    if (from && to && from === to) return 'products.transferModal.sameWarehouse';
    if (from && qty > this.maxTransferQuantity()) return 'products.transferModal.exceedsAvailable';
    if (from && to && !(qty > 0)) return 'products.transferModal.invalidQuantity';
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

  productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    sku: ['', [Validators.required, Validators.minLength(2)]],
    category: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    minQuantity: [5, [Validators.required, Validators.min(0)]],
    unit: ['Adet', Validators.required],
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
      currency: this.i18n.currency(), taxRateId: null, warehouseId: this.defaultWarehouseId()
    });
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
      warehouseId: null
    });
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

    if (editingId) {
      // Edit mode
      this.inventoryService.updateProduct(editingId, payload).subscribe({
        next: (updatedProd) => {
          this.state.products.update(list => list.map(p => p.id === editingId ? updatedProd : p));
          this.isSaveLoading.set(false);
          this.closeProductForm();
          this.ui.showToast(this.i18n.t('products.toast.updated'), 'success');
        },
        error: () => {
          this.isSaveLoading.set(false);
          this.ui.showToast(this.i18n.t('products.toast.updateError'), 'error');
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
          this.ui.showToast(this.i18n.t('products.toast.created'), 'success');
        },
        error: () => {
          this.isSaveLoading.set(false);
          this.ui.showToast(this.i18n.t('products.toast.createError'), 'error');
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

  onBarcodeScanned(sku: string) {
    this.showScanner.set(false);
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
          body { font-family: 'Inter', system-ui, sans-serif; padding: 32px; color: #1a1a1a; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f5f5f5; text-align: left; padding: 8px 12px; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border-bottom: 2px solid #e0e0e0; }
          td { padding: 8px 12px; border-bottom: 1px solid #eee; }
          tr:nth-child(even) { background: #fafafa; }
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
  }

  isTransferValid(): boolean {
    const qty = Number(this.transferQuantity());
    return !!this.transferFromWarehouse() &&
           !!this.transferToWarehouse() &&
           this.transferFromWarehouse() !== this.transferToWarehouse() &&
           qty > 0 &&
           qty <= this.maxTransferQuantity();
  }

  openTransferModal(product: Product) {
    this.selectedProductForTransfer.set(product);
    this.transferFromWarehouse.set('');
    this.transferToWarehouse.set('');
    this.transferQuantity.set(1);
    this.transferNote.set('');
    this.transferError.set(null);
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
      this.transferNote().trim() || undefined
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
