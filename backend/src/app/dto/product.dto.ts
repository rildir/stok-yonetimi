import { IsString, IsNotEmpty, IsNumber, IsInt, Min } from 'class-validator';

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
}

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsNotEmpty()
  sku?: string;

  @IsString()
  @IsNotEmpty()
  category?: string;

  @IsNumber()
  @Min(0)
  price?: number;

  @IsInt()
  @Min(0)
  quantity?: number;

  @IsInt()
  @Min(0)
  minQuantity?: number;
}
