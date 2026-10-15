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
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { DocumentSeriesEntity } from '../../entities/document-series.entity';
import { WarehouseStockService } from '../services/warehouse-stock.service';
import { StockHelperService } from '../services/stock-helper.service';
import { TenantContext } from '../tenant/tenant-context.service';
import { ensureImmutabilityTriggers } from '../inventory/immutability-triggers';
import { ensureDocumentTriggers } from './document-triggers';
import { DEFAULT_SERIES } from './default-series';
import { triggerErrorCode } from '../i18n/i18n-exception.filter';
import { DocumentNumberService } from '../../modules/documents/document-number.service';
import { DespatchService } from '../../modules/documents/despatch.service';
import { InvoiceService } from '../../modules/documents/invoice.service';
import { ReturnService } from '../../modules/documents/return.service';
import { ExpenseVoucherService } from '../../modules/documents/expense-voucher.service';
import { DocumentHooks } from '../../modules/documents/document-support';
import { vknCheckDigit } from '../tr';

/**
 * WP4 database tests (MySQL, throw-away schema DB_TEST_DATABASE_WP4 / `stok_wp4_itest` built by
 * schema sync + the document triggers). Skipped when no MySQL server is reachable.
 */
const TEST_DB = process.env.DB_TEST_DATABASE_WP4 || 'stok_wp4_itest';

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
    ds = new DataSource({
      type: 'mysql', ...conn, database: TEST_DB, entities: AppDataSource.options.entities, synchronize: true, dropSchema: true,
      timezone: 'Z', dateStrings: ['DATE'], extra: { connectionLimit: 30 },
    });
    await ds.initialize();
    await ensureImmutabilityTriggers((sql, params) => ds!.query(sql, params));
    await ensureDocumentTriggers((sql, params) => ds!.query(sql, params));
    available = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`WP4 DB tests skipped (no MySQL): ${(e as Error).message}`);
  }
}, 90000);

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy();
});

const tenant = new TenantContext();
const legal: any = { param: async () => { throw new Error('not seeded'); } };
const gateway: any = { emitToCompany: () => undefined, emitToCompanyAdmins: () => undefined };
const audit: any = { record: async () => undefined };

function services() {
  const stock = new WarehouseStockService(new StockHelperService(), tenant);
  const numbers = new DocumentNumberService(ds!, tenant, legal);
  const despatch = new DespatchService(tenant, ds!, stock, numbers, new DocumentHooks(), gateway);
  const vouchers = new ExpenseVoucherService(tenant, ds!, numbers, legal, gateway);
  const invoices = new InvoiceService(tenant, ds!, numbers, despatch, legal, audit, gateway);
  const returns = new ReturnService(tenant, ds!, stock, numbers, despatch, invoices, vouchers, legal, gateway);
  return { stock, numbers, despatch, invoices, returns };
}

const vkn = (first9: string) => first9 + vknCheckDigit(first9);

async function fixture(slug: string) {
  const m = ds!.manager;
  const company = await m.save(CompanyEntity, m.create(CompanyEntity, {
    name: `WP4 ${slug}`, slug: `wp4-${slug}-${Date.now()}`, country: 'TR', baseCurrency: 'TRY', timezone: 'Europe/Istanbul', stockDeductOn: 'despatch',
    legalName: `WP4 ${slug} Ticaret A.Ş.`, taxIdType: 'VKN', taxId: vkn('482915736'), taxOfficeName: 'Kozyatağı Vergi Dairesi Müdürlüğü', bookkeepingType: 'BILANCO',
    address: { line1: 'Atatürk Cad. No:1', provinceCode: '34', province: 'İstanbul', districtId: 3401, district: 'Ataşehir', postalCode: '34750', country: 'TR' } as any,
  }));
  for (const s of DEFAULT_SERIES) await m.save(DocumentSeriesEntity, m.create(DocumentSeriesEntity, { companyId: company.id, ...s, isDefault: true, isActive: true }));
  const unit = await m.save(UnitEntity, m.create(UnitEntity, { companyId: company.id, code: 'pcs', name: 'Adet', isStandard: true, decimals: 0, allowsFraction: false, uneceCode: 'C62' }));
  const main = await m.save(WarehouseEntity, m.create(WarehouseEntity, { companyId: company.id, name: 'Merkez', code: 'WH-1', address: { line1: 'Hadımköy Yolu No:41', districtId: 3402 } as any }));
  const branch = await m.save(WarehouseEntity, m.create(WarehouseEntity, { companyId: company.id, name: 'İzmir', code: 'WH-2', address: { line1: 'Kemalpaşa OSB', districtId: 3518 } as any }));
  const product = await m.save(ProductEntity, m.create(ProductEntity, { companyId: company.id, name: 'USB-C Hub', sku: 'HB', category: 'Elektronik', price: 100, quantity: 0, minQuantity: 0, unit: 'pcs', baseUnitId: unit.id }));
  const customer = await m.save(CustomerEntity, m.create(CustomerEntity, { companyId: company.id, name: 'Alıcı Ltd. Şti.', type: 'company', identityType: 'VKN', identityNumber: vkn('615204873'), isVatTaxpayer: true, address: {} as any }));
  const { stock } = services();
  await tenant.run(company.id, () =>
    ds!.transaction(async (tx) => {
      await stock.begin(tx, company.id);
      const p = await tx.findOneOrFail(ProductEntity, { where: { id: product.id }, lock: { mode: 'pessimistic_write' } });
      const allocs = await stock.add(tx, p, 10, main.id);
      await stock.recordMovements(tx, p, 0, allocs, { type: 'IN', reasonCode: 'OPENING' });
    }),
  );
  const order = await m.save(OrderEntity, m.create(OrderEntity, {
    companyId: company.id, orderNumber: `ORD-${slug}`, customerId: customer.id, customerName: customer.name, status: 'Pending', stockMode: 'despatch', currency: 'TRY', exchangeRate: 1,
    subtotal: 500, taxTotal: 100, grandTotal: 600, totalAmount: 600, payableTotal: 600, subtotalTry: 500, taxTotalTry: 100, grandTotalTry: 600, charges: [],
    items: [m.create(OrderItemEntity, {
      productId: product.id, productName: product.name, quantity: 5, unitQuantity: 5, unitFactor: 1, unitCode: 'pcs', price: 100, unitPrice: 100, grossAmount: 500, netAmount: 500,
      taxRate: 20, taxAmount: 100, lineTotal: 600, discountRate: 0, discountAmount: 0, documentDiscountShare: 0, withheldTaxAmount: 0, otvAmount: 0,
    })],
  }));
  return { company, main, branch, product, customer, order };
}

const trig = (p: Promise<unknown>) => p.then(() => null, (e) => triggerErrorCode(e));
const qty = async (productId: string) => (await ds!.manager.findOneByOrFail(ProductEntity, { id: productId })).quantity;

describe('WP4 document regime (MySQL)', () => {
  it('50 concurrent issues get gap-free, unique numbers; a new year starts at 1', async () => {
    if (!available) return;
    const { company } = await fixture('num');
    const { numbers } = services();
    const issue = (date: string, mode = 'PAPER', series = 'A') => tenant.run(company.id, () => ds!.transaction((m) => numbers.next(m, 'INVOICE', mode, series, date)));
    const got = await Promise.all(Array.from({ length: 50 }, () => issue('2026-10-15')));
    const nos = got.map((g) => g.documentNo).sort();
    expect(new Set(nos).size).toBe(50);
    expect(nos).toEqual(Array.from({ length: 50 }, (_, i) => `A-${String(i + 1).padStart(6, '0')}`));
    // A rolled-back issue releases its number (no gap).
    await expect(tenant.run(company.id, () => ds!.transaction(async (m) => { await numbers.next(m, 'INVOICE', 'PAPER', 'A', '2026-10-15'); throw new Error('rollback'); }))).rejects.toThrow('rollback');
    expect((await issue('2026-10-15')).documentNo).toBe('A-000051');
    // e-document series restart every year; no number for a date before the last one.
    await tenant.run(company.id, () => ds!.manager.save(DocumentSeriesEntity, ds!.manager.create(DocumentSeriesEntity, { companyId: company.id, kind: 'INVOICE', mode: 'EDOCUMENT', seriesCode: 'ABC', isDefault: true, isActive: true })));
    expect((await issue('2026-12-31', 'EDOCUMENT', 'ABC')).documentNo).toBe('ABC2026000000001');
    expect((await issue('2027-01-01', 'EDOCUMENT', 'ABC')).documentNo).toBe('ABC2027000000001');
    expect((await issue('2027-01-02', 'EDOCUMENT', 'ABC')).documentNo).toBe('ABC2027000000002');
    await expect(issue('2027-01-01', 'EDOCUMENT', 'ABC')).rejects.toMatchObject({ response: { code: 'DOCUMENT_DATE_BEFORE_LAST' } });
  }, 120000);

  it('E2E: order -> despatch (stock leaves on approval only) -> invoice -> partial return', async () => {
    if (!available) return;
    const { company, main, product, order } = await fixture('e2e');
    const { despatch, invoices, returns } = services();
    const run = <T>(fn: () => Promise<T>) => tenant.run(company.id, fn);
    const itemId = order.items[0].id;

    const draft = await run(() => despatch.createFromOrder(order.id, { sourceWarehouseId: main.id, lines: [{ orderItemId: itemId, quantity: 3 }] }));
    expect(await qty(product.id)).toBe(10);
    const approved = await run(() => despatch.approve(draft.id, {}));
    expect(approved).toMatchObject({ status: 'APPROVED', documentNo: 'A-000001', numberMode: 'PAPER' });
    expect(await qty(product.id)).toBe(7);
    const sale = await ds!.manager.findOneByOrFail(StockMovementEntity, { companyId: company.id, referenceId: draft.id, type: 'ORDER' });
    expect(sale).toMatchObject({ quantity: -3, documentType: 'DESPATCH', documentNo: 'A-000001', reasonCode: 'SALE' });

    // DB trigger: the approved despatch and its lines are frozen.
    expect(await trig(ds!.query('UPDATE `despatches` SET `note` = ? WHERE `id` = ?', ['x', draft.id]))).toBe('DOCUMENT_IMMUTABLE');
    expect(await trig(ds!.query('DELETE FROM `despatch_lines` WHERE `despatchId` = ?', [draft.id]))).toBe('DOCUMENT_IMMUTABLE');
    expect(await trig(ds!.query('DELETE FROM `despatches` WHERE `id` = ?', [draft.id]))).toBe('DOCUMENT_IMMUTABLE');
    await expect(run(() => despatch.remove(draft.id))).rejects.toMatchObject({ response: { code: 'DESPATCH_CANNOT_BE_CANCELLED' } });

    // Invoice for the whole order: delivered 3 (with the despatch reference) + 2 not yet delivered.
    const inv = await run(() => invoices.createFromOrder(order.id, {}));
    expect(inv.lines).toHaveLength(2);
    expect(inv.despatchRefs).toEqual([expect.objectContaining({ documentNo: 'A-000001', issueDate: approved.issueDate })]);
    expect(inv).toMatchObject({ subtotal: 500, taxTotal: 100, grandTotal: 600 });
    const issued = await run(() => invoices.issue(inv.id, {}));
    expect(issued).toMatchObject({ status: 'ISSUED', documentNo: 'A-000001', issuedBeforeDelivery: false });
    expect(await trig(ds!.query('UPDATE `invoices` SET `grandTotal` = 1 WHERE `id` = ?', [inv.id]))).toBe('DOCUMENT_IMMUTABLE');
    expect(await trig(ds!.query('UPDATE `invoice_lines` SET `unitPrice` = 1 WHERE `invoiceId` = ?', [inv.id]))).toBe('DOCUMENT_IMMUTABLE');
    expect(await trig(ds!.query('UPDATE `invoices` SET `status` = ? WHERE `id` = ?', ['DRAFT', inv.id]))).toBe('DOCUMENT_IMMUTABLE');
    await ds!.query('UPDATE `invoices` SET `gibStatus` = ? WHERE `id` = ?', ['TEST', inv.id]); // workflow column: allowed
    await expect(run(() => invoices.update(inv.id, { notes: 'x' }))).rejects.toMatchObject({ response: { code: 'DOCUMENT_IMMUTABLE' } });

    // Partial return of the delivered line: limits, original rate, stock back, reversal link.
    const delivered = issued.lines.find((l) => l.despatchLineId)!;
    await expect(run(() => returns.create({ type: 'SALES_RETURN', invoiceId: issued.id, lines: [{ invoiceLineId: delivered.id, quantity: 4 }] }))).rejects.toMatchObject({ response: { code: 'RETURN_QTY_EXCEEDS_SOLD' } });
    const ret = await run(() => returns.create({ type: 'SALES_RETURN', invoiceId: issued.id, counterpartyDocNo: 'ALC2026000000001', lines: [{ invoiceLineId: delivered.id, quantity: 2 }] }));
    expect(ret.items[0]).toMatchObject({ taxRate: 20, netAmount: 200, taxAmount: 40, lineTotal: 240 });
    expect(await qty(product.id)).toBe(7);
    const done = await run(() => returns.complete(ret.id, {}));
    expect(done.status).toBe('COMPLETED');
    expect(await qty(product.id)).toBe(9);
    expect(done.items[0].reversesMovementId).toBe(sale.id);
    await expect(run(() => returns.create({ type: 'SALES_RETURN', invoiceId: issued.id, lines: [{ invoiceLineId: delivered.id, quantity: 2 }] }))).rejects.toMatchObject({
      response: { code: 'RETURN_QTY_EXCEEDS_SOLD', params: expect.objectContaining({ available: 1 }) },
    });
    // An invoice with returns cannot be cancelled.
    await expect(run(() => invoices.cancel(issued.id, 'test'))).rejects.toMatchObject({ response: { code: 'INVOICE_HAS_RETURNS' } });
  }, 120000);

  it('transfer despatch: stock goes to IN_TRANSIT on approval and to the target on receipt', async () => {
    if (!available) return;
    const { company, main, branch, product } = await fixture('trf');
    const { despatch } = services();
    const run = <T>(fn: () => Promise<T>) => tenant.run(company.id, fn);
    const d = await run(() => despatch.create({ purpose: 'TRANSFER', sourceWarehouseId: main.id, targetWarehouseId: branch.id, lines: [{ productId: product.id, quantity: 4 }] }));
    expect(d.buyerSnapshot?.taxId).toBe(d.sellerSnapshot?.taxId); // receiver is the company itself
    const approved = await run(() => despatch.approve(d.id, {}));
    const transit = await ds!.manager.findOneByOrFail(WarehouseEntity, { companyId: company.id, type: 'IN_TRANSIT' });
    expect(approved.inTransitWarehouseId).toBe(transit.id);
    const rows = await ds!.query('SELECT `warehouseId`, `quantity` FROM `product_warehouse_stocks` WHERE `productId` = ?', [product.id]);
    const at = (id: string) => Number(rows.find((r: any) => r.warehouseId === id)?.quantity || 0);
    expect([at(main.id), at(transit.id), at(branch.id)]).toEqual([6, 4, 0]);
    expect(await qty(product.id)).toBe(10);
    await run(() => despatch.receive(d.id, {}));
    const rows2 = await ds!.query('SELECT `warehouseId`, `quantity` FROM `product_warehouse_stocks` WHERE `productId` = ?', [product.id]);
    const at2 = (id: string) => Number(rows2.find((r: any) => r.warehouseId === id)?.quantity || 0);
    expect([at2(main.id), at2(transit.id), at2(branch.id)]).toEqual([6, 0, 4]);
    await expect(run(() => despatch.receive(d.id, {}))).rejects.toMatchObject({ response: { code: 'DOCUMENT_STATUS_INVALID' } });
  }, 120000);
});
