import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Entities
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { StockMovementEntity } from './entities/stock-movement.entity';
import { SupplierEntity } from './entities/supplier.entity';
import { PurchaseOrderEntity } from './entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from './entities/purchase-order-item.entity';
import { CategoryEntity } from './entities/category.entity';
import { StockCountEntity } from './entities/stock-count.entity';
import { WarehouseEntity } from './entities/warehouse.entity';
import { ProductWarehouseStockEntity } from './entities/product-warehouse-stock.entity';
import { UserEntity } from './entities/user.entity';

// Guards
import { RolesGuard } from './guards/roles.guard';
import { AuthGuard } from './guards/auth.guard';

// Feature Modules
import { SharedModule } from './shared/shared.module';
import { GatewayModule } from './shared/gateway.module';
import { CategoryModule } from './modules/category/category.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { ProductModule } from './modules/product/product.module';
import { OrderModule } from './modules/order/order.module';
import { PurchaseOrderModule } from './modules/purchase-order/purchase-order.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { StockMovementModule } from './modules/stock-movement/stock-movement.module';
import { StockCountModule } from './modules/stock-count/stock-count.module';
import { UserModule } from './modules/user/user.module';
import { AiModule } from './modules/ai/ai.module';
import { ReportModule } from './modules/report/report.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'stok_yonetimi',
      entities: [
        ProductEntity,
        OrderEntity,
        OrderItemEntity,
        StockMovementEntity,
        SupplierEntity,
        PurchaseOrderEntity,
        PurchaseOrderItemEntity,
        CategoryEntity,
        StockCountEntity,
        WarehouseEntity,
        ProductWarehouseStockEntity,
        UserEntity,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: false,
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'secret_smart_inventory_2026',
      signOptions: { expiresIn: '24h' },
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    SharedModule,
    GatewayModule,
    CategoryModule,
    SupplierModule,
    ProductModule,
    OrderModule,
    PurchaseOrderModule,
    WarehouseModule,
    StockMovementModule,
    StockCountModule,
    UserModule,
    AiModule,
    ReportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
