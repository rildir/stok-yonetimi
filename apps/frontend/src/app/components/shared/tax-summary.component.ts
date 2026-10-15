import { Component, Input } from '@angular/core';
import { MoneyPipe, NumberFormatPipe, AppDatePipe, TranslatePipe } from '../../i18n';
import { TaxSummaryView } from '../../models/tax.models';

/** Warning code -> i18n key of tax-engine warnings. */
export const TAX_WARNING_KEYS: Record<string, string> = {
  WITHHOLDING_BELOW_THRESHOLD: 'finance.warning.withholdingBelowThreshold',
  WITHHOLDING_SPLIT_SUSPECTED: 'finance.warning.withholdingSplit',
  WITHHOLDING_NOT_APPLICABLE_BUYER: 'finance.warning.withholdingBuyer',
  WITHHOLDING_SELLER_EXEMPT: 'finance.warning.withholdingSellerExempt',
  WITHHOLDING_EXEMPT_LINE: 'finance.warning.withholdingExemptLine',
  IMPORT_VAT_AT_CUSTOMS: 'finance.warning.importVat',
  WITHHOLDING_NOT_APPLICABLE_PURCHASE: 'finance.warning.withholdingPurchase',
  WITHHOLDING_SUPPLIER_EXEMPT: 'finance.warning.withholdingSupplierExempt',
  FX_RATE_STALE_WARNING: 'finance.warning.fxStale',
  FX_RATE_PROVISIONAL: 'finance.warning.fxProvisional',
  LATE_ENTRY_WARNING: 'stockMovements.warning.lateEntry',
};

/**
 * Document tax summary (orders, purchase orders, quotes): Matrah, discounts, charges,
 * per rate / exemption / withholding breakdown, Hesaplanan KDV, Tevkif edilen KDV,
 * Ödenecek; FX source badge (TCMB / Elle) with TRY equivalents; engine warnings.
 */
@Component({
  selector: 'app-tax-summary',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe],
  styles: [`
    :host { display: block; }
    .ts { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-muted); font-size: var(--text-sm); color: var(--color-text-secondary); }
    .ts.flat { padding: var(--space-3) 0 0; border: 0; border-radius: 0; background: transparent; }
    .row { display: flex; justify-content: space-between; gap: var(--space-3); align-items: baseline; }
    .row .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: var(--color-text-muted); }
    .sub { padding-left: var(--space-3); }
    .strong { color: var(--color-text); font-weight: var(--weight-semibold); }
    .grand { padding-top: var(--space-2); border-top: var(--border-width) solid var(--color-border); color: var(--color-text); font-weight: var(--weight-semibold); }
    .grand .num { font-size: var(--text-lg); }
    .payable { color: var(--color-primary-text); font-weight: var(--weight-semibold); }
    .neg { color: var(--color-danger-text); }
    .meta { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; padding-top: var(--space-2); border-top: var(--border-width) dashed var(--color-border); }
    .fx { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-surface); border: var(--border-width) solid var(--color-border-subtle); }
    .warn { padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-warning-subtle); color: var(--color-warning-text); border: var(--border-width) solid var(--color-warning-border); font-size: var(--text-xs); }
    .err { padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-danger-subtle); color: var(--color-danger-text); border: var(--border-width) solid var(--color-danger-border); font-size: var(--text-xs); }
  `],
  template: `
    @if (error) { <div class="err" role="alert">{{ error }}</div> }
    @if (view; as v) {
      <div class="ts" [class.flat]="flat">
        @if ((v.lineDiscountTotal || 0) > 0 || (v.documentDiscountAmount || 0) > 0) {
          <div class="row"><span>{{ 'finance.lineExtension' | t }}</span><span class="num">{{ (v.lineExtensionTotal || 0) | money: v.currency }}</span></div>
          @if ((v.lineDiscountTotal || 0) > 0) {
            <div class="row sub"><span>{{ 'finance.lineDiscounts' | t }}</span><span class="num neg">−{{ v.lineDiscountTotal! | money: v.currency }}</span></div>
          }
          @if ((v.documentDiscountAmount || 0) > 0) {
            <div class="row sub"><span>{{ 'orders.discount' | t }}</span><span class="num neg">−{{ v.documentDiscountAmount! | money: v.currency }}</span></div>
          }
        }
        @if ((v.chargesTotal || 0) > 0) {
          <div class="row"><span>{{ 'finance.chargesTotal' | t }}</span><span class="num">{{ v.chargesTotal! | money: v.currency }}</span></div>
        }
        <div class="row strong"><span>{{ 'finance.taxBase' | t }}</span><span class="num">{{ v.subtotal | money: v.currency }}</span></div>
        @if ((v.otvTotal || 0) > 0) {
          <div class="row"><span>{{ 'finance.otv' | t }}</span><span class="num">{{ v.otvTotal! | money: v.currency }}</span></div>
        }
        @for (b of v.breakdown; track $index) {
          <div class="row muted sub">
            <span>
              {{ 'finance.taxLine' | t: { rate: (b.rate | num), base: (b.base | money: v.currency) } }}
              @if (b.exemptionCode) { · {{ 'finance.exemptionShort' | t: { code: b.exemptionCode } }} }
              @if (b.withholdingRate > 0) { · {{ 'finance.withholdingShort' | t: { share: (b.withholdingRate / 10 | num) } }} }
              @if (b.vatNotCollected) { · {{ 'finance.notCollected' | t }} }
            </span>
            <span class="num">{{ b.tax | money: v.currency }}</span>
          </div>
        }
        <div class="row"><span>{{ 'finance.calculatedVat' | t }}</span><span class="num">{{ v.taxTotal | money: v.currency }}</span></div>
        @if ((v.notCollectedTaxTotal || 0) > 0) {
          <div class="row sub"><span>{{ 'finance.notCollectedVat' | t }}</span><span class="num neg">−{{ v.notCollectedTaxTotal! | money: v.currency }}</span></div>
        }
        <div class="row grand"><span>{{ 'finance.grandTotal' | t }}</span><span class="num">{{ v.grandTotal | money: v.currency }}</span></div>
        @if ((v.withheldTaxTotal || 0) > 0) {
          <div class="row"><span>{{ 'orders.withheldVat' | t }}</span><span class="num neg">−{{ v.withheldTaxTotal! | money: v.currency }}</span></div>
          <div class="row payable"><span>{{ 'orders.payable' | t }}</span><span class="num">{{ (v.payableTotal ?? v.grandTotal) | money: v.currency }}</span></div>
        }

        @if (showFx(v)) {
          <div class="fx">
            <div class="row">
              <span>
                <span class="badge" [class.badge-info]="v.exchangeRateSource === 'TCMB'" [class.badge-warning]="v.exchangeRateSource !== 'TCMB'">{{ 'finance.fxSource.' + (v.exchangeRateSource || 'MANUAL') | t }}</span>
                {{ 'finance.exchangeRateNote' | t: { from: v.currency, rate: (v.exchangeRate! | num: 4), to: baseCurrency } }}
              </span>
              @if (v.exchangeRateDate) { <span class="muted">{{ v.exchangeRateDate | appDate }}</span> }
            </div>
            <div class="row"><span>{{ 'finance.taxBaseTry' | t }}</span><span class="num">{{ (v.subtotalTry || 0) | money: baseCurrency }}</span></div>
            <div class="row"><span>{{ 'finance.vatTry' | t }}</span><span class="num">{{ (v.taxTotalTry || 0) | money: baseCurrency }}</span></div>
            <div class="row strong"><span>{{ 'finance.inBaseCurrency' | t: { currency: baseCurrency } }}</span><span class="num">{{ (v.grandTotalTry || 0) | money: baseCurrency }}</span></div>
          </div>
        }

        @if (v.taxPointDate || v.invoiceTypeHint || v.frozen) {
          <div class="meta">
            @if (v.taxPointDate) { <span class="muted">{{ 'finance.taxPointDate' | t }}: {{ v.taxPointDate | appDate }}</span> }
            @if (v.invoiceTypeHint) { <span class="badge badge-neutral" [title]="'finance.invoiceTypeHint' | t">{{ 'finance.invoiceType.' + v.invoiceTypeHint | t }}</span> }
            @if (v.frozen) { <span class="badge badge-success" [title]="'finance.frozenHint' | t">{{ 'finance.frozen' | t }}</span> }
          </div>
        }
        @for (w of v.warnings || []; track $index) {
          @if (warningKey(w.code); as key) { <div class="warn">{{ key | t: (w.params || {}) }}</div> }
        }
      </div>
    }
  `,
})
export class TaxSummaryComponent {
  @Input() view: TaxSummaryView | null = null;
  @Input() error: string | null = null;
  @Input() flat = false;
  @Input() baseCurrency = 'TRY';

  showFx(v: TaxSummaryView): boolean {
    return !!v.exchangeRate && !!v.currency && v.currency !== this.baseCurrency && v.exchangeRateSource !== 'BASE';
  }

  warningKey(code: string): string | null {
    return TAX_WARNING_KEYS[code] || null;
  }
}
