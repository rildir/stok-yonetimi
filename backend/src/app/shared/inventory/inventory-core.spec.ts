import 'reflect-metadata';
import { GENESIS_HASH, movementHash, toSecond, verifyChain } from './movement-hash';
import { checkCategoryRules } from '../compliance/category-rules';
import {
  isReasonCode,
  isValidGtin,
  MOVEMENT_REASON_CODES,
  parseZonedDateTime,
  reasonAllowsDirection,
  toGtin14,
  warehouseTypeAllowsSale,
} from '../tr';
import { WarehouseStockService } from '../services/warehouse-stock.service';
import { StockHelperService } from '../services/stock-helper.service';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { triggerErrorCode } from '../i18n/i18n-exception.filter';
import { IMMUTABILITY_TRIGGERS } from './immutability-triggers';

/** Builds a valid chain of `n` movement rows for one company. */
function chain(n: number) {
  const rows: Record<string, any>[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const row: Record<string, any> = {
      id: `m${i}`,
      companyId: 'c1',
      sequenceNo: i,
      productId: 'p1',
      productSku: 'GD-FISTIK',
      productName: 'Antep Fıstığı',
      warehouseId: 'w1',
      warehouseName: 'Merkez Depo',
      unitCode: 'kg',
      type: i % 2 ? 'IN' : 'ORDER',
      reasonCode: i % 2 ? 'PURCHASE' : 'SALE',
      quantity: i % 2 ? 2.5 : -1.25,
      previousQuantity: 0,
      newQuantity: 0,
      transactionDate: new Date(Date.UTC(2026, 9, i, 9, 30, 0)),
      documentDate: `2026-10-${String(i).padStart(2, '0')}`,
      serials: null,
      prevHash: prev,
    };
    row['hash'] = movementHash(prev, row);
    prev = row['hash'];
    rows.push(row);
  }
  return rows;
}

describe('stock movement hash chain', () => {
  it('verifies an intact chain', () => {
    const r = verifyChain(chain(5));
    expect(r).toMatchObject({ ok: true, checked: 5, lastSequenceNo: 5, issues: [] });
  });

  it('fails when a single row is changed', () => {
    const rows = chain(5);
    rows[2]['quantity'] = 25; // 2.5 -> 25
    const r = verifyChain(rows);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ sequenceNo: 3, problem: 'HASH_MISMATCH' });
  });

  it('fails when a row is removed or the order changes', () => {
    const rows = chain(5);
    expect(verifyChain([...rows.slice(0, 2), ...rows.slice(3)]).issues.map((i) => i.problem)).toEqual(['SEQUENCE_GAP', 'PREV_HASH_MISMATCH']);
    expect(verifyChain([rows[1], rows[0], ...rows.slice(2)]).ok).toBe(false);
  });

  it('hashes values as they are read back (decimal strings, whole seconds)', () => {
    const [row] = chain(1);
    const fromDb = { ...row, quantity: '2.5000', previousQuantity: '0.0000', newQuantity: '0.0000', transactionDate: new Date(row['transactionDate'].getTime() + 400), sequenceNo: '1' };
    expect(movementHash(GENESIS_HASH, fromDb)).toBe(row['hash']);
    expect(toSecond('2026-10-15T09:30:12.999Z').toISOString()).toBe('2026-10-15T09:30:12.000Z');
  });
});

describe('WarehouseStockService.recordMovements', () => {
  function setup() {
    const saved: any[] = [];
    const chainRow = { companyId: 'c1', lastSequenceNo: 7, lastHash: 'a'.repeat(64) };
    const manager: any = {
      queryRunner: { isTransactionActive: true, data: {} },
      query: jest.fn(async () => [{ x: 1 }]),
      findOneOrFail: jest.fn(async () => chainRow),
      find: jest.fn(async () => [{ id: 'w1', name: 'Merkez Depo' }]),
      create: jest.fn((_e: any, o: any) => ({ ...o })),
      save: jest.fn(async (e: any, o: any) => (e === StockMovementEntity && saved.push(o), o)),
      update: jest.fn(async () => undefined),
    };
    const tenant: any = { actor: { username: 'ayse', userId: 'u-1', apiKeyId: undefined } };
    const svc = new WarehouseStockService(new StockHelperService(), tenant);
    const product: any = { id: 'p1', companyId: 'c1', name: 'Fıstık', sku: 'GD-FISTIK', unit: 'kg', quantity: 10 };
    return { svc, manager, saved, chainRow, product };
  }

  it('requires a valid reason code that matches the direction', async () => {
    const { svc, manager, product } = setup();
    await expect(svc.recordMovements(manager, product, 10, [{ warehouseId: 'w1', delta: 1 }], { type: 'IN', reasonCode: '' })).rejects.toMatchObject({ response: { code: 'REASON_CODE_REQUIRED' } });
    await expect(svc.recordMovements(manager, product, 10, [{ warehouseId: 'w1', delta: 1 }], { type: 'IN', reasonCode: 'FOO' })).rejects.toMatchObject({ response: { code: 'REASON_CODE_INVALID' } });
    await expect(svc.recordMovements(manager, product, 10, [{ warehouseId: 'w1', delta: 1 }], { type: 'IN', reasonCode: 'LOSS_ZAYI' })).rejects.toMatchObject({ response: { code: 'REASON_DIRECTION_MISMATCH' } });
    await expect(
      svc.recordMovements(manager, product, 10, [{ warehouseId: 'w1', delta: 1 }], { type: 'IN', reasonCode: 'PURCHASE', transactionDate: new Date(Date.now() + 86400000) }),
    ).rejects.toMatchObject({ response: { code: 'TRANSACTION_DATE_IN_FUTURE' } });
  });

  it('continues the chain, snapshots names and records the actor', async () => {
    const { svc, manager, saved, chainRow, product } = setup();
    const out = await svc.recordMovements(manager, product, 10, [{ warehouseId: 'w1', delta: 2.5 }, { warehouseId: 'w1', delta: -1.25 }], {
      type: 'ADJUSTMENT',
      reasonCode: (d) => (d > 0 ? 'COUNT_SURPLUS' : 'COUNT_SHORTAGE'),
      transactionDate: '2026-10-01T10:15:30.700Z',
    });
    expect(out).toHaveLength(2);
    expect(saved.map((m) => [m.sequenceNo, m.reasonCode, m.previousQuantity, m.newQuantity])).toEqual([
      [8, 'COUNT_SURPLUS', 10, 12.5],
      [9, 'COUNT_SHORTAGE', 12.5, 11.25],
    ]);
    expect(saved[0].prevHash).toBe('a'.repeat(64));
    expect(saved[1].prevHash).toBe(saved[0].hash);
    expect(saved[0]).toMatchObject({ productSku: 'GD-FISTIK', unitCode: 'kg', warehouseName: 'Merkez Depo', performedBy: 'ayse', performedByUserId: 'u-1' });
    expect(saved[0].transactionDate.toISOString()).toBe('2026-10-01T10:15:30.000Z');
    expect(chainRow).toMatchObject({ lastSequenceNo: 9, lastHash: saved[1].hash });
    expect(manager.update).toHaveBeenCalledTimes(1);
  });

  it('warns about entries later than the VUK 219 limit', () => {
    const { svc } = setup();
    const old = new Date(Date.now() - 15 * 86400000);
    expect(svc.lateEntryWarning(old, 'Europe/Istanbul', 10)).toMatchObject({ code: 'LATE_ENTRY_WARNING', params: { limit: 10 } });
    expect(svc.lateEntryWarning(new Date(), 'Europe/Istanbul', 10)).toBeNull();
  });
});

describe('inventory reference definitions', () => {
  it('knows the reason codes and their directions', () => {
    expect(MOVEMENT_REASON_CODES).toEqual(
      expect.arrayContaining(['SALE', 'PURCHASE', 'LOSS_ZAYI', 'COUNT_SURPLUS', 'COUNT_SHORTAGE', 'TESELLUM_SURPLUS', 'UNCLASSIFIED_197_397', 'CORRECTION']),
    );
    expect(isReasonCode('DESTRUCTION_IMHA')).toBe(true);
    expect(reasonAllowsDirection('SALE', -1)).toBe(true);
    expect(reasonAllowsDirection('SALE', 1)).toBe(false);
    expect(reasonAllowsDirection('CORRECTION', 1)).toBe(true);
    expect(reasonAllowsDirection('COUNT_SURPLUS', -1)).toBe(false);
  });

  it('validates GTINs and pads them to 14 digits', () => {
    expect(isValidGtin('8694000000013')).toBe(isValidGtin('08694000000013'));
    expect(toGtin14('4006381333931')).toBe('04006381333931');
    expect(toGtin14('4006381333932')).toBeNull();
    expect(toGtin14('abc')).toBeNull();
  });

  it('quarantine and in-transit stock is never sellable', () => {
    expect(warehouseTypeAllowsSale('NORMAL')).toBe(true);
    expect(warehouseTypeAllowsSale('QUARANTINE')).toBe(false);
    expect(warehouseTypeAllowsSale('IN_TRANSIT')).toBe(false);
  });

  it('parses company-local transaction moments', () => {
    expect(parseZonedDateTime('2026-09-18', 'Europe/Istanbul')?.toISOString()).toBe('2026-09-17T21:00:00.000Z');
    expect(parseZonedDateTime('2026-09-18T15:40', 'Europe/Istanbul')?.toISOString()).toBe('2026-09-18T12:40:00.000Z');
    expect(parseZonedDateTime('2026-09-18T15:40:00Z')?.toISOString()).toBe('2026-09-18T15:40:00.000Z');
    expect(parseZonedDateTime('')).toBeNull();
  });
});

describe('regulatory category rules', () => {
  it('requires the company module', () => {
    expect(checkCategoryRules({ regulatoryCategory: 'medicine_its', trackingType: 'serial', gtin14: '08690000000002' }, [])[0]).toMatchObject({ code: 'REGULATORY_MODULE_DISABLED', severity: 'error' });
  });
  it('medicine needs GTIN + serial tracking (errors)', () => {
    const issues = checkCategoryRules({ regulatoryCategory: 'medicine_its', trackingType: 'lot' }, ['medicine_its']);
    expect(issues.map((i) => [i.code, i.severity])).toEqual([
      ['TRACKING_REQUIRED_FOR_CATEGORY', 'error'],
      ['GTIN_REQUIRED_FOR_CATEGORY', 'error'],
    ]);
  });
  it('food lot / expiry rules are warnings until WP6 enforces them', () => {
    const issues = checkCategoryRules({ regulatoryCategory: 'food', trackingType: 'none', hasExpiry: false }, ['food']);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(checkCategoryRules({ regulatoryCategory: 'food', trackingType: 'lot', hasExpiry: true }, ['food'])).toEqual([]);
    expect(checkCategoryRules({ regulatoryCategory: 'none' }, [])).toEqual([]);
  });
});

describe('immutability triggers', () => {
  it('cover update and delete of movements and completed counts', () => {
    const names = IMMUTABILITY_TRIGGERS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['trg_stock_movements_no_update', 'trg_stock_movements_no_delete', 'trg_stock_counts_completed_no_update', 'trg_po_items_received_no_delete']));
  });
  it('maps the SIGNAL error to its code', () => {
    expect(triggerErrorCode({ driverError: { sqlState: '45000', sqlMessage: 'MOVEMENT_IMMUTABLE' } })).toBe('MOVEMENT_IMMUTABLE');
    expect(triggerErrorCode({ driverError: { sqlState: '23000', sqlMessage: 'Duplicate entry' } })).toBeNull();
  });
});
