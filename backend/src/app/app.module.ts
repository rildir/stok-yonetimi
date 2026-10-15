import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiKeyThrottlerGuard, throttleLimit } from './guards/api-key-throttler.guard';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { I18nExceptionFilter } from './shared/i18n/i18n-exception.filter';
import { HealthModule } from './modules/health/health.module';
import { resolveJwtSecret } from './shared/security/security-config';

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
import { CompanyEntity } from './entities/company.entity';
import { CustomerEntity } from './entities/customer.entity';
import { TaxRateEntity } from './entities/tax-rate.entity';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';
import { UnitEntity } from './entities/unit.entity';
import { ProductUnitEntity } from './entities/product-unit.entity';
import { StockLotEntity } from './entities/stock-lot.entity';
import { SerialNumberEntity } from './entities/serial-number.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { ApiKeyEntity } from './entities/api-key.entity';
import { WebhookEndpointEntity } from './entities/webhook-endpoint.entity';
import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { ProvinceEntity, DistrictEntity, TaxOfficeEntity } from './entities/refdata.entity';
import { LegalParameterEntity } from './entities/legal-parameter.entity';
import { CompanyEBelgeProfileEntity } from './entities/company-ebelge-profile.entity';
import { CustomerAddressEntity } from './entities/customer-address.entity';
import { StockMovementChainEntity } from './entities/stock-movement-chain.entity';
import { StockMovementAttachmentEntity } from './entities/stock-movement-attachment.entity';
import { StockAdjustmentRequestEntity } from './entities/stock-adjustment-request.entity';

// Guards
import { RolesGuard } from './guards/roles.guard';
import { AuthGuard } from './guards/auth.guard';

// Feature Modules
import { SharedModule } from './shared/shared.module';
import { TenantModule } from './shared/tenant/tenant.module';
import { CompanyModule } from './modules/company/company.module';
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
import { ReportModule } from './modules/report/report.module';
import { CustomerModule } from './modules/customer/customer.module';
import { FinanceModule } from './modules/finance/finance.module';
import { UnitModule } from './modules/unit/unit.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { RefdataModule } from './modules/refdata/refdata.module';

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
        CompanyEntity,
        CustomerEntity,
        TaxRateEntity,
        ExchangeRateEntity,
        UnitEntity,
        ProductUnitEntity,
        StockLotEntity,
        SerialNumberEntity,
        AuditLogEntity,
        ApiKeyEntity,
        WebhookEndpointEntity,
        WebhookDeliveryEntity,
        ProvinceEntity,
        DistrictEntity,
        TaxOfficeEntity,
        LegalParameterEntity,
        CompanyEBelgeProfileEntity,
        CustomerAddressEntity,
        StockMovementChainEntity,
        StockMovementAttachmentEntity,
        StockAdjustmentRequestEntity,
      ],
      // Store and read DATETIME as UTC; DATE columns stay 'YYYY-MM-DD' strings (no TZ shift).
      timezone: 'Z',
      dateStrings: ['DATE'],
      // Dev only; DB_SYNCHRONIZE=false pauses it (e.g. while a migration is pending).
      synchronize: process.env.NODE_ENV !== 'production' && process.env.DB_SYNCHRONIZE !== 'false',
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: false,
    }),
    JwtModule.register({
      global: true,
      // Production refuses to start without a proper JWT_SECRET (see security-config.ts).
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '24h' },
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      // per IP for browser/JWT traffic, per key for API-key traffic (API_KEY_RATE_LIMIT)
      limit: throttleLimit,
    }]),
    TenantModule,
    SharedModule,
    GatewayModule,
    CompanyModule,
    CategoryModule,
    SupplierModule,
    ProductModule,
    OrderModule,
    PurchaseOrderModule,
    WarehouseModule,
    StockMovementModule,
    StockCountModule,
    UserModule,
    ReportModule,
    CustomerModule,
    FinanceModule,
    UnitModule,
    IntegrationsModule,
    RefdataModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: I18nExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyThrottlerGuard,
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
