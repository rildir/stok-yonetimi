import { Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { err } from '../i18n/app-error';
import { ProductEntity } from '../../entities/product.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { StockHelperService } from './stock-helper.service';

export interface StockAllocation {
  warehouseId: string;
  /** Signed change applied to that warehouse */
  delta: number;
}

export interface MovementInfo {
  type: string;
  referenceId?: string;
  referenceType?: string;
  note?: string;
  performedBy?: string;
}

/**
 * Single source of truth for stock.
 *
 * `product_warehouse_stocks` holds the authoritative quantities.
 * `products.quantity` is a denormalized SUM that is recomputed and saved by
 * this service inside the caller's transaction every time a row changes, so
 * both are always consistent. No other code path may write `quantity`.
 */
@Injectable()
export class WarehouseStockService {
  constructor(private readonly stockHelper: StockHelperService) {}

  /** Active warehouses of a company; the oldest is the default target. */
  activeWarehouses(manager: EntityManager, companyId: string): Promise<WarehouseEntity[]> {
    return manager.find(WarehouseEntity, { where: { companyId, isDeleted: false }, order: { createdAt: 'ASC', name: 'ASC' } });
  }

  async defaultWarehouse(manager: EntityManager, companyId: string): Promise<WarehouseEntity> {
    const [first] = await this.activeWarehouses(manager, companyId);
    if (!first) throw new BadRequestException(err('WAREHOUSE_NONE_ACTIVE'));
    return first;
  }

  async requireWarehouse(manager: EntityManager, companyId: string, warehouseId: string): Promise<WarehouseEntity> {
    const wh = await manager.findOne(WarehouseEntity, { where: { id: warehouseId, companyId, isDeleted: false } });
    if (!wh) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    return wh;
  }

  private async lockRows(manager: EntityManager, companyId: string, productId: string): Promise<ProductWarehouseStockEntity[]> {
    return manager.find(ProductWarehouseStockEntity, {
      where: { companyId, productId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** Apply signed per-warehouse deltas, then resync products.quantity/status. */
  async apply(manager: EntityManager, product: ProductEntity, allocations: StockAllocation[]): Promise<ProductEntity> {
    const rows = await this.lockRows(manager, product.companyId, product.id);
    for (const a of allocations) {
      if (!a.delta) continue;
      let row = rows.find((r) => r.warehouseId === a.warehouseId);
      if (!row) {
        row = manager.create(ProductWarehouseStockEntity, {
          companyId: product.companyId,
          productId: product.id,
          warehouseId: a.warehouseId,
          quantity: 0,
        });
        rows.push(row);
      }
      const next = row.quantity + a.delta;
      if (next < 0) {
        const wh = await manager.findOne(WarehouseEntity, { where: { id: a.warehouseId, companyId: product.companyId } });
        throw new BadRequestException(
          err('WAREHOUSE_INSUFFICIENT_STOCK', { warehouse: wh?.name || a.warehouseId, available: row.quantity, requested: -a.delta }),
        );
      }
      row.quantity = next;
      await manager.save(ProductWarehouseStockEntity, row);
    }
    product.quantity = rows.reduce((s, r) => s + r.quantity, 0);
    product.status = this.stockHelper.calculateStatus(product.quantity, product.minQuantity);
    return manager.save(ProductEntity, product);
  }

  /** Adds stock to a warehouse (default warehouse when omitted). */
  async add(manager: EntityManager, product: ProductEntity, qty: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    if (qty <= 0) return [];
    const target = warehouseId
      ? (await this.requireWarehouse(manager, product.companyId, warehouseId)).id
      : (await this.defaultWarehouse(manager, product.companyId)).id;
    const allocations = [{ warehouseId: target, delta: qty }];
    await this.apply(manager, product, allocations);
    return allocations;
  }

  /**
   * Removes stock from one warehouse, or (when omitted) greedily from the
   * active warehouses in default order.
   */
  async deduct(manager: EntityManager, product: ProductEntity, qty: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    if (qty <= 0) return [];
    if (warehouseId) {
      await this.requireWarehouse(manager, product.companyId, warehouseId);
      const allocations = [{ warehouseId, delta: -qty }];
      await this.apply(manager, product, allocations);
      return allocations;
    }
    const warehouses = await this.activeWarehouses(manager, product.companyId);
    const rows = await this.lockRows(manager, product.companyId, product.id);
    let remaining = qty;
    const allocations: StockAllocation[] = [];
    for (const wh of warehouses) {
      if (remaining <= 0) break;
      const available = rows.find((r) => r.warehouseId === wh.id)?.quantity || 0;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      allocations.push({ warehouseId: wh.id, delta: -take });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new BadRequestException(err('STOCK_INSUFFICIENT_BY_WAREHOUSE', { missing: remaining }));
    }
    await this.apply(manager, product, allocations);
    return allocations;
  }

  /** Brings the total to `newTotal` (adds to default / deducts greedily). */
  async setTotal(manager: EntityManager, product: ProductEntity, newTotal: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    const diff = newTotal - product.quantity;
    if (diff > 0) return this.add(manager, product, diff, warehouseId);
    if (diff < 0) return this.deduct(manager, product, -diff, warehouseId);
    return [];
  }

  /**
   * Writes one stock movement per warehouse allocation. previous/new
   * quantities are company-wide product totals, chained across rows.
   */
  async recordMovements(
    manager: EntityManager,
    product: ProductEntity,
    previousTotal: number,
    allocations: StockAllocation[],
    info: MovementInfo,
  ): Promise<StockMovementEntity[]> {
    const saved: StockMovementEntity[] = [];
    let running = previousTotal;
    for (const a of allocations) {
      if (!a.delta) continue;
      const next = running + a.delta;
      saved.push(
        await manager.save(
          StockMovementEntity,
          manager.create(StockMovementEntity, {
            companyId: product.companyId,
            productId: product.id,
            productName: product.name,
            warehouseId: a.warehouseId,
            type: info.type,
            quantity: a.delta,
            previousQuantity: running,
            newQuantity: next,
            referenceId: info.referenceId,
            referenceType: info.referenceType,
            note: info.note,
            performedBy: info.performedBy || 'System',
          }),
        ),
      );
      running = next;
    }
    return saved;
  }

  /** Fills the read-only `warehouses` (name -> qty) map for API responses. */
  async attachWarehouseMap<T extends ProductEntity>(manager: EntityManager, companyId: string, products: T[]): Promise<T[]> {
    if (products.length === 0) return products;
    const rows = await manager.find(ProductWarehouseStockEntity, {
      where: { companyId, productId: In(products.map((p) => p.id)) },
      relations: { warehouse: true },
    });
    for (const p of products) {
      const map: Record<string, number> = {};
      for (const r of rows) {
        if (r.productId === p.id && r.warehouse && !r.warehouse.isDeleted) map[r.warehouse.name] = r.quantity;
      }
      p.warehouses = map;
    }
    return products;
  }
}
