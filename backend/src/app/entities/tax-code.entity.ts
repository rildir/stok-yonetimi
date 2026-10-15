import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

/**
 * Global, versioned UBL-TR code lists (not tenant scoped, read-only through the API;
 * new versions are added by the platform super administrator). A row applies on dates
 * validFrom..validTo. `codeListVersion` names the GİB package the row was taken from and
 * `confidence` / `sourceRef` mark rows that still need confirmation (plan "Ek" list).
 */

/** PARTIAL (2xx kısmi), FULL (3xx tam), EXPORT_REGISTERED (7xx ihraç kayıtlı / DİİB), OTHER (351, 555) */
export type ExemptionType = 'PARTIAL' | 'FULL' | 'EXPORT_REGISTERED' | 'OTHER';

@Entity('tax_exemption_codes')
@Index('UQ_tax_exemption_codes_code_from', ['code', 'validFrom'], { unique: true })
export class TaxExemptionCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  code: string;

  @Column({ type: 'varchar', length: 500 })
  nameTr: string;

  @Column({ type: 'varchar', length: 500 })
  nameEn: string;

  @Column({ type: 'varchar', length: 20 })
  type: ExemptionType | string;

  /** Invoice type the code belongs to (ISTISNA / IHRACKAYITLI / SATIS) */
  @Column({ type: 'varchar', length: 20, default: 'ISTISNA' })
  invoiceType: string;

  /** VAT is calculated at the product rate but not collected (701/702) */
  @Column({ default: false })
  vatCalculatedNotCollected: boolean;

  /** Buyer must be a foreign party (mal / hizmet ihracatı) */
  @Column({ default: false })
  requiresForeignBuyer: boolean;

  @Column({ type: 'date' })
  validFrom: string;

  @Column({ type: 'date', nullable: true })
  validTo?: string | null;

  @Column({ type: 'varchar', length: 60 })
  codeListVersion: string;

  @Column({ type: 'varchar', length: 255 })
  sourceRef: string;

  @Column({ type: 'varchar', length: 10, default: 'high' })
  confidence: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** KDV withholding (tevkifat) codes: 6xx partial, 8xx full */
@Entity('withholding_codes')
@Index('UQ_withholding_codes_code_from', ['code', 'validFrom'], { unique: true })
export class WithholdingCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  code: string;

  @Column({ type: 'varchar', length: 500 })
  nameTr: string;

  @Column({ type: 'varchar', length: 500 })
  nameEn: string;

  /** Withheld share in tenths (5 = 5/10) */
  @Column('decimal', { precision: 4, scale: 1, transformer: new ColumnNumericTransformer() })
  numerator: number;

  @Column('int', { default: 10 })
  denominator: number;

  /** SERVICE (KDVGUT I/C-2.1.3.2), DELIVERY (2.1.3.3), FULL (8xx tam tevkifat) */
  @Column({ type: 'varchar', length: 10 })
  scope: string;

  /** Only purchases by the "belirlenmiş alıcılar" (KDVGUT I/C-2.1.3.1) are withheld */
  @Column({ default: false })
  requiresDesignatedBuyer: boolean;

  /** Not applied when the seller is an importer / produces from ore (627 demir-çelik) */
  @Column({ default: false })
  exemptForImporterOrOreProducer: boolean;

  @Column({ type: 'date' })
  validFrom: string;

  @Column({ type: 'date', nullable: true })
  validTo?: string | null;

  @Column({ type: 'varchar', length: 60 })
  codeListVersion: string;

  @Column({ type: 'varchar', length: 255 })
  sourceRef: string;

  @Column({ type: 'varchar', length: 10, default: 'high' })
  confidence: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** ÖTV tax type codes (UBL-TR TaxTypeCode) */
@Entity('otv_codes')
@Index('UQ_otv_codes_code_from', ['code', 'validFrom'], { unique: true })
export class OtvCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  code: string;

  @Column({ type: 'varchar', length: 500 })
  nameTr: string;

  @Column({ type: 'varchar', length: 500 })
  nameEn: string;

  /** ÖTV list (I, II, III, III-A, III-B, III-C, IV) */
  @Column({ type: 'varchar', length: 10 })
  list: string;

  @Column({ type: 'date' })
  validFrom: string;

  @Column({ type: 'date', nullable: true })
  validTo?: string | null;

  @Column({ type: 'varchar', length: 60 })
  codeListVersion: string;

  @Column({ type: 'varchar', length: 255 })
  sourceRef: string;

  @Column({ type: 'varchar', length: 10, default: 'high' })
  confidence: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
