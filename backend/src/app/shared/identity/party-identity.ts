import { BadRequestException } from '@nestjs/common';
import { err } from '../i18n/app-error';
import { guessIdentityType, validateTaxId } from '../tr';
import { getSpecialTaxIds } from './validators';

export interface PartyIdentityInput {
  identityType?: string | null;
  identityNumber?: string | null;
  /** Legacy (pre-WP1) single tax number field */
  taxNumber?: string | null;
}

export interface PartyIdentity {
  identityType: string | null;
  identityNumber: string | null;
}

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/**
 * Merges an identity change into the current values and validates it for the
 * party type ('company' requires VKN/TCKN unless FOREIGN). Throws 400 with the
 * identity error code (INVALID_VKN, INVALID_TCKN, TAX_ID_REQUIRED_FOR_COMPANY, ...).
 */
export function resolvePartyIdentity(current: PartyIdentity, change: PartyIdentityInput, partyType: string | null | undefined): PartyIdentity {
  let type = change.identityType !== undefined ? change.identityType : current.identityType;
  let num = change.identityNumber !== undefined ? change.identityNumber : current.identityNumber;
  if (change.identityType === undefined && change.identityNumber === undefined && !blank(change.taxNumber)) {
    num = String(change.taxNumber);
    type = guessIdentityType(num) ?? 'VKN';
  }
  const identityType = blank(type) ? null : String(type).trim().toUpperCase();
  let identityNumber = blank(num) ? null : String(num).trim();
  if (identityNumber && identityType !== 'FOREIGN') identityNumber = identityNumber.replace(/\s+/g, '');
  const code = validateTaxId({ identityType, identityNumber, partyType }, { specials: getSpecialTaxIds() });
  if (code) throw new BadRequestException(err(code));
  return { identityType, identityNumber };
}

/** True when a DTO touches any identity-related field (or the party type). */
export function touchesIdentity(dto: PartyIdentityInput & { type?: unknown; isForeign?: unknown }): boolean {
  return dto.identityType !== undefined || dto.identityNumber !== undefined || dto.taxNumber !== undefined || dto.type !== undefined || dto.isForeign !== undefined;
}
