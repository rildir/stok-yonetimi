import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

export type CustomerType = 'individual' | 'company';
export const CUSTOMER_TYPES: CustomerType[] = ['individual', 'company'];

@Entity('customers')
@Index('IDX_customers_company_name', ['companyId', 'name'])
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_customers_company' })
  company?: CompanyEntity;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'individual' })
  type: CustomerType | string;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  taxNumber?: string | null;

  /** ISO 3166-1 alpha-2 */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country?: string | null;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode?: string | null;

  /** Preferred ISO 4217 currency for new orders */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
