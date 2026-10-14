import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormsModule } from '@angular/forms';
import { InventoryService, PurchaseOrderPayload, PurchaseOrderReceipt } from '../../inventory.service';
import { TaxRate, Warehouse, Product, BarcodeLookupResult, TrackingEntry } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs/operators';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'purchaseOrders.title' | t }}</h1>
        <p>{{ 'purchaseOrders.subtitle' | t }}</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          {{ 'purchaseOrders.new' | t }}
        </button>
        <div style="width: 1px; height: 20px; background-color: #D5D9D9; margin: 0 8px; align-self: center;"></div>
        <button class="btn btn-outline" (click)="autoDraft()" [disabled]="isAutoDrafting()" [title]="'purchaseOrders.autoDraftTooltip' | t">
          @if (isAutoDrafting()) {
            <span class="spinner-sm"></span> {{ 'purchaseOrders.analyzing' | t }}
          } @else {
            <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #9333ea; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            {{ 'purchaseOrders.autoDraft' | t }}
          }
        </button>
      </div>
    </header>

    <!-- Search & Filter Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" [placeholder]="'purchaseOrders.searchPlaceholder' | t" [ngModel]="poSearch()" (ngModelChange)="poSearch.set($event)"/>
      </div>
      
      <div class="date-filters">
        <input type="date" class="date-input" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" [title]="'purchaseOrders.startDate' | t" />
        <span class="date-separator">-</span>
        <input type="date" class="date-input" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" [title]="'purchaseOrders.endDate' | t" />
        @if (startDate() || endDate()) {
          <button class="btn-clear" (click)="startDate.set(''); endDate.set('')" [title]="'purchaseOrders.clearFilter' | t">✕</button>
        }
      </div>

      <div class="filter-pills">
        <button class="filter-pill" [class.active]="poFilterStatus() === 'all'" (click)="poFilterStatus.set('all')">{{ 'purchaseOrders.filter.all' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Draft'" (click)="poFilterStatus.set('Draft')">{{ 'purchaseOrders.filter.draft' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Sent'" (click)="poFilterStatus.set('Sent')">{{ 'purchaseOrders.filter.sent' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Received'" (click)="poFilterStatus.set('Received')">{{ 'purchaseOrders.filter.received' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Cancelled'" (click)="poFilterStatus.set('Cancelled')">{{ 'purchaseOrders.filter.cancelled' | t }}</button>
      </div>
    </div>

    @if (isLoading()) {
      <div class="loading-state" style="padding: 3rem; text-align: center; color: #565959;">{{ 'common.loading' | t }}</div>
    } @else if (filteredOrders().length === 0) {
      <div class="empty-state" style="padding: 3rem; text-align: center; border: 1px dashed #D5D9D9; border-radius: 8px; background: #FFFFFF; width: 100%;">
        <p style="font-size: 15px; color: #565959; margin-bottom: 16px;">{{ 'purchaseOrders.noResults' | t }}</p>
        <button class="btn btn-outline" (click)="openDrawer()">{{ 'purchaseOrders.create' | t }}</button>
      </div>
    } @else {
      <!-- Result Cards Stack (Ecelon layout) -->
      <div class="orders-list-stack" style="display: flex; flex-direction: column; gap: 1rem;">
        @for (o of filteredOrders(); track o.id) {
          <div class="ecelon-order-card" style="border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: var(--surface-card); font-size: 0.875rem;">
            <!-- Header Bar (Light Grey background) -->
            <div class="order-card-header" style="background-color: #F0F2F2; border-bottom: 1px solid #D5D9D9; padding: 12px 18px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; color: #565959;">
              <div style="display: flex; gap: 2.5rem; flex-wrap: wrap;">
                <div>
                  <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">{{ 'purchaseOrders.orderDate' | t }}</div>
                  <div style="color: #0F1111; font-weight: 500;">{{ o.createdAt | appDate }}</div>
                </div>
                <div>
                  <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">{{ 'purchaseOrders.totalAmount' | t }}</div>
                  <div style="color: #0F1111; font-weight: bold; font-family: var(--font-mono);">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</div>
                </div>
                <div>
                  <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">{{ 'purchaseOrders.supplier' | t }}</div>
                  <div style="color: #0F1111; font-weight: 500;">{{ o.supplierName }}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: bold; text-transform: none; margin-bottom: 2px; color: #0F1111;">{{ 'purchaseOrders.poNo' | t: { no: formatPoNumber(o.poNumber) } }}</div>
                <div>
                  <a href="#" (click)="openDetailDrawer(o); $event.preventDefault()" style="color: #007185; text-decoration: none; font-weight: 500;" onmouseover="this.style.color='#C45500'" onmouseout="this.style.color='#007185'">{{ 'purchaseOrders.orderDetails' | t }}</a>
                </div>
              </div>
            </div>

            <!-- Body (White background) -->
            <div class="order-card-body" style="padding: 16px 18px; display: flex; justify-content: space-between; align-items: start; gap: 1.5rem; flex-wrap: wrap;">
              <!-- Left: Items list -->
              <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 250px;">
                <h4 style="margin: 0; font-size: 14px; font-weight: bold; color: #0F1111; display: flex; align-items: center; gap: 8px;">
                  <!-- Status badge -->
                  <span class="badge" [class.badge-instock]="o.status === 'Received'" [class.badge-lowstock]="o.status === 'Draft' || o.status === 'Sent'" [class.badge-outstock]="o.status === 'Cancelled'">
                    {{ getStatusName(o.status) }}
                  </span>
                </h4>
                
                <!-- Item detail rows -->
                <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                  @for (item of getGroupedItems(o.items); track item.key) {
                    <div style="display: flex; justify-content: space-between; width: 100%; max-width: 550px; font-size: 13px;">
                      <span style="color: #0F1111; font-weight: 500;">
                        {{ item.productName }} — {{ 'purchaseOrders.itemLine' | t: { qty: qtyLabel(item), price: (item.price | money: o.currency), total: (item.lineTotal | money: o.currency) } }}
                      </span>
                    </div>
                  }
                </div>

                <!-- Notes/Expected date -->
                @if (o.expectedDate || o.notes) {
                  <div style="margin-top: 10px; font-size: 12px; color: #565959; background: #F7FAFA; border: 1px solid #D5D9D9; border-radius: 4px; padding: 6px 12px; display: inline-block; max-width: 450px;">
                    @if (o.expectedDate) {
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 4px; color: #565959;"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>{{ 'purchaseOrders.expectedDate' | t }}: <strong>{{ o.expectedDate | appDate }}</strong>
                    }
                    @if (o.expectedDate && o.notes) { <span style="margin: 0 8px;">|</span> }
                    @if (o.notes) {
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 4px; color: #565959;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>{{ 'purchaseOrders.notes' | t }}: <em>{{ o.notes }}</em>
                    }
                  </div>
                }
              </div>

              <!-- Right: Actions buttons -->
              <div style="display: flex; flex-direction: column; gap: 8px; width: 160px; flex-shrink: 0;" (click)="$event.stopPropagation()">
                @if (o.status === 'Draft') {
                  <button class="btn btn-primary btn-sm" (click)="sendPurchaseOrder(o)" style="width: 100%; border-radius: 20px;">
                    {{ 'purchaseOrders.send' | t }}
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="editPurchaseOrder(o)" style="width: 100%; border-radius: 20px;">
                    {{ 'common.edit' | t }}
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="deletePurchaseOrder(o)" style="width: 100%; border-radius: 20px; color: #B12704; border-color: rgba(220,38,38,0.2);">
                    {{ 'common.delete' | t }}
                  </button>
                } @else if (o.status === 'Sent') {
                  <button class="btn btn-primary btn-sm" (click)="receivePurchaseOrder(o)" style="width: 100%; border-radius: 20px; background-color: #007185; color: #fff; border-color: #005a6a;">
                    {{ 'purchaseOrders.receive' | t }}
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="cancelPurchaseOrder(o)" style="width: 100%; border-radius: 20px; color: #B12704; border-color: rgba(220,38,38,0.2);">
                    {{ 'purchaseOrders.cancelOrder' | t }}
                  </button>
                } @else if (o.status === 'Cancelled') {
                  <button class="btn btn-secondary btn-sm" (click)="deletePurchaseOrder(o)" style="width: 100%; border-radius: 20px; color: #B12704; border-color: rgba(220,38,38,0.2);">
                    {{ 'common.delete' | t }}
                  </button>
                }
              </div>
            </div>
          </div>
        }
      </div>
    }

    <!-- New Order Drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editingPoId() ? 'purchaseOrders.editTitle' : 'purchaseOrders.newTitle') | t }}</span>
            <button class="drawer-close" (click)="closeDrawer()">×</button>
          </div>

          <form [formGroup]="poForm" (ngSubmit)="savePo()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <select formControlName="supplierId" class="form-input form-select" [class.has-value]="hasValue('supplierId')" (change)="onSupplierChange()">
                  <option value="" disabled selected></option>
                  @for (s of suppliers(); track s.id) {
                    <option [value]="s.id">{{ s.name }}</option>
                  }
                </select>
                <label class="form-label">{{ 'purchaseOrders.supplier' | t }}</label>
                @if (isFieldInvalid('supplierId')) { <div class="form-error">⚠ {{ 'purchaseOrders.supplierRequired' | t }}</div> }
              </div>

              <div style="display:flex; gap:12px;">
                <div class="form-field" style="flex:1;">
                  <select formControlName="currency" class="form-input form-select has-value">
                    @for (c of currencies(); track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                  <label class="form-label">{{ 'finance.currency' | t }}</label>
                </div>
                <div class="form-field" style="flex:1;">
                  <select formControlName="warehouseId" class="form-input form-select has-value">
                    <option value="">{{ 'purchaseOrders.defaultWarehouse' | t }}</option>
                    @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                  </select>
                  <label class="form-label">{{ 'purchaseOrders.receivingWarehouse' | t }}</label>
                </div>
              </div>
              <div class="text-muted" style="font-size:12px; margin:-6px 0 12px;">{{ (pricesIncludeTax() ? 'finance.pricesIncludeTax' : 'finance.pricesExcludeTax') | t }}</div>

              <div class="form-field">
                <input type="date" formControlName="expectedDate" class="form-input has-value" />
                <label class="form-label">{{ 'purchaseOrders.expectedDate' | t }}</label>
              </div>

              <div class="form-field">
                <textarea formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')"></textarea>
                <label class="form-label">{{ 'purchaseOrders.notes' | t }}</label>
              </div>

              <div style="margin-top: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0;">{{ 'purchaseOrders.orderItems' | t }}</h3>
                  <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn btn-sm btn-outline" (click)="openLineScanner()" [disabled]="scanning()">
                      @if (scanning()) { <span class="spinner-sm"></span> } {{ 'purchaseOrders.scan' | t }}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline" (click)="addItem()">+ {{ 'purchaseOrders.addProduct' | t }}</button>
                  </div>
                </div>

                <div formArrayName="items" style="display: flex; flex-direction: column; gap: 10px;">
                  @for (item of itemsArray.controls; track i; let i = $index) {
                    <div [formGroupName]="i" [style.outline]="highlightIndex() === i ? '2px solid var(--primary)' : null" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px; background: var(--canvas); border: 1px solid var(--secondary); border-radius: 8px;">
                      <div style="flex: 2;">
                        <select formControlName="productId" class="form-input form-select" (change)="onProductChange(i)" style="height: 40px; padding: 0 12px; font-size: 13px;">
                          <option value="" disabled selected>{{ 'purchaseOrders.selectProduct' | t }}</option>
                          @for (p of state.products(); track p.id) {
                            <option [value]="p.id">{{ p.name }} ({{ 'purchaseOrders.available' | t: { n: p.quantity } }})</option>
                          }
                        </select>
                      </div>
                      <div style="flex: 1;">
                        <input type="number" formControlName="quantity" class="form-input" style="height: 40px; padding: 0 12px; font-size: 13px;" [placeholder]="'purchaseOrders.quantity' | t" min="1" />
                      </div>
                      @if (productById(item.get('productId')?.value); as lp) {
                        @if (lp.units?.length) {
                          <div style="flex: 0.9;">
                            <select formControlName="unitId" class="form-input form-select" style="height: 40px; padding: 0 8px; font-size: 13px;" (change)="onUnitChange(i)" [title]="'purchaseOrders.unit' | t">
                              <option value="">{{ (lp.baseUnit || lp.unit || 'pcs') | unitLabel }}</option>
                              @for (u of lp.units; track u.unitId) {
                                <option [value]="u.unitId">{{ (u.unit || u.unitId) | unitLabel }} (×{{ u.factor | num }})</option>
                              }
                            </select>
                          </div>
                        }
                      }
                      <div style="flex: 1;">
                        <input type="number" formControlName="unitPrice" class="form-input" style="height: 40px; padding: 0 12px; font-size: 13px;" [placeholder]="'finance.unitPrice' | t" min="0" step="0.01" [title]="'finance.unitPrice' | t" />
                      </div>
                      <button type="button" class="delete-btn" (click)="removeItem(i)" style="padding: 6px;">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                      @if (preview().lines[i]; as ln) {
                        <div style="flex-basis:100%; font-size:12px; color:#565959; display:flex; gap:12px; flex-wrap:wrap;">
                          @if (factorFor(item.get('productId')?.value, item.get('unitId')?.value) !== 1) {
                            <span>{{ 'purchaseOrders.baseQtyHint' | t: { qty: ((item.get('quantity')?.value || 0) * factorFor(item.get('productId')?.value, item.get('unitId')?.value) | num), unit: (baseUnitOf(item.get('productId')?.value) | unitLabel) } }}</span>
                          }
                          @if (ln.hasPrice) {
                            <span>{{ 'finance.taxRate' | t }}: {{ ln.rate | num }}%</span>
                            <span>{{ 'finance.taxAmount' | t }}: {{ ln.tax | money: formCurrency() }}</span>
                            <span>{{ 'finance.lineTotal' | t }}: <strong>{{ ln.gross | money: formCurrency() }}</strong></span>
                          } @else if (ln.productId) {
                            <span>{{ 'purchaseOrders.serverPriceHint' | t }}</span>
                          }
                        </div>
                      }
                    </div>
                  }
                  @if (itemsArray.length > 0) {
                    <div style="padding:12px; border:1px solid var(--secondary); border-radius:8px; font-size:13px; display:flex; flex-direction:column; gap:4px;">
                      <div style="display:flex; justify-content:space-between;"><span>{{ 'finance.subtotal' | t }}</span><span>{{ preview().subtotal | money: formCurrency() }}</span></div>
                      @for (b of preview().breakdown; track b.rate) {
                        <div style="display:flex; justify-content:space-between; color:#565959;"><span>{{ 'finance.taxLine' | t: { rate: (b.rate | num), base: (b.base | money: formCurrency()) } }}</span><span>{{ b.tax | money: formCurrency() }}</span></div>
                      }
                      <div style="display:flex; justify-content:space-between; font-weight:700;"><span>{{ 'finance.grandTotal' | t }}</span><span>{{ preview().total | money: formCurrency() }}</span></div>
                      @if (preview().incomplete) { <div class="text-muted" style="font-size:12px;">{{ 'purchaseOrders.previewIncomplete' | t }}</div> }
                    </div>
                  }
                  @if (itemsArray.length === 0) {
                    <div class="text-muted text-sm" style="text-align: center; padding: 16px; background: var(--canvas); border-radius: 8px; border: 1px dashed var(--secondary);">{{ 'purchaseOrders.noItems' | t }}</div>
                  }
                </div>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="poForm.invalid || itemsArray.length === 0 || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'purchaseOrders.saving' | t }} } @else { {{ (editingPoId() ? 'purchaseOrders.update' : 'purchaseOrders.createBtn') | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Detail Drawer -->
    @if (detailOrder()) {
      <div class="drawer-overlay" (click)="closeDetailDrawer()">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div>
              <span class="drawer-title">{{ 'purchaseOrders.detailTitle' | t }}</span>
              <span class="text-muted" style="font-size:12px; display:block; margin-top:2px;">{{ 'purchaseOrders.poNo' | t: { no: formatPoNumber(detailOrder().poNumber) } }}</span>
            </div>
            <button class="drawer-close" (click)="closeDetailDrawer()">×</button>
          </div>
          <div class="drawer-body">
            <div class="detail-grid">
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.supplier' | t }}</span>
                <span class="detail-value">{{ detailOrder().supplierName }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.status' | t }}</span>
                <div>
                  <span class="badge" [ngClass]="getBadgeClass(detailOrder().status)">{{ getStatusName(detailOrder().status) }}</span>
                </div>
              </div>
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.createdAt' | t }}</span>
                <span class="detail-value mono">{{ detailOrder().createdAt | appDate: 'datetime' }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.expectedDate' | t }}</span>
                <span class="detail-value mono">{{ detailOrder().expectedDate ? (detailOrder().expectedDate | appDate) : '-' }}</span>
              </div>
            </div>
            
            <h3 class="detail-items-title">{{ 'purchaseOrders.items' | t }}</h3>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              @for (item of getGroupedItems(detailOrder().items); track item.key) {
                <div class="detail-item-row" style="flex-wrap: wrap;">
                  <span class="detail-item-name">
                    {{ item.productName }}
                  </span>
                  <span class="detail-item-qty" style="font-size: 13px; font-weight: normal; color: #565959; text-align:right;">
                    {{ 'purchaseOrders.itemQtyPrice' | t: { qty: qtyLabel(item), price: (item.price | money: detailOrder().currency) } }}
                    · {{ 'finance.taxRate' | t }} {{ item.taxRate | num }}% · {{ 'finance.tax' | t }} {{ item.taxAmount | money: detailOrder().currency }}
                    = <strong style="color: #0f1111; font-weight: bold;">{{ item.lineTotal | money: detailOrder().currency }}</strong>
                  </span>
                  @if (item.tracking.length) {
                    <div style="flex-basis: 100%; font-size: 12px; color: #565959; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
                      @for (tr of item.tracking; track $index) {
                        <span>
                          @if (tr.lotNumber) {
                            {{ 'purchaseOrders.tracking.lotLine' | t: { lot: tr.lotNumber, qty: (tr.quantity | num) } }}
                            @if (tr.expiryDate) { · {{ 'purchaseOrders.tracking.expiry' | t }}: {{ tr.expiryDate | appDate }} }
                          }
                          @if (tr.serials?.length) {
                            {{ 'purchaseOrders.tracking.serials' | t }}: <span class="mono">{{ tr.serials.join(', ') }}</span>
                          }
                        </span>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            
            <div style="margin-top:12px; padding:12px 16px; border:1px solid var(--secondary); border-radius:8px; font-size:13px; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between;"><span>{{ 'finance.subtotal' | t }}</span><span>{{ detailTotals().subtotal | money: detailOrder().currency }}</span></div>
              @for (b of detailTotals().breakdown; track b.rate) {
                <div style="display:flex; justify-content:space-between; color:#565959;"><span>{{ 'finance.taxLine' | t: { rate: (b.rate | num), base: (b.base | money: detailOrder().currency) } }}</span><span>{{ b.tax | money: detailOrder().currency }}</span></div>
              }
              <div style="display:flex; justify-content:space-between; font-weight:700;"><span>{{ 'finance.grandTotal' | t }}</span><span>{{ detailTotals().total | money: detailOrder().currency }}</span></div>
              @if (detailOrder().currency && detailOrder().currency !== i18n.currency()) {
                <div style="display:flex; justify-content:space-between; color:#565959;"><span>{{ 'finance.inBaseCurrency' | t: { currency: i18n.currency() } }}</span><span>{{ (detailTotals().total * (detailOrder().exchangeRate ?? 1)) | money }}</span></div>
                <div class="text-muted" style="font-size:12px;">{{ 'finance.exchangeRateNote' | t: { from: detailOrder().currency, rate: ((detailOrder().exchangeRate ?? 1) | num), to: i18n.currency() } }}</div>
              }
              @if (warehouseName(detailOrder().warehouseId); as wn) {
                <div class="text-muted" style="font-size:12px;">{{ 'purchaseOrders.receivingWarehouse' | t }}: {{ wn }}</div>
              }
            </div>

            @if (detailOrder().notes) {
              <div style="margin-top: 24px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">{{ 'purchaseOrders.notes' | t }}</h3>
                <p class="text-muted" style="font-size:14px; line-height:1.5; background: var(--canvas); padding: 12px; border-radius: 8px; border: 1px solid var(--secondary);">{{ detailOrder().notes }}</p>
              </div>
            }

            @if (detailOrder().status === 'Received') {
              <div style="margin-top: 24px; padding: 12px; border-radius: 8px; background-color: rgba(5, 150, 105, 0.08); border: 1px solid rgba(5, 150, 105, 0.2); display: flex; align-items: center; gap: 8px; color: var(--status-instock); font-weight: 500; font-size: 0.88rem;">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {{ 'purchaseOrders.receivedInfo' | t }}
              </div>
            } @else if (detailOrder().status === 'Cancelled') {
              <div style="margin-top: 24px; padding: 12px; border-radius: 8px; background-color: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.2); display: flex; align-items: center; gap: 8px; color: var(--status-outstock); font-weight: 500; font-size: 0.88rem;">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {{ 'purchaseOrders.cancelledInfo' | t }}
              </div>
            }
          </div>
          <div class="drawer-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary" (click)="closeDetailDrawer()">{{ 'common.close' | t }}</button>
            @if (detailOrder().status === 'Draft') {
              <button class="btn btn-danger" (click)="deletePurchaseOrder(detailOrder())">{{ 'common.delete' | t }}</button>
              <button class="btn btn-outline" (click)="editPurchaseOrder(detailOrder())">{{ 'common.edit' | t }}</button>
              <button class="btn btn-primary" (click)="sendPurchaseOrder(detailOrder())">{{ 'purchaseOrders.send' | t }}</button>
            } @else if (detailOrder().status === 'Sent') {
              <button class="btn btn-danger" (click)="cancelPurchaseOrder(detailOrder())">{{ 'purchaseOrders.cancelOrder' | t }}</button>
              <button class="btn btn-primary" (click)="receivePurchaseOrder(detailOrder())">{{ 'purchaseOrders.receive' | t }}</button>
            } @else if (detailOrder().status === 'Cancelled') {
              <button class="btn btn-danger" (click)="deletePurchaseOrder(detailOrder())">{{ 'common.delete' | t }}</button>
            }
          </div>
        </div>
      </div>
    }
    
    @if (receiveTarget()) {
      <div class="drawer-overlay" (click)="receiveTarget.set(null)" style="display:flex; align-items:center; justify-content:center;">
        <div (click)="$event.stopPropagation()" style="background:var(--surface-card, #fff); border-radius:12px; padding:20px; width:min(receiveLines().length ? 640px : 420px, calc(100vw - 32px)); display:flex; flex-direction:column; gap:12px;">
          <h3 style="margin:0; font-size:16px;">{{ 'purchaseOrders.receive' | t }}</h3>
          <p style="margin:0; font-size:13px; color:#565959;">{{ 'purchaseOrders.receiveMessage' | t: { no: formatPoNumber(receiveTarget().poNumber) } }}</p>
          <label style="font-size:12px; font-weight:600;">{{ 'purchaseOrders.receivingWarehouse' | t }}</label>
          <select class="form-input form-select" [ngModel]="receiveWarehouseId()" (ngModelChange)="receiveWarehouseId.set($event)">
            <option value="">{{ 'purchaseOrders.defaultWarehouse' | t }}</option>
            @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
          </select>
          @if (receiveLines().length) {
            <div style="font-size:12px; color:#565959;">{{ 'purchaseOrders.receiveDialog.trackedInfo' | t }}</div>
            <div style="display:flex; flex-direction:column; gap:12px; max-height:55vh; overflow-y:auto;">
              @for (rl of receiveLines(); track rl.itemId) {
                <div style="border:1px solid var(--secondary); border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:6px; font-size:12px;">
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <strong style="font-size:13px;">{{ rl.productName }}</strong>
                    <span [style.color]="receiveLineValid(rl) ? 'var(--status-instock)' : 'var(--status-outstock)'">
                      {{ 'purchaseOrders.receiveDialog.progress' | t: { entered: receiveLineCount(rl), total: rl.quantity } }}
                    </span>
                  </div>
                  @if (rl.trackingType === 'lot') {
                    @for (lot of rl.lots; track $index; let li = $index) {
                      <div style="display:flex; gap:6px; align-items:center;">
                        <input class="form-input" style="flex:2; height:32px; padding:0 8px; font-size:12px;" [placeholder]="'purchaseOrders.receiveDialog.lotNumber' | t" [(ngModel)]="lot.lotNumber" (ngModelChange)="touchReceive()"/>
                        <input type="date" class="form-input" style="flex:1.6; height:32px; padding:0 8px; font-size:12px;" [title]="'purchaseOrders.receiveDialog.expiryDate' | t" [(ngModel)]="lot.expiryDate" (ngModelChange)="touchReceive()"/>
                        <input type="number" min="1" class="form-input" style="flex:1; height:32px; padding:0 8px; font-size:12px;" [placeholder]="'purchaseOrders.receiveDialog.quantity' | t" [(ngModel)]="lot.quantity" (ngModelChange)="touchReceive()"/>
                        <button type="button" class="delete-btn" style="padding:4px;" (click)="removeReceiveLot(rl, li)" [disabled]="rl.lots.length <= 1">×</button>
                      </div>
                    }
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <button type="button" class="btn btn-sm btn-outline" (click)="addReceiveLot(rl)">+ {{ 'purchaseOrders.receiveDialog.addLot' | t }}</button>
                      @if (rl.hasExpiry) { <span>{{ 'purchaseOrders.receiveDialog.expiryRequired' | t }}</span> }
                    </div>
                  } @else {
                    <textarea class="form-input" rows="4" style="font-family:var(--font-mono); font-size:12px; padding:6px 8px;" [placeholder]="'purchaseOrders.receiveDialog.serialsPlaceholder' | t" [(ngModel)]="rl.serialsText" (ngModelChange)="touchReceive()"></textarea>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <button type="button" class="btn btn-sm btn-outline" (click)="openSerialScanner(rl.itemId)">{{ 'purchaseOrders.receiveDialog.scanSerial' | t }}</button>
                      @if (hasDuplicateSerials(rl)) { <span style="color:var(--status-outstock);">{{ 'purchaseOrders.receiveDialog.duplicateSerials' | t }}</span> }
                    </div>
                  }
                </div>
              }
            </div>
          }
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" (click)="receiveTarget.set(null)">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" [disabled]="isSaving() || !receiveValid()" (click)="confirmReceive()">{{ 'purchaseOrders.receive' | t }}</button>
          </div>
        </div>
      </div>
    }

    @if (scannerMode()) {
      <app-barcode-scanner
        [products]="state.products()"
        (scanResult)="onBarcodeScanned($event)"
        (closeScanner)="scannerMode.set(null)"
      />
    }

    <app-toast></app-toast>
  `,
  styles: [`
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      background: var(--canvas);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--secondary);
    }
    .detail-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .detail-label {
      font-family: var(--font-heading);
      font-size: 11px;
      font-weight: 700;
      text-transform: none;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .detail-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .detail-items-title {
      font-family: var(--font-heading);
      font-size: 14px;
      font-weight: 700;
      margin-top: 24px;
      margin-bottom: 12px;
      color: var(--text-primary);
      border-bottom: 1px solid var(--secondary);
      padding-bottom: 8px;
    }
    .detail-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #fff;
      border-radius: 8px;
      border: 1px solid var(--secondary);
      transition: box-shadow 0.15s ease;
    }
    .detail-item-row:hover {
      box-shadow: var(--shadow-sm);
    }
    .detail-item-name {
      font-weight: 600;
      font-size: 14px;
    }
    .detail-item-qty {
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--text-muted);
    }
  `]
})
export class PurchaseOrdersComponent implements OnInit {
  inventory = inject(InventoryService);
  state = inject(AppStateService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  orders = signal<any[]>([]);
  suppliers = signal<any[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  isAutoDrafting = signal(false);
  detailOrder = signal<any>(null);
  editingPoId = signal<string | null>(null);
  taxRates = signal<TaxRate[]>([]);
  warehouses = signal<Warehouse[]>([]);
  receiveTarget = signal<any>(null);
  receiveWarehouseId = signal<string>('');
  private formValue = signal<any>(null);

  pricesIncludeTax = computed(() => !!this.ui.userProfile()?.company?.pricesIncludeTax);
  currencies = computed(() => Array.from(new Set([this.i18n.currency(), 'TRY', 'USD', 'EUR', 'GBP'])));
  formCurrency = computed(() => this.formValue()?.currency || this.i18n.currency());
  defaultWarehouseId = computed(() => this.warehouses().find(w => w.isDefault)?.id || '');

  preview = computed(() => {
    const v = this.formValue();
    const lines = (v?.items || []).map((it: any) => {
      const hasPrice = it.unitPrice !== null && it.unitPrice !== '' && it.unitPrice !== undefined && !isNaN(Number(it.unitPrice));
      const res = this.calcLine(it.productId, Number(it.quantity) || 0, hasPrice ? Number(it.unitPrice) : 0);
      return { ...res, productId: it.productId, hasPrice };
    });
    const priced = lines.filter((l: any) => l.hasPrice && l.productId);
    return {
      lines,
      ...this.summarize(priced.map((l: any) => ({ rate: l.rate, net: l.net, tax: l.tax }))),
      incomplete: lines.some((l: any) => l.productId && !l.hasPrice)
    };
  });

  detailTotals = computed(() => {
    const o = this.detailOrder();
    if (!o) return { subtotal: 0, total: 0, breakdown: [] as { rate: number; base: number; tax: number }[] };
    const s = this.summarize((o.items || []).map((it: any) => {
      const tax = Number(it.taxAmount) || 0;
      const gross = Number(it.lineTotal ?? 0);
      return { rate: Number(it.taxRate) || 0, net: this.round(gross - tax), tax };
    }));
    return {
      subtotal: o.subtotal ?? s.subtotal,
      total: o.grandTotal ?? o.totalAmount ?? s.total,
      breakdown: s.breakdown
    };
  });

  private round(n: number) { return Math.round(n * 100) / 100; }

  private taxRateFor(productId: string): number {
    const p: any = this.state.products().find(x => x.id === productId);
    const rates = this.taxRates();
    const r = (p?.taxRateId && rates.find(t => t.id === p.taxRateId)) || rates.find(t => t.isDefault);
    return r ? Number(r.rate) || 0 : 0;
  }

  private calcLine(productId: string, qty: number, price: number) {
    const rate = productId ? this.taxRateFor(productId) : 0;
    let net: number, tax: number, gross: number;
    if (this.pricesIncludeTax()) {
      gross = this.round(price * qty);
      net = this.round(gross / (1 + rate / 100));
      tax = this.round(gross - net);
    } else {
      net = this.round(price * qty);
      tax = this.round(net * rate / 100);
      gross = this.round(net + tax);
    }
    return { rate, net, tax, gross };
  }

  private summarize(lines: { rate: number; net: number; tax: number }[]) {
    const map = new Map<number, { rate: number; base: number; tax: number }>();
    let subtotal = 0, taxTotal = 0;
    for (const l of lines) {
      subtotal += l.net; taxTotal += l.tax;
      const e = map.get(l.rate) || { rate: l.rate, base: 0, tax: 0 };
      e.base = this.round(e.base + l.net); e.tax = this.round(e.tax + l.tax);
      map.set(l.rate, e);
    }
    subtotal = this.round(subtotal); taxTotal = this.round(taxTotal);
    return { subtotal, taxTotal, total: this.round(subtotal + taxTotal), breakdown: Array.from(map.values()).sort((a, b) => a.rate - b.rate) };
  }

  warehouseName(id?: string | null): string {
    return id ? (this.warehouses().find(w => w.id === id)?.name || '') : '';
  }

  /** Prefill unit price (per chosen unit) only when product currency matches PO currency */
  private suggestedPrice(productId: string, unitId?: string | null): number | null {
    const p: any = this.state.products().find(x => x.id === productId);
    if (!p) return null;
    const pc = p.currency || this.i18n.currency();
    return pc === this.formCurrency() ? this.round(Number(p.price) * this.factorFor(productId, unitId)) : null;
  }

  onProductChange(i: number) {
    const g = this.itemsArray.at(i);
    g.patchValue({ unitId: '' });
    g.patchValue({ unitPrice: this.suggestedPrice(g.get('productId')?.value) });
  }

  onUnitChange(i: number) {
    const g = this.itemsArray.at(i);
    g.patchValue({ unitPrice: this.suggestedPrice(g.get('productId')?.value, g.get('unitId')?.value) });
  }

  productById(id: string | null | undefined): Product | undefined {
    return id ? this.state.products().find(p => p.id === id) : undefined;
  }

  factorFor(productId: string | null | undefined, unitId: string | null | undefined): number {
    if (!unitId) return 1;
    const pu = this.productById(productId)?.units?.find(u => u.unitId === unitId);
    return pu ? Number(pu.factor) || 1 : 1;
  }

  baseUnitOf(productId: string | null | undefined): any {
    const p = this.productById(productId);
    return p?.baseUnit || p?.unit || 'pcs';
  }

  private unitLabelText(code: string): string {
    const key = `units.${code}`;
    const tr = this.i18n.t(key);
    return tr && tr !== key ? tr : code;
  }

  /** "3 Box (= 36)" for alternate-unit lines, else the base quantity */
  qtyLabel(item: any): string {
    const nf = (n: number) => this.i18n.formatNumber(n);
    if (item.unitFactor != null && Number(item.unitFactor) !== 1 && item.unitQuantity != null) {
      return `${nf(item.unitQuantity)} ${item.unitCode ? this.unitLabelText(item.unitCode) : ''} (= ${nf(item.quantity)})`;
    }
    return nf(item.quantity);
  }

  // ─── Barcode scanning ───
  scannerMode = signal<'line' | 'serial' | null>(null);
  scanning = signal(false);
  highlightIndex = signal<number | null>(null);
  private serialScanItemId: string | null = null;

  openLineScanner() {
    this.scannerMode.set('line');
  }

  openSerialScanner(itemId: string) {
    this.serialScanItemId = itemId;
    this.scannerMode.set('serial');
  }

  onBarcodeScanned(code: string) {
    const mode = this.scannerMode();
    this.scannerMode.set(null);
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    if (mode === 'serial') {
      const rl = this.receiveLines().find(l => l.itemId === this.serialScanItemId);
      if (!rl) return;
      const list = this.parseSerials(rl.serialsText);
      if (list.includes(trimmed)) {
        this.ui.showToast(this.i18n.t('purchaseOrders.receiveDialog.serialAlready', { serial: trimmed }), 'info');
        return;
      }
      rl.serialsText = [...list, trimmed].join('\n');
      this.touchReceive();
      return;
    }
    this.scanning.set(true);
    this.inventory.lookupBarcode(trimmed).subscribe({
      next: res => { this.scanning.set(false); this.applyLineScan(res); },
      error: () => {
        this.scanning.set(false);
        this.ui.showToast(this.i18n.t('purchaseOrders.scanNotFound', { code: trimmed }), 'error');
      }
    });
  }

  private applyLineScan(res: BarcodeLookupResult) {
    const productId = res.product.id;
    const unitId = res.unitId || '';
    let index = this.itemsArray.controls.findIndex(c => c.get('productId')?.value === productId && (c.get('unitId')?.value || '') === unitId);
    if (index !== -1) {
      const g = this.itemsArray.at(index);
      g.patchValue({ quantity: (Number(g.get('quantity')?.value) || 0) + 1 });
    } else {
      index = this.itemsArray.controls.findIndex(c => !c.get('productId')?.value);
      if (index === -1) { this.addItem(); index = this.itemsArray.length - 1; }
      this.itemsArray.at(index).patchValue({ productId, unitId, quantity: 1, unitPrice: this.suggestedPrice(productId, unitId) });
    }
    this.highlightIndex.set(index);
    setTimeout(() => this.highlightIndex.set(null), 600);
  }

  // ─── Receive with lot / serial capture ───
  receiveLines = signal<{
    itemId: string; productName: string; quantity: number; trackingType: 'lot' | 'serial'; hasExpiry: boolean;
    lots: { lotNumber: string; expiryDate: string; quantity: number | null }[]; serialsText: string;
  }[]>([]);
  private receiveVersion = signal(0);

  touchReceive() {
    this.receiveVersion.update(v => v + 1);
  }

  private parseSerials(text: string): string[] {
    return (text || '').split(/[\r\n,;]+/).map(x => x.trim()).filter(Boolean);
  }

  hasDuplicateSerials(rl: { serialsText: string }): boolean {
    const list = this.parseSerials(rl.serialsText);
    return new Set(list).size !== list.length;
  }

  receiveLineCount(rl: { trackingType: string; lots: { quantity: number | null }[]; serialsText: string }): number {
    if (rl.trackingType === 'lot') return rl.lots.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
    return this.parseSerials(rl.serialsText).length;
  }

  receiveLineValid(rl: any): boolean {
    if (rl.trackingType === 'lot') {
      const rowsOk = rl.lots.every((l: any) => (l.lotNumber || '').trim() && Number(l.quantity) > 0 && Number.isInteger(Number(l.quantity)) && (!rl.hasExpiry || l.expiryDate));
      return rowsOk && this.receiveLineCount(rl) === rl.quantity;
    }
    return !this.hasDuplicateSerials(rl) && this.receiveLineCount(rl) === rl.quantity;
  }

  receiveValid(): boolean {
    this.receiveVersion();
    return this.receiveLines().every(rl => this.receiveLineValid(rl));
  }

  addReceiveLot(rl: { lots: any[] }) {
    rl.lots.push({ lotNumber: '', expiryDate: '', quantity: null });
    this.touchReceive();
  }

  removeReceiveLot(rl: { lots: any[] }, index: number) {
    rl.lots.splice(index, 1);
    this.touchReceive();
  }

  // Filter Signals
  poSearch = signal('');
  poFilterStatus = signal<string>('all');
  startDate = signal('');
  endDate = signal('');

  poForm: FormGroup = this.fb.group({
    supplierId: ['', Validators.required],
    supplierName: [''],
    currency: [''],
    warehouseId: [''],
    expectedDate: [''],
    notes: [''],
    items: this.fb.array([])
  });

  get itemsArray() {
    return this.poForm.get('items') as FormArray;
  }

  filteredOrders = computed(() => {
    let list = this.orders();
    const search = this.poSearch().toLowerCase().trim();
    const status = this.poFilterStatus();
    const start = this.startDate();
    const end = this.endDate();

    if (search) {
      list = list.filter(o => 
        (o.supplierName && o.supplierName.toLowerCase().includes(search)) ||
        (o.poNumber && o.poNumber.toLowerCase().includes(search))
      );
    }
    if (status !== 'all') {
      list = list.filter(o => o.status === status);
    }
    if (start) {
      const startMs = new Date(start).setHours(0, 0, 0, 0);
      list = list.filter(o => new Date(o.createdAt).getTime() >= startMs);
    }
    if (end) {
      const endMs = new Date(end).setHours(23, 59, 59, 999);
      list = list.filter(o => new Date(o.createdAt).getTime() <= endMs);
    }
    return list;
  });

  hasValue(fieldName: string): boolean {
    const val = this.poForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.poForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  ngOnInit() {
    this.poForm.valueChanges.subscribe(v => this.formValue.set(v));
    let lastCurrency = '';
    this.poForm.get('currency')!.valueChanges.subscribe(c => {
      if (c && lastCurrency && c !== lastCurrency) {
        this.formValue.set(this.poForm.getRawValue());
        this.itemsArray.controls.forEach(g => g.patchValue({ unitPrice: this.suggestedPrice(g.get('productId')?.value) }, { emitEvent: false }));
        this.formValue.set(this.poForm.getRawValue());
      }
      lastCurrency = c;
    });
    this.inventory.getTaxRates().subscribe({ next: r => this.taxRates.set(r), error: () => {} });
    this.inventory.getWarehouses().subscribe({ next: w => this.warehouses.set(w), error: () => {} });
    this.loadData();
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
    this.route.queryParams.subscribe(params => {
      this.poSearch.set(params['q'] || '');
      if (params['open'] === 'new') {
        this.openDrawer();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { open: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });
  }

  loadData() {
    this.isLoading.set(true);
    this.inventory.getSuppliers().subscribe(sups => {
      this.suppliers.set(sups);
      this.inventory.getPurchaseOrders().subscribe({
        next: (res) => {
          this.orders.set(res);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.ui.showToast(this.i18n.t('purchaseOrders.loadFailed'), 'error');
        }
      });
    });
  }

  openDrawer() {
    this.poForm.reset({
      supplierId: '',
      supplierName: '',
      currency: this.i18n.currency(),
      warehouseId: this.defaultWarehouseId(),
      expectedDate: '',
      notes: ''
    });
    this.itemsArray.clear();
    this.addItem();
    this.formValue.set(this.poForm.getRawValue());
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.editingPoId.set(null);
  }

  openDetailDrawer(order: any) {
    this.detailOrder.set(order);
  }

  closeDetailDrawer() {
    this.detailOrder.set(null);
  }

  onSupplierChange() {
    const id = this.poForm.get('supplierId')?.value;
    const sup = this.suppliers().find(s => s.id === id);
    if (sup) {
      this.poForm.patchValue({ supplierName: sup.name });
    }
  }

  addItem() {
    this.itemsArray.push(this.fb.group({
      productId: ['', Validators.required],
      unitId: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unitPrice: [null as number | null, [Validators.min(0)]]
    }));
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
  }

  savePo() {
    if (this.poForm.invalid || this.itemsArray.length === 0) {
      this.poForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const data = this.poForm.value;
    
    // Merge duplicate items by summing their quantities
    type Line = { productId: string; quantity: number; unitId?: string; unitPrice?: number };
    const mergedMap = new Map<string, Line>();
    data.items.forEach((it: any) => {
      const unitId: string = it.unitId || '';
      const key = `${it.productId}|${unitId}`;
      const e: Line = mergedMap.get(key) || { productId: it.productId, quantity: 0, ...(unitId ? { unitId } : {}) };
      e.quantity += Number(it.quantity);
      const hasPrice = it.unitPrice !== null && it.unitPrice !== '' && it.unitPrice !== undefined;
      if (hasPrice && e.unitPrice === undefined) e.unitPrice = Number(it.unitPrice);
      mergedMap.set(key, e);
    });

    const payload: PurchaseOrderPayload & { expectedDate?: string } = {
      supplierId: data.supplierId,
      currency: data.currency || undefined,
      warehouseId: data.warehouseId || undefined,
      notes: data.notes || undefined,
      items: Array.from(mergedMap.values())
    };
    if (data.expectedDate) payload.expectedDate = data.expectedDate;


    const request$ = this.editingPoId()
      ? this.inventory.updatePurchaseOrder(this.editingPoId()!, payload as PurchaseOrderPayload)
      : this.inventory.createPurchaseOrder(payload as PurchaseOrderPayload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadData();
        this.ui.showToast(this.editingPoId() ? this.i18n.t('purchaseOrders.updated') : this.i18n.t('purchaseOrders.created'), 'success');
        this.editingPoId.set(null);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || (this.editingPoId() ? this.i18n.t('purchaseOrders.updateFailed') : this.i18n.t('purchaseOrders.createFailed')), 'error');
      }
    });
  }

  editPurchaseOrder(order: any) {
    this.editingPoId.set(order.id);
    this.poForm.reset({
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      currency: order.currency || this.i18n.currency(),
      warehouseId: order.warehouseId || '',
      expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : '',
      notes: order.notes || ''
    });
    this.itemsArray.clear();
    order.items.forEach((it: any) => {
      const inUnit = !!it.unitId && it.unitQuantity != null;
      this.itemsArray.push(this.fb.group({
        productId: [it.productId, Validators.required],
        unitId: [it.unitId || ''],
        quantity: [inUnit ? it.unitQuantity : it.quantity, [Validators.required, Validators.min(1)]],
        unitPrice: [it.unitPrice ?? it.price ?? null, [Validators.min(0)]]
      }));
    });
    this.formValue.set(this.poForm.getRawValue());
    this.closeDetailDrawer();
    this.isDrawerOpen.set(true);
  }

  deletePurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.deleteTitle'),
      message: this.i18n.t('purchaseOrders.deleteMessage', { no: this.formatPoNumber(order.poNumber) }),
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deletePurchaseOrder(order.id).pipe(
          tap({
            next: () => {
              this.closeDetailDrawer();
              this.loadData();
              this.ui.showToast(this.i18n.t('purchaseOrders.deleted'), 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || this.i18n.t('purchaseOrders.actionFailed'), 'error');
            }
          })
        );
      }
    });
  }

  sendPurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.sendTitle'),
      message: this.i18n.t('purchaseOrders.sendMessage', { no: this.formatPoNumber(order.poNumber) }),
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Sent').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast(this.i18n.t('purchaseOrders.sentToast'), 'success');
          },
          error: () => {
            this.ui.showToast(this.i18n.t('purchaseOrders.actionFailed'), 'error');
          }
        });
      }
    });
  }

  receivePurchaseOrder(order: any) {
    this.receiveWarehouseId.set(order.warehouseId || this.defaultWarehouseId());
    const lines = (order.items || [])
      .map((it: any) => ({ it, p: this.productById(it.productId) }))
      .filter(({ it, p }: any) => it.id && (p?.trackingType === 'lot' || p?.trackingType === 'serial'))
      .map(({ it, p }: any) => ({
        itemId: it.id as string,
        productName: it.productName || p.name,
        quantity: Number(it.quantity) || 0,
        trackingType: p.trackingType as 'lot' | 'serial',
        hasExpiry: !!p.hasExpiry,
        lots: [{ lotNumber: '', expiryDate: '', quantity: Number(it.quantity) || null }],
        serialsText: ''
      }));
    this.receiveLines.set(lines);
    this.touchReceive();
    this.receiveTarget.set(order);
  }

  private buildReceipts(): PurchaseOrderReceipt[] {
    return this.receiveLines().map(rl => rl.trackingType === 'lot'
      ? { itemId: rl.itemId, lots: rl.lots.map(l => ({ lotNumber: l.lotNumber.trim(), expiryDate: l.expiryDate || null, quantity: Number(l.quantity) })) }
      : { itemId: rl.itemId, serials: this.parseSerials(rl.serialsText) });
  }

  confirmReceive() {
    const order = this.receiveTarget();
    if (!order || !this.receiveValid()) return;
    this.isSaving.set(true);
    const receipts = this.buildReceipts();
    this.inventory.updatePurchaseOrderStatus(order.id, 'Received', this.receiveWarehouseId() || undefined, receipts.length ? receipts : undefined).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.receiveTarget.set(null);
        this.closeDetailDrawer();
        this.loadData();
        this.state.loadData(); // Refetch products to get updated stocks
        this.ui.showToast(this.i18n.t('purchaseOrders.receivedToast'), 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('purchaseOrders.actionFailed'), 'error');
      }
    });
  }

  cancelPurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.cancelTitle'),
      message: this.i18n.t('purchaseOrders.cancelMessage', { no: this.formatPoNumber(order.poNumber) }),
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Cancelled').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast(this.i18n.t('purchaseOrders.cancelledToast'), 'success');
          },
          error: () => {
            this.ui.showToast(this.i18n.t('purchaseOrders.actionFailed'), 'error');
          }
        });
      }
    });
  }

  updateStatus(id: string, status: string) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.updateStatusTitle'),
      message: this.i18n.t('purchaseOrders.updateStatusMessage'),
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(id, status).subscribe({
          next: () => {
            this.loadData();
            this.state.loadData(); // Refetch products to get updated stocks
            this.ui.showToast(this.i18n.t('purchaseOrders.receivedToastShort'), 'success');
          },
          error: () => {
            this.ui.showToast(this.i18n.t('purchaseOrders.actionFailed'), 'error');
          }
        });
      }
    });
  }

  getGroupedItems(items: any[]): any[] {
    if (!items) return [];
    const grouped: { [key: string]: any } = {};
    for (const item of items) {
      const productId = `${item.productId}|${item.unitId || ''}`;
      if (!grouped[productId]) {
        const p = this.state.products().find(x => x.id === item.productId);
        const price = item.unitPrice ?? item.price ?? item.unitCost ?? 0;
        grouped[productId] = {
          key: productId,
          unitCode: item.unitCode ?? null,
          unitFactor: item.unitFactor ?? 1,
          unitQuantity: 0,
          tracking: [] as TrackingEntry[],
          productId: item.productId,
          productName: item.productName || p?.name || this.i18n.t('purchaseOrders.unknownProduct'),
          quantity: 0,
          price: price,
          taxRate: item.taxRate ?? 0,
          taxAmount: 0,
          lineTotal: 0,
          occurrenceCount: 0
        };
      }
      grouped[productId].quantity += item.quantity;
      grouped[productId].unitQuantity += Number(item.unitQuantity ?? item.quantity) || 0;
      if (item.tracking?.length) grouped[productId].tracking.push(...item.tracking);
      grouped[productId].taxAmount += Number(item.taxAmount) || 0;
      grouped[productId].lineTotal += Number(item.lineTotal ?? item.quantity * grouped[productId].price) || 0;
      grouped[productId].occurrenceCount += 1;
    }
    return Object.values(grouped);
  }

  formatPoNumber(poNumber: string): string {
    if (!poNumber) return '';
    let clean = poNumber.replace(/^#?PO-/, '');
    if (clean.length > 4) {
      clean = clean.slice(-4);
    }
    return `#PO-${clean.toUpperCase()}`;
  }

  getStatusName(status: string) {
    switch (status) {
      case 'Draft': return this.i18n.t('purchaseOrders.status.draft');
      case 'Sent': return this.i18n.t('purchaseOrders.status.sent');
      case 'Received': return this.i18n.t('purchaseOrders.status.received');
      case 'Cancelled': return this.i18n.t('purchaseOrders.status.cancelled');
      default: return status;
    }
  }

  getBadgeClass(status: string) {
    switch (status) {
      case 'Draft': return 'badge-lowstock';
      case 'Sent': return 'badge-lowstock';
      case 'Received': return 'badge-instock';
      case 'Cancelled': return 'badge-outstock';
      default: return '';
    }
  }

  autoDraft() {
    if (this.isAutoDrafting()) return;
    this.isAutoDrafting.set(true);

    this.inventory.autoDraftPurchaseOrders().subscribe({
      next: (res) => {
        this.isAutoDrafting.set(false);
        if (res.count > 0) {
          this.loadData();
          this.ui.showToast(this.i18n.t('purchaseOrders.autoDraftCreated', { count: res.count }), 'success');
        } else {
          this.ui.showToast(this.i18n.t('purchaseOrders.autoDraftNone'), 'success');
        }
      },
      error: () => {
        this.isAutoDrafting.set(false);
        this.ui.showToast(this.i18n.t('purchaseOrders.autoDraftFailed'), 'error');
      }
    });
  }
}
