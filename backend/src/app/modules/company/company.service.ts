import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CompanyEntity } from '../../entities/company.entity';
import { UserEntity } from '../../entities/user.entity';
import { UserRole } from '../../entities/enums';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { RegisterCompanyDto, UpdateCompanyDto } from '../../dto/company.dto';

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
    if (!company) throw new NotFoundException('Şirket bulunamadı.');
    return company;
  }

  async updateCurrentCompany(dto: UpdateCompanyDto): Promise<CompanyEntity> {
    const company = await this.getCurrentCompany();
    if (dto.name !== undefined) company.name = dto.name.trim();
    if (dto.country !== undefined) company.country = dto.country;
    if (dto.defaultLanguage !== undefined) company.defaultLanguage = dto.defaultLanguage;
    if (dto.baseCurrency !== undefined) company.baseCurrency = dto.baseCurrency;
    if (dto.timezone !== undefined) company.timezone = dto.timezone;
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
        throw new BadRequestException(`"${username}" kullanıcı adı zaten kullanımda.`);
      }
      if (dto.email && (await manager.exists(UserEntity, { where: { email: dto.email } }))) {
        throw new BadRequestException('Bu e-posta adresi zaten kullanımda.');
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

      return { company, admin };
    });
  }
}
