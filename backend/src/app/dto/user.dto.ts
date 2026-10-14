import { vmsg } from '../shared/i18n/i18n-exception.filter';
import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength, IsIn, IsTimeZone, ValidateIf } from 'class-validator';
import { SUPPORTED_LANGUAGES } from '../entities/company.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Kullanıcı adı', example: 'admin' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_USERNAME_REQUIRED' })
  username: string;

  @ApiProperty({ description: 'Şifre', example: 'admin123' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PASSWORD_REQUIRED' })
  password: string;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Kullanıcı adı', example: 'ahmet.yavuz' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_USERNAME_REQUIRED' })
  username: string;

  @ApiProperty({ description: 'Şifre (Min 6 karakter)', example: 'pass1234' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_PASSWORD_REQUIRED' })
  @MinLength(6, { message: vmsg('VALIDATION_PASSWORD_MIN', 'min') })
  password: string;

  @ApiProperty({ description: 'Kullanıcı rolü (admin, manager, viewer)', example: 'manager' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_ROLE_REQUIRED' })
  role: string;

  @ApiProperty({ description: 'Ad Soyad', example: 'Ahmet Yavuz' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_FULL_NAME_REQUIRED' })
  fullName: string;

  @ApiPropertyOptional({ description: 'E-posta adresi', example: 'ahmet@example.com' })
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Departman adı', example: 'Lojistik' })
  @IsString()
  @IsOptional()
  department?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Ad Soyad' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ description: 'E-posta adresi' })
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Departman' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ description: 'Rol' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Yeni Şifre' })
  @IsString()
  @IsOptional()
  @MinLength(6, { message: vmsg('VALIDATION_PASSWORD_MIN', 'min') })
  password?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Ad Soyad' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ description: 'E-posta adresi' })
  @IsEmail({}, { message: 'VALIDATION_EMAIL' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Departman' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ description: 'Avatar (Base64 / URL)' })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({ description: 'Kişisel dil tercihi (null = şirket varsayılanı)', enum: SUPPORTED_LANGUAGES, nullable: true })
  @ValidateIf((o) => o.language !== null && o.language !== undefined)
  @IsIn(SUPPORTED_LANGUAGES, { message: 'VALIDATION_LANGUAGE' })
  language?: string | null;

  @ApiPropertyOptional({ description: 'Kişisel saat dilimi (IANA, null = şirket varsayılanı)', nullable: true })
  @ValidateIf((o) => o.timezone !== null && o.timezone !== undefined)
  @IsTimeZone({ message: 'VALIDATION_TIMEZONE' })
  timezone?: string | null;
}

export class UpdatePasswordDto {
  @ApiProperty({ description: 'Mevcut şifre' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_CURRENT_PASSWORD_REQUIRED' })
  currentPassword: string;

  @ApiProperty({ description: 'Yeni şifre' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_NEW_PASSWORD_REQUIRED' })
  @MinLength(6, { message: vmsg('VALIDATION_NEW_PASSWORD_MIN', 'min') })
  newPassword: string;
}

export class ResetPasswordRequestDto {
  @ApiProperty({ description: 'Kullanıcı adı' })
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION_USERNAME_REQUIRED' })
  username: string;
}
