import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { SessionModule } from './session.module';
import { UserEntity } from '../../entities/user.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';
import { JwtModule } from '@nestjs/jwt';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    SharedModule,
    GatewayModule,
    JwtModule,
    CompanyModule,
    SessionModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService, SessionModule],
})
export class UserModule {}
