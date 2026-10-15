import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { OrderStatus, StockMovementType } from '../../entities/enums';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { UnitService, LineUnit } from '../../shared/services/unit.service';
import { isTracked, StockAllocation } from '../../shared/services/warehouse-stock.service';
import { TrackingEntry } from '../../entities/tracking';
import { addQty, dateKeyInZone, isValidTckn, isValidVkn, roundQty } from '../../shared/tr';

/** VKN / TCKN of a party when valid (snapshotted on stock movements). */
export const partyTaxId = (v: string | null | undefined): string | null => (v && (isValidVkn(v) || isValidTckn(v)) ? v : null);

export interface OrderItemInput {
  productId: string;
  productName?: string;
  quantity: number;
  /** Unit price in document currency as entered (optional; defaults to the product price) */
  unitPrice?: number | null;
  /** Source warehouse (optional; otherwise taken greedily across warehouses) */
  warehouseId?: string | null;
  /** Unit `quantity`/`unitPrice` refer to (default: base unit) */
  unitId?: string | null;
  /** Explicit lot picks in base units (default FEFO/FIFO) */
  lots?: { lotId: string; quantity: number }[];
  /** Explicit serials (default: oldest in stock) */
  serials?: string[];
}

export interface CreateOrderInput {
  customerId?: string | null;
  customerName?: string;
  status: OrderStatus | string;
  items: OrderItemInput[];
  currency?: string;
  warehouseId?: string | null;
  carrier?: string;
  trackingNumber?: string;
  date?: string;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly warehouseStock: WarehouseStockService,
    private readonly finance: FinanceService,
    private readonly unitService: UnitService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getOrders(): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: { companyId: this.companyId },
      relations: { items: true },
      order: { date: 'DESC' },
    });
  }

  async getOrderById(id: string): Promise<OrderEntity | null> {
    return this.orderRepo.findOne({
      where: { companyId: this.companyId, id },
      relations: { items: true },
    });
  }

  async createOrder(data: CreateOrderInput, performedBy = 'System'): Promise<OrderEntity> {
    if (data.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(err('ORDER_CANNOT_CREATE_CANCELLED'));
    }
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException(err('ORDER_ITEMS_REQUIRED'));
    }

    const productsToEmit: ProductEntity[] = [];

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      // Movement chain lock first (same lock order as every stock transaction).
      await this.warehouseStock.begin(manager, this.companyId);
      let orderNumber = '';
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await manager.findOne(OrderEntity, { where: { companyId: this.companyId, orderNumber } });
        if (!existing) break;
        attempts++;
      }

      if (attempts === maxAttempts) {
        throw new BadRequestException(err('ORDER_NUMBER_GENERATION_FAILED'));
      }

      let customer: CustomerEntity | null = null;
      if (data.customerId) {
        customer = await manager.findOne(CustomerEntity, {
          where: { companyId: this.companyId, id: data.customerId, isDeleted: false },
        });
        if (!customer) throw new BadRequestException(err('CUSTOMER_NOT_FOUND'));
      }
      const customerName = (customer?.name || data.customerName || '').trim();
      if (!customerName) throw new BadRequestException(err('VALIDATION_CUSTOMER_NAME_REQUIRED'));

      const company = await this.finance.getCompany(manager);
      const currency = (data.currency || customer?.currency || company.baseCurrency).toUpperCase();
      const orderDate = data.date ? new Date(data.date) : new Date();
      // Stock leaves at the order date (legacy deduct-on-order mode), never in the future.
      const txDate = new Date(Math.min(orderDate.getTime(), Date.now()));

      // Merge duplicates in payload (same product + same source warehouse)
      const mergedMap = new Map<string, OrderItemInput>();
      for (const item of data.items) {
        const key = `${item.productId}|${item.warehouseId || data.warehouseId || ''}|${item.unitId || ''}`;
        const existing = mergedMap.get(key);
        if (existing) {
          existing.quantity = addQty(existing.quantity, item.quantity);
          if (item.lots?.length) existing.lots = [...(existing.lots || []), ...item.lots];
          if (item.serials?.length) existing.serials = [...(existing.serials || []), ...item.serials];
        } else {
          mergedMap.set(key, { ...item });
        }
      }
      const orderItems = Array.from(mergedMap.values());

      const priced: { product: ProductEntity; quantity: number; unitPrice?: number | null; factor: number; lu: LineUnit; baseQty: number; tracking: TrackingEntry[] | null }[] = [];
      for (const item of orderItems) {
        const prod = await manager.findOne(ProductEntity, {
          where: { companyId: this.companyId, id: item.productId, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });

        if (!prod) {
          throw new BadRequestException(err('PRODUCT_NOT_FOUND_NAME', { name: item.productName || item.productId }));
        }
        const lu = await this.unitService.resolveLineUnit(manager, prod, item.unitId);
        const baseQty = this.unitService.toBase(prod, item.quantity, lu);
        if (prod.quantity < baseQty) {
          throw new BadRequestException(err('ORDER_INSUFFICIENT_STOCK', { name: prod.name, available: prod.quantity }));
        }

        let allocations: StockAllocation[] = [];
        if (data.status === OrderStatus.COMPLETED || data.status === OrderStatus.PENDING) {
          const oldQty = prod.quantity;
          allocations = await this.warehouseStock.issue(
            manager,
            prod,
            baseQty,
            item.warehouseId || data.warehouseId,
            { lots: item.lots, serials: item.serials },
            { sale: true },
          );
          await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
            type: StockMovementType.ORDER,
            reasonCode: 'SALE',
            transactionDate: txDate,
            documentType: 'ORDER',
            documentNo: orderNumber,
            documentDate: dateKeyInZone(orderDate, company.timezone),
            counterpartyTaxId: partyTaxId(customer?.identityNumber),
            referenceId: orderNumber,
            referenceType: 'order',
            note: `Sipariş oluşturuldu: ${orderNumber}`,
            performedBy,
          });
          productsToEmit.push(prod);
        }
        priced.push({
          product: prod,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          factor: lu.factor,
          lu,
          baseQty,
          tracking: isTracked(prod) ? this.warehouseStock.toTracking(allocations) : null,
        });
      }

      const { lines, totals, exchangeRate } = await this.finance.priceLines(priced, currency, orderDate, manager);

      const orderItemEntities = priced.map((p, i) =>
        manager.create(OrderItemEntity, {
          productId: p.product.id,
          productName: p.product.name,
          quantity: p.baseQty,
          unitId: p.lu.unitId,
          unitCode: p.lu.unitCode,
          unitFactor: p.lu.factor,
          unitQuantity: p.quantity,
          tracking: p.tracking,
          price: lines[i].unitPrice,
          unitPrice: lines[i].unitPrice,
          taxRate: lines[i].taxRate,
          taxAmount: lines[i].taxAmount,
          lineTotal: lines[i].lineTotal,
        })
      );

      const newOrder = manager.create(OrderEntity, {
        companyId: this.companyId,
        customerId: customer?.id ?? null,
        customerName,
        status: data.status || OrderStatus.PENDING,
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
        date: orderDate,
        orderNumber,
        currency,
        exchangeRate,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        totalAmount: totals.grandTotal,
        items: orderItemEntities,
      });

      const created = await manager.save(OrderEntity, newOrder);
      if (data.date && productsToEmit.length) {
        // VUK 219: stock issued for a sale dated more than VUK219_RECORD_DAYS ago gets a warning.
        const limit = Number(await this.finance.param<number>('VUK219_RECORD_DAYS', undefined, manager).catch(() => 10)) || 10;
        (created as OrderEntity & { warnings?: unknown[] }).warnings = await this.warehouseStock.lateEntryWarnings(manager, this.companyId, [{ transactionDate: txDate }], limit);
      }
      return created;
    });

    this.appGateway.emitToCompany(this.companyId, 'order_mutated', { type: 'create', order: savedOrder });
    for (const p of productsToEmit) {
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    }

    return savedOrder;
  }

  async updateOrderStatus(id: string, status: OrderStatus | string, performedBy = 'System'): Promise<OrderEntity | null> {
    const productsToEmit: ProductEntity[] = [];

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const order = await manager.findOne(OrderEntity, {
        where: { companyId: this.companyId, id },
        relations: { items: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) return null;

      const oldStatus = order.status;
      if (oldStatus === status) return order;

      if (oldStatus === OrderStatus.CANCELLED) {
        throw new BadRequestException(err('ORDER_CANCELLED_IMMUTABLE'));
      }
      if (oldStatus === OrderStatus.COMPLETED && status === OrderStatus.PENDING) {
        throw new BadRequestException(err('ORDER_COMPLETED_TO_PENDING'));
      }

      if (status === OrderStatus.CANCELLED && (oldStatus === OrderStatus.PENDING || oldStatus === OrderStatus.COMPLETED)) {
        for (const item of order.items) {
          if (!item.productId) continue;
          const prod = await manager.findOne(ProductEntity, {
            where: { companyId: this.companyId, id: item.productId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!prod) continue;
          const oldQty = prod.quantity;

          if (isTracked(prod)) {
            // Lots / serials go back exactly where they were taken from.
            const restored = await this.warehouseStock.restore(manager, prod, item.tracking || []);
            await this.warehouseStock.recordMovements(manager, prod, oldQty, restored, {
              type: StockMovementType.RETURN,
              reasonCode: 'CORRECTION',
              documentType: 'ORDER',
              documentNo: order.orderNumber,
              referenceId: order.orderNumber,
              referenceType: 'order',
              note: `Sipariş iptal edildi: ${order.orderNumber}`,
              performedBy,
            });
            productsToEmit.push(prod);
            continue;
          }

          // Put stock back into the warehouses it was taken from (else the default one).
          const outs = await manager.find(StockMovementEntity, {
            where: { companyId: this.companyId, productId: prod.id, referenceId: order.orderNumber, type: StockMovementType.ORDER },
          });
          let allocations: StockAllocation[] = outs
            .filter((m) => !!m.warehouseId)
            .map((m) => ({ warehouseId: m.warehouseId as string, delta: Math.abs(m.quantity) }));
          let reverses: string | null = null;
          if (roundQty(allocations.reduce((s, a) => s + a.delta, 0)) === roundQty(item.quantity)) {
            await this.warehouseStock.apply(manager, prod, allocations);
            // One-to-one with the sale movement: link it (shows as "reversed" in the ledger).
            if (outs.length === 1) reverses = outs[0].id;
          } else {
            allocations = await this.warehouseStock.add(manager, prod, item.quantity);
          }
          await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
            type: StockMovementType.RETURN,
            reasonCode: 'CORRECTION',
            reversesMovementId: reverses,
            documentType: 'ORDER',
            documentNo: order.orderNumber,
            referenceId: order.orderNumber,
            referenceType: 'order',
            note: `Sipariş iptal edildi: ${order.orderNumber}`,
            performedBy,
          });
          productsToEmit.push(prod);
        }
      }

      order.status = status;
      return await manager.save(OrderEntity, order);
    });

    if (savedOrder) {
      this.appGateway.emitToCompany(this.companyId, 'order_mutated', { type: 'update', order: savedOrder });
      for (const p of productsToEmit) {
        this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
      }
    }
    return savedOrder;
  }

  async deleteOrder(id: string): Promise<boolean> {
    const order = await this.orderRepo.findOne({ where: { companyId: this.companyId, id } });
    if (order) {
      if (order.status !== OrderStatus.CANCELLED) {
        throw new BadRequestException(err('ORDER_DELETE_ONLY_CANCELLED'));
      }
      // Soft-remove the order without its eager items: the cascade would soft-remove the items too,
      // and they have no delete-date column (MissingDeleteDateColumnError). The audit subscriber still fires.
      const shallow = Object.assign(new OrderEntity(), order) as Partial<OrderEntity>;
      delete shallow.items;
      await this.orderRepo.softRemove(shallow as OrderEntity);
      this.appGateway.emitToCompany(this.companyId, 'order_mutated', { type: 'delete', orderId: id });
      return true;
    }
    return false;
  }
}
