import { isValidTckn, maskEmail, maskIdentifier } from '../tr';

/**
 * Masks every valid T.C. Kimlik No / YKN (11 digits, checksum) in free text - printable documents,
 * e-document XML / HTML, audit snapshots. A number glued to letters, digits, '-', '+', '/', '='
 * (UUIDs, hashes, base64 images, phone numbers) is left alone; VKN (10 digits) stays visible.
 */
const TEXT_TCKN = /(?<![0-9A-Za-z+/=-])[1-9][0-9]{10}(?![0-9A-Za-z+/=-])/g;
export function maskPersonalIdsInText(text: string): string {
  if (!text || !/[1-9][0-9]{10}/.test(text)) return text;
  return text.replace(TEXT_TCKN, (m) => (isValidTckn(m) ? (maskIdentifier(m) as string) : m));
}

/** Keys never returned by the API: the blind index of identity numbers (R61). */
const INTERNAL_KEYS = new Set(['identityNumberHash']);

/** Deep copy without internal keys (applied to every JSON response). */
export function stripInternalKeys<T>(value: T, depth = 0): T {
  if (depth > 40 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripInternalKeys(v, depth + 1)) as T;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  let found = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (INTERNAL_KEYS.has(k)) {
      found = true;
      continue;
    }
    const s = stripInternalKeys(v, depth + 1);
    if (s !== v) found = true;
    out[k] = s;
  }
  return (found ? out : value) as T;
}

/**
 * Response masking of personal identifiers for callers without `customers.pii.read` (R61).
 *
 * A deep walk over the (JSON-serialized) response: values of identifier keys are masked as
 * `*******1234` when they are personal identifiers - an 11-digit TCKN / YKN (a 10-digit VKN is a
 * company tax number and stays visible), passport numbers and foreign personal tax ids always.
 * Applied globally by PiiMaskingInterceptor, so documents (buyer snapshots, despatch drivers),
 * orders, traces and customer lists are covered alike.
 */
const ID_KEY = /^(identityNumber|taxNumber|taxId|buyerTaxId|counterpartyTaxId|partyTaxId|receiverTaxId|senderTaxId|tckn|driverTckn|nationalId|customerTaxId|subjectIdentity)$/i;
const ALWAYS_KEY = /^(passportNo|passportNumber)$/i;

function isPersonalId(v: unknown): v is string {
  return typeof v === 'string' && /^\d{11}$/.test(v.trim());
}

export function maskPersonalIdentifiers<T>(value: T): T {
  return walk(value, 0) as T;
}

function walk(v: unknown, depth: number): unknown {
  if (depth > 40 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && ((ID_KEY.test(k) && isPersonalId(val)) || (ALWAYS_KEY.test(k) && val))) out[k] = maskIdentifier(val);
    else out[k] = walk(val, depth + 1);
  }
  return out;
}

/** Fields of a customer that are masked in customer responses (identity) and for non-holders (contact). */
export interface CustomerMaskOptions {
  /** caller has customers.pii.read */
  canReadPii: boolean;
  /** explicit "Göster" (reveal) - logged as pii_view */
  revealed?: boolean;
}

/**
 * Customer presenter: the identity number of a natural person (TCKN / YKN), passport and foreign
 * tax id are masked unless revealed; without customers.pii.read the e-mail and phone of a natural
 * person are masked as well (a company's contact data is not personal data of the customer).
 */
export function maskCustomer<T extends Record<string, any>>(c: T, opts: CustomerMaskOptions): T {
  const out: Record<string, any> = { ...c };
  const natural = out['type'] === 'individual' || out['identityType'] === 'TCKN' || out['identityType'] === 'YKN';
  const revealed = opts.canReadPii && !!opts.revealed;
  if (!revealed) {
    if (out['identityNumber'] && (natural || /^\d{11}$/.test(String(out['identityNumber'])))) {
      out['identityNumber'] = maskIdentifier(out['identityNumber']);
      if ('taxNumber' in out) out['taxNumber'] = out['identityNumber'];
    }
    if (out['passportNo']) out['passportNo'] = maskIdentifier(out['passportNo']);
    if (natural && out['foreignTaxId']) out['foreignTaxId'] = maskIdentifier(out['foreignTaxId']);
  }
  if (!opts.canReadPii && natural) {
    if (out['email']) out['email'] = maskEmail(out['email']);
    if (out['phone']) out['phone'] = maskIdentifier(out['phone']);
  }
  out['piiMasked'] = !revealed;
  return out as T;
}
