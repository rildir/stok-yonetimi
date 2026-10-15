/**
 * WP6 shared definitions (backend + frontend): costing methods, fiscal periods, stock-count
 * types, disposal bases, landed-cost types, food expiry rules and Tekdüzen Hesap Planı stock
 * accounts. Legal values whose source is not settled live in `legal_parameters`.
 */
import { endOfMonth } from './time';

// ─── Costing (VUK 274, 262; TTK 66/4; TMS 2 / BOBİ) ───

/** LIFO is deliberately absent (not accepted by TMS 2 / VUK practice). */
export const COSTING_METHODS = ['WAVG_MOVING', 'WAVG_PERIODIC_QUARTERLY', 'WAVG_PERIODIC_YEARLY', 'FIFO', 'SPECIFIC_LOT'] as const;
export type CostingMethod = (typeof COSTING_METHODS)[number];

export function isCostingMethod(v: unknown): v is CostingMethod {
  return typeof v === 'string' && (COSTING_METHODS as readonly string[]).includes(v);
}

/** Exchange differences arising after the goods were received: financial expense / income (default) or added to cost. */
export const POST_RECEIPT_FX_POLICIES = ['EXPENSE', 'COST'] as const;
export type PostReceiptFxPolicy = (typeof POST_RECEIPT_FX_POLICIES)[number];

/** VUK 262 cost elements that may be allocated to received goods. */
export const LANDED_COST_TYPES = [
  'NAKLIYE',
  'GUMRUK',
  'SIGORTA',
  'DEPOLAMA',
  'KOMISYON',
  'HARC',
  'KUR_FARKI_GIRIS_ONCESI',
  'FAIZ_GIRIS_ONCESI',
  /** Only when postReceiptFxPolicy = COST */
  'KUR_FARKI_GIRIS_SONRASI',
] as const;
export type LandedCostType = (typeof LANDED_COST_TYPES)[number];
export const LANDED_COST_BASES = ['AMOUNT', 'QUANTITY'] as const;

// ─── Fiscal periods (VUK 174; geçici vergi: 4 çeyrek) ───

export const PERIOD_TYPES = ['YEAR', 'QUARTER'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export interface PeriodRange {
  periodType: PeriodType;
  fiscalYear: number;
  /** 0 for the year, 1-4 for quarters */
  quarter: number;
  startDate: string;
  endDate: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Year + four quarters of the fiscal year `fiscalYear` starting in `startMonth` (1-12). */
export function fiscalYearPeriods(fiscalYear: number, startMonth = 1): PeriodRange[] {
  const sm = Math.min(12, Math.max(1, Math.floor(startMonth) || 1));
  const monthKey = (offset: number) => {
    const m0 = sm - 1 + offset;
    const y = fiscalYear + Math.floor(m0 / 12);
    return `${y}-${pad((m0 % 12) + 1)}-01`;
  };
  const start = monthKey(0);
  const end = endOfMonth(monthKey(11));
  const out: PeriodRange[] = [{ periodType: 'YEAR', fiscalYear, quarter: 0, startDate: start, endDate: end }];
  for (let q = 0; q < 4; q++) {
    out.push({ periodType: 'QUARTER', fiscalYear, quarter: q + 1, startDate: monthKey(q * 3), endDate: endOfMonth(monthKey(q * 3 + 2)) });
  }
  return out;
}

/** Fiscal year a calendar day belongs to (named after the calendar year it starts in). */
export function fiscalYearOf(day: string, startMonth = 1): number {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  return m >= (startMonth || 1) ? y : y - 1;
}

// ─── Stock counts / inventory (VUK 185-190; TTK 64/3, 66-67) ───

export const COUNT_TYPES = ['YEAR_END', 'PERIODIC', 'CYCLE', 'SAMPLING'] as const;
export type CountType = (typeof COUNT_TYPES)[number];

export const PHYSICAL_COUNT_POLICIES = ['ANNUAL', 'TRIENNIAL_VUK190', 'FIXED_VALUE_TTK66_3'] as const;
export type PhysicalCountPolicy = (typeof PHYSICAL_COUNT_POLICIES)[number];

/** Tekdüzen Hesap Planı stock accounts per inventory class. */
export const INVENTORY_CLASS_ACCOUNTS: Record<string, string> = {
  ILK_MADDE_150: '150',
  YARI_MAMUL_151: '151',
  MAMUL_152: '152',
  TICARI_MAL_153: '153',
  DIGER_157: '157',
};

/** Envanter defteri stok icmali rows: the 15x classes and the 158 provision on its own line. */
export const INVENTORY_SUMMARY_ACCOUNTS = ['150', '151', '152', '153', '157', '158'] as const;

// ─── Wastage / disposal (VUK 186, 278, 278/A; KDVK 30/c) ───

export const DISPOSAL_BASES = ['TAKDIR_KOMISYONU', 'VUK278A_IMHA_ORANI', 'RESMI_KURUM'] as const;
export type DisposalBasis = (typeof DISPOSAL_BASES)[number];
export const DISPOSAL_STATUSES = ['REQUESTED', 'APPLIED', 'DECIDED', 'DESTROYED', 'CANCELLED'] as const;
export type DisposalStatus = (typeof DISPOSAL_STATUSES)[number];
/** Allowed status transitions of a disposal batch (talep -> başvuru -> karar -> imha edildi). */
export const DISPOSAL_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['APPLIED', 'DECIDED', 'CANCELLED'],
  APPLIED: ['DECIDED', 'CANCELLED'],
  DECIDED: ['DESTROYED', 'CANCELLED'],
  DESTROYED: [],
  CANCELLED: [],
};

/** Exit reasons whose deducted input VAT must be corrected (KDVK 30/c) unless caused by a disaster. */
export const VAT_CORRECTION_REASONS = ['LOSS_ZAYI', 'THEFT_LOSS', 'EXPIRED_DESTROYED', 'DESTRUCTION_IMHA'] as const;
/**
 * Code default of the exits taxed as a deemed supply at the emsal value (KDVK 3/a, 27): withdrawal
 * from the business (owner's personal use, use in exempt / non-taxable activities), gifts / samples
 * and goods given to personnel free of charge. Use inside the taxable business (INTERNAL_USE) is not
 * a supply. The effective list is the legal parameter VAT_DEEMED_SUPPLY_REASONS.
 */
export const VAT_DEEMED_SUPPLY_REASONS = ['WITHDRAWAL', 'GIFT_SAMPLE', 'PERSONNEL'] as const;

// ─── Food (Tebliğ 2026/11; Gıda Etiketleme Yön.) ───

export const EXPIRY_TYPES = ['use_by', 'best_before'] as const;
export type ExpiryType = (typeof EXPIRY_TYPES)[number];
export const EXPIRY_PRECISIONS = ['day', 'month', 'year'] as const;
export type ExpiryPrecision = (typeof EXPIRY_PRECISIONS)[number];
export const LOT_STATUSES = ['active', 'blocked', 'recalled'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];
export const LOT_SOURCES = ['PURCHASE', 'PRODUCTION', 'OPENING', 'RETURN', 'TRANSFER', 'COUNT'] as const;
export const BEST_BEFORE_POLICIES = ['BLOCK', 'ALLOW'] as const;

/**
 * Expiry entered with month / year precision means the last day of that month / year
 * ("... sonuna kadar tüketilmelidir"). Accepts YYYY-MM-DD, YYYY-MM or YYYY.
 */
export function normalizeExpiryDate(value: string | null | undefined, precision: string | null | undefined = 'day'): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (precision === 'year') {
    const y = v.slice(0, 4);
    return /^\d{4}$/.test(y) ? `${y}-12-31` : null;
  }
  if (precision === 'month') {
    const ym = v.slice(0, 7);
    return /^\d{4}-\d{2}$/.test(ym) ? endOfMonth(`${ym}-01`) : null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : null;
}

/** Effective expiry type: food without an explicit type is treated as use-by (STT). */
export function effectiveExpiryType(p: { expiryType?: string | null; regulatoryCategory?: string | null }): ExpiryType | null {
  if (p.expiryType === 'use_by' || p.expiryType === 'best_before') return p.expiryType;
  return p.regulatoryCategory === 'food' ? 'use_by' : null;
}

/**
 * Lot number template hint (warning only): food lot numbers are recommended to start with
 * "L" (lot) or "P" (parti). Returns a warning code or null.
 */
export function lotNumberWarning(lotNumber: string | null | undefined, regulatoryCategory: string | null | undefined): string | null {
  if (regulatoryCategory !== 'food') return null;
  const v = String(lotNumber || '').trim();
  if (!v) return null;
  return /^[LP]/i.test(v) ? null : 'LOT_PREFIX_RECOMMENDED';
}

// ─── Accounting events (journal export) ───

export const ACCOUNTING_EVENTS = [
  'PURCHASE',
  'SALE_COGS',
  'SALES_RETURN',
  'PURCHASE_RETURN',
  'COUNT_SURPLUS',
  'COUNT_SHORTAGE',
  'TESELLUM_SURPLUS',
  'TESELLUM_SHORTAGE',
  'WASTAGE_NORMAL',
  'LOSS',
  'DISASTER_LOSS',
  'SCRAP',
  'INTERNAL_USE',
  'GIFT_SAMPLE',
  'OPENING',
  'CORRECTION_IN',
  'CORRECTION_OUT',
  'LANDED_COST',
  'LANDED_COST_COGS',
  'IMPAIRMENT',
] as const;
export type AccountingEvent = (typeof ACCOUNTING_EVENTS)[number];
