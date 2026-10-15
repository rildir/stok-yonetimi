import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CATEGORY_NAME_REQUIRED' })
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  /** WP6: normal wastage rate (%) of the category's products and its source */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'VALIDATION_AMOUNT_INVALID' })
  @Min(0, { message: 'VALIDATION_AMOUNT_INVALID' })
  @Max(100, { message: 'VALIDATION_AMOUNT_INVALID' })
  normalWastageRatePct?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  normalWastageSource?: string | null;
}
