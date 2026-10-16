import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaxService } from '../../services/tax.service';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { TaxRate } from '../../models/inventory.models';
import { ExemptionCode, TaxCatalog, WithholdingCode } from '../../models/tax.models';
import { AppDatePipe, I18nService, NumberFormatPipe, TranslatePipe } from '../../i18n';
import { IconComponent } from '../shared/icon.component';

/**
 * Settings > Tax rates for TR companies: the rates come from the legal catalog and are
 * read-only (only the default can be chosen); the UBL-TR exemption / withholding code lists
 * (global, versioned) and the 627 seller exception are shown here.
 */
@Component({
  selector: 'app-tax-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe, NumberFormatPipe, AppDatePipe, IconComponent],
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
    .src { font-size: var(--text-xs); color: var(--fg-3); }
    .codes-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
    .code-list { max-height: 320px; overflow: auto; }
    .code-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; align-items: first baseline; min-height: 36px; padding: 9px 16px; box-shadow: inset 0 -1px 0 var(--line); font-size: var(--text-sm); line-height: 18px; }
    .code-row .ct { min-width: 0; }
    .code-row .kind { font-size: var(--text-xs); color: var(--fg-3); white-space: nowrap; }
    .code-row:last-child { box-shadow: none; }
    .code-row .mono { color: var(--fg-2); font-size: var(--text-xs); }
    .card-f .src { padding-block: 10px; }
    @media (max-width: 1100px) { .codes-grid { grid-template-columns: minmax(0, 1fr); } }
  `],
  template: `

    <div class="stack-20">
      <section class="card">
        <div class="card-h sh">
          <div class="hg"><h3>{{ 'settings.taxRates.title' | t }}</h3><p>{{ 'settings.taxRates.trSubtitle' | t }}</p></div>
          <span class="badge badge-info"><app-icon name="lock" size="xs" />{{ 'settings.taxRates.trLocked' | t }}</span>
        </div>
        <div class="table-scroll">
          <table class="tbl table-responsive">
            <thead>
              <tr>
                <th>{{ 'settings.taxRates.code' | t }}</th>
                <th>{{ 'settings.taxRates.name' | t }}</th>
                <th class="r">{{ 'finance.taxRate' | t }}</th>
                <th>{{ 'settings.taxRates.kind' | t }}</th>
                <th>{{ 'settings.taxRates.validity' | t }}</th>
                <th>{{ 'finance.defaultTax' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (tr of rates(); track tr.id) {
                <tr>
                  <td [attr.data-label]="'settings.taxRates.code' | t"><span class="mono">{{ tr.code || '—' }}</span><span class="cell-code">{{ tr.taxTypeCode || '0015' }}</span></td>
                  <td [attr.data-label]="'settings.taxRates.name' | t"><strong>{{ tr.name }}</strong></td>
                  <td class="r" [attr.data-label]="'finance.taxRate' | t">%{{ tr.rate | num }}</td>
                  <td [attr.data-label]="'settings.taxRates.kind' | t">
                    <span class="badge" [class.badge-warning]="tr.kind === 'EXEMPT'" [class.badge-neutral]="tr.kind !== 'EXEMPT'"><span class="dot"></span>{{ 'settings.taxRates.kindValue.' + (tr.kind || 'STANDARD') | t }}</span>
                  </td>
                  <td [attr.data-label]="'settings.taxRates.validity' | t">
                    @if (tr.validFrom) { {{ tr.validFrom | appDate }} – @if (tr.validTo) { {{ tr.validTo | appDate }} } @else { <span class="text-muted">{{ 'settings.taxRates.open' | t }}</span> } }
                    @else if (tr.validTo) { {{ 'settings.taxRates.until' | t: { date: (tr.validTo | appDate) } }} }
                    @else { <span class="text-muted">{{ 'settings.taxRates.always' | t }}</span> }
                  </td>
                  <td [attr.data-label]="'finance.defaultTax' | t">
                    @if (tr.isDefault) { <span class="badge badge-success"><span class="dot"></span>{{ 'finance.defaultTax' | t }}</span> }
                    @else if (tr.kind !== 'EXEMPT' && !tr.validTo) { <button type="button" class="btn btn-xs" (click)="setDefault(tr)">{{ 'settings.taxRates.setDefault' | t }}</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (catalog(); as c) { <div class="card-f"><app-icon name="info" size="sm" /><span class="src">{{ 'settings.taxRates.catalogSource' | t: { source: c.sourceRef || '' } }}</span></div> }
      </section>

      <section class="card">
        <div class="card-b">
          <label class="setting-row">
            <span class="t"><b>{{ 'settings.taxRates.importerOrOre' | t }}</b><span>{{ 'settings.taxRates.importerOrOreHint' | t }}</span></span>
            <span class="switch"><input type="checkbox" role="switch" [ngModel]="importerOrOre()" (ngModelChange)="saveImporter($event)" /><span class="track"></span></span>
          </label>
          <label class="setting-row">
            <span class="t"><b>{{ 'settings.taxRates.designatedBuyer' | t }}</b><span>{{ 'settings.taxRates.designatedBuyerHint' | t }}</span></span>
            <span class="switch"><input type="checkbox" role="switch" [ngModel]="designatedBuyer()" (ngModelChange)="saveDesignated($event)" /><span class="track"></span></span>
          </label>
        </div>
      </section>

      <div class="codes-grid">
        <section class="card">
          <div class="card-h"><h3>{{ 'settings.taxRates.withholdingCodes' | t }}</h3><span class="spacer"></span><span class="tag">{{ withholdings().length }}</span></div>
          <div class="code-list">
            @for (w of withholdings(); track w.code) {
              <div class="code-row">
                <span class="mono">{{ w.code }}</span>
                <span class="ct">{{ name(w) }}@if (w.requiresDesignatedBuyer) { <span class="src"> · {{ 'settings.taxRates.designatedOnly' | t }}</span> }</span>
                <span class="tag">{{ w.numerator | num }}/{{ w.denominator }}</span>
              </div>
            }
          </div>
        </section>
        <section class="card">
          <div class="card-h"><h3>{{ 'settings.taxRates.exemptionCodes' | t }}</h3><span class="spacer"></span><span class="tag">{{ exemptions().length }}</span></div>
          <div class="code-list">
            @for (e of exemptions(); track e.code) {
              <div class="code-row">
                <span class="mono">{{ e.code }}</span>
                <span class="ct">{{ name(e) }}@if (e.confidence !== 'high') { <span class="src" [attr.data-tip]="e.note || null"> · {{ 'settings.taxRates.unconfirmed' | t }}</span> }</span>
                @if (e.invoiceType && e.invoiceType !== 'ISTISNA') { <span class="kind">{{ 'orderDocs.invoiceType.' + e.invoiceType | t }}</span> } @else { <span></span> }
              </div>
            }
          </div>
          @if (exemptions()[0]; as e) { <div class="card-f"><span>{{ 'settings.taxRates.codeListVersion' | t: { version: e.codeListVersion } }}</span></div> }
        </section>
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
  imports: [FormsModule, TranslatePipe, IconComponent],
  styles: [`
    :host { display: block; }
    .card-h.sh { padding-block: 12px; min-height: 56px; align-items: flex-start; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .tcmb-ic { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--surface-sunken); color: var(--fg-2); box-shadow: inset 0 0 0 1px var(--line); }
    .tcmb-ctl { display: flex; flex-wrap: wrap; gap: 12px 8px; align-items: center; }
    .tcmb-ctl .field { width: 170px; }
    .tcmb-ctl .spacer { flex: 1; }
    @media (max-width: 640px) { .tcmb-ctl .field { flex: 1 1 140px; width: auto; } .tcmb-ctl .spacer { display: none; } .tcmb-ctl .switch { flex-basis: 100%; } }
  `],
  template: `

    <section class="card">
      <div class="card-h sh">
        <span class="tcmb-ic"><app-icon name="globe" /></span>
        <div class="hg"><h3>{{ 'settings.exchangeRates.tcmbTitle' | t }}</h3><p>{{ 'settings.exchangeRates.tcmbHint' | t }}</p></div>
      </div>
      <div class="card-b tcmb-ctl">
        <div class="field"><input type="date" [(ngModel)]="date" [attr.aria-label]="'settings.exchangeRates.date' | t" /></div>
        <button type="button" class="btn" [class.is-loading]="busy()" (click)="fetch()" [disabled]="busy()"><app-icon name="download" /><span>{{ 'settings.exchangeRates.tcmbFetch' | t }}</span></button>
        <span class="spacer"></span>
        <label class="switch"><input type="checkbox" role="switch" [ngModel]="auto()" (ngModelChange)="saveAuto($event)" /><span class="track"></span>{{ 'settings.exchangeRates.autoFetch' | t }}</label>
      </div>
    </section>
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
