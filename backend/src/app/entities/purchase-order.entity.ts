import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { OrderChargeEntity } from './order-charge.entity';
import type { TaxBreakdownRow } from '../shared/finance/tax';
import { SupplierEntity } from './supplier.entity';
import { PurchaseOrderItemEntity } from './purchase-order-item.entity';
import { PurchaseOrderStatus } from './enums';

@Entity('purchase_orders')
@Index('UQ_purchase_orders_company_poNumber', ['companyId', 'poNumber'], { unique: true })
export class PurchaseOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_purchase_orders_company' })
  company?: CompanyEntity;

  @Column()
  poNumber: string;

  @Index()
  @Column({ nullable: true })
  supplierId: string;

  @ManyToOne(() => SupplierEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier?: SupplierEntity;

  @Column()
  supplierName: string;

  @Index()
  @Column({ type: 'varchar', default: PurchaseOrderStatus.DRAFT })
  status: PurchaseOrderStatus | string;

  @OneToMany(() => PurchaseOrderItemEntity, (item) => item.purchaseOrder, { cascade: true, eager: true })
  items: PurchaseOrderItemEntity[];

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

  @OneToMany(() => OrderChargeEntity, (c) => c.purchaseOrder, { cascade: true, eager: true })
  charges: OrderChargeEntity[];

  /** Import purchase (foreign supplier): VAT is paid at customs (KDVK 10/ı, 29/1-b) */
  @Column({ default: false })
  isImport: boolean;

  @Column({ type: 'varchar', length: 30, nullable: true })
  customsDeclarationNo?: string | null;

  @Column({ type: 'date', nullable: true })
  customsDeclarationDate?: string | null;

  /** Import VAT paid on the customs declaration (TRY) */
  @Column('decimal', { precision: 14, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  importVatAmount?: number | null;

  /** Part of the import VAT that is not deductible (goes to cost) */
  @Column('decimal', { precision: 14, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  nonDeductibleImportVat?: number | null;

  /** Warehouse that receives the goods (default warehouse when null) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ nullable: true })
  expectedDate: string;

  @Column({ nullable: true })
  notes: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
