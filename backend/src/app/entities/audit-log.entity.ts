import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Append-only audit trail. Written by AuditSubscriber (entity changes) and
 * AuditService (login / explicit events). `before` / `after` hold only the
 * changed fields for updates and are redacted (no password hashes / secrets).
 * companyId is nullable only for failed logins of unknown usernames.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_company_created', ['companyId', 'createdAt'])
@Index('IDX_audit_logs_company_entity', ['companyId', 'entityType', 'entityId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  apiKeyId: string | null;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ type: 'varchar', length: 60 })
  entityType: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId: string | null;

  @Column({ type: 'json', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
