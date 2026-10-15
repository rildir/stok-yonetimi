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
  /** Set on completion when the line's value exceeded the approval threshold: the pending maker-checker request */
  approvalRequestId?: string;
  /** Unit cost (base currency) at completion and the counted / difference value at cost */
  unitCost?: number;
  countedValue?: number;
  differenceValue?: number;
  inventoryClass?: string;
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

  // ─── WP6: sayım tutanağı (VUK 185-190; TTK 64/3, 66) ───

  /** YEAR_END | PERIODIC | CYCLE | SAMPLING */
  @Column({ type: 'varchar', length: 15, default: 'PERIODIC' })
  countType: string;

  /** Day the goods were counted (YYYY-MM-DD) */
  @Column({ type: 'date', nullable: true })
  countDate?: string | null;

  /** Inventory date the count is rolled to (bilanço günü); countDate within -3/+2 months of it */
  @Column({ type: 'date', nullable: true })
  asOfDate?: string | null;

  /** Warehouses counted (null = all) */
  @Column({ type: 'simple-json', nullable: true })
  warehouseIds?: string[] | null;

  /** Sayım ekibi */
  @Column({ type: 'simple-json', nullable: true })
  countedBy?: string[] | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  supervisedBy?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approvedBy?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  approvedByUserId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  approvedAt?: Date | null;

  /** Tutanak number */
  @Column({ type: 'varchar', length: 30, nullable: true })
  documentNo?: string | null;

  /** SHA-256 of the counted lines at completion */
  @Column({ type: 'char', length: 64, nullable: true })
  snapshotHash?: string | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
