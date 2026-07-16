import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrderEntity, ProductEntity, SupplierEntity]),
    SharedModule,
    GatewayModule,
  ],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
