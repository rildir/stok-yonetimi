import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WarehouseEntity, ProductEntity, StockMovementEntity]),
    GatewayModule,
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
