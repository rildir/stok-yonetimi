import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs/operators';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>Tedarikçiler</h1>
        <p>Tedarikçi firmaları ve iletişim bilgilerini yönetin.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Yeni Tedarikçi
        </button>
      </div>
    </header>

    <!-- Search Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Tedarikçi adı veya iletişim kişisi ara..." [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
      @if (isLoading()) {
        <div class="loading-state">Yükleniyor...</div>
      } @else if (suppliers().length === 0) {
        <div class="empty-state">
          <p>Henüz hiç tedarikçi eklenmemiş.</p>
          <button class="btn btn-outline" (click)="openDrawer()" style="margin-top: 16px;">İlk Tedarikçiyi Ekle</button>
        </div>
      } @else if (filteredSuppliers().length === 0) {
        <div class="empty-state">
          <p>Arama kriterlerinize uygun tedarikçi bulunamadı.</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Firma adı</th>
                <th>İletişim kişisi</th>
                <th>Değerlendirme</th>
                <th>Teslimat süresi</th>
                <th>E-posta</th>
                <th>Telefon</th>
                <th class="th-actions">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              @for (s of filteredSuppliers(); track s.id) {
                <tr>
                  <td><strong>{{ s.name }}</strong></td>
                  <td>{{ s.contactPerson || '-' }}</td>
                  <td>
                    <div class="rating-stars" style="color: #fbbf24; font-size: 15px; letter-spacing: 1px;">
                      {{ '★'.repeat(s.rating || 5) }}{{ '☆'.repeat(5 - (s.rating || 5)) }}
                    </div>
                  </td>
                  <td>
                    <span style="font-weight: 500;">{{ s.leadTimeDays ?? 3 }} gün</span>
                  <td>
                    @if (s.email) {
                      <a href="mailto:{{ s.email }}" style="color: #007185; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">{{ s.email }}</a>
                    } @else {
                      -
                    }
                  </td>
                  <td>
                    @if (s.phone) {
                      <a href="tel:{{ s.phone }}" style="color: #007185; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">{{ normalizePhone(s.phone) }}</a>
                    } @else {
                      -
                    }
                  </td>
                  <td class="td-actions">
                    <button class="edit-btn" title="Düzenle" (click)="openDrawer(s)">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="delete-btn" title="Sil" (click)="deleteSupplier(s.id)">
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
            <span class="drawer-title">{{ editId() ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi Ekle' }}</span>
            <button class="drawer-close" (click)="closeDrawer()">×</button>
          </div>

          <form [formGroup]="supplierForm" (ngSubmit)="saveSupplier()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="supplierName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaving()" />
                <label for="supplierName" class="form-label">Firma Adı</label>
                @if (isFieldInvalid('name')) { <div class="form-error">⚠ Firma adı zorunludur.</div> }
              </div>

              <div class="form-field">
                <input id="supplierContact" type="text" formControlName="contactPerson" class="form-input" [class.has-value]="hasValue('contactPerson')" [disabled]="isSaving()" />
                <label for="supplierContact" class="form-label">İletişim Kişisi</label>
              </div>

              <div class="form-field">
                <input id="supplierEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasValue('email')" [disabled]="isSaving()" />
                <label for="supplierEmail" class="form-label">E-posta Adresi</label>
                @if (isFieldInvalid('email')) { <div class="form-error">⚠ Geçerli bir e-posta adresi girin.</div> }
              </div>

              <div class="form-field">
                <input id="supplierPhone" type="tel" formControlName="phone" class="form-input" [class.has-value]="hasValue('phone')" [disabled]="isSaving()" />
                <label for="supplierPhone" class="form-label">Telefon Numarası</label>
              </div>
              <div class="form-field" style="display: flex; flex-direction: column;">
                <label class="form-label" style="position: static; transform: none; font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 6px;">Tedarikçi puanı</label>
                <div class="star-rating-container" style="display: flex; gap: 4px; align-items: center; padding: 4px 0;">
                  @for (star of [1, 2, 3, 4, 5]; track star) {
                    <button type="button" 
                            (click)="setRating(star)" 
                            [disabled]="isSaving()" 
                            style="background: transparent; border: none; padding: 1px; cursor: pointer; outline: none; font-size: 18px; transition: transform 0.1s ease; line-height: 1;"
                            [style.color]="supplierForm.get('rating')?.value >= star ? '#fbbf24' : '#d5d9d9'"
                            onmouseover="this.style.transform='scale(1.2)'"
                            onmouseout="this.style.transform='scale(1)'"
                            title="{{ star }} Yıldız"
                    >
                      ★
                    </button>
                  }
                  <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-left: 4px; white-space: nowrap;">
                    @if (supplierForm.get('rating')?.value) {
                      ({{ supplierForm.get('rating')?.value }} Yıldız)
                    } @else {
                      (Puan Seçilmedi)
                    }
                  </span>
                </div>
              </div>

              <div class="form-field">
                <input id="supplierLeadTime" type="number" formControlName="leadTimeDays" class="form-input" [class.has-value]="hasValue('leadTimeDays')" [disabled]="isSaving()" min="0" />
                <label for="supplierLeadTime" class="form-label">Teslim Süresi (Gün)</label>
                @if (isFieldInvalid('leadTimeDays')) { <div class="form-error">⚠ Geçerli bir teslim süresi girin.</div> }
              </div>

              <div class="form-field">
                <textarea id="supplierAddress" formControlName="address" class="form-input" [class.has-value]="hasValue('address')" [disabled]="isSaving()"></textarea>
                <label for="supplierAddress" class="form-label">Adres</label>
              </div>

              <div class="form-field">
                <textarea id="supplierNotes" formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')" [disabled]="isSaving()"></textarea>
                <label for="supplierNotes" class="form-label">Notlar (Müşteri Bilgisi vb.)</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="supplierForm.invalid || supplierForm.pristine || isSaving()">
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
export class SuppliersComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);

  suppliers = signal<any[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  editId = signal<string | null>(null);
 
  searchQuery = signal('');

  filteredSuppliers = computed(() => {
    const list = this.suppliers();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(s => 
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(query)) ||
      (s.email && s.email.toLowerCase().includes(query))
    );
  });

  supplierForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    contactPerson: [''],
    email: ['', [Validators.email]],
    phone: [''],
    address: [''],
    notes: [''],
    rating: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
    leadTimeDays: [3, [Validators.required, Validators.min(0)]]
  });

  hasValue(fieldName: string): boolean {
    const val = this.supplierForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.supplierForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  ngOnInit() {
    this.loadSuppliers();
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

  loadSuppliers() {
    this.isLoading.set(true);
    this.inventory.getSuppliers().subscribe({
      next: (data) => {
        this.suppliers.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  openDrawer(supplier?: any) {
    if (supplier) {
      this.editId.set(supplier.id);
      this.supplierForm.patchValue(supplier);
    } else {
      this.editId.set(null);
      this.supplierForm.reset({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        rating: null,
        leadTimeDays: 3
      });
    }
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.supplierForm.reset();
    this.editId.set(null);
  }

  normalizePhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      const area = last10.slice(0, 3);
      const p1 = last10.slice(3, 6);
      const p2 = last10.slice(6, 8);
      const p3 = last10.slice(8, 10);
      return `+90 ${area} ${p1} ${p2} ${p3}`;
    }
    return phone;
  }

  setRating(rating: number) {
    if (this.isSaving()) return;
    this.supplierForm.patchValue({ rating });
    this.supplierForm.get('rating')?.markAsDirty();
  }

  saveSupplier() {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const data = this.supplierForm.value;
    
    // Normalize phone number on save
    if (data.phone) {
      data.phone = this.normalizePhone(data.phone);
    }

    const id = this.editId();
    const req = id ? this.inventory.updateSupplier(id, data) : this.inventory.createSupplier(data);

    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadSuppliers();
      },
      error: () => {
        this.isSaving.set(false);
      }
    });
  }

  deleteSupplier(id: string) {
    const supplier = this.suppliers().find(s => s.id === id);
    if (!supplier) return;

    this.ui.openConfirm({
      title: 'Tedarikçiyi sil',
      message: `${supplier.name} kalıcı olarak silinecek, bu işlem geri alınamaz.`,
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deleteSupplier(supplier.id).pipe(
          tap({
            next: () => {
              this.loadSuppliers();
              this.ui.showToast('Tedarikçi başarıyla silindi.', 'success');
            },
            error: () => {
              this.ui.showToast('İşlem gerçekleştirilemedi.', 'error');
            }
          })
        );
      }
    });
  }
}
