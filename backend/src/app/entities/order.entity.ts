import { Entity, Column, PrimaryGeneratedColumn, Index, DeleteDateColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { OrderItemEntity } from './order-item.entity';
import { OrderStatus } from './enums';
import { CustomerEntity } from './customer.entity';

@Entity('orders')
@Index('UQ_orders_company_orderNumber', ['companyId', 'orderNumber'], { unique: true })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_orders_company' })
  company?: CompanyEntity;

  @Column()
  orderNumber: string;

  @Index('IDX_orders_customerId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @ManyToOne(() => CustomerEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_orders_customer' })
  customer?: CustomerEntity | null;

  /** Snapshot of the customer name at order time */
  @Column()
  customerName: string;

  @Index()
  @Column('datetime', { default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Index()
  @Column({ type: 'varchar', default: OrderStatus.PENDING })
  status: OrderStatus | string;

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

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true, eager: true })
  items: OrderItemEntity[];

  @Column({ nullable: true })
  carrier?: string;

  @Column({ nullable: true })
  trackingNumber?: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
