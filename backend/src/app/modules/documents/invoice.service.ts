import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { randomUUID } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { InvoiceEntity, InvoiceLineEntity } from '../../entities/invoice.entity';
import { DespatchEntity, DespatchLineEntity } from '../../entities/despatch.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { ReturnEntity } from '../../entities/return.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { OrderStatus } from '../../entities/enums';
import { DocumentRef, InternetSaleInfo, LineTax, PartySnapshot } from '../../entities/document-common';
import { ChargeAllocation, invoiceTypeHint, round2 } from '../../shared/finance/tax';
import { addQty, canTransition, dateKeyInZone, daysBetween, INVOICE_TRANSITIONS, isDateKey, isLateInvoice, PAPER_REASONS, parseZonedDateTime, roundQty, todayKey } from '../../shared/tr';
import { buildBreakdown, documentTotals, proRataPart } from '../../shared/documents/document-math';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { AuditService } from '../integrations/audit.service';
import { DocumentNumberService } from './document-number.service';
import { DespatchService } from './despatch.service';
import { assertFiscalComplete, companySnapshot, customerSnapshot, DocumentHooks, InvoiceCancelInput, nowParts, requireReason, supplierSnapshot } from './document-support';

export interface InvoiceDraftInput {
  /** Partial invoicing: order item + base quantity (default: everything not yet invoiced) */
  lines?: { orderItemId: string; quantity: number }[];
  seriesCode?: string | null;
  internetSaleInfo?: InternetSaleInfo | null;
  replacesDespatch?: boolean;
  notes?: string | null;
}

export interface IssueInput {
  issueDate?: string | null;
  issueTime?: string | null;
  externalDocNo?: string | null;
  externalDocDate?: string | null;
  seriesCode?: string | null;
  lateConfirm?: boolean;
  /**
   * Paper invoice during an e-document outage (509 V.7): mode PROVIDER -> PAPER series instead of
   * the e-document number; mode NONE -> allows the PAPER series although e-documents are mandatory.
   */
  paperFallback?: boolean;
  paperReason?: string | null;
  gibNoticeRef?: string | null;
}

const LIVE = ['DRAFT', 'ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'ACCEPTED'];
const ISSUED_STATES = ['ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'ACCEPTED'];

interface Part {
  order: OrderEntity;
  item: OrderItemEntity;
  baseQty: number;
  despatchLine?: DespatchLineEntity | null;
  despatch?: DespatchEntity | null;
}

/**
 * Invoices (VUK 229-231; 509): drafts from an order or from despatch advices (toplu fatura),
 * numbering and freezing on ISSUE, the 7-day rule (VUK 231/5) with an explicit, audited late
 * confirmation, cancellation with a reason. e-Belge transmission (QUEUED / SENT ...) is WP5.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly numbers: DocumentNumberService,
    private readonly despatches: DespatchService,
    private readonly legalParams: LegalParameterService,
    private readonly audit: AuditService,
    private readonly gateway: AppGateway,
    @Optional() private readonly hooks?: DocumentHooks,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async list(filter: { status?: string; orderId?: string; kind?: string } = {}): Promise<InvoiceEntity[]> {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (filter.status) where['status'] = filter.status;
    if (filter.kind) where['kind'] = filter.kind;
    const rows = await this.dataSource.manager.find(InvoiceEntity, { where, relations: { lines: true }, order: { createdAt: 'DESC' } });
    rows.forEach((r) => r.lines?.sort((a, b) => a.lineNo - b.lineNo));
    return filter.orderId ? rows.filter((r) => (r.orderIds || []).includes(filter.orderId as string)) : rows;
  }

  async get(id: string, manager: EntityManager = this.dataSource.manager): Promise<InvoiceEntity> {
    const inv = await manager.findOne(InvoiceEntity, { where: { companyId: this.companyId, id }, relations: { lines: true } });
    if (!inv) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    inv.lines?.sort((a, b) => a.lineNo - b.lineNo);
    // Warning only: the receiver answered a referenced e-İrsaliye with a partial / full rejection
    // (İrsaliye Yanıtı). Stock and invoiceable quantities are not corrected automatically; the user
    // invoices the accepted quantity or records a return.
    const refIds = (inv.despatchRefs || []).map((r) => r.id).filter((x): x is string => !!x);
    const disputed = refIds.length
      ? await manager.find(DespatchEntity, { where: { companyId: this.companyId, id: In(refIds), status: In(['PARTIALLY_ACCEPTED', 'REJECTED']) }, select: ['id', 'documentNo', 'status'] })
      : [];
    return Object.assign(inv, { disputedDespatches: disputed.map((d) => ({ id: d.id, documentNo: d.documentNo, status: d.status })) });
  }

  private async param<T>(key: string, country: string, fallback: T): Promise<T> {
    try {
      return await this.legalParams.param<T>(key, todayKey(), country || 'TR');
    } catch {
      return fallback;
    }
  }

  // ------------------------------------------------------------------ drafts
  async createFromOrder(orderId: string, input: InvoiceDraftInput = {}, user?: string): Promise<InvoiceEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const order = await m.findOne(OrderEntity, { where: { companyId: this.companyId, id: orderId }, relations: { items: true, charges: true }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException(err('ORDER_NOT_FOUND'));
      if (order.status === OrderStatus.CANCELLED) throw new BadRequestException(err('ORDER_CANCELLED_NO_DOCUMENTS'));
      const despatches = await m.find(DespatchEntity, { where: { companyId: this.companyId, orderId: order.id, purpose: 'SALE', status: Not('DRAFT') }, relations: { lines: true }, order: { approvedAt: 'ASC' } });
      const parts: Part[] = [];
      for (const item of order.items) {
        const remaining = roundQty(item.quantity - (item.invoicedQuantity || 0));
        const wanted = input.lines?.length ? roundQty(Number(input.lines.find((l) => l.orderItemId === item.id)?.quantity || 0)) : remaining;
        if (!(wanted > 0)) continue;
        if (wanted > remaining) throw new BadRequestException(err('DESPATCH_QTY_EXCEEDS_ORDER', { name: item.productName, requested: wanted, available: remaining }));
        let left = wanted;
        // Allocate to delivered (despatched, not yet invoiced) quantities first, oldest despatch first.
        for (const d of despatches) {
          for (const l of d.lines.filter((x) => x.orderItemId === item.id)) {
            const open = roundQty(l.quantity - (l.invoicedQuantity || 0));
            if (open <= 0 || left <= 0) continue;
            const q = Math.min(open, left);
            parts.push({ order, item, baseQty: q, despatchLine: l, despatch: d });
            left = roundQty(left - q);
          }
        }
        if (left > 0) parts.push({ order, item, baseQty: left });
      }
      if (!parts.length) throw new BadRequestException(err('INVOICE_NOTHING_TO_INVOICE'));
      return this.buildDraft(m, [order], parts, input, user);
    });
    this.emit('create', saved);
    return saved;
  }

  /** Toplu fatura: one invoice for several approved despatch advices of the same buyer and currency. */
  async createFromDespatches(despatchIds: string[], input: InvoiceDraftInput = {}, user?: string): Promise<InvoiceEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const ids = [...new Set(despatchIds || [])];
      const despatches = ids.length ? await m.find(DespatchEntity, { where: { companyId: this.companyId, id: In(ids) }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } }) : [];
      if (despatches.length !== ids.length || !ids.length) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      for (const d of despatches) {
        if (d.status === 'DRAFT' || d.purpose !== 'SALE' || !d.orderId) throw new BadRequestException(err('DOCUMENT_STATUS_INVALID', { status: d.status }));
      }
      const orders = await m.find(OrderEntity, { where: { companyId: this.companyId, id: In([...new Set(despatches.map((d) => d.orderId as string))]) }, relations: { items: true, charges: true } });
      const buyerKey = (o: OrderEntity) => o.customerId || `name:${o.customerName}`;
      if (new Set(orders.map(buyerKey)).size > 1 || new Set(orders.map((o) => o.currency)).size > 1) throw new BadRequestException(err('INVOICE_PARTIES_MIXED'));
      const parts: Part[] = [];
      despatches.sort((a, b) => String(a.issueDate).localeCompare(String(b.issueDate)) || String(a.documentNo).localeCompare(String(b.documentNo)));
      for (const d of despatches) {
        const order = orders.find((o) => o.id === d.orderId) as OrderEntity;
        for (const l of d.lines.sort((a, b) => a.lineNo - b.lineNo)) {
          const item = order.items.find((i) => i.id === l.orderItemId);
          if (!item) continue;
          const open = Math.min(roundQty(l.quantity - (l.invoicedQuantity || 0)), roundQty(item.quantity - (item.invoicedQuantity || 0) - parts.filter((p) => p.item.id === item.id).reduce((s, p) => s + p.baseQty, 0)));
          if (open > 0) parts.push({ order, item, baseQty: open, despatchLine: l, despatch: d });
        }
      }
      if (!parts.length) throw new BadRequestException(err('INVOICE_NOTHING_TO_INVOICE'));
      return this.buildDraft(m, orders, parts, input, user);
    });
    this.emit('create', saved);
    return saved;
  }

  private async buildDraft(m: EntityManager, orders: OrderEntity[], parts: Part[], input: InvoiceDraftInput, user?: string): Promise<InvoiceEntity> {
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    if (input.replacesDespatch && company.eDocumentMode !== 'PROVIDER') throw new BadRequestException(err('EINVOICE_MODE_REQUIRED'));
    const first = orders[0];
    const customer = first.customerId ? await m.findOne(CustomerEntity, { where: { companyId: this.companyId, id: first.customerId } }) : null;
    const live = await m.find(InvoiceEntity, { where: { companyId: this.companyId, status: In(LIVE) }, relations: { lines: true } });
    const liveLines = live.flatMap((i) => i.lines || []);
    const lines: Partial<InvoiceLineEntity>[] = [];
    const counted = new Map<string, number>();
    const productCache = new Map<string, ProductEntity | null>();
    // UBL-TR needs UN/ECE Rec 20 unit codes (C62, KGM, ...), not the app's own unit codes (pcs, kg, ...).
    const units = await m.find(UnitEntity, { where: { companyId: this.companyId } });
    const uneceOf = (code: string | null | undefined, product: ProductEntity | null | undefined): string | null => {
      const u = (code ? units.find((x) => x.code === code) : undefined) || (product?.baseUnitId ? units.find((x) => x.id === product.baseUnitId) : undefined) || (product?.unit ? units.find((x) => x.code === product.unit) : undefined);
      return u?.uneceCode || code || null;
    };
    for (const p of parts) {
      const prev = liveLines.filter((l) => l.orderItemId === p.item.id);
      const alreadyBase = addQty(prev.reduce((s, l) => s + Number(l.baseQuantity || 0), 0), counted.get(p.item.id) || 0);
      const sum = (k: keyof InvoiceLineEntity) => round2(prev.reduce((s, l) => s + Number(l[k] || 0), 0) + lines.filter((x) => x.orderItemId === p.item.id).reduce((s, x) => s + Number((x as any)[k] || 0), 0));
      const amounts = proRataPart(
        {
          baseQuantity: p.item.quantity, unitFactor: p.item.unitFactor, unitPrice: p.item.unitPrice, grossAmount: p.item.grossAmount, discountAmount: p.item.discountAmount,
          documentDiscountShare: p.item.documentDiscountShare, netAmount: p.item.netAmount, taxRate: p.item.taxRate, taxAmount: p.item.taxAmount, withheldTaxAmount: p.item.withheldTaxAmount,
          otvAmount: p.item.otvAmount, lineTotal: p.item.lineTotal,
        },
        p.baseQty,
        alreadyBase,
        { grossAmount: sum('grossAmount'), discountAmount: sum('discountAmount'), netAmount: sum('netAmount'), otvAmount: sum('otvAmount'), taxAmount: sum('taxAmount'), withheldTaxAmount: sum('withheldTaxAmount'), lineTotal: sum('lineTotal') },
      );
      counted.set(p.item.id, addQty(counted.get(p.item.id) || 0, p.baseQty));
      if (p.item.productId && !productCache.has(p.item.productId)) productCache.set(p.item.productId, await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: p.item.productId } }));
      const product = p.item.productId ? productCache.get(p.item.productId) : null;
      const taxes: LineTax[] = [
        {
          code: p.item.taxCode || '0015', rate: Number(p.item.taxRate) || 0, base: round2(amounts.netAmount + amounts.otvAmount), amount: amounts.taxAmount,
          exemptionCode: p.item.exemptionCode ?? null, withholdingCode: p.item.withholdingCode ?? null, withholdingRate: p.item.withholdingRate ?? null, withheld: amounts.withheldTaxAmount,
        },
      ];
      if (amounts.otvAmount) taxes.push({ code: p.item.otvCode || 'OTV', rate: Number(p.item.otvRate) || 0, base: amounts.netAmount, amount: amounts.otvAmount });
      lines.push({
        companyId: this.companyId,
        orderItemId: p.item.id,
        despatchLineId: p.despatchLine?.id ?? null,
        productId: p.item.productId,
        productName: p.item.productName,
        productSku: product?.sku ?? null,
        quantity: amounts.quantity,
        unitCode: uneceOf(p.item.unitCode, product),
        unitFactor: Number(p.item.unitFactor) || 1,
        baseQuantity: p.baseQty,
        unitPrice: Number(p.item.unitPrice) || 0,
        grossAmount: amounts.grossAmount,
        discountAmount: amounts.discountAmount,
        netAmount: amounts.netAmount,
        taxRate: Number(p.item.taxRate) || 0,
        taxAmount: amounts.taxAmount,
        taxes,
        exemptionCode: p.item.exemptionCode ?? null,
        vatNotCollected: !!p.item.vatNotCollected,
        withholdingCode: p.item.withholdingCode ?? null,
        withholdingRate: p.item.withholdingRate ?? null,
        withheldTaxAmount: amounts.withheldTaxAmount,
        otvCode: p.item.otvCode ?? null,
        otvRate: p.item.otvRate ?? null,
        otvAmount: amounts.otvAmount,
        lineTotal: amounts.lineTotal,
        tracking: p.despatchLine?.tracking ?? null,
      });
    }
    // Order charges go on the first invoice of the order.
    const charges: { type: string; description?: string | null; amount: number; taxAmount: number; withheldTaxAmount: number; lineTotal: number; allocations: ChargeAllocation[] }[] = [];
    for (const o of orders) {
      const hasCharges = live.some((i) => (i.orderIds || []).includes(o.id) && (i.charges || []).length);
      if (hasCharges) continue;
      for (const c of o.charges || []) {
        charges.push({ type: c.type, description: c.description ?? null, amount: Number(c.amount) || 0, taxAmount: Number(c.taxAmount) || 0, withheldTaxAmount: Number(c.withheldTaxAmount) || 0, lineTotal: Number(c.lineTotal) || 0, allocations: (c.allocations as ChargeAllocation[]) || [] });
      }
    }
    const totals = documentTotals({ lines: lines as any, charges });
    const breakdown = buildBreakdown(lines as any, charges.flatMap((c) => c.allocations));
    const rate = Number(first.exchangeRate) || 1;
    const hint = invoiceTypeHint({ lines: lines.map((l) => ({ withholdingRate: Number(l.withholdingRate) || 0, vatNotCollected: !!l.vatNotCollected, exemptionCode: l.exemptionCode ?? null, taxRate: Number(l.taxRate) || 0 })) as any, withheldTaxTotal: totals.withheldTaxTotal });
    const despatchRefs: DocumentRef[] = [];
    for (const p of parts) {
      if (p.despatch && !despatchRefs.some((r) => r.id === p.despatch!.id)) despatchRefs.push({ id: p.despatch.id, documentNo: p.despatch.documentNo ?? null, issueDate: p.despatch.issueDate ?? null, type: 'DESPATCH', ettn: p.despatch.ettn });
    }
    const delivered = parts.filter((p) => p.despatch?.actualDespatchAt).map((p) => dateKeyInZone(new Date(p.despatch!.actualDespatchAt as Date), company.timezone));
    const orderShipped = orders.filter((o) => o.shippedAt && o.stockMode === 'order').map((o) => dateKeyInZone(new Date(o.shippedAt as Date), company.timezone));
    const deliveryDate = [...delivered, ...orderShipped].sort()[0] || null;
    const buyer = customerSnapshot(customer, first.customerName);
    const internet: InternetSaleInfo | null = first.isDistanceSale || input.internetSaleInfo
      ? { webAddress: company.website ?? null, carrierName: first.carrier ?? null, shipmentDate: deliveryDate, ...(input.internetSaleInfo || {}) }
      : null;
    const inv = m.create(InvoiceEntity, {
      companyId: this.companyId,
      ettn: randomUUID(),
      kind: 'SALES',
      profileId: this.profileFor(customer, buyer, hint),
      typeCode: hint,
      status: 'DRAFT',
      deliveryDate,
      customerId: customer?.id ?? null,
      orderIds: orders.map((o) => o.id),
      despatchRefs,
      billingReferences: null,
      sellerSnapshot: companySnapshot(company),
      buyerSnapshot: buyer,
      currency: first.currency,
      exchangeRate: rate,
      exchangeRateSource: first.exchangeRateSource ?? null,
      exchangeRateDate: first.exchangeRateDate ?? null,
      ...totals,
      subtotalTry: round2(totals.subtotal * rate),
      taxTotalTry: round2(totals.taxTotal * rate),
      grandTotalTry: round2(totals.grandTotal * rate),
      taxBreakdown: breakdown,
      charges: charges.map(({ allocations: _a, ...c }) => c),
      internetSaleInfo: internet,
      replacesDespatch: !!input.replacesDespatch,
      seriesCode: input.seriesCode || null,
      notes: input.notes || null,
      createdBy: user || this.tenant.actor.username || null,
      lines: lines.map((l, i) => m.create(InvoiceLineEntity, { ...l, lineNo: i + 1 })),
    });
    const saved = await m.save(InvoiceEntity, inv);
    // Reserve the quantities (drafts count, so the same delivery is not invoiced twice).
    for (const p of parts) {
      p.item.invoicedQuantity = addQty(p.item.invoicedQuantity || 0, p.baseQty);
      await m.update(OrderItemEntity, { id: p.item.id }, { invoicedQuantity: p.item.invoicedQuantity });
      if (p.despatchLine) {
        p.despatchLine.invoicedQuantity = addQty(p.despatchLine.invoicedQuantity || 0, p.baseQty);
        await m.update(DespatchLineEntity, { id: p.despatchLine.id }, { invoicedQuantity: p.despatchLine.invoicedQuantity });
      }
    }
    await this.refreshDespatchInvoiceStatus(m, despatchRefs.map((r) => r.id as string));
    return this.get(saved.id, m);
  }

  /** UBL-TR scenario: e-Fatura users TEMEL / TICARI, others e-Arşiv, export exemptions IHRACAT (WP5 refines with the registry). */
  private profileFor(customer: CustomerEntity | null, buyer: PartySnapshot, hint: string): string {
    if (customer?.identityType === 'FOREIGN' && hint === 'ISTISNA') return 'IHRACAT';
    if (customer?.eInvoiceRegistered) return customer.preferredProfile === 'TICARIFATURA' ? 'TICARIFATURA' : 'TEMELFATURA';
    return 'EARSIVFATURA';
  }

  private async refreshDespatchInvoiceStatus(m: EntityManager, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const ds = await m.find(DespatchEntity, { where: { companyId: this.companyId, id: In(ids) }, relations: { lines: true } });
    for (const d of ds) {
      const all = d.lines.every((l) => roundQty(l.invoicedQuantity) >= roundQty(l.quantity));
      const any = d.lines.some((l) => l.invoicedQuantity > 0);
      const status = all ? 'FULL' : any ? 'PARTIAL' : 'NONE';
      if (status !== d.invoiceStatus) await m.update(DespatchEntity, { id: d.id }, { invoiceStatus: status });
    }
  }

  /** e-Belge: an invoice rejected by GİB or by the receiver (RED) is void; its quantities can be invoiced again. */
  async releaseQuantitiesTx(m: EntityManager, inv: InvoiceEntity): Promise<void> {
    const full = inv.lines ? inv : await this.get(inv.id, m);
    await this.release(m, full);
  }

  /** Releases the quantities of a draft / cancelled invoice. */
  private async release(m: EntityManager, inv: InvoiceEntity): Promise<void> {
    const despatchIds = new Set<string>();
    for (const l of inv.lines || []) {
      if (l.orderItemId) {
        const item = await m.findOne(OrderItemEntity, { where: { id: l.orderItemId } });
        if (item) await m.update(OrderItemEntity, { id: item.id }, { invoicedQuantity: Math.max(0, roundQty(item.invoicedQuantity - l.baseQuantity)) });
      }
      if (l.despatchLineId) {
        const dl = await m.findOne(DespatchLineEntity, { where: { id: l.despatchLineId, companyId: this.companyId } });
        if (dl) {
          await m.update(DespatchLineEntity, { id: dl.id }, { invoicedQuantity: Math.max(0, roundQty(dl.invoicedQuantity - l.baseQuantity)) });
          despatchIds.add(dl.despatchId);
        }
      }
    }
    await this.refreshDespatchInvoiceStatus(m, [...despatchIds]);
  }

  async update(id: string, input: { seriesCode?: string | null; internetSaleInfo?: InternetSaleInfo | null; notes?: string | null; replacesDespatch?: boolean }): Promise<InvoiceEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (inv.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      if (input.replacesDespatch) {
        const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
        if (company.eDocumentMode !== 'PROVIDER') throw new BadRequestException(err('EINVOICE_MODE_REQUIRED'));
      }
      if (input.seriesCode !== undefined) inv.seriesCode = input.seriesCode || null;
      if (input.internetSaleInfo !== undefined) inv.internetSaleInfo = input.internetSaleInfo;
      if (input.notes !== undefined) inv.notes = input.notes || null;
      if (input.replacesDespatch !== undefined) inv.replacesDespatch = !!input.replacesDespatch;
      await m.save(InvoiceEntity, inv);
      return this.get(id, m);
    });
    this.emit('update', saved);
    return saved;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, id }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (inv.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      await this.release(m, inv);
      await m.remove(InvoiceEntity, inv);
    });
    this.gateway.emitToCompany(this.companyId, 'invoice_mutated', { type: 'delete', invoiceId: id });
    return { success: true };
  }

  // ------------------------------------------------------------------ issue
  async issue(id: string, input: IssueInput = {}, user?: string): Promise<InvoiceEntity> {
    const touched: ProductEntity[] = [];
    let late: { days: number; deliveryDate: string; backdated: boolean; enteredOn: string } | null = null;
    const saved = await this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, id }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (!canTransition(INVOICE_TRANSITIONS, inv.status, 'ISSUED')) throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
      if ((company.country || 'TR') === 'TR') assertFiscalComplete(company);
      const now = new Date();
      const today = nowParts(company.timezone, now);
      const external = company.eDocumentMode !== 'PROVIDER' && !!input.externalDocNo;
      const issueDate = input.issueDate || (external ? input.externalDocDate : null) || today.date;
      if (!isDateKey(issueDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
      if (issueDate > today.date) throw new BadRequestException(err('DOCUMENT_DATE_IN_FUTURE', { date: issueDate }));
      const issueTime = input.issueTime && /^\d{2}:\d{2}(:\d{2})?$/.test(input.issueTime) ? (input.issueTime.length === 5 ? `${input.issueTime}:00` : input.issueTime) : today.time;
      const paper = !!input.paperFallback && !external;
      if (paper) {
        if (!input.paperReason || !(PAPER_REASONS as readonly string[]).includes(input.paperReason)) throw new BadRequestException(err('PAPER_REASON_REQUIRED'));
      }
      // VUK 231/5: more than 7 days after delivery needs an explicit, audited confirmation. The check
      // also runs against the day of entry, so a backdated issue date cannot skip it.
      const limit = Number(await this.param('INVOICE_DEADLINE_DAYS', company.country, 7)) || 7;
      if (inv.deliveryDate) {
        const delivery = String(inv.deliveryDate);
        if (isLateInvoice(delivery, issueDate, limit)) {
          const days = daysBetween(delivery, issueDate);
          if (!input.lateConfirm) throw new ConflictException(err('INVOICE_LATE_CONFIRM_REQUIRED', { days, deliveryDate: delivery }));
          late = { days, deliveryDate: delivery, backdated: issueDate < today.date, enteredOn: today.date };
        } else if (issueDate < today.date && isLateInvoice(delivery, today.date, limit)) {
          const days = daysBetween(delivery, today.date);
          if (!input.lateConfirm) throw new ConflictException(err('INVOICE_BACKDATED_CONFIRM_REQUIRED', { days, deliveryDate: delivery, issueDate }));
          late = { days, deliveryDate: delivery, backdated: true, enteredOn: today.date };
        }
        if (late) inv.lateIssueConfirmed = true;
      }
      inv.issuedBeforeDelivery = !inv.deliveryDate || issueDate < String(inv.deliveryDate);
      // e-Belge (WP5): the scenario (TEMEL / TICARI / EARSIV / IHRACAT) follows the receiver's GİB
      // registration, checked right before numbering; the profile is frozen with the invoice.
      const eDoc = company.eDocumentMode === 'PROVIDER' && !paper && this.hooks?.eDocument;
      if (eDoc) await eDoc.beforeInvoiceIssue(m, inv, company);
      const num = await this.numbers.assign(m, company, 'INVOICE', issueDate, {
        externalDocNo: external ? input.externalDocNo : null,
        seriesCode: input.seriesCode || inv.seriesCode,
        paperFallback: paper,
        paperReason: paper ? input.paperReason : null,
        amountTry: Number(inv.grandTotalTry) || null,
        exceptId: inv.id,
      });
      if (inv.replacesDespatch && inv.kind === 'SALES') {
        // The invoice carries the goods: book the quantities not yet despatched (509 V.5.1).
        const at = parseZonedDateTime(`${issueDate}T${issueTime.slice(0, 5)}`, company.timezone) || now;
        for (const orderId of inv.orderIds || []) {
          const parts = inv.lines.filter((l) => !l.despatchLineId && l.orderItemId).map((l) => ({ orderItemId: l.orderItemId as string, quantity: l.baseQuantity }));
          if (parts.length) await this.despatches.shipForInvoiceTx(m, orderId, parts, { documentNo: num.documentNo, date: issueDate, at }, user, touched);
        }
      }
      const buyer = inv.customerId ? await m.findOne(CustomerEntity, { where: { companyId: this.companyId, id: inv.customerId } }) : null;
      const supplier = inv.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: inv.supplierId } }) : null;
      Object.assign(inv, {
        status: 'ISSUED',
        documentNo: num.documentNo,
        seriesCode: num.seriesCode,
        numberMode: num.numberMode,
        issueDate,
        issueTime,
        externalDocNo: num.numberMode === 'EXTERNAL' ? num.documentNo : null,
        externalDocDate: num.numberMode === 'EXTERNAL' ? input.externalDocDate || issueDate : null,
        paperReason: paper ? input.paperReason : null,
        gibNoticeRef: paper ? input.gibNoticeRef || null : null,
        sellerSnapshot: companySnapshot(company),
        buyerSnapshot: buyer ? customerSnapshot(buyer) : supplier ? supplierSnapshot(supplier) : inv.buyerSnapshot,
        issuedAt: now,
        issuedBy: user || this.tenant.actor.username || null,
      });
      const { lines: _l, ...header } = inv;
      await m.save(InvoiceEntity, Object.assign(new InvoiceEntity(), header));
      // UBL-TR build, XSD + schematron validation, archive and outbox; a validation error rolls the issue back.
      if (eDoc && num.numberMode === 'EDOCUMENT') await eDoc.afterInvoiceIssued(m, await this.get(inv.id, m), company);
      return this.get(inv.id, m);
    });
    if (late) {
      await this.audit.record({
        companyId: this.companyId,
        action: 'invoice.late_issue_confirmed',
        entityType: 'invoices',
        entityId: saved.id,
        after: {
          documentNo: saved.documentNo,
          deliveryDate: (late as any).deliveryDate,
          issueDate: saved.issueDate,
          days: (late as any).days,
          backdated: (late as any).backdated,
          enteredOn: (late as any).enteredOn,
        },
      });
    }
    this.emit('update', saved);
    for (const p of touched) this.gateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    for (const o of saved.orderIds || []) this.gateway.emitToCompany(this.companyId, 'order_mutated', { type: 'update', orderId: o });
    return saved;
  }

  /** Cancels an issued invoice (reason required); the quantities become invoiceable again. */
  async cancel(id: string, reason: string, user?: string, notice: Omit<InvoiceCancelInput, 'reason'> = {}): Promise<InvoiceEntity> {
    const why = requireReason(reason);
    const saved = await this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, id }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (inv.status === 'DRAFT') throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: inv.status }));
      if (!canTransition(INVOICE_TRANSITIONS, inv.status, 'CANCELLED')) throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: inv.status }));
      const returns = await m.count(ReturnEntity, { where: { companyId: this.companyId, invoiceId: inv.id } });
      if (returns) throw new ConflictException(err('INVOICE_HAS_RETURNS'));
      // e-Belge: e-Arşiv only within the cancellation window (provider call), e-Fatura only with a notice.
      if (inv.numberMode === 'EDOCUMENT' && this.hooks?.eDocument) await this.hooks.eDocument.beforeInvoiceCancel(m, inv, { reason: why, ...notice });
      await this.release(m, inv);
      const { lines: _l, ...header } = inv;
      await m.save(InvoiceEntity, Object.assign(new InvoiceEntity(), header, { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: user || this.tenant.actor.username || null, cancelReason: why }));
      return this.get(inv.id, m);
    });
    this.emit('update', saved);
    return saved;
  }

  async setObjection(id: string, objection: boolean, note?: string | null, notice: Omit<InvoiceCancelInput, 'reason'> = {}): Promise<InvoiceEntity> {
    const inv = await this.get(id);
    if (!ISSUED_STATES.includes(inv.status)) throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: inv.status }));
    await this.dataSource.transaction(async (m) => {
      if (inv.numberMode === 'EDOCUMENT' && this.hooks?.eDocument) await this.hooks.eDocument.objectionChanged(m, inv, !!objection, { reason: note || '', ...notice });
    });
    await this.dataSource.manager.update(InvoiceEntity, { id: inv.id }, { objection: !!objection, objectionNote: note ? String(note).slice(0, 500) : null });
    const saved = await this.get(id);
    this.emit('update', saved);
    return saved;
  }

  // ------------------------------------------------------------------ return invoices (IADE)
  /** Draft IADE invoice the company issues to a supplier for a purchase return (KDVK 35). */
  async createReturnInvoiceTx(m: EntityManager, ret: ReturnEntity, user?: string): Promise<InvoiceEntity> {
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
    const supplier = ret.supplierId ? await m.findOne(SupplierEntity, { where: { companyId: this.companyId, id: ret.supplierId } }) : null;
    const lines: Partial<InvoiceLineEntity>[] = (ret.items || []).map((it, i) => ({
      companyId: this.companyId,
      lineNo: i + 1,
      originalLineId: it.goodsReceiptItemId ?? null,
      productId: it.productId ?? null,
      productName: it.productName,
      productSku: it.productSku ?? null,
      quantity: it.quantity,
      unitCode: it.unitCode ?? null,
      unitFactor: 1,
      baseQuantity: it.quantity,
      unitPrice: Number(it.unitPrice) || 0,
      grossAmount: it.netAmount,
      discountAmount: 0,
      netAmount: it.netAmount,
      taxRate: it.taxRate,
      taxAmount: it.taxAmount,
      taxes: [{ code: '0015', rate: Number(it.taxRate) || 0, base: it.netAmount, amount: it.taxAmount, exemptionCode: it.exemptionCode ?? null, withholdingCode: it.withholdingCode ?? null, withholdingRate: it.withholdingRate ?? null, withheld: it.withheldTaxAmount }],
      exemptionCode: it.exemptionCode ?? null,
      vatNotCollected: false,
      withholdingCode: it.withholdingCode ?? null,
      withholdingRate: it.withholdingRate ?? null,
      withheldTaxAmount: it.withheldTaxAmount,
      otvAmount: 0,
      lineTotal: it.lineTotal,
      tracking: it.tracking ?? null,
    }));
    const totals = documentTotals({ lines: lines as any });
    const po = ret.purchaseOrderId ? await m.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, id: ret.purchaseOrderId } }) : null;
    const rate = Number(po?.exchangeRate) || 1;
    const inv = m.create(InvoiceEntity, {
      companyId: this.companyId,
      ettn: randomUUID(),
      kind: 'RETURN',
      profileId: supplier?.isTaxpayer === false ? 'EARSIVFATURA' : 'TEMELFATURA',
      typeCode: totals.withheldTaxTotal > 0 ? 'TEVKIFATIADE' : 'IADE',
      status: 'DRAFT',
      deliveryDate: ret.goodsMovedAt ? dateKeyInZone(new Date(ret.goodsMovedAt), company.timezone) : null,
      supplierId: supplier?.id ?? null,
      orderIds: null,
      despatchRefs: null,
      billingReferences: ret.invoiceNo ? [{ documentNo: ret.invoiceNo, issueDate: ret.invoiceDate ?? null, type: 'SUPPLIER_INVOICE', ettn: ret.counterpartyEttn ?? null }] : null,
      sellerSnapshot: companySnapshot(company),
      buyerSnapshot: supplierSnapshot(supplier, ret.partySnapshot?.name),
      currency: ret.currency,
      exchangeRate: rate,
      exchangeRateSource: po?.exchangeRateSource ?? null,
      exchangeRateDate: po?.exchangeRateDate ?? null,
      ...totals,
      subtotalTry: round2(totals.subtotal * rate),
      taxTotalTry: round2(totals.taxTotal * rate),
      grandTotalTry: round2(totals.grandTotal * rate),
      taxBreakdown: buildBreakdown(lines as any),
      charges: null,
      returnId: ret.id,
      createdBy: user || this.tenant.actor.username || null,
      lines: lines.map((l) => m.create(InvoiceLineEntity, l)),
    });
    return m.save(InvoiceEntity, inv);
  }

  private emit(type: string, inv: InvoiceEntity) {
    this.gateway.emitToCompany(this.companyId, 'invoice_mutated', { type, invoice: inv });
  }
}

