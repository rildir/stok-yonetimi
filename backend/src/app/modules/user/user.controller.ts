import { err } from '../../shared/i18n/app-error';
import { Controller, Get, Post, Put, Delete, Body, Param, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtService } from '@nestjs/jwt';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CompanyService } from '../company/company.service';
import { buildJwtPayload } from '../../guards/jwt-payload';
import { UserEntity } from '../../entities/user.entity';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto, UpdatePasswordDto, LoginDto, ResetPasswordRequestDto } from '../../dto/user.dto';

@ApiTags('Auth & Users')
@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly stockHelper: StockHelperService,
    private readonly companyService: CompanyService,
  ) {}

  private async toProfile(user: UserEntity) {
    const company = await this.companyService.getCompanyById(user.companyId);
    if (!company) {
      throw new BadRequestException(err('COMPANY_NOT_FOUND'));
    }
    return {
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      avatar: user.avatar,
      createdAt: user.createdAt,
      language: user.language ?? null,
      timezone: user.timezone ?? null,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        country: company.country,
        defaultLanguage: company.defaultLanguage,
        baseCurrency: company.baseCurrency,
        timezone: company.timezone,
      },
      locale: this.companyService.resolveLocale(company, user),
    };
  }

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Kullanıcı Girişi (JWT Token al)' })
  @ApiResponse({ status: 200, description: 'Giriş başarılı, JWT token döner' })
  @ApiResponse({ status: 400, description: 'Kullanıcı adı veya şifre hatalı' })
  async login(@Body() dto: LoginDto) {
    const { username, password } = dto;
    const user = await this.userService.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('AUTH_INVALID_CREDENTIALS'));
    }
    const onMigration = async (plainPassword: string) => {
      await this.userService.migratePasswordHash(user, plainPassword);
    };
    const valid = await this.stockHelper.verifyPassword(password, user.password, onMigration);
    if (!valid) {
      throw new BadRequestException(err('AUTH_INVALID_CREDENTIALS'));
    }
    return {
      token: await this.jwtService.signAsync(buildJwtPayload(user)),
    };
  }

  @Public()
  @Post('auth/reset-password-request')
  @ApiOperation({ summary: 'Şifre sıfırlama talebi gönder' })
  @ApiResponse({ status: 200, description: 'Talep yöneticiye iletildi' })
  async resetPasswordRequest(@Body() dto: ResetPasswordRequestDto) {
    return this.userService.requestPasswordReset(dto.username);
  }

  @ApiBearerAuth()
  @Get('user/profile')
  @ApiOperation({ summary: 'Giriş yapmış kullanıcının profil bilgilerini getir' })
  @ApiResponse({ status: 200, description: 'Kullanıcı profili' })
  async getProfile(@Req() req: any) {
    const user = await this.userService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    return this.toProfile(user);
  }

  @ApiBearerAuth()
  @Put('user/profile')
  @ApiOperation({ summary: 'Profil bilgilerini güncelle' })
  @ApiResponse({ status: 200, description: 'Profil güncellendi' })
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: any) {
    const updatedUser = await this.userService.updateUserProfile(req.user.username, dto);
    return {
      success: true,
      message: 'Profil başarıyla güncellendi',
      data: await this.toProfile(updatedUser),
    };
  }

  @ApiBearerAuth()
  @Put('user/password')
  @ApiOperation({ summary: 'Kullanıcı kendi şifresini değiştirir' })
  @ApiResponse({ status: 200, description: 'Şifre güncellendi' })
  async updatePassword(@Body() dto: UpdatePasswordDto, @Req() req: any) {
    const user = await this.userService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    const isValid = await this.stockHelper.verifyPassword(dto.currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException(err('AUTH_WRONG_CURRENT_PASSWORD'));
    }
    await this.userService.updateUserPassword(req.user.username, dto.newPassword);
    return { success: true, message: 'Şifreniz başarıyla güncellendi.' };
  }

  @ApiBearerAuth()
  @Post('user/sessions/terminate')
  @ApiOperation({ summary: 'Tüm oturumları sonlandır (Token invalidated)' })
  @ApiResponse({ status: 200, description: 'Oturumlar sonlandırıldı' })
  async terminateSessions(@Req() req: any) {
    await this.userService.terminateUserSessions(req.user.username);
    return { success: true, message: 'Tüm oturumlar başarıyla sonlandırıldı.' };
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Get('user/users')
  @ApiOperation({ summary: 'Tüm kullanıcıları listele (Admin)' })
  @ApiResponse({ status: 200, description: 'Kullanıcı listesi' })
  async getAllUsers() {
    return this.userService.getAllUsers();
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('user/users')
  @ApiOperation({ summary: 'Yeni kullanıcı tanımla (Admin)' })
  @ApiResponse({ status: 201, description: 'Kullanıcı oluşturuldu' })
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.userService.createUser(req.user.username, dto);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('user/users/:id')
  @ApiOperation({ summary: 'Kullanıcı düzenle (Admin)' })
  @ApiResponse({ status: 200, description: 'Kullanıcı güncellendi' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Delete('user/users/:id')
  @ApiOperation({ summary: 'Kullanıcı sil (Admin)' })
  @ApiResponse({ status: 200, description: 'Kullanıcı silindi' })
  async deleteUser(@Param('id') id: string) {
    return { success: await this.userService.deleteUser(id) };
  }
}
