import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { FinanceService } from '../../shared/services/finance.service';
import { toIsoDate } from '../../shared/finance/currency';
import { CreateExchangeRateDto, CreateTaxRateDto, UpdateExchangeRateDto, UpdateTaxRateDto } from '../../dto/finance.dto';

/** CRUD for per-company tax rates and exchange rates. */
@Injectable()
export class FinanceSettingsService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(TaxRateEntity)
    private readonly taxRepo: Repository<TaxRateEntity>,
    @InjectRepository(ExchangeRateEntity)
    private readonly rateRepo: Repository<ExchangeRateEntity>,
    private readonly finance: FinanceService,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  // ─── Tax rates ───

  listTaxRates(): Promise<TaxRateEntity[]> {
    return this.taxRepo.find({ where: { companyId: this.companyId, isDeleted: false }, order: { rate: 'DESC', name: 'ASC' } });
  }

  private async getTaxRate(id: string): Promise<TaxRateEntity> {
    const t = await this.taxRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!t) throw new NotFoundException(err('TAX_RATE_NOT_FOUND'));
    return t;
  }

  /** Saves a tax rate; marking it default clears the flag on the others (same transaction). */
  private async saveTax(t: TaxRateEntity): Promise<TaxRateEntity> {
    return this.dataSource.transaction(async (manager) => {
      if (t.isDefault) {
        await manager.update(TaxRateEntity, { companyId: this.companyId, isDefault: true }, { isDefault: false });
      }
      return manager.save(TaxRateEntity, t);
    });
  }

  async createTaxRate(dto: CreateTaxRateDto): Promise<TaxRateEntity> {
    const hasAny = await this.taxRepo.exists({ where: { companyId: this.companyId, isDeleted: false } });
    return this.saveTax(
      this.taxRepo.create({
        companyId: this.companyId,
        name: dto.name.trim(),
        rate: dto.rate,
        country: dto.country || null,
        isDefault: dto.isDefault ?? !hasAny,
      }),
    );
  }

  async updateTaxRate(id: string, dto: UpdateTaxRateDto): Promise<TaxRateEntity> {
    const t = await this.getTaxRate(id);
    if (dto.name !== undefined) t.name = dto.name.trim();
    if (dto.rate !== undefined) t.rate = dto.rate;
    if (dto.country !== undefined) t.country = dto.country || null;
    if (dto.isDefault !== undefined) t.isDefault = dto.isDefault;
    return this.saveTax(t);
  }

  async deleteTaxRate(id: string): Promise<boolean> {
    const t = await this.getTaxRate(id);
    if (t.isDefault) throw new BadRequestException(err('TAX_RATE_DEFAULT_DELETE'));
    t.isDeleted = true;
    await this.dataSource.transaction(async (manager) => {
      // Products fall back to the company default rate.
      await manager.query('UPDATE `products` SET `taxRateId` = NULL WHERE `companyId` = ? AND `taxRateId` = ?', [this.companyId, id]);
      await manager.save(TaxRateEntity, t);
    });
    return true;
  }

  // ─── Exchange rates ───

  listExchangeRates(): Promise<ExchangeRateEntity[]> {
    return this.rateRepo.find({ where: { companyId: this.companyId }, order: { date: 'DESC', baseCurrency: 'ASC', quoteCurrency: 'ASC' } });
  }

  private async getExchangeRate(id: string): Promise<ExchangeRateEntity> {
    const r = await this.rateRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!r) throw new NotFoundException(err('EXCHANGE_RATE_NOT_FOUND'));
    return r;
  }

  async createExchangeRate(dto: CreateExchangeRateDto): Promise<ExchangeRateEntity> {
    if (dto.baseCurrency === dto.quoteCurrency) throw new BadRequestException(err('EXCHANGE_RATE_SAME_CURRENCY'));
    const date = toIsoDate(dto.date);
    // Upsert: one rate per pair per day.
    const existing = await this.rateRepo.findOne({
      where: { companyId: this.companyId, baseCurrency: dto.baseCurrency, quoteCurrency: dto.quoteCurrency, date },
    });
    if (existing) {
      existing.rate = dto.rate;
      return this.rateRepo.save(existing);
    }
    return this.rateRepo.save(
      this.rateRepo.create({ companyId: this.companyId, baseCurrency: dto.baseCurrency, quoteCurrency: dto.quoteCurrency, rate: dto.rate, date }),
    );
  }

  async updateExchangeRate(id: string, dto: UpdateExchangeRateDto): Promise<ExchangeRateEntity> {
    const r = await this.getExchangeRate(id);
    if (dto.rate !== undefined) r.rate = dto.rate;
    if (dto.date !== undefined) r.date = toIsoDate(dto.date);
    try {
      return await this.rateRepo.save(r);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException(err('EXCHANGE_RATE_DUPLICATE'));
      throw e;
    }
  }

  async deleteExchangeRate(id: string): Promise<boolean> {
    const r = await this.getExchangeRate(id);
    await this.rateRepo.remove(r);
    return true;
  }

  async convert(amount: number, from: string, to?: string, date?: string) {
    const company = await this.finance.getCompany();
    const target = (to || company.baseCurrency).toUpperCase();
    const rate = await this.finance.requireRate(from.toUpperCase(), target, date);
    return { amount, from: from.toUpperCase(), to: target, rate, result: Math.round(amount * rate * 100) / 100 };
  }
}
