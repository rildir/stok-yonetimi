import { Component, inject, ViewChild, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastComponent } from '../shared/toast/toast.component';
import { InventoryService } from '../../inventory.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent],
  template: `
    <header class="page-header">
      <div>
        <h1>Profil ve Ayarlar</h1>
        <p>Hesap bilgilerinizi ve uygulama tercihlerinizi yönetin.</p>
      </div>
    </header>

    <div class="settings-layout" style="display: flex; gap: 1.5rem; align-items: start; width: 100%;">
      <!-- Left sidebar navigation -->
      <div class="settings-sidebar" style="width: 240px; flex-shrink: 0; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <button class="settings-side-btn" [class.active]="activeTab() === 'profile'" (click)="activeTab.set('profile')">
          Profil & Güvenlik
        </button>
        <button class="settings-side-btn" [class.active]="activeTab() === 'categories'" (click)="activeTab.set('categories')">
          Kategori Yönetimi
        </button>
      </div>

      <!-- Right content area -->
      <div class="settings-content" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1.5rem;">

        <!-- PROFILE & SECURITY TAB -->
        <ng-container *ngIf="activeTab() === 'profile'">
          <div class="settings-container">
        <div class="settings-left-col">
          <div class="settings-card">
            <h3 class="card-title">Kişisel Bilgiler</h3>
            <p class="card-subtitle" style="margin-bottom: 1.5rem;">Sistemde görünen adınızı ve iletişim bilgilerinizi güncelleyin.</p>
            
            <div class="settings-avatar-section">
              <div class="settings-avatar">AU</div>
              <div class="settings-avatar-actions">
                <button class="btn btn-outline">Fotoğraf Yükle</button>
                <a class="link-remove">Kaldır</a>
              </div>
            </div>

            <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
              <div class="settings-form-grid">
                <div class="form-group" [class.has-error]="isProfileFieldInvalid('fullName')">
                  <label for="">Ad Soyad</label>
                  <input type="text" formControlName="fullName" placeholder="Örn: Ahmet Yılmaz" />
                  @if (isProfileFieldInvalid('fullName')) { <span class="error-msg">Ad soyad en az 3 karakter olmalıdır.</span> }
                </div>
                <div class="form-group" [class.has-error]="isProfileFieldInvalid('email')">
                  <label for="">E-posta Adresi</label>
                  <input type="email" formControlName="email" placeholder="ornek@sirket.com" />
                  @if (isProfileFieldInvalid('email')) { <span class="error-msg">Geçerli bir e-posta adresi girin.</span> }
                </div>
              </div>
              <div class="form-group">
                <label for="">Şirket / Departman</label>
                <input type="text" formControlName="department" placeholder="Örn: Depo Yönetimi" />
              </div>
              
              <div class="settings-divider">
                <button type="submit" class="btn btn-primary" [style.opacity]="profileForm.pristine ? 0.5 : 1" [style.cursor]="profileForm.pristine ? 'not-allowed' : 'pointer'" [disabled]="profileForm.invalid || profileForm.pristine || isSavingProfile">
                  @if (isSavingProfile) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { Değişiklikleri Kaydet }
                </button>
              </div>
            </form>
          </div>

          <div class="settings-card">
            <h3 class="card-title">Güvenlik ve Şifre</h3>
            <p class="card-subtitle" style="margin-bottom: 1.5rem;">Hesap güvenliğiniz için şifrenizi periyodik olarak güncelleyin.</p>
            
            <form [formGroup]="passwordForm" (ngSubmit)="updatePassword()">
              <div class="form-group" [class.has-error]="isPasswordFieldInvalid('currentPassword')">
                <label for="">Mevcut Şifre</label>
                <div class="password-input-wrapper">
                  <input [type]="showCurrent() ? 'text' : 'password'" formControlName="currentPassword" placeholder="••••••••" />
                  <button type="button" class="password-toggle-btn" (click)="showCurrent.set(!showCurrent())">
                    @if (showCurrent()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                    @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                  </button>
                </div>
                @if (isPasswordFieldInvalid('currentPassword')) { <span class="error-msg">Mevcut şifre zorunludur.</span> }
              </div>
              
              <div class="settings-form-grid">
                <div class="form-group" [class.has-error]="isPasswordFieldInvalid('newPassword')">
                  <label for="">Yeni Şifre</label>
                  <div class="password-input-wrapper">
                    <input [type]="showNew() ? 'text' : 'password'" formControlName="newPassword" placeholder="En az 6 karakter" (input)="evaluatePasswordStrength()"/>
                    <button type="button" class="password-toggle-btn" (click)="showNew.set(!showNew())">
                      @if (showNew()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                      @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                    </button>
                  </div>
                  <div class="password-strength-container" *ngIf="passwordForm.get('newPassword')?.value">
                    <div class="password-strength-bars">
                      <div [style.background]="pwdStrength() >= 1 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                      <div [style.background]="pwdStrength() >= 2 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                      <div [style.background]="pwdStrength() >= 3 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                      <div [style.background]="pwdStrength() >= 4 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                    </div>
                    <div class="strength-label" [style.color]="pwdStrength() > 0 ? strengthColors[pwdStrength()-1] : 'inherit'">{{ strengthLabels[pwdStrength()] || '' }}</div>
                  </div>
                  @if (isPasswordFieldInvalid('newPassword')) { <span class="error-msg">Yeni şifre en az 6 karakter olmalıdır.</span> }
                </div>
                
                <div class="form-group" [class.has-error]="passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)">
                  <label for="">Yeni Şifre (Tekrar)</label>
                  <div class="password-input-wrapper">
                    <input [type]="showConfirm() ? 'text' : 'password'" formControlName="confirmPassword" placeholder="Şifrenizi tekrar girin" />
                    <button type="button" class="password-toggle-btn" (click)="showConfirm.set(!showConfirm())">
                      @if (showConfirm()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                      @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                    </button>
                  </div>
                  @if (passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)) { 
                    <span class="error-msg">Şifreler eşleşmiyor.</span> 
                  } @else if (!passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.value) {
                    <span class="error-msg" style="color: var(--status-instock);">
                      <svg style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:2px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                      Şifreler eşleşiyor
                    </span>
                  }
                </div>
              </div>
              
              <div class="settings-divider">
                <button type="submit" class="btn btn-primary" [disabled]="passwordForm.invalid || !passwordForm.get('currentPassword')?.value || isSavingPassword">
                  @if (isSavingPassword) { <span class="spinner-sm spinner-light"></span> Güncelleniyor... } @else { Şifreyi Güncelle }
                </button>
              </div>
            </form>
          </div>
        </div>

        <div class="settings-right-col">
          <div class="settings-card">
            <div class="side-card-title">Hesap Özeti</div>
            <div class="summary-row">
              <span class="summary-label">Hesap Türü</span>
              <span class="summary-value">Yönetici</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Üyelik Tarihi</span>
              <span class="summary-value">01.01.2025</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Son Giriş</span>
              <span class="summary-value">10.06.2026 08:55</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Durum</span>
              <span class="badge badge-instock">Aktif</span>
            </div>
          </div>

          <div class="settings-card">
            <div class="side-card-title">Güvenlik Durumu</div>
            <div class="security-row">
              <div class="security-icon-text"><span class="security-icon">🔒</span> Şifre Güncelleme</div>
              <span style="color: #999; font-size: 12px;">30 gün önce</span>
            </div>
            <div class="security-row">
              <div class="security-icon-text"><span class="security-icon">🖥️</span> Aktif Oturum</div>
              <span class="badge badge-lowstock">1 Oturum</span>
            </div>
            <div class="security-row">
              <div class="security-icon-text"><span class="security-icon">✉️</span> E-posta Doğrulama</div>
              <span class="badge badge-instock">Doğrulandı</span>
            </div>
            <button class="btn-terminate">Tüm Oturumları Sonlandır</button>
          </div>

          <div class="settings-card tips-card">
            <div class="side-card-title">İpuçları</div>
            <ul class="tips-list">
              <li>✓ Güçlü bir şifre kullanın</li>
              <li>✓ Şifrenizi 90 günde bir güncelleyin</li>
              <li>✓ Hesap bilgilerinizi güncel tutun</li>
            </ul>
          </div>
          </div>
        </div>
      </ng-container>

        <!-- CATEGORY MANAGEMENT TAB -->
      <ng-container *ngIf="activeTab() === 'categories'">
        <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div>
              <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">Kategori Listesi</h2>
              <p class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">Ürünlerinizi sınıflandırmak için kullanılan kategorileri yönetin.</p>
            </div>
            <button class="btn btn-primary" (click)="openCategoryDrawer()">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Yeni Kategori Ekle
            </button>
          </div>

          <div class="table-card" style="margin-top: 0;">
            @if (isLoadingCategories()) {
              <div class="loading-state">Yükleniyor...</div>
            } @else if (categories().length === 0) {
              <div class="empty-state">
                <p>Henüz kategori tanımlanmamış.</p>
                <button class="btn btn-outline" (click)="openCategoryDrawer()" style="margin-top: 16px;">İlk Kategoriyi Ekle</button>
              </div>
            } @else {
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Kategori Adı</th>
                      <th>Slug (Benzersiz Arama Anahtarı)</th>
                      <th class="th-actions">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (cat of categories(); track cat.id) {
                      <tr>
                        <td style="font-size: 0.95rem;"><strong>{{ cat.name }}</strong></td>
                        <td class="mono" style="color: var(--text-muted); font-size: 0.85rem;">{{ cat.slug }}</td>
                        <td class="td-actions">
                          <button class="edit-btn" title="Düzenle" (click)="openCategoryDrawer(cat)">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button class="delete-btn" title="Sil" (click)="promptDeleteCategory(cat)">
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
        </div>
      </ng-container>
    </div>
  </div>

    <!-- Category Drawer -->
    @if (isCategoryDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeCategoryDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ editCategoryId() ? 'Kategoriyi Düzenle' : 'Yeni Kategori Ekle' }}</span>
            <button class="drawer-close" (click)="closeCategoryDrawer()">×</button>
          </div>

          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="catName" type="text" formControlName="name" class="form-input" [class.has-value]="hasCategoryValue('name')" [disabled]="isSavingCategory()" />
                <label for="catName" class="form-label">Kategori Adı</label>
                @if (isCategoryFieldInvalid('name')) { <div class="form-error">⚠ Kategori adı en az 2 karakter olmalıdır.</div> }
              </div>

              <div class="form-field">
                <input id="catSlug" type="text" formControlName="slug" class="form-input" [class.has-value]="hasCategoryValue('slug')" [disabled]="isSavingCategory()" placeholder="Boş bırakılırsa otomatik oluşturulur" />
                <label for="catSlug" class="form-label">Slug (Benzersiz Arama Anahtarı)</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeCategoryDrawer()" [disabled]="isSavingCategory()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="categoryForm.invalid || isSavingCategory()">
                @if (isSavingCategory()) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { Kaydet }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Category Delete Confirmation Modal -->
    @if (showCategoryDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">Kategoriyi Sil</h3>
            <p class="delete-modal-desc">
              <strong>{{ categoryToDelete()?.name }}</strong> adlı kategoriyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()">Vazgeç</button>
            <button class="btn btn-danger" (click)="confirmDeleteCategory()" [disabled]="isSavingCategory()">
              @if (isSavingCategory()) { <span class="spinner-sm spinner-light"></span> Siliniyor... } @else { Sil }
            </button>
          </div>
        </div>
      </div>
    }
    <app-toast></app-toast>
  `,
  styles: [`
    .settings-side-btn {
      border: none;
      background: transparent;
      padding: 14px 18px;
      text-align: left;
      font-family: var(--font-heading);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      border-left: 4px solid transparent;
      outline: none;
    }
    .settings-side-btn:hover {
      background: #f9fafb;
      color: var(--text-primary);
    }
    .settings-side-btn.active {
      background: #f9fafb;
      color: var(--text-primary);
      border-left-color: var(--primary);
      font-weight: 700;
    }
    .settings-side-btn + .settings-side-btn {
      border-top: 1px solid #f0f0f0;
    }
  `]
})
export class SettingsComponent implements OnInit {
  fb = inject(FormBuilder);
  http = inject(HttpClient);
  inventoryService = inject(InventoryService);
  
  @ViewChild(ToastComponent) toast!: ToastComponent;

  activeTab = signal<'profile' | 'categories'>('profile');

  // Profile fields
  isSavingProfile = false;
  profileForm: FormGroup = this.fb.group({
    fullName: ['Admin User', [Validators.required, Validators.minLength(3)]],
    email: ['admin@sirket.com', [Validators.required, Validators.email]],
    department: ['Depo Yönetimi']
  });

  // Password fields
  isSavingPassword = false;
  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  pwdStrength = signal(0);
  strengthColors = ['#ef4444', '#f97316', '#eab308', '#10b981']; // Red, Orange, Yellow, Green
  strengthLabels = ['', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  }, { validators: this.passwordMatchValidator });

  // Categories fields
  categories = signal<any[]>([]);
  isLoadingCategories = signal(false);
  isCategoryDrawerOpen = signal(false);
  isSavingCategory = signal(false);
  editCategoryId = signal<string | null>(null);
  showCategoryDeleteModal = signal(false);
  categoryToDelete = signal<any>(null);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['']
  });

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.isLoadingCategories.set(true);
    this.inventoryService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
        this.isLoadingCategories.set(false);
      },
      error: () => {
        this.isLoadingCategories.set(false);
        this.toast.show('Kategoriler yüklenemedi.', 'error');
      }
    });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  isProfileFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  isPasswordFieldInvalid(fieldName: string): boolean {
    const field = this.passwordForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  isCategoryFieldInvalid(fieldName: string): boolean {
    const field = this.categoryForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasCategoryValue(fieldName: string): boolean {
    const val = this.categoryForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  evaluatePasswordStrength() {
    const val = this.passwordForm.get('newPassword')?.value || '';
    let score = 0;
    if (!val) { this.pwdStrength.set(0); return; }
    
    if (val.length >= 8) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;
    
    // Ensure min length 6 gives at least 1 if not empty
    if (val.length >= 6 && score === 0) score = 1;
    else if (val.length < 6) score = 0;

    this.pwdStrength.set(score);
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    
    this.isSavingProfile = true;
    this.http.put(`${environment.apiUrl}/user/profile`, this.profileForm.value).subscribe({
      next: () => {
        this.isSavingProfile = false;
        this.toast.show('✓ Değişiklikler kaydedildi.', 'success');
        this.profileForm.markAsPristine();
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.toast.show('Hata: ' + (err.error?.message || 'Kaydedilemedi.'), 'error');
      }
    });
  }

  updatePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    
    this.isSavingPassword = true;
    this.http.put(`${environment.apiUrl}/user/password`, {
      currentPassword: this.passwordForm.get('currentPassword')?.value,
      newPassword: this.passwordForm.get('newPassword')?.value
    }).subscribe({
      next: () => {
        this.isSavingPassword = false;
        this.toast.show('✓ Şifreniz başarıyla güncellendi.', 'success');
        this.passwordForm.reset();
        this.pwdStrength.set(0);
      },
      error: (err) => {
        this.isSavingPassword = false;
        this.toast.show('Hata: ' + (err.error?.message || 'Şifre güncellenemedi.'), 'error');
      }
    });
  }

  // Categories Operations
  openCategoryDrawer(category?: any) {
    if (category) {
      this.editCategoryId.set(category.id);
      this.categoryForm.patchValue({
        name: category.name,
        slug: category.slug
      });
    } else {
      this.editCategoryId.set(null);
      this.categoryForm.reset({
        name: '',
        slug: ''
      });
    }
    this.isCategoryDrawerOpen.set(true);
  }

  closeCategoryDrawer() {
    this.isCategoryDrawerOpen.set(false);
    this.categoryForm.reset();
    this.editCategoryId.set(null);
  }

  saveCategory() {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSavingCategory.set(true);
    const data = this.categoryForm.value;
    const catId = this.editCategoryId();

    const obs = catId
      ? this.inventoryService.updateCategory(catId, data)
      : this.inventoryService.createCategory(data);

    obs.subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.closeCategoryDrawer();
        this.loadCategories();
        this.toast.show(catId ? '✓ Kategori başarıyla güncellendi.' : '✓ Yeni kategori başarıyla eklendi.', 'success');
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        const errMsg = err?.error?.message || 'Kategori kaydedilemedi.';
        this.toast.show('Hata: ' + errMsg, 'error');
      }
    });
  }

  promptDeleteCategory(category: any) {
    this.categoryToDelete.set(category);
    this.showCategoryDeleteModal.set(true);
  }

  cancelDeleteCategory() {
    this.showCategoryDeleteModal.set(false);
    this.categoryToDelete.set(null);
  }

  confirmDeleteCategory() {
    const cat = this.categoryToDelete();
    if (!cat) return;

    this.isSavingCategory.set(true);
    this.inventoryService.deleteCategory(cat.id).subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.cancelDeleteCategory();
        this.loadCategories();
        this.toast.show('✓ Kategori başarıyla silindi.', 'success');
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        this.cancelDeleteCategory();
        const errMsg = err?.error?.message || 'Kategori silinemedi.';
        this.toast.show('Hata: ' + errMsg, 'error');
      }
    });
  }
}
