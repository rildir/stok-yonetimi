import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

export interface StockCountItem {
  productId: string;
  productName: string;
  sku: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  unit: string;
  trackingType?: string;
  /** Lot-tracked: per-lot counts (countedQuantity = their sum) */
  lots?: { lotId: string; lotNumber: string; expiryDate?: string | null; warehouseId: string; warehouseName?: string; systemQuantity: number; countedQuantity: number }[];
  /** Serial-tracked: in-stock serials at count start; present=false => missing (countedQuantity = present count) */
  serials?: { serial: string; warehouseId: string; warehouseName?: string; present: boolean }[];
}

@Entity('stock_counts')
@Index('UQ_stock_counts_company_countNumber', ['companyId', 'countNumber'], { unique: true })
export class StockCountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_stock_counts_company' })
  company?: CompanyEntity;

  @Column()
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
