/**
 * Turkish tax / identity number validators (pure, shared by backend and frontend).
 *
 *  - VKN  (Vergi Kimlik No, 10 digits): GİB check-digit algorithm.
 *  - TCKN (T.C. Kimlik No, 11 digits): 10th and 11th digit checksums, first digit != 0.
 *  - YKN  (Yabancı Kimlik No): same algorithm as TCKN, always starts with "99".
 *
 * Special placeholder values (e.g. 11111111111 for anonymous e-İrsaliye/e-Arşiv
 * receivers, 2222222222) are NOT checksum valid. They are never hard-coded here:
 * the caller passes the whitelist read from `legal_parameters` (SPECIAL_TAX_IDS).
 */

export type IdentityType = 'VKN' | 'TCKN' | 'YKN' | 'FOREIGN' | 'ANONYMOUS';
export const IDENTITY_TYPES: IdentityType[] = ['VKN', 'TCKN', 'YKN', 'FOREIGN', 'ANONYMOUS'];

/** Error codes shared with the backend message catalog. */
export type IdentityErrorCode =
  | 'INVALID_VKN'
  | 'INVALID_TCKN'
  | 'TAX_ID_REQUIRED_FOR_COMPANY'
  | 'INVALID_IDENTITY_TYPE'
  | 'IDENTITY_NUMBER_NOT_ALLOWED';

export interface SpecialTaxId {
  value: string;
  /** Which identity type the placeholder stands in for. */
  type: 'VKN' | 'TCKN';
  /** Document scopes where the placeholder is accepted, e.g. ['EIRSALIYE', 'EARSIV']. */
  scope: string[];
}

const digitsOnly = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

export function vknCheckDigit(first9: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (first9.charCodeAt(i) - 48 + (9 - i)) % 10;
    if (t !== 0) {
      const w = (t * (1 << (9 - i))) % 9;
      sum += w === 0 ? 9 : w;
    }
  }
  return (10 - (sum % 10)) % 10;
}

/** GİB VKN checksum (10 digits). */
export function isValidVkn(value: unknown): boolean {
  const v = digitsOnly(value);
  return /^\d{10}$/.test(v) && vknCheckDigit(v) === v.charCodeAt(9) - 48;
}

export function tcknCheckDigits(first9: string): [number, number] {
  const d = Array.from(first9, (c) => c.charCodeAt(0) - 48);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((s, x) => s + x, 0) + d10) % 10;
  return [d10, d11];
}

/** T.C. Kimlik No checksum (also accepts YKN, which uses the same algorithm). */
export function isValidTckn(value: unknown): boolean {
  const v = digitsOnly(value);
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const [d10, d11] = tcknCheckDigits(v.slice(0, 9));
  return d10 === v.charCodeAt(9) - 48 && d11 === v.charCodeAt(10) - 48;
}

/** Yabancı Kimlik No: TCKN algorithm and "99" prefix. */
export function isValidYkn(value: unknown): boolean {
  const v = digitsOnly(value);
  return v.startsWith('99') && isValidTckn(v);
}

/** True when `value` is a whitelisted placeholder for the given scope (or any scope when omitted). */
export function isSpecialTaxId(value: unknown, specials: SpecialTaxId[] = [], scope?: string): boolean {
  const v = digitsOnly(value);
  return specials.some((s) => s.value === v && (!scope || s.scope.includes(scope)));
}

/**
 * A driver's TCKN on a despatch advice must be a real identity: placeholders
 * (e.g. 11111111111) are rejected even when whitelisted for the receiver.
 */
export function isValidDriverTckn(value: unknown, specials: SpecialTaxId[] = []): boolean {
  return isValidTckn(value) && !isSpecialTaxId(value, specials);
}

/** 10 digits -> VKN, 11 digits -> TCKN (99… -> YKN); anything else null. */
export function guessIdentityType(value: unknown): IdentityType | null {
  const v = digitsOnly(value).replace(/\s/g, '');
  if (/^\d{10}$/.test(v)) return 'VKN';
  if (/^\d{11}$/.test(v)) return v.startsWith('99') ? 'YKN' : 'TCKN';
  return null;
}

export interface TaxIdInput {
  identityType?: string | null;
  identityNumber?: string | null;
  /** 'company' parties (legal entities, sole proprietorships) must carry a VKN or TCKN unless foreign. */
  partyType?: string | null;
}

export interface TaxIdOptions {
  specials?: SpecialTaxId[];
  /** Scope for special placeholder values; omitted = placeholders rejected. */
  specialScope?: string;
}

/**
 * Validates an identity pair. Returns an error code or null.
 *  - VKN / TCKN / YKN: checksum (placeholders only when a scope allows them).
 *  - FOREIGN: free-form identifier (foreign tax id / passport) – no checksum.
 *  - ANONYMOUS (final consumer): no number allowed; not allowed for company parties.
 */
export function validateTaxId(input: TaxIdInput, opts: TaxIdOptions = {}): IdentityErrorCode | null {
  const type = (input.identityType || '').toUpperCase();
  const num = digitsOnly(input.identityNumber);
  const isCompany = input.partyType === 'company';
  if (type && !(IDENTITY_TYPES as string[]).includes(type)) return 'INVALID_IDENTITY_TYPE';
  const special = opts.specialScope ? isSpecialTaxId(num, opts.specials, opts.specialScope) : false;
  switch (type) {
    case '':
    case 'ANONYMOUS':
      if (isCompany) return 'TAX_ID_REQUIRED_FOR_COMPANY';
      if (type === 'ANONYMOUS' && num) return 'IDENTITY_NUMBER_NOT_ALLOWED';
      return null;
    case 'VKN':
      if (!num) return isCompany ? 'TAX_ID_REQUIRED_FOR_COMPANY' : 'INVALID_VKN';
      return isValidVkn(num) || special ? null : 'INVALID_VKN';
    case 'TCKN':
      if (!num) return isCompany ? 'TAX_ID_REQUIRED_FOR_COMPANY' : 'INVALID_TCKN';
      return isValidTckn(num) || special ? null : 'INVALID_TCKN';
    case 'YKN':
      if (!num) return 'INVALID_TCKN';
      return isValidYkn(num) ? null : 'INVALID_TCKN';
    case 'FOREIGN':
      return null;
  }
  return 'INVALID_IDENTITY_TYPE';
}
