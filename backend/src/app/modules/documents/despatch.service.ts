import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { translate } from '../../shared/i18n/messages';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { WarehouseStockService, StockAllocation, isTracked } from '../../shared/services/warehouse-stock.service';
import { AppGateway } from '../../app.gateway';
import { DespatchEntity, DespatchLineEntity } from '../../entities/despatch.entity';
import { InvoiceEntity } from '../../entities/invoice.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { OrderStatus, StockMovementType } from '../../entities/enums';
import { TrackingEntry } from '../../entities/tracking';
import { CarrierParty, DocumentRef, DriverInfo, PartySnapshot, PlateInfo } from '../../entities/document-common';
import { getSpecialTaxIds } from '../../shared/identity/validators';
import {
  addQty,
  DESPATCH_PURPOSES,
  DESPATCH_TRANSFER_PURPOSES,
  isValidDriverTckn,
  isValidTrPlate,
  normalizePlate,
  PAPER_REASONS,
  parseZonedDateTime,
  roundQty,
  sumQty,
  isDateKey,
  dateKeyInZone,
  timeKeyInZone,
} from '../../shared/tr';
import { DocumentNumberService } from './document-number.service';
import { AuditService } from '../integrations/audit.service';
import { assertFiscalComplete, companySnapshot, customerSnapshot, DocumentHooks, nowParts, supplierSnapshot, warehouseAddress } from './document-support';

export interface DespatchLineInput {
  orderItemId?: string | null;
  productId?: string | null;
  quantity: number;
  warehouseId?: string | null;
  lots?: { lotId: string; quantity: number }[] | null;
  serials?: string[] | null;
}

export interface DespatchInput {
  purpose?: string;
  sourceWarehouseId?: string | null;
  targetWarehouseId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  lines?: DespatchLineInput[];
  actualDespatchAt?: string | null;
  carrierParty?: CarrierParty | null;
  drivers?: DriverInfo[] | null;
  plates?: PlateInfo[] | null;
  deliveryAddress?: PartySnapshot['address'] | null;
  typeCode?: string | null;
  paperNo?: string | null;
  paperDate?: string | null;
  paperReason?: string | null;
  gibNoticeRef?: string | null;
  seriesCode?: string | null;
  note?: string | null;
  invoiceRefs?: DocumentRef[] | null;
}

export interface ApproveInput {
  actualDespatchAt?: string | null;
  externalDocNo?: string | null;
  seriesCode?: string | null;
  /** e-Belge mode NONE while e-İrsaliye is mandatory: 509 V.7 reason for using the paper series. */
  paperReason?: string | null;
}

/** Internal control: how far ahead of approval the actual despatch time may be (stock leaves on approval). */
const MAX_DESPATCH_LEAD_HOURS = 24;

/** Despatch purposes whose approval moves stock straight to the target warehouse (own goods at a third party). */
const DIRECT_TRANSFER: string[] = ['CONSIGNMENT', 'REPAIR', 'SUBCONTRACT'];

/**
 * Sevk irsaliyesi lifecycle (VUK 230/5; 509 IV.3, V.5.3; e-İrsaliye Kılavuzu §14-15).
 * - Sales despatches are created from orders; in 'despatch' stock mode approval books the sale
 *   (WarehouseStockService) and the order completes when fully despatched.
 * - Transfers move stock to an IN_TRANSIT warehouse on approval and to the target on receipt.
 * - No cancellation: an approved despatch is frozen (DB triggers).
 */
@Injectable()
export class DespatchService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly warehouseStock: WarehouseStockService,
    private readonly numbers: DocumentNumberService,
    private readonly hooks: DocumentHooks,
    private readonly gateway: AppGateway,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  // ------------------------------------------------------------------ reads
  /** 404 ORDER_NOT_FOUND unless the order belongs to the current company. */
  async requireOrder(orderId: string): Promise<void> {
    if (!(await this.dataSource.manager.exists(OrderEntity, { where: { companyId: this.companyId, id: orderId }, withDeleted: true }))) {
      throw new NotFoundException(err('ORDER_NOT_FOUND'));
    }
  }

  async list(filter: { status?: string; purpose?: string; orderId?: string } = {}): Promise<DespatchEntity[]> {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (filter.status) where['status'] = filter.status;
    if (filter.purpose) where['purpose'] = filter.purpose;
    if (filter.orderId) where['orderId'] = filter.orderId;
    const rows = await this.dataSource.manager.find(DespatchEntity, { where, relations: { lines: true }, order: { createdAt: 'DESC' } });
    rows.forEach((r) => r.lines?.sort((a, b) => a.lineNo - b.lineNo));
    return rows;
  }

  async get(id: string, manager: EntityManager = this.dataSource.manager): Promise<DespatchEntity> {
    const d = await manager.findOne(DespatchEntity, { where: { companyId: this.companyId, id }, relations: { lines: true } });
    if (!d) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    d.lines?.sort((a, b) => a.lineNo - b.lineNo);
    return d;
  }

  // ------------------------------------------------------------------ validation helpers
  private validateTransport(input: Pick<DespatchInput, 'drivers' | 'plates'>, country: string): void {
    for (const d of input.drivers || []) {
      const tckn = String(d?.tckn ?? '').trim();
      if (!isValidDriverTckn(tckn, getSpecialTaxIds())) throw new BadRequestException(err('DRIVER_TCKN_INVALID', { tckn }));
    }
    for (const p of input.plates || []) {
      const plate = normalizePlate(p?.plate);
      if (!plate || plate.length > 20 || (country === 'TR' && !(p as PlateInfo & { foreign?: boolean }).foreign && !isValidTrPlate(plate))) {
        throw new BadRequestException(err('DESPATCH_PLATE_INVALID', { plate: plate || '-' }));
      }
    }
  }

  private cleanTransport(input: DespatchInput) {
    return {
      drivers: input.drivers?.map((d) => ({ firstName: String(d.firstName || '').trim(), lastName: String(d.lastName || '').trim(), tckn: String(d.tckn || '').trim() })) ?? undefined,
      plates: input.plates?.map((p) => ({ plate: normalizePlate(p.plate), type: p.type || 'TRUCK', ...((p as any).foreign ? { foreign: true } : {}) })) ?? undefined,
    };
  }

  private async company(manager: EntityManager): Promise<CompanyEntity> {
    return manager.findOneOrFail(CompanyEntity, { where: { id: this.companyId } });
  }

  private async uneceCode(manager: EntityManager, product: ProductEntity): Promise<string | null> {
    const u = product.baseUnitId ? await manager.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: this.companyId } }) : null;
    return u?.uneceCode || product.unit || null;
  }

  /** Active warehouse of the given type (IN_TRANSIT / QUARANTINE), created when the company has none. */
  async ensureSpecialWarehouse(manager: EntityManager, type: 'IN_TRANSIT' | 'QUARANTINE'): Promise<WarehouseEntity> {
    const found = await manager.findOne(WarehouseEntity, { where: { companyId: this.companyId, type, isDeleted: false }, order: { createdAt: 'ASC' } });
    if (found) return found;
    const base = type === 'IN_TRANSIT' ? 'TRANSIT' : 'KARANTINA';
    const nameKey = type === 'IN_TRANSIT' ? 'IN_TRANSIT_WAREHOUSE_NAME' : 'QUARANTINE_WAREHOUSE_NAME';
    let code = base;
    for (let i = 2; await manager.exists(WarehouseEntity, { where: { companyId: this.companyId, code } }); i++) code = `${base}-${i}`;
    let name = translate(nameKey, 'tr');
    for (let i = 2; await manager.exists(WarehouseEntity, { where: { companyId: this.companyId, name } }); i++) name = `${translate(nameKey, 'tr')} ${i}`;
    return manager.save(WarehouseEntity, manager.create(WarehouseEntity, { companyId: this.companyId, name, code, type, isSellable: false, ownership: 'OWN', isBranch: false }));
  }

  /** Draft quantities per order item on other DRAFT despatches of the order. */
  private async draftQuantities(manager: EntityManager, orderId: string, exceptDespatchId?: string): Promise<Map<string, number>> {
    const drafts = await manager.find(DespatchEntity, { where: { companyId: this.companyId, orderId, status: 'DRAFT' }, relations: { lines: true } });
    const out = new Map<string, number>();
    for (const d of drafts) {
      if (d.id === exceptDespatchId) continue;
      for (const l of d.lines || []) if (l.orderItemId) out.set(l.orderItemId, addQty(out.get(l.orderItemId) || 0, l.quantity));
    }
    return out;
  }

  /** Warehouse the stock of an order-mode order left from (its first sale movement). */
  private async orderSourceWarehouse(manager: EntityManager, order: OrderEntity): Promise<string | null> {
    const m = await manager.findOne(StockMovementEntity, { where: { companyId: this.companyId, referenceId: order.orderNumber, type: StockMovementType.ORDER }, order: { sequenceNo: 'ASC' } });
    return m?.warehouseId ?? null;
  }

  // ------------------------------------------------------------------ create
  /** Draft despatch advice for (the remaining quantities of) an order. */
  async createFromOrder(orderId: string, input: DespatchInput, user?: string): Promise<DespatchEntity> {
    const saved = await this.dataSource.transaction((m) => this.createFromOrderTx(m, orderId, input, user));
    this.emit('create', saved);
    return saved;
  }

  async createFromOrderTx(manager: EntityManager, orderId: string, input: DespatchInput, user?: string): Promise<DespatchEntity> {
    const order = await manager.findOne(OrderEntity, { where: { companyId: this.companyId, id: orderId }, relations: { items: true }, lock: { mode: 'pessimistic_write' } });
    if (!order) throw new NotFoundException(err('ORDER_NOT_FOUND'));
    if (order.status === OrderStatus.CANCELLED) throw new BadRequestException(err('DESPATCH_ORDER_NOT_OPEN', { number: order.orderNumber, status: order.status }));
    const company = await this.company(manager);
    this.validateTransport(input, company.country || 'TR');
    const drafts = await this.draftQuantities(manager, order.id);
    const requested: DespatchLineInput[] = input.lines?.length
      ? input.lines
      : order.items.map((i) => ({ orderItemId: i.id, quantity: roundQty(i.quantity - (i.despatchedQuantity || 0) - (drafts.get(i.id) || 0)) }));
    const lines: Partial<DespatchLineEntity>[] = [];
    for (const r of requested) {
      const item = order.items.find((i) => i.id === r.orderItemId);
      if (!item) throw new BadRequestException(err('RETURN_LINE_NOT_FOUND', { id: r.orderItemId || '-' }));
      const q = roundQty(Number(r.quantity));
      if (!(q > 0)) continue;
      const remaining = roundQty(item.quantity - (item.despatchedQuantity || 0) - (drafts.get(item.id) || 0));
      if (q > remaining) throw new BadRequestException(err('DESPATCH_QTY_EXCEEDS_ORDER', { name: item.productName, requested: q, available: Math.max(0, remaining) }));
      const product = item.productId ? await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: item.productId } }) : null;
      lines.push({
        orderItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        productSku: product?.sku ?? null,
        quantity: q,
        unitCode: product ? await this.uneceCode(manager, product) : null,
        unitPrice: item.quantity ? Math.round(((Number(item.netAmount) || 0) / item.quantity) * 1e6) / 1e6 : null,
        warehouseId: r.warehouseId || null,
        lots: r.lots?.length ? r.lots : null,
        serials: r.serials?.length ? r.serials : null,
      });
    }
    if (!lines.length) throw new BadRequestException(err('DESPATCH_LINES_REQUIRED'));
    const customer = order.customerId ? await manager.findOne(CustomerEntity, { where: { companyId: this.companyId, id: order.customerId } }) : null;
    let sourceId = input.sourceWarehouseId || (order.stockMode === 'despatch' ? null : await this.orderSourceWarehouse(manager, order));
    if (!sourceId) sourceId = (await this.warehouseStock.defaultWarehouse(manager, this.companyId)).id;
    const source = await this.warehouseStock.requireWarehouse(manager, this.companyId, sourceId);
    const buyer = customerSnapshot(customer, order.customerName);
    const transport = this.cleanTransport(input);
    const d = manager.create(DespatchEntity, {
      companyId: this.companyId,
      ettn: randomUUID(),
      purpose: 'SALE',
      status: 'DRAFT',
      typeCode: input.typeCode === 'MATBUDAN' ? 'MATBUDAN' : 'SEVK',
      profileId: 'TEMELIRSALIYE',
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: customer?.id ?? null,
      sourceWarehouseId: source.id,
      stockEffect: order.stockMode === 'despatch',
      sellerSnapshot: companySnapshot(company),
      buyerSnapshot: buyer,
      deliveryAddress: input.deliveryAddress || buyer.address || null,
      originAddress: warehouseAddress(source),
      carrierParty: input.carrierParty || (order.carrier ? { name: order.carrier } : null),
      drivers: transport.drivers ?? null,
      plates: transport.plates ?? null,
      actualDespatchAt: input.actualDespatchAt ? parseZonedDateTime(input.actualDespatchAt, company.timezone) : null,
      invoiceRefs: input.invoiceRefs ?? null,
      seriesCode: input.seriesCode || null,
      paperNo: input.paperNo || null,
      paperDate: input.paperDate || null,
      paperReason: input.paperReason || null,
      gibNoticeRef: input.gibNoticeRef || null,
      invoiceStatus: 'NONE',
      note: input.note || null,
      createdBy: user || this.tenant.actor.username || null,
      lines: lines.map((l, i) => manager.create(DespatchLineEntity, { ...l, companyId: this.companyId, lineNo: i + 1 })),
    });
    return manager.save(DespatchEntity, d);
  }

  /** Draft despatch advice that is not a sale: transfer, consignment, repair, sample, subcontract, return. */
  async create(input: DespatchInput, user?: string): Promise<DespatchEntity> {
    const saved = await this.dataSource.transaction((m) => this.createTx(m, input, user));
    this.emit('create', saved);
    return saved;
  }

  async createTx(manager: EntityManager, input: DespatchInput, user?: string, extra: Partial<DespatchEntity> = {}): Promise<DespatchEntity> {
    const purpose = String(input.purpose || '');
    if (!(DESPATCH_PURPOSES as readonly string[]).includes(purpose)) throw new BadRequestException(err('VALIDATION_FIELD_IN', { property: 'purpose', value: purpose }));
    if (purpose === 'SALE') throw new BadRequestException(err('DESPATCH_ORDER_REQUIRED'));
    const company = await this.company(manager);
    this.validateTransport(input, company.country || 'TR');
    if (!input.sourceWarehouseId && purpose !== 'PURCHASE_PICKUP') throw new BadRequestException(err('DESPATCH_WAREHOUSE_REQUIRED'));
    const source = input.sourceWarehouseId ? await this.warehouseStock.requireWarehouse(manager, this.companyId, input.sourceWarehouseId) : null;
    const needsTarget = (DESPATCH_TRANSFER_PURPOSES as string[]).includes(purpose);
    const target = input.targetWarehouseId ? await this.warehouseStock.requireWarehouse(manager, this.companyId, input.targetWarehouseId) : null;
    if (needsTarget && (!target || target.id === source?.id)) throw new BadRequestException(err('DESPATCH_TARGET_WAREHOUSE_REQUIRED'));
    if (!input.lines?.length) throw new BadRequestException(err('DESPATCH_LINES_REQUIRED'));
    const lines: Partial<DespatchLineEntity>[] = [];
    for (const r of input.lines) {
      const product = r.productId ? await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: r.productId, isDeleted: false } }) : null;
      if (!product) throw new BadRequestException(err('PRODUCT_NOT_FOUND_ID', { id: r.productId || '-' }));
      const q = roundQty(Number(r.quantity));
      if (!(q > 0)) throw new BadRequestException(err('QUANTITY_INVALID'));
      lines.push({
        productId: product.id, productName: product.name, productSku: product.sku ?? null, quantity: q, unitCode: await this.uneceCode(manager, product),
        warehouseId: r.warehouseId || null, lots: r.lots?.length ? r.lots : null, serials: r.serials?.length ? r.serials : null,
      });
    }
    const customer = input.customerId ? await manager.findOne(CustomerEntity, { where: { companyId: this.companyId, id: input.customerId } }) : null;
    const supplier = input.supplierId ? await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: input.supplierId } }) : null;
    if (input.customerId && !customer) throw new BadRequestException(err('CUSTOMER_NOT_FOUND'));
    if (input.supplierId && !supplier) throw new BadRequestException(err('PO_SUPPLIER_NOT_FOUND', { id: input.supplierId }));
    // Transfers between own premises: the receiver is the company itself (its own VKN).
    const self = companySnapshot(company);
    const buyer: PartySnapshot = customer ? customerSnapshot(customer) : supplier ? supplierSnapshot(supplier) : self;
    const transport = this.cleanTransport(input);
    const stockEffect = !['RETURN', 'PURCHASE_PICKUP'].includes(purpose);
    const d = manager.create(DespatchEntity, {
      companyId: this.companyId,
      ettn: randomUUID(),
      purpose,
      status: 'DRAFT',
      typeCode: input.typeCode === 'MATBUDAN' ? 'MATBUDAN' : 'SEVK',
      profileId: 'TEMELIRSALIYE',
      customerId: customer?.id ?? null,
      supplierId: supplier?.id ?? null,
      sourceWarehouseId: source?.id ?? null,
      targetWarehouseId: target?.id ?? null,
      stockEffect,
      sellerSnapshot: self,
      buyerSnapshot: buyer,
      deliveryAddress: input.deliveryAddress || (target ? warehouseAddress(target) : buyer.address || null),
      originAddress: source ? warehouseAddress(source) : null,
      carrierParty: input.carrierParty || null,
      drivers: transport.drivers ?? null,
      plates: transport.plates ?? null,
      actualDespatchAt: input.actualDespatchAt ? parseZonedDateTime(input.actualDespatchAt, company.timezone) : null,
      seriesCode: input.seriesCode || null,
      paperNo: input.paperNo || null,
      paperDate: input.paperDate || null,
      paperReason: input.paperReason || null,
      gibNoticeRef: input.gibNoticeRef || null,
      invoiceStatus: 'NA',
      note: input.note || null,
      createdBy: user || this.tenant.actor.username || null,
      lines: lines.map((l, i) => manager.create(DespatchLineEntity, { ...l, companyId: this.companyId, lineNo: i + 1 })),
      ...extra,
    });
    return manager.save(DespatchEntity, d);
  }

  /** Edits a draft (transport data, dates, lines); 409 DOCUMENT_IMMUTABLE once approved. */
  async update(id: string, input: DespatchInput, user?: string): Promise<DespatchEntity> {
    const saved = await this.dataSource.transaction(async (m) => {
      const d = await m.findOne(DespatchEntity, { where: { companyId: this.companyId, id }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } });
      if (!d) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (d.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
      const company = await this.company(m);
      this.validateTransport(input, company.country || 'TR');
      const t = this.cleanTransport(input);
      if (t.drivers !== undefined) d.drivers = t.drivers;
      if (t.plates !== undefined) d.plates = t.plates;
      if (input.carrierParty !== undefined) d.carrierParty = input.carrierParty;
      if (input.actualDespatchAt !== undefined) d.actualDespatchAt = input.actualDespatchAt ? parseZonedDateTime(input.actualDespatchAt, company.timezone) : null;
      if (input.deliveryAddress !== undefined) d.deliveryAddress = input.deliveryAddress;
      if (input.typeCode !== undefined) d.typeCode = input.typeCode === 'MATBUDAN' ? 'MATBUDAN' : 'SEVK';
      for (const k of ['paperNo', 'paperDate', 'paperReason', 'gibNoticeRef', 'seriesCode', 'note'] as const) {
        if (input[k] !== undefined) (d as any)[k] = input[k] || null;
      }
      if (input.lines?.length) {
        if (d.orderId) {
          const order = await m.findOneOrFail(OrderEntity, { where: { companyId: this.companyId, id: d.orderId }, relations: { items: true } });
          const drafts = await this.draftQuantities(m, d.orderId, d.id);
          for (const r of input.lines) {
            const item = order.items.find((i) => i.id === r.orderItemId);
            const old = d.lines.find((l) => l.orderItemId === r.orderItemId);
            if (!item || !old) throw new BadRequestException(err('RETURN_LINE_NOT_FOUND', { id: r.orderItemId || '-' }));
            const q = roundQty(Number(r.quantity));
            const remaining = roundQty(item.quantity - (item.despatchedQuantity || 0) - (drafts.get(item.id) || 0));
            if (q > remaining) throw new BadRequestException(err('DESPATCH_QTY_EXCEEDS_ORDER', { name: item.productName, requested: q, available: Math.max(0, remaining) }));
            old.quantity = q;
            if (r.warehouseId !== undefined) old.warehouseId = r.warehouseId || null;
            if (r.lots !== undefined) old.lots = r.lots?.length ? r.lots : null;
            if (r.serials !== undefined) old.serials = r.serials?.length ? r.serials : null;
          }
          const zero = d.lines.filter((l) => !(l.quantity > 0));
          if (zero.length) await m.remove(DespatchLineEntity, zero);
          d.lines = d.lines.filter((l) => l.quantity > 0);
          if (!d.lines.length) throw new BadRequestException(err('DESPATCH_LINES_REQUIRED'));
        }
      }
      if (input.sourceWarehouseId) {
        const w = await this.warehouseStock.requireWarehouse(m, this.companyId, input.sourceWarehouseId);
        d.sourceWarehouseId = w.id;
        d.originAddress = warehouseAddress(w);
      }
      return m.save(DespatchEntity, d);
    });
    this.emit('update', saved);
    return saved;
  }

  /** Deletes a draft. An approved despatch advice cannot be cancelled or deleted. */
  async remove(id: string): Promise<{ success: boolean }> {
    const d = await this.get(id);
    if (d.status !== 'DRAFT') throw new ConflictException(err('DESPATCH_CANNOT_BE_CANCELLED'));
    await this.dataSource.manager.remove(DespatchEntity, d);
    this.gateway.emitToCompany(this.companyId, 'despatch_mutated', { type: 'delete', despatchId: id });
    return { success: true };
  }

  /** There is no cancellation of a despatch advice (e-İrsaliye Kılavuzu §14). */
  cancel(): never {
    throw new ConflictException(err('DESPATCH_CANNOT_BE_CANCELLED'));
  }

  // ------------------------------------------------------------------ approve
  async approve(id: string, input: ApproveInput = {}, user?: string): Promise<DespatchEntity> {
    const products: ProductEntity[] = [];
    const saved = await this.dataSource.transaction((m) => this.approveTx(m, id, input, user, products));
    // 509 V.5.3: the despatch advice is issued before the goods leave; approving afterwards is logged.
    const lateMs = saved.approvedAt && saved.actualDespatchAt ? new Date(saved.approvedAt).getTime() - new Date(saved.actualDespatchAt).getTime() : 0;
    if (lateMs > 3600_000 && this.audit) {
      await this.audit.record({
        companyId: this.companyId,
        action: 'despatch.late_approval',
        entityType: 'despatches',
        entityId: saved.id,
        after: { documentNo: saved.documentNo, actualDespatchAt: new Date(saved.actualDespatchAt as Date).toISOString(), approvedAt: new Date(saved.approvedAt as Date).toISOString(), hoursLate: Math.round(lateMs / 3600_000) },
      });
    }
    this.emit('update', saved);
    if (saved.orderId) this.gateway.emitToCompany(this.companyId, 'order_mutated', { type: 'update', orderId: saved.orderId });
    for (const p of products) this.gateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    return saved;
  }

  /** `clock`: issue time (seeding / back-office import of an already issued paper despatch); default now. */
  async approveTx(manager: EntityManager, id: string, input: ApproveInput, user: string | undefined, touched: ProductEntity[] = [], clock?: Date): Promise<DespatchEntity> {
    // Movement chain lock first (same lock order as every stock transaction).
    await this.warehouseStock.begin(manager, this.companyId);
    const d = await manager.findOne(DespatchEntity, { where: { companyId: this.companyId, id }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } });
    if (!d) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    if (d.status !== 'DRAFT') throw new ConflictException(err('DOCUMENT_IMMUTABLE'));
    d.lines.sort((a, b) => a.lineNo - b.lineNo);
    const company = await this.company(manager);
    if ((company.country || 'TR') === 'TR') assertFiscalComplete(company);
    this.validateTransport(d, company.country || 'TR');
    if (d.typeCode === 'MATBUDAN') {
      if (company.eDocumentMode !== 'PROVIDER') throw new BadRequestException(err('EINVOICE_MODE_REQUIRED'));
      if (!d.paperNo || !d.paperDate || !d.paperReason || !(PAPER_REASONS as readonly string[]).includes(d.paperReason)) {
        throw new BadRequestException(err('PAPER_REASON_REQUIRED'));
      }
    }
    const now = clock && clock.getTime() < Date.now() ? clock : new Date();
    let at = input.actualDespatchAt ? parseZonedDateTime(input.actualDespatchAt, company.timezone) : d.actualDespatchAt ? new Date(d.actualDespatchAt) : now;
    if (!at || Number.isNaN(at.getTime())) throw new BadRequestException(err('DESPATCH_TIME_REQUIRED'));
    if (d.typeCode === 'MATBUDAN' && !input.actualDespatchAt && !d.actualDespatchAt && d.paperDate && isDateKey(d.paperDate)) {
      // The goods left with the paper despatch: its date is the actual despatch time.
      at = parseZonedDateTime(d.paperDate, company.timezone) || at;
    }
    if (!clock && at.getTime() > now.getTime() + MAX_DESPATCH_LEAD_HOURS * 3600_000) {
      throw new BadRequestException(err('DESPATCH_TIME_TOO_FAR', { at: `${dateKeyInZone(at, company.timezone)} ${timeKeyInZone(at, company.timezone).slice(0, 5)}`, hours: MAX_DESPATCH_LEAD_HOURS }));
    }
    // e-İrsaliye content (Kılavuz §15): a driver or a carrier party is required.
    if (company.eDocumentMode === 'PROVIDER' && d.typeCode !== 'MATBUDAN' && !(d.drivers || []).length && !d.carrierParty?.name) {
      throw new BadRequestException(err('DESPATCH_TRANSPORT_REQUIRED'));
    }
    const txDate = new Date(Math.min(at.getTime(), now.getTime()));
    const issue = nowParts(company.timezone, now);
    // e-Belge (WP5): provider configured, receiver's e-İrsaliye registration -> delivery channel.
    const eDoc = company.eDocumentMode === 'PROVIDER' && this.hooks.eDocument;
    if (eDoc) await eDoc.beforeDespatchApprove(manager, d, company);
    const paperReason = input.paperReason && (PAPER_REASONS as readonly string[]).includes(input.paperReason) ? input.paperReason : null;
    const source = d.sourceWarehouseId ? await manager.findOne(WarehouseEntity, { where: { companyId: this.companyId, id: d.sourceWarehouseId } }) : null;
    const num = await this.numbers.assign(manager, company, 'DESPATCH', issue.date, {
      externalDocNo: input.externalDocNo,
      seriesCode: input.seriesCode || d.seriesCode,
      warehouseSeries: source?.defaultSeries ?? null,
      paperReason,
      exceptId: d.id,
    });
    const order = d.orderId ? await manager.findOne(OrderEntity, { where: { companyId: this.companyId, id: d.orderId }, relations: { items: true, charges: true }, lock: { mode: 'pessimistic_write' } }) : null;
    if (d.orderId && (!order || order.status === OrderStatus.CANCELLED)) {
      throw new BadRequestException(err('DESPATCH_ORDER_NOT_OPEN', { number: d.orderNumber || '-', status: order?.status || '-' }));
    }
    const docInfo = {
      documentType: 'DESPATCH',
      documentNo: num.documentNo,
      documentDate: issue.date,
      transactionDate: txDate,
      referenceId: d.id,
      referenceType: 'despatch',
      performedBy: user,
    };

    if (d.stockEffect) {
      if (d.purpose === 'SALE') {
        const customer = order?.customerId ? await manager.findOne(CustomerEntity, { where: { companyId: this.companyId, id: order.customerId } }) : null;
        for (const line of d.lines) {
          line.tracking = await this.issueSaleLine(manager, line, d.sourceWarehouseId, {
            ...docInfo,
            counterpartyTaxId: partyId(customer?.identityNumber),
            note: `İrsaliye ${num.documentNo} (${d.orderNumber})`,
            documentId: d.id,
            party: { type: 'CUSTOMER', id: customer?.id ?? d.customerId ?? null, name: d.buyerSnapshot?.legalName || d.buyerSnapshot?.name || customer?.name || order?.customerName || null, taxId: d.buyerSnapshot?.taxId ?? partyId(customer?.identityNumber), orderId: order?.id ?? null },
          }, touched);
        }
      } else if (d.purpose === 'TRANSFER' || DIRECT_TRANSFER.includes(d.purpose)) {
        const target = d.purpose === 'TRANSFER' ? await this.ensureSpecialWarehouse(manager, 'IN_TRANSIT') : await this.warehouseStock.requireWarehouse(manager, this.companyId, d.targetWarehouseId as string);
        if (d.purpose === 'TRANSFER') d.inTransitWarehouseId = target.id;
        for (const line of d.lines) {
          line.tracking = await this.moveLine(manager, line, line.warehouseId || (d.sourceWarehouseId as string), target.id, { ...docInfo, note: `İrsaliye ${num.documentNo}` }, touched);
        }
      } else if (d.purpose === 'SAMPLE') {
        for (const line of d.lines) {
          line.tracking = await this.issueLine(manager, line, d.sourceWarehouseId, { ...docInfo, type: StockMovementType.OUT, reasonCode: 'GIFT_SAMPLE', note: `Numune irsaliyesi ${num.documentNo}` }, touched);
        }
      }
    }

    // Order bookkeeping: despatched quantities, invoices issued before delivery, shipment / completion.
    if (order) {
      const issuedInvoices = await manager.find(InvoiceEntity, { where: { companyId: this.companyId, status: In(['ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'ACCEPTED']) } });
      const refs = issuedInvoices.filter((i) => (i.orderIds || []).includes(order.id)).map((i) => ({ id: i.id, documentNo: i.documentNo ?? null, issueDate: i.issueDate ?? null, type: 'INVOICE' }));
      if (refs.length) d.invoiceRefs = [...(d.invoiceRefs || []), ...refs.filter((r) => !(d.invoiceRefs || []).some((x) => x.id === r.id))];
      for (const line of d.lines) {
        const item = order.items.find((i) => i.id === line.orderItemId);
        if (!item) continue;
        // Quantities invoiced before this delivery (invoice before delivery) count as invoiced on this line.
        const preInvoiced = Math.max(0, roundQty((item.invoicedQuantity || 0) - (item.despatchedQuantity || 0)));
        line.invoicedQuantity = Math.min(line.quantity, preInvoiced);
        item.despatchedQuantity = addQty(item.despatchedQuantity || 0, line.quantity);
        const patch: Partial<OrderItemEntity> = { despatchedQuantity: item.despatchedQuantity };
        if (line.tracking?.length && d.stockEffect) patch.tracking = [...(item.tracking || []), ...line.tracking];
        await manager.update(OrderItemEntity, { id: item.id }, patch);
      }
      const invoicedAll = d.lines.every((l) => roundQty(l.invoicedQuantity) >= roundQty(l.quantity));
      const invoicedAny = d.lines.some((l) => l.invoicedQuantity > 0);
      d.invoiceStatus = invoicedAll ? 'FULL' : invoicedAny ? 'PARTIAL' : 'NONE';
    }

    // Lines first: once the header is APPROVED the line triggers freeze them.
    for (const line of d.lines) {
      await manager.update(DespatchLineEntity, { id: line.id }, { tracking: line.tracking ?? null, invoicedQuantity: line.invoicedQuantity || 0 });
    }
    Object.assign(d, {
      status: 'APPROVED',
      documentNo: num.documentNo,
      seriesCode: num.seriesCode,
      numberMode: num.numberMode,
      issueDate: issue.date,
      issueTime: issue.time,
      actualDespatchAt: at,
      approvedAt: now,
      approvedBy: user || this.tenant.actor.username || null,
      deliveryChannel: company.eDocumentMode === 'PROVIDER' ? d.deliveryChannel || 'GIB' : 'PRINT',
      sellerSnapshot: companySnapshot(company),
      ...(num.numberMode === 'PAPER' && paperReason && d.typeCode !== 'MATBUDAN' ? { paperReason } : {}),
    });
    const { lines, ...header } = d;
    await manager.save(DespatchEntity, Object.assign(new DespatchEntity(), header));

    if (order) {
      const fresh = await manager.findOneOrFail(OrderEntity, { where: { companyId: this.companyId, id: order.id }, relations: { items: true, charges: true } });
      if (!fresh.taxFrozenAt || !fresh.shippedAt) {
        if (this.hooks.orderShipped) await this.hooks.orderShipped(manager, fresh, at);
        else await manager.update(OrderEntity, { id: fresh.id }, { shippedAt: fresh.shippedAt || at });
      }
      const done = fresh.items.every((i) => roundQty(i.despatchedQuantity || 0) >= roundQty(i.quantity));
      if (done && fresh.status === OrderStatus.PENDING) await manager.update(OrderEntity, { id: fresh.id }, { status: OrderStatus.COMPLETED });
    }
    d.lines = lines;
    const approved = await this.get(d.id, manager);
    // UBL-TR build, validation, archive and outbox (a validation error rolls the approval back).
    if (eDoc && approved.numberMode === 'EDOCUMENT') await eDoc.afterDespatchApproved(manager, approved, company);
    return approved;
  }

  /** Sale line: stock leaves the source warehouse (lots / serials as picked, else FEFO / FIFO). */
  private async issueSaleLine(manager: EntityManager, line: DespatchLineEntity, sourceId: string | null | undefined, info: Record<string, any>, touched: ProductEntity[]): Promise<TrackingEntry[]> {
    return this.issueLine(manager, line, sourceId, { ...info, type: StockMovementType.ORDER, reasonCode: 'SALE', sale: true }, touched);
  }

  private async issueLine(manager: EntityManager, line: DespatchLineEntity, sourceId: string | null | undefined, info: Record<string, any>, touched: ProductEntity[]): Promise<TrackingEntry[]> {
    const product = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: line.productId as string }, lock: { mode: 'pessimistic_write' } });
    if (!product) throw new BadRequestException(err('PRODUCT_NOT_FOUND_NAME', { name: line.productName }));
    const old = product.quantity;
    const { sale, ...movement } = info;
    const allocations = await this.warehouseStock.issue(
      manager,
      product,
      line.quantity,
      line.warehouseId || sourceId,
      { lots: line.lots || undefined, serials: line.serials || undefined },
      { sale: !!sale },
    );
    await this.warehouseStock.recordMovements(manager, product, old, allocations, movement as any);
    touched.push(product);
    return this.warehouseStock.toTracking(allocations);
  }

  /** Moves a line between two own warehouses (transfer legs typed like WarehouseService transfers). */
  private async moveLine(manager: EntityManager, line: Pick<DespatchLineEntity, 'productId' | 'productName' | 'quantity' | 'lots' | 'serials'>, fromId: string, toId: string, info: Record<string, any>, touched: ProductEntity[], entries?: TrackingEntry[]): Promise<TrackingEntry[]> {
    const product = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: line.productId as string }, lock: { mode: 'pessimistic_write' } });
    if (!product) throw new BadRequestException(err('PRODUCT_NOT_FOUND_NAME', { name: line.productName }));
    const from = await this.warehouseStock.requireWarehouse(manager, this.companyId, fromId);
    const to = await this.warehouseStock.requireWarehouse(manager, this.companyId, toId);
    const outs: StockAllocation[] = [];
    const ins: StockAllocation[] = [];
    // Explicit picks (lots / serials), the entries of an earlier leg, or automatic allocation.
    const picks: { qty: number; lotId?: string | null; serials?: string[] }[] = entries?.length
      ? entries.map((e) => ({ qty: e.quantity, lotId: e.lotId ?? null, serials: e.serials }))
      : line.lots?.length
        ? line.lots.map((l) => ({ qty: Number(l.quantity), lotId: l.lotId }))
        : [{ qty: line.quantity, serials: line.serials || undefined }];
    if (roundQty(sumQty(picks.map((p) => p.qty))) !== roundQty(line.quantity)) throw new BadRequestException(err('LOT_QUANTITY_MISMATCH', { name: product.name, expected: line.quantity, actual: sumQty(picks.map((p) => p.qty)) }));
    for (const p of picks) {
      const moved = await this.warehouseStock.transfer(manager, product, from.id, to.id, roundQty(p.qty), { lotId: p.lotId ?? null, serials: p.serials });
      outs.push(...moved.out);
      ins.push(...moved.in);
    }
    const outType = from.type === 'QUARANTINE' ? StockMovementType.QUARANTINE_OUT : StockMovementType.TRANSFER_OUT;
    const inType = to.type === 'QUARANTINE' ? StockMovementType.QUARANTINE_IN : StockMovementType.TRANSFER_IN;
    await this.warehouseStock.recordMovements(manager, product, product.quantity, [...outs.map((a) => ({ ...a, type: outType })), ...ins.map((a) => ({ ...a, type: inType }))], {
      type: StockMovementType.TRANSFER_OUT,
      reasonCode: 'TRANSFER',
      totalsUnchanged: true,
      ...(info as any),
    });
    touched.push(product);
    return this.warehouseStock.toTracking(ins);
  }

  /**
   * İrsaliye yerine geçen fatura (509 V.5.1): the invoice is the shipping document, so issuing it
   * books the not yet despatched quantities of a 'despatch'-mode order (stock leaves now).
   */
  async shipForInvoiceTx(
    manager: EntityManager,
    orderId: string,
    parts: { orderItemId: string; quantity: number }[],
    doc: { documentNo: string; date: string; at: Date },
    user: string | undefined,
    touched: ProductEntity[],
  ): Promise<void> {
    const order = await manager.findOne(OrderEntity, { where: { companyId: this.companyId, id: orderId }, relations: { items: true, charges: true }, lock: { mode: 'pessimistic_write' } });
    if (!order) return;
    const customer = order.customerId ? await manager.findOne(CustomerEntity, { where: { companyId: this.companyId, id: order.customerId } }) : null;
    const txDate = new Date(Math.min(doc.at.getTime(), Date.now()));
    for (const p of parts) {
      const item = order.items.find((i) => i.id === p.orderItemId);
      if (!item) continue;
      const open = Math.max(0, roundQty(item.quantity - (item.despatchedQuantity || 0)));
      const q = Math.min(open, roundQty(p.quantity));
      if (!(q > 0)) continue;
      let tracking: TrackingEntry[] = [];
      if (order.stockMode === 'despatch') {
        tracking = await this.issueLine(manager, { productId: item.productId, productName: item.productName, quantity: q, warehouseId: null, lots: null, serials: null } as DespatchLineEntity, null, {
          type: StockMovementType.ORDER, reasonCode: 'SALE', sale: true, documentType: 'INVOICE', documentNo: doc.documentNo, documentDate: doc.date, transactionDate: txDate,
          counterpartyTaxId: partyId(customer?.identityNumber), referenceId: order.orderNumber, referenceType: 'invoice', note: `İrsaliye yerine geçen fatura ${doc.documentNo}`, performedBy: user,
          party: { type: 'CUSTOMER', id: customer?.id ?? null, name: customer?.name ?? order.customerName ?? null, taxId: partyId(customer?.identityNumber), orderId: order.id },
        }, touched);
      }
      item.despatchedQuantity = addQty(item.despatchedQuantity || 0, q);
      await manager.update(OrderItemEntity, { id: item.id }, { despatchedQuantity: item.despatchedQuantity, ...(tracking.length ? { tracking: [...(item.tracking || []), ...tracking] } : {}) });
    }
    const fresh = await manager.findOneOrFail(OrderEntity, { where: { companyId: this.companyId, id: order.id }, relations: { items: true, charges: true } });
    if (!fresh.taxFrozenAt || !fresh.shippedAt) {
      if (this.hooks.orderShipped) await this.hooks.orderShipped(manager, fresh, doc.at);
      else await manager.update(OrderEntity, { id: fresh.id }, { shippedAt: fresh.shippedAt || doc.at });
    }
    if (fresh.status === OrderStatus.PENDING && fresh.items.every((i) => roundQty(i.despatchedQuantity || 0) >= roundQty(i.quantity))) {
      await manager.update(OrderEntity, { id: fresh.id }, { status: OrderStatus.COMPLETED });
    }
  }

  // ------------------------------------------------------------------ transfer receipt
  /** Transfer despatch: goods arrived at the target warehouse (IN_TRANSIT -> target). */
  async receive(id: string, input: { receivedAt?: string | null }, user?: string): Promise<DespatchEntity> {
    const touched: ProductEntity[] = [];
    const saved = await this.dataSource.transaction(async (m) => {
      await this.warehouseStock.begin(m, this.companyId);
      const d = await m.findOne(DespatchEntity, { where: { companyId: this.companyId, id }, relations: { lines: true }, lock: { mode: 'pessimistic_write' } });
      if (!d) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (d.purpose !== 'TRANSFER') throw new BadRequestException(err('DESPATCH_NOT_TRANSFER'));
      if (d.status === 'DRAFT' || d.receivedAt) throw new ConflictException(err('DOCUMENT_STATUS_INVALID', { status: d.receivedAt ? 'RECEIVED' : d.status }));
      const company = await this.company(m);
      const now = new Date();
      const at = input.receivedAt ? parseZonedDateTime(input.receivedAt, company.timezone) : now;
      if (!at || Number.isNaN(at.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
      const txDate = new Date(Math.min(at.getTime(), now.getTime()));
      for (const line of d.lines.sort((a, b) => a.lineNo - b.lineNo)) {
        await this.moveLine(m, line, d.inTransitWarehouseId as string, d.targetWarehouseId as string, {
          documentType: 'DESPATCH', documentNo: d.documentNo, documentDate: d.issueDate, transactionDate: txDate,
          referenceId: d.id, referenceType: 'despatch', note: `Transfer teslim alındı: ${d.documentNo}`, performedBy: user,
        }, touched, line.tracking || undefined);
      }
      await m.update(DespatchEntity, { id: d.id }, { receivedAt: at, receivedBy: user || this.tenant.actor.username || null });
      return this.get(d.id, m);
    });
    this.emit('update', saved);
    for (const p of touched) this.gateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    return saved;
  }

  private emit(type: string, d: DespatchEntity) {
    this.gateway.emitToCompany(this.companyId, 'despatch_mutated', { type, despatch: d });
  }
}

/** VKN / TCKN snapshot for movements (only when it looks valid). */
function partyId(v: string | null | undefined): string | null {
  return v && /^\d{10,11}$/.test(v) ? v : null;
}

