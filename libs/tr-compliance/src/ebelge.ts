/**
 * e-Belge (WP5): UBL-TR scenarios, routing and deadlines shared by backend and frontend.
 *
 * Values that are not settled law (cancellation window, response periods) are NOT defined here:
 * they live in `legal_parameters` (EARSIV_CANCEL_DAYS, EIRSALIYE_RESPONSE_DAYS,
 * TICARI_RESPONSE_DAYS ...) with a sourceRef and are passed in by the caller.
 */
import { addDays, dateKeyInZone, zonedDayEnd } from './time';

/** UBL-TR CustomizationID per document type (UBL-TR 1.2.1 package; 509 V.2). */
export const UBL_CUSTOMIZATION_ID = {
  Invoice: 'TR1.2',
  ApplicationResponse: 'TR1.2',
  DespatchAdvice: 'TR1.2.1',
  ReceiptAdvice: 'TR1.2.1',
} as const;

/** Invoice scenarios supported by the application (UBL-TR Kod Listeleri §1.4). Others raise PROFILE_NOT_SUPPORTED. */
export const SUPPORTED_INVOICE_PROFILES = ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA', 'IHRACAT'] as const;
export type InvoiceProfile = (typeof SUPPORTED_INVOICE_PROFILES)[number];

/** Invoice type codes the builder supports (UBL-TR Kod Listeleri §2.2). */
export const SUPPORTED_INVOICE_TYPES = ['SATIS', 'IADE', 'ISTISNA', 'TEVKIFAT', 'TEVKIFATIADE', 'IHRACKAYITLI'] as const;

/** Types that may not travel in a TICARIFATURA envelope (GİB schematron: IADE only in TEMEL / EARSIV ...). */
export const TEMEL_ONLY_INVOICE_TYPES = ['IADE', 'TEVKIFATIADE'];

/** e-Belge document kinds handled by the provider layer. */
export const EDOC_TYPES = ['INVOICE', 'EARCHIVE', 'DESPATCH', 'RECEIPT_ADVICE', 'APPLICATION_RESPONSE'] as const;
export type EDocType = (typeof EDOC_TYPES)[number];

export const EDOC_DIRECTIONS = ['OUT', 'IN'] as const;

/** Outbox item life cycle (idempotency key: ETTN + operation). */
export const OUTBOX_STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD'] as const;

/** Incoming document life cycle. */
export const INCOMING_STATUSES = ['RECEIVED', 'ACCEPTED', 'REJECTED', 'PARTIALLY_ACCEPTED', 'AUTO_ACCEPTED', 'INFO'] as const;
export const INCOMING_MATCH_STATUSES = ['UNMATCHED', 'SUPPLIER', 'ORDER', 'RECEIPT', 'INVOICE'] as const;

/** Application response codes (TICARIFATURA, UBL-TR Uygulama Yanıtı). */
export const APP_RESPONSE_CODES = ['KABUL', 'RED'] as const;
export type AppResponseCode = (typeof APP_RESPONSE_CODES)[number];

/** e-Fatura cancellation / objection channels (TTK 18/3; e-Fatura iptal / itiraz). */
export const NOTICE_CHANNELS = ['KEP', 'NOTER', 'TAAHHUTLU_MEKTUP', 'TELGRAF', 'GIB_PORTAL', 'PROVIDER'] as const;
export const NOTICE_KINDS = ['CANCEL', 'OBJECTION'] as const;

/** e-Arşiv delivery channels (509 V.5.2: electronic or paper). */
export const EARSIV_DELIVERY_CHANNELS = ['EMAIL', 'SMS', 'PAPER', 'PORTAL'] as const;

export const EBELGE_ENVIRONMENTS = ['TEST', 'LIVE'] as const;

export interface ProfileRouteInput {
  /** SALES invoices to customers, RETURN invoices to suppliers */
  kind?: string | null;
  typeCode: string;
  /** Receiver is a registered e-Fatura user (GİB registry, checked right before sending) */
  buyerRegistered: boolean;
  /** Customer preference for registered receivers (TEMELFATURA | TICARIFATURA) */
  preferredProfile?: string | null;
  /** Export delivery (foreign buyer, 701-704 / customs) */
  isExport?: boolean;
  /** Export scenario switched on in the e-Belge settings (builder branch behind a flag) */
  exportEnabled?: boolean;
}

/**
 * 509 IV.1.1, IV.2.4.4: invoices to registered e-Fatura users are e-Fatura (TEMEL or TICARI), all
 * others e-Arşiv; exports travel as IHRACAT. Returns null when the scenario is not supported.
 */
export function routeInvoiceProfile(input: ProfileRouteInput): InvoiceProfile | null {
  if (!(SUPPORTED_INVOICE_TYPES as readonly string[]).includes(input.typeCode)) return null;
  if (input.isExport) return input.exportEnabled ? 'IHRACAT' : null;
  if (!input.buyerRegistered) return 'EARSIVFATURA';
  if (input.preferredProfile === 'TICARIFATURA' && !TEMEL_ONLY_INVOICE_TYPES.includes(input.typeCode)) return 'TICARIFATURA';
  return 'TEMELFATURA';
}

/** e-Fatura (sent through GİB to a registered receiver) vs e-Arşiv (sent to GİB as a report, delivered by the issuer). */
export function invoiceEDocType(profileId: string | null | undefined): EDocType {
  return profileId === 'EARSIVFATURA' ? 'EARCHIVE' : 'INVOICE';
}

/**
 * 509 V.5.3: every despatch advice is an e-İrsaliye; only the delivery channel to the receiver
 * changes (registered: through GİB; otherwise e-mail or a printout that travels with the goods).
 */
export function despatchDeliveryChannel(receiverRegistered: boolean, receiverEmail?: string | null): 'GIB' | 'EMAIL' | 'PRINT' {
  if (receiverRegistered) return 'GIB';
  return receiverEmail ? 'EMAIL' : 'PRINT';
}

export interface WindowStatus {
  /** Exclusive end of the window (UTC instant) */
  deadline: Date;
  /** Last day of the window (company time zone) */
  lastDay: string;
  open: boolean;
  /** Whole calendar days left including today (0 = last day today, < 0 expired) */
  daysLeft: number;
}

/**
 * Window of `days` calendar days that starts on the day of `from` (company time zone) and ends
 * at the end of day from + days. Used for the e-Arşiv cancellation window (from the delivery to
 * the receiver), the e-İrsaliye response (from the actual despatch) and the TICARIFATURA response
 * (TTK 21/2, from receipt).
 */
export function dayWindow(from: Date | string, days: number, now: Date = new Date(), tz?: string): WindowStatus {
  const start = typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : dateKeyInZone(new Date(from), tz);
  const lastDay = addDays(start, days);
  const deadline = zonedDayEnd(lastDay, tz);
  const today = dateKeyInZone(now, tz);
  const daysLeft = Math.round((Date.UTC(+lastDay.slice(0, 4), +lastDay.slice(5, 7) - 1, +lastDay.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86400000);
  return { deadline, lastDay, open: now.getTime() < deadline.getTime(), daysLeft };
}

/** Retention of e-documents and their archive copies: 31 December of (issue year + years) (TTK 82, VUK 253). */
export function retentionUntil(issueDate: string, years = 10): string {
  const y = Number(String(issueDate).slice(0, 4)) || new Date().getUTCFullYear();
  return `${y + years}-12-31`;
}

/** Exponential back-off for the outbox (attempt 1 -> 1 min, 2 -> 2 min, 3 -> 4 min ... capped at 6 h). */
export function outboxBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(6 * 3600_000, 60_000 * 2 ** (n - 1));
}

/**
 * Three-business-day notice to GİB after loss / integrity breach of e-documents (509 VI; VUK 13).
 * Weekends and the given public holidays (YYYY-MM-DD, e.g. legal parameter TCMB_NO_BULLETIN_DAYS:
 * full-day weekday holidays of Law 2429) are not business days.
 */
export function addBusinessDays(day: string, n: number, holidays: readonly string[] = []): string {
  const off = new Set(holidays);
  let d = day;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !off.has(d)) left--;
  }
  return d;
}
