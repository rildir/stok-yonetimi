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
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES } from '../entities/company.entity';

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

  @ApiPropertyOptional({ description: 'Şirket adı' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_COMPANY_NAME_REQUIRED' })
  @MaxLength(120)
  name?: string;
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

  @ApiProperty({ description: 'Şifre (Min 6 karakter)' })
  @IsString()
  @MinLength(6, { message: vmsg('VALIDATION_PASSWORD_MIN', 'min') })
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
