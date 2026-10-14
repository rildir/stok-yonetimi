import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PurchaseOrderEntity } from './purchase-order.entity';
import { ProductEntity } from './product.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { TrackingEntry } from './tracking';

@Entity('purchase_order_items')
export class PurchaseOrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  productId: string;

  @Column()
  productName: string;

  /** Quantity in the product's base unit (what moves stock). */
  @Column('int')
  quantity: number;

  /** Unit the line was entered in (null = base unit); unitPrice is per this unit. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  unitId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unitCode?: string | null;

  /** Base units per entered unit */
  @Column('decimal', { precision: 12, scale: 4, default: 1, transformer: new ColumnNumericTransformer() })
  unitFactor: number;

  /** Quantity as entered (in unitCode); lineTotal = unitQuantity * unitPrice (+ tax) */
  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  unitQuantity: number;

  /** Lots / serials taken or received for this line */
  @Column({ type: 'simple-json', nullable: true })
  tracking?: TrackingEntry[] | null;

  /** Legacy name; always equal to unitPrice. */
  @Column('decimal', { precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
  price: number;

  /** Net unit price (excl. tax) in document currency */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  /** Tax percentage applied, e.g. 20 */
  @Column('decimal', { precision: 5, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxRate: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxAmount: number;

  /** Gross line total = quantity * unitPrice + taxAmount */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  lineTotal: number;

  @ManyToOne(() => PurchaseOrderEntity, (po) => po.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrderEntity;

  @Column()
  purchaseOrderId: string;

  @ManyToOne(() => ProductEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: ProductEntity;
}
