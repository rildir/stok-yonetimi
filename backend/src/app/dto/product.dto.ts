import { IsString, IsNotEmpty, IsNumber, IsInt, Min, IsOptional, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Ürün adı', example: 'Kablosuz Klavye' })
  @IsString()
  @IsNotEmpty({ message: 'Ürün adı boş olamaz.' })
  name: string;

  @ApiProperty({ description: 'Stok Takip Kodu (SKU)', example: 'KLV-001' })
  @IsString()
  @IsNotEmpty({ message: 'SKU kodu boş olamaz.' })
  sku: string;

  @ApiProperty({ description: 'Kategori slug', example: 'elektronik' })
  @IsString()
  @IsNotEmpty({ message: 'Kategori boş olamaz.' })
  category: string;

  @ApiProperty({ description: 'Ürün birim fiyatı (₺)', example: 499.90 })
  @IsNumber({}, { message: 'Fiyat geçerli bir sayı olmalıdır.' })
  @Min(0, { message: 'Fiyat en az 0 olmalıdır.' })
  price: number;

  @ApiProperty({ description: 'Stok miktarı', example: 50 })
  @IsInt({ message: 'Miktar bir tam sayı olmalıdır.' })
  @Min(0, { message: 'Miktar en az 0 olmalıdır.' })
  quantity: number;

  @ApiProperty({ description: 'Kritik stok uyarısı verilecek minimum miktar', example: 5 })
  @IsInt({ message: 'Minimum miktar bir tam sayı olmalıdır.' })
  @Min(0, { message: 'Minimum miktar en az 0 olmalıdır.' })
  minQuantity: number;

  @ApiPropertyOptional({ description: 'Görsel URL adresi' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Birim türü (Adet, Kg, Kutu)', example: 'Adet' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ description: 'Tedarikçi ID' })
  @IsString()
  @IsOptional()
  supplierId?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Ürün adı' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'SKU kodu' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ description: 'Kategori slug' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Birim fiyatı' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: 'Stok miktarı' })
  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Minimum stok miktarı' })
  @IsInt()
  @Min(0)
  @IsOptional()
  minQuantity?: number;

  @ApiPropertyOptional({ description: 'Görsel URL adresi' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Birim' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ description: 'Tedarikçi ID' })
  @IsString()
  @IsOptional()
  supplierId?: string;
}

export class BulkDeleteProductsDto {
  @ApiProperty({ description: 'Silinecek ürün ID listesi', example: ['uuid-1', 'uuid-2'] })
  @IsArray({ message: 'IDs bir dizi olmalıdır.' })
  @ArrayMinSize(1, { message: 'En az bir ID seçilmelidir.' })
  @IsString({ each: true, message: 'Her bir ID string olmalıdır.' })
  ids: string[];
}

export class BulkUpdateProductsDto {
  @ApiProperty({ description: 'Güncellenecek ürün ID listesi', example: ['uuid-1', 'uuid-2'] })
  @IsArray({ message: 'IDs bir dizi olmalıdır.' })
  @ArrayMinSize(1, { message: 'En az bir ID seçilmelidir.' })
  @IsString({ each: true, message: 'Her bir ID string olmalıdır.' })
  ids: string[];

  @ApiProperty({ description: 'Uygulanacak güncellemeler' })
  @ValidateNested()
  @Type(() => UpdateProductDto)
  updates: UpdateProductDto;
}
