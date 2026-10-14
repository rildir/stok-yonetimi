import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { SharedModule } from '../../shared/shared.module';
import { FinanceController } from './finance.controller';
import { FinanceSettingsService } from './finance-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaxRateEntity, ExchangeRateEntity]), SharedModule],
  controllers: [FinanceController],
  providers: [FinanceSettingsService],
})
export class FinanceModule {}
