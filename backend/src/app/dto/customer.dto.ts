import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, IsISO31661Alpha2, IsISO4217CurrencyCode, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { CUSTOMER_TYPES } from '../entities/customer.entity';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Treat '' / null as "not provided" so optional validators are skipped. */
const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

export class CreateCustomerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CUSTOMER_NAME_REQUIRED' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsIn(CUSTOMER_TYPES, { message: 'VALIDATION_CUSTOMER_TYPE' })
  type?: string;

  @ValidateIf(present)
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNumber?: string | null;

  @Transform(upper)
  @ValidateIf(present)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

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
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CUSTOMER_NAME_REQUIRED' })
  @MaxLength(255)
  declare name: string;
}
