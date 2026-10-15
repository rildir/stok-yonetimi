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
import { CompanyEntity } from '../../entities/company.entity';
import { randomUUID } from 'crypto';
import { StockMovementChainEntity } from '../../entities/stock-movement-chain.entity';
import { CURRENT_HASH_VERSION, GENESIS_HASH, movementHash, toSecond } from '../inventory/movement-hash';
import { addQty, isDateKey, isReasonCode, reasonAllowsDirection, roundQty, sumQty, warehouseTypeAllowsSale, daysBetween, dateKeyInZone, DEFAULT_TIMEZONE } from '../tr';
import { UnitEntity } from '../../entities/unit.entity';
import { TenantContext } from '../tenant/tenant-context.service';

export interface StockAllocation {
  warehouseId: string;
  /** Movement type override for this allocation (e.g. TRANSFER_OUT / QUARANTINE_IN legs) */
  type?: string;
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
  /** Mandatory reason (MOVEMENT_REASONS); a function picks it per allocation sign (e.g. count surplus / shortage). */
  reasonCode: string | ((delta: number) => string);
  /** When the goods moved; default now. Not in the future. */
  transactionDate?: Date | string | null;
  documentType?: string | null;
  documentNo?: string | null;
  /** YYYY-MM-DD */
  documentDate?: string | null;
  counterpartyTaxId?: string | null;
  reversesMovementId?: string | null;
  referenceId?: string;
  referenceType?: string;
  note?: string;
  performedBy?: string;
  /** Actor user id when it is not the current request's user (approved maker-checker request: the requester) */
  performedByUserId?: string | null;
  /** Maker-checker: the second administrator who approved the movement */
  approvedBy?: string | null;
  approvedByUserId?: string | null;
  /** Digest of the evidence files attached when the movement is booked (attachmentsDigest) */
  attachmentsSha256?: string | null;
  /** Transfers: every row keeps the (unchanged) product total as previous/new quantity */
  totalsUnchanged?: boolean;
}

/** Movement types that only move stock between warehouses (product total unchanged). */
const TRANSFER_TYPES = ['TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT'];

/** Allowed clock skew for "future" transaction dates. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const CHAIN_LOCK_KEY = '__stockChainLocked';
/** Movements dated more than this before now are checked against the balance on their date. */
const BACKDATE_CHECK_MS = 60 * 1000;

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

/** Positive quantity with at most 4 decimals. */
const validQty = (q: number) => Number.isFinite(q) && q > 0 && Math.abs(roundQty(q) - q) < 1e-9;

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
  constructor(
    private readonly stockHelper: StockHelperService,
    private readonly tenant: TenantContext,
  ) {}

  /** Active warehouses of a company; the oldest is the default target. */
  activeWarehouses(manager: EntityManager, companyId: string): Promise<WarehouseEntity[]> {
    return manager.find(WarehouseEntity, { where: { companyId, isDeleted: false }, order: { createdAt: 'ASC', name: 'ASC' } });
  }

  /** Active warehouses stock may be sold from (not QUARANTINE / IN_TRANSIT, isSellable). */
  async sellableWarehouses(manager: EntityManager, companyId: string): Promise<WarehouseEntity[]> {
    return (await this.activeWarehouses(manager, companyId)).filter((w) => this.isSellable(w));
  }

  isSellable(w: Pick<WarehouseEntity, 'type' | 'isSellable'>): boolean {
    return w.isSellable !== false && warehouseTypeAllowsSale(w.type);
  }

  /** Default receiving warehouse: the oldest active sellable one (else the oldest active one). */
  async defaultWarehouse(manager: EntityManager, companyId: string): Promise<WarehouseEntity> {
    const all = await this.activeWarehouses(manager, companyId);
    const first = all.find((w) => this.isSellable(w)) || all[0];
    if (!first) throw new BadRequestException(err('WAREHOUSE_NONE_ACTIVE'));
    return first;
  }

  /**
   * Locks the company's movement chain head (SELECT ... FOR UPDATE), creating it when
   * missing. Every stock-changing transaction calls this FIRST (before locking product
   * rows), so all stock transactions of a company take their locks in the same order
   * and movement numbers are assigned without gaps. Idempotent within a transaction.
   */
  async begin(manager: EntityManager, companyId: string): Promise<StockMovementChainEntity> {
    const qr = manager.queryRunner;
    const data = (qr?.data || {}) as Record<string, unknown>;
    const locked = data[CHAIN_LOCK_KEY] as Record<string, StockMovementChainEntity> | undefined;
    if (locked?.[companyId]) return locked[companyId];
    // A missing head is created outside this transaction (separate autocommit connection): an INSERT
    // inside it would take shared / gap locks that deadlock concurrent transactions of the company,
    // and a plain read here would fix this transaction's snapshot before the locks are taken.
    const outside = manager.connection ?? manager;
    const exists = await outside.query('SELECT 1 AS x FROM `stock_movement_chains` WHERE `companyId` = ?', [companyId]);
    if (!exists?.length) {
      await outside.query('INSERT IGNORE INTO `stock_movement_chains` (`companyId`, `lastSequenceNo`, `lastHash`) VALUES (?, 0, ?)', [companyId, GENESIS_HASH]);
    }
    const chain = await manager.findOneOrFail(StockMovementChainEntity, { where: { companyId }, lock: { mode: 'pessimistic_write' } });
    if (qr && qr.isTransactionActive) {
      qr.data = { ...(qr.data || {}), [CHAIN_LOCK_KEY]: { ...(locked || {}), [companyId]: chain } };
    }
    return chain;
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

  /**
   * Recomputes products.quantity, availableQuantity (stock in sellable warehouses) and
   * status from the product's (locked) warehouse rows.
   */
  private async syncTotals(manager: EntityManager, product: ProductEntity, rows: ProductWarehouseStockEntity[]): Promise<void> {
    const whs = await manager.find(WarehouseEntity, { where: { companyId: product.companyId }, select: ['id', 'type', 'isSellable', 'isDeleted'] });
    const sellable = new Set(whs.filter((w) => !w.isDeleted && this.isSellable(w)).map((w) => w.id));
    product.quantity = sumQty(rows.map((r) => r.quantity));
    product.availableQuantity = sumQty(rows.filter((r) => sellable.has(r.warehouseId)).map((r) => r.quantity));
    // Low / out of stock follows what can be sold (quarantine / in-transit stock does not count).
    product.status = this.stockHelper.calculateStatus(product.availableQuantity, product.minQuantity);
  }

  /**
   * Re-derives availableQuantity / status of the products stocked in `warehouseId`
   * (after the warehouse's type or sellability changed). Does not change stock.
   */
  async recomputeAvailability(manager: EntityManager, companyId: string, warehouseId: string): Promise<ProductEntity[]> {
    const ids = (await manager.find(ProductWarehouseStockEntity, { where: { companyId, warehouseId }, select: ['id', 'productId'] })).map((r) => r.productId);
    const out: ProductEntity[] = [];
    for (const id of [...new Set(ids)]) {
      const product = await manager.findOne(ProductEntity, { where: { companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!product) continue;
      await this.syncTotals(manager, product, await this.lockRows(manager, companyId, id));
      out.push(await manager.save(ProductEntity, product));
    }
    return out;
  }

  /** Apply signed per-warehouse deltas, then resync products.quantity/availableQuantity/status. */
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
      const next = addQty(row.quantity, a.delta);
      if (next < 0) {
        const wh = await manager.findOne(WarehouseEntity, { where: { id: a.warehouseId, companyId: product.companyId } });
        throw new BadRequestException(
          err('WAREHOUSE_INSUFFICIENT_STOCK', { warehouse: wh?.name || a.warehouseId, available: row.quantity, requested: -a.delta }),
        );
      }
      row.quantity = next;
      await manager.save(ProductWarehouseStockEntity, row);
    }
    await this.syncTotals(manager, product, rows);
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
  async deduct(manager: EntityManager, product: ProductEntity, qty: number, warehouseId?: string | null, opts: { sale?: boolean } = {}): Promise<StockAllocation[]> {
    this.assertUntracked(product);
    if (qty <= 0) return [];
    if (warehouseId) {
      await this.requireIssueWarehouse(manager, product.companyId, warehouseId, !!opts.sale);
      const allocations = [{ warehouseId, delta: -qty }];
      await this.apply(manager, product, allocations);
      return allocations;
    }
    const warehouses = opts.sale ? await this.sellableWarehouses(manager, product.companyId) : await this.activeWarehouses(manager, product.companyId);
    const rows = await this.lockRows(manager, product.companyId, product.id);
    let remaining = roundQty(qty);
    const allocations: StockAllocation[] = [];
    for (const wh of warehouses) {
      if (remaining <= 0) break;
      const available = rows.find((r) => r.warehouseId === wh.id)?.quantity || 0;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      allocations.push({ warehouseId: wh.id, delta: -take });
      remaining = roundQty(remaining - take);
    }
    if (remaining > 0) {
      throw new BadRequestException(err('STOCK_INSUFFICIENT_BY_WAREHOUSE', { missing: remaining }));
    }
    await this.apply(manager, product, allocations);
    return allocations;
  }

  /** Explicit source warehouse; for sales it must be sellable. */
  private async requireIssueWarehouse(manager: EntityManager, companyId: string, warehouseId: string, sale: boolean): Promise<WarehouseEntity> {
    const wh = await this.requireWarehouse(manager, companyId, warehouseId);
    if (sale && !this.isSellable(wh)) throw new BadRequestException(err('WAREHOUSE_NOT_SELLABLE', { warehouse: wh.name }));
    return wh;
  }

  /** Brings the total of an untracked product to `newTotal` (adds to default / deducts greedily). */
  async setTotal(manager: EntityManager, product: ProductEntity, newTotal: number, warehouseId?: string | null): Promise<StockAllocation[]> {
    this.assertUntracked(product);
    const diff = roundQty(newTotal - product.quantity);
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
      if (!validQty(q)) throw new BadRequestException(err('LOT_QUANTITY_INVALID', { lot: lotNumber }));
      const expiry = normDate(l.expiryDate);
      if (expiry && !DATE_RE.test(expiry)) throw new BadRequestException(err('LOT_EXPIRY_INVALID', { lot: lotNumber }));
      if (product.hasExpiry && !expiry) throw new BadRequestException(err('LOT_EXPIRY_REQUIRED', { lot: lotNumber, name: product.name }));
      const prev = merged.get(lotNumber);
      if (prev) {
        if ((prev.expiryDate || null) !== (expiry || null)) throw new BadRequestException(err('LOT_EXPIRY_CONFLICT', { lot: lotNumber }));
        prev.quantity = addQty(prev.quantity, q);
      } else {
        merged.set(lotNumber, { lotNumber, expiryDate: expiry, quantity: q });
      }
    }
    const total = sumQty([...merged.values()].map((l) => l.quantity));
    if (total !== roundQty(qty)) {
      throw new BadRequestException(err('LOT_QUANTITY_MISMATCH', { name: product.name, expected: qty, actual: total }));
    }
    const out: StockAllocation[] = [];
    for (const l of merged.values()) {
      const lot = await this.upsertLot(manager, product, warehouseId, l.lotNumber, l.expiryDate || null);
      lot.quantity = addQty(lot.quantity, l.quantity);
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
    if (!Number.isInteger(Number(qty))) throw new BadRequestException(err('QUANTITY_PRECISION_EXCEEDED', { quantity: qty, decimals: 0 }));
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
    opts: { serialStatus?: SerialStatus; allowExpired?: boolean; sale?: boolean } = {},
  ): Promise<StockAllocation[]> {
    if (qty <= 0) return [];
    if (!isTracked(product)) return this.deduct(manager, product, qty, warehouseId, { sale: opts.sale });
    if (warehouseId) await this.requireIssueWarehouse(manager, product.companyId, warehouseId, !!opts.sale);
    const allocations =
      product.trackingType === TrackingType.LOT
        ? await this.pickLots(manager, product, qty, warehouseId || null, details.lots, !!opts.allowExpired, !!opts.sale)
        : await this.pickSerials(manager, product, qty, warehouseId || null, details.serials, opts.serialStatus || SerialStatus.SOLD, !!opts.sale);
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
    sale = false,
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
        if (!validQty(q)) throw new BadRequestException(err('LOT_QUANTITY_INVALID', { lot: lot.lotNumber }));
        if (warehouseId && lot.warehouseId !== warehouseId) throw new BadRequestException(err('LOT_WRONG_WAREHOUSE', { lot: lot.lotNumber }));
        if (sale && !warehouseId) await this.requireIssueWarehouse(manager, product.companyId, lot.warehouseId, true);
        const total = addQty(used.get(lot.id) || 0, q);
        if (total > lot.quantity) {
          throw new BadRequestException(err('LOT_INSUFFICIENT', { lot: lot.lotNumber, available: lot.quantity, requested: total }));
        }
        used.set(lot.id, total);
        picks.push({ lot, quantity: q });
      }
      const sum = sumQty(picks.map((p) => p.quantity));
      if (sum !== roundQty(qty)) throw new BadRequestException(err('LOT_QUANTITY_MISMATCH', { name: product.name, expected: qty, actual: sum }));
    } else {
      const activeIds = warehouseId
        ? [warehouseId]
        : (sale ? await this.sellableWarehouses(manager, product.companyId) : await this.activeWarehouses(manager, product.companyId)).map((w) => w.id);
      const lots = await manager.find(StockLotEntity, {
        where: { companyId: product.companyId, productId: product.id, warehouseId: In(activeIds), quantity: MoreThan(0) },
        lock: { mode: 'pessimistic_write' },
      });
      const company = await manager.findOne(CompanyEntity, { where: { id: product.companyId }, select: ['id', 'timezone'] });
      const today = todayKey(company?.timezone);
      const result = allocateLots(lots, qty, {
        fefo: !!product.hasExpiry,
        skipExpiredBefore: product.hasExpiry && !allowExpired ? today : null,
      });
      if (!result) {
        const usable = lots
          .filter((l) => allowExpired || !product.hasExpiry || !l.expiryDate || normDate(l.expiryDate)! >= today)
          .reduce((s, l) => addQty(s, l.quantity), 0);
        throw new BadRequestException(err('LOT_INSUFFICIENT_AUTO', { name: product.name, available: usable, requested: qty }));
      }
      for (const p of result.picks) picks.push({ lot: p.lot as StockLotEntity, quantity: p.quantity });
    }
    const out: StockAllocation[] = [];
    for (const p of picks) {
      p.lot.quantity = addQty(p.lot.quantity, -p.quantity);
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
    sale = false,
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
        if (sale && !warehouseId && row.warehouseId) await this.requireIssueWarehouse(manager, product.companyId, row.warehouseId, true);
      }
    } else {
      const activeIds = warehouseId
        ? [warehouseId]
        : (sale ? await this.sellableWarehouses(manager, product.companyId) : await this.activeWarehouses(manager, product.companyId)).map((w) => w.id);
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
        lot.quantity = addQty(lot.quantity, e.quantity);
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
        lot.quantity = addQty(lot.quantity, -o.delta);
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
    const target = Math.max(0, roundQty(Number(counted) || 0));
    const delta = roundQty(target - lot.quantity);
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
   * Writes one stock movement per allocation (per lot / serial group), appending
   * each to the company's hash chain. previous/new quantities are company-wide
   * product totals, chained across rows. Requires a reason code; the transaction
   * date defaults to now and may not lie in the future.
   */
  async recordMovements(
    manager: EntityManager,
    product: ProductEntity,
    previousTotal: number,
    allocations: StockAllocation[],
    info: MovementInfo,
  ): Promise<StockMovementEntity[]> {
    const active = allocations.filter((a) => a.delta);
    if (!active.length) return [];
    const now = Date.now();
    const txDate = toSecond(info.transactionDate ? new Date(info.transactionDate) : new Date(now));
    if (Number.isNaN(txDate.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
    if (txDate.getTime() > now + FUTURE_TOLERANCE_MS) throw new BadRequestException(err('TRANSACTION_DATE_IN_FUTURE'));
    if (info.documentDate && !isDateKey(info.documentDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    const reasons = active.map((a) => (typeof info.reasonCode === 'function' ? info.reasonCode(a.delta) : info.reasonCode));
    reasons.forEach((r, i) => {
      if (!r) throw new BadRequestException(err('REASON_CODE_REQUIRED'));
      if (!isReasonCode(r)) throw new BadRequestException(err('REASON_CODE_INVALID', { reason: r }));
      if (!reasonAllowsDirection(r, active[i].delta)) throw new BadRequestException(err('REASON_DIRECTION_MISMATCH', { reason: r }));
    });

    const chain = await this.begin(manager, product.companyId);
    await this.assertTransactionDateAllowed(manager, product, txDate, now, previousTotal, info.totalsUnchanged ? 0 : sumQty(active.map((a) => a.delta)));
    const actor = this.tenant.actor;
    const baseUnit = product.baseUnitId ? await manager.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: product.companyId } }) : null;
    // Snapshot the UN/ECE code (what documents carry); the internal code only when the unit has none.
    const unitCode = baseUnit?.uneceCode || product.unit || null;
    const createdAt = new Date(now);
    const whIds = [...new Set(active.map((a) => a.warehouseId).filter(Boolean))];
    const whs = whIds.length ? await manager.find(WarehouseEntity, { where: { companyId: product.companyId, id: In(whIds) } }) : [];
    const saved: StockMovementEntity[] = [];
    let running = roundQty(previousTotal);
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const next = info.totalsUnchanged ? running : addQty(running, a.delta);
      const row = manager.create(StockMovementEntity, {
        id: randomUUID(),
        companyId: product.companyId,
        sequenceNo: Number(chain.lastSequenceNo) + 1,
        productId: product.id,
        productSku: product.sku ?? null,
        productName: product.name,
        unitCode,
        warehouseId: a.warehouseId,
        warehouseName: whs.find((w) => w.id === a.warehouseId)?.name ?? null,
        type: a.type || info.type,
        reasonCode: reasons[i],
        quantity: roundQty(a.delta),
        previousQuantity: running,
        newQuantity: next,
        lotId: a.lotId ?? null,
        lotNumber: a.lotNumber ?? null,
        serials: a.serials?.length ? a.serials : null,
        transactionDate: txDate,
        documentType: info.documentType || null,
        documentNo: info.documentNo ? String(info.documentNo).slice(0, 50) : null,
        documentDate: info.documentDate || null,
        counterpartyTaxId: info.counterpartyTaxId || null,
        referenceId: info.referenceId as string,
        referenceType: info.referenceType as string,
        note: (info.note ? String(info.note).slice(0, 255) : info.note) as string,
        performedBy: info.performedBy || actor.username || 'System',
        performedByUserId: info.performedByUserId !== undefined ? info.performedByUserId : actor.userId ?? null,
        performedViaApiKeyId: info.performedByUserId !== undefined ? null : actor.apiKeyId ?? null,
        // A movement is reversed once (UQ_stock_movements_reverses): the link goes on the first row of the booking.
        reversesMovementId: i === 0 ? info.reversesMovementId ?? null : null,
        approvedBy: info.approvedBy ? String(info.approvedBy).slice(0, 100) : null,
        approvedByUserId: info.approvedByUserId ?? null,
        // Evidence files are linked to the first movement of the booking; its row carries their digest.
        attachmentsSha256: i === 0 ? info.attachmentsSha256 ?? null : null,
        hashVersion: CURRENT_HASH_VERSION,
        createdAt,
      });
      row.prevHash = chain.lastHash;
      row.hash = movementHash(chain.lastHash, row as unknown as Record<string, unknown>);
      saved.push(await manager.save(StockMovementEntity, row));
      chain.lastSequenceNo = row.sequenceNo;
      chain.lastHash = row.hash;
      running = next;
    }
    await manager.update(StockMovementChainEntity, { companyId: product.companyId }, { lastSequenceNo: chain.lastSequenceNo, lastHash: chain.lastHash });
    return saved;
  }

  /**
   * Rejects a transaction date that falls into a locked period (company stockLockDate)
   * or before the default floor (1 January of the previous year), and a back-dated
   * outflow that would make the product's balance negative at its transaction date or
   * at any later point of the ledger (balances evaluated in transaction-date order;
   * product level, transfers excluded since they do not change the total).
   */
  private async assertTransactionDateAllowed(
    manager: EntityManager,
    product: ProductEntity,
    txDate: Date,
    now: number,
    previousTotal: number,
    netDelta: number,
  ): Promise<void> {
    const company = await manager.findOne(CompanyEntity, { where: { id: product.companyId }, select: ['id', 'timezone', 'stockLockDate'] });
    const tz = company?.timezone || DEFAULT_TIMEZONE;
    const day = dateKeyInZone(txDate, tz);
    const lock = company?.stockLockDate ? normDate(company.stockLockDate) : null;
    if (lock && day <= lock) throw new BadRequestException(err('TRANSACTION_DATE_LOCKED', { date: lock }));
    const floor = `${Number(dateKeyInZone(new Date(now), tz).slice(0, 4)) - 1}-01-01`;
    if (day < floor) throw new BadRequestException(err('TRANSACTION_DATE_TOO_OLD', { min: floor }));
    if (netDelta >= 0 || txDate.getTime() >= now - BACKDATE_CHECK_MS) return;
    // Running sums of the movements dated after txDate, newest first: the largest one is the
    // amount by which the current total exceeds the lowest balance from txDate onwards.
    const rows: { s: string | null }[] = await manager.query(
      'SELECT MAX(x.s) AS s FROM (SELECT SUM(`quantity`) OVER (ORDER BY `transactionDate` DESC, `sequenceNo` DESC ROWS UNBOUNDED PRECEDING) AS s ' +
        'FROM `stock_movements` WHERE `companyId` = ? AND `productId` = ? AND `transactionDate` > ? AND `type` NOT IN (?)) x',
      [product.companyId, product.id, txDate, TRANSFER_TYPES],
    );
    const maxLater = Math.max(0, Number(rows?.[0]?.s ?? 0) || 0);
    const minBalance = roundQty(roundQty(previousTotal) - maxLater);
    if (roundQty(minBalance + netDelta) < 0) {
      throw new BadRequestException(err('BACKDATED_BALANCE_NEGATIVE', { date: day, available: Math.max(0, minBalance), requested: roundQty(-netDelta) }));
    }
  }

  /** VUK 219 warnings for movements just recorded (one per distinct delay). */
  async lateEntryWarnings(
    manager: EntityManager,
    companyId: string,
    movements: { transactionDate?: Date | string | null }[],
    limitDays: number,
  ): Promise<{ code: string; params: Record<string, number> }[]> {
    const company = await manager.findOne(CompanyEntity, { where: { id: companyId }, select: ['id', 'timezone'] });
    const out: { code: string; params: Record<string, number> }[] = [];
    for (const m of movements) {
      const w = this.lateEntryWarning(m.transactionDate, company?.timezone, limitDays);
      if (w && !out.some((x) => x.params['days'] === w.params['days'])) out.push(w);
    }
    return out;
  }

  /**
   * VUK 219: records may not be entered later than `limitDays` (legal parameter
   * VUK219_RECORD_DAYS) after the transaction. Returns a warning or null.
   */
  lateEntryWarning(
    transactionDate: Date | string | null | undefined,
    timezone: string | null | undefined,
    limitDays: number,
  ): { code: string; params: Record<string, number> } | null {
    if (!transactionDate) return null;
    const tz = timezone || DEFAULT_TIMEZONE;
    const days = daysBetween(dateKeyInZone(new Date(transactionDate), tz), dateKeyInZone(new Date(), tz));
    return days > limitDays ? { code: 'LATE_ENTRY_WARNING', params: { days, limit: limitDays } } : null;
  }

  /**
   * Stock effect of reversing `original`: the opposite quantity at the same
   * warehouse / lot / serials. Returns the allocations (already applied).
   */
  async applyReversal(manager: EntityManager, product: ProductEntity, original: StockMovementEntity): Promise<StockAllocation[]> {
    const delta = roundQty(-Number(original.quantity));
    if (!delta) return [];
    const warehouseId = original.warehouseId;
    if (!warehouseId) throw new BadRequestException(err('MOVEMENT_NOT_REVERSIBLE'));
    await this.requireWarehouse(manager, product.companyId, warehouseId);
    if (product.trackingType === TrackingType.LOT) {
      if (!original.lotId && !original.lotNumber) throw new BadRequestException(err('TRACKING_RESTORE_UNAVAILABLE', { name: product.name }));
      if (delta > 0) {
        return this.restore(manager, product, [
          { warehouseId, quantity: delta, lotId: original.lotId ?? null, lotNumber: original.lotNumber ?? null, expiryDate: null },
        ]);
      }
      const lot = original.lotId
        ? await manager.findOne(StockLotEntity, { where: { id: original.lotId, companyId: product.companyId, productId: product.id } })
        : await manager.findOne(StockLotEntity, { where: { companyId: product.companyId, productId: product.id, warehouseId, lotNumber: original.lotNumber as string } });
      if (!lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: original.lotNumber || original.lotId }));
      const out = await this.pickLots(manager, product, -delta, warehouseId, [{ lotId: lot.id, quantity: -delta }], true);
      await this.apply(manager, product, out);
      return out;
    }
    if (product.trackingType === TrackingType.SERIAL) {
      const serials = original.serials || [];
      if (serials.length !== Math.abs(delta)) throw new BadRequestException(err('TRACKING_RESTORE_UNAVAILABLE', { name: product.name }));
      if (delta > 0) return this.restore(manager, product, [{ warehouseId, quantity: delta, serials }]);
      const out = await this.pickSerials(manager, product, -delta, warehouseId, serials, SerialStatus.RETURNED);
      await this.apply(manager, product, out);
      return out;
    }
    const allocations = [{ warehouseId, delta }];
    await this.apply(manager, product, allocations);
    return allocations;
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
