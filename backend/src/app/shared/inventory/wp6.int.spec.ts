import { randomUUID } from 'crypto';
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../../../data-source';
import { CompanyEntity } from '../../entities/company.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { FiscalPeriodEntity, StockCostLayerEntity } from '../../entities/inventory-accounting.entity';
import { WarehouseStockService, MovementInfo, LotReceiptInput } from '../services/warehouse-stock.service';
import { StockHelperService } from '../services/stock-helper.service';
import { TenantContext } from '../tenant/tenant-context.service';
import { ensureImmutabilityTriggers } from './immutability-triggers';
import { ensurePeriodTriggers } from './period-triggers';
import { ensureFiscalPeriods } from './period-ops';
import { triggerErrorCode } from '../i18n/i18n-exception.filter';
import { ValuationService } from '../../modules/inventory-accounting/valuation.service';
import { FiscalPeriodService } from '../../modules/inventory-accounting/fiscal-period.service';
import { TraceabilityService } from '../../modules/inventory-accounting/traceability.service';
import { addDays, todayKey } from '../tr';

/**
 * WP6 database tests (MySQL, throw-away schema DB_TEST_DATABASE_WP6, default `stok_wp6_itest`):
 * costing through WarehouseStockService, closed-period guard (service + trigger), closing snapshot
 * = opening balance, STT block, recall customers, tenant isolation. Skipped without MySQL.
 */
const TEST_DB = process.env.DB_TEST_DATABASE_WP6 || 'stok_wp6_itest';

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
    ds = new DataSource({ type: 'mysql', ...conn, database: TEST_DB, entities: AppDataSource.options.entities, synchronize: true, dropSchema: true, timezone: 'Z', dateStrings: ['DATE'] });
    await ds.initialize();
    await ensureImmutabilityTriggers((sql, params) => ds!.query(sql, params));
    await ensurePeriodTriggers((sql, params) => ds!.query(sql, params));
    available = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`WP6 DB tests skipped (no MySQL): ${(e as Error).message}`);
  }
}, 60000);

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy();
});

const tenant = new TenantContext();
const svc = () => new WarehouseStockService(new StockHelperService(), tenant);
const finance: any = { getRates: async () => [], getCompany: async () => ({ timezone: 'Europe/Istanbul' }), taxRateForProduct: async () => 20 };
const audit: any = { record: async () => undefined };
const legal: any = { paramOrNull: async () => null };

async function fixture(m: EntityManager, slug: string, costingMethod = 'WAVG_MOVING') {
  const company = await m.save(CompanyEntity, m.create(CompanyEntity, { name: `IT ${slug}`, slug: `it6-${slug}-${Date.now()}`, country: 'TR', baseCurrency: 'TRY', timezone: 'Europe/Istanbul', costingMethod, bookkeepingType: 'BILANCO' }));
  const unit = await m.save(UnitEntity, m.create(UnitEntity, { companyId: company.id, code: 'pcs', name: 'Adet', isStandard: true, decimals: 0, allowsFraction: false, uneceCode: 'C62' }));
  const wh = await m.save(WarehouseEntity, m.create(WarehouseEntity, { companyId: company.id, name: 'Merkez', code: 'WH-1', address: {} as any }));
  const product = await m.save(ProductEntity, m.create(ProductEntity, { companyId: company.id, name: 'Klavye', sku: 'KB', category: 'x', price: 100, quantity: 0, minQuantity: 0, unit: 'pcs', baseUnitId: unit.id }));
  return { company, unit, wh, product };
}

async function book(companyId: string, productId: string, whId: string, qty: number, info: Partial<MovementInfo>, details: { lots?: LotReceiptInput[]; pick?: { lotId: string; quantity: number }[]; sale?: boolean } = {}) {
  const s = svc();
  return ds!.transaction(async (m) => {
    await s.begin(m, companyId);
    const p = await m.findOneOrFail(ProductEntity, { where: { id: productId }, lock: { mode: 'pessimistic_write' } });
    const before = p.quantity;
    const allocs = qty > 0 ? await s.receive(m, p, qty, whId, { lots: details.lots }) : await s.issue(m, p, -qty, whId, { lots: details.pick }, { sale: details.sale });
    return s.recordMovements(m, p, before, allocs, { type: qty > 0 ? 'IN' : 'ORDER', reasonCode: qty > 0 ? 'PURCHASE' : 'SALE', ...info } as MovementInfo);
  });
}

describe('WP6 costing, periods and food traceability (MySQL)', () => {
  it('FIFO costs issues from the oldest layers; a return comes back at the issue cost', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'fifo', 'FIFO');
    await book(company.id, product.id, wh.id, 10, { unitCost: 5, transactionDate: new Date(Date.now() - 3 * 3600000) });
    await book(company.id, product.id, wh.id, 10, { unitCost: 8, transactionDate: new Date(Date.now() - 2 * 3600000) });
    const [sale] = await book(company.id, product.id, wh.id, -15, {});
    expect(Number(sale.totalCost)).toBe(-90);
    expect(Number(sale.unitCost)).toBe(6);
    expect(sale.hashVersion).toBe(3);
    const [ret] = await book(company.id, product.id, wh.id, 2, { reasonCode: 'RETURN', type: 'RETURN', reversesMovementId: sale.id });
    expect(Number(ret.unitCost)).toBe(6);
    expect(ret.costSource).toBe('RETURN');
    const layers = await ds!.manager.find(StockCostLayerEntity, { where: { companyId: company.id } });
    const value = layers.reduce((s, l) => s + Number(l.qtyRemaining) * Number(l.unitCost), 0);
    expect(Math.round(value * 100) / 100).toBe(5 * 8 + 2 * 6);
  }, 60000);

  it('a closed period takes no movement (service and trigger); closing snapshot = opening balance of the next period', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'period');
    const y = Number(todayKey('Europe/Istanbul').slice(0, 4));
    await ensureFiscalPeriods(ds!.manager, company, [y]);
    await book(company.id, product.id, wh.id, 12, { unitCost: 10, transactionDate: new Date(`${y}-02-10T09:00:00Z`) });
    await book(company.id, product.id, wh.id, -2, { transactionDate: new Date(`${y}-03-05T09:00:00Z`) });
    await book(company.id, product.id, wh.id, 5, { unitCost: 16, transactionDate: new Date(`${y}-04-05T09:00:00Z`) });
    const q1 = await ds!.manager.findOneByOrFail(FiscalPeriodEntity, { companyId: company.id, periodType: 'QUARTER', fiscalYear: y, quarter: 1 });
    const q2 = await ds!.manager.findOneByOrFail(FiscalPeriodEntity, { companyId: company.id, periodType: 'QUARTER', fiscalYear: y, quarter: 2 });
    const valuation = new ValuationService(tenant, ds!, finance);
    const periods = new FiscalPeriodService(tenant, ds!, valuation, svc(), audit);
    await tenant.run(company.id, async () => {
      const closed = await periods.close(q1.id, 'itest');
      expect(closed.snapshot).toMatchObject({ quantity: 10, costValue: 100 });
      const opening = await valuation.openingOf(q2);
      expect(opening.source).toBe('SNAPSHOT');
      const computed = await valuation.valuate(addDays(String(q2.startDate).slice(0, 10), -1), 'product');
      expect(opening.costValue).toBe(computed.totals.costValue);
      expect(opening.quantity).toBe(computed.totals.quantity);
      // The list on a closed period's end is the locked closing balance, in every breakdown.
      expect(computed.source).toBe('SNAPSHOT');
      const q1End = String(q1.endDate).slice(0, 10);
      for (const b of ['warehouse', 'lot'] as const) expect((await valuation.valuate(q1End, b)).totals).toEqual(computed.totals);
      const fresh = await valuation.valuate(q1End, 'lot', { ignoreSnapshot: true });
      expect(fresh.source).toBe('COMPUTED');
      expect(fresh.totals.costValue).toBe(computed.totals.costValue);
    });
    await expect(book(company.id, product.id, wh.id, 1, { unitCost: 10, transactionDate: new Date(`${y}-03-20T09:00:00Z`) })).rejects.toMatchObject({ response: { code: 'PERIOD_CLOSED' } });
    const raw = await ds!
      .query(
        'INSERT INTO `stock_movements` (`id`, `companyId`, `productId`, `productName`, `type`, `reasonCode`, `quantity`, `previousQuantity`, `newQuantity`, `transactionDate`, `sequenceNo`, `prevHash`, `hash`) VALUES (UUID(), ?, ?, ?, ?, ?, 1, 0, 1, ?, 99999, REPEAT(\'0\', 64), REPEAT(\'0\', 64))',
        [company.id, product.id, 'x', 'IN', 'OPENING', new Date(`${y}-03-20T09:00:00Z`)],
      )
      .catch((e) => e);
    expect(triggerErrorCode(raw)).toBe('PERIOD_CLOSED');
    // Another company is not affected by this company's closed period.
    const other = await fixture(ds!.manager, 'period-other');
    await ensureFiscalPeriods(ds!.manager, other.company, [y]);
    const [ok] = await book(other.company.id, other.product.id, other.wh.id, 1, { unitCost: 1, transactionDate: new Date(`${y}-03-20T09:00:00Z`) });
    expect(ok.companyId).toBe(other.company.id);
  }, 90000);

  it('an expired use-by (STT) lot is never sold; recall lists the right customers and blocks the lot', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'food');
    await ds!.manager.update(ProductEntity, { id: product.id }, { trackingType: 'lot', hasExpiry: true, regulatoryCategory: 'food', expiryType: 'use_by' });
    const today = todayKey('Europe/Istanbul');
    await book(company.id, product.id, wh.id, 5, { unitCost: 20 }, { lots: [{ lotNumber: 'L-OLD', expiryDate: addDays(today, -1), quantity: 5 }] });
    await book(company.id, product.id, wh.id, 10, { unitCost: 22 }, { lots: [{ lotNumber: 'L-NEW', expiryDate: addDays(today, 10), quantity: 10 }] });
    const old = await ds!.manager.findOneByOrFail(StockLotEntity, { companyId: company.id, lotNumber: 'L-OLD' });
    // Explicit pick of the expired lot for a sale: rejected whatever the caller (no override exists).
    await expect(book(company.id, product.id, wh.id, -1, {}, { pick: [{ lotId: old.id, quantity: 1 }], sale: true })).rejects.toMatchObject({ response: { code: 'LOT_EXPIRED_USE_BY' } });
    // Automatic FEFO skips it: only the 10 units of L-NEW are sellable.
    await expect(book(company.id, product.id, wh.id, -11, {}, { sale: true })).rejects.toMatchObject({ response: { code: 'LOT_INSUFFICIENT_AUTO' } });
    // Sales of L-NEW to two customers.
    await book(company.id, product.id, wh.id, -4, { documentType: 'DESPATCH', documentNo: 'IRS-1', party: { type: 'CUSTOMER', id: 'c-a', name: 'Alfa Market', taxId: '1234567890' } }, { sale: true });
    await book(company.id, product.id, wh.id, -3, { documentType: 'DESPATCH', documentNo: 'IRS-2', party: { type: 'CUSTOMER', id: 'c-b', name: 'Beta Gıda', taxId: '9876543210' } }, { sale: true });
    const trace = new TraceabilityService(tenant, ds!, legal, audit);
    await tenant.run(company.id, async () => {
      const r = await trace.trace({ productId: product.id, lotNumber: 'L-NEW' });
      expect(r.customers.map((c) => [c.partyName, c.net])).toEqual([['Alfa Market', 4], ['Beta Gıda', 3]]);
      const recall = await trace.recall({ productId: product.id, lotNumbers: ['L-NEW'], reason: 'Test' });
      expect((recall.affectedCustomers as any[]).map((c) => c.partyName)).toEqual(['Alfa Market', 'Beta Gıda']);
      expect(Number(recall.quantityShipped)).toBe(7);
    });
    await expect(book(company.id, product.id, wh.id, -1, {}, { sale: true })).rejects.toMatchObject({ response: { code: 'LOT_INSUFFICIENT_AUTO' } });
    const blocked = await ds!.manager.findOneByOrFail(StockLotEntity, { companyId: company.id, lotNumber: 'L-NEW' });
    expect(blocked.status).toBe('recalled');
    await expect(book(company.id, product.id, wh.id, -1, {}, { pick: [{ lotId: blocked.id, quantity: 1 }], sale: true })).rejects.toMatchObject({ response: { code: 'LOT_BLOCKED' } });
    // Another tenant cannot see the lot, block it by id, or write genealogy into this tenant.
    const other = await fixture(ds!.manager, 'food-other');
    await tenant.run(other.company.id, async () => {
      await expect(trace.trace({ lotNumber: 'L-NEW' })).rejects.toMatchObject({ response: { code: 'LOT_NOT_FOUND' } });
      await expect(trace.setLotStatus({ lotId: old.id, status: 'blocked', reason: 'x' })).rejects.toMatchObject({ response: { code: 'LOT_NOT_FOUND' } });
      // Missing identifiers never match "every lot of the company".
      await expect(trace.setLotStatus({ status: 'blocked', reason: 'x' })).rejects.toMatchObject({ response: { code: 'TRACE_QUERY_REQUIRED' } });
      const forged = { companyId: company.id, id: randomUUID(), parentProductId: product.id, parentLotNumber: 'L-OLD', childProductId: product.id, childLotNumber: 'L-NEW', relation: 'REPACK' };
      await expect(trace.addGenealogy(forged as any)).rejects.toMatchObject({ response: { code: 'PRODUCT_NOT_FOUND' } });
    });
    await tenant.run(company.id, async () => {
      // Body fields other than the genealogy itself (companyId, id) are ignored.
      const g = await trace.addGenealogy({ companyId: other.company.id, id: randomUUID(), parentProductId: product.id, parentLotNumber: 'L-OLD', childProductId: product.id, childLotNumber: 'L-NEW', relation: 'REPACK' } as any);
      expect(g.companyId).toBe(company.id);
      await expect(trace.addGenealogy({ parentProductId: product.id, parentLotNumber: '', childProductId: product.id, childLotNumber: 'L-NEW', relation: 'REPACK' })).rejects.toMatchObject({ response: { code: 'TRACE_QUERY_REQUIRED' } });
      const lots = await trace.setLotStatus({ lotId: old.id, status: 'blocked', reason: 'Numune analizi' });
      expect(lots.map((l) => l.lotNumber)).toEqual(['L-OLD']);
    });
  }, 90000);
});
