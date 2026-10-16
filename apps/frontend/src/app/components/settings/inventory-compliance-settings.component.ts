import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COMPLIANCE_MODULES, CATEGORY_RULES } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { CompanyInfo } from '../../models/inventory.models';
import { I18nService, TranslatePipe } from '../../i18n';
import { parseLocalizedQuantity } from '../shared/quantity-input.directive';
import { IconComponent } from '../shared/icon.component';

/**
 * Settings > Compliance modules (admin): regulatory product categories the company
 * deals in (food lot traceability, İTS / ÜTS data model), the maker-checker
 * threshold for manual stock adjustments and the stock lock date (closed period).
 */
@Component({
  selector: 'app-inventory-compliance-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe, IconComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    :host { display: block; }
    .card-h.sh { padding-block: 12px; min-height: 56px; flex-wrap: wrap; row-gap: 8px; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .form-stack { display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .inline-form { display: flex; flex-direction: column; gap: 14px; box-shadow: inset 0 -1px 0 var(--line); }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 14px; align-items: start; }
    .stack-20 { display: flex; flex-direction: column; gap: 20px; }
    @media (max-width: 1100px) { .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .grid-4 { grid-template-columns: minmax(0, 1fr); } }
    .card { max-width: 960px; }
    .card-b { padding-top: 0; padding-bottom: 0; }
    .icm-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .choice-card { align-items: flex-start; height: 100%; }
    .choice-card input { margin-top: 2px; flex: none; }
    .icm-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .icm-t b { font-weight: 500; }
    .icm-t span { font-size: var(--text-xs); color: var(--fg-3); }
    .icm-t .icm-basis { display: flex; gap: 6px; align-items: flex-start; margin-top: 6px; padding-top: 6px; box-shadow: inset 0 1px 0 var(--line); font-size: var(--text-xs); line-height: 16px; color: var(--fg-2); }
    .icm-t .icm-basis app-icon { flex: none; margin-top: 2px; color: var(--fg-3); }
    .icm-row { display: flex; gap: 8px 16px; align-items: flex-end; flex-wrap: wrap; }
    .icm-row .fld { width: 240px; }
    .icm-row .fld-help { margin: 0; }
    @media (max-width: 640px) { .icm-list { grid-template-columns: minmax(0, 1fr); } .icm-row .fld { width: 100%; } }
  `],
  template: `

    <section class="card">
      <div class="card-h sh">
        <div class="hg"><h3>{{ 'settings.complianceModules.title' | t }}</h3><p>{{ 'settings.complianceModules.subtitle' | t }}</p></div>
      </div>
      <div class="card-b">
        <section class="fsec">
          <ul class="icm-list">
            @for (m of modules; track m) {
              <li>
                <label class="choice-card">
                  <input type="checkbox" [checked]="enabled().includes(m)" (change)="toggle(m)" />
                  <span class="icm-t">
                    <b>{{ 'products.regulatory.' + m | t }}</b>
                    <span>{{ 'settings.complianceModules.desc.' + m | t }}</span>
                    <span class="icm-basis"><app-icon name="file" size="xs" />{{ rules[m].legalBasis }}</span>
                  </span>
                </label>
              </li>
            }
          </ul>
          <p class="fld-help">{{ 'settings.complianceModules.outOfScope' | t }}</p>
        </section>

        <section class="fsec">
          <div class="fsec-h"><h3>{{ 'settings.approval.title' | t }}</h3><p>{{ 'settings.approval.subtitle' | t }}</p></div>
          <label class="setting-row">
            <span class="t"><b>{{ 'settings.approval.enable' | t }}</b></span>
            <span class="switch"><input type="checkbox" role="switch" [checked]="thresholdOn()" (change)="thresholdOn.set(!thresholdOn())" /><span class="track"></span></span>
          </label>
          @if (thresholdOn()) {
            <div class="icm-row">
              <div class="fld">
                <label class="fld-label" for="icmThreshold">{{ 'settings.approval.threshold' | t: { currency: currency() } }}</label>
                <div class="field" [class.is-error]="thresholdInvalid()"><input id="icmThreshold" type="text" inputmode="decimal" autocomplete="off" class="num" [value]="thresholdText()" (focus)="thresholdFocus(true)" (blur)="thresholdFocus(false)" (input)="onThreshold($any($event.target).value)" [attr.aria-invalid]="thresholdInvalid()" aria-describedby="icmThresholdHelp" /><span class="affix suf">{{ currency() }}</span></div>
                <span class="fld-help" id="icmThresholdHelp">{{ 'settings.approval.thresholdHelp' | t }}</span>
              </div>
            </div>
          }
        </section>

        <section class="fsec">
          <div class="fsec-h"><h3>{{ 'settings.stockLock.title' | t }}</h3><p>{{ 'settings.stockLock.subtitle' | t }}</p></div>
          <div class="icm-row">
            <div class="fld">
              <label class="fld-label" for="icmLockDate">{{ 'settings.stockLock.date' | t }}</label>
              <div class="field"><span class="lead"><app-icon name="lock" size="sm" /></span><input id="icmLockDate" type="date" [max]="today" [ngModel]="lockDate()" (ngModelChange)="lockDate.set($event || '')" /></div>
            </div>
            @if (lockDate()) {
              <button type="button" class="btn" (click)="lockDate.set('')"><app-icon name="x" />{{ 'settings.stockLock.clear' | t }}</button>
            }
          </div>
          <p class="fld-help">{{ 'settings.stockLock.hint' | t }}</p>
        </section>

        @if (loosening()) {
          <section class="fsec">
            <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'settings.controlChange.hint' | t }}</span></div>
            <div class="fld">
              <label class="fld-label" for="icmReason">{{ 'settings.controlChange.reason' | t }} <span class="req">*</span></label>
              <div class="field has-area"><textarea id="icmReason" rows="2" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea><span class="counter">{{ reason().length }} / 500</span></div>
            </div>
          </section>
        }
      </div>
      <div class="card-f">
        <span class="spacer"></span>
        <button type="button" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving() || (thresholdOn() && thresholdInvalid()) || (loosening() && !reason().trim())" (click)="save()">
          <span>{{ 'common.save' | t }}</span>
        </button>
      </div>
    </section>
  `,
})
export class InventoryComplianceSettingsComponent implements OnInit {
  private api = inject(ComplianceService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  readonly modules = COMPLIANCE_MODULES;
  readonly rules = CATEGORY_RULES;
  enabled = signal<string[]>([]);
  thresholdOn = signal(false);
  threshold = signal<number | null>(null);
  currency = signal('TRY');
  saving = signal(false);
  lockDate = signal('');
  reason = signal('');
  /** Saved values: loosening them (lock date back / cleared, threshold up / off) needs a reason and a second admin */
  private saved = signal<{ lockDate: string; threshold: number | null }>({ lockDate: '', threshold: null });
  loosening = computed(() => {
    const s = this.saved();
    const lockBack = !!s.lockDate && (!this.lockDate() || this.lockDate() < s.lockDate);
    const next = this.thresholdOn() ? Number(this.threshold()) : null;
    const thresholdUp = s.threshold !== null && (next === null || next > s.threshold);
    return lockBack || thresholdUp;
  });
  /** Threshold input: grouped money format at rest, plain digits while editing */
  private thresholdEditing = signal(false);
  private thresholdRaw = signal('');
  thresholdInvalid = computed(() => {
    const t = this.threshold();
    return t === null || Number.isNaN(t) || t < 0 || Math.round(t * 100) !== t * 100;
  });
  thresholdText = computed(() => {
    const t = this.threshold();
    if (this.thresholdEditing()) return this.thresholdRaw();
    if (t === null || Number.isNaN(t)) return this.thresholdRaw();
    return this.i18n.formatNumber(t, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  thresholdFocus(on: boolean) {
    const t = this.threshold();
    if (on && t !== null && !Number.isNaN(t)) this.thresholdRaw.set(new Intl.NumberFormat(this.i18n.locale(), { useGrouping: false, maximumFractionDigits: 2 }).format(t));
    this.thresholdEditing.set(on);
  }

  onThreshold(text: string) {
    this.thresholdRaw.set(text);
    const sep = (1.5).toLocaleString(this.i18n.locale()).includes(',') ? ',' : '.';
    this.threshold.set(text.trim() === '' ? null : parseLocalizedQuantity(text, sep));
  }

  readonly today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  ngOnInit() {
    this.api.getCompany().subscribe({ next: (c) => this.fill(c), error: () => undefined });
  }

  private fill(c: CompanyInfo) {
    this.enabled.set(c.enabledComplianceModules || []);
    this.currency.set(c.baseCurrency || 'TRY');
    const t = c.adjustmentApprovalThreshold;
    this.thresholdOn.set(t !== null && t !== undefined);
    this.threshold.set(t ?? null);
    this.lockDate.set(c.stockLockDate || '');
    this.saved.set({ lockDate: c.stockLockDate || '', threshold: t ?? null });
    this.reason.set('');
  }

  toggle(m: string) {
    const cur = this.enabled();
    this.enabled.set(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
  }

  save() {
    this.saving.set(true);
    this.api
      .updateCompany({
        enabledComplianceModules: this.enabled(),
        adjustmentApprovalThreshold: this.thresholdOn() ? Number(this.threshold()) : null,
        stockLockDate: this.lockDate() || null,
        ...(this.loosening() ? { controlChangeReason: this.reason().trim() } : {}),
      })
      .subscribe({
        next: (c) => {
          this.saving.set(false);
          this.fill(c);
          if (c.pendingApproval) this.ui.showToast(this.i18n.t('settings.controlChange.pending'), 'info');
          else this.ui.showToast(this.i18n.t('settings.complianceModules.saved'), 'success');
        },
        error: (err) => {
          this.saving.set(false);
          this.ui.showToast(err?.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error');
        },
      });
  }
}
