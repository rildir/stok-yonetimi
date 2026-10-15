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
import { StockAdjustmentRequestEntity } from '../../entities/stock-adjustment-request.entity';
import type { ControlChange } from '../stock-movement/stock-movement.service';
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

  async updateCurrentCompany(dto: UpdateCompanyDto): Promise<CompanyEntity & { pendingApproval?: { code: string; request: StockAdjustmentRequestEntity } }> {
    const company = await this.getCurrentCompany();
    if (dto.name !== undefined) company.name = dto.name.trim();
    if (dto.country !== undefined) company.country = dto.country;
    if (dto.defaultLanguage !== undefined) company.defaultLanguage = dto.defaultLanguage;
    if (dto.baseCurrency !== undefined) company.baseCurrency = dto.baseCurrency;
    if (dto.timezone !== undefined) company.timezone = dto.timezone;
    if (dto.pricesIncludeTax !== undefined) company.pricesIncludeTax = dto.pricesIncludeTax;
    if (dto.expiryAlertDays !== undefined) company.expiryAlertDays = dto.expiryAlertDays;
    if (dto.isImporterOrOreProducer !== undefined) company.isImporterOrOreProducer = dto.isImporterOrOreProducer;
    if (dto.fxAutoFetch !== undefined) company.fxAutoFetch = dto.fxAutoFetch;
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
    // Stock controls: tightening applies at once; loosening (lock date moved back or cleared,
    // threshold raised or switched off) is a maker-checker request for a second administrator.
    const loosen: ControlChange = {};
    if (dto.adjustmentApprovalThreshold !== undefined) {
      const next = dto.adjustmentApprovalThreshold === null ? null : Number(dto.adjustmentApprovalThreshold);
      const cur = company.adjustmentApprovalThreshold === null || company.adjustmentApprovalThreshold === undefined ? null : Number(company.adjustmentApprovalThreshold);
      if (cur !== null && (next === null || next > cur)) loosen.adjustmentApprovalThreshold = next;
      else company.adjustmentApprovalThreshold = next;
    }
    if (dto.stockLockDate !== undefined) {
      const d = dto.stockLockDate || null;
      if (d && (!isDateKey(d) || d > todayKey(company.timezone))) throw new BadRequestException(err('STOCK_LOCK_DATE_INVALID'));
      const cur = company.stockLockDate ? String(company.stockLockDate).slice(0, 10) : null;
      if (cur && (d === null || d < cur)) loosen.stockLockDate = d;
      else company.stockLockDate = d;
    }
    if (!Object.keys(loosen).length) return this.companyRepo.save(company);

    const reason = String(dto.controlChangeReason || '').trim();
    if (!reason) throw new BadRequestException(err('CONTROL_CHANGE_REASON_REQUIRED'));
    return this.dataSource.transaction(async (manager) => {
      const open = await manager
        .createQueryBuilder(StockAdjustmentRequestEntity, 'r')
        .where('r.companyId = :c AND r.status = :s AND r.payload LIKE :p', { c: company.id, s: 'PENDING', p: '%"kind":"COMPANY_CONTROL"%' })
        .getCount();
      if (open) throw new BadRequestException(err('CONTROL_CHANGE_ALREADY_PENDING'));
      const saved = await manager.save(CompanyEntity, company);
      const actor = this.tenant.actor;
      const request = await manager.save(
        StockAdjustmentRequestEntity,
        manager.create(StockAdjustmentRequestEntity, {
          companyId: company.id,
          status: 'PENDING',
          productId: null,
          productName: null,
          warehouseId: null,
          quantityDelta: 0,
          estimatedValue: 0,
          currency: company.baseCurrency,
          threshold: Number(company.adjustmentApprovalThreshold) || 0,
          payload: {
            kind: 'COMPANY_CONTROL',
            change: loosen,
            current: { stockLockDate: company.stockLockDate ? String(company.stockLockDate).slice(0, 10) : null, adjustmentApprovalThreshold: company.adjustmentApprovalThreshold ?? null },
            note: reason,
          },
          requestedBy: String(actor.username || 'System').slice(0, 100),
          requestedByUserId: actor.userId ?? null,
        }),
      );
      return Object.assign(saved, { pendingApproval: { code: 'CONTROL_CHANGE_PENDING_APPROVAL', request } });
    });
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
          fxAutoFetch: (dto.country || COMPANY_DEFAULTS.country).toUpperCase() === 'TR',
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
