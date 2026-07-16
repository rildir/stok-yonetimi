import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { StockMovementModule } from '../stock-movement/stock-movement.module';
import { SupplierModule } from '../supplier/supplier.module';
import { CategoryModule } from '../category/category.module';
import { StockCountModule } from '../stock-count/stock-count.module';

@Module({
  imports: [
    ProductModule,
    OrderModule,
    PurchaseOrderModule,
    StockMovementModule,
    SupplierModule,
    CategoryModule,
    StockCountModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
