import { Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager, In, MoreThan } from 'typeorm';
import { err } from '../i18n/app-error';
import { ProductEntity } from '../../entities/product.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { SerialNumberEntity, SerialStatus } from '../../entities/serial-number.entity';
import { TrackingEntry, TrackingType } from '../../entities/tracking';
import { StockHelperService } from './stock-helper.service';
import { allocateLots, todayKey } from '../inventory/lot-allocation';

export interface StockAllocation {
  warehouseId: string;
  /** Signed change applied to that warehouse (base units) */
  delta: number;
  /** Lot-tracked products: the lot this change applies to */
  lotId?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  /** Serial-tracked products: the serials moved */
  serials?: string[];
}

export interface MovementInfo {
  type: string;
  referenceId?: string;
  referenceType?: string;
  note?: string;
  performedBy?: string;
}

/** Lots captured when stock comes in (quantities in base units). */
export interface LotReceiptInput {
  lotNumber: string;
  expiryDate?: string | null;
  quantity: number;
}

export interface ReceiveDetails {
  lots?: LotReceiptInput[];
  serials?: string[];
}

/** Explicit picks when stock goes out; omitted => FEFO/FIFO auto allocation. */
export interface IssueDetails {
  lots?: { lotId: string; quantity: number }[];
  serials?: string[];
}

export function isTracked(p: Pick<ProductEntity, 'trackingType'>): boolean {
  return p.trackingType === TrackingType.LOT || p.trackingType === TrackingType.SERIAL;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normDate(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/**
 * Single source of truth for stock.
 *
 * `product_warehouse_stocks` holds the authoritative quantities.
 * `products.quantity` is a denormalized SUM that is recomputed and saved by
 * this service inside the caller's transaction every time a row changes, so
 * both are always consistent. No other code path may write `quantity`.
 *
 * Tracked products additionally keep `stock_lots` (lot) or `serial_numbers`
 * (serial) in step with the warehouse rows: per (product, warehouse)
 * SUM(lot.quantity) / COUNT(in_stock serials) = warehouse quantity.
 * Untracked helpers (add/deduct/setTotal) refuse tracked products.
 */
@Injectable()
export class WarehouseStockService {
  constructor(private readonly stockHelper: StockHelperService) {}

  /** Active warehouses of a company; the oldest is the default target. */
  activeWarehouses(manager: EntityManager, companyId: string): Promise<WarehouseEntity[]> {
    return manager.find(WarehouseEntity, { where: { companyId, isDeleted: false }, order: { createdAt: 'ASC', name: 'ASC' } });
  }

  async defaultWarehouse(manager: EntityManager, companyId: string): Promise<WarehouseEntity> {
    const [first] = await this.activeWarehouses(manager, companyId);
    if (!first) throw new BadRequestException(err('WAREHOUSE_NONE_ACTIVE'));
    return first;
  }

  async requireWarehouse(manager: EntityManager, companyId: string, warehouseId: string): Promise<WarehouseEntity> {
    const wh = await manager.findOne(WarehouseEntity, { where: { id: warehouseId, companyId, isDeleted: false } });
    if (!wh) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    return wh;
  }

  private async targetWarehouseId(manager: EntityManager, companyId: string, warehouseId?: string | null): Promise<string> {
    return warehouseId
      ? (await this.requireWarehouse(manager, companyId, warehouseId)).id
      : (await this.defaultWarehouse(manager, companyId)).id;
  }

  private async lockRows(manager: EntityManager, companyId: string, productId: string): Promise<ProductWarehouseStockEntity[]> {
    return manager.find(ProductWarehouseStockEntity, {
      where: { companyId, productId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private assertUntracked(product: ProductEntity): void {
    if (isTracked(product)) throw new BadRequestException(err('PRODUCT_TRACKED_QTY_LOCKED', { name: product.name }));
  }

  /** Apply signed per-warehouse deltas, then resync products.quantity/status. */
  async apply(manager: EntityManager, product: ProductEntity, allocations: StockAllocation[]): Promise<ProductEntity> {
    const rows = await this.lockRows(manager, product.companyId, product.id);
    for (const a of allocations) {
      if (!a.delta) continue;
      let row = rows.find((r) => r.warehouseId === a.warehouseId);
      if (!row) {
        row = manager.create(ProductWarehouseStockEntity, {
          companyId: product.companyId,
          productId: product.id,
          warehouseId: a.warehouseId,
          quantity: 0,
        });
        rows.push(row);
      }
      const next = row.quantity + a.delta;
      if (next < 0) {
        const wh = await manager.findOne(WarehouseEntity, { where: { id: a.warehouseId, companyId: product.companyId } });
        throw new BadRequestException(
          err('WAREHOUSE_INSUFFICIENT_STOCK', { warehouse: wh?.name || a.warehouseId, available: row.quantity, requested: -a.delta }),
        );
      }
      row.quantity = next;
      await manager.save(ProductWarehouseStockEntity, row);
    }
    product.quantity = rows.reduce((s, r) => s + r.quantity, 0);
    product.status = this.stockHelper.calculateStatus(product.quantity, product.minQuantity);
    return manager.save(ProductEntity, product);
  }

  /** Adds stock of an untracked product to a warehouse (default warehouse when omitted). */
  async add(manager: EntityManager, product: ProductEntity, qty: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    this.assertUntracked(product);
    if (qty <= 0) return [];
    const target = await this.targetWarehouseId(manager, product.companyId, warehouseId);
    const allocations = [{ warehouseId: target, delta: qty }];
    await this.apply(manager, product, allocations);
    return allocations;
  }

  /**
   * Removes stock of an untracked product from one warehouse, or (when
   * omitted) greedily from the active warehouses in default order.
   */
  async deduct(manager: EntityManager, product: ProductEntity, qty: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    this.assertUntracked(product);
    if (qty <= 0) return [];
    if (warehouseId) {
      await this.requireWarehouse(manager, product.companyId, warehouseId);
      const allocations = [{ warehouseId, delta: -qty }];
      await this.apply(manager, product, allocations);
      return allocations;
    }
    const warehouses = await this.activeWarehouses(manager, product.companyId);
    const rows = await this.lockRows(manager, product.companyId, product.id);
    let remaining = qty;
    const allocations: StockAllocation[] = [];
    for (const wh of warehouses) {
      if (remaining <= 0) break;
      const available = rows.find((r) => r.warehouseId === wh.id)?.quantity || 0;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      allocations.push({ warehouseId: wh.id, delta: -take });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new BadRequestException(err('STOCK_INSUFFICIENT_BY_WAREHOUSE', { missing: remaining }));
    }
    await this.apply(manager, product, allocations);
    return allocations;
  }

  /** Brings the total of an untracked product to `newTotal` (adds to default / deducts greedily). */
  async setTotal(manager: EntityManager, product: ProductEntity, newTotal: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    this.assertUntracked(product);
    const diff = newTotal - product.quantity;
    if (diff > 0) return this.add(manager, product, diff, warehouseId);
    if (diff < 0) return this.deduct(manager, product, -diff, warehouseId);
    return [];
  }

  // ─── Tracking-aware operations ───

  /**
   * Books incoming stock. Lot products need `lots` summing to `qty` (expiry
   * required when the product has expiry); serial products need exactly
   * `qty` distinct serials that are not already in stock.
   */
  async receive(
    manager: EntityManager,
    product: ProductEntity,
    qty: number,
    warehouseId: string | null | undefined,
    details: ReceiveDetails = {},
  ): Promise<StockAllocation[]> {
    if (qty <= 0) return [];
    if (!isTracked(product)) return this.add(manager, product, qty, warehouseId);
    const target = await this.targetWarehouseId(manager, product.companyId, warehouseId);
    const allocations =
      product.trackingType === TrackingType.LOT
        ? await this.receiveLots(manager, product, qty, target, details.lots || [])
        : await this.receiveSerials(manager, product, qty, target, details.serials || []);
    await this.apply(manager, product, allocations);
    return allocations;
  }

  private async receiveLots(
    manager: EntityManager,
    product: ProductEntity,
    qty: number,
    warehouseId: string,
    input: LotReceiptInput[],
  ): Promise<StockAllocation[]> {
    const merged = new Map<string, LotReceiptInput>();
    for (const l of input) {
      const lotNumber = String(l?.lotNumber || '').trim();
      const q = Number(l?.quantity);
      if (!lotNumber) throw new BadRequestException(err('LOT_NUMBER_REQUIRED', { name: product.name }));
      if (!Number.isInteger(q) || q <= 0) throw new BadRequestException(err('LOT_QUANTITY_INVALID', { lot: lotNumber }));
      const expiry = normDate(l.expiryDate);
      if (expiry && !DATE_RE.test(expiry)) throw new BadRequestException(err('LOT_EXPIRY_INVALID', { lot: lotNumber }));
      if (product.hasExpiry && !expiry) throw new BadRequestException(err('LOT_EXPIRY_REQUIRED', { lot: lotNumber, name: product.name }));
      const prev = merged.get(lotNumber);
      if (prev) {
        if ((prev.expiryDate || null) !== (expiry || null)) throw new BadRequestException(err('LOT_EXPIRY_CONFLICT', { lot: lotNumber }));
        prev.quantity += q;
      } else {
        merged.set(lotNumber, { lotNumber, expiryDate: expiry, quantity: q });
      }
    }
    const total = [...merged.values()].reduce((s, l) => s + l.quantity, 0);
    if (total !== qty) {
      throw new BadRequestException(err('LOT_QUANTITY_MISMATCH', { name: product.name, expected: qty, actual: total }));
    }
    const out: StockAllocation[] = [];
    for (const l of merged.values()) {
      const lot = await this.upsertLot(manager, product, warehouseId, l.lotNumber, l.expiryDate || null);
      lot.quantity += l.quantity;
      await manager.save(StockLotEntity, lot);
      out.push({ warehouseId, delta: l.quantity, lotId: lot.id, lotNumber: lot.lotNumber, expiryDate: normDate(lot.expiryDate) });
    }
    return out;
  }

  /** Finds (locked) or creates the lot row; an existing lot keeps its expiry (conflicts are rejected). */
  private async upsertLot(
    manager: EntityManager,
    product: ProductEntity,
    warehouseId: string,
    lotNumber: string,
    expiryDate: string | null,
  ): Promise<StockLotEntity> {
    const existing = await manager.findOne(StockLotEntity, {
      where: { companyId: product.companyId, productId: product.id, warehouseId, lotNumber },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      const cur = normDate(existing.expiryDate);
      if (expiryDate && cur && cur !== expiryDate) throw new BadRequestException(err('LOT_EXPIRY_CONFLICT', { lot: lotNumber }));
      if (expiryDate && !cur) existing.expiryDate = expiryDate;
      return existing;
    }
    return manager.save(
      StockLotEntity,
      manager.create(StockLotEntity, {
        companyId: product.companyId,
        productId: product.id,
        warehouseId,
        lotNumber,
        expiryDate,
        quantity: 0,
      }),
    );
  }

  private cleanSerials(product: ProductEntity, serials: string[] | undefined, qty: number): string[] {
    const list = (serials || []).map((s) => String(s || '').trim()).filter(Boolean);
    const seen = new Set<string>();
    for (const s of list) {
      if (seen.has(s)) throw new BadRequestException(err('SERIAL_DUPLICATE_INPUT', { serial: s }));
      seen.add(s);
    }
    if (list.length !== qty) {
      throw new BadRequestException(err('SERIAL_COUNT_MISMATCH', { name: product.name, expected: qty, actual: list.length }));
    }
    return list;
  }

  private async receiveSerials(
    manager: EntityManager,
    product: ProductEntity,
    qty: number,
    warehouseId: string,
    input: string[],
  ): Promise<StockAllocation[]> {
    const serials = this.cleanSerials(product, input, qty);
    const existing = await manager.find(SerialNumberEntity, {
      where: { companyId: product.companyId, productId: product.id, serial: In(serials) },
      lock: { mode: 'pessimistic_write' },
    });
    for (const s of serials) {
      const row = existing.find((e) => e.serial === s);
      if (row && row.status === SerialStatus.IN_STOCK) {
        throw new BadRequestException(err('SERIAL_ALREADY_IN_STOCK', { serial: s }));
      }
      if (row) {
        row.status = SerialStatus.IN_STOCK;
        row.warehouseId = warehouseId;
        await manager.save(SerialNumberEntity, row);
      } else {
        await manager.save(
          SerialNumberEntity,
          manager.create(SerialNumberEntity, {
            companyId: product.companyId,
            productId: product.id,
            warehouseId,
            serial: s,
            status: SerialStatus.IN_STOCK,
          }),
        );
      }
    }
    return [{ warehouseId, delta: qty, serials }];
  }

  /**
   * Books outgoing stock. Lot products: explicit `lots` picks, else FEFO
   * (expiry products, expired lots skipped) / FIFO. Serial products: explicit
   * `serials`, else the oldest in-stock serials; they get `serialStatus`.
   */
  async issue(
    manager: EntityManager,
    product: ProductEntity,
    qty: number,
    warehouseId: string | null | undefined,
    details: IssueDetails = {},
    opts: { serialStatus?: SerialStatus; allowExpired?: boolean } = {},
  ): Promise<StockAllocation[]> {
    if (qty <= 0) return [];
    if (!isTracked(product)) return this.deduct(manager, product, qty, warehouseId);
    if (warehouseId) await this.requireWarehouse(manager, product.companyId, warehouseId);
    const allocations =
      product.trackingType === TrackingType.LOT
        ? await this.pickLots(manager, product, qty, warehouseId || null, details.lots, !!opts.allowExpired)
        : await this.pickSerials(manager, product, qty, warehouseId || null, details.serials, opts.serialStatus || SerialStatus.SOLD);
    await this.apply(manager, product, allocations);
    return allocations;
  }

  private async pickLots(
    manager: EntityManager,
    product: ProductEntity,
    qty: number,
    warehouseId: string | null,
    explicit: { lotId: string; quantity: number }[] | undefined,
    allowExpired: boolean,
  ): Promise<StockAllocation[]> {
    const picks: { lot: StockLotEntity; quantity: number }[] = [];
    if (explicit && explicit.length) {
      const lots = await manager.find(StockLotEntity, {
        where: { companyId: product.companyId, productId: product.id, id: In(explicit.map((e) => e.lotId)) },
        lock: { mode: 'pessimistic_write' },
      });
      const used = new Map<string, number>();
      for (const e of explicit) {
        const lot = lots.find((l) => l.id === e.lotId);
        const q = Number(e.quantity);
        if (!lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: e.lotId }));
        if (!Number.isInteger(q) || q <= 0) throw new BadRequestException(err('LOT_QUANTITY_INVALID', { lot: lot.lotNumber }));
        if (warehouseId && lot.warehouseId !== warehouseId) throw new BadRequestException(err('LOT_WRONG_WAREHOUSE', { lot: lot.lotNumber }));
        const total = (used.get(lot.id) || 0) + q;
        if (total > lot.quantity) {
          throw new BadRequestException(err('LOT_INSUFFICIENT', { lot: lot.lotNumber, available: lot.quantity, requested: total }));
        }
        used.set(lot.id, total);
        picks.push({ lot, quantity: q });
      }
      const sum = picks.reduce((s, p) => s + p.quantity, 0);
      if (sum !== qty) throw new BadRequestException(err('LOT_QUANTITY_MISMATCH', { name: product.name, expected: qty, actual: sum }));
    } else {
      const activeIds = warehouseId ? [warehouseId] : (await this.activeWarehouses(manager, product.companyId)).map((w) => w.id);
      const lots = await manager.find(StockLotEntity, {
        where: { companyId: product.companyId, productId: product.id, warehouseId: In(activeIds), quantity: MoreThan(0) },
        lock: { mode: 'pessimistic_write' },
      });
      const result = allocateLots(lots, qty, {
        fefo: !!product.hasExpiry,
        skipExpiredBefore: product.hasExpiry && !allowExpired ? todayKey() : null,
      });
      if (!result) {
        const usable = lots
          .filter((l) => allowExpired || !product.hasExpiry || !l.expiryDate || normDate(l.expiryDate)! >= todayKey())
          .reduce((s, l) => s + l.quantity, 0);
        throw new BadRequestException(err('LOT_INSUFFICIENT_AUTO', { name: product.name, available: usable, requested: qty }));
      }
      for (const p of result.picks) picks.push({ lot: p.lot as StockLotEntity, quantity: p.quantity });
    }
    const out: StockAllocation[] = [];
    for (const p of picks) {
      p.lot.quantity -= p.quantity;
      await manager.save(StockLotEntity, p.lot);
      out.push({
        warehouseId: p.lot.warehouseId,
        delta: -p.quantity,
        lotId: p.lot.id,
        lotNumber: p.lot.lotNumber,
        expiryDate: normDate(p.lot.expiryDate),
      });
    }
    return out;
  }

  private async pickSerials(
    manager: EntityManager,
    product: ProductEntity,
    qty: number,
    warehouseId: string | null,
    explicit: string[] | undefined,
    newStatus: SerialStatus,
  ): Promise<StockAllocation[]> {
    let rows: SerialNumberEntity[];
    if (explicit && explicit.length) {
      const serials = this.cleanSerials(product, explicit, qty);
      rows = await manager.find(SerialNumberEntity, {
        where: { companyId: product.companyId, productId: product.id, serial: In(serials) },
        lock: { mode: 'pessimistic_write' },
      });
      for (const s of serials) {
        const row = rows.find((r) => r.serial === s);
        if (!row || row.status !== SerialStatus.IN_STOCK) throw new BadRequestException(err('SERIAL_NOT_IN_STOCK', { serial: s }));
        if (warehouseId && row.warehouseId !== warehouseId) throw new BadRequestException(err('SERIAL_WRONG_WAREHOUSE', { serial: s }));
      }
    } else {
      const activeIds = warehouseId ? [warehouseId] : (await this.activeWarehouses(manager, product.companyId)).map((w) => w.id);
      const available = await manager.find(SerialNumberEntity, {
        where: { companyId: product.companyId, productId: product.id, status: SerialStatus.IN_STOCK, warehouseId: In(activeIds) },
        order: { createdAt: 'ASC', serial: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (available.length < qty) {
        throw new BadRequestException(err('SERIAL_INSUFFICIENT', { name: product.name, available: available.length, requested: qty }));
      }
      rows = available.slice(0, qty);
    }
    const byWh = new Map<string, string[]>();
    for (const r of rows) {
      const wh = r.warehouseId as string;
      byWh.set(wh, [...(byWh.get(wh) || []), r.serial]);
      r.status = newStatus;
      await manager.save(SerialNumberEntity, r);
    }
    return [...byWh.entries()].map(([wh, serials]) => ({ warehouseId: wh, delta: -serials.length, serials }));
  }

  /**
   * Reverses an earlier issue (e.g. order cancellation) from its tracking
   * entries: lot quantities go back to the same lots, serials back in stock.
   */
  async restore(manager: EntityManager, product: ProductEntity, entries: TrackingEntry[]): Promise<StockAllocation[]> {
    const out: StockAllocation[] = [];
    for (const e of entries) {
      if (!e.quantity) continue;
      if (product.trackingType === TrackingType.LOT && e.lotNumber) {
        let lot = e.lotId
          ? await manager.findOne(StockLotEntity, { where: { id: e.lotId, companyId: product.companyId, productId: product.id }, lock: { mode: 'pessimistic_write' } })
          : null;
        if (!lot) lot = await this.upsertLot(manager, product, e.warehouseId, e.lotNumber, e.expiryDate || null);
        lot.quantity += e.quantity;
        await manager.save(StockLotEntity, lot);
        out.push({ warehouseId: lot.warehouseId, delta: e.quantity, lotId: lot.id, lotNumber: lot.lotNumber, expiryDate: normDate(lot.expiryDate) });
      } else if (product.trackingType === TrackingType.SERIAL && e.serials?.length) {
        const rows = await manager.find(SerialNumberEntity, {
          where: { companyId: product.companyId, productId: product.id, serial: In(e.serials) },
          lock: { mode: 'pessimistic_write' },
        });
        for (const r of rows) {
          if (r.status === SerialStatus.IN_STOCK) throw new BadRequestException(err('SERIAL_ALREADY_IN_STOCK', { serial: r.serial }));
          r.status = SerialStatus.IN_STOCK;
          r.warehouseId = e.warehouseId;
          await manager.save(SerialNumberEntity, r);
        }
        out.push({ warehouseId: e.warehouseId, delta: rows.length, serials: rows.map((r) => r.serial) });
      } else if (!isTracked(product)) {
        out.push({ warehouseId: e.warehouseId, delta: e.quantity });
      } else {
        throw new BadRequestException(err('TRACKING_RESTORE_UNAVAILABLE', { name: product.name }));
      }
    }
    await this.apply(manager, product, out);
    return out;
  }

  /**
   * Moves stock between warehouses keeping lots/serials: a lot keeps its
   * number and expiry in the target warehouse, serials just change location.
   * Returns the outgoing (negative) and incoming (positive) allocations.
   */
  async transfer(
    manager: EntityManager,
    product: ProductEntity,
    fromId: string,
    toId: string,
    qty: number,
    details: { lotId?: string | null; serials?: string[] } = {},
  ): Promise<{ out: StockAllocation[]; in: StockAllocation[] }> {
    let out: StockAllocation[];
    let inn: StockAllocation[];
    if (product.trackingType === TrackingType.LOT) {
      out = await this.pickLots(manager, product, qty, fromId, details.lotId ? [{ lotId: details.lotId, quantity: qty }] : undefined, true);
      inn = [];
      for (const o of out) {
        const lot = await this.upsertLot(manager, product, toId, o.lotNumber as string, o.expiryDate || null);
        lot.quantity += -o.delta;
        await manager.save(StockLotEntity, lot);
        inn.push({ warehouseId: toId, delta: -o.delta, lotId: lot.id, lotNumber: lot.lotNumber, expiryDate: normDate(lot.expiryDate) });
      }
    } else if (product.trackingType === TrackingType.SERIAL) {
      out = await this.pickSerials(manager, product, qty, fromId, details.serials, SerialStatus.IN_STOCK);
      const serials = out.flatMap((o) => o.serials || []);
      await manager.update(
        SerialNumberEntity,
        { companyId: product.companyId, productId: product.id, serial: In(serials) },
        { warehouseId: toId },
      );
      inn = [{ warehouseId: toId, delta: qty, serials }];
    } else {
      out = [{ warehouseId: fromId, delta: -qty }];
      inn = [{ warehouseId: toId, delta: qty }];
    }
    await this.apply(manager, product, [...out, ...inn]);
    return { out, in: inn };
  }

  /** Sets one lot to `counted` (stock count); returns the signed allocation (or none). */
  async setLotQuantity(manager: EntityManager, product: ProductEntity, lotId: string, counted: number): Promise<StockAllocation[]> {
    const lot = await manager.findOne(StockLotEntity, {
      where: { id: lotId, companyId: product.companyId, productId: product.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: lotId }));
    const target = Math.max(0, Math.floor(Number(counted) || 0));
    const delta = target - lot.quantity;
    if (!delta) return [];
    lot.quantity = target;
    await manager.save(StockLotEntity, lot);
    const allocations = [{ warehouseId: lot.warehouseId, delta, lotId: lot.id, lotNumber: lot.lotNumber, expiryDate: normDate(lot.expiryDate) }];
    await this.apply(manager, product, allocations);
    return allocations;
  }

  /** Tracking entries (absolute quantities) for document lines. */
  toTracking(allocations: StockAllocation[]): TrackingEntry[] {
    return allocations
      .filter((a) => a.delta)
      .map((a) => ({
        warehouseId: a.warehouseId,
        quantity: Math.abs(a.delta),
        ...(a.lotId ? { lotId: a.lotId, lotNumber: a.lotNumber ?? null, expiryDate: a.expiryDate ?? null } : {}),
        ...(a.serials?.length ? { serials: a.serials } : {}),
      }));
  }

  /**
   * Writes one stock movement per allocation (per lot / serial group).
   * previous/new quantities are company-wide product totals, chained across rows.
   */
  async recordMovements(
    manager: EntityManager,
    product: ProductEntity,
    previousTotal: number,
    allocations: StockAllocation[],
    info: MovementInfo,
  ): Promise<StockMovementEntity[]> {
    const saved: StockMovementEntity[] = [];
    let running = previousTotal;
    for (const a of allocations) {
      if (!a.delta) continue;
      const next = running + a.delta;
      saved.push(
        await manager.save(
          StockMovementEntity,
          manager.create(StockMovementEntity, {
            companyId: product.companyId,
            productId: product.id,
            productName: product.name,
            warehouseId: a.warehouseId,
            type: info.type,
            quantity: a.delta,
            previousQuantity: running,
            newQuantity: next,
            lotId: a.lotId ?? null,
            lotNumber: a.lotNumber ?? null,
            serials: a.serials?.length ? a.serials : null,
            referenceId: info.referenceId,
            referenceType: info.referenceType,
            note: info.note,
            performedBy: info.performedBy || 'System',
          }),
        ),
      );
      running = next;
    }
    return saved;
  }

  /** Fills the read-only `warehouses` (name -> qty) map for API responses. */
  async attachWarehouseMap<T extends ProductEntity>(manager: EntityManager, companyId: string, products: T[]): Promise<T[]> {
    if (products.length === 0) return products;
    const rows = await manager.find(ProductWarehouseStockEntity, {
      where: { companyId, productId: In(products.map((p) => p.id)) },
      relations: { warehouse: true },
    });
    for (const p of products) {
      const map: Record<string, number> = {};
      for (const r of rows) {
        if (r.productId === p.id && r.warehouse && !r.warehouse.isDeleted) map[r.warehouse.name] = r.quantity;
      }
      p.warehouses = map;
    }
    return products;
  }
}
