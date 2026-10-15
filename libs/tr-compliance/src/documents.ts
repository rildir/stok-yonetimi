/**
 * Document regime (WP4, VUK 229-235; 509 Sıra No.lu VUK GT): numbering formats, state
 * machines, deadlines and small pure rules shared by backend and frontend.
 *
 * Values that are not settled law (forbidden series, deadline lengths that a financial
 * advisor must confirm) are NOT defined here: they live in `legal_parameters`
 * (DOCUMENT_SERIES_FORBIDDEN, INVOICE_DEADLINE_DAYS, WITHDRAWAL_* ...) with a sourceRef.
 */
import { addDays, daysBetween } from './time';
import { roundQty } from './inventory';

// ─── Kinds, numbering modes, series ───

export const DOCUMENT_KINDS = ['INVOICE', 'DESPATCH', 'EXPENSE_VOUCHER', 'PRODUCER_RECEIPT', 'GOODS_RECEIPT', 'RETURN'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** EDOCUMENT: 3 chars + year + 9 digits (509 V.4). PAPER: printed (matbu) series-sequence. INTERNAL: in-house records. */
export const NUMBERING_MODES = ['EDOCUMENT', 'PAPER', 'INTERNAL'] as const;
export type NumberingMode = (typeof NUMBERING_MODES)[number];

/** Kinds that are legal documents (numbered with EDOCUMENT / PAPER series); the others are internal records. */
export const LEGAL_DOCUMENT_KINDS: DocumentKind[] = ['INVOICE', 'DESPATCH', 'EXPENSE_VOUCHER', 'PRODUCER_RECEIPT'];

/** e-Belge series: exactly 3 characters A-Z / 0-9 (509 V.4; UBL-TR cbc:ID). */
export function isValidEDocSeries(code: unknown): boolean {
  return typeof code === 'string' && /^[A-Z0-9]{3}$/.test(code);
}

/** Printed (matbu) series: 1-3 letters as printed by the licensed printer (VUK 231/1 seri-sıra). */
export function isValidPaperSeries(code: unknown): boolean {
  return typeof code === 'string' && /^[A-Z]{1,3}$/.test(code);
}

/** Internal record prefixes (MKB, IAD...): 2-3 characters. */
export function isValidInternalSeries(code: unknown): boolean {
  return typeof code === 'string' && /^[A-Z0-9]{2,3}$/.test(code);
}

export function isValidSeriesFor(mode: NumberingMode | string, code: unknown): boolean {
  if (mode === 'EDOCUMENT') return isValidEDocSeries(code);
  if (mode === 'PAPER') return isValidPaperSeries(code);
  return isValidInternalSeries(code);
}

/** ABC2026000000001: series (3) + year (4) + sequence (9), 16 characters (509 V.4). */
export function formatEDocNumber(series: string, year: number, n: number): string {
  return `${series}${year}${String(n).padStart(9, '0')}`;
}

export function parseEDocNumber(no: unknown): { series: string; year: number; sequence: number } | null {
  const m = typeof no === 'string' ? /^([A-Z0-9]{3})(\d{4})(\d{9})$/.exec(no) : null;
  return m ? { series: m[1], year: +m[2], sequence: +m[3] } : null;
}

/** A 000123 style printed number (series and 6-digit sequence). */
export function formatPaperNumber(series: string, n: number): string {
  return `${series}-${String(n).padStart(6, '0')}`;
}

/** MKB-2026-000001 style internal number. */
export function formatInternalNumber(series: string, year: number, n: number): string {
  return `${series}-${year}-${String(n).padStart(6, '0')}`;
}

/** Number format used by a sequence row (PAPER sequences do not restart every year: year 0). */
export function formatDocumentNumber(mode: NumberingMode | string, series: string, year: number, n: number): string {
  if (mode === 'EDOCUMENT') return formatEDocNumber(series, year, n);
  if (mode === 'PAPER') return formatPaperNumber(series, n);
  return formatInternalNumber(series, year, n);
}

/** Free-form external / printed numbers entered by the user: printable, no spaces at the ends. */
export function isValidExternalDocNo(no: unknown): boolean {
  return typeof no === 'string' && no === no.trim() && /^[A-Za-z0-9][A-Za-z0-9/\-. ]{0,49}$/.test(no);
}

// ─── State machines ───

export type Transitions = Record<string, readonly string[]>;

/**
 * Despatch advice (e-İrsaliye Kılavuzu §14): no cancellation. DRAFT -> APPROVED (numbered, stock
 * moves) -> HANDED_TO_PROVIDER -> GIB_ACCEPTED / REJECTED / PARTIALLY_ACCEPTED (receipt advice).
 * Paper despatches stay APPROVED. A draft may be deleted.
 */
export const DESPATCH_TRANSITIONS: Transitions = {
  DRAFT: ['APPROVED'],
  APPROVED: ['HANDED_TO_PROVIDER'],
  HANDED_TO_PROVIDER: ['GIB_ACCEPTED', 'REJECTED', 'PARTIALLY_ACCEPTED'],
  GIB_ACCEPTED: [],
  REJECTED: [],
  PARTIALLY_ACCEPTED: [],
};
export const DESPATCH_STATUSES = Object.keys(DESPATCH_TRANSITIONS);

/**
 * Invoice: DRAFT -> ISSUED (numbered, frozen) -> QUEUED -> SENT -> DELIVERED / ACCEPTED / REJECTED.
 * CANCELLED from ISSUED (paper / external) and from the provider states (e-Arşiv 8-day rule and
 * e-Fatura cancellation are enforced by the provider layer, WP5). Objection is a separate flag.
 */
export const INVOICE_TRANSITIONS: Transitions = {
  DRAFT: ['ISSUED'],
  ISSUED: ['QUEUED', 'CANCELLED'],
  QUEUED: ['SENT', 'ISSUED'],
  SENT: ['DELIVERED', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
  DELIVERED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};
export const INVOICE_STATUSES = Object.keys(INVOICE_TRANSITIONS);

export const RETURN_TRANSITIONS: Transitions = { DRAFT: ['COMPLETED'], COMPLETED: [] };
export const GOODS_RECEIPT_TRANSITIONS: Transitions = { DRAFT: ['COMPLETED'], COMPLETED: [] };
export const EXPENSE_VOUCHER_TRANSITIONS: Transitions = { DRAFT: ['ISSUED'], ISSUED: ['CANCELLED'], CANCELLED: [] };

export function canTransition(machine: Transitions, from: string, to: string): boolean {
  return (machine[from] || []).includes(to);
}

/** Statuses after which a document's legal content is frozen (DB triggers enforce it too). */
export function isFrozenStatus(machine: Transitions, status: string): boolean {
  return status !== 'DRAFT' && status in machine;
}

// ─── Despatch ───

export const DESPATCH_PURPOSES = ['SALE', 'TRANSFER', 'CONSIGNMENT', 'REPAIR', 'SAMPLE', 'SUBCONTRACT', 'RETURN', 'PURCHASE_PICKUP'] as const;
export type DespatchPurpose = (typeof DESPATCH_PURPOSES)[number];
/** Purposes that move own goods to a third-party / other location without a sale (target warehouse required). */
export const DESPATCH_TRANSFER_PURPOSES: DespatchPurpose[] = ['TRANSFER', 'CONSIGNMENT', 'REPAIR', 'SUBCONTRACT'];

/** SEVK: normal; MATBUDAN: e-İrsaliye recording a paper despatch issued during an outage (e-İrsaliye Kılavuzu §11-12). */
export const DESPATCH_TYPE_CODES = ['SEVK', 'MATBUDAN'] as const;

/** 509 V.7 (a)-(ç): why a paper document was issued instead of an electronic one. */
export const PAPER_REASONS = ['A', 'B', 'C', 'Ç'] as const;
export type PaperReason = (typeof PAPER_REASONS)[number];

export const DELIVERY_CHANNELS = ['GIB', 'EMAIL', 'PRINT'] as const;

/** Turkish licence plate: 01-81, 1-3 letters, 2-4 digits (spaces optional). */
export function normalizePlate(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
}
export function isValidTrPlate(v: unknown): boolean {
  const s = normalizePlate(v).replace(/ /g, '');
  const m = /^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,4})$/.exec(s);
  return !!m && +m[1] >= 1 && +m[1] <= 81;
}

export interface WarehouseSite {
  id: string;
  siteGroup?: string | null;
  type?: string | null;
  address?: { line1?: string | null; districtId?: number | null; provinceCode?: string | null; postalCode?: string | null } | null;
}

/**
 * VUK 230/5: goods moved between premises (depots, branches) travel with a despatch advice.
 * Not needed when both warehouses share a site group, or when they have the same street
 * address in the same district (same premises).
 */
export function transferNeedsDespatch(from: WarehouseSite, to: WarehouseSite, country = 'TR'): boolean {
  if ((country || 'TR').toUpperCase() !== 'TR') return false;
  if (from.id === to.id) return false;
  const g1 = (from.siteGroup || '').trim().toUpperCase();
  const g2 = (to.siteGroup || '').trim().toUpperCase();
  if (g1 && g1 === g2) return false;
  const norm = (s?: string | null) => String(s || '').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim();
  const a = from.address || {};
  const b = to.address || {};
  if (norm(a.line1) && norm(a.line1) === norm(b.line1) && (a.districtId ?? null) === (b.districtId ?? null)) return false;
  return true;
}

// ─── Deadlines ───

export type DeadlineLevel = 'ok' | 'warning' | 'critical';

/**
 * VUK 231/5: the invoice is issued within `limitDays` (7) of delivery; warning from `warnDays`.
 * `days` counts calendar days since the delivery day; `daysLeft` < 0 once overdue.
 */
export function invoiceDeadlineStatus(deliveryDay: string, today: string, limitDays = 7, warnDays = 5): { days: number; daysLeft: number; level: DeadlineLevel } {
  const days = daysBetween(deliveryDay, today);
  const daysLeft = limitDays - days;
  const level: DeadlineLevel = days >= limitDays ? 'critical' : days >= warnDays ? 'warning' : 'ok';
  return { days, daysLeft, level };
}

/** True when an invoice dated `issueDay` is later than `limitDays` after delivery (needs explicit confirmation). */
export function isLateInvoice(deliveryDay: string | null | undefined, issueDay: string, limitDays = 7): boolean {
  return !!deliveryDay && daysBetween(deliveryDay, issueDay) > limitDays;
}

export interface WithdrawalParams {
  periodDays: number;
  goodsReturnDays: number;
  refundDays: number;
}

/**
 * Distance-sale withdrawal (6502 md. 48; Mesafeli Sözleşmeler Yön.): the consumer may withdraw
 * within `periodDays` of delivery; from the notification the consumer sends the goods back within
 * `goodsReturnDays` and the seller refunds within `refundDays`. Day keys in the company time zone.
 */
export function withdrawalDates(deliveryDay: string, notifiedDay: string | null, p: WithdrawalParams) {
  const withdrawalDeadline = addDays(deliveryDay, p.periodDays);
  return {
    withdrawalDeadline,
    goodsReturnDeadline: notifiedDay ? addDays(notifiedDay, p.goodsReturnDays) : null,
    refundDueDate: notifiedDay ? addDays(notifiedDay, p.refundDays) : null,
    inTime: notifiedDay ? notifiedDay <= withdrawalDeadline : true,
  };
}

/** Quantity that may still be returned for a sold / received line. */
export function returnableQuantity(sold: number, alreadyReturned: number): number {
  return Math.max(0, roundQty(roundQty(sold) - roundQty(alreadyReturned)));
}

/**
 * VUK 232: between merchants an invoice is always required; to a final consumer only above the
 * yearly limit (or on request). Returns REQUIRED / OPTIONAL.
 */
export function invoiceRequirement(buyer: { isFinalConsumer: boolean }, grandTotalTry: number, limit: number): 'REQUIRED' | 'OPTIONAL' {
  if (!buyer.isFinalConsumer) return 'REQUIRED';
  return Number(grandTotalTry) > Number(limit) ? 'REQUIRED' : 'OPTIONAL';
}

// ─── Returns / receipts ───

export const RETURN_TYPES = ['SALES_RETURN', 'PURCHASE_RETURN', 'WITHDRAWAL', 'DEFECT'] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];
export const RETURN_CONDITIONS = ['RESELLABLE', 'DAMAGED', 'DISPOSE'] as const;
/** Bank / PTT receipts replace the expense voucher for consumer refunds (509 IV.2.4.5). */
export const REFUND_CHANNELS = ['BANK_TRANSFER', 'PTT', 'CARD_REVERSAL', 'CASH', 'OFFSET'] as const;
export const DOCUMENTED_REFUND_CHANNELS = ['BANK_TRANSFER', 'PTT', 'CARD_REVERSAL'];
export const REJECT_REASONS = ['DAMAGED', 'WRONG_ITEM', 'EXCESS', 'QUALITY', 'OTHER'] as const;

export const EXPENSE_VOUCHER_KINDS = ['GIDER_PUSULASI', 'MUSTAHSIL_MAKBUZU'] as const;
export const PAYMENT_CHANNELS = ['CASH', 'BANK_TRANSFER', 'PTT', 'CARD', 'OFFSET'] as const;

/** Receipt line split: what enters stock under the supplier's document, the surplus and the shortage (197/397). */
export function receiptSplit(despatchQty: number, countedQty: number, rejectedQty: number) {
  const accepted = Math.max(0, roundQty(roundQty(countedQty) - roundQty(rejectedQty)));
  const base = Math.min(accepted, roundQty(despatchQty));
  return {
    accepted,
    againstDocument: roundQty(base),
    surplus: Math.max(0, roundQty(accepted - roundQty(despatchQty))),
    shortage: Math.max(0, roundQty(roundQty(despatchQty) - roundQty(countedQty))),
  };
}

/** Mandatory wording on outputs that are not invoices / despatch advices (VUK 353/1-2, 7524 s.K.). Always Turkish. */
export const NOT_FISCAL_DOCUMENT_TEXT = 'Mali değeri yoktur, fatura veya irsaliye yerine geçmez.';
/** Wording of an invoice that replaces the despatch advice (509 V.5.1). */
export const REPLACES_DESPATCH_TEXT = 'İrsaliye yerine geçer.';
