import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsNumber, IsInt, Min, Max, IsOptional, IsArray, ValidateNested, ArrayMinSize, IsIn, IsBoolean, MaxLength, IsPositive, Matches, ValidateIf } from 'class-validator';
import { BARCODE_TYPES } from '../shared/inventory/barcode';
import { INVENTORY_CLASSES, REGULATORY_CATEGORIES } from '../shared/tr';
import { Transform, Type } from 'class-transformer';
import { IsISO4217CurrencyCode } from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


export class ProductUnitDto {
  @ApiProperty({ description: 'Birim ID' })
  @IsString()
  @IsNotEmpty()
  unitId: string;

  @ApiProperty({ description: '1 birim = factor temel birim', example: 12 })
  @IsNumber({}, { message: 'UNIT_FACTOR_INVALID' })
  @IsPositive({ message: 'UNIT_FACTOR_INVALID' })
  factor: number;

  @ApiPropertyOptional({ description: 'Bu birime ait barkod' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;
}

export class LotReceiptDto {
  @ApiProperty({ example: 'L2401' })
  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_REQUIRED' })
  @MaxLength(64)
  lotNumber: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  expiryDate?: string | null;

  @ApiProperty({ description: 'Temel birim cinsinden miktar' })
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @IsPositive({ message: 'VALIDATION_QUANTITY_POSITIVE' })
  quantity: number;
}

const TRACKING_TYPES = ['none', 'lot', 'serial'];

/** Barcode / tracking / unit fields shared by create and update. */
class ProductTrackingFieldsDto {
  @ApiPropertyOptional({ description: 'Barkod (EAN-13/EAN-8/UPC-A/Code128)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiPropertyOptional({ enum: BARCODE_TYPES, description: 'Boşsa otomatik algılanır' })
  @IsOptional()
  @IsIn([...BARCODE_TYPES, null, ''])
  barcodeType?: string | null;

  @ApiPropertyOptional({ enum: TRACKING_TYPES })
  @IsOptional()
  @IsIn(TRACKING_TYPES, { message: 'PRODUCT_TRACKING_INVALID' })
  trackingType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;

  @ApiPropertyOptional({ description: 'Temel birim ID' })
  @IsOptional()
  @IsString()
  baseUnitId?: string;

  @ApiPropertyOptional({ type: [ProductUnitDto], description: 'Alternatif birimler (tüm liste yer değiştirir)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  units?: ProductUnitDto[];

  @ApiPropertyOptional({ enum: REGULATORY_CATEGORIES, description: 'Düzenleyici kategori (R67)' })
  @IsOptional()
  @IsIn(REGULATORY_CATEGORIES, { message: 'REGULATORY_CATEGORY_INVALID' })
  regulatoryCategory?: string;

  @ApiPropertyOptional({ enum: INVENTORY_CLASSES, description: 'Tekdüzen hesap planı stok sınıfı' })
  @IsOptional()
  @IsIn(INVENTORY_CLASSES, { message: 'INVENTORY_CLASS_INVALID' })
  inventoryClass?: string;

  @ApiPropertyOptional({ description: 'GTIN (8/12/13/14 hane, 14 haneye tamamlanır)' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  gtin14?: string | null;

}

export class CreateProductDto extends ProductTrackingFieldsDto {
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
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @Min(0, { message: vmsg('VALIDATION_QUANTITY_MIN', 'min') })
  quantity: number;

  @ApiProperty({ description: 'Kritik stok uyarısı verilecek minimum miktar', example: 5 })
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
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

  @ApiPropertyOptional({ description: 'Fiyat para birimi (ISO 4217)', example: 'TRY' })
  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Vergi oranı ID' })
  @IsString()
  @IsOptional()
  taxRateId?: string;

  @ApiPropertyOptional({ description: 'Varsayılan KDV istisna kodu (oranı istisna olan ürünlerde zorunlu)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{3}$/, { message: 'EXEMPTION_CODE_INVALID' })
  exemptionCode?: string | null;

  @ApiPropertyOptional({ description: 'Varsayılan KDV tevkifat kodu (örn. 627 demir-çelik)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{3}$/, { message: 'WITHHOLDING_CODE_INVALID' })
  withholdingCode?: string | null;

  @ApiPropertyOptional({ description: 'ÖTV vergi kodu (0071, 0073...)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}$/, { message: 'OTV_CODE_INVALID' })
  otvCode?: string | null;

  @ApiPropertyOptional({ description: 'ÖTV oranı (%)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  otvRate?: number | null;

  @ApiPropertyOptional({ description: 'Stok girişinin yapılacağı depo ID (varsayılan: ilk depo)' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ type: [LotReceiptDto], description: 'Lot takipli ürünün açılış stoğu' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LotReceiptDto)
  lots?: LotReceiptDto[];

  @ApiPropertyOptional({ description: 'Seri takipli ürünün açılış seri numaraları' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class UpdateProductDto extends ProductTrackingFieldsDto {
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

  @ApiPropertyOptional({ description: 'Salt okunur: stok yalnızca POST /stock-movements/adjust ile değişir; farklı bir değer PRODUCT_QUANTITY_USE_ADJUSTMENT döner' })
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Minimum stok miktarı' })
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
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

  @ApiPropertyOptional({ description: 'Fiyat para birimi (ISO 4217)', example: 'TRY' })
  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Vergi oranı ID' })
  @IsString()
  @IsOptional()
  taxRateId?: string;

  @ApiPropertyOptional({ description: 'Varsayılan KDV istisna kodu (oranı istisna olan ürünlerde zorunlu)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{3}$/, { message: 'EXEMPTION_CODE_INVALID' })
  exemptionCode?: string | null;

  @ApiPropertyOptional({ description: 'Varsayılan KDV tevkifat kodu (örn. 627 demir-çelik)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{3}$/, { message: 'WITHHOLDING_CODE_INVALID' })
  withholdingCode?: string | null;

  @ApiPropertyOptional({ description: 'ÖTV vergi kodu (0071, 0073...)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}$/, { message: 'OTV_CODE_INVALID' })
  otvCode?: string | null;

  @ApiPropertyOptional({ description: 'ÖTV oranı (%)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  otvRate?: number | null;

  @ApiPropertyOptional({ description: 'Stok girişinin yapılacağı depo ID (varsayılan: ilk depo)' })
  @IsString()
  @IsOptional()
  warehouseId?: string;
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
