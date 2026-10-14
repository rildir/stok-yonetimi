import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockHelperService } from './services/stock-helper.service';
import { SeedService } from './services/seed.service';
import { WarehouseStockService } from './services/warehouse-stock.service';
import { FinanceService } from './services/finance.service';
import { UserEntity } from '../entities/user.entity';
import { CategoryEntity } from '../entities/category.entity';
import { WarehouseEntity } from '../entities/warehouse.entity';
import { ProductEntity } from '../entities/product.entity';
import { OrderEntity } from '../entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, CategoryEntity, WarehouseEntity, ProductEntity, OrderEntity]),
  ],
  providers: [StockHelperService, SeedService, WarehouseStockService, FinanceService],
  exports: [StockHelperService, SeedService, WarehouseStockService, FinanceService],
})
export class SharedModule {}
