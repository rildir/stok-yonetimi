import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';
import { StockCountEntity } from '../../entities/stock-count.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockCountEntity, ProductEntity, StockMovementEntity, WarehouseEntity]),
    SharedModule,
    GatewayModule,
  ],
  controllers: [StockCountController],
  providers: [StockCountService],
  exports: [StockCountService],
})
export class StockCountModule {}
