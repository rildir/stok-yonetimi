import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * Global (tenant-less) read-only reference tables, seeded by migration
 * 1784274127000 from shared/refdata/tr-refdata.ts.
 */
@Entity('provinces')
export class ProvinceEntity {
  /** Plate code '01'..'81' */
  @PrimaryColumn({ type: 'varchar', length: 2 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}

@Entity('districts')
@Index('UQ_districts_province_name', ['provinceCode', 'name'], { unique: true })
export class DistrictEntity {
  /** provinceCode * 100 + position (stable across environments) */
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 2 })
  provinceCode: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}

@Entity('tax_offices')
@Index('IDX_tax_offices_province', ['provinceCode'])
export class TaxOfficeEntity {
  /** GİB muhasebe birim kodu (5 digits) */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 2 })
  provinceCode: string;

  /** District name; null = province centre */
  @Column({ type: 'varchar', length: 100, nullable: true })
  district?: string | null;
}
