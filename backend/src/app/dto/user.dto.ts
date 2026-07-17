import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Şifre boş olamaz.' })
  password: string;
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Şifre boş olamaz.' })
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır.' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Rol boş olamaz.' })
  role: string; // 'admin' | 'manager' | 'viewer'

  @IsString()
  @IsNotEmpty({ message: 'Ad soyad boş olamaz.' })
  fullName: string;

  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  department?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır.' })
  password?: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}

export class UpdatePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Mevcut şifre boş olamaz.' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Yeni şifre boş olamaz.' })
  @MinLength(6, { message: 'Yeni şifre en az 6 karakter olmalıdır.' })
  newPassword: string;
}

export class ResetPasswordRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı adı boş olamaz.' })
  username: string;
}
