import { Injectable, BadRequestException, NotFoundException, UnprocessableEntityException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { err } from '../i18n/app-error';
import { CompanyEntity } from '../../entities/company.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { ProductEntity } from '../../entities/product.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { OrderEntity } from '../../entities/order.entity';
import { TenantContext } from '../tenant/tenant-context.service';
import { RateRow, TaxFxRate, convertAmount, expectedBulletinDay, findRate, gapIsNoBulletinDays, lastPublishedBulletinDay, selectTaxFxRate } from '../finance/currency';
import {
  InvoiceTypeHint,
  PricedDocument,
  TaxEngineCharge,
  TaxEngineLine,
  invoiceTypeHint,
  priceWithWithholdingThreshold,
  round2,
} from '../finance/tax';
import { LegalParameterService, pickParameter } from './legal-parameter.service';
import { TaxCodeService } from './tax-code.service';
import { TcmbService } from './tcmb.service';
import { daysBetween, dateKeyInZone, isDateKey, timeKeyInZone, todayKey } from '../tr';

/** Exchange-rate day of a document: instants (stored in UTC) count in the company time zone. */
export function rateDay(date: Date | string | null | undefined, tz?: string | null): string {
  if (date instanceof Date) return dateKeyInZone(date, tz || undefined);
  if (!date) return todayKey(tz || undefined);
  return String(date).slice(0, 10);
}

export const isTrCompany = (c: Pick<CompanyEntity, 'country'>) => (c.country || '').toUpperCase() === 'TR';

/** A party's role for tax purposes. */
export const isForeignCustomer = (c?: CustomerEntity | null) => !!c && (c.identityType === 'FOREIGN' || (!!c.address?.country && c.address.country.toUpperCase() !== 'TR'));
export const isForeignSupplier = (s?: SupplierEntity | null) => !!s && (s.isForeign || s.identityType === 'FOREIGN');

export interface DocLineInput {
  product: ProductEntity;
  /** Quantity in the entered unit */
  quantity: number;
  /** Entered unit price (gross when the company enters tax-inclusive prices); default product price */
  unitPrice?: number | null;
  /** Base units per entered unit */
  factor?: number;
  discountRate?: number | null;
  discountAmount?: number | null;
  /** Explicit exemption code (else the product's default) */
  exemptionCode?: string | null;
  /** Explicit withholding code (else the product's default); '' disables the product default */
  withholdingCode?: string | null;
  /** PO: service from a foreign supplier, VAT declared on KDV-2 (sorumlu sıfatıyla) */
  reverseCharge?: boolean;
}

export interface DocPricingInput {
  kind: 'SALE' | 'PURCHASE';
  lines: DocLineInput[];
  charges?: TaxEngineCharge[];
  documentDiscountAmount?: number | null;
  currency: string;
  /** Vergiyi doğuran olay (YYYY-MM-DD) */
  taxPointDate: string;
  customer?: CustomerEntity | null;
  supplier?: SupplierEntity | null;
  /** Order being priced (excluded from the split-order check) */
  documentId?: string | null;
  /** Pricing that freezes the document: an unconfirmed older exchange rate is refused (FX_RATE_STALE) */
  freeze?: boolean;
}

export interface DocLineMeta {
  enteredUnitPrice: number;
  taxRateId: string | null;
  taxCode: string;
  exemptionCode: string | null;
  withholdingCode: string | null;
  /** Withholding code as entered: null = product default, '' = switched off, else the explicit code */
  withholdingCodeEntered: string | null;
  /** Line discount amount as entered (null = percentage / none) */
  discountAmountEntered: number | null;
  otvCode: string | null;
  reverseCharge: boolean;
  /** PO: VAT deductible on KDV-1 */
  deductibleVat: number;
  /** Shown next to the line (e.g. IMPORT_VAT_AT_CUSTOMS) */
  label: string | null;
}

export interface DocWarning {
  code: string;
  params?: Record<string, string | number>;
}

export interface DocPricingResult {
  doc: PricedDocument;
  lineMeta: DocLineMeta[];
  currency: string;
  /** 1 doc currency = rate base currency (document / commercial rate) */
  exchangeRate: number;
  exchangeRateSource: 'TCMB' | 'MANUAL' | 'BASE';
  exchangeRateDate: string | null;
  taxPointDate: string;
  subtotalTry: number;
  taxTotalTry: number;
  grandTotalTry: number;
  invoiceTypeHint: InvoiceTypeHint;
  withholdingApplied: boolean;
  isImport: boolean;
  pricesIncludeTax: boolean;
  warnings: DocWarning[];
}

/**
 * Tenant-aware currency conversion and tax resolution (rate catalog, exemption,
 * withholding, ÖTV, tax-point exchange rate). Pure math lives in ../finance/{currency,tax}.ts.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly legalParams: LegalParameterService,
    private readonly taxCodes: TaxCodeService,
    @Optional() private readonly tcmb?: TcmbService,
  ) {}

  /**
   * Legal parameter (VUK 232 limit, penalties, due days...) valid on `date`
   * (default: today in the company's time zone) for the company's country.
   * Throws 422 LEGAL_PARAMETER_MISSING when the value for that date is not defined.
   */
  async param<T = unknown>(key: string, date?: string, manager?: EntityManager): Promise<T> {
    const company = await this.getCompany(manager);
    return this.legalParams.param<T>(key, date || todayKey(company.timezone), company.country || 'TR');
  }

  /** Today (YYYY-MM-DD) in the company's time zone. */
  async today(manager?: EntityManager): Promise<string> {
    return todayKey((await this.getCompany(manager)).timezone);
  }

  private m(manager?: EntityManager): EntityManager {
    return manager || this.dataSource.manager;
  }

  async getCompany(manager?: EntityManager): Promise<CompanyEntity> {
    const company = await this.m(manager).findOne(CompanyEntity, { where: { id: this.tenant.companyId } });
    if (!company) throw new NotFoundException(err('COMPANY_NOT_FOUND'));
    return company;
  }

  async getRates(manager?: EntityManager): Promise<(RateRow & { source?: string; rateType?: string })[]> {
    return this.m(manager).find(ExchangeRateEntity, { where: { companyId: this.tenant.companyId } });
  }

  /** Commercial (non-tax) rates: manual and TCMB forex buying rows. */
  private commercialRates(rows: (RateRow & { rateType?: string })[]): RateRow[] {
    return rows.filter((r) => (r.rateType || 'FOREX_BUYING') === 'FOREX_BUYING');
  }

  /** Units of `to` per 1 `from`; throws EXCHANGE_RATE_MISSING when unknown. */
  async requireRate(from: string, to: string, date?: Date | string | null, manager?: EntityManager): Promise<number> {
    if (from === to) return 1;
    const company = await this.getCompany(manager);
    const rate = findRate(this.commercialRates(await this.getRates(manager)), from, to, rateDay(date, company.timezone), company.baseCurrency);
    if (rate === null) throw new BadRequestException(err('EXCHANGE_RATE_MISSING', { from, to }));
    return rate;
  }

  /** Converts an amount to the company base currency (null if no rate). */
  async convertToBase(amount: number, currency: string, date?: Date | string | null, manager?: EntityManager): Promise<number | null> {
    const company = await this.getCompany(manager);
    return convertAmount(amount, currency, company.baseCurrency, this.commercialRates(await this.getRates(manager)), rateDay(date, company.timezone), company.baseCurrency);
  }

  /**
   * Rate used to convert a document to TRY for VAT (TR): direct FOREX_BUYING `currency -> TRY`
   * on the tax point (legal parameter KDV_FX_RATE_DAY decides whether the bulletin of the
   * previous day is used). Never a cross or inverse rate.
   *
   * Staleness: the tax point calls for one bulletin day (expectedBulletinDay). When the newest
   * stored rate is older, the TCMB archive is asked for the missing days (company fetches rates
   * automatically); days the archive answers "no bulletin" (public holidays) confirm the older
   * rate. When the archive cannot answer (manual rates, TCMB outage) a gap made only of listed
   * public holidays (legal parameter TCMB_NO_BULLETIN_DAYS) confirms it as well. An unconfirmed
   * older rate is flagged `stale` (warning on quotes) and refused with 422 FX_RATE_STALE when
   * `strict` (freezing a document) or when it is more than KDV_FX_MAX_STALE_DAYS calendar days
   * older than the expected bulletin. A tax point after the last published bulletin gets the latest
   * rate flagged `provisional`; freezing at such a rate is refused (422 FX_RATE_PROVISIONAL_FREEZE).
   * No rate: 422 FX_RATE_NOT_FOUND.
   */
  async taxFxRate(currency: string, taxPointDate: string, manager?: EntityManager, opts: { strict?: boolean } = {}): Promise<TaxFxRate> {
    const company = await this.getCompany(manager);
    const cur = currency.toUpperCase();
    if (cur === 'TRY') return { rate: 1, date: taxPointDate, source: 'BASE' };
    const country = company.country || 'TR';
    const policy = await this.legalParams.paramOrNull<string>('KDV_FX_RATE_DAY', taxPointDate, country);
    const previousDay = policy !== 'SAME_DAY';
    const now = new Date();
    const [hh, mm] = timeKeyInZone(now, 'Europe/Istanbul').split(':').map(Number);
    const { expected, provisional } = expectedBulletinDay(taxPointDate, previousDay, lastPublishedBulletinDay(todayKey('Europe/Istanbul', now), hh * 60 + mm));
    let hit = selectTaxFxRate(await this.getRates(manager), cur, taxPointDate, previousDay);
    let confirmed = !!hit && hit.date >= expected;
    if (!confirmed && company.fxAutoFetch && this.tcmb) {
      const r = await this.tcmb.latestBulletin(company.id, hit?.date ?? null, expected, manager);
      if (r.date) hit = selectTaxFxRate(await this.getRates(manager), cur, taxPointDate, previousDay);
      // Confirmed: no bulletin was published after the rate used (holidays). A newer bulletin that
      // does not quote this currency does not confirm an older manual rate.
      confirmed = !!hit && (hit.date >= expected || (r.confirmed && (!r.date || r.date <= hit.date)));
    }
    if (!hit) throw new UnprocessableEntityException(err('FX_RATE_NOT_FOUND', { currency: cur, date: taxPointDate }));
    if (!confirmed) confirmed = gapIsNoBulletinDays(hit.date, expected, await this.noBulletinDays(hit.date, expected, country));
    const out: TaxFxRate = { ...hit, expectedDate: expected };
    if (provisional) {
      if (opts.strict) throw new UnprocessableEntityException(err('FX_RATE_PROVISIONAL_FREEZE', { currency: cur, date: taxPointDate, rateDate: hit.date }));
      out.provisional = true;
    }
    if (!confirmed) {
      const maxDays = await this.legalParams.paramOrNull<number>('KDV_FX_MAX_STALE_DAYS', taxPointDate, country);
      const tooOld = maxDays !== null && maxDays !== undefined && daysBetween(hit.date, expected) > Number(maxDays);
      if (opts.strict || tooOld) {
        throw new UnprocessableEntityException(err('FX_RATE_STALE', { currency: cur, date: taxPointDate, rateDate: hit.date, expected }));
      }
      out.stale = true;
    }
    return out;
  }

  /** Listed weekday public holidays (TCMB_NO_BULLETIN_DAYS, one row per year) between two days. */
  private async noBulletinDays(from: string, to: string, country: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      for (const d of [`${y}-01-01`, `${y}-12-31`]) {
        const v = await this.legalParams.paramOrNull<string[]>('TCMB_NO_BULLETIN_DAYS', d, country);
        if (Array.isArray(v)) v.forEach((x) => out.add(String(x).slice(0, 10)));
      }
    }
    return out;
  }

  async getDefaultTaxRate(manager?: EntityManager): Promise<TaxRateEntity | null> {
    return this.m(manager).findOne(TaxRateEntity, {
      where: { companyId: this.tenant.companyId, isDefault: true, isDeleted: false },
    });
  }

  /**
   * Tax rate version of a product on `date`. TR: the product must have a rate
   * (PRODUCT_TAX_RATE_MISSING, no silent default); a version that only starts after
   * `date` is walked back to the version it superseded. When no earlier version is on file
   * (e.g. the KDV20 catalog row of a company created after 10.07.2023), a TR catalog row is
   * resolved to the catalog rate in the same position on `date` (KDV20 -> KDV18), whose closed
   * system version is created on first use; otherwise 422 TAX_RATE_NOT_VALID_ON_DATE.
   * Other countries keep the legacy fallback (company default, else none = 0 %).
   */
  async resolveProductRate(product: Pick<ProductEntity, 'taxRateId' | 'name'>, date: string, manager?: EntityManager): Promise<TaxRateEntity | null> {
    const company = await this.getCompany(manager);
    let row: TaxRateEntity | null = null;
    if (product.taxRateId) {
      row = await this.m(manager).findOne(TaxRateEntity, { where: { id: product.taxRateId, companyId: this.tenant.companyId } });
      for (let i = 0; row && i < 20; i++) {
        const from = row.validFrom ? String(row.validFrom).slice(0, 10) : null;
        if (!from || from <= date || !row.supersedesId) break;
        row = await this.m(manager).findOne(TaxRateEntity, { where: { id: row.supersedesId, companyId: this.tenant.companyId } });
      }
    }
    if (row) {
      const from = row.validFrom ? String(row.validFrom).slice(0, 10) : null;
      if (from && from > date) {
        // The rate did not exist yet on the tax point (e.g. 20 % before 10.07.2023).
        const older = isTrCompany(company) ? await this.catalogVersionOn(row, date, manager) : null;
        if (!older) throw new UnprocessableEntityException(err('TAX_RATE_NOT_VALID_ON_DATE', { name: product.name, rate: row.rate, date }));
        row = older;
      }
      // A rate whose legal period ended (e.g. 18 % before 10.07.2023) cannot price a later tax point.
      if (row.validTo && String(row.validTo).slice(0, 10) < date) throw new UnprocessableEntityException(err('TAX_RATE_NOT_VALID_ON_DATE', { name: product.name, rate: row.rate, date }));
      return row;
    }
    if (isTrCompany(company)) throw new UnprocessableEntityException(err('PRODUCT_TAX_RATE_MISSING', { name: product.name }));
    return this.getDefaultTaxRate(manager);
  }

  /**
   * TR: the company's catalog row valid on `date` that corresponds to `row` (same position in
   * legal_parameters KDV_RATE_CATALOG: general / reduced / super-reduced). Creates the closed
   * system version (validFrom / validTo = that catalog period) when the company has none and links
   * the newer row to it (supersedesId); the creation runs under a lock on the company row so two
   * concurrent first uses cannot insert the version twice. 422 TAX_RATE_CATALOG_NO_ENTRY when the
   * catalog has no entry for `date` (a tax point before the first catalogued period).
   */
  private async catalogVersionOn(row: TaxRateEntity, date: string, manager?: EntityManager): Promise<TaxRateEntity | null> {
    if (row.kind !== 'STANDARD' || !row.code || !row.validFrom) return null;
    const company = await this.getCompany(manager);
    const catalogs = await this.legalParams.list(company.country || 'TR', 'KDV_RATE_CATALOG');
    const current = pickParameter(catalogs, String(row.validFrom).slice(0, 10));
    const then = pickParameter(catalogs, date);
    if (current && !then) throw new UnprocessableEntityException(err('TAX_RATE_CATALOG_NO_ENTRY', { date }));
    if (!current || !then || current === then) return null;
    const idx = (current.value as { code: string }[]).findIndex((r) => r.code === row.code);
    const target = idx >= 0 ? (then.value as { rate: number; code: string }[])[idx] : undefined;
    if (!target) return null;
    const covers = (r: TaxRateEntity) =>
      (!r.validFrom || String(r.validFrom).slice(0, 10) <= date) && (!r.validTo || String(r.validTo).slice(0, 10) >= date) && Number(r.rate) === Number(target.rate);
    const find = async (m: EntityManager) =>
      (await m.find(TaxRateEntity, { where: { companyId: this.tenant.companyId, code: target.code, kind: 'STANDARD', isDeleted: false } })).find(covers) || null;
    const existing = await find(this.m(manager));
    if (existing) return this.linkSuperseded(row, existing, manager);
    const create = async (m: EntityManager) => {
      await m.query('SELECT `id` FROM `companies` WHERE `id` = ? FOR UPDATE', [this.tenant.companyId]);
      let older = await find(m);
      if (older) return older;
      older = await m.save(
        TaxRateEntity,
        m.create(TaxRateEntity, {
          companyId: this.tenant.companyId,
          name: `KDV %${target.rate}`,
          rate: target.rate,
          country: 'TR',
          isDefault: false,
          kind: 'STANDARD',
          code: target.code,
          isSystem: true,
          validFrom: String(then.validFrom).slice(0, 10),
          validTo: then.validTo ? String(then.validTo).slice(0, 10) : null,
          taxTypeCode: row.taxTypeCode || '0015',
        }),
      );
      return older;
    };
    const older = manager?.queryRunner?.isTransactionActive ? await create(manager) : await this.dataSource.transaction(create);
    return this.linkSuperseded(row, older, manager);
  }

  private async linkSuperseded(row: TaxRateEntity, older: TaxRateEntity, manager?: EntityManager): Promise<TaxRateEntity> {
    if (!row.supersedesId && older.validTo && String(older.validTo).slice(0, 10) < String(row.validFrom).slice(0, 10)) {
      await this.m(manager).update(TaxRateEntity, { id: row.id, companyId: this.tenant.companyId }, { supersedesId: older.id });
      row.supersedesId = older.id;
    }
    return older;
  }

  /** Legacy: tax % for a product (see resolveProductRate). */
  async taxRateForProduct(product: Pick<ProductEntity, 'taxRateId' | 'name'>, manager?: EntityManager): Promise<number> {
    const row = await this.resolveProductRate(product, await this.today(manager), manager);
    return row ? Number(row.rate) : 0;
  }

  private async exemptRateRow(manager?: EntityManager): Promise<TaxRateEntity | null> {
    return this.m(manager).findOne(TaxRateEntity, { where: { companyId: this.tenant.companyId, kind: 'EXEMPT', isDeleted: false } });
  }

  /**
   * Prices a sales / purchase document: product price conversion, the product's rate version,
   * exemption (0 % requires a code; 701/702 calculated but not collected), withholding
   * (taxpayer / designated buyer, 627 seller exception, VUK 232 threshold in TRY), ÖTV,
   * discounts and charges, import / reverse charge for foreign suppliers, and the TRY
   * equivalents at the tax-point TCMB rate.
   */
  async priceDocumentFor(input: DocPricingInput, manager?: EntityManager): Promise<DocPricingResult> {
    const company = await this.getCompany(manager);
    const tr = isTrCompany(company);
    const date = input.taxPointDate;
    if (!isDateKey(date)) throw new BadRequestException(err('VALIDATION_DATE'));
    // A document is frozen once the taxable event happened: never at a future tax point.
    if (input.freeze && date > todayKey(company.timezone)) throw new UnprocessableEntityException(err('TAX_POINT_IN_FUTURE', { date, today: todayKey(company.timezone) }));
    const currency = input.currency.toUpperCase();
    const warnings: DocWarning[] = [];
    const warn = (code: string, params?: Record<string, string | number>) => {
      if (!warnings.some((w) => w.code === code && JSON.stringify(w.params) === JSON.stringify(params))) warnings.push({ code, params });
    };
    const rows = await this.getRates(manager);
    const commercial = this.commercialRates(rows);
    const rateOrThrow = (from: string, to: string) => {
      const r = findRate(commercial, from, to, date, company.baseCurrency);
      if (r === null) throw new BadRequestException(err('EXCHANGE_RATE_MISSING', { from, to }));
      return r;
    };

    // Exchange rate of the document: TR -> the VAT rate (TCMB forex buying at the tax point).
    let fx: TaxFxRate;
    if (tr && company.baseCurrency.toUpperCase() === 'TRY') fx = await this.taxFxRate(currency, date, manager, { strict: !!input.freeze });
    else fx = currency === company.baseCurrency ? { rate: 1, date, source: 'BASE' } : { rate: rateOrThrow(currency, company.baseCurrency), date, source: 'MANUAL' };

    if (fx.stale) warn('FX_RATE_STALE_WARNING', { currency, rateDate: fx.date, expected: fx.expectedDate || date });
    if (fx.provisional) warn('FX_RATE_PROVISIONAL', { currency, rateDate: fx.date });

    const foreignSupplier = input.kind === 'PURCHASE' && isForeignSupplier(input.supplier);
    const customer = input.customer || null;
    const engineLines: TaxEngineLine[] = [];
    const meta: DocLineMeta[] = [];
    const exemptRow = tr ? await this.exemptRateRow(manager) : null;

    for (const it of input.lines) {
      const p = it.product;
      const entered =
        it.unitPrice !== undefined && it.unitPrice !== null && Number(it.unitPrice) > 0
          ? Number(it.unitPrice)
          : Number(p.price) * (it.factor || 1) * rateOrThrow(p.currency || company.baseCurrency, currency);
      const rateRow = await this.resolveProductRate(p, date, manager);
      let taxRate = rateRow ? Number(rateRow.rate) : 0;
      let taxRateId = rateRow?.id ?? null;
      let vatNotCollected = false;
      let label: string | null = null;
      const reverseCharge = !!it.reverseCharge;

      // Exemption
      let exemptionCode = (it.exemptionCode ?? p.exemptionCode ?? null) || null;
      if (reverseCharge && !foreignSupplier) throw new BadRequestException(err('REVERSE_CHARGE_REQUIRES_FOREIGN_SUPPLIER'));
      if (foreignSupplier) {
        // KDVK 10/ı: import VAT is paid at customs, the supplier's invoice carries none.
        exemptionCode = null;
        if (reverseCharge) {
          vatNotCollected = true;
          label = 'REVERSE_CHARGE_KDV2';
        } else {
          taxRate = 0;
          taxRateId = exemptRow?.id ?? taxRateId;
          label = 'IMPORT_VAT_AT_CUSTOMS';
        }
      } else if (exemptionCode) {
        const ex = await this.taxCodes.exemption(exemptionCode, date, manager);
        if (ex.requiresForeignBuyer && input.kind === 'SALE' && !isForeignCustomer(customer)) {
          throw new BadRequestException(err('EXPORT_REQUIRES_FOREIGN_BUYER', { code: ex.code }));
        }
        if (ex.vatCalculatedNotCollected) {
          vatNotCollected = true;
        } else if (ex.type === 'FULL' || ex.type === 'PARTIAL' || ex.code === '351') {
          taxRate = 0;
          taxRateId = exemptRow?.id ?? taxRateId;
        }
      }
      if (tr && !foreignSupplier && taxRate === 0 && !exemptionCode) {
        // R12: 0 % is an exemption and needs its reason code.
        throw new BadRequestException(err('EXEMPTION_CODE_REQUIRED', { name: p.name }));
      }

      // Withholding
      const explicitW = it.withholdingCode !== undefined && it.withholdingCode !== null;
      const wCode = explicitW ? it.withholdingCode || null : p.withholdingCode || null;
      let withholdingRate = 0;
      let thresholdExempt = false;
      if (wCode && taxRate > 0 && !vatNotCollected && !foreignSupplier) {
        const w = await this.taxCodes.withholding(wCode, date, manager);
        // KDVGUT I/C-2.1.3.1: partial withholding is applied by VAT taxpayers and by the designated
        // buyers of I/C-2.1.2.1 (public administrations etc., VAT-registered or not); codes limited to
        // designated buyers need that status. Sale: the customer is the buyer. Purchase: the company is
        // the buyer (TR company = VAT taxpayer) and the supplier must be a VAT-registered seller.
        const qualifies = (vatTaxpayer: boolean, designated: boolean) => (w.requiresDesignatedBuyer ? designated : vatTaxpayer || designated);
        const buyerOk =
          input.kind === 'SALE'
            ? !!customer && qualifies(!!customer.isVatTaxpayer, !!customer.isDesignatedBuyer)
            : !!input.supplier && input.supplier.isVatTaxpayer !== false && qualifies(tr, !!company.isDesignatedBuyer);
        // 627: deliveries by importers / producers from ore are outside the withholding (the seller's status).
        const sellerExempt =
          !!w.exemptForImporterOrOreProducer && (input.kind === 'SALE' ? !!company.isImporterOrOreProducer : !!input.supplier?.isImporterOrOreProducer);
        if (!buyerOk) {
          if (explicitW) throw new BadRequestException(err(input.kind === 'SALE' ? 'WITHHOLDING_REQUIRES_TAXPAYER_BUYER' : 'WITHHOLDING_NOT_APPLICABLE_PURCHASE', { code: w.code }));
          warn(input.kind === 'SALE' ? 'WITHHOLDING_NOT_APPLICABLE_BUYER' : 'WITHHOLDING_NOT_APPLICABLE_PURCHASE', { code: w.code });
        } else if (sellerExempt) {
          warn(input.kind === 'SALE' ? 'WITHHOLDING_SELLER_EXEMPT' : 'WITHHOLDING_SUPPLIER_EXEMPT', { code: w.code });
        } else {
          withholdingRate = round2((Number(w.numerator) / (w.denominator || 10)) * 100);
          thresholdExempt = w.scope === 'FULL';
        }
      } else if (explicitW && wCode && (taxRate === 0 || vatNotCollected)) {
        await this.taxCodes.withholding(wCode, date, manager);
        warn('WITHHOLDING_EXEMPT_LINE', { code: wCode });
      }

      // ÖTV
      const otvRate = !foreignSupplier && p.otvCode && Number(p.otvRate) > 0 ? Number(p.otvRate) : 0;
      if (otvRate) await this.taxCodes.otv(p.otvCode as string, date, manager);

      engineLines.push({
        quantity: it.quantity,
        unitPrice: entered,
        taxRate,
        discountRate: it.discountRate ?? null,
        discountAmount: it.discountAmount ?? null,
        exemptionCode,
        vatNotCollected,
        withholdingRate,
        withholdingCode: withholdingRate ? wCode : null,
        withholdingThresholdExempt: thresholdExempt,
        otvRate,
      });
      meta.push({
        enteredUnitPrice: Math.round(entered * 1e6) / 1e6,
        taxRateId,
        taxCode: rateRow?.taxTypeCode || '0015',
        exemptionCode,
        withholdingCode: null,
        withholdingCodeEntered: explicitW ? String(it.withholdingCode) : null,
        discountAmountEntered: Number(it.discountAmount) > 0 ? round2(Number(it.discountAmount)) : null,
        otvCode: otvRate ? p.otvCode || null : null,
        reverseCharge,
        deductibleVat: 0,
        label,
      });
    }

    // VUK 232 threshold (TRY, VAT included) for partial withholding.
    let limit: number | null = null;
    if (tr && engineLines.some((l) => (l.withholdingRate || 0) > 0 && !l.withholdingThresholdExempt)) {
      limit = Number(await this.legalParams.param<number>('VUK232_INVOICE_LIMIT', date, company.country || 'TR'));
    }
    const engineInput = { lines: engineLines, charges: input.charges || [], documentDiscountAmount: input.documentDiscountAmount ?? 0, pricesIncludeTax: company.pricesIncludeTax };
    const priced = priceWithWithholdingThreshold(engineInput, limit, fx.rate);
    const doc = priced.doc;
    if (priced.requested && !priced.withholdingApplied && limit !== null) {
      warn('WITHHOLDING_BELOW_THRESHOLD', { limit, total: priced.totalTry });
      if (input.kind === 'SALE' && customer) {
        // Split orders: same customer, same day, together above the limit.
        const sameDay = await this.sameDayTotalTry(customer.id, date, input.documentId || null, manager);
        if (sameDay > 0 && sameDay + priced.totalTry > limit) warn('WITHHOLDING_SPLIT_SUSPECTED', { limit, total: round2(sameDay + priced.totalTry) });
      }
    }
    doc.lines.forEach((l, i) => {
      meta[i].withholdingCode = l.withholdingCode;
      meta[i].deductibleVat = input.kind === 'PURCHASE' ? (foreignSupplier && !meta[i].reverseCharge ? 0 : l.taxAmount) : 0;
    });
    if (foreignSupplier) warn('IMPORT_VAT_AT_CUSTOMS');

    const toTry = (n: number) => (company.baseCurrency.toUpperCase() === 'TRY' ? round2(n * fx.rate) : 0);
    return {
      doc,
      lineMeta: meta,
      currency,
      exchangeRate: fx.rate,
      exchangeRateSource: fx.source,
      exchangeRateDate: fx.source === 'BASE' ? null : fx.date,
      taxPointDate: date,
      subtotalTry: toTry(doc.subtotal),
      taxTotalTry: toTry(doc.taxTotal),
      grandTotalTry: toTry(doc.grandTotal),
      invoiceTypeHint: invoiceTypeHint(doc),
      withholdingApplied: priced.withholdingApplied,
      isImport: foreignSupplier,
      pricesIncludeTax: company.pricesIncludeTax,
      warnings,
    };
  }

  /** TRY total (VAT incl.) of the customer's other non-cancelled orders with the same tax point. */
  private async sameDayTotalTry(customerId: string, date: string, excludeId: string | null, manager?: EntityManager): Promise<number> {
    const rows = await this.m(manager).find(OrderEntity, {
      where: { companyId: this.tenant.companyId, customerId, taxPointDate: date, status: In(['Pending', 'Completed']) },
      select: ['id', 'grandTotalTry', 'grandTotal', 'exchangeRate'],
    });
    return round2(rows.filter((r) => r.id !== excludeId).reduce((s, r) => s + (Number(r.grandTotalTry) || Number(r.grandTotal) * Number(r.exchangeRate || 1)), 0));
  }

  /**
   * Product tax defaults: TR products always carry an explicit rate (the company default is
   * assigned on creation, visible and editable, instead of a silent fallback at pricing time);
   * default exemption / withholding / ÖTV codes must exist; an EXEMPT rate needs its exemption code.
   */
  async normalizeProductTax(
    target: Pick<ProductEntity, 'taxRateId' | 'exemptionCode' | 'withholdingCode' | 'otvCode' | 'otvRate' | 'name'>,
    isNew: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const company = await this.getCompany(manager);
    const today = todayKey(company.timezone);
    for (const k of ['exemptionCode', 'withholdingCode', 'otvCode'] as const) if (target[k] === '') target[k] = null;
    if (isTrCompany(company) && !target.taxRateId) {
      if (!isNew) throw new UnprocessableEntityException(err('PRODUCT_TAX_RATE_MISSING', { name: target.name }));
      const def = await this.getDefaultTaxRate(manager);
      if (!def) throw new UnprocessableEntityException(err('PRODUCT_TAX_RATE_MISSING', { name: target.name }));
      target.taxRateId = def.id;
    }
    if (target.exemptionCode) await this.taxCodes.exemption(target.exemptionCode, today, manager);
    if (target.withholdingCode) await this.taxCodes.withholding(target.withholdingCode, today, manager);
    if (target.otvCode) await this.taxCodes.otv(target.otvCode, today, manager);
    if (!target.otvCode) target.otvRate = null;
    if (target.taxRateId) {
      const row = await this.m(manager).findOne(TaxRateEntity, { where: { id: target.taxRateId, companyId: this.tenant.companyId, isDeleted: false } });
      if (!row) throw new BadRequestException(err('TAX_RATE_NOT_FOUND'));
      // A closed historical version (e.g. KDV18) cannot be a product's current rate.
      if (row.validTo && String(row.validTo).slice(0, 10) < today) throw new UnprocessableEntityException(err('TAX_RATE_NOT_VALID_ON_DATE', { name: target.name, rate: row.rate, date: today }));
      if (isTrCompany(company) && (row.kind === 'EXEMPT' || Number(row.rate) === 0) && !target.exemptionCode) {
        throw new BadRequestException(err('EXEMPTION_CODE_REQUIRED', { name: target.name }));
      }
    }
  }

  async assertTaxRate(taxRateId: string | null | undefined, manager?: EntityManager): Promise<void> {
    if (!taxRateId) return;
    const exists = await this.m(manager).exists(TaxRateEntity, {
      where: { id: taxRateId, companyId: this.tenant.companyId, isDeleted: false },
    });
    if (!exists) throw new BadRequestException(err('TAX_RATE_NOT_FOUND'));
  }
}

/** Stored document line (order / purchase order item) as needed for re-pricing. */
export interface StoredDocLine {
  quantity: number;
  unitQuantity?: number | null;
  unitFactor?: number | null;
  unitPrice: number;
  enteredUnitPrice?: number | null;
  taxRate: number;
  otvRate?: number | null;
  vatNotCollected?: boolean;
  discountRate?: number | null;
  discountAmount?: number | null;
  discountAmountEntered?: number | null;
  exemptionCode?: string | null;
  withholdingCodeEntered?: string | null;
  reverseCharge?: boolean;
}

/**
 * Re-pricing input of a stored line: what the user entered (price, discount, codes), so a new
 * tax point re-resolves the rate version, exemption / withholding and threshold. Lines saved
 * before the entered values were kept fall back to the stored amounts (grossed up when prices
 * are tax-inclusive).
 */
export function storedLineInput(it: StoredDocLine, product: ProductEntity, pricesIncludeTax: boolean): DocLineInput {
  return { product, ...storedLineEntry(it, pricesIncludeTax) };
}

/** The entered values of a stored line (see storedLineInput). */
export function storedLineEntry(it: StoredDocLine, pricesIncludeTax: boolean): Omit<DocLineInput, 'product'> {
  const factor = Number(it.unitFactor) || 1;
  const qty = Number(it.unitQuantity) > 0 ? Number(it.unitQuantity) : Number(it.quantity);
  const gross = pricesIncludeTax ? (1 + (Number(it.otvRate) || 0) / 100) * (1 + (it.vatNotCollected ? 0 : Number(it.taxRate) || 0) / 100) : 1;
  const unitPrice = it.enteredUnitPrice !== null && it.enteredUnitPrice !== undefined ? Number(it.enteredUnitPrice) : Math.round(Number(it.unitPrice) * gross * 1e6) / 1e6;
  const rate = Number(it.discountRate) || 0;
  const discountAmount =
    it.discountAmountEntered !== null && it.discountAmountEntered !== undefined
      ? Number(it.discountAmountEntered)
      : !rate && Number(it.discountAmount) > 0
        ? round2(Number(it.discountAmount) * gross)
        : null;
  return {
    quantity: qty,
    unitPrice,
    factor,
    discountRate: rate || null,
    discountAmount,
    // A stored line without a code: switched off ('') unless it is a legacy 0 % line (then the product default applies).
    exemptionCode: it.exemptionCode ?? (Number(it.taxRate) === 0 ? null : ''),
    withholdingCode: it.withholdingCodeEntered ?? null,
    reverseCharge: !!it.reverseCharge,
  };
}
