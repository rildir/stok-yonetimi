import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

@Entity('categories')
@Index('UQ_categories_company_slug', ['companyId', 'slug'], { unique: true })
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_categories_company' })
  company?: CompanyEntity;

  @Column()
  name: string;

  @Column()
  slug: string;

  @Column({ default: false })
  isDeleted: boolean;

  /** Normal fire oranı (%) for products of this category without their own rate, and its source */
  @Column('decimal', { precision: 7, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  normalWastageRatePct?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  normalWastageSource?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
