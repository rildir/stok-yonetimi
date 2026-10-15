import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { WarehouseStockService, isTracked } from '../../shared/services/warehouse-stock.service';
import { GoodsReceiptEntity, GoodsReceiptItemEntity } from '../../entities/goods-receipt.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { PurchaseOrderStatus, StockMovementType } from '../../entities/enums';
import { round2 } from '../../shared/finance/tax';
import { addQty, dateKeyInZone, isDateKey, parseZonedDateTime, receiptSplit, roundQty } from '../../shared/tr';
import { splitAllocations } from '../../shared/documents/document-math';
import { DocumentNumberService } from './document-number.service';
import { DespatchService } from './despatch.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { companySnapshot, DocumentHooks, supplierSnapshot, warehouseAddress } from './document-support';
import { FinanceService } from '../../shared/services/finance.service';

export interface GoodsReceiptLineInput {
  purchaseOrderItemId: string;
  /** Quantity on the supplier's despatch advice (default: counted) */
  despatchQuantity?: number | null;
  countedQuantity: number;
  rejectedQuantity?: number | null;
  rejectReason?: string | null;
  lots?: { lotNumber: string; expiryDate?: string | null; quantity: number }[] | null;
  serials?: string[] | null;
}

export interface GoodsReceiptInput {
  warehouseId?: string | null;
  receivedAt?: string | null;
  supplierDespatchNo?: string | null;
  supplierDespatchDate?: string | null;
  supplierDespatchEttn?: string | null;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: string | null;
  supplierInvoiceEttn?: string | null;
  supplierInvoiceAmount?: number | null;
  buyerCarries?: boolean;
  note?: string | null;
  lines: GoodsReceiptLineInput[];
  /** Complete (book stock) right away */
  complete?: boolean;
}

const OPEN_PO = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] as string[];

/**
 * Mal kabul (R11, R28): partial receipts against purchase order lines. Only the accepted quantity
 * (counted - rejected) enters stock: up to the supplier's despatch quantity as PURCHASE, above it
 * as TESELLUM_SURPLUS (397); a shortage (197) is recorded on the receipt. Supplier documents are
 * kept for the three-way match and the "receipts without invoice" report.
 */
@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly warehouseStock: WarehouseStockService,
    private readonly numbers: DocumentNumberService,
    private readonly despatches: DespatchService,
    private readonly vouchers: ExpenseVoucherService,
    private readonly finance: FinanceService,
    private readonly hooks: DocumentHooks,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async list(filter: { purchaseOrderId?: string; status?: string } = {}): Promise<(GoodsReceiptEntity & { matchStatus?: string })[]> {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (filter.purchaseOrderId) where['purchaseOrderId'] = filter.purchaseOrderId;
    if (filter.status) where['status'] = filter.status;
    const rows = await this.dataSource.manager.find(GoodsReceiptEntity, { where, relations: { items: true }, order: { createdAt: 'DESC' } });
    return rows.map((r) => this.withMatch(r));
  }

  async get(id: string, manager: EntityManager = this.dataSource.manager): Promise<GoodsReceiptEntity & { matchStatus?: string }> {
    const r = await manager.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, id }, relations: { items: true } });
    if (!r) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    return this.withMatch(r);
  }

  /** Three-way match: PO price x accepted quantity vs the supplier invoice amount (net, 1 unit tolerance). */
  private withMatch(r: GoodsReceiptEntity): GoodsReceiptEntity & { matchStatus?: string } {
    let matchStatus = 'NO_INVOICE';
    if (r.supplierInvoiceNo) {
      if (r.supplierInvoiceAmount === null || r.supplierInvoiceAmount === undefined) matchStatus = 'INVOICE_NO_AMOUNT';
      else matchStatus = Math.abs(Number(r.supplierInvoiceAmount) - Number(r.acceptedNetAmount)) <= 1 ? 'MATCHED' : 'AMOUNT_MISMATCH';
    }
    return Object.assign(r, { matchStatus });
  }

  async create(purchaseOrderId: string, input: GoodsReceiptInput, user?: string): Promise<GoodsReceiptEntity> {
    const touched: ProductEntity[] = [];
    const saved = await this.dataSource.transaction(async (m) => {
      const draft = await this.createTx(m, purchaseOrderId, input, user);
      return input.complete ? this.completeTx(m, draft.id, user, touched) : draft;
    });
    this.after(saved, touched);
    return saved;
  }

  private async createTx(m: EntityManager, purchaseOrderId: string, input: GoodsReceiptInput, user?: string): Promise<GoodsReceiptEntity> {
    const po = await m.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, id: purchaseOrderId }, relations: { items: true }, lock: { mode: 'pessimistic_write' } });
    if (!po) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    if (!OPEN_PO.includes(po.status)) throw new BadRequestException(err('GOODS_RECEIPT_PO_NOT_OPEN', { number: po.poNumber, status: po.status }));
    if (!input.lines?.length) throw new BadRequestException(err('GOODS_RECEIPT_LINES_REQUIRED'));
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const supplier = po.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: po.supplierId } }) : null;
    const warehouseId = input.warehouseId || po.warehouseId || (await this.warehouseStock.defaultWarehouse(m, this.companyId)).id;
    await this.warehouseStock.requireWarehouse(m, this.companyId, warehouseId);
    const receivedAt = parseZonedDateTime(input.receivedAt, company.timezone) || new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
    for (const k of ['supplierDespatchDate', 'supplierInvoiceDate'] as const) {
      if (input[k] && !isDateKey(input[k])) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    }
    const items: Partial<GoodsReceiptItemEntity>[] = [];
    let acceptedNet = 0;
    let discrepancy = false;
    for (const l of input.lines) {
      const poItem = po.items.find((i) => i.id === l.purchaseOrderItemId);
      if (!poItem) throw new BadRequestException(err('PO_RECEIPT_ITEM_NOT_FOUND', { id: l.purchaseOrderItemId }));
      const counted = roundQty(Number(l.countedQuantity) || 0);
      const rejected = roundQty(Number(l.rejectedQuantity) || 0);
      const despatchQty = l.despatchQuantity === null || l.despatchQuantity === undefined ? counted : roundQty(Number(l.despatchQuantity));
      if (counted < 0 || rejected < 0 || despatchQty < 0 || rejected > counted) throw new BadRequestException(err('GOODS_RECEIPT_QTY_INVALID', { name: poItem.productName }));
      if (counted === 0 && despatchQty === 0) continue;
      const split = receiptSplit(despatchQty, counted, rejected);
      if (split.surplus || split.shortage || rejected) discrepancy = true;
      const product = poItem.productId ? await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: poItem.productId } }) : null;
      const unit = product?.baseUnitId ? await m.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: this.companyId } }) : null;
      // Net price per base unit (line net / base quantity: discounts included)
      const unitPrice = poItem.quantity ? Math.round((Number(poItem.netAmount) / Number(poItem.quantity)) * 1e6) / 1e6 : Number(poItem.unitPrice) || 0;
      acceptedNet += split.accepted * unitPrice;
      items.push({
        companyId: this.companyId,
        purchaseOrderItemId: poItem.id,
        productId: poItem.productId,
        productName: poItem.productName,
        productSku: product?.sku ?? null,
        unitCode: unit?.uneceCode || product?.unit || null,
        orderedQuantity: poItem.quantity,
        despatchQuantity: despatchQty,
        countedQuantity: counted,
        rejectedQuantity: rejected,
        rejectReason: rejected ? l.rejectReason || 'OTHER' : null,
        acceptedQuantity: split.accepted,
        surplusQuantity: split.surplus,
        shortageQuantity: split.shortage,
        unitPrice,
        lots: l.lots?.length ? l.lots : null,
        serials: l.serials?.length ? l.serials : null,
      });
    }
    if (!items.length) throw new BadRequestException(err('GOODS_RECEIPT_LINES_REQUIRED'));
    const year = dateKeyInZone(receivedAt, company.timezone);
    const code = await this.numbers.resolveSeries(m, 'GOODS_RECEIPT', 'INTERNAL');
    const no = await this.numbers.next(m, 'GOODS_RECEIPT', 'INTERNAL', code, year);
    const r = m.create(GoodsReceiptEntity, {
      companyId: this.companyId,
      receiptNo: no.documentNo,
      status: 'DRAFT',
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      supplierId: supplier?.id ?? null,
      supplierSnapshot: supplierSnapshot(supplier, po.supplierName),
      warehouseId,
      receivedAt,
      supplierDespatchNo: input.supplierDespatchNo || null,
      supplierDespatchDate: input.supplierDespatchDate || null,
      supplierDespatchEttn: input.supplierDespatchEttn || null,
      supplierInvoiceNo: input.supplierInvoiceNo || null,
      supplierInvoiceDate: input.supplierInvoiceDate || null,
      supplierInvoiceEttn: input.supplierInvoiceEttn || null,
      supplierInvoiceAmount: input.supplierInvoiceAmount ?? null,
      acceptedNetAmount: round2(acceptedNet),
      currency: po.currency,
      buyerCarries: !!input.buyerCarries,
      requiresExpenseVoucher: !!supplier && supplier.isTaxpayer === false,
      hasDiscrepancy: discrepancy,
      note: input.note || null,
      createdBy: user || this.tenant.actor.username || null,
      items: items.map((i) => m.create(GoodsReceiptItemEntity, i)),
    });
    return m.save(GoodsReceiptEntity, r);
  }

  async complete(id: string, user?: string): Promise<GoodsReceiptEntity> {
    const touched: ProductEntity[] = [];
    const saved = await this.dataSource.transaction((m) => this.completeTx(m, id, user, touched));
    this.after(saved, touched);
    return saved;
  }

  private async completeTx(m: EntityManager, id: string, user: string | undefined, touched: ProductEntity[]): Promise<GoodsReceiptEntity> {
    await this.warehouseStock.begin(m, this.companyId);
    const r = await m.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, id }, relations: { items: true }, lock: { mode: 'pessimistic_write' } });
    if (!r) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    if (r.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
    const po = await m.findOneOrFail(PurchaseOrderEntity, { where: { companyId: this.companyId, id: r.purchaseOrderId }, relations: { items: true, charges: true }, lock: { mode: 'pessimistic_write' } });
    if (!OPEN_PO.includes(po.status)) throw new BadRequestException(err('GOODS_RECEIPT_PO_NOT_OPEN', { number: po.poNumber, status: po.status }));
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const supplier = r.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: r.supplierId } }) : null;
    const now = new Date();
    const txDate = new Date(Math.min(new Date(r.receivedAt).getTime(), now.getTime()));
    const docNo = r.supplierDespatchNo || r.supplierInvoiceNo || r.receiptNo;
    const docType = r.supplierDespatchNo ? 'DESPATCH' : r.supplierInvoiceNo ? 'INVOICE' : 'GOODS_RECEIPT';
    const docDate = r.supplierDespatchDate || r.supplierInvoiceDate || dateKeyInZone(new Date(r.receivedAt), company.timezone);
    for (const item of r.items) {
      if (!(item.acceptedQuantity > 0) || !item.productId) continue;
      const product = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: item.productId }, lock: { mode: 'pessimistic_write' } });
      if (!product) continue;
      const old = product.quantity;
      const allocations = await this.warehouseStock.receive(m, product, item.acceptedQuantity, r.warehouseId, { lots: item.lots || undefined, serials: item.serials || undefined });
      const split = receiptSplit(item.despatchQuantity, item.countedQuantity, item.rejectedQuantity);
      const [regular, surplus] = splitAllocations(allocations, split.againstDocument);
      const base = {
        type: StockMovementType.IN,
        transactionDate: txDate,
        documentType: docType,
        documentNo: docNo,
        documentDate: docDate,
        counterpartyTaxId: supplier?.identityNumber && /^\d{10,11}$/.test(supplier.identityNumber) ? supplier.identityNumber : null,
        referenceId: po.poNumber,
        referenceType: 'purchase_order',
        performedBy: user,
      };
      const rows = await this.warehouseStock.recordMovements(m, product, old, regular, { ...base, reasonCode: 'PURCHASE', note: `Mal kabul ${r.receiptNo} (${po.poNumber})` });
      if (surplus.length) {
        await this.warehouseStock.recordMovements(m, product, addQty(old, split.againstDocument), surplus, { ...base, reasonCode: 'TESELLUM_SURPLUS', note: `Tesellüm fazlası (397) ${r.receiptNo}` });
      }
      item.tracking = this.warehouseStock.toTracking(allocations);
      await m.update(GoodsReceiptItemEntity, { id: item.id }, { tracking: item.tracking });
      const poItem = po.items.find((i) => i.id === item.purchaseOrderItemId);
      if (poItem) {
        poItem.receivedQuantity = addQty(poItem.receivedQuantity || 0, item.acceptedQuantity);
        const patch: Partial<PurchaseOrderItemEntity> = { receivedQuantity: poItem.receivedQuantity };
        if (isTracked(product)) patch.tracking = [...(poItem.tracking || []), ...(item.tracking || [])];
        await m.update(PurchaseOrderItemEntity, { id: poItem.id }, patch);
      }
      touched.push(product);
      void rows;
    }
    const { items: _i, ...header } = r;
    await m.save(GoodsReceiptEntity, Object.assign(new GoodsReceiptEntity(), header, { status: 'COMPLETED', completedAt: now, completedBy: user || this.tenant.actor.username || null }));

    // Purchase order: first receipt freezes the tax data (tax point = supplier document / receipt).
    const fresh = await m.findOneOrFail(PurchaseOrderEntity, { where: { companyId: this.companyId, id: po.id }, relations: { items: true, charges: true } });
    if (!fresh.taxFrozenAt && this.hooks.purchaseReceived) {
      await this.hooks.purchaseReceived(m, fresh, new Date(r.receivedAt), r.supplierDespatchDate || r.supplierInvoiceDate || null);
    }
    const all = fresh.items.every((i) => roundQty(i.receivedQuantity || 0) >= roundQty(i.quantity));
    const any = fresh.items.some((i) => (i.receivedQuantity || 0) > 0);
    const status = all ? PurchaseOrderStatus.RECEIVED : any ? PurchaseOrderStatus.PARTIALLY_RECEIVED : fresh.status;
    if (status !== fresh.status || fresh.warehouseId !== r.warehouseId) {
      await m.save(PurchaseOrderEntity, Object.assign(await m.findOneOrFail(PurchaseOrderEntity, { where: { id: po.id } }), { status, warehouseId: r.warehouseId }));
    }
    // Supplier is not a taxpayer: an expense voucher (gider pusulası / müstahsil makbuzu) must follow (VUK 234-235).
    if (r.requiresExpenseVoucher && !r.expenseVoucherId) {
      const voucher = await this.vouchers.createForReceiptTx(m, await this.get(r.id, m), supplier, user);
      await m.update(GoodsReceiptEntity, { id: r.id }, { expenseVoucherId: voucher.id });
    }
    const out = await this.get(r.id, m);
    const warnings = await this.lateWarnings(m, new Date(r.receivedAt));
    return warnings.length ? Object.assign(out, { warnings }) : out;
  }

  /** Supplier invoice arrived after the receipt (three-way match). */
  async setSupplierInvoice(id: string, input: { supplierInvoiceNo?: string | null; supplierInvoiceDate?: string | null; supplierInvoiceEttn?: string | null; supplierInvoiceAmount?: number | null }): Promise<GoodsReceiptEntity> {
    const r = await this.get(id);
    if (input.supplierInvoiceDate && !isDateKey(input.supplierInvoiceDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    await this.dataSource.manager.update(GoodsReceiptEntity, { id: r.id }, {
      supplierInvoiceNo: input.supplierInvoiceNo ?? r.supplierInvoiceNo ?? null,
      supplierInvoiceDate: input.supplierInvoiceDate ?? r.supplierInvoiceDate ?? null,
      supplierInvoiceEttn: input.supplierInvoiceEttn ?? r.supplierInvoiceEttn ?? null,
      supplierInvoiceAmount: input.supplierInvoiceAmount ?? r.supplierInvoiceAmount ?? null,
    });
    const saved = await this.get(id);
    this.gateway.emitToCompany(this.companyId, 'goods_receipt_mutated', { type: 'update', goodsReceipt: saved });
    return saved;
  }

  /** "Alıcı taşıyor": the company carries the goods and issues its own despatch advice (no stock effect). */
  async createOwnDespatch(id: string, input: { drivers?: any[]; plates?: any[]; actualDespatchAt?: string | null }, user?: string) {
    const out = await this.dataSource.transaction(async (m) => {
      const r = await this.get(id, m);
      if (r.ownDespatchId) throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: 'DESPATCHED' }));
      const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
      const wh = await m.findOne(WarehouseEntity, { where: { companyId: this.companyId, id: r.warehouseId } });
      const d = await this.despatches.createTx(
        m,
        {
          purpose: 'PURCHASE_PICKUP',
          supplierId: null,
          lines: r.items.filter((i) => i.productId && i.countedQuantity > 0).map((i) => ({ productId: i.productId as string, quantity: i.countedQuantity })),
          drivers: input.drivers,
          plates: input.plates,
          actualDespatchAt: input.actualDespatchAt || null,
          deliveryAddress: warehouseAddress(wh),
          note: `Mal kabul ${r.receiptNo} (${r.poNumber}) — alıcı taşıması`,
        },
        user,
        { goodsReceiptId: r.id, originAddress: r.supplierSnapshot?.address ?? null, buyerSnapshot: companySnapshot(company), targetWarehouseId: r.warehouseId, stockEffect: false },
      );
      await m.update(GoodsReceiptEntity, { id: r.id }, { ownDespatchId: d.id });
      return d;
    });
    this.gateway.emitToCompany(this.companyId, 'despatch_mutated', { type: 'create', despatch: out });
    return out;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const r = await this.get(id);
    if (r.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
    await this.dataSource.manager.remove(GoodsReceiptEntity, r);
    this.gateway.emitToCompany(this.companyId, 'goods_receipt_mutated', { type: 'delete', goodsReceiptId: id });
    return { success: true };
  }

  private after(saved: GoodsReceiptEntity, touched: ProductEntity[]) {
    this.gateway.emitToCompany(this.companyId, 'goods_receipt_mutated', { type: 'update', goodsReceipt: saved });
    this.gateway.emitToCompany(this.companyId, 'purchase_order_mutated', { type: 'update', purchaseOrderId: saved.purchaseOrderId });
    for (const p of touched) this.gateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
  }

  /** VUK 219: a receipt booked more than VUK219_RECORD_DAYS after the goods arrived gets a warning. */
  async lateWarnings(m: EntityManager, receivedAt: Date) {
    const limit = Number(await this.finance.param<number>('VUK219_RECORD_DAYS', undefined, m).catch(() => 10)) || 10;
    return this.warehouseStock.lateEntryWarnings(m, this.companyId, [{ transactionDate: receivedAt }], limit);
  }
}
