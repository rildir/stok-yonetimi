import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnitDto {
  @ApiProperty({ example: 'crate' })
  @IsString()
  @IsNotEmpty({ message: 'UNIT_CODE_REQUIRED' })
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'UNIT_CODE_PATTERN' })
  code: string;

  @ApiProperty({ example: 'Kasa' })
  @IsString()
  @IsNotEmpty({ message: 'UNIT_NAME_REQUIRED' })
  @MaxLength(100)
  name: string;
}

export class UpdateUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'UNIT_CODE_PATTERN' })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
