import { createHash, randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP7_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { AUDIT_TRIGGERS, GENESIS_HASH, auditDigestSql, chainHash, dropAuditTriggers } from '../shared/kvkk/audit-chain';
import { RETENTION_DEFAULTS } from '../shared/kvkk/retention';
import { decryptPii, encryptPii, piiHash } from '../shared/kvkk/crypto';
import { buildPrivacyNotice, platformDocument } from '../shared/kvkk/notice-template';
import { PLATFORM_SUBPROCESSORS, PLATFORM_OPERATOR, retentionLabel } from '../shared/kvkk/platform';

/**
 * WP7 - KVKK and data governance (R57-R64, R66, R35 retention / tenant closure, R65).
 *
 *  A. Schema: privacy_notices, legal_acceptances, consents, retention_policies, destruction_runs,
 *     destruction_logs, dsr_requests, security_incidents, subprocessors, user_sessions,
 *     audit_chain_heads; KVKK / closure / VERBİS / 2FA policy columns on companies; erasure and
 *     blind-index columns on customers / suppliers; TOTP and permissions on users; hash-chain
 *     columns on audit_logs; transfer columns on webhook_endpoints. customers.identityNumber,
 *     customers.passportNo and suppliers.identityNumber are widened (MODIFY keeps the data) for
 *     AES-256-GCM ciphertext.
 *  B. Data:
 *     - identity numbers / passport numbers encrypted, blind index (HMAC) filled;
 *     - customers.deletedAt of soft-deleted customers = their last update;
 *     - payload digest and hash chain of the existing audit rows (in createdAt order), chain heads;
 *     - companies: two-factor authentication required for administrators with a 30-day grace period;
 *     - WP7 legal parameters, global retention policies (with sources), platform documents (terms,
 *       processing agreement, users' privacy notice; published v1.0) and platform sub-processors.
 *  C. Triggers: audit_logs append-only (digest on insert; only sealing and flagged KVKK masking may
 *     update; no delete), destruction_logs (no update; no delete before retainUntil),
 *     legal_acceptances (append-only), published privacy notices frozen.
 */
const DDL_UP = [
  "CREATE TABLE `privacy_notices` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NULL, `docType` varchar(10) NOT NULL DEFAULT 'PRIVACY', `audience` varchar(12) NOT NULL, `language` varchar(2) NOT NULL DEFAULT 'tr', `version` varchar(20) NOT NULL, `title` varchar(255) NOT NULL, `body` longtext NOT NULL, `contentSha256` char(64) NULL, `status` varchar(10) NOT NULL DEFAULT 'DRAFT', `publishedAt` datetime NULL, `publishedBy` varchar(100) NULL, `retiredAt` datetime NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_privacy_notices_scope` (`companyId`, `docType`, `audience`, `language`, `version`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `legal_acceptances` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `username` varchar(100) NOT NULL, `noticeId` varchar(36) NOT NULL, `docType` varchar(10) NOT NULL, `audience` varchar(12) NOT NULL, `version` varchar(20) NOT NULL, `language` varchar(2) NOT NULL, `contentSha256` char(64) NULL, `ip` varchar(64) NULL, `userAgent` varchar(255) NULL, `acceptedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_legal_acceptances_company_user` (`companyId`, `userId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `consents` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `subjectType` varchar(12) NOT NULL, `subjectId` varchar(36) NOT NULL, `purposeCode` varchar(40) NOT NULL, `channel` varchar(20) NOT NULL, `textVersion` varchar(20) NULL, `givenAt` datetime NOT NULL, `withdrawnAt` datetime NULL, `withdrawnChannel` varchar(20) NULL, `evidence` varchar(500) NULL, `recordedBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_consents_company_subject` (`companyId`, `subjectType`, `subjectId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `retention_policies` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NULL, `dataCategory` varchar(40) NOT NULL, `periodValue` int NOT NULL, `periodUnit` varchar(5) NOT NULL, `startEvent` varchar(20) NOT NULL, `action` varchar(10) NOT NULL, `minimumValue` int NOT NULL DEFAULT '0', `legalBasis` varchar(255) NOT NULL, `sourceRef` varchar(255) NOT NULL, `requiresApproval` tinyint NOT NULL DEFAULT 0, `approvedAt` datetime NULL, `approvedBy` varchar(100) NULL, `enabled` tinyint NOT NULL DEFAULT 1, `note` varchar(500) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_retention_policies_company_category` (`companyId`, `dataCategory`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `destruction_runs` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `runNo` varchar(30) NOT NULL, `trigger` varchar(10) NOT NULL DEFAULT 'MANUAL', `status` varchar(20) NOT NULL DEFAULT 'PENDING_APPROVAL', `asOfDate` date NOT NULL, `candidates` json NOT NULL, `summary` json NULL, `createdBy` varchar(100) NULL, `decidedBy` varchar(100) NULL, `decidedByUserId` varchar(36) NULL, `decidedAt` datetime NULL, `executedAt` datetime NULL, `rejectReason` varchar(500) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_destruction_runs_company_no` (`companyId`, `runNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `destruction_logs` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `runId` varchar(36) NULL, `dsrId` varchar(36) NULL, `dataCategory` varchar(40) NOT NULL, `entityType` varchar(60) NOT NULL, `entityId` varchar(36) NULL, `recordCount` int NOT NULL DEFAULT '1', `method` varchar(15) NOT NULL, `result` varchar(12) NOT NULL, `reason` varchar(500) NOT NULL, `restrictedUntil` date NULL, `performedBy` varchar(100) NULL, `performedByUserId` varchar(36) NULL, `performedAt` datetime NOT NULL, `retainUntil` date NOT NULL, INDEX `IDX_destruction_logs_company_performed` (`companyId`, `performedAt`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `dsr_requests` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `requestNo` varchar(30) NOT NULL, `subjectType` varchar(12) NOT NULL, `subjectId` varchar(36) NULL, `applicantName` varchar(255) NOT NULL, `applicantContact` varchar(255) NULL, `requestType` varchar(20) NOT NULL, `channel` varchar(20) NOT NULL, `description` text NULL, `receivedAt` datetime NOT NULL, `dueAt` datetime NOT NULL, `status` varchar(20) NOT NULL DEFAULT 'RECEIVED', `identityVerifiedAt` datetime NULL, `identityVerifiedBy` varchar(100) NULL, `identityVerificationMethod` varchar(255) NULL, `outcome` json NULL, `responseText` text NULL, `respondedAt` datetime NULL, `respondedBy` varchar(100) NULL, `lastReminderOn` date NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_dsr_requests_company_status_due` (`companyId`, `status`, `dueAt`), UNIQUE INDEX `UQ_dsr_requests_company_no` (`companyId`, `requestNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `security_incidents` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `incidentNo` varchar(30) NOT NULL, `title` varchar(255) NOT NULL, `description` text NULL, `source` varchar(30) NOT NULL DEFAULT 'MANUAL', `severity` varchar(10) NOT NULL DEFAULT 'MEDIUM', `status` varchar(12) NOT NULL DEFAULT 'SUSPECTED', `detectedAt` datetime NOT NULL, `awareAt` datetime NULL, `deadlineAt` datetime NULL, `dataCategories` json NULL, `affectedSubjectTypes` json NULL, `affectedCount` int NULL, `affectedFrom` datetime NULL, `affectedTo` datetime NULL, `boardNotifiedAt` datetime NULL, `boardNotificationRef` varchar(100) NULL, `subjectsNotifiedAt` datetime NULL, `measures` text NULL, `evidence` json NULL, `closedAt` datetime NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_security_incidents_company_no` (`companyId`, `incidentNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `subprocessors` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NULL, `name` varchar(255) NOT NULL, `service` varchar(255) NOT NULL, `country` varchar(2) NOT NULL DEFAULT 'TR', `transferBasis` varchar(20) NOT NULL DEFAULT 'DOMESTIC', `dataCategories` json NULL, `dpaSignedAt` date NULL, `sccNotifiedAt` date NULL, `website` varchar(255) NULL, `active` tinyint NOT NULL DEFAULT 1, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_subprocessors_company` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `user_sessions` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `tokenHash` char(64) NOT NULL, `lastUsedAt` datetime NOT NULL, `expiresAt` datetime NOT NULL, `revokedAt` datetime NULL, `revokeReason` varchar(30) NULL, `ip` varchar(64) NULL, `userAgent` varchar(255) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_user_sessions_token` (`tokenHash`), INDEX `IDX_user_sessions_user` (`userId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `audit_chain_heads` (`chainKey` varchar(36) NOT NULL, `lastSeq` bigint NOT NULL DEFAULT '0', `lastHash` char(64) NOT NULL, `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`chainKey`)) ENGINE=InnoDB",
  "ALTER TABLE `companies` ADD `status` varchar(10) NOT NULL DEFAULT 'ACTIVE'",
  "ALTER TABLE `companies` ADD `closedAt` datetime NULL",
  "ALTER TABLE `companies` ADD `closedBy` varchar(100) NULL",
  "ALTER TABLE `companies` ADD `retentionUntil` date NULL",
  "ALTER TABLE `companies` ADD `lastFullExportAt` datetime NULL",
  "ALTER TABLE `companies` ADD `kvkkContactEmail` varchar(255) NULL",
  "ALTER TABLE `companies` ADD `verbisEmployeeCount` int NULL",
  "ALTER TABLE `companies` ADD `verbisBalanceSheetTotal` decimal(18,2) NULL",
  "ALTER TABLE `companies` ADD `verbisMainActivitySpecial` tinyint NOT NULL DEFAULT 0",
  "ALTER TABLE `companies` ADD `verbisRegistered` tinyint NOT NULL DEFAULT 0",
  "ALTER TABLE `companies` ADD `verbisRegistrationNo` varchar(50) NULL",
  "ALTER TABLE `companies` ADD `adminTotpRequired` tinyint NOT NULL DEFAULT 1",
  "ALTER TABLE `companies` ADD `adminTotpGraceUntil` datetime NULL",
  "ALTER TABLE `suppliers` ADD `identityNumberHash` char(64) NULL",
  "ALTER TABLE `customers` ADD `identityNumberHash` char(64) NULL",
  "ALTER TABLE `customers` ADD `deletedAt` datetime NULL",
  "ALTER TABLE `customers` ADD `processingRestricted` tinyint NOT NULL DEFAULT 0",
  "ALTER TABLE `customers` ADD `erasureRestrictedUntil` date NULL",
  "ALTER TABLE `customers` ADD `erasureRequestedAt` datetime NULL",
  "ALTER TABLE `customers` ADD `anonymizedAt` datetime NULL",
  "ALTER TABLE `users` ADD `totpSecret` varchar(255) NULL",
  "ALTER TABLE `users` ADD `totpPendingSecret` varchar(255) NULL",
  "ALTER TABLE `users` ADD `totpEnabledAt` datetime NULL",
  "ALTER TABLE `users` ADD `totpLastStep` bigint NULL",
  "ALTER TABLE `users` ADD `totpRecoveryCodes` json NULL",
  "ALTER TABLE `users` ADD `permissions` json NULL",
  "ALTER TABLE `audit_logs` ADD `payloadDigest` char(64) NULL",
  "ALTER TABLE `audit_logs` ADD `chainSeq` bigint NULL",
  "ALTER TABLE `audit_logs` ADD `prevHash` char(64) NULL",
  "ALTER TABLE `audit_logs` ADD `hash` char(64) NULL",
  "ALTER TABLE `audit_logs` ADD `maskedAt` datetime NULL",
  "ALTER TABLE `webhook_endpoints` ADD `destinationCountry` varchar(2) NOT NULL DEFAULT 'TR'",
  "ALTER TABLE `webhook_endpoints` ADD `transferBasis` varchar(20) NOT NULL DEFAULT 'DOMESTIC'",
  "ALTER TABLE `webhook_endpoints` ADD `sccSignedAt` date NULL",
  "ALTER TABLE `webhook_endpoints` ADD `sccNotifiedAt` date NULL",
  "ALTER TABLE `webhook_endpoints` ADD `includePersonalData` tinyint NOT NULL DEFAULT 0",
  "CREATE INDEX `IDX_suppliers_company_identity_hash` ON `suppliers` (`companyId`, `identityNumberHash`)",
  "CREATE INDEX `IDX_customers_company_identity_hash` ON `customers` (`companyId`, `identityNumberHash`)",
  "CREATE INDEX `IDX_audit_logs_unsealed` ON `audit_logs` (`hash`, `createdAt`)",
  "CREATE INDEX `IDX_audit_logs_company_chain` ON `audit_logs` (`companyId`, `chainSeq`)",
  "ALTER TABLE `privacy_notices` ADD CONSTRAINT `FK_privacy_notices_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `legal_acceptances` ADD CONSTRAINT `FK_legal_acceptances_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `consents` ADD CONSTRAINT `FK_consents_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `retention_policies` ADD CONSTRAINT `FK_retention_policies_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION",
  "ALTER TABLE `destruction_runs` ADD CONSTRAINT `FK_destruction_runs_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `destruction_logs` ADD CONSTRAINT `FK_destruction_logs_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `dsr_requests` ADD CONSTRAINT `FK_dsr_requests_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `security_incidents` ADD CONSTRAINT `FK_security_incidents_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `subprocessors` ADD CONSTRAINT `FK_subprocessors_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION",
];

const DDL_DOWN = [
  'DROP TABLE `audit_chain_heads`',
  'DROP TABLE `user_sessions`',
  'ALTER TABLE `subprocessors` DROP FOREIGN KEY `FK_subprocessors_company`',
  'DROP TABLE `subprocessors`',
  'ALTER TABLE `security_incidents` DROP FOREIGN KEY `FK_security_incidents_company`',
  'DROP TABLE `security_incidents`',
  'ALTER TABLE `dsr_requests` DROP FOREIGN KEY `FK_dsr_requests_company`',
  'DROP TABLE `dsr_requests`',
  'ALTER TABLE `destruction_logs` DROP FOREIGN KEY `FK_destruction_logs_company`',
  'DROP TABLE `destruction_logs`',
  'ALTER TABLE `destruction_runs` DROP FOREIGN KEY `FK_destruction_runs_company`',
  'DROP TABLE `destruction_runs`',
  'ALTER TABLE `retention_policies` DROP FOREIGN KEY `FK_retention_policies_company`',
  'DROP TABLE `retention_policies`',
  'ALTER TABLE `consents` DROP FOREIGN KEY `FK_consents_company`',
  'DROP TABLE `consents`',
  'ALTER TABLE `legal_acceptances` DROP FOREIGN KEY `FK_legal_acceptances_company`',
  'DROP TABLE `legal_acceptances`',
  'ALTER TABLE `privacy_notices` DROP FOREIGN KEY `FK_privacy_notices_company`',
  'DROP TABLE `privacy_notices`',
  'DROP INDEX `IDX_audit_logs_company_chain` ON `audit_logs`',
  'DROP INDEX `IDX_audit_logs_unsealed` ON `audit_logs`',
  'DROP INDEX `IDX_customers_company_identity_hash` ON `customers`',
  'DROP INDEX `IDX_suppliers_company_identity_hash` ON `suppliers`',
  'ALTER TABLE `audit_logs` DROP COLUMN `maskedAt`, DROP COLUMN `hash`, DROP COLUMN `prevHash`, DROP COLUMN `chainSeq`, DROP COLUMN `payloadDigest`',
  'ALTER TABLE `webhook_endpoints` DROP COLUMN `includePersonalData`, DROP COLUMN `sccNotifiedAt`, DROP COLUMN `sccSignedAt`, DROP COLUMN `transferBasis`, DROP COLUMN `destinationCountry`',
  'ALTER TABLE `users` DROP COLUMN `permissions`, DROP COLUMN `totpRecoveryCodes`, DROP COLUMN `totpLastStep`, DROP COLUMN `totpEnabledAt`, DROP COLUMN `totpPendingSecret`, DROP COLUMN `totpSecret`',
  'ALTER TABLE `customers` DROP COLUMN `anonymizedAt`, DROP COLUMN `erasureRequestedAt`, DROP COLUMN `erasureRestrictedUntil`, DROP COLUMN `processingRestricted`, DROP COLUMN `deletedAt`, DROP COLUMN `identityNumberHash`',
  'ALTER TABLE `suppliers` DROP COLUMN `identityNumberHash`',
  'ALTER TABLE `companies` DROP COLUMN `adminTotpGraceUntil`, DROP COLUMN `adminTotpRequired`, DROP COLUMN `verbisRegistrationNo`, DROP COLUMN `verbisRegistered`, DROP COLUMN `verbisMainActivitySpecial`, DROP COLUMN `verbisBalanceSheetTotal`, DROP COLUMN `verbisEmployeeCount`, DROP COLUMN `kvkkContactEmail`, DROP COLUMN `lastFullExportAt`, DROP COLUMN `retentionUntil`, DROP COLUMN `closedBy`, DROP COLUMN `closedAt`, DROP COLUMN `status`',
];

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export class KvkkDataGovernance1784274141000 implements MigrationInterface {
  name = 'KvkkDataGovernance1784274141000';

  public async up(q: QueryRunner): Promise<void> {
    for (const sql of DDL_UP) await q.query(sql);
    await q.query('ALTER TABLE `customers` MODIFY `identityNumber` varchar(100) NULL, MODIFY `passportNo` varchar(100) NULL');
    await q.query('ALTER TABLE `suppliers` MODIFY `identityNumber` varchar(100) NULL');

    // B1. encrypt identifiers, fill the blind index
    for (const table of ['customers', 'suppliers']) {
      const cols = table === 'customers' ? ['identityNumber', 'passportNo'] : ['identityNumber'];
      const rows: Record<string, string | null>[] = await q.query(`SELECT \`id\`, ${cols.map((c) => `\`${c}\``).join(', ')} FROM \`${table}\` WHERE ${cols.map((c) => `\`${c}\` IS NOT NULL`).join(' OR ')}`);
      for (const r of rows) {
        const sets = cols.map((c) => `\`${c}\` = ?`).concat('`identityNumberHash` = ?');
        await q.query(`UPDATE \`${table}\` SET ${sets.join(', ')}, \`updatedAt\` = \`updatedAt\` WHERE \`id\` = ?`, [...cols.map((c) => encryptPii(r[c])), piiHash(r['identityNumber']), r['id']]);
      }
    }
    await q.query('UPDATE `customers` SET `deletedAt` = `updatedAt`, `updatedAt` = `updatedAt` WHERE `isDeleted` = 1 AND `deletedAt` IS NULL');

    // B2. audit trail: payload digest + chain (oldest first), chain heads
    await q.query(`UPDATE \`audit_logs\` a SET a.\`payloadDigest\` = ${auditDigestSql('a')}`);
    const rows: { id: string; companyId: string | null; payloadDigest: string }[] = await q.query('SELECT `id`, `companyId`, `payloadDigest` FROM `audit_logs` ORDER BY `createdAt` ASC, `id` ASC');
    const heads = new Map<string, { seq: number; hash: string }>();
    for (const r of rows) {
      const key = r.companyId ?? 'GLOBAL';
      const head = heads.get(key) ?? { seq: 0, hash: GENESIS_HASH };
      const seq = head.seq + 1;
      const hash = chainHash(head.hash, seq, r.payloadDigest);
      await q.query('UPDATE `audit_logs` SET `chainSeq` = ?, `prevHash` = ?, `hash` = ? WHERE `id` = ?', [seq, head.hash, hash, r.id]);
      heads.set(key, { seq, hash });
    }
    for (const [key, h] of heads) await q.query('INSERT INTO `audit_chain_heads` (`chainKey`, `lastSeq`, `lastHash`) VALUES (?, ?, ?)', [key, h.seq, h.hash]);

    // B3. 2FA for administrators: required, 30-day grace period for existing companies
    await q.query('UPDATE `companies` SET `adminTotpRequired` = 1, `adminTotpGraceUntil` = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY)');

    // B4. legal parameters
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP7_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration'],
      );
    }

    // B5. global retention policies
    for (const d of RETENTION_DEFAULTS) {
      await q.query(
        'INSERT INTO `retention_policies` (`id`, `companyId`, `dataCategory`, `periodValue`, `periodUnit`, `startEvent`, `action`, `minimumValue`, `legalBasis`, `sourceRef`, `requiresApproval`) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), d.dataCategory, d.periodValue, d.periodUnit, d.startEvent, d.action, d.minimumValue, d.legalBasis, d.sourceRef, d.requiresApproval ? 1 : 0],
      );
    }

    // B6. platform documents (operator) and sub-processors
    const docs: { docType: string; audience: string; lang: 'tr' | 'en'; title: string; body: string }[] = [];
    for (const lang of ['tr', 'en'] as const) {
      docs.push({ docType: 'TOS', audience: 'USER', lang, ...platformDocument('TOS', lang) });
      docs.push({ docType: 'DPA', audience: 'USER', lang, ...platformDocument('DPA', lang) });
      const processors = PLATFORM_SUBPROCESSORS.map((p) => ({ name: p.name, service: p.service, country: p.country, transferBasis: p.transferBasis }));
      docs.push({ docType: 'PRIVACY', audience: 'USER', lang, ...buildPrivacyNotice(PLATFORM_OPERATOR, 'USER', lang, processors, [], (c) => retentionLabel(c, lang)) });
    }
    for (const d of docs) {
      await q.query(
        "INSERT INTO `privacy_notices` (`id`, `companyId`, `docType`, `audience`, `language`, `version`, `title`, `body`, `contentSha256`, `status`, `publishedAt`, `publishedBy`, `createdBy`) VALUES (?, NULL, ?, ?, ?, '1.0', ?, ?, ?, 'PUBLISHED', UTC_TIMESTAMP(), 'migration', 'migration')",
        [randomUUID(), d.docType, d.audience, d.lang, d.title, d.body, sha256(`${d.title}\n${d.body}`)],
      );
    }
    for (const p of PLATFORM_SUBPROCESSORS) {
      await q.query('INSERT INTO `subprocessors` (`id`, `companyId`, `name`, `service`, `country`, `transferBasis`, `dataCategories`, `website`) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)', [
        randomUUID(), p.name, p.service, p.country, p.transferBasis, JSON.stringify(p.dataCategories), p.website ?? null,
      ]);
    }

    // C. triggers
    for (const t of AUDIT_TRIGGERS) await q.query(t.sql);
  }

  public async down(q: QueryRunner): Promise<void> {
    await dropAuditTriggers((sql) => q.query(sql));
    for (const table of ['customers', 'suppliers']) {
      const cols = table === 'customers' ? ['identityNumber', 'passportNo'] : ['identityNumber'];
      const rows: Record<string, string | null>[] = await q.query(`SELECT \`id\`, ${cols.map((c) => `\`${c}\``).join(', ')} FROM \`${table}\` WHERE ${cols.map((c) => `\`${c}\` IS NOT NULL`).join(' OR ')}`);
      for (const r of rows) {
        await q.query(`UPDATE \`${table}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')}, \`updatedAt\` = \`updatedAt\` WHERE \`id\` = ?`, [...cols.map((c) => decryptPii(r[c])), r['id']]);
      }
    }
    await q.query('ALTER TABLE `customers` MODIFY `identityNumber` varchar(20) NULL, MODIFY `passportNo` varchar(30) NULL');
    await q.query('ALTER TABLE `suppliers` MODIFY `identityNumber` varchar(20) NULL');
    for (const sql of DDL_DOWN) await q.query(sql);
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`createdBy\` IN ('migration', 'seed') AND \`key\` IN (${WP7_PARAMETER_KEYS.map(() => '?').join(', ')})`, WP7_PARAMETER_KEYS);
  }
}
