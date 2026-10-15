import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { OrderStatus, PurchaseOrderStatus } from '../../entities/enums';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { FinanceService } from '../../shared/services/finance.service';
import { convertAmount } from '../../shared/finance/currency';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { daysUntil, todayKey } from '../../shared/inventory/lot-allocation';
import { addDays } from '../../shared/tr';
import { applyDayRange } from '../../shared/time/company-day-range';

@Injectable()
export class ReportService {
  constructor(
    private readonly tenant: TenantContext,
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
    private readonly finance: FinanceService,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /**
   * Report filters: a plain day (YYYY-MM-DD) means that calendar day in the company time
   * zone (the database stores UTC), and the end day is inclusive. Full timestamps are used as given.
   */
  /** Report filters: plain days are calendar days in the company time zone (end day inclusive). */
  private async applyDateRange(query: SelectQueryBuilder<any>, column: string, startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return;
    applyDayRange(query, column, (await this.finance.getCompany()).timezone, startDate, endDate);
  }

  async getStockSummary(startDate?: string, endDate?: string) {
    const query = this.stockMovementRepo.createQueryBuilder('sm')
      .select('COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END), 0)', 'totalIn')
      .addSelect('COALESCE(SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END), 0)', 'totalOut')
      .where('sm.companyId = :companyId', { companyId: this.companyId });

    await this.applyDateRange(query, 'sm.transactionDate', startDate, endDate);

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
      .where('sm.companyId = :companyId', { companyId: this.companyId })
      .andWhere('sm.productId IS NOT NULL')
      .groupBy('sm.productId');

    await this.applyDateRange(query, 'sm.transactionDate', startDate, endDate);

    const rawResults = await query.getRawMany();
    return rawResults.map((r) => ({
      productId: r.productId,
      productName: r.productName || 'Bilinmeyen Ürün',
      totalIn: Number(r.totalIn || 0),
      totalOut: Number(r.totalOut || 0),
    }));
  }

  /**
   * Category totals. The stock value is the value at cost (VUK 274: open cost layers, company base
   * currency) - the only legal inventory value; `salesValue` (quantity x sales price, converted) is
   * information only and is never shown as the stock value. `totalValue` = costValue (kept for
   * older clients).
   */
  async getCategoryDistribution() {
    const rawResults = await this.productRepo.createQueryBuilder('p')
      .select("COALESCE(p.category, 'Diğer')", 'category')
      .addSelect('p.currency', 'currency')
      .addSelect('COUNT(p.id)', 'productCount')
      .addSelect('COALESCE(SUM(p.quantity), 0)', 'totalStock')
      .addSelect('COALESCE(SUM(p.quantity * p.price), 0)', 'salesValue')
      .where('p.companyId = :companyId', { companyId: this.companyId })
      .andWhere('p.isDeleted = false')
      .groupBy('p.category')
      .addGroupBy('p.currency')
      .getRawMany();
    const costRows: { category: string; v: string }[] = await this.dataSource.query(
      "SELECT COALESCE(p.`category`, 'Diğer') AS category, SUM(l.`qtyRemaining` * l.`unitCost`) AS v FROM `stock_cost_layers` l JOIN `products` p ON p.`id` = l.`productId` " +
        // Soft-deleted products that still hold stock are part of the inventory at cost (legal list).
        "WHERE l.`companyId` = ? AND l.`qtyRemaining` > 0 GROUP BY COALESCE(p.`category`, 'Diğer')",
      [this.companyId],
    );

    const company = await this.finance.getCompany();
    const rates = await this.finance.getRates();
    const byCategory = new Map<string, { category: string; productCount: number; totalStock: number; costValue: number; salesValue: number; totalValue: number; currency: string; unconverted: string[] }>();
    for (const r of rawResults) {
      const row = byCategory.get(r.category) || { category: r.category, productCount: 0, totalStock: 0, costValue: 0, salesValue: 0, totalValue: 0, currency: company.baseCurrency, unconverted: [] as string[] };
      row.productCount += Number(r.productCount || 0);
      row.totalStock += Number(r.totalStock || 0);
      const converted = convertAmount(Number(r.salesValue || 0), r.currency || company.baseCurrency, company.baseCurrency, rates, null, company.baseCurrency);
      if (converted === null) row.unconverted.push(r.currency);
      else row.salesValue = Math.round((row.salesValue + converted) * 100) / 100;
      byCategory.set(r.category, row);
    }
    // Categories holding only soft-deleted products still carry stock value at cost.
    for (const c of costRows) {
      if (!byCategory.has(c.category)) byCategory.set(c.category, { category: c.category, productCount: 0, totalStock: 0, costValue: 0, salesValue: 0, totalValue: 0, currency: company.baseCurrency, unconverted: [] });
    }
    for (const row of byCategory.values()) {
      row.costValue = Math.round(Number(costRows.find((c) => c.category === row.category)?.v || 0) * 100) / 100;
      row.totalValue = row.costValue;
    }
    return [...byCategory.values()];
  }

  /**
   * Headline numbers for the dashboard, all in the company base currency.
   * Documents are converted with the rate frozen on them at creation time.
   */
  async getDashboardSummary() {
    const company = await this.finance.getCompany();
    const orders = await this.orderRepo.createQueryBuilder('o')
      .select('COUNT(o.id)', 'orderCount')
      .addSelect(`COALESCE(SUM(CASE WHEN o.status = '${OrderStatus.COMPLETED}' THEN o.grandTotal * o.exchangeRate ELSE 0 END), 0)`, 'revenue')
      .addSelect(`COALESCE(SUM(CASE WHEN o.status = '${OrderStatus.COMPLETED}' THEN o.subtotal * o.exchangeRate ELSE 0 END), 0)`, 'netRevenue')
      .addSelect(`COALESCE(SUM(CASE WHEN o.status = '${OrderStatus.COMPLETED}' THEN o.taxTotal * o.exchangeRate ELSE 0 END), 0)`, 'taxCollected')
      .addSelect(`SUM(CASE WHEN o.status = '${OrderStatus.PENDING}' THEN 1 ELSE 0 END)`, 'pendingCount')
      .where('o.companyId = :companyId', { companyId: this.companyId })
      .getRawOne();
    const purchases = await this.dataSource.getRepository(PurchaseOrderEntity).createQueryBuilder('po')
      .select(`COALESCE(SUM(CASE WHEN po.status = '${PurchaseOrderStatus.RECEIVED}' THEN po.grandTotal * po.exchangeRate ELSE 0 END), 0)`, 'received')
      .addSelect(`COALESCE(SUM(CASE WHEN po.status IN ('${PurchaseOrderStatus.DRAFT}', '${PurchaseOrderStatus.SENT}') THEN po.grandTotal * po.exchangeRate ELSE 0 END), 0)`, 'open')
      .where('po.companyId = :companyId', { companyId: this.companyId })
      .getRawOne();
    const categories = await this.getCategoryDistribution();
    const round = (n: unknown) => Math.round(Number(n || 0) * 100) / 100;
    return {
      currency: company.baseCurrency,
      orderCount: Number(orders?.orderCount || 0),
      pendingOrderCount: Number(orders?.pendingCount || 0),
      revenue: round(orders?.revenue),
      netRevenue: round(orders?.netRevenue),
      taxCollected: round(orders?.taxCollected),
      purchasesReceived: round(purchases?.received),
      purchasesOpen: round(purchases?.open),
      // Value at cost (legal); the sales-price value is reported separately as information.
      inventoryValue: round(categories.reduce((s, c) => s + c.costValue, 0)),
      inventoryCostValue: round(categories.reduce((s, c) => s + c.costValue, 0)),
      inventorySalesValue: round(categories.reduce((s, c) => s + c.salesValue, 0)),
      unconvertedCurrencies: [...new Set(categories.flatMap((c) => c.unconverted))],
    };
  }

  async getTopSelling(days = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    const rawResults = await this.dataSource.getRepository(OrderItemEntity)
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .select('oi.productId', 'productId')
      .addSelect('MAX(oi.productName)', 'productName')
      .addSelect('SUM(oi.quantity)', 'totalQty')
      .addSelect('SUM(oi.quantity * oi.unitPrice * o.exchangeRate)', 'totalRevenue')
      .where('o.companyId = :companyId', { companyId: this.companyId })
      .andWhere('o.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('o.date >= :thresholdDate', { thresholdDate })
      .groupBy('oi.productId')
      .orderBy('SUM(oi.quantity)', 'DESC')
      .limit(10)
      .getRawMany();

    return rawResults.map((r) => ({
      productName: r.productName || 'Bilinmeyen Ürün',
      totalQty: Number(r.totalQty || 0),
      totalRevenue: Math.round(Number(r.totalRevenue || 0) * 100) / 100,
    }));
  }

  async getSupplierSummary() {
    const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);
    const rawResults = await poRepo.createQueryBuilder('po')
      .select('po.supplierId', 'supplierId')
      .addSelect('MAX(po.supplierName)', 'supplierName')
      .addSelect('COUNT(po.id)', 'poCount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.status = '${PurchaseOrderStatus.RECEIVED}' THEN po.grandTotal * po.exchangeRate ELSE 0 END), 0)`,
        'totalAmount'
      )
      .where('po.companyId = :companyId', { companyId: this.companyId })
      .andWhere('po.status != :cancelledStatus', { cancelledStatus: PurchaseOrderStatus.CANCELLED })
      .groupBy('po.supplierId')
      .getRawMany();

    return rawResults.map((r) => ({
      supplierName: r.supplierName || 'Bilinmeyen Tedarikçi',
      poCount: Number(r.poCount || 0),
      totalAmount: Number(r.totalAmount || 0),
    }));
  }

  async globalSearch(query: string, limit = 10): Promise<{
    products: ProductEntity[];
    orders: OrderEntity[];
    purchaseOrders: PurchaseOrderEntity[];
    suppliers: SupplierEntity[];
    warehouses: WarehouseEntity[];
  }> {
    const escapedQuery = query.replace(/[%_]/g, '\\$&');
    const q = `%${escapedQuery.toLowerCase()}%`;
    const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);
    const companyId = this.companyId;

    const [products, orders, purchaseOrders, suppliers, warehouses] = await Promise.all([
      this.productRepo.createQueryBuilder('p')
        .where('p.companyId = :companyId', { companyId })
        .andWhere('p.isDeleted = false')
        .andWhere('(LOWER(p.name) LIKE :q OR LOWER(p.sku) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      this.orderRepo.createQueryBuilder('o')
        .leftJoinAndSelect('o.items', 'items')
        .where('o.companyId = :companyId', { companyId })
        .andWhere('(LOWER(o.customerName) LIKE :q OR LOWER(o.orderNumber) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      poRepo.createQueryBuilder('po')
        .leftJoinAndSelect('po.items', 'items')
        .where('po.companyId = :companyId', { companyId })
        .andWhere('(LOWER(po.supplierName) LIKE :q OR LOWER(po.poNumber) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      this.supplierRepo.createQueryBuilder('s')
        .where('s.companyId = :companyId', { companyId })
        .andWhere('s.isDeleted = false')
        .andWhere('(LOWER(s.name) LIKE :q OR LOWER(s.contactPerson) LIKE :q OR LOWER(s.email) LIKE :q)', { q })
        .take(limit)
        .getMany(),

      this.warehouseRepo.createQueryBuilder('w')
        .where('w.companyId = :companyId', { companyId })
        .andWhere('w.isDeleted = false')
        .andWhere('(LOWER(w.name) LIKE :q OR LOWER(w.code) LIKE :q)', { q })
        .take(limit)
        .getMany(),
    ]);

    return { products, orders, purchaseOrders, suppliers, warehouses };
  }

  /** Lots with stock expiring within `days` (default company.expiryAlertDays); expired ones included. */
  async getExpiringLots(days?: number) {
    const company = await this.finance.getCompany();
    const window = Number.isFinite(days) && (days as number) >= 0 ? (days as number) : company.expiryAlertDays || 30;
    const today = todayKey(company.timezone);
    const until = addDays(today, window);
    const rows = await this.dataSource
      .getRepository(StockLotEntity)
      .createQueryBuilder('l')
      .innerJoin(ProductEntity, 'p', 'p.id = l.productId AND p.isDeleted = false')
      .innerJoin(WarehouseEntity, 'w', 'w.id = l.warehouseId AND w.isDeleted = false')
      .select(['l.id AS lotId', 'l.productId AS productId', 'p.name AS productName', 'p.sku AS sku', 'l.warehouseId AS warehouseId'])
      .addSelect(['w.name AS warehouseName', 'l.lotNumber AS lotNumber', "DATE_FORMAT(l.expiryDate, '%Y-%m-%d') AS expiryDate", 'l.quantity AS quantity'])
      .where('l.companyId = :companyId', { companyId: this.companyId })
      .andWhere('l.quantity > 0 AND l.expiryDate IS NOT NULL AND l.expiryDate <= :until', { until })
      .orderBy('l.expiryDate', 'ASC')
      .getRawMany();
    return {
      days: window,
      items: rows.map((r) => ({ ...r, quantity: Number(r.quantity), daysLeft: daysUntil(r.expiryDate, today) })),
    };
  }
}
