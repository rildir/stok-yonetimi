import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsNumber, IsInt, Min, IsOptional, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Ürün adı', example: 'Kablosuz Klavye' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_NAME_REQUIRED' })
  name: string;

  @ApiProperty({ description: 'Stok Takip Kodu (SKU)', example: 'KLV-001' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SKU_REQUIRED' })
  sku: string;

  @ApiProperty({ description: 'Kategori slug', example: 'elektronik' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CATEGORY_REQUIRED' })
  category: string;

  @ApiProperty({ description: 'Ürün birim fiyatı (₺)', example: 499.90 })
  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  price: number;

  @ApiProperty({ description: 'Stok miktarı', example: 50 })
  @IsInt({ message: 'VALIDATION_QUANTITY_INT' })
  @Min(0, { message: vmsg('VALIDATION_QUANTITY_MIN', 'min') })
  quantity: number;

  @ApiProperty({ description: 'Kritik stok uyarısı verilecek minimum miktar', example: 5 })
  @IsInt({ message: 'VALIDATION_MIN_QUANTITY_INT' })
  @Min(0, { message: vmsg('VALIDATION_MIN_QUANTITY_MIN', 'min') })
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
  @IsArray({ message: 'VALIDATION_IDS_ARRAY' })
  @ArrayMinSize(1, { message: 'VALIDATION_IDS_MIN' })
  @IsString({ each: true, message: 'VALIDATION_IDS_STRING' })
  ids: string[];
}

export class BulkUpdateProductsDto {
  @ApiProperty({ description: 'Güncellenecek ürün ID listesi', example: ['uuid-1', 'uuid-2'] })
  @IsArray({ message: 'VALIDATION_IDS_ARRAY' })
  @ArrayMinSize(1, { message: 'VALIDATION_IDS_MIN' })
  @IsString({ each: true, message: 'VALIDATION_IDS_STRING' })
  ids: string[];

  @ApiProperty({ description: 'Uygulanacak güncellemeler' })
  @ValidateNested()
  @Type(() => UpdateProductDto)
  updates: UpdateProductDto;
}
