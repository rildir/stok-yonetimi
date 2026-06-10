import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UiStateService } from '../../services/ui-state.service';
import { CommonModule } from '@angular/common';

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
        <form class="login-form" (submit)="doLogin(); $event.preventDefault()">
          <div class="form-group"><label>E-posta veya Kullanıcı Adı</label><input type="text" placeholder="admin@sirket.com" [disabled]="isLoginLoading()" required></div>
          <div class="form-group"><label>Şifre</label><input type="password" placeholder="••••••••" [disabled]="isLoginLoading()" required></div>
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
  isLoginLoading = signal(false);

  doLogin() {
    if (this.isLoginLoading()) return;
    this.isLoginLoading.set(true);
    setTimeout(() => {
      localStorage.setItem('isLoggedIn', 'true');
      this.isLoginLoading.set(false);
      this.ui.showToast('Başarıyla giriş yapıldı.', 'success');
      this.router.navigate(['/dashboard']);
    }, 800);
  }
}
