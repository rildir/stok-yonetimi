import { IsOptional, IsString, MaxLength, IsInt, Matches, ValidateIf, IsISO31661Alpha2 } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upperOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value);
const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Structured address. For TR, provinceCode (plate code) + districtId come from
 * GET /refdata/provinces|districts; names are filled by the server.
 */
export class AddressDto {
  @ApiPropertyOptional({ example: 'Barbaros Mah. Ihlamur Sok. No:4 D:12' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line1?: string | null;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string | null;

  @ApiPropertyOptional({ example: 3403, description: 'GET /refdata/districts?provinceCode=34' })
  @ValidateIf(present)
  @Type(() => Number)
  @IsInt({ message: 'INVALID_DISTRICT' })
  districtId?: number | null;

  @ApiPropertyOptional({ description: 'Free text for foreign addresses' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @ApiPropertyOptional({ example: '34' })
  @Transform(trim)
  @ValidateIf(present)
  @Matches(/^\d{2}$/, { message: 'INVALID_PROVINCE' })
  provinceCode?: string | null;

  @ApiPropertyOptional({ description: 'Free text for foreign addresses' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @ApiPropertyOptional({ example: '34746' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string | null;

  @ApiPropertyOptional({ example: 'TR' })
  @Transform(upperOrNull)
  @ValidateIf(present)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string | null;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  uavtCode?: string | null;
}

/** Legacy clients may still send `address` as a plain string: it becomes line1. */
export const addressFromLegacy = ({ value }: { value: unknown }) => (typeof value === 'string' ? { line1: value } : value);
