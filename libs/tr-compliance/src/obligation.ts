/**
 * e-Belge obligation engine (509 Sıra No.lu VUK Genel Tebliği, as amended).
 *
 * Pure: every amount / date that changes over time (turnover thresholds,
 * "all invoices electronic" dates, paper-invoice limits, transition periods)
 * comes in through `ObligationParams`, which the backend builds from the
 * versioned `legal_parameters` table. Nothing legal is hard-coded here.
 */
import { BookkeepingType } from './fiscal';
import { addDays, daysBetween, endOfMonth, firstDayAfterMonths, isDateKey, withDayOfMonth } from './time';

export type EDocKind = 'eFatura' | 'eArsiv' | 'eIrsaliye';
export type CorporateEventType = 'MERGER' | 'DEMERGER' | 'TRANSFER' | 'CONVERSION';
export const CORPORATE_EVENT_TYPES: CorporateEventType[] = ['MERGER', 'DEMERGER', 'TRANSFER', 'CONVERSION'];

/** Sector flags (509 IV.1.4 / IV.3.5). Codes only; start rules come from parameters. */
export const EFATURA_SECTOR_FLAGS = [
  'ECOMMERCE_INTERMEDIARY', // aracı hizmet sağlayıcı / internet satışları
  'ECOMMERCE_SELLER',
  'HAL_TRADER', // 5957 s.K. hal kayıt sistemi
  'FUEL_LICENSE', // EPDK lisansı
  'MOTOR_VEHICLE_TRADE',
  'TOBACCO_ALCOHOL', // TAPDK
  'IMPORTER_ITS',
  'HOTEL_ACCOMMODATION',
  'GOVERNMENT_SUPPLIER',
] as const;
export const EIRSALIYE_SECTOR_FLAGS = [
  'SUGAR_PRODUCER',
  'IRON_STEEL',
  'MINERAL_OIL_LICENSE',
  'FERTILIZER',
  'FOOD_WHOLESALE', // İç Ticaret / gıda toptan
  'FURNITURE_MANUFACTURER',
  'MINING_LICENSE',
  'ALCOHOL_TOBACCO_PRODUCER',
  'PHARMA_ITS',
  'MEDICAL_DEVICE_UTS',
] as const;

export interface GrossSalesEntry {
  year: number;
  amount: number;
}

export interface SectorFlag {
  code: string;
  /** YYYY-MM-DD: date the activity / licence started. */
  since: string;
}

export interface CorporateEvent {
  type: CorporateEventType | string;
  /** YYYY-MM-DD */
  date: string;
  /** True when the merged / transferred party was already obliged to use e-documents. */
  counterpartyMandatory?: boolean;
  note?: string | null;
}

export interface EBelgeProfileInput {
  annualGrossSales?: GrossSalesEntry[] | null;
  sectorFlagsEFatura?: SectorFlag[] | null;
  sectorFlagsEIrsaliye?: SectorFlag[] | null;
  /** Actual registration dates (taxpayer already uses the system). */
  eFaturaSince?: string | null;
  eArsivSince?: string | null;
  eIrsaliyeSince?: string | null;
  mandatoryVsVoluntary?: 'MANDATORY' | 'VOLUNTARY' | string | null;
  gibWrittenNoticeDate?: string | null;
  corporateEvents?: CorporateEvent[] | null;
}

export interface ObligationParams {
  /** Gross-sales threshold that applies to revenue earned in `year` (null = unknown). */
  eFaturaThreshold: (year: number) => number | null;
  eIrsaliyeThreshold: (year: number) => number | null;
  /** Date from which every invoice must be e-Fatura / e-Arşiv, per bookkeeping type. */
  allInvoicesElectronicFrom: Partial<Record<BookkeepingType, string | null>>;
  /** Paper invoices allowed up to this amount (incl. taxes) until `until`, for taxpayers not yet obliged. */
  paperInvoiceLimit?: { amount: number; until: string | null } | null;
  /** Month-day when threshold-based obligations start in the year after the revenue year, e.g. '07-01'. */
  thresholdStartMonthDay: string;
  /** Months granted after a sector licence / corporate event (start = first day of month + N). */
  transitionMonths: number;
  /** Day of the start month until which late e-Fatura / e-Arşiv issuance is tolerated (509 VIII). */
  toleranceDayEFatura: number;
  /** Days before the start date when the obligation is flagged as "upcoming". */
  warnDays?: number;
}

export type ObligationStatus = 'not_required' | 'upcoming' | 'mandatory' | 'overdue' | 'active' | 'voluntary';

export interface ObligationResult {
  kind: EDocKind;
  status: ObligationStatus;
  /** Date the obligation starts (null = not obliged on the known data). */
  mandatoryFrom: string | null;
  /** Rule that triggered the obligation: THRESHOLD:<year>, SECTOR:<code>, EVENT:<type>, BOOKKEEPING:<type>, EFATURA. */
  reason: string | null;
  /** Days from today to `mandatoryFrom` (negative = already started). */
  daysLeft: number | null;
  /** Last day of the 509 VIII transition tolerance window. */
  toleranceUntil: string | null;
  /** Taxpayer's declared start date of actual use. */
  activeSince: string | null;
}

export interface ObligationReport {
  today: string;
  bookkeepingType: BookkeepingType | null;
  eFatura: ObligationResult;
  eArsiv: ObligationResult;
  eIrsaliye: ObligationResult;
  paperInvoice: { allowed: boolean; until: string | null; limit: number | null };
  warnings: string[];
}

interface Candidate {
  date: string;
  reason: string;
}

const earliest = (list: Candidate[]): Candidate | null =>
  list.filter((c) => isDateKey(c.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] ?? null;

function thresholdCandidates(sales: GrossSalesEntry[], threshold: (y: number) => number | null, monthDay: string, warnings: string[], kind: string): Candidate[] {
  const out: Candidate[] = [];
  for (const s of sales) {
    const limit = threshold(s.year);
    if (limit === null) {
      warnings.push(`THRESHOLD_PARAM_MISSING:${kind}:${s.year}`);
      continue;
    }
    if (Number(s.amount) >= limit) out.push({ date: `${s.year + 1}-${monthDay}`, reason: `THRESHOLD:${s.year}` });
  }
  return out;
}

function sectorCandidates(flags: SectorFlag[], months: number): Candidate[] {
  return flags.filter((f) => isDateKey(f.since)).map((f) => ({ date: firstDayAfterMonths(f.since, months), reason: `SECTOR:${f.code}` }));
}

function eventCandidates(events: CorporateEvent[], months: number): Candidate[] {
  return events
    .filter((e) => e.counterpartyMandatory && isDateKey(e.date))
    .map((e) => ({ date: firstDayAfterMonths(e.date, months), reason: `EVENT:${e.type}` }));
}

function result(kind: EDocKind, c: Candidate | null, activeSince: string | null | undefined, today: string, p: ObligationParams): ObligationResult {
  const active = isDateKey(activeSince) && activeSince <= today ? activeSince : null;
  const mandatoryFrom = c?.date ?? null;
  const warn = p.warnDays ?? 90;
  let status: ObligationStatus;
  if (active) status = mandatoryFrom ? 'active' : 'voluntary';
  else if (!mandatoryFrom) status = 'not_required';
  else if (mandatoryFrom <= today) status = 'overdue';
  else status = daysBetween(today, mandatoryFrom) <= warn ? 'upcoming' : 'mandatory';
  const toleranceUntil = mandatoryFrom
    ? kind === 'eIrsaliye'
      ? endOfMonth(mandatoryFrom)
      : withDayOfMonth(mandatoryFrom, p.toleranceDayEFatura)
    : null;
  return {
    kind,
    status,
    mandatoryFrom,
    reason: c?.reason ?? null,
    daysLeft: mandatoryFrom ? daysBetween(today, mandatoryFrom) : null,
    toleranceUntil,
    activeSince: isDateKey(activeSince) ? activeSince : null,
  };
}

/**
 * Computes e-Fatura / e-Arşiv / e-İrsaliye start dates and whether paper
 * invoices are still allowed, for the company's profile and bookkeeping type.
 */
export function computeObligations(
  profile: EBelgeProfileInput | null | undefined,
  bookkeepingType: BookkeepingType | string | null | undefined,
  today: string,
  params: ObligationParams,
): ObligationReport {
  const warnings: string[] = [];
  const prof = profile || {};
  const sales = (prof.annualGrossSales || []).filter((s) => Number.isInteger(s.year) && Number.isFinite(Number(s.amount)));
  const bk = (['BILANCO', 'ISLETME', 'BASIT'] as string[]).includes(String(bookkeepingType)) ? (bookkeepingType as BookkeepingType) : null;
  if (!bk) warnings.push('BOOKKEEPING_TYPE_MISSING');
  const lastYear = Number(today.slice(0, 4)) - 1;
  if (!sales.some((s) => s.year === lastYear)) warnings.push(`GROSS_SALES_MISSING:${lastYear}`);

  const events = eventCandidates(prof.corporateEvents || [], params.transitionMonths);

  // e-Fatura
  const eFaturaC = earliest([
    ...thresholdCandidates(sales, params.eFaturaThreshold, params.thresholdStartMonthDay, warnings, 'EFATURA'),
    ...sectorCandidates(prof.sectorFlagsEFatura || [], params.transitionMonths),
    ...events,
  ]);

  // e-Arşiv: obliged together with e-Fatura, and for every invoice from the bookkeeping-type date.
  const allFrom = bk ? params.allInvoicesElectronicFrom[bk] ?? null : null;
  const eArsivC = earliest([
    ...(eFaturaC ? [{ date: eFaturaC.date, reason: 'EFATURA' }] : []),
    ...(allFrom ? [{ date: allFrom, reason: `BOOKKEEPING:${bk}` }] : []),
  ]);

  // e-İrsaliye
  const eIrsaliyeC = earliest([
    ...thresholdCandidates(sales, params.eIrsaliyeThreshold, params.thresholdStartMonthDay, warnings, 'EIRSALIYE'),
    ...sectorCandidates(prof.sectorFlagsEIrsaliye || [], params.transitionMonths),
    ...events,
  ]);

  const eFatura = result('eFatura', eFaturaC, prof.eFaturaSince, today, params);
  const eArsiv = result('eArsiv', eArsivC, prof.eArsivSince, today, params);
  const eIrsaliye = result('eIrsaliye', eIrsaliyeC, prof.eIrsaliyeSince, today, params);

  // Paper invoices: only while no e-invoice obligation has started (and within the limit window).
  const electronicFrom = earliest([...(eFaturaC ? [eFaturaC] : []), ...(eArsivC ? [eArsivC] : [])]);
  const limit = params.paperInvoiceLimit ?? null;
  const ends = [electronicFrom ? addDays(electronicFrom.date, -1) : null, limit?.until ?? null].filter((x): x is string => !!x).sort();
  const until = ends[0] ?? null;
  const allowed = !eFatura.activeSince && !eArsiv.activeSince && (!until || today <= until);
  return {
    today,
    bookkeepingType: bk,
    eFatura,
    eArsiv,
    eIrsaliye,
    paperInvoice: { allowed, until: allowed ? until : null, limit: allowed ? limit?.amount ?? null : null },
    warnings,
  };
}
