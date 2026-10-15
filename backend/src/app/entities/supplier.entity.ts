import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import { encryptedColumnTransformer, piiHash } from '../shared/kvkk/crypto';
import { CompanyEntity } from './company.entity';
import { AddressColumns, formatAddress } from './address.embedded';

export type SupplierType = 'company' | 'individual' | 'farmer';
export const SUPPLIER_TYPES: SupplierType[] = ['company', 'individual', 'farmer'];

@Entity('suppliers')
@Index('IDX_suppliers_companyId', ['companyId'])
@Index('IDX_suppliers_company_identity_hash', ['companyId', 'identityNumberHash'])
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

  /** AES-256-GCM encrypted at rest (WP7: farmers / individuals hold a TCKN) */
  @Column({ type: 'varchar', length: 100, nullable: true, transformer: encryptedColumnTransformer })
  identityNumber?: string | null;

  /** Tenant-scoped blind index; never selected by default, so never part of an API response (R61) */
  @Column({ type: 'char', length: 64, nullable: true, select: false })
  identityNumberHash?: string | null;

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

  /** Supplier imports iron-steel / produces it from ore: no 627 withholding on its deliveries (KDVGUT I/C-2.1.3.3.8) */
  @Column({ default: false })
  isImporterOrOreProducer: boolean;

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

  @BeforeInsert()
  @BeforeUpdate()
  syncIdentityHash() {
    if (this.identityNumber !== undefined && this.companyId) this.identityNumberHash = piiHash(this.identityNumber, this.companyId);
  }

}

// API / webhook compatibility: one-line address (pre-WP1 `address` string); `address` is now an object.
// Non-enumerable, so it is not a column and not copied by spreads.
Object.defineProperty(SupplierEntity.prototype, 'toJSON', {
  enumerable: false,
  value: function (this: SupplierEntity) {
    return { ...this, addressText: formatAddress(this.address) };
  },
});
