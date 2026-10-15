import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

/**
 * e-Belge integration (WP5): integrator settings, outbox, working-copy archive, status timeline,
 * deliveries (e-Arşiv cancellation window), cancellation / objection notices, incoming documents,
 * GİB registry cache and the mock integrator's store. Legal records (archive, outbox, events,
 * deliveries, notices, incoming) keep the company FK RESTRICT (TTK 82 / VUK 253 retention).
 */

/** Integrator (özel entegratör) configuration of a company. One row per company. */
@Entity('company_ebelge_settings')
@Index('UQ_company_ebelge_settings_company', ['companyId'], { unique: true })
export class CompanyEBelgeSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_company_ebelge_settings_company' })
  company?: CompanyEntity;

  /** Registered provider name (ProviderRegistry), e.g. MOCK; null = not configured */
  @Column({ type: 'varchar', length: 30, nullable: true })
  provider?: string | null;

  /** TEST | LIVE */
  @Column({ type: 'varchar', length: 4, default: 'TEST' })
  environment: string;

  /** AES-256-GCM encrypted JSON (see shared/ebelge/credentials.ts); never returned by the API */
  @Column({ type: 'text', nullable: true })
  credentialsEnc?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  credentialsKeyId?: string | null;

  /** Always PROVIDER: the integrator applies the financial seal (509 V.9); the app stores no seal */
  @Column({ type: 'varchar', length: 10, default: 'PROVIDER' })
  signing: string;

  /** Date of the seal / signing authorisation declared to the integrator */
  @Column({ type: 'date', nullable: true })
  sealDeclarationDate?: string | null;

  /** Always PROVIDER: the legal archive is the integrator's (509 VI); this database keeps a working copy */
  @Column({ type: 'varchar', length: 10, default: 'PROVIDER' })
  legalArchive: string;

  /** Sender mailbox (gönderici birim etiketi) and receiver mailbox (posta kutusu etiketi) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  senderAlias?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  receiverAlias?: string | null;

  /** Default e-Arşiv delivery (EMAIL | SMS | PAPER | PORTAL) */
  @Column({ type: 'varchar', length: 10, default: 'EMAIL' })
  earsivDefaultChannel: string;

  /** Send automatically when an invoice / despatch advice is issued */
  @Column({ default: true })
  autoSend: boolean;

  /** IHRACAT builder branch (R44); off until export data (GTİP, INCOTERMS) is maintained */
  @Column({ default: false })
  exportEnabled: boolean;

  /** AdditionalItemIdentification (ILAC / TIBBICIHAZ, R45) */
  @Column({ default: false })
  sectoralItemIdsEnabled: boolean;

  /** GİB registry answers are reused for this many hours (re-checked right before sending) */
  @Column('int', { default: 24 })
  registryCacheHours: number;

  /** Company logo (data: URI) printed by the display template */
  @Column({ type: 'mediumtext', nullable: true })
  logoDataUri?: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastConnectionTestAt?: Date | null;

  @Column({ type: 'boolean', nullable: true })
  lastConnectionOk?: boolean | null;

  /** Set when the provider stopped answering (outage band, 509 V.7 paper fallback) */
  @Column({ type: 'datetime', nullable: true })
  outageSince?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastProviderError?: string | null;

  @Column({ type: 'datetime', nullable: true })
  inboxLastFetchedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Working copy of every e-document sent or received (509 VI; TTK 82). The XML and its SHA-256 are
 * frozen (DB trigger); rows can never be deleted. retentionUntil = 31.12.(issue year + 10).
 */
@Entity('e_documents')
@Index('UQ_e_documents_company_ettn_direction', ['companyId', 'ettn', 'direction'], { unique: true })
@Index('IDX_e_documents_company_source', ['companyId', 'sourceType', 'sourceId'])
@Index('IDX_e_documents_company_issueDate', ['companyId', 'issueDate'])
export class EDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_e_documents_company' })
  company?: CompanyEntity;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  /** INVOICE | EARCHIVE | DESPATCH | RECEIPT_ADVICE | APPLICATION_RESPONSE */
  @Column({ type: 'varchar', length: 25 })
  documentType: string;

  /** OUT (issued by the company) | IN (received) */
  @Column({ type: 'varchar', length: 3 })
  direction: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  profileId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  typeCode?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  /** invoice | despatch | incoming | receipt_advice | application_response */
  @Column({ type: 'varchar', length: 25 })
  sourceType: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  counterpartyTaxId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  counterpartyName?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column('decimal', { precision: 18, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  payableAmount?: number | null;

  /** UBL-TR XML as built (outgoing) or received (incoming) */
  @Column({ type: 'longtext' })
  xml: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  /** Where the primary copy lives: the integrator's legal archive (Türkiye); this row is the working copy */
  @Column({ type: 'varchar', length: 255 })
  storageRef: string;

  /** Signed XML returned by the integrator (set once) */
  @Column({ type: 'longtext', nullable: true })
  signedXml?: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  signedSha256?: string | null;

  @Column({ type: 'datetime', nullable: true })
  signedAt?: Date | null;

  /** Last provider / GİB status (normalized) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  gibStatus?: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastStatusAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef?: string | null;

  @Column({ type: 'date' })
  retentionUntil: string;

  @Column({ default: false })
  legalHold: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  legalHoldReason?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  legalHoldBy?: string | null;

  @Column({ type: 'datetime', nullable: true })
  integrityCheckedAt?: Date | null;

  @Column({ default: true })
  integrityOk: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Send / cancel queue. The ETTN + operation pair is the idempotency key: a document is never sent twice. */
@Entity('edocument_outbox')
@Index('UQ_edocument_outbox_ettn_operation', ['ettn', 'operation'], { unique: true })
@Index('IDX_edocument_outbox_status_next', ['status', 'nextRetryAt'])
@Index('IDX_edocument_outbox_company_status', ['companyId', 'status'])
export class EDocumentOutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_edocument_outbox_company' })
  company?: CompanyEntity;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  /** SEND | CANCEL */
  @Column({ type: 'varchar', length: 10 })
  operation: string;

  @Column({ type: 'varchar', length: 25 })
  documentType: string;

  @Column({ type: 'varchar', length: 36 })
  eDocumentId: string;

  @Column({ type: 'varchar', length: 25 })
  sourceType: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceId?: string | null;

  /** PENDING | PROCESSING | DONE | FAILED | DEAD */
  @Column({ type: 'varchar', length: 12, default: 'PENDING' })
  status: string;

  @Column('int', { default: 0 })
  attempt: number;

  @Column('int', { default: 8 })
  maxAttempts: number;

  @Column({ type: 'datetime' })
  nextRetryAt: Date;

  /** Worker lease (crash safety) */
  @Column({ type: 'datetime', nullable: true })
  lockedUntil?: Date | null;

  /** The last attempt timed out: ask the provider for the status before sending again */
  @Column({ default: false })
  statusCheckRequired: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lastErrorCode?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  lastError?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef?: string | null;

  /** Delivery channel / recipient (e-Arşiv), cancellation reason ... */
  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown> | null;

  /** MATBUDAN: end of the day after the paper despatch (e-İrsaliye Kılavuzu §11-12) */
  @Column({ type: 'datetime', nullable: true })
  deadlineAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  processedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Status timeline of an e-document (append-only). */
@Entity('edocument_events')
@Index('IDX_edocument_events_document', ['eDocumentId', 'at'])
export class EDocumentEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_edocument_events_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  eDocumentId: string;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  message?: string | null;

  /** PROVIDER | POLL | WEBHOOK | USER | SYSTEM */
  @Column({ type: 'varchar', length: 10 })
  source: string;

  @Column({ type: 'datetime' })
  at: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actor?: string | null;
}

/** Delivery of an e-document to the receiver (e-Arşiv: start of the cancellation window, 509 V.5.2). */
@Entity('edocument_deliveries')
@Index('IDX_edocument_deliveries_document', ['eDocumentId'])
export class EDocumentDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_edocument_deliveries_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  eDocumentId: string;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  /** GIB | EMAIL | SMS | PAPER | PORTAL | PRINT */
  @Column({ type: 'varchar', length: 10 })
  channel: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipient?: string | null;

  @Column({ type: 'datetime' })
  deliveredAt: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** e-Fatura cancellation / objection notices (TTK 18/3: KEP, noter, taahhütlü mektup, telgraf; GİB portal). */
@Entity('edocument_notices')
@Index('IDX_edocument_notices_company_ettn', ['companyId', 'ettn'])
export class EDocumentNoticeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_edocument_notices_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  eDocumentId?: string | null;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  /** CANCEL | OBJECTION */
  @Column({ type: 'varchar', length: 10 })
  kind: string;

  /** OUT: sent by the company; IN: received from the counterparty */
  @Column({ type: 'varchar', length: 3, default: 'OUT' })
  direction: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ type: 'date' })
  noticeDate: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason?: string | null;

  @Column({ default: false })
  reportedToProvider: boolean;

  @Column({ type: 'datetime', nullable: true })
  reportedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerReference?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Documents received through the integrator (gelen kutusu). */
@Entity('incoming_documents')
@Index('UQ_incoming_documents_company_ettn', ['companyId', 'ettn'], { unique: true })
@Index('IDX_incoming_documents_company_status', ['companyId', 'status'])
export class IncomingDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_incoming_documents_company' })
  company?: CompanyEntity;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  eDocumentId?: string | null;

  /** INVOICE | DESPATCH | RECEIPT_ADVICE | APPLICATION_RESPONSE */
  @Column({ type: 'varchar', length: 25 })
  documentType: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  profileId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  typeCode?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNo?: string | null;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  issueTime?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  senderTaxId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  senderName?: string | null;

  @Column({ type: 'datetime' })
  receivedAt: Date;

  /** Despatch advices: start of the 7-day response period */
  @Column({ type: 'datetime', nullable: true })
  actualDespatchAt?: Date | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column('decimal', { precision: 18, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  payableAmount?: number | null;

  @Column('decimal', { precision: 18, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  taxTotal?: number | null;

  /** Parsed lines (name, quantity, unit, price, amounts) */
  @Column({ type: 'json', nullable: true })
  lines?: Record<string, unknown>[] | null;

  /** Order / despatch / billing references found in the document */
  @Column({ type: 'json', nullable: true })
  refs?: Record<string, unknown> | null;

  /** RECEIVED | ACCEPTED | REJECTED | PARTIALLY_ACCEPTED | AUTO_ACCEPTED | INFO */
  @Column({ type: 'varchar', length: 20, default: 'RECEIVED' })
  status: string;

  /** UNMATCHED | SUPPLIER | ORDER | RECEIPT | INVOICE */
  @Column({ type: 'varchar', length: 12, default: 'UNMATCHED' })
  matchStatus: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  supplierId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  purchaseOrderId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  goodsReceiptId?: string | null;

  /** Incoming IADE invoice: our original sales invoice */
  @Column({ type: 'varchar', length: 36, nullable: true })
  originalInvoiceId?: string | null;

  /** Receipt advice / application response: the ETTN of our document it answers */
  @Column({ type: 'char', length: 36, nullable: true })
  relatedEttn?: string | null;

  /** End of the response period (e-İrsaliye 7 days from actual despatch; TICARIFATURA 8 days, TTK 21/2) */
  @Column({ type: 'datetime', nullable: true })
  responseDueAt?: Date | null;

  /** KABUL | RED | PARTIAL */
  @Column({ type: 'varchar', length: 10, nullable: true })
  responseCode?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  responseNote?: string | null;

  @Column({ type: 'datetime', nullable: true })
  respondedAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  respondedBy?: string | null;

  /** ETTN of our receipt advice / application response */
  @Column({ type: 'char', length: 36, nullable: true })
  responseEttn?: string | null;

  @Column({ type: 'json', nullable: true })
  responseLines?: Record<string, unknown>[] | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** GİB registered-user answers per tax id and document kind (cached; re-checked before sending). */
@Entity('edocument_registry_cache')
@Index('UQ_edocument_registry_cache', ['companyId', 'taxId', 'docType'], { unique: true })
export class EDocumentRegistryCacheEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_edocument_registry_cache_company' })
  company?: CompanyEntity;

  @Column({ type: 'varchar', length: 11 })
  taxId: string;

  /** INVOICE (e-Fatura) | DESPATCH (e-İrsaliye) */
  @Column({ type: 'varchar', length: 10 })
  docType: string;

  @Column()
  registered: boolean;

  @Column({ type: 'json', nullable: true })
  aliases?: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string | null;

  @Column({ type: 'datetime' })
  checkedAt: Date;
}

/** Store of the mock integrator (development / tests): what it received and its simulated inbox. */
@Entity('ebelge_mock_documents')
@Index('UQ_ebelge_mock_documents', ['companyId', 'ettn', 'box'], { unique: true })
export class MockProviderDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_ebelge_mock_documents_company' })
  company?: CompanyEntity;

  @Column({ type: 'char', length: 36 })
  ettn: string;

  @Column({ type: 'varchar', length: 25 })
  docType: string;

  /** SENT (received from the company) | INBOX (waiting for the company) */
  @Column({ type: 'varchar', length: 5 })
  box: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  counterpartyTaxId?: string | null;

  @Column({ type: 'longtext' })
  xml: string;

  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ type: 'datetime' })
  receivedAt: Date;

  @Column({ type: 'json', nullable: true })
  data?: Record<string, unknown> | null;
}

export const EBELGE_ENTITIES = [
  CompanyEBelgeSettingsEntity,
  EDocumentEntity,
  EDocumentOutboxEntity,
  EDocumentEventEntity,
  EDocumentDeliveryEntity,
  EDocumentNoticeEntity,
  IncomingDocumentEntity,
  EDocumentRegistryCacheEntity,
  MockProviderDocumentEntity,
];
