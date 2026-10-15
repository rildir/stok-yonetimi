import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Check } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ProductEntity } from './product.entity';
import { WarehouseEntity } from './warehouse.entity';
import { qtyColumn } from '../utils/quantity-transformer';

/**
 * Lot/batch stock of a lot-tracked product in one warehouse. For such products
 * SUM(quantity) per (product, warehouse) equals product_warehouse_stocks.quantity;
 * both are written only by WarehouseStockService in the same transaction.
 */
@Entity('stock_lots')
@Index('UQ_stock_lots_product_wh_lot', ['productId', 'warehouseId', 'lotNumber'], { unique: true })
@Index('IDX_stock_lots_company_expiry', ['companyId', 'expiryDate'])
@Check('quantity >= 0')
export class StockLotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_stock_lots_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId', foreignKeyConstraintName: 'FK_stock_lots_product' })
  product?: ProductEntity;

  @Column({ type: 'varchar', length: 36 })
  warehouseId: string;

  @ManyToOne(() => WarehouseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouseId', foreignKeyConstraintName: 'FK_stock_lots_warehouse' })
  warehouse?: WarehouseEntity;

  @Column({ type: 'varchar', length: 64 })
  lotNumber: string;

  /** YYYY-MM-DD */
  @Column({ type: 'date', nullable: true })
  expiryDate?: string | null;

  @Column(qtyColumn({ default: 0 }))
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
