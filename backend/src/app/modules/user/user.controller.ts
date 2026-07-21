import { Controller, Get, Post, Put, Delete, Body, Param, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtService } from '@nestjs/jwt';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto, UpdatePasswordDto, LoginDto, ResetPasswordRequestDto } from '../../dto/user.dto';

@ApiTags('Auth & Users')
@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly stockHelper: StockHelperService,
  ) {}

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Kullanıcı Girişi (JWT Token al)' })
  @ApiResponse({ status: 200, description: 'Giriş başarılı, JWT token döner' })
  @ApiResponse({ status: 400, description: 'Kullanıcı adı veya şifre hatalı' })
  async login(@Body() dto: LoginDto) {
    const { username, password } = dto;
    const user = await this.userService.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı adı veya şifre hatalı.');
    }
    const onMigration = async (plainPassword: string) => {
      await this.userService.updateUser(user.id, { password: plainPassword });
    };
    const valid = await this.stockHelper.verifyPassword(password, user.password, onMigration);
    if (!valid) {
      throw new BadRequestException('Kullanıcı adı veya şifre hatalı.');
    }
    const payload = { username: user.username, role: user.role, tokenVersion: user.tokenVersion };
    return {
      token: await this.jwtService.signAsync(payload),
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
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    return {
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      avatar: user.avatar,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      createdAt: user.createdAt
    };
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
      data: {
        username: updatedUser.username,
        role: updatedUser.role,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        department: updatedUser.department,
        avatar: updatedUser.avatar,
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionExpiresAt: updatedUser.subscriptionExpiresAt
      }
    };
  }

  @ApiBearerAuth()
  @Put('user/password')
  @ApiOperation({ summary: 'Kullanıcı kendi şifresini değiştirir' })
  @ApiResponse({ status: 200, description: 'Şifre güncellendi' })
  async updatePassword(@Body() dto: UpdatePasswordDto, @Req() req: any) {
    const user = await this.userService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    const isValid = await this.stockHelper.verifyPassword(dto.currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Mevcut şifreniz yanlış.');
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

  @ApiBearerAuth()
  @Roles('admin')
  @Put('user/subscription')
  @ApiOperation({ summary: 'Abonelik planını güncelle (Admin)' })
  @ApiResponse({ status: 200, description: 'Abonelik güncellendi' })
  async updateSubscription(@Body('plan') plan: string, @Req() req: any) {
    if (!plan) {
      throw new BadRequestException('Abonelik planı (plan) zorunludur.');
    }
    await this.userService.updateSubscription(req.user.username, plan);
    return { success: true, message: `Abonelik planı ${plan} olarak güncellendi.` };
  }
}
