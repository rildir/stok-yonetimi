import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsNumber, IsOptional, IsISO4217CurrencyCode, IsPositive, MaxLength, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, ArrayMinSize } from 'class-validator';
import { DocumentChargeDto, LineTaxFieldsDto, IsDateKey } from './tax.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class PurchaseOrderItemDto extends LineTaxFieldsDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_ID_REQUIRED' })
  productId: string;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @IsPositive({ message: 'VALIDATION_QUANTITY_POSITIVE' })
  quantity: number;

  /** Unit price in PO currency (legacy name; same as unitPrice) */
  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  @IsOptional()
  price?: number;

  @IsNumber({}, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  @IsOptional()
  unitPrice?: number;

  /** Unit the quantity / unitPrice refer to (default: product base unit) */
  @IsString()
  @IsOptional()
  unitId?: string;

  /** Service bought from a foreign supplier: VAT declared on KDV-2 (sorumlu sıfatıyla) */
  @IsOptional()
  @IsBoolean()
  reverseCharge?: boolean;
}

/** Discounts, charges, tax point and import (customs declaration) fields of a purchase order. */
export class PurchaseOrderTaxFieldsDto {
  /** Document discount as entered (gross when tax-inclusive prices) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  documentDiscountAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentChargeDto)
  charges?: DocumentChargeDto[];

  /** Vergiyi doğuran olay (YYYY-MM-DD) */
  @IsOptional()
  @IsDateKey()
  taxPointDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customsDeclarationNo?: string | null;

  @IsOptional()
  @IsDateKey()
  customsDeclarationDate?: string | null;

  /** Import VAT paid on the customs declaration (TRY) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  importVatAmount?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'VALIDATION_PRICE_NUMBER' })
  @Min(0, { message: vmsg('VALIDATION_PRICE_MIN', 'min') })
  nonDeductibleImportVat?: number | null;
}

export class CreatePurchaseOrderDto extends PurchaseOrderTaxFieldsDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_ID_REQUIRED' })
  supplierId: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  /** Warehouse that receives the goods (default warehouse when omitted) */
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expectedDate?: string;
}

export class UpdatePurchaseOrderDto extends PurchaseOrderTaxFieldsDto {
  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @IsOptional()
  items?: PurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expectedDate?: string;
}

export class PoReceiptLotDto {
  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_REQUIRED' })
  lotNumber: string;

  @IsOptional()
  @IsString()
  expiryDate?: string | null;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_QUANTITY_DECIMAL' })
  @IsPositive({ message: 'VALIDATION_QUANTITY_POSITIVE' })
  quantity: number;
}

/** Lot / serial capture for one PO line (quantities in base units). */
export class PoReceiptDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoReceiptLotDto)
  lots?: PoReceiptLotDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class UpdatePurchaseOrderStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  /** Warehouse that receives the goods when status becomes Received */
  @IsString()
  @IsOptional()
  warehouseId?: string;

  /** Required for lot/serial tracked lines when receiving */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoReceiptDto)
  receipts?: PoReceiptDto[];

  /** When the goods were actually received (ISO / 'YYYY-MM-DDTHH:mm' company time / 'YYYY-MM-DD'); default now */
  @IsOptional()
  @IsString()
  transactionDate?: string | null;

  /** Supplier's delivery document (irsaliye / fatura) number and date */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documentNo?: string | null;

  @IsOptional()
  @IsDateKey({ message: 'DOCUMENT_DATE_INVALID' })
  documentDate?: string | null;

  @IsOptional()
  @IsIn(['DESPATCH', 'INVOICE', 'GOODS_RECEIPT', 'OTHER', null, ''], { message: 'DOCUMENT_TYPE_INVALID' })
  documentType?: string | null;
}

/** POST /purchase-orders/quote */
export class QuotePurchaseOrderDto extends PurchaseOrderTaxFieldsDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_ID_REQUIRED' })
  supplierId: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: 'VALIDATION_CURRENCY_CODE' })
  currency?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'PO_ITEMS_REQUIRED' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  /** Purchase order being edited (default: new) */
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;
}
