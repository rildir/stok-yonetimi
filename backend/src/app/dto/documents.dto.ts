import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { IsDateKey } from './tax.dto';
import {
  DESPATCH_PURPOSES,
  DOCUMENT_KINDS,
  EXPENSE_VOUCHER_KINDS,
  NUMBERING_MODES,
  PAPER_REASONS,
  PAYMENT_CHANNELS,
  REFUND_CHANNELS,
  REJECT_REASONS,
  RETURN_CONDITIONS,
  RETURN_TYPES,
  NOTICE_CHANNELS,
} from '../shared/tr';

const QTY = { maxDecimalPlaces: 4 };

export class LotPickDto {
  @IsString()
  lotId: string;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0.0001, { message: 'QUANTITY_INVALID' })
  quantity: number;
}

export class LotReceiptDto {
  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_REQUIRED' })
  @MaxLength(100)
  lotNumber: string;

  @IsOptional()
  @IsDateKey()
  expiryDate?: string | null;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0.0001, { message: 'QUANTITY_INVALID' })
  quantity: number;

  /** WP6 food traceability: production date and the supplier's own lot number */
  @IsOptional()
  @IsDateKey()
  productionDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierLotNumber?: string | null;
}

export class DriverDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName: string;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'DRIVER_TCKN_INVALID' })
  tckn: string;
}

export class PlateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plate: string;

  @IsOptional()
  @IsIn(['TRUCK', 'TRAILER'])
  type?: string;

  /** Foreign registration (no TR plate format check) */
  @IsOptional()
  @IsBoolean()
  foreign?: boolean;
}

export class CarrierPartyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Matches(/^(\d{10}|\d{11})$/, { message: 'INVALID_VKN' })
  taxId?: string | null;
}

export class DespatchLineDto {
  @IsOptional()
  @IsString()
  orderItemId?: string | null;

  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  quantity: number;

  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LotPickDto)
  lots?: LotPickDto[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[] | null;
}

/** Transport / paper fields shared by create and update. */
export class DespatchFieldsDto {
  @ApiPropertyOptional({ description: 'Fiili sevk tarihi ve saati (YYYY-MM-DDTHH:mm, şirket saat dilimi)' })
  @IsOptional()
  @IsString()
  actualDespatchAt?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CarrierPartyDto)
  carrierParty?: CarrierPartyDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverDto)
  drivers?: DriverDto[] | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlateDto)
  plates?: PlateDto[] | null;

  @IsOptional()
  @IsObject()
  deliveryAddress?: Record<string, unknown> | null;

  @IsOptional()
  @IsIn(['SEVK', 'MATBUDAN'])
  typeCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  paperNo?: string | null;

  @IsOptional()
  @IsDateKey()
  paperDate?: string | null;

  @IsOptional()
  @IsIn(PAPER_REASONS as unknown as string[], { message: 'PAPER_REASON_REQUIRED' })
  paperReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gibNoticeRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  seriesCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  sourceWarehouseId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DespatchLineDto)
  lines?: DespatchLineDto[];
}

/** POST /orders/:id/despatch */
export class OrderDespatchDto extends DespatchFieldsDto {}

/** POST /despatches (transfer, consignment, repair, sample, subcontract, return) */
export class CreateDespatchDto extends DespatchFieldsDto {
  @IsIn(DESPATCH_PURPOSES as unknown as string[])
  purpose: string;

  @IsOptional()
  @IsString()
  targetWarehouseId?: string | null;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  supplierId?: string | null;
}

export class ApproveDespatchDto {
  @IsOptional()
  @IsString()
  actualDespatchAt?: string | null;

  @ApiPropertyOptional({ description: 'e-Belge modu kapalıyken harici / matbu irsaliye numarası (yoksa matbu seriden verilir)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  externalDocNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  seriesCode?: string | null;

  @ApiPropertyOptional({ description: 'e-İrsaliye zorunluyken matbu seri kullanımı için 509 V.7 gerekçesi (a-ç)' })
  @IsOptional()
  @IsIn(PAPER_REASONS as unknown as string[])
  paperReason?: string | null;
}

export class ReceiveDespatchDto {
  @IsOptional()
  @IsString()
  receivedAt?: string | null;
}

export class InternetSaleInfoDto {
  @IsOptional() @IsString() @MaxLength(255) webAddress?: string | null;
  @IsOptional() @IsString() @MaxLength(50) paymentMethod?: string | null;
  @IsOptional() @IsDateKey() paymentDate?: string | null;
  @IsOptional() @IsString() @MaxLength(255) carrierName?: string | null;
  @IsOptional() @Matches(/^(\d{10}|\d{11})$/, { message: 'INVALID_VKN' }) carrierTaxId?: string | null;
  @IsOptional() @IsDateKey() shipmentDate?: string | null;
}

export class InvoiceLinePickDto {
  @IsString()
  orderItemId: string;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  quantity: number;
}

export class InvoiceDraftDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLinePickDto)
  lines?: InvoiceLinePickDto[];

  @IsOptional()
  @IsString()
  @MaxLength(3)
  seriesCode?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => InternetSaleInfoDto)
  internetSaleInfo?: InternetSaleInfoDto | null;

  @IsOptional()
  @IsBoolean()
  replacesDespatch?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class InvoiceFromDespatchesDto extends InvoiceDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  despatchIds: string[];
}

export class IssueInvoiceDto {
  @IsOptional() @IsDateKey() issueDate?: string | null;
  @IsOptional() @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'VALIDATION_FIELD_FORMAT' }) issueTime?: string | null;
  @ApiPropertyOptional({ description: 'e-Belge modu kapalı: harici sistemdeki (GİB portalı / muhasebe) fatura numarası; boşsa matbu seriden verilir' })
  @IsOptional() @IsString() @MaxLength(50) externalDocNo?: string | null;
  @IsOptional() @IsDateKey() externalDocDate?: string | null;
  @IsOptional() @IsString() @MaxLength(3) seriesCode?: string | null;
  @ApiPropertyOptional({ description: 'Teslimden 7 günden sonra düzenleme için açık onay (VUK 231/5)' })
  @IsOptional() @IsBoolean() lateConfirm?: boolean;
  @IsOptional() @IsBoolean() paperFallback?: boolean;
  @IsOptional() @IsIn(PAPER_REASONS as unknown as string[], { message: 'PAPER_REASON_REQUIRED' }) paperReason?: string | null;
  @IsOptional() @IsString() @MaxLength(100) gibNoticeRef?: string | null;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() @MaxLength(3) seriesCode?: string | null;
  @IsOptional() @ValidateNested() @Type(() => InternetSaleInfoDto) internetSaleInfo?: InternetSaleInfoDto | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() replacesDespatch?: boolean;
}

/** e-Fatura cancellation / objection notice (TTK 18/3; WP5). */
export class EDocNoticeFields {
  @IsOptional() @IsIn([...NOTICE_CHANNELS], { message: 'NOTICE_CHANNEL_INVALID' }) noticeChannel?: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'DOCUMENT_DATE_INVALID' }) noticeDate?: string | null;
  @IsOptional() @IsString() @MaxLength(100) noticeRef?: string | null;
}

export class CancelDocumentDto extends EDocNoticeFields {
  @IsString()
  @IsNotEmpty({ message: 'CANCEL_REASON_REQUIRED' })
  @MaxLength(500)
  reason: string;
}

export class ObjectionDto extends EDocNoticeFields {
  @IsBoolean()
  objection: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class ReturnLineDto {
  @IsOptional() @IsString() invoiceLineId?: string | null;
  @IsOptional() @IsString() goodsReceiptItemId?: string | null;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0.0001, { message: 'QUANTITY_INVALID' })
  quantity: number;

  @IsOptional() @IsIn(RETURN_CONDITIONS as unknown as string[]) condition?: string | null;
  @IsOptional() @IsString() targetWarehouseId?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LotReceiptDto) lots?: LotReceiptDto[] | null;
  @IsOptional() @IsArray() @IsString({ each: true }) serials?: string[] | null;
}

export class CreateReturnDto {
  @IsIn(RETURN_TYPES as unknown as string[])
  type: string;

  @IsOptional() @IsString() invoiceId?: string | null;
  @IsOptional() @IsString() goodsReceiptId?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'RETURN_LINES_REQUIRED' })
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];

  @IsOptional() @IsIn(REFUND_CHANNELS as unknown as string[]) refundChannel?: string | null;
  @IsOptional() @IsString() @MaxLength(100) refundRef?: string | null;
  @IsOptional() @IsString() @MaxLength(50) counterpartyDocNo?: string | null;
  @IsOptional() @IsDateKey() counterpartyDocDate?: string | null;
  @IsOptional() @IsString() @MaxLength(36) counterpartyEttn?: string | null;
  @ApiPropertyOptional({ description: 'Cayma / iade bildirimi zamanı (şirket saat dilimi)' })
  @IsOptional() @IsString() notifiedAt?: string | null;
  @ApiPropertyOptional({ description: 'Cayma: malın ön bilgilendirmede belirtilen taşıyıcıya teslim edildiği gün (iade süresi başlangıcı, Mesafeli Sözl. Yön. md. 12/1)' })
  @IsOptional() @IsDateKey() goodsHandedOverDate?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}

export class CompleteReturnDto {
  @IsOptional() @IsString() goodsMovedAt?: string | null;
  @ApiPropertyOptional({ description: 'Cayma: malın belirtilen taşıyıcıya teslim edildiği gün; boşsa malın satıcıya ulaştığı gün esas alınır' })
  @IsOptional() @IsDateKey() goodsHandedOverDate?: string | null;
}

export class ReturnRefundDto {
  @IsOptional() @IsString() @MaxLength(100) refundRef?: string | null;
  @IsOptional() @IsString() @MaxLength(50) counterpartyDocNo?: string | null;
  @IsOptional() @IsDateKey() counterpartyDocDate?: string | null;
  @IsOptional() @IsString() @MaxLength(36) counterpartyEttn?: string | null;
}

export class GoodsReceiptLineDto {
  @IsString()
  purchaseOrderItemId: string;

  @IsOptional()
  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  despatchQuantity?: number | null;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  countedQuantity: number;

  @IsOptional()
  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  rejectedQuantity?: number | null;

  @IsOptional() @IsIn(REJECT_REASONS as unknown as string[]) rejectReason?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LotReceiptDto) lots?: LotReceiptDto[] | null;
  @IsOptional() @IsArray() @IsString({ each: true }) serials?: string[] | null;
}

export class SupplierInvoiceDto {
  @IsOptional() @IsString() @MaxLength(50) supplierInvoiceNo?: string | null;
  @IsOptional() @IsDateKey() supplierInvoiceDate?: string | null;
  @IsOptional() @IsString() @MaxLength(36) supplierInvoiceEttn?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) supplierInvoiceAmount?: number | null;
}

export class CreateGoodsReceiptDto extends SupplierInvoiceDto {
  @IsOptional() @IsString() warehouseId?: string | null;
  @ApiPropertyOptional({ description: 'Fiili teslim alma zamanı (şirket saat dilimi)' })
  @IsOptional() @IsString() receivedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(50) supplierDespatchNo?: string | null;
  @IsOptional() @IsDateKey() supplierDespatchDate?: string | null;
  @IsOptional() @IsString() @MaxLength(36) supplierDespatchEttn?: string | null;
  @IsOptional() @IsBoolean() buyerCarries?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsOptional() @IsBoolean() complete?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'GOODS_RECEIPT_LINES_REQUIRED' })
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];
}

export class OwnDespatchDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DriverDto) drivers?: DriverDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlateDto) plates?: PlateDto[];
  @IsOptional() @IsString() actualDespatchAt?: string | null;
}

export class ExpenseVoucherLineDto {
  @IsOptional() @IsString() productId?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(255) description: string;
  @IsNumber(QTY, { message: 'QUANTITY_INVALID' }) @Min(0.0001, { message: 'QUANTITY_INVALID' }) quantity: number;
  @IsOptional() @IsString() @MaxLength(20) unitCode?: string | null;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() amount?: number;
}

export class SellerDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @IsOptional() @IsIn(['TCKN', 'VKN', 'YKN', 'FOREIGN', 'ANONYMOUS']) taxIdType?: string | null;
  @IsOptional() @IsString() @MaxLength(20) taxId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) addressText?: string | null;
}

export class ExpenseVoucherDto {
  @IsOptional() @IsIn(EXPENSE_VOUCHER_KINDS as unknown as string[]) kind?: string;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @ValidateNested() @Type(() => SellerDto) seller?: SellerDto | null;
  @IsOptional() @IsString() goodsReceiptId?: string | null;
  @IsOptional() @IsDateKey() deliveryDate?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExpenseVoucherLineDto) lines?: ExpenseVoucherLineDto[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) withholdingRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) otherDeductions?: number | null;
  @IsOptional() @IsIn(PAYMENT_CHANNELS as unknown as string[]) paymentChannel?: string | null;
  @IsOptional() @IsString() @MaxLength(100) paymentRef?: string | null;
  @IsOptional() @IsDateKey() paidAt?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}

export class IssueVoucherDto {
  @IsOptional() @IsDateKey() issueDate?: string | null;
  @IsOptional() @IsString() @MaxLength(50) externalDocNo?: string | null;
  @IsOptional() @IsString() @MaxLength(3) seriesCode?: string | null;
}

export class SignedCopyDto {
  @IsBoolean() received: boolean;
  @IsOptional() @IsString() @MaxLength(100) paymentRef?: string | null;
  @IsOptional() @IsDateKey() paidAt?: string | null;
}

export class CreateSeriesDto {
  @IsIn(DOCUMENT_KINDS as unknown as string[])
  kind: string;

  @IsIn(NUMBERING_MODES as unknown as string[])
  mode: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{1,3}$/, { message: 'SERIES_CODE_INVALID' })
  seriesCode: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) note?: string | null;
}

export class UpdateSeriesDto {
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) note?: string | null;
}

export class OkcReceiptDto {
  @IsOptional() @IsString() @MaxLength(50) okcReceiptNo?: string | null;
  @IsOptional() @IsDateKey() okcReceiptDate?: string | null;
}

