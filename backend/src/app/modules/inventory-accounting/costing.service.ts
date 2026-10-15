import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, MoreThan } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { FiscalPeriodEntity, LandedCostAllocationEntity, StockCostLayerEntity } from '../../entities/inventory-accounting.entity';
import { FinanceService } from '../../shared/services/finance.service';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { AuditService } from '../integrations/audit.service';
import { allocateLandedCost, averageCost, CostLayer, roundCost, roundMoney, splitLandedShare } from '../../shared/inventory/costing';
import { COSTING_METHODS, isCostingMethod, LANDED_COST_TYPES, POST_RECEIPT_FX_POLICIES, todayKey } from '../../shared/tr';
import { FiscalPeriodService } from './fiscal-period.service';
import { periodLabel } from '../../shared/inventory/period-ops';

export interface LandedCostInput {
  goodsReceiptId: string;
  costType: string;
  amount: number;
  currency?: string | null;
  fxRate?: number | null;
  basis?: 'AMOUNT' | 'QUANTITY';
  documentNo?: string | null;
  documentDate?: string | null;
  vendorName?: string | null;
  vendorTaxId?: string | null;
  note?: string | null;
}

/** Parses a decimal written either way ("1.234,56" / "1234.56"). */
export function parseDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Costing settings and cost adjustments (VUK 274, 262; TTK 66/4; R46-R47):
 *  - costing method: changed only at the start of an open fiscal year (reason audited);
 *  - landed costs (nakliye, gümrük, sigorta, depolama...) allocated over a goods receipt by
 *    amount or quantity: the part on goods still on hand raises their layer cost, the part on
 *    goods already issued goes to cost of sales;
 *  - opening cost import (CSV, product / lot).
 */
@Injectable()
export class CostingService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly finance: FinanceService,
    private readonly warehouseStock: WarehouseStockService,
    private readonly periods: FiscalPeriodService,
    private readonly audit: AuditService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async settings() {
    const c = await this.promotePending();
    return {
      costingMethod: c.costingMethod,
      costingMethodEffectiveFrom: c.costingMethodEffectiveFrom ? String(c.costingMethodEffectiveFrom).slice(0, 10) : null,
      pendingCostingMethod: c.pendingCostingMethod ?? null,
      pendingCostingMethodFrom: c.pendingCostingMethodFrom ? String(c.pendingCostingMethodFrom).slice(0, 10) : null,
      postReceiptFxPolicy: c.postReceiptFxPolicy,
      methods: COSTING_METHODS,
      landedCostTypes: LANDED_COST_TYPES,
      bookkeepingType: c.bookkeepingType ?? null,
      baseCurrency: c.baseCurrency,
    };
  }

  /** A pending method whose effective day has come becomes the current one. */
  private async promotePending(): Promise<CompanyEntity> {
    const m = this.dataSource.manager;
    const c = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const from = c.pendingCostingMethodFrom ? String(c.pendingCostingMethodFrom).slice(0, 10) : null;
    if (c.pendingCostingMethod && from && todayKey(c.timezone) >= from) {
      c.costingMethod = c.pendingCostingMethod;
      c.costingMethodEffectiveFrom = from;
      c.pendingCostingMethod = null;
      c.pendingCostingMethodFrom = null;
      await m.save(CompanyEntity, c);
    }
    return c;
  }

  /**
   * TTK 66/4 / VUK: the valuation method is kept consistently; a change takes effect at the start
   * of a fiscal year that is still open. A start day already passed is accepted only while no
   * movement is dated in that year (otherwise the year would be valued with two methods).
   */
  async changeMethod(input: { method: string; effectiveFrom: string; reason: string; postReceiptFxPolicy?: string }, user?: string) {
    if (!isCostingMethod(input.method)) throw new BadRequestException(err('COSTING_METHOD_INVALID', { method: String(input.method) }));
    const reason = String(input.reason || '').trim();
    if (!reason) throw new BadRequestException(err('COSTING_METHOD_REASON_REQUIRED'));
    const m = this.dataSource.manager;
    const company = await this.promotePending();
    const day = String(input.effectiveFrom || '').slice(0, 10);
    const year = await m.findOne(FiscalPeriodEntity, { where: { companyId: this.companyId, periodType: 'YEAR', startDate: day } });
    if (!year || year.status !== 'OPEN') throw new BadRequestException(err('COSTING_METHOD_CHANGE_ONLY_AT_PERIOD_START', { date: day || '-' }));
    const today = todayKey(company.timezone);
    const before = { costingMethod: company.costingMethod, effectiveFrom: company.costingMethodEffectiveFrom, pending: company.pendingCostingMethod, pendingFrom: company.pendingCostingMethodFrom };
    if (day <= today) {
      const moved = await m.count(StockMovementEntity, { where: { companyId: this.companyId, transactionDate: MoreThan(new Date(year.startAt.getTime() - 1)) } });
      if (moved) throw new BadRequestException(err('COSTING_METHOD_CHANGE_ONLY_AT_PERIOD_START', { date: day }));
      company.costingMethod = input.method;
      company.costingMethodEffectiveFrom = day;
      company.pendingCostingMethod = null;
      company.pendingCostingMethodFrom = null;
    } else {
      company.pendingCostingMethod = input.method;
      company.pendingCostingMethodFrom = day;
    }
    if (input.postReceiptFxPolicy !== undefined) {
      if (!(POST_RECEIPT_FX_POLICIES as readonly string[]).includes(input.postReceiptFxPolicy)) throw new BadRequestException(err('VALIDATION_FIELD_IN'));
      company.postReceiptFxPolicy = input.postReceiptFxPolicy;
    }
    await m.save(CompanyEntity, company);
    await this.audit.record({
      companyId: this.companyId,
      action: 'costing_method_change',
      entityType: 'companies',
      entityId: this.companyId,
      before,
      after: { method: input.method, effectiveFrom: day, reason, user: user ?? null },
    });
    return this.settings();
  }

  async setFxPolicy(policy: string) {
    if (!(POST_RECEIPT_FX_POLICIES as readonly string[]).includes(policy)) throw new BadRequestException(err('VALIDATION_FIELD_IN'));
    const m = this.dataSource.manager;
    const c = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    c.postReceiptFxPolicy = policy;
    await m.save(CompanyEntity, c);
    return this.settings();
  }

  /** Cost of one product: open layers, average unit cost and value. */
  async productCost(productId: string) {
    const m = this.dataSource.manager;
    const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: productId } });
    if (!p) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
    const layers = await this.warehouseStock.openLayers(m, this.companyId, productId);
    const unit = averageCost(layers as unknown as CostLayer[]);
    const qty = layers.reduce((s, l) => s + Number(l.qtyRemaining), 0);
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    return {
      productId,
      method: company.costingMethod,
      currency: company.baseCurrency,
      unitCost: unit ?? (await this.warehouseStock.currentUnitCost(m, this.companyId, productId)),
      quantity: Math.round(qty * 10000) / 10000,
      costValue: roundMoney(layers.reduce((s, l) => s + Number(l.qtyRemaining) * Number(l.unitCost), 0)),
      layers: layers.map((l) => ({ id: l.id, receivedAt: l.receivedAt, lotNumber: l.lotNumber, qtyIn: l.qtyIn, qtyRemaining: l.qtyRemaining, unitCost: l.unitCost, source: l.source })),
    };
  }

  /** Unit costs of many products (list views): average of open layers. */
  async unitCosts(productIds: string[]): Promise<Map<string, number>> {
    if (!productIds.length) return new Map();
    const rows: { productId: string; q: string; v: string }[] = await this.dataSource.manager.query(
      'SELECT `productId`, SUM(`qtyRemaining`) AS q, SUM(`qtyRemaining` * `unitCost`) AS v FROM `stock_cost_layers` WHERE `companyId` = ? AND `qtyRemaining` > 0 AND `productId` IN (?) GROUP BY `productId`',
      [this.companyId, productIds],
    );
    return new Map(rows.filter((r) => Number(r.q) > 0).map((r) => [r.productId, roundCost(Number(r.v) / Number(r.q))]));
  }

  listLandedCosts(goodsReceiptId?: string) {
    return this.dataSource.manager.find(LandedCostAllocationEntity, {
      where: { companyId: this.companyId, ...(goodsReceiptId ? { goodsReceiptId } : {}) },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** Allocates a VUK 262 cost element over the receipts of a goods receipt. */
  async addLandedCost(input: LandedCostInput, user?: string) {
    if (!(LANDED_COST_TYPES as readonly string[]).includes(input.costType)) throw new BadRequestException(err('LANDED_COST_TYPE_INVALID', { type: String(input.costType) }));
    const amountIn = Number(input.amount);
    if (!(amountIn > 0)) throw new BadRequestException(err('LANDED_COST_AMOUNT_INVALID'));
    const basis = input.basis === 'QUANTITY' ? 'QUANTITY' : 'AMOUNT';
    if (!String(input.goodsReceiptId || '').trim()) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    return this.dataSource.transaction(async (m) => {
      await this.warehouseStock.begin(m, this.companyId);
      const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
      if (input.costType === 'KUR_FARKI_GIRIS_SONRASI' && company.postReceiptFxPolicy !== 'COST') {
        throw new BadRequestException(err('LANDED_COST_POST_RECEIPT_FX_EXPENSE'));
      }
      const today = todayKey(company.timezone);
      await this.periods.assertOpen(today, m);
      const r = await m.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, id: input.goodsReceiptId } });
      if (!r) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (r.status !== 'COMPLETED') throw new BadRequestException(err('LANDED_COST_RECEIPT_NOT_COMPLETED', { number: r.receiptNo }));
      const currency = (input.currency || company.baseCurrency).toUpperCase();
      const fxRate = currency === company.baseCurrency ? 1 : Number(input.fxRate) > 0 ? Number(input.fxRate) : await this.finance.requireRate(currency, company.baseCurrency, input.documentDate || null, m);
      const amount = roundMoney(amountIn * fxRate);
      const movements = await m
        .createQueryBuilder(StockMovementEntity, 'sm')
        .where('sm.companyId = :c AND sm.referenceType = :rt AND sm.referenceId = :po AND sm.reasonCode IN (:...reasons) AND sm.note LIKE :n', {
          c: this.companyId, rt: 'purchase_order', po: r.poNumber, reasons: ['PURCHASE', 'TESELLUM_SURPLUS'], n: `%${r.receiptNo}%`,
        })
        .orderBy('sm.sequenceNo', 'ASC')
        .getMany();
      if (!movements.length) throw new BadRequestException(err('LANDED_COST_NO_RECEIPT_LINES', { number: r.receiptNo }));
      const shares = allocateLandedCost(
        movements.map((x) => ({ key: x.id, quantity: Number(x.quantity), amount: Math.abs(Number(x.totalCost || 0)) })),
        amount,
        basis,
      );
      const layers = await m.find(StockCostLayerEntity, { where: { companyId: this.companyId, movementId: In(movements.map((x) => x.id)) } });
      const lines: Record<string, unknown>[] = [];
      let toInventory = 0;
      let toCogs = 0;
      for (const sh of shares) {
        const mv = movements.find((x) => x.id === sh.key)!;
        const layer = layers.find((l) => l.movementId === mv.id);
        const split = layer ? splitLandedShare(sh.share, Number(layer.qtyIn), Number(layer.qtyRemaining)) : { toInventory: 0, toCogs: roundMoney(sh.share) };
        if (layer && split.toInventory > 0 && Number(layer.qtyRemaining) > 0) {
          layer.unitCost = roundCost(Number(layer.unitCost) + split.toInventory / Number(layer.qtyRemaining));
          await m.update(StockCostLayerEntity, { id: layer.id }, { unitCost: layer.unitCost });
        }
        toInventory = roundMoney(toInventory + split.toInventory);
        toCogs = roundMoney(toCogs + split.toCogs);
        lines.push({ movementId: mv.id, productId: mv.productId, productName: mv.productName, lotNumber: mv.lotNumber ?? null, quantity: Number(mv.quantity), share: sh.share, toInventory: split.toInventory, toCogs: split.toCogs });
      }
      const saved = await m.save(
        LandedCostAllocationEntity,
        m.create(LandedCostAllocationEntity, {
          companyId: this.companyId,
          goodsReceiptId: r.id,
          receiptNo: r.receiptNo,
          costType: input.costType,
          basis,
          amount,
          currency,
          originalAmount: roundMoney(amountIn),
          fxRate: roundCost(fxRate),
          documentNo: input.documentNo ? String(input.documentNo).slice(0, 50) : null,
          documentDate: input.documentDate || null,
          vendorName: input.vendorName ? String(input.vendorName).slice(0, 255) : null,
          vendorTaxId: input.vendorTaxId ? String(input.vendorTaxId).slice(0, 11) : null,
          toInventory,
          toCogs,
          lines,
          note: input.note ? String(input.note).slice(0, 500) : null,
          allocatedOn: today,
          createdBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
        }),
      );
      return saved;
    });
  }

  /**
   * Opening cost import (CSV: sku;lotNumber;unitCost - header optional, ';' or ',' separated,
   * decimal comma allowed). Re-prices the open OPENING / BACKFILL / MISSING / AVERAGE layers of
   * the product (or lot); the value difference is recorded as an ACILIS_MALIYETI cost adjustment.
   */
  async importOpeningCosts(csv: string, user?: string) {
    const text = String(csv || '').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new BadRequestException(err('OPENING_COST_CSV_EMPTY'));
    const sep = lines[0].includes(';') ? ';' : ',';
    const start = /sku|stok/i.test(lines[0]) ? 1 : 0;
    const results: { line: number; sku: string; lotNumber: string | null; status: 'UPDATED' | 'SKIPPED'; reason?: string; layers?: number; difference?: number }[] = [];
    await this.dataSource.transaction(async (m) => {
      await this.warehouseStock.begin(m, this.companyId);
      const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
      const today = todayKey(company.timezone);
      await this.periods.assertOpen(today, m);
      const adjLines: Record<string, unknown>[] = [];
      let total = 0;
      for (let i = start; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        const [sku, lotRaw, costRaw] = cols.length >= 3 ? cols : [cols[0], '', cols[1]];
        const lotNumber = lotRaw ? lotRaw : null;
        const unit = parseDecimal(costRaw);
        if (!sku || unit === null || unit < 0) {
          results.push({ line: i + 1, sku: sku || '', lotNumber, status: 'SKIPPED', reason: 'INVALID_ROW' });
          continue;
        }
        const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, sku } });
        if (!p) {
          results.push({ line: i + 1, sku, lotNumber, status: 'SKIPPED', reason: 'PRODUCT_NOT_FOUND' });
          continue;
        }
        const layers = await m.find(StockCostLayerEntity, {
          where: { companyId: this.companyId, productId: p.id, qtyRemaining: MoreThan(0), source: In(['OPENING', 'BACKFILL', 'MISSING', 'AVERAGE']), ...(lotNumber ? { lotNumber } : {}) },
        });
        if (!layers.length) {
          results.push({ line: i + 1, sku, lotNumber, status: 'SKIPPED', reason: 'NO_OPENING_LAYER' });
          continue;
        }
        let diff = 0;
        for (const l of layers) {
          diff += (roundCost(unit) - Number(l.unitCost)) * Number(l.qtyRemaining);
          await m.update(StockCostLayerEntity, { id: l.id }, { unitCost: roundCost(unit), source: 'OPENING' });
        }
        diff = roundMoney(diff);
        total = roundMoney(total + diff);
        adjLines.push({ movementId: null, productId: p.id, productName: p.name, lotNumber, quantity: layers.reduce((s, l) => s + Number(l.qtyRemaining), 0), share: diff, toInventory: diff, toCogs: 0 });
        results.push({ line: i + 1, sku, lotNumber, status: 'UPDATED', layers: layers.length, difference: diff });
      }
      if (adjLines.length) {
        await m.save(
          LandedCostAllocationEntity,
          m.create(LandedCostAllocationEntity, {
            companyId: this.companyId,
            goodsReceiptId: null,
            receiptNo: null,
            costType: 'ACILIS_MALIYETI',
            basis: 'QUANTITY',
            amount: total,
            currency: company.baseCurrency,
            originalAmount: total,
            fxRate: 1,
            toInventory: total,
            toCogs: 0,
            lines: adjLines,
            note: 'Açılış maliyeti içe aktarımı (CSV)',
            allocatedOn: today,
            createdBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
          }),
        );
      }
    });
    return { updated: results.filter((r) => r.status === 'UPDATED').length, skipped: results.filter((r) => r.status === 'SKIPPED').length, results };
  }

  /** Label for messages. */
  label(p: FiscalPeriodEntity) {
    return periodLabel(p);
  }
}
