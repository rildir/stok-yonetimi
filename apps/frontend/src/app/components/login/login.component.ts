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
                value="admin" 
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
                value="admin" 
                placeholder="••••••••" 
                [disabled]="isLoginLoading()" 
                id="loginPassword"
                required
              >
              <div class="form-label" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>Şifre</span>
                <a href="#" class="forgot-link" (click)="$event.preventDefault()">Şifremi Unuttum</a>
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

        <!-- Demo Account Info -->
        <div class="login-demo-box">
          <div class="login-demo-header">Demo Kullanıcı Bilgileri</div>
          <div class="login-demo-row">
            <span class="login-demo-cred">admin / admin</span>
            <span class="login-demo-role" style="color: var(--primary);">Yönetici</span>
          </div>
          <div class="login-demo-row">
            <span class="login-demo-cred">manager / manager123</span>
            <span class="login-demo-role" style="color: var(--status-instock);">Stok Sorumlusu</span>
          </div>
          <div class="login-demo-row last">
            <span class="login-demo-cred">viewer / viewer123</span>
            <span class="login-demo-role" style="color: var(--text-muted);">Gözlemci</span>
          </div>
        </div>

        <p class="login-footer-text">© 2024 Ecelon · Tüm hakları saklıdır.</p>
      </div>
    </div>
  `
})
export class LoginComponent {
  router = inject(Router);
  ui = inject(UiStateService);
  http = inject(HttpClient);
  socketService = inject(SocketService);
  isLoginLoading = signal(false);

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
