import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_ITEM_PRODUCT_NAME_REQUIRED' })
  productName: string;

  @IsInt({ message: 'VALIDATION_ITEM_QUANTITY_INT' })
  @Min(1, { message: vmsg('VALIDATION_ITEM_QUANTITY_MIN', 'min') })
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CUSTOMER_NAME_REQUIRED' })
  customerName: string;

  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_ORDER_STATUS_REQUIRED' })
  status: 'Completed' | 'Pending' | 'Cancelled' | string;

  @IsArray()
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
