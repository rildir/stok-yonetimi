import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { UiStateService } from '../../services/ui-state.service';

/**
 * Profile > İki adımlı doğrulama (TOTP, WP7): QR / secret, first code to confirm, one-time recovery
 * codes. Mandatory for administrators (after the company's grace period every other call returns
 * TOTP_REQUIRED and the UI lands here).
 */
@Component({
  selector: 'app-totp-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe],
  styles: [`
    :host { display: block; margin-bottom: var(--space-6); }
    .totp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
    .totp-setup { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--space-5); align-items: start; margin-top: var(--space-4); }
    .totp-setup img { width: 220px; height: 220px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: #fff; }
    .totp-secret { font-family: var(--font-mono); font-size: var(--text-sm); word-break: break-all; padding: var(--space-2) var(--space-3); background: var(--color-surface-muted, var(--color-bg)); border-radius: var(--radius-sm); }
    .totp-codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); font-family: var(--font-mono); margin: var(--space-3) 0; }
    .totp-codes span { padding: var(--space-2); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); text-align: center; }
    .totp-row { display: flex; gap: var(--space-2); align-items: flex-end; flex-wrap: wrap; margin-top: var(--space-3); }
    .totp-row .form-field { margin: 0; min-width: 180px; }
    @media (max-width: 640px) { .totp-setup { grid-template-columns: 1fr; } }
  `],
  template: `
    <div class="settings-card">
      <div class="totp-head">
        <div>
          <h3 class="card-title">{{ 'auth.totp.title' | t }}</h3>
          <p class="card-subtitle settings-card-sub">{{ 'auth.totp.subtitle' | t }}</p>
        </div>
        @if (enabled()) { <span class="badge badge-success">{{ 'auth.totp.enabled' | t }}</span> }
        @else { <span class="badge" [class.badge-warning]="required()" [class.badge-neutral]="!required()">{{ (required() ? 'auth.totp.requiredBadge' : 'auth.totp.disabled') | t }}</span> }
      </div>

      @if (!enabled() && required() && graceUntil()) {
        <div class="alert-banner alert-banner--warning" role="status"><span class="alert-banner-text">{{ 'auth.totp.graceNote' | t: { date: (graceUntil() | appDate) } }}</span></div>
      }

      @if (codes().length) {
        <div class="alert-banner alert-banner--info" role="status"><span class="alert-banner-text">{{ 'auth.totp.codesNote' | t }}</span></div>
        <div class="totp-codes">@for (c of codes(); track c) { <span>{{ c }}</span> }</div>
        <button type="button" class="btn btn-secondary btn-sm" (click)="codes.set([])">{{ 'auth.totp.codesSaved' | t }}</button>
      } @else if (setup(); as s) {
        <div class="totp-setup">
          <img [src]="s.qrDataUrl" [alt]="'auth.totp.qrAlt' | t" />
          <div>
            <p class="settings-card-sub">{{ 'auth.totp.scan' | t }}</p>
            <div class="totp-secret">{{ s.secret }}</div>
            <div class="totp-row">
              <div class="form-field">
                <input id="totpCode" class="form-input mono" [(ngModel)]="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" [class.has-value]="!!code" />
                <label for="totpCode" class="form-label">{{ 'auth.totp.code' | t }}</label>
              </div>
              <button type="button" class="btn btn-primary" [disabled]="busy() || code.length !== 6" (click)="enable()">{{ 'auth.totp.enable' | t }}</button>
              <button type="button" class="btn btn-secondary" (click)="setup.set(null)">{{ 'common.cancel' | t }}</button>
            </div>
          </div>
        </div>
      } @else if (!enabled()) {
        <div class="totp-row"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="start()">{{ 'auth.totp.start' | t }}</button></div>
      } @else if (!required()) {
        <div class="totp-row">
          <div class="form-field"><input id="totpPw" type="password" class="form-input" [(ngModel)]="password" [class.has-value]="!!password" /><label for="totpPw" class="form-label">{{ 'auth.totp.password' | t }}</label></div>
          <div class="form-field"><input id="totpOff" class="form-input mono" [(ngModel)]="code" maxlength="11" [class.has-value]="!!code" /><label for="totpOff" class="form-label">{{ 'auth.totp.code' | t }}</label></div>
          <button type="button" class="btn btn-danger" [disabled]="busy() || !password || !code" (click)="disable()">{{ 'auth.totp.disable' | t }}</button>
        </div>
      } @else {
        <p class="settings-card-sub">{{ 'auth.totp.cannotDisable' | t }}</p>
      }
    </div>
  `,
})
export class TotpSettingsComponent {
  private http = inject(HttpClient);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  enabled = computed(() => !!this.ui.userProfile()?.totpEnabled || this.justEnabled());
  required = computed(() => this.ui.userProfile()?.role === 'admin' && !!this.ui.userProfile()?.company?.adminTotpRequired);
  graceUntil = computed(() => this.ui.userProfile()?.totpGraceUntil || null);
  private justEnabled = signal(false);
  setup = signal<{ secret: string; otpauthUrl: string; qrDataUrl: string } | null>(null);
  codes = signal<string[]>([]);
  busy = signal(false);
  code = '';
  password = '';

  start() {
    this.busy.set(true);
    this.http.post<{ secret: string; otpauthUrl: string; qrDataUrl: string }>(`${environment.apiUrl}/user/totp/setup`, {}).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.code = '';
        this.setup.set(s);
      },
      error: (e) => this.fail(e),
    });
  }

  enable() {
    this.busy.set(true);
    this.http.post<{ recoveryCodes: string[] }>(`${environment.apiUrl}/user/totp/enable`, { code: this.code }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.setup.set(null);
        this.codes.set(r.recoveryCodes);
        this.justEnabled.set(true);
        this.ui.userProfile.update((p: any) => (p ? { ...p, totpEnabled: true, totpSetupRequired: false } : p));
        this.ui.showToast(this.i18n.t('auth.totp.enabledToast'), 'success');
      },
      error: (e) => this.fail(e),
    });
  }

  disable() {
    this.busy.set(true);
    this.http.post(`${environment.apiUrl}/user/totp/disable`, { password: this.password, code: this.code }).subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.code = '';
        this.justEnabled.set(false);
        this.ui.userProfile.update((p: any) => (p ? { ...p, totpEnabled: false } : p));
        this.ui.showToast(this.i18n.t('auth.totp.disabledToast'), 'success');
      },
      error: (e) => this.fail(e),
    });
  }

  private fail(e: any) {
    this.busy.set(false);
    this.ui.showToast(e?.error?.message || this.i18n.t('kvkk.error'), 'error');
  }
}
