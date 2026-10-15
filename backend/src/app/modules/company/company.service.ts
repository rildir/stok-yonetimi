import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UserEntity } from '../../entities/user.entity';
import { UserRole } from '../../entities/enums';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { RegisterCompanyDto, UpdateCompanyDto } from '../../dto/company.dto';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { defaultTaxRatesFor } from '../../shared/finance/tax-defaults';

export const COMPANY_DEFAULTS = {
  country: 'TR',
  defaultLanguage: 'tr',
  baseCurrency: 'TRY',
  timezone: 'Europe/Istanbul',
};

export interface EffectiveLocale {
  language: string;
  timezone: string;
  currency: string;
  country: string;
}

import { UnitEntity } from '../../entities/unit.entity';
import { STANDARD_UNITS } from '../../shared/inventory/units';
import { isDateKey, todayKey } from '../../shared/tr';
@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async getCompanyById(id: string): Promise<CompanyEntity | null> {
    return this.companyRepo.findOne({ where: { id } });
  }

  async getCurrentCompany(): Promise<CompanyEntity> {
    const company = await this.getCompanyById(this.tenant.companyId);
    if (!company) throw new NotFoundException(err('COMPANY_NOT_FOUND'));
    return company;
  }

  async updateCurrentCompany(dto: UpdateCompanyDto): Promise<CompanyEntity> {
    const company = await this.getCurrentCompany();
    if (dto.name !== undefined) company.name = dto.name.trim();
    if (dto.country !== undefined) company.country = dto.country;
    if (dto.defaultLanguage !== undefined) company.defaultLanguage = dto.defaultLanguage;
    if (dto.baseCurrency !== undefined) company.baseCurrency = dto.baseCurrency;
    if (dto.timezone !== undefined) company.timezone = dto.timezone;
    if (dto.pricesIncludeTax !== undefined) company.pricesIncludeTax = dto.pricesIncludeTax;
    if (dto.expiryAlertDays !== undefined) company.expiryAlertDays = dto.expiryAlertDays;
    if (dto.enabledComplianceModules !== undefined) {
      const next = [...new Set(dto.enabledComplianceModules)];
      // A module can only be switched off when no active product uses it.
      for (const module of company.enabledComplianceModules || []) {
        if (next.includes(module)) continue;
        const count = await this.companyRepo.manager.count(ProductEntity, { where: { companyId: company.id, regulatoryCategory: module, isDeleted: false } });
        if (count) throw new BadRequestException(err('COMPLIANCE_MODULE_IN_USE', { module, count }));
      }
      company.enabledComplianceModules = next;
    }
    if (dto.adjustmentApprovalThreshold !== undefined) {
      company.adjustmentApprovalThreshold = dto.adjustmentApprovalThreshold === null ? null : Number(dto.adjustmentApprovalThreshold);
    }
    if (dto.stockLockDate !== undefined) {
      const d = dto.stockLockDate || null;
      if (d && (!isDateKey(d) || d > todayKey(company.timezone))) throw new BadRequestException(err('STOCK_LOCK_DATE_INVALID'));
      company.stockLockDate = d;
    }
    return this.companyRepo.save(company);
  }

  /** User overrides win; company settings are the fallback. */
  resolveLocale(company: CompanyEntity, user?: Pick<UserEntity, 'language' | 'timezone'> | null): EffectiveLocale {
    return {
      language: user?.language || company.defaultLanguage,
      timezone: user?.timezone || company.timezone,
      currency: company.baseCurrency,
      country: company.country,
    };
  }

  async generateUniqueSlug(name: string): Promise<string> {
    const base = (this.stockHelper.slugify(name) || 'sirket').slice(0, 80);
    let slug = base;
    for (let i = 2; await this.companyRepo.exists({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  /** Public self-service sign-up: creates the company and its first admin. */
  async registerCompany(dto: RegisterCompanyDto): Promise<{ company: CompanyEntity; admin: UserEntity }> {
    const username = dto.username.trim();
    const slug = await this.generateUniqueSlug(dto.companyName);

    return this.dataSource.transaction(async (manager) => {
      if (await manager.exists(UserEntity, { where: { username } })) {
        throw new BadRequestException(err('USERNAME_TAKEN', { username }));
      }
      if (dto.email && (await manager.exists(UserEntity, { where: { email: dto.email } }))) {
        throw new BadRequestException(err('EMAIL_TAKEN'));
      }

      const company = await manager.save(
        CompanyEntity,
        manager.create(CompanyEntity, {
          name: dto.companyName.trim(),
          slug,
          country: dto.country || COMPANY_DEFAULTS.country,
          defaultLanguage: dto.defaultLanguage || COMPANY_DEFAULTS.defaultLanguage,
          baseCurrency: dto.baseCurrency || COMPANY_DEFAULTS.baseCurrency,
          timezone: dto.timezone || COMPANY_DEFAULTS.timezone,
        })
      );

      const admin = await manager.save(
        UserEntity,
        manager.create(UserEntity, {
          companyId: company.id,
          username,
          password: this.stockHelper.hashPassword(dto.password),
          role: UserRole.ADMIN,
          fullName: dto.fullName.trim(),
          email: dto.email || undefined,
          department: 'Yönetim',
          tokenVersion: 0,
        })
      );

      // Starter tax rates for the company's country (e.g. KDV for TR).
      for (const t of defaultTaxRatesFor(company.country)) {
        await manager.save(TaxRateEntity, manager.create(TaxRateEntity, { ...t, companyId: company.id }));
      }

      // Standard units of measure (pcs, box, kg, ...).
      for (const u of STANDARD_UNITS) {
        await manager.save(UnitEntity, manager.create(UnitEntity, { ...u, companyId: company.id, isStandard: true }));
      }

      return { company, admin };
    });
  }
}
