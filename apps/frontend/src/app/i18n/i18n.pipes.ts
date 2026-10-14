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

export const I18N_PIPES = [TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe] as const;
