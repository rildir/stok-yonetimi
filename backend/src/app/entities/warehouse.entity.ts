import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { AddressColumns, formatAddress } from './address.embedded';

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

  @Column(() => AddressColumns, { prefix: false })
  address: AddressColumns;

  /** Registered branch (sube) of the company; transfers between premises need a despatch advice (VUK 230/5) */
  @Column({ default: false })
  isBranch: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  branchCode?: string | null;

  /** Warehouses with the same site group share premises (no despatch advice between them; used by WP4) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  siteGroup?: string | null;

  /** Default 3-character document series for this location (used by WP4 numbering) */
  @Column({ type: 'varchar', length: 3, nullable: true })
  defaultSeries?: string | null;

  /** NORMAL | QUARANTINE (awaiting destruction) | CONSIGNMENT | IN_TRANSIT */
  @Column({ type: 'varchar', length: 20, default: 'NORMAL' })
  type: string;

  /** Stock here can be sold / auto-allocated to orders (always false for QUARANTINE / IN_TRANSIT) */
  @Column({ default: true })
  isSellable: boolean;

  /** OWN | CONSIGNMENT_IN (third-party goods held) | CONSIGNMENT_OUT (own goods at a third party) */
  @Column({ type: 'varchar', length: 20, default: 'OWN' })
  ownership: string;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

}

// API / webhook compatibility: one-line address (pre-WP1 `address` string); `address` is now an object.
// Non-enumerable, so it is not a column and not copied by spreads.
Object.defineProperty(WarehouseEntity.prototype, 'toJSON', {
  enumerable: false,
  value: function (this: WarehouseEntity) {
    return { ...this, addressText: formatAddress(this.address) };
  },
});
