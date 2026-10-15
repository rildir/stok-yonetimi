import { vmsg } from '../shared/i18n/i18n-exception.filter';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
  IsIn,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsTimeZone,
  Matches,
  IsBoolean,
  IsInt,
  Min,
  Max,
  ValidateIf,
  IsUrl,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
  IsNumber,
  IsDefined,
} from 'class-validator';
import { COMPLIANCE_MODULES } from '../shared/tr';
import { Transform, Type } from 'class-transformer';
import { AddressDto } from './address.dto';
import { IsKepAddress, IsMersis, IsTaxIdFor } from '../shared/identity/validators';
import { BOOKKEEPING_TYPES, CORPORATE_EVENT_TYPES } from '../shared/tr';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES } from '../entities/company.entity';
import { IsStrongPassword } from '../shared/identity/validators';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Locale settings shared by registration and company update. */
export class CompanySettingsDto {
  @ApiPropertyOptional({ description: 'Ülke (ISO 3166-1 alpha-2)', example: 'TR' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string;

  @ApiPropertyOptional({ description: 'Varsayılan dil', example: 'tr', enum: SUPPORTED_LANGUAGES })
  @IsOptional()
  @Transform(lower)
  @IsIn(SUPPORTED_LANGUAGES, { message: 'VALIDATION_LANGUAGE' })
  defaultLanguage?: string;

  @ApiPropertyOptional({ description: 'Ana para birimi (ISO 4217)', example: 'TRY' })
  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  baseCurrency?: string;

  @ApiPropertyOptional({ description: 'Saat dilimi (IANA)', example: 'Europe/Istanbul' })
  @IsOptional()
  @IsTimeZone({ message: 'VALIDATION_TIMEZONE' })
  timezone?: string;
}

export class UpdateCompanyDto extends CompanySettingsDto {
  @ApiPropertyOptional({ description: 'Fiyatlar KDV dahil mi?' })
  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @ApiPropertyOptional({ description: 'Satıcı ithalatçı veya cevherden üretici: 627 demir-çelik tevkifatı uygulanmaz' })
  @IsOptional()
  @IsBoolean()
  isImporterOrOreProducer?: boolean;

  @ApiPropertyOptional({ description: 'Şirket belirlenmiş alıcıdır (KDVGUT I/C-2.1.2.1): alışlarda yalnız belirlenmiş alıcılara özgü tevkifat kodları uygulanır' })
  @IsOptional()
  @IsBoolean()
  isDesignatedBuyer?: boolean;

  @ApiPropertyOptional({ description: "Stok düşüm noktası: 'despatch' (irsaliye onayında; TR varsayılanı) | 'order' (sipariş oluşturulunca)" })
  @IsOptional()
  @IsIn(['despatch', 'order'], { message: 'STOCK_DEDUCT_MODE_INVALID' })
  stockDeductOn?: string;

  @ApiPropertyOptional({ description: 'e-Belge modu: NONE (matbu / harici numara) | PROVIDER (özel entegratör, WP5)' })
  @IsOptional()
  @IsIn(['NONE', 'PROVIDER'], { message: 'EDOCUMENT_MODE_INVALID' })
  eDocumentMode?: string;

  @ApiPropertyOptional({ description: 'Müstahsil makbuzu modülü (VUK 235)' })
  @IsOptional()
  @IsBoolean()
  producerReceiptEnabled?: boolean;

  @ApiPropertyOptional({ description: 'TCMB kurlarını her iş günü otomatik çek' })
  @IsOptional()
  @IsBoolean()
  fxAutoFetch?: boolean;

  @ApiPropertyOptional({ description: 'SKT uyarısı gün sayısı', example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  expiryAlertDays?: number;

  @ApiPropertyOptional({ description: 'Şirket adı' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_COMPANY_NAME_REQUIRED' })
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ description: 'Açık uyum modülleri (food, medicine_its, medical_device_uts, cosmetic_uts)' })
  @IsOptional()
  @IsArray()
  @IsIn(COMPLIANCE_MODULES, { each: true, message: 'COMPLIANCE_MODULE_INVALID' })
  enabledComplianceModules?: string[];

  @ApiPropertyOptional({ description: 'Bu tutarı (ana para birimi) aşan elle düzeltmeler ikinci onay ister; null = kapalı', example: 25000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_AMOUNT_INVALID' })
  @Min(0, { message: 'VALIDATION_AMOUNT_INVALID' })
  adjustmentApprovalThreshold?: number | null;

  @ApiPropertyOptional({ description: 'Stok kilit tarihi (YYYY-MM-DD): bu tarih ve öncesine stok hareketi girilemez; null = kapalı', example: '2025-12-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'STOCK_LOCK_DATE_INVALID' })
  stockLockDate?: string | null;

  @ApiPropertyOptional({ description: 'Kilit tarihini geri alma / onay eşiğini yükseltme gerekçesi (zorunlu; ikinci yönetici onayına gider)', example: 'Ekim sayım farkı düzeltmesi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  controlChangeReason?: string;

  // ─── WP6 ───

  @ApiPropertyOptional({ description: 'TETT geçmiş partilerin satışı: BLOCK | ALLOW (ALLOW ikinci yönetici onayı ister)', example: 'BLOCK' })
  @IsOptional()
  @IsIn(['BLOCK', 'ALLOW'], { message: 'VALIDATION_FIELD_IN' })
  bestBeforeSalePolicy?: string;

  @ApiPropertyOptional({ description: 'Fiziki sayım politikası: ANNUAL | TRIENNIAL_VUK190 | FIXED_VALUE_TTK66_3' })
  @IsOptional()
  @IsIn(['ANNUAL', 'TRIENNIAL_VUK190', 'FIXED_VALUE_TTK66_3'], { message: 'VALIDATION_FIELD_IN' })
  physicalCountPolicy?: string;

  @ApiPropertyOptional({ description: 'VUK 278/A imha oranı (%), Bakanlıkça tayin edilen; null = yok', example: 2.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_AMOUNT_INVALID' })
  @Min(0, { message: 'VALIDATION_AMOUNT_INVALID' })
  @Max(100, { message: 'VALIDATION_AMOUNT_INVALID' })
  destructionRatePct?: number | null;

  @ApiPropertyOptional({ description: 'İmha oranının geçerlilik sonu (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'DOCUMENT_DATE_INVALID' })
  destructionRateValidUntil?: string | null;

  @ApiPropertyOptional({ description: 'İmha oranı yazısının tarih / sayısı' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  destructionRateRef?: string | null;

  @ApiPropertyOptional({ description: 'GS1 Türkiye firma öneki (7-10 hane)', example: '8691234' })
  @IsOptional()
  @Matches(/^\d{6,11}$/, { message: 'GS1_PREFIX_INVALID' })
  gs1CompanyPrefix?: string | null;
}

export class RegisterCompanyDto extends CompanySettingsDto {
  @ApiProperty({ description: 'Şirket adı', example: 'Acme Ltd.' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_COMPANY_NAME_REQUIRED' })
  @MaxLength(120)
  companyName: string;

  @ApiProperty({ description: 'Yönetici kullanıcı adı', example: 'acme.admin' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_USERNAME_REQUIRED' })
  @MinLength(3, { message: vmsg('VALIDATION_USERNAME_MIN', 'min') })
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'VALIDATION_USERNAME_PATTERN' })
  username: string;

  @ApiProperty({ description: 'Şifre (min 10 karakter; büyük/küçük harf, rakam, sembolden en az 3 tür)' })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiProperty({ description: 'Yönetici ad soyad', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_FULL_NAME_REQUIRED' })
  fullName: string;

  @ApiPropertyOptional({ description: 'E-posta' })
  @IsOptional()
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  email?: string;
}

// ─── WP1: fiscal identity ───

const trimS = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digitsS = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value);
const presentV = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

/** PATCH /company/fiscal - every field optional (partial update); formats validated here, identity in the service. */
export class UpdateFiscalDto {
  @ApiPropertyOptional({ description: 'Ticaret unvanı', example: 'Demo Ticaret ve Sanayi A.Ş.' })
  @Transform(trimS)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string | null;

  @ApiPropertyOptional({ enum: ['VKN', 'TCKN'] })
  @Transform(upper)
  @ValidateIf(presentV)
  @IsIn(['VKN', 'TCKN'], { message: 'INVALID_IDENTITY_TYPE' })
  taxIdType?: string | null;

  @ApiPropertyOptional({ example: '4890598016' })
  @Transform(digitsS)
  @IsOptional()
  @IsString()
  @MaxLength(11)
  @IsTaxIdFor({ typeProperty: 'taxIdType', partyProperty: '__none' })
  taxId?: string | null;

  @ApiPropertyOptional({ example: '34272' })
  @Transform(trimS)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  taxOfficeCode?: string | null;

  @Transform(trimS)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  taxOfficeName?: string | null;

  @ApiPropertyOptional({ example: '0489059801600015' })
  @Transform(digitsS)
  @IsOptional()
  @IsMersis()
  mersisNo?: string | null;

  @Transform(trimS)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tradeRegistryNo?: string | null;

  @Transform(trimS)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeRegistryOffice?: string | null;

  @ApiPropertyOptional({ example: 'demoticaret@hs01.kep.tr' })
  @Transform(trimS)
  @IsOptional()
  @IsKepAddress()
  kepAddress?: string | null;

  @Transform(trimS)
  @ValidateIf(presentV)
  @IsUrl({ require_protocol: false }, { message: 'INVALID_WEBSITE' })
  @MaxLength(255)
  website?: string | null;

  @Transform(trimS)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @Transform(trimS)
  @ValidateIf(presentV)
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  email?: string | null;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto | null;

  @ApiPropertyOptional({ enum: BOOKKEEPING_TYPES })
  @Transform(upper)
  @ValidateIf(presentV)
  @IsIn(BOOKKEEPING_TYPES, { message: 'INVALID_BOOKKEEPING_TYPE' })
  bookkeepingType?: string | null;
}

// ─── WP1: e-Belge profile ───

export class GrossSalesDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0)
  amount: number;
}

export class SectorFlagDto {
  /** Checked against the EBELGE_SECTOR_RULES legal parameter (per document) by ComplianceService. */
  @IsString()
  @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'VALIDATION_FAILED' })
  code: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  since: string;
}

export class CorporateEventDto {
  @IsIn(CORPORATE_EVENT_TYPES, { message: 'VALIDATION_FAILED' })
  type: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  date: string;

  @IsOptional()
  @IsBoolean()
  counterpartyMandatory?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}

const dateOrNull = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

export class EBelgeProfileDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GrossSalesDto)
  annualGrossSales?: GrossSalesDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectorFlagDto)
  sectorFlagsEFatura?: SectorFlagDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectorFlagDto)
  sectorFlagsEIrsaliye?: SectorFlagDto[];

  @ValidateIf(dateOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  eFaturaSince?: string | null;

  @ValidateIf(dateOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  eArsivSince?: string | null;

  @ValidateIf(dateOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  eIrsaliyeSince?: string | null;

  @ValidateIf(dateOrNull)
  @IsIn(['MANDATORY', 'VOLUNTARY'], { message: 'VALIDATION_FAILED' })
  mandatoryVsVoluntary?: string | null;

  @ValidateIf(dateOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  gibWrittenNoticeDate?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorporateEventDto)
  corporateEvents?: CorporateEventDto[];
}

// ─── WP1: legal parameters (super admin) ───

export class CreateLegalParameterDto {
  @ApiPropertyOptional({ example: 'TR' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string;

  @ApiProperty({ example: 'VUK232_INVOICE_LIMIT' })
  @IsString({ message: 'LEGAL_PARAMETER_INVALID|reason=key' })
  @Matches(/^[A-Za-z0-9_]{2,64}$/, { message: 'LEGAL_PARAMETER_INVALID|reason=key' })
  key: string;

  @ApiProperty({ example: '2027-01-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  validFrom: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @ValidateIf(dateOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  validTo?: string | null;

  @ApiProperty({ description: 'Number, string or JSON value', example: 15000 })
  @IsDefined({ message: 'LEGAL_PARAMETER_INVALID|reason=value' })
  value: unknown;

  @ApiProperty({ example: 'VUK md. 232/2; 5xx Sıra No.lu VUK GT' })
  @IsString({ message: 'LEGAL_PARAMETER_INVALID|reason=sourceRef' })
  @IsNotEmpty({ message: 'LEGAL_PARAMETER_INVALID|reason=sourceRef' })
  @MaxLength(255, { message: 'LEGAL_PARAMETER_INVALID|reason=sourceRef' })
  sourceRef: string;

  @IsOptional()
  @IsIn(['high', 'medium', 'low'], { message: 'VALIDATION_FAILED' })
  confidence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
