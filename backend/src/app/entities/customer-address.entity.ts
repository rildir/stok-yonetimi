import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { CustomerEntity } from './customer.entity';
import { AddressColumns } from './address.embedded';

export type CustomerAddressKind = 'BILLING' | 'DELIVERY';
export const CUSTOMER_ADDRESS_KINDS: CustomerAddressKind[] = ['BILLING', 'DELIVERY'];

/** Additional billing / delivery addresses of a customer (the registered address lives on the customer). */
@Entity('customer_addresses')
@Index('IDX_customer_addresses_company_customer', ['companyId', 'customerId'])
export class CustomerAddressEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_customer_addresses_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  @ManyToOne(() => CustomerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_customer_addresses_customer' })
  customer?: CustomerEntity;

  @Column({ type: 'varchar', length: 10, default: 'DELIVERY' })
  kind: CustomerAddressKind | string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label?: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contactName?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column(() => AddressColumns, { prefix: false })
  address: AddressColumns;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
