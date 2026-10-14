import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 5: audit log, public API keys, webhooks.
 *  - `audit_logs`: append-only change log (companyId nullable for failed logins of unknown users).
 *  - `api_keys`: per company, SHA-256 hashed secret, JSON scopes.
 *  - `webhook_endpoints` + `webhook_deliveries` (retry state).
 * No backfill needed.
 */
export class AddAuditApiKeysWebhooks1784274126000 implements MigrationInterface {
  name = 'AddAuditApiKeysWebhooks1784274126000';

  public async up(q: QueryRunner): Promise<void> {
    const ts = '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
    await q.query(
      'CREATE TABLE `audit_logs` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NULL, `userId` varchar(36) NULL, `username` varchar(100) NULL, ' +
        '`apiKeyId` varchar(36) NULL, `action` varchar(30) NOT NULL, `entityType` varchar(60) NOT NULL, `entityId` varchar(36) NULL, ' +
        '`before` json NULL, `after` json NULL, `ip` varchar(64) NULL, `userAgent` varchar(255) NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        'INDEX `IDX_audit_logs_company_created` (`companyId`, `createdAt`), INDEX `IDX_audit_logs_company_entity` (`companyId`, `entityType`, `entityId`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `api_keys` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `name` varchar(100) NOT NULL, `prefix` varchar(32) NOT NULL, ' +
        '`secretHash` varchar(64) NOT NULL, `scopes` json NOT NULL, `lastUsedAt` datetime NULL, `expiresAt` datetime NULL, `revoked` tinyint NOT NULL DEFAULT 0, ' +
        '`createdBy` varchar(100) NULL, ' + ts + ', UNIQUE INDEX `UQ_api_keys_prefix` (`prefix`), INDEX `IDX_api_keys_company` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `webhook_endpoints` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `url` varchar(500) NOT NULL, `description` varchar(255) NULL, ' +
        '`secret` varchar(100) NOT NULL, `events` json NOT NULL, `active` tinyint NOT NULL DEFAULT 1, ' + ts + ', ' +
        'INDEX `IDX_webhook_endpoints_company` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `webhook_deliveries` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `endpointId` varchar(36) NOT NULL, `event` varchar(60) NOT NULL, ' +
        "`payload` json NOT NULL, `status` varchar(10) NOT NULL DEFAULT 'pending', `attempts` int NOT NULL DEFAULT '0', `responseCode` int NULL, `responseBody` text NULL, " +
        '`error` varchar(500) NULL, `nextRetryAt` datetime NULL, `deliveredAt` datetime NULL, ' + ts + ', ' +
        'INDEX `IDX_webhook_deliveries_company_created` (`companyId`, `createdAt`), INDEX `IDX_webhook_deliveries_status_retry` (`status`, `nextRetryAt`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query('ALTER TABLE `api_keys` ADD CONSTRAINT `FK_api_keys_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION');
    await q.query('ALTER TABLE `webhook_endpoints` ADD CONSTRAINT `FK_webhook_endpoints_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION');
    await q.query('ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `FK_webhook_deliveries_endpoint` FOREIGN KEY (`endpointId`) REFERENCES `webhook_endpoints`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `webhook_deliveries`');
    await q.query('DROP TABLE `webhook_endpoints`');
    await q.query('DROP TABLE `api_keys`');
    await q.query('DROP TABLE `audit_logs`');
  }
}
