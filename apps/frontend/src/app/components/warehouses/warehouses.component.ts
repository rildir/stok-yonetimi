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
    .dim-text { color: var(--color-text-muted); font-size: var(--text-xs); font-weight: var(--weight-regular); }
    .stock-table { width: 100%; border-collapse: collapse; }
    .stock-table th { padding: var(--space-2); border-bottom: 1px solid var(--color-border); text-align: left; font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--color-text-muted); }
    .stock-table td { padding: var(--space-2); border-bottom: 1px solid var(--color-border-subtle); font-size: var(--text-sm); color: var(--color-text); }
    .stock-table .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
    .warehouse-row { cursor: pointer; }
    .wh-name { font-weight: var(--weight-semibold); color: var(--color-text); }
    .serial-list { max-height: 180px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); background: var(--color-surface); }
    .serial-item { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0; cursor: pointer; font-size: var(--text-sm); }
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .hint { margin-top: var(--space-1); }
    @media (max-width: 640px) { .stock-table .hide-xs { display: none; } }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'warehouses.title' | t }}</h1>
        <p>{{ 'warehouses.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          {{ 'warehouses.new' | t }}
        </button>
      </div>
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'warehouses.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom: var(--space-6);">
      <div class="stat-card">
        <div class="stat-icon-box products">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12M6 14h12"/><rect x="6" y="10" width="12" height="12"/></svg>
        </div>
        <div>
          <div class="stat-label">{{ 'warehouses.totalWarehouses' | t }}</div>
          <div class="stat-value">{{ totalWarehouseCount() }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box revenue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>
        </div>
        <div>
          <div class="stat-label">{{ 'warehouses.totalStock' | t }}</div>
          <div class="stat-value">{{ totalStockCount() | num }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/></svg>
        </div>
        <div style="min-width: 0;">
          <div class="stat-label">{{ 'warehouses.totalValue' | t }}</div>
          <div class="stat-value truncate">{{ totalStockValue() | money }}</div>
        </div>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div style="padding: var(--space-4); display: grid; gap: var(--space-3);">
          <div class="skeleton" style="height: 20px;"></div>
          <div class="skeleton" style="height: 20px;"></div>
          <div class="skeleton" style="height: 20px;"></div>
        </div>
      } @else if (warehouses().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><rect x="6" y="10" width="12" height="12"/></svg></div>
          <p class="empty-state-title">{{ 'warehouses.empty' | t }}</p>
          <button class="btn btn-secondary" (click)="openDrawer()" style="margin-top: var(--space-3);">{{ 'warehouses.addFirst' | t }}</button>
        </div>
      } @else if (filteredWarehouses().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
          <p class="empty-state-title">{{ 'warehouses.noResults' | t }}</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'warehouses.col.name' | t }}</th>
                <th>{{ 'warehouses.col.code' | t }}</th>
                <th>{{ 'warehouses.col.address' | t }}</th>
                <th class="num">{{ 'warehouses.col.productCount' | t }}</th>
                <th class="num">{{ 'warehouses.col.totalStock' | t }}</th>
                <th class="num">{{ 'warehouses.col.totalValue' | t }}</th>
                <th class="th-actions">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (w of filteredWarehouses(); track w.id) {
                <tr (click)="goToWarehouseProducts(w)" class="warehouse-row">
                  <td class="td-primary"><span class="wh-name">{{ w.name }}</span>
                    @if (w.isDefault) { <span class="badge badge-primary" style="margin-left: var(--space-2);" [title]="'warehouses.defaultHint' | t">{{ 'warehouses.default' | t }}</span> }
                  </td>
                  <td class="mono" [attr.data-label]="'warehouses.col.code' | t">{{ w.code }}</td>
                  <td class="text-muted" [attr.data-label]="'warehouses.col.address' | t">{{ w.address || '-' }}</td>
                  <td class="num" [attr.data-label]="'warehouses.col.productCount' | t">
                    @if (w.productCount === 0) {
                      <span class="dim-text">{{ 'warehouses.noProductsAssigned' | t }}</span>
                    } @else {
                      {{ w.productCount | num }}
                    }
                  </td>
                  <td class="num" style="font-weight: var(--weight-semibold);" [attr.data-label]="'warehouses.col.totalStock' | t">
                    @if (w.totalStock === 0) {
                      <span class="dim-text">{{ 'warehouses.noProductsAssigned' | t }}</span>
                    } @else {
                      {{ w.totalStock | num }}
                    }
                  </td>
                  <td class="num" style="font-weight: var(--weight-semibold);" [attr.data-label]="'warehouses.col.totalValue' | t">{{ w.totalValue | money }}</td>
                  <td class="td-actions" (click)="$event.stopPropagation()">
                    <button class="icon-btn" [title]="'warehouses.details' | t" (click)="goToWarehouseProducts(w); $event.stopPropagation()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="icon-btn" [title]="'warehouses.stock.view' | t" (click)="openStock(w); $event.stopPropagation()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>
                    </button>
                    <button class="icon-btn" [title]="'warehouses.transfer.action' | t" (click)="openTransfer(w); $event.stopPropagation()" [disabled]="!w.totalStock || warehouses().length < 2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg>
                    </button>
                    <button class="edit-btn" [title]="'common.edit' | t" (click)="openDrawer(w); $event.stopPropagation()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteWarehouse(w); $event.stopPropagation()" [disabled]="(w.totalStock ?? 0) > 0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
            <button class="drawer-close" (click)="closeDrawer()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="warehouseForm" (ngSubmit)="saveWarehouse()" class="drawer-form">
            <div class="drawer-body">
              <div class="form-field">
                <input id="warehouseName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaving()" />
                <label for="warehouseName" class="form-label">{{ 'warehouses.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">{{ 'warehouses.form.nameRequired' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="warehouseCode" type="text" formControlName="code" class="form-input" [class.has-value]="hasValue('code')" [disabled]="isSaving()" />
                <label for="warehouseCode" class="form-label">{{ 'warehouses.form.code' | t }}</label>
                @if (isFieldInvalid('code')) { <div class="form-error">{{ 'warehouses.form.codeRequired' | t }}</div> }
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
            <button class="drawer-close" (click)="closeStock()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (stockLoading()) {
              <div style="display: grid; gap: var(--space-3);"><div class="skeleton" style="height: 18px;"></div><div class="skeleton" style="height: 18px;"></div><div class="skeleton" style="height: 18px;"></div></div>
            } @else if (stockItems().length === 0) {
              <div class="empty-state"><p class="empty-state-title">{{ 'warehouses.stock.empty' | t }}</p></div>
            } @else {
              <table class="stock-table">
                <thead>
                  <tr>
                    <th>{{ 'warehouses.stock.product' | t }}</th>
                    <th class="hide-xs">{{ 'warehouses.stock.sku' | t }}</th>
                    <th class="num-cell">{{ 'warehouses.stock.quantity' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (it of stockItems(); track it.productId) {
                    <tr>
                      <td>{{ it.productName }}</td>
                      <td class="mono hide-xs">{{ it.sku }}</td>
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
            <button class="drawer-close" (click)="closeTransfer()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <form [formGroup]="transferForm" (ngSubmit)="submitTransfer()" class="drawer-form">
            <div class="drawer-body">
              @if (transferLoading()) {
                <div style="display: grid; gap: var(--space-3);"><div class="skeleton" style="height: 18px;"></div><div class="skeleton" style="height: 18px;"></div><div class="skeleton" style="height: 18px;"></div></div>
              } @else if (transferItems().length === 0) {
                <div class="empty-state"><p class="empty-state-title">{{ 'warehouses.transfer.noStock' | t }}</p></div>
              } @else {
                <div class="form-field">
                  <select id="trProduct" formControlName="productId" class="form-input has-value" (change)="onTransferProductChange()">
                    <option value="" disabled>{{ 'warehouses.transfer.selectProduct' | t }}</option>
                    @for (it of transferItems(); track it.productId) {
                      <option [value]="it.productId">{{ it.productName }} ({{ it.sku }}) — {{ 'warehouses.transfer.available' | t: { qty: it.quantity } }}</option>
                    }
                  </select>
                  <label for="trProduct" class="form-label">{{ 'warehouses.transfer.product' | t }}</label>
                  @if (isTransferInvalid('productId')) { <div class="form-error">{{ 'warehouses.transfer.productRequired' | t }}</div> }
                </div>

                <div class="form-field">
                  <select id="trTarget" formControlName="toWarehouseId" class="form-input has-value">
                    <option value="" disabled>{{ 'warehouses.transfer.selectTarget' | t }}</option>
                    @for (t of transferTargets(); track t.id) {
                      <option [value]="t.id">{{ t.name }} ({{ t.code }})</option>
                    }
                  </select>
                  <label for="trTarget" class="form-label">{{ 'warehouses.transfer.target' | t }}</label>
                  @if (isTransferInvalid('toWarehouseId')) { <div class="form-error">{{ 'warehouses.transfer.targetRequired' | t }}</div> }
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
                    @if (trackingLoading()) { <div class="dim-text hint">{{ 'common.loading' | t }}</div> }
                    @else if (transferLots().length === 0) { <div class="dim-text hint">{{ 'warehouses.transfer.noLots' | t }}</div> }
                    @else if (!selectedLotId()) { <div class="dim-text hint">{{ 'warehouses.transfer.lotAutoHint' | t }}</div> }
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
                      <div class="serial-list">
                        @for (s of transferSerials(); track s.id) {
                          <label class="serial-item">
                            <input type="checkbox" [checked]="selectedSerials().has(s.serial)" (change)="toggleSerial(s.serial)" />
                            <span class="mono">{{ s.serial }}</span>
                          </label>
                        }
                      </div>
                      <div class="dim-text hint">{{ 'warehouses.transfer.serialsHint' | t }}</div>
                    }
                  </div>
                }

                <div class="form-field">
                  <input id="trQty" type="number" min="1" [max]="availableQty()" step="1" formControlName="quantity" class="form-input has-value" [readonly]="selectedTracking() === 'serial'" />
                  <label for="trQty" class="form-label">{{ 'warehouses.transfer.quantity' | t }}</label>
                  @if (selectedTransferItem()) {
                    <div class="dim-text hint">{{ 'warehouses.transfer.available' | t: { qty: availableQty() } }}</div>
                  }
                  @if (isTransferInvalid('quantity')) { <div class="form-error">{{ 'warehouses.transfer.quantityInvalid' | t: { max: availableQty() } }}</div> }
                </div>

                <div class="form-field">
                  <textarea id="trNote" formControlName="note" class="form-input" [class.has-value]="!!transferForm.get('note')?.value"></textarea>
                  <label for="trNote" class="form-label">{{ 'warehouses.transfer.note' | t }}</label>
                </div>
              }
              @if (transferError()) { <div class="form-error">{{ transferError() }}</div> }
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
