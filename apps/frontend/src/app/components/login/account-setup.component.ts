import { Component, ViewEncapsulation, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { isStrongPassword, PASSWORD_MIN_CLASSES, PASSWORD_MIN_LENGTH, passwordClasses } from '@stok/tr-compliance';
import { environment } from '../../../environments/environment';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { I18nService, TranslatePipe } from '../../i18n';
import { IconComponent } from '../shared/icon.component';

/**
 * Two account flows outside the app shell:
 *  - /invite/:token     invited user chooses the first password (no default password exists);
 *  - /change-password   user with an admin-issued temporary password must replace it.
 */
@Component({
  selector: 'app-account-setup',
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./auth.css'],
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  styles: [`
    .setup-skel { display: flex; flex-direction: column; gap: 10px; }
    .setup-skel .skeleton-title { width: 70%; height: 22px; }
    .policy-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: var(--text-xs); color: var(--fg-3); }
    .policy-list li { display: flex; align-items: center; gap: 6px; line-height: 16px; }
    .policy-list .pi { flex: none; width: 14px; height: 14px; display: grid; place-items: center; border-radius: 50%; color: var(--fg-disabled); box-shadow: inset 0 0 0 1.5px var(--fg-disabled); }
    .policy-list .pi::after { content: ''; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
    .policy-list li.ok { color: var(--success); }
    .policy-list li.ok .pi { background: var(--success-dot); color: var(--surface); box-shadow: none; }
    .policy-list li.ok .pi::after { display: none; }
    .policy-list .pi .i { width: 10px; height: 10px; stroke-width: 3; }
  `],
  template: `
    <div class="auth single">
      <div class="auth-side">
        <div class="auth-brand"><span class="brand-mark" aria-hidden="true"></span><span class="brand-word">ecelon</span></div>
        <main class="auth-col">
          @if (mode() === 'invite' && inviteError()) {
            <div class="auth-form" role="alert">
              <div class="auth-state">
                <span class="ic"><app-icon name="alert" /></span>
                <div>
                  <h1>{{ 'login.invite.invalidTitle' | t }}</h1>
                  <p class="lead-t">{{ 'login.invite.invalid' | t }}</p>
                </div>
              </div>
              <button type="button" class="btn btn-xl btn-block" (click)="router.navigate(['/login'])"><app-icon name="chevl" />{{ 'login.invite.toLogin' | t }}</button>
            </div>
          } @else if (mode() === 'invite' && !invite()) {
            <div class="auth-form setup-skel" [attr.aria-label]="'common.loading' | t" aria-busy="true">
              <div class="skeleton skeleton-title"></div>
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-text short"></div>
            </div>
          } @else {
            <form class="auth-form" (submit)="submit(); $event.preventDefault()">
              <div class="auth-state">
                <span class="ic info"><app-icon [name]="mode() === 'invite' ? 'user' : 'lock'" /></span>
                <div>
                  <h1>{{ (mode() === 'invite' ? 'login.invite.title' : 'login.changePassword.title') | t }}</h1>
                  <p class="lead-t">
                    @if (mode() === 'invite') { {{ 'login.invite.subtitle' | t: { name: invite()?.fullName || '', company: invite()?.companyName || '', username: invite()?.username || '' } }} }
                    @else { {{ 'login.changePassword.subtitle' | t }} }
                  </p>
                </div>
              </div>
              <div class="auth-fields">
                @if (mode() === 'change') {
                  <div class="fld">
                    <label class="fld-label" for="setupCurrent">{{ 'login.changePassword.current' | t }}</label>
                    <div class="field field-lg"><span class="lead"><app-icon name="lock" size="sm" /></span>
                      <input id="setupCurrent" [type]="show() ? 'text' : 'password'" autocomplete="current-password" [value]="current()" (input)="current.set($any($event.target).value)" />
                    </div>
                  </div>
                }
                <div class="fld">
                  <label class="fld-label" for="setupNew">{{ 'login.changePassword.new' | t }}</label>
                  <div class="field field-lg"><span class="lead"><app-icon name="lock" size="sm" /></span>
                    <input id="setupNew" [type]="show() ? 'text' : 'password'" autocomplete="new-password" [value]="password()" (input)="password.set($any($event.target).value)" aria-describedby="setupPolicy" />
                    <span class="trail"><button class="btn btn-ghost btn-xs btn-icon" type="button" (click)="show.set(!show())" [attr.aria-label]="(show() ? 'login.hidePassword' : 'login.showPassword') | t" [attr.aria-pressed]="show()"><app-icon [name]="show() ? 'eyeoff' : 'eye'" size="sm" /></button></span>
                  </div>
                  <ul class="policy-list" id="setupPolicy">
                    <li [class.ok]="password().length >= minLength"><span class="pi" aria-hidden="true">@if (password().length >= minLength) { <app-icon name="check" size="xs" /> }</span>{{ 'login.policy.length' | t: { n: minLength } }}</li>
                    <li [class.ok]="classes() >= minClasses"><span class="pi" aria-hidden="true">@if (classes() >= minClasses) { <app-icon name="check" size="xs" /> }</span>{{ 'login.policy.classes' | t: { n: minClasses } }}</li>
                  </ul>
                </div>
                <div class="fld">
                  <label class="fld-label" for="setupConfirm">{{ 'login.changePassword.confirm' | t }}</label>
                  <div class="field field-lg" [class.is-error]="!!confirm() && confirm() !== password()"><span class="lead"><app-icon name="lock" size="sm" /></span>
                    <input id="setupConfirm" [type]="show() ? 'text' : 'password'" autocomplete="new-password" [value]="confirm()" (input)="confirm.set($any($event.target).value)"
                           [attr.aria-invalid]="!!confirm() && confirm() !== password()" aria-describedby="setupConfirmErr" />
                  </div>
                  @if (confirm() && confirm() !== password()) { <div class="fld-error" id="setupConfirmErr"><app-icon name="alert" size="sm" />{{ 'settings.password.mismatch' | t }}</div> }
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-xl btn-block" [class.is-loading]="saving()" [disabled]="!canSubmit()">
                <span>{{ 'login.changePassword.submit' | t }}</span>
              </button>
            </form>
          }
        </main>
        <footer class="auth-foot"><span class="spacer"></span><span>© {{ year }} Ecelon</span></footer>
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
  show = signal(false);
  readonly year = new Date().getFullYear();
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
