import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsIn,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  MaxLength,
  ValidateIf,
  IsBoolean,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CUSTOMER_TYPES } from '../entities/customer.entity';
import { CUSTOMER_ADDRESS_KINDS } from '../entities/customer-address.entity';
import { IDENTITY_TYPES, isMaskedValue } from '../shared/tr';
import { IsTaxIdFor } from '../shared/identity/validators';
import { AddressDto, addressFromLegacy } from './address.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digits = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value);
/** WP7: a masked value (`*******1234`, `a*****@x.com`) sent back unchanged by a form means "not changed". */
const unmasked = (fn: (a: { value: unknown }) => unknown) => (a: { value: unknown }) => (isMaskedValue(a.value) ? undefined : fn(a));
export const NOTICE_CHANNELS = ['WEB', 'PAPER', 'EMAIL', 'SMS', 'PHONE', 'IN_PERSON', 'KEP'];
/** Treat '' / null as "not provided" so optional validators are skipped. */
const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

/** Fields shared by create and update (no cross-field identity rule: the service validates the merged record). */
export class CustomerFieldsDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CUSTOMER_NAME_REQUIRED' })
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(CUSTOMER_TYPES, { message: 'VALIDATION_CUSTOMER_TYPE' })
  type?: string;

  @ApiPropertyOptional({ enum: IDENTITY_TYPES, description: 'VKN | TCKN | YKN | FOREIGN | ANONYMOUS (final consumer)' })
  @Transform(upper)
  @ValidateIf(present)
  @IsIn(IDENTITY_TYPES, { message: 'INVALID_IDENTITY_TYPE' })
  identityType?: string | null;

  @ApiPropertyOptional({ example: '4890598016' })
  @Transform(unmasked(digits))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  identityNumber?: string | null;

  /** @deprecated pre-WP1 field: 10 digits -> VKN, 11 digits -> TCKN */
  @ApiPropertyOptional({ deprecated: true, description: 'Eski alan; identityType/identityNumber kullanın.' })
  @Transform(unmasked(digits))
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNumber?: string | null;

  @ApiPropertyOptional({ example: '34272', description: 'GET /refdata/tax-offices' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  taxOfficeCode?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  taxOfficeName?: string | null;

  @IsOptional()
  @IsBoolean()
  isVatTaxpayer?: boolean;

  @IsOptional()
  @IsBoolean()
  isDesignatedBuyer?: boolean;

  @Transform(unmasked(trim))
  @IsOptional()
  @IsString()
  @MaxLength(30)
  passportNo?: string | null;

  @Transform(upper)
  @ValidateIf(present)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  nationality?: string | null;

  @Transform(unmasked(trim))
  @IsOptional()
  @IsString()
  @MaxLength(40)
  foreignTaxId?: string | null;

  @Transform(upper)
  @ValidateIf(present)
  @Matches(/^[A-Z]{4,20}$/, { message: 'VALIDATION_FAILED' })
  preferredProfile?: string | null;

  @Transform(unmasked(trim))
  @ValidateIf(present)
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  email?: string | null;

  @Transform(unmasked(trim))
  @IsOptional()
  @IsString()
  phone?: string | null;

  // KVKK md. 10: privacy notice given to the customer (aydınlatma yapıldı)
  @ApiPropertyOptional({ example: '2026-10-15T09:30:00Z', nullable: true })
  @ValidateIf(present)
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'VALIDATION_DATE' })
  noticeGivenAt?: string | null;

  @ApiPropertyOptional({ example: '1.0', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  noticeVersion?: string | null;

  @ApiPropertyOptional({ enum: NOTICE_CHANNELS, nullable: true })
  @ValidateIf(present)
  @IsIn(NOTICE_CHANNELS, { message: 'VALIDATION_FAILED' })
  noticeChannel?: string | null;

  @ApiPropertyOptional({ type: AddressDto })
  @Transform(addressFromLegacy)
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto | null;

  /** @deprecated pre-WP1 flat fields, mapped into `address` */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @Transform(upper)
  @ValidateIf(present)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string | null;

  @Transform(upper)
  @ValidateIf(present)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateCustomerDto extends CustomerFieldsDto {
  /**
   * The identity rule (VKN / TCKN / YKN checksum against identityType; company customers need a
   * tax id) is attached to the always-present name so that a missing tax id is reported too.
   */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CUSTOMER_NAME_REQUIRED' })
  @MaxLength(255)
  @IsTaxIdFor({ numberProperty: 'identityNumber', fallbackProperty: 'taxNumber' })
  declare name: string;
}

export class UpdateCustomerDto extends CustomerFieldsDto {}

export class CustomerAddressDto {
  @IsOptional()
  @IsIn(CUSTOMER_ADDRESS_KINDS, { message: 'VALIDATION_FAILED' })
  kind?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({ type: AddressDto })
  @Transform(addressFromLegacy)
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto | null;
}
