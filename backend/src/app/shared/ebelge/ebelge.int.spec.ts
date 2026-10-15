import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../../../data-source';
import { CompanyEntity } from '../../entities/company.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { InvoiceEntity } from '../../entities/invoice.entity';
import { DocumentSeriesEntity } from '../../entities/document-series.entity';
import { CompanyEBelgeSettingsEntity, EDocumentDeliveryEntity, EDocumentEntity, EDocumentNoticeEntity, EDocumentOutboxEntity, IncomingDocumentEntity, MockProviderDocumentEntity } from '../../entities/ebelge.entity';
import { WarehouseStockService } from '../services/warehouse-stock.service';
import { StockHelperService } from '../services/stock-helper.service';
import { TenantContext } from '../tenant/tenant-context.service';
import { ensureImmutabilityTriggers } from '../inventory/immutability-triggers';
import { ensureDocumentTriggers } from '../documents/document-triggers';
import { DEFAULT_SERIES } from '../documents/default-series';
import { triggerErrorCode } from '../i18n/i18n-exception.filter';
import { DocumentNumberService } from '../../modules/documents/document-number.service';
import { DespatchService } from '../../modules/documents/despatch.service';
import { InvoiceService } from '../../modules/documents/invoice.service';
import { DocumentHooks } from '../../modules/documents/document-support';
import { ProviderRegistry } from '../../modules/ebelge/provider-registry.service';
import { EBelgeSettingsService } from '../../modules/ebelge/ebelge-settings.service';
import { RegistryService } from '../../modules/ebelge/registry.service';
import { EDocumentService } from '../../modules/ebelge/edocument.service';
import { InboxService } from '../../modules/ebelge/inbox.service';
import { EDocumentArchiveService } from '../../modules/ebelge/archive.service';
import { ensureEdocTriggers } from './ebelge-triggers';
import { MockEDocumentProvider, providerUsageAllowed } from './provider';
import { sampleDespatch, sampleInvoice } from './samples';
import { parseUbl } from './ubl/parser';
import { validateUbl } from './validation/ubl-validator';
import { tcknCheckDigits, vknCheckDigit } from '../tr';

/**
 * WP5 end-to-end with the mock integrator (MySQL, throw-away schema `stok_wp5_itest` built by
 * schema sync + all triggers): send -> status -> cancel (8-day window) -> inbox -> match ->
 * response, outbox idempotency, validation rollback, archive triggers, tenant isolation.
 * Skipped when no MySQL server is reachable.
 */
const TEST_DB = process.env.DB_TEST_DATABASE_WP5 || 'stok_wp5_itest';

function envFromFile(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [path.resolve(__dirname, '../../../../../.env'), path.resolve(process.cwd(), '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}
const fileEnv = envFromFile();
const env = (k: string, d: string) => process.env[k] ?? fileEnv[k] ?? d;
const conn = { host: env('DB_HOST', '127.0.0.1'), port: Number(env('DB_PORT', '3306')), username: env('DB_USERNAME', 'root'), password: env('DB_PASSWORD', '') };

let ds: DataSource | null = null;
let available = false;

beforeAll(async () => {
  try {
    const admin = new DataSource({ type: 'mysql', ...conn, connectTimeout: 3000 });
    await admin.initialize();
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    await admin.destroy();
    ds = new DataSource({ type: 'mysql', ...conn, database: TEST_DB, entities: AppDataSource.options.entities, synchronize: true, dropSchema: true, timezone: 'Z', dateStrings: ['DATE'], extra: { connectionLimit: 20 } });
    await ds.initialize();
    const q = (sql: string, params?: unknown[]) => ds!.query(sql, params);
    await ensureImmutabilityTriggers(q);
    await ensureDocumentTriggers(q);
    await ensureEdocTriggers(q);
    available = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`WP5 DB tests skipped (no MySQL): ${(e as Error).message}`);
  }
}, 120000);

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy();
});

const tenant = new TenantContext();
const legal: any = { param: async () => { throw new Error('not seeded'); }, paramOrNull: async () => null };
const gateway: any = { emitToCompany: () => undefined, emitToCompanyAdmins: () => undefined };
const audit: any = { record: async () => undefined };
const vkn = (first9: string) => first9 + vknCheckDigit(first9);

function services() {
  const hooks = new DocumentHooks();
  const stock = new WarehouseStockService(new StockHelperService(), tenant);
  const numbers = new DocumentNumberService(ds!, tenant, legal);
  const despatch = new DespatchService(tenant, ds!, stock, numbers, hooks, gateway);
  const invoices = new InvoiceService(tenant, ds!, numbers, despatch, legal, audit, gateway, hooks);
  const registry = new ProviderRegistry(ds!);
  const settings = new EBelgeSettingsService(ds!, tenant, registry, audit, gateway);
  const reg = new RegistryService(ds!, tenant, settings);
  const edocs = new EDocumentService(ds!, tenant, settings, reg, legal, audit, gateway, hooks, invoices);
  edocs.onModuleInit();
  const inbox = new InboxService(ds!, tenant, settings, edocs, audit, gateway, numbers);
  const archive = new EDocumentArchiveService(ds!, tenant, settings, edocs, audit, gateway);
  return { despatch, invoices, settings, edocs, inbox, archive, mock: registry.get('MOCK') as MockEDocumentProvider };
}

const addr = (line1: string, district: string, province: string, provinceCode: string, postalCode: string, districtId = 3401) => ({ line1, district, districtId, province, provinceCode, postalCode, country: 'TR' }) as any;

async function fixture(slug: string, credentials: Record<string, unknown> = {}) {
  const m = ds!.manager;
  const company = await m.save(CompanyEntity, m.create(CompanyEntity, {
    name: `WP5 ${slug}`, slug: `wp5-${slug}-${Date.now()}`, country: 'TR', baseCurrency: 'TRY', timezone: 'Europe/Istanbul', stockDeductOn: 'despatch', eDocumentMode: 'PROVIDER',
    legalName: `WP5 ${slug} Ticaret A.Ş.`, taxIdType: 'VKN', taxId: vkn('482019375'), taxOfficeName: 'Kozyatağı Vergi Dairesi Müdürlüğü', bookkeepingType: 'BILANCO',
    address: addr('Kayışdağı Caddesi No:12', 'Ataşehir', 'İstanbul', '34', '34750'),
  }));
  for (const s of DEFAULT_SERIES) await m.save(DocumentSeriesEntity, m.create(DocumentSeriesEntity, { companyId: company.id, ...s, isDefault: true, isActive: true }));
  for (const [kind, code] of [['INVOICE', 'TST'], ['DESPATCH', 'TSI']]) await m.save(DocumentSeriesEntity, m.create(DocumentSeriesEntity, { companyId: company.id, kind, mode: 'EDOCUMENT', seriesCode: code, isDefault: true, isActive: true }));
  const unit = await m.save(UnitEntity, m.create(UnitEntity, { companyId: company.id, code: 'pcs', name: 'Adet', isStandard: true, decimals: 0, allowsFraction: false, uneceCode: 'C62' }));
  const main = await m.save(WarehouseEntity, m.create(WarehouseEntity, { companyId: company.id, name: 'Merkez', code: 'WH-1', address: { line1: 'Hadımköy Yolu No:41', districtId: 3402 } as any }));
  const product = await m.save(ProductEntity, m.create(ProductEntity, { companyId: company.id, name: 'USB-C Hub', sku: 'HB-81', category: 'Elektronik', price: 100, quantity: 0, minQuantity: 0, unit: 'pcs', baseUnitId: unit.id }));
  const registered = await m.save(CustomerEntity, m.create(CustomerEntity, {
    companyId: company.id, name: 'Marmara Ofis Mobilyaları Ltd. Şti.', type: 'company', identityType: 'VKN', identityNumber: vkn('564028139'), taxOfficeName: 'Kadıköy Vergi Dairesi Müdürlüğü', isVatTaxpayer: true,
    email: 'muhasebe@marmaraofis.com.tr', address: addr('Moda Caddesi No:45', 'Kadıköy', 'İstanbul', '34', '34710'),
  }));
  const plain = await m.save(CustomerEntity, m.create(CustomerEntity, {
    companyId: company.id, name: 'Anadolu Kırtasiye Ltd. Şti.', type: 'company', identityType: 'VKN', identityNumber: vkn('247918360'), taxOfficeName: 'Kavaklıdere Vergi Dairesi Müdürlüğü', isVatTaxpayer: true,
    email: 'info@anadolukirtasiye.com.tr', address: addr('Atatürk Bulvarı No:211', 'Çankaya', 'Ankara', '06', '06680'),
  }));
  const supplier = await m.save(SupplierEntity, m.create(SupplierEntity, { companyId: company.id, name: 'Gaziantep Kuruyemiş A.Ş.', email: 'satis@gk.com.tr', identityType: 'VKN', identityNumber: vkn('615203948'), isTaxpayer: true, isVatTaxpayer: true }));
  const po = await m.save(PurchaseOrderEntity, m.create(PurchaseOrderEntity, { companyId: company.id, poNumber: `PO-${slug}`, supplierId: supplier.id, supplierName: supplier.name, status: 'Sent', totalAmount: 1000, items: [] } as any));
  const stock = new WarehouseStockService(new StockHelperService(), tenant);
  await tenant.run(company.id, () =>
    ds!.transaction(async (tx) => {
      await stock.begin(tx, company.id);
      const p = await tx.findOneOrFail(ProductEntity, { where: { id: product.id }, lock: { mode: 'pessimistic_write' } });
      const allocs = await stock.add(tx, p, 50, main.id);
      await stock.recordMovements(tx, p, 0, allocs, { type: 'IN', reasonCode: 'OPENING' });
    }),
  );
  const order = async (customer: CustomerEntity, n: string, qty = 2) =>
    m.save(OrderEntity, m.create(OrderEntity, {
      companyId: company.id, orderNumber: `ORD-${slug}-${n}`, customerId: customer.id, customerName: customer.name, status: 'Pending', stockMode: 'despatch', currency: 'TRY', exchangeRate: 1,
      subtotal: 100 * qty, taxTotal: 20 * qty, grandTotal: 120 * qty, totalAmount: 120 * qty, payableTotal: 120 * qty, subtotalTry: 100 * qty, taxTotalTry: 20 * qty, grandTotalTry: 120 * qty, charges: [],
      items: [m.create(OrderItemEntity, {
        productId: product.id, productName: product.name, quantity: qty, unitQuantity: qty, unitFactor: 1, unitCode: 'C62', price: 100, unitPrice: 100, grossAmount: 100 * qty, netAmount: 100 * qty,
        taxRate: 20, taxAmount: 20 * qty, lineTotal: 120 * qty, discountRate: 0, discountAmount: 0, documentDiscountShare: 0, withheldTaxAmount: 0, otvAmount: 0,
      })],
    }));
  const svc = services();
  await tenant.run(company.id, () =>
    svc.settings.update({ provider: 'MOCK', environment: 'TEST', credentials: { apiUser: 'test', apiPassword: 'pw', registeredInvoiceTaxIds: [registered.identityNumber, company.taxId], registeredDespatchTaxIds: [registered.identityNumber], acceptDelaySeconds: 0, responseDelaySeconds: 0, ...credentials } }),
  );
  return { company, main, product, registered, plain, supplier, po, order, ...svc };
}

const trig = (p: Promise<unknown>) => p.then(() => null, (e) => triggerErrorCode(e));

describe('WP5 e-Belge with the mock integrator (MySQL)', () => {
  it('e-Fatura: routing, UBL in the archive, outbox sends once, status timeline, cancellation needs a notice', async () => {
    if (!available) return;
    const f = await fixture('efatura', { preferredTicari: false });
    const run = <T>(fn: () => Promise<T>) => tenant.run(f.company.id, fn);
    const o = await f.order(f.registered, '1');
    const draft = await run(() => f.invoices.createFromOrder(o.id, {}));
    const issued = await run(() => f.invoices.issue(draft.id, {}));
    expect(issued).toMatchObject({ status: 'QUEUED', profileId: 'TEMELFATURA', numberMode: 'EDOCUMENT', documentNo: expect.stringMatching(/^TST\d{4}0{8}1$/) });
    const eDoc = await ds!.manager.findOneByOrFail(EDocumentEntity, { companyId: f.company.id, ettn: issued.ettn });
    expect(eDoc).toMatchObject({ documentType: 'INVOICE', direction: 'OUT', gibStatus: 'QUEUED', retentionUntil: `${Number(String(issued.issueDate).slice(0, 4)) + 10}-12-31` });
    expect(await validateUbl(eDoc.xml, 'Invoice')).toEqual([]);

    // Still in the queue: cancelling would leave a gap in the series the integrator / GİB sees.
    await expect(run(() => f.invoices.cancel(issued.id, 'Yanlış alıcı', undefined, { noticeChannel: 'KEP', noticeDate: '2026-10-15' }))).rejects.toMatchObject({ response: { code: 'EDOC_CANCEL_BEFORE_SEND' } });

    // Outbox: sent once; a second worker run or a direct re-send changes nothing (idempotency by ETTN).
    expect(await f.edocs.processOutbox(10, f.company.id)).toMatchObject({ processed: 1, sent: 1 });
    expect(await f.edocs.processOutbox(10, f.company.id)).toMatchObject({ processed: 0 });
    const item = await ds!.manager.findOneByOrFail(EDocumentOutboxEntity, { ettn: issued.ettn, operation: 'SEND' });
    expect(item).toMatchObject({ status: 'DONE', attempt: 1 });
    expect(await f.edocs.processItem(item.id)).toBeNull();
    await expect(run(() => ds!.transaction((m) => f.edocs.enqueue(m, eDoc, 'SEND', null)))).rejects.toMatchObject({ response: { code: 'EDOC_ALREADY_SENT' } });
    expect(await ds!.manager.countBy(MockProviderDocumentEntity, { companyId: f.company.id, ettn: issued.ettn, box: 'SENT' })).toBe(1);
    expect((await ds!.manager.findOneByOrFail(InvoiceEntity, { id: issued.id })).status).toBe('SENT');

    // Polling: GİB delivery.
    await run(() => f.edocs.pollStatuses(f.company.id));
    expect((await ds!.manager.findOneByOrFail(InvoiceEntity, { id: issued.id })).status).toBe('DELIVERED');
    const detail = await run(() => f.archive.detail(eDoc.id));
    expect(detail.events.map((e: any) => e.status).sort()).toEqual(['DELIVERED', 'PROVIDER_RECEIVED', 'QUEUED']);

    // e-Fatura cancellation: only with the external notice (TTK 18/3), reported to the integrator.
    await expect(run(() => f.invoices.cancel(issued.id, 'Yanlış alıcı'))).rejects.toMatchObject({ response: { code: 'EFATURA_CANCEL_NOTICE_REQUIRED' } });
    const cancelled = await run(() => f.invoices.cancel(issued.id, 'Yanlış alıcı', undefined, { noticeChannel: 'KEP', noticeDate: '2026-10-15', noticeRef: 'KEP-2026-0042' }));
    expect(cancelled).toMatchObject({ status: 'CANCELLED', gibStatus: 'CANCELLED' });
    expect(await ds!.manager.findOneByOrFail(EDocumentNoticeEntity, { ettn: issued.ettn })).toMatchObject({ kind: 'CANCEL', channel: 'KEP', reportedToProvider: true });
  }, 180000);

  it('TICARIFATURA is accepted by the receiver; unregistered buyers get e-Arşiv with an 8-day cancellation window', async () => {
    if (!available) return;
    const f = await fixture('earsiv');
    const run = <T>(fn: () => Promise<T>) => tenant.run(f.company.id, fn);
    await ds!.manager.update(CustomerEntity, { id: f.registered.id }, { preferredProfile: 'TICARIFATURA' });
    const t = await run(async () => f.invoices.issue((await f.invoices.createFromOrder((await f.order(f.registered, 't')).id, {})).id, {}));
    expect(t.profileId).toBe('TICARIFATURA');
    await f.edocs.processOutbox(10, f.company.id);
    await run(() => f.edocs.pollStatuses(f.company.id));
    await run(() => f.edocs.pollStatuses(f.company.id));
    expect((await ds!.manager.findOneByOrFail(InvoiceEntity, { id: t.id })).status).toBe('ACCEPTED');

    const a = await run(async () => f.invoices.issue((await f.invoices.createFromOrder((await f.order(f.plain, 'a')).id, {})).id, {}));
    expect(a.profileId).toBe('EARSIVFATURA');
    await f.edocs.processOutbox(10, f.company.id);
    expect((await ds!.manager.findOneByOrFail(InvoiceEntity, { id: a.id })).status).toBe('DELIVERED');
    const delivery = await ds!.manager.findOneByOrFail(EDocumentDeliveryEntity, { ettn: a.ettn });
    expect(delivery).toMatchObject({ channel: 'EMAIL', recipient: 'info@anadolukirtasiye.com.tr' });
    const html = await run(async () => f.archive.html((await ds!.manager.findOneByOrFail(EDocumentEntity, { ettn: a.ettn })).id));
    expect(html).toContain('e-Arşiv izni kapsamında elektronik ortamda iletilmiştir.');
    // Within the window: cancelled at the integrator.
    expect(await run(() => f.invoices.cancel(a.id, 'Müşteri talebi'))).toMatchObject({ status: 'CANCELLED', gibStatus: 'CANCELLED' });

    // Delivered 9 days ago: the window is closed.
    const b = await run(async () => f.invoices.issue((await f.invoices.createFromOrder((await f.order(f.plain, 'b')).id, {})).id, {}));
    await f.edocs.processOutbox(10, f.company.id);
    await ds!.query('UPDATE `edocument_deliveries` SET `deliveredAt` = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 9 DAY) WHERE `ettn` = ?', [b.ettn]);
    await expect(run(() => f.invoices.cancel(b.id, 'Geç iptal'))).rejects.toMatchObject({ response: { code: 'EARCHIVE_CANCEL_WINDOW_EXPIRED' } });
    // ... but 8 days ago it is still open (last day included).
    await ds!.query('UPDATE `edocument_deliveries` SET `deliveredAt` = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 DAY) WHERE `ettn` = ?', [b.ettn]);
    expect((await run(() => f.invoices.cancel(b.id, 'Son gün iptal'))).status).toBe('CANCELLED');
  }, 180000);

  it('e-İrsaliye is approved through the outbox; a lost answer is confirmed by status, not re-sent', async () => {
    if (!available) return;
    const f = await fixture('irsaliye', { simulate: 'TIMEOUT' });
    const run = <T>(fn: () => Promise<T>) => tenant.run(f.company.id, fn);
    const o = await f.order(f.registered, 'd');
    const draft = await run(() => f.despatch.createFromOrder(o.id, { sourceWarehouseId: f.main.id, drivers: [{ firstName: 'Kemal', lastName: 'Aksoy', tckn: '612904735' + tcknCheckDigits('612904735').join('') }], plates: [{ plate: '34 DMT 260', type: 'TRUCK' }] } as any));
    const approved = await run(() => f.despatch.approve(draft.id, {}));
    expect(approved).toMatchObject({ status: 'APPROVED', numberMode: 'EDOCUMENT', deliveryChannel: 'GIB' });
    expect(await f.edocs.processOutbox(10, f.company.id)).toMatchObject({ failed: 1 });
    const item = await ds!.manager.findOneByOrFail(EDocumentOutboxEntity, { ettn: approved.ettn });
    expect(item).toMatchObject({ status: 'FAILED', statusCheckRequired: true, lastErrorCode: 'TIMEOUT' });
    await ds!.manager.update(EDocumentOutboxEntity, { id: item.id }, { nextRetryAt: new Date(Date.now() - 1000) });
    expect(await f.edocs.processOutbox(10, f.company.id)).toMatchObject({ sent: 1 });
    expect(await ds!.manager.countBy(MockProviderDocumentEntity, { ettn: approved.ettn, box: 'SENT' })).toBe(1);
    await run(() => f.edocs.pollStatuses(f.company.id));
    expect((await run(() => f.despatch.get(approved.id))).status).toBe('GIB_ACCEPTED');
  }, 180000);

  it('UBL validation errors roll the issue back (no number used) and come in Turkish and English', async () => {
    if (!available) return;
    const f = await fixture('invalid');
    const run = <T>(fn: () => Promise<T>) => tenant.run(f.company.id, fn);
    await ds!.manager.update(CustomerEntity, { id: f.plain.id }, { address: { line1: null, district: null, province: null, provinceCode: null, postalCode: null } as any });
    const draft = await run(async () => f.invoices.createFromOrder((await f.order(f.plain, 'x')).id, {}));
    const e = await run(() => f.invoices.issue(draft.id, {})).catch((x) => x);
    expect(e.response).toMatchObject({ code: 'UBL_VALIDATION_FAILED' });
    expect(e.response.details[0].en).toContain('province');
    const after = await ds!.manager.findOneByOrFail(InvoiceEntity, { id: draft.id });
    expect(after).toMatchObject({ status: 'DRAFT', documentNo: null });
    expect(await ds!.manager.countBy(EDocumentEntity, { companyId: f.company.id })).toBe(0);
  }, 120000);

  it('inbox: fetch, match supplier / purchase order, KABUL answer, partial receipt advice; isolation and archive triggers', async () => {
    if (!available) return;
    const f = await fixture('inbox');
    const run = <T>(fn: () => Promise<T>) => tenant.run(f.company.id, fn);
    const party = (name: string, id: string) => ({ name, identifiers: [{ schemeID: 'VKN', value: id }], address: { district: 'Şehitkamil', city: 'Gaziantep', postalZone: '27060', country: 'Türkiye' } });
    const us = { name: f.company.legalName, identifiers: [{ schemeID: 'VKN', value: f.company.taxId as string }], address: { district: 'Ataşehir', city: 'İstanbul', postalZone: '34750', country: 'Türkiye' } };
    const inv = sampleInvoice({ documentNo: 'GKY2026000004230', issueDate: '2026-10-12', profileId: 'TICARIFATURA', supplier: party(f.supplier.name, f.supplier.identityNumber as string), customer: us, lines: [{ name: 'Antep Fıstığı 1 kg', quantity: 10, unitCode: 'KGM', unitPrice: 920, vatRate: 1 }], orderRef: { id: f.po.poNumber, issueDate: '2026-10-05' } });
    const desp = sampleDespatch({ documentNo: 'GKY2026000000877', issueDate: '2026-10-14', actualDespatchDate: '2026-10-14', supplier: party(f.supplier.name, f.supplier.identityNumber as string), customer: us, lines: [{ name: 'Antep Fıstığı 1 kg', quantity: 10, unitCode: 'KGM' }, { name: 'Badem 1 kg', quantity: 5, unitCode: 'KGM' }], driver: { firstName: 'Hasan', familyName: 'Kara', tckn: '19384726550' }, plate: '27ABC456' });
    await f.mock.deliverToInbox(f.company.id, { ettn: inv.ettn, docType: 'INVOICE', xml: inv.xml, senderTaxId: f.supplier.identityNumber, receivedAt: new Date() });
    await f.mock.deliverToInbox(f.company.id, { ettn: desp.ettn, docType: 'DESPATCH', xml: desp.xml, senderTaxId: f.supplier.identityNumber, receivedAt: new Date() });
    expect(await run(() => f.inbox.fetch())).toMatchObject({ fetched: 2, stored: 2 });
    expect(await run(() => f.inbox.fetch())).toMatchObject({ stored: 0 });
    const list = await run(() => f.inbox.list());
    const inInv = list.find((r) => r.documentType === 'INVOICE')!;
    expect(inInv).toMatchObject({ profileId: 'TICARIFATURA', matchStatus: 'ORDER', supplierId: f.supplier.id, purchaseOrderId: f.po.id, responseRequired: true });

    const answered = await run(() => f.inbox.respond(inInv.id, { response: 'KABUL', note: 'Teslim alındı' }));
    expect(answered).toMatchObject({ status: 'ACCEPTED', responseCode: 'KABUL' });
    const resp = await ds!.manager.findOneByOrFail(EDocumentEntity, { ettn: answered.responseEttn as string });
    expect(resp.documentType).toBe('APPLICATION_RESPONSE');
    expect(await validateUbl(resp.xml, 'ApplicationResponse')).toEqual([]);
    await expect(run(() => f.inbox.respond(inInv.id, { response: 'RED' }))).rejects.toMatchObject({ response: { code: 'INCOMING_ALREADY_ANSWERED' } });

    const inDesp = list.find((r) => r.documentType === 'DESPATCH')!;
    const lineIds = (inDesp.lines as any[]).map((l) => l.id);
    await expect(run(() => f.inbox.receiptAdvice(inDesp.id, { lines: [{ lineId: lineIds[0], accepted: 9, rejected: 3 }] }))).rejects.toMatchObject({ response: { code: 'RECEIPT_ADVICE_QTY_INVALID' } });
    const partial = await run(() => f.inbox.receiptAdvice(inDesp.id, { lines: [{ lineId: lineIds[0], accepted: 8, rejected: 2, reason: 'Ambalaj hasarlı' }, { lineId: lineIds[1], accepted: 5 }] }));
    expect(partial).toMatchObject({ status: 'PARTIALLY_ACCEPTED', responseCode: 'PARTIAL' });
    const ra = await ds!.manager.findOneByOrFail(EDocumentEntity, { ettn: partial.responseEttn as string });
    // Numbered from the RECEIPT_ADVICE series of the company (default IRY, gap-free counter).
    expect(ra.documentNo).toMatch(/^IRY\d{4}0{8}1$/);
    expect(await ds!.manager.countBy(DocumentSeriesEntity, { companyId: f.company.id, kind: 'RECEIPT_ADVICE', mode: 'EDOCUMENT', seriesCode: 'IRY' })).toBe(1);
    expect(await validateUbl(ra.xml, 'ReceiptAdvice')).toEqual([]);
    expect(parseUbl(ra.xml).lines[0]).toMatchObject({ received: 8, rejected: 2 });
    await f.edocs.processOutbox(10, f.company.id);
    for (let i = 0; i < 20 && (await ds!.manager.countBy(EDocumentOutboxEntity, { companyId: f.company.id, status: 'DONE' })) < 2; i++) await new Promise((r) => setTimeout(r, 250));
    expect(await ds!.manager.countBy(EDocumentOutboxEntity, { companyId: f.company.id, status: 'DONE' })).toBe(2);

    // Tenant isolation: another company sees nothing and cannot open the rows.
    const other = await fixture('other');
    expect(await tenant.run(other.company.id, () => other.inbox.list())).toEqual([]);
    expect(await tenant.run(other.company.id, () => other.archive.list())).toEqual([]);
    await expect(tenant.run(other.company.id, () => other.archive.detail(ra.id))).rejects.toMatchObject({ response: { code: 'EDOC_NOT_FOUND' } });
    await expect(tenant.run(other.company.id, () => other.inbox.get(inInv.id))).rejects.toMatchObject({ response: { code: 'EDOC_NOT_FOUND' } });

    // Archive triggers: no delete, XML frozen, status bookkeeping allowed; integrity check passes.
    expect(await trig(ds!.query('DELETE FROM `e_documents` WHERE `id` = ?', [ra.id]))).toBe('EDOCUMENT_ARCHIVE_IMMUTABLE');
    expect(await trig(ds!.query('UPDATE `e_documents` SET `xml` = ? WHERE `id` = ?', ['<x/>', ra.id]))).toBe('EDOCUMENT_ARCHIVE_IMMUTABLE');
    expect(await trig(ds!.query("UPDATE `e_documents` SET `retentionUntil` = '2030-01-01' WHERE `id` = ?", [ra.id]))).toBe('EDOCUMENT_ARCHIVE_IMMUTABLE');
    expect(await trig(ds!.query('UPDATE `e_documents` SET `legalHold` = 1 WHERE `id` = ?', [ra.id]))).toBeNull();
    expect(await trig(ds!.query('DELETE FROM `edocument_events` WHERE `eDocumentId` = ?', [ra.id]))).toBe('EDOCUMENT_ARCHIVE_IMMUTABLE');
    expect((await run(() => f.archive.integrityCheck())).mismatches).toEqual([]);
    expect(await ds!.manager.countBy(IncomingDocumentEntity, { companyId: f.company.id })).toBe(2);
  }, 240000);

  it('outbox: tenant-scoped processing, autoSend off, expired lease asks for the status; mock refused for LIVE / production', async () => {
    if (!available) return;
    const a = await fixture('scope-a');
    const b = await fixture('scope-b');
    const issue = async (f: typeof a, n: string) => tenant.run(f.company.id, async () => f.invoices.issue((await f.invoices.createFromOrder((await f.order(f.registered, n)).id, {})).id, {}));
    const ia = await issue(a, '1');
    const ib = await issue(b, '1');
    // Company B's run never touches company A's queue.
    expect(await b.edocs.processOutbox(10, b.company.id)).toMatchObject({ processed: 1, sent: 1 });
    expect((await ds!.manager.findOneByOrFail(InvoiceEntity, { id: ia.id })).status).toBe('QUEUED');
    expect((await ds!.manager.findOneByOrFail(InvoiceEntity, { id: ib.id })).status).toBe('SENT');

    // autoSend off: automatic runs skip the company, the manual run still sends.
    await tenant.run(a.company.id, () => a.settings.update({ autoSend: false }));
    await a.edocs.processOutbox(50, undefined, { automatic: true });
    expect((await ds!.manager.findOneByOrFail(EDocumentOutboxEntity, { ettn: ia.ettn })).status).toBe('PENDING');
    // Crashed worker after send(): the expired lease is retried with a status check first, not a second send.
    const item = await ds!.manager.findOneByOrFail(EDocumentOutboxEntity, { ettn: ia.ettn });
    await tenant.run(a.company.id, async () => {
      const r = await a.settings.resolve();
      const eDoc = await ds!.manager.findOneByOrFail(EDocumentEntity, { ettn: ia.ettn });
      await r.provider.sendInvoice(r.ctx, { ettn: eDoc.ettn, docType: 'INVOICE', documentNo: eDoc.documentNo || '', profileId: eDoc.profileId || '', typeCode: eDoc.typeCode, xml: eDoc.xml, receiverTaxId: eDoc.counterpartyTaxId });
    });
    await ds!.manager.update(EDocumentOutboxEntity, { id: item.id }, { status: 'PROCESSING', lockedUntil: new Date(Date.now() - 60_000), nextRetryAt: new Date(Date.now() - 1000) });
    expect(await a.edocs.processOutbox(10, a.company.id)).toMatchObject({ processed: 1, sent: 1 });
    expect(await ds!.manager.findOneByOrFail(EDocumentOutboxEntity, { id: item.id })).toMatchObject({ status: 'DONE', statusCheckRequired: false });
    expect(await ds!.manager.countBy(MockProviderDocumentEntity, { ettn: ia.ettn, box: 'SENT' })).toBe(1);

    // The mock never reaches GİB: refused for LIVE and on a production server without EBELGE_ALLOW_MOCK.
    await expect(tenant.run(a.company.id, () => a.settings.update({ environment: 'LIVE' }))).rejects.toMatchObject({ response: { code: 'EBELGE_MOCK_TEST_ONLY' } });
    expect(providerUsageAllowed({ testOnly: true }, 'TEST', { NODE_ENV: 'production' })).toBe(false);
    expect(providerUsageAllowed({ testOnly: true }, 'TEST', { NODE_ENV: 'production', EBELGE_ALLOW_MOCK: 'true' })).toBe(true);
    expect(providerUsageAllowed({ testOnly: true }, 'LIVE', { NODE_ENV: 'development', EBELGE_ALLOW_MOCK: 'true' })).toBe(false);
    expect(providerUsageAllowed({ testOnly: false }, 'LIVE', { NODE_ENV: 'production' })).toBe(true);
    // A row saved as LIVE before the guard: nothing is resolved (so nothing is numbered or "sent").
    await ds!.manager.update(CompanyEBelgeSettingsEntity, { companyId: a.company.id }, { environment: 'LIVE' });
    await expect(tenant.run(a.company.id, () => a.settings.resolve())).rejects.toMatchObject({ response: { code: 'EBELGE_MOCK_TEST_ONLY' } });
  }, 240000);
});
