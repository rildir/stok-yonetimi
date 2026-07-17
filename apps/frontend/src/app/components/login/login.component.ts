import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-page">
      <div class="login-center-column">
        <!-- Brand Logo -->
        <div class="login-brand">
          <h1 class="login-brand-text">ecelon</h1>
          <p class="login-brand-tagline">Stok Yönetim Platformu</p>
        </div>

        <!-- Login Card -->
        <div class="login-card">
          <h2 class="login-card-title">Hesabınıza giriş yapın</h2>
          
          <form class="login-form" (submit)="doLogin(usernameInput.value, passwordInput.value); $event.preventDefault()">
            <div class="form-field">
              <input 
                type="text" 
                class="form-input"
                #usernameInput 
                value="" 
                placeholder="Kullanıcı adı" 
                [disabled]="isLoginLoading()" 
                id="loginUsername"
                required
              >
              <label for="loginUsername" class="form-label">Kullanıcı Adı</label>
            </div>
            
            <div class="form-field">
              <input 
                type="password" 
                class="form-input"
                #passwordInput 
                value="" 
                placeholder="••••••••" 
                [disabled]="isLoginLoading()" 
                id="loginPassword"
                required
              >
              <div class="form-label" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>Şifre</span>
                <a href="#" class="forgot-link" (click)="$event.preventDefault(); showForgotModal.set(true)">Şifremi Unuttum</a>
              </div>
            </div>
            
            <button 
              type="submit" 
              class="btn btn-primary login-submit-btn" 
              [disabled]="isLoginLoading()"
            >
              @if (isLoginLoading()) { 
                <svg class="login-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="30 70" stroke-linecap="round"/></svg>
                Giriş Yapılıyor... 
              } @else { 
                Giriş Yap 
              }
            </button>
          </form>
        </div>

        <p class="login-footer-text">© 2024 Ecelon · Tüm hakları saklıdır.</p>
      </div>

      @if (showForgotModal()) {
        <div class="forgot-modal-overlay" (click)="closeForgotModal()">
          <div class="forgot-modal-card" (click)="$event.stopPropagation()">
            @if (isResetSubmitted()) {
              <div class="forgot-modal-icon success">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h3 class="forgot-modal-title">Talebiniz İletildi</h3>
              <p class="forgot-modal-desc">
                Şifre sıfırlama talebiniz sistem yöneticisine canlı olarak iletilmiştir. 
                Yöneticiniz şifrenizi güncelledikten sonra sisteme giriş yapabilirsiniz.
              </p>
              <button type="button" class="btn btn-primary forgot-modal-btn" (click)="closeForgotModal()">Tamam</button>
            } @else {
              <div class="forgot-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0110 0v4"></path>
                </svg>
              </div>
              <h3 class="forgot-modal-title">Şifre Sıfırlama Talebi</h3>
              <p class="forgot-modal-desc">
                Şifrenizi sıfırlamak için kullanıcı adınızı girin. Sistem yöneticinize anlık bildirim iletilecektir.
              </p>

              <form style="width: 100%; text-align: left;" (submit)="doResetPassword(resetUsernameInput.value); $event.preventDefault()">
                <div class="form-field" style="margin-bottom: 1.25rem;">
                  <input 
                    type="text" 
                    class="form-input"
                    #resetUsernameInput 
                    placeholder="Kullanıcı adınız" 
                    [disabled]="isResetLoading()" 
                    id="resetUsername"
                    required
                  >
                  <label for="resetUsername" class="form-label">Kullanıcı Adı</label>
                </div>

                <div style="display: flex; gap: 10px; width: 100%;">
                  <button type="button" class="btn btn-secondary" style="flex: 1; height: 42px;" (click)="closeForgotModal()" [disabled]="isResetLoading()">İptal</button>
                  <button type="submit" class="btn btn-primary" style="flex: 1; height: 42px;" [disabled]="isResetLoading()">
                    @if (isResetLoading()) {
                      Gönderiliyor...
                    } @else {
                      Talep Gönder
                    }
                  </button>
                </div>
              </form>
            }
          </div>
        </div>
      }
    </div>
  `
})
export class LoginComponent {
  router = inject(Router);
  ui = inject(UiStateService);
  http = inject(HttpClient);
  socketService = inject(SocketService);
  isLoginLoading = signal(false);
  showForgotModal = signal(false);
  isResetLoading = signal(false);
  isResetSubmitted = signal(false);

  closeForgotModal() {
    this.showForgotModal.set(false);
    this.isResetSubmitted.set(false);
    this.isResetLoading.set(false);
  }

  doResetPassword(username: string) {
    if (!username || this.isResetLoading()) return;
    this.isResetLoading.set(true);

    this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/auth/reset-password-request`, { username }).subscribe({
      next: () => {
        this.isResetLoading.set(false);
        this.isResetSubmitted.set(true);
      },
      error: (err) => {
        this.isResetLoading.set(false);
        this.ui.showToast(err.error?.message || 'Şifre sıfırlama talebi gönderilemedi.', 'error');
      }
    });
  }

  doLogin(u: string, p: string) {
    if (this.isLoginLoading()) return;
    this.isLoginLoading.set(true);

    this.http.post<{ token: string }>(`${environment.apiUrl}/auth/login`, { username: u, password: p }).subscribe({
      next: (res) => {
        this.isLoginLoading.set(false);
        localStorage.setItem('smart_inventory_token', res.token);
        this.socketService.connect();
        this.ui.showToast('Başarıyla giriş yapıldı.', 'success');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoginLoading.set(false);
        this.ui.showToast(err.error?.message || 'Kullanıcı adı veya şifre hatalı.', 'error');
      }
    });
  }
}
