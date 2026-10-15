import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CustomerEntity, customerLegacyFields } from '../../entities/customer.entity';
import { CustomerAddressEntity } from '../../entities/customer-address.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { UserEntity } from '../../entities/user.entity';
import { OrderEntity } from '../../entities/order.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { ConsentEntity, LegalAcceptanceEntity, SubprocessorEntity } from '../../entities/kvkk.entity';
import { WebhookEndpointEntity } from '../../entities/webhook-endpoint.entity';
import { formatAddress } from '../../entities/address.embedded';
import { DATA_CATALOG, SUBJECT_GROUP_LABELS, SubjectGroup } from '../../shared/kvkk/data-catalog';
import { AuditService } from '../integrations/audit.service';
import { esc, legalPage, trDay } from '../inventory-accounting/legal-print';
import { retentionLabel } from '../../shared/kvkk/platform';

export type SubjectType = 'customer' | 'supplier' | 'user';
export const SUBJECT_TYPES: SubjectType[] = ['customer', 'supplier', 'user'];

/**
 * "Tüm verilerim" report of a data subject (KVKK md. 11/1-b; Başvuru Tebliği md. 6): every record
 * the application keeps about the person, the processing purposes and legal bases, the recipients
 * (sub-processors, integrations that received the data) and the retention periods. JSON for
 * machines, printable HTML (save as PDF) for the applicant. The export itself is logged (read_export).
 */
@Injectable()
export class SubjectReportService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly tenant: TenantContext, private readonly audit: AuditService) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  async build(type: string, id: string): Promise<Record<string, any>> {
    const started = Date.now();
    if (!(SUBJECT_TYPES as string[]).includes(type)) throw new BadRequestException(err('SUBJECT_TYPE_INVALID'));
    const m = this.ds.manager;
    const cid = this.companyId;
    const company = await m.findOneByOrFail(CompanyEntity, { id: cid });
    let subject: Record<string, unknown>;
    let groups: SubjectGroup[];
    const records: Record<string, unknown> = {};
    if (type === 'customer') {
      const c = await m.findOne(CustomerEntity, { where: { id, companyId: cid } });
      if (!c) throw new NotFoundException(err('CUSTOMER_NOT_FOUND'));
      subject = { ...c, ...customerLegacyFields(c), addressText: formatAddress(c.address) };
      groups = ['CUSTOMER', 'CUSTOMER_CONTACT', 'DELIVERY_CONTACT'];
      records['addresses'] = await m.find(CustomerAddressEntity, { where: { companyId: cid, customerId: id } });
      const orders = await m.find(OrderEntity, { where: { companyId: cid, customerId: id }, relations: ['items'], order: { date: 'DESC' } });
      records['orders'] = orders.map((o) => ({ orderNumber: o.orderNumber, date: o.date, status: o.status, customerName: o.customerName, currency: o.currency, grandTotal: o.grandTotal, items: (o.items || []).map((i) => ({ productName: i.productName, quantity: i.quantity })) }));
      records['invoices'] = await m.query('SELECT documentNo, issueDate, status, payableTotal, currency, buyerSnapshot FROM invoices WHERE companyId = ? AND customerId = ? ORDER BY issueDate DESC', [cid, id]);
      records['despatches'] = await m.query('SELECT documentNo, issueDate, status, buyerSnapshot, deliveryAddress FROM despatches WHERE companyId = ? AND customerId = ? ORDER BY issueDate DESC', [cid, id]);
      records['returns'] = await m.query('SELECT returnNo, status, partySnapshot, createdAt FROM returns WHERE companyId = ? AND customerId = ? ORDER BY createdAt DESC', [cid, id]);
      records['traceability'] = await m.query("SELECT documentType, documentNo, documentDate, productId, lotNumber, quantity FROM document_line_tracking WHERE companyId = ? AND partyType = 'CUSTOMER' AND partyId = ? ORDER BY documentDate DESC", [cid, id]);
      records['consents'] = await m.find(ConsentEntity, { where: { companyId: cid, subjectType: 'CUSTOMER', subjectId: id }, order: { givenAt: 'DESC' } });
      records['privacyNotice'] = { givenAt: c.noticeGivenAt ?? null, version: c.noticeVersion ?? null, channel: c.noticeChannel ?? null };
    } else if (type === 'supplier') {
      const s = await m.findOne(SupplierEntity, { where: { id, companyId: cid } });
      if (!s) throw new NotFoundException(err('SUPPLIER_NOT_FOUND'));
      subject = { ...s, addressText: formatAddress(s.address) };
      groups = ['SUPPLIER'];
      records['purchaseOrders'] = await m.query('SELECT poNumber, status, createdAt FROM purchase_orders WHERE companyId = ? AND supplierId = ? ORDER BY createdAt DESC', [cid, id]);
      records['goodsReceipts'] = await m.query('SELECT receiptNo, status, supplierInvoiceNo, supplierInvoiceDate, createdAt FROM goods_receipts WHERE companyId = ? AND supplierId = ? ORDER BY createdAt DESC', [cid, id]);
      records['consents'] = await m.find(ConsentEntity, { where: { companyId: cid, subjectType: 'SUPPLIER', subjectId: id } });
    } else {
      const u = await m.findOne(UserEntity, { where: { id, companyId: cid } });
      if (!u) throw new NotFoundException(err('USER_NOT_FOUND'));
      subject = { id: u.id, username: u.username, fullName: u.fullName, email: u.email, department: u.department, role: u.role, language: u.language, timezone: u.timezone, createdAt: u.createdAt, totpEnabled: !!u.totpEnabledAt };
      groups = ['USER'];
      records['acceptances'] = await m.find(LegalAcceptanceEntity, { where: { companyId: cid, userId: id }, order: { acceptedAt: 'DESC' } });
      records['sessions'] = await m.query('SELECT createdAt, lastUsedAt, expiresAt, revokedAt, ip, userAgent FROM user_sessions WHERE companyId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 200', [cid, id]);
    }
    // Audit trail entries about the subject (or made by the user).
    const auditWhere = type === 'user' ? 'userId = ?' : 'entityType = ? AND entityId = ?';
    const auditParams = type === 'user' ? [id] : [type === 'customer' ? 'customers' : 'suppliers', id];
    records['auditTrail'] = await m.query(`SELECT action, entityType, username, createdAt, maskedAt FROM audit_logs WHERE companyId = ? AND ${auditWhere} ORDER BY createdAt DESC LIMIT 500`, [cid, ...auditParams]);

    // Recipients: sub-processors, integrations (webhook endpoints) and what they received.
    const subs = await m.find(SubprocessorEntity, { where: [{ companyId: cid, active: true }, { companyId: IsNull(), active: true }] });
    const hooks = await m.find(WebhookEndpointEntity, { where: { companyId: cid } });
    const deliveries: { endpointId: string; n: string }[] = type === 'customer'
      ? await m.query("SELECT endpointId, COUNT(*) n FROM webhook_deliveries WHERE companyId = ? AND (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.data.customerId')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(payload, '$.data.id')) = ?) GROUP BY endpointId", [cid, id, id])
      : [];
    const recipients = {
      subprocessors: subs.map((s) => ({ name: s.name, service: s.service, country: s.country, transferBasis: s.transferBasis })),
      webhookRecipients: hooks.map((h) => ({ host: hostOf(h.url), destinationCountry: h.destinationCountry, transferBasis: h.transferBasis, includePersonalData: h.includePersonalData, events: h.events, deliveriesAboutSubject: Number(deliveries.find((d) => d.endpointId === h.id)?.n || 0) })),
      legalRecipients: Array.from(new Set(DATA_CATALOG.filter((e) => groups.includes(e.subjectGroup)).flatMap((e) => e.recipients))),
    };
    const processing = DATA_CATALOG.filter((e) => groups.includes(e.subjectGroup) && !e.special).map((e) => ({
      category: e.category, subjectGroup: SUBJECT_GROUP_LABELS[e.subjectGroup].tr, purposes: e.purposes, legalBasis: e.legalBasis, retention: retentionLabel(e.retentionCategory, 'tr'),
    }));
    const report = {
      generatedAt: new Date().toISOString(),
      generationMs: 0,
      controller: { legalName: company.legalName || company.name, taxId: company.taxId, mersisNo: company.mersisNo, address: formatAddress(company.address), kvkkContactEmail: company.kvkkContactEmail || company.email },
      subjectType: type,
      subject,
      records,
      processing,
      recipients,
    };
    report.generationMs = Date.now() - started;
    await this.audit.record({ companyId: cid, action: 'read_export', entityType: type === 'customer' ? 'customers' : type === 'supplier' ? 'suppliers' : 'users', entityId: id, after: { report: 'kvkk_subject_export', ms: report.generationMs } });
    return report;
  }

  /** Printable report (saved as PDF by the browser). Always Turkish (the applicant's language of the request). */
  async html(type: string, id: string): Promise<string> {
    const r = await this.build(type, id);
    const company = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const kv = (o: Record<string, unknown>) =>
      `<table class="t"><tbody>${Object.entries(o)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object' && !/hash|password|secret|token/i.test(k))
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v instanceof Date ? v.toISOString() : v)}</td></tr>`)
        .join('')}</tbody></table>`;
    const list = (title: string, rows: any[], cols: string[]) =>
      `<h3>${esc(title)} (${rows.length})</h3>${rows.length ? `<table class="t"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((row) => `<tr>${cols.map((c) => `<td>${esc(fmt(row[c]))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>` : '<p>-</p>'}`;
    const rec = r['records'] as Record<string, any[]>;
    let body = `<p>Oluşturma: ${esc(r['generatedAt'])} (${r['generationMs']} ms). Bu rapor KVKK md. 11/1-b kapsamında ilgili kişiye ilişkin tüm kayıtları içerir.</p>`;
    body += `<h3>İlgili kişi</h3>${kv(r['subject'])}`;
    for (const [key, rows] of Object.entries(rec)) {
      if (!Array.isArray(rows)) {
        body += `<h3>${esc(key)}</h3>${kv(rows as Record<string, unknown>)}`;
        continue;
      }
      const cols = rows.length ? Object.keys(rows[0]).filter((c) => !['items', 'buyerSnapshot', 'partySnapshot', 'deliveryAddress', 'companyId', 'id'].includes(c)).slice(0, 8) : [];
      body += list(key, rows, cols);
    }
    body += `<h3>İşleme amaçları ve hukuki sebepler</h3><table class="t"><thead><tr><th>Kategori</th><th>Kişi grubu</th><th>Amaç</th><th>Hukuki sebep</th><th>Saklama</th></tr></thead><tbody>${(r['processing'] as any[])
      .map((p) => `<tr><td>${esc(p.category)}</td><td>${esc(p.subjectGroup)}</td><td>${esc(p.purposes.join('; '))}</td><td>${esc(p.legalBasis.join('; '))}</td><td>${esc(p.retention)}</td></tr>`)
      .join('')}</tbody></table>`;
    const rc = r['recipients'] as Record<string, any[]>;
    body += list('Veri işleyenler (alt işleyenler)', rc['subprocessors'], ['name', 'service', 'country', 'transferBasis']);
    body += list('Entegrasyon alıcıları (webhook)', rc['webhookRecipients'], ['host', 'destinationCountry', 'transferBasis', 'includePersonalData', 'deliveriesAboutSubject']);
    body += `<h3>Alıcı grupları</h3><p>${esc(rc['legalRecipients'].join('; '))}</p>`;
    return legalPage('İlgili Kişi Veri Raporu (KVKK md. 11)', company, body, { landscape: true });
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '-';
  }
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return trDay(v);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  return String(v);
}
