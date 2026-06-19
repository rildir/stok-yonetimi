import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export interface StockCountItem {
  productId: string;
  productName: string;
  sku: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  unit: string;
}

@Entity('stock_counts')
export class StockCountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  countNumber: string;

  @Index()
  @Column({ default: 'InProgress' })
  status: 'InProgress' | 'Completed';

  @Column('simple-json')
  items: StockCountItem[];

  @Column()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column()
  performedBy: string;

  @Column({ nullable: true })
  notes: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
