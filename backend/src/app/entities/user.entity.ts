import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { UserRole } from './enums';

@Entity('users')
@Index('IDX_users_companyId', ['companyId'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_users_company' })
  company?: CompanyEntity;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', default: UserRole.VIEWER })
  role: UserRole | string;

  @Column()
  fullName: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ nullable: true })
  department: string;

  @Column('longtext', { nullable: true })
  avatar: string;

  @Column({ default: 0 })
  tokenVersion: number;

  /** Platform operator (manages global legal parameters); independent of the tenant role */
  @Column({ default: false })
  isSuperAdmin: boolean;

  /** Admin-issued temporary password: every call except the password change is refused */
  @Column({ default: false })
  mustChangePassword: boolean;

  @Column({ type: 'int', default: 0 })
  failedLoginCount: number;

  @Column({ type: 'datetime', nullable: true })
  lockedUntil?: Date | null;

  /** SHA-256 of the one-time invitation token (invited users have no usable password yet) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  inviteTokenHash?: string | null;

  @Column({ type: 'datetime', nullable: true })
  inviteExpiresAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  passwordChangedAt?: Date | null;

  /** Optional per-user language override; falls back to company.defaultLanguage */
  @Column({ type: 'varchar', length: 5, nullable: true })
  language: string | null;

  /** Optional per-user IANA timezone override; falls back to company.timezone */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
