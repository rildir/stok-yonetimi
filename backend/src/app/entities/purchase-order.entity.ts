import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { SupplierEntity } from './supplier.entity';
import { PurchaseOrderItemEntity } from './purchase-order-item.entity';
import { PurchaseOrderStatus } from './enums';

@Entity('purchase_orders')
@Index('UQ_purchase_orders_company_poNumber', ['companyId', 'poNumber'], { unique: true })
export class PurchaseOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_purchase_orders_company' })
  company?: CompanyEntity;

  @Column()
  poNumber: string;

  @Index()
  @Column({ nullable: true })
  supplierId: string;

  @ManyToOne(() => SupplierEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier?: SupplierEntity;

  @Column()
  supplierName: string;

  @Index()
  @Column({ type: 'varchar', default: PurchaseOrderStatus.DRAFT })
  status: PurchaseOrderStatus | string;

  @OneToMany(() => PurchaseOrderItemEntity, (item) => item.purchaseOrder, { cascade: true, eager: true })
  items: PurchaseOrderItemEntity[];

  /** ISO 4217 document currency (lines inherit it) */
  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  /** 1 unit of `currency` expressed in company base currency at document time */
  @Column('decimal', { precision: 18, scale: 6, default: 1, transformer: new ColumnNumericTransformer() })
  exchangeRate: number;

  /** Sum of net line amounts */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  subtotal: number;

  /** Sum of line tax amounts */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxTotal: number;

  /** subtotal + taxTotal */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  grandTotal: number;

  /** Kept equal to grandTotal for backwards compatibility */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

  /** Warehouse that receives the goods (default warehouse when null) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ nullable: true })
  expectedDate: string;

  @Column({ nullable: true })
  notes: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
