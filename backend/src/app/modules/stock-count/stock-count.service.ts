import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { StockCountEntity, StockCountItem } from '../../entities/stock-count.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { SerialNumberEntity, SerialStatus } from '../../entities/serial-number.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { TrackingType } from '../../entities/tracking';
import { MoreThan } from 'typeorm';
import { CompanyEntity } from '../../entities/company.entity';
import { dateKeyInZone, DEFAULT_TIMEZONE, fitsDecimals, roundQty, sumQty, timeKeyInZone } from '../../shared/tr';
import { UnitEntity } from '../../entities/unit.entity';
import { StockAdjustmentRequestEntity } from '../../entities/stock-adjustment-request.entity';
import { CountLine, StockMovementService } from '../stock-movement/stock-movement.service';
import { createHash } from 'crypto';
import { addMonths, COUNT_TYPES, isDateKey } from '../../shared/tr';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { roundCost, roundMoney } from '../../shared/inventory/costing';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';

/** Tutanak header of a count (WP6; VUK 185-190). */
export interface CountHeaderInput {
  countType?: string;
  countDate?: string | null;
  asOfDate?: string | null;
  warehouseIds?: string[] | null;
  countedBy?: string[] | null;
  supervisedBy?: string | null;
}

/** Counted quantity: >= 0, at most 4 decimals. */
const countQty = (v: unknown) => Math.max(0, roundQty(Number(v) || 0));

@Injectable()
export class StockCountService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(StockCountEntity)
    private readonly stockCountRepo: Repository<StockCountEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly warehouseStock: WarehouseStockService,
    private readonly movements: StockMovementService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
    private readonly legal: LegalParameterService,
  ) {}

  /**
   * Validates the tutanak header: count type, dates and the count date window around the
   * inventory (asOf) date (legal parameter COUNT_ASOF_WINDOW_MONTHS, default -3 / +2 months).
   */
  private async header(input: CountHeaderInput, company: CompanyEntity, prev?: StockCountEntity): Promise<Partial<StockCountEntity>> {
    const out: Partial<StockCountEntity> = {};
    if (input.countType !== undefined) {
      if (!(COUNT_TYPES as readonly string[]).includes(input.countType)) throw new BadRequestException(err('COUNT_TYPE_INVALID', { type: String(input.countType) }));
      out.countType = input.countType;
    }
    for (const k of ['countDate', 'asOfDate'] as const) {
      if (input[k] !== undefined) {
        if (input[k] && !isDateKey(input[k])) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
        out[k] = input[k] || null;
      }
    }
    if (input.warehouseIds !== undefined) {
      const ids = [...new Set((input.warehouseIds || []).filter(Boolean))];
      if (ids.length) {
        const found = await this.dataSource.manager.count(WarehouseEntity, { where: { companyId: this.companyId, id: In(ids), isDeleted: false } });
        if (found !== ids.length) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
      }
      out.warehouseIds = ids.length ? ids : null;
    }
    if (input.countedBy !== undefined) out.countedBy = (input.countedBy || []).map((n) => String(n || '').trim().slice(0, 100)).filter(Boolean);
    if (input.supervisedBy !== undefined) out.supervisedBy = input.supervisedBy ? String(input.supervisedBy).trim().slice(0, 100) : null;
    const countDate = (out.countDate !== undefined ? out.countDate : prev?.countDate) || dateKeyInZone(new Date(), company.timezone || DEFAULT_TIMEZONE);
    const asOf = out.asOfDate !== undefined ? out.asOfDate : prev?.asOfDate;
    if (asOf) {
      const w = (await this.legal.paramOrNull<{ before?: number; after?: number }>('COUNT_ASOF_WINDOW_MONTHS', String(countDate).slice(0, 10), company.country || 'TR')) || {};
      const before = Number(w.before ?? 3);
      const after = Number(w.after ?? 2);
      const cd = String(countDate).slice(0, 10);
      if (cd < addMonths(String(asOf).slice(0, 10), -before) || cd > addMonths(String(asOf).slice(0, 10), after)) {
        throw new BadRequestException(err('COUNT_ASOF_OUT_OF_RANGE', { countDate: cd, asOf: String(asOf).slice(0, 10), before, after }));
      }
    }
    return out;
  }

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getStockCounts(): Promise<StockCountEntity[]> {
    return this.stockCountRepo.find({
      where: { companyId: this.companyId },
      order: { createdAt: 'DESC' }
    });
  }

  async createStockCount(notes?: string, performedBy?: string, headerInput: CountHeaderInput = {}): Promise<StockCountEntity> {
    const activeCount = await this.stockCountRepo.findOne({ where: { companyId: this.companyId, status: 'InProgress' } });
    if (activeCount) {
      throw new BadRequestException(err('STOCK_COUNT_IN_PROGRESS'));
    }
    
    // Count number uses the company's local date and time (the server / DB run in UTC).
    const now = new Date();
    const company = await this.dataSource.manager.findOne(CompanyEntity, { where: { id: this.companyId }, select: ['id', 'timezone'] });
    const tz = company?.timezone || DEFAULT_TIMEZONE;
    const dateStr = dateKeyInZone(now, tz).replace(/-/g, '');
    const timeStr = timeKeyInZone(now, tz).replace(/:/g, '');
    const countNumber = `SC-${dateStr}-${timeStr}`;

    const products = await this.productRepo.find({ where: { companyId: this.companyId, isDeleted: false } });
    const header = await this.header(headerInput, (await this.dataSource.manager.findOneByOrFail(CompanyEntity, { id: this.companyId })));
    const scope = header.warehouseIds && header.warehouseIds.length ? new Set(header.warehouseIds) : null;
    const whStock = scope ? await this.dataSource.manager.find(ProductWarehouseStockEntity, { where: { companyId: this.companyId, warehouseId: In([...scope]) } }) : [];
    const scopedQty = (productId: string, total: number) => (scope ? sumQty(whStock.filter((r) => r.productId === productId).map((r) => r.quantity)) : total);
    
    const m = this.dataSource.manager;
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const whName = (id: string | null | undefined) => whs.find((w) => w.id === id)?.name;
    const lots = (await m.find(StockLotEntity, { where: { companyId: this.companyId, quantity: MoreThan(0) } })).filter((l) => !scope || scope.has(l.warehouseId));
    const serials = (await m.find(SerialNumberEntity, { where: { companyId: this.companyId, status: SerialStatus.IN_STOCK } })).filter((x) => !scope || (x.warehouseId && scope.has(x.warehouseId)));
    const items: StockCountItem[] = products.map(p => {
      const sys = scopedQty(p.id, p.quantity);
      const item: StockCountItem = {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        systemQuantity: sys,
        countedQuantity: sys,
        difference: 0,
        unit: p.unit || 'pcs',
        trackingType: p.trackingType || TrackingType.NONE,
      };
      if (p.trackingType === TrackingType.LOT) {
        item.lots = lots
          .filter((l) => l.productId === p.id)
          .map((l) => ({
            lotId: l.id,
            lotNumber: l.lotNumber,
            expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
            warehouseId: l.warehouseId,
            warehouseName: whName(l.warehouseId),
            systemQuantity: l.quantity,
            countedQuantity: l.quantity,
          }));
      } else if (p.trackingType === TrackingType.SERIAL) {
        item.serials = serials
          .filter((x) => x.productId === p.id)
          .map((x) => ({ serial: x.serial, warehouseId: x.warehouseId as string, warehouseName: whName(x.warehouseId), present: true }));
      }
      return item;
    });

    const newCount = this.stockCountRepo.create({
      companyId: this.companyId,
      countNumber,
      status: 'InProgress',
      items,
      startedAt: now,
      performedBy: performedBy || 'System',
      notes: notes || '',
      countType: header.countType || 'PERIODIC',
      countDate: header.countDate ?? dateKeyInZone(now, tz),
      asOfDate: header.asOfDate ?? null,
      warehouseIds: header.warehouseIds ?? null,
      countedBy: header.countedBy ?? null,
      supervisedBy: header.supervisedBy ?? null,
      documentNo: countNumber,
    });

    const saved = await this.stockCountRepo.save(newCount);
    this.appGateway.emitToCompany(this.companyId, 'stock_count_mutated', { type: 'create', stockCount: saved });
    return saved;
  }

  async updateStockCount(id: string, items: any[], notes?: string, headerInput: CountHeaderInput = {}): Promise<StockCountEntity | null> {
    const count = await this.stockCountRepo.findOne({ where: { companyId: this.companyId, id, status: 'InProgress' } });
    if (!count) return null;
    // The scope (warehouses) is fixed when the count starts; the other tutanak fields can change until completion.
    const { warehouseIds: _scope, ...editable } = headerInput;
    Object.assign(count, await this.header(editable, await this.dataSource.manager.findOneByOrFail(CompanyEntity, { id: this.companyId }), count));

    // Counted quantities must fit the unit's precision (kg: 3 decimals, pcs: whole numbers).
    const units = await this.dataSource.manager.find(UnitEntity, { where: { companyId: this.companyId } });
    const decimalsOf = (code: string | undefined) => Number(units.find((u) => u.code === code)?.decimals) || 0;
    for (const item of items || []) {
      const prev = count.items.find((i) => i.productId === item.productId);
      const d = decimalsOf(item.unit || prev?.unit);
      const values = [item.countedQuantity, ...((item.lots || []) as any[]).map((l) => l.countedQuantity)];
      for (const v of values) {
        if (v !== undefined && v !== null && v !== '' && !fitsDecimals(Number(v) || 0, d)) {
          throw new BadRequestException(err('QUANTITY_PRECISION_EXCEEDED', { quantity: v, decimals: d }));
        }
      }
    }
    // Tracked lines keep the server's lot/serial lists; only counts / presence are taken from the client.
    const updatedItems: StockCountItem[] = items.map(item => {
      const prev = count.items.find((i) => i.productId === item.productId);
      const system = Number(prev?.systemQuantity ?? item.systemQuantity) || 0;
      let counted = countQty(item.countedQuantity);
      const out: StockCountItem = {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        systemQuantity: system,
        countedQuantity: counted,
        difference: 0,
        unit: item.unit || prev?.unit || 'pcs',
        trackingType: prev?.trackingType,
      };
      if (prev?.lots) {
        out.lots = prev.lots.map((l) => {
          const c = (item.lots || []).find((x: any) => x.lotId === l.lotId);
          return { ...l, countedQuantity: c ? countQty(c.countedQuantity) : l.countedQuantity };
        });
        counted = sumQty(out.lots.map((l) => l.countedQuantity));
      } else if (prev?.serials) {
        out.serials = prev.serials.map((x) => {
          const c = (item.serials || []).find((y: any) => y.serial === x.serial);
          return { ...x, present: c ? !!c.present : x.present };
        });
        counted = out.serials.filter((x) => x.present).length;
      }
      out.countedQuantity = counted;
      out.difference = roundQty(counted - system);
      return out;
    });

    count.items = updatedItems;
    if (notes !== undefined) {
      count.notes = notes;
    }

    const saved = await this.stockCountRepo.save(count);
    this.appGateway.emitToCompany(this.companyId, 'stock_count_mutated', { type: 'update', stockCount: saved });
    return saved;
  }

  /**
   * Completes the count and books the differences (COUNT_SURPLUS / COUNT_SHORTAGE).
   * Maker-checker (R65): a line whose value (|difference| x unit price, base currency) exceeds
   * the company threshold is not booked; it becomes a pending request (kind COUNT) that a
   * different administrator approves in Stock movements > Pending approvals.
   */
  async completeStockCount(id: string, performedBy?: string): Promise<(StockCountEntity & { pendingApprovals: StockAdjustmentRequestEntity[] }) | null> {
    const count = await this.stockCountRepo.findOne({ where: { companyId: this.companyId, id, status: 'InProgress' } });
    if (!count) return null;
    const actor = performedBy || 'System';
    // Four-eyes on the tutanak: the approver (the user completing the count) is not one of the counters.
    if ((count.countedBy || []).some((n) => n.toLocaleLowerCase('tr') === actor.toLocaleLowerCase('tr'))) {
      throw new BadRequestException(err('COUNT_APPROVER_SAME_AS_COUNTER'));
    }
    const scope = count.warehouseIds && count.warehouseIds.length ? count.warehouseIds : null;
    const touched: ProductEntity[] = [];

    const done = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const company = await manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
      const countedAt = new Date();
      const countDay = dateKeyInZone(countedAt, company.timezone || DEFAULT_TIMEZONE);
      const pending: StockAdjustmentRequestEntity[] = [];
      for (const item of count.items) {
        delete item.approvalRequestId;
        const product = await manager.findOne(ProductEntity, {
          where: { companyId: this.companyId, id: item.productId, isDeleted: false },
          lock: { mode: 'pessimistic_write' }
        });
        if (!product) continue;
        const oldQty = product.quantity;
        item.systemQuantity = scope ? sumQty((await manager.find(ProductWarehouseStockEntity, { where: { companyId: this.companyId, productId: product.id, warehouseId: In(scope) } })).map((r) => r.quantity)) : oldQty;
        // Value at cost of the counted quantity (tutanak / envanter listesi).
        const unit = (await this.warehouseStock.currentUnitCost(manager, this.companyId, product.id)) ?? 0;
        item.unitCost = roundCost(unit);
        item.inventoryClass = product.inventoryClass;
        const { line, net, gross } = await this.countLine(manager, product, item, scope);
        item.countedValue = roundMoney(item.countedQuantity * unit);
        item.differenceValue = roundMoney(net * unit);
        item.difference = net;
        if (!gross) continue;
        const note = `Sayım Düzeltmesi (Fark: ${net > 0 ? '+' : ''}${net})`;

        const check = await this.movements.approvalCheck(manager, product, gross);
        if (check.exceeds) {
          const { request } = await this.movements.createApprovalRequest(
            manager,
            product,
            net,
            check,
            {
              kind: 'COUNT',
              reasonCode: net >= 0 ? 'COUNT_SURPLUS' : 'COUNT_SHORTAGE',
              note,
              line,
              document: { countId: count.id, countNumber: count.countNumber, countDate: countDay, countedAt: countedAt.toISOString() },
            },
            null,
            actor,
          );
          item.approvalRequestId = request.id;
          pending.push(request);
          continue;
        }
        await this.movements.bookCountLine(manager, product, line, {
          type: 'ADJUSTMENT',
          reasonCode: (delta: number) => (delta > 0 ? 'COUNT_SURPLUS' : 'COUNT_SHORTAGE'),
          transactionDate: countedAt,
          documentType: 'STOCK_COUNT',
          documentNo: count.countNumber,
          documentDate: countDay,
          referenceId: count.id,
          referenceType: 'stock_count',
          note,
          performedBy: actor,
        });
        item.difference = roundQty(product.quantity - oldQty);
        touched.push(product);
      }

      count.status = 'Completed';
      count.completedAt = countedAt;
      count.performedBy = actor;
      count.countDate = count.countDate || countDay;
      count.approvedBy = actor.slice(0, 100);
      count.approvedByUserId = this.tenant.actor.userId ?? null;
      count.approvedAt = countedAt;
      count.documentNo = count.documentNo || count.countNumber;
      count.snapshotHash = createHash('sha256')
        .update(JSON.stringify({ count: count.countNumber, date: count.countDate, asOf: count.asOfDate, lines: count.items.map((i) => [i.productId, i.systemQuantity, i.countedQuantity, i.unitCost ?? null, (i.lots || []).map((l) => [l.lotId, l.countedQuantity]), (i.serials || []).filter((x) => !x.present).map((x) => x.serial)]) }))
        .digest('hex');
      const saved = await manager.save(StockCountEntity, count);
      // A full count (all warehouses, year-end / periodic) is the last physical count (VUK 186 / 190).
      if (!scope && (count.countType === 'YEAR_END' || count.countType === 'PERIODIC')) {
        const day = String(count.countDate).slice(0, 10);
        if (!company.lastPhysicalCountDate || String(company.lastPhysicalCountDate).slice(0, 10) < day) {
          await manager.update(CompanyEntity, { id: company.id }, { lastPhysicalCountDate: day });
        }
      }
      return Object.assign(saved, { pendingApprovals: pending });
    });

    for (const product of touched) this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product });
    this.appGateway.emitToCompany(this.companyId, 'stock_count_mutated', { type: 'complete', stockCount: done });
    return done;
  }

  /**
   * Difference of one count item against the current stock: the line to book, its net
   * change and its gross change (sum of |lot deltas|, missing serials or |total delta|),
   * which is what the approval threshold is measured on.
   */
  private async countLine(manager: EntityManager, product: ProductEntity, item: StockCountItem, scope: string[] | null = null): Promise<{ line: CountLine; net: number; gross: number }> {
    if (product.trackingType === TrackingType.LOT && item.lots) {
      const lots = item.lots.length
        ? await manager.find(StockLotEntity, { where: { companyId: this.companyId, productId: product.id, id: In(item.lots.map((l) => l.lotId)) } })
        : [];
      const deltas: { lotId: string; delta: number }[] = [];
      for (const l of item.lots) {
        // Lots received after the count started stay untouched; a vanished lot cannot be counted.
        const cur = lots.find((x) => x.id === l.lotId);
        if (!cur) continue;
        const delta = roundQty(countQty(l.countedQuantity) - cur.quantity);
        if (delta) deltas.push({ lotId: l.lotId, delta });
      }
      return { line: { lots: deltas }, net: sumQty(deltas.map((d) => d.delta)), gross: sumQty(deltas.map((d) => Math.abs(d.delta))) };
    }
    if (product.trackingType === TrackingType.SERIAL && item.serials) {
      const missing = item.serials.filter((x) => !x.present).map((x) => x.serial);
      const stillIn = missing.length
        ? await manager.find(SerialNumberEntity, {
            where: { companyId: this.companyId, productId: product.id, status: SerialStatus.IN_STOCK, serial: In(missing) },
            select: ['id', 'serial'],
          })
        : [];
      return { line: { lostSerials: stillIn.map((r) => r.serial) }, net: -stillIn.length, gross: stillIn.length };
    }
    if ((product.trackingType || TrackingType.NONE) !== TrackingType.NONE) return { line: {}, net: 0, gross: 0 };
    if (scope) {
      // Warehouse-scoped count: compared with the stock of the counted warehouses; the difference is
      // booked in the first counted warehouse.
      const rows = await manager.find(ProductWarehouseStockEntity, { where: { companyId: this.companyId, productId: product.id, warehouseId: In(scope) } });
      const delta = roundQty(countQty(item.countedQuantity) - sumQty(rows.map((r) => r.quantity)));
      return { line: { delta, warehouseId: scope[0] }, net: delta, gross: Math.abs(delta) };
    }
    const delta = roundQty(countQty(item.countedQuantity) - product.quantity);
    return { line: { delta }, net: delta, gross: Math.abs(delta) };
  }
}
