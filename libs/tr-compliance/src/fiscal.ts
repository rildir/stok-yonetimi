/** Pure format checks for company fiscal data and addresses (shared backend / frontend). */

export type BookkeepingType = 'BILANCO' | 'ISLETME' | 'BASIT';
export const BOOKKEEPING_TYPES: BookkeepingType[] = ['BILANCO', 'ISLETME', 'BASIT'];

/** MERSİS no: 16 digits. Deliberately no "contains the VKN" check (not a legal rule). */
export function isValidMersis(value: unknown): boolean {
  return /^\d{16}$/.test(String(value ?? '').trim());
}

/** Registered e-mail (KEP) addresses always live under the .kep.tr domain. */
export function isValidKepAddress(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.kep\.tr$/.test(v);
}

/** Turkish postal code: 5 digits, first two = province plate code (01-81), matching the province when given. */
export function isValidTrPostalCode(value: unknown, provinceCode?: string | null): boolean {
  const v = String(value ?? '').trim();
  if (!/^\d{5}$/.test(v)) return false;
  const p = Number(v.slice(0, 2));
  if (p < 1 || p > 81) return false;
  return !provinceCode || v.slice(0, 2) === String(provinceCode).padStart(2, '0');
}

export const PROVINCE_CODE_PATTERN = /^(0[1-9]|[1-7]\d|8[01])$/;

// ------------------------------------------------------------------ passwords
/**
 * Password policy (KVKK Kişisel Veri Güvenliği Rehberi good practice, not a statutory rule):
 * at least 10 characters and at least 3 of 4 classes (lower, upper, digit, symbol).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MIN_CLASSES = 3;

export function passwordClasses(pw: string): number {
  return [/[a-zçğıöşü]/, /[A-ZÇĞİÖŞÜ]/, /\d/, /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/].filter((r) => r.test(pw)).length;
}

export function isStrongPassword(value: unknown): boolean {
  const pw = typeof value === 'string' ? value : '';
  return pw.length >= PASSWORD_MIN_LENGTH && passwordClasses(pw) >= PASSWORD_MIN_CLASSES;
}
