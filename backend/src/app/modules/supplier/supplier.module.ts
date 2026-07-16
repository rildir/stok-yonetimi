import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { GatewayModule } from '../../shared/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupplierEntity, ProductEntity, PurchaseOrderEntity]),
    GatewayModule,
  ],
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule {}
