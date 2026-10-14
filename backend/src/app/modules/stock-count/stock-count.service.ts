import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { StockCountEntity, StockCountItem } from '../../entities/stock-count.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { SerialNumberEntity, SerialStatus } from '../../entities/serial-number.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { TrackingType } from '../../entities/tracking';
import { MoreThan } from 'typeorm';

@Injectable()
export class StockCountService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(StockCountEntity)
    private readonly stockCountRepo: Repository<StockCountEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly warehouseStock: WarehouseStockService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getStockCounts(): Promise<StockCountEntity[]> {
    return this.stockCountRepo.find({
      where: { companyId: this.companyId },
      order: { createdAt: 'DESC' }
    });
  }

  async createStockCount(notes?: string, performedBy?: string): Promise<StockCountEntity> {
    const activeCount = await this.stockCountRepo.findOne({ where: { companyId: this.companyId, status: 'InProgress' } });
    if (activeCount) {
      throw new BadRequestException(err('STOCK_COUNT_IN_PROGRESS'));
    }
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const countNumber = `SC-${dateStr}-${timeStr}`;

    const products = await this.productRepo.find({ where: { companyId: this.companyId, isDeleted: false } });
    
    const m = this.dataSource.manager;
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const whName = (id: string | null | undefined) => whs.find((w) => w.id === id)?.name;
    const lots = await m.find(StockLotEntity, { where: { companyId: this.companyId, quantity: MoreThan(0) } });
    const serials = await m.find(SerialNumberEntity, { where: { companyId: this.companyId, status: SerialStatus.IN_STOCK } });
    const items: StockCountItem[] = products.map(p => {
      const item: StockCountItem = {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        systemQuantity: p.quantity,
        countedQuantity: p.quantity,
        difference: 0,
        unit: p.unit || 'pcs',
        trackingType: p.trackingType || TrackingType.NONE,
      };
      if (p.trackingType === TrackingType.LOT) {
        item.lots = lots
          .filter((l) => l.productId === p.id)
          .map((l) => ({
            lotId: l.id,
            lotNumber: l.lotNumber,
            expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
            warehouseId: l.warehouseId,
            warehouseName: whName(l.warehouseId),
            systemQuantity: l.quantity,
            countedQuantity: l.quantity,
          }));
      } else if (p.trackingType === TrackingType.SERIAL) {
        item.serials = serials
          .filter((x) => x.productId === p.id)
          .map((x) => ({ serial: x.serial, warehouseId: x.warehouseId as string, warehouseName: whName(x.warehouseId), present: true }));
      }
      return item;
    });

    const newCount = this.stockCountRepo.create({
      companyId: this.companyId,
      countNumber,
      status: 'InProgress',
      items,
      startedAt: now,
      performedBy: performedBy || 'System',
      notes: notes || ''
    });

    const saved = await this.stockCountRepo.save(newCount);
    this.appGateway.emitToCompany(this.companyId, 'stock_count_mutated', { type: 'create', stockCount: saved });
    return saved;
  }

  async updateStockCount(id: string, items: any[], notes?: string): Promise<StockCountEntity | null> {
    const count = await this.stockCountRepo.findOne({ where: { companyId: this.companyId, id, status: 'InProgress' } });
    if (!count) return null;

    // Tracked lines keep the server's lot/serial lists; only counts / presence are taken from the client.
    const updatedItems: StockCountItem[] = items.map(item => {
      const prev = count.items.find((i) => i.productId === item.productId);
      const system = Number(prev?.systemQuantity ?? item.systemQuantity) || 0;
      let counted = Math.max(0, Math.floor(Number(item.countedQuantity) || 0));
      const out: StockCountItem = {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        systemQuantity: system,
        countedQuantity: counted,
        difference: 0,
        unit: item.unit || prev?.unit || 'pcs',
        trackingType: prev?.trackingType,
      };
      if (prev?.lots) {
        out.lots = prev.lots.map((l) => {
          const c = (item.lots || []).find((x: any) => x.lotId === l.lotId);
          return { ...l, countedQuantity: c ? Math.max(0, Math.floor(Number(c.countedQuantity) || 0)) : l.countedQuantity };
        });
        counted = out.lots.reduce((s, l) => s + l.countedQuantity, 0);
      } else if (prev?.serials) {
        out.serials = prev.serials.map((x) => {
          const c = (item.serials || []).find((y: any) => y.serial === x.serial);
          return { ...x, present: c ? !!c.present : x.present };
        });
        counted = out.serials.filter((x) => x.present).length;
      }
      out.countedQuantity = counted;
      out.difference = counted - system;
      return out;
    });

    count.items = updatedItems;
    if (notes !== undefined) {
      count.notes = notes;
    }

    const saved = await this.stockCountRepo.save(count);
    this.appGateway.emitToCompany(this.companyId, 'stock_count_mutated', { type: 'update', stockCount: saved });
    return saved;
  }

  async completeStockCount(id: string, performedBy?: string): Promise<StockCountEntity | null> {
    const count = await this.stockCountRepo.findOne({ where: { companyId: this.companyId, id, status: 'InProgress' } });
    if (!count) return null;

    const completedCount = await this.dataSource.transaction(async (manager) => {
      for (const item of count.items) {
        const product = await manager.findOne(ProductEntity, {
          where: { companyId: this.companyId, id: item.productId, isDeleted: false },
          lock: { mode: 'pessimistic_write' }
        });
        
        if (product) {
          const oldQty = product.quantity;
          const difference = Number(item.countedQuantity) - oldQty;
          
          item.systemQuantity = oldQty;
          item.difference = difference;

          const info = {
            type: 'ADJUSTMENT',
            referenceId: count.id,
            referenceType: 'stock_count',
            note: `Sayım Düzeltmesi (Fark: ${difference > 0 ? '+' : ''}${difference})`,
            performedBy: performedBy || 'System',
          };
          if (product.trackingType === TrackingType.LOT && item.lots) {
            // Each counted lot is set to its count (lots received after the count started stay untouched).
            for (const l of item.lots) {
              const before = product.quantity;
              const allocs = await this.warehouseStock.setLotQuantity(manager, product, l.lotId, l.countedQuantity);
              await this.warehouseStock.recordMovements(manager, product, before, allocs, info);
            }
            item.difference = product.quantity - oldQty;
            if (item.difference) this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product });
          } else if (product.trackingType === TrackingType.SERIAL && item.serials) {
            const missing = item.serials.filter((x) => !x.present).map((x) => x.serial);
            const stillIn = missing.length
              ? await manager.count(SerialNumberEntity, {
                  where: { companyId: this.companyId, productId: product.id, status: SerialStatus.IN_STOCK, serial: In(missing) },
                })
              : 0;
            if (stillIn) {
              const rows = await manager.find(SerialNumberEntity, {
                where: { companyId: this.companyId, productId: product.id, status: SerialStatus.IN_STOCK, serial: In(missing) },
              });
              const allocs = await this.warehouseStock.issue(manager, product, rows.length, null, { serials: rows.map((r) => r.serial) }, { serialStatus: SerialStatus.LOST });
              await this.warehouseStock.recordMovements(manager, product, oldQty, allocs, info);
              this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product });
            }
            item.difference = product.quantity - oldQty;
          } else if (difference !== 0 && (product.trackingType || TrackingType.NONE) === TrackingType.NONE) {
            const allocations = await this.warehouseStock.setTotal(manager, product, Number(item.countedQuantity));
            await this.warehouseStock.recordMovements(manager, product, oldQty, allocations, {
              type: 'ADJUSTMENT',
              referenceId: count.id,
              referenceType: 'stock_count',
              note: `Sayım Düzeltmesi (Fark: ${difference > 0 ? '+' : ''}${difference})`,
              performedBy: performedBy || 'System',
            });
            const savedProd = product;

            this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: savedProd });
          }
        }
      }

      count.status = 'Completed';
      count.completedAt = new Date();
      if (performedBy) {
        count.performedBy = performedBy;
      }
      return await manager.save(StockCountEntity, count);
    });

    if (completedCount) {
      this.appGateway.emitToCompany(this.companyId, 'stock_count_mutated', { type: 'complete', stockCount: completedCount });
    }
    return completedCount;
  }
}
