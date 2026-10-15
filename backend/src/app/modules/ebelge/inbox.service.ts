import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { CompanyEntity } from '../../entities/company.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { InvoiceEntity } from '../../entities/invoice.entity';
import { DespatchEntity } from '../../entities/despatch.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { CompanyEBelgeSettingsEntity, EDocumentEntity, IncomingDocumentEntity } from '../../entities/ebelge.entity';
import { dateKeyInZone, dayWindow, parseZonedDateTime, roundQty, SpecialTaxId, timeKeyInZone, todayKey } from '../../shared/tr';
import { parseUbl, ParsedUbl } from '../../shared/ebelge/ubl/parser';
import { buildApplicationResponseXml } from '../../shared/ebelge/ubl/application-response.builder';
import { buildReceiptAdviceXml } from '../../shared/ebelge/ubl/receipt-advice.builder';
import { partyFromSnapshot } from '../../shared/ebelge/ubl/mapper';
import { validateUbl } from '../../shared/ebelge/validation/ubl-validator';
import { InboxItem, MockEDocumentProvider, partyFromParsed, ProviderError } from '../../shared/ebelge/provider';
import { sampleDespatch, sampleInvoice } from '../../shared/ebelge/samples';
import { AuditService } from '../integrations/audit.service';
import { companySnapshot } from '../documents/document-support';
import { EBelgeSettingsService } from './ebelge-settings.service';
import { EDocumentService, ublValidationError } from './edocument.service';

export interface ReceiptAdviceLineInput {
  lineId: string;
  accepted: number;
  rejected?: number;
  reason?: string | null;
}

const DOC_TYPE: Record<string, string> = { INVOICE: 'INVOICE', EARCHIVE: 'INVOICE', DESPATCH: 'DESPATCH', RECEIPT_ADVICE: 'RECEIPT_ADVICE', APPLICATION_RESPONSE: 'APPLICATION_RESPONSE' };

/**
 * Gelen kutusu (WP5): incoming e-Fatura / e-İrsaliye / answers to our documents. Fetched every 15
 * minutes; matched supplier VKN -> purchase order / despatch number -> goods receipt (three-way
 * match); TICARIFATURA answered KABUL / RED (TTK 21/2, 8 days), e-İrsaliye answered with a full or
 * partial receipt advice (7 days from the actual despatch; afterwards deemed accepted).
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

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

  // ------------------------------------------------------------------ reads
  async list(filter: { documentType?: string; status?: string } = {}) {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (filter.documentType) where['documentType'] = filter.documentType;
    if (filter.status) where['status'] = filter.status;
    const rows = await this.dataSource.manager.find(IncomingDocumentEntity, { where, order: { receivedAt: 'DESC' } });
    return rows.map((r) => this.withCountdown(r));
  }

  async get(id: string) {
    const row = await this.dataSource.manager.findOne(IncomingDocumentEntity, { where: { companyId: this.companyId, id } });
    if (!row) throw new NotFoundException(err('EDOC_NOT_FOUND'));
    const [supplier, po, receipt, original] = await Promise.all([
      row.supplierId ? this.dataSource.manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: row.supplierId } }) : null,
      row.purchaseOrderId ? this.dataSource.manager.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, id: row.purchaseOrderId } }) : null,
      row.goodsReceiptId ? this.dataSource.manager.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, id: row.goodsReceiptId } }) : null,
      row.originalInvoiceId ? this.dataSource.manager.findOne(InvoiceEntity, { where: { companyId: this.companyId, id: row.originalInvoiceId } }) : null,
    ]);
    return {
      ...this.withCountdown(row),
      supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
      purchaseOrder: po ? { id: po.id, poNumber: po.poNumber, status: po.status } : null,
      goodsReceipt: receipt ? { id: receipt.id, receiptNo: receipt.receiptNo, status: receipt.status, supplierInvoiceNo: receipt.supplierInvoiceNo ?? null } : null,
      originalInvoice: original ? { id: original.id, documentNo: original.documentNo, issueDate: original.issueDate } : null,
    };
  }

  private withCountdown(r: IncomingDocumentEntity) {
    const due = r.responseDueAt ? new Date(r.responseDueAt) : null;
    const msLeft = due ? due.getTime() - Date.now() : null;
    return { ...r, responseRequired: !!due && r.status === 'RECEIVED', hoursLeft: msLeft !== null ? Math.floor(msLeft / 3600_000) : null, expired: msLeft !== null && msLeft <= 0 };
  }

  async summary(companyId = this.companyId) {
    const rows = await this.dataSource.manager.find(IncomingDocumentEntity, { where: { companyId, status: 'RECEIVED' } });
    const due = rows.filter((r) => r.responseDueAt);
    return {
      open: rows.length,
      awaitingResponse: due.length,
      dueSoon: due.filter((r) => new Date(r.responseDueAt as Date).getTime() - Date.now() < 48 * 3600_000).length,
      unmatched: rows.filter((r) => r.matchStatus === 'UNMATCHED').length,
    };
  }

  // ------------------------------------------------------------------ fetch / store
  async fetch(companyId = this.companyId): Promise<{ fetched: number; stored: number }> {
    const r = await this.settings.resolve(companyId);
    if (!r.provider.capabilities().inbox) return { fetched: 0, stored: 0 };
    let items: InboxItem[];
    try {
      items = await r.provider.fetchInbox(r.ctx, r.settings.inboxLastFetchedAt ? new Date(r.settings.inboxLastFetchedAt) : null);
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'UNAVAILABLE') await this.settings.markOutage(companyId, e.message);
      throw e;
    }
    let stored = 0;
    let last = r.settings.inboxLastFetchedAt ? new Date(r.settings.inboxLastFetchedAt) : null;
    for (const item of items) {
      try {
        if (await this.store(item)) stored++;
      } catch (e) {
        this.logger.warn(`incoming ${item.ettn} not stored: ${(e as Error).message}`);
      }
      if (!last || item.receivedAt.getTime() > last.getTime()) last = item.receivedAt;
    }
    await this.dataSource.manager.update(CompanyEBelgeSettingsEntity, { companyId }, { inboxLastFetchedAt: last || new Date() });
    if (stored) this.gateway.emitToCompany(companyId, 'inbox_updated', { stored });
    return { fetched: items.length, stored };
  }

  /** Idempotent by (company, ETTN). Returns false when the document is already known. */
  async store(item: InboxItem): Promise<boolean> {
    const ettn = item.ettn.toLowerCase();
    const exists = await this.dataSource.manager.findOne(IncomingDocumentEntity, { where: { companyId: this.companyId, ettn } });
    if (exists) return false;
    const company = await this.dataSource.manager.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const p = parseUbl(item.xml);
    const documentType = DOC_TYPE[item.docType] || p.docType.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    await this.dataSource.transaction(async (m) => {
      const id = randomUUID();
      const actual = p.actualDespatchDate ? parseZonedDateTime(`${p.actualDespatchDate}T${(p.actualDespatchTime || '00:00:00').slice(0, 5)}`, company.timezone) : null;
      let responseDueAt: Date | null = null;
      if (documentType === 'DESPATCH') {
        const days = Number(await this.edocs.param('EIRSALIYE_RESPONSE_DAYS', 7, company.country)) || 7;
        responseDueAt = dayWindow(actual || item.receivedAt, days, new Date(), company.timezone).deadline;
      } else if (documentType === 'INVOICE' && p.profileId === 'TICARIFATURA') {
        const days = Number(await this.edocs.param('TICARI_RESPONSE_DAYS', 8, company.country)) || 8;
        responseDueAt = dayWindow(item.receivedAt, days, new Date(), company.timezone).deadline;
      }
      const related = documentType === 'RECEIPT_ADVICE' ? p.despatchRefs[0]?.id : documentType === 'APPLICATION_RESPONSE' ? p.response?.referencedId : null;
      const row = m.create(IncomingDocumentEntity, {
        id,
        companyId: this.companyId,
        ettn,
        documentType,
        profileId: p.profileId,
        typeCode: p.typeCode,
        documentNo: p.id,
        issueDate: p.issueDate,
        issueTime: p.issueTime ? p.issueTime.slice(0, 8) : null,
        senderTaxId: p.supplier?.taxId || item.senderTaxId || null,
        senderName: p.supplier?.name || null,
        receivedAt: item.receivedAt,
        actualDespatchAt: actual,
        currency: p.currency,
        payableAmount: p.legalMonetaryTotal?.payable ?? null,
        taxTotal: p.legalMonetaryTotal ? p.taxTotal : null,
        lines: p.lines.map((l) => ({ ...l })) as any,
        refs: { orderRef: p.orderRef, despatchRefs: p.despatchRefs, billingRefs: p.billingRefs, notes: p.notes },
        status: responseDueAt ? 'RECEIVED' : documentType === 'INVOICE' || documentType === 'DESPATCH' ? 'RECEIVED' : 'INFO',
        matchStatus: 'UNMATCHED',
        relatedEttn: related ? String(related).toLowerCase() : null,
        responseDueAt,
        providerRef: item.providerRef ?? null,
      });
      await this.match(m, row, p);
      await m.save(IncomingDocumentEntity, row);
      const eDoc = await this.edocs.archive(m, {
        ettn,
        documentType: documentType === 'INVOICE' && p.profileId === 'EARSIVFATURA' ? 'EARCHIVE' : documentType,
        direction: 'IN',
        profileId: p.profileId,
        typeCode: p.typeCode,
        documentNo: p.id,
        issueDate: p.issueDate,
        sourceType: 'incoming',
        sourceId: id,
        counterpartyTaxId: row.senderTaxId,
        counterpartyName: row.senderName,
        currency: p.currency,
        payableAmount: p.legalMonetaryTotal?.payable ?? null,
        xml: item.xml,
        gibStatus: 'RECEIVED',
        providerRef: item.providerRef ?? null,
      });
      await m.update(IncomingDocumentEntity, { id }, { eDocumentId: eDoc.id });
      await this.edocs.event(m, eDoc, 'RECEIVED', 'PROVIDER', null, `${documentType} ${p.id || ''}`.trim());
      // Answers to our documents update their status.
      if (documentType === 'RECEIPT_ADVICE' && row.relatedEttn) await this.applyReceiptAdvice(m, row.relatedEttn, p);
      if (documentType === 'APPLICATION_RESPONSE' && row.relatedEttn && p.response?.code) {
        const ours = await m.findOne(EDocumentEntity, { where: { companyId: this.companyId, ettn: row.relatedEttn, direction: 'OUT' } });
        if (ours) await this.edocs.applyProviderStatus(m, ours, p.response.code === 'KABUL' ? 'ACCEPTED' : 'REJECTED', 'PROVIDER', { code: p.response.code, message: p.response.description });
      }
    });
    await this.audit.record({ companyId: this.companyId, action: 'edocument.received', entityType: 'incoming_documents', entityId: ettn, username: this.tenant.actor.username || 'ebelge-worker', after: { documentType, documentNo: p.id, sender: p.supplier?.taxId } });
    return true;
  }

  /** Receipt advice of the receiver for one of our despatch advices (partial / rejected / full). */
  private async applyReceiptAdvice(m: EntityManager, despatchEttn: string, p: ParsedUbl): Promise<void> {
    const ours = await m.findOne(EDocumentEntity, { where: { companyId: this.companyId, ettn: despatchEttn, direction: 'OUT' } });
    if (!ours) return;
    const rejected = p.lines.reduce((s, l) => s + (l.rejected || 0) + (l.short || 0), 0);
    const received = p.lines.reduce((s, l) => s + (l.received || 0), 0);
    if (rejected <= 0) {
      await this.edocs.event(m, ours, ours.gibStatus || 'GIB_ACCEPTED', 'PROVIDER', 'RECEIPT_ACCEPTED', `İrsaliye yanıtı ${p.id}: tamamı kabul edildi.`);
      return;
    }
    // REJECTED / PARTIALLY_ACCEPTED are despatch statuses; the provider status stays GIB_ACCEPTED.
    const d = ours.sourceId ? await m.findOne(DespatchEntity, { where: { id: ours.sourceId } }) : null;
    const target = received <= 0 ? 'REJECTED' : 'PARTIALLY_ACCEPTED';
    if (d && (d.status === 'GIB_ACCEPTED' || d.status === 'HANDED_TO_PROVIDER')) {
      const { lines: _l, ...header } = d;
      await m.save(DespatchEntity, Object.assign(new DespatchEntity(), header, { status: target }));
      this.gateway.emitToCompany(this.companyId, 'despatch_mutated', { type: 'update', despatchId: d.id });
      await this.audit.record({ companyId: this.companyId, action: 'despatch.status_changed', entityType: 'despatches', entityId: d.id, username: 'ebelge-worker', before: { status: d.status }, after: { status: target, receiptAdvice: p.id } });
    }
    await this.edocs.event(m, ours, target, 'PROVIDER', 'RECEIPT_ADVICE', `İrsaliye yanıtı ${p.id}: ${received} kabul, ${rejected} kabul edilmeyen / eksik.`);
  }

  // ------------------------------------------------------------------ matching (three-way)
  private async match(m: EntityManager, row: IncomingDocumentEntity, p: ParsedUbl): Promise<void> {
    const taxId = row.senderTaxId;
    if (row.documentType === 'INVOICE' && (p.typeCode === 'IADE' || p.typeCode === 'TEVKIFATIADE')) {
      // A customer returns goods with an IADE invoice: link it to our original sales invoice.
      const customer = taxId ? await m.findOne(CustomerEntity, { where: { companyId: this.companyId, identityNumber: taxId } }) : null;
      if (customer) row.customerId = customer.id;
      for (const b of p.billingRefs) {
        const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, documentNo: b.id } });
        if (inv) {
          row.originalInvoiceId = inv.id;
          row.matchStatus = 'INVOICE';
          return;
        }
      }
      if (customer) row.matchStatus = 'SUPPLIER';
      return;
    }
    if (row.documentType !== 'INVOICE' && row.documentType !== 'DESPATCH') return;
    const supplier = taxId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, identityNumber: taxId, isDeleted: false } }) : null;
    if (!supplier) return;
    row.supplierId = supplier.id;
    row.matchStatus = 'SUPPLIER';
    let po: PurchaseOrderEntity | null = null;
    if (p.orderRef?.id) po = await m.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, poNumber: p.orderRef.id } });
    if (po) {
      row.purchaseOrderId = po.id;
      row.matchStatus = 'ORDER';
    }
    const receipts = await m.find(GoodsReceiptEntity, { where: { companyId: this.companyId, ...(po ? { purchaseOrderId: po.id } : { supplierId: supplier.id }) }, order: { createdAt: 'DESC' } });
    let gr: GoodsReceiptEntity | undefined;
    if (row.documentType === 'DESPATCH') gr = receipts.find((g) => g.supplierDespatchEttn?.toLowerCase() === row.ettn || (g.supplierDespatchNo && g.supplierDespatchNo === row.documentNo));
    else {
      const despatchNos = p.despatchRefs.map((d) => d.id);
      gr = receipts.find((g) => g.supplierDespatchNo && despatchNos.includes(g.supplierDespatchNo)) || (po ? receipts.find((g) => g.status === 'COMPLETED' && !g.supplierInvoiceNo) : undefined);
    }
    if (gr) {
      row.goodsReceiptId = gr.id;
      row.purchaseOrderId = row.purchaseOrderId || gr.purchaseOrderId;
      row.matchStatus = 'RECEIPT';
    }
  }

  async manualMatch(id: string, input: { supplierId?: string | null; purchaseOrderId?: string | null; goodsReceiptId?: string | null }) {
    const row = await this.dataSource.manager.findOne(IncomingDocumentEntity, { where: { companyId: this.companyId, id } });
    if (!row) throw new NotFoundException(err('EDOC_NOT_FOUND'));
    if (input.supplierId !== undefined) {
      if (input.supplierId && !(await this.dataSource.manager.exists(SupplierEntity, { where: { companyId: this.companyId, id: input.supplierId } }))) throw new NotFoundException(err('PO_SUPPLIER_NOT_FOUND', { id: input.supplierId }));
      row.supplierId = input.supplierId || null;
    }
    if (input.purchaseOrderId !== undefined) {
      if (input.purchaseOrderId && !(await this.dataSource.manager.exists(PurchaseOrderEntity, { where: { companyId: this.companyId, id: input.purchaseOrderId } }))) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      row.purchaseOrderId = input.purchaseOrderId || null;
    }
    if (input.goodsReceiptId !== undefined) {
      if (input.goodsReceiptId && !(await this.dataSource.manager.exists(GoodsReceiptEntity, { where: { companyId: this.companyId, id: input.goodsReceiptId } }))) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      row.goodsReceiptId = input.goodsReceiptId || null;
    }
    row.matchStatus = row.goodsReceiptId ? 'RECEIPT' : row.purchaseOrderId ? 'ORDER' : row.supplierId ? 'SUPPLIER' : 'UNMATCHED';
    await this.dataSource.manager.save(IncomingDocumentEntity, row);
    if (row.goodsReceiptId && row.documentType === 'INVOICE' && row.status !== 'REJECTED') await this.linkReceiptInvoice(this.dataSource.manager, row);
    return this.get(id);
  }

  /** Three-way match result: the supplier invoice is written to the goods receipt (mutable fields). */
  private async linkReceiptInvoice(m: EntityManager, row: IncomingDocumentEntity): Promise<void> {
    if (!row.goodsReceiptId) return;
    await m.update(GoodsReceiptEntity, { id: row.goodsReceiptId, companyId: this.companyId }, { supplierInvoiceNo: row.documentNo, supplierInvoiceDate: row.issueDate, supplierInvoiceEttn: row.ettn, supplierInvoiceAmount: row.payableAmount ?? null });
  }

  // ------------------------------------------------------------------ responses
  private async ourParty(m: EntityManager) {
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const specialIds = await this.edocs.param<SpecialTaxId[]>('SPECIAL_TAX_IDS', [], company.country);
    return { company, party: partyFromSnapshot(companySnapshot(company), 'EFATURA', specialIds, 'seller').party };
  }

  private checkWindow(row: IncomingDocumentEntity, tz: string) {
    if (row.status !== 'RECEIVED') throw new ConflictException(err('INCOMING_ALREADY_ANSWERED', { response: row.responseCode || row.status }));
    if (row.responseDueAt && new Date(row.responseDueAt).getTime() <= Date.now()) {
      throw new ConflictException(err('INCOMING_RESPONSE_WINDOW_EXPIRED', { deadline: `${dateKeyInZone(new Date(row.responseDueAt), tz)}` }));
    }
  }

  /** Receipt advice numbers: own series IRY + year + 9 digits (UBL-TR document number format), gap-free per company and year. */
  private async nextResponseNo(m: EntityManager, series: string, issueDate: string): Promise<string> {
    const year = issueDate.slice(0, 4);
    const rows: { n: number }[] = await m.query(
      "SELECT COUNT(*) AS n FROM `e_documents` WHERE `companyId` = ? AND `direction` = 'OUT' AND `documentType` = 'RECEIPT_ADVICE' AND `documentNo` LIKE ? FOR UPDATE",
      [this.companyId, `${series}${year}%`],
    );
    return `${series}${year}${String(Number(rows[0]?.n || 0) + 1).padStart(9, '0')}`;
  }

  /** KABUL / RED for a TICARIFATURA (UBL-TR ApplicationResponse; TTK 21/2). */
  async respond(id: string, input: { response: string; note?: string | null }, user?: string) {
    const code = String(input.response || '').toUpperCase();
    if (code !== 'KABUL' && code !== 'RED') throw new BadRequestException(err('INCOMING_RESPONSE_NOT_ALLOWED', { profile: '-', type: code }));
    await this.dataSource.transaction(async (m) => {
      const row = await m.findOne(IncomingDocumentEntity, { where: { companyId: this.companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new NotFoundException(err('EDOC_NOT_FOUND'));
      if (row.documentType !== 'INVOICE' || row.profileId !== 'TICARIFATURA') throw new UnprocessableEntityException(err('INCOMING_RESPONSE_NOT_ALLOWED', { profile: row.profileId || '-', type: row.typeCode || '-' }));
      const { company, party } = await this.ourParty(m);
      this.checkWindow(row, company.timezone);
      const inDoc = await m.findOneOrFail(EDocumentEntity, { where: { id: row.eDocumentId as string } });
      const parsed = parseUbl(inDoc.xml);
      const now = new Date();
      const ettn = randomUUID();
      const xml = buildApplicationResponseXml({
        ettn,
        documentNo: ettn,
        profileId: 'TICARIFATURA',
        issueDate: dateKeyInZone(now, company.timezone),
        issueTime: timeKeyInZone(now, company.timezone),
        notes: input.note ? [String(input.note).slice(0, 500)] : [],
        sender: party,
        receiver: partyFromParsed(parsed.supplier!),
        responseCode: code,
        description: input.note || null,
        invoice: { ettn: row.ettn, documentNo: row.documentNo || '', issueDate: row.issueDate || dateKeyInZone(now, company.timezone) },
      });
      const issues = await validateUbl(xml, 'ApplicationResponse');
      if (issues.length) throw ublValidationError(issues);
      const eDoc = await this.edocs.archive(m, { ettn, documentType: 'APPLICATION_RESPONSE', direction: 'OUT', profileId: 'TICARIFATURA', typeCode: code, documentNo: ettn, issueDate: dateKeyInZone(now, company.timezone), sourceType: 'incoming', sourceId: row.id, counterpartyTaxId: row.senderTaxId, counterpartyName: row.senderName, xml, gibStatus: 'QUEUED' });
      await this.edocs.enqueue(m, eDoc, 'SEND', { receiverTaxId: row.senderTaxId, answers: row.ettn });
      await this.edocs.event(m, eDoc, 'QUEUED', 'USER', code, input.note || null, user || null);
      Object.assign(row, { status: code === 'KABUL' ? 'ACCEPTED' : 'REJECTED', responseCode: code, responseNote: input.note || null, respondedAt: now, respondedBy: user || this.tenant.actor.username || null, responseEttn: ettn });
      await m.save(IncomingDocumentEntity, row);
      if (code === 'KABUL') await this.linkReceiptInvoice(m, row);
    });
    await this.audit.record({ companyId: this.companyId, action: 'edocument.responded', entityType: 'incoming_documents', entityId: id, after: { response: code, note: input.note || null } });
    void this.edocs.processOutbox(5, this.companyId).catch(() => undefined);
    return this.get(id);
  }

  /** Full or partial acceptance of an incoming e-İrsaliye (ReceiptAdvice). */
  async receiptAdvice(id: string, input: { lines: ReceiptAdviceLineInput[]; note?: string | null }, user?: string) {
    await this.dataSource.transaction(async (m) => {
      const row = await m.findOne(IncomingDocumentEntity, { where: { companyId: this.companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new NotFoundException(err('EDOC_NOT_FOUND'));
      if (row.documentType !== 'DESPATCH') throw new UnprocessableEntityException(err('INCOMING_RESPONSE_NOT_ALLOWED', { profile: row.profileId || '-', type: row.typeCode || '-' }));
      const { company, party } = await this.ourParty(m);
      this.checkWindow(row, company.timezone);
      const inDoc = await m.findOneOrFail(EDocumentEntity, { where: { id: row.eDocumentId as string } });
      const parsed = parseUbl(inDoc.xml);
      const answers = new Map((input.lines || []).map((l) => [String(l.lineId), l]));
      const lines = parsed.lines.map((l, i) => {
        const a = answers.get(l.id);
        const accepted = roundQty(a ? Number(a.accepted) : l.quantity);
        const rejected = roundQty(a ? Number(a.rejected || 0) : 0);
        if (accepted < 0 || rejected < 0 || roundQty(accepted + rejected) > roundQty(l.quantity)) {
          throw new BadRequestException(err('RECEIPT_ADVICE_QTY_INVALID', { name: l.name, accepted, rejected, quantity: l.quantity }));
        }
        const short = roundQty(l.quantity - accepted - rejected);
        return { id: i + 1, despatchLineId: l.id, name: l.name, sellersItemId: l.sellersItemId, unitCode: l.unitCode || 'C62', received: accepted, rejected, short, rejectReason: rejected ? a?.reason || 'Kabul edilmedi' : null };
      });
      const now = new Date();
      const ettn = randomUUID();
      const issueDate = dateKeyInZone(now, company.timezone);
      const xml = buildReceiptAdviceXml({
        ettn,
        documentNo: await this.nextResponseNo(m, 'IRY', issueDate),
        profileId: 'TEMELIRSALIYE',
        issueDate,
        issueTime: timeKeyInZone(now, company.timezone),
        notes: input.note ? [String(input.note).slice(0, 500)] : [],
        despatch: { ettn: row.ettn, documentNo: row.documentNo || '', issueDate: row.issueDate || issueDate },
        orderRef: parsed.orderRef?.issueDate ? { id: parsed.orderRef.id, issueDate: parsed.orderRef.issueDate } : null,
        deliveryCustomer: party,
        despatchSupplier: partyFromParsed(parsed.supplier!),
        actualDespatchDate: parsed.actualDespatchDate,
        lines,
      });
      const issues = await validateUbl(xml, 'ReceiptAdvice');
      if (issues.length) throw ublValidationError(issues);
      const eDoc = await this.edocs.archive(m, { ettn, documentType: 'RECEIPT_ADVICE', direction: 'OUT', profileId: 'TEMELIRSALIYE', typeCode: 'SEVK', documentNo: parseUbl(xml).id, issueDate, sourceType: 'incoming', sourceId: row.id, counterpartyTaxId: row.senderTaxId, counterpartyName: row.senderName, xml, gibStatus: 'QUEUED' });
      await this.edocs.enqueue(m, eDoc, 'SEND', { receiverTaxId: row.senderTaxId, answers: row.ettn });
      const totalRejected = lines.reduce((s, l) => s + l.rejected + l.short, 0);
      const totalAccepted = lines.reduce((s, l) => s + l.received, 0);
      const status = totalRejected <= 0 ? 'ACCEPTED' : totalAccepted <= 0 ? 'REJECTED' : 'PARTIALLY_ACCEPTED';
      await this.edocs.event(m, eDoc, 'QUEUED', 'USER', status, input.note || null, user || null);
      Object.assign(row, { status, responseCode: status === 'ACCEPTED' ? 'KABUL' : status === 'REJECTED' ? 'RED' : 'PARTIAL', responseNote: input.note || null, respondedAt: now, respondedBy: user || this.tenant.actor.username || null, responseEttn: ettn, responseLines: lines as any });
      await m.save(IncomingDocumentEntity, row);
    });
    await this.audit.record({ companyId: this.companyId, action: 'edocument.receipt_advice', entityType: 'incoming_documents', entityId: id, after: { lines: input.lines?.length || 0 } });
    void this.edocs.processOutbox(5, this.companyId).catch(() => undefined);
    return this.get(id);
  }

  /** Despatch advices / TICARIFATURA without an answer within the period are deemed accepted (e-İrsaliye Kılavuzu §12; TTK 21/2). */
  async autoAccept(companyId: string): Promise<number> {
    const rows = await this.dataSource.manager.find(IncomingDocumentEntity, { where: { companyId, status: 'RECEIVED', responseDueAt: LessThan(new Date()), respondedAt: IsNull() } });
    for (const r of rows) {
      await this.dataSource.manager.update(IncomingDocumentEntity, { id: r.id }, { status: 'AUTO_ACCEPTED', responseCode: 'KABUL', responseNote: 'Süresinde yanıt verilmediği için kabul edilmiş sayılır.' });
      if (r.eDocumentId) {
        const eDoc = await this.dataSource.manager.findOne(EDocumentEntity, { where: { id: r.eDocumentId } });
        if (eDoc) await this.edocs.event(this.dataSource.manager, eDoc, 'AUTO_ACCEPTED', 'SYSTEM', null, null);
      }
    }
    return rows.length;
  }

  // ------------------------------------------------------------------ mock: sample incoming documents
  async simulateIncoming(kind: 'TICARI_INVOICE' | 'TEMEL_INVOICE' | 'DESPATCH' | 'IADE_INVOICE', provider: MockEDocumentProvider) {
    const m = this.dataSource.manager;
    const { company, party: us } = await this.ourParty(m);
    const today = todayKey(company.timezone);
    const specialIds = await this.edocs.param<SpecialTaxId[]>('SPECIAL_TAX_IDS', [], company.country);
    const seq = String(Date.now() % 1e9).padStart(9, '0');
    let doc: { ettn: string; xml: string };
    let senderTaxId: string | null = null;
    if (kind === 'IADE_INVOICE') {
      const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, kind: 'SALES', status: In(['SENT', 'DELIVERED', 'ACCEPTED']), profileId: In(['TEMELFATURA', 'TICARIFATURA']) }, relations: { lines: true }, order: { issuedAt: 'DESC' } });
      if (!inv || !inv.customerId) throw new UnprocessableEntityException(err('DOCUMENT_NOT_FOUND'));
      const customer = await m.findOneOrFail(CustomerEntity, { where: { id: inv.customerId } });
      const sender = partyFromSnapshot({ name: customer.name, taxIdType: customer.identityType, taxId: customer.identityNumber, taxOfficeName: customer.taxOfficeName, address: { line1: customer.address?.line1, district: customer.address?.district, province: customer.address?.province, postalCode: customer.address?.postalCode, country: 'TR' } }, 'EFATURA', specialIds).party;
      senderTaxId = customer.identityNumber || null;
      const l = inv.lines[0];
      doc = sampleInvoice({ documentNo: `IAD${today.slice(0, 4)}${seq}`, issueDate: today, profileId: 'TEMELFATURA', typeCode: 'IADE', supplier: sender, customer: us, lines: [{ name: l.productName, sku: l.productSku, quantity: Math.max(1, Math.floor(Number(l.quantity) / 2)), unitCode: l.unitCode, unitPrice: Number(l.unitPrice), vatRate: Number(l.taxRate) }], billingRefs: [{ id: inv.documentNo as string, issueDate: String(inv.issueDate) }], notes: ['Hatalı teslim edilen ürünlerin iadesidir.'] });
    } else {
      const po = await m.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId }, relations: { items: true }, order: { createdAt: 'DESC' } });
      const supplier = po?.supplierId ? await m.findOne(SupplierEntity, { where: { id: po.supplierId } }) : await m.findOne(SupplierEntity, { where: { companyId: this.companyId, identityType: 'VKN' } });
      if (!supplier) throw new UnprocessableEntityException(err('PO_SUPPLIER_NOT_FOUND', { id: '-' }));
      const sender = partyFromSnapshot({ name: supplier.name, taxIdType: supplier.identityType, taxId: supplier.identityNumber, taxOfficeName: supplier.taxOfficeName, address: { line1: supplier.address?.line1, district: supplier.address?.district, province: supplier.address?.province, postalCode: supplier.address?.postalCode, country: 'TR' } }, 'EFATURA', specialIds).party;
      senderTaxId = supplier.identityNumber || null;
      const items = (po?.items || []).slice(0, 3);
      const lines = items.length ? items.map((it) => ({ name: it.productName, quantity: Number(it.unitQuantity || it.quantity), unitCode: it.unitCode || 'C62', unitPrice: Number(it.unitPrice || it.price), vatRate: Number((it as any).taxRate ?? 20) })) : [{ name: 'Muhtelif malzeme', quantity: 10, unitCode: 'C62', unitPrice: 150, vatRate: 20 }];
      const orderRef = po ? { id: po.poNumber, issueDate: dateKeyInZone(new Date(po.createdAt), company.timezone) } : null;
      if (kind === 'DESPATCH') {
        doc = sampleDespatch({ documentNo: `TDR${today.slice(0, 4)}${seq}`, issueDate: today, actualDespatchDate: today, supplier: sender, customer: us, lines, orderRef, driver: { firstName: 'Hasan', familyName: 'Kara', tckn: '19384726550' }, plate: '27ABC456' });
      } else {
        doc = sampleInvoice({ documentNo: `TDF${today.slice(0, 4)}${seq}`, issueDate: today, profileId: kind === 'TICARI_INVOICE' ? 'TICARIFATURA' : 'TEMELFATURA', supplier: sender, customer: us, lines, orderRef });
      }
    }
    await provider.deliverToInbox(this.companyId, { ettn: doc.ettn, docType: kind === 'DESPATCH' ? 'DESPATCH' : 'INVOICE', xml: doc.xml, senderTaxId });
    return this.fetch();
  }
}
