import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PurchaseOrderEntity } from './purchase-order.entity';
import { ProductEntity } from './product.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { TrackingEntry } from './tracking';
import { qtyColumn } from '../utils/quantity-transformer';

@Entity('purchase_order_items')
export class PurchaseOrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  productId: string;

  @Column()
  productName: string;

  /** Quantity in the product's base unit (what moves stock). */
  @Column(qtyColumn())
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
  @Column(qtyColumn({ default: 0 }))
  unitQuantity: number;

  /** Lots / serials taken or received for this line */
  @Column({ type: 'simple-json', nullable: true })
  tracking?: TrackingEntry[] | null;

  /** Base units accepted on completed goods receipts */
  @Column(qtyColumn({ default: 0 }))
  receivedQuantity: number;

  /** Base units returned to the supplier (completed purchase returns) */
  @Column(qtyColumn({ default: 0 }))
  returnedQuantity: number;

  /** Legacy name; always equal to unitPrice. */
  @Column('decimal', { precision: 18, scale: 6, transformer: new ColumnNumericTransformer() })
  price: number;

  /** Net unit price (excl. tax) in document currency, 6 decimals (R14) */
  @Column('decimal', { precision: 18, scale: 6, default: 0, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  /** Unit price as entered (gross when the company enters tax-inclusive prices) */
  @Column('decimal', { precision: 18, scale: 6, nullable: true, transformer: new ColumnNumericTransformer() })
  enteredUnitPrice?: number | null;

  /** round2(unitQuantity x unitPrice) before discounts */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  grossAmount: number;

  /** Line discount % (KDVK 24/a) */
  @Column('decimal', { precision: 5, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  discountRate: number;

  /** Line discount amount (net) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  discountAmount: number;

  /** Line discount amount as entered (gross when tax-inclusive prices); NULL = percentage / none */
  @Column('decimal', { precision: 14, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  discountAmountEntered?: number | null;

  /** Share of the document discount (net) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  documentDiscountShare: number;

  /** Matrah of the line after all discounts (excl. ÖTV) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  netAmount: number;

  /** Tax rate version the line was priced with (snapshot; never re-read once frozen) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  taxRateId?: string | null;

  /** UBL-TR TaxTypeCode of the VAT (0015) */
  @Column({ type: 'varchar', length: 4, nullable: true })
  taxCode?: string | null;

  /** Tax percentage applied, e.g. 20 */
  @Column('decimal', { precision: 5, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxRate: number;

  /** Calculated VAT */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxAmount: number;

  /** KDV exemption reason code (UBL-TR TaxExemptionReasonCode) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  exemptionCode?: string | null;

  /** VAT calculated but not collected (701/702 ihraç kayıtlı, reverse charge) */
  @Column({ default: false })
  vatNotCollected: boolean;

  /** KDV withholding code (6xx / 8xx) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  withholdingCode?: string | null;

  /** Withholding code as entered: NULL = product default, '' = switched off, else explicit (re-pricing keeps the intent) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  withholdingCodeEntered?: string | null;

  /** Withheld share of the VAT in % (5/10 -> 50) */
  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  withholdingRate?: number | null;

  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  withheldTaxAmount: number;

  /** ÖTV code / rate / amount (KDVK 24/b: part of the VAT base) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  otvCode?: string | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  otvRate?: number | null;

  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  otvAmount: number;

  /** VAT deductible in the KDV-1 return (0 for import lines: import VAT is deducted from the customs declaration) */
  @Column('decimal', { precision: 14, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  deductibleVat?: number | null;

  /** Reverse charge (KDV-2 sorumlu sıfatıyla): service bought from a foreign supplier */
  @Column({ default: false })
  reverseCharge: boolean;

  /** Gross line total = net + ÖTV + VAT */
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
