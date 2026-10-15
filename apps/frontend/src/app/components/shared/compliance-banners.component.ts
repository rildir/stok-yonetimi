import { Component, Input, OnInit, computed, inject } from '@angular/core';
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
    .alert-banner a { color: inherit; font-weight: var(--weight-semibold); white-space: nowrap; }
    .alert-banner-text { flex: 1; min-width: 0; }
  `],
  template: `
    @for (a of visible(); track $index) {
      <div class="alert-banner" [class.alert-banner--danger]="a.severity === 'error'" [class.alert-banner--warning]="a.severity === 'warning'" [class.alert-banner--info]="a.severity === 'info'" [attr.role]="a.severity === 'error' ? 'alert' : 'status'">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          @if (a.severity === 'info') { <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/> }
          @else { <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/> }
        </svg>
        <span class="alert-banner-text">{{ text(a) }}</span>
        @if (isAdmin() && link(a); as l) { <a [routerLink]="['/settings']" [queryParams]="{ tab: l }">{{ 'compliance.fix' | t }} →</a> }
      </div>
    }
  `,
})
export class ComplianceBannersComponent implements OnInit {
  /** Settings view shows info-level notices too. */
  @Input() showAll = false;

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
