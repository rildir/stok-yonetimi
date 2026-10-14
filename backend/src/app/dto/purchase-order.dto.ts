import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsInt({ message: 'VALIDATION_ITEM_QUANTITY_INT' })
  @Min(1, { message: vmsg('VALIDATION_ITEM_QUANTITY_MIN', 'min') })
  quantity: number;

  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  @IsOptional()
  price?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_ID_REQUIRED' })
  supplierId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @IsOptional()
  items?: PurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
