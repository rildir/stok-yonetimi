import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

@Entity('warehouses')
@Index('UQ_warehouses_company_name', ['companyId', 'name'], { unique: true })
@Index('UQ_warehouses_company_code', ['companyId', 'code'], { unique: true })
export class WarehouseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_warehouses_company' })
  company?: CompanyEntity;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
