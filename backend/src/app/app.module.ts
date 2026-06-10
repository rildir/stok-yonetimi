import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DbService } from './db.service';
import { AiService } from './ai.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [DbService, AiService],
})
export class AppModule {}

