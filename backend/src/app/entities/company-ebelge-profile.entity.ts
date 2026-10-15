import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

export interface GrossSalesRow {
  year: number;
  amount: number;
}
export interface SectorFlagRow {
  code: string;
  since: string;
}
export interface CorporateEventRow {
  type: string;
  date: string;
  counterpartyMandatory?: boolean;
  note?: string | null;
}

/** e-Belge obligation profile of a company (input of computeObligations). One row per company. */
@Entity('company_ebelge_profiles')
@Index('UQ_company_ebelge_profiles_company', ['companyId'], { unique: true })
export class CompanyEBelgeProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_company_ebelge_profiles_company' })
  company?: CompanyEntity;

  /** Brüt satış hasılatı per year (TRY) */
  @Column({ type: 'json', nullable: true })
  annualGrossSales?: GrossSalesRow[] | null;

  @Column({ type: 'json', nullable: true })
  sectorFlagsEFatura?: SectorFlagRow[] | null;

  @Column({ type: 'json', nullable: true })
  sectorFlagsEIrsaliye?: SectorFlagRow[] | null;

  /** Actual start dates of use (YYYY-MM-DD) */
  @Column({ type: 'date', nullable: true })
  eFaturaSince?: string | null;

  @Column({ type: 'date', nullable: true })
  eArsivSince?: string | null;

  @Column({ type: 'date', nullable: true })
  eIrsaliyeSince?: string | null;

  /** 'MANDATORY' | 'VOLUNTARY' */
  @Column({ type: 'varchar', length: 12, nullable: true })
  mandatoryVsVoluntary?: string | null;

  /** Date of GİB's written notification (if any) */
  @Column({ type: 'date', nullable: true })
  gibWrittenNoticeDate?: string | null;

  /** Mergers, demergers, transfers (509 IV.1.5) */
  @Column({ type: 'json', nullable: true })
  corporateEvents?: CorporateEventRow[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
