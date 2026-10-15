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

/** Same day `months` later (clamped to the month's last day), e.g. 2026-01-31 +1 -> 2026-02-28. */
export function addMonths(key: string, months: number): string {
  const { y, m, d } = parse(key);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = first.getUTCFullYear();
  const tm = first.getUTCMonth() + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return fmt(ty, tm, Math.min(d, last));
}

/** UTC offset (minutes, east positive) of time zone `tz` at instant `at`. */
function zoneOffsetMinutes(tz: string, at: Date): number {
  let f: Intl.DateTimeFormat;
  const o: Intl.DateTimeFormatOptions = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  try {
    f = new Intl.DateTimeFormat('en-US', { ...o, timeZone: tz || DEFAULT_TIMEZONE });
  } catch {
    f = new Intl.DateTimeFormat('en-US', { ...o, timeZone: DEFAULT_TIMEZONE });
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p['year'], +p['month'] - 1, +p['day'], +p['hour'] % 24, +p['minute'], +p['second']);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/**
 * The UTC instant at which calendar day `key` (YYYY-MM-DD) starts in time zone `tz`,
 * e.g. 2026-10-15 in Europe/Istanbul -> 2026-10-14T21:00:00Z. Use it for report and
 * filter boundaries: the database stores UTC.
 */
export function zonedDayStart(key: string, tz: string = DEFAULT_TIMEZONE): Date {
  const { y, m, d } = parse(key);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle a DST change between the guess and the real instant.
  let t = guess - zoneOffsetMinutes(tz, new Date(guess)) * 60000;
  t = guess - zoneOffsetMinutes(tz, new Date(t)) * 60000;
  return new Date(t);
}

/** Exclusive end of calendar day `key` in `tz` (= start of the next day). */
export function zonedDayEnd(key: string, tz: string = DEFAULT_TIMEZONE): Date {
  return zonedDayStart(addDays(key, 1), tz);
}

/** "HH:MM:SS" (24h) of instant `d` in time zone `tz`. */
export function timeKeyInZone(d: Date, tz: string = DEFAULT_TIMEZONE): string {
  let f: Intl.DateTimeFormat;
  const o: Intl.DateTimeFormatOptions = { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  try {
    f = new Intl.DateTimeFormat('en-GB', { ...o, timeZone: tz || DEFAULT_TIMEZONE });
  } catch {
    f = new Intl.DateTimeFormat('en-GB', { ...o, timeZone: DEFAULT_TIMEZONE });
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p['hour']}:${p['minute']}:${p['second']}`;
}
