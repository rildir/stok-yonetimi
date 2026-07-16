import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CreateUserDto, UpdateUserDto } from '../../dto/user.dto';
import { UserRole, SubscriptionPlan } from '../../entities/enums';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly stockHelper: StockHelperService,
  ) {}

  private sanitizeUser(user: UserEntity): UserEntity {
    const { password, ...sanitized } = user;
    return sanitized as UserEntity;
  }

  async getUserByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async updateUserProfile(username: string, updates: Partial<UserEntity>): Promise<UserEntity> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async updateUserPassword(username: string, newPasswordPlain: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    user.password = this.stockHelper.hashPassword(newPasswordPlain);
    user.tokenVersion++;
    await this.userRepo.save(user);
  }

  async terminateUserSessions(username: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    user.tokenVersion++;
    await this.userRepo.save(user);
  }

  async getAllUsers(): Promise<UserEntity[]> {
    const users = await this.userRepo.find({ order: { fullName: 'ASC' } });
    return users.map((u) => this.sanitizeUser(u));
  }

  async createUser(adminUsername: string, data: CreateUserDto): Promise<UserEntity> {
    const admin = await this.getUserByUsername(adminUsername);
    if (!admin) {
      throw new BadRequestException('Yönetici bulunamadı.');
    }

    const totalUsers = await this.userRepo.count();
    const plan = admin.subscriptionPlan || SubscriptionPlan.STANDARD;

    // Standard = 5 seats, Professional = 20 seats, Ultra = unlimited
    let limit = 5;
    if (plan === SubscriptionPlan.PROFESSIONAL) limit = 20;
    else if (plan === SubscriptionPlan.ULTRA) limit = 999999;
    else if (plan === SubscriptionPlan.NONE) limit = 1;

    if (totalUsers >= limit) {
      const planName =
        plan === SubscriptionPlan.STANDARD
          ? 'Standart'
          : plan === SubscriptionPlan.PROFESSIONAL
          ? 'Profesyonel'
          : 'Ultra';
      throw new BadRequestException(
        `Mevcut planınız (${planName}) en fazla ${limit} kullanıcıya izin vermektedir. ` +
          `Yeni kullanıcı eklemek için lütfen planınızı yükseltin.`
      );
    }

    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) {
      throw new BadRequestException(`"${data.username}" kullanıcı adı zaten kullanımda.`);
    }

    const newUser = this.userRepo.create({
      username: data.username,
      password: this.stockHelper.hashPassword(data.password || '123456'),
      role: data.role || UserRole.VIEWER,
      fullName: data.fullName,
      email: data.email,
      department: data.department || '',
      subscriptionPlan: SubscriptionPlan.STANDARD,
      tokenVersion: 0,
    });

    const saved = await this.userRepo.save(newUser);
    return this.sanitizeUser(saved);
  }

  async updateUser(id: string, updates: UpdateUserDto): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }

    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.role !== undefined) user.role = updates.role;

    if (updates.password) {
      user.password = this.stockHelper.hashPassword(updates.password);
      user.tokenVersion++;
    }

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async deleteUser(id: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return false;

    if (user.role === UserRole.ADMIN) {
      const adminCount = await this.userRepo.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('Son yönetici hesabı silinemez.');
      }
    }

    await this.userRepo.remove(user);
    return true;
  }

  async updateSubscription(username: string, plan: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    user.subscriptionPlan = plan;
    if (plan === SubscriptionPlan.NONE) {
      user.subscriptionExpiresAt = null as any;
    } else {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      user.subscriptionExpiresAt = expires;
    }
    await this.userRepo.save(user);
  }
}
