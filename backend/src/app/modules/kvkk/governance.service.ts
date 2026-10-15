import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { DsrRequestEntity, PrivacyNoticeEntity, SubprocessorEntity } from '../../entities/kvkk.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { UserEntity } from '../../entities/user.entity';
import { WebhookEndpointEntity } from '../../entities/webhook-endpoint.entity';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { DATA_CATALOG, SECURITY_MEASURES, inventoryRows } from '../../shared/kvkk/data-catalog';
import { isAbroad, sccNoticeStatus, validateTransfer } from '../../shared/kvkk/transfer';
import { toCsv } from '../../shared/integrations/csv';
import { kvkkDaysLeft, todayKey } from '../../shared/tr';
import { esc, legalPage } from '../inventory-accounting/legal-print';
import { invalidateCompanyPolicy, companyPolicy, totpSetupBlocking } from '../../shared/kvkk/company-policy';
import { NoticeService } from './notice.service';
import { RetentionService } from './retention.service';
import { IncidentService } from './incident.service';
import { AuditService } from '../integrations/audit.service';

export interface SubprocessorInput {
  name?: string;
  service?: string;
  country?: string;
  transferBasis?: string | null;
  dataCategories?: string[] | null;
  dpaSignedAt?: string | null;
  sccNotifiedAt?: string | null;
  website?: string | null;
  active?: boolean;
}

export interface KvkkSettingsInput {
  kvkkContactEmail?: string | null;
  verbisEmployeeCount?: number | null;
  verbisBalanceSheetTotal?: number | null;
  verbisMainActivitySpecial?: boolean;
  verbisRegistered?: boolean;
  verbisRegistrationNo?: string | null;
}

/**
 * Sub-processors and transfers (R62), the VERBİS-shaped inventory and threshold warning (R64),
 * the company's KVKK settings and the status summary used by the dashboard banner.
 */
@Injectable()
export class GovernanceService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly legal: LegalParameterService,
    private readonly notices: NoticeService,
    private readonly retention: RetentionService,
    private readonly incidents: IncidentService,
    private readonly audit: AuditService,
  ) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  // ------------------------------------------------------------------ sub-processors and transfers
  async subprocessors() {
    const rows = await this.ds.manager.find(SubprocessorEntity, { where: [{ companyId: this.companyId }, { companyId: IsNull() }], order: { name: 'ASC' } });
    const hooks = await this.ds.manager.find(WebhookEndpointEntity, { where: { companyId: this.companyId }, order: { createdAt: 'DESC' } });
    return {
      platform: rows.filter((r) => !r.companyId),
      tenant: rows.filter((r) => r.companyId),
      transfers: hooks.map((h) => ({
        id: h.id,
        host: hostOf(h.url),
        destinationCountry: h.destinationCountry,
        abroad: isAbroad(h.destinationCountry),
        transferBasis: h.transferBasis,
        sccSignedAt: h.sccSignedAt ?? null,
        sccNotifiedAt: h.sccNotifiedAt ?? null,
        sccNotice: sccNoticeStatus(h.sccSignedAt, h.sccNotifiedAt),
        includePersonalData: h.includePersonalData,
        active: h.active,
      })),
    };
  }

  private applySub(s: SubprocessorEntity, input: SubprocessorInput) {
    if (input.name !== undefined) s.name = input.name.trim();
    if (input.service !== undefined) s.service = input.service.trim();
    if (input.country !== undefined) s.country = (input.country || 'TR').toUpperCase();
    if (input.transferBasis !== undefined) s.transferBasis = input.transferBasis || (isAbroad(s.country) ? '' : 'DOMESTIC');
    if (input.dataCategories !== undefined) s.dataCategories = input.dataCategories || null;
    if (input.dpaSignedAt !== undefined) s.dpaSignedAt = input.dpaSignedAt || null;
    if (input.sccNotifiedAt !== undefined) s.sccNotifiedAt = input.sccNotifiedAt || null;
    if (input.website !== undefined) s.website = input.website || null;
    if (input.active !== undefined) s.active = !!input.active;
    if (!s.name || !s.service) throw new BadRequestException(err('VALIDATION_FAILED'));
    if (!isAbroad(s.country) && !s.transferBasis) s.transferBasis = 'DOMESTIC';
    const code = validateTransfer({ destinationCountry: s.country, transferBasis: s.transferBasis, sccNotifiedAt: s.sccNotifiedAt, active: s.active });
    if (code) throw new BadRequestException(err(code, { country: s.country }));
  }

  async createSubprocessor(input: SubprocessorInput) {
    const s = this.ds.manager.create(SubprocessorEntity, { companyId: this.companyId, country: 'TR', transferBasis: 'DOMESTIC', active: true });
    this.applySub(s, input);
    return this.ds.manager.save(SubprocessorEntity, s);
  }

  private async tenantSub(id: string) {
    const s = await this.ds.manager.findOne(SubprocessorEntity, { where: { id, companyId: this.companyId } });
    if (!s) throw new NotFoundException(err('SUBPROCESSOR_NOT_FOUND'));
    return s;
  }

  async updateSubprocessor(id: string, input: SubprocessorInput) {
    const s = await this.tenantSub(id);
    this.applySub(s, input);
    return this.ds.manager.save(SubprocessorEntity, s);
  }

  async deleteSubprocessor(id: string) {
    const s = await this.tenantSub(id);
    await this.ds.manager.remove(SubprocessorEntity, s);
    return { success: true };
  }

  // ------------------------------------------------------------------ VERBİS
  async verbisStatus() {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const today = todayKey(c.timezone);
    const country = c.country || 'TR';
    const active = async (key: string) => (await this.legal.list(country, key)).find((p) => p.validFrom <= today && (!p.validTo || p.validTo >= today)) ?? null;
    const empRow = await active('VERBIS_EMPLOYEE_THRESHOLD');
    const balRow = await active('VERBIS_BALANCE_SHEET_THRESHOLD');
    const spEmpRow = await active('VERBIS_SPECIAL_EMPLOYEE_THRESHOLD');
    const spBalRow = await active('VERBIS_SPECIAL_BALANCE_SHEET_THRESHOLD');
    const nonBsRow = await active('VERBIS_NON_BALANCE_SHEET_EMPLOYEES_ONLY');
    const empLimit = empRow ? Number(empRow.value) : null;
    const balLimit = balRow ? Number(balRow.value) : null;
    // Kurul 2025/2393: controllers not keeping balance-sheet books (işletme hesabı, basit usul) are
    // assessed on the employee count only.
    const balanceSheetBooks = !c.bookkeepingType || c.bookkeepingType === 'BILANCO';
    const balanceApplies = balanceSheetBooks || !(nonBsRow && nonBsRow.value === true);
    const emp = c.verbisEmployeeCount ?? null;
    const bal = c.verbisBalanceSheetTotal ?? null;
    const reasons: string[] = [];
    if (c.verbisMainActivitySpecial) {
      // Kurul 2025/1572: main activity special-category processing below 10 employees and 10M TL is exempt.
      const spEmp = spEmpRow ? Number(spEmpRow.value) : null;
      const spBal = spBalRow ? Number(spBalRow.value) : null;
      const exemptionKnown = spEmp !== null || spBal !== null;
      const overSpecial = (spEmp !== null && (emp ?? 0) >= spEmp) || (balanceApplies && spBal !== null && (bal ?? 0) >= spBal);
      if (!exemptionKnown || overSpecial) reasons.push('MAIN_ACTIVITY_SPECIAL');
    }
    if (empLimit !== null && (emp ?? 0) >= empLimit) reasons.push('EMPLOYEES');
    if (balanceApplies && balLimit !== null && (bal ?? 0) >= balLimit) reasons.push('BALANCE_SHEET');
    const missing = emp === null || (balanceApplies && bal === null);
    return {
      required: reasons.length > 0,
      reasons,
      inputsMissing: missing,
      registered: c.verbisRegistered,
      registrationNo: c.verbisRegistrationNo ?? null,
      warning: reasons.length > 0 && !c.verbisRegistered,
      bookkeepingType: c.bookkeepingType ?? null,
      balanceSheetApplies: balanceApplies,
      employeeCount: emp,
      balanceSheetTotal: bal,
      thresholds: {
        employees: empLimit !== null ? { value: empLimit, sourceRef: empRow!.sourceRef, confidence: empRow!.confidence } : null,
        balanceSheet: balLimit !== null && balanceApplies ? { value: balLimit, sourceRef: balRow!.sourceRef, confidence: balRow!.confidence, note: balRow!.note ?? null } : null,
        specialEmployees: spEmpRow ? { value: Number(spEmpRow.value), sourceRef: spEmpRow.sourceRef, confidence: spEmpRow.confidence } : null,
        specialBalanceSheet: spBalRow && balanceApplies ? { value: Number(spBalRow.value), sourceRef: spBalRow.sourceRef, confidence: spBalRow.confidence } : null,
        nonBalanceSheetEmployeesOnly: nonBsRow ? { sourceRef: nonBsRow.sourceRef, confidence: nonBsRow.confidence } : null,
      },
    };
  }

  async inventory(lang: 'tr' | 'en' = 'tr') {
    const text = await this.notices.retentionTexts(lang);
    return { rows: inventoryRows(text), measures: SECURITY_MEASURES, catalog: DATA_CATALOG };
  }

  async inventoryCsv(locale: 'tr' | 'en' = 'tr', username?: string) {
    const { rows } = await this.inventory('tr');
    await this.audit.record({ companyId: this.companyId, action: 'read_export', entityType: 'kvkk_inventory', after: { rows: rows.length } });
    return toCsv(Object.keys(rows[0]), rows as any, locale);
  }

  async inventoryHtml() {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const { rows, measures } = await this.inventory('tr');
    const head = ['Veri kategorisi', 'Kişi grubu', 'Kişisel veriler', 'İşleme amaçları', 'Hukuki sebep', 'Alıcı grupları', 'Saklama süresi', 'Yurt dışı aktarım'];
    const keys = ['veriKategorisi', 'veriKonusuKisiGrubu', 'kisiselVeriler', 'islemeAmaclari', 'hukukiSebep', 'aliciGruplari', 'saklamaSuresi', 'yurtDisiAktarim'];
    const status = await this.verbisStatus();
    const body =
      `<p>Kişisel veri işleme envanteri (KVKK md. 16; Veri Sorumluları Sicili Hakkında Yönetmelik md. 5). VERBİS kaydı: ${status.registered ? `var (${esc(status.registrationNo || '-')})` : 'yok'}${status.required ? ' - kayıt yükümlülüğü eşikleri aşılıyor' : ''}.</p>` +
      `<table class="t"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${esc((r as any)[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>` +
      `<h3>Alınan idari ve teknik tedbirler</h3><ul>${measures.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
    return legalPage('Kişisel Veri İşleme Envanteri', c, body, { landscape: true });
  }

  // ------------------------------------------------------------------ settings
  async settings() {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    return {
      kvkkContactEmail: c.kvkkContactEmail ?? null,
      verbisEmployeeCount: c.verbisEmployeeCount ?? null,
      verbisBalanceSheetTotal: c.verbisBalanceSheetTotal ?? null,
      verbisMainActivitySpecial: c.verbisMainActivitySpecial,
      verbisRegistered: c.verbisRegistered,
      verbisRegistrationNo: c.verbisRegistrationNo ?? null,
      adminTotpRequired: c.adminTotpRequired,
      adminTotpGraceUntil: c.adminTotpGraceUntil ?? null,
      status: c.status,
      closedAt: c.closedAt ?? null,
      retentionUntil: c.retentionUntil ?? null,
      lastFullExportAt: c.lastFullExportAt ?? null,
    };
  }

  async updateSettings(input: KvkkSettingsInput) {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    if (input.kvkkContactEmail !== undefined) c.kvkkContactEmail = input.kvkkContactEmail || null;
    if (input.verbisEmployeeCount !== undefined) c.verbisEmployeeCount = input.verbisEmployeeCount ?? null;
    if (input.verbisBalanceSheetTotal !== undefined) c.verbisBalanceSheetTotal = input.verbisBalanceSheetTotal ?? null;
    if (input.verbisMainActivitySpecial !== undefined) c.verbisMainActivitySpecial = !!input.verbisMainActivitySpecial;
    if (input.verbisRegistered !== undefined) c.verbisRegistered = !!input.verbisRegistered;
    if (input.verbisRegistrationNo !== undefined) c.verbisRegistrationNo = input.verbisRegistrationNo || null;
    await this.ds.manager.save(CompanyEntity, c);
    invalidateCompanyPolicy(c.id);
    return this.settings();
  }

  // ------------------------------------------------------------------ status (banner / overview)
  async status(user: { sub: string; role: string; totpEnabled?: boolean }) {
    const now = new Date();
    const dsr = await this.ds.manager.find(DsrRequestEntity, { where: { companyId: this.companyId, status: In(['RECEIVED', 'IN_PROGRESS']) }, order: { dueAt: 'ASC' } });
    const dueSoon = dsr.filter((r) => kvkkDaysLeft(r.dueAt, now) <= 7);
    const overdue = dsr.filter((r) => new Date(r.dueAt).getTime() < now.getTime());
    const incidents = await this.incidents.openSummary();
    const destruction = await this.retention.schedule();
    const verbis = await this.verbisStatus();
    const policy = await companyPolicy(this.ds, this.companyId);
    const u = await this.ds.manager.findOne(UserEntity, { where: { id: user.sub }, select: ['id', 'role', 'totpEnabledAt'] });
    const totpPending = user.role === 'admin' && policy.adminTotpRequired && !u?.totpEnabledAt;
    const published = await this.ds.manager.count(PrivacyNoticeEntity, { where: { companyId: this.companyId, status: 'PUBLISHED' } });
    const alerts: { code: string; severity: 'error' | 'warning' | 'info'; params?: Record<string, unknown> }[] = [];
    if (overdue.length) alerts.push({ code: 'KVKK_DSR_OVERDUE', severity: 'error', params: { n: overdue.length } });
    else if (dueSoon.length) alerts.push({ code: 'KVKK_DSR_DUE_SOON', severity: 'warning', params: { n: dueSoon.length, days: kvkkDaysLeft(dueSoon[0].dueAt, now) } });
    if (incidents.nearest) alerts.push({ code: 'KVKK_BREACH_DEADLINE', severity: incidents.nearest.hoursLeft < 24 ? 'error' : 'warning', params: { no: incidents.nearest.incidentNo, hours: incidents.nearest.hoursLeft } });
    if (incidents.suspected) alerts.push({ code: 'KVKK_BREACH_SUSPECTED', severity: 'warning', params: { n: incidents.suspected } });
    if (destruction.overdue) alerts.push({ code: 'KVKK_DESTRUCTION_OVERDUE', severity: 'warning', params: { months: destruction.maxMonths } });
    if (destruction.pendingRuns) alerts.push({ code: 'KVKK_DESTRUCTION_PENDING', severity: 'info', params: { n: destruction.pendingRuns } });
    if (verbis.warning) alerts.push({ code: 'KVKK_VERBIS_REQUIRED', severity: 'warning' });
    if (totpPending) alerts.push({ code: totpSetupBlocking(policy, { role: user.role, totpEnabledAt: u?.totpEnabledAt }) ? 'KVKK_TOTP_REQUIRED' : 'KVKK_TOTP_SETUP', severity: 'warning', params: { date: policy.adminTotpGraceUntil } });
    if (!published) alerts.push({ code: 'KVKK_NOTICE_MISSING', severity: 'info' });
    return {
      dsr: { open: dsr.length, dueSoon: dueSoon.length, overdue: overdue.length, nearestDueAt: dsr[0]?.dueAt ?? null },
      incidents,
      destruction,
      verbis: { required: verbis.required, registered: verbis.registered, warning: verbis.warning },
      totp: { required: policy.adminTotpRequired, pending: totpPending, graceUntil: policy.adminTotpGraceUntil },
      notices: { published },
      company: { status: policy.status, retentionUntil: policy.retentionUntil },
      alerts,
    };
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '-';
  }
}
