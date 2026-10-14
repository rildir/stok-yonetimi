import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsBoolean, IsISO31661Alpha2, IsISO4217CurrencyCode, IsDateString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value);
const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

export class CreateTaxRateDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_TAX_NAME_REQUIRED' })
  @MaxLength(100)
  name: string;

  @IsNumber({}, { message: 'VALIDATION_TAX_RATE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_TAX_RATE_RANGE', 'min') })
  @Max(100, { message: vmsg('VALIDATION_TAX_RATE_RANGE', 'max') })
  rate: number;

  @Transform(upper)
  @ValidateIf(present)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_TAX_NAME_REQUIRED' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber({}, { message: 'VALIDATION_TAX_RATE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_TAX_RATE_RANGE', 'min') })
  @Max(100, { message: vmsg('VALIDATION_TAX_RATE_RANGE', 'max') })
  rate?: number;

  @Transform(upper)
  @ValidateIf(present)
  @IsISO31661Alpha2({ message: 'VALIDATION_COUNTRY_CODE' })
  country?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateExchangeRateDto {
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  baseCurrency: string;

  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  quoteCurrency: string;

  @IsNumber({}, { message: 'VALIDATION_EXCHANGE_RATE_POSITIVE' })
  @Min(0.000001, { message: 'VALIDATION_EXCHANGE_RATE_POSITIVE' })
  rate: number;

  /** YYYY-MM-DD; defaults to today */
  @IsOptional()
  @IsDateString({}, { message: 'VALIDATION_DATE' })
  date?: string;
}

export class UpdateExchangeRateDto {
  @IsOptional()
  @IsNumber({}, { message: 'VALIDATION_EXCHANGE_RATE_POSITIVE' })
  @Min(0.000001, { message: 'VALIDATION_EXCHANGE_RATE_POSITIVE' })
  rate?: number;

  @IsOptional()
  @IsDateString({}, { message: 'VALIDATION_DATE' })
  date?: string;
}
