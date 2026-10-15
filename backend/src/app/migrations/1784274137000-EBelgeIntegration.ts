import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP5_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { dropEdocTriggers, ensureEdocTriggers } from '../shared/ebelge/ebelge-triggers';

/**
 * WP5: e-Belge integration (UBL-TR 1.2.1, provider abstraction, mock integrator, inbox, archive).
 *
 *  A. company_ebelge_settings (integrator, environment, AES-256-GCM credentials, signing = PROVIDER,
 *     legal archive = PROVIDER), edocument_outbox (ETTN + operation unique = idempotency key),
 *     e_documents (working-copy archive: XML + SHA-256, retentionUntil, legal hold), edocument_events
 *     (status timeline), edocument_deliveries (e-Arşiv delivery = start of the 8-day cancellation
 *     window), edocument_notices (e-Fatura cancellation / objection notices), incoming_documents
 *     (inbox, matching, responses), edocument_registry_cache (GİB registered users),
 *     ebelge_mock_documents (store of the mock integrator). Legal records: company FK RESTRICT.
 *  B. Archive triggers: e_documents cannot be deleted, XML / hash / identity frozen, signed XML set
 *     once, retention only extended; edocument_events append-only.
 *  C. WP5 legal parameters (e-Arşiv cancellation window, e-İrsaliye / TICARIFATURA response periods,
 *     retention, integrity notice period, export customs party), each with a sourceRef.
 *  D. Backfill: a settings row (no provider, TEST) for every company; existing invoices / despatch
 *     advices were registered from external systems or paper series and get no e-document record.
 *     The demo tenant is switched to the mock integrator by the runtime demo seeder (credentials are
 *     encrypted with the runtime key).
 */
const SCHEMA: string[] = [
  "CREATE TABLE `company_ebelge_settings` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `provider` varchar(30) NULL, `environment` varchar(4) NOT NULL DEFAULT 'TEST', `credentialsEnc` text NULL, `credentialsKeyId` varchar(20) NULL, `signing` varchar(10) NOT NULL DEFAULT 'PROVIDER', `sealDeclarationDate` date NULL, `legalArchive` varchar(10) NOT NULL DEFAULT 'PROVIDER', `senderAlias` varchar(150) NULL, `receiverAlias` varchar(150) NULL, `earsivDefaultChannel` varchar(10) NOT NULL DEFAULT 'EMAIL', `autoSend` tinyint NOT NULL DEFAULT 1, `exportEnabled` tinyint NOT NULL DEFAULT 0, `sectoralItemIdsEnabled` tinyint NOT NULL DEFAULT 0, `registryCacheHours` int NOT NULL DEFAULT '24', `logoDataUri` mediumtext NULL, `lastConnectionTestAt` datetime NULL, `lastConnectionOk` tinyint NULL, `outageSince` datetime NULL, `lastProviderError` varchar(500) NULL, `inboxLastFetchedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_company_ebelge_settings_company` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `e_documents` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `documentType` varchar(25) NOT NULL, `direction` varchar(3) NOT NULL, `profileId` varchar(25) NULL, `typeCode` varchar(20) NULL, `documentNo` varchar(50) NULL, `issueDate` date NULL, `sourceType` varchar(25) NOT NULL, `sourceId` varchar(36) NULL, `counterpartyTaxId` varchar(20) NULL, `counterpartyName` varchar(255) NULL, `currency` varchar(3) NULL, `payableAmount` decimal(18,2) NULL, `xml` longtext NOT NULL, `sha256` char(64) NOT NULL, `storageRef` varchar(255) NOT NULL, `signedXml` longtext NULL, `signedSha256` char(64) NULL, `signedAt` datetime NULL, `gibStatus` varchar(30) NULL, `lastStatusAt` datetime NULL, `providerRef` varchar(100) NULL, `retentionUntil` date NOT NULL, `legalHold` tinyint NOT NULL DEFAULT 0, `legalHoldReason` varchar(500) NULL, `legalHoldBy` varchar(100) NULL, `integrityCheckedAt` datetime NULL, `integrityOk` tinyint NOT NULL DEFAULT 1, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_e_documents_company_issueDate` (`companyId`, `issueDate`), INDEX `IDX_e_documents_company_source` (`companyId`, `sourceType`, `sourceId`), UNIQUE INDEX `UQ_e_documents_company_ettn_direction` (`companyId`, `ettn`, `direction`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `edocument_outbox` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `operation` varchar(10) NOT NULL, `documentType` varchar(25) NOT NULL, `eDocumentId` varchar(36) NOT NULL, `sourceType` varchar(25) NOT NULL, `sourceId` varchar(36) NULL, `status` varchar(12) NOT NULL DEFAULT 'PENDING', `attempt` int NOT NULL DEFAULT '0', `maxAttempts` int NOT NULL DEFAULT '8', `nextRetryAt` datetime NOT NULL, `lockedUntil` datetime NULL, `statusCheckRequired` tinyint NOT NULL DEFAULT 0, `lastErrorCode` varchar(50) NULL, `lastError` varchar(1000) NULL, `providerRef` varchar(100) NULL, `payload` json NULL, `deadlineAt` datetime NULL, `processedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_edocument_outbox_company_status` (`companyId`, `status`), INDEX `IDX_edocument_outbox_status_next` (`status`, `nextRetryAt`), UNIQUE INDEX `UQ_edocument_outbox_ettn_operation` (`ettn`, `operation`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `edocument_events` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `eDocumentId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `status` varchar(30) NOT NULL, `code` varchar(50) NULL, `message` varchar(1000) NULL, `source` varchar(10) NOT NULL, `at` datetime NOT NULL, `actor` varchar(100) NULL, INDEX `IDX_edocument_events_document` (`eDocumentId`, `at`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  'CREATE TABLE `edocument_deliveries` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `eDocumentId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `channel` varchar(10) NOT NULL, `recipient` varchar(255) NULL, `deliveredAt` datetime NOT NULL, `providerRef` varchar(100) NULL, `note` varchar(500) NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_edocument_deliveries_document` (`eDocumentId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `edocument_notices` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `eDocumentId` varchar(36) NULL, `ettn` char(36) NOT NULL, `kind` varchar(10) NOT NULL, `direction` varchar(3) NOT NULL DEFAULT 'OUT', `channel` varchar(20) NOT NULL, `noticeDate` date NOT NULL, `reference` varchar(100) NULL, `reason` varchar(500) NULL, `reportedToProvider` tinyint NOT NULL DEFAULT 0, `reportedAt` datetime NULL, `providerReference` varchar(100) NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_edocument_notices_company_ettn` (`companyId`, `ettn`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `incoming_documents` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `eDocumentId` varchar(36) NULL, `documentType` varchar(25) NOT NULL, `profileId` varchar(25) NULL, `typeCode` varchar(20) NULL, `documentNo` varchar(50) NULL, `issueDate` date NULL, `issueTime` varchar(8) NULL, `senderTaxId` varchar(20) NULL, `senderName` varchar(255) NULL, `receivedAt` datetime NOT NULL, `actualDespatchAt` datetime NULL, `currency` varchar(3) NULL, `payableAmount` decimal(18,2) NULL, `taxTotal` decimal(18,2) NULL, `lines` json NULL, `refs` json NULL, `status` varchar(20) NOT NULL DEFAULT 'RECEIVED', `matchStatus` varchar(12) NOT NULL DEFAULT 'UNMATCHED', `supplierId` varchar(36) NULL, `customerId` varchar(36) NULL, `purchaseOrderId` varchar(36) NULL, `goodsReceiptId` varchar(36) NULL, `originalInvoiceId` varchar(36) NULL, `relatedEttn` char(36) NULL, `responseDueAt` datetime NULL, `responseCode` varchar(10) NULL, `responseNote` varchar(500) NULL, `respondedAt` datetime NULL, `respondedBy` varchar(100) NULL, `responseEttn` char(36) NULL, `responseLines` json NULL, `providerRef` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_incoming_documents_company_status` (`companyId`, `status`), UNIQUE INDEX `UQ_incoming_documents_company_ettn` (`companyId`, `ettn`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `edocument_registry_cache` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `taxId` varchar(11) NOT NULL, `docType` varchar(10) NOT NULL, `registered` tinyint NOT NULL, `aliases` json NULL, `title` varchar(255) NULL, `checkedAt` datetime NOT NULL, UNIQUE INDEX `UQ_edocument_registry_cache` (`companyId`, `taxId`, `docType`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  'CREATE TABLE `ebelge_mock_documents` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `docType` varchar(25) NOT NULL, `box` varchar(5) NOT NULL, `counterpartyTaxId` varchar(20) NULL, `xml` longtext NOT NULL, `status` varchar(30) NOT NULL, `receivedAt` datetime NOT NULL, `data` json NULL, UNIQUE INDEX `UQ_ebelge_mock_documents` (`companyId`, `ettn`, `box`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  'ALTER TABLE `company_ebelge_settings` ADD CONSTRAINT `FK_company_ebelge_settings_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `e_documents` ADD CONSTRAINT `FK_e_documents_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `edocument_outbox` ADD CONSTRAINT `FK_edocument_outbox_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `edocument_events` ADD CONSTRAINT `FK_edocument_events_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `edocument_deliveries` ADD CONSTRAINT `FK_edocument_deliveries_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `edocument_notices` ADD CONSTRAINT `FK_edocument_notices_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `incoming_documents` ADD CONSTRAINT `FK_incoming_documents_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `edocument_registry_cache` ADD CONSTRAINT `FK_edocument_registry_cache_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `ebelge_mock_documents` ADD CONSTRAINT `FK_ebelge_mock_documents_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
];

export class EBelgeIntegration1784274137000 implements MigrationInterface {
  name = 'EBelgeIntegration1784274137000';

  public async up(q: QueryRunner): Promise<void> {
    for (const sql of SCHEMA) await q.query(sql);
    await ensureEdocTriggers((sql, params) => q.query(sql, params));

    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP5_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE `validTo` = VALUES(`validTo`), `value` = VALUES(`value`), `sourceRef` = VALUES(`sourceRef`), `confidence` = VALUES(`confidence`), `note` = VALUES(`note`)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'migration'],
      );
    }

    const companies: { id: string }[] = await q.query('SELECT `id` FROM `companies`');
    for (const c of companies) {
      await q.query(
        "INSERT INTO `company_ebelge_settings` (`id`, `companyId`, `environment`, `signing`, `legalArchive`, `earsivDefaultChannel`, `autoSend`, `registryCacheHours`) VALUES (?, ?, 'TEST', 'PROVIDER', 'PROVIDER', 'EMAIL', 1, 24)",
        [randomUUID(), c.id],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await dropEdocTriggers((sql, params) => q.query(sql, params));
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`createdBy\` = 'migration' AND \`key\` IN (${WP5_PARAMETER_KEYS.map(() => '?').join(', ')})`, WP5_PARAMETER_KEYS);
    for (const t of ['ebelge_mock_documents', 'edocument_registry_cache', 'incoming_documents', 'edocument_notices', 'edocument_deliveries', 'edocument_events', 'edocument_outbox', 'e_documents', 'company_ebelge_settings']) {
      await q.query(`DROP TABLE \`${t}\``);
    }
  }
}
