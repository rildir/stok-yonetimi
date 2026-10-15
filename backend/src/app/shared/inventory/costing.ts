/**
 * Inventory costing (VUK 274 "maliyet bedeli", VUK 262 cost elements; TTK 66/4; TMS 2 / BOBİ).
 * Pure functions: no database access. WarehouseStockService keeps the `stock_cost_layers`
 * table with them and stamps every movement with its unit / total cost.
 *
 * Methods:
 *  - WAVG_MOVING: every issue is valued at the average of the layers on hand; the remaining
 *    layers are re-priced to that average (pooled), keeping their receipt dates.
 *  - WAVG_PERIODIC_QUARTERLY / _YEARLY: issues are booked provisionally at the moving average;
 *    the final unit cost of the period is (opening value + receipts) / (opening qty + receipts)
 *    and is applied by the period reports / closing (periodicAverage()).
 *  - FIFO: oldest layers first.
 *  - SPECIFIC_LOT: the layers of the issued lot first (FIFO among them), then FIFO.
 * LIFO is not offered.
 */
export type CostingMethod = 'WAVG_MOVING' | 'WAVG_PERIODIC_QUARTERLY' | 'WAVG_PERIODIC_YEARLY' | 'FIFO' | 'SPECIFIC_LOT';

export const COST_SCALE = 6;

/** Rounds a unit cost to 6 decimals. */
export function roundCost(n: number): number {
  const f = 10 ** COST_SCALE;
  const r = Math.round((Number(n) || 0) * f + (n >= 0 ? 1e-9 : -1e-9)) / f;
  return r === 0 ? 0 : r;
}

/** Rounds an amount to cents (half away from zero). */
export function roundMoney(n: number): number {
  const v = Number(n) || 0;
  const r = (Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-7)) / 100;
  return r === 0 ? 0 : r;
}

const q4 = (n: number) => {
  const r = Math.round((Number(n) || 0) * 10000) / 10000;
  return r === 0 ? 0 : r;
};

export interface CostLayer {
  id?: string;
  movementId?: string | null;
  lotNumber?: string | null;
  warehouseId?: string | null;
  receivedAt: Date | string;
  qtyIn: number;
  qtyRemaining: number;
  /** Unit cost in the company base currency */
  unitCost: number;
}

export interface LayerPick {
  /** Index into the layer array that was passed in */
  index: number;
  quantity: number;
  unitCost: number;
}

export interface ConsumeOptions {
  /** SPECIFIC_LOT: the lot leaving */
  lotNumber?: string | null;
  /** Consume this movement's layer first (purchase return / reversal of a receipt) */
  preferMovementId?: string | null;
  /** Unit cost for the quantity no layer covers (legacy stock, negative balance) */
  fallbackUnitCost?: number | null;
}

export interface ConsumeResult {
  picks: LayerPick[];
  /** Layers after the issue (same order; quantities / pooled costs updated) */
  layers: CostLayer[];
  quantity: number;
  totalCost: number;
  unitCost: number;
  /** Quantity not covered by any layer (valued at fallbackUnitCost) */
  shortfall: number;
}

const time = (d: Date | string) => new Date(d).getTime();

/** Value and quantity on hand of a set of layers. */
export function layerTotals(layers: CostLayer[]): { quantity: number; value: number } {
  let quantity = 0;
  let value = 0;
  for (const l of layers) {
    if (!(l.qtyRemaining > 0)) continue;
    quantity += l.qtyRemaining;
    value += l.qtyRemaining * l.unitCost;
  }
  return { quantity: q4(quantity), value: roundMoney(value) };
}

/** Average unit cost of the layers on hand, null when there is no stock. */
export function averageCost(layers: CostLayer[]): number | null {
  let quantity = 0;
  let value = 0;
  for (const l of layers) {
    if (!(l.qtyRemaining > 0)) continue;
    quantity += l.qtyRemaining;
    value += l.qtyRemaining * l.unitCost;
  }
  return quantity > 0 ? roundCost(value / quantity) : null;
}

function isPooled(method: CostingMethod): boolean {
  return method === 'WAVG_MOVING' || method === 'WAVG_PERIODIC_QUARTERLY' || method === 'WAVG_PERIODIC_YEARLY';
}

/** Order in which layers are consumed for `method`. */
export function consumptionOrder(method: CostingMethod, layers: CostLayer[], opts: ConsumeOptions = {}): number[] {
  const idx = layers.map((_, i) => i).filter((i) => layers[i].qtyRemaining > 0);
  const fifo = (a: number, b: number) => time(layers[a].receivedAt) - time(layers[b].receivedAt) || a - b;
  idx.sort(fifo);
  const rank = (i: number) => {
    if (opts.preferMovementId && layers[i].movementId === opts.preferMovementId) return 0;
    if (method === 'SPECIFIC_LOT' && opts.lotNumber && layers[i].lotNumber === opts.lotNumber) return 1;
    return 2;
  };
  return idx.sort((a, b) => rank(a) - rank(b) || fifo(a, b));
}

/**
 * Issues `quantity` from the layers. Pooled (average) methods value the whole quantity at the
 * average on hand and re-price the remaining layers so that their value stays exact; FIFO and
 * SPECIFIC_LOT value each pick at its layer's cost. A preferred layer (purchase return) is
 * always valued at its own cost.
 */
export function consumeLayers(method: CostingMethod, layers: CostLayer[], quantity: number, opts: ConsumeOptions = {}): ConsumeResult {
  const next = layers.map((l) => ({ ...l }));
  const want = q4(Math.abs(quantity));
  const before = layerTotals(next);
  const avg = averageCost(next);
  const picks: LayerPick[] = [];
  let left = want;
  for (const i of consumptionOrder(method, next, opts)) {
    if (left <= 0) break;
    const take = q4(Math.min(left, next[i].qtyRemaining));
    if (take <= 0) continue;
    picks.push({ index: i, quantity: take, unitCost: next[i].unitCost });
    next[i].qtyRemaining = q4(next[i].qtyRemaining - take);
    left = q4(left - take);
  }
  const covered = q4(want - left);
  const fallback = opts.fallbackUnitCost ?? avg ?? 0;
  let coveredCost: number;
  const preferred = opts.preferMovementId ? picks.filter((p) => next[p.index].movementId === opts.preferMovementId) : [];
  if (isPooled(method) && avg !== null) {
    // Preferred layer (purchase return) at its own cost, the rest at the pool average.
    const prefQty = q4(preferred.reduce((s, p) => s + p.quantity, 0));
    const prefCost = preferred.reduce((s, p) => s + p.quantity * p.unitCost, 0);
    coveredCost = roundMoney(prefCost + (covered - prefQty) * avg);
    for (const p of picks) if (!preferred.includes(p)) p.unitCost = avg;
    // Re-price what is left so that remaining value = value before - cost issued.
    const after = layerTotals(next);
    if (after.quantity > 0) {
      const remainingValue = before.value - coveredCost;
      const unit = roundCost(remainingValue / after.quantity);
      for (const l of next) if (l.qtyRemaining > 0) l.unitCost = unit;
    }
  } else {
    coveredCost = roundMoney(picks.reduce((s, p) => s + p.quantity * p.unitCost, 0));
  }
  const totalCost = roundMoney(coveredCost + left * fallback);
  return {
    picks,
    layers: next,
    quantity: want,
    totalCost,
    unitCost: want > 0 ? roundCost(totalCost / want) : 0,
    shortfall: left,
  };
}

/**
 * Unit cost of an issue without consuming anything (transfers between warehouses keep the
 * goods' cost; the value moves with them).
 */
export function peekIssueCost(method: CostingMethod, layers: CostLayer[], quantity: number, opts: ConsumeOptions = {}): number {
  return consumeLayers(method, layers, quantity, opts).unitCost;
}

/**
 * Periodic weighted average (VUK 274 / TMS 2.27): (opening value + receipts value) /
 * (opening qty + receipts qty). Null when nothing was on hand or received.
 */
export function periodicAverage(opening: { quantity: number; value: number }, receipts: { quantity: number; value: number }[]): number | null {
  let qty = Number(opening.quantity) || 0;
  let value = Number(opening.value) || 0;
  for (const r of receipts) {
    if (!(r.quantity > 0)) continue;
    qty += r.quantity;
    value += r.value;
  }
  return qty > 0 ? roundCost(value / qty) : null;
}

/**
 * Splits `total` over lines by amount or quantity (VUK 262 landed costs: nakliye, gümrük,
 * sigorta...). Shares are rounded to cents with the largest-remainder method so they add up
 * to `total` exactly.
 */
export function allocateLandedCost<T extends { key: string; quantity: number; amount: number }>(
  lines: T[],
  total: number,
  basis: 'AMOUNT' | 'QUANTITY',
): { key: string; share: number }[] {
  const weights = lines.map((l) => Math.max(0, basis === 'QUANTITY' ? Number(l.quantity) || 0 : Number(l.amount) || 0));
  const sum = weights.reduce((s, w) => s + w, 0);
  const cents = Math.round(roundMoney(total) * 100);
  if (!lines.length) return [];
  if (sum <= 0) {
    // No weights: equal split.
    const each = Math.floor(cents / lines.length);
    return lines.map((l, i) => ({ key: l.key, share: (each + (i < cents - each * lines.length ? 1 : 0)) / 100 }));
  }
  const raw = weights.map((w) => (cents * w) / sum);
  const floor = raw.map((r) => Math.floor(r));
  let rest = cents - floor.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floor[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (rest <= 0) break;
    floor[o.i] += 1;
    rest -= 1;
  }
  return lines.map((l, i) => ({ key: l.key, share: floor[i] / 100 }));
}

/**
 * Part of a landed-cost share that stays in inventory (goods still on hand) and the part
 * that goes to cost of sales (already issued).
 */
export function splitLandedShare(share: number, qtyIn: number, qtyRemaining: number): { toInventory: number; toCogs: number } {
  if (!(qtyIn > 0)) return { toInventory: 0, toCogs: roundMoney(share) };
  const ratio = Math.min(1, Math.max(0, qtyRemaining / qtyIn));
  const toInventory = roundMoney(share * ratio);
  return { toInventory, toCogs: roundMoney(share - toInventory) };
}

/** Ledger event used by replay(). quantity is signed (in > 0, out < 0). */
export interface CostEvent {
  id: string;
  quantity: number;
  at: Date | string;
  lotNumber?: string | null;
  /** Incoming: unit cost given by the document (purchase price, return of a known cost) */
  unitCost?: number | null;
  /** Outgoing: consume this receipt's layer first */
  preferMovementId?: string | null;
  /** Transfers between warehouses: no cost effect */
  transfer?: boolean;
  /** Incoming return / reversal: enters at the unit cost of this earlier event */
  costFromId?: string | null;
}

export interface ReplayResult {
  /** Cost of each event (id -> unit / total, signed total) */
  costs: Map<string, { unitCost: number; totalCost: number; source: string }>;
  layers: CostLayer[];
}

/**
 * Values a product's ledger from scratch (migration backfill, tests). Incoming events without
 * a unit cost enter at the running average (or `fallbackUnitCost`).
 */
export function replay(method: CostingMethod, events: CostEvent[], fallbackUnitCost = 0): ReplayResult {
  let layers: CostLayer[] = [];
  const costs = new Map<string, { unitCost: number; totalCost: number; source: string }>();
  for (const e of events) {
    const qty = q4(e.quantity);
    if (!qty) continue;
    if (e.transfer) {
      const unit = averageCost(layers) ?? fallbackUnitCost;
      costs.set(e.id, { unitCost: unit, totalCost: roundMoney(qty * unit), source: 'TRANSFER' });
      continue;
    }
    if (qty > 0) {
      const from = e.costFromId ? costs.get(e.costFromId) : undefined;
      const known = e.unitCost !== null && e.unitCost !== undefined && Number.isFinite(Number(e.unitCost));
      const unit = from ? Math.abs(from.unitCost) : known ? roundCost(Number(e.unitCost)) : averageCost(layers) ?? fallbackUnitCost;
      layers.push({ movementId: e.id, lotNumber: e.lotNumber ?? null, receivedAt: e.at, qtyIn: qty, qtyRemaining: qty, unitCost: unit });
      costs.set(e.id, { unitCost: unit, totalCost: roundMoney(qty * unit), source: from ? 'RETURN' : known ? 'DOCUMENT' : 'AVERAGE' });
    } else {
      const r = consumeLayers(method, layers, -qty, { lotNumber: e.lotNumber, preferMovementId: e.preferMovementId, fallbackUnitCost });
      layers = r.layers;
      costs.set(e.id, { unitCost: r.unitCost, totalCost: -r.totalCost, source: r.shortfall > 0 ? 'FALLBACK' : 'LAYER' });
    }
  }
  return { costs, layers: layers.filter((l) => l.qtyRemaining > 0) };
}
