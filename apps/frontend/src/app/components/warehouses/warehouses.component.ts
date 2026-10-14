import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs';
import { Warehouse, StockLot, SerialNumber, TrackingType } from '../../models/inventory.models';
import { AppStateService } from '../../services/app-state.service';

type WarehouseStockItem = { productId: string; productName: string; sku: string; quantity: number };
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe } from '../../i18n';

@Component({
  selector: 'app-warehouses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, MoneyPipe, NumberFormatPipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .dim-text {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-style: italic;
      font-weight: normal;
    }
    .default-badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
      background: rgba(99, 102, 241, 0.1);
      color: var(--primary);
      vertical-align: middle;
    }
    .stock-table { width: 100%; border-collapse: collapse; }
    .stock-table th, .stock-table td { padding: 8px 6px; border-bottom: 1px solid var(--border-color); text-align: left; font-size: 0.875rem; }
    .stock-table .num-cell { text-align: right; }
    .warehouse-row {
      transition: background-color 0.2s ease;
    }
    .warehouse-row:hover td {
      background-color: rgba(99, 102, 241, 0.04) !important;
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'warehouses.title' | t }}</h1>
        <p>{{ 'warehouses.subtitle' | t }}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          {{ 'warehouses.new' | t }}
        </button>
      </div>
    </header>

    <!-- Search Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" [placeholder]="'warehouses.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
      <div style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm);">
        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(99, 102, 241, 0.08); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">{{ 'warehouses.totalWarehouses' | t }}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">{{ totalWarehouseCount() }}</div>
        </div>
      </div>

      <div style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm);">
        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(5, 150, 105, 0.08); color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">{{ 'warehouses.totalStock' | t }}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">{{ totalStockCount() | num }}</div>
        </div>
      </div>

      <div style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm);">
        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(139, 92, 246, 0.08); color: var(--ai-accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">{{ 'warehouses.totalValue' | t }}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">{{ totalStockValue() | money }}</div>
        </div>
      </div>
    </div>
 
    <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
      @if (isLoading()) {
        <div class="loading-state">{{ 'common.loading' | t }}</div>
      } @else if (warehouses().length === 0) {
        <div class="empty-state">
          <p>{{ 'warehouses.empty' | t }}</p>
          <button class="btn btn-outline" (click)="openDrawer()" style="margin-top: 16px;">{{ 'warehouses.addFirst' | t }}</button>
        </div>
      } @else if (filteredWarehouses().length === 0) {
        <div class="empty-state">
          <p>{{ 'warehouses.noResults' | t }}</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'warehouses.col.name' | t }}</th>
                <th>{{ 'warehouses.col.code' | t }}</th>
                <th>{{ 'warehouses.col.address' | t }}</th>
                <th style="text-align: right;">{{ 'warehouses.col.productCount' | t }}</th>
                <th style="text-align: right;">{{ 'warehouses.col.totalStock' | t }}</th>
                <th style="text-align: right;">{{ 'warehouses.col.totalValue' | t }}</th>
                <th class="th-actions">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (w of filteredWarehouses(); track w.id) {
                <tr (click)="goToWarehouseProducts(w)" style="cursor: pointer;" class="warehouse-row">
                  <td><strong>{{ w.name }}</strong>
                    @if (w.isDefault) { <span class="default-badge" [title]="'warehouses.defaultHint' | t">{{ 'warehouses.default' | t }}</span> }
                  </td>
                  <td class="mono" style="color: var(--text-primary);">{{ w.code }}</td>
                  <td style="color: var(--text-primary);">{{ w.address || '-' }}</td>
                  <td class="mono" style="text-align: right;">
                    @if (w.productCount === 0) {
                      <span class="dim-text">{{ 'warehouses.noProductsAssigned' | t }}</span>
                    } @else {
                      {{ w.productCount | num }}
                    }
                  </td>
                  <td class="mono" style="text-align: right; font-weight: 600;">
                    @if (w.totalStock === 0) {
                      <span class="dim-text">{{ 'warehouses.noProductsAssigned' | t }}</span>
                    } @else {
                      {{ w.totalStock | num }}
                    }
                  </td>
                  <td class="mono" style="text-align: right; font-weight: 600; color: var(--text-primary);">{{ w.totalValue | money }}</td>
                  <td class="td-actions" (click)="$event.stopPropagation()">
                    <button class="edit-btn" [title]="'warehouses.details' | t" (click)="goToWarehouseProducts(w); $event.stopPropagation()" style="color: var(--primary);">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </button>
                    <button class="edit-btn" [title]="'warehouses.stock.view' | t" (click)="openStock(w); $event.stopPropagation()">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    </button>
                    <button class="edit-btn" [title]="'warehouses.transfer.action' | t" (click)="openTransfer(w); $event.stopPropagation()" [disabled]="!w.totalStock || warehouses().length < 2">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                    </button>
                    <button class="edit-btn" [title]="'common.edit' | t" (click)="openDrawer(w); $event.stopPropagation()">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteWarehouse(w); $event.stopPropagation()" [disabled]="(w.totalStock ?? 0) > 0">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Right Drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editId() ? 'warehouses.editTitle' : 'warehouses.addTitle') | t }}</span>
            <button class="drawer-close" (click)="closeDrawer()">×</button>
          </div>

          <form [formGroup]="warehouseForm" (ngSubmit)="saveWarehouse()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="warehouseName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaving()" />
                <label for="warehouseName" class="form-label">{{ 'warehouses.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">⚠ {{ 'warehouses.form.nameRequired' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="warehouseCode" type="text" formControlName="code" class="form-input" [class.has-value]="hasValue('code')" [disabled]="isSaving()" />
                <label for="warehouseCode" class="form-label">{{ 'warehouses.form.code' | t }}</label>
                @if (isFieldInvalid('code')) { <div class="form-error">⚠ {{ 'warehouses.form.codeRequired' | t }}</div> }
              </div>

              <div class="form-field">
                <textarea id="warehouseAddress" formControlName="address" class="form-input" [class.has-value]="hasValue('address')" [disabled]="isSaving()"></textarea>
                <label for="warehouseAddress" class="form-label">{{ 'warehouses.col.address' | t }}</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="warehouseForm.invalid || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'warehouses.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }


    

    <!-- Stock Drawer -->
    @if (stockWarehouse(); as sw) {
      <div class="drawer-overlay" (click)="closeStock()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'warehouses.stock.title' | t: { name: sw.name } }}</span>
            <button class="drawer-close" (click)="closeStock()">×</button>
          </div>
          <div class="drawer-body">
            @if (stockLoading()) {
              <div class="loading-state">{{ 'common.loading' | t }}</div>
            } @else if (stockItems().length === 0) {
              <div class="empty-state"><p>{{ 'warehouses.stock.empty' | t }}</p></div>
            } @else {
              <table class="stock-table">
                <thead>
                  <tr>
                    <th>{{ 'warehouses.stock.product' | t }}</th>
                    <th>{{ 'warehouses.stock.sku' | t }}</th>
                    <th class="num-cell">{{ 'warehouses.stock.quantity' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (it of stockItems(); track it.productId) {
                    <tr>
                      <td>{{ it.productName }}</td>
                      <td class="mono">{{ it.sku }}</td>
                      <td class="mono num-cell">{{ it.quantity | num }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
          <div class="drawer-footer">
            <button type="button" class="btn btn-secondary" (click)="closeStock()">{{ 'warehouses.close' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="openTransfer(sw)" [disabled]="!hasTransferable(stockItems()) || warehouses().length < 2">{{ 'warehouses.transfer.action' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Transfer Drawer -->
    @if (transferSource(); as src) {
      <div class="drawer-overlay" (click)="closeTransfer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'warehouses.transfer.title' | t: { name: src.name } }}</span>
            <button class="drawer-close" (click)="closeTransfer()">×</button>
          </div>
          <form [formGroup]="transferForm" (ngSubmit)="submitTransfer()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              @if (transferLoading()) {
                <div class="loading-state">{{ 'common.loading' | t }}</div>
              } @else if (transferItems().length === 0) {
                <div class="empty-state"><p>{{ 'warehouses.transfer.noStock' | t }}</p></div>
              } @else {
                <div class="form-field">
                  <select id="trProduct" formControlName="productId" class="form-input has-value" (change)="onTransferProductChange()">
                    <option value="" disabled>{{ 'warehouses.transfer.selectProduct' | t }}</option>
                    @for (it of transferItems(); track it.productId) {
                      <option [value]="it.productId">{{ it.productName }} ({{ it.sku }}) — {{ 'warehouses.transfer.available' | t: { qty: it.quantity } }}</option>
                    }
                  </select>
                  <label for="trProduct" class="form-label">{{ 'warehouses.transfer.product' | t }}</label>
                  @if (isTransferInvalid('productId')) { <div class="form-error">⚠ {{ 'warehouses.transfer.productRequired' | t }}</div> }
                </div>

                <div class="form-field">
                  <select id="trTarget" formControlName="toWarehouseId" class="form-input has-value">
                    <option value="" disabled>{{ 'warehouses.transfer.selectTarget' | t }}</option>
                    @for (t of transferTargets(); track t.id) {
                      <option [value]="t.id">{{ t.name }} ({{ t.code }})</option>
                    }
                  </select>
                  <label for="trTarget" class="form-label">{{ 'warehouses.transfer.target' | t }}</label>
                  @if (isTransferInvalid('toWarehouseId')) { <div class="form-error">⚠ {{ 'warehouses.transfer.targetRequired' | t }}</div> }
                </div>

                @if (selectedTracking() === 'lot') {
                  <div class="form-field">
                    <select id="trLot" class="form-input has-value" [ngModel]="selectedLotId()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="onLotChange($event)">
                      <option value="">{{ 'warehouses.transfer.selectLot' | t }}</option>
                      @for (l of transferLots(); track l.id) {
                        <option [value]="l.id">{{ l.lotNumber }}{{ l.expiryDate ? ' · ' + l.expiryDate : '' }} — {{ 'warehouses.transfer.available' | t: { qty: l.quantity } }}</option>
                      }
                    </select>
                    <label for="trLot" class="form-label">{{ 'warehouses.transfer.lot' | t }}</label>
                    @if (trackingLoading()) { <div class="dim-text" style="margin-top: 4px;">{{ 'common.loading' | t }}</div> }
                    @else if (transferLots().length === 0) { <div class="dim-text" style="margin-top: 4px;">{{ 'warehouses.transfer.noLots' | t }}</div> }
                    @else if (!selectedLotId()) { <div class="dim-text" style="margin-top: 4px;">{{ 'warehouses.transfer.lotAutoHint' | t }}</div> }
                  </div>
                }
                @if (selectedTracking() === 'serial') {
                  <div class="form-field">
                    <div class="form-label" style="position: static; margin-bottom: 6px;">{{ 'warehouses.transfer.serials' | t }} ({{ selectedSerials().size }})</div>
                    @if (trackingLoading()) {
                      <div class="dim-text">{{ 'common.loading' | t }}</div>
                    } @else if (transferSerials().length === 0) {
                      <div class="dim-text">{{ 'warehouses.transfer.noSerials' | t }}</div>
                    } @else {
                      <div style="max-height: 180px; overflow-y: auto; border: 1px solid var(--secondary); border-radius: 6px; padding: 6px 10px;">
                        @for (s of transferSerials(); track s.id) {
                          <label style="display:flex; align-items:center; gap:8px; padding: 3px 0; cursor:pointer;">
                            <input type="checkbox" [checked]="selectedSerials().has(s.serial)" (change)="toggleSerial(s.serial)" />
                            <span class="mono">{{ s.serial }}</span>
                          </label>
                        }
                      </div>
                      <div class="dim-text" style="margin-top: 4px;">{{ 'warehouses.transfer.serialsHint' | t }}</div>
                    }
                  </div>
                }

                <div class="form-field">
                  <input id="trQty" type="number" min="1" [max]="availableQty()" step="1" formControlName="quantity" class="form-input has-value" [readonly]="selectedTracking() === 'serial'" />
                  <label for="trQty" class="form-label">{{ 'warehouses.transfer.quantity' | t }}</label>
                  @if (selectedTransferItem()) {
                    <div class="dim-text" style="margin-top: 4px;">{{ 'warehouses.transfer.available' | t: { qty: availableQty() } }}</div>
                  }
                  @if (isTransferInvalid('quantity')) { <div class="form-error">⚠ {{ 'warehouses.transfer.quantityInvalid' | t: { max: availableQty() } }}</div> }
                </div>

                <div class="form-field">
                  <textarea id="trNote" formControlName="note" class="form-input" [class.has-value]="!!transferForm.get('note')?.value"></textarea>
                  <label for="trNote" class="form-label">{{ 'warehouses.transfer.note' | t }}</label>
                </div>
              }
              @if (transferError()) { <div class="form-error">⚠ {{ transferError() }}</div> }
            </div>
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeTransfer()" [disabled]="isTransferring()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="transferForm.invalid || isTransferring() || transferItems().length === 0">
                @if (isTransferring()) { <span class="spinner-sm spinner-light"></span> {{ 'warehouses.transfer.submitting' | t }} } @else { {{ 'warehouses.transfer.submit' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class WarehousesComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);

  warehouses = signal<Warehouse[]>([]);

  // Stock view
  stockWarehouse = signal<Warehouse | null>(null);
  stockItems = signal<WarehouseStockItem[]>([]);
  stockLoading = signal(false);

  // Transfer
  transferSource = signal<Warehouse | null>(null);
  transferItems = signal<WarehouseStockItem[]>([]);
  transferLoading = signal(false);
  isTransferring = signal(false);
  transferError = signal<string | null>(null);
  selectedProductId = signal<string>('');
  transferTargets = computed(() => {
    const src = this.transferSource();
    return src ? this.warehouses().filter(w => w.id !== src.id) : [];
  });
  selectedTransferItem = computed(() => this.transferItems().find(i => i.productId === this.selectedProductId()) || null);
  appState = inject(AppStateService);
  transferLots = signal<StockLot[]>([]);
  transferSerials = signal<SerialNumber[]>([]);
  selectedLotId = signal<string>('');
  selectedSerials = signal<Set<string>>(new Set());
  trackingLoading = signal(false);
  selectedTracking = computed<TrackingType>(() => {
    const id = this.selectedProductId();
    return (this.appState.products().find(p => p.id === id)?.trackingType as TrackingType) || 'none';
  });
  availableQty = computed(() => {
    if (this.selectedTracking() === 'lot' && this.selectedLotId()) {
      return this.transferLots().find(l => l.id === this.selectedLotId())?.quantity ?? 0;
    }
    return this.selectedTransferItem()?.quantity ?? 0;
  });

  transferForm: FormGroup = this.fb.group({
    productId: ['', Validators.required],
    toWarehouseId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    note: ['']
  });
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  editId = signal<string | null>(null);
 
  searchQuery = signal('');

  totalWarehouseCount = computed(() => {
    return this.warehouses().length;
  });

  totalStockCount = computed(() => {
    return this.warehouses().reduce((sum, w) => sum + (w.totalStock || 0), 0);
  });

  totalStockValue = computed(() => {
    return this.warehouses().reduce((sum, w) => sum + (w.totalValue || 0), 0);
  });

  goToWarehouseProducts(w: any) {
    this.router.navigate(['/products'], { queryParams: { warehouse: w.name } });
  }

  filteredWarehouses = computed(() => {
    const list = this.warehouses();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(w => 
      (w.name && w.name.toLowerCase().includes(query)) ||
      (w.code && w.code.toLowerCase().includes(query))
    );
  });

  warehouseForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    address: ['']
  });

  hasValue(fieldName: string): boolean {
    const val = this.warehouseForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.warehouseForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  ngOnInit() {
    this.loadWarehouses();
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
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

  loadWarehouses() {
    this.isLoading.set(true);
    this.inventory.getWarehouses().subscribe({
      next: (data) => {
        this.warehouses.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.ui.showToast(this.i18n.t('warehouses.loadError'), 'error');
      }
    });
  }

  openDrawer(warehouse?: any) {
    if (warehouse) {
      this.editId.set(warehouse.id);
      this.warehouseForm.patchValue({
        name: warehouse.name,
        code: warehouse.code,
        address: warehouse.address || ''
      });
    } else {
      this.editId.set(null);
      this.warehouseForm.reset({
        name: '',
        code: '',
        address: ''
      });
    }
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.warehouseForm.reset();
    this.editId.set(null);
  }

  saveWarehouse() {
    if (this.warehouseForm.invalid) {
      this.warehouseForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const data = this.warehouseForm.value;
    const id = this.editId();

    const req = id ? this.inventory.updateWarehouse(id, data) : this.inventory.createWarehouse(data);

    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadWarehouses();
        this.ui.showToast(this.i18n.t(id ? 'warehouses.updated' : 'warehouses.created'), 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('warehouses.saveError'), 'error');
      }
    });
  }

  deleteWarehouse(warehouse: any) {
    if (warehouse.totalStock > 0) {
      this.ui.showToast(this.i18n.t('warehouses.cannotDeleteWithStock'), 'error');
      return;
    }
    
    this.ui.openConfirm({
      title: this.i18n.t('warehouses.deleteTitle'),
      message: this.i18n.t('warehouses.deleteMessage', { name: warehouse.name }),
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deleteWarehouse(warehouse.id).pipe(
          tap({
            next: () => {
              this.loadWarehouses();
              this.ui.showToast(this.i18n.t('warehouses.deleted'), 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || this.i18n.t('warehouses.deleteError'), 'error');
            }
          })
        );
      }
    });
  }

  hasTransferable(items: WarehouseStockItem[]): boolean {
    return items.some(i => i.quantity > 0);
  }

  openStock(w: Warehouse) {
    this.stockWarehouse.set(w);
    this.stockItems.set([]);
    this.stockLoading.set(true);
    this.inventory.getWarehouseStock(w.id).subscribe({
      next: (items) => {
        this.stockItems.set(items || []);
        this.stockLoading.set(false);
      },
      error: (err) => {
        this.stockLoading.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('warehouses.stock.loadError'), 'error');
      }
    });
  }

  closeStock() {
    this.stockWarehouse.set(null);
    this.stockItems.set([]);
  }

  openTransfer(w: Warehouse) {
    this.closeStock();
    this.transferSource.set(w);
    this.transferError.set(null);
    this.transferItems.set([]);
    this.selectedProductId.set('');
    const others = this.warehouses().filter(x => x.id !== w.id);
    const defaultTarget = others.find(x => x.isDefault) || others[0];
    this.transferForm.reset({ productId: '', toWarehouseId: defaultTarget?.id || '', quantity: 1, note: '' });
    this.transferLoading.set(true);
    this.inventory.getWarehouseStock(w.id).subscribe({
      next: (items) => {
        this.transferItems.set((items || []).filter(i => i.quantity > 0));
        this.transferLoading.set(false);
      },
      error: (err) => {
        this.transferLoading.set(false);
        this.transferError.set(err.error?.message || this.i18n.t('warehouses.stock.loadError'));
      }
    });
  }

  closeTransfer() {
    if (this.isTransferring()) return;
    this.transferSource.set(null);
    this.transferItems.set([]);
    this.transferError.set(null);
  }

  onTransferProductChange() {
    this.selectedProductId.set(this.transferForm.get('productId')?.value || '');
    this.transferLots.set([]);
    this.transferSerials.set([]);
    this.selectedLotId.set('');
    this.selectedSerials.set(new Set());
    const src = this.transferSource();
    const productId = this.selectedProductId();
    const tracking = this.selectedTracking();
    if (src && productId && tracking === 'lot') {
      this.trackingLoading.set(true);
      this.inventory.getProductLots(productId, src.id).subscribe({
        next: (lots) => { this.transferLots.set((lots || []).filter(l => l.quantity > 0)); this.trackingLoading.set(false); },
        error: () => this.trackingLoading.set(false)
      });
    } else if (src && productId && tracking === 'serial') {
      this.trackingLoading.set(true);
      this.inventory.getProductSerials(productId, 'in_stock', src.id).subscribe({
        next: (serials) => { this.transferSerials.set(serials || []); this.trackingLoading.set(false); },
        error: () => this.trackingLoading.set(false)
      });
      this.transferForm.get('quantity')!.setValue(0);
    }
    this.applyQtyMax();
  }

  onLotChange(lotId: string) {
    this.selectedLotId.set(lotId || '');
    this.applyQtyMax();
  }

  toggleSerial(serial: string) {
    const next = new Set(this.selectedSerials());
    if (next.has(serial)) next.delete(serial); else next.add(serial);
    this.selectedSerials.set(next);
    const qtyCtrl = this.transferForm.get('quantity')!;
    qtyCtrl.setValue(next.size);
    qtyCtrl.markAsTouched();
  }

  private applyQtyMax() {
    const max = this.availableQty();
    const qtyCtrl = this.transferForm.get('quantity')!;
    qtyCtrl.setValidators([Validators.required, Validators.min(1), Validators.max(max)]);
    if (qtyCtrl.value > max) qtyCtrl.setValue(max);
    qtyCtrl.updateValueAndValidity();
  }

  isTransferInvalid(field: string): boolean {
    const c = this.transferForm.get(field);
    return c ? (c.invalid && (c.dirty || c.touched)) : false;
  }

  submitTransfer() {
    const src = this.transferSource();
    if (!src) return;
    if (this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }
    const { productId, toWarehouseId, quantity, note } = this.transferForm.value;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > this.availableQty()) {
      this.transferError.set(this.i18n.t('warehouses.transfer.quantityInvalid', { max: this.availableQty() }));
      return;
    }
    const tracking = this.selectedTracking();
    const lotId = tracking === 'lot' && this.selectedLotId() ? this.selectedLotId() : undefined;
    const serials = tracking === 'serial' ? [...this.selectedSerials()] : undefined;
    if (serials && serials.length !== qty) {
      this.transferError.set(this.i18n.t('warehouses.transfer.serialsMismatch'));
      return;
    }
    this.isTransferring.set(true);
    this.transferError.set(null);
    this.inventory.transferWarehouseStock(productId, src.id, toWarehouseId, qty, note?.trim() || undefined, lotId, serials).subscribe({
      next: () => {
        this.isTransferring.set(false);
        this.closeTransfer();
        this.loadWarehouses();
        this.ui.showToast(this.i18n.t('warehouses.transfer.success'), 'success');
      },
      error: (err) => {
        this.isTransferring.set(false);
        const msg = err.error?.message || this.i18n.t('warehouses.transfer.error');
        this.transferError.set(msg);
        this.ui.showToast(msg, 'error');
      }
    });
  }
}
