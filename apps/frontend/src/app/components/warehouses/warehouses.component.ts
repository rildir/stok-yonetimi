import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';

@Component({
  selector: 'app-warehouses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent],
  styleUrls: ['../../drawer.css'],
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
                <th>Depo Adı</th>
                <th>Depo Kodu</th>
                <th>Adres</th>
                <th style="text-align: right;">Ürün Çeşidi</th>
                <th style="text-align: right;">Toplam Stok</th>
                <th style="text-align: right;">Toplam Değer</th>
                <th class="th-actions">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              @for (w of filteredWarehouses(); track w.id) {
                <tr>
                  <td><strong>{{ w.name }}</strong></td>
                  <td class="mono">{{ w.code }}</td>
                  <td>{{ w.address || '-' }}</td>
                  <td class="mono" style="text-align: right;">{{ w.productCount }}</td>
                  <td class="mono" style="text-align: right; font-weight: 600;">{{ w.totalStock }}</td>
                  <td class="mono" style="text-align: right; font-weight: 600; color: var(--primary);">₺{{ w.totalValue | number:'1.2-2' }}</td>
                  <td class="td-actions">
                    <button class="edit-btn" title="Düzenle" (click)="openDrawer(w)">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="delete-btn" title="Sil" (click)="deleteWarehouse(w)" [disabled]="w.totalStock > 0">
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

    <!-- Delete Confirmation Modal -->
    @if (showDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteWarehouse()" [disabled]="isSaving()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">Depoyu Sil</h3>
            <p class="delete-modal-desc">
              <strong>{{ warehouseToDelete()?.name }}</strong> adlı depoyu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteWarehouse()" [disabled]="isSaving()">Vazgeç</button>
            <button class="btn btn-danger" (click)="confirmDeleteWarehouse()" [disabled]="isSaving()">
              @if (isSaving()) { <span class="spinner-sm spinner-light"></span> Siliniyor... } @else { Sil }
            </button>
          </div>
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
  showDeleteModal = signal(false);
  warehouseToDelete = signal<any>(null);
 
  searchQuery = signal('');

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
    this.warehouseToDelete.set(warehouse);
    this.showDeleteModal.set(true);
  }

  cancelDeleteWarehouse() {
    this.showDeleteModal.set(false);
    this.warehouseToDelete.set(null);
  }

  confirmDeleteWarehouse() {
    const warehouse = this.warehouseToDelete();
    if (!warehouse) return;
    
    this.isSaving.set(true);
    this.inventory.deleteWarehouse(warehouse.id).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showDeleteModal.set(false);
        this.warehouseToDelete.set(null);
        this.loadWarehouses();
        this.ui.showToast('Depo başarıyla silindi.', 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || 'Depo silinirken hata oluştu.', 'error');
      }
    });
  }
}
