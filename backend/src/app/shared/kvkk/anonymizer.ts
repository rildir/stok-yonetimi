import { createHmac } from 'crypto';
import { resolvePiiKeys } from './crypto';

/**
 * Irreversible anonymisation of a data subject (KVKK md. 7; İmha Yönetmeliği md. 10: anonim hale
 * getirme). The subject's name becomes "Anonim Müşteri #<hash>" where the hash is a keyed HMAC of
 * the record id (not of the name: the original value cannot be recomputed or guessed from it);
 * contact, identity and notes are set to NULL.
 *
 * Legal document snapshots (invoices, despatch advices, returns, e-documents) are never touched:
 * they are within the 10-year retention (TTK 82, VUK 253). If such records exist the erasure is
 * applied partially ("kısıtlama"): contact data and notes are erased, the identity is kept with
 * restricted processing until the end of retention and the reason is recorded.
 */
export const ANON_MARK = '[ANONIMLESTIRILDI]';

export function anonymousCustomerName(id: string): string {
  const { mac } = resolvePiiKeys();
  const h = createHmac('sha256', mac).update(`anon-customer:${id}`).digest('hex').slice(0, 8).toUpperCase();
  return `Anonim Müşteri #${h}`;
}

export function anonymousSupplierName(id: string): string {
  const { mac } = resolvePiiKeys();
  const h = createHmac('sha256', mac).update(`anon-supplier:${id}`).digest('hex').slice(0, 8).toUpperCase();
  return `Anonim Tedarikçi #${h}`;
}

export function anonymousUserName(id: string): string {
  const { mac } = resolvePiiKeys();
  return `anonim-${createHmac('sha256', mac).update(`anon-user:${id}`).digest('hex').slice(0, 10)}`;
}

/** Address columns (embedded AddressColumns with the `address` prefix). */
const ADDRESS_FIELDS = ['line1', 'line2', 'districtId', 'district', 'provinceCode', 'province', 'postalCode', 'country', 'uavtCode'];

export type ErasureMode = 'FULL' | 'PARTIAL';

/** Column patch for a customer row. FULL: everything personal; PARTIAL: contact data and notes only. */
export function customerErasurePatch(id: string, mode: ErasureMode, now: Date, restrictedUntil: string | null): Record<string, unknown> {
  const contact = { email: null, phone: null, notes: null, noticeChannel: null };
  if (mode === 'PARTIAL') {
    return { ...contact, processingRestricted: true, erasureRestrictedUntil: restrictedUntil, erasureRequestedAt: now };
  }
  const address: Record<string, null> = {};
  for (const f of ADDRESS_FIELDS) address[f] = null;
  return {
    ...contact,
    name: anonymousCustomerName(id),
    identityType: 'ANONYMOUS',
    identityNumber: null,
    identityNumberHash: null,
    passportNo: null,
    nationality: null,
    foreignTaxId: null,
    taxOfficeCode: null,
    taxOfficeName: null,
    eInvoiceAliases: null,
    eDespatchAliases: null,
    noticeGivenAt: null,
    noticeVersion: null,
    reviewReason: null,
    address,
    isDeleted: true,
    processingRestricted: false,
    erasureRestrictedUntil: null,
    anonymizedAt: now,
  };
}

/** Keys of personal data inside audit before / after snapshots and webhook payloads. */
export const PERSONAL_KEYS = [
  'name', 'customerName', 'fullName', 'contactName', 'contactPerson', 'email', 'phone', 'notes', 'note', 'identityNumber', 'taxNumber', 'passportNo', 'foreignTaxId',
  'nationality', 'addressText', 'city', 'postalCode', 'addressLine1', 'addressLine2', 'addressDistrict', 'addressDistrictId', 'addressProvince', 'addressPostalCode',
  'addressUavtCode', 'address', 'noticeChannel', 'username', 'avatar', 'ip', 'userAgent', 'partyName', 'partyTaxId',
];

/**
 * Masked copy of a JSON snapshot: every key of `keys` found (any depth) gets `replacement(key)`.
 * Returns the same reference when nothing changed.
 */
export function maskJson(value: unknown, keys: string[], replacement: (key: string) => unknown = () => ANON_MARK, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const arr = value.map((v) => {
      const m = maskJson(v, keys, replacement, depth + 1);
      if (m !== v) changed = true;
      return m;
    });
    return changed ? arr : value;
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(k) && v !== null && v !== undefined && v !== ANON_MARK) {
      const r = replacement(k);
      out[k] = r;
      if (r !== v) changed = true;
    } else {
      const m = maskJson(v, keys, replacement, depth + 1);
      out[k] = m;
      if (m !== v) changed = true;
    }
  }
  return changed ? out : value;
}

/** Replacement for a customer's snapshots: names become the anonymous name, the rest a marker. */
export function customerReplacement(id: string): (key: string) => unknown {
  const anon = anonymousCustomerName(id);
  return (key) => (key === 'name' || key === 'customerName' || key === 'partyName' ? anon : key === 'address' ? null : ANON_MARK);
}
