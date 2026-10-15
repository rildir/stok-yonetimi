import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { qtyColumn } from '../utils/quantity-transformer';
import { TrackingEntry } from './tracking';
import type { TaxBreakdownRow } from '../shared/finance/tax';
import { moneyColumn, PartySnapshot, priceColumn, rateColumn } from './document-common';

/**
 * Return document (KDVK 35; VUK 234/b; 6502 md. 48). SALES_RETURN / WITHDRAWAL (cayma) / DEFECT
 * reference the original sales invoice line and its tax rate; PURCHASE_RETURN references the goods
 * receipt line. Stock moves only when the return is COMPLETED (RETURN movements with reversesMovementId).
 */
@Entity('returns')
@Index('UQ_returns_company_returnNo', ['companyId', 'returnNo'], { unique: true })
@Index('IDX_returns_company_status', ['companyId', 'status'])
export class ReturnEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_returns_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  returnNo: string;

  /** SALES_RETURN | PURCHASE_RETURN | WITHDRAWAL | DEFECT */
  @Column({ type: 'varchar', length: 20 })
  type: string;

  /** DRAFT | COMPLETED */
  @Column({ type: 'varchar', length: 15, default: 'DRAFT' })
  status: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  invoiceId?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoiceNo?: string | null;

  @Column({ type: 'date', nullable: true })
  invoiceDate?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  goodsReceiptId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  purchaseOrderId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierId?: string | null;

  @Column({ type: 'json', nullable: true })
  partySnapshot?: PartySnapshot | null;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  @Column(moneyColumn())
  subtotal: number;

  @Column(moneyColumn())
  taxTotal: number;

  @Column(moneyColumn())
  withheldTaxTotal: number;

  @Column(moneyColumn())
  grandTotal: number;

  @Column({ type: 'json', nullable: true })
  taxBreakdown?: TaxBreakdownRow[] | null;

  /** BANK_TRANSFER | PTT | CARD_REVERSAL | CASH | OFFSET (bank / PTT receipts replace the expense voucher) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  refundChannel?: string | null;

  /** Bank / PTT receipt (dekont) reference */
  @Column({ type: 'varchar', length: 100, nullable: true })
  refundRef?: string | null;

  /** Counterparty's return invoice (supplier / VAT-registered customer) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  counterpartyDocNo?: string | null;

  @Column({ type: 'date', nullable: true })
  counterpartyDocDate?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  counterpartyEttn?: string | null;

  /** Goods delivered to the buyer (start of the withdrawal period) */
  @Column({ type: 'date', nullable: true })
  deliveryDate?: string | null;

  /** Withdrawal / return notified by the buyer */
  @Column({ type: 'datetime', nullable: true })
  notifiedAt?: Date | null;

  @Column({ type: 'date', nullable: true })
  withdrawalDeadline?: string | null;

  @Column({ type: 'date', nullable: true })
  goodsReturnDeadline?: string | null;

  @Column({ type: 'date', nullable: true })
  refundDueDate?: string | null;

  /** Goods physically received back (sales) / shipped back (purchase) */
  @Column({ type: 'datetime', nullable: true })
  goodsMovedAt?: Date | null;

  /** IADE invoice issued by the company (purchase returns) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  returnInvoiceId?: string | null;

  /** Expense voucher (gider pusulası) for a consumer refund without bank / PTT receipt */
  @Column({ type: 'varchar', length: 36, nullable: true })
  expenseVoucherId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  despatchId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  completedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @OneToMany(() => ReturnItemEntity, (i) => i.returnDoc, { cascade: true })
  items: ReturnItemEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('return_items')
export class ReturnItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  returnId: string;

  @ManyToOne(() => ReturnEntity, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'returnId', foreignKeyConstraintName: 'FK_return_items_return' })
  returnDoc?: ReturnEntity;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  invoiceLineId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  goodsReceiptItemId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  productSku?: string | null;

  /** Base-unit quantity returned */
  @Column(qtyColumn())
  quantity: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unitCode?: string | null;

  /** Net unit price per base unit, copied from the original line */
  @Column(priceColumn())
  unitPrice: number;

  @Column(moneyColumn())
  netAmount: number;

  /** Rate of the original line (KDVK 35: the return uses the original rate) */
  @Column(rateColumn())
  taxRate: number;

  @Column(moneyColumn())
  taxAmount: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  exemptionCode?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  withholdingCode?: string | null;

  @Column(rateColumn({ nullable: true }))
  withholdingRate?: number | null;

  @Column(moneyColumn())
  withheldTaxAmount: number;

  @Column(moneyColumn())
  lineTotal: number;

  /** RESELLABLE | DAMAGED | DISPOSE */
  @Column({ type: 'varchar', length: 12, default: 'RESELLABLE' })
  condition: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  targetWarehouseId?: string | null;

  /** Lots / serials moved by the return */
  @Column({ type: 'json', nullable: true })
  tracking?: TrackingEntry[] | null;

  /** Original sale / receipt movement reversed (first one) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  reversesMovementId?: string | null;
}
