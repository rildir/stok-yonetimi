import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { AddressColumns } from './address.embedded';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

export type CompanyTaxIdType = 'VKN' | 'TCKN';
export type BookkeepingType = 'BILANCO' | 'ISLETME' | 'BASIT';

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

  /** Whether entered product/line prices already include tax */
  @Column({ default: false })
  pricesIncludeTax: boolean;

  /** Lots expiring within this many days are flagged (dashboard / report). */
  @Column('int', { default: 30 })
  expiryAlertDays: number;

  // --- Fiscal identity (VUK 227/230, 509 IV.1.3, TTK 39) ---

  /** Ticaret unvani / ad soyad as registered with the tax office */
  @Column({ type: 'varchar', length: 255, nullable: true })
  legalName?: string | null;

  /** VKN for legal entities, TCKN for sole proprietors */
  @Column({ type: 'varchar', length: 4, nullable: true })
  taxIdType?: CompanyTaxIdType | string | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  taxId?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  taxOfficeCode?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  taxOfficeName?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  mersisNo?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tradeRegistryNo?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  tradeRegistryOffice?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  kepAddress?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  /** Registered head-office address */
  @Column(() => AddressColumns, { prefix: false })
  address: AddressColumns;

  /** Defter tutma usulu */
  @Column({ type: 'varchar', length: 10, nullable: true })
  bookkeepingType?: BookkeepingType | string | null;

  /** Regulatory modules enabled for products (food, medicine_its, medical_device_uts, cosmetic_uts) */
  @Column({ type: 'simple-json', nullable: true })
  enabledComplianceModules?: string[] | null;

  /** Manual stock adjustments worth more than this (base currency) need a second approver; null = off */
  @Column('decimal', { precision: 18, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  adjustmentApprovalThreshold?: number | null;

  /**
   * Stock lock date (YYYY-MM-DD): no stock movement may be dated on or before it
   * (closed period / delivered count). null = only the default floor applies.
   */
  @Column({ type: 'date', nullable: true })
  stockLockDate?: string | null;

  /** Seller is an importer / produces iron-steel from ore: 627 withholding does not apply (KDVGUT I/C-2.1.3.3.8) */
  @Column({ default: false })
  isImporterOrOreProducer: boolean;

  /** Company is a designated buyer (belirlenmiş alıcı, KDVGUT I/C-2.1.2.1): withholds on purchases under codes limited to them */
  @Column({ default: false })
  isDesignatedBuyer: boolean;

  /** Fetch TCMB indicative rates every business day (TR) */
  @Column({ default: false })
  fxAutoFetch: boolean;

  /**
   * When a sale leaves stock: 'despatch' (on approval of the despatch advice; default for TR,
   * VUK 230/5, KDVK 10) or 'order' (legacy: at order creation). The order keeps the mode it was created with.
   */
  @Column({ type: 'varchar', length: 10, default: 'order' })
  stockDeductOn: string;

  /** NONE: documents numbered from printed (matbu) series or registered from an external system; PROVIDER: e-Belge through an integrator (WP5) */
  @Column({ type: 'varchar', length: 10, default: 'NONE' })
  eDocumentMode: string;

  /** Müstahsil makbuzu module (VUK 235) */
  @Column({ default: false })
  producerReceiptEnabled: boolean;

  // ─── WP6: costing, fiscal periods, inventory policies, food, GS1 ───

  /** WAVG_MOVING | WAVG_PERIODIC_QUARTERLY | WAVG_PERIODIC_YEARLY | FIFO | SPECIFIC_LOT (no LIFO) */
  @Column({ type: 'varchar', length: 30, default: 'WAVG_MOVING' })
  costingMethod: string;

  /** First day the current method applies (start of a fiscal year) */
  @Column({ type: 'date', nullable: true })
  costingMethodEffectiveFrom?: string | null;

  /** Method that takes effect at pendingCostingMethodFrom (start of a later fiscal year) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  pendingCostingMethod?: string | null;

  @Column({ type: 'date', nullable: true })
  pendingCostingMethodFrom?: string | null;

  /** Exchange differences after receipt: EXPENSE (finance expense / income) | COST (added to cost) */
  @Column({ type: 'varchar', length: 10, default: 'EXPENSE' })
  postReceiptFxPolicy: string;

  /** 1-12 (özel hesap dönemi) */
  @Column({ type: 'tinyint', default: 1 })
  fiscalYearStartMonth: number;

  /** ANNUAL | TRIENNIAL_VUK190 | FIXED_VALUE_TTK66_3 */
  @Column({ type: 'varchar', length: 30, default: 'ANNUAL' })
  physicalCountPolicy: string;

  @Column({ type: 'date', nullable: true })
  lastPhysicalCountDate?: string | null;

  /** VUK 278/A imha oranı (%) assigned by the Ministry, its validity and reference */
  @Column('decimal', { precision: 7, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  destructionRatePct?: number | null;

  @Column({ type: 'date', nullable: true })
  destructionRateValidUntil?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  destructionRateRef?: string | null;

  /** Sale of best-before (TETT) expired lots: BLOCK (default) | ALLOW (company policy, maker-checker + audit) */
  @Column({ type: 'varchar', length: 10, default: 'BLOCK' })
  bestBeforeSalePolicy: string;

  /** GS1 Türkiye company prefix (GTIN generation) */
  @Column({ type: 'varchar', length: 12, nullable: true })
  gs1CompanyPrefix?: string | null;

  // ─── WP7: KVKK, tenant closure, VERBİS ───

  /** ACTIVE | CLOSED (tenant closed: read-only until retentionUntil, R35) */
  @Column({ type: 'varchar', length: 10, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'datetime', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  closedBy?: string | null;

  /** 31.12.(closing year + 10): the frozen data is destroyed after this date */
  @Column({ type: 'date', nullable: true })
  retentionUntil?: string | null;

  /** Last full data export (required shortly before closing) */
  @Column({ type: 'datetime', nullable: true })
  lastFullExportAt?: Date | null;

  /** Contact for data-subject applications (KVKK md. 13; shown in the privacy notice) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  kvkkContactEmail?: string | null;

  /** VERBİS threshold inputs (KVKK md. 16; exemption thresholds in legal_parameters) */
  @Column({ type: 'int', nullable: true })
  verbisEmployeeCount?: number | null;

  @Column('decimal', { precision: 18, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  verbisBalanceSheetTotal?: number | null;

  /** Main activity is processing special-category data (no VERBİS exemption) */
  @Column({ default: false })
  verbisMainActivitySpecial: boolean;

  @Column({ default: false })
  verbisRegistered: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  verbisRegistrationNo?: string | null;

  /** Administrators must use TOTP 2FA */
  @Column({ default: true })
  adminTotpRequired: boolean;

  /** Until this time administrators without 2FA can still work (warning only) */
  @Column({ type: 'datetime', nullable: true })
  adminTotpGraceUntil?: Date | null;

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
