import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional, IsISO4217CurrencyCode } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class PurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsInt({ message: 'VALIDATION_ITEM_QUANTITY_INT' })
  @Min(1, { message: vmsg('VALIDATION_ITEM_QUANTITY_MIN', 'min') })
  quantity: number;

  /** Unit price in PO currency (legacy name; same as unitPrice) */
  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  @IsOptional()
  price?: number;

  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  @IsOptional()
  unitPrice?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_ID_REQUIRED' })
  supplierId: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  /** Warehouse that receives the goods (default warehouse when omitted) */
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expectedDate?: string;
}

export class UpdatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @IsOptional()
  items?: PurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expectedDate?: string;
}

export class UpdatePurchaseOrderStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  /** Warehouse that receives the goods when status becomes Received */
  @IsString()
  @IsOptional()
  warehouseId?: string;
}
