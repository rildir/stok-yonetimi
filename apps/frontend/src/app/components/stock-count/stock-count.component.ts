import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { AppStateService } from '../../services/app-state.service';
import { I18nService, TranslatePipe, AppDatePipe, NumberFormatPipe } from '../../i18n';
import { QuantityInputDirective } from '../shared/quantity-input.directive';
import { roundQty, sumQty } from '@stok/tr-compliance';
import { Unit } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { StockCount, StockCountItem } from '../../models/inventory.models';

@Component({
  selector: 'app-stock-count',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, BarcodeScannerComponent, QuantityInputDirective],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .drawer-field { margin-bottom: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); }
    .drawer-field label, .field-label { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--color-text-muted); }
    .drawer-field span { font-size: var(--text-sm); color: var(--color-text); }
    .notes-box { background: var(--color-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); border: 1px dashed var(--color-border-strong); font-size: var(--text-sm); color: var(--color-text-secondary); }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-4); }
    .drawer-table { width: 100%; border-collapse: collapse; margin-top: var(--space-2); font-size: var(--text-sm); }
    .drawer-table th { text-align: left; padding: var(--space-2); background: var(--color-surface-subtle); border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); font-weight: var(--weight-medium); font-size: var(--text-xs); }
    .drawer-table td { padding: var(--space-2); border-bottom: 1px solid var(--color-border-subtle); vertical-align: middle; color: var(--color-text); }
    .drawer-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .active-count-wrapper { display: flex; flex-direction: column; gap: var(--space-5); margin-bottom: var(--space-6); padding: var(--space-6); }
    .active-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-subtle); }
    .active-header h3 { font-size: var(--text-lg); margin: 0 0 var(--space-1); color: var(--color-text); }
    .active-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
    .progress-box { background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4); }
    .progress-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); font-size: var(--text-sm); }
    .progress-track { width: 100%; height: 8px; background: var(--color-surface-muted); border-radius: var(--radius-full); overflow: hidden; }
    .progress-fill { height: 100%; background: var(--color-primary); border-radius: var(--radius-full); transition: width var(--duration-base) var(--ease-standard); }
    .diff-badge { display: inline-flex; align-items: center; padding: 2px var(--space-2); border-radius: var(--radius-full); font-weight: var(--weight-semibold); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
    .diff-pos { background: var(--color-success-subtle); color: var(--color-success-text); }
    .diff-neg { background: var(--color-danger-subtle); color: var(--color-danger-text); }
    .diff-zero { background: var(--color-surface-muted); color: var(--color-text-secondary); }
    .qty-input { width: 88px; height: 32px; padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font-size: var(--text-sm); font-variant-numeric: tabular-nums; text-align: right; outline: none; transition: border-color var(--duration-fast); }
    .qty-input:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
    .scan-highlight td { background-color: var(--color-primary-subtle) !important; }
    .expand-btn { width: 24px; height: 24px; display: inline-grid; place-items: center; border: none; background: transparent; cursor: pointer; color: var(--color-text-muted); border-radius: var(--radius-xs); padding: 0; }
    .expand-btn:hover { background: var(--color-surface-muted); color: var(--color-text); }
    .expand-btn svg { transition: transform var(--duration-fast); }
    .expand-btn.open svg { transform: rotate(90deg); }
    .track-sub td { background: var(--color-surface-subtle); font-size: var(--text-xs); }
    .track-sub .indent { padding-left: var(--space-10); }
    .serial-missing { text-decoration: line-through; color: var(--color-danger-text); }
    .serial-label { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; }
    .name-cell { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .zero-stock-row td, .zero-stock-row:hover td { background-color: var(--color-warning-subtle) !important; }
    .confirm-icon { background: var(--color-primary-subtle) !important; color: var(--color-primary) !important; }
    @media (max-width: 640px) {
      .active-count-wrapper { padding: var(--space-4); }
      .active-actions { width: 100%; }
      .active-actions .btn { flex: 1; }
      .meta-grid { grid-template-columns: 1fr; }
      .drawer-table .hide-xs { display: none; }
      /* In-progress count: stacked cards instead of horizontal scroll */
      .sc-active-table tr.track-sub { padding: var(--space-2) var(--space-4) var(--space-2) var(--space-8); background: var(--color-surface-subtle); }
      .sc-active-table tr.track-sub td { background: transparent; }
      .sc-active-table .track-sub .indent { padding-left: 0; text-align: left; }
      .sc-active-table .name-cell { justify-content: flex-start; }
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'stockCount.title' | t }}</h1>
        <p>{{ 'stockCount.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        @if (!activeCount()) {
          <button class="btn btn-primary" (click)="startNewCount()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> {{ 'stockCount.startNew' | t }}</button>
        }
      </div>
    </header>

    <!-- ─── Active In-Progress Count Session ─── -->
    @if (activeCount()) {
      <div class="card active-count-wrapper">
        <div class="active-header">
          <div>
            <h3 class="mono">{{ activeCount()?.countNumber }}</h3>
            <span class="text-muted" style="font-size: var(--text-xs);">
              {{ 'stockCount.startedAt' | t }}: {{ activeCount()?.startedAt | appDate: 'datetime' }} · {{ 'stockCount.performedBy' | t }}: {{ activeCount()?.performedBy }}
            </span>
          </div>
          <div class="active-actions">
            <button class="btn btn-secondary btn-sm" (click)="showScanner.set(true)" [disabled]="isActionLoading()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 7v10M12 7v10M16 7v10"/></svg>{{ 'stockCount.scan' | t }}</button>
            <button class="btn btn-secondary btn-sm" (click)="saveDraft()" [disabled]="isActionLoading()">{{ 'stockCount.saveCount' | t }}</button>
            <button class="btn btn-primary btn-sm" (click)="promptComplete()" [disabled]="isActionLoading()">{{ 'stockCount.completeCount' | t }}</button>
          </div>
        </div>

        <div class="drawer-field">
          <label for="countNotes">{{ 'stockCount.notesOptional' | t }}</label>
          <input id="countNotes" type="text" [(ngModel)]="activeNotes" class="input" [placeholder]="'stockCount.notesPlaceholder' | t" [disabled]="isActionLoading()" />
        </div>

        <!-- Progress Indicator -->
        <div class="progress-box">
          <div class="progress-info">
            <span style="font-weight: var(--weight-semibold); color: var(--color-text);">
              {{ 'stockCount.progress' | t: { counted: countedItemsCount(), total: totalItemsCount() } }}
            </span>
            <span class="num" style="font-weight: var(--weight-semibold); color: var(--color-primary-text);">
              {{ progressPercentage() }}%
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="progressPercentage()"></div>
          </div>
        </div>

        <div class="table-card" style="margin: 0; box-shadow: none;">
          <div class="table-scroll">
            <table class="table-responsive sc-active-table">
              <thead>
                <tr>
                  <th>{{ 'stockCount.col.productName' | t }}</th>
                  <th>{{ 'stockCount.col.sku' | t }}</th>
                  <th>{{ 'stockCount.col.unit' | t }}</th>
                  <th class="num" style="width: 120px;">{{ 'stockCount.col.systemStock' | t }}</th>
                  <th class="num" style="width: 120px;">{{ 'stockCount.col.countedStock' | t }}</th>
                  <th class="num" style="width: 100px;">{{ 'stockCount.col.difference' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (item of activeItems(); track item.productId) {
                  <tr [id]="'sc-row-' + item.productId" [class.zero-stock-row]="item.systemQuantity === 0" [class.scan-highlight]="highlightedId() === item.productId">
                    <td class="td-primary">
                      <div class="name-cell">
                        @if (isTracked(item)) {
                          <button class="expand-btn" [class.open]="expanded().has(item.productId)" (click)="toggleExpand(item.productId)" [attr.aria-label]="'stockCount.toggleDetails' | t"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                        }
                        <strong>{{ item.productName }}</strong>
                        @if (item.trackingType === 'lot') { <span class="badge badge-neutral">{{ 'stockCount.lotTracked' | t }}</span> }
                        @if (item.trackingType === 'serial') { <span class="badge badge-neutral">{{ 'stockCount.serialTracked' | t }}</span> }
                        @if (item.systemQuantity === 0) {
                          <span class="badge badge-warning">{{ 'stockCount.noSystemStock' | t }}</span>
                        }
                      </div>
                    </td>
                    <td class="mono" [attr.data-label]="'stockCount.col.sku' | t">{{ item.sku }}</td>
                    <td [attr.data-label]="'stockCount.col.unit' | t">{{ item.unit || ('stockCount.defaultUnit' | t) }}</td>
                    <td class="num" [attr.data-label]="'stockCount.col.systemStock' | t">{{ item.systemQuantity | num }}</td>
                    <td class="num" [attr.data-label]="'stockCount.col.countedStock' | t">
                      @if (isTracked(item)) {
                        <span class="mono" [title]="'stockCount.trackedSumHint' | t">{{ item.countedQuantity }}</span>
                      } @else {
                        <input type="text" appQty [qtyDecimals]="unitDecimals(item.unit)" [(ngModel)]="item.countedQuantity" (ngModelChange)="onCountedChange(item)" class="qty-input" [disabled]="isActionLoading()" />
                      }
                    </td>
                    <td class="num" [attr.data-label]="'stockCount.col.difference' | t">
                      <span class="diff-badge" [class.diff-pos]="item.difference > 0" [class.diff-neg]="item.difference < 0" [class.diff-zero]="item.difference === 0">
                        {{ item.difference > 0 ? '+' : '' }}{{ item.difference | num }}
                      </span>
                    </td>
                  </tr>
                  @if (isTracked(item) && expanded().has(item.productId)) {
                    @if (item.trackingType === 'lot') {
                      @for (lot of item.lots || []; track lot.lotId) {
                        <tr class="track-sub">
                          <td class="indent">{{ 'stockCount.lot' | t }}: <span class="mono">{{ lot.lotNumber }}</span></td>
                          <td [attr.data-label]="'products.lots.expiry' | t">{{ lot.expiryDate ? (lot.expiryDate | appDate) : '-' }}</td>
                          <td [attr.data-label]="'products.lots.warehouse' | t">{{ lot.warehouseName || '-' }}</td>
                          <td class="num" [attr.data-label]="'stockCount.col.systemStock' | t">{{ lot.systemQuantity }}</td>
                          <td class="num" [attr.data-label]="'stockCount.col.countedStock' | t">
                            <input type="text" appQty [qtyDecimals]="unitDecimals(item.unit)" [(ngModel)]="lot.countedQuantity" (ngModelChange)="recomputeTracked(item)" class="qty-input" [disabled]="isActionLoading()" />
                          </td>
                          <td class="num" [attr.data-label]="'stockCount.col.difference' | t">{{ diff(lot.countedQuantity, lot.systemQuantity) | num }}</td>
                        </tr>
                      } @empty {
                        <tr class="track-sub"><td colspan="6" class="indent">{{ 'stockCount.noLots' | t }}</td></tr>
                      }
                    } @else {
                      @for (sn of item.serials || []; track sn.serial) {
                        <tr class="track-sub">
                          <td class="indent" colspan="3">
                            <label class="serial-label">
                              <input type="checkbox" [(ngModel)]="sn.present" (ngModelChange)="recomputeTracked(item)" [disabled]="isActionLoading()" />
                              <span class="mono" [class.serial-missing]="!sn.present">{{ sn.serial }}</span>
                            </label>
                          </td>
                          <td colspan="3">{{ sn.warehouseName || '' }} · {{ (sn.present ? 'stockCount.serialPresent' : 'stockCount.serialMissing') | t }}</td>
                        </tr>
                      } @empty {
                        <tr class="track-sub"><td colspan="6" class="indent">{{ 'stockCount.noSerials' | t }}</td></tr>
                      }
                    }
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }

    @if (showScanner()) {
      <app-barcode-scanner
        [products]="state.products()"
        (scanResult)="onScan($event)"
        (closeScanner)="showScanner.set(false)"
      ></app-barcode-scanner>
    }

    <!-- ─── Count History ─── -->
    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead>
            <tr>
              <th>{{ 'stockCount.col.countNo' | t }}</th>
              <th>{{ 'stockCount.col.date' | t }}</th>
              <th>{{ 'stockCount.performedBy' | t }}</th>
              <th>{{ 'stockCount.col.status' | t }}</th>
              <th class="num">{{ 'stockCount.col.itemCount' | t }}</th>
              <th>{{ 'stockCount.notes' | t }}</th>
              <th class="th-actions">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (c of counts(); track c.id) {
              <tr>
                <td class="mono td-primary"><strong>{{ c.countNumber }}</strong></td>
                <td class="text-muted" [attr.data-label]="'stockCount.col.date' | t">{{ (c.completedAt || c.startedAt) | appDate: 'datetime' }}</td>
                <td [attr.data-label]="'stockCount.performedBy' | t">{{ c.performedBy }}</td>
                <td [attr.data-label]="'stockCount.col.status' | t">
                  <span class="badge" [class.badge-success]="c.status === 'Completed'" [class.badge-warning]="c.status === 'InProgress'">
                    {{ (c.status === 'Completed' ? 'stockCount.status.completed' : 'stockCount.status.inProgress') | t }}
                  </span>
                </td>
                <td class="num" [attr.data-label]="'stockCount.col.itemCount' | t">{{ c.items.length }}</td>
                <td class="truncate text-muted" style="max-width: 250px;" [attr.data-label]="'stockCount.notes' | t">
                  {{ c.notes || '-' }}
                </td>
                <td class="td-actions">
                  @if (c.status === 'InProgress') {
                    <button class="btn btn-secondary btn-sm" (click)="resumeCount(c)">{{ 'stockCount.resume' | t }}</button>
                  } @else {
                    <button class="btn btn-secondary btn-sm" (click)="viewDetails(c)">{{ 'stockCount.details' | t }}</button>
                  }
                </td>
              </tr>
            }
            @if (counts().length === 0) {
              <tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg></div><p class="empty-state-title">{{ 'stockCount.empty' | t }}</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Complete Confirmation Modal ─── -->
    @if (showCompleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="showCompleteModal.set(false)" [disabled]="isActionLoading()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            <div class="delete-icon confirm-icon">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <h3 class="delete-modal-title">{{ 'stockCount.confirm.title' | t }}</h3>
            <p class="delete-modal-desc">
              {{ 'stockCount.confirm.message' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="showCompleteModal.set(false)" [disabled]="isActionLoading()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="completeCount()" [disabled]="isActionLoading()">
              @if (isActionLoading()) { <span class="spinner-sm spinner-light"></span> {{ 'stockCount.confirming' | t }} } @else { {{ 'common.confirm' | t }} }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Historical Details Drawer ─── -->
    @if (selectedCount()) {
      <div class="drawer-overlay" (click)="selectedCount.set(null)">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'stockCount.detailsTitle' | t }}</span>
            <button class="drawer-close" (click)="selectedCount.set(null)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          
          <div class="drawer-body">
            <div class="meta-grid">
              <div class="drawer-field">
                <label>{{ 'stockCount.col.countNo' | t }}</label>
                <span class="mono" style="font-weight: var(--weight-semibold);">{{ selectedCount()?.countNumber }}</span>
              </div>
              <div class="drawer-field">
                <label>{{ 'stockCount.performedBy' | t }}</label>
                <span>{{ selectedCount()?.performedBy }}</span>
              </div>
              <div class="drawer-field">
                <label>{{ 'stockCount.startedAt' | t }}</label>
                <span>{{ selectedCount()?.startedAt | appDate: 'datetime' }}</span>
              </div>
              <div class="drawer-field">
                <label>{{ 'stockCount.completedAt' | t }}</label>
                <span>{{ selectedCount()?.completedAt ? (selectedCount()?.completedAt | appDate: 'datetime') : '-' }}</span>
              </div>
            </div>

            <div class="drawer-field">
              <label>{{ 'stockCount.notes' | t }}</label>
              <div class="notes-box">{{ selectedCount()?.notes || ('stockCount.noNotes' | t) }}</div>
            </div>

            <div class="drawer-field" style="margin-top: var(--space-6);">
              <label>{{ 'stockCount.countedItems' | t }}</label>
              <table class="drawer-table">
                <thead>
                  <tr>
                    <th>{{ 'stockCount.col.productName' | t }}</th>
                    <th class="hide-xs">{{ 'stockCount.col.sku' | t }}</th>
                    <th class="num">{{ 'stockCount.col.system' | t }}</th>
                    <th class="num">{{ 'stockCount.col.counted' | t }}</th>
                    <th class="num">{{ 'stockCount.col.difference' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of selectedCount()?.items; track item.productId) {
                    <tr [class.zero-stock-row]="item.systemQuantity === 0">
                      <td>
                        <div class="name-cell">
                          <strong>{{ item.productName }}</strong>
                          @if (item.systemQuantity === 0) {
                            <span class="badge badge-warning">{{ 'stockCount.noSystemStock' | t }}</span>
                          }
                        </div>
                      </td>
                      <td class="mono hide-xs">{{ item.sku }}</td>
                      <td class="num">{{ item.systemQuantity }}</td>
                      <td class="num">{{ item.countedQuantity }}</td>
                      <td class="num">
                        <span class="diff-badge" [class.diff-pos]="item.difference > 0" [class.diff-neg]="item.difference < 0" [class.diff-zero]="item.difference === 0">
                          {{ item.difference > 0 ? '+' : '' }}{{ item.difference | num }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class StockCountComponent implements OnInit {
  inventoryService = inject(InventoryService);
  units = signal<Unit[]>([]);
  ui = inject(UiStateService);
  state = inject(AppStateService);
  i18n = inject(I18nService);

  counts = signal<StockCount[]>([]);
  activeCount = signal<StockCount | null>(null);
  activeItems = signal<StockCountItem[]>([]);
  activeNotes = '';

  selectedCount = signal<StockCount | null>(null);

  isActionLoading = signal(false);
  showScanner = signal(false);
  expanded = signal<Set<string>>(new Set());
  highlightedId = signal<string | null>(null);
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  showCompleteModal = signal(false);

  countedItemsCount = computed(() => {
    return this.activeItems().filter((item) => item.isModified).length;
  });

  totalItemsCount = computed(() => {
    return this.activeItems().length;
  });

  progressPercentage = computed(() => {
    const total = this.totalItemsCount();
    if (total === 0) return 0;
    return Math.round((this.countedItemsCount() / total) * 100);
  });

  ngOnInit() {
    this.inventoryService.getUnits().subscribe({ next: (u) => this.units.set(u || []), error: () => undefined });
    this.loadHistory();
  }

  loadHistory() {
    this.inventoryService.getStockCounts().subscribe({
      next: (data) => {
        this.counts.set(data);
        // Find if there is an InProgress session
        const inProgress = data.find(c => c.status === 'InProgress');
        if (inProgress) {
          this.activeCount.set(inProgress);
          const clonedItems = JSON.parse(JSON.stringify(inProgress.items)).map((item: any) => ({
            ...item,
            isModified: item.difference !== 0
          }));
          this.activeItems.set(clonedItems);
          this.activeNotes = inProgress.notes || '';
        } else {
          this.activeCount.set(null);
          this.activeItems.set([]);
          this.activeNotes = '';
        }
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.loadError'), 'error');
      }
    });
  }

  startNewCount() {
    if (this.isActionLoading()) return;
    this.isActionLoading.set(true);

    this.inventoryService.createStockCount('').subscribe({
      next: (data) => {
        this.ui.showToast(this.i18n.t('stockCount.toast.started'), 'success');
        this.isActionLoading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.startError'), 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  /** Unit precision for count inputs (kg: 3, pcs: 0). */
  unitDecimals(code: string | null | undefined): number {
    return Number(this.units().find((u) => u.code === code)?.decimals) || 0;
  }

  diff(a: number, b: number): number {
    return roundQty((Number(a) || 0) - (Number(b) || 0));
  }

  onCountedChange(item: StockCountItem) {
    const counted = Number(item.countedQuantity) || 0;
    item.difference = roundQty(counted - item.systemQuantity);
    item.isModified = true;
    this.activeItems.set([...this.activeItems()]);
  }

  isTracked(item: StockCountItem): boolean {
    return item.trackingType === 'lot' || item.trackingType === 'serial';
  }

  toggleExpand(productId: string) {
    const next = new Set(this.expanded());
    if (next.has(productId)) next.delete(productId); else next.add(productId);
    this.expanded.set(next);
  }

  recomputeTracked(item: StockCountItem) {
    if (item.trackingType === 'lot') {
      item.countedQuantity = sumQty((item.lots || []).map((l) => Number(l.countedQuantity) || 0));
    } else if (item.trackingType === 'serial') {
      item.countedQuantity = (item.serials || []).filter((s) => s.present).length;
    }
    item.difference = roundQty(item.countedQuantity - item.systemQuantity);
    item.isModified = true;
    this.activeItems.set([...this.activeItems()]);
  }

  onScan(code: string) {
    this.showScanner.set(false);
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    this.inventoryService.lookupBarcode(trimmed).subscribe({
      next: (res) => {
        const item = this.activeItems().find((i) => i.productId === res.product.id);
        if (!item) {
          this.ui.showToast(this.i18n.t('stockCount.toast.scanNotInCount', { name: res.product.name }), 'error');
          return;
        }
        if (item.trackingType === 'serial') {
          const sn = res.serial ? (item.serials || []).find((s) => s.serial === res.serial) : undefined;
          if (!sn) {
            this.ui.showToast(this.i18n.t('stockCount.toast.scanSerialRequired'), 'error');
            this.focusItem(item, true);
            return;
          }
          sn.present = true;
          this.recomputeTracked(item);
          this.ui.showToast(this.i18n.t('stockCount.toast.scanSerialMarked', { serial: sn.serial }), 'success');
        } else if (item.trackingType === 'lot') {
          this.ui.showToast(this.i18n.t('stockCount.toast.scanLotHint'), 'info');
        } else {
          const factor = Number(res.factor) || 1;
          item.countedQuantity = (Number(item.countedQuantity) || 0) + factor;
          this.onCountedChange(item);
          this.ui.showToast(this.i18n.t('stockCount.toast.scanAdded', { name: item.productName, qty: factor }), 'success');
        }
        this.focusItem(item, item.trackingType === 'lot');
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.scanNotFound', { code: trimmed }), 'error');
      }
    });
  }

  private focusItem(item: StockCountItem, expand: boolean) {
    if (expand && !this.expanded().has(item.productId)) this.toggleExpand(item.productId);
    this.highlightedId.set(item.productId);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlightedId.set(null), 2000);
    setTimeout(() => document.getElementById('sc-row-' + item.productId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  saveDraft() {
    const active = this.activeCount();
    if (!active || this.isActionLoading()) return;
    this.isActionLoading.set(true);

    this.inventoryService.updateStockCount(active.id, this.activeItems(), this.activeNotes).subscribe({
      next: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.draftSaved'), 'success');
        this.isActionLoading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.draftError'), 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  promptComplete() {
    this.showCompleteModal.set(true);
  }

  completeCount() {
    const active = this.activeCount();
    if (!active || this.isActionLoading()) return;
    this.isActionLoading.set(true);

    // Save draft first to ensure latest inputs are sent
    this.inventoryService.updateStockCount(active.id, this.activeItems(), this.activeNotes).subscribe({
      next: () => {
        // Complete the count session
        this.inventoryService.completeStockCount(active.id).subscribe({
          next: () => {
            this.ui.showToast(this.i18n.t('stockCount.toast.completed'), 'success');
            this.showCompleteModal.set(false);
            this.isActionLoading.set(false);
            this.activeCount.set(null);
            this.activeItems.set([]);
            // Force reload main products cache to show updated counts
            this.state.loadData();
            this.loadHistory();
          },
          error: () => {
            this.ui.showToast(this.i18n.t('stockCount.toast.completeError'), 'error');
            this.isActionLoading.set(false);
          }
        });
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.saveError'), 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  resumeCount(c: StockCount) {
    this.activeCount.set(c);
    const clonedItems = JSON.parse(JSON.stringify(c.items)).map((item: any) => ({
      ...item,
      isModified: item.difference !== 0
    }));
    this.activeItems.set(clonedItems);
    this.activeNotes = c.notes || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  viewDetails(c: StockCount) {
    this.selectedCount.set(c);
  }
}
