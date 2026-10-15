import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../../../data-source';
import { CompanyEntity } from '../../entities/company.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { WarehouseStockService } from '../services/warehouse-stock.service';
import { StockHelperService } from '../services/stock-helper.service';
import { ensureImmutabilityTriggers } from './immutability-triggers';
import { convertQuantityColumnsToDecimal, QUANTITY_COLUMNS } from './decimal-quantities';
import { verifyChain } from './movement-hash';
import { triggerErrorCode } from '../i18n/i18n-exception.filter';

/**
 * WP2 database tests (MySQL). They run against a throw-away schema
 * (DB_TEST_DATABASE, default `stok_wp2_itest`) built by schema sync, and are
 * skipped when no MySQL server is reachable (e.g. CI without a database).
 */
const TEST_DB = process.env.DB_TEST_DATABASE || 'stok_wp2_itest';

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
const conn = {
  host: env('DB_HOST', '127.0.0.1'),
  port: Number(env('DB_PORT', '3306')),
  username: env('DB_USERNAME', 'root'),
  password: env('DB_PASSWORD', ''),
};

let ds: DataSource | null = null;
let available = false;

beforeAll(async () => {
  try {
    const admin = new DataSource({ type: 'mysql', ...conn, connectTimeout: 3000 });
    await admin.initialize();
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    await admin.destroy();
    ds = new DataSource({
      type: 'mysql',
      ...conn,
      database: TEST_DB,
      entities: AppDataSource.options.entities,
      synchronize: true,
      dropSchema: true,
      timezone: 'Z',
      dateStrings: ['DATE'],
      extra: { connectionLimit: 25 },
    });
    await ds.initialize();
    await ensureImmutabilityTriggers((sql, params) => ds!.query(sql, params));
    available = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`WP2 DB tests skipped (no MySQL): ${(e as Error).message}`);
  }
}, 300000);

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy();
});

const tenant: any = { actor: { username: 'itest' } };
const stock = () => new WarehouseStockService(new StockHelperService(), tenant);

async function fixture(m: EntityManager, slug: string) {
  const company = await m.save(CompanyEntity, m.create(CompanyEntity, { name: `IT ${slug}`, slug: `it-${slug}-${Date.now()}`, country: 'TR', baseCurrency: 'TRY', timezone: 'Europe/Istanbul' }));
  const unit = await m.save(UnitEntity, m.create(UnitEntity, { companyId: company.id, code: 'kg', name: 'Kilogram', isStandard: true, decimals: 3, allowsFraction: true, uneceCode: 'KGM' }));
  const wh = await m.save(WarehouseEntity, m.create(WarehouseEntity, { companyId: company.id, name: 'Merkez', code: 'WH-1', address: {} as any }));
  const product = await m.save(
    ProductEntity,
    m.create(ProductEntity, { companyId: company.id, name: 'Fıstık', sku: 'FST', category: 'Food', price: 1250, quantity: 0, minQuantity: 0, unit: 'kg', baseUnitId: unit.id }),
  );
  return { company, unit, wh, product };
}

/** One stock transaction exactly like the services do it: chain lock, product lock, apply, record. */
async function receive(svc: WarehouseStockService, companyId: string, productId: string, whId: string, qty: number, reasonCode = 'PURCHASE') {
  return ds!.transaction(async (m) => {
    await svc.begin(m, companyId);
    const p = await m.findOneOrFail(ProductEntity, { where: { id: productId }, lock: { mode: 'pessimistic_write' } });
    const before = p.quantity;
    const allocs = qty > 0 ? await svc.add(m, p, qty, whId) : await svc.deduct(m, p, -qty, whId);
    return svc.recordMovements(m, p, before, allocs, { type: qty > 0 ? 'IN' : 'ADJUSTMENT', reasonCode });
  });
}

describe('WP2 inventory core (MySQL)', () => {
  it('DecimalQuantities migration keeps every total (int -> DECIMAL(18,4))', async () => {
    if (!available) return;
    const q = (sql: string, p?: unknown[]) => ds!.query(sql, p);
    // Simulate the pre-WP2 schema on scratch tables shaped like the real ones.
    for (const c of QUANTITY_COLUMNS) {
      await q(`ALTER TABLE \`${c.table}\` MODIFY \`${c.column}\` int NOT NULL DEFAULT 0`);
    }
    const { company, wh, product } = await fixture(ds!.manager, 'mig');
    await q('UPDATE `products` SET `quantity` = 343, `minQuantity` = 12 WHERE `id` = ?', [product.id]);
    await q('INSERT INTO `product_warehouse_stocks` (`id`, `companyId`, `productId`, `warehouseId`, `quantity`) VALUES (UUID(), ?, ?, ?, 343)', [company.id, product.id, wh.id]);
    const sums = async () =>
      (await q('SELECT (SELECT SUM(quantity) FROM products WHERE companyId = ?) AS p, (SELECT SUM(minQuantity) FROM products WHERE companyId = ?) AS mq, (SELECT SUM(quantity) FROM product_warehouse_stocks WHERE companyId = ?) AS w', [company.id, company.id, company.id]))[0];
    const before = await sums();
    await convertQuantityColumnsToDecimal({ query: q } as any);
    const after = await sums();
    expect([Number(after.p), Number(after.mq), Number(after.w)]).toEqual([Number(before.p), Number(before.mq), Number(before.w)]);
    const types = await q("SELECT DISTINCT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'quantity'");
    expect(types[0].t).toBe('decimal(18,4)');
  }, 60000);

  it('20 concurrent movements get gap-free sequence numbers and a valid chain', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'conc');
    const svc = stock();
    await Promise.all(Array.from({ length: 20 }, () => receive(svc, company.id, product.id, wh.id, 0.125)));
    const rows = await ds!.manager.find(StockMovementEntity, { where: { companyId: company.id }, order: { sequenceNo: 'ASC' } });
    expect(rows.map((r) => r.sequenceNo)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(verifyChain(rows as any).ok).toBe(true);
    const p = await ds!.manager.findOneByOrFail(ProductEntity, { id: product.id });
    expect(p.quantity).toBe(2.5);
    const pws = await ds!.manager.findOneByOrFail(ProductWarehouseStockEntity, { productId: product.id });
    expect(pws.quantity).toBe(2.5);
  }, 60000);

  it('UPDATE and DELETE of a movement are rejected by the database', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'trg');
    const [m] = await receive(stock(), company.id, product.id, wh.id, 1.25);
    const upd = await ds!.query('UPDATE `stock_movements` SET `quantity` = 0 WHERE `id` = ?', [m.id]).catch((e) => e);
    expect(triggerErrorCode(upd)).toBe('MOVEMENT_IMMUTABLE');
    const del = await ds!.query('DELETE FROM `stock_movements` WHERE `id` = ?', [m.id]).catch((e) => e);
    expect(triggerErrorCode(del)).toBe('MOVEMENT_IMMUTABLE');
    // Deleting the product or the company does not take the ledger with it.
    const delProduct = await ds!.query('DELETE FROM `products` WHERE `id` = ?', [product.id]).catch((e) => e);
    expect(String(delProduct?.message)).toMatch(/foreign key constraint fails/);
    expect(await ds!.manager.count(StockMovementEntity, { where: { companyId: company.id } })).toBe(1);
  }, 60000);

  it('REVERSAL restores the balance and can happen only once', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'rev');
    const svc = stock();
    await receive(svc, company.id, product.id, wh.id, 10, 'OPENING');
    const [scrap] = await receive(svc, company.id, product.id, wh.id, -0.375, 'SCRAP');
    const reverse = () =>
      ds!.transaction(async (m) => {
        await svc.begin(m, company.id);
        const p = await m.findOneOrFail(ProductEntity, { where: { id: product.id }, lock: { mode: 'pessimistic_write' } });
        const before = p.quantity;
        const allocs = await svc.applyReversal(m, p, scrap);
        return svc.recordMovements(m, p, before, allocs, { type: 'REVERSAL', reasonCode: 'CORRECTION', reversesMovementId: scrap.id });
      });
    const [rev] = await reverse();
    expect(rev).toMatchObject({ type: 'REVERSAL', quantity: 0.375, reversesMovementId: scrap.id });
    expect((await ds!.manager.findOneByOrFail(ProductEntity, { id: product.id })).quantity).toBe(10);
    // A second reversal of the same movement violates UQ_stock_movements_reverses.
    await expect(reverse()).rejects.toThrow(/Duplicate entry/);
    expect((await ds!.manager.findOneByOrFail(ProductEntity, { id: product.id })).quantity).toBe(10);
  }, 60000);

  it('a forged row (inserted without the chain) is detected', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'tamper');
    await receive(stock(), company.id, product.id, wh.id, 5);
    const [last] = await ds!.manager.find(StockMovementEntity, { where: { companyId: company.id }, order: { sequenceNo: 'DESC' }, take: 1 });
    await ds!.query(
      "INSERT INTO `stock_movements` (`id`, `companyId`, `productId`, `productName`, `type`, `reasonCode`, `quantity`, `previousQuantity`, `newQuantity`, `transactionDate`, `sequenceNo`, `prevHash`, `hash`) VALUES (UUID(), ?, ?, 'Fıstık', 'OUT', 'THEFT_LOSS', -5, 5, 0, UTC_TIMESTAMP(), ?, ?, ?)",
      [company.id, product.id, last.sequenceNo + 1, last.hash, 'f'.repeat(64)],
    );
    const rows = await ds!.manager.find(StockMovementEntity, { where: { companyId: company.id }, order: { sequenceNo: 'ASC' } });
    const r = verifyChain(rows as any);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.problem)).toContain('HASH_MISMATCH');
  }, 60000);

  it('v2 rows (createdAt, approver, UN/ECE unit) verify after a database round trip', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'v2');
    const svc = stock();
    await ds!.transaction(async (m) => {
      await svc.begin(m, company.id);
      const p = await m.findOneOrFail(ProductEntity, { where: { id: product.id }, lock: { mode: 'pessimistic_write' } });
      const allocs = await svc.add(m, p, 3.25, wh.id);
      return svc.recordMovements(m, p, 0, allocs, { type: 'ADJUSTMENT', reasonCode: 'COUNT_SURPLUS', performedBy: 'maker', performedByUserId: 'u-maker', approvedBy: 'checker', approvedByUserId: 'u-checker', attachmentsSha256: 'e'.repeat(64) });
    });
    const rows = await ds!.manager.find(StockMovementEntity, { where: { companyId: company.id }, order: { sequenceNo: 'ASC' } });
    expect(rows[0]).toMatchObject({ hashVersion: 3, unitCode: 'KGM', approvedBy: 'checker', performedBy: 'maker' });
    expect(verifyChain(rows as any).ok).toBe(true);
    // createdAt is sealed: changing it (bypassing the trigger is impossible, so simulate on the copy) breaks the chain
    expect(verifyChain([{ ...rows[0], createdAt: new Date(rows[0].createdAt.getTime() - 86400000) }] as any).ok).toBe(false);
  }, 60000);

  it('a back-dated exit is checked against the balance on its date', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'back');
    const svc = stock();
    const book = (qty: number, reasonCode: string, transactionDate?: Date) =>
      ds!.transaction(async (m) => {
        await svc.begin(m, company.id);
        const p = await m.findOneOrFail(ProductEntity, { where: { id: product.id }, lock: { mode: 'pessimistic_write' } });
        const before = p.quantity;
        const allocs = qty > 0 ? await svc.add(m, p, qty, wh.id) : await svc.deduct(m, p, -qty, wh.id);
        return svc.recordMovements(m, p, before, allocs, { type: qty > 0 ? 'IN' : 'ADJUSTMENT', reasonCode, transactionDate });
      });
    const day = 86400000;
    await book(10, 'OPENING', new Date(Date.now() - 5 * day));
    await book(-9, 'WASTAGE_NORMAL', new Date(Date.now() - 3 * day));
    await book(20, 'PURCHASE');
    // 4 days ago the balance was 10, but 3 days ago it dropped to 1: an exit of 2 dated 4 days ago is impossible.
    await expect(book(-2, 'WASTAGE_NORMAL', new Date(Date.now() - 4 * day))).rejects.toMatchObject({ response: { code: 'BACKDATED_BALANCE_NEGATIVE' } });
    // Before the opening there was nothing at all.
    await expect(book(-0.5, 'WASTAGE_NORMAL', new Date(Date.now() - 6 * day))).rejects.toMatchObject({ response: { code: 'BACKDATED_BALANCE_NEGATIVE' } });
    // An exit of 1 dated 4 days ago keeps every later balance >= 0.
    await expect(book(-1, 'WASTAGE_NORMAL', new Date(Date.now() - 4 * day))).resolves.toHaveLength(1);
    expect((await ds!.manager.findOneByOrFail(ProductEntity, { id: product.id })).quantity).toBe(20);
  }, 60000);

  it('evidence files and decided requests are protected by the database', async () => {
    if (!available) return;
    const { company, wh, product } = await fixture(ds!.manager, 'att');
    const [m] = await receive(stock(), company.id, product.id, wh.id, 1);
    const q = (sql: string, p?: unknown[]) => ds!.query(sql, p);
    await q(
      "INSERT INTO `stock_movement_attachments` (`id`, `companyId`, `movementId`, `adjustmentRequestId`, `fileName`, `mimeType`, `size`, `sha256`, `content`) VALUES ('att-1', ?, NULL, 'req-1', 'tutanak.pdf', 'application/pdf', 3, ?, 'abc')",
      [company.id, 'f'.repeat(64)],
    );
    // linking a pending request's file to its movement once is allowed ...
    await q('UPDATE `stock_movement_attachments` SET `movementId` = ? WHERE `id` = ?', [m.id, 'att-1']);
    // ... anything else is not
    expect(triggerErrorCode(await q("UPDATE `stock_movement_attachments` SET `content` = 'xyz' WHERE `id` = 'att-1'").catch((e) => e))).toBe('ATTACHMENT_IMMUTABLE');
    expect(triggerErrorCode(await q('UPDATE `stock_movement_attachments` SET `movementId` = NULL WHERE `id` = ?', ['att-1']).catch((e) => e))).toBe('ATTACHMENT_IMMUTABLE');
    expect(triggerErrorCode(await q("DELETE FROM `stock_movement_attachments` WHERE `id` = 'att-1'").catch((e) => e))).toBe('ATTACHMENT_IMMUTABLE');

    await q(
      "INSERT INTO `stock_adjustment_requests` (`id`, `companyId`, `status`, `productId`, `productName`, `quantityDelta`, `currency`, `payload`, `requestedBy`) VALUES ('req-1', ?, 'PENDING', ?, 'F', -1, 'TRY', '{}', 'maker')",
      [company.id, product.id],
    );
    await q("UPDATE `stock_adjustment_requests` SET `status` = 'APPROVED' WHERE `id` = 'req-1'");
    expect(triggerErrorCode(await q("UPDATE `stock_adjustment_requests` SET `status` = 'PENDING' WHERE `id` = 'req-1'").catch((e) => e))).toBe('ADJUSTMENT_REQUEST_IMMUTABLE');
    expect(triggerErrorCode(await q("DELETE FROM `stock_adjustment_requests` WHERE `id` = 'req-1'").catch((e) => e))).toBe('ADJUSTMENT_REQUEST_IMMUTABLE');
  }, 60000);
});
