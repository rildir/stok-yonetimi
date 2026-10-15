import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

/**
 * WP7 - KVKK and data governance (R57-R64, R66, R35 retention / tenant closure, R65).
 * Tenant tables are scoped by companyId; global rows (platform documents, default retention
 * policies, platform sub-processors) have companyId NULL and are read-only for tenants.
 * Records that prove compliance (acceptances, destruction logs, incidents, requests) use RESTRICT.
 */

/** Versioned texts: privacy notices per audience / language (KVKK md. 10), terms and the processing agreement. */
@Entity('privacy_notices')
@Index('UQ_privacy_notices_scope', ['companyId', 'docType', 'audience', 'language', 'version'], { unique: true })
export class PrivacyNoticeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL: platform document of the operator */
  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_privacy_notices_company' })
  company?: CompanyEntity;

  /** PRIVACY | TOS | DPA */
  @Column({ type: 'varchar', length: 10, default: 'PRIVACY' })
  docType: string;

  /** CUSTOMER | SUPPLIER | EMPLOYEE | USER */
  @Column({ type: 'varchar', length: 12 })
  audience: string;

  @Column({ type: 'varchar', length: 2, default: 'tr' })
  language: string;

  @Column({ type: 'varchar', length: 20 })
  version: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'longtext' })
  body: string;

  /** SHA-256 of title + body, fixed at publication */
  @Column({ type: 'char', length: 64, nullable: true })
  contentSha256?: string | null;

  /** DRAFT | PUBLISHED | RETIRED (a published text is frozen by trigger) */
  @Column({ type: 'varchar', length: 10, default: 'DRAFT' })
  status: string;

  @Column({ type: 'datetime', nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  publishedBy?: string | null;

  @Column({ type: 'datetime', nullable: true })
  retiredAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Acceptance / acknowledgement of a notice, TOS or DPA by a user (append-only). */
@Entity('legal_acceptances')
@Index('IDX_legal_acceptances_company_user', ['companyId', 'userId'])
export class LegalAcceptanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_legal_acceptances_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  username: string;

  @Column({ type: 'varchar', length: 36 })
  noticeId: string;

  @Column({ type: 'varchar', length: 10 })
  docType: string;

  @Column({ type: 'varchar', length: 12 })
  audience: string;

  @Column({ type: 'varchar', length: 20 })
  version: string;

  @Column({ type: 'varchar', length: 2 })
  language: string;

  @Column({ type: 'char', length: 64, nullable: true })
  contentSha256?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent?: string | null;

  @CreateDateColumn()
  acceptedAt: Date;
}

/** Explicit consent records (KVKK md. 5/1) - only for purposes whose legal basis is consent. */
@Entity('consents')
@Index('IDX_consents_company_subject', ['companyId', 'subjectType', 'subjectId'])
export class ConsentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_consents_company' })
  company?: CompanyEntity;

  /** CUSTOMER | SUPPLIER */
  @Column({ type: 'varchar', length: 12 })
  subjectType: string;

  @Column({ type: 'varchar', length: 36 })
  subjectId: string;

  @Column({ type: 'varchar', length: 40 })
  purposeCode: string;

  /** WEB | PAPER | EMAIL | PHONE | IN_PERSON | KEP | SMS */
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  /** Version of the consent / notice text shown */
  @Column({ type: 'varchar', length: 20, nullable: true })
  textVersion?: string | null;

  @Column({ type: 'datetime' })
  givenAt: Date;

  @Column({ type: 'datetime', nullable: true })
  withdrawnAt?: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  withdrawnChannel?: string | null;

  /** Evidence reference (signed form no, e-mail id, IVR record...) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  evidence?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  recordedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Retention policy per data category: global default (companyId NULL) or tenant override. */
@Entity('retention_policies')
@Index('UQ_retention_policies_company_category', ['companyId', 'dataCategory'], { unique: true })
export class RetentionPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_retention_policies_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 40 })
  dataCategory: string;

  @Column({ type: 'int' })
  periodValue: number;

  /** DAY | MONTH | YEAR */
  @Column({ type: 'varchar', length: 5 })
  periodUnit: string;

  @Column({ type: 'varchar', length: 20 })
  startEvent: string;

  /** DELETE | ANONYMIZE | REVIEW | NONE */
  @Column({ type: 'varchar', length: 10 })
  action: string;

  /** Legal minimum in periodUnit (an override may not go below) */
  @Column({ type: 'int', default: 0 })
  minimumValue: number;

  @Column({ type: 'varchar', length: 255 })
  legalBasis: string;

  @Column({ type: 'varchar', length: 255 })
  sourceRef: string;

  /** Recommendation (öneri): used by the periodic destruction only after the company approves it */
  @Column({ default: false })
  requiresApproval: boolean;

  @Column({ type: 'datetime', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approvedBy?: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export interface DestructionCandidate {
  dataCategory: string;
  entityType: string;
  /** null: a bulk category item (count) */
  entityId: string | null;
  label: string;
  action: 'DELETE' | 'ANONYMIZE' | 'REVIEW';
  count: number;
  retentionUntil: string | null;
  policyId: string | null;
  reason: string;
}

/** Periodic destruction (İmha Yönetmeliği md. 11: at most every 6 months): candidates -> approval -> execution. */
@Entity('destruction_runs')
@Index('UQ_destruction_runs_company_no', ['companyId', 'runNo'], { unique: true })
export class DestructionRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_destruction_runs_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  runNo: string;

  /** SCHEDULED | MANUAL */
  @Column({ type: 'varchar', length: 10, default: 'MANUAL' })
  trigger: string;

  /** PENDING_APPROVAL | EXECUTED | REJECTED */
  @Column({ type: 'varchar', length: 20, default: 'PENDING_APPROVAL' })
  status: string;

  @Column({ type: 'date' })
  asOfDate: string;

  @Column({ type: 'json' })
  candidates: DestructionCandidate[];

  @Column({ type: 'json', nullable: true })
  summary?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  decidedBy?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  decidedByUserId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  executedAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectReason?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Destruction / anonymisation record (İmha Yönetmeliği md. 7/3: kept at least 3 years; append-only). */
@Entity('destruction_logs')
@Index('IDX_destruction_logs_company_performed', ['companyId', 'performedAt'])
export class DestructionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_destruction_logs_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  runId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  dsrId?: string | null;

  @Column({ type: 'varchar', length: 40 })
  dataCategory: string;

  @Column({ type: 'varchar', length: 60 })
  entityType: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId?: string | null;

  @Column({ type: 'int', default: 1 })
  recordCount: number;

  /** ANONYMIZATION | DELETION */
  @Column({ type: 'varchar', length: 15 })
  method: string;

  /** DONE | RESTRICTED (kept because of a legal retention duty) */
  @Column({ type: 'varchar', length: 12 })
  result: string;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'date', nullable: true })
  restrictedUntil?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  performedBy?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  performedByUserId?: string | null;

  @Column({ type: 'datetime' })
  performedAt: Date;

  /** performedAt + 3 years (trigger refuses deletion before) */
  @Column({ type: 'date' })
  retainUntil: string;
}

/** Data-subject requests (ilgili kişi başvuruları, KVKK md. 11, 13; Başvuru Tebliği): answer within 30 days. */
@Entity('dsr_requests')
@Index('UQ_dsr_requests_company_no', ['companyId', 'requestNo'], { unique: true })
@Index('IDX_dsr_requests_company_status_due', ['companyId', 'status', 'dueAt'])
export class DsrRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_dsr_requests_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  requestNo: string;

  /** CUSTOMER | SUPPLIER | USER | OTHER */
  @Column({ type: 'varchar', length: 12 })
  subjectType: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  subjectId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  applicantName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  applicantContact?: string | null;

  /** ACCESS | INFO | RECTIFICATION | ERASURE | OBJECTION | TRANSFER_INFO | COMPENSATION */
  @Column({ type: 'varchar', length: 20 })
  requestType: string;

  /** WRITTEN | KEP | E_SIGNATURE | MOBILE_SIGNATURE | REGISTERED_EMAIL | APPLICATION | IN_PERSON */
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'datetime' })
  receivedAt: Date;

  /** receivedAt + 30 days (KVKK md. 13/2) */
  @Column({ type: 'datetime' })
  dueAt: Date;

  /** RECEIVED | IN_PROGRESS | COMPLETED | PARTIALLY_COMPLETED | REJECTED */
  @Column({ type: 'varchar', length: 20, default: 'RECEIVED' })
  status: string;

  @Column({ type: 'datetime', nullable: true })
  identityVerifiedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  identityVerifiedBy?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  identityVerificationMethod?: string | null;

  @Column({ type: 'json', nullable: true })
  outcome?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  responseText?: string | null;

  @Column({ type: 'datetime', nullable: true })
  respondedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  respondedBy?: string | null;

  @Column({ type: 'date', nullable: true })
  lastReminderOn?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Personal-data breaches (KVKK md. 12/5; Kurul Kararı 2019/10: notify the Board within 72 hours). */
@Entity('security_incidents')
@Index('UQ_security_incidents_company_no', ['companyId', 'incidentNo'], { unique: true })
export class SecurityIncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_security_incidents_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 30 })
  incidentNo: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** MANUAL | ALERT_LOGIN_FAILED | ALERT_BULK_EXPORT | ALERT_API_BULK_READ */
  @Column({ type: 'varchar', length: 30, default: 'MANUAL' })
  source: string;

  /** LOW | MEDIUM | HIGH */
  @Column({ type: 'varchar', length: 10, default: 'MEDIUM' })
  severity: string;

  /** SUSPECTED (alert) | CONFIRMED | NOTIFIED | CLOSED | DISMISSED */
  @Column({ type: 'varchar', length: 12, default: 'SUSPECTED' })
  status: string;

  @Column({ type: 'datetime' })
  detectedAt: Date;

  /** The moment the controller became aware of the breach: the 72-hour clock starts here */
  @Column({ type: 'datetime', nullable: true })
  awareAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  deadlineAt?: Date | null;

  @Column({ type: 'json', nullable: true })
  dataCategories?: string[] | null;

  @Column({ type: 'json', nullable: true })
  affectedSubjectTypes?: string[] | null;

  @Column({ type: 'int', nullable: true })
  affectedCount?: number | null;

  @Column({ type: 'datetime', nullable: true })
  affectedFrom?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  affectedTo?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  boardNotifiedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  boardNotificationRef?: string | null;

  @Column({ type: 'datetime', nullable: true })
  subjectsNotifiedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  measures?: string | null;

  /** Alert details (counts, key id, rows) */
  @Column({ type: 'json', nullable: true })
  evidence?: Record<string, unknown> | null;

  @Column({ type: 'datetime', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Processors / sub-processors and their countries (platform rows: companyId NULL). */
@Entity('subprocessors')
@Index('IDX_subprocessors_company', ['companyId'])
export class SubprocessorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_subprocessors_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  service: string;

  @Column({ type: 'varchar', length: 2, default: 'TR' })
  country: string;

  @Column({ type: 'varchar', length: 20, default: 'DOMESTIC' })
  transferBasis: string;

  @Column({ type: 'json', nullable: true })
  dataCategories?: string[] | null;

  @Column({ type: 'date', nullable: true })
  dpaSignedAt?: string | null;

  @Column({ type: 'date', nullable: true })
  sccNotifiedAt?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website?: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Refresh-token sessions (httpOnly cookie; rotated on every refresh; idle and absolute expiry). */
@Entity('user_sessions')
@Index('IDX_user_sessions_user', ['userId'])
@Index('UQ_user_sessions_token', ['tokenHash'], { unique: true })
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'datetime' })
  lastUsedAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  revokeReason?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Head of the audit hash chain per company ('GLOBAL' for rows without a company). */
@Entity('audit_chain_heads')
export class AuditChainHeadEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  chainKey: string;

  @Column({ type: 'bigint', default: 0 })
  lastSeq: string;

  @Column({ type: 'char', length: 64 })
  lastHash: string;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const KVKK_ENTITIES = [
  PrivacyNoticeEntity,
  LegalAcceptanceEntity,
  ConsentEntity,
  RetentionPolicyEntity,
  DestructionRunEntity,
  DestructionLogEntity,
  DsrRequestEntity,
  SecurityIncidentEntity,
  SubprocessorEntity,
  UserSessionEntity,
  AuditChainHeadEntity,
];
