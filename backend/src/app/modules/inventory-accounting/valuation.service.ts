import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { FiscalPeriodEntity, InventoryPeriodBalanceEntity } from '../../entities/inventory-accounting.entity';
import { FinanceService } from '../../shared/services/finance.service';
import { convertAmount } from '../../shared/finance/currency';
import { CostingMethod, periodicAverage, reconcileParts, roundCost, roundMoney } from '../../shared/inventory/costing';
import { addDays, dateKeyInZone, DEFAULT_TIMEZONE, fiscalYearPeriods, roundQty, zonedDayStart } from '../../shared/tr';

export type Breakdown = 'product' | 'warehouse' | 'lot';

export interface ValuationRow {
  productId: string;
  productName: string;
  sku: string | null;
  inventoryClass: string;
  categoryId: string | null;
  category: string | null;
  unitCode: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  unitCost: number;
  /** Value at cost (VUK 274) - the legal inventory value */
  costValue: number;
  /** Information only: quantity x current sales price (base currency); never the legal value */
  salesValue: number | null;
  /** Cost could not be established for part of the stock (legacy / missing cost) */
  costMissing: boolean;
}

export interface ValuationResult {
  asOf: string;
  /** SNAPSHOT: the locked closing balance of a closed period ending on asOf; COMPUTED otherwise */
  source: 'SNAPSHOT' | 'COMPUTED';
  /** Closed period whose closing balance was served (source SNAPSHOT) */
  snapshotPeriodId?: string | null;
  asOfInstant: string;
  method: CostingMethod;
  currency: string;
  breakdown: Breakdown;
  rows: ValuationRow[];
  totals: { quantity: number; costValue: number; salesValue: number };
}

const TRANSFER_TYPES = ['TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT'];

/**
 * Inventory valuation at cost on any date (VUK 274; R46). Anchored at the present: the stock on
 * hand (product_warehouse_stocks / stock_lots) and its open cost layers are rolled back by the
 * movements dated after the valuation instant (their stamped cost) and by the cost adjustments
 * (landed costs, opening revaluations) made after it. Periodic weighted-average companies get the
 * period's average ((opening value + receipts) / (opening qty + receipts qty)).
 *
 * Warehouse / lot rows use the product's unit cost, except SPECIFIC_LOT (each lot's own layers);
 * their quantities are reconciled to the product level (reconcileParts) so every breakdown gives
 * the same total.
 *
 * A date on which a CLOSED fiscal period ends is answered from that period's locked closing
 * snapshot (inventory_period_balances, latest closing): the signed year-end / quarter-end list is
 * always the closing balance, whatever happens to the books later.
 */
@Injectable()
export class ValuationService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly finance: FinanceService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /** End of a company-local day as a UTC instant (exclusive bound). */
  dayEnd(day: string, tz: string): Date {
    return zonedDayStart(addDays(day, 1), tz);
  }

  /** Costing method in force on `day`. */
  methodOn(company: CompanyEntity, day: string): CostingMethod {
    const from = company.pendingCostingMethodFrom ? String(company.pendingCostingMethodFrom).slice(0, 10) : null;
    if (company.pendingCostingMethod && from && day >= from) return company.pendingCostingMethod as CostingMethod;
    return (company.costingMethod || 'WAVG_MOVING') as CostingMethod;
  }

  async valuate(asOfDay: string, breakdown: Breakdown = 'product', opts: { manager?: EntityManager; includeZero?: boolean; productIds?: string[]; ignoreSnapshot?: boolean } = {}): Promise<ValuationResult> {
    const m = opts.manager || this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const instant = this.dayEnd(asOfDay, tz);
    if (!opts.ignoreSnapshot) {
      const snap = await this.fromSnapshot(m, company, asOfDay, instant, breakdown, opts);
      if (snap) return snap;
    }
    const method = this.methodOn(company, asOfDay);
    const product = await this.productLevel(m, company, instant, opts.productIds);

    // Periodic weighted average: unit cost of the period that contains the valuation day.
    if (method === 'WAVG_PERIODIC_QUARTERLY' || method === 'WAVG_PERIODIC_YEARLY') {
      const periods = fiscalYearPeriods(Number(asOfDay.slice(0, 4)) - (Number(asOfDay.slice(5, 7)) < (company.fiscalYearStartMonth || 1) ? 1 : 0), company.fiscalYearStartMonth || 1);
      const p = periods.find((x) => (method === 'WAVG_PERIODIC_YEARLY' ? x.periodType === 'YEAR' : x.periodType === 'QUARTER') && x.startDate <= asOfDay && x.endDate >= asOfDay);
      if (p) {
        const start = zonedDayStart(p.startDate, tz);
        const opening = await this.productLevel(m, company, start, opts.productIds);
        const receipts: { productId: string; q: string; v: string }[] = await m.query(
          'SELECT `productId`, SUM(`quantity`) AS q, SUM(`totalCost`) AS v FROM `stock_movements` WHERE `companyId` = ? AND `transactionDate` >= ? AND `transactionDate` < ? AND `quantity` > 0 AND `type` NOT IN (?) ' +
            // NULL reason codes (legacy rows) are receipts too: NOT IN alone would drop them.
            "AND (`reasonCode` IS NULL OR `reasonCode` NOT IN ('RETURN', 'CORRECTION')) GROUP BY `productId`",
          [this.companyId, start, instant, TRANSFER_TYPES],
        );
        for (const [id, row] of product) {
          const o = opening.get(id);
          const r = receipts.find((x) => x.productId === id);
          const unit = periodicAverage({ quantity: o?.quantity || 0, value: o?.value || 0 }, r ? [{ quantity: Number(r.q) || 0, value: Number(r.v) || 0 }] : []);
          if (unit !== null && row.quantity > 0) {
            row.unitCost = unit;
            row.value = roundMoney(row.quantity * unit);
          }
        }
      }
    }

    const products = await m.find(ProductEntity, { where: { companyId: this.companyId } });
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const rates = await this.finance.getRates(m);
    const salesUnit = (p: ProductEntity) => convertAmount(Number(p.price) || 0, p.currency || company.baseCurrency, company.baseCurrency, rates, null, company.baseCurrency);
    const cats: { id: string; name: string }[] = await m.query('SELECT `id`, `name` FROM `categories` WHERE `companyId` = ?', [this.companyId]);
    const rows: ValuationRow[] = [];
    const baseRow = (p: ProductEntity) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku ?? null,
      inventoryClass: p.inventoryClass || 'TICARI_MAL_153',
      categoryId: p.categoryId ?? null,
      category: cats.find((c) => c.id === p.categoryId)?.name ?? p.category ?? null,
      unitCode: p.unit || null,
    });
    const lotUnits = method === 'SPECIFIC_LOT' && breakdown === 'lot' ? await this.lotUnitCosts(m) : new Map<string, number>();

    for (const p of products) {
      const agg = product.get(p.id);
      if (!agg) continue;
      if (!opts.includeZero && !(agg.quantity > 0)) continue;
      const unit = agg.unitCost !== undefined ? agg.unitCost : agg.quantity > 0 ? roundCost(Math.max(0, agg.value) / agg.quantity) : 0;
      const sales = salesUnit(p);
      if (breakdown === 'product') {
        rows.push({
          ...baseRow(p), warehouseId: null, warehouseName: null, lotNumber: null, expiryDate: null,
          quantity: agg.quantity, unitCost: unit, costValue: agg.quantity > 0 ? roundMoney(Math.max(0, agg.value)) : 0,
          salesValue: sales === null ? null : roundMoney(agg.quantity * sales), costMissing: agg.missing,
        });
        continue;
      }
      const raw = breakdown === 'warehouse' ? await this.warehouseQty(m, p.id, instant) : await this.lotQty(m, p, instant);
      // Parts add up to the product quantity (legacy movements without warehouse, ledger gaps).
      const parts = raw.length ? reconcileParts(raw, agg.quantity) : agg.quantity > 0 ? [{ warehouseId: null, lotNumber: null, expiryDate: null, quantity: agg.quantity }] : [];
      // The product's value is split over its parts; the last part takes the rounding rest so the
      // breakdown totals equal the product-level value to the cent (not for SPECIFIC_LOT lot costs).
      const productValue = agg.quantity > 0 ? roundMoney(Math.max(0, agg.value)) : 0;
      let valueLeft = productValue;
      const shown = parts.filter((x) => opts.includeZero || x.quantity > 0);
      const lotCosted = shown.some((x) => x.lotNumber && lotUnits.has(`${p.id}|${x.lotNumber}`));
      for (const [idx, part] of shown.entries()) {
        const u = part.lotNumber && lotUnits.has(`${p.id}|${part.lotNumber}`) ? lotUnits.get(`${p.id}|${part.lotNumber}`)! : unit;
        const value = !lotCosted && idx === shown.length - 1 ? roundMoney(Math.max(0, valueLeft)) : roundMoney(part.quantity * u);
        valueLeft = roundMoney(valueLeft - value);
        rows.push({
          ...baseRow(p),
          warehouseId: part.warehouseId,
          warehouseName: whs.find((w) => w.id === part.warehouseId)?.name ?? null,
          lotNumber: part.lotNumber,
          expiryDate: part.expiryDate,
          quantity: part.quantity,
          unitCost: u,
          costValue: value,
          salesValue: sales === null ? null : roundMoney(part.quantity * sales),
          costMissing: agg.missing,
        });
      }
    }
    rows.sort((a, b) => a.inventoryClass.localeCompare(b.inventoryClass) || a.productName.localeCompare(b.productName, 'tr') || String(a.warehouseName).localeCompare(String(b.warehouseName), 'tr') || String(a.lotNumber).localeCompare(String(b.lotNumber)));
    return {
      asOf: asOfDay,
      source: 'COMPUTED',
      snapshotPeriodId: null,
      asOfInstant: instant.toISOString(),
      method,
      currency: company.baseCurrency,
      breakdown,
      rows,
      totals: {
        quantity: roundQty(rows.reduce((s, r) => s + r.quantity, 0)),
        costValue: roundMoney(rows.reduce((s, r) => s + r.costValue, 0)),
        salesValue: roundMoney(rows.reduce((s, r) => s + (r.salesValue || 0), 0)),
      },
    };
  }

  /** Latest closing snapshot of a CLOSED period ending on `day` (null when there is none). */
  async closedSnapshotOn(m: EntityManager, day: string): Promise<{ period: FiscalPeriodEntity; rows: InventoryPeriodBalanceEntity[] } | null> {
    const periods = await m.find(FiscalPeriodEntity, { where: { companyId: this.companyId, status: 'CLOSED', endDate: day }, order: { closedAt: 'DESC' } });
    const p = periods[0];
    if (!p) return null;
    const rows = await m.find(InventoryPeriodBalanceEntity, { where: { companyId: this.companyId, periodId: p.id, closingSeq: (p.reopenCount || 0) + 1 } });
    return { period: p, rows };
  }

  /** Valuation served from a closing snapshot, aggregated to the requested breakdown. */
  private async fromSnapshot(
    m: EntityManager,
    company: CompanyEntity,
    asOfDay: string,
    instant: Date,
    breakdown: Breakdown,
    opts: { includeZero?: boolean; productIds?: string[] },
  ): Promise<ValuationResult | null> {
    const snap = await this.closedSnapshotOn(m, asOfDay);
    if (!snap) return null;
    const products = await m.find(ProductEntity, { where: { companyId: this.companyId } });
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const cats: { id: string; name: string }[] = await m.query('SELECT `id`, `name` FROM `categories` WHERE `companyId` = ?', [this.companyId]);
    const lots: { productId: string; warehouseId: string; lotNumber: string; expiryDate: string | null }[] = await m.query(
      "SELECT `productId`, `warehouseId`, `lotNumber`, DATE_FORMAT(`expiryDate`, '%Y-%m-%d') AS expiryDate FROM `stock_lots` WHERE `companyId` = ?",
      [this.companyId],
    );
    const rates = await this.finance.getRates(m);
    const groups = new Map<string, { r: InventoryPeriodBalanceEntity; quantity: number; value: number; warehouseId: string | null; lotNumber: string | null }>();
    for (const r of snap.rows) {
      if (opts.productIds && !opts.productIds.includes(r.productId)) continue;
      const warehouseId = breakdown === 'product' ? null : r.warehouseId ?? null;
      const lotNumber = breakdown === 'lot' ? r.lotNumber ?? null : null;
      const k = `${r.productId}|${warehouseId}|${lotNumber}`;
      const g = groups.get(k) || { r, quantity: 0, value: 0, warehouseId, lotNumber };
      g.quantity = roundQty(g.quantity + Number(r.quantity));
      g.value = roundMoney(g.value + Number(r.totalCost));
      groups.set(k, g);
    }
    const rows: ValuationRow[] = [];
    for (const g of groups.values()) {
      if (!opts.includeZero && !(g.quantity > 0)) continue;
      const p = products.find((x) => x.id === g.r.productId);
      const sales = p ? convertAmount(Number(p.price) || 0, p.currency || company.baseCurrency, company.baseCurrency, rates, null, company.baseCurrency) : null;
      rows.push({
        productId: g.r.productId,
        productName: g.r.productName,
        sku: g.r.productSku ?? null,
        inventoryClass: g.r.inventoryClass || p?.inventoryClass || 'TICARI_MAL_153',
        categoryId: p?.categoryId ?? null,
        category: cats.find((c) => c.id === p?.categoryId)?.name ?? p?.category ?? null,
        unitCode: g.r.unitCode ?? p?.unit ?? null,
        warehouseId: g.warehouseId,
        warehouseName: whs.find((w) => w.id === g.warehouseId)?.name ?? null,
        lotNumber: g.lotNumber,
        expiryDate: g.lotNumber ? lots.find((l) => l.productId === g.r.productId && l.lotNumber === g.lotNumber && (!g.warehouseId || l.warehouseId === g.warehouseId))?.expiryDate ?? null : null,
        quantity: g.quantity,
        unitCost: g.quantity > 0 ? roundCost(g.value / g.quantity) : 0,
        costValue: g.value,
        salesValue: sales === null ? null : roundMoney(g.quantity * sales),
        costMissing: g.quantity > 0 && !(g.value > 0),
      });
    }
    // Products asked for explicitly with zero rows (stock card opening) that the snapshot does not hold.
    if (opts.includeZero && opts.productIds) {
      for (const id of opts.productIds) {
        if (rows.some((r) => r.productId === id)) continue;
        const p = products.find((x) => x.id === id);
        if (!p) continue;
        rows.push({
          productId: p.id, productName: p.name, sku: p.sku ?? null, inventoryClass: p.inventoryClass || 'TICARI_MAL_153', categoryId: p.categoryId ?? null,
          category: cats.find((c) => c.id === p.categoryId)?.name ?? p.category ?? null, unitCode: p.unit || null, warehouseId: null, warehouseName: null, lotNumber: null, expiryDate: null,
          quantity: 0, unitCost: 0, costValue: 0, salesValue: 0, costMissing: false,
        });
      }
    }
    rows.sort((a, b) => a.inventoryClass.localeCompare(b.inventoryClass) || a.productName.localeCompare(b.productName, 'tr') || String(a.warehouseName).localeCompare(String(b.warehouseName), 'tr') || String(a.lotNumber).localeCompare(String(b.lotNumber)));
    return {
      asOf: asOfDay,
      source: 'SNAPSHOT',
      snapshotPeriodId: snap.period.id,
      asOfInstant: instant.toISOString(),
      method: (snap.rows[0]?.costingMethod as CostingMethod) || this.methodOn(company, asOfDay),
      currency: company.baseCurrency,
      breakdown,
      rows,
      totals: {
        quantity: roundQty(rows.reduce((s, r) => s + r.quantity, 0)),
        costValue: roundMoney(rows.reduce((s, r) => s + r.costValue, 0)),
        salesValue: roundMoney(rows.reduce((s, r) => s + (r.salesValue || 0), 0)),
      },
    };
  }


  /** Product quantity and value at `instant` (rolled back from the present). */
  async productLevel(m: EntityManager, company: CompanyEntity, instant: Date, productIds?: string[]): Promise<Map<string, { quantity: number; value: number; missing: boolean; unitCost?: number }>> {
    const c = company.id;
    const cur: { productId: string; q: string }[] = await m.query('SELECT `productId`, SUM(`quantity`) AS q FROM `product_warehouse_stocks` WHERE `companyId` = ? GROUP BY `productId`', [c]);
    const val: { productId: string; v: string }[] = await m.query('SELECT `productId`, SUM(`qtyRemaining` * `unitCost`) AS v FROM `stock_cost_layers` WHERE `companyId` = ? AND `qtyRemaining` > 0 GROUP BY `productId`', [c]);
    const later: { productId: string; q: string; v: string; missing: string }[] = await m.query(
      "SELECT `productId`, SUM(`quantity`) AS q, SUM(COALESCE(`totalCost`, 0)) AS v, SUM(CASE WHEN `costSource` = 'MISSING' THEN 1 ELSE 0 END) AS missing FROM `stock_movements` WHERE `companyId` = ? AND `transactionDate` >= ? GROUP BY `productId`",
      [c, instant],
    );
    const adj: { lines: unknown }[] = await m.query('SELECT `lines` FROM `landed_cost_allocations` WHERE `companyId` = ? AND `createdAt` >= ?', [c, instant]);
    const adjBy = new Map<string, number>();
    for (const a of adj) {
      const lines = (typeof a.lines === 'string' ? JSON.parse(a.lines) : a.lines) as { productId?: string; toInventory?: number }[];
      for (const l of lines || []) if (l.productId) adjBy.set(l.productId, (adjBy.get(l.productId) || 0) + (Number(l.toInventory) || 0));
    }
    const missingNow: { productId: string; n: string }[] = await m.query("SELECT `productId`, COUNT(*) AS n FROM `stock_cost_layers` WHERE `companyId` = ? AND `qtyRemaining` > 0 AND `unitCost` = 0 GROUP BY `productId`", [c]);
    const ids = new Set<string>([...cur.map((x) => x.productId), ...later.map((x) => x.productId)]);
    const out = new Map<string, { quantity: number; value: number; missing: boolean; unitCost?: number }>();
    for (const id of ids) {
      if (productIds && !productIds.includes(id)) continue;
      const q = Number(cur.find((x) => x.productId === id)?.q || 0) - Number(later.find((x) => x.productId === id)?.q || 0);
      const v = Number(val.find((x) => x.productId === id)?.v || 0) - Number(later.find((x) => x.productId === id)?.v || 0) - (adjBy.get(id) || 0);
      out.set(id, {
        quantity: roundQty(q),
        value: roundMoney(q > 0 ? v : 0),
        missing: Number(missingNow.find((x) => x.productId === id)?.n || 0) > 0,
      });
    }
    return out;
  }

  private async warehouseQty(m: EntityManager, productId: string, instant: Date): Promise<{ warehouseId: string | null; lotNumber: string | null; expiryDate: string | null; quantity: number }[]> {
    const cur: { warehouseId: string; q: string }[] = await m.query('SELECT `warehouseId`, `quantity` AS q FROM `product_warehouse_stocks` WHERE `companyId` = ? AND `productId` = ?', [this.companyId, productId]);
    const later: { warehouseId: string | null; q: string }[] = await m.query(
      'SELECT `warehouseId`, SUM(`quantity`) AS q FROM `stock_movements` WHERE `companyId` = ? AND `productId` = ? AND `transactionDate` >= ? GROUP BY `warehouseId`',
      [this.companyId, productId, instant],
    );
    const ids = new Set<string | null>([...cur.map((x) => x.warehouseId), ...later.map((x) => x.warehouseId)]);
    return [...ids].map((w) => ({
      warehouseId: w,
      lotNumber: null,
      expiryDate: null,
      quantity: roundQty(Number(cur.find((x) => x.warehouseId === w)?.q || 0) - Number(later.find((x) => x.warehouseId === w)?.q || 0)),
    }));
  }

  private async lotQty(m: EntityManager, p: ProductEntity, instant: Date) {
    if (p.trackingType !== 'lot') return this.warehouseQty(m, p.id, instant);
    const cur: { warehouseId: string; lotNumber: string; expiryDate: string | null; q: string }[] = await m.query(
      "SELECT `warehouseId`, `lotNumber`, DATE_FORMAT(`expiryDate`, '%Y-%m-%d') AS expiryDate, `quantity` AS q FROM `stock_lots` WHERE `companyId` = ? AND `productId` = ?",
      [this.companyId, p.id],
    );
    const later: { warehouseId: string | null; lotNumber: string | null; q: string }[] = await m.query(
      'SELECT `warehouseId`, `lotNumber`, SUM(`quantity`) AS q FROM `stock_movements` WHERE `companyId` = ? AND `productId` = ? AND `transactionDate` >= ? GROUP BY `warehouseId`, `lotNumber`',
      [this.companyId, p.id, instant],
    );
    const key = (w: string | null, l: string | null) => `${w}|${l}`;
    const keys = new Map<string, { warehouseId: string | null; lotNumber: string | null; expiryDate: string | null }>();
    for (const c of cur) keys.set(key(c.warehouseId, c.lotNumber), { warehouseId: c.warehouseId, lotNumber: c.lotNumber, expiryDate: c.expiryDate });
    for (const l of later) if (!keys.has(key(l.warehouseId, l.lotNumber))) keys.set(key(l.warehouseId, l.lotNumber), { warehouseId: l.warehouseId, lotNumber: l.lotNumber, expiryDate: null });
    return [...keys.entries()].map(([k, v]) => ({
      ...v,
      quantity: roundQty(Number(cur.find((c) => key(c.warehouseId, c.lotNumber) === k)?.q || 0) - Number(later.find((l) => key(l.warehouseId, l.lotNumber) === k)?.q || 0)),
    }));
  }

  /** SPECIFIC_LOT: average unit cost of each lot's open layers. */
  private async lotUnitCosts(m: EntityManager): Promise<Map<string, number>> {
    const rows: { productId: string; lotNumber: string; q: string; v: string }[] = await m.query(
      'SELECT `productId`, `lotNumber`, SUM(`qtyRemaining`) AS q, SUM(`qtyRemaining` * `unitCost`) AS v FROM `stock_cost_layers` WHERE `companyId` = ? AND `qtyRemaining` > 0 AND `lotNumber` IS NOT NULL GROUP BY `productId`, `lotNumber`',
      [this.companyId],
    );
    return new Map(rows.filter((r) => Number(r.q) > 0).map((r) => [`${r.productId}|${r.lotNumber}`, roundCost(Number(r.v) / Number(r.q))]));
  }

  /** Opening balances of a period: the closing snapshot of the period before it when closed, else computed. */
  async openingOf(period: FiscalPeriodEntity, manager?: EntityManager): Promise<{ source: 'SNAPSHOT' | 'COMPUTED'; quantity: number; costValue: number; byProduct: Map<string, { quantity: number; costValue: number }> }> {
    const m = manager || this.dataSource.manager;
    const prevEnd = addDays(String(period.startDate).slice(0, 10), -1);
    const prev = await m.findOne(FiscalPeriodEntity, { where: { companyId: this.companyId, periodType: period.periodType, endDate: prevEnd } });
    const byProduct = new Map<string, { quantity: number; costValue: number }>();
    if (prev && prev.status === 'CLOSED') {
      const rows = await m.find(InventoryPeriodBalanceEntity, { where: { companyId: this.companyId, periodId: prev.id, closingSeq: (prev.reopenCount || 0) + 1 } });
      for (const r of rows) {
        const cur = byProduct.get(r.productId) || { quantity: 0, costValue: 0 };
        cur.quantity = roundQty(cur.quantity + Number(r.quantity));
        cur.costValue = roundMoney(cur.costValue + Number(r.totalCost));
        byProduct.set(r.productId, cur);
      }
      return { source: 'SNAPSHOT', quantity: roundQty([...byProduct.values()].reduce((s, x) => s + x.quantity, 0)), costValue: roundMoney([...byProduct.values()].reduce((s, x) => s + x.costValue, 0)), byProduct };
    }
    const v = await this.valuate(prevEnd, 'product', { manager: m });
    for (const r of v.rows) byProduct.set(r.productId, { quantity: r.quantity, costValue: r.costValue });
    return { source: 'COMPUTED', quantity: v.totals.quantity, costValue: v.totals.costValue, byProduct };
  }

  /** Company-local day of an instant. */
  async localDay(d: Date): Promise<string> {
    const company = await this.finance.getCompany();
    return dateKeyInZone(d, company.timezone || DEFAULT_TIMEZONE);
  }
}
