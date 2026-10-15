import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { qtyColumn } from '../utils/quantity-transformer';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { TrackingEntry } from './tracking';
import type { TaxBreakdownRow } from '../shared/finance/tax';
import { DocumentRef, InternetSaleInfo, LineTax, moneyColumn, PartySnapshot, priceColumn, rateColumn } from './document-common';

/**
 * Fatura (VUK 229-231; 509 IV.1.3, IV.2.3, V.5.2). Sales invoices (kind SALES) and return
 * invoices the company issues to a supplier (kind RETURN, typeCode IADE). Numbered on ISSUE;
 * frozen afterwards (only status / gibStatus / provider / objection / cancellation fields change).
 */
@Entity('invoices')
@Index('UQ_invoices_company_documentNo', ['companyId', 'documentNo'], { unique: true })
@Index('IDX_invoices_company_status', ['companyId', 'status'])
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_invoices_company' })
  company?: CompanyEntity;

  @Index('UQ_invoices_ettn', { unique: true })
  @Column({ type: 'char', length: 36 })
  ettn: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  seriesCode?: string | null;

  /** EDOCUMENT | PAPER | EXTERNAL */
  @Column({ type: 'varchar', length: 10, nullable: true })
  numberMode?: string | null;

  /** SALES | RETURN */
  @Column({ type: 'varchar', length: 10, default: 'SALES' })
  kind: string;

  /** TEMELFATURA, TICARIFATURA, EARSIVFATURA, IHRACAT, PAPER, EXTERNAL */
  @Column({ type: 'varchar', length: 20 })
  profileId: string;

  /** SATIS, IADE, ISTISNA, TEVKIFAT, TEVKIFATIADE, IHRACKAYITLI */
  @Column({ type: 'varchar', length: 20, default: 'SATIS' })
  typeCode: string;

  /** DRAFT -> ISSUED -> QUEUED -> SENT -> DELIVERED / ACCEPTED / REJECTED / CANCELLED */
  @Column({ type: 'varchar', length: 15, default: 'DRAFT' })
  status: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  gibStatus?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef?: string | null;

  @Column({ default: false })
  objection: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  objectionNote?: string | null;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  issueTime?: string | null;

  /** Delivery (sevk / teslim) date: start of the 7-day period (VUK 231/5) */
  @Column({ type: 'date', nullable: true })
  deliveryDate?: string | null;

  /** Issued before delivery (allowed; information only) */
  @Column({ default: false })
  issuedBeforeDelivery: boolean;

  /** Issued more than 7 days after delivery with explicit confirmation (audited) */
  @Column({ default: false })
  lateIssueConfirmed: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierId?: string | null;

  @Column({ type: 'json', nullable: true })
  orderIds?: string[] | null;

  /** Despatch advices covered (number and date printed on the invoice) */
  @Column({ type: 'json', nullable: true })
  despatchRefs?: DocumentRef[] | null;

  /** Original invoices (returns / price-difference documents) */
  @Column({ type: 'json', nullable: true })
  billingReferences?: DocumentRef[] | null;

  @Column({ type: 'json', nullable: true })
  sellerSnapshot?: PartySnapshot | null;

  @Column({ type: 'json', nullable: true })
  buyerSnapshot?: PartySnapshot | null;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  @Column('decimal', { precision: 18, scale: 6, default: 1, transformer: new ColumnNumericTransformer() })
  exchangeRate: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  exchangeRateSource?: string | null;

  @Column({ type: 'date', nullable: true })
  exchangeRateDate?: string | null;

  @Column(moneyColumn())
  subtotal: number;

  @Column(moneyColumn())
  documentDiscountAmount: number;

  @Column(moneyColumn())
  chargesTotal: number;

  @Column(moneyColumn())
  otvTotal: number;

  @Column(moneyColumn())
  taxTotal: number;

  @Column(moneyColumn())
  withheldTaxTotal: number;

  @Column(moneyColumn())
  notCollectedTaxTotal: number;

  @Column(moneyColumn())
  grandTotal: number;

  /** grandTotal - withheld VAT */
  @Column(moneyColumn())
  payableTotal: number;

  @Column(moneyColumn())
  subtotalTry: number;

  @Column(moneyColumn())
  taxTotalTry: number;

  @Column(moneyColumn())
  grandTotalTry: number;

  @Column({ type: 'json', nullable: true })
  taxBreakdown?: TaxBreakdownRow[] | null;

  /** Charges (nakliye, ambalaj...) invoiced with this document */
  @Column({ type: 'json', nullable: true })
  charges?: { type: string; description?: string | null; amount: number; taxAmount: number; lineTotal: number }[] | null;

  /** 509 IV.2.4.5 internet sale fields */
  @Column({ type: 'json', nullable: true })
  internetSaleInfo?: InternetSaleInfo | null;

  /** İrsaliye yerine geçen fatura (509 V.5.1) */
  @Column({ default: false })
  replacesDespatch: boolean;

  /** e-Belge mode NONE: number / date of the invoice in the external system (GİB portal, accounting package) or paper form */
  @Column({ type: 'varchar', length: 50, nullable: true })
  externalDocNo?: string | null;

  @Column({ type: 'date', nullable: true })
  externalDocDate?: string | null;

  /** Paper invoice in e-Belge mode (509 V.7 reason) */
  @Column({ type: 'varchar', length: 2, nullable: true })
  paperReason?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gibNoticeRef?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  returnId?: string | null;

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
  notes?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @OneToMany(() => InvoiceLineEntity, (l) => l.invoice, { cascade: true })
  lines: InvoiceLineEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('invoice_lines')
@Index('IDX_invoice_lines_orderItem', ['orderItemId'])
export class InvoiceLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  invoiceId: string;

  @ManyToOne(() => InvoiceEntity, (i) => i.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId', foreignKeyConstraintName: 'FK_invoice_lines_invoice' })
  invoice?: InvoiceEntity;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column('int', { default: 1 })
  lineNo: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderItemId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  despatchLineId?: string | null;

  /** Return invoices: the line of the original (supplier / own) document */
  @Column({ type: 'varchar', length: 36, nullable: true })
  originalLineId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  productSku?: string | null;

  /** Quantity in the document unit (unitCode) */
  @Column(qtyColumn())
  quantity: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unitCode?: string | null;

  /** Base units per document unit */
  @Column('decimal', { precision: 12, scale: 4, default: 1, transformer: new ColumnNumericTransformer() })
  unitFactor: number;

  /** Quantity in base units (stock / return limit) */
  @Column(qtyColumn())
  baseQuantity: number;

  @Column(priceColumn())
  unitPrice: number;

  @Column(moneyColumn())
  grossAmount: number;

  /** Line + share of document discount (net) */
  @Column(moneyColumn())
  discountAmount: number;

  @Column(moneyColumn())
  netAmount: number;

  @Column(rateColumn())
  taxRate: number;

  @Column(moneyColumn())
  taxAmount: number;

  /** Line taxes (0015 KDV with exemption / withholding codes; ÖTV) */
  @Column({ type: 'json', nullable: true })
  taxes?: LineTax[] | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  exemptionCode?: string | null;

  @Column({ default: false })
  vatNotCollected: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  withholdingCode?: string | null;

  @Column(rateColumn({ nullable: true }))
  withholdingRate?: number | null;

  @Column(moneyColumn())
  withheldTaxAmount: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  otvCode?: string | null;

  @Column(rateColumn({ nullable: true }))
  otvRate?: number | null;

  @Column(moneyColumn())
  otvAmount: number;

  @Column(moneyColumn())
  lineTotal: number;

  @Column({ type: 'json', nullable: true })
  tracking?: TrackingEntry[] | null;

  /** Base units already returned against this line */
  @Column(qtyColumn({ default: 0 }))
  returnedQuantity: number;
}
