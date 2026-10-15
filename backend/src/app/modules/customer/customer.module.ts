import { CustomerAddressEntity } from '../../entities/customer-address.entity';
import { SharedModule } from '../../shared/shared.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../../entities/customer.entity';
import { OrderEntity } from '../../entities/order.entity';
import { GatewayModule } from '../../shared/gateway.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity, OrderEntity, CustomerAddressEntity]), GatewayModule, SharedModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
