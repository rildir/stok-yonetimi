import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { UiStateService } from '../../services/ui-state.service';
import { IconComponent } from '../shared/icon.component';

/**
 * Profile > İki adımlı doğrulama (TOTP, WP7): QR / secret, first code to confirm, one-time recovery
 * codes. Mandatory for administrators (after the company's grace period every other call returns
 * TOTP_REQUIRED and the UI lands here).
 */
@Component({
  selector: 'app-totp-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, IconComponent],
  styles: [`
    :host { display: block; }
    .card-h.sh { padding-block: 12px; min-height: 56px; flex-wrap: wrap; row-gap: 8px; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .card-b { display: flex; flex-direction: column; gap: 14px; }
    .totp-setup { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 20px; align-items: start; }
    .totp-setup img { width: 180px; height: 180px; padding: 8px; border-radius: var(--radius-md); background: var(--white); box-shadow: 0 0 0 1px var(--ring); }
    .totp-step { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .totp-step p { color: var(--fg-2); }
    .totp-secret { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--line); font: 400 var(--text-sm)/1.4 var(--font-mono); word-break: break-all; color: var(--fg); }
    .totp-codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .totp-codes span { padding: 8px; border-radius: var(--radius-sm); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); text-align: center; font: 500 var(--text-sm)/1 var(--font-mono); }
    .totp-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
    .totp-row .fld { width: 180px; }
    .muted-p { color: var(--fg-3); font-size: var(--text-xs); }
    @media (max-width: 640px) { .totp-setup { grid-template-columns: minmax(0, 1fr); } .totp-row .fld { width: 100%; } .totp-row .btn { flex: 1; } }
  `],
  template: `
    <section class="card">
      <div class="card-h sh">
        <div class="hg"><h3>{{ 'auth.totp.title' | t }}</h3><p>{{ 'auth.totp.subtitle' | t }}</p></div>
        @if (enabled()) { <span class="badge badge-success"><span class="dot"></span>{{ 'auth.totp.enabled' | t }}</span> }
        @else { <span class="badge" [class.badge-warning]="required()" [class.badge-neutral]="!required()"><span class="dot"></span>{{ (required() ? 'auth.totp.requiredBadge' : 'auth.totp.disabled') | t }}</span> }
      </div>
      <div class="card-b">
        @if (!enabled() && required() && graceUntil()) {
          <div class="notice notice-warning" role="status"><app-icon name="warn" /><span class="t">{{ 'auth.totp.graceNote' | t: { date: (graceUntil() | appDate) } }}</span></div>
        }

        @if (codes().length) {
          <div class="notice notice-info" role="status"><app-icon name="info" /><span class="t">{{ 'auth.totp.codesNote' | t }}</span></div>
          <div class="totp-codes">@for (c of codes(); track c) { <span>{{ c }}</span> }</div>
          <div class="totp-row"><button type="button" class="btn btn-primary" (click)="codes.set([])"><app-icon name="check" />{{ 'auth.totp.codesSaved' | t }}</button></div>
        } @else if (setup(); as s) {
          <div class="totp-setup">
            <img [src]="s.qrDataUrl" [alt]="'auth.totp.qrAlt' | t" />
            <div class="totp-step">
              <p>{{ 'auth.totp.scan' | t }}</p>
              <div class="totp-secret"><app-icon name="lock" size="sm" />{{ s.secret }}</div>
              <div class="totp-row">
                <div class="fld">
                  <label class="fld-label" for="totpCode">{{ 'auth.totp.code' | t }}</label>
                  <div class="field"><input id="totpCode" class="mono" [(ngModel)]="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" /></div>
                </div>
                <button type="button" class="btn btn-ghost" (click)="setup.set(null)">{{ 'common.cancel' | t }}</button>
                <button type="button" class="btn btn-primary" [disabled]="busy() || code.length !== 6" (click)="enable()">{{ 'auth.totp.enable' | t }}</button>
              </div>
            </div>
          </div>
        } @else if (!enabled()) {
          <div class="totp-row"><button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="busy()" (click)="start()"><app-icon name="shield" /><span>{{ 'auth.totp.start' | t }}</span></button></div>
        } @else if (!required()) {
          <div class="totp-row">
            <div class="fld">
              <label class="fld-label" for="totpPw">{{ 'auth.totp.password' | t }}</label>
              <div class="field"><input id="totpPw" type="password" [(ngModel)]="password" autocomplete="current-password" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="totpOff">{{ 'auth.totp.code' | t }}</label>
              <div class="field"><input id="totpOff" class="mono" [(ngModel)]="code" maxlength="11" /></div>
            </div>
            <button type="button" class="btn btn-danger-outline" [disabled]="busy() || !password || !code" (click)="disable()">{{ 'auth.totp.disable' | t }}</button>
          </div>
        } @else {
          <p class="muted-p">{{ 'auth.totp.cannotDisable' | t }}</p>
        }
      </div>
    </section>
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
