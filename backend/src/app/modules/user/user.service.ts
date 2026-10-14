import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { CreateUserDto, UpdateUserDto } from '../../dto/user.dto';
import { UserRole } from '../../entities/enums';

import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class UserService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly appGateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async requestPasswordReset(username: string): Promise<{ success: boolean; message: string }> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND_BY_USERNAME'));
    }
    this.appGateway.notifyPasswordResetRequest(user.companyId, {
      username: user.username,
      fullName: user.fullName || user.username,
    });
    return {
      success: true,
      message: 'Şifre sıfırlama talebiniz sistem yöneticisine başarıyla iletildi.',
    };
  }

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
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;
    // null clears the override (falls back to company default)
    if (updates.language !== undefined) user.language = updates.language || null;
    if (updates.timezone !== undefined) user.timezone = updates.timezone || null;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async updateUserPassword(username: string, newPasswordPlain: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    user.password = this.stockHelper.hashPassword(newPasswordPlain);
    user.tokenVersion++;
    await this.userRepo.save(user);
  }

  async terminateUserSessions(username: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
    }
    user.tokenVersion++;
    await this.userRepo.save(user);
  }

  async getAllUsers(): Promise<UserEntity[]> {
    const users = await this.userRepo.find({ where: { companyId: this.companyId }, order: { fullName: 'ASC' } });
    return users.map((u) => this.sanitizeUser(u));
  }

  async createUser(adminUsername: string, data: CreateUserDto): Promise<UserEntity> {
    const admin = await this.getUserByUsername(adminUsername);
    if (!admin || admin.companyId !== this.companyId) {
      throw new BadRequestException(err('ADMIN_NOT_FOUND'));
    }

    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) {
      throw new BadRequestException(err('USERNAME_TAKEN', { username: data.username }));
    }

    const newUser = this.userRepo.create({
      companyId: admin.companyId,
      username: data.username,
      password: this.stockHelper.hashPassword(data.password || '123456'),
      role: data.role || UserRole.VIEWER,
      fullName: data.fullName,
      email: data.email,
      department: data.department || '',
      tokenVersion: 0,
    });

    const saved = await this.userRepo.save(newUser);
    return this.sanitizeUser(saved);
  }

  /** Transparent SHA-256 -> bcrypt upgrade during login (runs before tenant context exists). */
  async migratePasswordHash(user: UserEntity, plainPassword: string): Promise<void> {
    user.password = this.stockHelper.hashPassword(plainPassword);
    await this.userRepo.update({ id: user.id }, { password: user.password });
  }

  async updateUser(id: string, updates: UpdateUserDto): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!user) {
      throw new BadRequestException(err('USER_NOT_FOUND'));
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
    const user = await this.userRepo.findOne({ where: { id, companyId: this.companyId } });
    if (!user) return false;

    if (user.role === UserRole.ADMIN) {
      const adminCount = await this.userRepo.count({ where: { companyId: this.companyId, role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException(err('USER_LAST_ADMIN'));
      }
    }

    await this.userRepo.remove(user);
    return true;
  }
}
