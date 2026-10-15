import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockHelperService } from './services/stock-helper.service';
import { SeedService } from './services/seed.service';
import { WarehouseStockService } from './services/warehouse-stock.service';
import { FinanceService } from './services/finance.service';
import { UnitService } from './services/unit.service';
import { RefdataService } from './services/refdata.service';
import { LegalParameterService } from './services/legal-parameter.service';
import { UserEntity } from '../entities/user.entity';
import { CategoryEntity } from '../entities/category.entity';
import { WarehouseEntity } from '../entities/warehouse.entity';
import { ProductEntity } from '../entities/product.entity';
import { OrderEntity } from '../entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, CategoryEntity, WarehouseEntity, ProductEntity, OrderEntity]),
  ],
  providers: [StockHelperService, SeedService, WarehouseStockService, FinanceService, UnitService, RefdataService, LegalParameterService],
  exports: [StockHelperService, SeedService, WarehouseStockService, FinanceService, UnitService, RefdataService, LegalParameterService],
})
export class SharedModule {}
