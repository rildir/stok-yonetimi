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
    <div class="login-container" style="background-color: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; height: 100vh; padding-top: 2rem; font-family: var(--font-body);">
      <!-- Logo centered above the box -->
      <div class="login-header-logo" style="margin-bottom: 1.25rem; display: flex; align-items: center; gap: 8px;">
        <div style="background-color: #FFD814; color: #0F1111; font-weight: 800; font-size: 1.5rem; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">E</div>
        <span style="font-size: 1.6rem; font-weight: bold; color: #111827; letter-spacing: -0.03em;">Ecelon</span>
      </div>

      <div class="login-card" style="background: #FFFFFF; border: 1px solid #D5D9D9; border-radius: 8px; width: 350px; padding: 20px 26px; box-shadow: none;">
        <h2 style="font-size: 1.7rem; font-weight: 400; margin-bottom: 1.25rem; color: #0F1111;">Giriş Yap</h2>
        
        <form class="login-form" (submit)="doLogin(usernameInput.value, passwordInput.value); $event.preventDefault()" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 13px; font-weight: bold; color: #0F1111;">Kullanıcı Adı</label>
            <input 
              type="text" 
              #usernameInput 
              value="admin" 
              placeholder="Kullanıcı adı" 
              [disabled]="isLoginLoading()" 
              style="width: 100%; height: 31px; padding: 3px 7px; border: 1px solid #a6a6a6; border-radius: 3px; font-size: 13px; outline: none; box-sizing: border-box;"
              required
            >
          </div>
          
          <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <label style="font-size: 13px; font-weight: bold; color: #0F1111;">Şifre</label>
              <a href="#" class="forgot-link" (click)="$event.preventDefault()" style="font-size: 12px; color: #0066c0; text-decoration: none;">Şifremi Unuttum</a>
            </div>
            <input 
              type="password" 
              #passwordInput 
              value="admin" 
              placeholder="••••••••" 
              [disabled]="isLoginLoading()" 
              style="width: 100%; height: 31px; padding: 3px 7px; border: 1px solid #a6a6a6; border-radius: 3px; font-size: 13px; outline: none; box-sizing: border-box;"
              required
            >
          </div>
          
          <button 
            type="submit" 
            class="btn btn-primary" 
            [disabled]="isLoginLoading()" 
            style="width: 100%; height: 31px; border-radius: 8px; border: 1px solid #FCD200; background: #FFD814; color: #0F1111; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px 0 rgba(213,217,217,.5); font-weight: normal;"
            onmouseover="this.style.background='#F7CA00'"
            onmouseout="this.style.background='#FFD814'"
          >
            @if (isLoginLoading()) { 
              Giriş Yapılıyor... 
            } @else { 
              Giriş Yap 
            }
          </button>
        </form>

        <p style="font-size: 12px; line-height: 1.5; color: #111; margin-top: 18px; margin-bottom: 12px;">
          Giriş yaparak, Ecelon <a href="#" (click)="$event.preventDefault()" style="color: #0066c0; text-decoration: none;">Kullanım Koşulları</a> ve <a href="#" (click)="$event.preventDefault()" style="color: #0066c0; text-decoration: none;">Gizlilik Bildirimi</a> şartlarını kabul etmiş olursunuz.
        </p>
      </div>

      <!-- Divider / New to Smart Inventory text -->
      <div style="width: 350px; text-align: center; margin-top: 1.5rem; position: relative;">
        <div style="border-top: 1px solid #e7e7e7; position: absolute; width: 100%; top: 50%; z-index: 1;"></div>
        <span style="background: #FFFFFF; padding: 0 8px; font-size: 12px; color: #767676; position: relative; z-index: 2;">Ecelon'da yeni misiniz?</span>
      </div>

      <!-- Demo Account Info Box below the card -->
      <div class="demo-accounts-box" style="width: 350px; margin-top: 1rem; padding: 14px; border-radius: 8px; background: #F7FAFA; border: 1px solid #D5D9D9; font-size: 12px; line-height: 1.4; box-sizing: border-box;">
        <strong style="display:block; margin-bottom: 0.5rem; color: #0F1111; font-weight: 700;">Demo Kullanıcı Bilgileri:</strong>
        <div style="display:flex; justify-content: space-between; margin-bottom: 0.25rem;">
          <span>🔑 admin / admin</span>
          <strong style="color: #C45500;">Yönetici</strong>
        </div>
        <div style="display:flex; justify-content: space-between; margin-bottom: 0.25rem;">
          <span>🔑 manager / manager123</span>
          <strong style="color: #007600;">Stok Sorumlusu</strong>
        </div>
        <div style="display:flex; justify-content: space-between;">
          <span>🔑 viewer / viewer123</span>
          <strong style="color: #565959;">Gözlemci (Salt Okur)</strong>
        </div>
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
