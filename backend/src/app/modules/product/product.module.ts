import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductEntity, CategoryEntity, SupplierEntity, StockMovementEntity, WarehouseEntity]),
    SharedModule,
    GatewayModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
