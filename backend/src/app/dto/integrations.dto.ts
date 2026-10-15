import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateApiKeyDto {
  @ApiProperty({ example: 'ERP integration' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_API_KEY_NAME_REQUIRED' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: { products: 'read', orders: 'write' }, description: 'resource -> read | write' })
  @IsObject()
  scopes: Record<string, string>;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00Z', nullable: true })
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsString()
  expiresAt?: string | null;
}

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/hooks/inventory' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'WEBHOOK_URL_INVALID' })
  @MaxLength(500)
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiProperty({ example: ['product.updated', 'stock.changed'] })
  @IsArray()
  @IsString({ each: true })
  events: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 'TR', description: 'ISO 3166-1 alpha-2 country of the receiver (KVKK md. 9)' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'TRANSFER_COUNTRY_INVALID' })
  destinationCountry?: string;

  @ApiPropertyOptional({ enum: ['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'] })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsIn(['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'], { message: 'TRANSFER_BASIS_INVALID' })
  transferBasis?: string | null;

  @ApiPropertyOptional({ example: '2026-10-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  sccSignedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-10-05', nullable: true, description: 'Notification of the standard contract to the Board (5 business days)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  sccNotifiedAt?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Send personal data (names, contact, identity, addresses) in payloads' })
  @IsOptional()
  @IsBoolean()
  includePersonalData?: boolean;
}

export class UpdateWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 'TR', description: 'ISO 3166-1 alpha-2 country of the receiver (KVKK md. 9)' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'TRANSFER_COUNTRY_INVALID' })
  destinationCountry?: string;

  @ApiPropertyOptional({ enum: ['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'] })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsIn(['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'], { message: 'TRANSFER_BASIS_INVALID' })
  transferBasis?: string | null;

  @ApiPropertyOptional({ example: '2026-10-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  sccSignedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-10-05', nullable: true, description: 'Notification of the standard contract to the Board (5 business days)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'VALIDATION_DATE' })
  sccNotifiedAt?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Send personal data (names, contact, identity, addresses) in payloads' })
  @IsOptional()
  @IsBoolean()
  includePersonalData?: boolean;
}

export class CsvImportDto {
  @ApiProperty({ description: 'CSV file content (UTF-8, header row required)' })
  @IsString()
  @IsNotEmpty({ message: 'IMPORT_EMPTY' })
  csv: string;
}
