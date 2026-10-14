import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { WebhookEndpointEntity } from './webhook-endpoint.entity';

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

@Entity('webhook_deliveries')
@Index('IDX_webhook_deliveries_company_created', ['companyId', 'createdAt'])
@Index('IDX_webhook_deliveries_status_retry', ['status', 'nextRetryAt'])
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  endpointId: string;

  @ManyToOne(() => WebhookEndpointEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpointId', foreignKeyConstraintName: 'FK_webhook_deliveries_endpoint' })
  endpoint?: WebhookEndpointEntity;

  @Column({ type: 'varchar', length: 60 })
  event: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status: WebhookDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', nullable: true })
  responseCode: number | null;

  @Column({ type: 'text', nullable: true })
  responseBody: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @Column({ type: 'datetime', nullable: true })
  nextRetryAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
