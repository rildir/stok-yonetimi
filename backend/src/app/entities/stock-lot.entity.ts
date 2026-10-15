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

  // ─── Food traceability (WP6; Tebliğ 2026/11) ───

  /** YYYY-MM-DD */
  @Column({ type: 'date', nullable: true })
  productionDate?: string | null;

  /** PURCHASE | PRODUCTION | OPENING | RETURN | TRANSFER | COUNT */
  @Column({ type: 'varchar', length: 20, nullable: true })
  lotSource?: string | null;

  /** The supplier's own lot number (when the company relabels) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  supplierLotNumber?: string | null;

  /** active | blocked | recalled: blocked / recalled lots cannot be sold or moved except to quarantine / disposal */
  @Column({ type: 'varchar', length: 10, default: 'active' })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  statusReason?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
