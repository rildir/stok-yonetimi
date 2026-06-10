import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Product } from '../../inventory.service';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styles: [`
/* OVERLAY */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

/* PANEL — sağda sabit, tam yükseklik */
.drawer-panel {
  position: relative;
  width: 420px;
  height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.25s ease;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* HEADER */
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.drawer-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.drawer-close:hover {
  background: #f5f5f5;
  color: #1a1a1a;
}

/* BODY */
/* FORM GRUPLARI & FLOATING LABELS */
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  position: relative;
  width: 100%;
}

.form-input {
  width: 100%;
  box-sizing: border-box;
  height: 52px;
  padding: 18px 14px 6px 14px;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  color: #1a1a1a;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  outline: none;
}

.form-label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #999;
  pointer-events: none;
  transition: all 0.18s ease;
  transform-origin: left top;
  background: transparent;
}

/* Dolu veya focus durumunda label yukarı kayar */
.form-input:focus ~ .form-label,
.form-input.has-value ~ .form-label {
  top: 10px;
  transform: translateY(0) scale(0.75);
  color: #666;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* Focus border */
.form-input:focus {
  border-color: #1a1a1a;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}

/* Focus'ta label siyah */
.form-input:focus ~ .form-label {
  color: #1a1a1a;
}

/* Hata durumu - blur sonrası (focus değilken) */
.form-input.ng-invalid.ng-touched:not(:focus) {
  border-color: #e53e3e;
  box-shadow: none;
}
.form-input.ng-invalid.ng-touched:not(:focus) ~ .form-label {
  color: #e53e3e;
}

/* Hatalı alana focus gelince tekrar siyah */
.form-input.ng-invalid.ng-touched:focus {
  border-color: #1a1a1a;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
.form-input.ng-invalid.ng-touched:focus ~ .form-label {
  color: #1a1a1a;
}

/* SELECT ALANI */
.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 36px;
  cursor: pointer;
}

.form-select:valid ~ .form-label {
  top: 10px;
  transform: translateY(0) scale(0.75);
  color: #666;
  font-weight: 600;
}

/* BİRİM FİYAT PREFIX */
.form-input--prefix { padding-left: 28px; }

.form-prefix {
  position: absolute;
  left: 14px;
  bottom: 10px;
  font-size: 14px;
  color: #999;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.form-input--prefix.has-value ~ .form-prefix,
.form-input--prefix:focus ~ .form-prefix {
  opacity: 1;
}

.form-input--prefix:not(.has-value):not(:focus) ~ .form-prefix {
  opacity: 0;
}

/* FOOTER */
.drawer-footer {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fff;
}

.btn-secondary {
  height: 40px;
  background: #fff;
  border: 1px solid #d1d1d1;
  border-radius: 6px;
  font-size: 14px;
  color: #1a1a1a;
  cursor: pointer;
}
.btn-secondary:hover {
  background: #f5f5f5;
  border-color: #1a1a1a;
}

.btn-primary {
  height: 40px;
  background: #1a1a1a;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
}
.btn-primary:hover { background: #333; }
.btn-primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.form-error {
  font-size: 12px;
  color: #e53e3e;
  margin-top: 4px;
}

/* MOBİL */
@media (max-width: 768px) {
  .drawer-panel { width: 100vw; }
}
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>Ürün Yönetimi</h1>
        <p>İşletmenizin stoklarını ve ürün detaylarını buradan yönetin.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" (click)="openAddProduct()">+ Yeni Ürün Ekle</button>
        <button class="btn btn-primary" (click)="ui.toggleAiPanel()">
          <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Yapay Zeka Asistanı
        </button>
      </div>
    </header>

    <!-- Search & Filter Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Ürün adı, SKU veya kategori ara..." [value]="productSearch()" (input)="onSearchInput($event)"/>
      </div>
      <div class="filter-pills">
        <button class="filter-pill" [class.active]="productFilterStatus() === 'all'" (click)="productFilterStatus.set('all')">Tümü</button>
        <button class="filter-pill" [class.active]="productFilterStatus() === 'In stock'" (click)="productFilterStatus.set('In stock')">Stokta</button>
        <button class="filter-pill" [class.active]="productFilterStatus() === 'Low stock'" (click)="productFilterStatus.set('Low stock')">Azalıyor</button>
        <button class="filter-pill" [class.active]="productFilterStatus() === 'Out of stock'" (click)="productFilterStatus.set('Out of stock')">Tükendi</button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ürün Adı</th>
              <th>SKU</th>
              <th>Kategori</th>
              <th>Birim Fiyat</th>
              <th>Mevcut Stok</th>
              <th>Min. Limit</th>
              <th>Durum</th>
              <th class="th-actions">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            @for (p of filteredProducts(); track p.id) {
              <tr>
                <td><strong>{{ p.name }}</strong></td>
                <td class="mono">{{ p.sku }}</td>
                <td>{{ p.category }}</td>
                <td class="mono">₺{{ p.price }}</td>
                <td class="mono" style="font-weight:600">{{ p.quantity }}</td>
                <td class="mono" style="color:var(--text-muted)">{{ p.minQuantity }}</td>
                <td>
                  <span class="badge" [class.badge-instock]="p.status === 'In stock'" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">
                    {{ p.status === 'In stock' ? 'Stokta' : p.status === 'Low stock' ? 'Azalıyor' : 'Tükendi' }}
                  </span>
                </td>
                <td class="td-actions">
                  <button class="edit-btn" (click)="openEditProduct(p)" title="Düzenle">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button class="delete-btn" (click)="promptDeleteProduct(p)" title="Sil">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
            }
            @if (filteredProducts().length === 0) {
              <tr><td colspan="8" class="empty-state">Arama kriterlerinize uygun ürün bulunamadı.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Product Drawer ─── -->
    @if (showProductFormModal()) {
      <div class="drawer-overlay" (click)="closeProductForm()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
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
              
              <div class="form-field">
                <select id="productCategory" formControlName="category" class="form-input form-select" [class.has-value]="hasValue('category')" required [disabled]="isSaveLoading()">
                  <option value="" disabled selected></option>
                  <option value="Accessories">Aksesuarlar</option>
                  <option value="Audio">Ses Ekipmanları</option>
                  <option value="Monitors">Monitörler</option>
                  <option value="Wearables">Giyilebilir Teknoloji</option>
                  <option value="Furniture">Ofis Mobilyası</option>
                </select>
                <label for="productCategory" class="form-label">Kategori</label>
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
                <input id="productMinQuantity" type="number" formControlName="minQuantity" class="form-input" [class.has-value]="hasValue('minQuantity')" min="0" [disabled]="isSaveLoading()" />
                <label for="productMinQuantity" class="form-label">Kritik Seviye</label>
                @if (isFieldInvalid('minQuantity')) { <div class="form-error">⚠ Geçerli bir değer girin.</div> }
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn-secondary" (click)="closeProductForm()" [disabled]="isSaveLoading()">Vazgeç</button>
              <button type="submit" class="btn-primary" [disabled]="productForm.invalid || productForm.pristine || isSaveLoading()">
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
  `
})
export class ProductsComponent {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  fb = inject(FormBuilder);

  // Modals & Forms
  showProductFormModal = signal(false);
  editingProductId = signal<string | null>(null);
  isSaveLoading = signal(false);

  productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    sku: ['', [Validators.required, Validators.minLength(2)]],
    category: ['Accessories', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    minQuantity: [5, [Validators.required, Validators.min(0)]]
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

    if (search) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    return list;
  });

  ngOnInit() {
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
  }

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.productSearch.set(input.value);
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
    this.productForm.reset({
      name: '', sku: '', category: 'Accessories', price: 0, quantity: 0, minQuantity: 5
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
      minQuantity: p.minQuantity
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
          this.state.products.update(p => [prod, ...p]);
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
}
