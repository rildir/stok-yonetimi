import { Component, inject, ViewChild, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastComponent } from '../shared/toast/toast.component';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent],
  template: `
    <!-- Amazon Header Style -->
    <header class="page-header" style="border-bottom: none; margin-bottom: 1.5rem; display: block;">
      @if (activeTab() === 'dashboard') {
        <div>
          <h1>Hesabınız</h1>
          <p>Hesap bilgilerinizi, güvenlik ayarlarınızı ve kategorileri buradan yönetin.</p>
        </div>
      } @else {
        <div style="font-size: 13px; color: #565959; margin-bottom: 8px;">
          <a href="#" (click)="changeTab('dashboard'); $event.preventDefault()" style="color: #007185; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Hesabınız</a>
          <span style="margin: 0 6px; color: #888;">&gt;</span>
          <span style="color: #C45500; font-weight: 500;">{{ getTabTitle() }}</span>
        </div>
        <h1>{{ getTabTitle() }}</h1>
      }
    </header>

    <div class="settings-layout" style="width: 100%;">
      <!-- AMAZON YOUR ACCOUNT DASHBOARD -->
      @if (activeTab() === 'dashboard') {
        <div class="ecelon-settings-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem; width: 100%;">
          <!-- Card 1: Profil & Güvenlik -->
          <div class="ecelon-settings-card" (click)="changeTab('profile')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
            <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">🔒</div>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">Giriş ve Güvenlik</h3>
              <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">Adınızı, e-posta adresinizi, şifrenizi veya oturum detaylarınızı güncelleyin.</p>
            </div>
          </div>

          <!-- Card 2: Kategori Yönetimi -->
          <div class="ecelon-settings-card" (click)="changeTab('categories')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
            <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">📦</div>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">Kategori Yönetimi</h3>
              <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">Ürünleri kategorilere ayırmak, slug oluşturmak ve listelemek için kategorileri yönetin.</p>
            </div>
          </div>

          <!-- Card 3: Kullanıcı Yönetimi (Admin only) -->
          @if (ui.userProfile()?.role === 'admin') {
            <div class="ecelon-settings-card" (click)="changeTab('users')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
              <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">👥</div>
              <div>
                <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">Kullanıcı Yönetimi</h3>
                <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">Ekip üyelerini davet edin, roller atayın, yetkileri güncelleyin ve limit durumunu izleyin.</p>
              </div>
            </div>
          }
        </div>
      }

      <div class="settings-content" style="width: 100%; display: flex; flex-direction: column; gap: 1.5rem;">

        <!-- PROFILE & SECURITY TAB -->
        <ng-container *ngIf="activeTab() === 'profile'">
          <div class="settings-container" style="display: flex; gap: 1.5rem; align-items: start; width: 100%; flex-wrap: wrap;">
            <div class="settings-left-col" style="flex: 2; min-width: 300px; display: flex; flex-direction: column; gap: 1.5rem;">
              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 24px;">
                <h3 class="card-title">Kişisel Bilgiler</h3>
                <p class="card-subtitle" style="margin-bottom: 1.5rem;">Sistemde görünen adınızı ve iletişim bilgilerinizi güncelleyin.</p>
                
                <div class="settings-avatar-section">
                  <div class="settings-avatar">
                    @if (ui.userProfile()?.avatar) {
                      <img [src]="ui.userProfile().avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    } @else {
                      {{ getAvatarInitials() }}
                    }
                  </div>
                  <div class="settings-avatar-actions">
                    <button type="button" class="btn btn-outline" (click)="fileInput.click()">Fotoğraf Yükle</button>
                    <input #fileInput type="file" style="display:none" (change)="onFileSelected($event)" accept="image/*" />
                    <a class="link-remove" (click)="removeAvatar()">Kaldır</a>
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

              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 24px;">
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

            <div class="settings-right-col" style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1.5rem;">
              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 20px;">
                <div class="side-card-title">Hesap Özeti</div>
                <div class="summary-row">
                  <span class="summary-label">Hesap Türü</span>
                  <span class="summary-value">{{ ui.userProfile()?.role === 'admin' ? 'Yönetici' : ui.userProfile()?.role === 'manager' ? 'Stok Sorumlusu' : 'Gözlemci' }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Üyelik Tarihi</span>
                  <span class="summary-value">{{ (ui.userProfile()?.createdAt | date:'dd.MM.yyyy') || '01.01.2025' }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Son Giriş</span>
                  <span class="summary-value">20.06.2026 11:00</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Durum</span>
                  <span class="badge badge-instock">Aktif</span>
                </div>
              </div>

              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 20px;">
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
                <button type="button" class="btn-terminate" (click)="terminateAllSessions()">Tüm Oturumları Sonlandır</button>
              </div>

              <div class="settings-card tips-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 20px;">
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

            <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
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

        <!-- USER MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'users'">
          <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div>
                <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">Kullanıcı Yönetimi</h2>
                <p class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">Sistemdeki kullanıcıları, rollerini ve erişim yetkilerini yönetin.</p>
              </div>
              
              <div style="display: flex; gap: 1rem; align-items: center;">
                <!-- User Limit Status & Progress Bar -->
                <div class="limit-status-card" style="background: #fff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 6px 14px; font-size: 0.85rem; display: flex; flex-direction: column; gap: 4px; min-width: 160px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <div style="display: flex; justify-content: space-between; font-weight: 600; color: var(--text-primary);">
                    <span>Kullanıcı Limiti:</span>
                    <span>{{ getUserLimitText() }}</span>
                  </div>
                  <div style="width: 100%; height: 6px; background: #e5e5e5; border-radius: 3px; overflow: hidden;">
                    <div [style.width.%]="getUserLimitPercentage()" style="height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
                  </div>
                </div>

                <button class="btn btn-primary" (click)="openUserDrawer()">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  Yeni Kullanıcı Ekle
                </button>
              </div>
            </div>

            <!-- Limit Warning Alert when standard/pro plan & exceeded -->
            @if (isLimitReached()) {
              <div style="background: #fff8f8; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 1.25rem;">⚠</span>
                  <div>
                    <h4 style="font-weight: 600; color: #991b1b; font-size: 0.9rem; margin: 0;">Kullanıcı Limitine Ulaşıldı!</h4>
                    <p style="color: #b91c1c; font-size: 0.8rem; margin: 2px 0 0 0;">Mevcut planınızda yeni kullanıcı oluşturamazsınız. Kullanıcı limiti doldu.</p>
                  </div>
                </div>
                <button class="btn btn-outline" style="border-color: #fca5a5; color: #b91c1c; background: #fff; font-size: 0.8rem; padding: 6px 12px;" (click)="router.navigate(['/billing'])">
                  Planı Yükselt
                </button>
              </div>
            }

            <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
              @if (isLoadingUsers()) {
                <div class="loading-state">Yükleniyor...</div>
              } @else if (users().length === 0) {
                <div class="empty-state">
                  <p>Henüz kullanıcı tanımlanmamış.</p>
                  <button class="btn btn-outline" (click)="openUserDrawer()" style="margin-top: 16px;">İlk Kullanıcıyı Ekle</button>
                </div>
              } @else {
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ad Soyad</th>
                        <th>Kullanıcı Adı</th>
                        <th>Rol</th>
                        <th>Departman</th>
                        <th>E-posta</th>
                        <th class="th-actions">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (user of users(); track user.id) {
                        <tr>
                          <td style="font-size: 0.95rem;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <div class="user-avatar-sm" style="width: 32px; height: 32px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600; color: #4b5563; overflow: hidden; border: 1px solid #d1d5db;">
                                @if (user.avatar) {
                                  <img [src]="user.avatar" style="width: 100%; height: 100%; object-fit: cover;" />
                                } @else {
                                  {{ getInitials(user.fullName) }}
                                }
                              </div>
                              <strong>{{ user.fullName }}</strong>
                            </div>
                          </td>
                          <td class="mono" style="color: var(--text-muted); font-size: 0.85rem;">{{ user.username }}</td>
                          <td>
                            <span class="badge" [class.badge-instock]="user.role === 'admin'" [class.badge-lowstock]="user.role === 'manager'" [class.badge-outstock]="user.role === 'viewer'">
                              {{ user.role === 'admin' ? 'Yönetici' : user.role === 'manager' ? 'Stok Sorumlusu' : 'Gözlemci' }}
                            </span>
                          </td>
                          <td style="font-size: 0.9rem;">{{ user.department || '-' }}</td>
                          <td style="font-size: 0.9rem;">{{ user.email }}</td>
                          <td class="td-actions">
                            <button class="edit-btn" title="Düzenle" (click)="openUserDrawer(user)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button class="delete-btn" title="Sil" [disabled]="user.role === 'admin'" (click)="promptDeleteUser(user)">
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

    <!-- User Drawer -->
    @if (isUserDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeUserDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ editUserId() ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Ekle' }}</span>
            <button class="drawer-close" (click)="closeUserDrawer()">×</button>
          </div>

          <form [formGroup]="userForm" (ngSubmit)="saveUser()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="userFullName" type="text" formControlName="fullName" class="form-input" [class.has-value]="hasUserValue('fullName')" [disabled]="isSavingUser()" />
                <label for="userFullName" class="form-label">Ad Soyad</label>
                @if (isUserFieldInvalid('fullName')) { <div class="form-error">⚠ Ad soyad zorunludur ve en az 3 karakter olmalıdır.</div> }
              </div>

              <div class="form-field">
                <input id="userEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasUserValue('email')" [disabled]="isSavingUser()" />
                <label for="userEmail" class="form-label">E-posta Adresi</label>
                @if (isUserFieldInvalid('email')) { <div class="form-error">⚠ Geçerli bir e-posta adresi giriniz.</div> }
              </div>

              <div class="form-field">
                <input id="userUsername" type="text" formControlName="username" class="form-input" [class.has-value]="hasUserValue('username')" [disabled]="isSavingUser() || !!editUserId()" />
                <label for="userUsername" class="form-label">Kullanıcı Adı</label>
                @if (isUserFieldInvalid('username')) { <div class="form-error">⚠ Kullanıcı adı zorunludur.</div> }
              </div>

              <div class="form-field">
                <input id="userPassword" type="password" formControlName="password" class="form-input" [class.has-value]="hasUserValue('password')" [disabled]="isSavingUser()" />
                <label for="userPassword" class="form-label">{{ editUserId() ? 'Şifre (Değiştirmek istemiyorsanız boş bırakın)' : 'Şifre (Varsayılan: 123456)' }}</label>
                @if (isUserFieldInvalid('password')) { <div class="form-error">⚠ Şifre en az 6 karakter olmalıdır.</div> }
              </div>

              <div class="form-field">
                <input id="userDepartment" type="text" formControlName="department" class="form-input" [class.has-value]="hasUserValue('department')" [disabled]="isSavingUser()" />
                <label for="userDepartment" class="form-label">Departman</label>
              </div>

              <div class="form-field select-field" style="margin-top: 24px;">
                <label for="userRole" style="display:block; font-size: 0.8rem; font-weight:600; color:var(--text-muted); margin-bottom: 6px;">Rol</label>
                <select id="userRole" formControlName="role" class="form-input has-value" style="width: 100%; padding: 10px; border: 1px solid #e5e5e5; border-radius: 6px;" [disabled]="isSavingUser()">
                  <option value="manager">Stok Sorumlusu (Manager)</option>
                  <option value="viewer">Gözlemci (Viewer)</option>
                </select>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeUserDrawer()" [disabled]="isSavingUser()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="userForm.invalid || isSavingUser()">
                @if (isSavingUser()) { <span class="spinner-sm spinner-light"></span> Kaydediliyor... } @else { Kaydet }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- User Delete Confirmation Modal -->
    @if (showUserDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteUser()" [disabled]="isSavingUser()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">Kullanıcıyı Sil</h3>
            <p class="delete-modal-desc">
              <strong>{{ userToDelete()?.fullName }}</strong> adlı kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteUser()" [disabled]="isSavingUser()">Vazgeç</button>
            <button class="btn btn-danger" (click)="confirmDeleteUser()" [disabled]="isSavingUser()">
              @if (isSavingUser()) { <span class="spinner-sm spinner-light"></span> Siliniyor... } @else { Sil }
            </button>
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styleUrls: ['../../drawer.css'],
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
  ui = inject(UiStateService);
  socketService = inject(SocketService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  
  @ViewChild(ToastComponent) toast!: ToastComponent;

  activeTab = signal<'profile' | 'categories' | 'users' | 'dashboard'>('dashboard');

  getTabTitle(): string {
    switch (this.activeTab()) {
      case 'profile': return 'Giriş ve Güvenlik';
      case 'categories': return 'Kategori Yönetimi';
      case 'users': return 'Kullanıcı Yönetimi';
      default: return 'Hesabınız';
    }
  }

  // Profile fields
  isSavingProfile = false;
  profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    department: ['']
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

  // User Management fields
  users = signal<any[]>([]);
  isLoadingUsers = signal(false);
  isUserDrawerOpen = signal(false);
  isSavingUser = signal(false);
  editUserId = signal<string | null>(null);
  showUserDeleteModal = signal(false);
  userToDelete = signal<any>(null);

  userForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    username: ['', Validators.required],
    password: [''],
    department: [''],
    role: ['viewer', Validators.required]
  });

  ngOnInit() {
    this.loadCategories();
    this.loadProfile();
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (tab === 'profile' || tab === 'categories' || tab === 'users') {
        this.activeTab.set(tab);
      } else {
        this.activeTab.set('dashboard');
      }
    });
  }

  changeTab(tab: 'profile' | 'categories' | 'users' | 'dashboard') {
    if (tab === 'dashboard') {
      this.router.navigate(['/settings']);
    } else {
      this.router.navigate(['/settings'], { queryParams: { tab } });
    }
  }

  loadProfile() {
    this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
      next: (profile: any) => {
        this.ui.userProfile.set(profile);
        this.profileForm.patchValue({
          fullName: profile.fullName,
          email: profile.email,
          department: profile.department
        });
        if (profile.role === 'admin') {
          this.loadUsers();
        }
      },
      error: () => {
        this.toast.show('Profil bilgileri yüklenemedi.', 'error');
      }
    });
  }

  getAvatarInitials(): string {
    const name = this.ui.userProfile()?.fullName || 'AU';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.toast.show('Hata: Fotoğraf boyutu 2MB\'tan küçük olmalıdır.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      this.http.put(`${environment.apiUrl}/user/profile`, { avatar: base64String }).subscribe({
        next: (res: any) => {
          this.ui.userProfile.set(res.data);
          this.toast.show('✓ Profil fotoğrafı başarıyla güncellendi.', 'success');
        },
        error: (err) => {
          this.toast.show('Hata: ' + (err.error?.message || 'Fotoğraf yüklenemedi.'), 'error');
        }
      });
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.http.put(`${environment.apiUrl}/user/profile`, { avatar: null }).subscribe({
      next: (res: any) => {
        this.ui.userProfile.set(res.data);
        this.toast.show('✓ Profil fotoğrafı kaldırıldı.', 'success');
      },
      error: (err) => {
        this.toast.show('Hata: ' + (err.error?.message || 'Fotoğraf kaldırılamadı.'), 'error');
      }
    });
  }

  terminateAllSessions() {
    this.ui.openConfirm({
      title: 'Tüm Oturumları Sonlandır',
      message: 'Hesabınızın tüm aktif oturumlarını (diğer tarayıcılar dahil) sonlandırmak istediğinizden emin misiniz? Bu işlemden sonra sistem sizi de otomatik olarak çıkışa yönlendirecektir.',
      confirmText: 'Oturumları Sonlandır',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        this.http.post(`${environment.apiUrl}/user/sessions/terminate`, {}).subscribe({
          next: () => {
            this.toast.show('✓ Tüm oturumlar sonlandırıldı. Yeniden giriş yapmalısınız.', 'info');
            setTimeout(() => {
              this.doLogout();
            }, 1500);
          },
          error: (err) => {
            this.toast.show('Hata: ' + (err.error?.message || 'Oturumlar sonlandırılamadı.'), 'error');
          }
        });
      }
    });
  }

  doLogout() {
    localStorage.removeItem('smart_inventory_token');
    this.socketService.disconnect();
    this.ui.userProfile.set(null);
    this.router.navigate(['/login']);
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
      next: (res: any) => {
        this.isSavingProfile = false;
        this.ui.userProfile.set(res.data);
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
        this.toast.show('✓ Şifreniz başarıyla güncellendi. Yeniden giriş yapınız.', 'success');
        this.passwordForm.reset();
        this.pwdStrength.set(0);
        setTimeout(() => {
          this.doLogout();
        }, 1500);
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

  // Users Operations and Limits Helpers
  loadUsers() {
    if (this.ui.userProfile()?.role !== 'admin') return;
    this.isLoadingUsers.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/user/users`).subscribe({
      next: (data) => {
        this.users.set(data);
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.isLoadingUsers.set(false);
        this.toast.show('Kullanıcılar yüklenemedi.', 'error');
      }
    });
  }

  getUserLimit(): number {
    const plan = this.ui.userProfile()?.subscriptionPlan || 'standard';
    if (plan === 'professional') return 5;
    if (plan === 'ultra') return 999999;
    return 1;
  }

  getUserLimitText(): string {
    const limit = this.getUserLimit();
    return `${this.users().length} / ${limit === 999999 ? '∞' : limit}`;
  }

  getUserLimitPercentage(): number {
    const limit = this.getUserLimit();
    if (limit === 999999) return 0;
    const pct = (this.users().length / limit) * 100;
    return Math.min(pct, 100);
  }

  isLimitReached(): boolean {
    return this.users().length >= this.getUserLimit();
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  isUserFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasUserValue(fieldName: string): boolean {
    const val = this.userForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  openUserDrawer(user?: any) {
    if (user) {
      this.editUserId.set(user.id);
      this.userForm.patchValue({
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        password: '',
        department: user.department,
        role: user.role || 'viewer'
      });
      this.userForm.get('username')?.disable();
    } else {
      this.editUserId.set(null);
      this.userForm.reset({
        fullName: '',
        email: '',
        username: '',
        password: '',
        department: '',
        role: 'viewer'
      });
      this.userForm.get('username')?.enable();
    }
    this.isUserDrawerOpen.set(true);
  }

  closeUserDrawer() {
    this.isUserDrawerOpen.set(false);
    this.userForm.reset();
    this.editUserId.set(null);
  }

  saveUser() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSavingUser.set(true);
    const data = this.userForm.getRawValue();
    const userId = this.editUserId();

    const obs = userId
      ? this.http.put(`${environment.apiUrl}/user/users/${userId}`, data)
      : this.http.post(`${environment.apiUrl}/user/users`, data);

    obs.subscribe({
      next: () => {
        this.isSavingUser.set(false);
        this.closeUserDrawer();
        this.loadUsers();
        this.toast.show(userId ? '✓ Kullanıcı başarıyla güncellendi.' : '✓ Yeni kullanıcı başarıyla eklendi.', 'success');
      },
      error: (err) => {
        this.isSavingUser.set(false);
        const errMsg = err?.error?.message || 'Kullanıcı kaydedilemedi.';
        this.toast.show('Hata: ' + errMsg, 'error');
      }
    });
  }

  promptDeleteUser(user: any) {
    if (user.role === 'admin') {
      this.toast.show('Hata: Ana yönetici hesabı silinemez.', 'error');
      return;
    }
    this.userToDelete.set(user);
    this.showUserDeleteModal.set(true);
  }

  cancelDeleteUser() {
    this.showUserDeleteModal.set(false);
    this.userToDelete.set(null);
  }

  confirmDeleteUser() {
    const user = this.userToDelete();
    if (!user) return;

    this.isSavingUser.set(true);
    this.http.delete(`${environment.apiUrl}/user/users/${user.id}`).subscribe({
      next: () => {
        this.isSavingUser.set(false);
        this.cancelDeleteUser();
        this.loadUsers();
        this.toast.show('✓ Kullanıcı başarıyla silindi.', 'success');
      },
      error: (err) => {
        this.isSavingUser.set(false);
        this.cancelDeleteUser();
        const errMsg = err?.error?.message || 'Kullanıcı silinemedi.';
        this.toast.show('Hata: ' + errMsg, 'error');
      }
    });
  }
}
