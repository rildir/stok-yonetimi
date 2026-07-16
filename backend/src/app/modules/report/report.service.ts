import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';

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
    const query = this.stockMovementRepo.createQueryBuilder('sm');
    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: new Date(endDate) });
    }
    
    const movements = await query.getMany();
    let totalIn = 0;
    let totalOut = 0;
    
    for (const m of movements) {
      const q = m.quantity || 0;
      if (q > 0) {
        totalIn += q;
      } else {
        totalOut += Math.abs(q);
      }
    }
    
    return {
      totalIn,
      totalOut,
      netChange: totalIn - totalOut
    };
  }

  async getProductMovementsReport(startDate?: string, endDate?: string) {
    const query = this.stockMovementRepo.createQueryBuilder('sm');
    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: new Date(endDate) });
    }
    
    const movements = await query.getMany();
    const productReports: Record<string, { productId: string, productName: string, totalIn: number, totalOut: number }> = {};
    
    for (const m of movements) {
      const pId = m.productId;
      if (!pId) continue;
      if (!productReports[pId]) {
        productReports[pId] = {
          productId: pId,
          productName: m.productName || 'Bilinmeyen Ürün',
          totalIn: 0,
          totalOut: 0
        };
      }
      const qty = m.quantity || 0;
      if (qty > 0) {
        productReports[pId].totalIn += qty;
      } else {
        productReports[pId].totalOut += Math.abs(qty);
      }
    }
    
    return Object.values(productReports);
  }

  async getCategoryDistribution() {
    const products = await this.productRepo.find({ where: { isDeleted: false } });
    const distribution: Record<string, { category: string, productCount: number, totalStock: number, totalValue: number }> = {};
    
    for (const p of products) {
      const cat = p.category || 'Diğer';
      if (!distribution[cat]) {
        distribution[cat] = {
          category: cat,
          productCount: 0,
          totalStock: 0,
          totalValue: 0
        };
      }
      distribution[cat].productCount += 1;
      distribution[cat].totalStock += p.quantity || 0;
      distribution[cat].totalValue += (p.quantity || 0) * (p.price || 0);
    }
    return Object.values(distribution);
  }

  async getTopSelling(days: number = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);
    
    const orders = await this.orderRepo.find();
    const filteredOrders = orders.filter(o => 
      o.status === 'Completed' && 
      new Date(o.date).getTime() >= thresholdDate.getTime()
    );

    const productSales: Record<string, { productName: string, totalQty: number, totalRevenue: number }> = {};

    for (const order of filteredOrders) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        if (!item.productId) continue;
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            productName: item.productName || 'Bilinmeyen Ürün',
            totalQty: 0,
            totalRevenue: 0
          };
        }
        productSales[item.productId].totalQty += item.quantity || 0;
        productSales[item.productId].totalRevenue += (item.quantity || 0) * (item.price || 0);
      }
    }

    return Object.values(productSales)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);
  }

  async getSupplierSummary() {
    const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);
    const pos = await poRepo.find();
    const summary: Record<string, { supplierName: string, poCount: number, totalAmount: number }> = {};
    
    for (const po of pos) {
      if (po.status === 'Cancelled') continue;
      const sId = po.supplierId;
      if (!summary[sId]) {
        summary[sId] = {
          supplierName: po.supplierName || 'Bilinmeyen Tedarikçi',
          poCount: 0,
          totalAmount: 0
        };
      }
      summary[sId].poCount += 1;
      if (po.status === 'Received') {
        summary[sId].totalAmount += Number(po.totalAmount) || 0;
      }
    }
    return Object.values(summary);
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
        .where('(LOWER(o.customerName) LIKE :q OR LOWER(o.orderNumber) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      poRepo.createQueryBuilder('po')
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
        .getMany()
    ]);

    return { products, orders, purchaseOrders, suppliers, warehouses };
  }
}
