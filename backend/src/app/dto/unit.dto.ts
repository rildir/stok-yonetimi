import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsInt, Min, Max, IsBoolean, IsIn } from 'class-validator';
import { UNECE_UNIT_CODES, UNIT_MAX_DECIMALS } from '../shared/tr';

const UNECE = UNECE_UNIT_CODES.map((u) => u.code);
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
  @ApiPropertyOptional({ example: 3, description: 'Allowed decimals (0-3)' })
  @IsOptional()
  @IsInt({ message: 'UNIT_DECIMALS_INVALID|max=3' })
  @Min(0, { message: 'UNIT_DECIMALS_INVALID|max=3' })
  @Max(UNIT_MAX_DECIMALS, { message: 'UNIT_DECIMALS_INVALID|max=3' })
  decimals?: number;

  @ApiPropertyOptional({ example: 'KGM', description: 'UN/ECE Rec. 20 code' })
  @IsOptional()
  @IsIn([...UNECE, null], { message: 'UNECE_CODE_INVALID' })
  uneceCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsFraction?: boolean;
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
  @ApiPropertyOptional({ example: 3, description: 'Allowed decimals (0-3)' })
  @IsOptional()
  @IsInt({ message: 'UNIT_DECIMALS_INVALID|max=3' })
  @Min(0, { message: 'UNIT_DECIMALS_INVALID|max=3' })
  @Max(UNIT_MAX_DECIMALS, { message: 'UNIT_DECIMALS_INVALID|max=3' })
  decimals?: number;

  @ApiPropertyOptional({ example: 'KGM', description: 'UN/ECE Rec. 20 code' })
  @IsOptional()
  @IsIn([...UNECE, null], { message: 'UNECE_CODE_INVALID' })
  uneceCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsFraction?: boolean;
}
