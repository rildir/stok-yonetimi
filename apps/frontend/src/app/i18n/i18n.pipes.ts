import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

// Pipes are impure so they re-evaluate when the language/locale signals change.

/** {{ 'key' | t }} or {{ 'key' | t: { name: x } }} */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(key: string | null | undefined, params?: Record<string, unknown> | null): string {
    return key ? this.i18n.t(key, params) : '';
  }
}

/** {{ amount | money }} — company base currency unless one is given. */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(value: number | string | null | undefined, currency?: string | null, fractionDigits?: number): string {
    const opts =
      fractionDigits !== undefined ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits } : undefined;
    return this.i18n.formatMoney(value, currency || undefined, opts);
  }
}

/** {{ n | num }} or {{ n | num: 2 }} (fixed fraction digits). */
@Pipe({ name: 'num', standalone: true, pure: false })
export class NumberFormatPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(value: number | string | null | undefined, fractionDigits?: number): string {
    const opts =
      fractionDigits !== undefined ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits } : undefined;
    return this.i18n.formatNumber(value, opts);
  }
}

/** {{ d | appDate }} / {{ d | appDate: 'datetime' }} — uses effective timezone. */
@Pipe({ name: 'appDate', standalone: true, pure: false })
export class AppDatePipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(
    value: Date | string | number | null | undefined,
    kind: 'date' | 'datetime' | 'time' | 'short' | 'long' = 'date',
  ): string {
    return this.i18n.formatDate(value, kind);
  }
}

/**
 * {{ unit | unitLabel }} — accepts a Unit object or a unit code string.
 * Standard units (pcs, box, kg, ...) are translated via `units.<code>`;
 * custom units show their own name (or the raw code).
 */
const UNECE_TO_APP_UNIT: Record<string, string> = { C62: 'pcs', KGM: 'kg', GRM: 'g', LTR: 'l', MLT: 'ml', MTR: 'm', BX: 'box', PK: 'pack', PA: 'pack', PF: 'pallet', LBR: 'lb' };

@Pipe({ name: 'unitLabel', standalone: true, pure: false })
export class UnitLabelPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(value: { code?: string | null; name?: string | null; isStandard?: boolean } | string | null | undefined): string {
    if (!value) return '';
    const code = typeof value === 'string' ? value : value.code || '';
    const key = `units.${code}`;
    const tr = code ? this.i18n.t(key) : '';
    if (tr && tr !== key) return tr;
    // e-document lines carry UN/ECE Rec. 20 codes (C62, KGM, ...): show the matching unit name.
    const app = UNECE_TO_APP_UNIT[code];
    if (app) return this.i18n.t(`units.${app}`);
    const unece = code ? this.i18n.t(`units.unece.${code}`) : '';
    if (unece && unece !== `units.unece.${code}`) return unece;
    return typeof value === 'string' ? value : value.name || code;
  }
}

export const I18N_PIPES = [TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe] as const;
