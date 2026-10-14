import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { UnitController } from './unit.controller';

@Module({
  imports: [SharedModule],
  controllers: [UnitController],
})
export class UnitModule {}
