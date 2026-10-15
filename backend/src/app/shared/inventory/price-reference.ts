/**
 * Reference ("previous") price shown next to a discounted price (Fiyat Etiketi Yönetmeliği,
 * 11.10.2025 değişikliği; R70): the lowest price applied during the `days` days before the
 * discount (legal parameter DISCOUNT_REFERENCE_DAYS, 10 per the plan); for perishable goods
 * the price applied immediately before the discount.
 */
export interface PricePoint {
  price: number;
  /** When this price took effect */
  validFrom: Date | string;
}

export interface ReferencePriceResult {
  referencePrice: number | null;
  basis: 'LOWEST_IN_WINDOW' | 'PREVIOUS_PRICE' | 'NO_HISTORY';
  windowStart: string;
  windowEnd: string;
}

const t = (d: Date | string) => new Date(d).getTime();

export function discountReferencePrice(history: PricePoint[], discountAt: Date | string, opts: { days?: number; perishable?: boolean } = {}): ReferencePriceResult {
  const days = opts.days ?? 10;
  const end = t(discountAt);
  const start = end - days * 86400000;
  const sorted = [...history].filter((h) => Number.isFinite(Number(h.price))).sort((a, b) => t(a.validFrom) - t(b.validFrom));
  const before = sorted.filter((h) => t(h.validFrom) < end);
  const windowStart = new Date(start).toISOString();
  const windowEnd = new Date(end).toISOString();
  if (!before.length) return { referencePrice: null, basis: 'NO_HISTORY', windowStart, windowEnd };
  if (opts.perishable) return { referencePrice: Number(before[before.length - 1].price), basis: 'PREVIOUS_PRICE', windowStart, windowEnd };
  // Prices in force at some moment of [start, end): the one in force at `start` plus every change inside.
  const atStart = before.filter((h) => t(h.validFrom) <= start).pop();
  const inside = before.filter((h) => t(h.validFrom) > start);
  const candidates = [...(atStart ? [atStart] : []), ...inside].map((h) => Number(h.price));
  return { referencePrice: Math.min(...candidates), basis: 'LOWEST_IN_WINDOW', windowStart, windowEnd };
}
