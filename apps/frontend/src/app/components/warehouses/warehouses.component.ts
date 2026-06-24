import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs';

@Component({
  selector: 'app-warehouses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .dim-text {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-style: italic;
      font-weight: normal;
    }
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
        <h1>Depo Yönetimi</h1>
        <p>Depolarınızı, şubelerinizi ve depolardaki stok durumlarını yönetin.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Yeni Depo
        </button>
      </div>
    </header>

    <!-- Search Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Depo adı veya kodu ara..." [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
      <div style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm);">
        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(99, 102, 241, 0.08); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Toplam Depo</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">{{ totalWarehouseCount() }}</div>
        </div>
      </div>

      <div style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm);">
        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(5, 150, 105, 0.08); color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Toplam Stok</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">{{ totalStockCount() }}</div>
        </div>
      </div>

      <div style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm);">
        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(139, 92, 246, 0.08); color: var(--ai-accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Toplam Değer</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">₺{{ totalStockValue() | number:'1.2-2' }}</div>
        </div>
      </div>
    </div>
 
    <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
      @if (isLoading()) {
        <div class="loading-state">Yükleniyor...</div>
      } @else if (warehouses().length === 0) {
        <div class="empty-state">
          <p>Henüz hiç depo tanımlanmamış.</p>
          <button class="btn btn-outline" (click)="openDrawer()" style="margin-top: 16px;">İlk Depoyu Ekle</button>
        </div>
      } @else if (filteredWarehouses().length === 0) {
        <div class="empty-state">
          <p>Arama kriterlerinize uygun depo bulunamadı.</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Depo adı</th>
                <th>Depo kodu</th>
                <th>Adres</th>
                <th style="text-align: right;">Ürün çeşidi</th>
                <th style="text-align: right;">Toplam stok</th>
                <th style="text-align: right;">Toplam değer</th>
                <th class="th-actions">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              @for (w of filteredWarehouses(); track w.id) {
                <tr (click)="goToWarehouseProducts(w)" style="cursor: pointer;" class="warehouse-row">
                  <td><strong>{{ w.name }}</strong></td>
                  <td class="mono" style="color: var(--text-primary);">{{ w.code }}</td>
                  <td style="color: var(--text-primary);">{{ w.address || '-' }}</td>
                  <td class="mono" style="text-align: right;">
                    @if (w.productCount === 0) {
                      <span class="dim-text">Ürün atanmadı</span>
                    } @else {
                      {{ w.productCount }}
                    }
                  </td>
                  <td class="mono" style="text-align: right; font-weight: 600;">
                    @if (w.totalStock === 0) {
                      <span class="dim-text">Ürün atanmadı</span>
                    } @else {
                      {{ w.totalStock }}
                    }
                  </td>
                  <td class="mono" style="text-align: right; font-weight: 600; color: var(--text-primary);">₺{{ w.totalValue | number:'1.2-2' }}</td>
                  <td class="td-actions" (click)="$event.stopPropagation()">
                    <button class="edit-btn" title="Detay" (click)="goToWarehouseProducts(w); $event.stopPropagation()" style="color: var(--primary);">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </button>
                    <button class="edit-btn" title="Düzenle" (click)="openDrawer(w); $event.stopPropagation()">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="delete-btn" title="Sil" (click)="deleteWarehouse(w); $event.stopPropagation()" [disabled]="w.totalStock > 0">
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
            <span class="drawer-title">{{ editId() ? 'Depo Düzenle' : 'Yeni Depo Ekle' }}</span>
            <button class="drawer-close" (click)="closeDrawer()">×</button>
          </div>

          <form [formGroup]="warehouseForm" (ngSubmit)="saveWarehouse()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="warehouseName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaving()" />
                <label for="warehouseName" class="form-label">Depo Adı</label>
                @if (isFieldInvalid('name')) { <div class="form-error">⚠ Depo adı zorunludur.</div> }
              </div>

              <div class="form-field">
                <input id="warehouseCode" type="text" formControlName="code" class="form-input" [class.has-value]="hasValue('code')" [disabled]="isSaving()" />
                <label for="warehouseCode" class="form-label">Depo Kodu</label>
                @if (isFieldInvalid('code')) { <div class="form-error">⚠ Depo kodu zorunludur.</div> }
              </div>

              <div class="form-field">
                <textarea id="warehouseAddress" formControlName="address" class="form-input" [class.has-value]="hasValue('address')" [disabled]="isSaving()"></textarea>
                <label for="warehouseAddress" class="form-label">Adres</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="warehouseForm.invalid || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { Kaydet }
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
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);

  warehouses = signal<any[]>([]);
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
        this.ui.showToast('Depolar yüklenirken hata oluştu.', 'error');
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
        this.ui.showToast(id ? 'Depo başarıyla güncellendi.' : 'Depo başarıyla eklendi.', 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || 'Depo kaydedilirken hata oluştu.', 'error');
      }
    });
  }

  deleteWarehouse(warehouse: any) {
    if (warehouse.totalStock > 0) {
      this.ui.showToast('İçinde ürün olan depolar silinemez.', 'error');
      return;
    }
    
    this.ui.openConfirm({
      title: 'Depoyu sil',
      message: `${warehouse.name} kalıcı olarak silinecek, bu işlem geri alınamaz.`,
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deleteWarehouse(warehouse.id).pipe(
          tap({
            next: () => {
              this.loadWarehouses();
              this.ui.showToast('Depo başarıyla silindi.', 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || 'Depo silinirken hata oluştu.', 'error');
            }
          })
        );
      }
    });
  }
}
