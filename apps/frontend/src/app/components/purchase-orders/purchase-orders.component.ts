import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>Satın Alma Siparişleri</h1>
        <p>Tedarikçilere verilen siparişler ve stok kabulleri.</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Yeni Sipariş
        </button>
        <div style="width: 1px; height: 20px; background-color: #D5D9D9; margin: 0 8px; align-self: center;"></div>
        <button class="btn btn-outline" (click)="autoDraft()" [disabled]="isAutoDrafting()" title="Stok seviyesi düşük ürünler için otomatik sipariş taslağı oluştur">
          @if (isAutoDrafting()) {
            <span class="spinner-sm"></span> Analiz ediliyor...
          } @else {
            <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #9333ea; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Otomatik Sipariş Taslağı
          }
        </button>
      </div>
    </header>

    <!-- Search & Filter Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Tedarikçi adı veya PO no ara..." [ngModel]="poSearch()" (ngModelChange)="poSearch.set($event)"/>
      </div>
      
      <div class="date-filters">
        <input type="date" class="date-input" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" title="Başlangıç Tarihi" />
        <span class="date-separator">-</span>
        <input type="date" class="date-input" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" title="Bitiş Tarihi" />
        @if (startDate() || endDate()) {
          <button class="btn-clear" (click)="startDate.set(''); endDate.set('')" title="Filtreyi Temizle">✕</button>
        }
      </div>

      <div class="filter-pills">
        <button class="filter-pill" [class.active]="poFilterStatus() === 'all'" (click)="poFilterStatus.set('all')">Tümü</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Draft'" (click)="poFilterStatus.set('Draft')">Taslak</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Sent'" (click)="poFilterStatus.set('Sent')">Gönderildi</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Received'" (click)="poFilterStatus.set('Received')">Teslim Alındı</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Cancelled'" (click)="poFilterStatus.set('Cancelled')">İptal Edilen</button>
      </div>
    </div>

    @if (isLoading()) {
      <div class="loading-state" style="padding: 3rem; text-align: center; color: #565959;">Yükleniyor...</div>
    } @else if (filteredOrders().length === 0) {
      <div class="empty-state" style="padding: 3rem; text-align: center; border: 1px dashed #D5D9D9; border-radius: 8px; background: #FFFFFF; width: 100%;">
        <p style="font-size: 15px; color: #565959; margin-bottom: 16px;">Arama kriterlerine uygun satın alma siparişi bulunamadı.</p>
        <button class="btn btn-outline" (click)="openDrawer()">Sipariş Oluştur</button>
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
                  <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">Sipariş tarihi</div>
                  <div style="color: #0F1111; font-weight: 500;">{{ o.createdAt | date:'dd.MM.yyyy' }}</div>
                </div>
                <div>
                  <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">Toplam tutar</div>
                  <div style="color: #B12704; font-weight: bold; font-family: var(--font-mono);">₺{{ o.totalAmount | number:'1.2-2' }}</div>
                </div>
                <div>
                  <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">Tedarikçi</div>
                  <div style="color: #0F1111; font-weight: 500;">{{ o.supplierName }}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: bold; text-transform: none; margin-bottom: 2px; color: #0F1111;">PO no: #{{ o.poNumber }}</div>
                <div>
                  <a href="#" (click)="openDetailDrawer(o); $event.preventDefault()" style="color: #007185; text-decoration: none; font-weight: 500;" onmouseover="this.style.color='#C45500'" onmouseout="this.style.color='#007185'">Sipariş Detayları</a>
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
                  @for (item of o.items; track item.productId) {
                    <div style="display: flex; justify-content: space-between; width: 100%; max-width: 450px; font-size: 13px;">
                      <span style="color: #007185; font-weight: 500;">{{ item.productName }}</span>
                      <span style="color: #565959;">{{ item.quantity }} adet</span>
                    </div>
                  }
                </div>

                <!-- Notes/Expected date -->
                @if (o.expectedDate || o.notes) {
                  <div style="margin-top: 10px; font-size: 12px; color: #565959; background: #F7FAFA; border: 1px solid #D5D9D9; border-radius: 4px; padding: 6px 12px; display: inline-block; max-width: 450px;">
                    @if (o.expectedDate) {
                      📅 Beklenen Tarih: <strong>{{ o.expectedDate | date:'dd.MM.yyyy' }}</strong>
                    }
                    @if (o.expectedDate && o.notes) { <span style="margin: 0 8px;">|</span> }
                    @if (o.notes) {
                      📝 Notlar: <em>{{ o.notes }}</em>
                    }
                  </div>
                }
              </div>

              <!-- Right: Actions buttons -->
              <div style="display: flex; flex-direction: column; gap: 8px; width: 160px; flex-shrink: 0;" (click)="$event.stopPropagation()">
                @if (o.status === 'Draft' || o.status === 'Sent') {
                  @if (o.status === 'Draft') {
                    <button class="btn btn-primary btn-sm" (click)="sendPurchaseOrder(o)" style="width: 100%; border-radius: 20px;">
                      Gönder
                    </button>
                    <button class="btn btn-secondary btn-sm" (click)="editPurchaseOrder(o)" style="width: 100%; border-radius: 20px;">
                      Düzenle
                    </button>
                  }
                  <button class="btn btn-primary btn-sm" (click)="receivePurchaseOrder(o)" style="width: 100%; border-radius: 20px; background-color: #007185; color: #fff; border-color: #005a6a;">
                    Teslim Al
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="o.status === 'Draft' ? deletePurchaseOrder(o) : cancelPurchaseOrder(o)" style="width: 100%; border-radius: 20px; color: #B12704; border-color: rgba(220,38,38,0.2);">
                    {{ o.status === 'Draft' ? 'Sil' : 'İptal Et' }}
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
            <span class="drawer-title">{{ editingPoId() ? 'Satın Alma Siparişini Düzenle' : 'Yeni Satın Alma Siparişi' }}</span>
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
                <label class="form-label">Tedarikçi</label>
                @if (isFieldInvalid('supplierId')) { <div class="form-error">⚠ Tedarikçi seçimi zorunludur.</div> }
              </div>

              <div class="form-field">
                <input type="date" formControlName="expectedDate" class="form-input has-value" />
                <label class="form-label">Beklenen Tarih</label>
              </div>

              <div class="form-field">
                <textarea formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')"></textarea>
                <label class="form-label">Notlar</label>
              </div>

              <div style="margin-top: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0;">Sipariş Kalemleri</h3>
                  <button type="button" class="btn btn-sm btn-outline" (click)="addItem()">+ Ürün Ekle</button>
                </div>

                <div formArrayName="items" style="display: flex; flex-direction: column; gap: 10px;">
                  @for (item of itemsArray.controls; track i; let i = $index) {
                    <div [formGroupName]="i" style="display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--canvas); border: 1px solid var(--secondary); border-radius: 8px;">
                      <div style="flex: 2;">
                        <select formControlName="productId" class="form-input form-select" style="height: 40px; padding: 0 12px; font-size: 13px;">
                          <option value="" disabled selected>Ürün Seçin</option>
                          @for (p of state.products(); track p.id) {
                            <option [value]="p.id">{{ p.name }} (Mevcut: {{ p.quantity }})</option>
                          }
                        </select>
                      </div>
                      <div style="flex: 1;">
                        <input type="number" formControlName="quantity" class="form-input" style="height: 40px; padding: 0 12px; font-size: 13px;" placeholder="Miktar" min="1" />
                      </div>
                      <button type="button" class="delete-btn" (click)="removeItem(i)" style="padding: 6px;">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  }
                  @if (itemsArray.length === 0) {
                    <div class="text-muted text-sm" style="text-align: center; padding: 16px; background: var(--canvas); border-radius: 8px; border: 1px dashed var(--secondary);">Henüz ürün eklenmedi.</div>
                  }
                </div>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="poForm.invalid || itemsArray.length === 0 || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { {{ editingPoId() ? 'Güncelle' : 'Oluştur' }} }
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
              <span class="drawer-title">Sipariş Detayı</span>
              <span class="text-muted" style="font-size:12px; display:block; margin-top:2px;">PO No: {{ detailOrder().poNumber }}</span>
            </div>
            <button class="drawer-close" (click)="closeDetailDrawer()">×</button>
          </div>
          <div class="drawer-body">
            <div class="detail-grid">
              <div class="detail-field">
                <span class="detail-label">Tedarikçi</span>
                <span class="detail-value">{{ detailOrder().supplierName }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Durum</span>
                <div>
                  <span class="badge" [ngClass]="getBadgeClass(detailOrder().status)">{{ getStatusName(detailOrder().status) }}</span>
                </div>
              </div>
              <div class="detail-field">
                <span class="detail-label">Oluşturulma</span>
                <span class="detail-value mono">{{ detailOrder().createdAt | date:'dd.MM.yyyy HH:mm' }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Beklenen tarih</span>
                <span class="detail-value mono">{{ (detailOrder().expectedDate | date:'dd.MM.yyyy') || '-' }}</span>
              </div>
            </div>
            
            <h3 class="detail-items-title">Kalemler</h3>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              @for (item of detailOrder().items; track item.productId) {
                <div class="detail-item-row">
                  <span class="detail-item-name">{{ item.productName }}</span>
                  <span class="detail-item-qty">{{ item.quantity }} Adet</span>
                </div>
              }
            </div>
            
            @if (detailOrder().notes) {
              <div style="margin-top: 24px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Notlar</h3>
                <p class="text-muted" style="font-size:14px; line-height:1.5; background: var(--canvas); padding: 12px; border-radius: 8px; border: 1px solid var(--secondary);">{{ detailOrder().notes }}</p>
              </div>
            }

            @if (detailOrder().status === 'Received') {
              <div style="margin-top: 24px; padding: 12px; border-radius: 8px; background-color: rgba(5, 150, 105, 0.08); border: 1px solid rgba(5, 150, 105, 0.2); display: flex; align-items: center; gap: 8px; color: var(--status-instock); font-weight: 500; font-size: 0.88rem;">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Bu sipariş teslim alınarak stoklar güncellenmiştir.
              </div>
            } @else if (detailOrder().status === 'Cancelled') {
              <div style="margin-top: 24px; padding: 12px; border-radius: 8px; background-color: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.2); display: flex; align-items: center; gap: 8px; color: var(--status-outstock); font-weight: 500; font-size: 0.88rem;">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Bu satın alma siparişi iptal edilmiştir.
              </div>
            }
          </div>
          <div class="drawer-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary" (click)="closeDetailDrawer()">Kapat</button>
            @if (detailOrder().status === 'Draft' || detailOrder().status === 'Sent') {
              @if (detailOrder().status === 'Draft') {
                <button class="btn btn-danger" (click)="deletePurchaseOrder(detailOrder())">Sil</button>
                <button class="btn btn-outline" (click)="editPurchaseOrder(detailOrder())">Düzenle</button>
                <button class="btn btn-outline" (click)="sendPurchaseOrder(detailOrder())" style="border-color: var(--status-lowstock); color: var(--status-lowstock)">Gönder</button>
              } @else {
                <button class="btn btn-danger" (click)="cancelPurchaseOrder(detailOrder())">İptal Et</button>
              }
              <button class="btn btn-primary" (click)="receivePurchaseOrder(detailOrder())">Teslim Al</button>
            }
          </div>
        </div>
      </div>
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

  orders = signal<any[]>([]);
  suppliers = signal<any[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  isAutoDrafting = signal(false);
  detailOrder = signal<any>(null);
  editingPoId = signal<string | null>(null);

  // Filter Signals
  poSearch = signal('');
  poFilterStatus = signal<string>('all');
  startDate = signal('');
  endDate = signal('');

  poForm: FormGroup = this.fb.group({
    supplierId: ['', Validators.required],
    supplierName: [''],
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
          this.ui.showToast('Satın alma siparişleri yüklenemedi.', 'error');
        }
      });
    });
  }

  openDrawer() {
    this.poForm.reset({
      supplierId: '',
      supplierName: '',
      expectedDate: '',
      notes: ''
    });
    this.itemsArray.clear();
    this.addItem();
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
      quantity: [1, [Validators.required, Validators.min(1)]]
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
    const mergedMap = new Map<string, number>();
    data.items.forEach((it: any) => {
      const existingQty = mergedMap.get(it.productId) || 0;
      mergedMap.set(it.productId, existingQty + Number(it.quantity));
    });
    
    const mergedItems = Array.from(mergedMap.entries()).map(([productId, quantity]) => {
      return {
        productId,
        quantity
      };
    });

    // Add product names to items
    const items = mergedItems.map((it: any) => {
      const p = this.state.products().find(x => x.id === it.productId);
      return {
        ...it,
        productName: p?.name || 'Bilinmeyen Ürün'
      };
    });

    data.items = items;

    const request$ = this.editingPoId()
      ? this.inventory.updatePurchaseOrder(this.editingPoId()!, data)
      : this.inventory.createPurchaseOrder(data);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadData();
        this.ui.showToast(this.editingPoId() ? 'Satın alma siparişi başarıyla güncellendi.' : 'Satın alma siparişi başarıyla oluşturuldu.', 'success');
        this.editingPoId.set(null);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || (this.editingPoId() ? 'Satın alma siparişi güncellenemedi.' : 'Satın alma siparişi oluşturulamadı.'), 'error');
      }
    });
  }

  editPurchaseOrder(order: any) {
    this.editingPoId.set(order.id);
    this.poForm.reset({
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : '',
      notes: order.notes || ''
    });
    this.itemsArray.clear();
    order.items.forEach((it: any) => {
      this.itemsArray.push(this.fb.group({
        productId: [it.productId, Validators.required],
        quantity: [it.quantity, [Validators.required, Validators.min(1)]]
      }));
    });
    this.closeDetailDrawer();
    this.isDrawerOpen.set(true);
  }

  deletePurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: 'Siparişi Sil',
      message: `${order.poNumber} numaralı satın alma siparişini silmek istediğinize emin misiniz?`,
      onConfirm: () => {
        this.inventory.deletePurchaseOrder(order.id).subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast('Satın alma siparişi silindi.', 'success');
          },
          error: (err) => {
            this.ui.showToast(err.error?.message || 'İşlem gerçekleştirilemedi.', 'error');
          }
        });
      }
    });
  }

  sendPurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: 'Siparişi Gönder',
      message: `${order.poNumber} numaralı siparişi tedarikçiye gönderildi olarak işaretlemek istiyor musunuz?`,
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Sent').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast('Satın alma siparişi gönderildi olarak işaretlendi.', 'success');
          },
          error: () => {
            this.ui.showToast('İşlem gerçekleştirilemedi.', 'error');
          }
        });
      }
    });
  }

  receivePurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: 'Teslim Al',
      message: `${order.poNumber} numaralı siparişi teslim alıp ürünleri stoklara eklemek istediğinize emin misiniz?`,
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Received').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.state.loadData(); // Refetch products to get updated stocks
            this.ui.showToast('Satın alma siparişi başarıyla teslim alındı.', 'success');
          },
          error: () => {
            this.ui.showToast('İşlem gerçekleştirilemedi.', 'error');
          }
        });
      }
    });
  }

  cancelPurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: 'Siparişi İptal Et',
      message: `${order.poNumber} numaralı siparişi iptal etmek istediğinize emin misiniz?`,
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Cancelled').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast('Satın alma siparişi iptal edildi.', 'success');
          },
          error: () => {
            this.ui.showToast('İşlem gerçekleştirilemedi.', 'error');
          }
        });
      }
    });
  }

  updateStatus(id: string, status: string) {
    this.ui.openConfirm({
      title: 'Durum Güncelle',
      message: 'Siparişi teslim alıp ürünleri stoklara eklemek istediğinize emin misiniz?',
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(id, status).subscribe({
          next: () => {
            this.loadData();
            this.state.loadData(); // Refetch products to get updated stocks
            this.ui.showToast('Satın alma siparişi teslim alındı.', 'success');
          },
          error: () => {
            this.ui.showToast('İşlem gerçekleştirilemedi.', 'error');
          }
        });
      }
    });
  }

  getStatusName(status: string) {
    switch (status) {
      case 'Draft': return 'Taslak';
      case 'Sent': return 'Gönderildi';
      case 'Received': return 'Teslim alındı';
      case 'Cancelled': return 'İptal edildi';
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
          this.ui.showToast(`${res.count} adet otomatik sipariş taslağı oluşturuldu.`, 'success');
        } else {
          this.ui.showToast('Tüm ürünler yeterli stok seviyesinde. Sipariş taslağı gerekmedi.', 'success');
        }
      },
      error: () => {
        this.isAutoDrafting.set(false);
        this.ui.showToast('Otomatik sipariş taslağı oluşturulamadı.', 'error');
      }
    });
  }
}
