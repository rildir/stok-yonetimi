/**
 * GS1 helpers (R69): GTIN generation from a GS1 company prefix, the restricted-circulation
 * prefix warning and parsing of GS1 element strings (GS1-128 / DataMatrix / QR) so that
 * scanning at goods receipt, stock count and sale fills GTIN, lot, expiry and serial.
 *
 * Supported application identifiers: 00 (SSCC), 01 / 02 (GTIN), 10 (lot), 11 (production
 * date), 15 (best before), 17 (expiry / use by), 21 (serial), 30 (count), 310n (net weight kg).
 * Source: GS1 General Specifications §3 (AI definitions), §7.8 (FNC1 / GS separator).
 */
import { isValidGtin } from './inventory';

export interface Gs1Element {
  ai: string;
  value: string;
}

export interface Gs1Parsed {
  /** 14-digit GTIN (AI 01 or 02) */
  gtin: string | null;
  sscc: string | null;
  lot: string | null;
  serial: string | null;
  /** YYYY-MM-DD (AI 11) */
  productionDate: string | null;
  /** YYYY-MM-DD (AI 17: son tüketim / expiry) */
  expiryDate: string | null;
  /** YYYY-MM-DD (AI 15: tavsiye edilen tüketim) */
  bestBeforeDate: string | null;
  count: number | null;
  /** AI 310n, kilograms */
  netWeightKg: number | null;
  elements: Gs1Element[];
  /** Problems found (unknown AI, bad check digit, bad date); the known part is still returned */
  errors: string[];
}

/** Fixed-length AIs: AI -> value length. Others are variable length (terminated by GS / end). */
const FIXED: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
/** Variable-length AIs: AI -> max length. */
const VARIABLE: Record<string, number> = { '10': 20, '21': 20, '22': 20, '30': 8, '37': 8, '240': 30, '241': 30, '250': 30, '400': 30 };
const GS = '\u001d';

function aiAt(s: string, i: number): string | null {
  const two = s.slice(i, i + 2);
  if (FIXED[two] !== undefined || VARIABLE[two] !== undefined) return two;
  const three = s.slice(i, i + 3);
  if (VARIABLE[three] !== undefined) return three;
  // 310n: net weight in kg with n decimals (fixed 6 digits)
  const four = s.slice(i, i + 4);
  if (/^310[0-5]$/.test(four)) return four;
  return null;
}

/**
 * YYMMDD -> YYYY-MM-DD. DD = 00 means the last day of that month (GS1 GenSpecs 7.12).
 * Century: GS1 sliding window relative to `now` (49 years back, 50 years ahead).
 */
export function gs1Date(v: string, now: Date = new Date()): string | null {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  let dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const cur = now.getUTCFullYear();
  const base = Math.floor(cur / 100) * 100;
  let year = base + yy;
  if (year - cur > 50) year -= 100;
  else if (cur - year > 49) year += 100;
  const last = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd === 0) dd = last;
  if (dd > last) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Parses a GS1 element string. Accepts the human-readable form "(01)08690000000017(17)271231(10)L123"
 * and the raw scanner form "0108690000000017172712311" + GS + "10L123" (symbology identifiers such
 * as "]C1", "]d2", "]Q3" are ignored).
 */
export function parseGs1ElementString(input: string, now: Date = new Date()): Gs1Parsed {
  const out: Gs1Parsed = {
    gtin: null, sscc: null, lot: null, serial: null, productionDate: null, expiryDate: null, bestBeforeDate: null, count: null, netWeightKg: null, elements: [], errors: [],
  };
  let s = String(input || '').trim();
  if (!s) return out;
  s = s.replace(/^\][A-Za-z]\d/, '');
  if (s.startsWith('(')) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) out.elements.push({ ai: m[1], value: m[2].replace(new RegExp(GS, 'g'), '').trim() });
  } else {
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) {
        i++;
        continue;
      }
      const ai = aiAt(s, i);
      if (!ai) {
        out.errors.push(`UNKNOWN_AI@${i}`);
        break;
      }
      i += ai.length;
      let value: string;
      const fixed = FIXED[ai] ?? (/^310\d$/.test(ai) ? 6 : undefined);
      if (fixed !== undefined) {
        value = s.slice(i, i + fixed);
        i += fixed;
      } else {
        const end = s.indexOf(GS, i);
        const max = VARIABLE[ai] ?? 30;
        const stop = end < 0 ? s.length : end;
        value = s.slice(i, Math.min(stop, i + max));
        i = Math.min(stop, i + max);
      }
      out.elements.push({ ai, value });
    }
  }
  for (const { ai, value } of out.elements) {
    if (ai === '01' || ai === '02') {
      if (/^\d{14}$/.test(value) && isValidGtin(value)) out.gtin = value;
      else out.errors.push(`GTIN_INVALID:${value}`);
    } else if (ai === '00') out.sscc = value;
    else if (ai === '10') out.lot = value;
    else if (ai === '21') out.serial = value;
    else if (ai === '11' || ai === '15' || ai === '17') {
      const d = gs1Date(value, now);
      if (!d) out.errors.push(`DATE_INVALID:${ai}`);
      else if (ai === '11') out.productionDate = d;
      else if (ai === '15') out.bestBeforeDate = d;
      else out.expiryDate = d;
    } else if (ai === '30' || ai === '37') {
      out.count = /^\d+$/.test(value) ? Number(value) : null;
    } else if (/^310\d$/.test(ai)) {
      const dec = Number(ai[3]);
      out.netWeightKg = /^\d{6}$/.test(value) ? Number(value) / 10 ** dec : null;
    }
  }
  return out;
}

/** True when the input looks like a GS1 element string (not a plain EAN / internal code). */
export function looksLikeGs1(input: string): boolean {
  const s = String(input || '').trim().replace(/^\][A-Za-z]\d/, '');
  return /^\(\d{2,4}\)/.test(s) || (/^(01|02)\d{14}/.test(s) && s.length > 16) || s.includes(GS);
}

/** GS1 mod-10 check digit for the digits given (without the check digit). */
export function gs1CheckDigit(body: string): number {
  const digits = body.split('').map(Number).reverse();
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * GTIN-13 from the company's GS1 prefix (7-10 digits, assigned by GS1 Türkiye) and an item
 * reference; returns null when they do not fit 12 digits.
 */
export function generateGtin13(companyPrefix: string, itemReference: number): string | null {
  const prefix = String(companyPrefix || '').trim();
  if (!/^\d{6,11}$/.test(prefix)) return null;
  const refLen = 12 - prefix.length;
  if (itemReference < 0 || String(itemReference).length > refLen) return null;
  const body = prefix + String(itemReference).padStart(refLen, '0');
  return body + gs1CheckDigit(body);
}

/**
 * GS1 prefixes reserved for restricted circulation (GS1 GenSpecs 1.4.4): 02, 04 and 20-29
 * (in-store / variable measure). Such GTINs are not globally unique and must not be used
 * on traded items shipped to other companies. Returns the prefix found, else null.
 */
export function restrictedGs1Prefix(gtin: string | null | undefined): string | null {
  const v = String(gtin || '').trim();
  if (!/^\d{8,14}$/.test(v)) return null;
  const g13 = v.length === 14 ? v.slice(1) : v.padStart(13, '0');
  if (v.length === 14 && v[0] !== '0') return null;
  const p2 = g13.slice(0, 2);
  if (p2 === '02' || p2 === '04' || (Number(p2) >= 20 && Number(p2) <= 29)) return p2;
  return null;
}
