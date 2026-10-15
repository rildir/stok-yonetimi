import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf, IsEmail } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const present = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export class NoticeDraftDto {
  @ApiProperty({ enum: ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE'] })
  @IsIn(['CUSTOMER', 'SUPPLIER', 'EMPLOYEE'], { message: 'NOTICE_AUDIENCE_INVALID' })
  audience: string;

  @ApiPropertyOptional({ enum: ['tr', 'en'] })
  @IsOptional()
  @IsIn(['tr', 'en'])
  language?: string;
}

export class CreateNoticeDto extends NoticeDraftDto {
  @ApiProperty({ example: '1.1' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_FAILED' })
  @MaxLength(20)
  version: string;

  @ApiPropertyOptional({ description: 'Empty: the default text is generated from the company data' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;
}

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

export class AcceptNoticesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'NOTICE_NOT_FOUND' })
  @IsString({ each: true })
  noticeIds: string[];
}

export class ConsentDto {
  @ApiProperty({ enum: ['CUSTOMER', 'SUPPLIER'] })
  @IsIn(['CUSTOMER', 'SUPPLIER'], { message: 'SUBJECT_TYPE_INVALID' })
  subjectType: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 'MARKETING_EMAIL' })
  @IsString()
  @IsNotEmpty({ message: 'CONSENT_PURPOSE_INVALID' })
  purposeCode: string;

  @ApiProperty({ example: 'WEB' })
  @IsString()
  @IsNotEmpty()
  channel: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  textVersion?: string | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  givenAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidence?: string | null;
}

export class WithdrawConsentDto {
  @IsOptional()
  @IsString()
  channel?: string;
}

export class RetentionOverrideDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  periodValue?: number;

  @ApiPropertyOptional({ enum: ['DAY', 'MONTH', 'YEAR'] })
  @IsOptional()
  @IsIn(['DAY', 'MONTH', 'YEAR'])
  periodUnit?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class RejectRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateDsrDto {
  @ApiProperty({ enum: ['CUSTOMER', 'SUPPLIER', 'USER', 'OTHER'] })
  @IsIn(['CUSTOMER', 'SUPPLIER', 'USER', 'OTHER'], { message: 'SUBJECT_TYPE_INVALID' })
  subjectType: string;

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @ApiProperty({ example: 'Selin Aydın' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'DSR_APPLICANT_REQUIRED' })
  @MaxLength(255)
  applicantName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  applicantContact?: string | null;

  @ApiProperty({ enum: ['ACCESS', 'INFO', 'PURPOSE', 'TRANSFER_INFO', 'RECTIFICATION', 'ERASURE', 'OBJECTION', 'COMPENSATION'] })
  @IsIn(['ACCESS', 'INFO', 'PURPOSE', 'TRANSFER_INFO', 'RECTIFICATION', 'ERASURE', 'OBJECTION', 'COMPENSATION'], { message: 'DSR_TYPE_INVALID' })
  requestType: string;

  @ApiProperty({ enum: ['WRITTEN', 'KEP', 'E_SIGNATURE', 'MOBILE_SIGNATURE', 'REGISTERED_EMAIL', 'APPLICATION', 'IN_PERSON'] })
  @IsIn(['WRITTEN', 'KEP', 'E_SIGNATURE', 'MOBILE_SIGNATURE', 'REGISTERED_EMAIL', 'APPLICATION', 'IN_PERSON'], { message: 'VALIDATION_FAILED' })
  channel: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-10-01T10:00:00Z' })
  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  receivedAt?: string | null;
}

export class VerifyIdentityDto {
  @ApiProperty({ example: 'Nüfus cüzdanı fotokopisi ve imza karşılaştırması' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_FAILED' })
  @MaxLength(255)
  method: string;
}

export class RespondDsrDto {
  @ApiProperty({ enum: ['COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED'] })
  @IsIn(['COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED'])
  status: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'DSR_RESPONSE_REQUIRED' })
  responseText: string;
}

export class IncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  severity?: string;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  awareAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataCategories?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsIn(['CUSTOMER', 'SUPPLIER', 'USER'], { each: true })
  affectedSubjectTypes?: string[] | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedCount?: number | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  affectedFrom?: string | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  affectedTo?: string | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  boardNotifiedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  boardNotificationRef?: string | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  subjectsNotifiedAt?: string | null;

  @IsOptional()
  @IsString()
  measures?: string | null;
}

export class ConfirmIncidentDto {
  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  awareAt?: string | null;
}

export class DismissIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SubprocessorDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  service?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/, { message: 'TRANSFER_COUNTRY_INVALID' })
  country?: string;

  @ValidateIf(present)
  @IsIn(['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'], { message: 'TRANSFER_BASIS_INVALID' })
  transferBasis?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataCategories?: string[] | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  dpaSignedAt?: string | null;

  @ValidateIf(present)
  @Matches(ISO_DATE, { message: 'VALIDATION_DATE' })
  sccNotifiedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class KvkkSettingsDto {
  @ValidateIf(present)
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  kvkkContactEmail?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  verbisEmployeeCount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  verbisBalanceSheetTotal?: number | null;

  @IsOptional()
  @IsBoolean()
  verbisMainActivitySpecial?: boolean;

  @IsOptional()
  @IsBoolean()
  verbisRegistered?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  verbisRegistrationNo?: string | null;
}

export class CloseTenantDto {
  @ApiProperty({ description: 'Şirketin kısa adı (slug) - onay' })
  @IsString()
  @IsNotEmpty({ message: 'TENANT_CLOSE_CONFIRMATION_INVALID' })
  confirmSlug: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PASSWORD_REQUIRED' })
  password: string;
}
