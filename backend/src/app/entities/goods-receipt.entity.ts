import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { qtyColumn } from '../utils/quantity-transformer';
import { TrackingEntry } from './tracking';
import { moneyColumn, PartySnapshot, priceColumn } from './document-common';

/**
 * Mal kabul fişi (VUK 227, 230; R11, R28). Records what actually arrived against a purchase order
 * line: the supplier's despatch quantity, the counted and rejected quantities, the tesellüm
 * surplus / shortage (397 / 197) and the supplier's despatch / invoice numbers.
 */
@Entity('goods_receipts')
@Index('UQ_goods_receipts_company_receiptNo', ['companyId', 'receiptNo'], { unique: true })
@Index('IDX_goods_receipts_company_po', ['companyId', 'purchaseOrderId'])
export class GoodsReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_goods_receipts_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  receiptNo: string;

  /** DRAFT | COMPLETED */
  @Column({ type: 'varchar', length: 15, default: 'DRAFT' })
  status: string;

  @Column({ type: 'varchar', length: 36 })
  purchaseOrderId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  poNumber?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierId?: string | null;

  @Column({ type: 'json', nullable: true })
  supplierSnapshot?: PartySnapshot | null;

  @Column({ type: 'varchar', length: 36 })
  warehouseId: string;

  /** Actual receipt time */
  @Column({ type: 'datetime' })
  receivedAt: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  supplierDespatchNo?: string | null;

  @Column({ type: 'date', nullable: true })
  supplierDespatchDate?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierDespatchEttn?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  supplierInvoiceNo?: string | null;

  @Column({ type: 'date', nullable: true })
  supplierInvoiceDate?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierInvoiceEttn?: string | null;

  /** Invoice amount (document currency) for the three-way match */
  @Column(moneyColumn({ nullable: true }))
  supplierInvoiceAmount?: number | null;

  /** Accepted quantity x PO net unit price (document currency) */
  @Column(moneyColumn())
  acceptedNetAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  /** The company carries the goods itself: it must issue its own despatch advice */
  @Column({ default: false })
  buyerCarries: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ownDespatchId?: string | null;

  /** Supplier is not a taxpayer: an expense voucher (gider pusulası) is required (VUK 234) */
  @Column({ default: false })
  requiresExpenseVoucher: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  expenseVoucherId?: string | null;

  /** Any surplus / shortage / rejection on the lines */
  @Column({ default: false })
  hasDiscrepancy: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  completedBy?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @OneToMany(() => GoodsReceiptItemEntity, (i) => i.receipt, { cascade: true })
  items: GoodsReceiptItemEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('goods_receipt_items')
@Index('IDX_goods_receipt_items_poItem', ['purchaseOrderItemId'])
export class GoodsReceiptItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  goodsReceiptId: string;

  @ManyToOne(() => GoodsReceiptEntity, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goodsReceiptId', foreignKeyConstraintName: 'FK_goods_receipt_items_receipt' })
  receipt?: GoodsReceiptEntity;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  purchaseOrderItemId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  productSku?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unitCode?: string | null;

  /** All quantities in base units */
  @Column(qtyColumn({ default: 0 }))
  orderedQuantity: number;

  /** Quantity on the supplier's despatch advice */
  @Column(qtyColumn({ default: 0 }))
  despatchQuantity: number;

  @Column(qtyColumn({ default: 0 }))
  countedQuantity: number;

  @Column(qtyColumn({ default: 0 }))
  rejectedQuantity: number;

  /** DAMAGED | WRONG_ITEM | EXCESS | QUALITY | OTHER */
  @Column({ type: 'varchar', length: 20, nullable: true })
  rejectReason?: string | null;

  /** Entered stock: counted - rejected */
  @Column(qtyColumn({ default: 0 }))
  acceptedQuantity: number;

  /** Accepted above the despatch quantity (tesellüm fazlası, 397) */
  @Column(qtyColumn({ default: 0 }))
  surplusQuantity: number;

  /** Despatch quantity not received (tesellüm noksanı, 197) */
  @Column(qtyColumn({ default: 0 }))
  shortageQuantity: number;

  /** Net unit price per base unit (PO document currency) */
  @Column(priceColumn())
  unitPrice: number;

  @Column({ type: 'json', nullable: true })
  lots?: { lotNumber: string; expiryDate?: string | null; quantity: number }[] | null;

  @Column({ type: 'json', nullable: true })
  serials?: string[] | null;

  @Column({ type: 'json', nullable: true })
  tracking?: TrackingEntry[] | null;

  @Column(qtyColumn({ default: 0 }))
  returnedQuantity: number;
}
