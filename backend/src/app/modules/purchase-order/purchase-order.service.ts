import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { PurchaseOrderStatus, StockMovementType } from '../../entities/enums';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { UnitService } from '../../shared/services/unit.service';
import { isTracked, LotReceiptInput } from '../../shared/services/warehouse-stock.service';
import { CompanyEntity } from '../../entities/company.entity';
import { partyTaxId } from '../order/order.service';
import { dateKeyInZone, parseZonedDateTime } from '../../shared/tr';

/** Receipt document details (supplier's despatch advice / invoice) and the actual receipt time. */
export interface PoReceiptMeta {
  transactionDate?: string | null;
  documentType?: string | null;
  documentNo?: string | null;
  documentDate?: string | null;
}


export interface PoReceiptInput {
  itemId: string;
  lots?: LotReceiptInput[];
  serials?: string[];
}

export interface PurchaseOrderItemInput {
  productId: string;
  productName?: string;
  quantity: number;
  /** Legacy alias of unitPrice */
  price?: number;
  unitPrice?: number;
  /** Unit quantity/unitPrice refer to (default: base unit) */
  unitId?: string | null;
}

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(PurchaseOrderEntity)
    private readonly poRepo: Repository<PurchaseOrderEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    private readonly warehouseStock: WarehouseStockService,
    private readonly finance: FinanceService,
    private readonly unitService: UnitService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getPurchaseOrders(): Promise<PurchaseOrderEntity[]> {
    return this.poRepo.find({
      where: { companyId: this.companyId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderEntity | null> {
    return this.poRepo.findOne({
      where: { companyId: this.companyId, id },
      relations: { items: true },
    });
  }

  /** Validates products and prices PO lines in `currency` (tax per product). */
  private async buildItems(
    manager: EntityManager,
    items: PurchaseOrderItemInput[],
    currency: string,
    date: Date,
  ): Promise<{ items: PurchaseOrderItemEntity[]; subtotal: number; taxTotal: number; grandTotal: number; exchangeRate: number }> {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestException(err('PO_ITEMS_REQUIRED'));
    }
    const priced: { product: ProductEntity; quantity: number; unitPrice?: number | null; factor: number; unitId: string | null; unitCode: string; baseQty: number }[] = [];
    for (const item of items) {
      if (!item.productId) {
        throw new BadRequestException(err('PO_ITEM_PRODUCT_REQUIRED'));
      }
      const product = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: item.productId, isDeleted: false } });
      if (!product) {
        throw new BadRequestException(err('PRODUCT_NOT_FOUND_ID', { id: item.productId }));
      }
      const lu = await this.unitService.resolveLineUnit(manager, product, item.unitId);
      const qty = item.quantity || 0;
      const baseQty = qty > 0 ? this.unitService.toBase(product, qty, lu) : 0;
      priced.push({ product, quantity: qty, unitPrice: item.unitPrice ?? item.price, factor: lu.factor, unitId: lu.unitId, unitCode: lu.unitCode, baseQty });
    }
    const { lines, totals, exchangeRate } = await this.finance.priceLines(priced, currency, date, manager);
    return {
      items: priced.map((p, i) =>
        manager.create(PurchaseOrderItemEntity, {
          productId: p.product.id,
          productName: p.product.name,
          quantity: p.baseQty,
          unitId: p.unitId,
          unitCode: p.unitCode,
          unitFactor: p.factor,
          unitQuantity: p.quantity,
          price: lines[i].unitPrice,
          unitPrice: lines[i].unitPrice,
          taxRate: lines[i].taxRate,
          taxAmount: lines[i].taxAmount,
          lineTotal: lines[i].lineTotal,
        })
      ),
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      exchangeRate,
    };
  }

  async createPurchaseOrder(data: {
    supplierId: string;
    supplierName?: string;
    items: PurchaseOrderItemInput[];
    currency?: string;
    warehouseId?: string | null;
    expectedDate?: string;
    notes?: string;
    totalAmount?: number;
  }): Promise<PurchaseOrderEntity> {
    return await this.dataSource.transaction(async (manager) => {
      let poNumber = '';
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        poNumber = `PO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await manager.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, poNumber } });
        if (!existing) break;
        attempts++;
      }
      if (attempts === maxAttempts) {
        throw new BadRequestException(err('PO_NUMBER_GENERATION_FAILED'));
      }

      if (!data.supplierId) {
        throw new BadRequestException(err('PO_SUPPLIER_REQUIRED'));
      }
      const supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: data.supplierId, isDeleted: false } });
      if (!supplier) {
        throw new BadRequestException(err('PO_SUPPLIER_NOT_FOUND', { id: data.supplierId }));
      }
      if (data.warehouseId) {
        await this.warehouseStock.requireWarehouse(manager, this.companyId, data.warehouseId);
      }

      const company = await this.finance.getCompany(manager);
      const currency = (data.currency || company.baseCurrency).toUpperCase();
      const built = await this.buildItems(manager, data.items, currency, new Date());

      const newPo = manager.create(PurchaseOrderEntity, {
        companyId: this.companyId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        warehouseId: data.warehouseId || null,
        expectedDate: data.expectedDate,
        notes: data.notes,
        poNumber,
        status: PurchaseOrderStatus.DRAFT,
        currency,
        exchangeRate: built.exchangeRate,
        subtotal: built.subtotal,
        taxTotal: built.taxTotal,
        grandTotal: built.grandTotal,
        totalAmount: built.grandTotal,
        items: built.items,
      });

      const saved = await manager.save(PurchaseOrderEntity, newPo);
      this.appGateway.emitToCompany(this.companyId, 'purchase_order_mutated', { type: 'create', purchaseOrder: saved });
      return saved;
    });
  }

  async updatePurchaseOrderStatus(
    id: string,
    status: PurchaseOrderStatus | string,
    performedBy = 'System',
    warehouseId?: string | null,
    receipts: PoReceiptInput[] = [],
    meta: PoReceiptMeta = {},
  ): Promise<PurchaseOrderEntity | null> {
    const productsToEmit: ProductEntity[] = [];
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const po = await manager.findOne(PurchaseOrderEntity, {
        where: { companyId: this.companyId, id },
        relations: { items: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!po) return null;

      const oldStatus = po.status;
      if (oldStatus === status) return po;

      if (oldStatus === PurchaseOrderStatus.RECEIVED) {
        throw new BadRequestException(err('PO_RECEIVED_IMMUTABLE'));
      }
      if (oldStatus === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException(err('PO_CANCELLED_IMMUTABLE'));
      }

      if (status === PurchaseOrderStatus.RECEIVED) {
        const targetWarehouse = warehouseId || po.warehouseId || null;
        const company = await manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
        const supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: po.supplierId } });
        const receivedAt = parseZonedDateTime(meta.transactionDate, company.timezone) || new Date();
        const docNo = meta.documentNo || po.poNumber;
        for (const r of receipts || []) {
          if (!po.items.some((i) => i.id === r.itemId)) throw new BadRequestException(err('PO_RECEIPT_ITEM_NOT_FOUND', { id: r.itemId }));
        }
        for (const item of po.items) {
          if (!item.productId) continue;
          const prod = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: item.productId }, lock: { mode: 'pessimistic_write' } });
          if (!prod) continue;
          const oldQty = prod.quantity;
          const receipt = (receipts || []).find((r) => r.itemId === item.id);
          const allocations = await this.warehouseStock.receive(manager, prod, item.quantity, targetWarehouse, {
            lots: receipt?.lots,
            serials: receipt?.serials,
          });
          if (isTracked(prod)) item.tracking = this.warehouseStock.toTracking(allocations);
          await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
            type: StockMovementType.IN,
            reasonCode: 'PURCHASE',
            transactionDate: receivedAt,
            documentType: meta.documentNo ? meta.documentType || 'DESPATCH' : 'PURCHASE_ORDER',
            documentNo: docNo,
            documentDate: meta.documentDate || dateKeyInZone(receivedAt, company.timezone),
            counterpartyTaxId: partyTaxId(supplier?.identityNumber),
            referenceId: po.poNumber,
            referenceType: 'purchase_order',
            note: `Satın alma siparişi teslim alındı: ${po.poNumber}`,
            performedBy,
          });
          productsToEmit.push(prod);
        }
        if (targetWarehouse) po.warehouseId = targetWarehouse;
      }

      po.status = status;
      const out = await manager.save(PurchaseOrderEntity, po);
      for (const item of po.items) {
        if (item.tracking) await manager.update(PurchaseOrderItemEntity, { id: item.id }, { tracking: item.tracking });
      }
      return out;
    });

    if (saved) {
      for (const p of productsToEmit) {
        this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
      }
      this.appGateway.emitToCompany(this.companyId, 'purchase_order_mutated', { type: 'update', purchaseOrder: saved });
    }
    return saved;
  }

  async updatePurchaseOrder(id: string, updates: any): Promise<PurchaseOrderEntity | null> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const po = await manager.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, id }, relations: { items: true } });
      if (!po) return null;
      if (po.status !== PurchaseOrderStatus.DRAFT) {
        throw new BadRequestException(err('PO_UPDATE_ONLY_DRAFT'));
      }

      if (updates.supplierId && updates.supplierId !== po.supplierId) {
        const supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: updates.supplierId, isDeleted: false } });
        if (!supplier) {
          throw new BadRequestException(err('PO_SUPPLIER_NOT_FOUND', { id: updates.supplierId }));
        }
        po.supplierId = updates.supplierId;
        po.supplierName = supplier.name;
      }
      if (updates.warehouseId !== undefined) {
        if (updates.warehouseId) await this.warehouseStock.requireWarehouse(manager, this.companyId, updates.warehouseId);
        po.warehouseId = updates.warehouseId || null;
      }

      const currencyChanged = !!updates.currency && updates.currency !== po.currency;
      if (currencyChanged) po.currency = updates.currency;

      if (updates.items || currencyChanged) {
        const source: PurchaseOrderItemInput[] =
          updates.items ||
          po.items.map((i) => ({ productId: i.productId, quantity: i.unitId && i.unitFactor !== 1 ? Number(i.unitQuantity) : i.quantity, unitId: i.unitId })); // re-price in the new currency
        const built = await this.buildItems(manager, source, po.currency, new Date());
        // Only draft lines are replaced; received lines are never deleted (DB trigger enforces it too).
        if (po.items.some((i) => i.tracking && i.tracking.length)) throw new BadRequestException(err('RECEIVED_LINE_UNDELETABLE'));
        await manager.delete(PurchaseOrderItemEntity, { purchaseOrderId: po.id });
        po.items = built.items;
        po.exchangeRate = built.exchangeRate;
        po.subtotal = built.subtotal;
        po.taxTotal = built.taxTotal;
        po.grandTotal = built.grandTotal;
        po.totalAmount = built.grandTotal;
      }

      if (updates.notes !== undefined) {
        po.notes = updates.notes;
      }

      return manager.save(PurchaseOrderEntity, po);
    });
    if (saved) {
      this.appGateway.emitToCompany(this.companyId, 'purchase_order_mutated', { type: 'update', purchaseOrder: saved });
    }
    return saved;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    const po = await this.poRepo.findOne({ where: { companyId: this.companyId, id } });
    if (!po) return false;
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(err('PO_DELETE_ONLY_DRAFT'));
    }
    await this.poRepo.remove(po);
    this.appGateway.emitToCompany(this.companyId, 'purchase_order_mutated', { type: 'delete', purchaseOrderId: id });
    return true;
  }

  async autoDraftPurchaseOrders(): Promise<any[]> {
    const products = await this.productRepo.find({ where: { companyId: this.companyId, isDeleted: false } });
    const lowStockProducts = products.filter((p) => p.quantity < p.minQuantity && p.quantity >= 0 && p.supplierId);

    if (lowStockProducts.length === 0) {
      return [];
    }

    const supplierGroups: Record<string, { supplierId: string; supplierName: string; items: PurchaseOrderItemInput[] }> = {};
    const suppliers = await this.supplierRepo.find({ where: { companyId: this.companyId } });

    for (const p of lowStockProducts) {
      const sup = suppliers.find((s) => s.id === p.supplierId);
      if (!sup) continue;
      if (!supplierGroups[sup.id]) {
        supplierGroups[sup.id] = { supplierId: sup.id, supplierName: sup.name, items: [] };
      }
      const reorderQty = Math.max(p.minQuantity * 2 - p.quantity, p.minQuantity);
      supplierGroups[sup.id].items.push({ productId: p.id, productName: p.name, quantity: reorderQty });
    }

    const createdPOs: PurchaseOrderEntity[] = [];
    const now = new Date();

    for (const group of Object.values(supplierGroups)) {
      const saved = await this.dataSource.transaction(async (manager) => {
        const poNumber = `PO-AUTO-${now.getTime().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const company = await this.finance.getCompany(manager);
        const built = await this.buildItems(manager, group.items, company.baseCurrency, now);
        return manager.save(
          PurchaseOrderEntity,
          manager.create(PurchaseOrderEntity, {
            companyId: this.companyId,
            poNumber,
            supplierId: group.supplierId,
            supplierName: group.supplierName,
            status: PurchaseOrderStatus.DRAFT,
            currency: company.baseCurrency,
            exchangeRate: built.exchangeRate,
            items: built.items,
            subtotal: built.subtotal,
            taxTotal: built.taxTotal,
            grandTotal: built.grandTotal,
            totalAmount: built.grandTotal,
            notes: 'Otomatik sipariş taslağı. Stok kritik seviyenin altındaki ürünler için oluşturuldu.',
          })
        );
      });
      createdPOs.push(saved);
    }

    return createdPOs;
  }
}
