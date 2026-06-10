import { Component, inject, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { ToastComponent } from '../shared/toast/toast.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ToastComponent],
  template: `
    <header class="page-header">
      <div>
        <h1>Profil ve Ayarlar</h1>
        <p>Hesap bilgilerinizi ve uygulama tercihlerinizi yönetin.</p>
      </div>
    </header>

    <div class="settings-container">
      <app-toast></app-toast>

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
                <label>Ad Soyad</label>
                <input type="text" formControlName="fullName" placeholder="Örn: Ahmet Yılmaz" />
                @if (isProfileFieldInvalid('fullName')) { <span class="error-msg">Ad soyad en az 3 karakter olmalıdır.</span> }
              </div>
              <div class="form-group" [class.has-error]="isProfileFieldInvalid('email')">
                <label>E-posta Adresi</label>
                <input type="email" formControlName="email" placeholder="ornek@sirket.com" />
                @if (isProfileFieldInvalid('email')) { <span class="error-msg">Geçerli bir e-posta adresi girin.</span> }
              </div>
            </div>
            <div class="form-group">
              <label>Şirket / Departman</label>
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
              <label>Mevcut Şifre</label>
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
                <label>Yeni Şifre</label>
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
                <label>Yeni Şifre (Tekrar)</label>
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
  `
})
export class SettingsComponent {
  fb = inject(FormBuilder);
  
  @ViewChild(ToastComponent) toast!: ToastComponent;

  isSavingProfile = false;
  isSavingPassword = false;

  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  pwdStrength = signal(0);

  strengthColors = ['#ef4444', '#f97316', '#eab308', '#10b981']; // Red, Orange, Yellow, Green
  strengthLabels = ['', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];

  profileForm: FormGroup = this.fb.group({
    fullName: ['Admin User', [Validators.required, Validators.minLength(3)]],
    email: ['admin@sirket.com', [Validators.required, Validators.email]],
    department: ['Depo Yönetimi']
  });

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  }, { validators: this.passwordMatchValidator });

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
    setTimeout(() => {
      this.isSavingProfile = false;
      this.toast.show('✓ Değişiklikler kaydedildi.', 'success');
      this.profileForm.markAsPristine();
    }, 800);
  }

  updatePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    
    this.isSavingPassword = true;
    setTimeout(() => {
      this.isSavingPassword = false;
      this.toast.show('✓ Şifreniz başarıyla güncellendi.', 'success');
      this.passwordForm.reset();
      this.pwdStrength.set(0);
    }, 1000);
  }
}
