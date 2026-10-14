import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsArray } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_WAREHOUSE_NAME_REQUIRED' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_WAREHOUSE_CODE_REQUIRED' })
  code: string;

  @IsString()
  @IsOptional()
  address?: string;
}

export class UpdateWarehouseDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  address?: string;
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
