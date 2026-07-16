import { Controller, Get, Post, Put, Delete, Body, Param, Req, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserEntity } from '../../entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto, UpdatePasswordDto } from '../../dto/user.dto';

@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly stockHelper: StockHelperService,
  ) {}

  @Public()
  @Post('auth/login')
  async login(@Body() body: any) {
    const { username, password } = body;
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

  @Get('user/profile')
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

  @Put('user/profile')
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

  @Put('user/password')
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

  @Post('user/sessions/terminate')
  async terminateSessions(@Req() req: any) {
    await this.userService.terminateUserSessions(req.user.username);
    return { success: true, message: 'Tüm oturumlar başarıyla sonlandırıldı.' };
  }

  @Roles('admin')
  @Get('user/users')
  async getAllUsers() {
    return this.userService.getAllUsers();
  }

  @Roles('admin')
  @Post('user/users')
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.userService.createUser(req.user.username, dto);
  }

  @Roles('admin')
  @Put('user/users/:id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  @Roles('admin')
  @Delete('user/users/:id')
  async deleteUser(@Param('id') id: string) {
    return { success: await this.userService.deleteUser(id) };
  }

  @Roles('admin')
  @Put('user/subscription')
  async updateSubscription(@Body('plan') plan: string, @Req() req: any) {
    if (!plan) {
      throw new BadRequestException('Abonelik planı (plan) zorunludur.');
    }
    await this.userService.updateSubscription(req.user.username, plan);
    return { success: true, message: `Abonelik planı ${plan} olarak güncellendi.` };
  }
}
