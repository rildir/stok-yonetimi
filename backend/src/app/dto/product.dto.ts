import { IsString, IsNotEmpty, IsNumber, IsInt, Min, IsOptional, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Ürün adı boş olamaz.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'SKU kodu boş olamaz.' })
  sku: string;

  @IsString()
  @IsNotEmpty({ message: 'Kategori boş olamaz.' })
  category: string;

  @IsNumber({}, { message: 'Fiyat geçerli bir sayı olmalıdır.' })
  @Min(0, { message: 'Fiyat en az 0 olmalıdır.' })
  price: number;

  @IsInt({ message: 'Miktar bir tam sayı olmalıdır.' })
  @Min(0, { message: 'Miktar en az 0 olmalıdır.' })
  quantity: number;

  @IsInt({ message: 'Minimum miktar bir tam sayı olmalıdır.' })
  @Min(0, { message: 'Minimum miktar en az 0 olmalıdır.' })
  minQuantity: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  supplierId?: string;
}

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  category?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minQuantity?: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  supplierId?: string;
}

export class BulkDeleteProductsDto {
  @IsArray({ message: 'IDs bir dizi olmalıdır.' })
  @ArrayMinSize(1, { message: 'En az bir ID seçilmelidir.' })
  @IsString({ each: true, message: 'Her bir ID string olmalıdır.' })
  ids: string[];
}

export class BulkUpdateProductsDto {
  @IsArray({ message: 'IDs bir dizi olmalıdır.' })
  @ArrayMinSize(1, { message: 'En az bir ID seçilmelidir.' })
  @IsString({ each: true, message: 'Her bir ID string olmalıdır.' })
  ids: string[];

  @ValidateNested()
  @Type(() => UpdateProductDto)
  updates: UpdateProductDto;
}
