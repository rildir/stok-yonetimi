import { Entity, Column, PrimaryGeneratedColumn, Index, DeleteDateColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { OrderChargeEntity } from './order-charge.entity';
import type { TaxBreakdownRow } from '../shared/finance/tax';
import { OrderItemEntity } from './order-item.entity';
import { OrderStatus } from './enums';
import { CustomerEntity } from './customer.entity';

@Entity('orders')
@Index('UQ_orders_company_orderNumber', ['companyId', 'orderNumber'], { unique: true })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_orders_company' })
  company?: CompanyEntity;

  @Column()
  orderNumber: string;

  @Index('IDX_orders_customerId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @ManyToOne(() => CustomerEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_orders_customer' })
  customer?: CustomerEntity | null;

  /** Snapshot of the customer name at order time */
  @Column()
  customerName: string;

  @Index()
  @Column('datetime', { default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Index()
  @Column({ type: 'varchar', default: OrderStatus.PENDING })
  status: OrderStatus | string;

  /** ISO 4217 document currency (lines inherit it) */
  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  /** 1 unit of `currency` expressed in company base currency at document time */
  @Column('decimal', { precision: 18, scale: 6, default: 1, transformer: new ColumnNumericTransformer() })
  exchangeRate: number;

  /** Sum of net line amounts */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  subtotal: number;

  /** Sum of line tax amounts */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxTotal: number;

  /** subtotal + taxTotal */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  grandTotal: number;

  /** Kept equal to grandTotal for backwards compatibility */
  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

  /** Document discount (net, KDVK 24/a) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  documentDiscountAmount: number;

  /** Document discount as entered (gross when tax-inclusive prices) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  documentDiscountEntered: number;

  /** Net additional charges (nakliye, ambalaj, sigorta...) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  chargesTotal: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  otvTotal: number;

  /** Tevkif edilen KDV */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  withheldTaxTotal: number;

  /** VAT calculated but not collected (ihraç kayıtlı / reverse charge) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  notCollectedTaxTotal: number;

  /** Ödenecek tutar = grandTotal - withheld VAT */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  payableTotal: number;

  /** Per (rate, exemption, withholding) breakdown (UBL TaxSubtotal) */
  @Column({ type: 'simple-json', nullable: true })
  taxBreakdown?: TaxBreakdownRow[] | null;

  /** TRY equivalents at the tax-point rate (KDVK 26 / VUK 215) */
  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  subtotalTry: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  taxTotalTry: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  grandTotalTry: number;

  /** TCMB | MANUAL | BASE */
  @Column({ type: 'varchar', length: 10, nullable: true })
  exchangeRateSource?: string | null;

  /** Date of the rate used (YYYY-MM-DD) */
  @Column({ type: 'date', nullable: true })
  exchangeRateDate?: string | null;

  /** Vergiyi doğuran olay tarihi (KDVK 10: teslim / sevk / fatura) */
  @Column({ type: 'date', nullable: true })
  taxPointDate?: string | null;

  /** taxPointDate was entered by the user (e.g. invoice issued before delivery); otherwise it follows shipment / receipt */
  @Column({ default: false })
  taxPointExplicit: boolean;

  /** SATIS / ISTISNA / TEVKIFAT / IHRACKAYITLI / IADE (UBL-TR InvoiceTypeCode hint) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  invoiceTypeHint?: string | null;

  /** Tax fields locked (order completed / goods received); set once */
  @Column({ type: 'datetime', nullable: true })
  taxFrozenAt?: Date | null;

  @OneToMany(() => OrderChargeEntity, (c) => c.order, { cascade: true, eager: true })
  charges: OrderChargeEntity[];

  /** Actual shipment / delivery time (tax point under KDVK 10) */
  @Column({ type: 'datetime', nullable: true })
  shippedAt?: Date | null;

  /** STORE | WEB | MARKETPLACE | PHONE | B2B | OTHER */
  @Column({ type: 'varchar', length: 20, nullable: true })
  salesChannel?: string | null;

  /** Distance sale (mesafeli satış, 509 IV.2.4.5) */
  @Column({ default: false })
  isDistanceSale: boolean;

  /** Order number on the marketplace / web shop */
  @Column({ type: 'varchar', length: 100, nullable: true })
  channelOrderRef?: string | null;

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true, eager: true })
  items: OrderItemEntity[];

  @Column({ nullable: true })
  carrier?: string;

  @Column({ nullable: true })
  trackingNumber?: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
