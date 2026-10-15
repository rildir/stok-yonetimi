import { Directive, ElementRef, HostListener, Input, forwardRef, inject, OnChanges } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import { I18nService } from '../../i18n';
import { Product, Unit } from '../../models/inventory.models';

/** Decimals allowed for a product's stock (base unit); serial-tracked stock is counted in pieces. */
export function productDecimals(p: Pick<Product, 'baseUnit' | 'trackingType' | 'unit'> | null | undefined, units?: Unit[] | null): number {
  if (!p || p.trackingType === 'serial') return 0;
  const u = p.baseUnit || units?.find((x) => x.code === p.unit);
  return Number(u?.decimals) || 0;
}

/** Locale-aware parsing of a typed quantity ("1,250" in TR = 1.25; "1.250" = 1250). Returns NaN when invalid. */
export function parseLocalizedQuantity(text: string, decimalSep: string): number {
  let s = String(text ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  const groupSep = decimalSep === ',' ? '.' : ',';
  if (s.includes(decimalSep)) {
    s = s.split(groupSep).join('');
  } else if (s.includes(groupSep)) {
    const parts = s.split(groupSep);
    // "1.250" (group) vs "1.25" typed with the other separator (decimal)
    s = parts.length === 2 && parts[1].length !== 3 ? parts.join(decimalSep) : parts.join('');
  }
  s = s.replace(decimalSep, '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/**
 * <input appQty [qtyDecimals]="3"> : quantity field that accepts the locale's decimal
 * separator (comma in Turkish), formats on blur and validates the unit precision
 * (errors: qtyInvalid, qtyPrecision { decimals }). Works with formControlName and ngModel.
 */
@Directive({
  selector: 'input[appQty]',
  standalone: true,
  host: { inputmode: 'decimal', autocomplete: 'off' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => QuantityInputDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => QuantityInputDirective), multi: true },
  ],
})
export class QuantityInputDirective implements ControlValueAccessor, Validator, OnChanges {
  /** Allowed fractional digits (unit precision) */
  @Input() qtyDecimals: number | null | undefined = 0;
  /** Smallest allowed value (default 0) */
  @Input() qtyMin: number | null = 0;

  private el = inject(ElementRef<HTMLInputElement>);
  private i18n = inject(I18nService);
  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};
  private value: number | null = null;
  private raw = '';

  ngOnChanges() {
    this.onValidatorChange();
  }

  private get decimalSep(): string {
    return (1.5).toLocaleString(this.i18n.locale()).includes(',') ? ',' : '.';
  }

  private format(v: number | null): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '';
    return new Intl.NumberFormat(this.i18n.locale(), { useGrouping: false, maximumFractionDigits: 4 }).format(v);
  }

  writeValue(v: unknown): void {
    this.value = v === null || v === undefined || v === '' ? null : Number(v);
    this.raw = this.format(this.value);
    this.el.nativeElement.value = this.raw;
  }

  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.el.nativeElement.disabled = disabled;
  }

  @HostListener('input', ['$event'])
  onInput(event: Event) {
    const text = (event.target as HTMLInputElement).value;
    this.raw = text;
    const n = parseLocalizedQuantity(text, this.decimalSep);
    this.value = text.trim() === '' ? null : n;
    this.onChange(this.value);
  }

  @HostListener('blur')
  onBlur() {
    if (this.value !== null && !Number.isNaN(this.value)) this.el.nativeElement.value = this.format(this.value);
    this.onTouched();
  }

  validate(_c: AbstractControl): ValidationErrors | null {
    const v = this.value;
    if (v === null) return null; // `required` is the form's business
    if (Number.isNaN(v)) return { qtyInvalid: true };
    if (this.qtyMin !== null && v < this.qtyMin) return { qtyInvalid: true };
    const d = Math.max(0, Math.min(Number(this.qtyDecimals) || 0, 4));
    const f = 10 ** d;
    if (Math.abs(Math.round(v * f) / f - v) > 1e-9) return { qtyPrecision: { decimals: d } };
    return null;
  }
}
