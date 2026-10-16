import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StockCountService } from './stock-count.service';
import { StockCountEntity } from '../../entities/stock-count.entity';

/** Final audit: count lines take their unit (precision) from the snapshot, never from the client. */
describe('StockCountService.updateStockCount / cancelStockCount', () => {
  const snapshot = () =>
    ({
      id: 'sc1',
      companyId: 'c1',
      countNumber: 'SC-1',
      status: 'InProgress',
      notes: null,
      items: [
        { productId: 'p-pcs', productName: 'Mouse', sku: 'MS', systemQuantity: 31, countedQuantity: 31, difference: 0, unit: 'pcs' },
        { productId: 'p-kg', productName: 'Fıstık', sku: 'GD', systemQuantity: 41.55, countedQuantity: 41.55, difference: 0, unit: 'kg' },
      ],
    }) as unknown as StockCountEntity;

  const make = (rows: Record<string, StockCountEntity>) => {
    const repo = {
      findOne: jest.fn(async ({ where }: any) => {
        const r = rows[where.id];
        if (!r) return null;
        return where.status && r.status !== where.status ? null : r;
      }),
      save: jest.fn(async (x: any) => x),
    };
    const dataSource = {
      manager: {
        findOneByOrFail: jest.fn(async () => ({ id: 'c1', timezone: 'Europe/Istanbul', country: 'TR' })),
        find: jest.fn(async () => [
          { code: 'pcs', decimals: 0 },
          { code: 'kg', decimals: 3 },
        ]),
      },
    };
    const gateway = { emitToCompany: jest.fn() };
    const svc = new StockCountService({ companyId: 'c1' } as any, repo as any, {} as any, {} as any, {} as any, {} as any, gateway as any, dataSource as any, {} as any);
    return { svc, repo };
  };

  it('refuses a fraction on a pcs line even when the client claims the unit is kg', async () => {
    const { svc } = make({ sc1: snapshot() });
    await expect(svc.updateStockCount('sc1', [{ productId: 'p-pcs', unit: 'kg', countedQuantity: 43.5 }])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts 3 decimals on a kg line', async () => {
    const { svc } = make({ sc1: snapshot() });
    const out = await svc.updateStockCount('sc1', [{ productId: 'p-kg', countedQuantity: 41.25 }]);
    expect(out?.items.find((i) => i.productId === 'p-kg')?.countedQuantity).toBe(41.25);
  });

  it('refuses products that are not in the snapshot', async () => {
    const { svc } = make({ sc1: snapshot() });
    await expect(svc.updateStockCount('sc1', [{ productId: 'x', countedQuantity: 1 }])).rejects.toMatchObject({ response: { code: 'STOCK_COUNT_ITEM_UNKNOWN' } });
  });

  it('keeps the other snapshot lines and the snapshot unit / name on a partial update', async () => {
    const { svc } = make({ sc1: snapshot() });
    const out = await svc.updateStockCount('sc1', [{ productId: 'p-pcs', countedQuantity: 30, unit: 'kg', productName: 'hacked' }]);
    expect(out?.items).toHaveLength(2);
    const l = out?.items.find((i) => i.productId === 'p-pcs');
    expect(l).toMatchObject({ unit: 'pcs', productName: 'Mouse', countedQuantity: 30, difference: -1 });
  });

  it('completed counts answer 409, unknown counts 404', async () => {
    const done = { ...snapshot(), status: 'Completed' } as StockCountEntity;
    const { svc } = make({ sc1: done });
    await expect(svc.updateStockCount('sc1', [])).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.cancelStockCount('sc1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.updateStockCount('nope', [])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels an in-progress count without booking and records who / why', async () => {
    const { svc, repo } = make({ sc1: snapshot() });
    const out = await svc.cancelStockCount('sc1', 'admin', 'Eski taslak');
    expect(out?.status).toBe('Cancelled');
    expect(out?.notes).toContain('admin - Eski taslak');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});
