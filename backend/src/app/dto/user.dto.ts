import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Kullanıcı adı', example: 'admin' })
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  username: string;

  @ApiProperty({ description: 'Şifre', example: 'admin123' })
  @IsString()
  @IsNotEmpty({ message: 'Şifre boş olamaz.' })
  password: string;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Kullanıcı adı', example: 'ahmet.yavuz' })
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  username: string;

  @ApiProperty({ description: 'Şifre (Min 6 karakter)', example: 'pass1234' })
  @IsString()
  @IsNotEmpty({ message: 'Şifre boş olamaz.' })
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır.' })
  password: string;

  @ApiProperty({ description: 'Kullanıcı rolü (admin, manager, viewer)', example: 'manager' })
  @IsString()
  @IsNotEmpty({ message: 'Rol boş olamaz.' })
  role: string;

  @ApiProperty({ description: 'Ad Soyad', example: 'Ahmet Yavuz' })
  @IsString()
  @IsNotEmpty({ message: 'Ad soyad boş olamaz.' })
  fullName: string;

  @ApiPropertyOptional({ description: 'E-posta adresi', example: 'ahmet@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
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
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
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
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır.' })
  password?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Ad Soyad' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ description: 'E-posta adresi' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
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
}

export class UpdatePasswordDto {
  @ApiProperty({ description: 'Mevcut şifre' })
  @IsString()
  @IsNotEmpty({ message: 'Mevcut şifre boş olamaz.' })
  currentPassword: string;

  @ApiProperty({ description: 'Yeni şifre' })
  @IsString()
  @IsNotEmpty({ message: 'Yeni şifre boş olamaz.' })
  @MinLength(6, { message: 'Yeni şifre en az 6 karakter olmalıdır.' })
  newPassword: string;
}

export class ResetPasswordRequestDto {
  @ApiProperty({ description: 'Kullanıcı adı' })
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  username: string;
}
