import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { parseUbl, ParsedParty } from '../ubl/parser';
import { buildReceiptAdviceXml } from '../ubl/receipt-advice.builder';
import { UblParty } from '../ubl/model';
import { MockStore } from './mock-store';
import {
  EArsivDelivery,
  EDocumentProvider,
  InboxItem,
  NoticeInput,
  OutgoingDocument,
  ProviderCapabilities,
  ProviderContext,
  ProviderDocType,
  ProviderError,
  ProviderStatus,
  ProviderWebhookUpdate,
  RegistryDocType,
  RegistryResult,
  SendResult,
  StatusResult,
} from './edocument-provider';

/**
 * Mock integrator for development and tests (WP5). Behaviour is driven by the (encrypted)
 * credentials JSON of the company:
 *  - registeredInvoiceTaxIds / registeredDespatchTaxIds: VKN / TCKN that GİB reports as registered;
 *  - simulate: NONE | UNAVAILABLE | TIMEOUT | REJECT (outage, lost answer, GİB rejection);
 *  - acceptDelaySeconds (default 5): PROVIDER_RECEIVED -> GIB_ACCEPTED / DELIVERED;
 *  - responseDelaySeconds (default 20): TICARIFATURA answer (KABUL, RED for rejectingTaxIds) and the
 *    receiver's receipt advice of an e-İrsaliye (partial for partialReceiptTaxIds) in the inbox;
 *  - webhookSecret: HMAC-SHA256 of status callbacks (header X-Mock-Signature).
 * Everything is stored in ebelge_mock_documents (survives restarts) or memory (unit tests).
 */
export class MockEDocumentProvider implements EDocumentProvider {
  readonly name = 'MOCK';
  readonly label = 'Mock entegratör (test)';
  /** Never reaches GİB: TEST environment only (see providerUsageAllowed). */
  readonly testOnly = true;

  constructor(private readonly store: MockStore) {}

  capabilities(): ProviderCapabilities {
    return { eFatura: true, eArsiv: true, eIrsaliye: true, receiptAdvice: true, applicationResponse: true, cancelEArsiv: true, reportCancellationOrObjection: true, inbox: true, pdf: false, numbering: false, webhooks: true };
  }

  private opt(ctx: ProviderContext) {
    const c = ctx.credentials || {};
    // Lists may arrive as arrays, JSON text (the masked GET shape written back) or comma-separated text.
    const list = (k: string): string[] => {
      const v = c[k];
      if (Array.isArray(v)) return v.map(String);
      if (typeof v !== 'string' || !v.trim()) return [];
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        /* comma separated */
      }
      return v.split(',').map((x) => x.trim()).filter(Boolean);
    };
    return {
      simulate: String(c['simulate'] || 'NONE').toUpperCase(),
      acceptDelay: Number(c['acceptDelaySeconds'] ?? 5) * 1000,
      responseDelay: Number(c['responseDelaySeconds'] ?? 20) * 1000,
      registeredInvoice: list('registeredInvoiceTaxIds'),
      registeredDespatch: list('registeredDespatchTaxIds'),
      rejecting: list('rejectingTaxIds'),
      partialReceipt: list('partialReceiptTaxIds'),
      webhookSecret: c['webhookSecret'] ? String(c['webhookSecret']) : null,
    };
  }

  private now(ctx: ProviderContext): Date {
    return ctx.now || new Date();
  }

  private guard(ctx: ProviderContext): void {
    const o = this.opt(ctx);
    if (o.simulate === 'UNAVAILABLE') throw new ProviderError('UNAVAILABLE', 'Mock entegratör servisine ulaşılamıyor (simülasyon).');
    if (!ctx.credentials?.['apiUser']) throw new ProviderError('AUTH', 'Mock entegratör kullanıcı adı tanımlı değil.');
  }

  async testConnection(ctx: ProviderContext) {
    this.guard(ctx);
    return { ok: true, message: `MOCK ${ctx.environment}: ${ctx.taxId}` };
  }

  async checkUser(ctx: ProviderContext, taxId: string, docType: RegistryDocType): Promise<RegistryResult> {
    this.guard(ctx);
    const o = this.opt(ctx);
    const registered = (docType === 'DESPATCH' ? o.registeredDespatch : o.registeredInvoice).includes(String(taxId));
    return { registered, aliases: registered ? [`urn:mail:${docType === 'DESPATCH' ? 'irsaliye' : 'default'}pk@${taxId}.mock`] : [], title: null };
  }

  private async receive(ctx: ProviderContext, doc: OutgoingDocument, data: Record<string, unknown> = {}): Promise<SendResult> {
    this.guard(ctx);
    const o = this.opt(ctx);
    const existing = await this.store.get(ctx.companyId, doc.ettn, 'SENT');
    if (existing) throw new ProviderError('DUPLICATE', `Bu ETTN ile belge daha önce alındı: ${doc.ettn}`, false);
    const at = this.now(ctx);
    const rejected = o.simulate === 'REJECT';
    await this.store.insert({
      companyId: ctx.companyId,
      ettn: doc.ettn,
      docType: doc.docType,
      box: 'SENT',
      counterpartyTaxId: doc.receiverTaxId,
      xml: doc.xml,
      status: rejected ? 'REJECTED' : 'PROVIDER_RECEIVED',
      receivedAt: at,
      data: { ...data, profileId: doc.profileId, documentNo: doc.documentNo, providerRef: `MOCK-${doc.ettn.slice(0, 8).toUpperCase()}`, ...(rejected ? { code: '1163', message: 'Belge GİB tarafından reddedildi (simülasyon).' } : {}) },
    });
    if (o.simulate === 'TIMEOUT') {
      // The document arrived but the answer was lost: the outbox must ask for the status instead of re-sending.
      throw new ProviderError('TIMEOUT', 'Mock entegratör yanıt vermedi (zaman aşımı simülasyonu); belge alınmış olabilir.');
    }
    return { providerRef: `MOCK-${doc.ettn.slice(0, 8).toUpperCase()}`, status: rejected ? 'REJECTED' : 'PROVIDER_RECEIVED', at, message: rejected ? 'Belge GİB tarafından reddedildi (simülasyon).' : null };
  }

  sendInvoice(ctx: ProviderContext, doc: OutgoingDocument) {
    return this.receive(ctx, doc);
  }

  async sendEArsiv(ctx: ProviderContext, doc: OutgoingDocument, delivery: EArsivDelivery) {
    const r = await this.receive(ctx, doc, { sendType: delivery.sendType, channel: delivery.channel, recipient: delivery.recipient ?? null });
    if (r.status === 'REJECTED') return r;
    // e-Arşiv: the integrator signs, delivers (e-mail / printout) and reports to GİB.
    await this.store.update(ctx.companyId, doc.ettn, 'SENT', { status: 'DELIVERED' });
    return { ...r, status: 'DELIVERED' as ProviderStatus };
  }

  sendDespatch(ctx: ProviderContext, doc: OutgoingDocument) {
    return this.receive(ctx, doc);
  }

  sendReceiptAdvice(ctx: ProviderContext, doc: OutgoingDocument) {
    return this.receive(ctx, doc);
  }

  sendApplicationResponse(ctx: ProviderContext, doc: OutgoingDocument) {
    return this.receive(ctx, doc);
  }

  async cancelEArsiv(ctx: ProviderContext, ettn: string, reason: string) {
    this.guard(ctx);
    const d = await this.store.get(ctx.companyId, ettn, 'SENT');
    if (!d || d.docType !== 'EARCHIVE') throw new ProviderError('NOT_FOUND', `e-Arşiv belgesi bulunamadı: ${ettn}`, false);
    const at = this.now(ctx);
    await this.store.update(ctx.companyId, ettn, 'SENT', { status: 'CANCELLED', data: { ...(d.data || {}), cancelReason: reason, cancelledAt: at.toISOString() } });
    return { cancelledAt: at, providerRef: `MOCK-CNL-${ettn.slice(0, 8).toUpperCase()}` };
  }

  async reportCancellationOrObjection(ctx: ProviderContext, notice: NoticeInput) {
    this.guard(ctx);
    const d = await this.store.get(ctx.companyId, notice.ettn, 'SENT');
    if (d) await this.store.update(ctx.companyId, notice.ettn, 'SENT', { data: { ...(d.data || {}), notices: [...((d.data?.['notices'] as unknown[]) || []), notice] }, ...(notice.kind === 'CANCEL' ? { status: 'CANCELLED' } : {}) });
    return { reference: `MOCK-NTC-${randomUUID().slice(0, 8).toUpperCase()}` };
  }

  /** Simulated progress: GİB acceptance after acceptDelay; receiver answer after responseDelay. */
  async getStatus(ctx: ProviderContext, ettn: string, _docType: ProviderDocType): Promise<StatusResult | null> {
    this.guard(ctx);
    const d = await this.store.get(ctx.companyId, ettn, 'SENT');
    if (!d) return null;
    const o = this.opt(ctx);
    const age = this.now(ctx).getTime() - new Date(d.receivedAt).getTime();
    let status = d.status as ProviderStatus;
    let code: string | null = (d.data?.['code'] as string) || null;
    let message: string | null = (d.data?.['message'] as string) || null;
    if (status === 'PROVIDER_RECEIVED' && age >= o.acceptDelay) status = d.docType === 'DESPATCH' ? 'GIB_ACCEPTED' : 'DELIVERED';
    if (status === 'DELIVERED' && d.docType === 'INVOICE' && d.data?.['profileId'] === 'TICARIFATURA' && age >= o.responseDelay) {
      const red = o.rejecting.includes(String(d.counterpartyTaxId));
      status = red ? 'REJECTED' : 'ACCEPTED';
      code = red ? 'RED' : 'KABUL';
      message = red ? 'Alıcı faturayı reddetti (uygulama yanıtı RED).' : 'Alıcı faturayı kabul etti (uygulama yanıtı KABUL).';
    }
    if (status !== d.status) await this.store.update(ctx.companyId, ettn, 'SENT', { status, data: { ...(d.data || {}), code, message } });
    if (d.docType === 'DESPATCH' && status === 'GIB_ACCEPTED' && age >= o.responseDelay) await this.generateReceipt(ctx, d.ettn);
    return { status, at: this.now(ctx), code, message, providerRef: (d.data?.['providerRef'] as string) || null };
  }

  /** The receiver answers a registered e-İrsaliye with a receipt advice (full, or partial for partialReceiptTaxIds). */
  private async generateReceipt(ctx: ProviderContext, despatchEttn: string): Promise<void> {
    const d = await this.store.get(ctx.companyId, despatchEttn, 'SENT');
    if (!d || d.data?.['receiptGenerated']) return;
    const o = this.opt(ctx);
    if (!o.registeredDespatch.includes(String(d.counterpartyTaxId))) {
      await this.store.update(ctx.companyId, despatchEttn, 'SENT', { data: { ...(d.data || {}), receiptGenerated: true } });
      return;
    }
    const p = parseUbl(d.xml);
    const partial = o.partialReceipt.includes(String(d.counterpartyTaxId));
    const at = this.now(ctx);
    const ettn = randomUUID();
    const day = at.toISOString().slice(0, 10);
    const xml = buildReceiptAdviceXml({
      ettn,
      documentNo: `MKY${day.slice(0, 4)}${String(parseInt(ettn.replace(/-/g, '').slice(0, 8), 16) % 1e9).padStart(9, '0')}`,
      profileId: 'TEMELIRSALIYE',
      issueDate: day,
      issueTime: at.toISOString().slice(11, 19),
      notes: [partial ? 'Bir kısım mal hasarlı teslim alındı.' : 'Bütün ürünler kabul edildi.'],
      despatch: { ettn: despatchEttn, documentNo: p.id || '', issueDate: p.issueDate || day },
      orderRef: p.orderRef?.issueDate ? { id: p.orderRef.id, issueDate: p.orderRef.issueDate } : null,
      deliveryCustomer: partyFromParsed(p.customer!),
      despatchSupplier: partyFromParsed(p.supplier!),
      actualDespatchDate: p.actualDespatchDate,
      lines: p.lines.map((l, i) => {
        const rejected = partial && i === 0 ? Math.max(0, Math.min(l.quantity, Math.ceil(l.quantity * 0.1))) : 0;
        return { id: i + 1, despatchLineId: l.id, name: l.name, sellersItemId: l.sellersItemId, unitCode: l.unitCode || 'C62', received: Math.round((l.quantity - rejected) * 1e6) / 1e6, rejected, rejectReason: rejected ? 'Ambalaj hasarlı' : null };
      }),
    });
    await this.store.insert({ companyId: ctx.companyId, ettn, docType: 'RECEIPT_ADVICE', box: 'INBOX', counterpartyTaxId: p.customer?.taxId || null, xml, status: 'DELIVERED', receivedAt: at, data: { answers: despatchEttn } });
    await this.store.update(ctx.companyId, despatchEttn, 'SENT', { data: { ...(d.data || {}), receiptGenerated: true } });
  }

  async fetchInbox(ctx: ProviderContext, since: Date | null): Promise<InboxItem[]> {
    this.guard(ctx);
    // Despatch advices whose answer is due produce their receipt advice now.
    for (const d of await this.store.list(ctx.companyId, 'SENT')) {
      if (d.docType === 'DESPATCH' && !d.data?.['receiptGenerated']) await this.getStatus(ctx, d.ettn, 'DESPATCH');
    }
    const docs = await this.store.list(ctx.companyId, 'INBOX', since);
    return docs.map((d) => ({ ettn: d.ettn, docType: d.docType as ProviderDocType, xml: d.xml, receivedAt: new Date(d.receivedAt), senderTaxId: d.counterpartyTaxId ?? null, providerRef: `MOCK-IN-${d.ettn.slice(0, 8).toUpperCase()}` }));
  }

  async getPdf(): Promise<Buffer | null> {
    return null;
  }

  /** Test hook: put a document into the company's inbox. */
  async deliverToInbox(companyId: string, item: { ettn: string; docType: ProviderDocType; xml: string; senderTaxId?: string | null; receivedAt?: Date }): Promise<void> {
    await this.store.insert({ companyId, ettn: item.ettn, docType: item.docType, box: 'INBOX', counterpartyTaxId: item.senderTaxId ?? null, xml: item.xml, status: 'DELIVERED', receivedAt: item.receivedAt || new Date(), data: null });
  }

  parseWebhook(ctx: ProviderContext, headers: Record<string, string | undefined>, rawBody: string): ProviderWebhookUpdate[] | null {
    const secret = this.opt(ctx).webhookSecret;
    const sig = headers['x-mock-signature'] || '';
    if (!secret || !sig) return null;
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(rawBody) as { updates?: { ettn: string; status: ProviderStatus; at?: string; code?: string; message?: string }[] };
    return (body.updates || []).map((u) => ({ ettn: u.ettn, status: u.status, at: u.at ? new Date(u.at) : new Date(), code: u.code ?? null, message: u.message ?? null }));
  }
}

/** UBL party of a parsed document (answers built from received documents). */
export function partyFromParsed(p: ParsedParty): UblParty {
  const isPerson = p.schemeID === 'TCKN';
  const parts = String(p.name || '').trim().split(/\s+/);
  return {
    name: isPerson ? null : p.name,
    person: isPerson ? { firstName: parts.slice(0, -1).join(' ') || parts[0] || '-', familyName: parts.length > 1 ? parts[parts.length - 1] : '-' } : null,
    identifiers: p.taxId ? [{ schemeID: p.schemeID || (p.taxId.length === 11 ? 'TCKN' : 'VKN'), value: p.taxId }] : [],
    taxOffice: p.taxOffice,
    address: {
      street: p.address.street,
      buildingNumber: p.address.buildingNumber,
      district: p.address.district || '-',
      city: p.address.city || '-',
      postalZone: p.address.postalZone,
      country: p.address.country || 'Türkiye',
    },
    email: p.email,
  };
}
