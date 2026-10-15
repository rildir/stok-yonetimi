import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaxService } from '../../services/tax.service';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { TaxRate } from '../../models/inventory.models';
import { ExemptionCode, TaxCatalog, WithholdingCode } from '../../models/tax.models';
import { AppDatePipe, I18nService, NumberFormatPipe, TranslatePipe } from '../../i18n';

/**
 * Settings > Tax rates for TR companies: the rates come from the legal catalog and are
 * read-only (only the default can be chosen); the UBL-TR exemption / withholding code lists
 * (global, versioned) and the 627 seller exception are shown here.
 */
@Component({
  selector: 'app-tax-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe, NumberFormatPipe, AppDatePipe],
  styles: [`
    .tr-head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-3); }
    .src { font-size: var(--text-xs); color: var(--color-text-muted); }
    .codes { margin-top: var(--space-5); }
    .codes h4 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--color-text); }
    .code-list { max-height: 260px; overflow: auto; border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); }
    .code-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-bottom: var(--border-width) solid var(--color-border-subtle); font-size: var(--text-sm); align-items: center; }
    .code-row:last-child { border-bottom: 0; }
    .check { display: flex; gap: var(--space-2); align-items: flex-start; margin-top: var(--space-4); font-size: var(--text-sm); }
    .check input { margin-top: 3px; }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'settings.taxRates.title' | t }}</h3>
      <div class="tr-head">
        <span class="badge badge-info">{{ 'settings.taxRates.trLocked' | t }}</span>
        @if (catalog(); as c) { <span class="src">{{ 'settings.taxRates.catalogSource' | t: { source: c.sourceRef || '' } }}</span> }
      </div>
      <p class="card-subtitle settings-card-sub">{{ 'settings.taxRates.trSubtitle' | t }}</p>

      <div class="table-scroll settings-table">
        <table class="table-responsive">
          <thead>
            <tr>
              <th>{{ 'settings.taxRates.code' | t }}</th>
              <th>{{ 'settings.taxRates.name' | t }}</th>
              <th class="num">{{ 'finance.taxRate' | t }}</th>
              <th>{{ 'settings.taxRates.kind' | t }}</th>
              <th>{{ 'settings.taxRates.validity' | t }}</th>
              <th>{{ 'finance.defaultTax' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (tr of rates(); track tr.id) {
              <tr>
                <td class="mono" [attr.data-label]="'settings.taxRates.code' | t">{{ tr.code || '-' }} <span class="text-muted">· {{ tr.taxTypeCode || '0015' }}</span></td>
                <td [attr.data-label]="'settings.taxRates.name' | t"><strong>{{ tr.name }}</strong></td>
                <td class="num" [attr.data-label]="'finance.taxRate' | t">%{{ tr.rate | num }}</td>
                <td [attr.data-label]="'settings.taxRates.kind' | t">
                  <span class="badge" [class.badge-warning]="tr.kind === 'EXEMPT'" [class.badge-neutral]="tr.kind !== 'EXEMPT'">{{ 'settings.taxRates.kindValue.' + (tr.kind || 'STANDARD') | t }}</span>
                </td>
                <td [attr.data-label]="'settings.taxRates.validity' | t">
                  {{ tr.validFrom ? (tr.validFrom | appDate) : '…' }} – {{ tr.validTo ? (tr.validTo | appDate) : ('settings.taxRates.open' | t) }}
                </td>
                <td [attr.data-label]="'finance.defaultTax' | t">
                  @if (tr.isDefault) { <span class="badge badge-instock">{{ 'finance.defaultTax' | t }}</span> }
                  @else if (tr.kind !== 'EXEMPT' && !tr.validTo) { <button type="button" class="btn btn-secondary btn-sm" (click)="setDefault(tr)">{{ 'settings.taxRates.setDefault' | t }}</button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <label class="check">
        <input type="checkbox" [ngModel]="importerOrOre()" (ngModelChange)="saveImporter($event)" />
        <span>{{ 'settings.taxRates.importerOrOre' | t }}<br /><span class="src">{{ 'settings.taxRates.importerOrOreHint' | t }}</span></span>
      </label>
      <label class="check">
        <input type="checkbox" [ngModel]="designatedBuyer()" (ngModelChange)="saveDesignated($event)" />
        <span>{{ 'settings.taxRates.designatedBuyer' | t }}<br /><span class="src">{{ 'settings.taxRates.designatedBuyerHint' | t }}</span></span>
      </label>

      <div class="codes">
        <h4>{{ 'settings.taxRates.withholdingCodes' | t }}</h4>
        <div class="code-list">
          @for (w of withholdings(); track w.code) {
            <div class="code-row">
              <span class="mono">{{ w.code }}</span>
              <span>{{ name(w) }}@if (w.requiresDesignatedBuyer) { <span class="src"> · {{ 'settings.taxRates.designatedOnly' | t }}</span> }</span>
              <span class="badge badge-neutral">{{ w.numerator | num }}/{{ w.denominator }}</span>
            </div>
          }
        </div>
        <h4 class="codes">{{ 'settings.taxRates.exemptionCodes' | t }}</h4>
        <div class="code-list">
          @for (e of exemptions(); track e.code) {
            <div class="code-row">
              <span class="mono">{{ e.code }}</span>
              <span>{{ name(e) }}@if (e.confidence !== 'high') { <span class="src" [title]="e.note || ''"> · {{ 'settings.taxRates.unconfirmed' | t }}</span> }</span>
              <span class="badge badge-neutral">{{ e.invoiceType }}</span>
            </div>
          }
        </div>
        @if (exemptions()[0]; as e) { <p class="src">{{ 'settings.taxRates.codeListVersion' | t: { version: e.codeListVersion } }}</p> }
      </div>
    </div>
  `,
})
export class TaxSettingsComponent implements OnInit {
  private tax = inject(TaxService);
  private inventory = inject(InventoryService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);
  @Input() importerInitial = false;
  @Input() designatedInitial = false;
  @Output() changed = new EventEmitter<void>();

  rates = signal<TaxRate[]>([]);
  catalog = signal<TaxCatalog | null>(null);
  exemptions = signal<ExemptionCode[]>([]);
  withholdings = signal<WithholdingCode[]>([]);
  importerOrOre = signal(false);
  designatedBuyer = signal(false);

  ngOnInit() {
    this.importerOrOre.set(this.importerInitial);
    this.designatedBuyer.set(this.designatedInitial);
    this.load();
    this.tax.catalog().subscribe({ next: (c) => this.catalog.set(c), error: () => {} });
    this.tax.exemptions().subscribe({ next: (e) => this.exemptions.set(e), error: () => {} });
    this.tax.withholdings().subscribe({ next: (w) => this.withholdings.set(w), error: () => {} });
  }

  load() {
    this.inventory.getTaxRates().subscribe({ next: (r) => this.rates.set(r), error: () => {} });
  }

  name(c: { nameTr: string; nameEn: string }) {
    return this.i18n.lang() === 'en' ? c.nameEn : c.nameTr;
  }

  setDefault(tr: TaxRate) {
    this.inventory.updateTaxRate(tr.id, { isDefault: true }).subscribe({
      next: () => { this.ui.showToast(this.i18n.t('settings.taxRates.defaultSet'), 'success'); this.load(); this.changed.emit(); },
      error: (err) => this.ui.showToast(err.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error'),
    });
  }

  saveImporter(v: boolean) {
    this.importerOrOre.set(v);
    this.tax.updateCompanyTaxSettings({ isImporterOrOreProducer: v }).subscribe({
      next: () => this.ui.showToast(this.i18n.t('settings.toast.companySaved'), 'success'),
      error: (err) => { this.importerOrOre.set(!v); this.ui.showToast(err.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error'); },
    });
  }

  saveDesignated(v: boolean) {
    this.designatedBuyer.set(v);
    this.tax.updateCompanyTaxSettings({ isDesignatedBuyer: v }).subscribe({
      next: () => this.ui.showToast(this.i18n.t('settings.toast.companySaved'), 'success'),
      error: (err) => { this.designatedBuyer.set(!v); this.ui.showToast(err.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error'); },
    });
  }
}

/** Exchange rates: TCMB fetch, automatic fetching switch. */
@Component({
  selector: 'app-tcmb-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  styles: [`
    .tcmb { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); border: var(--border-width) solid var(--color-info-border); background: var(--color-info-subtle); border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--color-text-secondary); }
    .tcmb input[type=date] { height: 34px; width: 170px; flex: 0 0 auto; }
    .grow { flex: 1 1 240px; }
    .check { display: flex; gap: var(--space-2); align-items: center; }
  `],
  template: `
    <div class="tcmb">
      <div class="grow">
        <strong>{{ 'settings.exchangeRates.tcmbTitle' | t }}</strong><br />
        <span>{{ 'settings.exchangeRates.tcmbHint' | t }}</span>
      </div>
      <input type="date" class="form-input" [(ngModel)]="date" [attr.aria-label]="'settings.exchangeRates.date' | t" />
      <button type="button" class="btn btn-primary btn-sm" (click)="fetch()" [disabled]="busy()">
        @if (busy()) { <span class="spinner-sm spinner-light"></span> } {{ 'settings.exchangeRates.tcmbFetch' | t }}
      </button>
      <label class="check"><input type="checkbox" [ngModel]="auto()" (ngModelChange)="saveAuto($event)" /> {{ 'settings.exchangeRates.autoFetch' | t }}</label>
    </div>
  `,
})
export class TcmbPanelComponent implements OnInit {
  private tax = inject(TaxService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);
  @Input() autoInitial = false;
  @Output() fetched = new EventEmitter<void>();
  date = '';
  busy = signal(false);
  auto = signal(false);

  ngOnInit() {
    this.auto.set(this.autoInitial);
  }

  fetch() {
    this.busy.set(true);
    this.tax.fetchTcmb(this.date || undefined).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('settings.exchangeRates.tcmbFetched', { no: r.bulletinNo || '', date: r.date, count: r.count }), 'success');
        this.fetched.emit();
      },
      error: (err) => { this.busy.set(false); this.ui.showToast(err.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error'); },
    });
  }

  saveAuto(v: boolean) {
    this.auto.set(v);
    this.tax.updateCompanyTaxSettings({ fxAutoFetch: v }).subscribe({
      next: () => this.ui.showToast(this.i18n.t('settings.toast.companySaved'), 'success'),
      error: (err) => { this.auto.set(!v); this.ui.showToast(err.error?.message || this.i18n.t('settings.toast.saveFailed'), 'error'); },
    });
  }
}
