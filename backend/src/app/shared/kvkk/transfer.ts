/**
 * Cross-border transfer rules for integrations (KVKK md. 9 as amended by Law 7499, in force
 * 01.06.2024; Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik):
 *  - ADEQUACY: Kurul yeterlilik kararı (md. 9/1);
 *  - SCC: standart sözleşme (md. 9/4), notified to the Board within 5 business days of signing (md. 9/5);
 *  - BCR: bağlayıcı şirket kuralları (Board approval, md. 9/4);
 *  - INCIDENTAL_CONSENT: arızi aktarım with explicit consent (md. 9/6-a) - only for non-regular transfers.
 * A webhook endpoint abroad cannot be activated without a basis; an SCC basis needs the notification date.
 * A webhook is a regular, repeated transfer: INCIDENTAL_CONSENT is refused for it (md. 9/6 applies
 * only "arızi" transfers). ADEQUACY needs a published Board adequacy decision for the destination
 * country (legal parameter KVKK_ADEQUACY_COUNTRIES; none has been published so far).
 * A late SCC notification is still accepted and flagged (sccNoticeStatus.late): the standard contract
 * remains the transfer basis, the missed 5-day notification is a separate administrative breach.
 * The destination country is the operator's declaration (no reliable location check from a URL).
 */
export const TRANSFER_BASES = ['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'] as const;
export type TransferBasis = (typeof TRANSFER_BASES)[number];

export interface TransferInput {
  destinationCountry?: string | null;
  transferBasis?: string | null;
  sccSignedAt?: string | null;
  sccNotifiedAt?: string | null;
  active?: boolean;
}

export type TransferError = 'TRANSFER_COUNTRY_INVALID' | 'TRANSFER_BASIS_INVALID' | 'TRANSFER_BASIS_REQUIRED' | 'SCC_NOTICE_REQUIRED' | 'TRANSFER_INCIDENTAL_NOT_REGULAR' | 'TRANSFER_ADEQUACY_NOT_DECIDED';

export interface TransferRules {
  /** countries with a published adequacy decision (KVKK md. 9/1) */
  adequacyCountries?: string[];
  /** regular, repeated transfer (webhooks): incidental bases are not available */
  regular?: boolean;
}

export function isAbroad(country: string | null | undefined): boolean {
  return !!country && country.toUpperCase() !== 'TR';
}

/** Error code when the endpoint may not be saved / activated with these values (null: allowed). */
export function validateTransfer(t: TransferInput, rules: TransferRules = {}): TransferError | null {
  const country = (t.destinationCountry || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return 'TRANSFER_COUNTRY_INVALID';
  if (t.transferBasis && !(TRANSFER_BASES as readonly string[]).includes(t.transferBasis)) return 'TRANSFER_BASIS_INVALID';
  if (country === 'TR') return t.transferBasis && t.transferBasis !== 'DOMESTIC' ? 'TRANSFER_BASIS_INVALID' : null;
  if (t.active === false) return null; // may be prepared inactive
  if (!t.transferBasis || t.transferBasis === 'DOMESTIC') return 'TRANSFER_BASIS_REQUIRED';
  if (t.transferBasis === 'SCC' && !t.sccNotifiedAt) return 'SCC_NOTICE_REQUIRED';
  if (t.transferBasis === 'INCIDENTAL_CONSENT' && rules.regular !== false) return 'TRANSFER_INCIDENTAL_NOT_REGULAR';
  if (t.transferBasis === 'ADEQUACY' && !(rules.adequacyCountries || []).map((c) => c.toUpperCase()).includes(country)) return 'TRANSFER_ADEQUACY_NOT_DECIDED';
  return null;
}

/** YYYY-MM-DD + n business days (Saturday / Sunday skipped; public holidays are not modelled). */
export function addBusinessDays(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** SCC notification deadline (signing + 5 business days) and whether it was missed. */
export function sccNoticeStatus(signedAt: string | null | undefined, notifiedAt: string | null | undefined, businessDays = 5): { deadline: string | null; late: boolean } {
  if (!signedAt) return { deadline: null, late: false };
  const deadline = addBusinessDays(signedAt, businessDays);
  return { deadline, late: !!notifiedAt && notifiedAt.slice(0, 10) > deadline };
}
