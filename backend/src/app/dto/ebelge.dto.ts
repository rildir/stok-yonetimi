import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { APP_RESPONSE_CODES, EARSIV_DELIVERY_CHANNELS, EBELGE_ENVIRONMENTS } from '../shared/tr';

export class EBelgeSettingsDto {
  @IsOptional() @IsString() @MaxLength(30) provider?: string | null;
  @IsOptional() @IsIn([...EBELGE_ENVIRONMENTS]) environment?: string;
  /** Free-form adapter options; values equal to their mask keep the stored secret */
  @IsOptional() @IsObject() credentials?: Record<string, unknown> | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'DOCUMENT_DATE_INVALID' }) sealDeclarationDate?: string | null;
  @IsOptional() @IsString() @MaxLength(150) senderAlias?: string | null;
  @IsOptional() @IsString() @MaxLength(150) receiverAlias?: string | null;
  @IsOptional() @IsIn([...EARSIV_DELIVERY_CHANNELS]) earsivDefaultChannel?: string;
  @IsOptional() @IsBoolean() autoSend?: boolean;
  @IsOptional() @IsBoolean() exportEnabled?: boolean;
  @IsOptional() @IsBoolean() sectoralItemIdsEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(168) registryCacheHours?: number;
  @IsOptional() @IsString() @MaxLength(300000) logoDataUri?: string | null;
}

export class LegalHoldDto {
  @IsBoolean() hold: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}

export class InboxMatchDto {
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsString() purchaseOrderId?: string | null;
  @IsOptional() @IsString() goodsReceiptId?: string | null;
}

export class InboxRespondDto {
  @IsIn([...APP_RESPONSE_CODES]) response: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class ReceiptAdviceLineDto {
  @IsString() lineId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) accepted: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) rejected?: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string | null;
}

export class ReceiptAdviceDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiptAdviceLineDto) lines: ReceiptAdviceLineDto[];
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class SimulateIncomingDto {
  @IsIn(['TICARI_INVOICE', 'TEMEL_INVOICE', 'DESPATCH', 'IADE_INVOICE']) kind: 'TICARI_INVOICE' | 'TEMEL_INVOICE' | 'DESPATCH' | 'IADE_INVOICE';
}
