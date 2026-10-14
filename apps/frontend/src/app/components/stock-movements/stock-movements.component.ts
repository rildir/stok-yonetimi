import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InventoryService, Product, Warehouse } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { I18nService, TranslatePipe, AppDatePipe } from '../../i18n';

@Component({
  selector: 'app-stock-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent, TranslatePipe, AppDatePipe],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'stockMovements.title' | t }}</h1>
        <p>{{ 'stockMovements.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" (click)="loadMovements(currentPage())">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>
          {{ 'stockMovements.refresh' | t }}
        </button>
        <button class="btn btn-secondary" (click)="exportToCSV()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          {{ 'stockMovements.export' | t }}
        </button>
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          {{ 'stockMovements.manualAdjustment' | t }}
        </button>
      </div>
    </header>

    <div class="filter-bar sm-filters">
      <div class="sm-filter-group">
        <!-- Arama Inputu -->
        <div class="search-box sm-search">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" [placeholder]="'stockMovements.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)" />
        </div>

        <!-- Depo Filtresi -->
        <select class="select sm-select" [ngModel]="selectedWarehouseId()" (ngModelChange)="selectedWarehouseId.set($event)" [title]="'stockMovements.filter.warehouse' | t">
          <option value="">{{ 'stockMovements.filter.allWarehouses' | t }}</option>
          @for (w of warehouses(); track w.id) {
            <option [value]="w.id">{{ w.name }}</option>
          }
        </select>

        <!-- Tarih Filtresi -->
        <div class="sm-dates">
          <span class="sm-date-label">{{ 'stockMovements.startDate' | t }}:</span>
          <input type="date" class="input sm-date" [ngModel]="startDate()" (ngModelChange)="onStartDateChange($event)" [title]="'stockMovements.startDateTitle' | t" />
          <span class="text-muted">–</span>
          <span class="sm-date-label">{{ 'stockMovements.endDate' | t }}:</span>
          <input type="date" class="input sm-date" [ngModel]="endDate()" (ngModelChange)="onEndDateChange($event)" [title]="'stockMovements.endDateTitle' | t" />
          @if (startDate() || endDate()) {
            <button class="btn btn-sm btn-ghost" (click)="clearDateFilter()">
              {{ 'stockMovements.clear' | t }}
            </button>
          }
        </div>
      </div>

      <!-- İşlem Tipi Filtresi -->
      <div class="filter-pills">
        <button type="button" class="filter-pill" [class.active]="selectedTypes().length === 0" (click)="toggleType('ALL')">{{ 'stockMovements.filter.all' | t }}</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('IN')" (click)="toggleType('IN')">{{ 'stockMovements.type.in' | t }}</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('ORDER')" (click)="toggleType('ORDER')">{{ 'stockMovements.type.order' | t }}</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('RETURN')" (click)="toggleType('RETURN')">{{ 'stockMovements.type.return' | t }}</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('TRANSFER_OUT')" (click)="toggleType('TRANSFER_OUT')">{{ 'stockMovements.type.transferOut' | t }}</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('TRANSFER_IN')" (click)="toggleType('TRANSFER_IN')">{{ 'stockMovements.type.transferIn' | t }}</button>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div style="padding: var(--space-4); display: grid; gap: var(--space-3);"><div class="skeleton" style="height: 20px;"></div><div class="skeleton" style="height: 20px;"></div><div class="skeleton" style="height: 20px;"></div><div class="skeleton" style="height: 20px;"></div></div>
      } @else if (filteredMovements().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg></div>
          <p class="empty-state-title">{{ 'stockMovements.empty' | t }}</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'stockMovements.col.date' | t }}</th>
                <th>{{ 'stockMovements.col.productName' | t }}</th>
                <th>{{ 'stockMovements.col.type' | t }}</th>
                <th>{{ 'stockMovements.col.warehouse' | t }}</th>
                <th>{{ 'stockMovements.col.lotSerial' | t }}</th>
                <th class="num">{{ 'stockMovements.col.quantity' | t }}</th>
                <th class="num">{{ 'stockMovements.col.previousStock' | t }}</th>
                <th class="num">{{ 'stockMovements.col.newStock' | t }}</th>
                <th>{{ 'stockMovements.col.noteRef' | t }}</th>
                <th>{{ 'stockMovements.col.performedBy' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (m of filteredMovements(); track m.id) {
                <tr>
                  <td class="text-muted nowrap" [attr.data-label]="'stockMovements.col.date' | t">{{ m.createdAt | appDate: 'datetime' }}</td>
                  <td class="td-primary"><strong>{{ m.productName }}</strong></td>
                  <td [attr.data-label]="'stockMovements.col.type' | t">
                    <span class="badge" [ngClass]="getBadgeClass(m.type)">
                       {{ getTypeName(m.type) }}
                    </span>
                  </td>
                  <td [attr.data-label]="'stockMovements.col.warehouse' | t">{{ getWarehouseName(m.warehouseId) }}</td>
                  <td [attr.data-label]="'stockMovements.col.lotSerial' | t">
                    @if (m.lotNumber) {
                      <span class="badge badge-neutral" [title]="'stockMovements.lot' | t">{{ 'stockMovements.lot' | t }}: {{ m.lotNumber }}</span>
                    }
                    @if (m.serials?.length) {
                      <div class="text-xs text-muted truncate mono" [title]="m.serials!.join(', ')" style="max-width: 180px;">
                        {{ 'stockMovements.serials' | t }}: {{ formatSerials(m.serials) }}
                      </div>
                    }
                    @if (!m.lotNumber && !m.serials?.length) { <span class="text-muted">-</span> }
                  </td>
                  <td class="num" [attr.data-label]="'stockMovements.col.quantity' | t">
                    <span [class.text-success]="m.quantity > 0" [class.text-danger]="m.quantity < 0">
                      {{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}
                    </span>
                  </td>
                  <td class="num text-muted" [attr.data-label]="'stockMovements.col.previousStock' | t">{{ m.previousQuantity }}</td>
                  <td class="num" style="font-weight: var(--weight-semibold);" [attr.data-label]="'stockMovements.col.newStock' | t">{{ m.newQuantity }}</td>
                  <td [attr.data-label]="'stockMovements.col.noteRef' | t">
                    <div class="text-xs text-muted" style="margin-bottom: var(--space-1);">{{ m.note }}</div>
                    @if (m.referenceId) {
                      <span class="badge badge-neutral">
                        {{ formatReference(m.referenceType, m.referenceId) }}
                      </span>
                    }
                  </td>
                  <td [attr.data-label]="'stockMovements.col.performedBy' | t">
                    @if (m.performedBy && m.performedBy.toLowerCase() === 'system') {
                      <span class="performed-badge performed-system">{{ 'stockMovements.system' | t }}</span>
                    } @else {
                      <span class="performed-badge performed-admin">{{ m.performedBy || 'Admin' }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        
        <!-- Pagination Bar -->
        <div class="pagination-bar">
          <div class="pagination-info">
            {{ 'stockMovements.pagination' | t: { total: totalItems(), start: getStartCount(), end: getEndCount() } }}
          </div>
          <div class="pagination-actions">
            <button class="page-btn" [disabled]="currentPage() === 1" (click)="loadMovements(currentPage() - 1)">
              {{ 'stockMovements.prev' | t }}
            </button>
            @for (p of getPagesArray(); track p) {
              <button class="page-btn" [class.active]="p === currentPage()" (click)="loadMovements(p)">
                {{ p }}
              </button>
            }
            <button class="page-btn" [disabled]="currentPage() >= totalPages()" (click)="loadMovements(currentPage() + 1)">
              {{ 'stockMovements.next' | t }}
            </button>
          </div>
        </div>
      }
    </div>

    <!-- Right Drawer for Manual Adjustment -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'stockMovements.drawerTitle' | t }}</span>
            <button class="drawer-close" (click)="closeDrawer()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="adjustForm" (ngSubmit)="saveAdjustment()" class="drawer-form">
            <div class="drawer-body">
              
              <!-- Ürün Seçimi -->
              <div class="form-field">
                <select id="adjProduct" formControlName="productId" class="form-input form-select" [class.has-value]="hasValue('productId')" (change)="onProductSelect()">
                  <option value="" disabled selected></option>
                  @for (p of products(); track p.id) {
                    <option [value]="p.id">{{ p.name }} (SKU: {{ p.sku }})</option>
                  }
                </select>
                <label for="adjProduct" class="form-label">{{ 'stockMovements.selectProduct' | t }}</label>
                @if (isFieldInvalid('productId')) { <div class="form-error">{{ 'stockMovements.validation.productRequired' | t }}</div> }
              </div>

              <!-- Mevcut Stok (Salt Okunur) -->
              @if (selectedProduct()) {
                <div class="sm-current">
                  <span class="text-muted">{{ 'stockMovements.currentStock' | t }}:</span>
                  <strong class="num">{{ selectedProduct()?.quantity }}</strong>
                </div>
              }

              <!-- Yeni Miktar -->
              <div class="form-field">
                <input id="adjNewQty" type="number" formControlName="newQuantity" class="form-input" [class.has-value]="hasValue('newQuantity')" min="0" />
                <label for="adjNewQty" class="form-label">{{ 'stockMovements.newQuantity' | t }}</label>
                @if (isFieldInvalid('newQuantity')) { <div class="form-error">{{ 'stockMovements.validation.quantityInvalid' | t }}</div> }
              </div>

              <!-- Açıklama / Not -->
              <div class="form-field">
                <textarea id="adjNote" formControlName="note" class="form-input" [class.has-value]="hasValue('note')"></textarea>
                <label for="adjNote" class="form-label">{{ 'stockMovements.reason' | t }}</label>
                @if (isFieldInvalid('note')) { <div class="form-error">{{ 'stockMovements.validation.noteRequired' | t }}</div> }
              </div>

            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="adjustForm.invalid || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'stockMovements.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styles: [`
    .text-success { color: var(--color-success-text); font-weight: var(--weight-semibold); }
    .text-danger { color: var(--color-danger-text); font-weight: var(--weight-semibold); }
    .nowrap { white-space: nowrap; }
    table tbody td { vertical-align: middle; }
    .sm-filters { flex-wrap: wrap; gap: var(--space-3); justify-content: space-between; }
    .sm-filter-group { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; flex: 1; min-width: 0; }
    .sm-search { flex: 1 1 240px; max-width: 320px; margin: 0; }
    .sm-select { width: auto; min-width: 160px; }
    .sm-dates { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .sm-date-label { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--color-text-muted); }
    .sm-date { width: auto; }
    .sm-current { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); font-size: var(--text-sm); background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .sm-current strong { font-size: var(--text-md); color: var(--color-text); }
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    /* Movement type semantics: in = success, out = danger, transfer = info, adjustment = warning */
    .badge-in, .badge-return { background: var(--color-success-subtle); color: var(--color-success-text); border-color: var(--color-success-border); }
    .badge-out, .badge-order { background: var(--color-danger-subtle); color: var(--color-danger-text); border-color: var(--color-danger-border); }
    .badge-transfer-in, .badge-transfer-out { background: var(--color-info-subtle); color: var(--color-info-text); border-color: var(--color-info-border); }
    .badge-adjustment { background: var(--color-warning-subtle); color: var(--color-warning-text); border-color: var(--color-warning-border); }
    .performed-badge { display: inline-flex; align-items: center; padding: 2px var(--space-2); border-radius: var(--radius-xs); font-size: var(--text-2xs); font-weight: var(--weight-semibold); white-space: nowrap; }
    .performed-system { background: var(--color-surface-muted); color: var(--color-text-muted); }
    .performed-admin { background: var(--color-primary-subtle); color: var(--color-primary-text); }
    @media (max-width: 640px) {
      .sm-search { max-width: none; flex-basis: 100%; }
      .sm-select { flex: 1 1 100%; }
      .sm-dates { width: 100%; }
      .sm-date { flex: 1; min-width: 0; }
      .filter-pills { overflow-x: auto; flex-wrap: nowrap; max-width: 100%; }
    }
  `]
})
export class StockMovementsComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);
  
  movements = signal<any[]>([]);
  products = signal<Product[]>([]);
  warehouses = signal<Warehouse[]>([]);
  selectedWarehouseId = signal<string>('');
  warehouseMap = computed(() => new Map(this.warehouses().map(w => [w.id, w.name])));
  isLoading = signal(true);
  searchQuery = signal('');

  // Date and Type Filter Signals
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedTypes = signal<string[]>([]);

  // Pagination Signals
  currentPage = signal(1);
  totalItems = signal(0);
  pageSize = signal(10);
  totalPages = computed(() => Math.ceil(this.totalItems() / this.pageSize()));

  // Drawer Signals
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  selectedProduct = signal<Product | null>(null);

  adjustForm: FormGroup = this.fb.group({
    productId: ['', Validators.required],
    newQuantity: [null, [Validators.required, Validators.min(0)]],
    note: ['', Validators.required]
  });

  ngOnInit() {
    this.loadMovements(1);
    this.loadProducts();
    this.inventory.getWarehouses().subscribe({ next: (data) => this.warehouses.set(data || []) });
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      this.loadMovements(1);
    });
  }

  private searchTimeout: any;

  loadMovements(page = 1) {
    this.isLoading.set(true);
    const search = this.searchQuery();
    const typeParam = this.selectedTypes().length > 0 ? this.selectedTypes().join(',') : undefined;
    this.inventory.getStockMovements(
      undefined,
      page,
      this.pageSize(),
      search,
      this.startDate() || undefined,
      this.endDate() || undefined,
      typeParam
    ).subscribe({
      next: (res) => {
        this.movements.set(res.data);
        this.totalItems.set(res.total);
        this.currentPage.set(page);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.ui.showToast(this.i18n.t('stockMovements.toast.loadError'), 'error');
      }
    });
  }

  loadProducts() {
    this.inventory.getProducts().subscribe({
      next: (data) => {
        this.products.set(data);
      }
    });
  }

  onStartDateChange(val: string) {
    this.startDate.set(val);
    this.loadMovements(1);
  }

  onEndDateChange(val: string) {
    this.endDate.set(val);
    this.loadMovements(1);
  }

  clearDateFilter() {
    this.startDate.set('');
    this.endDate.set('');
    this.loadMovements(1);
  }

  toggleType(type: string) {
    if (type === 'ALL') {
      this.selectedTypes.set([]);
    } else {
      const current = this.selectedTypes();
      if (current.includes(type)) {
        this.selectedTypes.set(current.filter(t => t !== type));
      } else {
        this.selectedTypes.set([...current, type]);
      }
    }
    this.loadMovements(1);
  }

  exportToCSV() {
    const search = this.searchQuery();
    const typeParam = this.selectedTypes().length > 0 ? this.selectedTypes().join(',') : undefined;
    this.inventory.getStockMovements(
      undefined,
      1,
      100000,
      search,
      this.startDate() || undefined,
      this.endDate() || undefined,
      typeParam
    ).subscribe({
      next: (res) => {
        const wid = this.selectedWarehouseId();
        const list = wid ? res.data.filter((m: any) => m.warehouseId === wid) : res.data;
        if (!list || list.length === 0) {
          this.ui.showToast(this.i18n.t('stockMovements.toast.nothingToExport'), 'error');
          return;
        }

        const headers = ['stockMovements.csv.date', 'stockMovements.csv.productName', 'stockMovements.csv.type', 'stockMovements.csv.warehouse', 'stockMovements.csv.quantity', 'stockMovements.csv.previousStock', 'stockMovements.csv.newStock', 'stockMovements.csv.note', 'stockMovements.csv.referenceType', 'stockMovements.csv.referenceId', 'stockMovements.csv.performedBy'].map(k => this.i18n.t(k));
        const rows = list.map((m: any) => {
          const dateStr = this.i18n.formatDate(m.createdAt, 'datetime');
          return [
            `"${dateStr}"`,
            `"${m.productName.replace(/"/g, '""')}"`,
            `"${this.getTypeName(m.type)}"`,
            `"${this.getWarehouseName(m.warehouseId).replace(/"/g, '""')}"`,
            m.quantity,
            m.previousQuantity,
            m.newQuantity,
            `"${(m.note || '').replace(/"/g, '""')}"`,
            `"${m.referenceType || ''}"`,
            `"${m.referenceId || ''}"`,
            `"${m.performedBy || ''}"`
          ];
        });

        const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${this.i18n.t('stockMovements.csv.fileName')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.ui.showToast(this.i18n.t('stockMovements.toast.exported'), 'success');
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockMovements.toast.exportError'), 'error');
      }
    });
  }

  onSearch(query: string) {
    this.searchQuery.set(query);
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.loadMovements(1);
    }, 300);
  }

  // getStockMovements has no warehouseId param, so the warehouse filter is applied client-side to the loaded page
  filteredMovements() {
    const wid = this.selectedWarehouseId();
    const list = this.movements();
    return wid ? list.filter(m => m.warehouseId === wid) : list;
  }

  /** Comma list of serials, truncated after 3 entries. */
  formatSerials(serials: string[] | null | undefined): string {
    const list = serials || [];
    if (list.length <= 3) return list.join(', ');
    return list.slice(0, 3).join(', ') + ' ' + this.i18n.t('stockMovements.moreSerials', { count: list.length - 3 });
  }

  getWarehouseName(id: string | null | undefined): string {
    if (!id) return '-';
    return this.warehouseMap().get(id) || '-';
  }

  getStartCount(): number {
    if (this.totalItems() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  }

  getEndCount(): number {
    return Math.min(this.currentPage() * this.pageSize(), this.totalItems());
  }

  getPagesArray(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    
    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    
    for (let i = start; i <= end; i++) {
      if (i >= 1 && i <= total) {
        pages.push(i);
      }
    }
    return pages;
  }

  openDrawer() {
    this.adjustForm.reset({
      productId: '',
      newQuantity: null,
      note: ''
    });
    this.selectedProduct.set(null);
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.adjustForm.reset();
    this.selectedProduct.set(null);
  }

  onProductSelect() {
    const pId = this.adjustForm.get('productId')?.value;
    const prod = this.products().find(p => p.id === pId) || null;
    this.selectedProduct.set(prod);
    if (prod) {
      this.adjustForm.patchValue({
        newQuantity: prod.quantity
      });
    }
  }

  hasValue(fieldName: string): boolean {
    const val = this.adjustForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.adjustForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  saveAdjustment() {
    if (this.adjustForm.invalid) {
      this.adjustForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const { productId, newQuantity, note } = this.adjustForm.value;

    this.inventory.createManualAdjustment(productId, newQuantity, note).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.ui.showToast(this.i18n.t('stockMovements.toast.adjusted'), 'success');
        this.loadMovements(1); // Go back to first page to see the new adjustment
        this.loadProducts(); // Reload products to get the updated stock quantity
      },
      error: (err) => {
        this.isSaving.set(false);
        const errMsg = err?.error?.message || this.i18n.t('stockMovements.toast.adjustError');
        this.ui.showToast(errMsg, 'error');
      }
    });
  }

  formatReference(type: string | null, id: string | null): string {
    if (!type || !id) return '';
    let label = '';
    switch (type.toUpperCase()) {
      case 'ORDER':
        label = this.i18n.t('stockMovements.type.order');
        break;
      case 'PURCHASE_ORDER':
        label = this.i18n.t('stockMovements.ref.purchaseOrder');
        break;
      case 'STOCK_COUNT':
        label = this.i18n.t('stockMovements.ref.stockCount');
        break;
      case 'ADJUSTMENT':
        label = this.i18n.t('stockMovements.type.adjustment');
        break;
      default:
        label = type;
    }
    const shortId = id.length > 8 ? id.substring(0, 8) : id;
    return `${label} ${this.i18n.t('stockMovements.ref.prefix')}: #${shortId}`;
  }

  getTypeName(type: string) {
    switch (type) {
      case 'IN': return this.i18n.t('stockMovements.type.in');
      case 'OUT': return this.i18n.t('stockMovements.type.out');
      case 'ORDER': return this.i18n.t('stockMovements.type.order');
      case 'RETURN': return this.i18n.t('stockMovements.type.return');
      case 'ADJUSTMENT': return this.i18n.t('stockMovements.type.adjustment');
      case 'TRANSFER_OUT': return this.i18n.t('stockMovements.type.transferOut');
      case 'TRANSFER_IN': return this.i18n.t('stockMovements.type.transferIn');
      default: return type;
    }
  }

  getBadgeClass(type: string) {
    switch (type) {
      case 'IN': return 'badge-in';
      case 'ORDER': return 'badge-order';
      case 'RETURN': return 'badge-return';
      case 'ADJUSTMENT': return 'badge-adjustment';
      case 'OUT': return 'badge-out';
      case 'TRANSFER_OUT': return 'badge-transfer-out';
      case 'TRANSFER_IN': return 'badge-transfer-in';
      default: return '';
    }
  }
}

