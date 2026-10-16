import { Component, HostBinding, Input, OnInit, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { I18nService, TranslatePipe } from '../../i18n';
import { KvkkService, KvkkStatus } from '../../services/kvkk.service';
import { UiStateService } from '../../services/ui-state.service';

/**
 * KVKK reminders for administrators (GET /kvkk/status): requests due within 7 days / overdue, the
 * 72-hour breach clock, suspected breaches, periodic destruction, VERBİS and the 2FA set-up.
 */
@Component({
  selector: 'app-kvkk-banner',
  standalone: true,
  imports: [RouterModule, TranslatePipe],
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
    :host:empty, :host(.as-list) { margin: 0; }
    :host:empty { display: none; }
    :host(.as-list) { gap: 0; }
  `],
  template: `
    @for (a of visible(); track a.code) {
      @if (variant === 'list') {
        <div class="notice-row" [class.is-danger]="a.severity === 'error'" [attr.role]="a.severity === 'error' ? 'alert' : null">
          <span class="dot" aria-hidden="true"></span>
          <div class="t">
            {{ text(a) }}<br />
            <a [routerLink]="['/settings']" [queryParams]="link(a)">{{ 'compliance.fix' | t }} →</a>
          </div>
        </div>
      } @else {
        <div class="alert-banner" [class.alert-banner--danger]="a.severity === 'error'" [class.alert-banner--warning]="a.severity === 'warning'" [class.alert-banner--info]="a.severity === 'info'" [attr.role]="a.severity === 'error' ? 'alert' : 'status'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>
          <span class="alert-banner-text">{{ text(a) }}</span>
          <a [routerLink]="['/settings']" [queryParams]="link(a)">{{ 'compliance.fix' | t }} →</a>
        </div>
      }
    }
  `,
})
export class KvkkBannerComponent implements OnInit {
  /** 'banner' = full-width inline notices; 'list' = compact rows for the topbar notice popover. */
  @Input() variant: 'banner' | 'list' = 'banner';
  @HostBinding('class.as-list') get asList() { return this.variant === 'list'; }
  private api = inject(KvkkService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);
  isAdmin = computed(() => this.ui.userProfile()?.role === 'admin');
  visible = computed(() => (this.isAdmin() ? (this.api.status()?.alerts || []).filter((a) => a.severity !== 'info') : []));

  ngOnInit() {
    const role = this.ui.userProfile()?.role;
    if (role && role !== 'admin') return;
    this.api.loadStatus().subscribe({ error: () => undefined });
  }

  link(a: KvkkStatus['alerts'][number]): Record<string, string> {
    if (a.code.startsWith('KVKK_TOTP')) return { tab: 'profile' };
    const sub = a.code.startsWith('KVKK_DSR') ? 'dsr' : a.code.startsWith('KVKK_BREACH') ? 'incidents' : a.code.startsWith('KVKK_DESTRUCTION') ? 'destruction' : a.code === 'KVKK_VERBIS_REQUIRED' ? 'inventory' : 'notices';
    return { tab: 'kvkk', kvkk: sub };
  }

  text(a: KvkkStatus['alerts'][number]): string {
    const p: Record<string, unknown> = { ...(a.params || {}) };
    if (p['date']) p['date'] = this.i18n.formatDate(String(p['date']), 'date');
    return this.i18n.t('kvkk.alert.' + a.code, p);
  }
}
