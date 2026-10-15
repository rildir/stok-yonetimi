/**
 * Cross-border transfer rules for integrations (KVKK md. 9 as amended by Law 7499, in force
 * 01.06.2024; Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik):
 *  - ADEQUACY: Kurul yeterlilik kararı (md. 9/1);
 *  - SCC: standart sözleşme (md. 9/4), notified to the Board within 5 business days of signing (md. 9/5);
 *  - BCR: bağlayıcı şirket kuralları (Board approval, md. 9/4);
 *  - INCIDENTAL_CONSENT: arızi aktarım with explicit consent (md. 9/6-a) - only for non-regular transfers.
 * A webhook endpoint abroad cannot be activated without a basis; an SCC basis needs the notification date.
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

export type TransferError = 'TRANSFER_COUNTRY_INVALID' | 'TRANSFER_BASIS_INVALID' | 'TRANSFER_BASIS_REQUIRED' | 'SCC_NOTICE_REQUIRED';

export function isAbroad(country: string | null | undefined): boolean {
  return !!country && country.toUpperCase() !== 'TR';
}

/** Error code when the endpoint may not be saved / activated with these values (null: allowed). */
export function validateTransfer(t: TransferInput): TransferError | null {
  const country = (t.destinationCountry || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return 'TRANSFER_COUNTRY_INVALID';
  if (t.transferBasis && !(TRANSFER_BASES as readonly string[]).includes(t.transferBasis)) return 'TRANSFER_BASIS_INVALID';
  if (country === 'TR') return t.transferBasis && t.transferBasis !== 'DOMESTIC' ? 'TRANSFER_BASIS_INVALID' : null;
  if (t.active === false) return null; // may be prepared inactive
  if (!t.transferBasis || t.transferBasis === 'DOMESTIC') return 'TRANSFER_BASIS_REQUIRED';
  if (t.transferBasis === 'SCC' && !t.sccNotifiedAt) return 'SCC_NOTICE_REQUIRED';
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
