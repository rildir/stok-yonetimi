import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type ParameterConfidence = 'high' | 'medium' | 'low';

/**
 * Versioned legal thresholds / amounts (global, per country). A value applies
 * on dates validFrom..validTo (inclusive, validTo null = open ended).
 * Every row must cite its legal source (`sourceRef`).
 */
@Entity('legal_parameters')
@Index('UQ_legal_parameters_country_key_from', ['country', 'key', 'validFrom'], { unique: true })
export class LegalParameterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 2, default: 'TR' })
  country: string;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  /** YYYY-MM-DD */
  @Column({ type: 'date' })
  validFrom: string;

  /** YYYY-MM-DD, inclusive; null = still valid */
  @Column({ type: 'date', nullable: true })
  validTo?: string | null;

  /**
   * Number, string or structured JSON, stored as JSON text. (A MySQL JSON column
   * cannot be used: TypeORM re-parses JSON scalars such as "07-01" and fails.)
   */
  @Column({ type: 'text', transformer: { to: (v: unknown) => JSON.stringify(v ?? null), from: (v: string | null) => (v === null || v === undefined ? null : JSON.parse(v)) } })
  value: unknown;

  @Column({ type: 'varchar', length: 255 })
  sourceRef: string;

  @Column({ type: 'varchar', length: 10, default: 'high' })
  confidence: ParameterConfidence | string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
