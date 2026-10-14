import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ProductEntity } from './product.entity';
import { WarehouseEntity } from './warehouse.entity';
import { StockLotEntity } from './stock-lot.entity';

export enum SerialStatus {
  IN_STOCK = 'in_stock',
  SOLD = 'sold',
  RETURNED = 'returned',
  LOST = 'lost',
}

/**
 * Serial number of a serial-tracked product. COUNT(status = in_stock) per
 * (product, warehouse) equals product_warehouse_stocks.quantity.
 * `warehouseId` is the current (or last known) location.
 */
@Entity('serial_numbers')
@Index('UQ_serial_numbers_company_product_serial', ['companyId', 'productId', 'serial'], { unique: true })
@Index('IDX_serial_numbers_product_status', ['productId', 'status'])
export class SerialNumberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_serial_numbers_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId', foreignKeyConstraintName: 'FK_serial_numbers_product' })
  product?: ProductEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @ManyToOne(() => WarehouseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warehouseId', foreignKeyConstraintName: 'FK_serial_numbers_warehouse' })
  warehouse?: WarehouseEntity | null;

  @Column({ type: 'varchar', length: 100 })
  serial: string;

  @Column({ type: 'varchar', length: 20, default: SerialStatus.IN_STOCK })
  status: SerialStatus | string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lotId?: string | null;

  @ManyToOne(() => StockLotEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lotId', foreignKeyConstraintName: 'FK_serial_numbers_lot' })
  lot?: StockLotEntity | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
