import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsDateKey } from './tax.dto';

/**
 * WP6 request bodies (lots, recalls, disposals, account mappings). With the global whitelist
 * ValidationPipe only these fields reach the services, so a body can never carry `companyId` / `id`
 * and required identifiers are never `undefined` (TypeORM drops undefined keys from `where`).
 */
const QTY = { maxDecimalPlaces: 4 };
const LOT_RELATIONS = ['SPLIT', 'MERGE', 'REPACK', 'PROCESS'];

export class LotStatusDto {
  /** Either lotId, or productId + lotNumber (all warehouses of that lot). */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_EMPTY' })
  lotId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'PRODUCT_NOT_FOUND' })
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_EMPTY' })
  @MaxLength(100)
  lotNumber?: string;

  @IsIn(['active', 'blocked'], { message: 'LOT_STATUS_INVALID' })
  status: 'active' | 'blocked';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class LotGenealogyDto {
  @IsString()
  @IsNotEmpty({ message: 'PRODUCT_NOT_FOUND' })
  parentProductId: string;

  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_EMPTY' })
  @MaxLength(100)
  parentLotNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'PRODUCT_NOT_FOUND' })
  childProductId: string;

  @IsString()
  @IsNotEmpty({ message: 'LOT_NUMBER_EMPTY' })
  @MaxLength(100)
  childLotNumber: string;

  @IsIn(LOT_RELATIONS, { message: 'GENEALOGY_RELATION_INVALID' })
  relation: string;

  @IsOptional()
  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0.0001, { message: 'QUANTITY_INVALID' })
  quantity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class RecallDto {
  @IsString()
  @IsNotEmpty({ message: 'PRODUCT_NOT_FOUND' })
  productId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'RECALL_LOTS_REQUIRED' })
  @ArrayMaxSize(200)
  @IsString({ each: true })
  lotNumbers: string[];

  @IsString()
  @IsNotEmpty({ message: 'RECALL_REASON_REQUIRED' })
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsBoolean()
  isMock?: boolean;
}

export class RecallUpdateDto {
  @IsOptional()
  @IsString()
  ministryNotifiedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ministryNotificationRef?: string | null;

  @IsOptional()
  @IsString()
  consumerNoticeAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  consumerNoticeChannel?: string | null;

  @IsOptional()
  @IsBoolean()
  close?: boolean;
}

export class DisposalLineDto {
  @IsString()
  @IsNotEmpty({ message: 'PRODUCT_NOT_FOUND' })
  productId: string;

  @IsOptional()
  @IsString()
  lotId?: string | null;

  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @IsNumber(QTY, { message: 'QUANTITY_INVALID' })
  @Min(0.0001, { message: 'QUANTITY_INVALID' })
  quantity: number;
}

export class DisposalCreateDto {
  @IsString()
  basis: string;

  @IsString()
  @IsNotEmpty({ message: 'DISPOSAL_REASON_REQUIRED' })
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsBoolean()
  disaster?: boolean;

  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'DISPOSAL_LINES_REQUIRED' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DisposalLineDto)
  lines: DisposalLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class DisposalWitnessDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string | null;
}

export class DisposalTransitionDto {
  @IsString()
  status: string;

  @IsOptional()
  @IsDateKey()
  applicationDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  applicationRef?: string | null;

  @IsOptional()
  @IsDateKey()
  decisionDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  decisionRef?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  decisionValue?: number | null;

  @IsOptional()
  @IsString()
  destroyedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destructionPlace?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DisposalWitnessDto)
  witnesses?: DisposalWitnessDto[] | null;
}

export class AccountMappingDto {
  @IsString()
  event: string;

  @IsOptional()
  @IsString()
  inventoryClass?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @IsString()
  @MaxLength(30)
  debitAccount: string;

  @IsString()
  @MaxLength(30)
  creditAccount: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
