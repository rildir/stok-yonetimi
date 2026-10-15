import { Component, DestroyRef, Input, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isValidTrPostalCode } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { Address, District, Province } from '../../models/inventory.models';
import { TranslatePipe } from '../../i18n';

export const ADDRESS_COUNTRIES = ['TR', 'US', 'GB', 'DE', 'FR', 'NL', 'AE', 'AZ'];

/** TR postal code must be 5 digits and start with the province plate code. */
export const trPostalCodeValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const v = g.value as Address;
  if (!v || (v.country || 'TR') !== 'TR' || !v.postalCode) return null;
  return isValidTrPostalCode(v.postalCode, v.provinceCode || null) ? null : { postalCode: true };
};

export function createAddressGroup(fb: FormBuilder, defaultCountry = 'TR'): FormGroup {
  return fb.group(
    {
      line1: [''],
      line2: [''],
      country: [defaultCountry],
      provinceCode: [''],
      province: [''],
      districtId: [null as number | null],
      district: [''],
      postalCode: [''],
      uavtCode: [''],
    },
    { validators: trPostalCodeValidator },
  );
}

/** Entity address -> form value. */
export function addressToForm(a: Address | null | undefined, defaultCountry = 'TR'): Record<string, unknown> {
  return {
    line1: a?.line1 || '',
    line2: a?.line2 || '',
    country: a?.country || defaultCountry,
    provinceCode: a?.provinceCode || '',
    province: a?.province || '',
    districtId: a?.districtId ?? null,
    district: a?.district || '',
    postalCode: a?.postalCode || '',
    uavtCode: a?.uavtCode || '',
  };
}

/** Form value -> API payload (TR: codes only, names are filled by the server). */
export function addressFromForm(v: Record<string, any>): Address {
  const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const tr = (v['country'] || 'TR') === 'TR';
  return {
    line1: s(v['line1']),
    line2: s(v['line2']),
    country: s(v['country']),
    provinceCode: tr ? s(v['provinceCode']) : null,
    districtId: tr && v['districtId'] ? Number(v['districtId']) : null,
    province: tr ? null : s(v['province']),
    district: tr ? null : s(v['district']),
    postalCode: s(v['postalCode']),
    uavtCode: s(v['uavtCode']),
  };
}

/**
 * Structured address fields: country, province -> district dependent selects
 * (TR reference data), postal code with instant plate-code check, street lines.
 */
@Component({
  selector: 'app-address-fields',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--space-4); }
    .addr-hint { font-size: var(--text-xs); color: var(--color-text-muted); order: 3; }
  `],
  template: `
    <ng-container [formGroup]="group">
      <div class="form-row">
        <div class="form-field">
          <select [id]="idPrefix + 'Country'" formControlName="country" class="form-input has-value">
            @for (c of countries; track c) { <option [value]="c">{{ 'settings.country.' + c | t }} ({{ c }})</option> }
          </select>
          <label [for]="idPrefix + 'Country'" class="form-label">{{ 'shared.address.country' | t }}</label>
        </div>
        @if (isTr()) {
          <div class="form-field">
            <select [id]="idPrefix + 'Province'" formControlName="provinceCode" class="form-input has-value">
              <option value="">{{ 'shared.address.selectProvince' | t }}</option>
              @for (p of provinces(); track p.code) { <option [value]="p.code">{{ p.code }} · {{ p.name }}</option> }
            </select>
            <label [for]="idPrefix + 'Province'" class="form-label">{{ 'shared.address.province' | t }}</label>
          </div>
        } @else {
          <div class="form-field">
            <input [id]="idPrefix + 'ProvinceText'" type="text" formControlName="province" class="form-input" />
            <label [for]="idPrefix + 'ProvinceText'" class="form-label">{{ 'shared.address.city' | t }}</label>
          </div>
        }
      </div>

      <div class="form-row">
        @if (isTr()) {
          <div class="form-field">
            <select [id]="idPrefix + 'District'" formControlName="districtId" class="form-input has-value">
              <option [ngValue]="null">{{ 'shared.address.selectDistrict' | t }}</option>
              @for (d of districts(); track d.id) { <option [ngValue]="d.id">{{ d.name }}</option> }
            </select>
            <label [for]="idPrefix + 'District'" class="form-label">{{ 'shared.address.district' | t }}</label>
          </div>
        } @else {
          <div class="form-field">
            <input [id]="idPrefix + 'DistrictText'" type="text" formControlName="district" class="form-input" />
            <label [for]="idPrefix + 'DistrictText'" class="form-label">{{ 'shared.address.region' | t }}</label>
          </div>
        }
        <div class="form-field">
          <input [id]="idPrefix + 'Postal'" type="text" inputmode="numeric" maxlength="10" formControlName="postalCode" class="form-input mono" [class.ng-invalid]="group.errors?.['postalCode']" [class.ng-touched]="group.errors?.['postalCode']" />
          <label [for]="idPrefix + 'Postal'" class="form-label">{{ 'shared.address.postalCode' | t }}</label>
          @if (group.errors?.['postalCode']) { <div class="form-error">{{ 'shared.address.postalCodeInvalid' | t }}</div> }
        </div>
      </div>

      <div class="form-field">
        <input [id]="idPrefix + 'Line1'" type="text" formControlName="line1" class="form-input" [placeholder]="'shared.address.line1Ph' | t" />
        <label [for]="idPrefix + 'Line1'" class="form-label">{{ 'shared.address.line1' | t }}</label>
      </div>
      <div class="form-field">
        <input [id]="idPrefix + 'Line2'" type="text" formControlName="line2" class="form-input" />
        <label [for]="idPrefix + 'Line2'" class="form-label">{{ 'shared.address.line2' | t }}</label>
      </div>
    </ng-container>
  `,
})
export class AddressFieldsComponent implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() idPrefix = 'addr';

  private refdata = inject(ComplianceService);
  private destroyRef = inject(DestroyRef);

  readonly countries = ADDRESS_COUNTRIES;
  provinces = signal<Province[]>([]);
  districts = signal<District[]>([]);
  isTr = signal(true);

  ngOnInit() {
    this.refdata.getProvinces().subscribe({ next: (p) => this.provinces.set(p), error: () => undefined });
    this.isTr.set((this.group.value.country || 'TR') === 'TR');
    this.loadDistricts(this.group.value.provinceCode);

    this.group.get('country')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => this.isTr.set((c || 'TR') === 'TR'));
    this.group
      .get('provinceCode')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((code: string) => {
        // A new province invalidates the district.
        const current = this.group.value.districtId;
        if (current && Math.floor(Number(current) / 100) !== Number(code)) this.group.get('districtId')!.setValue(null);
        this.loadDistricts(code);
      });
  }

  private loadDistricts(code: string | null | undefined) {
    if (!code) {
      this.districts.set([]);
      return;
    }
    this.refdata.getDistricts(code).subscribe({ next: (d) => this.districts.set(d), error: () => this.districts.set([]) });
  }
}
