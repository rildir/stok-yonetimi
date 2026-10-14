import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ProductEntity } from './product.entity';
import { UnitEntity } from './unit.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

/** Alternate unit of a product: 1 `unit` = `factor` base units (e.g. 1 box = 12 pcs). */
@Entity('product_units')
@Index('UQ_product_units_product_unit', ['productId', 'unitId'], { unique: true })
@Index('UQ_product_units_company_barcode', ['companyId', 'barcode'], { unique: true })
export class ProductUnitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_product_units_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => ProductEntity, (p) => p.units, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId', foreignKeyConstraintName: 'FK_product_units_product' })
  product?: ProductEntity;

  @Column({ type: 'varchar', length: 36 })
  unitId: string;

  @ManyToOne(() => UnitEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unitId', foreignKeyConstraintName: 'FK_product_units_unit' })
  unit?: UnitEntity;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  factor: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  barcode?: string | null;
}
