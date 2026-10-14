import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockCountEntity, StockCountItem } from '../../entities/stock-count.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

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
    
    const items: StockCountItem[] = products.map(p => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      systemQuantity: p.quantity,
      countedQuantity: p.quantity,
      difference: 0,
      unit: p.unit || 'Adet'
    }));

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

    const updatedItems: StockCountItem[] = items.map(item => {
      const counted = Number(item.countedQuantity) || 0;
      const system = Number(item.systemQuantity) || 0;
      return {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        systemQuantity: system,
        countedQuantity: counted,
        difference: counted - system,
        unit: item.unit || 'Adet'
      };
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

          if (difference !== 0) {
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
