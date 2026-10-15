import { Component, Input, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { I18nService, TranslatePipe } from '../../i18n';
import { Product, TaxRate } from '../../models/inventory.models';
import { CHARGE_TYPES, ExemptionCode, WithholdingCode } from '../../models/tax.models';

/** Line controls used by order / PO lines: discount, exemption and withholding (+ reverse charge on POs). */
export function lineTaxControls(fb: FormBuilder, v: { discountRate?: number | null; exemptionCode?: string | null; withholdingCode?: string | null; reverseCharge?: boolean } = {}) {
  return {
    discountRate: [v.discountRate ?? null, [Validators.min(0), Validators.max(100)]],
    // '' = product default; a code = explicit
    exemptionCode: [v.exemptionCode ?? ''],
    // '' = product default (automatic), 'none' = no withholding, a code = explicit
    withholdingCode: [v.withholdingCode === '' ? 'none' : v.withholdingCode ?? ''],
    reverseCharge: [!!v.reverseCharge],
  };
}

/** Document controls: document discount, tax point and additional charges. */
export function documentTaxGroup(fb: FormBuilder, v: { documentDiscountAmount?: number | null; taxPointDate?: string | null; charges?: { type: string; amount: number; description?: string | null }[] } = {}): FormGroup {
  return fb.group({
    documentDiscountAmount: [v.documentDiscountAmount || null, [Validators.min(0)]],
    taxPointDate: [v.taxPointDate || ''],
    charges: fb.array((v.charges || []).map((c) => chargeGroup(fb, c))),
  });
}

export function chargeGroup(fb: FormBuilder, c: { type?: string; amount?: number | null; description?: string | null } = {}): FormGroup {
  return fb.group({
    type: [c.type || 'SHIPPING', Validators.required],
    amount: [c.amount ?? null, [Validators.required, Validators.min(0)]],
    description: [c.description || ''],
  });
}

const rateOf = (product: Product | undefined, rates: TaxRate[]) => (product?.taxRateId ? rates.find((r) => r.id === product.taxRateId) : undefined);

/** R12: a 0 % (EXEMPT) line needs an exemption code: on the line or as the product default. */
export function lineNeedsExemption(line: AbstractControl, product: Product | undefined, rates: TaxRate[]): boolean {
  if (!product) return false;
  const r = rateOf(product, rates);
  const exempt = !!r && (r.kind === 'EXEMPT' || Number(r.rate) === 0);
  return exempt && !line.get('exemptionCode')?.value && !product.exemptionCode;
}

/** Payload fields of one line (exemption / withholding / discount / reverse charge). */
export function lineTaxPayload(v: { discountRate?: unknown; exemptionCode?: string; withholdingCode?: string; reverseCharge?: boolean }, withReverseCharge = false) {
  const out: { discountRate?: number; exemptionCode?: string; withholdingCode?: string; reverseCharge?: boolean } = {};
  const d = Number(v.discountRate);
  if (v.discountRate !== null && v.discountRate !== '' && v.discountRate !== undefined && d > 0) out.discountRate = d;
  if (v.exemptionCode) out.exemptionCode = v.exemptionCode;
  if (v.withholdingCode === 'none') out.withholdingCode = '';
  else if (v.withholdingCode) out.withholdingCode = v.withholdingCode;
  if (withReverseCharge && v.reverseCharge) out.reverseCharge = true;
  return out;
}

export function documentTaxPayload(v: { documentDiscountAmount?: unknown; taxPointDate?: string; charges?: { type: string; amount: unknown; description?: string }[] }) {
  const out: { documentDiscountAmount?: number; taxPointDate?: string; charges?: { type: string; amount: number; description?: string | null }[] } = {};
  const d = Number(v.documentDiscountAmount);
  if (d > 0) out.documentDiscountAmount = d;
  if (v.taxPointDate) out.taxPointDate = v.taxPointDate;
  const charges = (v.charges || []).filter((c) => Number(c.amount) > 0).map((c) => ({ type: c.type, amount: Number(c.amount), description: (c.description || '').trim() || null }));
  if (charges.length) out.charges = charges;
  return out;
}

/** Per-line tax inputs (discount %, exemption code, withholding code). */
@Component({
  selector: 'app-line-tax-fields',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  styles: [`
    :host { display: block; grid-column: 1 / -1; flex: 1 1 100%; width: 100%; }
    .ltf { display: grid; grid-template-columns: 96px minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-2); align-items: end; }
    .ltf label { display: block; font-size: var(--text-xs); color: var(--color-text-muted); margin-bottom: 2px; }
    .ltf .form-input { height: 34px; font-size: var(--text-sm); padding: 0 var(--space-2); width: 100%; }
    .rc { grid-column: 1 / -1; display: flex; gap: var(--space-2); align-items: center; font-size: var(--text-xs); color: var(--color-text-secondary); }
    .err { grid-column: 1 / -1; font-size: var(--text-xs); color: var(--color-danger-text); }
    .hint { grid-column: 1 / -1; font-size: var(--text-xs); color: var(--color-text-muted); }
    @media (max-width: 640px) { .ltf { grid-template-columns: 1fr; } }
  `],
  template: `
    <div class="ltf" [formGroup]="group">
      <div>
        <label [for]="id + 'd'">{{ 'finance.discountRate' | t }}</label>
        <input [id]="id + 'd'" type="number" min="0" max="100" step="0.01" class="form-input num" formControlName="discountRate" placeholder="0" />
      </div>
      @if (!importLine) {
      <div>
        <label [for]="id + 'e'">{{ 'finance.exemptionCode' | t }}</label>
        <select [id]="id + 'e'" class="form-input" formControlName="exemptionCode">
          <option value="">{{ product?.exemptionCode ? ('finance.productDefaultCode' | t: { code: product!.exemptionCode }) : ('finance.noExemption' | t) }}</option>
          @for (e of exemptions; track e.code) {
            <option [value]="e.code">{{ e.code }} · {{ name(e) }}</option>
          }
        </select>
      </div>
      }
      <div>
        <label [for]="id + 'w'">{{ 'finance.withholdingCode' | t }}</label>
        <select [id]="id + 'w'" class="form-input" formControlName="withholdingCode">
          <option value="">{{ product?.withholdingCode ? ('finance.productDefaultCode' | t: { code: product!.withholdingCode }) : ('finance.noWithholding' | t) }}</option>
          @if (product?.withholdingCode) { <option value="none">{{ 'finance.noWithholding' | t }}</option> }
          @for (w of withholdings; track w.code) {
            <option [value]="w.code">{{ w.code }} · {{ w.numerator }}/{{ w.denominator }} · {{ name(w) }}</option>
          }
        </select>
      </div>
      @if (showReverseCharge) {
        <label class="rc"><input type="checkbox" formControlName="reverseCharge" /> {{ 'finance.reverseCharge' | t }}</label>
      }
      @if (importLine && !group.get('reverseCharge')?.value) { <div class="hint">{{ 'finance.importVatHint' | t }}</div> }
      @if (needsExemption) { <div class="err" role="alert">{{ 'finance.exemptionRequired' | t }}</div> }
    </div>
  `,
})
export class LineTaxFieldsComponent {
  private i18n = inject(I18nService);
  private static seq = 0;
  readonly id = `ltf${++LineTaxFieldsComponent.seq}`;
  @Input({ required: true }) group!: FormGroup;
  @Input() product?: Product;
  @Input() rates: TaxRate[] = [];
  @Input() exemptions: ExemptionCode[] = [];
  @Input() withholdings: WithholdingCode[] = [];
  /** PO from a foreign supplier: VAT at customs, optional reverse charge for services */
  @Input() importLine = false;
  @Input() showReverseCharge = false;

  get needsExemption(): boolean {
    return !this.importLine && lineNeedsExemption(this.group, this.product, this.rates);
  }

  name(c: { nameTr: string; nameEn: string }): string {
    const text = this.i18n.lang() === 'en' ? c.nameEn : c.nameTr;
    return text.length > 70 ? text.slice(0, 68) + '…' : text;
  }
}

/** Document discount, tax point and additional charges (shipping, packaging, insurance, other). */
@Component({
  selector: 'app-document-tax-fields',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  styles: [`
    :host { display: block; }
    .dtf { display: flex; flex-direction: column; gap: var(--space-3); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .ch { display: grid; grid-template-columns: 150px 120px minmax(0, 1fr) 32px; gap: var(--space-2); align-items: center; }
    .ch .form-input { height: 36px; font-size: var(--text-sm); padding: 0 var(--space-2); width: 100%; }
    .head { display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0; }
    .icon { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; border-radius: var(--radius-md); }
    .icon:hover { background: var(--color-danger-subtle); color: var(--color-danger-text); }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .ch { grid-template-columns: 1fr 1fr; } .ch .desc { grid-column: 1 / -1; } }
  `],
  template: `
    <div class="dtf" [formGroup]="group">
      <div class="grid">
        <div class="form-field">
          <input [id]="id + 'dd'" type="number" min="0" step="0.01" class="form-input has-value num" formControlName="documentDiscountAmount" placeholder="0" />
          <label [for]="id + 'dd'" class="form-label">{{ 'finance.documentDiscount' | t }}</label>
        </div>
        <div class="form-field">
          <input [id]="id + 'tp'" type="date" class="form-input has-value" formControlName="taxPointDate" />
          <label [for]="id + 'tp'" class="form-label">{{ 'finance.taxPointDate' | t }}</label>
        </div>
      </div>
      <div class="head">
        <h4 class="title">{{ 'finance.charges' | t }}</h4>
        <button type="button" class="btn btn-sm btn-secondary" (click)="addCharge()">+ {{ 'finance.addCharge' | t }}</button>
      </div>
      <div formArrayName="charges" class="dtf">
        @for (c of charges.controls; track $index; let i = $index) {
          <div class="ch" [formGroupName]="i">
            <select class="form-input" formControlName="type" [attr.aria-label]="'finance.chargeType' | t">
              @for (t of types; track t) { <option [value]="t">{{ 'orders.charges.' + t | t }}</option> }
            </select>
            <input type="number" min="0" step="0.01" class="form-input num" formControlName="amount" [placeholder]="'finance.amount' | t" />
            <input type="text" class="form-input desc" formControlName="description" [placeholder]="'finance.chargeDescription' | t" maxlength="255" />
            <button type="button" class="icon" (click)="charges.removeAt(i)" [attr.aria-label]="'common.delete' | t">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        }
      </div>
      <div class="field-hint">{{ 'finance.chargesHint' | t }}</div>
    </div>
  `,
})
export class DocumentTaxFieldsComponent {
  private fb = inject(FormBuilder);
  private static seq = 0;
  readonly id = `dtf${++DocumentTaxFieldsComponent.seq}`;
  readonly types = CHARGE_TYPES;
  @Input({ required: true }) group!: FormGroup;

  get charges(): FormArray {
    return this.group.get('charges') as FormArray;
  }

  addCharge() {
    this.charges.push(chargeGroup(this.fb));
  }
}
