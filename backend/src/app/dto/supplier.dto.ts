import { IsString, IsNotEmpty, IsOptional, IsEmail, IsInt, Min, Max, IsIn, IsBoolean, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPLIER_TYPES } from '../entities/supplier.entity';
import { IDENTITY_TYPES } from '../shared/tr';
import { AddressDto, addressFromLegacy } from './address.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digits = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value);
const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

/** Supplier fields (identity rules are validated by the service on the merged record). */
export class SupplierFieldsDto {
  @Transform(trim)
  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_NAME_REQUIRED' })
  name?: string;

  @ApiPropertyOptional({ enum: SUPPLIER_TYPES })
  @IsOptional()
  @IsIn(SUPPLIER_TYPES, { message: 'VALIDATION_FAILED' })
  type?: string;

  @ApiPropertyOptional({ enum: IDENTITY_TYPES })
  @Transform(upper)
  @ValidateIf(present)
  @IsIn(IDENTITY_TYPES, { message: 'INVALID_IDENTITY_TYPE' })
  identityType?: string | null;

  @Transform(digits)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  identityNumber?: string | null;

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

  @ApiPropertyOptional({ type: AddressDto })
  @Transform(addressFromLegacy)
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto | null;

  @IsOptional()
  @IsBoolean()
  isTaxpayer?: boolean;

  @IsOptional()
  @IsBoolean()
  isRealTaxationFarmer?: boolean;

  @IsOptional()
  @IsBoolean()
  isForeign?: boolean;

  @IsOptional()
  @IsBoolean()
  isVatTaxpayer?: boolean;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ValidateIf(present)
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  leadTimeDays?: number;
}

export class CreateSupplierDto extends SupplierFieldsDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_NAME_REQUIRED' })
  declare name: string;
}

export class UpdateSupplierDto extends SupplierFieldsDto {}
