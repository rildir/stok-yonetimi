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

// ─── Tax-point exchange rates (TR: KDVK 26 / VUK 215, 280) ───

export type FxSource = 'TCMB' | 'MANUAL' | 'BASE';
export type FxRateType = 'FOREX_BUYING' | 'FOREX_SELLING' | 'BANKNOTE_BUYING' | 'BANKNOTE_SELLING';

export interface TaxRateRow extends RateRow {
  source?: string | null;
  rateType?: string | null;
}

export interface TaxFxRate {
  rate: number;
  /** Bulletin / rate date used (YYYY-MM-DD) */
  date: string;
  source: FxSource;
  /** Bulletin date the tax point calls for (last business day before / on it, never after the last published one) */
  expectedDate?: string;
  /** The rate is older than the expected bulletin and TCMB did not confirm that none was published in between */
  stale?: boolean;
  /** The tax point lies after the last published bulletin (future date): the rate is an estimate */
  provisional?: boolean;
}

const DOW = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Saturday / Sunday: TCMB publishes no bulletin. */
export function isWeekend(key: string): boolean {
  const d = DOW(key);
  return d === 0 || d === 6;
}

/** The latest Monday-Friday day on or before `key`. */
export function lastWeekdayOnOrBefore(key: string): string {
  let k = key;
  while (isWeekend(k)) k = shiftDay(k, -1);
  return k;
}

/**
 * True when no TCMB bulletin is due on any day after `rateDate` up to `expected`: every weekday
 * in (rateDate, expected] is a listed no-bulletin day (public holiday, legal parameter
 * TCMB_NO_BULLETIN_DAYS). Used when the TCMB archive cannot confirm the gap (manual rates, outage).
 */
export function gapIsNoBulletinDays(rateDate: string, expected: string, noBulletinDays: ReadonlySet<string>): boolean {
  if (rateDate >= expected) return true;
  for (let k = shiftDay(rateDate, 1), i = 0; k <= expected && i < 400; k = shiftDay(k, 1), i++) {
    if (!isWeekend(k) && !noBulletinDays.has(k)) return false;
  }
  return true;
}

/**
 * Last bulletin day already announced at `now`: today after the 15:30 (Europe/Istanbul)
 * announcement on a weekday, else the previous weekday. `todayIstanbul` / `minutesIstanbul`
 * are the date and minutes since midnight in Europe/Istanbul.
 */
export function lastPublishedBulletinDay(todayIstanbul: string, minutesIstanbul: number): string {
  if (!isWeekend(todayIstanbul) && minutesIstanbul >= 15 * 60 + 30) return todayIstanbul;
  return lastWeekdayOnOrBefore(shiftDay(todayIstanbul, -1));
}

/**
 * Bulletin date a tax point calls for: the last weekday before it (`previousDay`) or on it,
 * capped at the last bulletin already published. Public holidays are not known here: a missing
 * weekday bulletin is confirmed against the TCMB archive (404 = none published) by the caller.
 */
export function expectedBulletinDay(taxPointDate: string, previousDay: boolean, lastPublished: string): { expected: string; provisional: boolean } {
  const target = lastWeekdayOnOrBefore(previousDay ? shiftDay(taxPointDate, -1) : taxPointDate);
  return target > lastPublished ? { expected: lastPublished, provisional: true } : { expected: target, provisional: false };
}

/**
 * Exchange rate for converting a foreign-currency document to TRY for VAT purposes:
 *  - only the direct `currency -> TRY` FOREX_BUYING rate (no inverse, no cross rate);
 *  - the latest rate dated before the tax point when `previousDay` (TCMB bulletin of the
 *    previous business day, announced 15:30 - the policy comes from legal_parameters
 *    KDV_FX_RATE_DAY, confidence low), otherwise on or before it;
 *  - TCMB rows win over manual rows of the same date.
 * Returns null when no such rate exists (caller raises FX_RATE_NOT_FOUND).
 */
export function selectTaxFxRate(rates: TaxRateRow[], currency: string, taxPointDate: string, previousDay: boolean, target = 'TRY'): TaxFxRate | null {
  const cur = (currency || '').toUpperCase();
  if (cur === target) return { rate: 1, date: taxPointDate, source: 'BASE' };
  let best: TaxRateRow | null = null;
  for (const r of rates) {
    if (r.baseCurrency !== cur || r.quoteCurrency !== target) continue;
    if ((r.rateType || 'FOREX_BUYING') !== 'FOREX_BUYING') continue;
    const d = toIsoDate(r.date);
    if (previousDay ? d >= taxPointDate : d > taxPointDate) continue;
    if (!(Number(r.rate) > 0)) continue;
    if (!best) { best = r; continue; }
    const bd = toIsoDate(best.date);
    if (d > bd || (d === bd && r.source === 'TCMB' && best.source !== 'TCMB')) best = r;
  }
  if (!best) return null;
  return { rate: Number(best.rate), date: toIsoDate(best.date), source: best.source === 'TCMB' ? 'TCMB' : 'MANUAL' };
}

export interface TcmbRate {
  currency: string;
  /** Per 1 unit of the currency (TCMB quotes some per 100) */
  forexBuying: number | null;
  forexSelling: number | null;
  banknoteBuying: number | null;
  banknoteSelling: number | null;
}

export interface TcmbBulletin {
  /** YYYY-MM-DD */
  date: string;
  bulletinNo: string | null;
  rates: TcmbRate[];
}

/** Parses a TCMB `today.xml` / `YYYYMM/DDMMYYYY.xml` indicative-rates bulletin. */
export function parseTcmbXml(xml: string): TcmbBulletin {
  const head = /<Tarih_Date\b([^>]*)>/i.exec(xml || '');
  if (!head) throw new Error('TCMB_XML_INVALID');
  const attr = (s: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(s)?.[1] ?? null;
  const tr = attr(head[1], 'Tarih');
  const m = tr ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(tr) : null;
  if (!m) throw new Error('TCMB_XML_INVALID');
  const date = `${m[3]}-${m[2]}-${m[1]}`;
  const rates: TcmbRate[] = [];
  const re = /<Currency\b([^>]*)>([\s\S]*?)<\/Currency>/gi;
  let c: RegExpExecArray | null;
  while ((c = re.exec(xml))) {
    const code = (attr(c[1], 'CurrencyCode') || attr(c[1], 'Kod') || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) continue;
    const tag = (name: string) => {
      const v = new RegExp(`<${name}>\\s*([0-9.,]+)\\s*</${name}>`, 'i').exec(c![2])?.[1];
      if (!v) return null;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const unit = tag('Unit') || 1;
    const per = (n: number | null) => (n === null ? null : Math.round((n / unit) * 1e6) / 1e6);
    rates.push({
      currency: code,
      forexBuying: per(tag('ForexBuying')),
      forexSelling: per(tag('ForexSelling')),
      banknoteBuying: per(tag('BanknoteBuying')),
      banknoteSelling: per(tag('BanknoteSelling')),
    });
  }
  return { date, bulletinNo: attr(head[1], 'Bulten_No'), rates };
}

/** TCMB archive URL of the bulletin dated `date` (YYYY-MM-DD). */
export function tcmbBulletinPath(date: string): string {
  const [y, mo, d] = date.split('-');
  return `${y}${mo}/${d}${mo}${y}.xml`;
}
