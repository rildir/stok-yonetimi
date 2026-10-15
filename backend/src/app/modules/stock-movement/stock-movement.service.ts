import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { applyDayRange, companyTimezone } from '../../shared/time/company-day-range';

@Injectable()
export class StockMovementService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(StockMovementEntity)
    private readonly stockMovementRepo: Repository<StockMovementEntity>,
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

  async getStockMovements(
    productId?: string,
    page = 1,
    limit = 20,
    search?: string,
    startDate?: string,
    endDate?: string,
    type?: string,
    warehouseId?: string
  ): Promise<{ data: StockMovementEntity[], total: number }> {
    const query = this.stockMovementRepo.createQueryBuilder('sm').orderBy('sm.createdAt', 'DESC');
    query.where('sm.companyId = :companyId', { companyId: this.companyId });

    if (productId) {
      query.andWhere('sm.productId = :productId', { productId });
    }
    if (warehouseId) {
      query.andWhere('sm.warehouseId = :warehouseId', { warehouseId });
    }
    
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      query.andWhere(
        '(LOWER(sm.productName) LIKE :search OR LOWER(sm.note) LIKE :search OR LOWER(sm.type) LIKE :search)',
        { search: s }
      );
    }

    if (startDate || endDate) {
      // Calendar days of the company time zone (createdAt is stored in UTC).
      applyDayRange(query, 'sm.createdAt', await companyTimezone(this.dataSource.manager, this.tenant.companyId), startDate, endDate);
    }

    if (type && type !== 'ALL') {
      const types = type.split(',');
      query.andWhere('sm.type IN (:...types)', { types });
    }

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
      
    return { data, total };
  }

  async createManualAdjustment(productId: string, newQuantity: number, note: string, performedBy: string, warehouseId?: string | null): Promise<StockMovementEntity> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const prod = await manager.findOne(ProductEntity, {
        where: { companyId: this.companyId, id: productId, isDeleted: false },
        lock: { mode: 'pessimistic_write' }
      });
      if (!prod) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));

      const oldQty = prod.quantity;
      const allocations = await this.warehouseStock.setTotal(manager, prod, newQuantity, warehouseId);
      const movements = await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
        type: 'ADJUSTMENT',
        referenceType: 'manual',
        note: note || 'Manuel düzeltme',
        performedBy,
      });
      if (movements.length > 0) return movements[movements.length - 1];
      // No change: keep an audit row as before.
      return manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
        companyId: this.companyId,
        productId: prod.id,
        productName: prod.name,
        warehouseId: warehouseId || null,
        type: 'ADJUSTMENT',
        quantity: 0,
        previousQuantity: oldQty,
        newQuantity: oldQty,
        note: note || 'Manuel düzeltme',
        referenceType: 'manual',
        performedBy,
      }));
    });

    const updatedProduct = await this.productRepo.findOne({ where: { companyId: this.companyId, id: productId, isDeleted: false } });
    if (updatedProduct) {
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: updatedProduct });
    }
    return saved;
  }
}
