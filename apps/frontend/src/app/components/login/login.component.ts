import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import { I18nService, TranslatePipe, AppDatePipe } from '../../i18n';
import { FormsModule } from '@angular/forms';
import { KvkkService, PrivacyNotice } from '../../services/kvkk.service';
import { SessionService } from '../../services/session.service';
import { NoticeTextComponent } from '../kvkk/notice-text.component';
import { ModalComponent } from '../modal.component';
import { IconComponent } from '../shared/icon.component';

const REMEMBER_KEY = 'login_remember_username';

@Component({
  selector: 'app-login',
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./auth.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NoticeTextComponent, ModalComponent, IconComponent],
  template: `
    <div class="auth">
      <div class="auth-side">
        <div class="auth-brand"><span class="brand-mark" aria-hidden="true"></span><span class="brand-word">ecelon</span></div>

        <main class="auth-col">
          @if (mode() === 'register') {
          <!-- ─── Register ─── -->
          <form class="auth-form wide" (submit)="doRegister({
              companyName: rCompany.value, country: rCountry.value, defaultLanguage: rLang.value,
              baseCurrency: rCurrency.value, timezone: rTz.value, fullName: rFullName.value,
              username: rUsername.value, email: rEmail.value, password: rPassword.value
            }); $event.preventDefault()">
            <div>
              <h1>{{ 'login.register.title' | t }}</h1>
              <p class="lead-t">{{ 'login.register.lead' | t }}</p>
            </div>
            <div>
              <section class="fsec first">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'login.register.sectionCompany' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="regCompany">{{ 'login.register.companyName' | t }}</label>
                  <div class="field field-lg"><span class="lead"><app-icon name="building" size="sm" /></span><input type="text" #rCompany id="regCompany" [placeholder]="'login.register.companyNamePh' | t" required [disabled]="isRegisterLoading()" autocomplete="organization"></div>
                </div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="regCountry">{{ 'login.register.country' | t }}</label>
                    <div class="field select"><select #rCountry id="regCountry" [disabled]="isRegisterLoading()">
                      @for (c of countries; track c.code) { <option [value]="c.code">{{ 'login.country.' + c.code | t }}</option> }
                    </select></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="regLang">{{ 'login.register.language' | t }}</label>
                    <div class="field select"><select #rLang id="regLang" [disabled]="isRegisterLoading()">
                      <option value="tr">{{ 'login.lang.tr' | t }}</option>
                      <option value="en">{{ 'login.lang.en' | t }}</option>
                    </select></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="regCurrency">{{ 'login.register.currency' | t }}</label>
                    <div class="field select"><select #rCurrency id="regCurrency" [disabled]="isRegisterLoading()">
                      @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                    </select></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="regTz">{{ 'login.register.timezone' | t }}</label>
                    <div class="field select"><select #rTz id="regTz" [disabled]="isRegisterLoading()">
                      @for (tz of timezones; track tz) { <option [value]="tz">{{ 'login.tz.' + tz | t }} ({{ tz }})</option> }
                    </select></div>
                  </div>
                </div>
              </section>
              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'login.register.sectionAdmin' | t }}</h3><p>{{ 'login.register.sectionAdminHint' | t }}</p></div>
                <div class="grid-2">
                  <div class="fld span-2">
                    <label class="fld-label" for="regFullName">{{ 'login.register.fullName' | t }}</label>
                    <div class="field"><input type="text" #rFullName id="regFullName" [placeholder]="'login.register.fullNamePh' | t" required [disabled]="isRegisterLoading()" autocomplete="name"></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="regUsername">{{ 'login.username' | t }}</label>
                    <div class="field"><input type="text" #rUsername id="regUsername" [placeholder]="'login.usernamePh' | t" required [disabled]="isRegisterLoading()" autocomplete="username"></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="regEmail">{{ 'login.register.email' | t }}</label>
                    <div class="field"><input type="email" #rEmail id="regEmail" [placeholder]="'login.register.emailPh' | t" [disabled]="isRegisterLoading()" autocomplete="email"></div>
                  </div>
                  <div class="fld span-2">
                    <label class="fld-label" for="regPassword">{{ 'login.password' | t }}</label>
                    <div class="field">
                      <input [type]="showRegPassword() ? 'text' : 'password'" #rPassword id="regPassword" aria-describedby="regPasswordHelp" required minlength="10" [disabled]="isRegisterLoading()" autocomplete="new-password">
                      <span class="trail"><button class="btn btn-ghost btn-xs btn-icon" type="button" (click)="showRegPassword.set(!showRegPassword())" [attr.aria-label]="(showRegPassword() ? 'login.hidePassword' : 'login.showPassword') | t" [attr.aria-pressed]="showRegPassword()"><app-icon [name]="showRegPassword() ? 'eyeoff' : 'eye'" size="sm" /></button></span>
                    </div>
                    <p class="fld-help" id="regPasswordHelp">{{ 'login.register.passwordHelp' | t }}</p>
                  </div>
                </div>
              </section>
            </div>
            <p class="auth-legal">{{ 'kvkk.register.noticeText' | t }} <button type="button" class="link-btn" (click)="openNotice('PRIVACY')">{{ 'kvkk.footer.notice' | t }}</button> · <button type="button" class="link-btn" (click)="openNotice('TOS')">{{ 'kvkk.footer.tos' | t }}</button> · <button type="button" class="link-btn" (click)="openNotice('DPA')">{{ 'kvkk.footer.dpa' | t }}</button></p>
            <button type="submit" class="btn btn-primary btn-xl btn-block" [class.is-loading]="isRegisterLoading()" [attr.aria-busy]="isRegisterLoading() || null">
              <span>{{ (isRegisterLoading() ? 'login.register.creating' : 'login.register.submit') | t }}</span>
            </button>
            <p class="auth-alt">{{ 'login.register.haveAccount' | t }} <button type="button" (click)="mode.set('login')">{{ 'login.register.goLogin' | t }}</button></p>
          </form>
          } @else if (totpChallenge()) {
          <!-- ─── Second factor ─── -->
          <form class="auth-form" (submit)="doTotp(); $event.preventDefault()">
            <div class="auth-state">
              <span class="ic info"><app-icon name="shield" /></span>
              <div>
                <h1>{{ 'login.totp.title' | t }}</h1>
                <p class="lead-t">{{ 'auth.totp.loginHint' | t }}</p>
              </div>
            </div>
            @if (lockedMessage()) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ lockedMessage() }}</span></div> }
            <div class="fld">
              <label class="fld-label" for="loginTotp">{{ 'auth.totp.code' | t }}</label>
              <div class="field field-lg"><span class="lead"><app-icon name="hash" size="sm" /></span>
                <input type="text" class="mono" id="loginTotp" name="totpCode" [(ngModel)]="totpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="11" [placeholder]="'auth.totp.codePh' | t" [disabled]="isLoginLoading()" required autofocus>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-xl btn-block" [class.is-loading]="isLoginLoading()" [disabled]="!totpCode.trim()"><span>{{ 'auth.totp.verify' | t }}</span></button>
            <button type="button" class="btn btn-ghost btn-lg btn-block" (click)="totpChallenge.set(null); totpCode = ''">{{ 'common.cancel' | t }}</button>
          </form>
          } @else {
          <!-- ─── Sign in ─── -->
          <form class="auth-form" (submit)="lockedMessage.set(null); doLogin(usernameInput.value, passwordInput.value); $event.preventDefault()">
            <div>
              <h1>{{ 'login.welcome' | t }}</h1>
              <p class="lead-t">{{ 'login.lead' | t }}</p>
            </div>
            @if (lockedMessage()) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ lockedMessage() }}</span></div> }
            <div class="auth-fields">
              <div class="fld">
                <label class="fld-label" for="loginUsername">{{ 'login.username' | t }}</label>
                <div class="field field-lg">
                  <span class="lead"><app-icon name="user" size="sm" /></span>
                  <input type="text" #usernameInput [value]="rememberedUsername" [placeholder]="'login.usernamePh' | t" [disabled]="isLoginLoading()" id="loginUsername" autocomplete="username" required>
                </div>
              </div>
              <div class="fld">
                <div class="fld-label"><label for="loginPassword">{{ 'login.password' | t }}</label><a href="#" (click)="$event.preventDefault(); showForgotModal.set(true)">{{ 'login.forgot' | t }}</a></div>
                <div class="field field-lg">
                  <span class="lead"><app-icon name="lock" size="sm" /></span>
                  <input [type]="showPassword() ? 'text' : 'password'" #passwordInput value="" placeholder="••••••••" [disabled]="isLoginLoading()" id="loginPassword" autocomplete="current-password" required>
                  <span class="trail"><button class="btn btn-ghost btn-xs btn-icon" type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="(showPassword() ? 'login.hidePassword' : 'login.showPassword') | t" [attr.aria-pressed]="showPassword()"><app-icon [name]="showPassword() ? 'eyeoff' : 'eye'" size="sm" /></button></span>
                </div>
              </div>
              <div class="auth-split">
                <label class="check"><input type="checkbox" [checked]="rememberMe()" (change)="rememberMe.set($any($event.target).checked)" />{{ 'login.remember' | t }}</label>
                <span class="auth-meta"><app-icon name="shield" size="sm" />{{ 'login.secureHint' | t }}</span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-xl btn-block" [class.is-loading]="isLoginLoading()" [attr.aria-busy]="isLoginLoading() || null">
              <span>{{ (isLoginLoading() ? 'login.signingIn' : 'login.submit') | t }}</span><kbd>↵</kbd>
            </button>
            <div class="auth-or">{{ 'login.or' | t }}</div>
            <button type="button" class="btn btn-xl btn-block" id="showRegister" (click)="mode.set('register')"><app-icon name="building" />{{ 'login.goRegister' | t }}</button>
            <p class="auth-alt">{{ 'login.inviteHint' | t }}</p>
          </form>
          }
        </main>

        <footer class="auth-foot">
          <div class="field field-sm select">
            <span class="lead"><app-icon name="globe" size="sm" /></span>
            <select [attr.aria-label]="'common.language' | t" (change)="i18n.setLanguage($any($event.target).value)">
              <option value="tr" [selected]="i18n.lang() === 'tr'">Türkçe</option>
              <option value="en" [selected]="i18n.lang() === 'en'">English</option>
            </select>
          </div>
          <span class="spacer"></span>
          <button type="button" class="link-btn" (click)="openNotice('PRIVACY')">{{ 'kvkk.footer.notice' | t }}</button>
          <button type="button" class="link-btn" (click)="openNotice('TOS')">{{ 'kvkk.footer.tos' | t }}</button>
          <span>© {{ year }} Ecelon</span>
        </footer>
      </div>

      <!-- ─── Product panel (decorative, illustrative preview) ─── -->
      <aside class="auth-panel" aria-hidden="true">
        <div class="auth-sys">
          <span class="brand-mark"></span>
          <span class="sys-label"><b>{{ 'login.panel.sys' | t }}</b></span>
          <span class="spacer"></span>
          <span class="sys-label">{{ 'login.panel.ref' | t: { year: year } }}</span>
        </div>
        <span class="auth-kicker"><b>{{ 'login.panel.new' | t }}</b> {{ 'login.panel.kicker' | t }} <app-icon name="chevr" size="xs" /></span>
        <h2>{{ 'login.panel.title' | t }}</h2>
        <p class="sub">{{ 'login.panel.sub' | t }}</p>
        <div class="auth-proof">
          <div><b>e-Fatura</b><span>{{ 'login.panel.proof1' | t }}</span></div>
          <div><b>KVKK</b><span>{{ 'login.panel.proof2' | t }}</span></div>
          <div><b>⌘K</b><span>{{ 'login.panel.proof3' | t }}</span></div>
        </div>
        <div class="auth-shot">
          <div class="bar"><i></i><i></i><i></i><span>stok.ecelon.dev/dashboard</span></div>
          <div class="pv">
            <div class="pv-side">
              <div class="ws"><span class="brand-mark"></span><b class="brand-word">ecelon</b></div>
              <div class="pv-nav on"><app-icon name="home" />{{ 'layout.nav.dashboard' | t }}</div>
              <div class="pv-sec">{{ 'layout.group.stock' | t }}</div>
              <div class="pv-nav"><app-icon name="box" />{{ 'layout.nav.products' | t }}</div>
              <div class="pv-nav"><app-icon name="swap" />{{ 'layout.nav.stockMovements' | t }}</div>
              <div class="pv-nav"><app-icon name="warehouse" />{{ 'layout.nav.warehouses' | t }}</div>
              <div class="pv-sec">{{ 'layout.group.operations' | t }}</div>
              <div class="pv-nav"><app-icon name="bag" />{{ 'layout.nav.orders' | t }}</div>
              <div class="pv-nav"><app-icon name="receipt" />{{ 'layout.nav.invoices' | t }}</div>
            </div>
            <div class="pv-main">
              <div class="pv-h">{{ 'layout.nav.dashboard' | t }}<span class="btnp">+ {{ 'login.preview.newMovement' | t }}</span></div>
              <div class="pv-kpis">
                <div class="pv-kpi"><span>{{ 'login.preview.kpiValue' | t }}</span><b>₺1.248.300<small>,40</small></b></div>
                <div class="pv-kpi warn"><span>{{ 'login.preview.kpiCritical' | t }}</span><b>7</b></div>
                <div class="pv-kpi"><span>{{ 'login.preview.kpiOrders' | t }}</span><b>12</b></div>
                <div class="pv-kpi"><span>{{ 'login.preview.kpiOut' | t }}</span><b>3.482</b></div>
              </div>
              <div class="pv-row2">
                <div class="pv-card">
                  <div class="pv-card-h">{{ 'login.preview.flow' | t }}<span class="lg"><i></i>{{ 'login.preview.in' | t }}</span><span class="lg"><i></i>{{ 'login.preview.out' | t }}</span></div>
                  <div class="pv-bars">
                    @for (b of bars; track $index) { <div><i [style.height.%]="b[0]"></i><i [style.height.%]="b[1]"></i></div> }
                  </div>
                </div>
                <div class="pv-card">
                  <div class="pv-card-h">{{ 'login.preview.critical' | t }}</div>
                  <div class="pv-list">
                    @for (r of criticalRows; track r.n) {
                      <div class="pv-li"><b>{{ r.n }}</b><span class="q">{{ r.q }} / {{ r.min }}</span><span class="m"><i [style.width.%]="(r.q / r.min) * 100"></i></span></div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="pv-scan">
          <div class="top"><span class="pulse"></span>{{ 'login.preview.scanned' | t }}<span class="t">09:41</span></div>
          <b>Vida M6×20 · Paslanmaz</b>
          <span class="code">8690000123457 · VDA-M6-20</span>
          <dl>
            <div><dt>{{ 'login.preview.depot' | t }}</dt><dd>Merkez</dd></div>
            <div><dt>{{ 'login.preview.shelf' | t }}</dt><dd>A-03-2</dd></div>
            <div><dt>{{ 'login.preview.qty' | t }}</dt><dd class="plus">+24</dd></div>
          </dl>
        </div>
      </aside>

      @if (notice()) {
        <app-modal [isOpen]="true" size="lg" [title]="notice()?.title || ''" (onClose)="notice.set(null)">
          <p class="notice-meta">{{ 'kvkk.notice.version' | t }} <span class="mono">{{ notice()?.version }}</span> · {{ notice()?.publishedAt | appDate }}</p>
          <app-notice-text [text]="notice()?.body"></app-notice-text>
          <div footer class="modal-actions"><button type="button" class="btn btn-primary" (click)="notice.set(null)">{{ 'common.close' | t }}</button></div>
        </app-modal>
      }

      @if (showForgotModal()) {
        <div class="scrim" (click)="closeForgotModal()">
          <div class="modal w-sm" role="dialog" aria-modal="true" [attr.aria-label]="'login.reset.title' | t" (click)="$event.stopPropagation()">
            @if (isResetSubmitted()) {
              <div class="modal-b reset-done">
                <div class="auth-state">
                  <span class="ic ok"><app-icon name="okc" /></span>
                  <div><h2 class="modal-title">{{ 'login.reset.sentTitle' | t }}</h2><p class="reset-p">{{ 'login.reset.sentDesc' | t }}</p></div>
                </div>
              </div>
              <div class="modal-f"><button type="button" class="btn btn-primary" (click)="closeForgotModal()">{{ 'login.reset.ok' | t }}</button></div>
            } @else {
              <form (submit)="doResetPassword(resetUsernameInput.value); $event.preventDefault()">
                <div class="modal-h"><h2>{{ 'login.reset.title' | t }}</h2>
                  <button type="button" class="modal-close" (click)="closeForgotModal()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
                </div>
                <div class="modal-b">
                  <p>{{ 'login.reset.desc' | t }}</p>
                  <div class="fld reset-fld">
                    <label class="fld-label" for="resetUsername">{{ 'login.username' | t }}</label>
                    <div class="field"><span class="lead"><app-icon name="user" size="sm" /></span><input type="text" #resetUsernameInput [placeholder]="'login.reset.usernamePh' | t" [disabled]="isResetLoading()" id="resetUsername" required autocomplete="username"></div>
                  </div>
                </div>
                <div class="modal-f">
                  <button type="button" class="btn btn-ghost" (click)="closeForgotModal()" [disabled]="isResetLoading()">{{ 'common.cancel' | t }}</button>
                  <button type="submit" class="btn btn-primary" [class.is-loading]="isResetLoading()"><span>{{ (isResetLoading() ? 'login.reset.sending' : 'login.reset.submit') | t }}</span></button>
                </div>
              </form>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .fsec.first { padding-top: 0; }
    .reset-done { padding-top: 20px; }
    .reset-p { margin-top: 6px; }
    .reset-fld { margin-top: 14px; }
    @media (max-width: 640px) {
      .auth-foot .spacer { flex: 1 0 100%; height: 0; }
      .auth-foot > span:last-child { margin-left: auto; }
    }
  `]
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
  // WP7: second factor (TOTP / recovery code) and the privacy notice on the login screen
  private kvkk = inject(KvkkService);
  private session = inject(SessionService);
  totpChallenge = signal<string | null>(null);
  totpCode = '';
  notice = signal<PrivacyNotice | null>(null);
  // Presentation-only state
  readonly year = new Date().getFullYear();
  showPassword = signal(false);
  showRegPassword = signal(false);
  /** "Remember my username": keeps only the username on this device; the session length is unchanged. */
  rememberedUsername = this.readRemembered();
  rememberMe = signal(!!this.rememberedUsername);
  readonly bars = [[62, 40], [48, 55], [70, 38], [55, 61], [80, 45], [66, 70], [90, 52], [58, 48], [74, 60], [84, 66]];
  readonly criticalRows = [
    { n: 'Vida M6×20 · Paslanmaz', q: 4, min: 40 },
    { n: 'Rulman 6204-2RS', q: 9, min: 30 },
    { n: 'Kablo bağı 200 mm', q: 18, min: 50 },
  ];

  private readRemembered(): string {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
  }

  private storeRemembered(username: string) {
    if (typeof window === 'undefined') return;
    try {
      if (this.rememberMe() && username.trim()) localStorage.setItem(REMEMBER_KEY, username.trim());
      else localStorage.removeItem(REMEMBER_KEY);
    } catch { /* storage unavailable */ }
  }

  openNotice(docType: 'PRIVACY' | 'TOS' | 'DPA') {
    this.kvkk.publicNotice(docType, this.i18n.lang()).subscribe({ next: (n) => this.notice.set(n), error: () => undefined });
  }

  doTotp() {
    const challenge = this.totpChallenge();
    if (!challenge || this.isLoginLoading()) return;
    this.isLoginLoading.set(true);
    this.http.post<{ token: string; mustChangePassword?: boolean; passwordPolicyOk?: boolean; totpSetupRequired?: boolean }>(`${environment.apiUrl}/auth/login/totp`, { challenge, code: this.totpCode.trim() }).subscribe({
      next: (res) => {
        this.isLoginLoading.set(false);
        this.totpChallenge.set(null);
        this.totpCode = '';
        this.afterLogin(res);
      },
      error: (err) => {
        this.isLoginLoading.set(false);
        if (err.error?.code === 'TOTP_CHALLENGE_INVALID' || err.status === 401) this.totpChallenge.set(null);
        if (err.error?.code === 'ACCOUNT_LOCKED') {
          this.totpChallenge.set(null);
          this.lockedMessage.set(this.i18n.t('login.locked', { detail: err.error?.message || '' }));
          return;
        }
        this.ui.showToast(err.error?.message || this.i18n.t('auth.totp.invalid'), 'error');
      },
    });
  }

  private afterLogin(res: { token: string; profile?: any; locale?: any; mustChangePassword?: boolean; passwordPolicyOk?: boolean; totpSetupRequired?: boolean; totpSetupBlocking?: boolean }) {
    this.session.setToken(res.token);
    if (res.mustChangePassword) {
      this.router.navigate(['/change-password']);
      return;
    }
    this.socketService.connect();
    this.applyLocaleFromResponse(res);
    if (res.totpSetupBlocking) {
      this.ui.showToast(this.i18n.t('auth.totp.setupRequired'), 'info');
      this.router.navigate(['/settings'], { queryParams: { tab: 'profile' } });
      return;
    }
    this.ui.showToast(this.i18n.t(res.passwordPolicyOk === false ? 'login.toast.weakPassword' : 'login.toast.loggedIn'), res.passwordPolicyOk === false ? 'info' : 'success');
    this.router.navigate(['/dashboard']);
  }

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
        this.session.setToken(res.token);
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
    this.storeRemembered(u);
    this.isLoginLoading.set(true);

    this.http.post<{ token: string; profile?: any; locale?: any; mustChangePassword?: boolean; passwordPolicyOk?: boolean; totpRequired?: boolean; challenge?: string; totpSetupBlocking?: boolean }>(`${environment.apiUrl}/auth/login`, { username: u, password: p }).subscribe({
      next: (res) => {
        this.isLoginLoading.set(false);
        if (res.totpRequired && res.challenge) {
          this.totpChallenge.set(res.challenge);
          return;
        }
        this.afterLogin(res);
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
