import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional, IsISO4217CurrencyCode, ArrayMinSize, IsPositive } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, Matches, MaxLength } from 'class-validator';
import { DocumentChargeDto, LineTaxFieldsDto, SALES_CHANNELS, TAX_POINT_PATTERN } from './tax.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class OrderLotPickDto {
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @IsPositive({ message: 'VALIDATION_QUANTITY_POSITIVE' })
  quantity: number;
}

export class OrderItemDto extends LineTaxFieldsDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsString()
  @IsOptional()
  productName?: string;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @IsPositive({ message: 'VALIDATION_QUANTITY_POSITIVE' })
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
  /** Document discount as entered (gross when tax-inclusive prices) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  documentDiscountAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentChargeDto)
  charges?: DocumentChargeDto[];

  /** Vergiyi doğuran olay (YYYY-MM-DD) */
  @IsOptional()
  @Matches(TAX_POINT_PATTERN, { message: 'VALIDATION_DATE' })
  taxPointDate?: string;

  /** Actual shipment time (ISO / 'YYYY-MM-DDTHH:mm' company time) */
  @IsOptional()
  @IsString()
  shippedAt?: string;

  @IsOptional()
  @IsIn(SALES_CHANNELS)
  salesChannel?: string;

  @IsOptional()
  @IsBoolean()
  isDistanceSale?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  channelOrderRef?: string;
}

/** POST /orders/quote: prices an order without saving it or moving stock. */
export class QuoteOrderDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'ORDER_ITEMS_REQUIRED' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  /** Document discount as entered (gross when tax-inclusive prices) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  documentDiscountAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentChargeDto)
  charges?: DocumentChargeDto[];

  /** Vergiyi doğuran olay (YYYY-MM-DD) */
  @IsOptional()
  @Matches(TAX_POINT_PATTERN, { message: 'VALIDATION_DATE' })
  taxPointDate?: string;

  @IsOptional()
  @IsString()
  shippedAt?: string;

  /** Order date (default now) */
  @IsOptional()
  @IsString()
  date?: string;

  /** Order being edited / re-priced (excluded from the split-order check) */
  @IsOptional()
  @IsString()
  orderId?: string;
}
