import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsNumber, Min, Max, IsOptional, IsIn, MaxLength, Matches, ValidateIf, IsBoolean, ValidateBy, ValidationOptions } from 'class-validator';
import { CHARGE_TYPES } from '../shared/finance/tax';
import { isDateKey } from '../shared/tr';

const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

export const TAX_POINT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD (rejects 2026-02-30, 2026-13-45); message VALIDATION_DATE. */
export function IsDateKey(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy({ name: 'isDateKey', validator: { validate: (v: unknown) => isDateKey(v), defaultMessage: () => 'VALIDATION_DATE' } }, { message: 'VALIDATION_DATE', ...options });
}
export const SALES_CHANNELS = ['STORE', 'WEB', 'MARKETPLACE', 'PHONE', 'B2B', 'OTHER'];

/** Additional charge of a document (KDVK 24/b). Amount as entered (gross when tax-inclusive prices). */
export class DocumentChargeDto {
  @IsIn(CHARGE_TYPES)
  type: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

/** Line tax / discount fields shared by order and purchase order lines. */
export class LineTaxFieldsDto {
  /** Line discount % (0-100) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_DISCOUNT_RANGE' })
  @Min(0, { message: 'VALIDATION_DISCOUNT_RANGE' })
  @Max(100, { message: 'VALIDATION_DISCOUNT_RANGE' })
  discountRate?: number | null;

  /** Line discount amount as entered (overrides discountRate) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  discountAmount?: number | null;

  /** KDV exemption code (required for 0 % lines in TR) */
  @IsOptional()
  @ValidateIf(present)
  @Matches(/^\d{3}$/, { message: 'EXEMPTION_CODE_INVALID' })
  exemptionCode?: string | null;

  /** KDV withholding code; '' switches the product's default code off for this line */
  @IsOptional()
  @ValidateIf(present)
  @Matches(/^\d{3}$/, { message: 'WITHHOLDING_CODE_INVALID' })
  withholdingCode?: string | null;
}

/** PUT /orders/:id/tax-point */
export class TaxPointDto {
  @IsOptional()
  @IsDateKey()
  taxPointDate?: string;

  /** Actual shipment time (ISO / 'YYYY-MM-DDTHH:mm' company time) */
  @IsOptional()
  @IsString()
  shippedAt?: string;
}

/** POST /admin/tax-codes/:kind - a new version of a code list row (super administrator). */
export class AddTaxCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  nameTr: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  nameEn: string;

  @IsDateKey()
  validFrom: string;

  @IsOptional()
  @IsDateKey()
  validTo?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  codeListVersion: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sourceRef: string;

  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  confidence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  // exemption codes
  @IsOptional()
  @IsIn(['PARTIAL', 'FULL', 'EXPORT_REGISTERED', 'OTHER'])
  type?: string;

  @IsOptional()
  @IsIn(['ISTISNA', 'IHRACKAYITLI', 'SATIS'])
  invoiceType?: string;

  @IsOptional()
  @IsBoolean()
  vatCalculatedNotCollected?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresForeignBuyer?: boolean;

  // withholding codes
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  numerator?: number;

  @IsOptional()
  @IsIn(['SERVICE', 'DELIVERY', 'FULL'])
  scope?: string;

  @IsOptional()
  @IsBoolean()
  requiresDesignatedBuyer?: boolean;

  @IsOptional()
  @IsBoolean()
  exemptForImporterOrOreProducer?: boolean;

  // ÖTV codes
  @IsOptional()
  @IsString()
  @MaxLength(10)
  list?: string;
}
