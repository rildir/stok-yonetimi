import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, Between, In } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { CompanyEntity } from '../../entities/company.entity';
import { CompanyEBelgeSettingsEntity, EDocumentDeliveryEntity, EDocumentEntity, EDocumentEventEntity, EDocumentNoticeEntity, EDocumentOutboxEntity, IncomingDocumentEntity } from '../../entities/ebelge.entity';
import { addBusinessDays, addDays, dateKeyInZone, dayWindow, daysBetween, isDateKey, todayKey } from '../../shared/tr';
import { htmlToPdf, renderHtml } from '../../shared/ebelge/render';
import { buildArchivePackage, sha256 } from '../../shared/ebelge/archive-package';
import { parseUbl } from '../../shared/ebelge/ubl/parser';
import { qrPayload } from '../../shared/ebelge/qr';
import { maskPersonalIdsInText } from '../../shared/kvkk/masking';
import { AuditService } from '../integrations/audit.service';
import { EBelgeSettingsService } from './ebelge-settings.service';
import { EDocumentService } from './edocument.service';

/**
 * Working-copy archive of e-documents (509 VI; TTK 82; VUK 253): list, detail with the GİB
 * timeline, XML / HTML / PDF, legal hold, daily integrity check (SHA-256) with the "3 iş günü"
 * notice warning, and the inspection package (ibraz paketi).
 */
@Injectable()
export class EDocumentArchiveService {
  private readonly logger = new Logger(EDocumentArchiveService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly settings: EBelgeSettingsService,
    private readonly edocs: EDocumentService,
    private readonly audit: AuditService,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async list(filter: { documentType?: string; direction?: string; from?: string; to?: string; q?: string } = {}) {
    const qb = this.dataSource.manager
      .createQueryBuilder(EDocumentEntity, 'e')
      .select(['e.id', 'e.ettn', 'e.documentType', 'e.direction', 'e.profileId', 'e.typeCode', 'e.documentNo', 'e.issueDate', 'e.sourceType', 'e.sourceId', 'e.counterpartyTaxId', 'e.counterpartyName', 'e.currency', 'e.payableAmount', 'e.sha256', 'e.gibStatus', 'e.lastStatusAt', 'e.retentionUntil', 'e.legalHold', 'e.integrityOk', 'e.integrityCheckedAt', 'e.createdAt'])
      .where('e.companyId = :c', { c: this.companyId });
    if (filter.documentType) qb.andWhere('e.documentType = :t', { t: filter.documentType });
    if (filter.direction) qb.andWhere('e.direction = :d', { d: filter.direction });
    if (filter.from && isDateKey(filter.from)) qb.andWhere('e.issueDate >= :f', { f: filter.from });
    if (filter.to && isDateKey(filter.to)) qb.andWhere('e.issueDate <= :to', { to: filter.to });
    if (filter.q) qb.andWhere('(e.documentNo LIKE :q OR e.counterpartyName LIKE :q OR e.ettn LIKE :q)', { q: `%${filter.q}%` });
    return qb.orderBy('e.createdAt', 'DESC').take(500).getMany();
  }

  private async find(id: string): Promise<EDocumentEntity> {
    const e = await this.dataSource.manager.findOne(EDocumentEntity, { where: { companyId: this.companyId, id } });
    if (!e) throw new NotFoundException(err('EDOC_NOT_FOUND'));
    return e;
  }

  /** e-Belge panel of an invoice / despatch advice / incoming document (by its source). */
  async bySource(sourceType: string, sourceId: string) {
    const rows = await this.dataSource.manager.find(EDocumentEntity, { where: { companyId: this.companyId, sourceType, sourceId }, order: { createdAt: 'ASC' } });
    if (!rows.length) return null;
    return this.detail(rows[0].id);
  }

  async detail(id: string) {
    const e = await this.find(id);
    const company = await this.dataSource.manager.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const [events, deliveries, notices, outbox] = await Promise.all([
      this.dataSource.manager.find(EDocumentEventEntity, { where: { eDocumentId: e.id }, order: { at: 'ASC' } }),
      this.dataSource.manager.find(EDocumentDeliveryEntity, { where: { eDocumentId: e.id }, order: { deliveredAt: 'ASC' } }),
      this.dataSource.manager.find(EDocumentNoticeEntity, { where: { eDocumentId: e.id }, order: { createdAt: 'ASC' } }),
      this.dataSource.manager.find(EDocumentOutboxEntity, { where: { ettn: e.ettn, companyId: this.companyId } }),
    ]);
    let cancelWindow: { days: number; deliveredAt: Date; lastDay: string; deadline: Date; open: boolean; daysLeft: number } | null = null;
    if (e.documentType === 'EARCHIVE' && e.direction === 'OUT' && deliveries[0]) {
      const days = Number(await this.edocs.param('EARSIV_CANCEL_DAYS', 8, company.country)) || 8;
      const w = dayWindow(new Date(deliveries[0].deliveredAt), days, new Date(), company.timezone);
      cancelWindow = { days, deliveredAt: deliveries[0].deliveredAt, ...w };
    }
    // e-Fatura: cancellation / objection notices are expected within EFATURA_CANCEL_OBJECTION_DAYS of
    // the delivery (TTK 21/2; low-confidence parameter) - a warning only, nothing is blocked.
    let noticeWindow: { days: number; deliveredAt: Date; lastDay: string; deadline: Date; open: boolean; daysLeft: number } | null = null;
    if (e.documentType === 'INVOICE' && e.direction === 'OUT' && e.gibStatus !== 'CANCELLED') {
      const delivered = events.filter((x) => x.status === 'DELIVERED').sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0];
      if (delivered) {
        const days = Number(await this.edocs.param('EFATURA_CANCEL_OBJECTION_DAYS', 8, company.country)) || 8;
        noticeWindow = { days, deliveredAt: delivered.at, ...dayWindow(new Date(delivered.at), days, new Date(), company.timezone) };
      }
    }
    let qr: Record<string, string> | null = null;
    try {
      qr = qrPayload(parseUbl(e.xml));
    } catch {
      qr = null;
    }
    // DATETIME has whole seconds: keep the life-cycle order for events of the same second.
    const RANK = ['RECEIVED', 'QUEUED', 'RETRY_REQUESTED', 'RETRY_SCHEDULED', 'SEND_FAILED', 'PROVIDER_RECEIVED', 'GIB_ACCEPTED', 'DELIVERED', 'PARTIALLY_ACCEPTED', 'ACCEPTED', 'AUTO_ACCEPTED', 'REJECTED', 'CANCELLED'];
    const rank = (s: string) => (RANK.indexOf(s) < 0 ? 50 : RANK.indexOf(s));
    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || rank(a.status) - rank(b.status));
    const { xml: _x, signedXml: _s, ...rest } = e;
    return { ...rest, hasSignedXml: !!e.signedXml, events, deliveries, notices, outbox: outbox.map(({ payload: _p, ...o }) => o), cancelWindow, noticeWindow, qr, legalArchive: 'PROVIDER' };
  }

  /** `maskPii`: caller without customers.pii.read - every TCKN / YKN in this copy is masked (R61). */
  async xml(id: string, signed = false, maskPii = false): Promise<{ fileName: string; xml: string }> {
    const e = await this.find(id);
    const xml = signed && e.signedXml ? e.signedXml : e.xml;
    return { fileName: `${e.documentNo || e.ettn}.xml`, xml: maskPii ? maskPersonalIdsInText(xml) : xml };
  }

  async html(id: string): Promise<string> {
    const e = await this.find(id);
    const s = await this.settings.getOrCreate();
    const watermark = e.gibStatus === 'CANCELLED' ? 'İPTAL' : e.gibStatus === 'REJECTED' ? 'REDDEDİLDİ' : null;
    return renderHtml(e.signedXml || e.xml, { logoDataUri: e.direction === 'OUT' ? s.logoDataUri : null, watermark });
  }

  async pdf(id: string, maskPii = false): Promise<{ fileName: string; pdf: Buffer }> {
    const e = await this.find(id);
    try {
      const html = await this.html(id);
      return { fileName: `${e.documentNo || e.ettn}.pdf`, pdf: await htmlToPdf(maskPii ? maskPersonalIdsInText(html) : html) };
    } catch (ex) {
      this.logger.warn(`local PDF rendering failed: ${(ex as Error).message}`);
    }
    // The integrator's PDF cannot be masked: not offered to callers without customers.pii.read.
    if (maskPii) throw new ServiceUnavailableException(err('EDOC_PDF_UNAVAILABLE'));
    // Alternative source: the integrator's PDF.
    try {
      const r = await this.settings.resolve();
      if (r.provider.capabilities().pdf) {
        const pdf = await r.provider.getPdf(r.ctx, e.ettn);
        if (pdf) return { fileName: `${e.documentNo || e.ettn}.pdf`, pdf };
      }
    } catch {
      /* fall through */
    }
    throw new ServiceUnavailableException(err('EDOC_PDF_UNAVAILABLE'));
  }

  async setLegalHold(id: string, hold: boolean, reason: string | null | undefined, user?: string) {
    const e = await this.find(id);
    if (hold && !String(reason || '').trim()) throw new BadRequestException(err('EDOC_LEGAL_HOLD_REASON_REQUIRED'));
    await this.dataSource.manager.update(EDocumentEntity, { id: e.id }, { legalHold: hold, legalHoldReason: hold ? String(reason).slice(0, 500) : null, legalHoldBy: hold ? user || this.tenant.actor.username || null : null });
    await this.audit.record({ companyId: this.companyId, action: hold ? 'edocument.legal_hold_set' : 'edocument.legal_hold_released', entityType: 'e_documents', entityId: e.id, after: { ettn: e.ettn, documentNo: e.documentNo, reason: reason || null } });
    return this.detail(id);
  }

  /**
   * Recomputes the SHA-256 of every archived XML. A mismatch marks the row, alerts the admins and
   * starts the "3 iş günü içinde GİB'e bildirim" countdown (509 VI; legal parameter
   * EDOC_INTEGRITY_NOTICE_BUSINESS_DAYS). The notice itself is filed through the official channel.
   */
  async integrityCheck(companyId = this.companyId): Promise<{ checked: number; mismatches: { id: string; ettn: string; documentNo: string | null }[]; noticeDeadline: string | null }> {
    const company = await this.dataSource.manager.findOneOrFail(CompanyEntity, { where: { id: companyId } });
    const rows: { id: string; ettn: string; documentNo: string | null; xml: string; sha256: string; signedXml: string | null; signedSha256: string | null; integrityOk: number | boolean }[] = await this.dataSource.query(
      'SELECT `id`, `ettn`, `documentNo`, `xml`, `sha256`, `signedXml`, `signedSha256`, `integrityOk` FROM `e_documents` WHERE `companyId` = ?',
      [companyId],
    );
    const now = new Date();
    const mismatches: { id: string; ettn: string; documentNo: string | null }[] = [];
    for (const r of rows) {
      const ok = sha256(Buffer.from(r.xml, 'utf8')) === r.sha256 && (!r.signedXml || !r.signedSha256 || sha256(Buffer.from(r.signedXml, 'utf8')) === r.signedSha256);
      if (!ok) mismatches.push({ id: r.id, ettn: r.ettn, documentNo: r.documentNo });
      await this.dataSource.query('UPDATE `e_documents` SET `integrityOk` = ?, `integrityCheckedAt` = ? WHERE `id` = ?', [ok ? 1 : 0, now, r.id]);
    }
    let noticeDeadline: string | null = null;
    if (mismatches.length) {
      const days = Number(await this.edocs.param('EDOC_INTEGRITY_NOTICE_BUSINESS_DAYS', 3, company.country)) || 3;
      const today = todayKey(company.timezone);
      // Public holidays (one legal-parameter row per year): this year's and, near the year end, next year's.
      const holidays = [
        ...((await this.edocs.param<string[]>('TCMB_NO_BULLETIN_DAYS', [], company.country, today)) || []),
        ...(addDays(today, 21).slice(0, 4) !== today.slice(0, 4) ? (await this.edocs.param<string[]>('TCMB_NO_BULLETIN_DAYS', [], company.country, addDays(today, 21))) || [] : []),
      ];
      noticeDeadline = addBusinessDays(today, days, holidays);
      const payload = { mismatches: mismatches.length, documents: mismatches.slice(0, 20), noticeDeadline };
      this.gateway.emitToCompanyAdmins(companyId, 'edocument_integrity_alert', payload);
      await this.audit.record({ companyId, action: 'edocument.integrity_failed', entityType: 'e_documents', username: 'ebelge-worker', after: payload });
    }
    return { checked: rows.length, mismatches, noticeDeadline };
  }

  /** İbraz paketi of a period (max. 366 days): XML + display + index.csv + manifest.sha256. */
  async archivePackage(from: string, to: string, user?: string): Promise<{ fileName: string; zip: Buffer; mismatches: string[] }> {
    if (!isDateKey(from) || !isDateKey(to) || to < from || daysBetween(from, to) > 366) throw new BadRequestException(err('EDOC_PERIOD_INVALID'));
    const company = await this.dataSource.manager.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const docs = await this.dataSource.manager.find(EDocumentEntity, { where: { companyId: this.companyId, issueDate: Between(from, to) }, order: { issueDate: 'ASC', documentNo: 'ASC' } });
    const s = await this.settings.getOrCreate();
    const out = [];
    let pdfOk = true;
    for (const d of docs) {
      let html: string | null = null;
      let pdf: Buffer | null = null;
      try {
        html = await renderHtml(d.signedXml || d.xml, { logoDataUri: d.direction === 'OUT' ? s.logoDataUri : null });
        if (pdfOk) {
          try {
            pdf = await htmlToPdf(html);
          } catch {
            pdfOk = false;
          }
        }
      } catch {
        html = null;
      }
      out.push({ ...d, pdf, html: pdf ? null : html });
    }
    const res = buildArchivePackage(out as any, { companyName: company.legalName || company.name, taxId: company.taxId ?? null, from, to, generatedAt: new Date() });
    await this.audit.record({ companyId: this.companyId, action: 'edocument.archive_package', entityType: 'e_documents', after: { from, to, documents: docs.length, mismatches: res.mismatches.length, user: user || null } });
    return { fileName: `ibraz-paketi_${company.taxId || company.slug}_${from}_${to}.zip`, zip: res.zip, mismatches: res.mismatches };
  }

  /** Banner data: provider outage, outbox backlog, MATBUDAN deadlines, inbox countdowns, integrity. */
  async status() {
    const s = await this.settings.getOrCreate();
    const company = await this.dataSource.manager.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const [queued, failed, dead, matbudan, inbox, broken] = await Promise.all([
      this.dataSource.manager.count(EDocumentOutboxEntity, { where: { companyId: this.companyId, status: In(['PENDING', 'PROCESSING']) } }),
      this.dataSource.manager.count(EDocumentOutboxEntity, { where: { companyId: this.companyId, status: 'FAILED' } }),
      this.dataSource.manager.count(EDocumentOutboxEntity, { where: { companyId: this.companyId, status: 'DEAD', lastErrorCode: In(['UNAVAILABLE', 'TIMEOUT', 'AUTH', 'REJECTED', 'ERROR', 'PROVIDER_NOT_CONFIGURED', 'NOT_SUPPORTED']) } }),
      this.edocs.matbudanDeadlines(this.companyId),
      this.dataSource.manager.find(IncomingDocumentEntity, { where: { companyId: this.companyId, status: 'RECEIVED' } }),
      this.dataSource.manager.count(EDocumentEntity, { where: { companyId: this.companyId, integrityOk: false } }),
    ]);
    const due = inbox.filter((r) => r.responseDueAt);
    return {
      mode: company.eDocumentMode,
      provider: s.provider,
      environment: s.environment,
      outage: s.outageSince ? { since: s.outageSince, message: s.lastProviderError } : null,
      outbox: { queued, failed, dead },
      matbudan: matbudan.filter((x) => x.status !== 'DONE'),
      inbox: { open: inbox.length, awaitingResponse: due.length, dueSoon: due.filter((r) => new Date(r.responseDueAt as Date).getTime() - Date.now() < 48 * 3600_000).length },
      integrityBroken: broken,
      today: dateKeyInZone(new Date(), company.timezone),
      legalArchive: s.legalArchive,
    };
  }

  /** Companies with an integrator (worker loop). */
  async providerCompanies(): Promise<string[]> {
    const rows = await this.dataSource.manager
      .createQueryBuilder(CompanyEBelgeSettingsEntity, 's')
      .innerJoin(CompanyEntity, 'c', 'c.id = s.companyId')
      .where('s.provider IS NOT NULL')
      .andWhere("c.eDocumentMode = 'PROVIDER'")
      .select('s.companyId', 'companyId')
      .getRawMany();
    return rows.map((r) => r.companyId);
  }
}
