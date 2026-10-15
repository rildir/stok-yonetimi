import { Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { validateTaxId, isMaskedValue } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { Province, TaxOffice } from '../../models/inventory.models';
import { TranslatePipe } from '../../i18n';

/** Identity error code -> i18n key. */
export const IDENTITY_ERROR_KEYS: Record<string, string> = {
  INVALID_VKN: 'customers.validation.invalidVkn',
  INVALID_TCKN: 'customers.validation.invalidTckn',
  TAX_ID_REQUIRED_FOR_COMPANY: 'customers.validation.taxIdRequired',
  IDENTITY_NUMBER_NOT_ALLOWED: 'customers.validation.numberNotAllowed',
  INVALID_IDENTITY_TYPE: 'customers.validation.invalidType',
};

/**
 * Form-level validator: checks identityNumber against identityType with the
 * same pure function the backend uses (VKN / TCKN / YKN checksums).
 * `partyType(form)` returns 'company' when a tax id is mandatory.
 */
export function taxIdValidator(partyType: (form: AbstractControl) => string | null): ValidatorFn {
  return (form: AbstractControl): ValidationErrors | null => {
    const v = form.value || {};
    // WP7: a masked identity number (*******1234) is the stored value, not an input to validate.
    if (isMaskedValue(v.identityNumber)) return null;
    const code = validateTaxId({ identityType: v.identityType || null, identityNumber: (v.identityNumber || '').replace(/\s+/g, '') || null, partyType: partyType(form) });
    return code ? { taxId: code } : null;
  };
}

/**
 * Identity type selector, number with instant checksum feedback and a tax office
 * picker filtered by province. Works on a parent form that owns the controls
 * identityType, identityNumber, taxOfficeCode, taxOfficeName.
 */
@Component({
  selector: 'app-identity-fields',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--space-4); }
    .office-filter { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: var(--space-2); order: 2; }
    .ok-hint { order: 3; font-size: var(--text-xs); color: var(--color-success-text); }
  `],
  template: `
    <ng-container [formGroup]="form">
      <div class="form-row">
        <div class="form-field">
          <select [id]="idPrefix + 'IdType'" formControlName="identityType" class="form-input has-value">
            @for (t of types; track t) { <option [value]="t">{{ 'customers.identityType.' + t | t }}</option> }
          </select>
          <label [for]="idPrefix + 'IdType'" class="form-label">{{ 'customers.form.identityType' | t }}</label>
        </div>
        @if (showNumber()) {
          <div class="form-field">
            <input [id]="idPrefix + 'IdNo'" type="text" formControlName="identityNumber" class="form-input mono" [attr.inputmode]="isNumeric() ? 'numeric' : null" [attr.maxlength]="maxLen()" [class.ng-invalid]="!!error()" [class.ng-touched]="!!error()" />
            <label [for]="idPrefix + 'IdNo'" class="form-label">{{ ('customers.form.identityNumber.' + typeValue()) | t }}</label>
            @if (error()) { <div class="form-error">{{ errorKey() | t }}</div> }
            @else if (checksumOk()) { <div class="ok-hint">{{ 'customers.validation.checksumOk' | t }}</div> }
          </div>
        }
      </div>
      @if (error() && !showNumber()) { <div class="form-error">{{ errorKey() | t }}</div> }

      @if (showOffice()) {
        <div class="form-field">
          <div class="office-filter">
            <select [id]="idPrefix + 'OfficeProv'" class="form-input has-value" [value]="officeProvince()" (change)="setOfficeProvince($any($event.target).value)" [attr.aria-label]="'shared.address.province' | t">
              <option value="">{{ 'shared.address.province' | t }}</option>
              @for (p of provinces(); track p.code) { <option [value]="p.code" [selected]="p.code === officeProvince()">{{ p.name }}</option> }
            </select>
            <input type="search" class="form-input" [placeholder]="'customers.form.taxOfficeSearch' | t" [value]="officeQuery()" (input)="officeQuery.set($any($event.target).value)" [attr.aria-label]="'customers.form.taxOfficeSearch' | t" />
          </div>
          <select [id]="idPrefix + 'Office'" class="form-input has-value" [value]="form.value.taxOfficeCode || ''" (change)="pickOffice($any($event.target).value)">
            <option value="">{{ form.value.taxOfficeName && !form.value.taxOfficeCode ? form.value.taxOfficeName : ('customers.form.taxOfficeSelect' | t) }}</option>
            @for (o of filteredOffices(); track o.code) { <option [value]="o.code" [selected]="o.code === form.value.taxOfficeCode">{{ o.name }} ({{ o.code }})</option> }
          </select>
          <label [for]="idPrefix + 'Office'" class="form-label">{{ 'settings.fiscal.taxOffice' | t }}</label>
        </div>
      }
    </ng-container>
  `,
})
export class IdentityFieldsComponent implements OnInit {
  @Input({ required: true }) form!: FormGroup;
  @Input() idPrefix = 'id';
  /** Identity types offered (e.g. no ANONYMOUS for suppliers). */
  @Input() types: string[] = ['VKN', 'TCKN', 'YKN', 'FOREIGN', 'ANONYMOUS'];
  /** Province used to pre-filter tax offices (usually the address province). */
  @Input() set provinceCode(code: string | null | undefined) {
    if (code && !this.officeProvinceTouched && !this.form?.value?.taxOfficeCode && this.officeProvince() !== code) this.setOfficeProvince(code, false);
  }

  private refdata = inject(ComplianceService);
  private destroyRef = inject(DestroyRef);

  provinces = signal<Province[]>([]);
  offices = signal<TaxOffice[]>([]);
  officeProvince = signal('');
  officeQuery = signal('');
  private officeProvinceTouched = false;
  /** Bumped on form changes so computed() re-evaluates. */
  private tick = signal(0);

  typeValue = computed(() => (this.tick(), (this.form?.value.identityType as string) || 'VKN'));
  showNumber = computed(() => this.typeValue() !== 'ANONYMOUS');
  showOffice = computed(() => ['VKN', 'TCKN'].includes(this.typeValue()));
  isNumeric = computed(() => ['VKN', 'TCKN', 'YKN'].includes(this.typeValue()));
  maxLen = computed(() => (this.typeValue() === 'VKN' ? 10 : this.isNumeric() ? 11 : 40));
  error = computed(() => (this.tick(), (this.form?.errors?.['taxId'] as string) || null));
  errorKey = computed(() => IDENTITY_ERROR_KEYS[this.error() || ''] || 'customers.validation.invalidType');
  checksumOk = computed(() => (this.tick(), this.isNumeric() && !!this.form?.value.identityNumber && !isMaskedValue(this.form?.value.identityNumber) && !this.error()));
  filteredOffices = computed(() => {
    const q = this.officeQuery().trim().toLocaleLowerCase('tr-TR');
    return q ? this.offices().filter((o) => o.name.toLocaleLowerCase('tr-TR').includes(q) || o.code.startsWith(q)) : this.offices();
  });

  ngOnInit() {
    this.refdata.getProvinces().subscribe({ next: (p) => this.provinces.set(p), error: () => undefined });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.tick.update((n) => n + 1);
      this.syncOfficeProvince();
    });
    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.tick.update((n) => n + 1));
    this.syncOfficeProvince();
  }

  /** A selected office (e.g. loaded asynchronously) decides the province filter unless the user changed it. */
  private syncOfficeProvince() {
    const code = this.form.value.taxOfficeCode as string | null;
    if (code && !this.officeProvinceTouched && this.officeProvince() !== code.slice(0, 2)) this.setOfficeProvince(code.slice(0, 2), false);
  }

  setOfficeProvince(code: string, byUser = true) {
    if (byUser) this.officeProvinceTouched = true;
    this.officeProvince.set(code);
    this.refdata.getTaxOffices(code).subscribe({ next: (o) => this.offices.set(o), error: () => this.offices.set([]) });
  }

  pickOffice(code: string) {
    const office = this.offices().find((o) => o.code === code);
    this.form.patchValue({ taxOfficeCode: office?.code || '', taxOfficeName: office?.name || '' });
    this.form.markAsDirty();
  }
}
