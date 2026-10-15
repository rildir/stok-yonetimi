import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

export type TaxRateKind = 'STANDARD' | 'EXEMPT' | 'WITHHOLDING';

/**
 * Per-company VAT rates. For TR companies the rows mirror the legal catalog
 * (legal_parameters KDV_RATE_CATALOG): the rate is locked, 0 % is modelled as an
 * EXEMPT row that requires an exemption code, and a change never edits a row in place
 * but closes it (validTo) and inserts a new version (supersedesId), so documents keep
 * pointing at the version they were priced with.
 */
@Entity('tax_rates')
@Index('IDX_tax_rates_companyId', ['companyId'])
export class TaxRateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_tax_rates_company' })
  company?: CompanyEntity;

  @Column()
  name: string;

  /** Percentage, e.g. 20 for 20 % */
  @Column('decimal', { precision: 5, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  rate: number;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country?: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  /** Catalog code, e.g. KDV20 / KDV10 / KDV1 / KDV0 (exempt) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  code?: string | null;

  /** UBL-TR TaxTypeCode (KDV = 0015) */
  @Column({ type: 'varchar', length: 4, default: '0015' })
  taxTypeCode: string;

  /** STANDARD = taxable rate; EXEMPT = 0 % (requires an exemption code); WITHHOLDING reserved */
  @Column({ type: 'varchar', length: 12, default: 'STANDARD' })
  kind: TaxRateKind | string;

  /** First day this version applies (YYYY-MM-DD); null = since ever */
  @Column({ type: 'date', nullable: true })
  validFrom?: string | null;

  /** Last day this version applies (inclusive); null = still valid */
  @Column({ type: 'date', nullable: true })
  validTo?: string | null;

  /** Seeded from the legal catalog (TR): the rate itself cannot be edited */
  @Column({ default: false })
  isSystem: boolean;

  /** Previous version this row replaced (updates never change a rate in place) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  supersedesId?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
