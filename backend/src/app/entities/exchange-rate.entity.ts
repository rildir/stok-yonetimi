import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

/** 1 unit of `baseCurrency` = `rate` units of `quoteCurrency`, valid from `date`. */
@Entity('exchange_rates')
@Index('UQ_exchange_rates_company_pair_date', ['companyId', 'baseCurrency', 'quoteCurrency', 'date'], { unique: true })
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
