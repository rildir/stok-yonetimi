import { DataSource } from 'typeorm';
import { WP6_ENTITIES } from './app/entities/inventory-accounting.entity';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Entities
import { ProductEntity } from './app/entities/product.entity';
import { OrderEntity } from './app/entities/order.entity';
import { OrderItemEntity } from './app/entities/order-item.entity';
import { StockMovementEntity } from './app/entities/stock-movement.entity';
import { SupplierEntity } from './app/entities/supplier.entity';
import { PurchaseOrderEntity } from './app/entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from './app/entities/purchase-order-item.entity';
import { CategoryEntity } from './app/entities/category.entity';
import { StockCountEntity } from './app/entities/stock-count.entity';
import { WarehouseEntity } from './app/entities/warehouse.entity';
import { ProductWarehouseStockEntity } from './app/entities/product-warehouse-stock.entity';
import { UserEntity } from './app/entities/user.entity';
import { CompanyEntity } from './app/entities/company.entity';
import { CustomerEntity } from './app/entities/customer.entity';
import { TaxRateEntity } from './app/entities/tax-rate.entity';
import { ExchangeRateEntity } from './app/entities/exchange-rate.entity';
import { UnitEntity } from './app/entities/unit.entity';
import { ProductUnitEntity } from './app/entities/product-unit.entity';
import { StockLotEntity } from './app/entities/stock-lot.entity';
import { SerialNumberEntity } from './app/entities/serial-number.entity';
import { AuditLogEntity } from './app/entities/audit-log.entity';
import { ApiKeyEntity } from './app/entities/api-key.entity';
import { WebhookEndpointEntity } from './app/entities/webhook-endpoint.entity';
import { WebhookDeliveryEntity } from './app/entities/webhook-delivery.entity';
import { ProvinceEntity, DistrictEntity, TaxOfficeEntity } from './app/entities/refdata.entity';
import { LegalParameterEntity } from './app/entities/legal-parameter.entity';
import { CompanyEBelgeProfileEntity } from './app/entities/company-ebelge-profile.entity';
import { CustomerAddressEntity } from './app/entities/customer-address.entity';
import { StockMovementChainEntity } from './app/entities/stock-movement-chain.entity';
import { StockMovementAttachmentEntity } from './app/entities/stock-movement-attachment.entity';
import { StockAdjustmentRequestEntity } from './app/entities/stock-adjustment-request.entity';
import { TaxExemptionCodeEntity, WithholdingCodeEntity, OtvCodeEntity } from './app/entities/tax-code.entity';
import { OrderChargeEntity } from './app/entities/order-charge.entity';
import { DocumentSeriesEntity, DocumentSequenceEntity } from './app/entities/document-series.entity';
import { DespatchEntity, DespatchLineEntity } from './app/entities/despatch.entity';
import { InvoiceEntity, InvoiceLineEntity } from './app/entities/invoice.entity';
import { ReturnEntity, ReturnItemEntity } from './app/entities/return.entity';
import { GoodsReceiptEntity, GoodsReceiptItemEntity } from './app/entities/goods-receipt.entity';
import { ExpenseVoucherEntity } from './app/entities/expense-voucher.entity';
import { EBELGE_ENTITIES } from './app/entities/ebelge.entity';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

export const AppDataSource = new DataSource({
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
    TaxExemptionCodeEntity,
    WithholdingCodeEntity,
    OtvCodeEntity,
    OrderChargeEntity,
    DocumentSeriesEntity,
    DocumentSequenceEntity,
    DespatchEntity,
    DespatchLineEntity,
    InvoiceEntity,
    InvoiceLineEntity,
    ReturnEntity,
    ReturnItemEntity,
    GoodsReceiptEntity,
    GoodsReceiptItemEntity,
    ExpenseVoucherEntity,
    ...EBELGE_ENTITIES,
    ...WP6_ENTITIES,
  ],
  timezone: 'Z',
  dateStrings: ['DATE'],
  migrations: [path.join(__dirname, 'app/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
});
