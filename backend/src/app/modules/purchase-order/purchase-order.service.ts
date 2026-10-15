import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { DocPricingResult, FinanceService, storedLineEntry } from '../../shared/services/finance.service';
import { OrderChargeEntity } from '../../entities/order-charge.entity';
import { TaxEngineCharge, round2 } from '../../shared/finance/tax';
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
  discountRate?: number | null;
  discountAmount?: number | null;
  exemptionCode?: string | null;
  withholdingCode?: string | null;
  /** Service from a foreign supplier: VAT declared on KDV-2 */
  reverseCharge?: boolean;
}

/** Discounts, charges, tax point and customs fields of a purchase order. */
export interface PurchaseOrderTaxInput {
  documentDiscountAmount?: number | null;
  charges?: TaxEngineCharge[];
  taxPointDate?: string | null;
  customsDeclarationNo?: string | null;
  customsDeclarationDate?: string | null;
  importVatAmount?: number | null;
  nonDeductibleImportVat?: number | null;
}

type Built = {
  items: PurchaseOrderItemEntity[];
  charges: OrderChargeEntity[];
  pricing: DocPricingResult;
};

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
      relations: { items: true, charges: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderEntity | null> {
    return this.poRepo.findOne({
      where: { companyId: this.companyId, id },
      relations: { items: true, charges: true },
    });
  }

  /** Validates products and prices PO lines in `currency` through the tax engine. */
  private async buildItems(
    manager: EntityManager,
    items: PurchaseOrderItemInput[],
    currency: string,
    taxPointDate: string,
    supplier: SupplierEntity | null,
    tax: PurchaseOrderTaxInput = {},
    freeze = false,
  ): Promise<Built> {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestException(err('PO_ITEMS_REQUIRED'));
    }
    const priced: { item: PurchaseOrderItemInput; product: ProductEntity; quantity: number; factor: number; unitId: string | null; unitCode: string; baseQty: number }[] = [];
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
      priced.push({ item, product, quantity: qty, factor: lu.factor, unitId: lu.unitId, unitCode: lu.unitCode, baseQty });
    }
    const pricing = await this.finance.priceDocumentFor(
      {
        kind: 'PURCHASE',
        lines: priced.map((p) => ({
          product: p.product,
          quantity: p.quantity,
          unitPrice: p.item.unitPrice ?? p.item.price,
          factor: p.factor,
          discountRate: p.item.discountRate,
          discountAmount: p.item.discountAmount,
          exemptionCode: p.item.exemptionCode,
          withholdingCode: p.item.withholdingCode,
          reverseCharge: p.item.reverseCharge,
        })),
        charges: tax.charges || [],
        documentDiscountAmount: tax.documentDiscountAmount ?? 0,
        currency,
        taxPointDate,
        supplier,
        freeze,
      },
      manager,
    );
    const items2 = priced.map((p, i) => {
      const l = pricing.doc.lines[i];
      const m = pricing.lineMeta[i];
      return manager.create(PurchaseOrderItemEntity, {
        productId: p.product.id,
        productName: p.product.name,
        quantity: p.baseQty,
        unitId: p.unitId,
        unitCode: p.unitCode,
        unitFactor: p.factor,
        unitQuantity: p.quantity,
        price: l.unitPrice,
        unitPrice: l.unitPrice,
        enteredUnitPrice: m.enteredUnitPrice,
        grossAmount: l.grossAmount,
        discountRate: l.discountRate,
        discountAmount: l.discountAmount,
        discountAmountEntered: m.discountAmountEntered,
        documentDiscountShare: l.documentDiscountShare,
        netAmount: l.netAmount,
        taxRateId: m.taxRateId,
        taxCode: m.taxCode,
        taxRate: l.taxRate,
        taxAmount: l.taxAmount,
        exemptionCode: l.exemptionCode,
        vatNotCollected: l.vatNotCollected,
        withholdingCode: l.withholdingCode,
        withholdingCodeEntered: m.withholdingCodeEntered,
        withholdingRate: l.withholdingRate || null,
        withheldTaxAmount: l.withheldTaxAmount,
        otvCode: m.otvCode,
        otvRate: l.otvRate || null,
        otvAmount: l.otvAmount,
        deductibleVat: m.deductibleVat,
        reverseCharge: m.reverseCharge,
        lineTotal: l.lineTotal,
      });
    });
    const entered = (tax.charges || []).filter((c) => Number(c.amount) > 0);
    const charges = pricing.doc.charges.map((c, i) =>
      manager.create(OrderChargeEntity, {
        companyId: this.companyId,
        type: c.type,
        description: c.description,
        enteredAmount: round2(Number(entered[i]?.amount || 0)),
        amount: c.amount,
        taxAmount: c.taxAmount,
        withheldTaxAmount: c.withheldTaxAmount,
        lineTotal: c.lineTotal,
        allocations: c.allocations,
      }),
    );
    return { items: items2, charges, pricing };
  }

  /** Item inputs that re-create the stored lines as entered (price, unit, discount, codes). */
  private storedItems(po: PurchaseOrderEntity, pricesIncludeTax: boolean, keepPrice = true): PurchaseOrderItemInput[] {
    return (po.items || []).map((i) => {
      const e = storedLineEntry(i, pricesIncludeTax);
      return {
        productId: i.productId as string,
        productName: i.productName,
        quantity: e.quantity,
        unitId: i.unitId,
        // keep the entered price unless the currency changes (then: product price in the new currency)
        unitPrice: keepPrice ? e.unitPrice ?? undefined : undefined,
        discountRate: e.discountRate,
        discountAmount: e.discountAmount,
        exemptionCode: e.exemptionCode,
        withholdingCode: e.withholdingCode,
        reverseCharge: e.reverseCharge,
      };
    });
  }

  private storedTax(po: PurchaseOrderEntity): PurchaseOrderTaxInput {
    return {
      charges: (po.charges || []).map((c) => ({ type: c.type, amount: Number(c.enteredAmount) || Number(c.lineTotal) || 0, description: c.description })),
      documentDiscountAmount: po.documentDiscountEntered,
      taxPointDate: po.taxPointDate,
    };
  }

  /** Copies the pricing result onto the document. */
  private applyTotals(po: PurchaseOrderEntity, b: Built, tax: PurchaseOrderTaxInput) {
    const pr = b.pricing;
    po.items = b.items;
    po.charges = b.charges;
    Object.assign(po, {
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
      documentDiscountEntered: round2(Number(tax.documentDiscountAmount || 0)),
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
      isImport: pr.isImport,
    });
  }

  /** Customs declaration data of an import (may be added after receipt; not part of the frozen tax data). */
  private applyCustoms(po: PurchaseOrderEntity, tax: PurchaseOrderTaxInput) {
    if (tax.customsDeclarationNo !== undefined) po.customsDeclarationNo = tax.customsDeclarationNo || null;
    if (tax.customsDeclarationDate !== undefined) po.customsDeclarationDate = tax.customsDeclarationDate || null;
    if (tax.importVatAmount !== undefined) po.importVatAmount = tax.importVatAmount ?? null;
    if (tax.nonDeductibleImportVat !== undefined) po.nonDeductibleImportVat = tax.nonDeductibleImportVat ?? null;
  }

  /** Prices a purchase order without saving it (form preview). */
  async quote(data: { supplierId: string; currency?: string; items: PurchaseOrderItemInput[] } & PurchaseOrderTaxInput): Promise<DocPricingResult> {
    const manager = this.dataSource.manager;
    const supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: data.supplierId, isDeleted: false } });
    if (!supplier) throw new BadRequestException(err('PO_SUPPLIER_NOT_FOUND', { id: data.supplierId }));
    const company = await this.finance.getCompany(manager);
    const currency = (data.currency || company.baseCurrency).toUpperCase();
    const built = await this.buildItems(manager, data.items, currency, data.taxPointDate || dateKeyInZone(new Date(), company.timezone), supplier, data);
    return built.pricing;
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
  } & PurchaseOrderTaxInput): Promise<PurchaseOrderEntity> {
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
      const taxPoint = data.taxPointDate || dateKeyInZone(new Date(), company.timezone);
      const built = await this.buildItems(manager, data.items, currency, taxPoint, supplier, data);

      const newPo = manager.create(PurchaseOrderEntity, {
        companyId: this.companyId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        warehouseId: data.warehouseId || null,
        expectedDate: data.expectedDate,
        notes: data.notes,
        poNumber,
        status: PurchaseOrderStatus.DRAFT,
        taxPointExplicit: !!data.taxPointDate,
      });
      this.applyTotals(newPo, built, data);
      this.applyCustoms(newPo, data);

      const saved = (await manager.save(PurchaseOrderEntity, newPo)) as PurchaseOrderEntity & { warnings?: unknown[] };
      if (built.pricing.warnings.length) saved.warnings = built.pricing.warnings;
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
    let receivedOn: Date | null = null;
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const po = await manager.findOne(PurchaseOrderEntity, {
        where: { companyId: this.companyId, id },
        relations: { items: true, charges: true },
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
        if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
        receivedOn = receivedAt;
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
        // Receipt = tax point of the purchase (supplier document date when given, else an explicit
        // tax point, else the receipt day). The PO is re-priced at it (rate version, withholding
        // threshold, TCMB rate; lines updated in place) and the tax data is frozen.
        po.taxPointDate = meta.documentDate || (po.taxPointExplicit && po.taxPointDate ? po.taxPointDate : dateKeyInZone(receivedAt, company.timezone));
        const rebuilt = await this.buildItems(manager, this.storedItems(po, company.pricesIncludeTax), po.currency, po.taxPointDate, supplier, this.storedTax(po), true);
        po.items.forEach((item, i) => {
          const { productId: _p, productName: _n, quantity: _q, unitId: _u, unitCode: _c, unitFactor: _f, unitQuantity: _uq, ...fields } = rebuilt.items[i];
          Object.assign(item, fields);
        });
        rebuilt.pricing.doc.charges.forEach((c, i) => {
          const row = (po.charges || [])[i];
          if (row) Object.assign(row, { amount: c.amount, taxAmount: c.taxAmount, withheldTaxAmount: c.withheldTaxAmount, lineTotal: c.lineTotal, allocations: c.allocations });
        });
        const keep = { items: po.items, charges: po.charges };
        this.applyTotals(po, rebuilt, this.storedTax(po));
        Object.assign(po, keep);
        po.taxFrozenAt = new Date();
      }

      po.status = status;
      const out = await manager.save(PurchaseOrderEntity, po);
      for (const item of po.items) {
        if (item.tracking) await manager.update(PurchaseOrderItemEntity, { id: item.id }, { tracking: item.tracking });
      }
      if (receivedOn) {
        // VUK 219: a receipt booked more than VUK219_RECORD_DAYS after the goods arrived gets a warning.
        const limit = Number(await this.finance.param<number>('VUK219_RECORD_DAYS', undefined, manager).catch(() => 10)) || 10;
        (out as PurchaseOrderEntity & { warnings?: unknown[] }).warnings = await this.warehouseStock.lateEntryWarnings(manager, this.companyId, [{ transactionDate: receivedOn }], limit);
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
      const po = await manager.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, id }, relations: { items: true, charges: true } });
      if (!po) return null;
      const pricingKeys = ['supplierId', 'currency', 'items', 'charges', 'documentDiscountAmount', 'taxPointDate', 'warehouseId'];
      const touchesPricing = pricingKeys.some((k) => updates[k] !== undefined);
      if (po.status !== PurchaseOrderStatus.DRAFT) {
        // Customs declaration / notes may follow the receipt; the priced tax data may not.
        if (po.status === PurchaseOrderStatus.CANCELLED) throw new BadRequestException(err('PO_UPDATE_ONLY_DRAFT'));
        if (touchesPricing) {
          if (po.taxFrozenAt) throw new ConflictException(err('DOCUMENT_TAX_FROZEN', { number: po.poNumber }));
          throw new BadRequestException(err('PO_UPDATE_ONLY_DRAFT'));
        }
        this.applyCustoms(po, updates);
        if (updates.notes !== undefined) po.notes = updates.notes;
        return manager.save(PurchaseOrderEntity, po);
      }

      let supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: po.supplierId } });
      if (updates.supplierId && updates.supplierId !== po.supplierId) {
        supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: updates.supplierId, isDeleted: false } });
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

      const repriceKeys = ['supplierId', 'items', 'charges', 'documentDiscountAmount', 'taxPointDate'];
      if (currencyChanged || repriceKeys.some((k) => updates[k] !== undefined)) {
        const company = await this.finance.getCompany(manager);
        const source: PurchaseOrderItemInput[] = updates.items || this.storedItems(po, company.pricesIncludeTax, !currencyChanged);
        const stored = this.storedTax(po);
        const tax: PurchaseOrderTaxInput = {
          charges: updates.charges ?? stored.charges,
          documentDiscountAmount: updates.documentDiscountAmount ?? stored.documentDiscountAmount,
          taxPointDate: updates.taxPointDate ?? po.taxPointDate,
        };
        // A tax point the user typed in (not the one derived at creation) follows the document to receipt.
        if (updates.taxPointDate && updates.taxPointDate !== po.taxPointDate) po.taxPointExplicit = true;
        const built = await this.buildItems(manager, source, po.currency, tax.taxPointDate || dateKeyInZone(new Date(), company.timezone), supplier, tax);
        // Only draft lines are replaced; received lines are never deleted (DB trigger enforces it too).
        if (po.items.some((i) => i.tracking && i.tracking.length)) throw new BadRequestException(err('RECEIVED_LINE_UNDELETABLE'));
        // remove() (not delete()) so the entity subscribers audit the removed lines and charges.
        if (po.items?.length) await manager.remove(PurchaseOrderItemEntity, po.items);
        if (po.charges?.length) await manager.remove(OrderChargeEntity, po.charges);
        this.applyTotals(po, built, tax);
      }
      this.applyCustoms(po, updates);

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
        const supplier = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: group.supplierId } });
        const built = await this.buildItems(manager, group.items, company.baseCurrency, dateKeyInZone(now, company.timezone), supplier);
        const po = manager.create(PurchaseOrderEntity, {
          companyId: this.companyId,
          poNumber,
          supplierId: group.supplierId,
          supplierName: group.supplierName,
          status: PurchaseOrderStatus.DRAFT,
          notes: 'Otomatik sipariş taslağı. Stok kritik seviyenin altındaki ürünler için oluşturuldu.',
        });
        this.applyTotals(po, built, {});
        return manager.save(PurchaseOrderEntity, po);
      });
      createdPOs.push(saved);
    }

    return createdPOs;
  }
}
