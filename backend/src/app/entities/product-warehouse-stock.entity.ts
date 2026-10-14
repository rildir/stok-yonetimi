import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ProductEntity } from './product.entity';
import { WarehouseEntity } from './warehouse.entity';
import { CompanyEntity } from './company.entity';

/**
 * Authoritative per-warehouse stock. `products.quantity` is a denormalized
 * SUM of these rows and is only changed by WarehouseStockService inside the
 * same transaction.
 */
@Entity('product_warehouse_stocks')
@Index('UQ_pws_product_warehouse', ['productId', 'warehouseId'], { unique: true })
@Index('IDX_pws_companyId', ['companyId'])
export class ProductWarehouseStockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_pws_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => ProductEntity, (p) => p.warehouseStocks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId', foreignKeyConstraintName: 'FK_pws_product' })
  product: ProductEntity;

  @Column({ type: 'varchar', length: 36 })
  warehouseId: string;

  @ManyToOne(() => WarehouseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouseId', foreignKeyConstraintName: 'FK_pws_warehouse' })
  warehouse: WarehouseEntity;

  @Column('int', { default: 0 })
  quantity: number;
}
