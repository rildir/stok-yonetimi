import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { OrderEntity } from './order.entity';
import { PurchaseOrderEntity } from './purchase-order.entity';
import type { ChargeAllocation } from '../shared/finance/tax';

const money = () => ({ precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() });

/**
 * Additional charges of a sales / purchase order (KDVK 24/b: nakliye, ambalaj, sigorta...).
 * They follow the rate of the main delivery; `allocations` records the split over the
 * document's rate groups. Exactly one of orderId / purchaseOrderId is set.
 */
@Entity('order_charges')
export class OrderChargeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_order_charges_companyId')
  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId?: string | null;

  @ManyToOne(() => OrderEntity, (o) => o.charges, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'orderId', foreignKeyConstraintName: 'FK_order_charges_order' })
  order?: OrderEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  purchaseOrderId?: string | null;

  @ManyToOne(() => PurchaseOrderEntity, (o) => o.charges, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'purchaseOrderId', foreignKeyConstraintName: 'FK_order_charges_purchase_order' })
  purchaseOrder?: PurchaseOrderEntity | null;

  /** SHIPPING | PACKAGING | INSURANCE | OTHER */
  @Column({ type: 'varchar', length: 20 })
  type: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  /** Amount as entered (gross when the company enters tax-inclusive prices) */
  @Column('decimal', money())
  enteredAmount: number;

  /** Net amount (matrah) in document currency */
  @Column('decimal', money())
  amount: number;

  @Column('decimal', money())
  taxAmount: number;

  @Column('decimal', money())
  withheldTaxAmount: number;

  @Column('decimal', money())
  lineTotal: number;

  @Column({ type: 'simple-json', nullable: true })
  allocations?: ChargeAllocation[] | null;
}
