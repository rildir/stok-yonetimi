import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { SupplierEntity } from './supplier.entity';
import { PurchaseOrderItemEntity } from './purchase-order-item.entity';
import { PurchaseOrderStatus } from './enums';

@Entity('purchase_orders')
export class PurchaseOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
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

  @Column('decimal', { precision: 10, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

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
