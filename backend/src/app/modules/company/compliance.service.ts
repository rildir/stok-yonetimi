import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { CompanyEntity } from '../../entities/company.entity';
import { CompanyEBelgeProfileEntity } from '../../entities/company-ebelge-profile.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { RefdataService } from '../../shared/services/refdata.service';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { AppGateway } from '../../app.gateway';
import { EBelgeProfileDto, UpdateFiscalDto } from '../../dto/company.dto';
import { computeObligations, guessIdentityType, isDateKey, ObligationReport, todayKey, validateTaxId } from '../../shared/tr';
import { fiscalStatus, FiscalStatus } from './fiscal';

export type AlertSeverity = 'error' | 'warning' | 'info';
export interface ComplianceAlert {
  code: string;
  severity: AlertSeverity;
  params?: Record<string, string | number | null>;
}

export interface ComplianceReport {
  today: string;
  country: string;
  fiscal: FiscalStatus;
  obligations: ObligationReport | null;
  missingParameters: string[];
  alerts: ComplianceAlert[];
}

const PROFILE_FIELDS = ['annualGrossSales', 'sectorFlagsEFatura', 'sectorFlagsEIrsaliye', 'eFaturaSince', 'eArsivSince', 'eIrsaliyeSince', 'mandatoryVsVoluntary', 'gibWrittenNoticeDate', 'corporateEvents'] as const;

/**
 * Fiscal identity, e-Belge profile / obligations and the compliance panel.
 * Also runs an hourly check that pushes a `compliance_warning` socket event to a
 * company when a yearly legal parameter (e.g. VUK232_INVOICE_LIMIT) is missing
 * for the current year in the company's time zone (e.g. on 1 January).
 */
@Injectable()
export class ComplianceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ComplianceService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly notified = new Set<string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly refdata: RefdataService,
    private readonly legalParams: LegalParameterService,
    private readonly gateway: AppGateway,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.notifyMissingParameters().catch((e) => this.logger.warn(e.message)), 3600_000);
    this.timer.unref?.();
    setTimeout(() => void this.notifyMissingParameters().catch(() => undefined), 15_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async company(): Promise<CompanyEntity> {
    const c = await this.dataSource.manager.findOne(CompanyEntity, { where: { id: this.tenant.companyId } });
    if (!c) throw new NotFoundException(err('COMPANY_NOT_FOUND'));
    return c;
  }

  // ------------------------------------------------------------------ fiscal
  async updateFiscal(dto: UpdateFiscalDto): Promise<CompanyEntity> {
    const c = await this.company();
    const set = <K extends keyof CompanyEntity>(k: K, v: unknown) => {
      if (v !== undefined) (c as unknown as Record<string, unknown>)[k as string] = v === '' ? null : v;
    };
    set('legalName', dto.legalName);
    set('mersisNo', dto.mersisNo);
    set('tradeRegistryNo', dto.tradeRegistryNo);
    set('tradeRegistryOffice', dto.tradeRegistryOffice);
    set('kepAddress', dto.kepAddress ? dto.kepAddress.toLowerCase() : dto.kepAddress);
    set('website', dto.website);
    set('phone', dto.phone);
    set('email', dto.email);
    set('bookkeepingType', dto.bookkeepingType);

    if (dto.taxIdType !== undefined || dto.taxId !== undefined) {
      const taxId = dto.taxId !== undefined ? dto.taxId || null : c.taxId ?? null;
      let type = dto.taxIdType !== undefined ? dto.taxIdType || null : c.taxIdType ?? null;
      if (taxId && !type) type = guessIdentityType(taxId) === 'VKN' ? 'VKN' : 'TCKN';
      if (taxId) {
        const code = validateTaxId({ identityType: type, identityNumber: taxId });
        if (code) throw new BadRequestException(err(code));
      }
      c.taxId = taxId;
      c.taxIdType = taxId ? type : type || null;
    }
    if (dto.taxOfficeCode !== undefined || dto.taxOfficeName !== undefined) {
      const office = await this.refdata.resolveTaxOffice(
        dto.taxOfficeCode !== undefined ? dto.taxOfficeCode : c.taxOfficeCode,
        dto.taxOfficeName !== undefined ? dto.taxOfficeName : c.taxOfficeName,
      );
      c.taxOfficeCode = office.code;
      c.taxOfficeName = office.name;
    }
    if (dto.address !== undefined) {
      c.address = await this.refdata.normalizeAddress(dto.address || {}, c.country || 'TR');
    }
    const saved = await this.dataSource.manager.save(CompanyEntity, c);
    this.gateway.emitToCompany(c.id, 'company_updated', { fiscal: fiscalStatus(saved) });
    return saved;
  }

  /** Guard for legal documents (WP4+): 422 COMPANY_FISCAL_INFO_MISSING when required fields are empty. */
  async assertFiscalComplete(company?: CompanyEntity): Promise<void> {
    const c = company ?? (await this.company());
    const st = fiscalStatus(c);
    if (!st.complete) throw new UnprocessableEntityException(err('COMPANY_FISCAL_INFO_MISSING', { fields: st.missing.join(', ') }));
  }

  // ------------------------------------------------------------------ e-Belge profile
  async getProfile(companyId = this.tenant.companyId): Promise<CompanyEBelgeProfileEntity> {
    const p = await this.dataSource.manager.findOne(CompanyEBelgeProfileEntity, { where: { companyId } });
    return (
      p ??
      this.dataSource.manager.create(CompanyEBelgeProfileEntity, {
        companyId,
        annualGrossSales: [],
        sectorFlagsEFatura: [],
        sectorFlagsEIrsaliye: [],
        corporateEvents: [],
      })
    );
  }

  async saveProfile(dto: EBelgeProfileDto): Promise<CompanyEBelgeProfileEntity> {
    const p = await this.getProfile();
    for (const k of PROFILE_FIELDS) {
      const v = (dto as Record<string, unknown>)[k];
      if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v === '' ? null : v;
    }
    // One gross-sales row per year (last wins), sorted.
    const byYear = new Map((p.annualGrossSales || []).map((r) => [Number(r.year), { year: Number(r.year), amount: Number(r.amount) }]));
    p.annualGrossSales = [...byYear.values()].sort((a, b) => a.year - b.year);
    p.companyId = this.tenant.companyId;
    return this.dataSource.manager.save(CompanyEBelgeProfileEntity, p);
  }

  async obligations(asOf?: string): Promise<{ profile: CompanyEBelgeProfileEntity; report: ObligationReport; sources: Record<string, string> }> {
    const c = await this.company();
    const today = isDateKey(asOf) ? asOf : todayKey(c.timezone);
    const profile = await this.getProfile(c.id);
    const { params, sources } = await this.legalParams.obligationParams(c.country || 'TR', today);
    const report = computeObligations(profile, c.bookkeepingType, today, params);
    return { profile, report, sources };
  }

  // ------------------------------------------------------------------ compliance panel
  async compliance(asOf: string | undefined, isAdmin: boolean): Promise<ComplianceReport> {
    const c = await this.company();
    const today = isDateKey(asOf) ? asOf : todayKey(c.timezone);
    const country = c.country || 'TR';
    const fiscal = fiscalStatus(c);
    const alerts: ComplianceAlert[] = [];
    if (!fiscal.complete) alerts.push({ code: 'FISCAL_INFO_MISSING', severity: country === 'TR' ? 'error' : 'warning', params: { fields: fiscal.missing.join(', ') } });

    let obligations: ObligationReport | null = null;
    if (country === 'TR') {
      obligations = (await this.obligations(today)).report;
      for (const o of [obligations.eFatura, obligations.eArsiv, obligations.eIrsaliye]) {
        if (o.status === 'overdue') alerts.push({ code: 'EBELGE_OVERDUE', severity: 'error', params: { kind: o.kind, date: o.mandatoryFrom } });
        else if (o.status === 'upcoming') alerts.push({ code: 'EBELGE_UPCOMING', severity: 'warning', params: { kind: o.kind, date: o.mandatoryFrom, days: o.daysLeft } });
      }
      if (obligations.warnings.includes('BOOKKEEPING_TYPE_MISSING')) alerts.push({ code: 'BOOKKEEPING_TYPE_MISSING', severity: 'warning' });
      const salesMissing = obligations.warnings.find((w) => w.startsWith('GROSS_SALES_MISSING:'));
      if (salesMissing) alerts.push({ code: 'GROSS_SALES_MISSING', severity: 'info', params: { year: Number(salesMissing.split(':')[1]) } });
    }

    const missingParameters = isAdmin ? await this.legalParams.missingAnnual(Number(today.slice(0, 4)), country) : [];
    for (const key of missingParameters) alerts.push({ code: 'LEGAL_PARAMETER_MISSING', severity: 'warning', params: { key, year: Number(today.slice(0, 4)) } });
    return { today, country, fiscal, obligations, missingParameters, alerts };
  }

  /** Hourly: tell each company once per day when a yearly legal parameter is missing for "today". */
  async notifyMissingParameters(now = new Date()): Promise<number> {
    const companies = await this.dataSource.manager.find(CompanyEntity, { select: ['id', 'country', 'timezone'] });
    let sent = 0;
    for (const c of companies) {
      const today = todayKey(c.timezone, now);
      const missing = await this.legalParams.missingAnnual(Number(today.slice(0, 4)), c.country || 'TR');
      if (!missing.length) continue;
      const key = `${c.id}:${today}`;
      if (this.notified.has(key)) continue;
      this.notified.add(key);
      this.gateway.emitToCompany(c.id, 'compliance_warning', { code: 'LEGAL_PARAMETER_MISSING', keys: missing, year: Number(today.slice(0, 4)) });
      sent++;
    }
    if (sent) this.logger.warn(`legal parameters missing for the current year; notified ${sent} compan${sent === 1 ? 'y' : 'ies'}`);
    return sent;
  }
}
