import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';

const COMPANY = 'tenant-A';

/** Minimal in-memory EntityManager covering what the transfer path uses. */
function makeManager() {
  const product: any = { id: 'p1', companyId: COMPANY, name: 'Mouse', quantity: 10, minQuantity: 2, isDeleted: false };
  const warehouses: any[] = [
    // Same site group: same premises, no despatch advice needed (VUK 230/5)
    { id: 'w1', companyId: COMPANY, name: 'Merkez', isDeleted: false, siteGroup: 'HQ' },
    { id: 'w2', companyId: COMPANY, name: 'Şube', isDeleted: false, siteGroup: 'HQ' },
    { id: 'w3', companyId: COMPANY, name: 'İzmir', isDeleted: false, siteGroup: null, address: { line1: 'Kemalpaşa OSB', districtId: 3518 } },
    { id: 'wx', companyId: 'tenant-B', name: 'Foreign', isDeleted: false },
  ];
  const rows: any[] = [
    { id: 's1', companyId: COMPANY, productId: 'p1', warehouseId: 'w1', quantity: 7 },
    { id: 's2', companyId: COMPANY, productId: 'p1', warehouseId: 'w2', quantity: 3 },
  ];
  const movements: any[] = [];
  const match = (o: any, where: any) => Object.entries(where).every(([k, v]) => o[k] === v);
  const manager: any = {
    findOne: jest.fn(async (entity: any, opts: any) => {
      if (entity === ProductEntity) return match(product, opts.where) ? product : null;
      if (entity === WarehouseEntity) return warehouses.find((w) => match(w, opts.where)) || null;
      return null;
    }),
    find: jest.fn(async (entity: any, opts: any) => {
      if (entity === ProductWarehouseStockEntity) {
        return rows.filter((r) => r.companyId === opts.where.companyId && (typeof opts.where.productId !== 'string' || r.productId === opts.where.productId));
      }
      return [];
    }),
    create: jest.fn((_e: any, o: any) => ({ ...o })),
    // movement chain head (WarehouseStockService.begin / recordMovements)
    query: jest.fn(async () => undefined),
    findOneOrFail: jest.fn(async () => ({ companyId: COMPANY, lastSequenceNo: 0, lastHash: '0'.repeat(64) })),
    update: jest.fn(async () => undefined),
    save: jest.fn(async (entity: any, o: any) => {
      if (entity === StockMovementEntity) movements.push(o);
      if (entity === ProductWarehouseStockEntity && !rows.includes(o)) rows.push(o);
      return o;
    }),
  };
  return { manager, product, rows, movements };
}

function makeService(manager: any) {
  const tenant: any = { companyId: COMPANY, actor: { username: 'tester' } };
  const stock = new WarehouseStockService(new StockHelperService(), tenant);
  const gateway: any = { emitToCompany: jest.fn() };
  const dataSource: any = { transaction: (cb: any) => cb(manager) };
  const finance: any = { getCompany: async () => ({ id: COMPANY, timezone: 'Europe/Istanbul' }) };
  return new WarehouseService(tenant, {} as any, {} as any, stock, gateway, dataSource, {} as any, finance);
}

describe('WarehouseService.transferWarehouseStock', () => {
  it('moves stock between warehouses, keeps the total and writes TRANSFER_OUT/IN', async () => {
    const { manager, product, rows, movements } = makeManager();
    const svc = makeService(manager);

    const result = await svc.transferWarehouseStock('p1', 'w1', 'w2', 4, 'tester');

    expect(rows.find((r) => r.warehouseId === 'w1').quantity).toBe(3);
    expect(rows.find((r) => r.warehouseId === 'w2').quantity).toBe(7);
    expect(product.quantity).toBe(10);
    expect(result?.warehouses).toBeDefined();
    expect(movements.map((m) => [m.type, m.warehouseId, m.quantity])).toEqual([
      ['TRANSFER_OUT', 'w1', -4],
      ['TRANSFER_IN', 'w2', 4],
    ]);
    expect(movements.every((m) => m.companyId === COMPANY && m.previousQuantity === 10 && m.newQuantity === 10)).toBe(true);
    // reason code + hash chain: consecutive sequence numbers, each linked to the previous hash
    expect(movements.map((m) => [m.reasonCode, m.sequenceNo])).toEqual([
      ['TRANSFER', 1],
      ['TRANSFER', 2],
    ]);
    expect(movements[1].prevHash).toBe(movements[0].hash);
  });

  it('accepts warehouse names for older clients', async () => {
    const { manager, rows } = makeManager();
    await makeService(manager).transferWarehouseStock('p1', 'Şube', 'Merkez', 3);
    expect(rows.find((r) => r.warehouseId === 'w2').quantity).toBe(0);
    expect(rows.find((r) => r.warehouseId === 'w1').quantity).toBe(10);
  });

  it('requires a despatch advice between different premises (VUK 230/5)', async () => {
    const { manager, rows } = makeManager();
    await expect(makeService(manager).transferWarehouseStock('p1', 'w1', 'w3', 1)).rejects.toMatchObject({ response: { code: 'TRANSFER_DESPATCH_REQUIRED' } });
    expect(rows.find((r) => r.warehouseId === 'w1').quantity).toBe(7);
  });

  it('rejects transfers above the available warehouse stock', async () => {
    const { manager, rows, movements } = makeManager();
    await expect(makeService(manager).transferWarehouseStock('p1', 'w2', 'w1', 5)).rejects.toThrow(BadRequestException);
    expect(rows.find((r) => r.warehouseId === 'w2').quantity).toBe(3);
    expect(movements).toHaveLength(0);
  });

  it('rejects same warehouse, invalid quantity and other tenants\' warehouses', async () => {
    const { manager } = makeManager();
    const svc = makeService(manager);
    await expect(svc.transferWarehouseStock('p1', 'w1', 'w1', 1)).rejects.toThrow(BadRequestException);
    await expect(svc.transferWarehouseStock('p1', 'w1', 'w2', 0)).rejects.toThrow(BadRequestException);
    await expect(svc.transferWarehouseStock('p1', 'w1', 'wx', 1)).rejects.toThrow(BadRequestException);
  });
});

describe('WarehouseStockService', () => {
  it('deducts greedily across warehouses and keeps products.quantity = SUM(rows)', async () => {
    const { manager, product, rows } = makeManager();
    manager.find.mockImplementation(async (entity: any, opts: any) => {
      if (entity === WarehouseEntity) return [{ id: 'w1' }, { id: 'w2' }];
      return rows.filter((r) => r.productId === opts.where.productId);
    });
    const stock = new WarehouseStockService(new StockHelperService(), { actor: {} } as any);
    const alloc = await stock.deduct(manager, product, 9);
    expect(alloc).toEqual([{ warehouseId: 'w1', delta: -7 }, { warehouseId: 'w2', delta: -2 }]);
    expect(product.quantity).toBe(1);
    expect(product.quantity).toBe(rows.reduce((s, r) => s + r.quantity, 0));
    await expect(stock.deduct(manager, product, 2)).rejects.toThrow(BadRequestException);
  });
});
