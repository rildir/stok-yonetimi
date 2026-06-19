import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Ürün ID zorunludur.' })
  productId: string;

  @IsString()
  @IsNotEmpty({ message: 'Ürün adı zorunludur.' })
  productName: string;

  @IsInt({ message: 'Ürün adedi tam sayı olmalıdır.' })
  @Min(1, { message: 'Ürün adedi en az 1 olmalıdır.' })
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Müşteri adı zorunludur.' })
  customerName: string;

  @IsString()
  @IsNotEmpty({ message: 'Sipariş durumu zorunludur.' })
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
