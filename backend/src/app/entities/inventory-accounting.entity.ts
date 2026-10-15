import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { qtyColumn } from '../utils/quantity-transformer';

/**
 * WP6: costing, fiscal periods, period-end inventory, wastage / disposal, impairment, journal
 * export, price history and food traceability (R46-R55, R17, R21, R67-R71).
 * Every table is tenant scoped (companyId, RESTRICT: legal records survive a company delete).
 */

const NUM = new ColumnNumericTransformer();
/** Amount in the company base currency, 2 decimals. */
export const amountColumn = (extra: { default?: number; nullable?: boolean } = { default: 0 }) =>
  ({ type: 'decimal', precision: 18, scale: 2, transformer: NUM, ...extra }) as const;
/** Unit cost, 6 decimals. */
export const unitCostColumn = (extra: { default?: number; nullable?: boolean } = { default: 0 }) =>
  ({ type: 'decimal', precision: 18, scale: 6, transformer: NUM, ...extra }) as const;
const pctColumn = (extra: { default?: number; nullable?: boolean } = { nullable: true }) =>
  ({ type: 'decimal', precision: 7, scale: 4, transformer: NUM, ...extra }) as const;

/** Receipt layer of a product (FIFO / lot costing; the pool for average methods). */
@Entity('stock_cost_layers')
@Index('IDX_stock_cost_layers_company_product', ['companyId', 'productId', 'receivedAt'])
@Index('IDX_stock_cost_layers_movement', ['movementId'])
export class StockCostLayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_stock_cost_layers_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lotId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lotNumber?: string | null;

  /** Incoming movement that created the layer (null: opening / backfill layer) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  movementId?: string | null;

  /** Acquisition time (enflasyon düzeltmesi helper: iktisap tarihi) */
  @Column({ type: 'datetime' })
  receivedAt: Date;

  @Column(qtyColumn())
  qtyIn: number;

  @Column(qtyColumn())
  qtyRemaining: number;

  /** Base currency per base unit */
  @Column(unitCostColumn())
  unitCost: number;

  /** PURCHASE | OPENING | RETURN | COUNT | AVERAGE | BACKFILL | LANDED | REVERSAL */
  @Column({ type: 'varchar', length: 20 })
  source: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** VUK 262 cost elements added after receipt (nakliye, gümrük, sigorta, depolama...). */
@Entity('landed_cost_allocations')
@Index('IDX_landed_cost_allocations_company_receipt', ['companyId', 'goodsReceiptId'])
export class LandedCostAllocationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_landed_cost_allocations_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  goodsReceiptId?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  receiptNo?: string | null;

  /** NAKLIYE | GUMRUK | SIGORTA | DEPOLAMA | KOMISYON | HARC | KUR_FARKI_GIRIS_ONCESI | FAIZ_GIRIS_ONCESI | KUR_FARKI_GIRIS_SONRASI */
  @Column({ type: 'varchar', length: 30 })
  costType: string;

  /** AMOUNT | QUANTITY */
  @Column({ type: 'varchar', length: 10, default: 'AMOUNT' })
  basis: string;

  /** Base currency */
  @Column(amountColumn())
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  @Column(amountColumn())
  originalAmount: number;

  @Column(unitCostColumn({ default: 1 }))
  fxRate: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'date', nullable: true })
  documentDate?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendorName?: string | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  vendorTaxId?: string | null;

  /** Part capitalised on goods still on hand */
  @Column(amountColumn())
  toInventory: number;

  /** Part on goods already issued (cost of sales) */
  @Column(amountColumn())
  toCogs: number;

  /** Per receipt line: { movementId, productId, productName, quantity, share, toInventory, toCogs } */
  @Column({ type: 'json' })
  lines: Record<string, unknown>[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  /** Allocation date (journal / period) */
  @Column({ type: 'date' })
  allocatedOn: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Fiscal year and its four quarters (geçici vergi dönemleri). */
@Entity('fiscal_periods')
@Index('UQ_fiscal_periods_company_type_year_q', ['companyId', 'periodType', 'fiscalYear', 'quarter'], { unique: true })
@Index('IDX_fiscal_periods_company_range', ['companyId', 'startAt', 'endAt'])
export class FiscalPeriodEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_fiscal_periods_company' })
  company?: CompanyEntity;

  /** YEAR | QUARTER */
  @Column({ type: 'varchar', length: 10 })
  periodType: string;

  @Column({ type: 'int' })
  fiscalYear: number;

  /** 0 = whole year, 1-4 = quarter */
  @Column({ type: 'tinyint', default: 0 })
  quarter: number;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  /** UTC bounds of the period in the company time zone [startAt, endAt) (used by the DB trigger) */
  @Column({ type: 'datetime' })
  startAt: Date;

  @Column({ type: 'datetime' })
  endAt: Date;

  /** OPEN | CLOSED */
  @Column({ type: 'varchar', length: 10, default: 'OPEN' })
  status: string;

  @Column({ type: 'datetime', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  closedBy?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  closedByUserId?: string | null;

  /** SHA-256 of the closing balance snapshot */
  @Column({ type: 'char', length: 64, nullable: true })
  snapshotHash?: string | null;

  @Column({ type: 'int', default: 0 })
  reopenCount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastReopenReason?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Closing snapshot of a period: quantity and cost per product / warehouse / lot. */
@Entity('inventory_period_balances')
@Index('IDX_inventory_period_balances_period', ['companyId', 'periodId'])
export class InventoryPeriodBalanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_inventory_period_balances_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  periodId: string;

  /** 1 for the first closing; a re-close after a reopen adds a new set (old ones stay) */
  @Column({ type: 'int', default: 1 })
  closingSeq: number;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  productSku?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  inventoryClass?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lotNumber?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unitCode?: string | null;

  @Column(qtyColumn())
  quantity: number;

  @Column(unitCostColumn())
  unitCost: number;

  @Column(amountColumn())
  totalCost: number;

  @Column({ type: 'varchar', length: 30 })
  costingMethod: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** İmha / zayi dosyası (VUK 278, 278/A; takdir komisyonu, resmi kurum). */
@Entity('disposal_batches')
@Index('UQ_disposal_batches_company_no', ['companyId', 'batchNo'], { unique: true })
export class DisposalBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_disposal_batches_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  batchNo: string;

  /** TAKDIR_KOMISYONU | VUK278A_IMHA_ORANI | RESMI_KURUM */
  @Column({ type: 'varchar', length: 30 })
  basis: string;

  /** REQUESTED | APPLIED | DECIDED | DESTROYED | CANCELLED */
  @Column({ type: 'varchar', length: 15, default: 'REQUESTED' })
  status: string;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  /** Afet (VUK 278; KDVK 30/c exception): no KDV correction */
  @Column({ default: false })
  disaster: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  /** [{ productId, productName, sku, lotId, lotNumber, warehouseId, quantity, unitCode, unitCost, totalCost, vatRate }] */
  @Column({ type: 'json' })
  lines: Record<string, unknown>[];

  @Column(amountColumn())
  totalCost: number;

  @Column({ type: 'date', nullable: true })
  applicationDate?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  applicationRef?: string | null;

  @Column({ type: 'date', nullable: true })
  decisionDate?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  decisionRef?: string | null;

  /** Commission / authority valuation (emsal bedeli) */
  @Column(amountColumn({ nullable: true }))
  decisionValue?: number | null;

  @Column({ type: 'datetime', nullable: true })
  destroyedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  destructionPlace?: string | null;

  /** Tutanak witnesses / officials: [{ name, title }] */
  @Column({ type: 'json', nullable: true })
  witnesses?: { name: string; title?: string | null }[] | null;

  @Column({ type: 'json', nullable: true })
  movementIds?: string[] | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  requestedBy?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Değer düşüklüğü hesap cetveli rows (VUK 274/267; TMS 2 - 158). */
@Entity('inventory_valuation_adjustments')
@Index('IDX_inventory_valuation_adjustments_company_date', ['companyId', 'valuationDate'])
export class InventoryValuationAdjustmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_inventory_valuation_adjustments_company' })
  company?: CompanyEntity;

  @Column({ type: 'date' })
  valuationDate: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  inventoryClass?: string | null;

  @Column(qtyColumn())
  quantity: number;

  @Column(unitCostColumn())
  unitCost: number;

  @Column(amountColumn())
  costValue: number;

  @Column(unitCostColumn({ nullable: true }))
  emsalUnitPrice?: number | null;

  /** YYYY-MM of the month used */
  @Column({ type: 'varchar', length: 7, nullable: true })
  emsalMonth?: string | null;

  /** M | M-1 | M-2 | TAKDIR */
  @Column({ type: 'varchar', length: 8 })
  emsalBasis: string;

  @Column(qtyColumn({ nullable: true }))
  monthSalesQty?: number | null;

  @Column(pctColumn())
  declinePct?: number | null;

  /** Vergi değeri (VUK) */
  @Column(amountColumn())
  taxValue: number;

  /** Muhasebe değeri (TMS 2; difference = 158) */
  @Column(amountColumn())
  bookValue: number;

  @Column(amountColumn())
  provision: number;

  @Column({ default: false })
  requiresCommission: boolean;

  /** DRAFT | POSTED */
  @Column({ type: 'varchar', length: 10, default: 'POSTED' })
  status: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Company account map for the journal export (THP defaults apply where no row exists). */
@Entity('account_mappings')
@Index('IDX_account_mappings_company_event', ['companyId', 'event'])
export class AccountMappingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_account_mappings_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  event: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  inventoryClass?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ type: 'varchar', length: 30 })
  debitAccount: string;

  @Column({ type: 'varchar', length: 30 })
  creditAccount: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** One journal export (idempotent by exportBatchId; its content is stored verbatim). */
@Entity('journal_export_batches')
@Index('UQ_journal_export_batches_company_batch', ['companyId', 'exportBatchId'], { unique: true })
export class JournalExportBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_journal_export_batches_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 64 })
  exportBatchId: string;

  @Column({ type: 'date' })
  fromDate: string;

  @Column({ type: 'date' })
  toDate: string;

  @Column({ type: 'int', default: 0 })
  voucherCount: number;

  @Column({ type: 'int', default: 0 })
  sourceCount: number;

  @Column(amountColumn())
  debitTotal: number;

  @Column(amountColumn())
  creditTotal: number;

  @Column({ type: 'char', length: 64 })
  contentSha256: string;

  /** The exported journal (vouchers + skipped), returned unchanged on a repeated request */
  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Ledger rows / landed costs already exported (each one exactly once). */
@Entity('journal_export_items')
@Index('UQ_journal_export_items_company_source', ['companyId', 'sourceType', 'sourceId'], { unique: true })
export class JournalExportItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  batchId: string;

  /** MOVEMENT | LANDED_COST | IMPAIRMENT */
  @Column({ type: 'varchar', length: 15 })
  sourceType: string;

  @Column({ type: 'varchar', length: 36 })
  sourceId: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** Sales price history (R70: discount reference price, shelf label change date). */
@Entity('product_price_history')
@Index('IDX_product_price_history_company_product', ['companyId', 'productId', 'validFrom'])
export class ProductPriceHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_product_price_history_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** Price as entered on the product (net or gross per company setting) */
  @Column('decimal', { precision: 18, scale: 2, transformer: NUM })
  price: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  /** VAT-inclusive consumer price at that time */
  @Column('decimal', { precision: 18, scale: 2, transformer: NUM, nullable: true })
  priceInclTax?: number | null;

  @Column({ type: 'datetime' })
  validFrom: Date;

  /** PRODUCT_UPDATE | BACKFILL | IMPORT */
  @Column({ type: 'varchar', length: 20, default: 'PRODUCT_UPDATE' })
  source: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  changedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Lot soy ağacı: a lot made from / split into other lots (repack, split, merge, processing). */
@Entity('lot_genealogy')
@Index('IDX_lot_genealogy_company_parent', ['companyId', 'parentLotNumber'])
@Index('IDX_lot_genealogy_company_child', ['companyId', 'childLotNumber'])
export class LotGenealogyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_lot_genealogy_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  parentProductId: string;

  @Column({ type: 'varchar', length: 64 })
  parentLotNumber: string;

  @Column({ type: 'varchar', length: 36 })
  childProductId: string;

  @Column({ type: 'varchar', length: 64 })
  childLotNumber: string;

  /** SPLIT | MERGE | REPACK | PROCESS */
  @Column({ type: 'varchar', length: 10 })
  relation: string;

  @Column(qtyColumn({ nullable: true }))
  quantity?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Normalised lot / serial lines of documents and movements (previously only JSON `tracking`
 * columns): the traceability and recall reports query this table.
 */
@Entity('document_line_tracking')
@Index('IDX_document_line_tracking_company_lot', ['companyId', 'productId', 'lotNumber'])
@Index('IDX_document_line_tracking_company_serial', ['companyId', 'serial'])
@Index('UQ_document_line_tracking_source', ['companyId', 'sourceType', 'sourceId', 'lotNumber', 'serial'], { unique: true })
export class DocumentLineTrackingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_document_line_tracking_company' })
  company?: CompanyEntity;

  /** order_item | despatch_line | invoice_line | goods_receipt_item | return_item | movement */
  @Column({ type: 'varchar', length: 20 })
  sourceType: string;

  @Column({ type: 'varchar', length: 36 })
  sourceId: string;

  /** ORDER | DESPATCH | INVOICE | GOODS_RECEIPT | RETURN | STOCK_COUNT | ... */
  @Column({ type: 'varchar', length: 30, nullable: true })
  documentType?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  documentId?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'date', nullable: true })
  documentDate?: string | null;

  /** IN | OUT */
  @Column({ type: 'varchar', length: 3 })
  direction: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lotId?: string | null;

  @Column({ type: 'varchar', length: 64, default: '' })
  lotNumber: string;

  @Column({ type: 'date', nullable: true })
  expiryDate?: string | null;

  @Column({ type: 'varchar', length: 100, default: '' })
  serial: string;

  @Column(qtyColumn())
  quantity: number;

  /** CUSTOMER | SUPPLIER | null */
  @Column({ type: 'varchar', length: 10, nullable: true })
  partyType?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  partyId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  partyName?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  partyTaxId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  movementId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  occurredAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Geri çağırma kaydı (real or yearly mock recall). */
@Entity('lot_recalls')
@Index('UQ_lot_recalls_company_no', ['companyId', 'recallNo'], { unique: true })
export class LotRecallEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_lot_recalls_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  recallNo: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'json' })
  lotNumbers: string[];

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  /** Tatbikat (yearly mock recall): lots are not blocked, no webhook */
  @Column({ default: false })
  isMock: boolean;

  /** OPEN | CLOSED */
  @Column({ type: 'varchar', length: 10, default: 'OPEN' })
  status: string;

  /** Customers who received the lots: [{ partyId, partyName, partyTaxId, quantity, documents[] }] */
  @Column({ type: 'json' })
  affectedCustomers: Record<string, unknown>[];

  @Column(qtyColumn({ default: 0 }))
  quantityShipped: number;

  @Column(qtyColumn({ default: 0 }))
  quantityInStock: number;

  /** Bakanlık (İl Tarım ve Orman Müdürlüğü) bildirimi */
  @Column({ type: 'datetime', nullable: true })
  ministryNotifiedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ministryNotificationRef?: string | null;

  @Column({ type: 'datetime', nullable: true })
  consumerNoticeAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  consumerNoticeChannel?: string | null;

  @Column({ type: 'datetime', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const WP6_ENTITIES = [
  StockCostLayerEntity,
  LandedCostAllocationEntity,
  FiscalPeriodEntity,
  InventoryPeriodBalanceEntity,
  DisposalBatchEntity,
  InventoryValuationAdjustmentEntity,
  AccountMappingEntity,
  JournalExportBatchEntity,
  JournalExportItemEntity,
  ProductPriceHistoryEntity,
  LotGenealogyEntity,
  DocumentLineTrackingEntity,
  LotRecallEntity,
];
