import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { moneyColumn, PartySnapshot, rateColumn } from './document-common';

export interface ExpenseVoucherLine {
  productId?: string | null;
  description: string;
  quantity: number;
  unitCode?: string | null;
  unitPrice: number;
  amount: number;
}

/**
 * Gider pusulası (VUK 234; 509 IV.6) and müstahsil makbuzu (VUK 235; 509 IV.5): issued by the
 * buyer for goods / services bought from someone who does not issue invoices. Numbered on ISSUE,
 * frozen afterwards; the signed copy kept by the seller is tracked.
 */
@Entity('expense_vouchers')
@Index('UQ_expense_vouchers_company_documentNo', ['companyId', 'documentNo'], { unique: true })
@Index('IDX_expense_vouchers_company_status', ['companyId', 'status'])
export class ExpenseVoucherEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_expense_vouchers_company' })
  company?: CompanyEntity;

  /** GIDER_PUSULASI | MUSTAHSIL_MAKBUZU */
  @Column({ type: 'varchar', length: 20, default: 'GIDER_PUSULASI' })
  kind: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  seriesCode?: string | null;

  /** EDOCUMENT | PAPER | EXTERNAL */
  @Column({ type: 'varchar', length: 10, nullable: true })
  numberMode?: string | null;

  /** DRAFT | ISSUED | CANCELLED */
  @Column({ type: 'varchar', length: 15, default: 'DRAFT' })
  status: string;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  /** Goods / service received (start of the 7-day period) */
  @Column({ type: 'date', nullable: true })
  deliveryDate?: string | null;

  /** Last day to issue (deliveryDate + EXPENSE_VOUCHER_DEADLINE_DAYS) */
  @Column({ type: 'date', nullable: true })
  dueDate?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierId?: string | null;

  @Column({ type: 'json', nullable: true })
  sellerSnapshot?: PartySnapshot | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  goodsReceiptId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  returnId?: string | null;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  @Column({ type: 'json', nullable: true })
  lines?: ExpenseVoucherLine[] | null;

  @Column(moneyColumn())
  grossTotal: number;

  /** Income tax withholding (stopaj) rate, % (GVK 94; rates from legal parameters) */
  @Column(rateColumn())
  withholdingRate: number;

  @Column(moneyColumn())
  withholdingAmount: number;

  /** Other deductions (e.g. borsa tescil, SGK) */
  @Column(moneyColumn())
  otherDeductions: number;

  @Column(moneyColumn())
  netPayable: number;

  /** CASH | BANK_TRANSFER | PTT | CARD | OFFSET */
  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentChannel?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentRef?: string | null;

  @Column({ type: 'date', nullable: true })
  paidAt?: string | null;

  /** Signed copy received back from the seller */
  @Column({ default: false })
  signedCopyReceived: boolean;

  @Column({ type: 'datetime', nullable: true })
  signedCopyAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  issuedBy?: string | null;

  @Column({ type: 'datetime', nullable: true })
  issuedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cancelledBy?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
