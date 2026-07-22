import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';

@Injectable()
export class StockMovementService {
  constructor(
    @InjectRepository(StockMovementEntity)
    private readonly stockMovementRepo: Repository<StockMovementEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async getStockMovements(
    productId?: string,
    page = 1,
    limit = 20,
    search?: string,
    startDate?: string,
    endDate?: string,
    type?: string
  ): Promise<{ data: StockMovementEntity[], total: number }> {
    const query = this.stockMovementRepo.createQueryBuilder('sm').orderBy('sm.createdAt', 'DESC');
    query.where('1=1');

    if (productId) {
      query.andWhere('sm.productId = :productId', { productId });
    }
    
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      query.andWhere(
        '(LOWER(sm.productName) LIKE :search OR LOWER(sm.note) LIKE :search OR LOWER(sm.type) LIKE :search)',
        { search: s }
      );
    }

    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: `${startDate} 00:00:00` });
    }

    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });
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

  async createManualAdjustment(productId: string, newQuantity: number, note: string, performedBy: string): Promise<StockMovementEntity> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const prod = await manager.findOne(ProductEntity, {
        where: { id: productId, isDeleted: false },
        lock: { mode: 'pessimistic_write' }
      });
      if (!prod) throw new BadRequestException('Ürün bulunamadı');

      const oldQty = prod.quantity;
      const diff = newQuantity - oldQty;
      
      if (diff !== 0) {
        const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
        const activeNames = activeWarehouses.map(w => w.name);
        if (diff > 0) {
          prod.warehouses = this.stockHelper.addStockToWarehouses(prod.warehouses, diff, activeNames);
        } else {
          prod.warehouses = this.stockHelper.deductStockFromWarehouses(prod.warehouses, Math.abs(diff), activeNames);
        }
      }

      prod.quantity = newQuantity;
      prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
      const savedProd = await manager.save(ProductEntity, prod);

      const movement = manager.create(StockMovementEntity, {
        productId: savedProd.id,
        productName: savedProd.name,
        type: 'ADJUSTMENT',
        quantity: diff,
        previousQuantity: oldQty,
        newQuantity: newQuantity,
        note: note || 'Manuel düzeltme',
        referenceType: 'manual',
        performedBy
      });
      return await manager.save(StockMovementEntity, movement);
    });

    const updatedProduct = await this.productRepo.findOne({ where: { id: productId, isDeleted: false } });
    if (updatedProduct) {
      this.appGateway.server.emit('product_mutated', { type: 'update', product: updatedProduct });
    }
    return saved;
  }
}
