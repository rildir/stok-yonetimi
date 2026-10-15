import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, LessThan } from 'typeorm';
import { createHash } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { FiscalPeriodEntity, InventoryPeriodBalanceEntity } from '../../entities/inventory-accounting.entity';
import { StockCountEntity } from '../../entities/stock-count.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { DespatchEntity } from '../../entities/despatch.entity';
import { StockAdjustmentRequestEntity } from '../../entities/stock-adjustment-request.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { AuditService } from '../integrations/audit.service';
import { ensureFiscalPeriods, periodLabel } from '../../shared/inventory/period-ops';
import { ValuationService } from './valuation.service';
import { DEFAULT_TIMEZONE, todayKey } from '../../shared/tr';

export interface CloseCheck {
  code: 'OPEN_STOCK_COUNT' | 'PENDING_GOODS_RECEIPT' | 'UNINVOICED_DESPATCH' | 'PENDING_APPROVAL' | 'PREVIOUS_PERIOD_OPEN' | 'QUARTERS_OPEN';
  count: number;
  items: { id: string; label: string; date?: string | null }[];
}

const CHECK_TEXT: Record<CloseCheck['code'], { tr: string; en: string }> = {
  OPEN_STOCK_COUNT: { tr: 'Devam eden sayım', en: 'Stock count in progress' },
  PENDING_GOODS_RECEIPT: { tr: 'Tamamlanmamış mal kabul', en: 'Goods receipt not completed' },
  UNINVOICED_DESPATCH: { tr: 'Faturalanmamış sevkiyat', en: 'Shipment not invoiced' },
  PENDING_APPROVAL: { tr: 'Onay bekleyen stok düzeltmesi', en: 'Stock adjustment awaiting approval' },
  PREVIOUS_PERIOD_OPEN: { tr: 'Önceki dönem açık', en: 'Earlier period still open' },
  QUARTERS_OPEN: { tr: 'Yılın açık çeyreği', en: 'Open quarter of the year' },
};

/** Localized one-line details of the failed closing checks (error body `errors`). */
export function checkDetails(checks: CloseCheck[]): { tr: string; en: string }[] {
  return checks.flatMap((c) => c.items.map((i) => ({ tr: `${CHECK_TEXT[c.code].tr}: ${i.label}`, en: `${CHECK_TEXT[c.code].en}: ${i.label}` })));
}

/**
 * Fiscal periods (VUK 174; geçici vergi: 4 çeyrek) and their closing (R48):
 * checks (open stock count, pending goods receipt, uninvoiced shipment, pending approvals,
 * earlier period open) -> closing balance snapshot (inventory_period_balances) -> lock.
 * A CLOSED period takes no movement (service check + DB trigger). Reopening needs an
 * administrator's reason and a second administrator's approval (maker-checker).
 */
@Injectable()
export class FiscalPeriodService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly valuation: ValuationService,
    private readonly warehouseStock: WarehouseStockService,
    private readonly audit: AuditService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async list(year?: number) {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const thisYear = Number(todayKey(company.timezone).slice(0, 4));
    // The next fiscal year exists too, so a costing method change can be planned for its start.
    await ensureFiscalPeriods(m, company, [thisYear - 1, thisYear, thisYear + 1]);
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (year) where['fiscalYear'] = year;
    const periods = await m.find(FiscalPeriodEntity, { where, order: { fiscalYear: 'DESC', quarter: 'ASC' } });
    const pending = await m
      .createQueryBuilder(StockAdjustmentRequestEntity, 'r')
      .where('r.companyId = :c AND r.status = :s AND r.payload LIKE :p', { c: this.companyId, s: 'PENDING', p: '%"kind":"PERIOD_REOPEN"%' })
      .getMany();
    return {
      fiscalYearStartMonth: company.fiscalYearStartMonth || 1,
      stockLockDate: company.stockLockDate ? String(company.stockLockDate).slice(0, 10) : null,
      periods: periods.map((p) => ({
        ...p,
        label: periodLabel(p),
        pendingReopen: pending.find((r) => (r.payload as Record<string, unknown>)['periodId'] === p.id) || null,
      })),
    };
  }

  private async period(m: EntityManager, id: string, lock = false): Promise<FiscalPeriodEntity> {
    const p = await m.findOne(FiscalPeriodEntity, { where: { companyId: this.companyId, id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!p) throw new NotFoundException(err('PERIOD_NOT_FOUND'));
    return p;
  }

  /** Closing checks of a period (empty list = can be closed). */
  async checks(id: string, manager?: EntityManager): Promise<CloseCheck[]> {
    const m = manager || this.dataSource.manager;
    const p = await this.period(m, id);
    const out: CloseCheck[] = [];
    const add = (code: CloseCheck['code'], items: CloseCheck['items']) => items.length && out.push({ code, count: items.length, items: items.slice(0, 20) });
    const end = new Date(p.endAt);
    // Earlier periods of the same type must be closed first.
    const earlier = await m.find(FiscalPeriodEntity, { where: { companyId: this.companyId, periodType: p.periodType, status: 'OPEN', endDate: LessThan(String(p.startDate).slice(0, 10)) } });
    add('PREVIOUS_PERIOD_OPEN', earlier.map((x) => ({ id: x.id, label: periodLabel(x), date: String(x.endDate).slice(0, 10) })));
    if (p.periodType === 'YEAR') {
      const quarters = await m.find(FiscalPeriodEntity, { where: { companyId: this.companyId, periodType: 'QUARTER', fiscalYear: p.fiscalYear, status: 'OPEN' } });
      add('QUARTERS_OPEN', quarters.map((x) => ({ id: x.id, label: periodLabel(x) })));
    }
    const counts = await m.find(StockCountEntity, { where: { companyId: this.companyId, status: 'InProgress' } });
    add('OPEN_STOCK_COUNT', counts.filter((c) => new Date(c.startedAt) < end).map((c) => ({ id: c.id, label: c.countNumber, date: new Date(c.startedAt).toISOString() })));
    const receipts = await m.find(GoodsReceiptEntity, { where: { companyId: this.companyId, status: 'DRAFT', receivedAt: LessThan(end) } });
    add('PENDING_GOODS_RECEIPT', receipts.map((r) => ({ id: r.id, label: r.receiptNo, date: new Date(r.receivedAt).toISOString() })));
    const despatches = await m.find(DespatchEntity, { where: { companyId: this.companyId, status: In(['APPROVED', 'HANDED_TO_PROVIDER', 'SENT', 'DELIVERED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'COMPLETED']), purpose: 'SALE', actualDespatchAt: LessThan(end) } });
    add('UNINVOICED_DESPATCH', despatches.filter((d) => (d.invoiceStatus || 'NONE') !== 'FULL').map((d) => ({ id: d.id, label: d.documentNo || d.id, date: d.actualDespatchAt ? new Date(d.actualDespatchAt).toISOString() : null })));
    const approvals = await m.find(StockAdjustmentRequestEntity, { where: { companyId: this.companyId, status: 'PENDING' } });
    add('PENDING_APPROVAL', approvals.filter((a) => (a.payload as Record<string, unknown>)?.['kind'] !== 'PERIOD_REOPEN' && new Date(a.createdAt) < end).map((a) => ({ id: a.id, label: a.productName || String((a.payload as Record<string, unknown>)?.['kind'] || ''), date: new Date(a.createdAt).toISOString() })));
    return out;
  }

  /**
   * Closes a period: checks, closing snapshot (product x warehouse x lot at cost, hashed), status
   * CLOSED and the company stock lock date moved to the period end. Runs under the company's
   * stock chain lock so no movement slips in between the snapshot and the lock.
   */
  async close(id: string, user?: string) {
    const actor = this.tenant.actor;
    const result = await this.dataSource.transaction(async (m) => {
      await this.warehouseStock.begin(m, this.companyId);
      const p = await this.period(m, id, true);
      if (p.status === 'CLOSED') throw new ConflictException(err('PERIOD_ALREADY_CLOSED', { period: periodLabel(p) }));
      const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
      const today = todayKey(company.timezone || DEFAULT_TIMEZONE);
      if (String(p.endDate).slice(0, 10) >= today) throw new BadRequestException(err('PERIOD_NOT_ENDED', { period: periodLabel(p), end: String(p.endDate).slice(0, 10) }));
      const checks = await this.checks(id, m);
      if (checks.length) {
        throw new ConflictException({ ...err('PERIOD_CLOSE_CHECKS_FAILED', { period: periodLabel(p) }), details: checkDetails(checks) });
      }
      const endDay = String(p.endDate).slice(0, 10);
      const v = await this.valuation.valuate(endDay, 'lot', { manager: m });
      const seq = (p.reopenCount || 0) + 1;
      const canonical = v.rows.map((r) => [r.productId, r.warehouseId, r.lotNumber, r.quantity.toFixed(4), r.unitCost.toFixed(6), r.costValue.toFixed(2)]);
      for (const r of v.rows) {
        await m.save(
          InventoryPeriodBalanceEntity,
          m.create(InventoryPeriodBalanceEntity, {
            companyId: this.companyId,
            periodId: p.id,
            closingSeq: seq,
            productId: r.productId,
            productName: r.productName,
            productSku: r.sku,
            inventoryClass: r.inventoryClass,
            warehouseId: r.warehouseId,
            lotNumber: r.lotNumber,
            unitCode: r.unitCode,
            quantity: r.quantity,
            unitCost: r.unitCost,
            totalCost: r.costValue,
            costingMethod: v.method,
          }),
        );
      }
      p.status = 'CLOSED';
      p.closedAt = new Date();
      p.closedBy = (user || actor.username || 'System').slice(0, 100);
      p.closedByUserId = actor.userId ?? null;
      p.snapshotHash = createHash('sha256').update(JSON.stringify({ period: p.id, seq, method: v.method, rows: canonical })).digest('hex');
      await m.save(FiscalPeriodEntity, p);
      const lock = company.stockLockDate ? String(company.stockLockDate).slice(0, 10) : null;
      if (!lock || lock < endDay) {
        company.stockLockDate = endDay;
        await m.save(CompanyEntity, company);
      }
      return { period: { ...p, label: periodLabel(p) }, snapshot: { rows: v.rows.length, quantity: v.totals.quantity, costValue: v.totals.costValue, method: v.method } };
    });
    await this.audit.record({ companyId: this.companyId, action: 'period_close', entityType: 'fiscal_periods', entityId: id, after: { label: result.period.label, snapshotHash: result.period.snapshotHash, costValue: result.snapshot.costValue } });
    return result;
  }

  /** Closing snapshot rows of a closed period (latest closing). */
  async snapshot(id: string) {
    const m = this.dataSource.manager;
    const p = await this.period(m, id);
    const seq = p.status === 'CLOSED' ? (p.reopenCount || 0) + 1 : p.reopenCount || 0;
    const rows = seq ? await m.find(InventoryPeriodBalanceEntity, { where: { companyId: this.companyId, periodId: p.id, closingSeq: seq }, order: { productName: 'ASC' } }) : [];
    return { period: { ...p, label: periodLabel(p) }, closingSeq: seq, rows, totalCost: rows.reduce((s, r) => Math.round((s + Number(r.totalCost)) * 100) / 100, 0) };
  }

  /**
   * Reopen request (admin): needs a reason; only the latest closed period can be reopened.
   * Becomes effective when a second administrator approves it (Stock movements > approvals).
   */
  async requestReopen(id: string, reason: string, user?: string) {
    const text = String(reason || '').trim();
    if (!text) throw new BadRequestException(err('REOPEN_REASON_REQUIRED'));
    const actor = this.tenant.actor;
    return this.dataSource.transaction(async (m) => {
      const p = await this.period(m, id, true);
      if (p.status !== 'CLOSED') throw new BadRequestException(err('PERIOD_NOT_CLOSED', { period: periodLabel(p) }));
      const later = await m
        .createQueryBuilder(FiscalPeriodEntity, 'x')
        .where('x.companyId = :c AND x.status = :s AND x.id <> :id AND (x.endDate > :end OR (x.endDate = :end AND x.periodType = :y AND :t = :q))', {
          c: this.companyId, s: 'CLOSED', id: p.id, end: String(p.endDate).slice(0, 10), y: 'YEAR', t: p.periodType, q: 'QUARTER',
        })
        .getCount();
      if (later) throw new BadRequestException(err('PERIOD_REOPEN_NOT_LATEST', { period: periodLabel(p) }));
      const open = await m
        .createQueryBuilder(StockAdjustmentRequestEntity, 'r')
        .where('r.companyId = :c AND r.status = :s AND r.payload LIKE :p', { c: this.companyId, s: 'PENDING', p: `%"periodId":"${p.id}"%` })
        .getCount();
      if (open) throw new ConflictException(err('PERIOD_REOPEN_ALREADY_PENDING', { period: periodLabel(p) }));
      const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
      const request = await m.save(
        StockAdjustmentRequestEntity,
        m.create(StockAdjustmentRequestEntity, {
          companyId: this.companyId,
          status: 'PENDING',
          productId: null,
          productName: null,
          warehouseId: null,
          quantityDelta: 0,
          estimatedValue: 0,
          currency: company.baseCurrency,
          threshold: 0,
          payload: { kind: 'PERIOD_REOPEN', periodId: p.id, period: periodLabel(p), note: text.slice(0, 500) },
          requestedBy: String(user || actor.username || 'System').slice(0, 100),
          requestedByUserId: actor.userId ?? null,
        }),
      );
      await this.audit.record({ companyId: this.companyId, action: 'period_reopen_request', entityType: 'fiscal_periods', entityId: p.id, after: { label: periodLabel(p), reason: text } });
      return { code: 'PERIOD_REOPEN_PENDING_APPROVAL', request };
    });
  }

  /** Assert helper for other services: a day inside a closed period (throws PERIOD_CLOSED). */
  async assertOpen(day: string, manager?: EntityManager): Promise<void> {
    const m = manager || this.dataSource.manager;
    const p = await m
      .createQueryBuilder(FiscalPeriodEntity, 'p')
      .where('p.companyId = :c AND p.status = :s AND p.startDate <= :d AND p.endDate >= :d', { c: this.companyId, s: 'CLOSED', d: day })
      .getOne();
    if (p) throw new BadRequestException(err('PERIOD_CLOSED', { period: periodLabel(p), date: day }));
  }

  /** Fiscal year start month (only while no period has been closed). */
  async setFiscalYearStartMonth(month: number) {
    const mth = Math.floor(Number(month));
    if (!(mth >= 1 && mth <= 12)) throw new BadRequestException(err('FISCAL_YEAR_START_INVALID'));
    const m = this.dataSource.manager;
    const closed = await m.count(FiscalPeriodEntity, { where: { companyId: this.companyId, status: 'CLOSED' } });
    if (closed) throw new ForbiddenException(err('FISCAL_YEAR_START_LOCKED'));
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    company.fiscalYearStartMonth = mth;
    await m.save(CompanyEntity, company);
    await m.delete(FiscalPeriodEntity, { companyId: this.companyId, status: 'OPEN' });
    return this.list();
  }
}
