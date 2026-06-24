import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InventoryService, Product } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';

@Component({
  selector: 'app-stock-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent],
  template: `
    <header class="page-header">
      <div>
        <h1>Stok Hareketleri</h1>
        <p>Depodaki tüm ürün giriş, çıkış ve düzeltme işlemlerinin tarihçesi.</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" (click)="loadMovements(currentPage())">Yenile</button>
        <button class="btn btn-outline" (click)="exportToCSV()" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Dışa Aktar
        </button>
        <div style="width: 1px; height: 20px; background-color: #D5D9D9; margin: 0 8px; align-self: center;"></div>
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Manuel Düzeltme
        </button>
      </div>
    </header>

    <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between;">
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; flex: 1;">
        <!-- Arama Inputu -->
        <div class="search-box" style="margin: 0; min-width: 240px; flex: 1; max-width: 320px;">
          <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" placeholder="Ürün adına göre filtrele..." [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)" />
        </div>

        <!-- Tarih Filtresi -->
        <div class="date-filters">
          <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted); margin-right: 0.25rem;">Başlangıç:</span>
          <input type="date" class="date-input" [ngModel]="startDate()" (ngModelChange)="onStartDateChange($event)" title="Başlangıç Tarihi" />
          <span class="date-separator">-</span>
          <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted); margin-right: 0.25rem;">Bitiş:</span>
          <input type="date" class="date-input" [ngModel]="endDate()" (ngModelChange)="onEndDateChange($event)" title="Bitiş Tarihi" />
          @if (startDate() || endDate()) {
            <button class="btn btn-sm btn-secondary" (click)="clearDateFilter()" style="padding: 4px 8px; font-size: 0.7rem; height: 26px; border-radius: var(--radius-sm); margin-left: 6px;">
              Temizle
            </button>
          }
        </div>
      </div>

      <!-- İşlem Tipi Filtresi -->
      <div class="filter-pills">
        <button type="button" class="filter-pill" [class.active]="selectedTypes().length === 0" (click)="toggleType('ALL')">Tümü</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('IN')" (click)="toggleType('IN')">Stok girişi</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('ORDER')" (click)="toggleType('ORDER')">Sipariş</button>
        <button type="button" class="filter-pill" [class.active]="selectedTypes().includes('RETURN')" (click)="toggleType('RETURN')">İptal / iade</button>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="loading-state">Yükleniyor...</div>
      } @else if (filteredMovements().length === 0) {
        <div class="empty-state">
          <p>Kayıtlı stok hareketi bulunamadı.</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Ürün adı</th>
                <th>İşlem tipi</th>
                <th style="text-align: right;">Miktar</th>
                <th style="text-align: right;">Eski stok</th>
                <th style="text-align: right;">Yeni stok</th>
                <th>Not / referans</th>
                <th>İşlemi yapan</th>
              </tr>
            </thead>
            <tbody>
              @for (m of filteredMovements(); track m.id) {
                <tr>
                  <td>{{ m.createdAt | date:'dd.MM.yyyy HH:mm' }}</td>
                  <td><strong>{{ m.productName }}</strong></td>
                  <td>
                    <span class="badge" [ngClass]="getBadgeClass(m.type)">
                       {{ getTypeName(m.type) }}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <span [class.text-success]="m.quantity > 0" [class.text-danger]="m.quantity < 0">
                      {{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}
                    </span>
                  </td>
                  <td style="text-align: right;">{{ m.previousQuantity }}</td>
                  <td style="text-align: right; font-weight: 600;">{{ m.newQuantity }}</td>
                  <td>
                    <div class="text-xs text-muted" style="margin-bottom: 2px;">{{ m.note }}</div>
                    @if (m.referenceId) {
                      <span class="badge badge-muted">
                        {{ formatReference(m.referenceType, m.referenceId) }}
                      </span>
                    }
                  </td>
                  <td>
                    @if (m.performedBy && m.performedBy.toLowerCase() === 'system') {
                      <span class="performed-badge performed-system">System</span>
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
            Toplam <strong>{{ totalItems() }}</strong> hareketten <strong>{{ getStartCount() }} - {{ getEndCount() }}</strong> arası gösteriliyor
          </div>
          <div class="pagination-actions">
            <button class="page-btn" [disabled]="currentPage() === 1" (click)="loadMovements(currentPage() - 1)">
              Önceki
            </button>
            @for (p of getPagesArray(); track p) {
              <button class="page-btn" [class.active]="p === currentPage()" (click)="loadMovements(p)">
                {{ p }}
              </button>
            }
            <button class="page-btn" [disabled]="currentPage() >= totalPages()" (click)="loadMovements(currentPage() + 1)">
              Sonraki
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
            <span class="drawer-title">Manuel Stok Düzeltme</span>
            <button class="drawer-close" (click)="closeDrawer()">×</button>
          </div>

          <form [formGroup]="adjustForm" (ngSubmit)="saveAdjustment()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              
              <!-- Ürün Seçimi -->
              <div class="form-field">
                <select id="adjProduct" formControlName="productId" class="form-input form-select" [class.has-value]="hasValue('productId')" (change)="onProductSelect()">
                  <option value="" disabled selected></option>
                  @for (p of products(); track p.id) {
                    <option [value]="p.id">{{ p.name }} (SKU: {{ p.sku }})</option>
                  }
                </select>
                <label for="adjProduct" class="form-label">Ürün Seçin</label>
                @if (isFieldInvalid('productId')) { <div class="form-error">⚠ Ürün seçimi zorunludur.</div> }
              </div>

              <!-- Mevcut Stok (Salt Okunur) -->
              @if (selectedProduct()) {
                <div style="font-size: 0.85rem; padding: 0.75rem 1rem; background: var(--canvas); border-radius: var(--radius-md); border: 1px solid var(--secondary); display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-muted); font-weight: 500;">Mevcut Stok Miktarı:</span>
                  <strong style="color: var(--text-primary); font-size: 1rem;">{{ selectedProduct()?.quantity }}</strong>
                </div>
              }

              <!-- Yeni Miktar -->
              <div class="form-field">
                <input id="adjNewQty" type="number" formControlName="newQuantity" class="form-input" [class.has-value]="hasValue('newQuantity')" min="0" />
                <label for="adjNewQty" class="form-label">Yeni Stok Miktarı</label>
                @if (isFieldInvalid('newQuantity')) { <div class="form-error">⚠ Geçerli bir stok miktarı girin (min: 0).</div> }
              </div>

              <!-- Açıklama / Not -->
              <div class="form-field">
                <textarea id="adjNote" formControlName="note" class="form-input" [class.has-value]="hasValue('note')"></textarea>
                <label for="adjNote" class="form-label">Düzeltme Nedeni / Açıklama</label>
                @if (isFieldInvalid('note')) { <div class="form-error">⚠ Açıklama alanı zorunludur.</div> }
              </div>

            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="adjustForm.invalid || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { Kaydet }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styles: [`
    .text-success { color: var(--status-instock); font-weight: 600; }
    .text-danger { color: var(--status-outstock); font-weight: 600; }
    table tbody td {
      vertical-align: top;
      padding-top: 12px;
      padding-bottom: 12px;
    }
    .badge-in { background: rgba(0, 118, 0, 0.08); color: #007600; }
    .badge-order { background: rgba(59, 130, 246, 0.08); color: #2563EB; }
    .badge-return { background: rgba(196, 85, 0, 0.08); color: #C45500; }
    .badge-adjustment { background: rgba(100, 116, 139, 0.08); color: #64748B; }
    .badge-out { background: rgba(177, 39, 4, 0.08); color: #B12704; }
    .performed-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      font-family: var(--font-mono);
    }
    .performed-system {
      background: rgba(100, 116, 139, 0.08);
      color: #64748B;
    }
    .performed-admin {
      background: rgba(139, 92, 246, 0.08);
      color: #8B5CF6;
    }
  `]
})
export class StockMovementsComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  
  movements = signal<any[]>([]);
  products = signal<Product[]>([]);
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
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      this.loadMovements(1);
    });
  }

  private searchTimeout: any;

  loadMovements(page: number = 1) {
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
        this.ui.showToast('Stok hareketleri yüklenemedi.', 'error');
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
        const list = res.data;
        if (!list || list.length === 0) {
          this.ui.showToast('Dışa aktarılacak hareket bulunamadı.', 'error');
          return;
        }

        const headers = ['Tarih', 'Ürün Adı', 'İşlem Tipi', 'Miktar', 'Eski Stok', 'Yeni Stok', 'Açıklama', 'Referans Tipi', 'Referans ID', 'Gerçekleştiren'];
        const rows = list.map((m: any) => {
          const dateStr = new Date(m.createdAt).toLocaleString('tr-TR');
          return [
            `"${dateStr}"`,
            `"${m.productName.replace(/"/g, '""')}"`,
            `"${this.getTypeName(m.type)}"`,
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
        link.setAttribute('download', `stok_hareketleri_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.ui.showToast('Stok hareketleri CSV olarak indirildi.', 'success');
      },
      error: () => {
        this.ui.showToast('Stok hareketleri indirilirken hata oluştu.', 'error');
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

  filteredMovements() {
    return this.movements();
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
    let end = Math.min(total, start + 4);
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
        this.ui.showToast('Stok düzeltmesi başarıyla uygulandı.', 'success');
        this.loadMovements(1); // Go back to first page to see the new adjustment
        this.loadProducts(); // Reload products to get the updated stock quantity
      },
      error: (err) => {
        this.isSaving.set(false);
        const errMsg = err?.error?.message || 'Stok düzeltmesi uygulanamadı.';
        this.ui.showToast(errMsg, 'error');
      }
    });
  }

  formatReference(type: string | null, id: string | null): string {
    if (!type || !id) return '';
    let label = '';
    switch (type.toUpperCase()) {
      case 'ORDER':
        label = 'Sipariş';
        break;
      case 'PURCHASE_ORDER':
        label = 'Satın Alma';
        break;
      case 'STOCK_COUNT':
        label = 'Stok Sayımı';
        break;
      case 'ADJUSTMENT':
        label = 'Düzeltme';
        break;
      default:
        label = type;
    }
    const shortId = id.length > 8 ? id.substring(0, 8) : id;
    return `${label} Ref: #${shortId}`;
  }

  getTypeName(type: string) {
    switch (type) {
      case 'IN': return 'Stok girişi';
      case 'OUT': return 'Stok çıkışı';
      case 'ORDER': return 'Sipariş';
      case 'RETURN': return 'İptal / iade';
      case 'ADJUSTMENT': return 'Düzeltme';
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
      default: return '';
    }
  }
}

