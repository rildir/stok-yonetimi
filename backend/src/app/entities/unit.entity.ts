import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

/** Unit of measure per company (pcs, box, kg, ...). Standard units are translated in the UI by code. */
@Entity('units')
@Index('UQ_units_company_code', ['companyId', 'code'], { unique: true })
export class UnitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_units_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ default: false })
  isStandard: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
