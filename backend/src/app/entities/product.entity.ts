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
  @Column('int', { default: 0 })
  quantity: number;

  @Column('int')
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
