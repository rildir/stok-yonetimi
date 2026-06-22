import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeTr from '@angular/common/locales/tr';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Product } from '../../inventory.service';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { ModalComponent } from '../modal.component';

registerLocaleData(localeTr);

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, BarcodeScannerComponent, ModalComponent],
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
    <header class="page-header">
      <div>
        <h1>Ürün Yönetimi</h1>
        <p>İşletmenizin stoklarını ve ürün detaylarını buradan yönetin.</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" (click)="fileInput.click()" title="CSV'den İçe Aktar">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          İçe Aktar
        </button>
        <input type="file" #fileInput accept=".csv" style="display: none" (change)="importFromCSV($event)" />
        <button class="btn btn-outline" (click)="exportToCSV()" title="CSV Olarak İndir">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Dışa Aktar
        </button>
        <button class="btn btn-outline" (click)="printProducts()" title="Yazdır / PDF">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Yazdır
        </button>
        <button class="btn btn-primary" (click)="openAddProduct()">+ Yeni Ürün Ekle</button>
        <div style="width: 1px; height: 20px; background-color: #D5D9D9; margin: 0 8px; align-self: center;"></div>
        <button class="btn btn-outline" (click)="ui.toggleAiPanel()">
          <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #9333ea; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Yapay Zeka Asistanı
        </button>
      </div>
    </header>

    <!-- Search & Filter Bar -->
    <div class="filter-bar" style="background-color: #FFFFFF; border: 1px solid #D5D9D9; border-radius: 4px; padding: 12px; margin-bottom: 1rem;">
      <div class="search-box" style="flex: 1;">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Ürün adı, SKU veya kategori ara..." [value]="productSearch()" (input)="onSearchInput($event)"/>
      </div>
      <button class="btn btn-outline btn-scan" (click)="openScanner()" title="Barkod Tara" style="border-radius: 20px; height: 38px;">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
        Tara
      </button>
    </div>

    <!-- Ecelon Style Two-Column Layout -->
    <div class="ecelon-search-layout" style="display: flex; gap: 1.5rem; align-items: start; width: 100%;">
      <!-- Left Sidebar Refinements -->
      <aside class="ecelon-refiner" style="width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 1.25rem; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px;">
        <!-- Category refinement -->
        <div>
          <h4 style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #0F1111; border-bottom: 1px solid #F0F2F2; padding-bottom: 4px;">Kategoriler</h4>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
            <li>
              <a href="#" (click)="productSearch.set(''); $event.preventDefault()" [style.fontWeight]="!productSearch() ? 'bold' : 'normal'" style="color: #007185; text-decoration: none;">Tüm Kategoriler</a>
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
          <h4 style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #0F1111; border-bottom: 1px solid #F0F2F2; padding-bottom: 4px;">Stok Durumu</h4>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
            @for (st of [{id:'all', label:'Tümü'}, {id:'In stock', label:'Stokta var'}, {id:'Low stock', label:'Azalıyor'}, {id:'Out of stock', label:'Tükendi'}]; track st.id) {
              <li>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #0F1111; font-size: 13px;">
                  <input type="radio" name="stockFilter" [checked]="productFilterStatus() === st.id" (change)="productFilterStatus.set($any(st.id))" style="cursor: pointer;" />
                  <span>{{ st.label }}</span>
                </label>
              </li>
            }
          </ul>
        </div>
      </aside>

      <!-- Right Main Content Panel -->
      <div class="ecelon-results-main" style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
        <!-- Header with item count and sorting selection -->
        <div style="display: flex; justify-content: space-between; align-items: center; background-color: #FFFFFF; border: 1px solid #D5D9D9; border-radius: 8px; padding: 12px 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="font-size: 14px; color: #565959;">
              En çok eşleşen <strong>{{ filteredProducts().length }} sonuç</strong> gösteriliyor
            </div>
            <!-- Sorting Control -->
            <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #0F1111;">
              <span style="color: #565959;">Sıralama:</span>
              <select [value]="productSortOption()" (change)="onSortChange($event)" style="padding: 4px 8px; border: 1px solid #D5D9D9; border-radius: 4px; background: #FFF; outline: none; font-size: 13px; cursor: pointer;">
                <option value="default">Varsayılan</option>
                <option value="stock-desc">En Çok Stok</option>
                <option value="stock-asc">En Az Stok</option>
                <option value="price-asc">Fiyat ↑</option>
                <option value="price-desc">Fiyat ↓</option>
                <option value="name-asc">A-Z</option>
              </select>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <!-- Select all checkbox -->
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #007185;">
              <input type="checkbox" [checked]="isAllSelected()" (change)="toggleSelectAll()" style="cursor: pointer;" />
              <span>Tümünü Seç</span>
            </label>
          </div>
        </div>

        <!-- Sticky Column Headers -->
        <div class="list-headers" style="display: flex; align-items: center; background: var(--canvas); border-bottom: 2px solid var(--border-color); padding: 8px 16px; margin-bottom: 4px; font-size: 11px; font-weight: bold; color: var(--text-muted); text-transform: none; letter-spacing: 0.05em;">
          <div style="width: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">Seç</div>
          <div style="width: 130px; flex-shrink: 0; text-align: center;">Görsel</div>
          <div style="flex: 1; display: flex; padding-left: 16px;">
            <div style="width: 45%; text-align: left;">Ürün & SKU & Kategori</div>
            <div style="width: 25%; text-align: left; padding-left: 8px;">Stok durumu</div>
            <div style="width: 30%; text-align: left; padding-left: 8px;">Mevcut / kritik</div>
          </div>
          <div style="width: 140px; text-align: right; padding-right: 16px; flex-shrink: 0;">Birim fiyat</div>
          <div style="width: 180px; text-align: right; padding-right: 16px; flex-shrink: 0;">İşlemler</div>
        </div>

        <!-- Result Cards Stack -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
          @for (p of filteredProducts(); track p.id) {
            <div class="ecelon-search-result-card" [class.selected]="isProductSelected(p.id)" style="display: flex; border: 1px solid var(--border-color); border-radius: 12px; background: var(--surface-card); overflow: visible; position: relative; transition: all 0.2s; box-shadow: var(--shadow-sm);">
              <!-- Checkbox on card -->
              <div style="padding: 1rem 0.5rem 1rem 1rem; display: flex; align-items: center; justify-content: center;">
                <input type="checkbox" [checked]="isProductSelected(p.id)" (change)="toggleSelectProduct(p.id)" style="cursor: pointer; width: 16px; height: 16px;" />
              </div>
              
              <!-- Product Image on Left -->
              <div style="width: 130px; height: 130px; padding: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #FAFAFA; border-right: 1px solid #F0F2F2;">
                @if (p.imageUrl) {
                  <img [src]="p.imageUrl" alt="Ürün" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                } @else {
                  <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #888; font-size: 11px; background: #EEE; border-radius: 4px;">
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="opacity: 0.5; margin-bottom: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    Görsel Yok
                  </div>
                }
              </div>

              <!-- Product Details in Center -->
              <div style="flex: 1; padding: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                <!-- Column 1: Name, SKU, Category -->
                <div style="width: 45%; display: flex; flex-direction: column; gap: 4px;">
                  <h3 style="font-size: 15px; font-weight: bold; margin: 0; line-height: 1.3;">
                    <a href="#" (click)="$event.preventDefault(); openEditProduct(p)" style="color: #007185; text-decoration: none;" onmouseover="this.style.color='#C45500'" onmouseout="this.style.color='#007185'">
                      {{ p.name }}
                    </a>
                  </h3>
                  <div style="font-size: 12px; color: #565959; display: flex; flex-direction: column; gap: 2px;">
                    <span>SKU: <strong style="font-family: var(--font-mono); color: #0F1111;">{{ p.sku }}</strong></span>
                    <span>Kategori: <strong>{{ getCategoryName(p.category) }}</strong></span>
                  </div>
                </div>

                <!-- Column 2: Stock status -->
                <div style="width: 25%; display: flex; justify-content: flex-start; align-items: center;">
                  <span class="badge" [class.badge-instock]="p.status === 'In stock'" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">
                    {{ p.status === 'In stock' ? 'Stokta var' : p.status === 'Low stock' ? 'Azalıyor' : 'Tükendi' }}
                  </span>
                </div>

                <!-- Column 3: Quantity / Critical -->
                <div style="width: 30%; display: flex; justify-content: flex-start; align-items: center; position: relative;">
                  <span style="font-size: 12px; color: #0F1111; font-weight: 500;" (mouseenter)="hoveredProductId.set(p.id)" (mouseleave)="hoveredProductId.set(null)">
                    Mevcut: <strong>{{ p.quantity }} {{ p.unit || 'Adet' }}</strong> <br/>
                    <span style="font-size: 11px; color: var(--text-muted);">Kritik: {{ p.minQuantity }}</span>
                    @if (p.warehouses && hoveredProductId() === p.id) {
                      <div class="warehouse-tooltip" style="display:block; position: absolute; bottom: 25px; left: 50px;">
                        <div class="wh-tooltip-title">Depo Dağılımı</div>
                        @for (wh of getWarehouseEntries(p.warehouses); track wh.name) {
                          <div class="wh-tooltip-row">
                            <span>{{ wh.name }}</span>
                            <strong>{{ wh.qty }}</strong>
                          </div>
                        }
                      </div>
                    }
                  </span>
                </div>
              </div>

              <!-- Product Price Column -->
              <div style="width: 140px; padding: 16px; border-left: 1px solid #F0F2F2; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 4px; text-align: right; background: #FAFAFA; flex-shrink: 0;">
                <div style="font-size: 16px; font-weight: bold; color: var(--text-primary, #0F1111); font-family: var(--font-mono);">
                  {{ p.price | currency:'TRY':'symbol':'1.2-2':'tr' }}
                </div>
                @if (p.status === 'Low stock') {
                  <div style="font-size: 11px; color: #B12704; font-weight: bold; margin-top: 4px;">Sadece {{ p.quantity }} Adet Kaldı!</div>
                }
              </div>

              <!-- Product Actions Column -->
              <div style="width: 180px; padding: 16px; border-left: 1px solid #F0F2F2; display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 8px; text-align: right; background: #FAFAFA; flex-shrink: 0;">
                <button class="btn btn-primary btn-sm" (click)="openEditProduct(p)" style="width: 100%; border-radius: 20px;">
                  Düzenle
                </button>
                <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between;">
                  <button class="btn btn-outline btn-sm" (click)="openTransferModal(p)" title="Depolar Arası Transfer" style="flex: 1; padding: 4px 0; border-radius: 20px; font-size: 0.7rem;">
                    Transfer
                  </button>
                  <div style="width: 1px; height: 16px; background-color: var(--border-color, #E5E7EB);"></div>
                  <button class="btn btn-outline-danger btn-sm" (click)="promptDeleteProduct(p)" title="Sil" style="color: #EF4444; border-color: #EF4444; flex: 1; padding: 4px 0; border-radius: 20px; font-size: 0.7rem;" onmouseover="this.style.backgroundColor='#FEF2F2'" onmouseout="this.style.backgroundColor='transparent'">
                    Sil
                  </button>
                </div>
              </div>
            </div>
          }
          
          @if (filteredProducts().length === 0) {
            <div class="empty-state" style="padding: 3rem; text-align: center; border: 1px dashed #D5D9D9; border-radius: 8px; background: #FFFFFF;">
              <p style="font-size: 15px; color: #565959;">Arama kriterlerinize uygun ürün bulunamadı.</p>
              <button class="btn btn-primary" (click)="openAddProduct()" style="margin-top: 12px;">Yeni Ürün Ekle</button>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- ─── Product Drawer ─── -->
    @if (showProductFormModal()) {
      <div class="drawer-overlay" (click)="closeProductForm()">
        <div class="drawer-panel" (click)="$event.stopPropagation(); closeDropdowns()">
          <div class="drawer-header">
            <span class="drawer-title">{{ editingProductId() ? 'Ürün Düzenle' : 'Yeni Ürün Ekle' }}</span>
            <button class="drawer-close" (click)="closeProductForm()">×</button>
          </div>
          
          <form [formGroup]="productForm" (ngSubmit)="saveProduct()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="productName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaveLoading()" />
                <label for="productName" class="form-label">Ürün Adı</label>
                @if (isFieldInvalid('name')) { <div class="form-error">⚠ Ürün adı en az 3 karakter olmalıdır.</div> }
              </div>
              
              <div class="form-field">
                <input id="productSku" type="text" formControlName="sku" class="form-input" [class.has-value]="hasValue('sku')" [disabled]="isSaveLoading()" />
                <label for="productSku" class="form-label">SKU</label>
                @if (isFieldInvalid('sku')) { <div class="form-error">⚠ Bu alan zorunludur.</div> }
              </div>

              <!-- Visual Barcode Block -->
              @if (productForm.get('sku')?.value) {
                <div class="barcode-container" style="background: #ffffff; border: 1.5px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                  <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 6px;">Visual Barcode (SKU)</div>
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
                <label class="form-label">Kategori</label>
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
                        <span class="opt-name text-muted">Tedarikçi Seçilmedi</span>
                      </div>
                      @for (sup of suppliers(); track sup.id) {
                        <div class="custom-option" (click)="selectSupplier(sup.id); $event.stopPropagation()" style="padding: 0.75rem 1rem;">
                          <span class="opt-name">{{ sup.name }}</span>
                        </div>
                      }
                    </div>
                  }
                </div>
                <label class="form-label">Tedarikçi</label>
              </div>

              <div class="form-field">
                <input id="productPrice" type="number" formControlName="price" class="form-input form-input--prefix" [class.has-value]="hasValue('price')" min="0" step="0.01" [disabled]="isSaveLoading()" />
                <label for="productPrice" class="form-label">Birim Fiyat</label>
                <span class="form-prefix">₺</span>
                @if (isFieldInvalid('price')) { <div class="form-error">⚠ Geçerli bir değer girin.</div> }
              </div>
              
              <div class="form-field">
                <input id="productQuantity" type="number" formControlName="quantity" class="form-input" [class.has-value]="hasValue('quantity')" min="0" [disabled]="isSaveLoading()" />
                <label for="productQuantity" class="form-label">Mevcut Stok</label>
                @if (isFieldInvalid('quantity')) { <div class="form-error">⚠ Geçerli bir değer girin.</div> }
              </div>

              <div class="form-field">
                <select id="productUnit" formControlName="unit" class="form-input form-select" [class.has-value]="hasValue('unit')" [disabled]="isSaveLoading()">
                  <option value="Adet">Adet</option>
                  <option value="Kg">Kg</option>
                  <option value="Lt">Lt</option>
                  <option value="Metre">Metre</option>
                  <option value="Paket">Paket</option>
                  <option value="Kutu">Kutu</option>
                </select>
                <label for="productUnit" class="form-label">Ölçü Birimi</label>
                @if (isFieldInvalid('unit')) { <div class="form-error">⚠ Birim seçimi zorunludur.</div> }
              </div>
              
              <div class="form-field">
                <input id="productMinQuantity" type="number" formControlName="minQuantity" class="form-input" [class.has-value]="hasValue('minQuantity')" min="0" [disabled]="isSaveLoading()" />
                <label for="productMinQuantity" class="form-label">Kritik Seviye</label>
                @if (isFieldInvalid('minQuantity')) { <div class="form-error">⚠ Geçerli bir değer girin.</div> }
              </div>

              <div class="form-field">
                <input id="productImageUrl" type="text" formControlName="imageUrl" class="form-input" [class.has-value]="hasValue('imageUrl')" [disabled]="isSaveLoading()" />
                <label for="productImageUrl" class="form-label">Görsel Linki (Opsiyonel)</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeProductForm()" [disabled]="isSaveLoading()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="productForm.invalid || productForm.pristine || isSaveLoading()">
                @if (isSaveLoading()) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { Kaydet }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ─── Delete Confirmation Modal ─── -->
    @if (showDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteProduct()" [disabled]="isDeleteLoading()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">Ürünü Sil</h3>
            <p class="delete-modal-desc">
              <strong>{{ productToDelete()?.name }}</strong> adlı ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteProduct()" [disabled]="isDeleteLoading()">Vazgeç</button>
            <button class="btn btn-danger" (click)="confirmDeleteProduct()" [disabled]="isDeleteLoading()">
              @if (isDeleteLoading()) { <span class="spinner-sm spinner-light"></span> Siliniyor... } @else { Sil }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Bulk Actions Bar ─── -->
    @if (selectedProductIds().length > 0) {
      <div class="bulk-actions-bar">
        <div class="bulk-info">
          <strong>{{ selectedProductIds().length }}</strong> ürün seçildi
        </div>
        <div class="bulk-buttons">
          <div class="bulk-category-select-wrapper">
            <button class="btn btn-outline-light" (click)="toggleBulkCategoryDropdown($event)">
              Kategori Değiştir
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
          <button class="btn btn-danger-dark" (click)="promptBulkDelete()">
            Seçilenleri Sil
          </button>
          <button class="btn btn-ghost-light" (click)="clearSelection()">
            Vazgeç
          </button>
        </div>
      </div>
    }

    <!-- ─── Bulk Delete Confirmation Modal ─── -->
    @if (showBulkDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelBulkDelete()" [disabled]="isBulkDeleteLoading()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">Seçili Ürünleri Sil</h3>
            <p class="delete-modal-desc">
              Seçilen <strong>{{ selectedProductIds().length }}</strong> ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelBulkDelete()" [disabled]="isBulkDeleteLoading()">Vazgeç</button>
            <button class="btn btn-danger" (click)="confirmBulkDelete()" [disabled]="isBulkDeleteLoading()">
              @if (isBulkDeleteLoading()) { <span class="spinner-sm spinner-light"></span> Siliniyor... } @else { Sil }
            </button>
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

    <!-- ─── Warehouse Stock Transfer Modal ─── -->
    <app-modal [isOpen]="isTransferModalOpen()" title="Depolar Arası Stok Transferi" (onClose)="closeTransferModal()">
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <p style="font-size: 13px; color: var(--text-muted, #6b7280);">
          Seçilen ürün: <strong style="color: var(--text-primary);">{{ selectedProductForTransfer()?.name }}</strong> (SKU: {{ selectedProductForTransfer()?.sku }})
        </p>

        <!-- Kaynak Depo Seçimi -->
        <div class="form-field-standalone" style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 12px; font-weight: 600; color: var(--text-primary); text-align: left;">Kaynak Depo</label>
          <select [(ngModel)]="transferFromWarehouse" (change)="onTransferFromWarehouseChange()" style="width: 100%; padding: 10px; border: 1.5px solid var(--secondary, #e5e7eb); border-radius: 8px; background: var(--surface, #fff); color: var(--text-primary); outline: none;">
            <option value="" disabled selected>Depo Seçin</option>
            @for (wh of availableFromWarehouses(); track wh.name) {
              <option [value]="wh.name">{{ wh.name }} (Mevcut: {{ wh.qty }})</option>
            }
          </select>
        </div>

        <!-- Hedef Depo Seçimi -->
        <div class="form-field-standalone" style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 12px; font-weight: 600; color: var(--text-primary); text-align: left;">Hedef Depo</label>
          <select [(ngModel)]="transferToWarehouse" style="width: 100%; padding: 10px; border: 1.5px solid var(--secondary, #e5e7eb); border-radius: 8px; background: var(--surface, #fff); color: var(--text-primary); outline: none;">
            <option value="" disabled selected>Depo Seçin</option>
            @for (wh of availableToWarehouses(); track wh) {
              <option [value]="wh">{{ wh }}</option>
            }
          </select>
        </div>

        <!-- Miktar Girişi -->
        <div class="form-field-standalone" style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 12px; font-weight: 600; color: var(--text-primary); text-align: left;">Transfer Edilecek Miktar</label>
          <input type="number" [(ngModel)]="transferQuantity" min="1" [max]="maxTransferQuantity()" style="width: 100%; padding: 10px; border: 1.5px solid var(--secondary, #e5e7eb); border-radius: 8px; background: var(--surface, #fff); color: var(--text-primary); outline: none;" />
          @if (maxTransferQuantity() > 0) {
            <span style="font-size: 11px; color: var(--text-muted);">Maksimum transfer edilebilir: {{ maxTransferQuantity() }}</span>
          }
        </div>

        <!-- Hata ve Bilgi Mesajı -->
        @if (transferError()) {
          <div style="font-size: 12px; color: #dc2626; padding: 10px; background: rgba(220, 38, 38, 0.05); border: 1px solid rgba(220, 38, 38, 0.15); border-radius: 6px; display: flex; align-items: center; gap: 6px;">
            <span>⚠ {{ transferError() }}</span>
          </div>
        }
      </div>

      <!-- Modal Footer Action Buttons -->
      <div footer style="display: flex; gap: 8px; justify-content: flex-end; width: 100%;">
        <button class="btn btn-outline" (click)="closeTransferModal()" [disabled]="isTransferLoading()">Vazgeç</button>
        <button class="btn btn-primary" (click)="executeTransfer()" [disabled]="isTransferLoading() || !isTransferValid()">
          @if (isTransferLoading()) {
            Transfer Ediliyor...
          } @else {
            Transferi Tamamla
          }
        </button>
      </div>
    </app-modal>
  `
})
export class ProductsComponent {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);

  categories = signal<any[]>([]);

  isCategoryDropdownOpen = signal(false);
  productSortOption = signal<string>('default');

  // Scanner & Warehouse tooltip
  showScanner = signal(false);
  hoveredProductId = signal<string | null>(null);

  // Transfer warehouse stock states
  isTransferModalOpen = signal(false);
  selectedProductForTransfer = signal<Product | null>(null);
  transferFromWarehouse = '';
  transferToWarehouse = '';
  transferQuantity = 1;
  transferError = signal<string | null>(null);
  isTransferLoading = signal(false);

  availableFromWarehouses = computed(() => {
    const prod = this.selectedProductForTransfer();
    if (!prod || !prod.warehouses) return [];
    return Object.entries(prod.warehouses)
      .map(([name, qty]) => ({ name, qty: qty as number }))
      .filter(w => w.qty > 0);
  });

  availableToWarehouses = computed(() => {
    const prod = this.selectedProductForTransfer();
    if (!prod || !prod.warehouses) return [];
    const defaultWarehouses = ['Merkez Depo', 'Ataşehir Şube'];
    const currentKeys = Object.keys(prod.warehouses);
    const allUniqueWarehouses = Array.from(new Set([...defaultWarehouses, ...currentKeys]));
    
    return allUniqueWarehouses.filter(w => w !== this.transferFromWarehouse);
  });

  maxTransferQuantity = computed(() => {
    const prod = this.selectedProductForTransfer();
    if (!prod || !prod.warehouses || !this.transferFromWarehouse) return 0;
    return (prod.warehouses[this.transferFromWarehouse] as number) || 0;
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
  showBulkDeleteModal = signal(false);
  isBulkDeleteLoading = signal(false);

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
          this.ui.showToast(`${ids.length} ürünün kategorisi güncellendi.`, 'success');
          this.clearSelection();
        } else {
          this.ui.showToast('Kategoriler güncellenirken hata oluştu.', 'error');
        }
      },
      error: () => {
        this.ui.showToast('Kategoriler güncellenirken hata oluştu.', 'error');
      }
    });
  }

  promptBulkDelete() {
    this.showBulkDeleteModal.set(true);
  }

  cancelBulkDelete() {
    this.showBulkDeleteModal.set(false);
  }

  confirmBulkDelete() {
    const ids = this.selectedProductIds();
    if (ids.length === 0 || this.isBulkDeleteLoading()) return;
    this.isBulkDeleteLoading.set(true);

    this.inventoryService.bulkDeleteProducts(ids).subscribe({
      next: (res) => {
        if (res.success) {
          this.state.products.update(list => list.filter(p => !ids.includes(p.id)));
          this.ui.showToast(`${ids.length} ürün silindi.`, 'success');
          this.clearSelection();
        } else {
          this.ui.showToast('Ürünler silinirken hata oluştu.', 'error');
        }
        this.isBulkDeleteLoading.set(false);
        this.cancelBulkDelete();
      },
      error: () => {
        this.isBulkDeleteLoading.set(false);
        this.ui.showToast('Ürünler silinirken hata oluştu.', 'error');
        this.cancelBulkDelete();
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
    return this.categories().find(c => c.slug === value)?.name || value || 'Kategori Seçin...';
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
    if (!id) return 'Tedarikçi Seçilmedi';
    return this.suppliers().find(s => s.id === id)?.name || 'Tedarikçi Seçilmedi';
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
    imageUrl: ['']
  });

  showDeleteModal = signal(false);
  productToDelete = signal<Product | null>(null);
  isDeleteLoading = signal(false);

  // Filtering
  productSearch = signal('');
  productFilterStatus = signal<'all' | 'In stock' | 'Low stock' | 'Out of stock'>('all');

  filteredProducts = computed(() => {
    let list = this.state.products();
    const search = this.productSearch().toLowerCase().trim();
    const statusFilter = this.productFilterStatus();
    const sortOpt = this.productSortOption();

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
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    return list;
  });

  ngOnInit() {
    this.loadSuppliers();
    this.loadCategories();
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
    this.route.queryParams.subscribe(params => {
      this.productSearch.set(params['q'] || '');
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
      name: '', sku: '', category: defaultCat, price: 0, quantity: 0, minQuantity: 5, unit: 'Adet', supplierId: null, imageUrl: ''
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
      imageUrl: p.imageUrl || ''
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

    const payload = this.productForm.value;
    const editingId = this.editingProductId();

    if (editingId) {
      // Edit mode
      this.inventoryService.updateProduct(editingId, payload).subscribe({
        next: (updatedProd) => {
          this.state.products.update(list => list.map(p => p.id === editingId ? updatedProd : p));
          this.isSaveLoading.set(false);
          this.closeProductForm();
          this.ui.showToast('Ürün başarıyla güncellendi.', 'success');
        },
        error: () => {
          this.isSaveLoading.set(false);
          this.ui.showToast('Ürün güncellenirken hata oluştu.', 'error');
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
          this.ui.showToast('Ürün başarıyla eklendi.', 'success');
        },
        error: () => {
          this.isSaveLoading.set(false);
          this.ui.showToast('Ürün eklenirken hata oluştu.', 'error');
        }
      });
    }
  }

  // Delete Product
  promptDeleteProduct(product: Product) {
    this.productToDelete.set(product);
    this.showDeleteModal.set(true);
  }
  cancelDeleteProduct() {
    this.showDeleteModal.set(false);
    this.productToDelete.set(null);
  }
  confirmDeleteProduct() {
    const product = this.productToDelete();
    if (!product || this.isDeleteLoading()) return;
    this.isDeleteLoading.set(true);
    this.inventoryService.deleteProduct(product.id).subscribe({
      next: (res) => {
        if (res.success) {
          this.state.products.update(p => p.filter(prod => prod.id !== product.id));
          this.ui.showToast('Ürün başarıyla silindi.', 'success');
        }
        this.isDeleteLoading.set(false);
        this.cancelDeleteProduct();
      },
      error: () => {
        this.isDeleteLoading.set(false);
        this.ui.showToast('Ürün silinirken hata oluştu.', 'error');
        this.cancelDeleteProduct();
      }
    });
  }

  // Export to CSV
  exportToCSV() {
    const list = this.filteredProducts();
    if (!list || list.length === 0) {
      this.ui.showToast('Dışa aktarılacak ürün bulunamadı.', 'error');
      return;
    }

    const headers = ['Ürün Adı', 'SKU', 'Kategori', 'Birim Fiyat', 'Mevcut Stok', 'Kritik Seviye', 'Durum', 'Tedarikçi ID'];
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
    
    this.ui.showToast('Ürünler CSV olarak indirildi.', 'success');
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
        this.ui.showToast('Geçersiz veya boş CSV dosyası.', 'error');
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
            this.ui.showToast(`${newProducts.length} adet ürün başarıyla içe aktarıldı.`, 'success');
            this.state.loadData();
          },
          error: () => this.ui.showToast('İçe aktarma sırasında bir hata oluştu.', 'error')
        });
      } else {
        this.ui.showToast('Geçerli ürün bulunamadı.', 'error');
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
      this.ui.showToast(`Ürün bulundu: ${found.name} (${sku})`, 'success');
    } else {
      this.ui.showToast(`"${sku}" SKU ile ürün bulunamadı.`, 'error');
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
      this.ui.showToast('Yazdırılacak ürün bulunamadı.', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.ui.showToast('Pop-up engelleyici aktif. Lütfen izin verin.', 'error');
      return;
    }

    const rows = list.map(p => `
      <tr>
        <td>${p.name}</td>
        <td style="font-family: monospace;">${p.sku}</td>
        <td>${this.getCategoryName(p.category)}</td>
        <td style="text-align: right;">₺${p.price.toFixed(2)}</td>
        <td style="text-align: right; font-weight: 600;">${p.quantity} ${p.unit || 'Adet'}</td>
        <td style="text-align: right;">${p.minQuantity}</td>
        <td>${p.status === 'In stock' ? 'Stokta' : p.status === 'Low stock' ? 'Azalıyor' : 'Tükendi'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ecelon - Ürün Listesi</title>
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
        <h1>Ecelon — Ürün Listesi</h1>
        <p class="subtitle">Yazdırma Tarihi: ${new Date().toLocaleString('tr-TR')} | Toplam: ${list.length} ürün</p>
        <table>
          <thead>
            <tr>
              <th>Ürün Adı</th>
              <th>SKU</th>
              <th>Kategori</th>
              <th style="text-align:right">Birim Fiyat</th>
              <th style="text-align:right">Stok</th>
              <th style="text-align:right">Min. Limit</th>
              <th>Durum</th>
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
    this.transferQuantity = 1;
    this.transferToWarehouse = '';
  }

  isTransferValid(): boolean {
    const maxQty = this.maxTransferQuantity();
    return !!this.transferFromWarehouse && 
           !!this.transferToWarehouse && 
           this.transferQuantity > 0 && 
           this.transferQuantity <= maxQty;
  }

  openTransferModal(product: Product) {
    this.selectedProductForTransfer.set(product);
    this.transferFromWarehouse = '';
    this.transferToWarehouse = '';
    this.transferQuantity = 1;
    this.transferError.set(null);
    this.isTransferModalOpen.set(true);
  }

  closeTransferModal() {
    this.isTransferModalOpen.set(false);
    this.selectedProductForTransfer.set(null);
    this.transferFromWarehouse = '';
    this.transferToWarehouse = '';
    this.transferQuantity = 1;
    this.transferError.set(null);
  }

  executeTransfer() {
    const prod = this.selectedProductForTransfer();
    if (!prod || !this.isTransferValid()) return;

    this.isTransferLoading.set(true);
    this.transferError.set(null);

    this.inventoryService.transferWarehouseStock(
      prod.id,
      this.transferFromWarehouse,
      this.transferToWarehouse,
      this.transferQuantity
    ).subscribe({
      next: (res) => {
        this.isTransferLoading.set(false);
        if (res && res.success) {
          this.state.loadData();
          this.ui.showToast('Stok transferi başarıyla tamamlandı.', 'success');
          this.closeTransferModal();
        } else {
          this.transferError.set('Stok transferi gerçekleştirilemedi.');
        }
      },
      error: (err) => {
        this.isTransferLoading.set(false);
        this.transferError.set(err.error?.message || 'Transfer sırasında bir hata oluştu.');
      }
    });
  }
}
