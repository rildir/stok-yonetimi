import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional, IsISO4217CurrencyCode, ArrayMinSize } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class OrderLotPickDto {
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @IsInt({ message: 'VALIDATION_ITEM_QUANTITY_INT' })
  @Min(1, { message: vmsg('VALIDATION_ITEM_QUANTITY_MIN', 'min') })
  quantity: number;
}

export class OrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsString()
  @IsOptional()
  productName?: string;

  @IsInt({ message: 'VALIDATION_ITEM_QUANTITY_INT' })
  @Min(1, { message: vmsg('VALIDATION_ITEM_QUANTITY_MIN', 'min') })
  quantity: number;

  /** Unit price in document currency (gross if the company enters tax-inclusive prices) */
  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  @IsOptional()
  unitPrice?: number;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  /** Unit the quantity is entered in (default: product base unit) */
  @IsString()
  @IsOptional()
  unitId?: string;

  /** Explicit lot picks (base units); omitted => FEFO/FIFO */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLotPickDto)
  lots?: OrderLotPickDto[];

  /** Explicit serials; omitted => oldest in stock */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  /** Required when customerId is not given; otherwise snapshotted from the customer */
  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_ORDER_STATUS_REQUIRED' })
  status: 'Completed' | 'Pending' | 'Cancelled' | string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  /** Default source warehouse for all lines */
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'ORDER_ITEMS_REQUIRED' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsString()
  @IsOptional()
  carrier?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;
}
