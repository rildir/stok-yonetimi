import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength, ValidateNested, IsIn, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MOVEMENT_DOCUMENT_TYPES, MOVEMENT_REASON_CODES } from '../shared/tr';

export class AttachmentDto {
  @ApiProperty({ example: 'zayi-tutanagi.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(100)
  mimeType: string;

  @ApiProperty({ description: 'Base64 file content (max 5 MB)' })
  @IsString()
  dataBase64: string;
}

export class AdjustStockDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PRODUCT_REQUIRED' })
  productId: string;

  @ApiProperty({ example: 12.5, description: 'Target quantity (warehouse / lot / product total) in the base unit' })
  @Type(() => Number)
  @IsNumber({}, { message: 'QUANTITY_INVALID' })
  @Min(0, { message: 'QUANTITY_INVALID' })
  newQuantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @ApiPropertyOptional({ description: 'Lot-tracked products: the lot to set' })
  @IsOptional()
  @IsString()
  lotId?: string | null;

  /** Validated in the service (REASON_CODE_INVALID / REASON_NOT_MANUAL / REASON_DIRECTION_MISMATCH). */
  @ApiProperty({ enum: MOVEMENT_REASON_CODES })
  @IsNotEmpty({ message: 'REASON_CODE_REQUIRED' })
  reasonCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_NOTE_REQUIRED' })
  @MaxLength(255)
  note: string;

  @ApiPropertyOptional({ description: "ISO timestamp, 'YYYY-MM-DDTHH:mm' (company time) or 'YYYY-MM-DD'" })
  @IsOptional()
  @IsString()
  transactionDate?: string | null;

  @ApiPropertyOptional({ enum: MOVEMENT_DOCUMENT_TYPES })
  @IsOptional()
  @IsIn([...MOVEMENT_DOCUMENT_TYPES, null, ''], { message: 'DOCUMENT_TYPE_INVALID' })
  documentType?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documentNo?: string | null;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'DOCUMENT_DATE_INVALID' })
  documentDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  counterpartyTaxId?: string | null;

  @ApiPropertyOptional({ type: AttachmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto | null;
}

export class ReverseMovementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'REVERSAL_NOTE_REQUIRED' })
  @MaxLength(255)
  note: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionDate?: string | null;
}

export class DecideAdjustmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
