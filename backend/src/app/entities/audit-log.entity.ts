import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Append-only audit trail. Written by AuditSubscriber (entity changes) and
 * AuditService (login / explicit events). `before` / `after` hold only the
 * changed fields for updates and are redacted (no password hashes / secrets, identity and contact
 * fields). Append-only and hash-chained (WP7, triggers in shared/kvkk/audit-chain.ts).
 * companyId is nullable only for failed logins of unknown usernames.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_company_created', ['companyId', 'createdAt'])
@Index('IDX_audit_logs_company_entity', ['companyId', 'entityType', 'entityId'])
@Index('IDX_audit_logs_company_chain', ['companyId', 'chainSeq'])
@Index('IDX_audit_logs_unsealed', ['hash', 'createdAt'])
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

  // ─── WP7: tamper evidence (see shared/kvkk/audit-chain.ts) ───

  /** SHA-256 of the row content, set by the BEFORE INSERT trigger */
  @Column({ type: 'char', length: 64, nullable: true })
  payloadDigest: string | null;

  /** Position in the company's chain (assigned by the sealer in commit order) */
  @Column({ type: 'bigint', nullable: true })
  chainSeq: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  prevHash: string | null;

  /** SHA-256(prevHash | chainSeq | payloadDigest) */
  @Column({ type: 'char', length: 64, nullable: true })
  hash: string | null;

  /** Personal data in this row was masked (KVKK erasure / retention); the digest no longer matches the content */
  @Column({ type: 'datetime', nullable: true })
  maskedAt: Date | null;

  /** Digest of the masked content, set by the masking trigger and recorded by a kvkk.audit_mask chain event */
  @Column({ type: 'char', length: 64, nullable: true })
  maskedDigest: string | null;
}
