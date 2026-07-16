import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, ProductEntity, StockMovementEntity, SupplierEntity, WarehouseEntity]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
