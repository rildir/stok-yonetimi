import { Component, HostBinding, Input, OnInit, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { ComplianceAlert } from '../../models/inventory.models';
import { I18nService, TranslatePipe } from '../../i18n';

/**
 * Compliance banners (GET /company/compliance): missing fiscal information (red),
 * e-Belge start dates (overdue red / upcoming amber), missing yearly legal
 * parameters (amber, admins only). Used on the dashboard and in settings.
 */
@Component({
  selector: 'app-compliance-banners',
  standalone: true,
  imports: [RouterModule, TranslatePipe],
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--space-2); }
    :host:empty { display: none; }
    :host(.as-list) { gap: 0; }
  `],
  template: `
    @for (a of visible(); track $index) {
      @if (variant === 'list') {
        <div class="notice-row" [class.is-danger]="a.severity === 'error'" [class.is-info]="a.severity === 'info'" [attr.role]="a.severity === 'error' ? 'alert' : null">
          <span class="dot" aria-hidden="true"></span>
          <div class="t">
            {{ text(a) }}
            @if (isAdmin() && link(a); as l) { <br /><a [routerLink]="['/settings']" [queryParams]="{ tab: l }">{{ 'compliance.fix' | t }} →</a> }
          </div>
        </div>
      } @else {
        <div class="alert-banner" [class.alert-banner--danger]="a.severity === 'error'" [class.alert-banner--warning]="a.severity === 'warning'" [class.alert-banner--info]="a.severity === 'info'" [attr.role]="a.severity === 'error' ? 'alert' : 'status'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            @if (a.severity === 'info') { <circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/> }
            @else { <path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/> }
          </svg>
          <span class="alert-banner-text">{{ text(a) }}</span>
          @if (isAdmin() && link(a); as l) { <a [routerLink]="['/settings']" [queryParams]="{ tab: l }">{{ 'compliance.fix' | t }} →</a> }
        </div>
      }
    }
  `,
})
export class ComplianceBannersComponent implements OnInit {
  /** Settings view shows info-level notices too. */
  @Input() showAll = false;
  /** 'banner' = inline notices; 'list' = compact rows for the topbar notice popover. */
  @Input() variant: 'banner' | 'list' = 'banner';
  @HostBinding('class.as-list') get asList() { return this.variant === 'list'; }

  private api = inject(ComplianceService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  isAdmin = computed(() => this.ui.userProfile()?.role === 'admin');
  visible = computed(() => (this.api.report()?.alerts || []).filter((a) => this.showAll || a.severity !== 'info'));

  ngOnInit() {
    this.api.loadCompliance().subscribe({ error: () => undefined });
  }

  link(a: ComplianceAlert): string | null {
    if (a.code === 'FISCAL_INFO_MISSING' || a.code === 'BOOKKEEPING_TYPE_MISSING') return 'fiscal';
    if (a.code.startsWith('EBELGE_') || a.code === 'GROSS_SALES_MISSING') return 'ebelge';
    if (a.code === 'LEGAL_PARAMETER_MISSING' && this.ui.userProfile()?.isSuperAdmin) return 'legalParams';
    return null;
  }

  text(a: ComplianceAlert): string {
    const p: Record<string, unknown> = { ...(a.params || {}) };
    if (p['kind']) p['kind'] = this.i18n.t('settings.ebelge.kind.' + p['kind']);
    if (p['date']) p['date'] = this.i18n.formatDate(String(p['date']), 'date');
    if (p['fields']) {
      p['fields'] = String(p['fields'])
        .split(',')
        .map((f) => this.i18n.t('settings.fiscal.field.' + f.trim()))
        .join(', ');
    }
    return this.i18n.t('compliance.alert.' + a.code, p);
  }
}
