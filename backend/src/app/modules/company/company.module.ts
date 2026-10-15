import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyEntity } from '../../entities/company.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';
import { ComplianceService } from './compliance.service';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyEntity]), SharedModule, GatewayModule],
  controllers: [CompanyController],
  providers: [CompanyService, ComplianceService],
  exports: [CompanyService, ComplianceService],
})
export class CompanyModule {}
