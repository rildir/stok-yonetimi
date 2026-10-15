import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsArray, IsBoolean, MaxLength, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AddressDto, addressFromLegacy } from './address.dto';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_WAREHOUSE_NAME_REQUIRED' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_WAREHOUSE_CODE_REQUIRED' })
  code: string;

  @ApiPropertyOptional({ type: AddressDto })
  @Transform(addressFromLegacy)
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto | null;

  @IsOptional()
  @IsBoolean()
  isBranch?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  branchCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  siteGroup?: string | null;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value))
  @ValidateIf((_: unknown, v: unknown) => v !== undefined && v !== null && v !== '')
  @Matches(/^[A-Z0-9]{3}$/, { message: 'INVALID_DOCUMENT_SERIES' })
  defaultSeries?: string | null;
}

export class UpdateWarehouseDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @Transform(addressFromLegacy)
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto | null;

  @IsOptional()
  @IsBoolean()
  isBranch?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  branchCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  siteGroup?: string | null;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value))
  @ValidateIf((_: unknown, v: unknown) => v !== undefined && v !== null && v !== '')
  @Matches(/^[A-Z0-9]{3}$/, { message: 'INVALID_DOCUMENT_SERIES' })
  defaultSeries?: string | null;
}

export class TransferStockDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsString()
  @IsOptional()
  fromWarehouseId?: string;

  @IsString()
  @IsOptional()
  toWarehouseId?: string;

  /** Legacy: warehouse names */
  @IsString()
  @IsOptional()
  fromWarehouse?: string;

  @IsString()
  @IsOptional()
  toWarehouse?: string;

  @IsInt({ message: 'TRANSFER_QUANTITY_INVALID' })
  @Min(1, { message: 'TRANSFER_QUANTITY_INVALID' })
  quantity: number;

  @IsString()
  @IsOptional()
  note?: string;

  /** Lot-tracked products: lot to move (default FEFO/FIFO) */
  @IsString()
  @IsOptional()
  lotId?: string;

  /** Serial-tracked products: serials to move (default oldest) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}
