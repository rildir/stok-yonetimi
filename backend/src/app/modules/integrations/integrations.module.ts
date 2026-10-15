import { SupplierModule } from '../supplier/supplier.module';
import { SharedModule } from '../../shared/shared.module';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { ApiKeyEntity } from '../../entities/api-key.entity';
import { WebhookEndpointEntity } from '../../entities/webhook-endpoint.entity';
import { WebhookDeliveryEntity } from '../../entities/webhook-delivery.entity';
import { OrderEntity } from '../../entities/order.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { ProductModule } from '../product/product.module';
import { CustomerModule } from '../customer/customer.module';
import { AuditService } from './audit.service';
import { AuditSubscriber } from './audit.subscriber';
import { ApiKeyService } from './api-key.service';
import { WebhookService } from './webhook.service';
import { ImportExportService } from './import-export.service';
import { ApiKeyController, AuditController, ImportExportController, WebhookController } from './integrations.controller';

/** Audit log, API keys, webhooks and CSV import/export. Global so AuthGuard / login can use them. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogEntity, ApiKeyEntity, WebhookEndpointEntity, WebhookDeliveryEntity, OrderEntity, PurchaseOrderEntity]),
    ProductModule,
    CustomerModule,
    SupplierModule,
    SharedModule,
  ],
  controllers: [AuditController, ApiKeyController, WebhookController, ImportExportController],
  providers: [AuditService, AuditSubscriber, ApiKeyService, WebhookService, ImportExportService],
  exports: [AuditService, ApiKeyService, WebhookService],
})
export class IntegrationsModule {}
