import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'Depo adı boş olamaz.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Depo kodu boş olamaz.' })
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
