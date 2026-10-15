import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
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
import { StockMovementType } from '../../entities/enums';
import { TrackingType } from '../../entities/tracking';
import { WarehouseStockService, StockAllocation } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { applyDayRange, companyTimezone } from '../../shared/time/company-day-range';
import { GENESIS_HASH, verifyChain, ChainVerification } from '../../shared/inventory/movement-hash';
import {
  DISPOSAL_REASONS,
  fitsDecimals,
  isDateKey,
  isReasonCode,
  MOVEMENT_DOCUMENT_TYPES,
  MOVEMENT_REASONS,
  reasonAllowsDirection,
  parseZonedDateTime,
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

  private validateAdjustmentInput(input: AdjustmentInput): void {
    const reason = MOVEMENT_REASONS.find((r) => r.code === input.reasonCode);
    if (!input.reasonCode) throw new BadRequestException(err('REASON_CODE_REQUIRED'));
    if (!isReasonCode(input.reasonCode) || !reason) throw new BadRequestException(err('REASON_CODE_INVALID', { reason: input.reasonCode }));
    if (!reason.manual) throw new BadRequestException(err('REASON_NOT_MANUAL', { reason: input.reasonCode }));
    if (input.documentType && !(MOVEMENT_DOCUMENT_TYPES as readonly string[]).includes(input.documentType)) {
      throw new BadRequestException(err('DOCUMENT_TYPE_INVALID', { type: input.documentType }));
    }
    if (input.documentDate && !isDateKey(input.documentDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    if (reason.needsDocument && (!input.documentNo || !input.documentDate)) {
      throw new BadRequestException(err('DOCUMENT_REQUIRED_FOR_REASON', { reason: input.reasonCode }));
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

  async createManualAdjustment(input: AdjustmentInput, performedBy: string): Promise<any> {
    this.validateAdjustmentInput(input);
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
      const company = await manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
      const threshold = company.adjustmentApprovalThreshold;
      if (threshold !== null && threshold !== undefined) {
        const converted = await this.finance.convertToBase(Number(prod.price) || 0, prod.currency || company.baseCurrency, null, manager);
        const priceBase = converted ?? (Number(prod.price) || 0);
        const value = Math.round(Math.abs(delta) * priceBase * 100) / 100;
        if (value > Number(threshold)) {
          const { attachment, ...payload } = input;
          const actor = this.tenant.actor;
          const request = await manager.save(
            StockAdjustmentRequestEntity,
            manager.create(StockAdjustmentRequestEntity, {
              companyId: this.companyId,
              status: 'PENDING',
              productId: prod.id,
              productName: prod.name,
              warehouseId: input.warehouseId || null,
              quantityDelta: delta,
              estimatedValue: value,
              currency: company.baseCurrency,
              threshold: Number(threshold),
              payload: payload as unknown as Record<string, unknown>,
              requestedBy: performedBy.slice(0, 100),
              requestedByUserId: actor.userId ?? null,
            }),
          );
          if (attachment) await this.saveAttachment(manager, attachment, { adjustmentRequestId: request.id }, performedBy);
          return {
            pending: true,
            body: {
              status: 'PENDING_APPROVAL',
              code: 'SECOND_APPROVAL_REQUIRED',
              params: { value, threshold: Number(threshold), currency: company.baseCurrency },
              request,
            },
          };
        }
      }
      const movements = await this.applyAdjustment(manager, prod, input, delta, performedBy);
      return { pending: false, body: await this.adjustmentResult(manager, movements, input.transactionDate ? movements[0]?.transactionDate : null) };
    });
    if (!result.pending) this.emitProduct(input.productId);
    return result;
  }

  /** Books the adjustment `delta` (already validated) and its attachment. */
  private async applyAdjustment(
    manager: EntityManager,
    prod: ProductEntity,
    input: AdjustmentInput,
    delta: number,
    performedBy: string,
    noteSuffix = '',
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
    const movements = await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
      type: disposal ? StockMovementType.DISPOSAL : StockMovementType.ADJUSTMENT,
      reasonCode: input.reasonCode,
      transactionDate: parseTransactionDate(input.transactionDate, tz),
      documentType: input.documentType || (input.documentNo ? 'INTERNAL_VOUCHER' : null),
      documentNo: input.documentNo || null,
      documentDate: input.documentDate || null,
      counterpartyTaxId: input.counterpartyTaxId || null,
      referenceType: 'manual',
      note: `${input.note || ''}${noteSuffix}`.trim(),
      performedBy,
    });
    if (input.attachment && movements[0]) await this.saveAttachment(manager, input.attachment, { movementId: movements[0].id }, performedBy);
    return movements;
  }

  private async adjustmentResult(manager: EntityManager, movements: StockMovementEntity[], txDate: Date | null | undefined) {
    const last = movements[movements.length - 1];
    const company = await manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const limit = Number(await this.finance.param<number>('VUK219_RECORD_DAYS', undefined, manager).catch(() => 10)) || 10;
    const late = this.warehouseStock.lateEntryWarning(txDate, company.timezone, limit);
    return { ...last, movements, warnings: late ? [late] : [] };
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
        return { req: await manager.save(StockAdjustmentRequestEntity, req), movements: [] as StockMovementEntity[] };
      }
      const prod = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: req.productId, isDeleted: false }, lock: { mode: 'pessimistic_write' } });
      if (!prod) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      const input = req.payload as unknown as AdjustmentInput;
      // The approved change is the requested delta (not a re-evaluated target).
      const movements = await this.applyAdjustment(manager, prod, { ...input, attachment: null }, Number(req.quantityDelta), req.requestedBy, ` [onay: ${approver}]`);
      await manager.update(StockMovementAttachmentEntity, { companyId: this.companyId, adjustmentRequestId: req.id }, { movementId: movements[0]?.id ?? null });
      req.status = 'APPROVED';
      req.movementIds = movements.map((m) => m.id);
      return { req: await manager.save(StockAdjustmentRequestEntity, req), movements };
    });
    if (out.movements.length) this.emitProduct(out.req.productId);
    return { request: out.req, movements: out.movements };
  }

  // ─── Reversal ───

  async reverseMovement(id: string, input: { note: string; transactionDate?: string | null }, performedBy: string) {
    if (!input?.note || !String(input.note).trim()) throw new BadRequestException(err('REVERSAL_NOTE_REQUIRED'));
    const result = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const original = await manager.findOne(StockMovementEntity, { where: { id, companyId: this.companyId } });
      if (!original) throw new NotFoundException(err('MOVEMENT_NOT_FOUND'));
      if (this.reversibleReason(original)) throw new BadRequestException(err('MOVEMENT_NOT_REVERSIBLE'));
      if (await manager.exists(StockMovementEntity, { where: { companyId: this.companyId, reversesMovementId: original.id } })) {
        throw new BadRequestException(err('MOVEMENT_ALREADY_REVERSED'));
      }
      const prod = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: original.productId }, lock: { mode: 'pessimistic_write' } });
      if (!prod) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      const tz = (await manager.findOneByOrFail(CompanyEntity, { id: this.companyId })).timezone;
      const oldQty = prod.quantity;
      const allocations = await this.warehouseStock.applyReversal(manager, prod, original);
      const movements = await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
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
      });
      return { productId: prod.id, movements };
    });
    this.emitProduct(result.productId);
    return { ...result.movements[0], movements: result.movements };
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

  /** Recomputes the company's hash chain and compares it with the stored chain head. */
  async verifyIntegrity(): Promise<ChainVerification & { chainHead: { lastSequenceNo: number; lastHash: string }; verifiedAt: string }> {
    const m = this.dataSource.manager;
    const rows = await m.find(StockMovementEntity, { where: { companyId: this.companyId }, order: { sequenceNo: 'ASC' } });
    const result = verifyChain(rows as unknown as Record<string, unknown>[]);
    const head = await m.findOne(StockMovementChainEntity, { where: { companyId: this.companyId } });
    const chainHead = { lastSequenceNo: Number(head?.lastSequenceNo || 0), lastHash: head?.lastHash || GENESIS_HASH };
    if (chainHead.lastSequenceNo !== result.lastSequenceNo || chainHead.lastHash !== result.lastHash) {
      result.issues.push({ sequenceNo: chainHead.lastSequenceNo, id: '', problem: 'HEAD_MISMATCH' });
      result.ok = false;
    }
    return { ...result, chainHead, verifiedAt: new Date().toISOString() };
  }
}
