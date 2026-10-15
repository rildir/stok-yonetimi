import { Injectable, BadRequestException, NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { FinanceService, isTrCompany } from '../../shared/services/finance.service';
import { LegalParameterService, pickParameter } from '../../shared/services/legal-parameter.service';
import { TcmbService } from '../../shared/services/tcmb.service';
import { addDays, isDateKey, todayKey } from '../../shared/tr';
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
    private readonly legalParams: LegalParameterService,
    private readonly tcmb: TcmbService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  // ─── Tax rates ───

  /** Active rates (validTo empty or not passed); `history` adds closed versions. */
  async listTaxRates(history = false): Promise<TaxRateEntity[]> {
    const rows = await this.taxRepo.find({ where: { companyId: this.companyId, isDeleted: false }, order: { rate: 'DESC', name: 'ASC' } });
    if (history) return rows;
    const today = await this.finance.today();
    return rows.filter((r) => !r.validTo || String(r.validTo).slice(0, 10) >= today);
  }

  /** Legal KDV rates valid on `date` for the company's country (TR: legal_parameters KDV_RATE_CATALOG). */
  async catalog(date?: string): Promise<{ country: string; date: string; locked: boolean; rates: { rate: number; code: string; isDefault?: boolean }[]; sourceRef: string | null; validTo?: string | null }> {
    const company = await this.finance.getCompany();
    const day = date && isDateKey(date) ? date : todayKey(company.timezone);
    const locked = isTrCompany(company);
    if (!locked) return { country: company.country, date: day, locked, rates: [], sourceRef: null };
    const row = pickParameter(await this.legalParams.list(company.country, 'KDV_RATE_CATALOG'), day);
    if (!row) throw new UnprocessableEntityException(err('LEGAL_PARAMETER_MISSING', { key: 'KDV_RATE_CATALOG', date: day }));
    return { country: company.country, date: day, locked, rates: row.value as { rate: number; code: string }[], sourceRef: row.sourceRef, validTo: row.validTo ?? null };
  }

  /** TR: a rate must be in the legal catalog on its start date; 0 % only as an EXEMPT row. Returns the catalog code. */
  private async assertCatalogRate(rate: number, kind: string, validFrom: string): Promise<{ code: string; validTo: string | null } | null> {
    if (!(await this.isTr())) return null;
    if (kind === 'EXEMPT') {
      if (Number(rate) !== 0) throw new UnprocessableEntityException(err('TAX_RATE_LOCKED_TR', { rate, allowed: '0 (EXEMPT)' }));
      return { code: 'KDV0', validTo: null };
    }
    const cat = await this.catalog(validFrom);
    const hit = cat.rates.find((r) => Number(r.rate) === Number(rate));
    if (!hit) throw new UnprocessableEntityException(err('TAX_RATE_LOCKED_TR', { rate, allowed: cat.rates.map((r) => `%${r.rate}`).join(', ') }));
    // A historical catalog rate (e.g. 18 % until 09.07.2023) ends with its legal period.
    return { code: hit.code, validTo: cat.validTo ? String(cat.validTo).slice(0, 10) : null };
  }

  private async isTr(): Promise<boolean> {
    return isTrCompany(await this.finance.getCompany());
  }

  private async getTaxRate(id: string): Promise<TaxRateEntity> {
    const t = await this.taxRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!t) throw new NotFoundException(err('TAX_RATE_NOT_FOUND'));
    return t;
  }

  /** Saves a tax rate; marking it default clears the flag on the others (same transaction). */
  private async saveTax(t: TaxRateEntity, manager?: EntityManager): Promise<TaxRateEntity> {
    const run = async (m: EntityManager) => {
      if (t.isDefault) {
        await m.update(TaxRateEntity, { companyId: this.companyId, isDefault: true }, { isDefault: false });
      }
      return m.save(TaxRateEntity, t);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  async createTaxRate(dto: CreateTaxRateDto): Promise<TaxRateEntity> {
    const tr = await this.isTr();
    const kind = dto.kind || (tr && Number(dto.rate) === 0 ? 'EXEMPT' : 'STANDARD');
    if (kind === 'EXEMPT' && Number(dto.rate) !== 0) throw new UnprocessableEntityException(err('TAX_RATE_LOCKED_TR', { rate: dto.rate, allowed: '0 (EXEMPT)' }));
    const validFrom = dto.validFrom || (await this.finance.today());
    const cat = await this.assertCatalogRate(dto.rate, kind, validFrom);
    const code = cat?.code ?? null;
    const active = await this.listTaxRates();
    if (tr && !cat?.validTo && active.some((r) => Number(r.rate) === Number(dto.rate) && r.kind === kind)) throw new ConflictException(err('TAX_RATE_EXISTS', { rate: dto.rate }));
    return this.saveTax(
      this.taxRepo.create({
        companyId: this.companyId,
        name: dto.name.trim(),
        rate: dto.rate,
        country: dto.country || null,
        isDefault: kind === 'EXEMPT' || cat?.validTo ? false : dto.isDefault ?? active.length === 0,
        kind,
        code,
        validFrom: tr && kind !== 'EXEMPT' ? validFrom : dto.validFrom || null,
        validTo: cat?.validTo ?? null,
        taxTypeCode: '0015',
      }),
    );
  }

  /**
   * Name / default flag change in place. A rate (or kind) change never edits the row:
   * the current version is closed the day before `validFrom` and a new version is inserted
   * (supersedesId); products move to it, document lines keep the version they used.
   * TR catalog (system) rates cannot be changed at all.
   */
  async updateTaxRate(id: string, dto: UpdateTaxRateDto): Promise<TaxRateEntity> {
    const t = await this.getTaxRate(id);
    const rateChanged = (dto.rate !== undefined && Number(dto.rate) !== Number(t.rate)) || (dto.kind !== undefined && dto.kind !== t.kind);
    if (!rateChanged) {
      if (dto.name !== undefined) t.name = dto.name.trim();
      if (dto.country !== undefined) t.country = dto.country || null;
      if (dto.isDefault !== undefined) {
        if (dto.isDefault && t.kind === 'EXEMPT') throw new BadRequestException(err('TAX_RATE_EXEMPT_DEFAULT'));
        t.isDefault = dto.isDefault;
      }
      return this.saveTax(t);
    }
    if (t.isSystem && (await this.isTr())) throw new UnprocessableEntityException(err('TAX_RATE_LOCKED_TR', { rate: dto.rate ?? t.rate, allowed: t.code || '' }));
    const validFrom = dto.validFrom || (await this.finance.today());
    const kind = dto.kind || t.kind;
    const rate = dto.rate ?? t.rate;
    const code = (await this.assertCatalogRate(rate, kind, validFrom))?.code ?? null;
    if (t.validFrom && String(t.validFrom).slice(0, 10) >= validFrom) {
      throw new BadRequestException(err('TAX_RATE_VERSION_DATE', { date: String(t.validFrom).slice(0, 10) }));
    }
    return this.dataSource.transaction(async (m) => {
      const wasDefault = t.isDefault;
      t.validTo = addDays(validFrom, -1);
      t.isDefault = false;
      await m.save(TaxRateEntity, t);
      const next = await this.saveTax(
        m.create(TaxRateEntity, {
          companyId: this.companyId,
          name: (dto.name ?? t.name).trim(),
          rate,
          country: dto.country !== undefined ? dto.country || null : t.country,
          isDefault: dto.isDefault ?? wasDefault,
          kind,
          code: code ?? t.code,
          validFrom,
          taxTypeCode: t.taxTypeCode || '0015',
          supersedesId: t.id,
        }),
        m,
      );
      await m.query('UPDATE `products` SET `taxRateId` = ? WHERE `companyId` = ? AND `taxRateId` = ?', [next.id, this.companyId, t.id]);
      return next;
    });
  }

  /** In use (products, order / purchase lines) -> 409 TAX_RATE_IN_USE; TR catalog rows are locked. */
  async deleteTaxRate(id: string): Promise<boolean> {
    const t = await this.getTaxRate(id);
    const count = async (sql: string) => Number((await this.dataSource.query(sql, [this.companyId, id]))[0]?.n || 0);
    const used =
      (await count('SELECT COUNT(*) AS n FROM `products` WHERE `companyId` = ? AND `taxRateId` = ? AND `isDeleted` = 0')) +
      (await count('SELECT COUNT(*) AS n FROM `order_items` i JOIN `orders` o ON o.`id` = i.`orderId` WHERE o.`companyId` = ? AND i.`taxRateId` = ?')) +
      (await count('SELECT COUNT(*) AS n FROM `purchase_order_items` i JOIN `purchase_orders` o ON o.`id` = i.`purchaseOrderId` WHERE o.`companyId` = ? AND i.`taxRateId` = ?'));
    if (used > 0) throw new ConflictException(err('TAX_RATE_IN_USE', { count: used }));
    if (t.isDefault) throw new BadRequestException(err('TAX_RATE_DEFAULT_DELETE'));
    if (t.isSystem && (await this.isTr())) throw new UnprocessableEntityException(err('TAX_RATE_LOCKED_TR', { rate: t.rate, allowed: t.code || '' }));
    t.isDeleted = true;
    await this.taxRepo.save(t);
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
      where: { companyId: this.companyId, baseCurrency: dto.baseCurrency, quoteCurrency: dto.quoteCurrency, date, rateType: 'FOREX_BUYING' },
    });
    if (existing) {
      // A manual entry over a TCMB rate turns it into a manual (documented) override.
      existing.rate = dto.rate;
      existing.source = 'MANUAL';
      existing.announcedAt = null;
      existing.bulletinNo = null;
      return this.rateRepo.save(existing);
    }
    return this.rateRepo.save(
      this.rateRepo.create({ companyId: this.companyId, baseCurrency: dto.baseCurrency, quoteCurrency: dto.quoteCurrency, rate: dto.rate, date }),
    );
  }

  async updateExchangeRate(id: string, dto: UpdateExchangeRateDto): Promise<ExchangeRateEntity> {
    const r = await this.getExchangeRate(id);
    if (dto.rate !== undefined && Number(dto.rate) !== Number(r.rate)) {
      r.rate = dto.rate;
      r.source = 'MANUAL';
      r.announcedAt = null;
      r.bulletinNo = null;
    }
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

  /** Fetches a TCMB bulletin (default today's) into the company's rates (TR companies with TRY base only: the rows are X/TRY). */
  async fetchTcmb(date?: string) {
    const company = await this.finance.getCompany();
    if (!isTrCompany(company) || (company.baseCurrency || '').toUpperCase() !== 'TRY') throw new UnprocessableEntityException(err('TCMB_TR_ONLY'));
    if (date && !isDateKey(date)) throw new BadRequestException(err('VALIDATION_DATE'));
    return this.tcmb.fetchForCompany(this.companyId, date || null);
  }

  /** Rate the tax engine would use for `currency` on `taxPointDate`. */
  async taxRateFor(currency: string, taxPointDate?: string) {
    const day = taxPointDate && isDateKey(taxPointDate) ? taxPointDate : await this.finance.today();
    return { currency: currency.toUpperCase(), taxPointDate: day, ...(await this.finance.taxFxRate(currency, day)) };
  }
}
