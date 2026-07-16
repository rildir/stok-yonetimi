import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovementController } from './stock-movement.controller';
import { StockMovementService } from './stock-movement.service';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockMovementEntity, ProductEntity, WarehouseEntity]),
    SharedModule,
    GatewayModule,
  ],
  controllers: [StockMovementController],
  providers: [StockMovementService],
  exports: [StockMovementService],
})
export class StockMovementModule {}
