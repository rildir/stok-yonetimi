import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type SupportedLanguage = 'tr' | 'en';
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['tr', 'en'];

/**
 * Tenant root. Every business row belongs to exactly one company.
 */
@Entity('companies')
export class CompanyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Index('UQ_companies_slug', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  /** ISO 3166-1 alpha-2 country code, e.g. TR, US, DE */
  @Column({ type: 'varchar', length: 2, default: 'TR' })
  country: string;

  @Column({ type: 'varchar', length: 5, default: 'tr' })
  defaultLanguage: SupportedLanguage | string;

  /** ISO 4217 currency code, e.g. TRY, USD, EUR */
  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  baseCurrency: string;

  /** IANA timezone, e.g. Europe/Istanbul */
  @Column({ type: 'varchar', length: 64, default: 'Europe/Istanbul' })
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Default tenant that owns pre-multi-tenancy data (see AddMultiTenancy migration). */
export const DEFAULT_COMPANY = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Demo Şirketi',
  slug: 'demo-sirketi',
  country: 'TR',
  defaultLanguage: 'tr',
  baseCurrency: 'TRY',
  timezone: 'Europe/Istanbul',
};
