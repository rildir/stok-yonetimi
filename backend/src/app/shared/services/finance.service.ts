import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../i18n/app-error';
import { CompanyEntity } from '../../entities/company.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { ProductEntity } from '../../entities/product.entity';
import { TenantContext } from '../tenant/tenant-context.service';
import { RateRow, convertAmount, findRate } from '../finance/currency';
import { LineAmounts, DocumentTotals, calculateLine, calculateTotals } from '../finance/tax';
import { LegalParameterService } from './legal-parameter.service';
import { dateKeyInZone, todayKey } from '../tr';

/** Exchange-rate day of a document: instants (stored in UTC) count in the company time zone. */
export function rateDay(date: Date | string | null | undefined, tz?: string | null): string {
  if (date instanceof Date) return dateKeyInZone(date, tz || undefined);
  if (!date) return todayKey(tz || undefined);
  return String(date).slice(0, 10);
}

/**
 * Tenant-aware currency conversion and tax rate resolution.
 * Pure math lives in ../finance/{currency,tax}.ts (unit tested).
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly legalParams: LegalParameterService,
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

  async getRates(manager?: EntityManager): Promise<RateRow[]> {
    return this.m(manager).find(ExchangeRateEntity, { where: { companyId: this.tenant.companyId } });
  }

  /** Units of `to` per 1 `from`; throws EXCHANGE_RATE_MISSING when unknown. */
  async requireRate(from: string, to: string, date?: Date | string | null, manager?: EntityManager): Promise<number> {
    if (from === to) return 1;
    const company = await this.getCompany(manager);
    const rate = findRate(await this.getRates(manager), from, to, rateDay(date, company.timezone), company.baseCurrency);
    if (rate === null) throw new BadRequestException(err('EXCHANGE_RATE_MISSING', { from, to }));
    return rate;
  }

  /** Converts an amount to the company base currency (null if no rate). */
  async convertToBase(amount: number, currency: string, date?: Date | string | null, manager?: EntityManager): Promise<number | null> {
    const company = await this.getCompany(manager);
    return convertAmount(amount, currency, company.baseCurrency, await this.getRates(manager), rateDay(date, company.timezone), company.baseCurrency);
  }

  async getDefaultTaxRate(manager?: EntityManager): Promise<TaxRateEntity | null> {
    return this.m(manager).findOne(TaxRateEntity, {
      where: { companyId: this.tenant.companyId, isDefault: true, isDeleted: false },
    });
  }

  /** Tax % for a product: its own rate, else the company default, else 0. */
  async taxRateForProduct(product: Pick<ProductEntity, 'taxRateId'>, manager?: EntityManager): Promise<number> {
    if (product.taxRateId) {
      const tr = await this.m(manager).findOne(TaxRateEntity, {
        where: { id: product.taxRateId, companyId: this.tenant.companyId },
      });
      if (tr) return Number(tr.rate);
    }
    const def = await this.getDefaultTaxRate(manager);
    return def ? Number(def.rate) : 0;
  }

  /**
   * Prices document lines in `currency`. A line's `unitPrice` (as entered,
   * gross when the company uses tax-inclusive prices) overrides the product
   * price, which is otherwise converted from the product's own currency.
   */
  async priceLines(
    /** quantity/unitPrice are in the entered unit; `factor` = base units per entered unit (default 1) */
    items: { product: ProductEntity; quantity: number; unitPrice?: number | null; factor?: number }[],
    currency: string,
    date?: Date | string | null,
    manager?: EntityManager,
  ): Promise<{ lines: LineAmounts[]; totals: DocumentTotals; exchangeRate: number; pricesIncludeTax: boolean }> {
    const company = await this.getCompany(manager);
    const rates = await this.getRates(manager);
    const rateOrThrow = (from: string, to: string) => {
      const r = findRate(rates, from, to, rateDay(date, company.timezone), company.baseCurrency);
      if (r === null) throw new BadRequestException(err('EXCHANGE_RATE_MISSING', { from, to }));
      return r;
    };
    const exchangeRate = rateOrThrow(currency, company.baseCurrency);
    const lines: LineAmounts[] = [];
    for (const it of items) {
      const entered =
        it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice > 0
          ? Number(it.unitPrice)
          : Number(it.product.price) * (it.factor || 1) * rateOrThrow(it.product.currency || company.baseCurrency, currency);
      const taxRate = await this.taxRateForProduct(it.product, manager);
      lines.push(calculateLine({ quantity: it.quantity, unitPrice: entered, taxRate }, company.pricesIncludeTax));
    }
    return { lines, totals: calculateTotals(lines), exchangeRate, pricesIncludeTax: company.pricesIncludeTax };
  }

  async assertTaxRate(taxRateId: string | null | undefined, manager?: EntityManager): Promise<void> {
    if (!taxRateId) return;
    const exists = await this.m(manager).exists(TaxRateEntity, {
      where: { id: taxRateId, companyId: this.tenant.companyId, isDeleted: false },
    });
    if (!exists) throw new BadRequestException(err('TAX_RATE_NOT_FOUND'));
  }
}
