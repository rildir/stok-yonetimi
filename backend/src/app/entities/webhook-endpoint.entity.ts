import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

@Entity('webhook_endpoints')
@Index('IDX_webhook_endpoints_company', ['companyId'])
export class WebhookEndpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_webhook_endpoints_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /** HMAC signing secret (needed in clear text to sign payloads). */
  @Column({ type: 'varchar', length: 100 })
  secret: string;

  @Column({ type: 'json' })
  events: string[];

  @Column({ default: true })
  active: boolean;

  // ─── WP7: cross-border transfer (KVKK md. 9) and data minimisation ───

  /** ISO 3166-1 alpha-2 country of the receiver (declared by the administrator) */
  @Column({ type: 'varchar', length: 2, default: 'TR' })
  destinationCountry: string;

  /** DOMESTIC | ADEQUACY | SCC | BCR | INCIDENTAL_CONSENT */
  @Column({ type: 'varchar', length: 20, default: 'DOMESTIC' })
  transferBasis: string;

  @Column({ type: 'date', nullable: true })
  sccSignedAt?: string | null;

  /** Notification of the standard contract to the Board (within 5 business days of signing) */
  @Column({ type: 'date', nullable: true })
  sccNotifiedAt?: string | null;

  /** Personal data (names, contact, identity, addresses) is removed from payloads unless enabled */
  @Column({ default: false })
  includePersonalData: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
