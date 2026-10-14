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
  @IsISO31661Alpha2({ message: 'Geçerli bir ülke kodu girin (ör. TR, US).' })
  country?: string;

  @ApiPropertyOptional({ description: 'Varsayılan dil', example: 'tr', enum: SUPPORTED_LANGUAGES })
  @IsOptional()
  @Transform(lower)
  @IsIn(SUPPORTED_LANGUAGES, { message: 'Dil "tr" veya "en" olmalıdır.' })
  defaultLanguage?: string;

  @ApiPropertyOptional({ description: 'Ana para birimi (ISO 4217)', example: 'TRY' })
  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'Geçerli bir para birimi kodu girin (ör. TRY, USD).' })
  baseCurrency?: string;

  @ApiPropertyOptional({ description: 'Saat dilimi (IANA)', example: 'Europe/Istanbul' })
  @IsOptional()
  @IsTimeZone({ message: 'Geçerli bir saat dilimi girin (ör. Europe/Istanbul).' })
  timezone?: string;
}

export class UpdateCompanyDto extends CompanySettingsDto {
  @ApiPropertyOptional({ description: 'Şirket adı' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Şirket adı boş olamaz.' })
  @MaxLength(120)
  name?: string;
}

export class RegisterCompanyDto extends CompanySettingsDto {
  @ApiProperty({ description: 'Şirket adı', example: 'Acme Ltd.' })
  @IsString()
  @IsNotEmpty({ message: 'Şirket adı boş olamaz.' })
  @MaxLength(120)
  companyName: string;

  @ApiProperty({ description: 'Yönetici kullanıcı adı', example: 'acme.admin' })
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  @MinLength(3, { message: 'Kullanıcı adı en az 3 karakter olmalıdır.' })
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.' })
  username: string;

  @ApiProperty({ description: 'Şifre (Min 6 karakter)' })
  @IsString()
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır.' })
  password: string;

  @ApiProperty({ description: 'Yönetici ad soyad', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Ad soyad boş olamaz.' })
  fullName: string;

  @ApiPropertyOptional({ description: 'E-posta' })
  @IsOptional()
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  email?: string;
}
