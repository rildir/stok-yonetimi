import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

/**
 * A document series of a company: kind (INVOICE, DESPATCH...), numbering mode (EDOCUMENT:
 * 3 chars + year + 9 digits; PAPER: printed series-sequence; INTERNAL) and series code.
 */
@Entity('document_series')
@Index('UQ_document_series_company_kind_mode_code', ['companyId', 'kind', 'mode', 'seriesCode'], { unique: true })
export class DocumentSeriesEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_document_series_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'varchar', length: 10 })
  mode: string;

  @Column({ type: 'varchar', length: 3 })
  seriesCode: string;

  /** Used when no series is chosen (one default per kind and mode) */
  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  isActive: boolean;

  /** Optional location the series belongs to (branch / warehouse) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Number counter per (company, kind, mode, series, year). EDOCUMENT / INTERNAL counters restart
 * every year (year = calendar year); PAPER counters run on (year = 0). Locked with
 * SELECT ... FOR UPDATE by DocumentNumberService, so numbers have no gaps or duplicates.
 */
@Entity('document_sequences')
@Index('UQ_document_sequences_key', ['companyId', 'kind', 'mode', 'seriesCode', 'year'], { unique: true })
export class DocumentSequenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_document_sequences_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'varchar', length: 10 })
  mode: string;

  @Column({ type: 'varchar', length: 3 })
  seriesCode: string;

  @Column('int')
  year: number;

  @Column('int', { default: 0 })
  lastNumber: number;

  /** Date of the last numbered document (no number for an earlier date: good practice) */
  @Column({ type: 'date', nullable: true })
  lastDate?: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
