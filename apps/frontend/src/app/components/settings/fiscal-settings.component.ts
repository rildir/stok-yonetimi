import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { isValidKepAddress, isValidMersis } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { CompanyInfo, FiscalStatus } from '../../models/inventory.models';
import { I18nService, TranslatePipe } from '../../i18n';
import { AddressFieldsComponent, addressFromForm, addressToForm, createAddressGroup } from '../shared/address-fields.component';
import { IdentityFieldsComponent, taxIdValidator } from '../shared/identity-fields.component';

const optional = (test: (v: string) => boolean, key: string) => (c: AbstractControl): ValidationErrors | null =>
  c.value && String(c.value).trim() && !test(String(c.value).trim()) ? { [key]: true } : null;

/** Settings > Fiscal information (admin): legal identity printed on every legal document. */
@Component({
  selector: 'app-fiscal-settings',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, AddressFieldsComponent, IdentityFieldsComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .fiscal-form { display: flex; flex-direction: column; gap: var(--space-4); }
    .fiscal-status { margin: var(--space-4) 0; display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); border: var(--border-width) solid; }
    .fiscal-status.bad { background: var(--color-danger-subtle); border-color: var(--color-danger-border); color: var(--color-danger-text); }
    .fiscal-status.good { background: var(--color-success-subtle); border-color: var(--color-success-border); color: var(--color-success-text); }
    .fiscal-status ul { margin: var(--space-1) 0 0; padding-left: var(--space-5); }
    .fiscal-actions { display: flex; justify-content: flex-end; padding-top: var(--space-4); border-top: var(--border-width) solid var(--color-border-subtle); }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'settings.fiscal.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'settings.fiscal.subtitle' | t }}</p>

      @if (status(); as st) {
        @if (!st.complete) {
          <div class="fiscal-status bad" role="alert">
            <div>
              <strong>{{ 'settings.fiscal.incomplete' | t }}</strong>
              <ul>@for (f of st.missing; track f) { <li>{{ 'settings.fiscal.field.' + f | t }}</li> }</ul>
            </div>
          </div>
        } @else {
          <div class="fiscal-status good">{{ 'settings.fiscal.complete' | t }}@if (st.recommended.length) { · {{ 'settings.fiscal.recommended' | t }}: @for (f of st.recommended; track f; let last = $last) { {{ 'settings.fiscal.field.' + f | t }}@if (!last) {, } } }</div>
        }
      }

      <form class="fiscal-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="form-field">
          <input id="fLegalName" type="text" formControlName="legalName" class="form-input" maxlength="255" />
          <label for="fLegalName" class="form-label">{{ 'settings.fiscal.legalName' | t }}</label>
        </div>

        <app-identity-fields [form]="form" idPrefix="fis" [types]="['VKN', 'TCKN']" [provinceCode]="addressGroup.value.provinceCode"></app-identity-fields>

        <div class="form-field">
          <select id="fBook" formControlName="bookkeepingType" class="form-input has-value">
            <option value="">{{ 'settings.fiscal.bookkeeping.select' | t }}</option>
            @for (b of bookkeeping; track b) { <option [value]="b">{{ 'settings.fiscal.bookkeeping.' + b | t }}</option> }
          </select>
          <label for="fBook" class="form-label">{{ 'settings.fiscal.bookkeepingType' | t }}</label>
        </div>

        <div class="form-section-title">{{ 'settings.fiscal.registry' | t }}</div>
        <div class="form-row">
          <div class="form-field">
            <input id="fMersis" type="text" inputmode="numeric" maxlength="16" formControlName="mersisNo" class="form-input mono" />
            <label for="fMersis" class="form-label">{{ 'settings.fiscal.mersis' | t }}</label>
            @if (invalid('mersisNo')) { <div class="form-error">{{ 'settings.fiscal.mersisInvalid' | t }}</div> }
          </div>
          <div class="form-field">
            <input id="fTsn" type="text" formControlName="tradeRegistryNo" class="form-input mono" maxlength="50" />
            <label for="fTsn" class="form-label">{{ 'settings.fiscal.tradeRegistryNo' | t }}</label>
          </div>
        </div>
        <div class="form-field">
          <input id="fTso" type="text" formControlName="tradeRegistryOffice" class="form-input" maxlength="150" />
          <label for="fTso" class="form-label">{{ 'settings.fiscal.tradeRegistryOffice' | t }}</label>
        </div>

        <div class="form-section-title">{{ 'settings.fiscal.contact' | t }}</div>
        <div class="form-row">
          <div class="form-field">
            <input id="fKep" type="email" formControlName="kepAddress" class="form-input" [placeholder]="'settings.fiscal.kepPh' | t" />
            <label for="fKep" class="form-label">{{ 'settings.fiscal.kepAddress' | t }}</label>
            @if (invalid('kepAddress')) { <div class="form-error">{{ 'settings.fiscal.kepInvalid' | t }}</div> }
          </div>
          <div class="form-field">
            <input id="fEmail" type="email" formControlName="email" class="form-input" />
            <label for="fEmail" class="form-label">{{ 'settings.fiscal.email' | t }}</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <input id="fPhone" type="tel" formControlName="phone" class="form-input" />
            <label for="fPhone" class="form-label">{{ 'settings.fiscal.phone' | t }}</label>
          </div>
          <div class="form-field">
            <input id="fWeb" type="url" formControlName="website" class="form-input" placeholder="https://" />
            <label for="fWeb" class="form-label">{{ 'settings.fiscal.website' | t }}</label>
          </div>
        </div>

        <div class="form-section-title">{{ 'settings.fiscal.headOffice' | t }}</div>
        <app-address-fields [group]="addressGroup" idPrefix="fis"></app-address-fields>

        <div class="fiscal-actions">
          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || form.pristine || saving()">
            @if (saving()) { {{ 'settings.saving' | t }} } @else { {{ 'common.save' | t }} }
          </button>
        </div>
      </form>
    </div>
  `,
})
export class FiscalSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ComplianceService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  readonly bookkeeping = ['BILANCO', 'ISLETME', 'BASIT'];
  saving = signal(false);
  status = signal<FiscalStatus | null>(null);

  addressGroup: FormGroup = createAddressGroup(this.fb);
  form: FormGroup = this.fb.group(
    {
      legalName: ['', [Validators.maxLength(255)]],
      identityType: ['VKN'],
      identityNumber: [''],
      taxOfficeCode: [''],
      taxOfficeName: [''],
      bookkeepingType: [''],
      mersisNo: ['', [optional(isValidMersis, 'mersis')]],
      tradeRegistryNo: [''],
      tradeRegistryOffice: [''],
      kepAddress: ['', [optional(isValidKepAddress, 'kep')]],
      email: ['', [Validators.email]],
      phone: [''],
      website: [''],
      address: this.addressGroup,
    },
    // VKN for legal entities, TCKN for sole proprietors; the number may stay empty until known.
    { validators: (f: AbstractControl) => (f.value?.identityNumber ? taxIdValidator(() => null)(f) : null) },
  );

  ngOnInit() {
    this.api.getCompany().subscribe({ next: (c) => this.fill(c), error: () => undefined });
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  private fill(c: CompanyInfo) {
    this.status.set(c.fiscalStatus || null);
    this.form.reset({
      legalName: c.legalName || '',
      identityType: c.taxIdType || 'VKN',
      identityNumber: c.taxId || '',
      taxOfficeCode: c.taxOfficeCode || '',
      taxOfficeName: c.taxOfficeName || '',
      bookkeepingType: c.bookkeepingType || '',
      mersisNo: c.mersisNo || '',
      tradeRegistryNo: c.tradeRegistryNo || '',
      tradeRegistryOffice: c.tradeRegistryOffice || '',
      kepAddress: c.kepAddress || '',
      email: c.email || '',
      phone: c.phone || '',
      website: c.website || '',
      address: addressToForm(c.address, c.country || 'TR'),
    });
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.value;
    const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
    const payload: Partial<CompanyInfo> = {
      legalName: s(v.legalName),
      taxIdType: s(v.identityType),
      taxId: s(v.identityNumber),
      taxOfficeCode: s(v.taxOfficeCode),
      taxOfficeName: s(v.taxOfficeName),
      bookkeepingType: s(v.bookkeepingType),
      mersisNo: s(v.mersisNo),
      tradeRegistryNo: s(v.tradeRegistryNo),
      tradeRegistryOffice: s(v.tradeRegistryOffice),
      kepAddress: s(v.kepAddress),
      email: s(v.email),
      phone: s(v.phone),
      website: s(v.website),
      address: addressFromForm(v.address),
    };
    this.saving.set(true);
    this.api.updateFiscal(payload).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.fill(c);
        this.api.loadCompliance().subscribe({ error: () => undefined });
        this.ui.showToast(this.i18n.t('settings.fiscal.saved'), 'success');
      },
      error: (err) => {
        this.saving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('common.unknownError'), 'error');
      },
    });
  }
}
