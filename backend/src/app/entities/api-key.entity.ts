import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

export type ApiKeyAccess = 'read' | 'write';

/** Public API key. Only a SHA-256 hash of the secret is stored; `prefix` identifies the key. */
@Entity('api_keys')
@Index('IDX_api_keys_company', ['companyId'])
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_api_keys_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Public lookup part, e.g. "sk_live_ab12cd34" (unique). */
  @Index('UQ_api_keys_prefix', { unique: true })
  @Column({ type: 'varchar', length: 32 })
  prefix: string;

  @Column({ type: 'varchar', length: 64 })
  secretHash: string;

  /** resource -> 'read' | 'write' (write implies read). Missing resource = no access. */
  @Column({ type: 'json' })
  scopes: Record<string, ApiKeyAccess>;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ default: false })
  revoked: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
