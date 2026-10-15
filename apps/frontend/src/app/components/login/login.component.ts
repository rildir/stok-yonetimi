import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import { I18nService, TranslatePipe } from '../../i18n';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="login-page">
      <aside class="login-aside" aria-hidden="false">
        <div class="login-brand">
          <span class="login-logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
          </span>
          <h1 class="login-brand-text">ecelon</h1>
        </div>
        <p class="login-brand-tagline">{{ 'login.tagline' | t }}</p>
        <div class="login-aside-art" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <p class="login-footer-text login-footer-aside">© 2024 Ecelon · {{ 'login.rights' | t }}</p>
      </aside>
      <main class="login-center-column">
        <!-- Language toggle (user not logged in yet) -->
        <div class="login-lang-toggle segmented" role="group">
          <button type="button" [class.active]="i18n.lang() === 'tr'" [attr.aria-pressed]="i18n.lang() === 'tr'" (click)="i18n.setLanguage('tr')">TR</button>
          <button type="button" [class.active]="i18n.lang() === 'en'" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="i18n.setLanguage('en')">EN</button>
        </div>

        @if (mode() === 'register') {
        <!-- Register Card -->
        <div class="login-card">
          <h2 class="login-card-title">{{ 'login.register.title' | t }}</h2>
          <form class="login-form" (submit)="doRegister({
              companyName: rCompany.value, country: rCountry.value, defaultLanguage: rLang.value,
              baseCurrency: rCurrency.value, timezone: rTz.value, fullName: rFullName.value,
              username: rUsername.value, email: rEmail.value, password: rPassword.value
            }); $event.preventDefault()">
            <div class="form-field">
              <input type="text" class="form-input" #rCompany id="regCompany" [placeholder]="'login.register.companyNamePh' | t" required [disabled]="isRegisterLoading()">
              <label for="regCompany" class="form-label">{{ 'login.register.companyName' | t }}</label>
            </div>
            <div class="login-grid-2">
              <div class="form-field">
                <select class="form-input" #rCountry id="regCountry" [disabled]="isRegisterLoading()">
                  @for (c of countries; track c.code) { <option [value]="c.code">{{ 'login.country.' + c.code | t }}</option> }
                </select>
                <label for="regCountry" class="form-label">{{ 'login.register.country' | t }}</label>
              </div>
              <div class="form-field">
                <select class="form-input" #rLang id="regLang" [disabled]="isRegisterLoading()">
                  <option value="tr">{{ 'login.lang.tr' | t }}</option>
                  <option value="en">{{ 'login.lang.en' | t }}</option>
                </select>
                <label for="regLang" class="form-label">{{ 'login.register.language' | t }}</label>
              </div>
              <div class="form-field">
                <select class="form-input" #rCurrency id="regCurrency" [disabled]="isRegisterLoading()">
                  @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                </select>
                <label for="regCurrency" class="form-label">{{ 'login.register.currency' | t }}</label>
              </div>
              <div class="form-field">
                <select class="form-input" #rTz id="regTz" [disabled]="isRegisterLoading()">
                  @for (tz of timezones; track tz) { <option [value]="tz">{{ 'login.tz.' + tz | t }} ({{ tz }})</option> }
                </select>
                <label for="regTz" class="form-label">{{ 'login.register.timezone' | t }}</label>
              </div>
            </div>
            <div class="form-field">
              <input type="text" class="form-input" #rFullName id="regFullName" [placeholder]="'login.register.fullNamePh' | t" required [disabled]="isRegisterLoading()">
              <label for="regFullName" class="form-label">{{ 'login.register.fullName' | t }}</label>
            </div>
            <div class="form-field">
              <input type="text" class="form-input" #rUsername id="regUsername" [placeholder]="'login.usernamePh' | t" required [disabled]="isRegisterLoading()">
              <label for="regUsername" class="form-label">{{ 'login.username' | t }}</label>
            </div>
            <div class="form-field">
              <input type="email" class="form-input" #rEmail id="regEmail" [placeholder]="'login.register.emailPh' | t" [disabled]="isRegisterLoading()">
              <label for="regEmail" class="form-label">{{ 'login.register.email' | t }}</label>
            </div>
            <div class="form-field">
              <input type="password" class="form-input" #rPassword id="regPassword" [placeholder]="'login.register.passwordPh' | t" required minlength="6" [disabled]="isRegisterLoading()">
              <label for="regPassword" class="form-label">{{ 'login.password' | t }}</label>
            </div>
            <button type="submit" class="btn btn-primary login-submit-btn" [disabled]="isRegisterLoading()">
              @if (isRegisterLoading()) { {{ 'login.register.creating' | t }} } @else { {{ 'login.register.submit' | t }} }
            </button>
          </form>
          <p class="login-switch">
            {{ 'login.register.haveAccount' | t }}
            <a href="#" class="forgot-link" (click)="$event.preventDefault(); mode.set('login')">{{ 'login.register.goLogin' | t }}</a>
          </p>
        </div>
        } @else {
        <!-- Login Card -->
        <div class="login-card">
          <h2 class="login-card-title">{{ 'login.title' | t }}</h2>
          
          @if (lockedMessage()) { <div class="readonly-banner" role="alert">{{ lockedMessage() }}</div> }
          <form class="login-form" (submit)="lockedMessage.set(null); doLogin(usernameInput.value, passwordInput.value); $event.preventDefault()">
            <div class="form-field">
              <input 
                type="text" 
                class="form-input"
                #usernameInput 
                value="" 
                [placeholder]="'login.usernamePh' | t" 
                [disabled]="isLoginLoading()" 
                id="loginUsername"
                required
              >
              <label for="loginUsername" class="form-label">{{ 'login.username' | t }}</label>
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
              <div class="form-label login-label-row">
                <span>{{ 'login.password' | t }}</span>
                <a href="#" class="forgot-link" (click)="$event.preventDefault(); showForgotModal.set(true)">{{ 'login.forgot' | t }}</a>
              </div>
            </div>
            
            <button 
              type="submit" 
              class="btn btn-primary login-submit-btn" 
              [disabled]="isLoginLoading()"
            >
              @if (isLoginLoading()) { 
                <svg class="login-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="30 70" stroke-linecap="round"/></svg>
                {{ 'login.signingIn' | t }}
              } @else { 
                {{ 'login.submit' | t }}
              }
            </button>
          </form>
          <p class="login-switch">
            {{ 'login.noAccount' | t }}
            <a href="#" class="forgot-link" id="showRegister" (click)="$event.preventDefault(); mode.set('register')">{{ 'login.goRegister' | t }}</a>
          </p>
        </div>
        }

        <p class="login-footer-text login-footer-main">© 2024 Ecelon · {{ 'login.rights' | t }}</p>
      </main>

      @if (showForgotModal()) {
        <div class="forgot-modal-overlay" (click)="closeForgotModal()">
          <div class="forgot-modal-card" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            @if (isResetSubmitted()) {
              <div class="forgot-modal-icon success">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h3 class="forgot-modal-title">{{ 'login.reset.sentTitle' | t }}</h3>
              <p class="forgot-modal-desc">
                {{ 'login.reset.sentDesc' | t }}
              </p>
              <button type="button" class="btn btn-primary forgot-modal-btn" (click)="closeForgotModal()">{{ 'login.reset.ok' | t }}</button>
            } @else {
              <div class="forgot-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0110 0v4"></path>
                </svg>
              </div>
              <h3 class="forgot-modal-title">{{ 'login.reset.title' | t }}</h3>
              <p class="forgot-modal-desc">
                {{ 'login.reset.desc' | t }}
              </p>

              <form class="forgot-modal-form" (submit)="doResetPassword(resetUsernameInput.value); $event.preventDefault()">
                <div class="form-field">
                  <input 
                    type="text" 
                    class="form-input"
                    #resetUsernameInput 
                    [placeholder]="'login.reset.usernamePh' | t" 
                    [disabled]="isResetLoading()" 
                    id="resetUsername"
                    required
                  >
                  <label for="resetUsername" class="form-label">{{ 'login.username' | t }}</label>
                </div>

                <div class="forgot-modal-actions">
                  <button type="button" class="btn btn-secondary" (click)="closeForgotModal()" [disabled]="isResetLoading()">{{ 'common.cancel' | t }}</button>
                  <button type="submit" class="btn btn-primary" [disabled]="isResetLoading()">
                    @if (isResetLoading()) {
                      {{ 'login.reset.sending' | t }}
                    } @else {
                      {{ 'login.reset.submit' | t }}
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
  i18n = inject(I18nService);
  isLoginLoading = signal(false);
  showForgotModal = signal(false);
  isResetLoading = signal(false);
  isResetSubmitted = signal(false);
  mode = signal<'login' | 'register'>('login');
  isRegisterLoading = signal(false);
  lockedMessage = signal<string | null>(null);

  // Labels translated in the template via login.country.<code> / login.tz.<tz>
  readonly countries = [
    { code: 'TR' }, { code: 'US' }, { code: 'GB' }, { code: 'DE' },
    { code: 'FR' }, { code: 'NL' }, { code: 'AE' }, { code: 'AZ' },
  ];
  readonly currencies = ['TRY', 'USD', 'EUR', 'GBP', 'AED', 'AZN'];
  readonly timezones = [
    'Europe/Istanbul', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Baku',
  ];

  doRegister(form: Record<string, string>) {
    if (this.isRegisterLoading()) return;
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v && v.trim()) payload[k] = v.trim();
    }
    this.isRegisterLoading.set(true);
    this.http.post<{ token: string; profile?: any; locale?: any }>(`${environment.apiUrl}/auth/register`, payload).subscribe({
      next: (res) => {
        this.isRegisterLoading.set(false);
        localStorage.setItem('smart_inventory_token', res.token);
        this.socketService.connect();
        this.applyLocaleFromResponse(res);
        this.ui.showToast(this.i18n.t('login.toast.registered'), 'success');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isRegisterLoading.set(false);
        const msg = err.error?.message;
        this.ui.showToast((Array.isArray(msg) ? msg[0] : msg) || this.i18n.t('login.toast.registerFailed'), 'error');
      }
    });
  }

  /** If the auth response carries the profile/effective locale, apply it now; otherwise the layout will fetch it. */
  private applyLocaleFromResponse(res: { profile?: any; locale?: any }) {
    if (res?.profile) this.ui.userProfile.set(res.profile);
    const locale = res?.locale ?? res?.profile?.locale;
    if (locale) this.i18n.applyLocale(locale);
  }

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
        this.ui.showToast(err.error?.message || this.i18n.t('login.toast.resetFailed'), 'error');
      }
    });
  }

  doLogin(u: string, p: string) {
    if (this.isLoginLoading()) return;
    this.isLoginLoading.set(true);

    this.http.post<{ token: string; profile?: any; locale?: any; mustChangePassword?: boolean; passwordPolicyOk?: boolean }>(`${environment.apiUrl}/auth/login`, { username: u, password: p }).subscribe({
      next: (res) => {
        this.isLoginLoading.set(false);
        localStorage.setItem('smart_inventory_token', res.token);
        if (res.mustChangePassword) {
          this.router.navigate(['/change-password']);
          return;
        }
        this.socketService.connect();
        this.applyLocaleFromResponse(res);
        this.ui.showToast(this.i18n.t(res.passwordPolicyOk === false ? 'login.toast.weakPassword' : 'login.toast.loggedIn'), res.passwordPolicyOk === false ? 'info' : 'success');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoginLoading.set(false);
        if (err.error?.code === 'ACCOUNT_LOCKED') {
          this.lockedMessage.set(this.i18n.t('login.locked', { detail: err.error?.message || '' }));
          return;
        }
        this.ui.showToast(err.error?.message || this.i18n.t('login.toast.invalidCredentials'), 'error');
      }
    });
  }
}
