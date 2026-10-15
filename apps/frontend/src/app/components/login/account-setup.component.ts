import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { isStrongPassword, PASSWORD_MIN_CLASSES, PASSWORD_MIN_LENGTH, passwordClasses } from '@stok/tr-compliance';
import { environment } from '../../../environments/environment';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { I18nService, TranslatePipe } from '../../i18n';

/**
 * Two account flows outside the app shell:
 *  - /invite/:token     invited user chooses the first password (no default password exists);
 *  - /change-password   user with an admin-issued temporary password must replace it.
 */
@Component({
  selector: 'app-account-setup',
  standalone: true,
  imports: [TranslatePipe],
  styles: [`
    .setup-page { min-height: 100vh; display: grid; place-items: center; padding: var(--space-6) var(--space-4); background: var(--color-bg); }
    .setup-card { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: var(--space-5); padding: var(--space-8) var(--space-6); background: var(--color-surface); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .setup-title { font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0; }
    .setup-sub { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
    .setup-form { display: flex; flex-direction: column; gap: var(--space-4); }
    .policy { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; padding: 0; list-style: none; }
    .policy li.ok { color: var(--color-success-text); }
    .policy li::before { content: '○ '; }
    .policy li.ok::before { content: '● '; }
  `],
  template: `
    <div class="setup-page">
      <div class="setup-card">
        @if (mode() === 'invite' && inviteError()) {
          <h1 class="setup-title">{{ 'login.invite.invalidTitle' | t }}</h1>
          <p class="setup-sub">{{ 'login.invite.invalid' | t }}</p>
          <button type="button" class="btn btn-secondary" (click)="router.navigate(['/login'])">{{ 'login.invite.toLogin' | t }}</button>
        } @else {
          <div>
            <h1 class="setup-title">{{ (mode() === 'invite' ? 'login.invite.title' : 'login.changePassword.title') | t }}</h1>
            <p class="setup-sub">
              @if (mode() === 'invite') { {{ 'login.invite.subtitle' | t: { name: invite()?.fullName || '', company: invite()?.companyName || '', username: invite()?.username || '' } }} }
              @else { {{ 'login.changePassword.subtitle' | t }} }
            </p>
          </div>
          <form class="setup-form" (submit)="submit(); $event.preventDefault()">
            @if (mode() === 'change') {
              <div class="form-field">
                <input id="setupCurrent" type="password" class="form-input" autocomplete="current-password" [value]="current()" (input)="current.set($any($event.target).value)" />
                <label for="setupCurrent" class="form-label">{{ 'login.changePassword.current' | t }}</label>
              </div>
            }
            <div class="form-field">
              <input id="setupNew" type="password" class="form-input" autocomplete="new-password" [value]="password()" (input)="password.set($any($event.target).value)" />
              <label for="setupNew" class="form-label">{{ 'login.changePassword.new' | t }}</label>
            </div>
            <div class="form-field">
              <input id="setupConfirm" type="password" class="form-input" autocomplete="new-password" [value]="confirm()" (input)="confirm.set($any($event.target).value)" />
              <label for="setupConfirm" class="form-label">{{ 'login.changePassword.confirm' | t }}</label>
              @if (confirm() && confirm() !== password()) { <div class="form-error">{{ 'settings.password.mismatch' | t }}</div> }
            </div>
            <ul class="policy">
              <li [class.ok]="password().length >= minLength">{{ 'login.policy.length' | t: { n: minLength } }}</li>
              <li [class.ok]="classes() >= minClasses">{{ 'login.policy.classes' | t: { n: minClasses } }}</li>
            </ul>
            <button type="submit" class="btn btn-primary" [disabled]="!canSubmit() || saving()">
              @if (saving()) { <span class="spinner-sm spinner-light"></span> } {{ 'login.changePassword.submit' | t }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class AccountSetupComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private ui = inject(UiStateService);
  private socket = inject(SocketService);
  private i18n = inject(I18nService);

  readonly minLength = PASSWORD_MIN_LENGTH;
  readonly minClasses = PASSWORD_MIN_CLASSES;
  mode = signal<'invite' | 'change'>('change');
  invite = signal<{ username: string; fullName: string; companyName: string | null } | null>(null);
  inviteError = signal(false);
  current = signal('');
  password = signal('');
  confirm = signal('');
  saving = signal(false);
  classes = computed(() => passwordClasses(this.password()));
  canSubmit = computed(
    () => isStrongPassword(this.password()) && this.password() === this.confirm() && (this.mode() === 'invite' || !!this.current()),
  );

  private token = '';

  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.mode.set(this.token ? 'invite' : 'change');
    if (this.token) {
      this.http.get<{ username: string; fullName: string; companyName: string | null }>(`${environment.apiUrl}/auth/invite/${this.token}`).subscribe({
        next: (r) => this.invite.set(r),
        error: () => this.inviteError.set(true),
      });
    }
  }

  private username(): string | null {
    try {
      const t = localStorage.getItem('smart_inventory_token');
      return t ? JSON.parse(atob(t.split('.')[1])).username : null;
    } catch {
      return null;
    }
  }

  private enter(token: string) {
    localStorage.setItem('smart_inventory_token', token);
    this.socket.connect();
    this.router.navigate(['/dashboard']);
  }

  submit() {
    if (!this.canSubmit() || this.saving()) return;
    this.saving.set(true);
    const fail = (err: any) => {
      this.saving.set(false);
      this.ui.showToast(err?.error?.message || this.i18n.t('common.unknownError'), 'error');
    };
    if (this.mode() === 'invite') {
      this.http.post<{ token: string }>(`${environment.apiUrl}/auth/accept-invite`, { token: this.token, password: this.password() }).subscribe({
        next: (r) => {
          this.ui.showToast(this.i18n.t('login.invite.done'), 'success');
          this.enter(r.token);
        },
        error: fail,
      });
      return;
    }
    const username = this.username();
    this.http.put(`${environment.apiUrl}/user/password`, { currentPassword: this.current(), newPassword: this.password() }).subscribe({
      next: () => {
        // The change invalidates the session (tokenVersion); sign in again with the new password.
        this.http.post<{ token: string }>(`${environment.apiUrl}/auth/login`, { username, password: this.password() }).subscribe({
          next: (r) => {
            this.ui.showToast(this.i18n.t('settings.toast.passwordUpdated'), 'success');
            this.enter(r.token);
          },
          error: () => this.router.navigate(['/login']),
        });
      },
      error: fail,
    });
  }
}
