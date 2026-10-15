/**
 * Inventory core definitions shared by backend and frontend (WP2):
 * decimal quantities, UN/ECE Rec. 20 unit codes, movement reason codes,
 * warehouse types, regulatory product categories and inventory classes.
 *
 * Values whose legal mapping is not confirmed (e.g. the standard unit -> UN/ECE
 * code map for "pack" / "pallet") are NOT defined here: they live in
 * `legal_parameters` (key UNECE_STANDARD_UNIT_MAP) with a sourceRef.
 */

// ─── Quantities ───

/** Scale of every stored quantity column: DECIMAL(18,4). */
export const QTY_SCALE = 4;
/** Largest number of decimals a unit of measure may allow. */
export const UNIT_MAX_DECIMALS = 3;

/** Rounds to `scale` decimals (half away from zero) and normalises -0 to 0. */
export function roundQty(value: number | string | null | undefined, scale: number = QTY_SCALE): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** scale;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return r === 0 ? 0 : Number(r.toFixed(scale));
}

/** Sum of quantities without binary floating-point drift. */
export function sumQty(values: (number | string | null | undefined)[]): number {
  return roundQty(values.reduce<number>((s, v) => s + roundQty(v), 0));
}

/** a + b at storage precision. */
export function addQty(a: number | string, b: number | string): number {
  return roundQty(roundQty(a) + roundQty(b));
}

/** True when `value` has no more than `decimals` fractional digits. */
export function fitsDecimals(value: number | string, decimals: number): boolean {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  return Math.abs(roundQty(n, Math.max(0, Math.min(decimals, QTY_SCALE))) - n) < 1e-9;
}

/** Number of fractional digits actually used by a quantity (0..4). */
export function usedDecimals(value: number | string): number {
  const s = roundQty(value).toString();
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * Converts a quantity entered in an alternate unit into base units.
 * The result is rounded to the base unit's precision (`baseDecimals`); for
 * integral base units (decimals 0) a fractional result is rejected instead of
 * silently rounded. Returns null when the quantity / factor is invalid.
 */
export function toBaseQuantity(quantity: number, factor: number, baseDecimals = 0): number | null {
  if (!(quantity > 0) || !(factor > 0)) return null;
  const raw = quantity * factor;
  const d = Math.max(0, Math.min(baseDecimals, QTY_SCALE));
  const rounded = roundQty(raw, d);
  if (rounded <= 0) return null;
  if (d === 0 && Math.abs(raw - rounded) > 1e-6) return null;
  return rounded;
}

// ─── Units of measure (UN/ECE Recommendation 20 / 21, UBL-TR Kod Listeleri §1.5) ───

/**
 * Catalogue of UN/ECE unit codes offered in the unit form. Names are shown via
 * the frontend i18n keys `units.unece.<code>`; `fraction` is the usual precision.
 */
export const UNECE_UNIT_CODES: { code: string; decimals: number; group: 'count' | 'mass' | 'volume' | 'length' | 'area' | 'package' | 'time' | 'energy' }[] = [
  { code: 'C62', decimals: 0, group: 'count' },
  { code: 'H87', decimals: 0, group: 'count' },
  { code: 'NIU', decimals: 0, group: 'count' },
  { code: 'PR', decimals: 0, group: 'count' },
  { code: 'SET', decimals: 0, group: 'count' },
  { code: 'DZN', decimals: 0, group: 'count' },
  { code: 'KGM', decimals: 3, group: 'mass' },
  { code: 'GRM', decimals: 0, group: 'mass' },
  { code: 'MGM', decimals: 0, group: 'mass' },
  { code: 'TNE', decimals: 3, group: 'mass' },
  { code: 'LBR', decimals: 3, group: 'mass' },
  { code: 'LTR', decimals: 3, group: 'volume' },
  { code: 'MLT', decimals: 0, group: 'volume' },
  { code: 'MTQ', decimals: 3, group: 'volume' },
  { code: 'MTR', decimals: 2, group: 'length' },
  { code: 'CMT', decimals: 0, group: 'length' },
  { code: 'MMT', decimals: 0, group: 'length' },
  { code: 'KTM', decimals: 3, group: 'length' },
  { code: 'MTK', decimals: 2, group: 'area' },
  { code: 'BX', decimals: 0, group: 'package' },
  { code: 'PK', decimals: 0, group: 'package' },
  { code: 'PA', decimals: 0, group: 'package' },
  { code: 'PF', decimals: 0, group: 'package' },
  { code: 'CT', decimals: 0, group: 'package' },
  { code: 'CR', decimals: 0, group: 'package' },
  { code: 'BG', decimals: 0, group: 'package' },
  { code: 'BO', decimals: 0, group: 'package' },
  { code: 'CA', decimals: 0, group: 'package' },
  { code: 'HUR', decimals: 2, group: 'time' },
  { code: 'DAY', decimals: 0, group: 'time' },
  { code: 'MON', decimals: 0, group: 'time' },
  { code: 'KWH', decimals: 3, group: 'energy' },
];

export function isUneceCode(code: unknown): boolean {
  return typeof code === 'string' && UNECE_UNIT_CODES.some((u) => u.code === code);
}

/**
 * Non-SI units that are not offered as standard units to Turkish companies
 * (3516 s. Ölçüler ve Ayarlar Kanunu: trade uses the SI system).
 */
export const NON_SI_UNECE_CODES = ['LBR'];
export const NON_SI_STANDARD_UNIT_CODES = ['lb'];

/** Default precision (decimals) of the built-in units; UN/ECE codes come from legal_parameters. */
export const STANDARD_UNIT_DECIMALS: Record<string, number> = {
  pcs: 0, box: 0, pack: 0, pallet: 0, kg: 3, g: 0, lb: 3, l: 3, ml: 0, m: 2,
};

// ─── Movement reason codes (VUK 219/227, KDVK 3/a, 30/c; 197/397 hesaplar) ───

export type ReasonDirection = 'in' | 'out' | 'both';

export const MOVEMENT_REASONS = [
  { code: 'SALE', direction: 'out', manual: true, needsDocument: true },
  { code: 'PURCHASE', direction: 'in', manual: true, needsDocument: true },
  { code: 'OPENING', direction: 'in', manual: true, needsDocument: false },
  { code: 'INTERNAL_USE', direction: 'out', manual: true, needsDocument: false },
  { code: 'GIFT_SAMPLE', direction: 'out', manual: true, needsDocument: false },
  { code: 'PERSONNEL', direction: 'out', manual: true, needsDocument: false },
  { code: 'WASTAGE_NORMAL', direction: 'out', manual: true, needsDocument: false },
  { code: 'LOSS_ZAYI', direction: 'out', manual: true, needsDocument: false },
  { code: 'DISASTER_LOSS', direction: 'out', manual: true, needsDocument: false },
  { code: 'THEFT_LOSS', direction: 'out', manual: true, needsDocument: false },
  { code: 'EXPIRED_DESTROYED', direction: 'out', manual: true, needsDocument: false },
  { code: 'DESTRUCTION_IMHA', direction: 'out', manual: true, needsDocument: false },
  { code: 'SCRAP', direction: 'out', manual: true, needsDocument: false },
  { code: 'COUNT_SURPLUS', direction: 'in', manual: true, needsDocument: false },
  { code: 'COUNT_SHORTAGE', direction: 'out', manual: true, needsDocument: false },
  { code: 'TESELLUM_SURPLUS', direction: 'in', manual: true, needsDocument: false },
  { code: 'TESELLUM_SHORTAGE', direction: 'out', manual: true, needsDocument: false },
  { code: 'TRANSFER', direction: 'both', manual: false, needsDocument: false },
  { code: 'RETURN', direction: 'both', manual: true, needsDocument: true },
  { code: 'CORRECTION', direction: 'both', manual: true, needsDocument: false },
  { code: 'UNCLASSIFIED_197_397', direction: 'both', manual: true, needsDocument: false },
] as const satisfies readonly { code: string; direction: ReasonDirection; manual: boolean; needsDocument: boolean }[];

export type MovementReasonCode = (typeof MOVEMENT_REASONS)[number]['code'];
export const MOVEMENT_REASON_CODES: MovementReasonCode[] = MOVEMENT_REASONS.map((r) => r.code);

export function isReasonCode(code: unknown): code is MovementReasonCode {
  return typeof code === 'string' && (MOVEMENT_REASON_CODES as string[]).includes(code);
}

/** True when `reason` may be used for a change of sign `delta` (>0 in, <0 out). */
export function reasonAllowsDirection(reason: string, delta: number): boolean {
  const r = MOVEMENT_REASONS.find((x) => x.code === reason);
  if (!r) return false;
  if (r.direction === 'both' || delta === 0) return true;
  return r.direction === (delta > 0 ? 'in' : 'out');
}

/** Reasons that take goods out of use for good; manual adjustments with them are typed DISPOSAL. */
export const DISPOSAL_REASONS: MovementReasonCode[] = ['LOSS_ZAYI', 'DISASTER_LOSS', 'EXPIRED_DESTROYED', 'DESTRUCTION_IMHA', 'SCRAP'];

/** Movement types (legacy ones kept). */
export const STOCK_MOVEMENT_TYPES = [
  'IN', 'OUT', 'ORDER', 'RETURN', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'REVERSAL', 'DISPOSAL', 'QUARANTINE_IN', 'QUARANTINE_OUT',
] as const;

/** Document types a movement can reference. */
export const MOVEMENT_DOCUMENT_TYPES = [
  'ORDER', 'PURCHASE_ORDER', 'INVOICE', 'DESPATCH', 'GOODS_RECEIPT', 'STOCK_COUNT', 'TRANSFER', 'DESTRUCTION_REPORT', 'EXPENSE_VOUCHER', 'INTERNAL_VOUCHER', 'OTHER',
] as const;
export type MovementDocumentType = (typeof MOVEMENT_DOCUMENT_TYPES)[number];

// ─── Warehouses ───

export const WAREHOUSE_TYPES = ['NORMAL', 'QUARANTINE', 'CONSIGNMENT', 'IN_TRANSIT'] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];
export const WAREHOUSE_OWNERSHIPS = ['OWN', 'CONSIGNMENT_IN', 'CONSIGNMENT_OUT'] as const;
export type WarehouseOwnership = (typeof WAREHOUSE_OWNERSHIPS)[number];

/** Quarantine (awaiting destruction) and goods in transit can never be sold from. */
export function warehouseTypeAllowsSale(type: string | null | undefined): boolean {
  return type !== 'QUARANTINE' && type !== 'IN_TRANSIT';
}

// ─── Products: inventory class (Tekdüzen Hesap Planı 15x) ───

export const INVENTORY_CLASSES = ['TICARI_MAL_153', 'ILK_MADDE_150', 'YARI_MAMUL_151', 'MAMUL_152', 'DIGER_157'] as const;
export type InventoryClass = (typeof INVENTORY_CLASSES)[number];

// ─── GTIN (GS1) ───

/** GS1 mod-10 check of an 8/12/13/14-digit GTIN. */
export function isValidGtin(value: unknown): boolean {
  if (typeof value !== 'string' || !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = value.padStart(14, '0').split('').map(Number);
  const sum = digits.slice(0, 13).reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[13];
}

/** 14-digit form of a valid GTIN (left-padded with zeros), else null. */
export function toGtin14(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return isValidGtin(v) ? v.padStart(14, '0') : null;
}
