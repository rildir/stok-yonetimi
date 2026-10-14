export interface RateRow {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  /** YYYY-MM-DD */
  date: string;
}

/** Normalizes a date-ish value to YYYY-MM-DD. */
export function toIsoDate(d?: Date | string | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function latestDirect(rates: RateRow[], from: string, to: string, onOrBefore: string): number | null {
  let best: RateRow | null = null;
  for (const r of rates) {
    if (r.baseCurrency !== from || r.quoteCurrency !== to) continue;
    if (toIsoDate(r.date) > onOrBefore) continue;
    if (!best || toIsoDate(r.date) > toIsoDate(best.date)) best = r;
  }
  return best && Number(best.rate) > 0 ? Number(best.rate) : null;
}

/** Rate for one pair: direct, else inverse of the opposite pair. */
function pairRate(rates: RateRow[], from: string, to: string, on: string): number | null {
  const direct = latestDirect(rates, from, to, on);
  if (direct) return direct;
  const inverse = latestDirect(rates, to, from, on);
  return inverse ? 1 / inverse : null;
}

/**
 * How many units of `to` one unit of `from` is worth on `date`, using the
 * most recent rate dated on/before it. Falls back to triangulation through
 * `pivot` (the company base currency). Returns null when unknown.
 */
export function findRate(rates: RateRow[], from: string, to: string, date?: Date | string | null, pivot?: string): number | null {
  const f = (from || '').toUpperCase();
  const t = (to || '').toUpperCase();
  if (!f || !t || f === t) return 1;
  const on = toIsoDate(date);
  const direct = pairRate(rates, f, t, on);
  if (direct) return direct;
  if (pivot && pivot !== f && pivot !== t) {
    const a = pairRate(rates, f, pivot, on);
    const b = pairRate(rates, pivot, t, on);
    if (a && b) return a * b;
  }
  return null;
}

export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: RateRow[],
  date?: Date | string | null,
  pivot?: string,
): number | null {
  const rate = findRate(rates, from, to, date, pivot);
  if (rate === null) return null;
  return Math.round((Number(amount) || 0) * rate * 100) / 100;
}
