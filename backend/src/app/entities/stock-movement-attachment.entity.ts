import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { StockMovementEntity } from './stock-movement.entity';

/** Supporting document of a manual stock movement (tutanak, fatura, imha tutanağı scan...). */
@Entity('stock_movement_attachments')
@Index('IDX_sm_attachments_company', ['companyId'])
export class StockMovementAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_sm_attachments_company' })
  company?: CompanyEntity;

  /** First movement of the adjustment it documents (null while an approval is pending) */
  @Index('IDX_sm_attachments_movement')
  @Column({ type: 'varchar', length: 36, nullable: true })
  movementId?: string | null;

  @ManyToOne(() => StockMovementEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movementId', foreignKeyConstraintName: 'FK_sm_attachments_movement' })
  movement?: StockMovementEntity | null;

  @Index('IDX_sm_attachments_request')
  @Column({ type: 'varchar', length: 36, nullable: true })
  adjustmentRequestId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column('int')
  size: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'mediumblob', select: false })
  content?: Buffer;

  @Column({ type: 'varchar', length: 100, nullable: true })
  uploadedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
