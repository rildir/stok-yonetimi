import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { AddressColumns, formatAddress } from './address.embedded';

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

  // --- Tax identity (VUK 230/3, 231/6; KDVGUT I/C-2.1.3) ---

  /** VKN | TCKN | YKN | FOREIGN | ANONYMOUS (final consumer) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  identityType?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  identityNumber?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  taxOfficeCode?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  taxOfficeName?: string | null;

  @Column({ default: false })
  isVatTaxpayer: boolean;

  /** Belirlenmis alici (KDV tevkifati) */
  @Column({ default: false })
  isDesignatedBuyer: boolean;

  @Column({ type: 'varchar', length: 30, nullable: true })
  passportNo?: string | null;

  /** ISO 3166-1 alpha-2 */
  @Column({ type: 'varchar', length: 2, nullable: true })
  nationality?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  foreignTaxId?: string | null;

  // e-document registry (filled by the WP5 registered-user lookup)
  @Column({ type: 'boolean', nullable: true })
  eInvoiceRegistered?: boolean | null;

  @Column({ type: 'json', nullable: true })
  eInvoiceAliases?: string[] | null;

  @Column({ type: 'datetime', nullable: true })
  eInvoiceCheckedAt?: Date | null;

  @Column({ type: 'boolean', nullable: true })
  eDespatchRegistered?: boolean | null;

  @Column({ type: 'json', nullable: true })
  eDespatchAliases?: string[] | null;

  /** Preferred e-invoice profile, e.g. TEMELFATURA / TICARIFATURA / EARSIVFATURA */
  @Column({ type: 'varchar', length: 20, nullable: true })
  preferredProfile?: string | null;

  // KVKK privacy notice (aydinlatma) record
  @Column({ type: 'datetime', nullable: true })
  noticeGivenAt?: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  noticeVersion?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  noticeChannel?: string | null;

  /** Registered address; extra billing / delivery addresses live in customer_addresses */
  @Column(() => AddressColumns, { prefix: false })
  address: AddressColumns;

  /** Set when legacy data could not be classified (WP1 migration) */
  @Index('IDX_customers_needs_review')
  @Column({ default: false })
  needsReview: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reviewReason?: string | null;

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

/**
 * API / webhook compatibility (pre-WP1 integrators): read-only legacy fields next to the
 * structured identity and address (`address` itself is now an object). Ignored on input.
 */
export function customerLegacyFields(c: Pick<CustomerEntity, 'identityNumber' | 'address'>) {
  return {
    taxNumber: c.identityNumber ?? null,
    addressText: formatAddress(c.address),
    city: c.address?.province ?? null,
    postalCode: c.address?.postalCode ?? null,
    country: c.address?.country ?? null,
  };
}

// Non-enumerable, so it is not a column and not copied by spreads; JSON responses / webhooks call it.
Object.defineProperty(CustomerEntity.prototype, 'toJSON', {
  enumerable: false,
  value: function (this: CustomerEntity) {
    return { ...this, ...customerLegacyFields(this) };
  },
});
