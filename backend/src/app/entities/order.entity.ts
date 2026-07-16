import { Entity, Column, PrimaryGeneratedColumn, Index, DeleteDateColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { OrderItemEntity } from './order-item.entity';
import { OrderStatus } from './enums';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderNumber: string;

  @Column()
  customerName: string;

  @Index()
  @Column('datetime', { default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Index()
  @Column({ type: 'varchar', default: OrderStatus.PENDING })
  status: OrderStatus | string;

  @Column('decimal', { precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
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
