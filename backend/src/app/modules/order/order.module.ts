import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, ProductEntity, StockMovementEntity, WarehouseEntity]),
    SharedModule,
    GatewayModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
