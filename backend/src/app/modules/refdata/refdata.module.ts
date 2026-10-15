import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { LegalParameterController, RefdataController } from './refdata.controller';

@Module({
  imports: [SharedModule],
  controllers: [RefdataController, LegalParameterController],
})
export class RefdataModule {}
