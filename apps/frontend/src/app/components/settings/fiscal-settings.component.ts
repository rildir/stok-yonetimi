import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { isValidKepAddress, isValidMersis } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { CompanyInfo, FiscalStatus } from '../../models/inventory.models';
import { I18nService, TranslatePipe } from '../../i18n';
import { AddressFieldsComponent, addressFromForm, addressToForm, createAddressGroup } from '../shared/address-fields.component';
import { IdentityFieldsComponent, taxIdValidator } from '../shared/identity-fields.component';
import { IconComponent } from '../shared/icon.component';

const optional = (test: (v: string) => boolean, key: string) => (c: AbstractControl): ValidationErrors | null =>
  c.value && String(c.value).trim() && !test(String(c.value).trim()) ? { [key]: true } : null;

/** Settings > Fiscal information (admin): legal identity printed on every legal document. */
@Component({
  selector: 'app-fiscal-settings',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, AddressFieldsComponent, IdentityFieldsComponent, IconComponent],
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
    .fsec:first-child { padding-top: 16px; }
    .fis-alert { align-items: flex-start; }
    .fis-alert > app-icon { display: inline-flex; margin-top: 1px; }
    .status-list { margin: 4px 0 0; padding-left: 18px; }
    .status-list li { line-height: 1.6; }
    /* shared identity/address pickers use legacy select.form-input, which misses the mobile 16px input size: one size per row */
    @media (max-width: 640px) { :host ::ng-deep :is(app-identity-fields, app-address-fields) select.form-input { font-size: 16px; } }
  `],
  template: `

    <section class="card">
      <div class="card-h sh">
        <div class="hg"><h3>{{ 'settings.fiscal.title' | t }}</h3><p>{{ 'settings.fiscal.subtitle' | t }}</p></div>
        @if (status(); as st) {
          @if (st.complete) { <span class="badge badge-success"><span class="dot"></span>{{ 'settings.fiscal.statusComplete' | t }}</span> }
          @else { <span class="badge badge-danger"><span class="dot"></span>{{ 'settings.fiscal.statusIncomplete' | t }}</span> }
        }
      </div>

      <form [formGroup]="form" (ngSubmit)="save()">
        <div class="card-b">
          @if (status(); as st) {
            @if (!st.complete) {
              <div class="fsec">
                <div class="notice notice-danger fis-alert" role="alert">
                  <app-icon name="alert" />
                  <div class="t">
                    <strong>{{ 'settings.fiscal.incomplete' | t }}</strong>
                    <ul class="status-list">@for (f of st.missing; track f) { <li>{{ 'settings.fiscal.field.' + f | t }}</li> }</ul>
                  </div>
                </div>
              </div>
            } @else if (st.recommended.length) {
              <div class="fsec">
                <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'settings.fiscal.recommended' | t }}: @for (f of st.recommended; track f; let last = $last) { {{ 'settings.fiscal.field.' + f | t }}@if (!last) {, } }</span></div>
              </div>
            }
          }

          <section class="fsec">
            <div class="fsec-h"><span class="n">1</span><h3>{{ 'settings.fiscal.identitySection' | t }}</h3></div>
            <div class="fld">
              <label class="fld-label" for="fLegalName">{{ 'settings.fiscal.legalName' | t }}</label>
              <div class="field"><input id="fLegalName" type="text" formControlName="legalName" maxlength="255" /></div>
            </div>
            <app-identity-fields [form]="form" idPrefix="fis" [types]="['VKN', 'TCKN']" [provinceCode]="addressGroup.value.provinceCode"></app-identity-fields>
            <div class="fld">
              <label class="fld-label" for="fBook">{{ 'settings.fiscal.bookkeepingType' | t }}</label>
              <div class="field select"><select id="fBook" formControlName="bookkeepingType">
                <option value="">{{ 'settings.fiscal.bookkeeping.select' | t }}</option>
                @for (b of bookkeeping; track b) { <option [value]="b">{{ 'settings.fiscal.bookkeeping.' + b | t }}</option> }
              </select></div>
            </div>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">2</span><h3>{{ 'settings.fiscal.registry' | t }}</h3></div>
            <div class="grid-2">
              <div class="fld">
                <label class="fld-label" for="fMersis">{{ 'settings.fiscal.mersis' | t }}</label>
                <div class="field" [class.is-error]="invalid('mersisNo')"><input id="fMersis" type="text" inputmode="numeric" maxlength="16" formControlName="mersisNo" class="mono" /></div>
                @if (invalid('mersisNo')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.fiscal.mersisInvalid' | t }}</div> }
              </div>
              <div class="fld">
                <label class="fld-label" for="fTsn">{{ 'settings.fiscal.tradeRegistryNo' | t }}</label>
                <div class="field"><input id="fTsn" type="text" formControlName="tradeRegistryNo" class="mono" maxlength="50" /></div>
              </div>
              <div class="fld span-all">
                <label class="fld-label" for="fTso">{{ 'settings.fiscal.tradeRegistryOffice' | t }}</label>
                <div class="field"><input id="fTso" type="text" formControlName="tradeRegistryOffice" maxlength="150" /></div>
              </div>
            </div>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">3</span><h3>{{ 'settings.fiscal.contact' | t }}</h3></div>
            <div class="grid-2">
              <div class="fld">
                <label class="fld-label" for="fKep">{{ 'settings.fiscal.kepAddress' | t }}</label>
                <div class="field" [class.is-error]="invalid('kepAddress')"><input id="fKep" type="email" formControlName="kepAddress" [placeholder]="'settings.fiscal.kepPh' | t" /></div>
                @if (invalid('kepAddress')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.fiscal.kepInvalid' | t }}</div> }
              </div>
              <div class="fld">
                <label class="fld-label" for="fEmail">{{ 'settings.fiscal.email' | t }}</label>
                <div class="field"><input id="fEmail" type="email" formControlName="email" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="fPhone">{{ 'settings.fiscal.phone' | t }}</label>
                <div class="field"><input id="fPhone" type="tel" formControlName="phone" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="fWeb">{{ 'settings.fiscal.website' | t }}</label>
                <div class="field"><span class="lead"><app-icon name="globe" size="sm" /></span><input id="fWeb" type="url" formControlName="website" placeholder="https://" /></div>
              </div>
            </div>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">4</span><h3>{{ 'settings.fiscal.headOffice' | t }}</h3></div>
            <app-address-fields [group]="addressGroup" idPrefix="fis"></app-address-fields>
          </section>
        </div>

        <div class="card-f">
          <span class="spacer"></span>
          <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="form.invalid || form.pristine || saving()">
            <span>{{ 'common.save' | t }}</span>
          </button>
        </div>
      </form>
    </section>
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
