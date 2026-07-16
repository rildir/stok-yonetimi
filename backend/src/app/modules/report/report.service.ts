import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { OrderStatus, PurchaseOrderStatus } from '../../entities/enums';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(StockMovementEntity)
    private readonly stockMovementRepo: Repository<StockMovementEntity>,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async getStockSummary(startDate?: string, endDate?: string) {
    const query = this.stockMovementRepo.createQueryBuilder('sm')
      .select('COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END), 0)', 'totalIn')
      .select('COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END), 0)', 'totalIn')
      .addSelect('COALESCE(SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END), 0)', 'totalOut');

    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: new Date(endDate) });
    }

    const raw = await query.getRawOne();
    const totalIn = Number(raw?.totalIn || 0);
    const totalOut = Number(raw?.totalOut || 0);

    return {
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
    };
  }

  async getProductMovementsReport(startDate?: string, endDate?: string) {
    const query = this.stockMovementRepo.createQueryBuilder('sm')
      .select('sm.productId', 'productId')
      .addSelect('MAX(sm.productName)', 'productName')
      .addSelect('COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END), 0)', 'totalIn')
      .addSelect('COALESCE(SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END), 0)', 'totalOut')
      .where('sm.productId IS NOT NULL')
      .groupBy('sm.productId');

    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: new Date(endDate) });
    }

    const rawResults = await query.getRawMany();
    return rawResults.map((r) => ({
      productId: r.productId,
      productName: r.productName || 'Bilinmeyen Ürün',
      totalIn: Number(r.totalIn || 0),
      totalOut: Number(r.totalOut || 0),
    }));
  }

  async getCategoryDistribution() {
    const rawResults = await this.productRepo.createQueryBuilder('p')
      .select('COALESCE(p.category, \'Diğer\')', 'category')
      .addSelect('COUNT(p.id)', 'productCount')
      .addSelect('COALESCE(SUM(p.quantity), 0)', 'totalStock')
      .addSelect('COALESCE(SUM(p.quantity * p.price), 0)', 'totalValue')
      .where('p.isDeleted = false')
      .groupBy('p.category')
      .getRawMany();

    return rawResults.map((r) => ({
      category: r.category,
      productCount: Number(r.productCount || 0),
      totalStock: Number(r.totalStock || 0),
      totalValue: Number(r.totalValue || 0),
    }));
  }

  async getTopSelling(days: number = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    const rawResults = await this.dataSource.getRepository(OrderItemEntity)
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .select('oi.productId', 'productId')
      .addSelect('MAX(oi.productName)', 'productName')
      .addSelect('SUM(oi.quantity)', 'totalQty')
      .addSelect('SUM(oi.quantity * oi.price)', 'totalRevenue')
      .where('o.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('o.date >= :thresholdDate', { thresholdDate })
      .groupBy('oi.productId')
      .orderBy('SUM(oi.quantity)', 'DESC')
      .limit(10)
      .getRawMany();

    return rawResults.map((r) => ({
      productName: r.productName || 'Bilinmeyen Ürün',
      totalQty: Number(r.totalQty || 0),
      totalRevenue: Number(r.totalRevenue || 0),
    }));
  }

  async getSupplierSummary() {
    const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);
    const rawResults = await poRepo.createQueryBuilder('po')
      .select('po.supplierId', 'supplierId')
      .addSelect('MAX(po.supplierName)', 'supplierName')
      .addSelect('COUNT(po.id)', 'poCount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.status = '${PurchaseOrderStatus.RECEIVED}' THEN po.totalAmount ELSE 0 END), 0)`,
        'totalAmount'
      )
      .where('po.status != :cancelledStatus', { cancelledStatus: PurchaseOrderStatus.CANCELLED })
      .groupBy('po.supplierId')
      .getRawMany();

    return rawResults.map((r) => ({
      supplierName: r.supplierName || 'Bilinmeyen Tedarikçi',
      poCount: Number(r.poCount || 0),
      totalAmount: Number(r.totalAmount || 0),
    }));
  }

  async globalSearch(query: string, limit: number = 10): Promise<{
    products: ProductEntity[];
    orders: OrderEntity[];
    purchaseOrders: PurchaseOrderEntity[];
    suppliers: SupplierEntity[];
    warehouses: WarehouseEntity[];
  }> {
    const escapedQuery = query.replace(/[%_]/g, '\\$&');
    const q = `%${escapedQuery.toLowerCase()}%`;
    const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);

    const [products, orders, purchaseOrders, suppliers, warehouses] = await Promise.all([
      this.productRepo.createQueryBuilder('p')
        .where('p.isDeleted = false')
        .andWhere('(LOWER(p.name) LIKE :q OR LOWER(p.sku) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      this.orderRepo.createQueryBuilder('o')
        .leftJoinAndSelect('o.items', 'items')
        .where('(LOWER(o.customerName) LIKE :q OR LOWER(o.orderNumber) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      poRepo.createQueryBuilder('po')
        .leftJoinAndSelect('po.items', 'items')
        .where('(LOWER(po.supplierName) LIKE :q OR LOWER(po.poNumber) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      this.supplierRepo.createQueryBuilder('s')
        .where('s.isDeleted = false')
        .andWhere('(LOWER(s.name) LIKE :q OR LOWER(s.contactPerson) LIKE :q OR LOWER(s.email) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      this.warehouseRepo.createQueryBuilder('w')
        .where('w.isDeleted = false')
        .andWhere('(LOWER(w.name) LIKE :q OR LOWER(w.code) LIKE :q)', { q })
        .take(limit)
        .getMany(),
    ]);

    return { products, orders, purchaseOrders, suppliers, warehouses };
  }
}
