import { DataSource } from 'typeorm';
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
  ],
  migrations: [path.join(__dirname, 'app/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
});
