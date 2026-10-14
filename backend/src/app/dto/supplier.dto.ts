import { IsString, IsNotEmpty, IsOptional, IsEmail, IsInt, Min, Max } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_SUPPLIER_NAME_REQUIRED' })
  name: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  leadTimeDays?: number;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  leadTimeDays?: number;
}
