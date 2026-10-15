import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { qtyColumn } from '../utils/quantity-transformer';
import { TrackingEntry } from './tracking';
import { CarrierParty, DocumentRef, DriverInfo, PartySnapshot, PlateInfo, priceColumn } from './document-common';

/**
 * Sevk irsaliyesi (VUK 230/5; 509 IV.3; e-İrsaliye Kılavuzu). Numbered on approval; can never
 * be cancelled (DESPATCH_CANNOT_BE_CANCELLED). Legal content is frozen after DRAFT (DB triggers).
 */
@Entity('despatches')
@Index('UQ_despatches_company_documentNo', ['companyId', 'documentNo'], { unique: true })
@Index('IDX_despatches_company_status', ['companyId', 'status'])
@Index('IDX_despatches_company_order', ['companyId', 'orderId'])
export class DespatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_despatches_company' })
  company?: CompanyEntity;

  /** UUID (ETTN) generated with the draft */
  @Index('UQ_despatches_ettn', { unique: true })
  @Column({ type: 'char', length: 36 })
  ettn: string;

  /** Assigned on approval (EDOCUMENT / PAPER series) or entered (EXTERNAL) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  seriesCode?: string | null;

  /** EDOCUMENT | PAPER | EXTERNAL */
  @Column({ type: 'varchar', length: 10, nullable: true })
  numberMode?: string | null;

  /** UBL-TR ProfileID (TEMELIRSALIYE) */
  @Column({ type: 'varchar', length: 20, default: 'TEMELIRSALIYE' })
  profileId: string;

  /** SEVK | MATBUDAN */
  @Column({ type: 'varchar', length: 10, default: 'SEVK' })
  typeCode: string;

  /** SALE, TRANSFER, CONSIGNMENT, REPAIR, SAMPLE, SUBCONTRACT, RETURN, PURCHASE_PICKUP */
  @Column({ type: 'varchar', length: 20 })
  purpose: string;

  /** DRAFT -> APPROVED -> HANDED_TO_PROVIDER -> GIB_ACCEPTED / REJECTED / PARTIALLY_ACCEPTED */
  @Column({ type: 'varchar', length: 25, default: 'DRAFT' })
  status: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  orderNumber?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  returnId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  goodsReceiptId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceWarehouseId?: string | null;

  /** Transfers / consignment / repair: receiving location */
  @Column({ type: 'varchar', length: 36, nullable: true })
  targetWarehouseId?: string | null;

  /** Transfers: goods sit here between approval and receipt */
  @Column({ type: 'varchar', length: 36, nullable: true })
  inTransitWarehouseId?: string | null;

  /** Approval moves stock (false: order-mode sales, pickups, purchase returns booked by the return) */
  @Column({ default: true })
  stockEffect: boolean;

  @Column({ type: 'json', nullable: true })
  sellerSnapshot?: PartySnapshot | null;

  @Column({ type: 'json', nullable: true })
  buyerSnapshot?: PartySnapshot | null;

  @Column({ type: 'json', nullable: true })
  deliveryAddress?: PartySnapshot['address'] | null;

  /** Despatch origin (shipment address) */
  @Column({ type: 'json', nullable: true })
  originAddress?: PartySnapshot['address'] | null;

  @Column({ type: 'json', nullable: true })
  carrierParty?: CarrierParty | null;

  @Column({ type: 'json', nullable: true })
  drivers?: DriverInfo[] | null;

  @Column({ type: 'json', nullable: true })
  plates?: PlateInfo[] | null;

  /** Fiili sevk tarihi ve saati (509 V.5.3) */
  @Column({ type: 'datetime', nullable: true })
  actualDespatchAt?: Date | null;

  /** Düzenleme tarihi / saati (company time zone) */
  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  issueTime?: string | null;

  /** Invoices issued before the despatch (referenced on the despatch) */
  @Column({ type: 'json', nullable: true })
  invoiceRefs?: DocumentRef[] | null;

  // --- Paper (matbu) despatch issued during an outage (509 V.7, e-İrsaliye Kılavuzu §11-12)
  @Column({ type: 'varchar', length: 50, nullable: true })
  paperNo?: string | null;

  @Column({ type: 'date', nullable: true })
  paperDate?: string | null;

  /** 509 V.7 (a)-(ç): A | B | C | Ç */
  @Column({ type: 'varchar', length: 2, nullable: true })
  paperReason?: string | null;

  /** Reference of the written notice to GİB */
  @Column({ type: 'varchar', length: 100, nullable: true })
  gibNoticeRef?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  evidenceAttachmentId?: string | null;

  /** GIB | EMAIL | PRINT */
  @Column({ type: 'varchar', length: 10, nullable: true })
  deliveryChannel?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  gibStatus?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef?: string | null;

  /** NONE | PARTIAL | FULL | NA (no invoice expected) */
  @Column({ type: 'varchar', length: 10, default: 'NONE' })
  invoiceStatus: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approvedBy?: string | null;

  @Column({ type: 'datetime', nullable: true })
  approvedAt?: Date | null;

  /** Transfers: goods received at the target warehouse */
  @Column({ type: 'datetime', nullable: true })
  receivedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  receivedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @OneToMany(() => DespatchLineEntity, (l) => l.despatch, { cascade: true })
  lines: DespatchLineEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('despatch_lines')
@Index('IDX_despatch_lines_orderItem', ['orderItemId'])
export class DespatchLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  despatchId: string;

  @ManyToOne(() => DespatchEntity, (d) => d.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'despatchId', foreignKeyConstraintName: 'FK_despatch_lines_despatch' })
  despatch?: DespatchEntity;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column('int', { default: 1 })
  lineNo: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderItemId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  productSku?: string | null;

  /** Base-unit quantity */
  @Column(qtyColumn())
  quantity: number;

  /** UN/ECE code of the base unit */
  @Column({ type: 'varchar', length: 20, nullable: true })
  unitCode?: string | null;

  /** Optional (a despatch advice need not carry prices) */
  @Column(priceColumn({ nullable: true }))
  unitPrice?: number | null;

  /** Source warehouse of this line (default: the despatch source) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  /** Requested lot picks (base units) */
  @Column({ type: 'json', nullable: true })
  lots?: { lotId: string; quantity: number }[] | null;

  @Column({ type: 'json', nullable: true })
  serials?: string[] | null;

  /** Lots / serials actually shipped (set on approval) */
  @Column({ type: 'json', nullable: true })
  tracking?: TrackingEntry[] | null;

  @Column(qtyColumn({ default: 0 }))
  invoicedQuantity: number;

  @Column(qtyColumn({ default: 0 }))
  returnedQuantity: number;
}
