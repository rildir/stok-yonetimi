import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COMPLIANCE_MODULES, CATEGORY_RULES } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { CompanyInfo } from '../../models/inventory.models';
import { I18nService, TranslatePipe, MoneyPipe } from '../../i18n';
import { QuantityInputDirective } from '../shared/quantity-input.directive';

/**
 * Settings > Compliance modules (admin): regulatory product categories the company
 * deals in (food lot traceability, İTS / ÜTS data model), the maker-checker
 * threshold for manual stock adjustments and the stock lock date (closed period).
 */
@Component({
  selector: 'app-inventory-compliance-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe, MoneyPipe, QuantityInputDirective],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .icm-list { list-style: none; margin: var(--space-4) 0; padding: 0; display: grid; gap: var(--space-2); }
    .icm-item { display: grid; grid-template-columns: auto 1fr; gap: var(--space-1) var(--space-3); align-items: start; padding: var(--space-3) var(--space-4); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); cursor: pointer; }
    .icm-item.on { border-color: var(--color-primary-border, var(--color-primary)); background: var(--color-primary-subtle); }
    .icm-item input { margin-top: 3px; }
    .icm-title { font-weight: var(--weight-semibold); font-size: var(--text-sm); }
    .icm-desc, .icm-basis { grid-column: 2; font-size: var(--text-xs); color: var(--color-text-muted); }
    .icm-section { margin-top: var(--space-6); padding-top: var(--space-4); border-top: var(--border-width) solid var(--color-border-subtle); }
    .icm-row { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
    .icm-row .form-field { flex: 0 1 260px; margin: 0; }
    .icm-actions { display: flex; justify-content: flex-end; padding-top: var(--space-4); margin-top: var(--space-4); border-top: var(--border-width) solid var(--color-border-subtle); }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'settings.complianceModules.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'settings.complianceModules.subtitle' | t }}</p>

      <ul class="icm-list">
        @for (m of modules; track m) {
          <li>
            <label class="icm-item" [class.on]="enabled().includes(m)">
              <input type="checkbox" [checked]="enabled().includes(m)" (change)="toggle(m)" />
              <span class="icm-title">{{ 'products.regulatory.' + m | t }}</span>
              <span class="icm-desc">{{ 'settings.complianceModules.desc.' + m | t }}</span>
              <span class="icm-basis">{{ rules[m].legalBasis }}</span>
            </label>
          </li>
        }
      </ul>
      <p class="field-hint">{{ 'settings.complianceModules.outOfScope' | t }}</p>

      <div class="icm-section">
        <h4 class="card-title">{{ 'settings.approval.title' | t }}</h4>
        <p class="card-subtitle settings-card-sub">{{ 'settings.approval.subtitle' | t }}</p>
        <div class="icm-row">
          <label class="icm-row"><input type="checkbox" [checked]="thresholdOn()" (change)="thresholdOn.set(!thresholdOn())" /> {{ 'settings.approval.enable' | t }}</label>
          @if (thresholdOn()) {
            <div class="form-field">
              <input id="icmThreshold" type="text" appQty [qtyDecimals]="2" class="form-input has-value" [ngModel]="threshold()" (ngModelChange)="threshold.set($event)" />
              <label for="icmThreshold" class="form-label">{{ 'settings.approval.threshold' | t: { currency: currency() } }}</label>
            </div>
            @if (threshold() !== null) { <span class="text-sm text-muted">{{ 'settings.approval.example' | t: { value: (threshold() | money: currency()) } }}</span> }
          }
        </div>
      </div>

      <div class="icm-section">
        <h4 class="card-title">{{ 'settings.stockLock.title' | t }}</h4>
        <p class="card-subtitle settings-card-sub">{{ 'settings.stockLock.subtitle' | t }}</p>
        <div class="icm-row">
          <div class="form-field">
            <input id="icmLockDate" type="date" class="form-input has-value" [max]="today" [ngModel]="lockDate()" (ngModelChange)="lockDate.set($event || '')" />
            <label for="icmLockDate" class="form-label">{{ 'settings.stockLock.date' | t }}</label>
          </div>
          @if (lockDate()) {
            <button type="button" class="btn btn-sm btn-secondary" (click)="lockDate.set('')">{{ 'settings.stockLock.clear' | t }}</button>
          }
        </div>
        <p class="field-hint">{{ 'settings.stockLock.hint' | t }}</p>
      </div>

      <div class="icm-actions">
        <button type="button" class="btn btn-primary" [disabled]="saving() || (thresholdOn() && (threshold() === null || threshold()! < 0))" (click)="save()">
          {{ (saving() ? 'settings.saving' : 'common.save') | t }}
        </button>
      </div>
    </div>
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
      })
      .subscribe({
        next: (c) => {
          this.saving.set(false);
          this.fill(c);
          this.ui.showToast(this.i18n.t('settings.complianceModules.saved'), 'success');
        },
        error: (err) => {
          this.saving.set(false);
          this.ui.showToast(err?.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error');
        },
      });
  }
}
