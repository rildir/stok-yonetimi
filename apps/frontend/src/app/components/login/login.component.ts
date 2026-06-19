import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UiStateService } from '../../services/ui-state.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-logo">
          <div class="logo-mark">S</div>
          <h2>Smart Inventory</h2>
          <p>Hesabınıza giriş yapın</p>
        </div>
        <form class="login-form" (submit)="doLogin(usernameInput.value, passwordInput.value); $event.preventDefault()">
          <div class="form-group">
            <label>Kullanıcı Adı</label>
            <input type="text" #usernameInput value="admin" placeholder="Kullanıcı adı" [disabled]="isLoginLoading()" required>
          </div>
          <div class="form-group">
            <label>Şifre</label>
            <input type="password" #passwordInput value="admin" placeholder="••••••••" [disabled]="isLoginLoading()" required>
          </div>
          <div class="login-actions"><a href="#" class="forgot-link" (click)="$event.preventDefault()">Şifremi Unuttum</a></div>
          <button type="submit" class="btn btn-primary btn-block" [disabled]="isLoginLoading()">
            @if (isLoginLoading()) { <span class="spinner-sm spinner-light"></span> Giriş Yapılıyor... } @else { Giriş Yap }
          </button>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  router = inject(Router);
  ui = inject(UiStateService);
  http = inject(HttpClient);
  isLoginLoading = signal(false);

  doLogin(u: string, p: string) {
    if (this.isLoginLoading()) return;
    this.isLoginLoading.set(true);

    this.http.post<{ token: string }>(`${environment.apiUrl}/auth/login`, { username: u, password: p }).subscribe({
      next: (res) => {
        this.isLoginLoading.set(false);
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
