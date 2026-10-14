import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { gs1CheckDigit, hasValidGs1Checksum, detectBarcodeType, validateBarcode, makeEan13 } from './barcode';
import { allocateLots, sortLotsForPicking, daysUntil } from './lot-allocation';
import { toBaseQuantity, legacyUnitCode } from './units';
import { WarehouseStockService } from '../services/warehouse-stock.service';
import { StockHelperService } from '../services/stock-helper.service';
import { SerialNumberEntity } from '../../entities/serial-number.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { ProductEntity } from '../../entities/product.entity';

describe('barcode checksum', () => {
  it('computes GS1 check digits', () => {
    expect(gs1CheckDigit('400638133393')).toBe(1); // EAN-13 4006381333931
    expect(gs1CheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
    expect(gs1CheckDigit('9638507')).toBe(4); // EAN-8 96385074
  });

  it('validates EAN-13 / UPC-A / EAN-8', () => {
    expect(validateBarcode('4006381333931')).toEqual({ type: 'EAN13' });
    expect(validateBarcode('036000291452')).toEqual({ type: 'UPCA' });
    expect(validateBarcode('96385074')).toEqual({ type: 'EAN8' });
    expect(validateBarcode('4006381333932').error).toBe('BARCODE_INVALID_CHECKSUM');
    expect(validateBarcode('036000291453').error).toBe('BARCODE_INVALID_CHECKSUM');
    expect(validateBarcode('12345', 'EAN13').error).toBe('BARCODE_INVALID_FORMAT');
  });

  it('accepts Code128 text and digits when explicitly typed', () => {
    expect(detectBarcodeType('SKU-001')).toBe('CODE128');
    expect(validateBarcode('SKU-001')).toEqual({ type: 'CODE128' });
    expect(validateBarcode('4006381333932', 'CODE128')).toEqual({ type: 'CODE128' });
    expect(validateBarcode('bad\u0001char').error).toBe('BARCODE_INVALID_FORMAT');
  });

  it('builds valid EAN-13s', () => {
    const code = makeEan13('869100000001');
    expect(code).toHaveLength(13);
    expect(hasValidGs1Checksum(code)).toBe(true);
  });
});

describe('lot allocation (FEFO / FIFO)', () => {
  const lots = [
    { id: 'a', warehouseId: 'w1', lotNumber: 'A', expiryDate: '2026-12-01', quantity: 5, createdAt: new Date('2026-01-01') },
    { id: 'b', warehouseId: 'w1', lotNumber: 'B', expiryDate: '2026-11-01', quantity: 3, createdAt: new Date('2026-02-01') },
    { id: 'c', warehouseId: 'w2', lotNumber: 'C', expiryDate: null, quantity: 10, createdAt: new Date('2025-12-01') },
    { id: 'x', warehouseId: 'w1', lotNumber: 'X', expiryDate: '2026-10-01', quantity: 4, createdAt: new Date('2025-11-01') },
  ];

  it('FEFO picks earliest expiry first, no-expiry lots last, skipping expired', () => {
    const r = allocateLots(lots, 9, { fefo: true, skipExpiredBefore: '2026-10-14' })!;
    expect(r.picks.map((p) => [p.lot.id, p.quantity])).toEqual([
      ['b', 3],
      ['a', 5],
      ['c', 1],
    ]);
  });

  it('includes expired lots when not skipping', () => {
    const r = allocateLots(lots, 2, { fefo: true })!;
    expect(r.picks).toEqual([{ lot: lots[3], quantity: 2 }]);
  });

  it('FIFO picks oldest receipt first', () => {
    expect(sortLotsForPicking(lots, false).map((l) => l.id)).toEqual(['x', 'c', 'a', 'b']);
  });

  it('returns null when lots cannot cover the quantity', () => {
    expect(allocateLots(lots, 19, { fefo: true, skipExpiredBefore: '2026-10-14' })).toBeNull();
  });

  it('computes days until expiry', () => {
    expect(daysUntil('2026-10-24', '2026-10-14')).toBe(10);
    expect(daysUntil('2026-10-09', '2026-10-14')).toBe(-5);
  });
});

describe('unit conversion', () => {
  it('converts alternate units to whole base units', () => {
    expect(toBaseQuantity(3, 12)).toBe(36);
    expect(toBaseQuantity(1, 1)).toBe(1);
    expect(toBaseQuantity(0.5, 12)).toBe(6);
    expect(toBaseQuantity(1, 0.4536)).toBeNull(); // 0.4536 base units is not integral
    expect(toBaseQuantity(0, 12)).toBeNull();
    expect(toBaseQuantity(2, 0)).toBeNull();
  });

  it('maps legacy unit text', () => {
    expect(legacyUnitCode('Adet')).toBe('pcs');
    expect(legacyUnitCode('Kutu')).toBe('box');
    expect(legacyUnitCode('KG')).toBe('kg');
    expect(legacyUnitCode('')).toBe('pcs');
    expect(legacyUnitCode('Fıçı')).toBeNull();
  });
});

describe('serial number uniqueness (WarehouseStockService.receive)', () => {
  const COMPANY = 'tenant-A';
  function setup(existingSerials: { serial: string; status: string }[]) {
    const serials: any[] = existingSerials.map((s, i) => ({ id: `s${i}`, companyId: COMPANY, productId: 'p1', warehouseId: 'w1', ...s }));
    const pws: any[] = [];
    const manager: any = {
      findOne: jest.fn(async (entity: any, opts: any) =>
        entity === WarehouseEntity && opts.where.companyId === COMPANY ? { id: opts.where.id, companyId: COMPANY, isDeleted: false } : null,
      ),
      find: jest.fn(async (entity: any, opts: any) => {
        if (entity === SerialNumberEntity) {
          const wanted: string[] = opts.where.serial?._value || [];
          return serials.filter((s) => s.companyId === opts.where.companyId && s.productId === opts.where.productId && wanted.includes(s.serial));
        }
        if (entity === ProductWarehouseStockEntity) return pws;
        if (entity === WarehouseEntity) return [{ id: 'w1', companyId: COMPANY }];
        return [];
      }),
      create: jest.fn((_e: any, o: any) => ({ ...o })),
      save: jest.fn(async (entity: any, o: any) => {
        if (entity === SerialNumberEntity && !serials.includes(o)) serials.push(o);
        if (entity === ProductWarehouseStockEntity && !pws.includes(o)) pws.push(o);
        return o;
      }),
    };
    const product = { id: 'p1', companyId: COMPANY, name: 'Headphones', quantity: 0, minQuantity: 1, trackingType: 'serial' } as ProductEntity;
    return { manager, product, serials, pws, svc: new WarehouseStockService(new StockHelperService()) };
  }

  it('creates new serials and syncs warehouse stock', async () => {
    const { manager, product, serials, svc } = setup([]);
    const allocs = await svc.receive(manager, product, 2, 'w1', { serials: ['SN1', 'SN2'] });
    expect(allocs).toEqual([{ warehouseId: 'w1', delta: 2, serials: ['SN1', 'SN2'] }]);
    expect(serials.map((s) => [s.serial, s.status])).toEqual([
      ['SN1', 'in_stock'],
      ['SN2', 'in_stock'],
    ]);
    expect(product.quantity).toBe(2);
  });

  it('rejects a serial that is already in stock', async () => {
    const { manager, product, svc } = setup([{ serial: 'SN1', status: 'in_stock' }]);
    await expect(svc.receive(manager, product, 1, 'w1', { serials: ['SN1'] })).rejects.toMatchObject({
      response: { code: 'SERIAL_ALREADY_IN_STOCK' },
    });
  });

  it('rejects duplicate serials in the same receipt and count mismatches', async () => {
    const { manager, product, svc } = setup([]);
    await expect(svc.receive(manager, product, 2, 'w1', { serials: ['SN9', 'SN9'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.receive(manager, product, 3, 'w1', { serials: ['SN7'] })).rejects.toMatchObject({
      response: { code: 'SERIAL_COUNT_MISMATCH' },
    });
  });

  it('allows re-receiving a sold serial (customer return)', async () => {
    const { manager, product, serials, svc } = setup([{ serial: 'SN5', status: 'sold' }]);
    await svc.receive(manager, product, 1, 'w1', { serials: ['SN5'] });
    expect(serials[0].status).toBe('in_stock');
  });

  it('refuses untracked-only helpers for tracked products', async () => {
    const { manager, product, svc } = setup([]);
    await expect(svc.add(manager, product, 1, 'w1')).rejects.toMatchObject({ response: { code: 'PRODUCT_TRACKED_QTY_LOCKED' } });
  });
});
