/** Calendar-day helpers that respect a company's IANA time zone (DB stores UTC). */

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

/**
 * "Today" (YYYY-MM-DD) as seen in time zone `tz`, e.g. 22:30 UTC is already the
 * next day in Europe/Istanbul (UTC+3). Invalid zones fall back to Europe/Istanbul.
 */
export function todayKey(tz: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return dateKeyInZone(now, tz);
}

export function dateKeyInZone(d: Date, tz: string = DEFAULT_TIMEZONE): string {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const parse = (key: string) => ({ y: +key.slice(0, 4), m: +key.slice(5, 7), d: +key.slice(8, 10) });
const fmt = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Whole days from `from` to `to` (YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

export function addDays(key: string, days: number): string {
  const { y, m, d } = parse(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** First day of the month that is `months` after the month of `key` (e.g. 2026-02-10 +3 -> 2026-05-01). */
export function firstDayAfterMonths(key: string, months: number): string {
  const { y, m } = parse(key);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
}

export function endOfMonth(key: string): string {
  const { y, m } = parse(key);
  const t = new Date(Date.UTC(y, m, 0));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function withDayOfMonth(key: string, day: number): string {
  const { y, m } = parse(key);
  return fmt(y, m, Math.min(day, +endOfMonth(key).slice(8, 10)));
}

export function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}
