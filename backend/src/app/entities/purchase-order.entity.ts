import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('purchase_orders')
export class PurchaseOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;

  @Index()
  @Column()
  supplierId: string;

  @Column()
  supplierName: string;

  @Index()
  @Column()
  status: string; // 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Cancelled'

  @Column('json')
  items: any[];

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
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
