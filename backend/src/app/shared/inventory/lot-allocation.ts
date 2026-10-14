/** Minimal lot shape needed for allocation. */
export interface AllocatableLot {
  id: string;
  warehouseId: string;
  lotNumber: string;
  /** YYYY-MM-DD or Date; null = no expiry */
  expiryDate?: string | Date | null;
  quantity: number;
  createdAt?: Date | string;
}

export interface LotPick {
  lot: AllocatableLot;
  quantity: number;
}

const dayKey = (d: string | Date): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const ts = (d?: Date | string) => (d ? new Date(d).getTime() : 0);

/**
 * Orders lots for picking:
 *  - FEFO (first expired, first out) when `fefo`: earliest expiry first, lots
 *    without expiry last; ties by receipt time.
 *  - FIFO otherwise: oldest receipt first.
 */
export function sortLotsForPicking<T extends AllocatableLot>(lots: T[], fefo: boolean): T[] {
  return [...lots].sort((a, b) => {
    if (fefo) {
      const ea = a.expiryDate ? dayKey(a.expiryDate) : '9999-12-31';
      const eb = b.expiryDate ? dayKey(b.expiryDate) : '9999-12-31';
      if (ea !== eb) return ea < eb ? -1 : 1;
    }
    const d = ts(a.createdAt) - ts(b.createdAt);
    if (d !== 0) return d;
    return a.lotNumber.localeCompare(b.lotNumber);
  });
}

/**
 * Picks `qty` units across lots (FEFO or FIFO). Expired lots (expiry < today)
 * are skipped when `skipExpiredBefore` is given. Returns null when the lots
 * cannot cover the quantity.
 */
export function allocateLots<T extends AllocatableLot>(
  lots: T[],
  qty: number,
  opts: { fefo: boolean; skipExpiredBefore?: string | null },
): { picks: LotPick[]; available: number } | null {
  const usable = lots.filter(
    (l) => l.quantity > 0 && !(opts.skipExpiredBefore && l.expiryDate && dayKey(l.expiryDate) < opts.skipExpiredBefore),
  );
  const available = usable.reduce((s, l) => s + l.quantity, 0);
  if (available < qty) return null;
  let remaining = qty;
  const picks: LotPick[] = [];
  for (const lot of sortLotsForPicking(usable, opts.fefo)) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    picks.push({ lot, quantity: take });
    remaining -= take;
  }
  return { picks, available };
}

/** Days from `today` (YYYY-MM-DD) to `expiry`; negative when expired. */
export function daysUntil(expiry: string | Date, today: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const e = dayKey(expiry);
  const b = Date.UTC(+e.slice(0, 4), +e.slice(5, 7) - 1, +e.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Today as YYYY-MM-DD (server local date). */
export function todayKey(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
