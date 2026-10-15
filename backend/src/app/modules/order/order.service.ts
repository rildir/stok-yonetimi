import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { OrderChargeEntity } from '../../entities/order-charge.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { DocPricingResult, DocWarning, FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { OrderStatus, StockMovementType } from '../../entities/enums';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { UnitService, LineUnit } from '../../shared/services/unit.service';
import { isTracked, StockAllocation } from '../../shared/services/warehouse-stock.service';
import { TrackingEntry } from '../../entities/tracking';
import { TaxEngineCharge, round2 } from '../../shared/finance/tax';
import { addQty, dateKeyInZone, isValidTckn, isValidVkn, parseZonedDateTime, roundQty } from '../../shared/tr';

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
  discountRate?: number | null;
  discountAmount?: number | null;
  exemptionCode?: string | null;
  withholdingCode?: string | null;
}

export interface OrderPricingInput {
  customerId?: string | null;
  items: OrderItemInput[];
  currency?: string;
  documentDiscountAmount?: number | null;
  charges?: TaxEngineCharge[];
  taxPointDate?: string | null;
  shippedAt?: string | null;
  date?: string;
}

export interface CreateOrderInput extends OrderPricingInput {
  customerName?: string;
  status: OrderStatus | string;
  warehouseId?: string | null;
  carrier?: string;
  trackingNumber?: string;
  salesChannel?: string | null;
  isDistanceSale?: boolean;
  channelOrderRef?: string | null;
}

type WithWarnings<T> = T & { warnings?: DocWarning[] };

interface PreparedLine {
  item: OrderItemInput;
  product: ProductEntity;
  lu: LineUnit;
  baseQty: number;
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
      relations: { items: true, charges: true },
      order: { date: 'DESC' },
    });
  }

  async getOrderById(id: string): Promise<OrderEntity | null> {
    return this.orderRepo.findOne({
      where: { companyId: this.companyId, id },
      relations: { items: true, charges: true },
    });
  }

  private async loadCustomer(manager: EntityManager, customerId?: string | null): Promise<CustomerEntity | null> {
    if (!customerId) return null;
    const customer = await manager.findOne(CustomerEntity, { where: { companyId: this.companyId, id: customerId, isDeleted: false } });
    if (!customer) throw new BadRequestException(err('CUSTOMER_NOT_FOUND'));
    return customer;
  }

  /** Merges duplicate payload lines (same product, warehouse, unit and tax terms). */
  private mergeItems(items: OrderItemInput[], defaultWarehouse?: string | null): OrderItemInput[] {
    const merged = new Map<string, OrderItemInput>();
    for (const item of items) {
      const key = [
        item.productId,
        item.warehouseId || defaultWarehouse || '',
        item.unitId || '',
        item.unitPrice ?? '',
        item.discountRate ?? '',
        item.discountAmount ?? '',
        item.exemptionCode ?? '',
        item.withholdingCode ?? '~',
      ].join('|');
      const existing = merged.get(key);
      if (existing && !item.discountAmount) {
        existing.quantity = addQty(existing.quantity, item.quantity);
        if (item.lots?.length) existing.lots = [...(existing.lots || []), ...item.lots];
        if (item.serials?.length) existing.serials = [...(existing.serials || []), ...item.serials];
      } else {
        merged.set(existing ? `${key}|${merged.size}` : key, { ...item });
      }
    }
    return Array.from(merged.values());
  }

  private async prepareLines(manager: EntityManager, items: OrderItemInput[], lock: boolean, checkStock: boolean): Promise<PreparedLine[]> {
    const out: PreparedLine[] = [];
    for (const item of items) {
      const product = await manager.findOne(ProductEntity, {
        where: { companyId: this.companyId, id: item.productId, isDeleted: false },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!product) throw new BadRequestException(err('PRODUCT_NOT_FOUND_NAME', { name: item.productName || item.productId }));
      const lu = await this.unitService.resolveLineUnit(manager, product, item.unitId);
      const baseQty = this.unitService.toBase(product, item.quantity, lu);
      if (checkStock && product.quantity < baseQty) {
        throw new BadRequestException(err('ORDER_INSUFFICIENT_STOCK', { name: product.name, available: product.quantity }));
      }
      out.push({ item, product, lu, baseQty });
    }
    return out;
  }

  /** Tax point (KDVK 10): explicit date, else the shipment date, else the order date. */
  private taxPoint(company: CompanyEntity, explicit: string | null | undefined, shippedAt: Date | null, orderDate: Date): string {
    if (explicit) return explicit;
    return dateKeyInZone(shippedAt || orderDate, company.timezone);
  }

  private price(manager: EntityManager, lines: PreparedLine[], data: OrderPricingInput, currency: string, taxPointDate: string, customer: CustomerEntity | null, documentId?: string | null) {
    return this.finance.priceDocumentFor(
      {
        kind: 'SALE',
        lines: lines.map((l) => ({
          product: l.product,
          quantity: l.item.quantity,
          unitPrice: l.item.unitPrice,
          factor: l.lu.factor,
          discountRate: l.item.discountRate,
          discountAmount: l.item.discountAmount,
          exemptionCode: l.item.exemptionCode,
          withholdingCode: l.item.withholdingCode,
        })),
        charges: data.charges || [],
        documentDiscountAmount: data.documentDiscountAmount ?? 0,
        currency,
        taxPointDate,
        customer,
        documentId: documentId ?? null,
      },
      manager,
    );
  }

  /** Prices an order without saving it or moving stock (form preview). */
  async quote(data: OrderPricingInput & { orderId?: string }): Promise<DocPricingResult> {
    const manager = this.dataSource.manager;
    if (!data.items?.length) throw new BadRequestException(err('ORDER_ITEMS_REQUIRED'));
    const company = await this.finance.getCompany(manager);
    const customer = await this.loadCustomer(manager, data.customerId);
    const currency = (data.currency || customer?.currency || company.baseCurrency).toUpperCase();
    const orderDate = data.date ? new Date(data.date) : new Date();
    const shippedAt = parseZonedDateTime(data.shippedAt, company.timezone);
    const lines = await this.prepareLines(manager, data.items, false, false);
    return this.price(manager, lines, data, currency, this.taxPoint(company, data.taxPointDate, shippedAt, orderDate), customer, data.orderId);
  }

  /** Applies a pricing result to the order and its lines (new entities). */
  private applyPricing(manager: EntityManager, order: OrderEntity, lines: PreparedLine[], pr: DocPricingResult, tracking: (TrackingEntry[] | null)[], data: OrderPricingInput) {
    order.items = lines.map((p, i) => {
      const l = pr.doc.lines[i];
      const m = pr.lineMeta[i];
      return manager.create(OrderItemEntity, {
        productId: p.product.id,
        productName: p.product.name,
        quantity: p.baseQty,
        unitId: p.lu.unitId,
        unitCode: p.lu.unitCode,
        unitFactor: p.lu.factor,
        unitQuantity: p.item.quantity,
        tracking: tracking[i] ?? null,
        price: l.unitPrice,
        unitPrice: l.unitPrice,
        enteredUnitPrice: m.enteredUnitPrice,
        grossAmount: l.grossAmount,
        discountRate: l.discountRate,
        discountAmount: l.discountAmount,
        documentDiscountShare: l.documentDiscountShare,
        netAmount: l.netAmount,
        taxRateId: m.taxRateId,
        taxCode: m.taxCode,
        taxRate: l.taxRate,
        taxAmount: l.taxAmount,
        exemptionCode: l.exemptionCode,
        vatNotCollected: l.vatNotCollected,
        withholdingCode: l.withholdingCode,
        withholdingRate: l.withholdingRate || null,
        withheldTaxAmount: l.withheldTaxAmount,
        otvCode: m.otvCode,
        otvRate: l.otvRate || null,
        otvAmount: l.otvAmount,
        lineTotal: l.lineTotal,
      });
    });
    order.charges = pr.doc.charges.map((c, i) =>
      manager.create(OrderChargeEntity, {
        companyId: this.companyId,
        type: c.type,
        description: c.description,
        enteredAmount: round2(Number((data.charges || []).filter((x) => Number(x.amount) > 0)[i]?.amount || 0)),
        amount: c.amount,
        taxAmount: c.taxAmount,
        withheldTaxAmount: c.withheldTaxAmount,
        lineTotal: c.lineTotal,
        allocations: c.allocations,
      }),
    );
    Object.assign(order, {
      currency: pr.currency,
      exchangeRate: pr.exchangeRate,
      exchangeRateSource: pr.exchangeRateSource,
      exchangeRateDate: pr.exchangeRateDate,
      taxPointDate: pr.taxPointDate,
      subtotal: pr.doc.subtotal,
      taxTotal: pr.doc.taxTotal,
      grandTotal: pr.doc.grandTotal,
      totalAmount: pr.doc.grandTotal,
      documentDiscountAmount: pr.doc.documentDiscountAmount,
      documentDiscountEntered: round2(Number(data.documentDiscountAmount || 0)),
      chargesTotal: pr.doc.chargesTotal,
      otvTotal: pr.doc.otvTotal,
      withheldTaxTotal: pr.doc.withheldTaxTotal,
      notCollectedTaxTotal: pr.doc.notCollectedTaxTotal,
      payableTotal: pr.doc.payableTotal,
      taxBreakdown: pr.doc.breakdown,
      subtotalTry: pr.subtotalTry,
      taxTotalTry: pr.taxTotalTry,
      grandTotalTry: pr.grandTotalTry,
      invoiceTypeHint: pr.invoiceTypeHint,
    });
  }

  async createOrder(data: CreateOrderInput, performedBy = 'System'): Promise<WithWarnings<OrderEntity>> {
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

      const customer = await this.loadCustomer(manager, data.customerId);
      const customerName = (customer?.name || data.customerName || '').trim();
      if (!customerName) throw new BadRequestException(err('VALIDATION_CUSTOMER_NAME_REQUIRED'));

      const company = await this.finance.getCompany(manager);
      const currency = (data.currency || customer?.currency || company.baseCurrency).toUpperCase();
      const orderDate = data.date ? new Date(data.date) : new Date();
      // Stock leaves at the order date (legacy deduct-on-order mode), never in the future.
      const txDate = new Date(Math.min(orderDate.getTime(), Date.now()));
      let shippedAt = parseZonedDateTime(data.shippedAt, company.timezone);
      if (data.shippedAt && (!shippedAt || Number.isNaN(shippedAt.getTime()))) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
      // A completed order was delivered: without a shipment time it shipped at the order date.
      if (!shippedAt && data.status === OrderStatus.COMPLETED) shippedAt = txDate;

      const lines = await this.prepareLines(manager, this.mergeItems(data.items, data.warehouseId), true, true);
      // Price (and validate the tax data) before any stock moves.
      const pricing = await this.price(manager, lines, data, currency, this.taxPoint(company, data.taxPointDate, shippedAt, orderDate), customer);

      const tracking: (TrackingEntry[] | null)[] = [];
      for (const { item, product: prod, baseQty } of lines) {
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
        tracking.push(isTracked(prod) ? this.warehouseStock.toTracking(allocations) : null);
      }

      const newOrder = manager.create(OrderEntity, {
        companyId: this.companyId,
        customerId: customer?.id ?? null,
        customerName,
        status: data.status || OrderStatus.PENDING,
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
        date: orderDate,
        orderNumber,
        shippedAt,
        salesChannel: data.salesChannel || null,
        isDistanceSale: !!data.isDistanceSale,
        channelOrderRef: data.channelOrderRef || null,
        taxFrozenAt: data.status === OrderStatus.COMPLETED ? new Date() : null,
      });
      this.applyPricing(manager, newOrder, lines, pricing, tracking, data);

      const created = (await manager.save(OrderEntity, newOrder)) as WithWarnings<OrderEntity>;
      const warnings: DocWarning[] = [...pricing.warnings];
      if (data.date && productsToEmit.length) {
        // VUK 219: stock issued for a sale dated more than VUK219_RECORD_DAYS ago gets a warning.
        const limit = Number(await this.finance.param<number>('VUK219_RECORD_DAYS', undefined, manager).catch(() => 10)) || 10;
        warnings.push(...(await this.warehouseStock.lateEntryWarnings(manager, this.companyId, [{ transactionDate: txDate }], limit)));
      }
      if (warnings.length) created.warnings = warnings;
      return created;
    });

    this.appGateway.emitToCompany(this.companyId, 'order_mutated', { type: 'create', order: savedOrder });
    for (const p of productsToEmit) {
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    }

    return savedOrder;
  }

  /**
   * Re-reads the tax-point exchange rate of an unfrozen order and refreshes its TRY equivalents
   * (document-currency amounts and the rate snapshot of the lines stay as priced).
   */
  private async refreshFx(manager: EntityManager, order: OrderEntity): Promise<void> {
    const company = await this.finance.getCompany(manager);
    if ((company.baseCurrency || '').toUpperCase() !== 'TRY' || !order.taxPointDate) return;
    const fx = await this.finance.taxFxRate(order.currency, order.taxPointDate, manager);
    order.exchangeRate = fx.rate;
    order.exchangeRateSource = fx.source;
    order.exchangeRateDate = fx.source === 'BASE' ? null : fx.date;
    order.subtotalTry = round2(Number(order.subtotal) * fx.rate);
    order.taxTotalTry = round2(Number(order.taxTotal) * fx.rate);
    order.grandTotalTry = round2(Number(order.grandTotal) * fx.rate);
  }

  /** Sets the shipment time / tax point of a pending order (409 DOCUMENT_TAX_FROZEN once completed). */
  async setTaxPoint(id: string, dto: { taxPointDate?: string; shippedAt?: string }): Promise<OrderEntity> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(OrderEntity, { where: { companyId: this.companyId, id }, relations: { items: true, charges: true }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException(err('ORDER_NOT_FOUND'));
      if (order.taxFrozenAt || order.status !== OrderStatus.PENDING) throw new ConflictException(err('DOCUMENT_TAX_FROZEN', { number: order.orderNumber }));
      const company = await this.finance.getCompany(manager);
      if (dto.shippedAt) {
        const at = parseZonedDateTime(dto.shippedAt, company.timezone);
        if (!at || Number.isNaN(at.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
        order.shippedAt = at;
      }
      order.taxPointDate = dto.taxPointDate || (order.shippedAt ? dateKeyInZone(order.shippedAt, company.timezone) : order.taxPointDate);
      await this.refreshFx(manager, order);
      return manager.save(OrderEntity, order);
    });
    this.appGateway.emitToCompany(this.companyId, 'order_mutated', { type: 'update', order: saved });
    return saved;
  }

  async updateOrderStatus(id: string, status: OrderStatus | string, performedBy = 'System'): Promise<OrderEntity | null> {
    const productsToEmit: ProductEntity[] = [];

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const order = await manager.findOne(OrderEntity, {
        where: { companyId: this.companyId, id },
        relations: { items: true, charges: true },
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

      if (status === OrderStatus.COMPLETED && !order.taxFrozenAt) {
        // Delivery = tax point (KDVK 10); the TRY equivalents use its rate, then the tax data is frozen.
        if (!order.shippedAt) {
          const company = await this.finance.getCompany(manager);
          order.shippedAt = new Date();
          order.taxPointDate = dateKeyInZone(order.shippedAt, company.timezone);
        }
        await this.refreshFx(manager, order);
        order.taxFrozenAt = new Date();
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
      // Soft-remove the order without its eager items / charges: the cascade would soft-remove them
      // too, and they have no delete-date column (MissingDeleteDateColumnError). The audit subscriber still fires.
      const shallow = Object.assign(new OrderEntity(), order) as Partial<OrderEntity>;
      delete shallow.items;
      delete shallow.charges;
      await this.orderRepo.softRemove(shallow as OrderEntity);
      this.appGateway.emitToCompany(this.companyId, 'order_mutated', { type: 'delete', orderId: id });
      return true;
    }
    return false;
  }
}
