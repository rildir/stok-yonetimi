import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { DbService } from './db.service';
import { AiService } from './ai.service';
import { AppGateway } from './app.gateway';
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'stok_yonetimi',
      entities: [ProductEntity, OrderEntity],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([ProductEntity, OrderEntity]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || (() => { throw new Error('CRITICAL: JWT_SECRET is missing in environment variables'); })(),
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AppController],
  providers: [DbService, AiService, AppGateway],
})
export class AppModule {}
