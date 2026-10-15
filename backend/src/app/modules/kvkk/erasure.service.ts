import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { CustomerEntity } from '../../entities/customer.entity';
import { CustomerAddressEntity } from '../../entities/customer-address.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { OrderEntity } from '../../entities/order.entity';
import { ConsentEntity, DestructionLogEntity } from '../../entities/kvkk.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { ANON_MARK, PERSONAL_KEYS, anonymousSupplierName, customerErasurePatch, customerReplacement, maskJson } from '../../shared/kvkk/anonymizer';
import { addPeriod, legalRecordRetentionUntil } from '../../shared/kvkk/retention';
import { todayKey } from '../../shared/tr';
import { WebhookService } from '../integrations/webhook.service';
import { AppGateway } from '../../app.gateway';

/** A legal record group that keeps (restricts) the erasure. */
export interface RetainedGroup {
  type: 'invoices' | 'despatches' | 'returns' | 'incoming_documents' | 'document_line_tracking' | 'stock_movements' | 'goods_receipts' | 'purchase_orders';
  count: number;
  lastDate: string | null;
  retentionUntil: string | null;
}

export interface ErasureResult {
  subjectType: 'CUSTOMER' | 'SUPPLIER';
  subjectId: string;
  mode: 'FULL' | 'PARTIAL';
  restrictedUntil: string | null;
  retained: RetainedGroup[];
  erasedFields: string[];
  deletedAddresses: number;
  maskedOrders: number;
  maskedAuditRows: number;
  maskedWebhookDeliveries: number;
  withdrawnConsents: number;
  /** Recipients notified of the erasure (KVKK md. 11/1-f) */
  notified: { webhookEvent: string; endpoints: number };
  performedAt: string;
}

export interface ErasureContext {
  reason: string;
  dsrId?: string | null;
  runId?: string | null;
  performedBy?: string | null;
  performedByUserId?: string | null;
  /** force FULL (periodic destruction after the restriction ended) */
  retentionEnded?: boolean;
}

const LEGAL_REASON = 'VUK md. 253 ve TTK md. 82 gereği 10 yıllık saklama yükümlülüğü (fatura, irsaliye, iade ve envanter kayıtları)';

/**
 * Applies the right to erasure (KVKK md. 7, 11/1-e) to a customer or a natural-person supplier.
 * Legal records are never touched; when they exist the erasure is partial ("kısıtlama"). Every
 * step is written to destruction_logs (kept at least 3 years) and the recipients are notified
 * through the customer.erased webhook event.
 */
@Injectable()
export class ErasureService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly webhooks: WebhookService,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  /** Legal records of a customer that are still within their retention (31.12.(year + 10)). */
  async retainedRecords(m: EntityManager, customer: CustomerEntity, today: string): Promise<RetainedGroup[]> {
    const cid = this.companyId;
    const q = async (type: RetainedGroup['type'], sql: string, params: unknown[]) => {
      const [r] = await m.query(sql, params);
      const count = Number(r?.n || 0);
      const last = r?.last ? String(r.last).slice(0, 10) : null;
      const until = last ? legalRecordRetentionUntil(last) : null;
      return { type, count, lastDate: last, retentionUntil: until };
    };
    const groups: RetainedGroup[] = [
      await q('invoices', 'SELECT COUNT(*) n, MAX(COALESCE(issueDate, DATE(createdAt))) last FROM invoices WHERE companyId = ? AND customerId = ?', [cid, customer.id]),
      await q('despatches', 'SELECT COUNT(*) n, MAX(COALESCE(issueDate, DATE(createdAt))) last FROM despatches WHERE companyId = ? AND customerId = ?', [cid, customer.id]),
      await q('returns', 'SELECT COUNT(*) n, MAX(COALESCE(invoiceDate, DATE(createdAt))) last FROM returns WHERE companyId = ? AND customerId = ?', [cid, customer.id]),
      await q('incoming_documents', 'SELECT COUNT(*) n, MAX(COALESCE(issueDate, DATE(createdAt))) last FROM incoming_documents WHERE companyId = ? AND customerId = ?', [cid, customer.id]),
      await q('document_line_tracking', "SELECT COUNT(*) n, MAX(COALESCE(documentDate, DATE(createdAt))) last FROM document_line_tracking WHERE companyId = ? AND partyType = 'CUSTOMER' AND partyId = ?", [cid, customer.id]),
    ];
    // Immutable stock ledger rows carrying the customer's identity number (counterpartyTaxId).
    if (customer.identityNumber) {
      groups.push(await q('stock_movements', 'SELECT COUNT(*) n, MAX(COALESCE(documentDate, DATE(transactionDate))) last FROM stock_movements WHERE companyId = ? AND counterpartyTaxId = ?', [cid, customer.identityNumber]));
    }
    return groups.filter((g) => g.count > 0 && (g.retentionUntil ?? '') >= today);
  }

  /** Masks the personal keys of audit rows (KVKK masking of the append-only trail: trigger flag @kvkk_erasure). */
  async maskAuditRows(m: EntityManager, where: string, params: unknown[], keys: string[], replacement: (k: string) => unknown, clearActor = false): Promise<number> {
    const rows: { id: string; before: unknown; after: unknown; username: string | null }[] = await m.query(
      `SELECT id, \`before\`, \`after\`, username FROM audit_logs WHERE companyId = ? AND (${where})`,
      [this.companyId, ...params],
    );
    let n = 0;
    await m.query('SET @kvkk_erasure = 1');
    try {
      for (const r of rows) {
        const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
        const before = parse(r.before);
        const after = parse(r.after);
        const mb = maskJson(before, keys, replacement);
        const ma = maskJson(after, keys, replacement);
        if (mb === before && ma === after && !clearActor) continue;
        await m.query(
          `UPDATE audit_logs SET \`before\` = ?, \`after\` = ?, maskedAt = UTC_TIMESTAMP()${clearActor ? ', userId = NULL, username = NULL, ip = NULL, userAgent = NULL' : ''} WHERE id = ?`,
          [mb === null || mb === undefined ? null : JSON.stringify(mb), ma === null || ma === undefined ? null : JSON.stringify(ma), r.id],
        );
        n++;
      }
    } finally {
      await m.query('SET @kvkk_erasure = NULL');
    }
    return n;
  }

  private async log(m: EntityManager, ctx: ErasureContext, row: Partial<DestructionLogEntity>) {
    const now = new Date();
    await m.insert(DestructionLogEntity, {
      companyId: this.companyId,
      runId: ctx.runId ?? null,
      dsrId: ctx.dsrId ?? null,
      performedBy: ctx.performedBy ?? this.tenant.actor.username ?? 'system',
      performedByUserId: ctx.performedByUserId ?? this.tenant.actor.userId ?? null,
      performedAt: now,
      retainUntil: addPeriod(todayKey('Europe/Istanbul', now), 3, 'YEAR'),
      recordCount: 1,
      ...row,
    } as DestructionLogEntity);
  }

  async eraseCustomer(customerId: string, ctx: ErasureContext): Promise<ErasureResult> {
    const today = todayKey('Europe/Istanbul');
    const result = await this.ds.transaction(async (m) => {
      const c = await m.findOne(CustomerEntity, { where: { id: customerId, companyId: this.companyId }, lock: { mode: 'pessimistic_write' } });
      if (!c) throw new NotFoundException(err('CUSTOMER_NOT_FOUND'));
      const retained = await this.retainedRecords(m, c, today);
      const restrictedUntil = retained.reduce<string | null>((max, g) => (g.retentionUntil && (!max || g.retentionUntil > max) ? g.retentionUntil : max), null);
      const mode: 'FULL' | 'PARTIAL' = retained.length && !ctx.retentionEnded ? 'PARTIAL' : 'FULL';
      const now = new Date();

      const patch = customerErasurePatch(c.id, mode, now, restrictedUntil);
      const erasedFields = Object.keys(patch).filter((k) => !['processingRestricted', 'erasureRestrictedUntil', 'erasureRequestedAt', 'isDeleted', 'anonymizedAt', 'address'].includes(k));
      // Query-builder update: the audit subscriber records only the new (anonymous) values.
      await m.createQueryBuilder().update(CustomerEntity).set(patch as any).where('id = :id AND companyId = :cid', { id: c.id, cid: this.companyId }).execute();
      const delAddr = await m.delete(CustomerAddressEntity, { companyId: this.companyId, customerId: c.id });
      const consents = await m.update(ConsentEntity, { companyId: this.companyId, subjectType: 'CUSTOMER', subjectId: c.id, withdrawnAt: IsNull() }, { withdrawnAt: now, withdrawnChannel: 'ERASURE' });

      const replacement = customerReplacement(c.id);
      // Contact data in the audit trail always; names too when the erasure is full.
      const keys = mode === 'FULL' ? PERSONAL_KEYS : ['email', 'phone', 'notes', 'contactName', 'addressLine1', 'addressLine2', 'line1', 'line2', 'noticeChannel'];
      let maskedAudit = await this.maskAuditRows(m, "entityType = 'customers' AND entityId = ?", [c.id], keys, replacement);
      maskedAudit += await this.maskAuditRows(
        m,
        "entityType = 'customer_addresses' AND (JSON_UNQUOTE(JSON_EXTRACT(`after`, '$.customerId')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(`before`, '$.customerId')) = ?)",
        [c.id, c.id],
        PERSONAL_KEYS,
        replacement,
      );

      let maskedOrders = 0;
      let maskedDeliveries = 0;
      if (mode === 'FULL') {
        const orders: { id: string }[] = await m.query('SELECT id FROM orders WHERE companyId = ? AND customerId = ?', [this.companyId, c.id]);
        if (orders.length) {
          const anon = replacement('customerName') as string;
          const r = await m.createQueryBuilder().update(OrderEntity).set({ customerName: anon } as any).where('companyId = :cid AND customerId = :id', { cid: this.companyId, id: c.id }).execute();
          maskedOrders = r.affected ?? orders.length;
          maskedAudit += await this.maskAuditRows(m, `entityType = 'orders' AND entityId IN (${orders.map(() => '?').join(', ')})`, orders.map((o) => o.id), ['customerName', 'notes', 'note'], replacement);
        }
        // Webhook payloads already delivered with this customer's data (endpoints with includePersonalData).
        const deliveries: { id: string; payload: unknown }[] = await m.query(
          "SELECT id, payload FROM webhook_deliveries WHERE companyId = ? AND (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.data.customerId')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(payload, '$.data.id')) = ?)",
          [this.companyId, c.id, c.id],
        );
        for (const d of deliveries) {
          const p = typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload;
          const masked = maskJson(p, ['customerName', 'email', 'phone', 'identityNumber', 'taxNumber', 'notes', 'buyerSnapshot', 'partySnapshot', 'deliveryAddress', 'address', 'addressText'], replacement);
          if (masked !== p) {
            await m.query('UPDATE webhook_deliveries SET payload = ? WHERE id = ?', [JSON.stringify(masked), d.id]);
            maskedDeliveries++;
          }
        }
      }

      await this.log(m, ctx, {
        dataCategory: mode === 'FULL' ? 'CUSTOMER_INACTIVE' : 'CUSTOMER_IDENTITY',
        entityType: 'customers',
        entityId: c.id,
        method: 'ANONYMIZATION',
        result: mode === 'FULL' ? 'DONE' : 'RESTRICTED',
        reason: mode === 'FULL' ? ctx.reason : `${ctx.reason} - İletişim bilgileri ve notlar silindi; kimlik bilgileri ${LEGAL_REASON} nedeniyle ${restrictedUntil} tarihine kadar kısıtlanarak saklanıyor.`,
        restrictedUntil: mode === 'PARTIAL' ? restrictedUntil : null,
      });
      if (maskedAudit) await this.log(m, ctx, { dataCategory: 'AUDIT_LOGS', entityType: 'audit_logs', entityId: c.id, recordCount: maskedAudit, method: 'ANONYMIZATION', result: 'DONE', reason: 'Denetim kaydındaki kişisel veriler maskelendi (zincir bütünlüğü korunur)' });
      if (maskedOrders) await this.log(m, ctx, { dataCategory: 'ORDERS', entityType: 'orders', entityId: c.id, recordCount: maskedOrders, method: 'ANONYMIZATION', result: 'DONE', reason: 'Siparişlerdeki müşteri adı anonimleştirildi' });
      if (maskedDeliveries) await this.log(m, ctx, { dataCategory: 'WEBHOOK_DELIVERIES', entityType: 'webhook_deliveries', entityId: c.id, recordCount: maskedDeliveries, method: 'ANONYMIZATION', result: 'DONE', reason: 'Webhook teslimat yüklerindeki kişisel veriler maskelendi' });

      return {
        subjectType: 'CUSTOMER' as const,
        subjectId: c.id,
        mode,
        restrictedUntil: mode === 'PARTIAL' ? restrictedUntil : null,
        retained: mode === 'PARTIAL' ? retained : [],
        erasedFields,
        deletedAddresses: delAddr.affected ?? 0,
        maskedOrders,
        maskedAuditRows: maskedAudit,
        maskedWebhookDeliveries: maskedDeliveries,
        withdrawnConsents: consents.affected ?? 0,
        notified: { webhookEvent: 'customer.erased', endpoints: 0 },
        performedAt: now.toISOString(),
      };
    });
    // Notify the recipients (KVKK md. 11/1-f) after commit: no personal data in the event.
    const endpoints = await this.ds.query("SELECT COUNT(*) n FROM webhook_endpoints WHERE companyId = ? AND active = 1 AND JSON_CONTAINS(events, '\"customer.erased\"')", [this.companyId]);
    result.notified.endpoints = Number(endpoints?.[0]?.n || 0);
    await this.webhooks.emitMany([
      { companyId: this.companyId, event: 'customer.erased', entityType: 'customers', entityId: customerId, data: { customerId, mode: result.mode, restrictedUntil: result.restrictedUntil, erasedAt: result.performedAt } },
    ]);
    this.gateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'update', customerId, changedFields: ['kvkkErasure'] });
    return result;
  }

  /** Supplier (natural person / farmer): contact data always; the name only without legal records. */
  async eraseSupplier(supplierId: string, ctx: ErasureContext): Promise<ErasureResult> {
    const today = todayKey('Europe/Istanbul');
    return this.ds.transaction(async (m) => {
      const s = await m.findOne(SupplierEntity, { where: { id: supplierId, companyId: this.companyId }, lock: { mode: 'pessimistic_write' } });
      if (!s) throw new NotFoundException(err('SUPPLIER_NOT_FOUND'));
      const q = async (type: RetainedGroup['type'], sql: string) => {
        const [r] = await m.query(sql, [this.companyId, s.id]);
        const last = r?.last ? String(r.last).slice(0, 10) : null;
        return { type, count: Number(r?.n || 0), lastDate: last, retentionUntil: last ? legalRecordRetentionUntil(last) : null };
      };
      const retained = [
        await q('goods_receipts', 'SELECT COUNT(*) n, MAX(COALESCE(supplierInvoiceDate, supplierDespatchDate, DATE(createdAt))) last FROM goods_receipts WHERE companyId = ? AND supplierId = ?'),
        await q('purchase_orders', 'SELECT COUNT(*) n, MAX(DATE(createdAt)) last FROM purchase_orders WHERE companyId = ? AND supplierId = ?'),
      ].filter((g) => g.count > 0 && (g.retentionUntil ?? '') >= today) as RetainedGroup[];
      const restrictedUntil = retained.reduce<string | null>((max, g) => (g.retentionUntil && (!max || g.retentionUntil > max) ? g.retentionUntil : max), null);
      const mode: 'FULL' | 'PARTIAL' = retained.length && !ctx.retentionEnded ? 'PARTIAL' : 'FULL';
      const patch: Record<string, unknown> = { email: null, phone: null, contactPerson: null, notes: null };
      if (mode === 'FULL') Object.assign(patch, { name: anonymousSupplierName(s.id), identityNumber: null, identityNumberHash: null, isDeleted: true });
      await m.createQueryBuilder().update(SupplierEntity).set(patch as any).where('id = :id AND companyId = :cid', { id: s.id, cid: this.companyId }).execute();
      const repl = (k: string) => (k === 'name' ? anonymousSupplierName(s.id) : ANON_MARK);
      const maskedAudit = await this.maskAuditRows(m, "entityType = 'suppliers' AND entityId = ?", [s.id], mode === 'FULL' ? PERSONAL_KEYS : ['email', 'phone', 'contactPerson', 'notes'], repl);
      await this.log(m, ctx, {
        dataCategory: 'SUPPLIER_IDENTITY', entityType: 'suppliers', entityId: s.id, method: 'ANONYMIZATION', result: mode === 'FULL' ? 'DONE' : 'RESTRICTED',
        reason: mode === 'FULL' ? ctx.reason : `${ctx.reason} - İletişim bilgileri silindi; kimlik bilgileri ${LEGAL_REASON} nedeniyle ${restrictedUntil} tarihine kadar saklanıyor.`,
        restrictedUntil: mode === 'PARTIAL' ? restrictedUntil : null,
      });
      return {
        subjectType: 'SUPPLIER' as const, subjectId: s.id, mode, restrictedUntil: mode === 'PARTIAL' ? restrictedUntil : null, retained: mode === 'PARTIAL' ? retained : [],
        erasedFields: Object.keys(patch), deletedAddresses: 0, maskedOrders: 0, maskedAuditRows: maskedAudit, maskedWebhookDeliveries: 0, withdrawnConsents: 0,
        notified: { webhookEvent: 'none', endpoints: 0 }, performedAt: new Date().toISOString(),
      };
    });
  }
}

/** Reasoned answer to the applicant (KVKK md. 13; Başvuru Tebliği md. 6), Turkish and English. */
export function erasureResponseText(r: ErasureResult, applicant: string, lang: 'tr' | 'en' = 'tr'): string {
  const tr = lang === 'tr';
  const groupTr: Record<string, string> = { invoices: 'fatura', despatches: 'sevk irsaliyesi', returns: 'iade belgesi', incoming_documents: 'gelen e-belge', document_line_tracking: 'gıda izlenebilirlik kaydı', stock_movements: 'stok hareket kaydı', goods_receipts: 'mal kabul belgesi', purchase_orders: 'satın alma siparişi' };
  if (r.mode === 'FULL') {
    return tr
      ? `Sayın ${applicant}, KVKK md. 7 ve 11 kapsamındaki silme talebiniz kabul edilmiştir. Kişisel verileriniz ${r.performedAt.slice(0, 10)} tarihinde geri döndürülemez biçimde anonim hale getirilmiştir. Verilerinizin aktarıldığı alıcılar bilgilendirilmiştir.`
      : `Dear ${applicant}, your erasure request under KVKK art. 7 and 11 has been accepted. Your personal data was irreversibly anonymised on ${r.performedAt.slice(0, 10)} and the recipients were informed.`;
  }
  const list = r.retained.map((g) => `${g.count} ${tr ? groupTr[g.type] || g.type : g.type.replace(/_/g, ' ')} (${tr ? 'saklama sonu' : 'retained until'} ${g.retentionUntil})`).join(', ');
  return tr
    ? `Sayın ${applicant}, silme talebiniz kısmen yerine getirilmiştir. İletişim bilgileriniz, notlar ve teslimat adresleriniz silinmiş, rızaya dayalı izinleriniz geri alınmıştır. Ancak ${list} için Vergi Usul Kanunu md. 253 ve Türk Ticaret Kanunu md. 82 uyarınca 10 yıllık saklama yükümlülüğümüz bulunduğundan (KVKK md. 5/2-ç, md. 28/2), kimlik bilgileriniz bu kayıtlarda ${r.restrictedUntil} tarihine kadar yalnızca bu amaçla, erişimi kısıtlanarak saklanacak ve sürenin sonunda resen imha edilecektir.`
    : `Dear ${applicant}, your erasure request has been partially fulfilled. Your contact details, notes and delivery addresses were deleted and your consents withdrawn. Because of our 10-year retention duty (Tax Procedure Law art. 253, Commercial Code art. 82) for ${list}, your identity data is kept in these records, with restricted access and for this purpose only, until ${r.restrictedUntil} and destroyed afterwards.`;
}
