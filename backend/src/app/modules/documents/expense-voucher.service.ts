import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { ExpenseVoucherEntity, ExpenseVoucherLine } from '../../entities/expense-voucher.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { ReturnEntity } from '../../entities/return.entity';
import { PartySnapshot } from '../../entities/document-common';
import { round2 } from '../../shared/finance/tax';
import { addDays, canTransition, dateKeyInZone, EXPENSE_VOUCHER_KINDS, EXPENSE_VOUCHER_TRANSITIONS, isDateKey, todayKey } from '../../shared/tr';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { DocumentNumberService } from './document-number.service';
import { assertFiscalComplete, nowParts, requireReason, supplierSnapshot } from './document-support';

export interface ExpenseVoucherInput {
  kind?: string;
  supplierId?: string | null;
  /** Seller without a supplier record (e.g. a consumer refund) */
  seller?: PartySnapshot | null;
  goodsReceiptId?: string | null;
  deliveryDate?: string | null;
  lines?: ExpenseVoucherLine[];
  withholdingRate?: number | null;
  otherDeductions?: number | null;
  paymentChannel?: string | null;
  paymentRef?: string | null;
  paidAt?: string | null;
  note?: string | null;
}

/**
 * Gider pusulası (VUK 234) and müstahsil makbuzu (VUK 235, module switched on per company):
 * issued by the buyer within 7 days of delivery for purchases from non-taxpayers; numbered from a
 * PAPER series (or the external number), frozen after issue, signed copy tracked.
 */
@Injectable()
export class ExpenseVoucherService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly numbers: DocumentNumberService,
    private readonly legalParams: LegalParameterService,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async list(filter: { status?: string; kind?: string } = {}): Promise<ExpenseVoucherEntity[]> {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (filter.status) where['status'] = filter.status;
    if (filter.kind) where['kind'] = filter.kind;
    return this.dataSource.manager.find(ExpenseVoucherEntity, { where, order: { createdAt: 'DESC' } });
  }

  async get(id: string, manager: EntityManager = this.dataSource.manager): Promise<ExpenseVoucherEntity> {
    const v = await manager.findOne(ExpenseVoucherEntity, { where: { companyId: this.companyId, id } });
    if (!v) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    return v;
  }

  private async deadlineDays(country: string): Promise<number> {
    try {
      return Number(await this.legalParams.param<number>('EXPENSE_VOUCHER_DEADLINE_DAYS', todayKey(), country || 'TR')) || 7;
    } catch {
      return 7;
    }
  }

  private totals(lines: ExpenseVoucherLine[], withholdingRate: number, otherDeductions: number) {
    const clean = lines.map((l) => {
      const quantity = Number(l.quantity) || 0;
      const unitPrice = Number(l.unitPrice) || 0;
      return { productId: l.productId ?? null, description: String(l.description || '').slice(0, 255), quantity, unitCode: l.unitCode ?? null, unitPrice, amount: round2(quantity * unitPrice) };
    });
    const grossTotal = round2(clean.reduce((s, l) => s + l.amount, 0));
    const withholdingAmount = round2((grossTotal * (Number(withholdingRate) || 0)) / 100);
    const other = round2(Number(otherDeductions) || 0);
    return { lines: clean, grossTotal, withholdingRate: Number(withholdingRate) || 0, withholdingAmount, otherDeductions: other, netPayable: round2(grossTotal - withholdingAmount - other) };
  }

  private async checkKind(m: EntityManager, kind: string, supplier: SupplierEntity | null, company: CompanyEntity) {
    if (!(EXPENSE_VOUCHER_KINDS as readonly string[]).includes(kind)) throw new BadRequestException(err('VALIDATION_FIELD_IN', { property: 'kind', value: kind }));
    if (kind === 'MUSTAHSIL_MAKBUZU' && !company.producerReceiptEnabled) throw new BadRequestException(err('PRODUCER_RECEIPT_DISABLED'));
    if (supplier && supplier.isTaxpayer !== false) throw new BadRequestException(err('EXPENSE_VOUCHER_SELLER_TAXPAYER'));
    void m;
  }

  async create(input: ExpenseVoucherInput, user?: string): Promise<ExpenseVoucherEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
      const supplier = input.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: input.supplierId } }) : null;
      if (input.supplierId && !supplier) throw new BadRequestException(err('PO_SUPPLIER_NOT_FOUND', { id: input.supplierId }));
      const kind = input.kind || 'GIDER_PUSULASI';
      await this.checkKind(m, kind, supplier, company);
      if (!input.lines?.length) throw new BadRequestException(err('EXPENSE_VOUCHER_LINES_REQUIRED'));
      if (!supplier && !input.seller?.name) throw new BadRequestException(err('PO_SUPPLIER_REQUIRED'));
      const delivery = input.deliveryDate && isDateKey(input.deliveryDate) ? input.deliveryDate : todayKey(company.timezone);
      const t = this.totals(input.lines, input.withholdingRate ?? 0, input.otherDeductions ?? 0);
      return m.save(ExpenseVoucherEntity, m.create(ExpenseVoucherEntity, {
        companyId: this.companyId,
        kind,
        status: 'DRAFT',
        supplierId: supplier?.id ?? null,
        sellerSnapshot: supplier ? supplierSnapshot(supplier) : { ...(input.seller as PartySnapshot), isFinalConsumer: true },
        goodsReceiptId: input.goodsReceiptId || null,
        deliveryDate: delivery,
        dueDate: addDays(delivery, await this.deadlineDays(company.country)),
        currency: 'TRY',
        ...t,
        paymentChannel: input.paymentChannel || null,
        paymentRef: input.paymentRef || null,
        paidAt: input.paidAt || null,
        note: input.note || null,
        createdBy: user || this.tenant.actor.username || null,
      }));
    });
    this.emit('create', saved);
    return saved;
  }

  /** Draft voucher for a goods receipt from a non-taxpayer supplier (accepted quantities x PO net price). */
  async createForReceiptTx(m: EntityManager, r: GoodsReceiptEntity, supplier: SupplierEntity | null, user?: string): Promise<ExpenseVoucherEntity> {
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const kind = supplier?.type === 'farmer' && !supplier.isRealTaxationFarmer && company.producerReceiptEnabled ? 'MUSTAHSIL_MAKBUZU' : 'GIDER_PUSULASI';
    // The seller does not charge VAT: the price agreed on the purchase order line (total / quantity) is paid.
    const poItems = await m.find(PurchaseOrderItemEntity, { where: { purchaseOrderId: r.purchaseOrderId } });
    const price = (id: string, fallback: number) => {
      const pi = poItems.find((x) => x.id === id);
      return pi && Number(pi.quantity) > 0 ? Math.round((Number(pi.lineTotal) / Number(pi.quantity)) * 1e6) / 1e6 : fallback;
    };
    const lines = r.items
      .filter((i) => i.acceptedQuantity > 0)
      .map((i) => ({ productId: i.productId ?? null, description: i.productName, quantity: i.acceptedQuantity, unitCode: i.unitCode ?? null, unitPrice: price(i.purchaseOrderItemId, Number(i.unitPrice) || 0), amount: 0 }));
    const t = this.totals(lines, 0, 0);
    const delivery = dateKeyInZone(new Date(r.receivedAt), company.timezone);
    return m.save(ExpenseVoucherEntity, m.create(ExpenseVoucherEntity, {
      companyId: this.companyId,
      kind,
      status: 'DRAFT',
      supplierId: supplier?.id ?? null,
      sellerSnapshot: supplierSnapshot(supplier, r.supplierSnapshot?.name),
      goodsReceiptId: r.id,
      deliveryDate: delivery,
      dueDate: addDays(delivery, await this.deadlineDays(company.country)),
      currency: r.currency || 'TRY',
      ...t,
      note: `Mal kabul ${r.receiptNo} (${r.poNumber})`,
      createdBy: user || this.tenant.actor.username || null,
    }));
  }

  /** Draft voucher for a consumer refund that has no bank / PTT receipt (VUK 234/b). */
  async createForReturnTx(m: EntityManager, ret: ReturnEntity, user?: string): Promise<ExpenseVoucherEntity> {
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const delivery = ret.goodsMovedAt ? dateKeyInZone(new Date(ret.goodsMovedAt), company.timezone) : todayKey(company.timezone);
    const lines = (ret.items || []).map((i) => ({ productId: i.productId ?? null, description: `İade: ${i.productName}`, quantity: i.quantity, unitCode: i.unitCode ?? null, unitPrice: i.quantity ? round2(Number(i.lineTotal) / Number(i.quantity)) : 0, amount: 0 }));
    const t = this.totals(lines, 0, 0);
    return m.save(ExpenseVoucherEntity, m.create(ExpenseVoucherEntity, {
      companyId: this.companyId,
      kind: 'GIDER_PUSULASI',
      status: 'DRAFT',
      sellerSnapshot: { ...(ret.partySnapshot || { name: '-' }), isFinalConsumer: true },
      returnId: ret.id,
      deliveryDate: delivery,
      dueDate: addDays(delivery, await this.deadlineDays(company.country)),
      currency: ret.currency || 'TRY',
      ...t,
      paymentChannel: ret.refundChannel || null,
      note: `İade ${ret.returnNo} (fatura ${ret.invoiceNo || '-'})`,
      createdBy: user || this.tenant.actor.username || null,
    }));
  }

  async update(id: string, input: ExpenseVoucherInput): Promise<ExpenseVoucherEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const v = await m.findOne(ExpenseVoucherEntity, { where: { companyId: this.companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!v) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (v.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
      if (input.kind && input.kind !== v.kind) {
        const supplier = v.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: v.supplierId } }) : null;
        await this.checkKind(m, input.kind, supplier, company);
        v.kind = input.kind;
      }
      if (input.deliveryDate && isDateKey(input.deliveryDate)) {
        v.deliveryDate = input.deliveryDate;
        v.dueDate = addDays(input.deliveryDate, await this.deadlineDays(company.country));
      }
      const t = this.totals(input.lines || v.lines || [], input.withholdingRate ?? v.withholdingRate, input.otherDeductions ?? v.otherDeductions);
      Object.assign(v, t);
      for (const k of ['paymentChannel', 'paymentRef', 'paidAt', 'note'] as const) if (input[k] !== undefined) (v as any)[k] = input[k] || null;
      return m.save(ExpenseVoucherEntity, v);
    });
    this.emit('update', saved);
    return saved;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.dataSource.transaction(async (m) => {
      const v = await m.findOne(ExpenseVoucherEntity, { where: { companyId: this.companyId, id } });
      if (!v) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (v.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      if (v.goodsReceiptId) await m.update(GoodsReceiptEntity, { id: v.goodsReceiptId, companyId: this.companyId, expenseVoucherId: v.id }, { expenseVoucherId: null });
      await m.remove(ExpenseVoucherEntity, v);
    });
    this.gateway.emitToCompany(this.companyId, 'expense_voucher_mutated', { type: 'delete', expenseVoucherId: id });
    return { success: true };
  }

  async issue(id: string, input: { issueDate?: string | null; externalDocNo?: string | null; seriesCode?: string | null } = {}, user?: string): Promise<ExpenseVoucherEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const v = await m.findOne(ExpenseVoucherEntity, { where: { companyId: this.companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!v) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (!canTransition(EXPENSE_VOUCHER_TRANSITIONS, v.status, 'ISSUED')) throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
      if ((company.country || 'TR') === 'TR') assertFiscalComplete(company);
      if (v.kind === 'MUSTAHSIL_MAKBUZU' && !company.producerReceiptEnabled) throw new BadRequestException(err('PRODUCER_RECEIPT_DISABLED'));
      const today = nowParts(company.timezone);
      const date = input.issueDate || today.date;
      if (!isDateKey(date)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
      if (date > today.date) throw new BadRequestException(err('DOCUMENT_DATE_IN_FUTURE', { date }));
      const kind = v.kind === 'MUSTAHSIL_MAKBUZU' ? 'PRODUCER_RECEIPT' : 'EXPENSE_VOUCHER';
      // e-Gider pusulası does not exist; e-Müstahsil Makbuzu is issued through the provider (WP5): paper / external here.
      const num = await this.numbers.assign(m, { eDocumentMode: 'NONE' }, kind, date, { externalDocNo: input.externalDocNo, seriesCode: input.seriesCode || v.seriesCode, exceptId: v.id });
      await m.save(ExpenseVoucherEntity, Object.assign(v, {
        status: 'ISSUED', documentNo: num.documentNo, seriesCode: num.seriesCode, numberMode: num.numberMode, issueDate: date, issuedAt: new Date(), issuedBy: user || this.tenant.actor.username || null,
      }));
      return this.get(v.id, m);
    });
    this.emit('update', saved);
    return saved;
  }

  async cancel(id: string, reason: string, user?: string): Promise<ExpenseVoucherEntity> {
    const why = requireReason(reason);
    const v = await this.get(id);
    if (!canTransition(EXPENSE_VOUCHER_TRANSITIONS, v.status, 'CANCELLED')) throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: v.status }));
    await this.dataSource.manager.save(ExpenseVoucherEntity, Object.assign(v, { status: 'CANCELLED', cancelReason: why, cancelledAt: new Date(), cancelledBy: user || this.tenant.actor.username || null }));
    const saved = await this.get(id);
    this.emit('update', saved);
    return saved;
  }

  /** The seller's signed copy came back (VUK 234: the voucher is signed by the seller). */
  async setSignedCopy(id: string, input: { received: boolean; paymentRef?: string | null; paidAt?: string | null }): Promise<ExpenseVoucherEntity> {
    const v = await this.get(id);
    if (v.status !== 'ISSUED') throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: v.status }));
    await this.dataSource.manager.update(ExpenseVoucherEntity, { id: v.id }, {
      signedCopyReceived: !!input.received,
      signedCopyAt: input.received ? new Date() : null,
      ...(input.paymentRef !== undefined ? { paymentRef: input.paymentRef || null } : {}),
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt && isDateKey(input.paidAt) ? input.paidAt : null } : {}),
    });
    const saved = await this.get(id);
    this.emit('update', saved);
    return saved;
  }

  private emit(type: string, v: ExpenseVoucherEntity) {
    this.gateway.emitToCompany(this.companyId, 'expense_voucher_mutated', { type, expenseVoucher: v });
  }
}
