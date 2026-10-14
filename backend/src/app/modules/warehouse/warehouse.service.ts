import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, MoreThan } from 'typeorm';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { StockMovementType } from '../../entities/enums';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly warehouseStock: WarehouseStockService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getWarehouses(): Promise<any[]> {
    const activeWarehouses = await this.warehouseRepo.find({
      where: { companyId: this.companyId, isDeleted: false },
      order: { createdAt: 'ASC', name: 'ASC' },
    });
    const agg = await this.dataSource
      .getRepository(ProductWarehouseStockEntity)
      .createQueryBuilder('s')
      .innerJoin(ProductEntity, 'p', 'p.id = s.productId AND p.isDeleted = false')
      .select('s.warehouseId', 'warehouseId')
      .addSelect('SUM(CASE WHEN s.quantity > 0 THEN 1 ELSE 0 END)', 'productCount')
      .addSelect('COALESCE(SUM(s.quantity), 0)', 'totalStock')
      .addSelect('COALESCE(SUM(s.quantity * p.price), 0)', 'totalValue')
      .where('s.companyId = :companyId', { companyId: this.companyId })
      .groupBy('s.warehouseId')
      .getRawMany();
    const byId = new Map(agg.map((r) => [r.warehouseId, r]));
    return activeWarehouses.map((wh, i) => {
      const r = byId.get(wh.id);
      return {
        id: wh.id,
        name: wh.name,
        code: wh.code,
        address: wh.address,
        isDefault: i === 0,
        productCount: Number(r?.productCount || 0),
        totalStock: Number(r?.totalStock || 0),
        totalValue: Number(r?.totalValue || 0),
      };
    });
  }

  /** Per-product stock in one warehouse. */
  async getWarehouseStock(id: string): Promise<{ productId: string; productName: string; sku: string; quantity: number }[]> {
    const wh = await this.warehouseRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!wh) throw new NotFoundException(err('WAREHOUSE_NOT_FOUND'));
    const rows = await this.dataSource.getRepository(ProductWarehouseStockEntity).find({
      where: { companyId: this.companyId, warehouseId: id },
      relations: { product: true },
    });
    return rows
      .filter((r) => r.product && !r.product.isDeleted)
      .map((r) => ({ productId: r.productId, productName: r.product.name, sku: r.product.sku, quantity: r.quantity }));
  }

  async createWarehouse(data: Partial<WarehouseEntity>): Promise<WarehouseEntity> {
    if (data.name) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, name: data.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_NAME_TAKEN', { name: data.name }));
      }
    }
    if (data.code) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, code: data.code, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_CODE_TAKEN', { code: data.code }));
      }
    }
    const newWarehouse = this.warehouseRepo.create({ ...data, companyId: this.companyId });
    const saved = await this.warehouseRepo.save(newWarehouse);
    this.appGateway.emitToCompany(this.companyId, 'warehouse_mutated', { type: 'create', warehouse: saved });
    return saved;
  }

  async updateWarehouse(id: string, updates: Partial<WarehouseEntity>): Promise<WarehouseEntity | null> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!warehouse) return null;

    if (updates.name && updates.name !== warehouse.name) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, name: updates.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_NAME_TAKEN', { name: updates.name }));
      }
    }
    if (updates.code && updates.code !== warehouse.code) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, code: updates.code, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_CODE_TAKEN', { code: updates.code }));
      }
    }

    // Stock is keyed by warehouseId, so a rename needs no stock rewrite.
    Object.assign(warehouse, updates);
    await this.warehouseRepo.save(warehouse);

    this.appGateway.emitToCompany(this.companyId, 'warehouse_mutated', { type: 'update', warehouse });
    return warehouse;
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (warehouse) {
      const stocked = await this.dataSource.getRepository(ProductWarehouseStockEntity).findOne({
        where: { companyId: this.companyId, warehouseId: warehouse.id, quantity: MoreThan(0) },
        relations: { product: true },
      });
      if (stocked) {
        throw new BadRequestException(err('WAREHOUSE_HAS_STOCK', { product: stocked.product?.name, qty: stocked.quantity }));
      }
      warehouse.isDeleted = true;
      await this.warehouseRepo.save(warehouse);
      this.appGateway.emitToCompany(this.companyId, 'warehouse_mutated', { type: 'delete', warehouseId: id });
      return true;
    }
    return false;
  }

  /** Resolves a warehouse by id (or, for older clients, by name). */
  private async resolveWarehouse(manager: EntityManager, ref: string): Promise<WarehouseEntity> {
    const wh =
      (await manager.findOne(WarehouseEntity, { where: { id: ref, companyId: this.companyId, isDeleted: false } })) ||
      (await manager.findOne(WarehouseEntity, { where: { name: ref, companyId: this.companyId, isDeleted: false } }));
    if (!wh) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    return wh;
  }

  /**
   * Moves stock between two warehouses in one transaction and records a
   * TRANSFER_OUT / TRANSFER_IN movement pair. The product total is unchanged.
   */
  async transferWarehouseStock(
    productId: string,
    fromWarehouse: string,
    toWarehouse: string,
    quantity: number,
    performedBy = 'System',
    note?: string,
  ): Promise<ProductEntity | null> {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException(err('TRANSFER_QUANTITY_INVALID'));
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(ProductEntity, {
        where: { id: productId, companyId: this.companyId, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
      const from = await this.resolveWarehouse(manager, fromWarehouse);
      const to = await this.resolveWarehouse(manager, toWarehouse);
      if (from.id === to.id) {
        throw new BadRequestException(err('TRANSFER_SAME_WAREHOUSE'));
      }

      const total = product.quantity;
      await this.warehouseStock.apply(manager, product, [
        { warehouseId: from.id, delta: -qty },
        { warehouseId: to.id, delta: qty },
      ]);
      const ref = `TRF-${Date.now()}`;
      const text = note || `Depo transferi: ${from.name} -> ${to.name} (${qty})`;
      const pair: [WarehouseEntity, string, number][] = [
        [from, StockMovementType.TRANSFER_OUT, -qty],
        [to, StockMovementType.TRANSFER_IN, qty],
      ];
      for (const [wh, type, delta] of pair) {
        await manager.save(
          StockMovementEntity,
          manager.create(StockMovementEntity, {
            companyId: this.companyId,
            productId: product.id,
            productName: product.name,
            warehouseId: wh.id,
            type,
            quantity: delta,
            previousQuantity: total,
            newQuantity: total,
            referenceId: ref,
            referenceType: 'warehouse_transfer',
            note: text,
            performedBy,
          })
        );
      }
      await this.warehouseStock.attachWarehouseMap(manager, this.companyId, [product]);
      return product;
    });
    this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: saved });
    return saved;
  }
}
