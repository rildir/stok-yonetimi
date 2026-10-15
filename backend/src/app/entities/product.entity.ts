import { Entity, Column, PrimaryGeneratedColumn, Check, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { CategoryEntity } from './category.entity';
import { SupplierEntity } from './supplier.entity';
import { ProductWarehouseStockEntity } from './product-warehouse-stock.entity';
import { ProductStatus } from './enums';
import { TaxRateEntity } from './tax-rate.entity';
import { UnitEntity } from './unit.entity';
import { ProductUnitEntity } from './product-unit.entity';
import { TrackingType } from './tracking';
import { qtyColumn } from '../utils/quantity-transformer';

@Entity('products')
@Index('UQ_products_company_sku', ['companyId', 'sku'], { unique: true })
@Index('UQ_products_company_barcode', ['companyId', 'barcode'], { unique: true })
@Check('quantity >= 0')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_products_company' })
  company?: CompanyEntity;

  @Column()
  name: string;

  @Column()
  sku: string;

  @Index()
  @Column()
  category: string; // Slug for category lookup

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  categoryEntity?: CategoryEntity;

  @Column({ nullable: true })
  categoryId?: string;

  @Column('decimal', { precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
  price: number;

  /** Denormalized SUM(product_warehouse_stocks.quantity); kept in sync by WarehouseStockService. */
  @Column(qtyColumn({ default: 0 }))
  quantity: number;

  /**
   * Denormalized sellable stock: the part of `quantity` held in sellable warehouses
   * (not QUARANTINE / IN_TRANSIT, isSellable). `status` (low / out of stock) follows it.
   */
  @Column(qtyColumn({ default: 0 }))
  availableQuantity: number;

  /** Response-only (not a column): quantity reserved by pending despatch-mode orders. */
  reservedQuantity?: number;

  @Column(qtyColumn())
  minQuantity: number;

  @Column({ type: 'varchar', default: ProductStatus.IN_STOCK })
  status: ProductStatus | string;

  /** Legacy display string; kept equal to the base unit's code. */
  @Column({ default: 'pcs' })
  unit: string;

  /** Base (stock) unit. All quantities are stored in this unit. */
  @Index('IDX_products_baseUnitId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  baseUnitId?: string | null;

  @ManyToOne(() => UnitEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'baseUnitId', foreignKeyConstraintName: 'FK_products_base_unit' })
  baseUnit?: UnitEntity | null;

  @OneToMany(() => ProductUnitEntity, (pu) => pu.product)
  units?: ProductUnitEntity[];

  /** Primary barcode, unique per company (across product and unit barcodes). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  barcode?: string | null;

  /** EAN13 | EAN8 | UPCA | CODE128 */
  @Column({ type: 'varchar', length: 10, nullable: true })
  barcodeType?: string | null;

  @Column({ type: 'varchar', length: 10, default: TrackingType.NONE })
  trackingType: TrackingType | string;

  @Column({ default: false })
  hasExpiry: boolean;

  /** Regulatory category (R67): none | food | medicine_its | medical_device_uts | cosmetic_uts */
  @Column({ type: 'varchar', length: 30, default: 'none' })
  regulatoryCategory: string;

  /** Tekdüzen Hesap Planı stock class: TICARI_MAL_153 | ILK_MADDE_150 | YARI_MAMUL_151 | MAMUL_152 | DIGER_157 */
  @Column({ type: 'varchar', length: 30, default: 'TICARI_MAL_153' })
  inventoryClass: string;

  // ─── WP6: food expiry, wastage, warranty, export data, shelf label ───

  /** use_by (STT: never sold after the date) | best_before (TETT: company policy) | null */
  @Column({ type: 'varchar', length: 12, nullable: true })
  expiryType?: string | null;

  /** day | month | year: month / year precision means the last day of that month / year */
  @Column({ type: 'varchar', length: 5, default: 'day' })
  expiryPrecision: string;

  /** Çabuk bozulan: the discount reference is the previous price */
  @Column({ default: false })
  perishable: boolean;

  /** Normal fire oranı (%) and its source (sector practice, takdir komisyonu, technical report) */
  @Column('decimal', { precision: 7, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  normalWastageRatePct?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  normalWastageSource?: string | null;

  /** Product is on the Garanti Belgesi Yönetmeliği list (B2C): warrantyMonths >= legal minimum */
  @Column({ default: false })
  warrantyRequired: boolean;

  @Column({ type: 'int', nullable: true })
  warrantyMonths?: number | null;

  /** ISO 3166-1 alpha-2; 'TR' prints the domestic production logo on shelf labels */
  @Column({ type: 'varchar', length: 2, nullable: true })
  originCountry?: string | null;

  /** GTİP (12 digits) for export documents */
  @Column({ type: 'varchar', length: 12, nullable: true })
  gtipCode?: string | null;

  @Column('decimal', { precision: 18, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  netWeightKg?: number | null;

  /** Net content per sales unit for the shelf-label unit price (e.g. 0.5 kg, 1 l) */
  @Column('decimal', { precision: 18, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  labelNetQuantity?: number | null;

  /** kg | l | m | m2 | adet */
  @Column({ type: 'varchar', length: 5, nullable: true })
  labelNetUnit?: string | null;

  /** Response-only: current unit cost (base currency) */
  unitCost?: number | null;

  /** GS1 GTIN in 14-digit form (İTS / ÜTS / e-Belge item identification) */
  @Column({ type: 'varchar', length: 14, nullable: true })
  gtin14?: string | null;

  @Index()
  @Column({ default: false })
  isDeleted: boolean;

  @Index()
  @Column({ nullable: true })
  supplierId: string;

  @ManyToOne(() => SupplierEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier?: SupplierEntity;

  @Column({ nullable: true })
  imageUrl: string;

  /** ISO 4217 currency of `price` */
  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  @Index('IDX_products_taxRateId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  taxRateId?: string | null;

  @ManyToOne(() => TaxRateEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'taxRateId', foreignKeyConstraintName: 'FK_products_tax_rate' })
  taxRate?: TaxRateEntity | null;

  /** Default KDV exemption code for sales of this product (required when its rate is EXEMPT) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  exemptionCode?: string | null;

  /** Default KDV withholding code (e.g. 627 demir-çelik); applied above the VUK 232 limit to taxpayer buyers */
  @Column({ type: 'varchar', length: 10, nullable: true })
  withholdingCode?: string | null;

  /** ÖTV code and rate (first delivery by manufacturer / importer, KDVK 24/b) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  otvCode?: string | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  otvRate?: number | null;

  @OneToMany(() => ProductWarehouseStockEntity, (pws) => pws.product)
  warehouseStocks?: ProductWarehouseStockEntity[];

  /**
   * Read-only view of per-warehouse stock (warehouse name -> qty), filled from
   * product_warehouse_stocks for API compatibility. Not a column.
   */
  warehouses?: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
