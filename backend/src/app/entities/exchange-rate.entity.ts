import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

/** 1 unit of `baseCurrency` = `rate` units of `quoteCurrency`, valid from `date`. */
@Entity('exchange_rates')
@Index('UQ_exchange_rates_company_pair_date_type', ['companyId', 'baseCurrency', 'quoteCurrency', 'date', 'rateType'], { unique: true })
export class ExchangeRateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_exchange_rates_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 3 })
  baseCurrency: string;

  @Column({ type: 'varchar', length: 3 })
  quoteCurrency: string;

  @Column('decimal', { precision: 18, scale: 6, transformer: new ColumnNumericTransformer() })
  rate: number;

  /** YYYY-MM-DD */
  @Column({ type: 'date' })
  date: string;

  /** TCMB (fetched from the indicative-rates bulletin) | MANUAL */
  @Column({ type: 'varchar', length: 10, default: 'MANUAL' })
  source: string;

  /** FOREX_BUYING (döviz alış, used for VAT) | FOREX_SELLING | BANKNOTE_BUYING | BANKNOTE_SELLING */
  @Column({ type: 'varchar', length: 20, default: 'FOREX_BUYING' })
  rateType: string;

  /** When the source announced the rate (TCMB: bulletin date 15:30 Europe/Istanbul) */
  @Column({ type: 'datetime', nullable: true })
  announcedAt?: Date | null;

  /** TCMB bulletin number, e.g. 2026/194 */
  @Column({ type: 'varchar', length: 20, nullable: true })
  bulletinNo?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
