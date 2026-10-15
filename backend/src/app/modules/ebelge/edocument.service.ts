import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { InvoiceEntity } from '../../entities/invoice.entity';
import { DespatchEntity } from '../../entities/despatch.entity';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { OtvCodeEntity, TaxExemptionCodeEntity, WithholdingCodeEntity } from '../../entities/tax-code.entity';
import { EDocumentDeliveryEntity, EDocumentEntity, EDocumentEventEntity, EDocumentNoticeEntity, EDocumentOutboxEntity } from '../../entities/ebelge.entity';
import { canTransition, dateKeyInZone, dayWindow, DESPATCH_TRANSITIONS, despatchDeliveryChannel, INVOICE_TRANSITIONS, invoiceEDocType, outboxBackoffMs, retentionUntil, routeInvoiceProfile, SpecialTaxId, todayKey, zonedDayEnd, addDays } from '../../shared/tr';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { AuditService } from '../integrations/audit.service';
import { DocumentHooks, EDocumentHooks, InvoiceCancelInput } from '../documents/document-support';
import { InvoiceService } from '../documents/invoice.service';
import { mapDespatch, mapInvoice, MapContext } from '../../shared/ebelge/ubl/mapper';
import { buildInvoiceXml } from '../../shared/ebelge/ubl/invoice.builder';
import { buildDespatchXml } from '../../shared/ebelge/ubl/despatch.builder';
import { UblDocType, UblIssue, validateUbl } from '../../shared/ebelge/validation/ubl-validator';
import { xsltAttachment } from '../../shared/ebelge/render';
import { sha256 } from '../../shared/ebelge/archive-package';
import { EArsivDelivery, OutgoingDocument, ProviderDocType, ProviderError, ProviderStatus, SendResult } from '../../shared/ebelge/provider';
import { EBelgeSettingsService, ResolvedProvider } from './ebelge-settings.service';
import { RegistryService } from './registry.service';

/** Provider statuses after which nothing changes any more. */
const FINAL_PROVIDER_STATUSES: ProviderStatus[] = ['ACCEPTED', 'REJECTED', 'CANCELLED'];

export interface ArchiveInput {
  ettn: string;
  documentType: string;
  direction: 'OUT' | 'IN';
  profileId?: string | null;
  typeCode?: string | null;
  documentNo?: string | null;
  issueDate?: string | null;
  sourceType: string;
  sourceId?: string | null;
  counterpartyTaxId?: string | null;
  counterpartyName?: string | null;
  currency?: string | null;
  payableAmount?: number | null;
  xml: string;
  gibStatus?: string | null;
  providerRef?: string | null;
}

/** 422 UBL_VALIDATION_FAILED with every finding in Turkish and English (see I18nExceptionFilter). */
export function ublValidationError(issues: UblIssue[]): UnprocessableEntityException {
  return new UnprocessableEntityException({ ...err('UBL_VALIDATION_FAILED', { count: issues.length, first: issues[0]?.tr || '' }), details: issues.map((i) => ({ tr: i.tr, en: i.en, source: i.source })) });
}

/**
 * e-Belge core (WP5): scenario routing, UBL-TR build + validation, working-copy archive, outbox
 * (idempotent by ETTN), provider status timeline, e-Arşiv / e-Fatura cancellation. Registered as
 * DocumentHooks.eDocument, so invoices and despatch advices of companies in PROVIDER mode flow
 * through it inside their own transaction.
 */
@Injectable()
export class EDocumentService implements OnModuleInit, EDocumentHooks {
  private readonly logger = new Logger(EDocumentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly settings: EBelgeSettingsService,
    private readonly registry: RegistryService,
    private readonly legal: LegalParameterService,
    private readonly audit: AuditService,
    private readonly gateway: AppGateway,
    private readonly hooks: DocumentHooks,
    private readonly invoices: InvoiceService,
  ) {}

  onModuleInit() {
    this.hooks.eDocument = this;
  }

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async param<T>(key: string, fallback: T, country = 'TR', date: string = todayKey()): Promise<T> {
    const v = await this.legal.paramOrNull<T>(key, date, country || 'TR');
    return v === null || v === undefined ? fallback : v;
  }

  // ------------------------------------------------------------------ mapping context
  async mapContext(m: EntityManager, company: CompanyEntity, r: ResolvedProvider, doc: { documentNo: string; issueDate: string; orderIds?: string[] | null; orderId?: string | null; productIds?: string[]; earsivSendType?: 'ELEKTRONIK' | 'KAGIT' | null }): Promise<MapContext> {
    const date = doc.issueDate;
    const [ex, wh, otv] = await Promise.all([m.find(TaxExemptionCodeEntity), m.find(WithholdingCodeEntity), m.find(OtvCodeEntity)]);
    const names = (rows: { code: string; nameTr: string; validFrom: string; validTo?: string | null }[]) => {
      const out: Record<string, string> = {};
      for (const r0 of rows.filter((x) => String(x.validFrom) <= date && (!x.validTo || String(x.validTo) >= date))) out[r0.code] = r0.nameTr;
      for (const r0 of rows) if (!out[r0.code]) out[r0.code] = r0.nameTr;
      return out;
    };
    const ids = [...new Set([...(doc.orderIds || []), ...(doc.orderId ? [doc.orderId] : [])])];
    const orders = ids.length ? await m.find(OrderEntity, { where: { companyId: company.id, id: In(ids) } }) : [];
    const first = orders.find((o) => o.id === (doc.orderIds?.[0] || doc.orderId)) || orders[0];
    const products = doc.productIds?.length ? await m.find(ProductEntity, { where: { companyId: company.id, id: In(doc.productIds) } }) : [];
    const gtbVkn = await this.param<string | null>('EXPORT_GTB_VKN', null, company.country);
    const gtb = await this.param<{ name: string; district: string; city: string; taxOffice?: string } | null>('EXPORT_GTB_PARTY', null, company.country);
    return {
      timezone: company.timezone,
      exemptionNames: names(ex as any),
      withholdingNames: names(wh as any),
      otvNames: names(otv as any),
      specialIds: await this.param<SpecialTaxId[]>('SPECIAL_TAX_IDS', [], company.country),
      orderRef: first ? { id: first.orderNumber, issueDate: dateKeyInZone(new Date(first.createdAt), company.timezone) } : null,
      extraOrderNumbers: orders.filter((o) => o !== first).map((o) => o.orderNumber),
      earsivSendType: doc.earsivSendType ?? null,
      xslt: xsltAttachment(doc.documentNo, doc.issueDate, r.settings.logoDataUri),
      products: Object.fromEntries(products.map((p) => [p.id, { sku: p.sku, gtin14: (p as any).gtin14 ?? null, regulatoryCategory: (p as any).regulatoryCategory ?? null }])),
      sectoralItemIds: r.settings.sectoralItemIdsEnabled,
      exportCustoms: gtbVkn && gtb ? { vkn: gtbVkn, name: gtb.name, district: gtb.district, city: gtb.city, taxOffice: gtb.taxOffice ?? null } : null,
    };
  }

  private async buyerOf(m: EntityManager, inv: InvoiceEntity): Promise<{ taxId: string | null; type: string | null; email: string | null; preferred: string | null }> {
    if (inv.customerId) {
      const c = await m.findOne(CustomerEntity, { where: { companyId: inv.companyId, id: inv.customerId } });
      if (c) return { taxId: c.identityNumber || null, type: c.identityType || null, email: c.email || null, preferred: c.preferredProfile || null };
    }
    if (inv.supplierId) {
      const s = await m.findOne(SupplierEntity, { where: { companyId: inv.companyId, id: inv.supplierId } });
      if (s) return { taxId: s.identityNumber || null, type: s.identityType || null, email: s.email || null, preferred: null };
    }
    const b = inv.buyerSnapshot;
    return { taxId: b?.taxId || null, type: b?.taxIdType || null, email: b?.email || null, preferred: null };
  }

  private registrable(taxId: string | null, type: string | null): boolean {
    return !!taxId && /^(\d{10}|\d{11})$/.test(taxId) && ['VKN', 'TCKN', 'YKN'].includes(String(type || '').toUpperCase() || (taxId.length === 10 ? 'VKN' : 'TCKN'));
  }

  // ------------------------------------------------------------------ hooks: invoices
  /** Scenario routing right before numbering (509 IV.1.1, IV.2.4.4); 422 PROFILE_NOT_SUPPORTED otherwise. */
  async beforeInvoiceIssue(m: EntityManager, inv: InvoiceEntity, company: CompanyEntity): Promise<void> {
    const r = await this.settings.resolve(company.id, m);
    const buyer = await this.buyerOf(m, inv);
    let registered = false;
    if (this.registrable(buyer.taxId, buyer.type)) {
      registered = (await this.registry.check(buyer.taxId as string, 'INVOICE', { manager: m })).registered;
    }
    const isExport = String(buyer.type || '').toUpperCase() === 'FOREIGN' && inv.typeCode === 'ISTISNA' && (inv.lines || []).some((l) => ['301', '302'].includes(String(l.exemptionCode)));
    const profile = routeInvoiceProfile({ kind: inv.kind, typeCode: inv.typeCode, buyerRegistered: registered, preferredProfile: buyer.preferred, isExport, exportEnabled: r.settings.exportEnabled });
    if (!profile) throw new UnprocessableEntityException(err('PROFILE_NOT_SUPPORTED', { profile: isExport ? 'IHRACAT' : '-', type: inv.typeCode }));
    inv.profileId = profile;
  }

  /** UBL-TR + validation + archive + outbox; the invoice becomes QUEUED. */
  async afterInvoiceIssued(m: EntityManager, inv: InvoiceEntity, company: CompanyEntity): Promise<InvoiceEntity> {
    const r = await this.settings.resolve(company.id, m);
    const docType = invoiceEDocType(inv.profileId);
    const buyer = await this.buyerOf(m, inv);
    const channel = docType === 'EARCHIVE' ? (buyer.email && r.settings.earsivDefaultChannel !== 'PAPER' ? r.settings.earsivDefaultChannel : 'PAPER') : 'GIB';
    const sendType = channel === 'PAPER' ? 'KAGIT' : 'ELEKTRONIK';
    const ctx = await this.mapContext(m, company, r, {
      documentNo: inv.documentNo as string,
      issueDate: String(inv.issueDate),
      orderIds: inv.orderIds,
      productIds: (inv.lines || []).map((l) => l.productId).filter(Boolean) as string[],
      earsivSendType: docType === 'EARCHIVE' ? sendType : null,
    });
    const mapped = mapInvoice(inv, ctx);
    if (mapped.issues.length) throw ublValidationError(mapped.issues);
    const xml = buildInvoiceXml(mapped.input);
    const issues = await validateUbl(xml, 'Invoice', { earchive: docType === 'EARCHIVE' });
    if (issues.length) throw ublValidationError(issues);
    const eDoc = await this.archive(m, {
      ettn: inv.ettn,
      documentType: docType,
      direction: 'OUT',
      profileId: inv.profileId,
      typeCode: inv.typeCode,
      documentNo: inv.documentNo,
      issueDate: String(inv.issueDate),
      sourceType: 'invoice',
      sourceId: inv.id,
      counterpartyTaxId: mapped.input.customer.identifiers.find((i) => i.schemeID === 'VKN' || i.schemeID === 'TCKN')?.value ?? null,
      counterpartyName: inv.buyerSnapshot?.name ?? null,
      currency: inv.currency,
      payableAmount: mapped.input.totals.payable,
      xml,
      gibStatus: 'QUEUED',
    });
    await this.enqueue(m, eDoc, 'SEND', docType === 'EARCHIVE' ? { sendType, channel, recipient: channel === 'EMAIL' ? buyer.email : null } : { receiverTaxId: eDoc.counterpartyTaxId });
    // Language-neutral: code CHANNEL + the channel value (translated by the UI), else the scenario.
    await this.event(m, eDoc, 'QUEUED', 'SYSTEM', docType === 'EARCHIVE' ? 'CHANNEL' : null, docType === 'EARCHIVE' ? channel : inv.profileId);
    return this.setInvoiceStatus(m, inv.id, 'QUEUED');
  }

  /** e-Arşiv: within the window from the delivery; e-Fatura: the external notice is recorded and reported. */
  async beforeInvoiceCancel(m: EntityManager, inv: InvoiceEntity, input: InvoiceCancelInput): Promise<void> {
    const eDoc = await m.findOne(EDocumentEntity, { where: { companyId: inv.companyId, ettn: inv.ettn, direction: 'OUT' } });
    if (!eDoc) return;
    const outbox = await m.findOne(EDocumentOutboxEntity, { where: { ettn: inv.ettn, operation: 'SEND' }, lock: { mode: 'pessimistic_write' } });
    if (outbox && outbox.status === 'PROCESSING') throw new ConflictException(err('EDOC_ALREADY_SENT', { ettn: inv.ettn }));
    if (outbox && outbox.status !== 'DONE') {
      // Not yet handed to the integrator. Withdrawing it would leave a gap in the series GİB / the
      // integrator sees (VUK 231/1; 509 V.4): it has to be sent first and cancelled afterwards.
      throw new ConflictException(err('EDOC_CANCEL_BEFORE_SEND', { documentNo: inv.documentNo || inv.ettn }));
    }
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: inv.companyId } });
    const r = await this.settings.resolve(inv.companyId, m);
    if (eDoc.documentType === 'EARCHIVE') {
      const delivery = await m.findOne(EDocumentDeliveryEntity, { where: { eDocumentId: eDoc.id }, order: { deliveredAt: 'ASC' } });
      const days = Number(await this.param('EARSIV_CANCEL_DAYS', 8, company.country)) || 8;
      if (delivery) {
        const w = dayWindow(new Date(delivery.deliveredAt), days, new Date(), company.timezone);
        if (!w.open) {
          throw new ConflictException(err('EARCHIVE_CANCEL_WINDOW_EXPIRED', { days, deliveredOn: dateKeyInZone(new Date(delivery.deliveredAt), company.timezone), lastDay: w.lastDay }));
        }
      }
      try {
        await r.provider.cancelEArsiv(r.ctx, inv.ettn, input.reason);
      } catch (e) {
        throw this.providerHttpError(e, inv.companyId);
      }
    } else {
      if (!input.noticeChannel || !input.noticeDate) throw new UnprocessableEntityException(err('EFATURA_CANCEL_NOTICE_REQUIRED'));
      const notice = await m.save(
        EDocumentNoticeEntity,
        m.create(EDocumentNoticeEntity, { companyId: inv.companyId, eDocumentId: eDoc.id, ettn: inv.ettn, kind: 'CANCEL', direction: 'OUT', channel: input.noticeChannel, noticeDate: input.noticeDate, reference: input.noticeRef ?? null, reason: input.reason, createdBy: this.tenant.actor.username ?? null }),
      );
      if (r.provider.capabilities().reportCancellationOrObjection) {
        try {
          const rep = await r.provider.reportCancellationOrObjection(r.ctx, { ettn: inv.ettn, kind: 'CANCEL', channel: input.noticeChannel, noticeDate: input.noticeDate, reference: input.noticeRef, reason: input.reason });
          await m.update(EDocumentNoticeEntity, { id: notice.id }, { reportedToProvider: true, reportedAt: new Date(), providerReference: rep.reference });
        } catch (e) {
          throw this.providerHttpError(e, inv.companyId);
        }
      }
    }
    await this.updateEDoc(m, eDoc, { gibStatus: 'CANCELLED' });
    // The caller saves the invoice header from this object: keep invoices.gibStatus in line with the archive.
    inv.gibStatus = 'CANCELLED';
    await this.event(m, eDoc, 'CANCELLED', 'USER', eDoc.documentType === 'EARCHIVE' ? 'EARSIV_CANCEL' : `NOTICE_${input.noticeChannel}`, input.reason, this.tenant.actor.username);
  }

  /** Objection received from the buyer (TTK 21/2): the notice is recorded and reported to the integrator. */
  async objectionChanged(m: EntityManager, inv: InvoiceEntity, objection: boolean, input: InvoiceCancelInput): Promise<void> {
    if (!objection) return;
    const eDoc = await m.findOne(EDocumentEntity, { where: { companyId: inv.companyId, ettn: inv.ettn, direction: 'OUT' } });
    if (!eDoc || !input.noticeChannel) return;
    const notice = await m.save(
      EDocumentNoticeEntity,
      m.create(EDocumentNoticeEntity, { companyId: inv.companyId, eDocumentId: eDoc.id, ettn: inv.ettn, kind: 'OBJECTION', direction: 'IN', channel: input.noticeChannel, noticeDate: input.noticeDate || todayKey(), reference: input.noticeRef ?? null, reason: input.reason || null, createdBy: this.tenant.actor.username ?? null }),
    );
    const r = await this.settings.resolve(inv.companyId, m);
    if (r.provider.capabilities().reportCancellationOrObjection) {
      try {
        const rep = await r.provider.reportCancellationOrObjection(r.ctx, { ettn: inv.ettn, kind: 'OBJECTION', channel: input.noticeChannel, noticeDate: notice.noticeDate, reference: input.noticeRef, reason: input.reason });
        await m.update(EDocumentNoticeEntity, { id: notice.id }, { reportedToProvider: true, reportedAt: new Date(), providerReference: rep.reference });
      } catch (e) {
        this.logger.warn(`objection report failed: ${(e as Error).message}`);
      }
    }
    await this.event(m, eDoc, eDoc.gibStatus || 'OBJECTION', 'USER', 'OBJECTION', input.reason || null, this.tenant.actor.username);
  }

  // ------------------------------------------------------------------ hooks: despatch advices
  async beforeDespatchApprove(m: EntityManager, d: DespatchEntity, company: CompanyEntity): Promise<void> {
    await this.settings.resolve(company.id, m);
    const b = d.buyerSnapshot || d.sellerSnapshot;
    const taxId = b?.taxId || (d.purpose === 'TRANSFER' ? company.taxId : null);
    let registered = false;
    if (this.registrable(taxId || null, b?.taxIdType || (taxId ? (taxId.length === 10 ? 'VKN' : 'TCKN') : null))) {
      registered = (await this.registry.check(taxId as string, 'DESPATCH', { manager: m })).registered;
    }
    // 509 V.5.3: always an e-İrsaliye; only the channel to the receiver differs.
    d.deliveryChannel = despatchDeliveryChannel(registered, b?.email);
  }

  async afterDespatchApproved(m: EntityManager, d: DespatchEntity, company: CompanyEntity): Promise<void> {
    const r = await this.settings.resolve(company.id, m);
    const ctx = await this.mapContext(m, company, r, { documentNo: d.documentNo as string, issueDate: String(d.issueDate), orderId: d.orderId });
    const mapped = mapDespatch(d, ctx);
    if (mapped.issues.length) throw ublValidationError(mapped.issues);
    const xml = buildDespatchXml(mapped.input);
    const issues = await validateUbl(xml, 'DespatchAdvice');
    if (issues.length) throw ublValidationError(issues);
    const eDoc = await this.archive(m, {
      ettn: d.ettn,
      documentType: 'DESPATCH',
      direction: 'OUT',
      profileId: d.profileId,
      typeCode: d.typeCode,
      documentNo: d.documentNo,
      issueDate: String(d.issueDate),
      sourceType: 'despatch',
      sourceId: d.id,
      counterpartyTaxId: mapped.input.customer.identifiers.find((i) => i.schemeID === 'VKN' || i.schemeID === 'TCKN')?.value ?? null,
      counterpartyName: d.buyerSnapshot?.name ?? null,
      xml,
      gibStatus: 'QUEUED',
    });
    let deadlineAt: Date | null = null;
    if (d.typeCode === 'MATBUDAN' && d.paperDate) {
      // The paper despatch is registered as e-İrsaliye by the end of the following day (e-İrsaliye Kılavuzu §11-12).
      const days = Number(await this.param('MATBUDAN_DEADLINE_DAYS', 1, company.country)) || 1;
      deadlineAt = zonedDayEnd(addDays(String(d.paperDate), days), company.timezone);
    }
    await this.enqueue(m, eDoc, 'SEND', { receiverTaxId: eDoc.counterpartyTaxId, deliveryChannel: d.deliveryChannel }, deadlineAt);
    await this.event(m, eDoc, 'QUEUED', 'SYSTEM', 'CHANNEL', d.deliveryChannel || 'GIB');
  }

  // ------------------------------------------------------------------ archive / outbox / timeline
  async archive(m: EntityManager, a: ArchiveInput): Promise<EDocumentEntity> {
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const years = Number(await this.param('EDOC_RETENTION_YEARS', 10, company.country)) || 10;
    const id = randomUUID();
    const issueDate = a.issueDate || todayKey(company.timezone);
    await m.insert(EDocumentEntity, {
      id,
      companyId: this.companyId,
      ettn: a.ettn.toLowerCase(),
      documentType: a.documentType,
      direction: a.direction,
      profileId: a.profileId ?? null,
      typeCode: a.typeCode ?? null,
      documentNo: a.documentNo ?? null,
      issueDate,
      sourceType: a.sourceType,
      sourceId: a.sourceId ?? null,
      counterpartyTaxId: a.counterpartyTaxId ?? null,
      counterpartyName: a.counterpartyName ? String(a.counterpartyName).slice(0, 255) : null,
      currency: a.currency ?? null,
      payableAmount: a.payableAmount ?? null,
      xml: a.xml,
      sha256: sha256(Buffer.from(a.xml, 'utf8')),
      // Working copy; the legal archive is kept by the integrator in Türkiye (509 VI).
      storageRef: `db:e_documents/${id}`,
      gibStatus: a.gibStatus ?? null,
      lastStatusAt: new Date(),
      providerRef: a.providerRef ?? null,
      retentionUntil: retentionUntil(issueDate, years),
      legalHold: false,
      integrityOk: true,
    });
    return m.findOneOrFail(EDocumentEntity, { where: { id } });
  }

  async enqueue(m: EntityManager, eDoc: EDocumentEntity, operation: 'SEND' | 'CANCEL', payload: Record<string, unknown> | null, deadlineAt: Date | null = null): Promise<EDocumentOutboxEntity> {
    const existing = await m.findOne(EDocumentOutboxEntity, { where: { ettn: eDoc.ettn, operation } });
    if (existing) throw new ConflictException(err('EDOC_ALREADY_SENT', { ettn: eDoc.ettn }));
    return m.save(
      EDocumentOutboxEntity,
      m.create(EDocumentOutboxEntity, {
        companyId: eDoc.companyId,
        ettn: eDoc.ettn,
        operation,
        documentType: eDoc.documentType,
        eDocumentId: eDoc.id,
        sourceType: eDoc.sourceType,
        sourceId: eDoc.sourceId ?? null,
        status: 'PENDING',
        attempt: 0,
        nextRetryAt: new Date(Date.now() - 1000), // DATETIME rounds to whole seconds: due at once
        payload,
        deadlineAt,
      }),
    );
  }

  async event(m: EntityManager, eDoc: EDocumentEntity, status: string, source: string, code?: string | null, message?: string | null, actor?: string | null, at: Date = new Date()): Promise<void> {
    await m.insert(EDocumentEventEntity, { id: randomUUID(), companyId: eDoc.companyId, eDocumentId: eDoc.id, ettn: eDoc.ettn, status, source, code: code ?? null, message: message ? String(message).slice(0, 1000) : null, actor: actor ?? null, at });
  }

  private async updateEDoc(m: EntityManager, eDoc: EDocumentEntity, patch: Partial<EDocumentEntity>): Promise<void> {
    await m.update(EDocumentEntity, { id: eDoc.id }, { ...patch, lastStatusAt: new Date() });
    Object.assign(eDoc, patch);
  }

  private providerHttpError(e: unknown, companyId: string) {
    if (e instanceof ProviderError) {
      if (e.code === 'UNAVAILABLE' || e.code === 'TIMEOUT') {
        void this.settings.markOutage(companyId, e.message);
        return new ServiceUnavailableException(err('PROVIDER_UNAVAILABLE', { message: e.message }));
      }
      return new ConflictException(err('EBELGE_PROVIDER_REJECTED', { message: e.message }));
    }
    return e as Error;
  }

  // ------------------------------------------------------------------ status of the source documents
  /** Saves the invoice through the entity manager so the audit subscriber derives invoice.status_changed. */
  private async setInvoiceStatus(m: EntityManager, invoiceId: string, status: string, gibStatus?: string | null): Promise<InvoiceEntity> {
    const inv = await m.findOneOrFail(InvoiceEntity, { where: { id: invoiceId } });
    if (inv.status === status && (gibStatus === undefined || inv.gibStatus === gibStatus)) return inv;
    const { lines: _l, ...header } = inv;
    await m.save(InvoiceEntity, Object.assign(new InvoiceEntity(), header, { status, ...(gibStatus !== undefined ? { gibStatus } : {}) }));
    return m.findOneOrFail(InvoiceEntity, { where: { id: invoiceId }, relations: { lines: true } });
  }

  private async setDespatchStatus(m: EntityManager, despatchId: string, status: string, gibStatus?: string | null): Promise<void> {
    const d = await m.findOneOrFail(DespatchEntity, { where: { id: despatchId } });
    if (d.status === status && (gibStatus === undefined || d.gibStatus === gibStatus)) return;
    const { lines: _l, ...header } = d;
    await m.save(DespatchEntity, Object.assign(new DespatchEntity(), header, { status, ...(gibStatus !== undefined ? { gibStatus } : {}) }));
  }

  /** Invoice status for a provider status (QUEUED -> SENT -> DELIVERED -> ACCEPTED / REJECTED / CANCELLED). */
  static invoiceTarget(p: ProviderStatus): string {
    return { PROVIDER_RECEIVED: 'SENT', GIB_ACCEPTED: 'SENT', DELIVERED: 'DELIVERED', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' }[p];
  }

  static despatchTarget(p: ProviderStatus): string | null {
    return ({ PROVIDER_RECEIVED: 'HANDED_TO_PROVIDER', GIB_ACCEPTED: 'GIB_ACCEPTED', DELIVERED: 'GIB_ACCEPTED', REJECTED: 'REJECTED' } as Record<string, string>)[p] || null;
  }

  /** Steps through the state machine (e.g. QUEUED -> SENT -> DELIVERED) and returns the statuses passed. */
  static path(machine: Record<string, readonly string[]>, from: string, to: string): string[] | null {
    if (from === to) return [];
    if (canTransition(machine, from, to)) return [to];
    for (const mid of machine[from] || []) if (canTransition(machine, mid, to)) return [mid, to];
    return null;
  }

  /**
   * Applies a provider status to the archive row and its source document (timeline event, audit,
   * webhook through the audit subscriber, socket). Unknown / backward transitions are recorded only.
   */
  async applyProviderStatus(m: EntityManager, eDoc: EDocumentEntity, status: ProviderStatus, source: string, opts: { code?: string | null; message?: string | null; at?: Date; providerRef?: string | null } = {}): Promise<boolean> {
    if (eDoc.gibStatus === status) return false;
    if (eDoc.gibStatus && FINAL_PROVIDER_STATUSES.includes(eDoc.gibStatus as ProviderStatus) && status !== 'CANCELLED') return false;
    await this.updateEDoc(m, eDoc, { gibStatus: status, ...(opts.providerRef ? { providerRef: opts.providerRef } : {}) });
    await this.event(m, eDoc, status, source, opts.code ?? null, opts.message ?? null, null, opts.at || new Date());
    let changed: { type: string; id: string; from: string; to: string } | null = null;
    if (eDoc.sourceType === 'invoice' && eDoc.sourceId) {
      const inv = await m.findOne(InvoiceEntity, { where: { id: eDoc.sourceId }, relations: { lines: true } });
      if (inv) {
        const target = EDocumentService.invoiceTarget(status);
        const steps = EDocumentService.path(INVOICE_TRANSITIONS, inv.status, target);
        if (steps?.length) {
          for (const s of steps) await this.setInvoiceStatus(m, inv.id, s, status);
          changed = { type: 'invoice', id: inv.id, from: inv.status, to: target };
          // A rejected invoice is void: its quantities may be invoiced again with a new document.
          if (target === 'REJECTED') await this.invoices.releaseQuantitiesTx(m, inv);
        } else await m.update(InvoiceEntity, { id: inv.id }, { gibStatus: status });
      }
    } else if (eDoc.sourceType === 'despatch' && eDoc.sourceId) {
      const d = await m.findOne(DespatchEntity, { where: { id: eDoc.sourceId } });
      const target = EDocumentService.despatchTarget(status);
      if (d && target) {
        const steps = EDocumentService.path(DESPATCH_TRANSITIONS, d.status, target);
        if (steps?.length) {
          for (const s of steps) await this.setDespatchStatus(m, d.id, s, status);
          changed = { type: 'despatch', id: d.id, from: d.status, to: target };
        } else await m.update(DespatchEntity, { id: d.id }, { gibStatus: status });
      }
    }
    if (changed) {
      await this.audit.record({
        companyId: eDoc.companyId,
        action: `${changed.type}.status_changed`,
        entityType: changed.type === 'invoice' ? 'invoices' : 'despatches',
        entityId: changed.id,
        username: this.tenant.actor.username || 'ebelge-worker',
        before: { status: changed.from },
        after: { status: changed.to, gibStatus: status, ettn: eDoc.ettn, documentNo: eDoc.documentNo, source, code: opts.code ?? null, message: opts.message ?? null },
      });
      this.gateway.emitToCompany(eDoc.companyId, `${changed.type}_mutated`, { type: 'update', [`${changed.type}Id`]: changed.id });
    }
    this.gateway.emitToCompany(eDoc.companyId, 'edocument_status', { ettn: eDoc.ettn, documentType: eDoc.documentType, status });
    return true;
  }

  // ------------------------------------------------------------------ outbox worker
  /**
   * Sends due outbox items (lease per item; ETTN + operation never twice). `companyId` limits the run
   * to one company (manual "process now" is always tenant-scoped); `automatic` runs (worker, follow-up
   * after a response) skip companies whose "autoSend" setting is off.
   */
  async processOutbox(limit = 25, companyId?: string, opts: { automatic?: boolean } = {}): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();
    // Crashed workers: release expired leases. send() may already have reached the integrator, so the
    // next attempt asks for the status first instead of sending again.
    const expired = this.dataSource.manager
      .createQueryBuilder()
      .update(EDocumentOutboxEntity)
      .set({ status: 'FAILED', lockedUntil: null, statusCheckRequired: true })
      .where('status = :s AND lockedUntil < :now', { s: 'PROCESSING', now });
    if (companyId) expired.andWhere('companyId = :companyId', { companyId });
    await expired.execute();
    const qb = this.dataSource.manager
      .createQueryBuilder(EDocumentOutboxEntity, 'o')
      .where('o.status IN (:...st) AND o.nextRetryAt <= :now', { st: ['PENDING', 'FAILED'], now });
    if (companyId) qb.andWhere('o.companyId = :companyId', { companyId });
    if (opts.automatic) {
      qb.andWhere('NOT EXISTS (SELECT 1 FROM `company_ebelge_settings` s WHERE s.`companyId` = o.`companyId` AND s.`autoSend` = 0)');
    }
    const due = await qb.orderBy('o.nextRetryAt', 'ASC').take(limit).getMany();
    let sent = 0;
    let failed = 0;
    for (const item of due) {
      const ok = await this.tenant.run(item.companyId, () => this.processItem(item.id));
      if (ok === true) sent++;
      else if (ok === false) failed++;
    }
    return { processed: due.length, sent, failed };
  }

  /** true: sent / confirmed; false: failed; null: not leased (another worker has it). */
  async processItem(id: string): Promise<boolean | null> {
    const now = new Date();
    const lease = await this.dataSource.manager
      .createQueryBuilder()
      .update(EDocumentOutboxEntity)
      .set({ status: 'PROCESSING', lockedUntil: new Date(now.getTime() + 120_000), attempt: () => '`attempt` + 1' })
      .where('id = :id AND status IN (:...st)', { id, st: ['PENDING', 'FAILED'] })
      .execute();
    if (!lease.affected) return null;
    const item = await this.dataSource.manager.findOneOrFail(EDocumentOutboxEntity, { where: { id } });
    const eDoc = await this.dataSource.manager.findOneOrFail(EDocumentEntity, { where: { id: item.eDocumentId } });
    let r: ResolvedProvider;
    try {
      r = await this.settings.resolve(item.companyId);
    } catch (e) {
      await this.failItem(item, 'PROVIDER_NOT_CONFIGURED', (e as Error).message, true);
      return false;
    }
    try {
      let result: SendResult | null = null;
      if (item.statusCheckRequired) {
        // The previous attempt timed out: the document may have arrived. Ask before sending again.
        const st = await r.provider.getStatus(r.ctx, eDoc.ettn, eDoc.documentType as ProviderDocType);
        if (st) result = { providerRef: st.providerRef || item.providerRef || '', status: st.status, at: st.at, message: st.message };
      }
      if (!result) result = await this.send(r, eDoc, item);
      await this.dataSource.transaction(async (m) => {
        await m.update(EDocumentOutboxEntity, { id: item.id }, { status: 'DONE', processedAt: new Date(), lockedUntil: null, providerRef: result!.providerRef || null, statusCheckRequired: false, lastError: null, lastErrorCode: null });
        const fresh = await m.findOneOrFail(EDocumentEntity, { where: { id: eDoc.id } });
        if (result!.status !== 'PROVIDER_RECEIVED' && fresh.gibStatus === 'QUEUED') await this.applyProviderStatus(m, fresh, 'PROVIDER_RECEIVED', 'PROVIDER', { at: result!.at, providerRef: result!.providerRef });
        await this.applyProviderStatus(m, fresh, result!.status, 'PROVIDER', { at: result!.at, message: result!.message ?? null, providerRef: result!.providerRef });
        if (eDoc.documentType === 'EARCHIVE' && result!.status !== 'REJECTED') {
          const p = item.payload || {};
          await m.insert(EDocumentDeliveryEntity, { id: randomUUID(), companyId: eDoc.companyId, eDocumentId: eDoc.id, ettn: eDoc.ettn, channel: String(p['channel'] || 'EMAIL'), recipient: (p['recipient'] as string) || null, deliveredAt: result!.at, providerRef: result!.providerRef || null, note: String(p['sendType'] || 'ELEKTRONIK'), createdBy: 'ebelge-worker' });
        }
      });
      await this.settings.markHealthy(item.companyId);
      return result.status !== 'REJECTED';
    } catch (e) {
      if (e instanceof ProviderError) {
        if (e.code === 'DUPLICATE') {
          // Already at the provider (idempotency): confirm through the status instead of sending again.
          await this.dataSource.manager.update(EDocumentOutboxEntity, { id: item.id }, { statusCheckRequired: true });
          await this.failItem(item, 'DUPLICATE', e.message, true, 0);
          return false;
        }
        if (e.code === 'UNAVAILABLE') await this.settings.markOutage(item.companyId, e.message);
        if (e.code === 'TIMEOUT') await this.dataSource.manager.update(EDocumentOutboxEntity, { id: item.id }, { statusCheckRequired: true });
        await this.failItem(item, e.code, e.message, e.retryable);
        if (!e.retryable) await this.dataSource.transaction((m) => this.applyProviderStatus(m, eDoc, 'REJECTED', 'PROVIDER', { code: e.providerCode ?? e.code, message: e.message }));
        return false;
      }
      await this.failItem(item, 'ERROR', (e as Error).message, true);
      return false;
    }
  }

  private async send(r: ResolvedProvider, eDoc: EDocumentEntity, item: EDocumentOutboxEntity): Promise<SendResult> {
    const doc: OutgoingDocument = {
      ettn: eDoc.ettn,
      docType: eDoc.documentType as ProviderDocType,
      documentNo: eDoc.documentNo || '',
      profileId: eDoc.profileId || '',
      typeCode: eDoc.typeCode,
      xml: eDoc.xml,
      receiverTaxId: eDoc.counterpartyTaxId ?? null,
    };
    switch (eDoc.documentType) {
      case 'EARCHIVE': {
        const p = item.payload || {};
        const inv = eDoc.sourceId ? await this.dataSource.manager.findOne(InvoiceEntity, { where: { id: eDoc.sourceId } }) : null;
        const delivery: EArsivDelivery = { sendType: p['sendType'] === 'KAGIT' ? 'KAGIT' : 'ELEKTRONIK', channel: String(p['channel'] || 'EMAIL'), recipient: (p['recipient'] as string) || null, internetSale: (inv?.internetSaleInfo as Record<string, unknown>) || null };
        return r.provider.sendEArsiv(r.ctx, doc, delivery);
      }
      case 'INVOICE':
        return r.provider.sendInvoice(r.ctx, doc);
      case 'DESPATCH':
        return r.provider.sendDespatch(r.ctx, doc);
      case 'RECEIPT_ADVICE':
        return r.provider.sendReceiptAdvice(r.ctx, doc);
      case 'APPLICATION_RESPONSE':
        return r.provider.sendApplicationResponse(r.ctx, doc);
      default:
        throw new ProviderError('NOT_SUPPORTED', `unknown document type ${eDoc.documentType}`, false);
    }
  }

  private async failItem(item: EDocumentOutboxEntity, code: string, message: string, retryable: boolean, delayMs?: number): Promise<void> {
    const fresh = await this.dataSource.manager.findOneOrFail(EDocumentOutboxEntity, { where: { id: item.id } });
    const dead = !retryable || fresh.attempt >= fresh.maxAttempts;
    await this.dataSource.manager.update(EDocumentOutboxEntity, { id: item.id }, {
      status: dead ? 'DEAD' : 'FAILED',
      lockedUntil: null,
      lastErrorCode: code.slice(0, 50),
      lastError: message.slice(0, 1000),
      nextRetryAt: new Date(Date.now() + (delayMs ?? outboxBackoffMs(fresh.attempt))),
    });
    const eDoc = await this.dataSource.manager.findOne(EDocumentEntity, { where: { id: item.eDocumentId } });
    if (eDoc) await this.event(this.dataSource.manager, eDoc, dead ? 'SEND_FAILED' : 'RETRY_SCHEDULED', 'SYSTEM', code, message);
    this.gateway.emitToCompany(item.companyId, 'edocument_status', { ettn: item.ettn, outbox: dead ? 'DEAD' : 'FAILED', code });
  }

  /** "Yeniden dene": a failed / dead outbox item is scheduled now (never for a sent or rejected document). */
  async retry(eDocumentId: string, user?: string) {
    const eDoc = await this.dataSource.manager.findOne(EDocumentEntity, { where: { companyId: this.companyId, id: eDocumentId } });
    if (!eDoc) throw new NotFoundException(err('EDOC_NOT_FOUND'));
    const item = await this.dataSource.manager.findOne(EDocumentOutboxEntity, { where: { ettn: eDoc.ettn, operation: 'SEND' } });
    if (!item || item.status === 'DONE' || item.status === 'PROCESSING' || ['REJECTED', 'CANCELLED'].includes(String(eDoc.gibStatus))) {
      throw new ConflictException(err('EDOC_RETRY_NOT_ALLOWED', { status: item?.status || eDoc.gibStatus || '-' }));
    }
    await this.dataSource.manager.update(EDocumentOutboxEntity, { id: item.id }, { status: 'PENDING', nextRetryAt: new Date(Date.now() - 1000), attempt: Math.min(item.attempt, item.maxAttempts - 1) });
    await this.event(this.dataSource.manager, eDoc, 'RETRY_REQUESTED', 'USER', null, null, user || this.tenant.actor.username);
    await this.processItem(item.id);
    return this.dataSource.manager.findOneOrFail(EDocumentOutboxEntity, { where: { id: item.id } });
  }

  // ------------------------------------------------------------------ status polling
  /** Asks the provider for documents still in progress (e-Fatura delivery, TICARI answer, e-İrsaliye GİB acceptance). */
  async pollStatuses(companyId: string, limit = 50): Promise<number> {
    const open = await this.dataSource.manager.find(EDocumentEntity, {
      where: { companyId, direction: 'OUT', gibStatus: In(['PROVIDER_RECEIVED', 'GIB_ACCEPTED', 'DELIVERED']) },
      order: { lastStatusAt: 'ASC' },
      take: limit,
    });
    if (!open.length) return 0;
    const r = await this.settings.resolve(companyId);
    let changed = 0;
    for (const eDoc of open) {
      if (eDoc.gibStatus === 'DELIVERED' && !(eDoc.documentType === 'INVOICE' && eDoc.profileId === 'TICARIFATURA')) continue;
      if (eDoc.gibStatus === 'GIB_ACCEPTED' && eDoc.documentType !== 'DESPATCH') continue;
      try {
        const st = await r.provider.getStatus(r.ctx, eDoc.ettn, eDoc.documentType as ProviderDocType);
        if (st && st.status !== eDoc.gibStatus) {
          await this.dataSource.transaction(async (m) => {
            const fresh = await m.findOneOrFail(EDocumentEntity, { where: { id: eDoc.id } });
            if (await this.applyProviderStatus(m, fresh, st.status, 'POLL', { code: st.code, message: st.message, at: st.at })) changed++;
          });
        }
      } catch (e) {
        if (e instanceof ProviderError && e.code === 'UNAVAILABLE') {
          await this.settings.markOutage(companyId, e.message);
          break;
        }
        this.logger.warn(`status poll ${eDoc.ettn}: ${(e as Error).message}`);
      }
    }
    return changed;
  }

  /** Provider status callback (webhook) for the current company. */
  async applyWebhook(updates: { ettn: string; status: ProviderStatus; at: Date; code?: string | null; message?: string | null }[]): Promise<number> {
    let n = 0;
    for (const u of updates) {
      await this.dataSource.transaction(async (m) => {
        const eDoc = await m.findOne(EDocumentEntity, { where: { companyId: this.companyId, ettn: u.ettn.toLowerCase(), direction: 'OUT' } });
        if (eDoc && (await this.applyProviderStatus(m, eDoc, u.status, 'WEBHOOK', { code: u.code, message: u.message, at: u.at }))) n++;
      });
    }
    return n;
  }

  /** MATBUDAN items close to their deadline (warning) and overdue (critical). */
  async matbudanDeadlines(companyId = this.companyId): Promise<{ ettn: string; documentNo: string | null; deadlineAt: Date; overdue: boolean; status: string }[]> {
    const rows = await this.dataSource.manager.find(EDocumentOutboxEntity, { where: { companyId, operation: 'SEND', status: In(['PENDING', 'FAILED', 'PROCESSING', 'DEAD']) } });
    const out = [];
    for (const r of rows.filter((x) => x.deadlineAt)) {
      const eDoc = await this.dataSource.manager.findOne(EDocumentEntity, { where: { id: r.eDocumentId } });
      out.push({ ettn: r.ettn, documentNo: eDoc?.documentNo ?? null, deadlineAt: new Date(r.deadlineAt as Date), overdue: new Date(r.deadlineAt as Date).getTime() < Date.now(), status: r.status });
    }
    return out;
  }
}

export type { UblDocType };
