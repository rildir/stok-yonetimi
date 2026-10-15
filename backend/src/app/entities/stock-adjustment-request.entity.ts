import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { qtyColumn } from '../utils/quantity-transformer';

export type AdjustmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Maker-checker (R65): a manual adjustment whose estimated value exceeds the
 * company threshold waits here until a different administrator approves it.
 */
@Entity('stock_adjustment_requests')
@Index('IDX_stock_adjustment_requests_company_status', ['companyId', 'status'])
export class StockAdjustmentRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_stock_adjustment_requests_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: AdjustmentRequestStatus;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  /** Signed change requested (base unit) */
  @Column(qtyColumn())
  quantityDelta: number;

  /** |delta| x unit price, in the company base currency */
  @Column('decimal', { precision: 18, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  estimatedValue: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column('decimal', { precision: 18, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  threshold: number;

  /** The original adjustment request body (without attachment content) */
  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100 })
  requestedBy: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  requestedByUserId?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  decidedBy?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  decidedByUserId?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  decisionNote?: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  movementIds?: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
