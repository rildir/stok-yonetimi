import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_WAREHOUSE_NAME_REQUIRED' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_WAREHOUSE_CODE_REQUIRED' })
  code: string;

  @IsString()
  @IsOptional()
  address?: string;
}

export class UpdateWarehouseDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
