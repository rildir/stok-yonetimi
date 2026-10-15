import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';
import { createHash } from 'crypto';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { StockMovementChainEntity } from '../../entities/stock-movement-chain.entity';
import { StockMovementAttachmentEntity } from '../../entities/stock-movement-attachment.entity';
import { StockAdjustmentRequestEntity } from '../../entities/stock-adjustment-request.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { SerialNumberEntity, SerialStatus } from '../../entities/serial-number.entity';
import { StockMovementType } from '../../entities/enums';
import { TrackingType } from '../../entities/tracking';
import { WarehouseStockService, StockAllocation, MovementInfo } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { applyDayRange, companyTimezone } from '../../shared/time/company-day-range';
import { GENESIS_HASH, ChainVerifier, ChainVerification, attachmentsDigest } from '../../shared/inventory/movement-hash';
import {
  DISPOSAL_REASONS,
  effectiveReasonEvidence,
  fitsDecimals,
  isDateKey,
  isReasonCode,
  MOVEMENT_DOCUMENT_TYPES,
  MOVEMENT_REASONS,
  reasonAllowsDirection,
  parseZonedDateTime,
  ReasonEvidence,
  roundQty,
} from '../../shared/tr';

export interface AttachmentInput {
  fileName: string;
  mimeType: string;
  /** Base64 content (no data: prefix) */
  dataBase64: string;
}

export interface AdjustmentInput {
  productId: string;
  /** Target quantity: of `warehouseId` when given (else of the product total), or of `lotId` for lot products */
  newQuantity: number;
  warehouseId?: string | null;
  lotId?: string | null;
  reasonCode: string;
  note: string;
  /** ISO timestamp, 'YYYY-MM-DDTHH:mm' (company time) or 'YYYY-MM-DD'; default now */
  transactionDate?: string | null;
  documentType?: string | null;
  documentNo?: string | null;
  documentDate?: string | null;
  counterpartyTaxId?: string | null;
  attachment?: AttachmentInput | null;
}

/**
 * One stock-count line (product) to book: per-lot deltas, serials found missing, or the
 * product total delta. Used when a count is completed and when a count line that needed
 * a second approval is approved.
 */
export interface CountLine {
  delta?: number;
  lots?: { lotId: string; delta: number }[];
  lostSerials?: string[];
}

/** Company stock controls whose loosening needs a second administrator (payload of COMPANY_CONTROL). */
export interface ControlChange {
  stockLockDate?: string | null;
  adjustmentApprovalThreshold?: number | null;
}

export interface MovementQuery {
  productId?: string;
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  type?: string;
  warehouseId?: string;
  reasonCode?: string;
  /** Which date the range filters on: transactionDate (default) or createdAt (recording time) */
  dateField?: 'transactionDate' | 'createdAt';
}

const ATTACHMENT_MAX_MB = 5;
const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
/** Movement types that are corrected through their document / transfer flow, not by REVERSAL */
const NON_REVERSIBLE_TYPES = new Set<string>([
  StockMovementType.REVERSAL,
  StockMovementType.TRANSFER_IN,
  StockMovementType.TRANSFER_OUT,
  StockMovementType.QUARANTINE_IN,
  StockMovementType.QUARANTINE_OUT,
]);
const DOCUMENT_FLOW_REFERENCES = new Set(['order', 'purchase_order', 'warehouse_transfer']);

/** User-entered transaction moment in company time; rejects unparsable values. */
function parseTransactionDate(v: string | null | undefined, tz: string): Date | null {
  const d = parseZonedDateTime(v, tz);
  if (d && Number.isNaN(d.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
  return d;
}

@Injectable()
export class StockMovementService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(StockMovementEntity)
    private readonly stockMovementRepo: Repository<StockMovementEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly warehouseStock: WarehouseStockService,
    private readonly finance: FinanceService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  // ─── Listing ───

  async getStockMovements(q: MovementQuery): Promise<{ data: StockMovementEntity[]; total: number }> {
    const page = Math.max(1, q.page || 1);
    const limit = Math.min(500, Math.max(1, q.limit || 20));
    const query = this.stockMovementRepo
      .createQueryBuilder('sm')
      .where('sm.companyId = :companyId', { companyId: this.companyId })
      .orderBy('sm.transactionDate', 'DESC')
      .addOrderBy('sm.sequenceNo', 'DESC');

    if (q.productId) query.andWhere('sm.productId = :productId', { productId: q.productId });
    if (q.warehouseId) query.andWhere('sm.warehouseId = :warehouseId', { warehouseId: q.warehouseId });
    if (q.search) {
      query.andWhere(
        '(LOWER(sm.productName) LIKE :search OR LOWER(sm.productSku) LIKE :search OR LOWER(sm.note) LIKE :search OR LOWER(sm.type) LIKE :search OR LOWER(sm.documentNo) LIKE :search OR LOWER(sm.lotNumber) LIKE :search)',
        { search: `%${q.search.toLowerCase()}%` },
      );
    }
    if (q.startDate || q.endDate) {
      // Calendar days of the company time zone; legal periods follow the transaction date.
      const column = q.dateField === 'createdAt' ? 'sm.createdAt' : 'sm.transactionDate';
      applyDayRange(query, column, await companyTimezone(this.dataSource.manager, this.companyId), q.startDate, q.endDate);
    }
    if (q.type && q.type !== 'ALL') query.andWhere('sm.type IN (:...types)', { types: q.type.split(',') });
    if (q.reasonCode && q.reasonCode !== 'ALL') query.andWhere('sm.reasonCode IN (:...reasons)', { reasons: q.reasonCode.split(',') });

    const [data, total] = await query.skip((page - 1) * limit).take(limit).getManyAndCount();
    await this.decorate(data);
    return { data, total };
  }

  /** reversedByMovementId + attachment count for list rows. */
  private async decorate(rows: StockMovementEntity[]): Promise<void> {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    const m = this.dataSource.manager;
    const reversals = await m.find(StockMovementEntity, {
      where: { companyId: this.companyId, reversesMovementId: In(ids) },
      select: ['id', 'reversesMovementId'],
    });
    const atts: { movementId: string; n: string }[] = await m
      .createQueryBuilder(StockMovementAttachmentEntity, 'a')
      .select('a.movementId', 'movementId')
      .addSelect('COUNT(*)', 'n')
      .where('a.companyId = :c AND a.movementId IN (:...ids)', { c: this.companyId, ids })
      .groupBy('a.movementId')
      .getRawMany();
    for (const r of rows) {
      r.reversedByMovementId = reversals.find((x) => x.reversesMovementId === r.id)?.id ?? null;
      (r as any).attachmentCount = Number(atts.find((a) => a.movementId === r.id)?.n || 0);
      (r as any).reversible = this.reversibleReason(r) === null && !r.reversedByMovementId;
    }
  }

  private reversibleReason(m: StockMovementEntity): string | null {
    if (NON_REVERSIBLE_TYPES.has(m.type) || m.reversesMovementId) return 'type';
    if (m.referenceType && DOCUMENT_FLOW_REFERENCES.has(m.referenceType)) return 'document';
    if (!Number(m.quantity)) return 'zero';
    return null;
  }

  // ─── Manual adjustment (reason + document + attachment + maker-checker) ───

  /** Evidence rules per reason: code defaults + legal parameter MOVEMENT_REASON_EVIDENCE. */
  async reasonEvidence(manager?: EntityManager): Promise<Record<string, ReasonEvidence>> {
    const override = await this.finance
      .param<Record<string, Partial<ReasonEvidence>>>('MOVEMENT_REASON_EVIDENCE', undefined, manager)
      .catch(() => null);
    return effectiveReasonEvidence(override);
  }

  /** Reasons offered for manual movements, with the effective evidence rules (for the UI). */
  async reasonRules() {
    const evidence = await this.reasonEvidence();
    return MOVEMENT_REASONS.map((r) => ({
      code: r.code,
      direction: r.direction,
      manual: r.manual,
      needsDocument: evidence[r.code]?.document ?? r.needsDocument,
      needsAttachment: evidence[r.code]?.attachment ?? r.needsAttachment,
    }));
  }

  private async validateAdjustmentInput(input: AdjustmentInput): Promise<void> {
    const reason = MOVEMENT_REASONS.find((r) => r.code === input.reasonCode);
    if (!input.reasonCode) throw new BadRequestException(err('REASON_CODE_REQUIRED'));
    if (!isReasonCode(input.reasonCode) || !reason) throw new BadRequestException(err('REASON_CODE_INVALID', { reason: input.reasonCode }));
    if (!reason.manual) throw new BadRequestException(err('REASON_NOT_MANUAL', { reason: input.reasonCode }));
    if (input.documentType && !(MOVEMENT_DOCUMENT_TYPES as readonly string[]).includes(input.documentType)) {
      throw new BadRequestException(err('DOCUMENT_TYPE_INVALID', { value: input.documentType }));
    }
    if (input.documentDate && !isDateKey(input.documentDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    const evidence = (await this.reasonEvidence())[input.reasonCode];
    if (evidence?.document && (!input.documentNo || !String(input.documentNo).trim() || !input.documentDate)) {
      throw new BadRequestException(err('DOCUMENT_REQUIRED_FOR_REASON', { reason: input.reasonCode }));
    }
    if (evidence?.attachment && !input.attachment) {
      throw new BadRequestException(err('ATTACHMENT_REQUIRED_FOR_REASON', { reason: input.reasonCode }));
    }
    const n = Number(input.newQuantity);
    if (input.newQuantity === null || input.newQuantity === undefined || !Number.isFinite(n) || n < 0) throw new BadRequestException(err('QUANTITY_INVALID'));
    if (input.attachment) this.checkAttachment(input.attachment);
  }

  private checkAttachment(a: AttachmentInput): Buffer {
    if (!a?.fileName || !a?.dataBase64) throw new BadRequestException(err('ATTACHMENT_TYPE_INVALID'));
    if (!ATTACHMENT_TYPES.includes(String(a.mimeType || '').toLowerCase())) throw new BadRequestException(err('ATTACHMENT_TYPE_INVALID'));
    const buf = Buffer.from(String(a.dataBase64).replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length) throw new BadRequestException(err('ATTACHMENT_TYPE_INVALID'));
    if (buf.length > ATTACHMENT_MAX_MB * 1024 * 1024) throw new BadRequestException(err('ATTACHMENT_TOO_LARGE', { max: ATTACHMENT_MAX_MB }));
    return buf;
  }

  private sha256Of(a: AttachmentInput): string {
    return createHash('sha256').update(this.checkAttachment(a)).digest('hex');
  }

  private async saveAttachment(
    manager: EntityManager,
    a: AttachmentInput,
    target: { movementId?: string | null; adjustmentRequestId?: string | null },
    uploadedBy: string,
  ): Promise<StockMovementAttachmentEntity> {
    const content = this.checkAttachment(a);
    return manager.save(
      StockMovementAttachmentEntity,
      manager.create(StockMovementAttachmentEntity, {
        companyId: this.companyId,
        movementId: target.movementId ?? null,
        adjustmentRequestId: target.adjustmentRequestId ?? null,
        fileName: String(a.fileName).slice(0, 255),
        mimeType: String(a.mimeType).toLowerCase(),
        size: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        content,
        uploadedBy: uploadedBy.slice(0, 100),
      }),
    );
  }

  /** Base-unit precision of a product. */
  private async unitDecimals(manager: EntityManager, product: ProductEntity): Promise<number> {
    if (product.trackingType === TrackingType.SERIAL) return 0;
    const unit = product.baseUnitId ? await manager.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: this.companyId } }) : null;
    return unit ? Number(unit.decimals) || 0 : 0;
  }

  /** Signed delta the adjustment means right now (locks nothing new). */
  private async currentDelta(manager: EntityManager, product: ProductEntity, input: AdjustmentInput): Promise<number> {
    const target = roundQty(input.newQuantity);
    if (product.trackingType === TrackingType.SERIAL) throw new BadRequestException(err('ADJUSTMENT_TRACKED_USE_LOTS', { name: product.name }));
    if (product.trackingType === TrackingType.LOT) {
      if (!input.lotId) throw new BadRequestException(err('ADJUSTMENT_TRACKED_USE_LOTS', { name: product.name }));
      const lot = await manager.findOne(StockLotEntity, { where: { id: input.lotId, companyId: this.companyId, productId: product.id } });
      if (!lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: input.lotId }));
      return roundQty(target - lot.quantity);
    }
    if (input.warehouseId) {
      await this.warehouseStock.requireWarehouse(manager, this.companyId, input.warehouseId);
      const row = await manager.findOne(ProductWarehouseStockEntity, { where: { companyId: this.companyId, productId: product.id, warehouseId: input.warehouseId } });
      return roundQty(target - (row?.quantity || 0));
    }
    return roundQty(target - product.quantity);
  }

  /**
   * Maker-checker valuation (R65): |delta| x unit price in the company base currency
   * against the company threshold. `exceeds` = a second administrator must approve.
   */
  async approvalCheck(manager: EntityManager, prod: ProductEntity, delta: number) {
    const company = await manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const threshold = company.adjustmentApprovalThreshold;
    if (threshold === null || threshold === undefined) return { exceeds: false, value: 0, threshold: null as number | null, currency: company.baseCurrency };
    const converted = await this.finance.convertToBase(Number(prod.price) || 0, prod.currency || company.baseCurrency, null, manager);
    const priceBase = converted ?? (Number(prod.price) || 0);
    const value = Math.round(Math.abs(delta) * priceBase * 100) / 100;
    return { exceeds: value > Number(threshold), value, threshold: Number(threshold), currency: company.baseCurrency };
  }

  async createApprovalRequest(
    manager: EntityManager,
    prod: ProductEntity,
    delta: number,
    check: { value: number; threshold: number | null; currency: string },
    payload: Record<string, unknown>,
    warehouseId: string | null,
    performedBy: string,
  ) {
    const actor = this.tenant.actor;
    const request = await manager.save(
      StockAdjustmentRequestEntity,
      manager.create(StockAdjustmentRequestEntity, {
        companyId: this.companyId,
        status: 'PENDING',
        productId: prod.id,
        productName: prod.name,
        warehouseId,
        quantityDelta: delta,
        estimatedValue: check.value,
        currency: check.currency,
        threshold: Number(check.threshold),
        payload,
        requestedBy: performedBy.slice(0, 100),
        requestedByUserId: actor.userId ?? null,
      }),
    );
    return {
      request,
      body: {
        status: 'PENDING_APPROVAL',
        code: 'SECOND_APPROVAL_REQUIRED',
        params: { value: check.value, threshold: Number(check.threshold), currency: check.currency },
        request,
      },
    };
  }

  async createManualAdjustment(input: AdjustmentInput, performedBy: string): Promise<any> {
    await this.validateAdjustmentInput(input);
    const result = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const prod = await manager.findOne(ProductEntity, {
        where: { companyId: this.companyId, id: input.productId, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!prod) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      const decimals = await this.unitDecimals(manager, prod);
      if (!fitsDecimals(input.newQuantity, decimals)) {
        throw new BadRequestException(err('QUANTITY_PRECISION_EXCEEDED', { quantity: input.newQuantity, decimals }));
      }
      const delta = await this.currentDelta(manager, prod, input);
      if (!delta) throw new BadRequestException(err('ADJUSTMENT_NO_CHANGE'));
      if (!reasonAllowsDirection(input.reasonCode, delta)) throw new BadRequestException(err('REASON_DIRECTION_MISMATCH', { reason: input.reasonCode }));

      // Maker-checker: value above the company threshold waits for a second administrator.
      const check = await this.approvalCheck(manager, prod, delta);
      if (check.exceeds) {
        // The transaction date is checked now too, so an approval cannot fail on it later.
        parseTransactionDate(input.transactionDate, (await manager.findOneByOrFail(CompanyEntity, { id: this.companyId })).timezone);
        const { attachment, ...payload } = input;
        const pending = await this.createApprovalRequest(manager, prod, delta, check, { kind: 'ADJUSTMENT', ...payload }, input.warehouseId || null, performedBy);
        if (attachment) await this.saveAttachment(manager, attachment, { adjustmentRequestId: pending.request.id }, performedBy);
        return { pending: true, body: pending.body };
      }
      const movements = await this.applyAdjustment(manager, prod, input, delta, performedBy, {
        attachmentsSha256: input.attachment ? attachmentsDigest([this.sha256Of(input.attachment)]) : null,
      });
      if (input.attachment && movements[0]) await this.saveAttachment(manager, input.attachment, { movementId: movements[0].id }, performedBy);
      return { pending: false, body: await this.withWarnings(manager, movements) };
    });
    if (!result.pending) this.emitProduct(input.productId);
    return result;
  }

  /** Books the adjustment `delta` (already validated). Attachments are saved by the caller. */
  private async applyAdjustment(
    manager: EntityManager,
    prod: ProductEntity,
    input: AdjustmentInput,
    delta: number,
    performedBy: string,
    extra: Pick<MovementInfo, 'performedByUserId' | 'approvedBy' | 'approvedByUserId' | 'attachmentsSha256'> = {},
  ): Promise<StockMovementEntity[]> {
    const tz = (await manager.findOneByOrFail(CompanyEntity, { id: this.companyId })).timezone;
    const oldQty = prod.quantity;
    let allocations: StockAllocation[];
    if (prod.trackingType === TrackingType.LOT) {
      const lot = await manager.findOne(StockLotEntity, { where: { id: input.lotId as string, companyId: this.companyId, productId: prod.id } });
      if (!lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: input.lotId }));
      allocations = await this.warehouseStock.setLotQuantity(manager, prod, lot.id, roundQty(lot.quantity + delta));
    } else if (prod.trackingType === TrackingType.SERIAL) {
      throw new BadRequestException(err('ADJUSTMENT_TRACKED_USE_LOTS', { name: prod.name }));
    } else if (delta > 0) {
      allocations = await this.warehouseStock.add(manager, prod, delta, input.warehouseId);
    } else {
      allocations = await this.warehouseStock.deduct(manager, prod, -delta, input.warehouseId);
    }
    const disposal = delta < 0 && (DISPOSAL_REASONS as string[]).includes(input.reasonCode);
    return this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
      type: disposal ? StockMovementType.DISPOSAL : StockMovementType.ADJUSTMENT,
      reasonCode: input.reasonCode,
      transactionDate: parseTransactionDate(input.transactionDate, tz),
      documentType: input.documentType || (input.documentNo ? 'INTERNAL_VOUCHER' : null),
      documentNo: input.documentNo || null,
      documentDate: input.documentDate || null,
      counterpartyTaxId: input.counterpartyTaxId || null,
      referenceType: 'manual',
      note: String(input.note || '').trim(),
      performedBy,
      ...extra,
    });
  }

  /**
   * Books a stock-count line (see CountLine): lots are set by their delta, missing serials
   * leave as LOST, untracked products move by the total delta. `info` carries the count
   * document and the actors. Returns the movements written.
   */
  async bookCountLine(manager: EntityManager, product: ProductEntity, line: CountLine, info: MovementInfo): Promise<StockMovementEntity[]> {
    const out: StockMovementEntity[] = [];
    if (line.lots?.length) {
      for (const l of line.lots) {
        if (!roundQty(l.delta)) continue;
        const lot = await manager.findOne(StockLotEntity, { where: { id: l.lotId, companyId: product.companyId, productId: product.id } });
        if (!lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: l.lotId }));
        const before = product.quantity;
        const allocs = await this.warehouseStock.setLotQuantity(manager, product, lot.id, roundQty(lot.quantity + l.delta));
        out.push(...(await this.warehouseStock.recordMovements(manager, product, before, allocs, info)));
      }
    } else if (line.lostSerials?.length) {
      const rows = await manager.find(SerialNumberEntity, {
        where: { companyId: product.companyId, productId: product.id, status: SerialStatus.IN_STOCK, serial: In(line.lostSerials) },
      });
      if (rows.length) {
        const before = product.quantity;
        const allocs = await this.warehouseStock.issue(manager, product, rows.length, null, { serials: rows.map((r) => r.serial) }, { serialStatus: SerialStatus.LOST });
        out.push(...(await this.warehouseStock.recordMovements(manager, product, before, allocs, info)));
      }
    } else if (roundQty(Number(line.delta) || 0)) {
      const before = product.quantity;
      const allocs = await this.warehouseStock.setTotal(manager, product, Math.max(0, roundQty(product.quantity + Number(line.delta))));
      out.push(...(await this.warehouseStock.recordMovements(manager, product, before, allocs, info)));
    }
    return out;
  }

  /** Response body for booked movements: first movement + all movements + VUK 219 warnings. */
  private async withWarnings(manager: EntityManager, movements: StockMovementEntity[]) {
    const last = movements[movements.length - 1];
    return { ...last, movements, warnings: await this.lateWarnings(manager, movements) };
  }

  /** VUK 219 late-entry warnings for movements just booked (legal parameter VUK219_RECORD_DAYS). */
  async lateWarnings(manager: EntityManager, movements: { transactionDate?: Date | string | null }[]) {
    if (!movements.length) return [];
    const limit = Number(await this.finance.param<number>('VUK219_RECORD_DAYS', undefined, manager).catch(() => 10)) || 10;
    return this.warehouseStock.lateEntryWarnings(manager, this.companyId, movements, limit);
  }

  private async emitProduct(productId: string) {
    const updated = await this.productRepo.findOne({ where: { companyId: this.companyId, id: productId, isDeleted: false } });
    if (updated) this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: updated });
  }

  // ─── Maker-checker requests ───

  listAdjustmentRequests(status?: string) {
    return this.dataSource.manager.find(StockAdjustmentRequestEntity, {
      where: { companyId: this.companyId, ...(status && status !== 'ALL' ? { status: status as any } : {}) },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async decideAdjustmentRequest(id: string, approve: boolean, approver: string, note?: string) {
    const actor = this.tenant.actor;
    const out = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const req = await manager.findOne(StockAdjustmentRequestEntity, { where: { id, companyId: this.companyId }, lock: { mode: 'pessimistic_write' } });
      if (!req) throw new NotFoundException(err('ADJUSTMENT_REQUEST_NOT_FOUND'));
      if (req.status !== 'PENDING') throw new BadRequestException(err('ADJUSTMENT_REQUEST_NOT_PENDING'));
      if ((req.requestedByUserId && req.requestedByUserId === actor.userId) || req.requestedBy === approver) {
        throw new ForbiddenException(err('APPROVAL_SELF_FORBIDDEN'));
      }
      req.decidedBy = approver.slice(0, 100);
      req.decidedByUserId = actor.userId ?? null;
      req.decidedAt = new Date();
      req.decisionNote = note ? String(note).slice(0, 500) : null;
      if (!approve) {
        req.status = 'REJECTED';
        return { req: await manager.save(StockAdjustmentRequestEntity, req), movements: [] as StockMovementEntity[], warnings: [] as unknown[] };
      }
      const payload = req.payload as Record<string, unknown>;
      if (payload['kind'] === 'COMPANY_CONTROL') {
        // Loosened stock control (lock date moved back / threshold raised): applied as requested.
        const company = await manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
        const change = (payload['change'] || {}) as ControlChange;
        if (change.stockLockDate !== undefined) company.stockLockDate = change.stockLockDate || null;
        if (change.adjustmentApprovalThreshold !== undefined) {
          company.adjustmentApprovalThreshold = change.adjustmentApprovalThreshold === null ? null : Number(change.adjustmentApprovalThreshold);
        }
        await manager.save(CompanyEntity, company);
        req.status = 'APPROVED';
        return { req: await manager.save(StockAdjustmentRequestEntity, req), movements: [] as StockMovementEntity[], warnings: [] as unknown[] };
      }
      const prod = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: req.productId as string }, lock: { mode: 'pessimistic_write' } });
      if (!prod) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      // The ledger keeps maker and checker apart: performedBy* = requester, approvedBy* = approver.
      const actors = { performedByUserId: req.requestedByUserId ?? null, approvedBy: approver, approvedByUserId: actor.userId ?? null };
      let movements: StockMovementEntity[];
      if (payload['kind'] === 'COUNT') {
        // Stock-count line above the threshold: the counted difference (as requested) is booked now.
        if (prod.isDeleted) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
        const doc = (payload['document'] || {}) as Record<string, string | null>;
        movements = await this.bookCountLine(manager, prod, (payload['line'] || {}) as CountLine, {
          type: StockMovementType.ADJUSTMENT,
          reasonCode: (d: number) => (d > 0 ? 'COUNT_SURPLUS' : 'COUNT_SHORTAGE'),
          // The goods were counted when the count was completed, not when it was approved.
          transactionDate: doc['countedAt'] ?? null,
          documentType: 'STOCK_COUNT',
          documentNo: doc['countNumber'] ?? null,
          documentDate: doc['countDate'] ?? null,
          referenceId: doc['countId'] ?? undefined,
          referenceType: 'stock_count',
          note: String(payload['note'] || ''),
          performedBy: req.requestedBy,
          ...actors,
        });
      } else if (payload['kind'] === 'REVERSAL') {
        const original = await manager.findOne(StockMovementEntity, { where: { id: String(payload['reversesMovementId']), companyId: this.companyId } });
        if (!original) throw new NotFoundException(err('MOVEMENT_NOT_FOUND'));
        await this.assertReversible(manager, original);
        movements = await this.bookReversal(manager, prod, original, { note: String(payload['note'] || ''), transactionDate: (payload['transactionDate'] as string) || null }, req.requestedBy, actors);
      } else {
        if (prod.isDeleted) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
        const input = payload as unknown as AdjustmentInput;
        const evidence = await manager.find(StockMovementAttachmentEntity, { where: { companyId: this.companyId, adjustmentRequestId: req.id }, select: ['id', 'sha256'] });
        // The approved change is the requested delta (not a re-evaluated target).
        movements = await this.applyAdjustment(manager, prod, { ...input, attachment: null }, Number(req.quantityDelta), req.requestedBy, {
          ...actors,
          attachmentsSha256: attachmentsDigest(evidence.map((e) => e.sha256)),
        });
        if (evidence.length) {
          await manager.update(StockMovementAttachmentEntity, { companyId: this.companyId, adjustmentRequestId: req.id }, { movementId: movements[0]?.id ?? null });
        }
      }
      req.status = 'APPROVED';
      req.movementIds = movements.map((m) => m.id);
      return { req: await manager.save(StockAdjustmentRequestEntity, req), movements, warnings: await this.lateWarnings(manager, movements) };
    });
    if (out.movements.length && out.req.productId) this.emitProduct(out.req.productId);
    return { request: out.req, movements: out.movements, warnings: out.warnings };
  }

  // ─── Reversal ───

  private async assertReversible(manager: EntityManager, original: StockMovementEntity): Promise<void> {
    if (this.reversibleReason(original)) throw new BadRequestException(err('MOVEMENT_NOT_REVERSIBLE'));
    if (await manager.exists(StockMovementEntity, { where: { companyId: this.companyId, reversesMovementId: original.id } })) {
      throw new BadRequestException(err('MOVEMENT_ALREADY_REVERSED'));
    }
  }

  private async bookReversal(
    manager: EntityManager,
    prod: ProductEntity,
    original: StockMovementEntity,
    input: { note: string; transactionDate?: string | null },
    performedBy: string,
    extra: Pick<MovementInfo, 'performedByUserId' | 'approvedBy' | 'approvedByUserId'> = {},
  ): Promise<StockMovementEntity[]> {
    const tz = (await manager.findOneByOrFail(CompanyEntity, { id: this.companyId })).timezone;
    const oldQty = prod.quantity;
    const allocations = await this.warehouseStock.applyReversal(manager, prod, original);
    return this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
      type: StockMovementType.REVERSAL,
      reasonCode: 'CORRECTION',
      reversesMovementId: original.id,
      transactionDate: parseTransactionDate(input.transactionDate, tz),
      documentType: original.documentType,
      documentNo: original.documentNo,
      documentDate: original.documentDate,
      counterpartyTaxId: original.counterpartyTaxId,
      referenceType: 'reversal',
      referenceId: original.id,
      note: String(input.note).trim(),
      performedBy,
      ...extra,
    });
  }

  /**
   * Correction by REVERSAL. Above the company threshold, or when the original itself
   * needed a second approval, the reversal waits for a second administrator (202).
   */
  async reverseMovement(id: string, input: { note: string; transactionDate?: string | null }, performedBy: string): Promise<any> {
    if (!input?.note || !String(input.note).trim()) throw new BadRequestException(err('REVERSAL_NOTE_REQUIRED'));
    const result = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const original = await manager.findOne(StockMovementEntity, { where: { id, companyId: this.companyId } });
      if (!original) throw new NotFoundException(err('MOVEMENT_NOT_FOUND'));
      await this.assertReversible(manager, original);
      const prod = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: original.productId }, lock: { mode: 'pessimistic_write' } });
      if (!prod) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      const tz = (await manager.findOneByOrFail(CompanyEntity, { id: this.companyId })).timezone;
      parseTransactionDate(input.transactionDate, tz);

      const delta = roundQty(-Number(original.quantity));
      const check = await this.approvalCheck(manager, prod, delta);
      if (check.exceeds || original.approvedByUserId || original.approvedBy) {
        const pendingFor = await manager
          .createQueryBuilder(StockAdjustmentRequestEntity, 'r')
          .where('r.companyId = :c AND r.status = :s AND r.payload LIKE :p', { c: this.companyId, s: 'PENDING', p: `%"reversesMovementId":"${original.id}"%` })
          .getCount();
        if (pendingFor) throw new BadRequestException(err('REVERSAL_ALREADY_PENDING'));
        const payload = { kind: 'REVERSAL', reasonCode: 'CORRECTION', reversesMovementId: original.id, note: String(input.note).trim(), transactionDate: input.transactionDate || null };
        const pending = await this.createApprovalRequest(manager, prod, delta, { ...check, threshold: check.threshold ?? 0 }, payload, original.warehouseId ?? null, performedBy);
        return { pending: true as const, body: pending.body, productId: prod.id };
      }
      const movements = await this.bookReversal(manager, prod, original, input, performedBy);
      return { pending: false as const, body: await this.withWarnings(manager, movements), productId: prod.id };
    });
    if (!result.pending) this.emitProduct(result.productId);
    return result;
  }

  // ─── Attachments ───

  async listAttachments(movementId: string) {
    return this.dataSource.manager.find(StockMovementAttachmentEntity, { where: { companyId: this.companyId, movementId }, order: { createdAt: 'ASC' } });
  }

  async getAttachment(attachmentId: string): Promise<StockMovementAttachmentEntity> {
    const a = await this.dataSource.manager
      .createQueryBuilder(StockMovementAttachmentEntity, 'a')
      .addSelect('a.content')
      .where('a.id = :id AND a.companyId = :c', { id: attachmentId, c: this.companyId })
      .getOne();
    if (!a) throw new NotFoundException(err('ATTACHMENT_NOT_FOUND'));
    return a;
  }

  // ─── Integrity ───

  /**
   * Recomputes the company's hash chain in batches and compares it with the stored chain
   * head; checks every evidence file against its stored SHA-256 and every v2 movement's
   * evidence digest against the files linked to it.
   */
  async verifyIntegrity(): Promise<ChainVerification & { chainHead: { lastSequenceNo: number; lastHash: string }; attachmentsChecked: number; verifiedAt: string }> {
    const m = this.dataSource.manager;
    const verifier = new ChainVerifier();
    const BATCH = 1000;
    let after = 0;
    for (;;) {
      const rows = await m.find(StockMovementEntity, {
        where: { companyId: this.companyId, sequenceNo: MoreThan(after) },
        order: { sequenceNo: 'ASC' },
        take: BATCH,
      });
      verifier.push(rows as unknown as Record<string, unknown>[]);
      if (rows.length < BATCH) break;
      after = Number(rows[rows.length - 1].sequenceNo);
    }
    // Rows without a sequence number would be skipped by the paging above.
    const unsealed = await m.find(StockMovementEntity, { where: { companyId: this.companyId, sequenceNo: IsNull() }, select: ['id'] });
    for (const u of unsealed) verifier.addIssue({ sequenceNo: null, id: u.id, problem: 'UNSEALED' });

    // Evidence files: content vs stored SHA-256 (computed in the database), digest per movement.
    const files: { id: string; movementId: string | null; sha256: string; actual: string }[] = await m.query(
      'SELECT `id`, `movementId`, `sha256`, SHA2(`content`, 256) AS actual FROM `stock_movement_attachments` WHERE `companyId` = ?',
      [this.companyId],
    );
    const byMovement = new Map<string, string[]>();
    for (const f of files) {
      if (f.actual !== f.sha256) verifier.addIssue({ sequenceNo: null, id: f.id, problem: 'ATTACHMENT_MISMATCH' });
      if (f.movementId) byMovement.set(f.movementId, [...(byMovement.get(f.movementId) || []), f.sha256]);
    }
    const sealed: { id: string; sequenceNo: string; hashVersion: number; attachmentsSha256: string | null }[] = await m.query(
      'SELECT `id`, `sequenceNo`, `hashVersion`, `attachmentsSha256` FROM `stock_movements` WHERE `companyId` = ? AND (`attachmentsSha256` IS NOT NULL OR `id` IN (SELECT `movementId` FROM `stock_movement_attachments` WHERE `companyId` = ? AND `movementId` IS NOT NULL))',
      [this.companyId, this.companyId],
    );
    for (const s of sealed) {
      if (Number(s.hashVersion) < 2) continue; // v1 rows predate evidence digests
      if ((s.attachmentsSha256 || null) !== attachmentsDigest(byMovement.get(s.id) || [])) {
        verifier.addIssue({ sequenceNo: Number(s.sequenceNo), id: s.id, problem: 'ATTACHMENT_MISMATCH' });
      }
    }

    const result = verifier.result();
    const head = await m.findOne(StockMovementChainEntity, { where: { companyId: this.companyId } });
    const chainHead = { lastSequenceNo: Number(head?.lastSequenceNo || 0), lastHash: head?.lastHash || GENESIS_HASH };
    if (chainHead.lastSequenceNo !== result.lastSequenceNo || chainHead.lastHash !== result.lastHash) {
      result.issues.push({ sequenceNo: chainHead.lastSequenceNo, id: '', problem: 'HEAD_MISMATCH' });
      result.ok = false;
    }
    return { ...result, chainHead, attachmentsChecked: files.length, verifiedAt: new Date().toISOString() };
  }
}
