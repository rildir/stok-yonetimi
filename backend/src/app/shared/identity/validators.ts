import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import {
  isStrongPassword,
  isValidKepAddress,
  isValidMersis,
  isValidTckn,
  isValidVkn,
  PASSWORD_MIN_CLASSES,
  PASSWORD_MIN_LENGTH,
  SpecialTaxId,
  validateTaxId,
  guessIdentityType,
} from '../tr';

/**
 * Whitelisted placeholder identities (legal_parameters.SPECIAL_TAX_IDS), loaded by
 * LegalParameterService at start-up and after every change. Validators stay sync.
 */
let specialTaxIds: SpecialTaxId[] = [];
export function setSpecialTaxIds(list: SpecialTaxId[]): void {
  specialTaxIds = Array.isArray(list) ? list : [];
}
export function getSpecialTaxIds(): SpecialTaxId[] {
  return specialTaxIds;
}

const empty = (v: unknown) => v === undefined || v === null || v === '';

function simple(name: string, code: string, test: (v: unknown) => boolean, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options: { message: code, ...options },
      validator: { validate: (value: unknown) => empty(value) || test(value) },
    });
}

/** 10-digit VKN with GİB check digit (empty values pass; combine with IsNotEmpty when required). */
export const IsVkn = (options?: ValidationOptions) => simple('isVkn', 'INVALID_VKN', isValidVkn, options);

/** 11-digit TCKN / YKN checksum. */
export const IsTckn = (options?: ValidationOptions) => simple('isTckn', 'INVALID_TCKN', isValidTckn, options);

export const IsMersis = (options?: ValidationOptions) => simple('isMersis', 'INVALID_MERSIS', isValidMersis, options);

export const IsKepAddress = (options?: ValidationOptions) => simple('isKepAddress', 'INVALID_KEP_ADDRESS', isValidKepAddress, options);

/** Password policy: >= 10 characters, >= 3 character classes. */
export const IsStrongPassword = (options?: ValidationOptions) =>
  simple('isStrongPassword', `WEAK_PASSWORD|min=${PASSWORD_MIN_LENGTH}|classes=${PASSWORD_MIN_CLASSES}`, isStrongPassword, options);

export interface TaxIdForOptions {
  /** Property holding the identity type (default 'identityType'). */
  typeProperty?: string;
  /** Property holding the party type ('company' requires VKN/TCKN); default 'type'. */
  partyProperty?: string;
  /** Scope in which special placeholder values are accepted (none by default). */
  specialScope?: string;
  /** Legacy property (e.g. taxNumber) used when type and number are both empty; the type is guessed. */
  fallbackProperty?: string;
  /**
   * Read the number from this property instead of the decorated one. Lets the rule sit on an
   * always-present property (optional properties skip validation when absent, so a missing
   * company tax id would never be reported).
   */
  numberProperty?: string;
}

/**
 * Validates the decorated identity number against the identity type of the same
 * object (VKN / TCKN / YKN checksum, ANONYMOUS without number, company -> tax id required).
 * The error code (INVALID_VKN, INVALID_TCKN, TAX_ID_REQUIRED_FOR_COMPANY, ...) becomes the message.
 */
export function IsTaxIdFor(opts: TaxIdForOptions = {}, options?: ValidationOptions) {
  const typeProp = opts.typeProperty ?? 'identityType';
  const partyProp = opts.partyProperty ?? 'type';
  const codeFor = (value: unknown, o: Record<string, unknown>) => {
    let type = (o[typeProp] as string) || null;
    let num = ((opts.numberProperty ? o[opts.numberProperty] : value) as string) || null;
    const legacy = opts.fallbackProperty ? (o[opts.fallbackProperty] as string) : null;
    if (!type && !num && legacy) {
      num = legacy;
      type = guessIdentityType(legacy) ?? 'VKN';
    }
    return validateTaxId({ identityType: type, identityNumber: num, partyType: (o[partyProp] as string) ?? null }, { specials: specialTaxIds, specialScope: opts.specialScope });
  };
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isTaxIdFor',
      target: object.constructor,
      propertyName,
      options: { ...options, message: (args: ValidationArguments) => codeFor(args.value, args.object as Record<string, unknown>) ?? 'INVALID_IDENTITY_TYPE' },
      validator: {
        validate: (value: unknown, args: ValidationArguments) => !codeFor(value, args.object as Record<string, unknown>),
      },
    });
}
