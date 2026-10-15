import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { ReturnEntity, ReturnItemEntity } from '../../entities/return.entity';
import { InvoiceEntity, InvoiceLineEntity } from '../../entities/invoice.entity';
import { GoodsReceiptEntity, GoodsReceiptItemEntity } from '../../entities/goods-receipt.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { DespatchLineEntity } from '../../entities/despatch.entity';
import { StockMovementType } from '../../entities/enums';
import { TrackingEntry, TrackingType } from '../../entities/tracking';
import { round2 } from '../../shared/finance/tax';
import { buildBreakdown } from '../../shared/documents/document-math';
import {
  addQty,
  dateKeyInZone,
  DOCUMENTED_REFUND_CHANNELS,
  isDateKey,
  parseZonedDateTime,
  REFUND_CHANNELS,
  RETURN_CONDITIONS,
  RETURN_TYPES,
  returnableQuantity,
  roundQty,
  todayKey,
  withdrawalDates,
} from '../../shared/tr';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { DocumentNumberService } from './document-number.service';
import { DespatchService } from './despatch.service';
import { InvoiceService } from './invoice.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { customerSnapshot, supplierSnapshot } from './document-support';

export interface ReturnLineInput {
  invoiceLineId?: string | null;
  goodsReceiptItemId?: string | null;
  /** Base-unit quantity */
  quantity: number;
  condition?: string | null;
  targetWarehouseId?: string | null;
  lots?: { lotNumber: string; expiryDate?: string | null; quantity: number }[] | null;
  serials?: string[] | null;
}

export interface ReturnInput {
  type: string;
  invoiceId?: string | null;
  goodsReceiptId?: string | null;
  lines: ReturnLineInput[];
  refundChannel?: string | null;
  refundRef?: string | null;
  counterpartyDocNo?: string | null;
  counterpartyDocDate?: string | null;
  counterpartyEttn?: string | null;
  notifiedAt?: string | null;
  /** Withdrawal: day the consumer handed the goods to the carrier named in the pre-contract information. */
  goodsHandedOverDate?: string | null;
  note?: string | null;
}

const SALES_TYPES = ['SALES_RETURN', 'WITHDRAWAL', 'DEFECT'];
const INVOICE_OK = ['ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'ACCEPTED'];

/**
 * Returns (KDVK 35; VUK 234/b; 6502 md. 48). Sales-side returns refer to an issued invoice line
 * (the original VAT rate / withholding are copied); purchase returns to a completed goods receipt
 * line. Quantities can never exceed what was sold / received minus earlier returns. Stock moves
 * only when the return is completed: RETURN movements that point at the original movement.
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly warehouseStock: WarehouseStockService,
    private readonly numbers: DocumentNumberService,
    private readonly despatches: DespatchService,
    private readonly invoices: InvoiceService,
    private readonly vouchers: ExpenseVoucherService,
    private readonly legalParams: LegalParameterService,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async list(filter: { type?: string; status?: string; invoiceId?: string; orderId?: string } = {}): Promise<ReturnEntity[]> {
    const where: Record<string, unknown> = { companyId: this.companyId };
    for (const k of ['type', 'status', 'invoiceId', 'orderId'] as const) if (filter[k]) where[k] = filter[k];
    return this.dataSource.manager.find(ReturnEntity, { where, relations: { items: true }, order: { createdAt: 'DESC' } });
  }

  async get(id: string, manager: EntityManager = this.dataSource.manager): Promise<ReturnEntity> {
    const r = await manager.findOne(ReturnEntity, { where: { companyId: this.companyId, id }, relations: { items: true } });
    if (!r) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    return r;
  }

  private async param<T>(key: string, country: string, day: string, fallback: T): Promise<T> {
    try {
      const v = await this.legalParams.param<T>(key, day, country || 'TR');
      return v === null || v === undefined || v === '' ? fallback : v;
    } catch {
      return fallback;
    }
  }

  /**
   * Withdrawal deadlines in the company time zone (legal parameters WITHDRAWAL_*, as valid on the
   * notification day). `goodsBackDay`: goods handed to the designated carrier / received back.
   */
  async withdrawalPlan(company: CompanyEntity, deliveryDay: string, notifiedAt: Date | null, goodsBackDay: string | null = null) {
    const country = company.country || 'TR';
    const notified = notifiedAt ? dateKeyInZone(notifiedAt, company.timezone) : null;
    const day = notified || todayKey(company.timezone);
    const p = {
      periodDays: Number(await this.param('WITHDRAWAL_PERIOD_DAYS', country, day, 14)) || 14,
      goodsReturnDays: Number(await this.param('WITHDRAWAL_GOODS_RETURN_DAYS', country, day, 14)) || 14,
      refundDays: Number(await this.param('WITHDRAWAL_REFUND_DAYS', country, day, 14)) || 14,
      refundBasis: String(await this.param('WITHDRAWAL_REFUND_BASIS', country, day, 'GOODS_RETURNED')),
    };
    return withdrawalDates(deliveryDay, notified, p, goodsBackDay);
  }

  /** Base quantities on other DRAFT returns per source line. */
  private async draftQty(m: EntityManager, field: 'invoiceLineId' | 'goodsReceiptItemId'): Promise<Map<string, number>> {
    const drafts = await m.find(ReturnEntity, { where: { companyId: this.companyId, status: 'DRAFT' }, relations: { items: true } });
    const out = new Map<string, number>();
    for (const d of drafts) for (const i of d.items || []) if (i[field]) out.set(i[field] as string, addQty(out.get(i[field] as string) || 0, i.quantity));
    return out;
  }

  async create(input: ReturnInput, user?: string): Promise<ReturnEntity> {
    const saved = await this.dataSource.transaction((m) => this.createTx(m, input, user));
    this.emit('create', saved);
    return saved;
  }

  private async createTx(m: EntityManager, input: ReturnInput, user?: string): Promise<ReturnEntity> {
    if (!(RETURN_TYPES as readonly string[]).includes(input.type)) throw new BadRequestException(err('VALIDATION_FIELD_IN', { property: 'type', value: input.type }));
    if (!input.lines?.length) throw new BadRequestException(err('RETURN_LINES_REQUIRED'));
    if (input.refundChannel && !(REFUND_CHANNELS as readonly string[]).includes(input.refundChannel)) throw new BadRequestException(err('VALIDATION_FIELD_IN', { property: 'refundChannel', value: input.refundChannel }));
    if (input.counterpartyDocDate && !isDateKey(input.counterpartyDocDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const items: Partial<ReturnItemEntity>[] = [];
    const header: Partial<ReturnEntity> = {};
    if (SALES_TYPES.includes(input.type)) {
      const inv = input.invoiceId ? await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, id: input.invoiceId }, relations: { lines: true } }) : null;
      if (!inv || inv.kind !== 'SALES' || !INVOICE_OK.includes(inv.status)) throw new BadRequestException(err('RETURN_INVOICE_REQUIRED'));
      const order = inv.orderIds?.[0] ? await m.findOne(OrderEntity, { where: { companyId: this.companyId, id: inv.orderIds[0] } }) : null;
      const customer = inv.customerId ? await m.findOne(CustomerEntity, { where: { companyId: this.companyId, id: inv.customerId } }) : null;
      const drafts = await this.draftQty(m, 'invoiceLineId');
      for (const l of input.lines) {
        const src = inv.lines.find((x) => x.id === l.invoiceLineId);
        if (!src) throw new BadRequestException(err('RETURN_LINE_NOT_FOUND', { id: l.invoiceLineId || '-' }));
        const q = roundQty(Number(l.quantity));
        if (!(q > 0)) continue;
        const available = returnableQuantity(src.baseQuantity, addQty(src.returnedQuantity || 0, drafts.get(src.id) || 0));
        if (q > available) throw new BadRequestException(err('RETURN_QTY_EXCEEDS_SOLD', { name: src.productName, requested: q, available }));
        items.push(this.salesItem(src, q, l, input.type));
      }
      const notified = input.notifiedAt ? parseZonedDateTime(input.notifiedAt, company.timezone) : input.type === 'WITHDRAWAL' ? new Date() : null;
      Object.assign(header, {
        invoiceId: inv.id,
        invoiceNo: inv.documentNo,
        invoiceDate: inv.issueDate,
        orderId: order?.id ?? null,
        customerId: inv.customerId ?? null,
        partySnapshot: customer ? customerSnapshot(customer) : inv.buyerSnapshot,
        currency: inv.currency,
        deliveryDate: inv.deliveryDate ?? inv.issueDate ?? null,
        notifiedAt: notified,
      });
      if (input.type === 'WITHDRAWAL') {
        const consumer = !customer || (customer.type !== 'company' && !customer.isVatTaxpayer);
        if (!order?.isDistanceSale || !consumer) throw new BadRequestException(err('WITHDRAWAL_NOT_DISTANCE_SALE'));
        if (input.goodsHandedOverDate && !isDateKey(input.goodsHandedOverDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
        const handedOver = input.goodsHandedOverDate || null;
        const plan = await this.withdrawalPlan(company, String(header.deliveryDate), notified, handedOver);
        if (!plan.inTime) throw new BadRequestException(err('WITHDRAWAL_PERIOD_EXPIRED', { deadline: plan.withdrawalDeadline }));
        Object.assign(header, { withdrawalDeadline: plan.withdrawalDeadline, goodsReturnDeadline: plan.goodsReturnDeadline, refundDueDate: plan.refundDueDate, goodsHandedOverDate: handedOver });
      }
    } else {
      const gr = input.goodsReceiptId ? await m.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, id: input.goodsReceiptId }, relations: { items: true } }) : null;
      if (!gr || gr.status !== 'COMPLETED') throw new BadRequestException(err('RETURN_RECEIPT_REQUIRED'));
      const supplier = gr.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: gr.supplierId } }) : null;
      const drafts = await this.draftQty(m, 'goodsReceiptItemId');
      for (const l of input.lines) {
        const src = gr.items.find((x) => x.id === l.goodsReceiptItemId);
        if (!src) throw new BadRequestException(err('RETURN_LINE_NOT_FOUND', { id: l.goodsReceiptItemId || '-' }));
        const q = roundQty(Number(l.quantity));
        if (!(q > 0)) continue;
        const available = returnableQuantity(src.acceptedQuantity, addQty(src.returnedQuantity || 0, drafts.get(src.id) || 0));
        if (q > available) throw new BadRequestException(err('RETURN_QTY_EXCEEDS_SOLD', { name: src.productName, requested: q, available }));
        const poItem = await m.findOne(PurchaseOrderItemEntity, { where: { id: src.purchaseOrderItemId } });
        const net = round2(q * Number(src.unitPrice));
        const rate = Number(poItem?.taxRate) || 0;
        const tax = round2((net * rate) / 100);
        const wr = Number(poItem?.withholdingRate) || 0;
        const withheld = round2((tax * wr) / 100);
        items.push({
          companyId: this.companyId, goodsReceiptItemId: src.id, productId: src.productId, productName: src.productName, productSku: src.productSku, quantity: q, unitCode: src.unitCode,
          unitPrice: src.unitPrice, netAmount: net, taxRate: rate, taxAmount: tax, exemptionCode: poItem?.exemptionCode ?? null, withholdingCode: poItem?.withholdingCode ?? null,
          withholdingRate: poItem?.withholdingRate ?? null, withheldTaxAmount: withheld, lineTotal: round2(net + tax), condition: 'RESELLABLE', targetWarehouseId: gr.warehouseId,
          tracking: this.pickTracking(src.tracking || [], q, l, gr.warehouseId),
        });
      }
      Object.assign(header, {
        goodsReceiptId: gr.id, purchaseOrderId: gr.purchaseOrderId, supplierId: gr.supplierId, partySnapshot: supplier ? supplierSnapshot(supplier) : gr.supplierSnapshot, currency: gr.currency,
        invoiceNo: gr.supplierInvoiceNo ?? null, invoiceDate: gr.supplierInvoiceDate ?? null, counterpartyEttn: input.counterpartyEttn || gr.supplierInvoiceEttn || null,
      });
    }
    if (!items.length) throw new BadRequestException(err('RETURN_LINES_REQUIRED'));
    // Damaged / to-be-destroyed goods go to a quarantine warehouse (never sellable).
    for (const it of items) {
      if (SALES_TYPES.includes(input.type) && it.condition !== 'RESELLABLE') it.targetWarehouseId = (await this.despatches.ensureSpecialWarehouse(m, 'QUARANTINE')).id;
      else if (it.targetWarehouseId) await this.warehouseStock.requireWarehouse(m, this.companyId, it.targetWarehouseId);
    }
    const sum = (k: keyof ReturnItemEntity) => round2(items.reduce((s, i) => s + (Number(i[k]) || 0), 0));
    const code = await this.numbers.resolveSeries(m, 'RETURN', 'INTERNAL');
    const no = await this.numbers.next(m, 'RETURN', 'INTERNAL', code, todayKey(company.timezone));
    const r = m.create(ReturnEntity, {
      companyId: this.companyId,
      returnNo: no.documentNo,
      type: input.type,
      status: 'DRAFT',
      ...header,
      subtotal: sum('netAmount'),
      taxTotal: sum('taxAmount'),
      withheldTaxTotal: sum('withheldTaxAmount'),
      grandTotal: sum('lineTotal'),
      taxBreakdown: buildBreakdown(items.map((i) => ({ taxRate: Number(i.taxRate), exemptionCode: i.exemptionCode, withholdingRate: i.withholdingRate, netAmount: Number(i.netAmount), taxAmount: Number(i.taxAmount), withheldTaxAmount: Number(i.withheldTaxAmount) }))),
      refundChannel: input.refundChannel || null,
      refundRef: input.refundRef || null,
      counterpartyDocNo: input.counterpartyDocNo || null,
      counterpartyDocDate: input.counterpartyDocDate || null,
      counterpartyEttn: input.counterpartyEttn || header.counterpartyEttn || null,
      note: input.note || null,
      createdBy: user || this.tenant.actor.username || null,
      items: items.map((i) => m.create(ReturnItemEntity, i)),
    });
    return m.save(ReturnEntity, r);
  }

  /** A sales return line priced from the original invoice line (same rate, pro rata). */
  private salesItem(src: InvoiceLineEntity, q: number, l: ReturnLineInput, type: string): Partial<ReturnItemEntity> {
    const f = src.baseQuantity ? q / Number(src.baseQuantity) : 0;
    const net = round2(Number(src.netAmount) * f);
    const tax = round2(Number(src.taxAmount) * f);
    const withheld = round2(Number(src.withheldTaxAmount) * f);
    const condition = l.condition && (RETURN_CONDITIONS as readonly string[]).includes(l.condition) ? l.condition : type === 'DEFECT' ? 'DAMAGED' : 'RESELLABLE';
    const original = (src.tracking || [])[0]?.warehouseId ?? null;
    return {
      companyId: this.companyId,
      invoiceLineId: src.id,
      productId: src.productId,
      productName: src.productName,
      productSku: src.productSku,
      quantity: q,
      unitCode: src.unitCode,
      unitPrice: src.baseQuantity ? Math.round((Number(src.netAmount) / Number(src.baseQuantity)) * 1e6) / 1e6 : 0,
      netAmount: net,
      taxRate: Number(src.taxRate) || 0,
      taxAmount: tax,
      exemptionCode: src.exemptionCode ?? null,
      withholdingCode: src.withholdingCode ?? null,
      withholdingRate: src.withholdingRate ?? null,
      withheldTaxAmount: withheld,
      lineTotal: round2(net + tax + round2(Number(src.otvAmount) * f)),
      condition,
      targetWarehouseId: l.targetWarehouseId || original,
      tracking: this.pickTracking(src.tracking || [], q, l, l.targetWarehouseId || original),
    };
  }

  /** Lots / serials that come back: explicit, else the first ones of the original document. */
  private pickTracking(source: TrackingEntry[], qty: number, l: ReturnLineInput, warehouseId: string | null): TrackingEntry[] | null {
    if (l.lots?.length) return l.lots.map((x) => ({ warehouseId: warehouseId || '', lotNumber: x.lotNumber, expiryDate: x.expiryDate ?? null, quantity: roundQty(Number(x.quantity)) }));
    if (l.serials?.length) return [{ warehouseId: warehouseId || '', quantity: l.serials.length, serials: l.serials }];
    if (!source.length) return null;
    const out: TrackingEntry[] = [];
    let left = roundQty(qty);
    for (const e of source) {
      if (left <= 0) break;
      const take = Math.min(left, Number(e.quantity));
      if (e.serials?.length) out.push({ warehouseId: e.warehouseId, quantity: Math.round(take), serials: e.serials.slice(0, Math.round(take)) });
      else if (e.lotNumber) out.push({ warehouseId: e.warehouseId, lotId: e.lotId ?? null, lotNumber: e.lotNumber, expiryDate: e.expiryDate ?? null, quantity: take });
      else out.push({ warehouseId: e.warehouseId, quantity: take });
      left = roundQty(left - take);
    }
    return out;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const r = await this.get(id);
    if (r.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
    await this.dataSource.manager.remove(ReturnEntity, r);
    this.gateway.emitToCompany(this.companyId, 'return_mutated', { type: 'delete', returnId: id });
    return { success: true };
  }

  // ------------------------------------------------------------------ complete
  async complete(id: string, input: { goodsMovedAt?: string | null; goodsHandedOverDate?: string | null } = {}, user?: string): Promise<ReturnEntity> {
    const touched: ProductEntity[] = [];
    const saved = await this.dataSource.transaction(async (m) => {
      await this.warehouseStock.begin(m, this.companyId);
      const r = await m.findOne(ReturnEntity, { where: { companyId: this.companyId, id }, relations: { items: true }, lock: { mode: 'pessimistic_write' } });
      if (!r) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (r.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
      const now = new Date();
      const at = input.goodsMovedAt ? parseZonedDateTime(input.goodsMovedAt, company.timezone) || now : now;
      const txDate = new Date(Math.min(at.getTime(), now.getTime()));
      if (input.goodsHandedOverDate && !isDateKey(input.goodsHandedOverDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
      const sales = SALES_TYPES.includes(r.type);
      // Withdrawal: the refund period runs from the hand-over to the designated carrier, else from
      // the day the goods reached the seller (md. 12/1), unless withdrawn before delivery (md. 12/2).
      const refund: Partial<ReturnEntity> = {};
      if (r.type === 'WITHDRAWAL' && r.deliveryDate) {
        const handedOver = input.goodsHandedOverDate || r.goodsHandedOverDate || null;
        const back = handedOver || dateKeyInZone(txDate, company.timezone);
        const plan = await this.withdrawalPlan(company, String(r.deliveryDate), r.notifiedAt ? new Date(r.notifiedAt) : null, back);
        Object.assign(refund, { goodsHandedOverDate: handedOver, goodsReturnDeadline: plan.goodsReturnDeadline, refundDueDate: plan.refundDueDate });
      }
      const docType = r.counterpartyDocNo ? 'INVOICE' : 'OTHER';
      const docNo = r.counterpartyDocNo || r.returnNo;
      const docDate = r.counterpartyDocDate || dateKeyInZone(txDate, company.timezone);
      const counterparty = r.partySnapshot?.taxId && /^\d{10,11}$/.test(r.partySnapshot.taxId) ? r.partySnapshot.taxId : null;
      for (const it of r.items) {
        if (!it.productId) continue;
        const product = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: it.productId }, lock: { mode: 'pessimistic_write' } });
        if (!product) continue;
        const old = product.quantity;
        const original = await this.originalMovement(m, r, it);
        let allocations;
        if (sales) {
          const target = it.targetWarehouseId || (await this.warehouseStock.defaultWarehouse(m, this.companyId)).id;
          const tr = it.tracking || [];
          allocations = await this.warehouseStock.receive(m, product, it.quantity, target, {
            lots: product.trackingType === TrackingType.LOT ? tr.filter((e) => e.lotNumber).map((e) => ({ lotNumber: e.lotNumber as string, expiryDate: e.expiryDate ?? null, quantity: e.quantity })) : undefined,
            serials: product.trackingType === TrackingType.SERIAL ? tr.flatMap((e) => e.serials || []) : undefined,
          });
        } else {
          const tr = it.tracking || [];
          allocations = await this.warehouseStock.issue(m, product, it.quantity, it.targetWarehouseId, {
            lots: product.trackingType === TrackingType.LOT ? tr.filter((e) => e.lotId).map((e) => ({ lotId: e.lotId as string, quantity: e.quantity })) : undefined,
            serials: product.trackingType === TrackingType.SERIAL ? tr.flatMap((e) => e.serials || []) : undefined,
          });
        }
        await this.warehouseStock.recordMovements(m, product, old, allocations, {
          type: StockMovementType.RETURN,
          reasonCode: 'RETURN',
          transactionDate: txDate,
          documentType: docType,
          documentNo: docNo,
          documentDate: docDate,
          counterpartyTaxId: counterparty,
          reversesMovementId: original?.id ?? null,
          referenceId: r.id,
          referenceType: 'return',
          note: `${sales ? 'Satış iadesi' : 'Alış iadesi'} ${r.returnNo}${r.invoiceNo ? ` (fatura ${r.invoiceNo})` : ''}`,
          performedBy: user,
          documentId: r.id,
          party: { type: sales ? 'CUSTOMER' : 'SUPPLIER', id: (sales ? r.customerId : r.supplierId) ?? null, name: r.partySnapshot?.legalName || r.partySnapshot?.name || null, taxId: r.partySnapshot?.taxId ?? null },
        });
        touched.push(product);
        await m.update(ReturnItemEntity, { id: it.id }, { tracking: this.warehouseStock.toTracking(allocations), reversesMovementId: original?.id ?? null });
        // Running counters of the source documents.
        if (it.invoiceLineId) {
          const line = await m.findOneOrFail(InvoiceLineEntity, { where: { id: it.invoiceLineId } });
          await m.update(InvoiceLineEntity, { id: line.id }, { returnedQuantity: addQty(line.returnedQuantity || 0, it.quantity) });
          if (line.orderItemId) {
            const oi = await m.findOne(OrderItemEntity, { where: { id: line.orderItemId } });
            if (oi) await m.update(OrderItemEntity, { id: oi.id }, { returnedQuantity: addQty(oi.returnedQuantity || 0, it.quantity) });
          }
          if (line.despatchLineId) {
            const dl = await m.findOne(DespatchLineEntity, { where: { id: line.despatchLineId } });
            if (dl) await m.update(DespatchLineEntity, { id: dl.id }, { returnedQuantity: addQty(dl.returnedQuantity || 0, it.quantity) });
          }
        }
        if (it.goodsReceiptItemId) {
          const gi = await m.findOneOrFail(GoodsReceiptItemEntity, { where: { id: it.goodsReceiptItemId } });
          await m.update(GoodsReceiptItemEntity, { id: gi.id }, { returnedQuantity: addQty(gi.returnedQuantity || 0, it.quantity) });
          const pi = await m.findOne(PurchaseOrderItemEntity, { where: { id: gi.purchaseOrderItemId } });
          if (pi) await m.update(PurchaseOrderItemEntity, { id: pi.id }, { returnedQuantity: addQty(pi.returnedQuantity || 0, it.quantity) });
        }
      }
      const { items: _i, ...header } = r;
      await m.save(ReturnEntity, Object.assign(new ReturnEntity(), header, { ...refund, status: 'COMPLETED', goodsMovedAt: at, completedAt: now, completedBy: user || this.tenant.actor.username || null }));
      const done = await this.get(r.id, m);
      // Follow-up documents: IADE invoice to the supplier; expense voucher for a consumer refund without bank / PTT receipt.
      if (!sales) {
        const inv = await this.invoices.createReturnInvoiceTx(m, done, user);
        await m.update(ReturnEntity, { id: r.id }, { returnInvoiceId: inv.id });
      } else if (done.partySnapshot?.isFinalConsumer && !r.counterpartyDocNo && !DOCUMENTED_REFUND_CHANNELS.includes(r.refundChannel || '')) {
        const v = await this.vouchers.createForReturnTx(m, done, user);
        await m.update(ReturnEntity, { id: r.id }, { expenseVoucherId: v.id });
      }
      return this.get(r.id, m);
    });
    this.emit('update', saved);
    for (const p of touched) this.gateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    return saved;
  }

  /**
   * First movement matching `where` that no other movement reverses yet (a movement can be reversed
   * once: UQ_stock_movements_reverses). Later partial returns of the same line link to the next
   * lot / allocation movement, or to none when all are taken (the RETURN still references the return).
   */
  private async firstUnreversed(m: EntityManager, where: Record<string, unknown>, order: 'ASC' | 'DESC' = 'ASC'): Promise<StockMovementEntity | null> {
    const candidates = await m.find(StockMovementEntity, { where: where as any, order: { sequenceNo: order } });
    if (!candidates.length) return null;
    const taken = await m.find(StockMovementEntity, { where: { companyId: this.companyId, reversesMovementId: In(candidates.map((c) => c.id)) }, select: { id: true, reversesMovementId: true } });
    const used = new Set(taken.map((t) => t.reversesMovementId));
    return candidates.find((c) => !used.has(c.id)) ?? null;
  }

  /** The sale / receipt movement a return item reverses (first not yet reversed one of that product on the original document). */
  private async originalMovement(m: EntityManager, r: ReturnEntity, it: ReturnItemEntity): Promise<StockMovementEntity | null> {
    if (it.invoiceLineId) {
      const line = await m.findOne(InvoiceLineEntity, { where: { id: it.invoiceLineId } });
      const dl = line?.despatchLineId ? await m.findOne(DespatchLineEntity, { where: { id: line.despatchLineId } }) : null;
      if (dl) {
        const mv = await this.firstUnreversed(m, { companyId: this.companyId, productId: it.productId as string, referenceType: 'despatch', referenceId: dl.despatchId, type: StockMovementType.ORDER });
        if (mv) return mv;
      }
      const order = r.orderId ? await m.findOne(OrderEntity, { where: { companyId: this.companyId, id: r.orderId } }) : null;
      if (order) {
        const mv = await this.firstUnreversed(m, { companyId: this.companyId, productId: it.productId as string, referenceId: order.orderNumber, type: StockMovementType.ORDER });
        if (mv) return mv;
      }
      return null;
    }
    if (r.purchaseOrderId) {
      const gr = r.goodsReceiptId ? await m.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, id: r.goodsReceiptId } }) : null;
      if (!gr?.poNumber) return null;
      return this.firstUnreversed(m, { companyId: this.companyId, productId: it.productId as string, type: StockMovementType.IN, referenceType: 'purchase_order', referenceId: In([gr.poNumber, gr.purchaseOrderId]) }, 'DESC');
    }
    return null;
  }

  /** Links follow-up data after completion (refund receipt, counterparty return invoice). */
  async updateRefund(id: string, input: { refundRef?: string | null; counterpartyDocNo?: string | null; counterpartyDocDate?: string | null; counterpartyEttn?: string | null }): Promise<ReturnEntity> {
    const r = await this.get(id);
    if (input.counterpartyDocDate && !isDateKey(input.counterpartyDocDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    const patch: Partial<ReturnEntity> = {};
    for (const k of ['refundRef', 'counterpartyDocNo', 'counterpartyDocDate', 'counterpartyEttn'] as const) if (input[k] !== undefined) (patch as any)[k] = input[k] || null;
    await this.dataSource.manager.update(ReturnEntity, { id: r.id }, patch);
    const saved = await this.get(id);
    this.emit('update', saved);
    return saved;
  }

  private emit(type: string, r: ReturnEntity) {
    this.gateway.emitToCompany(this.companyId, 'return_mutated', { type, returnDoc: r });
  }
}
