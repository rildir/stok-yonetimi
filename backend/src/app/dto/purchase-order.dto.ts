import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Ürün ID zorunludur.' })
  productId: string;

  @IsInt({ message: 'Ürün adedi tam sayı olmalıdır.' })
  @Min(1, { message: 'Ürün adedi en az 1 olmalıdır.' })
  quantity: number;

  @IsNumber({}, { message: 'Fiyat geçerli bir sayı olmalıdır.' })
  @Min(0, { message: 'Fiyat en az 0 olmalıdır.' })
  @IsOptional()
  price?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Tedarikçi ID zorunludur.' })
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
