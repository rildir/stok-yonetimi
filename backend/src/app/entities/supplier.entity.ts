import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { AddressColumns } from './address.embedded';

export type SupplierType = 'company' | 'individual' | 'farmer';
export const SUPPLIER_TYPES: SupplierType[] = ['company', 'individual', 'farmer'];

@Entity('suppliers')
@Index('IDX_suppliers_companyId', ['companyId'])
export class SupplierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_suppliers_company' })
  company?: CompanyEntity;

  @Column()
  name: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 12, default: 'company' })
  type: SupplierType | string;

  /** VKN | TCKN | YKN | FOREIGN */
  @Column({ type: 'varchar', length: 10, nullable: true })
  identityType?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  identityNumber?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  taxOfficeCode?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  taxOfficeName?: string | null;

  @Column(() => AddressColumns, { prefix: false })
  address: AddressColumns;

  /** Registered taxpayer (issues invoices); false = gider pusulasi / mustahsil makbuzu needed */
  @Column({ default: true })
  isTaxpayer: boolean;

  /** Farmer taxed on the real basis (gercek usul) */
  @Column({ default: false })
  isRealTaxationFarmer: boolean;

  @Column({ default: false })
  isForeign: boolean;

  @Column({ default: true })
  isVatTaxpayer: boolean;

  /** Set when legacy data lacks a tax identity (WP1 migration) */
  @Column({ default: false })
  needsReview: boolean;

  @Column({ nullable: true })
  notes: string;

  @Column({ type: 'int', default: 5 })
  rating: number;

  @Column({ type: 'int', default: 3 })
  leadTimeDays: number;

  @Index()
  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
