import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { TR_PROVINCES, TR_DISTRICTS, TR_TAX_OFFICES } from '../shared/refdata/tr-refdata';
import { LEGAL_PARAMETER_SEEDS } from '../shared/legal/legal-parameter-seeds';
import { parseLegacyAddress, StructuredAddress } from '../shared/refdata/legacy-address';
import { guessIdentityType, isValidTckn, isValidVkn, isValidYkn } from '../shared/tr';

/**
 * WP1 - fiscal identity, structured addresses, legal parameters, security basics.
 *
 *  A. Global reference tables: `provinces` (81), `districts` (973), `tax_offices` (GİB list).
 *  B. `legal_parameters` (versioned thresholds with sourceRef) + seed.
 *  C. companies: fiscal identity columns + embedded address + bookkeepingType.
 *  D. `company_ebelge_profiles` (one per company).
 *  E. customers: identity / tax office / e-document / KVKK notice columns, embedded address,
 *     needsReview. `customer_addresses` (billing + delivery addresses).
 *  F. suppliers: type, identity, tax office, embedded address, taxpayer flags, needsReview.
 *  G. warehouses: embedded address, isBranch, branchCode, siteGroup, defaultSeries.
 *  H. users: isSuperAdmin, mustChangePassword, failedLoginCount, lockedUntil, invite token, passwordChangedAt.
 *  I. Time zone: the connection now uses UTC (`timezone: 'Z'`). DATETIME values the app wrote
 *     itself were stored in the server's local time (Europe/Istanbul, +03:00); they are shifted
 *     to UTC. DB-default timestamps (createdAt/updatedAt, CURRENT_TIMESTAMP) were already UTC.
 *
 * Backfill rules
 *  - customers.taxNumber: 10 digits -> VKN, 11 digits -> TCKN (99... -> YKN); failed checksums
 *    and anything else keep the raw value and get needsReview = 1. No number: individuals become
 *    ANONYMOUS (final consumer), company customers get needsReview (TAX_ID_REQUIRED_FOR_COMPANY).
 *  - Legacy free-text address / city / postalCode / country become structured columns
 *    (province / district matched by name; unmatched text stays in line1).
 *  - Suppliers without a tax identity get needsReview = 1.
 *  - The bootstrap `admin` user of the default company becomes super admin.
 *  Demo-company fiscal data (VKN, tax office, profile) is added by SeedService.
 */
const LEGACY_OFFSET = process.env.WP1_LEGACY_UTC_OFFSET || '+03:00';
const DEFAULT_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

/** App-written DATETIME columns (not DB defaults) that were stored in server local time. */
const LOCAL_TIME_COLUMNS: [string, string][] = [
  ['orders', 'date'],
  ['stock_counts', 'startedAt'],
  ['stock_counts', 'completedAt'],
  ['api_keys', 'lastUsedAt'],
  ['api_keys', 'expiresAt'],
  ['webhook_deliveries', 'nextRetryAt'],
  ['webhook_deliveries', 'deliveredAt'],
];

const ADDRESS_COLUMNS: [string, string][] = [
  ['addressLine1', 'varchar(255) NULL'],
  ['addressLine2', 'varchar(255) NULL'],
  ['addressDistrictId', 'int NULL'],
  ['addressDistrict', 'varchar(100) NULL'],
  ['addressProvinceCode', 'varchar(2) NULL'],
  ['addressProvince', 'varchar(100) NULL'],
  ['addressPostalCode', 'varchar(10) NULL'],
  ['addressCountry', 'varchar(2) NULL'],
  ['addressUavtCode', 'varchar(20) NULL'],
];
const ADDRESS_DDL = ADDRESS_COLUMNS.map(([c, t]) => `\`${c}\` ${t}`).join(', ');

const REF = { provinces: TR_PROVINCES, districts: TR_DISTRICTS };

function addressParams(a: StructuredAddress): unknown[] {
  return [a.line1, a.line2, a.districtId, a.district, a.provinceCode, a.province, a.postalCode, a.country, a.uavtCode];
}
const ADDRESS_SET = ADDRESS_COLUMNS.map(([c]) => `\`${c}\` = ?`).join(', ');

export class AddFiscalIdentityAddressLegalParams1784274127000 implements MigrationInterface {
  name = 'AddFiscalIdentityAddressLegalParams1784274127000';

  private async bulkInsert(q: QueryRunner, table: string, columns: string[], rows: unknown[][]) {
    const chunk = 200;
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const placeholders = part.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
      await q.query(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES ${placeholders}`, part.flat());
    }
  }

  public async up(q: QueryRunner): Promise<void> {
    const ts = '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
    const fk = (t: string, name: string, col: string, ref: string, onDelete: string) =>
      q.query(`ALTER TABLE \`${t}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${col}\`) REFERENCES \`${ref}\`(\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`);

    // ─── A. Reference tables ───
    await q.query('CREATE TABLE `provinces` (`code` varchar(2) NOT NULL, `name` varchar(100) NOT NULL, PRIMARY KEY (`code`)) ENGINE=InnoDB');
    await q.query(
      'CREATE TABLE `districts` (`id` int NOT NULL, `provinceCode` varchar(2) NOT NULL, `name` varchar(100) NOT NULL, ' +
        'UNIQUE INDEX `UQ_districts_province_name` (`provinceCode`, `name`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `tax_offices` (`code` varchar(10) NOT NULL, `name` varchar(150) NOT NULL, `provinceCode` varchar(2) NOT NULL, `district` varchar(100) NULL, ' +
        'INDEX `IDX_tax_offices_province` (`provinceCode`), PRIMARY KEY (`code`)) ENGINE=InnoDB',
    );
    await this.bulkInsert(q, 'provinces', ['code', 'name'], TR_PROVINCES);
    await this.bulkInsert(q, 'districts', ['id', 'provinceCode', 'name'], TR_DISTRICTS);
    await this.bulkInsert(q, 'tax_offices', ['code', 'provinceCode', 'name', 'district'], TR_TAX_OFFICES.map(([c, p, n, d]) => [c, p, n, d || null]));

    // ─── B. Legal parameters ───
    await q.query(
      "CREATE TABLE `legal_parameters` (`id` varchar(36) NOT NULL, `country` varchar(2) NOT NULL DEFAULT 'TR', `key` varchar(64) NOT NULL, " +
        "`validFrom` date NOT NULL, `validTo` date NULL, `value` text NOT NULL, `sourceRef` varchar(255) NOT NULL, `confidence` varchar(10) NOT NULL DEFAULT 'high', " +
        '`note` varchar(500) NULL, `createdBy` varchar(100) NULL, ' + ts + ', ' +
        'UNIQUE INDEX `UQ_legal_parameters_country_key_from` (`country`, `key`, `validFrom`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await this.bulkInsert(
      q,
      'legal_parameters',
      ['id', 'country', 'key', 'validFrom', 'validTo', 'value', 'sourceRef', 'confidence', 'note', 'createdBy'],
      LEGAL_PARAMETER_SEEDS.map((p) => [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration']),
    );

    // ─── C. Companies ───
    for (const [c, t] of [
      ['legalName', 'varchar(255) NULL'],
      ['taxIdType', 'varchar(4) NULL'],
      ['taxId', 'varchar(11) NULL'],
      ['taxOfficeCode', 'varchar(10) NULL'],
      ['taxOfficeName', 'varchar(150) NULL'],
      ['mersisNo', 'varchar(16) NULL'],
      ['tradeRegistryNo', 'varchar(50) NULL'],
      ['tradeRegistryOffice', 'varchar(150) NULL'],
      ['kepAddress', 'varchar(255) NULL'],
      ['website', 'varchar(255) NULL'],
      ['phone', 'varchar(40) NULL'],
      ['email', 'varchar(255) NULL'],
      ...ADDRESS_COLUMNS,
      ['bookkeepingType', 'varchar(10) NULL'],
    ]) {
      await q.query(`ALTER TABLE \`companies\` ADD \`${c}\` ${t}`);
    }
    // Country of the head office defaults to the company country.
    await q.query('UPDATE `companies` SET `addressCountry` = `country`');

    // ─── D. e-Belge profiles ───
    await q.query(
      'CREATE TABLE `company_ebelge_profiles` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `annualGrossSales` json NULL, ' +
        '`sectorFlagsEFatura` json NULL, `sectorFlagsEIrsaliye` json NULL, `eFaturaSince` date NULL, `eArsivSince` date NULL, `eIrsaliyeSince` date NULL, ' +
        '`mandatoryVsVoluntary` varchar(12) NULL, `gibWrittenNoticeDate` date NULL, `corporateEvents` json NULL, ' + ts + ', ' +
        'UNIQUE INDEX `UQ_company_ebelge_profiles_company` (`companyId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await fk('company_ebelge_profiles', 'FK_company_ebelge_profiles_company', 'companyId', 'companies', 'CASCADE');

    // ─── E. Customers ───
    for (const [c, t] of [
      ['identityType', 'varchar(10) NULL'],
      ['identityNumber', 'varchar(20) NULL'],
      ['taxOfficeCode', 'varchar(10) NULL'],
      ['taxOfficeName', 'varchar(150) NULL'],
      ['isVatTaxpayer', 'tinyint NOT NULL DEFAULT 0'],
      ['isDesignatedBuyer', 'tinyint NOT NULL DEFAULT 0'],
      ['passportNo', 'varchar(30) NULL'],
      ['nationality', 'varchar(2) NULL'],
      ['foreignTaxId', 'varchar(40) NULL'],
      ['eInvoiceRegistered', 'tinyint NULL'],
      ['eInvoiceAliases', 'json NULL'],
      ['eInvoiceCheckedAt', 'datetime NULL'],
      ['eDespatchRegistered', 'tinyint NULL'],
      ['eDespatchAliases', 'json NULL'],
      ['preferredProfile', 'varchar(20) NULL'],
      ['noticeGivenAt', 'datetime NULL'],
      ['noticeVersion', 'varchar(20) NULL'],
      ['noticeChannel', 'varchar(20) NULL'],
      ...ADDRESS_COLUMNS,
      ['needsReview', 'tinyint NOT NULL DEFAULT 0'],
      ['reviewReason', 'varchar(64) NULL'],
    ]) {
      await q.query(`ALTER TABLE \`customers\` ADD \`${c}\` ${t}`);
    }
    await q.query('CREATE INDEX `IDX_customers_needs_review` ON `customers` (`needsReview`)');
    const customers: any[] = await q.query('SELECT `id`, `type`, `taxNumber`, `address`, `city`, `postalCode`, `country` FROM `customers`');
    for (const c of customers) {
      const raw = String(c.taxNumber ?? '').replace(/\s/g, '');
      let identityType: string | null = null;
      let identityNumber: string | null = null;
      let reason: string | null = null;
      if (raw) {
        const guess = guessIdentityType(raw);
        identityNumber = raw.slice(0, 20);
        if (guess === 'VKN') {
          identityType = 'VKN';
          if (!isValidVkn(raw)) reason = 'INVALID_VKN';
        } else if (guess === 'TCKN' || guess === 'YKN') {
          identityType = guess;
          if (!(guess === 'YKN' ? isValidYkn(raw) : isValidTckn(raw))) reason = 'INVALID_TCKN';
        } else {
          reason = 'UNPARSEABLE_TAX_NUMBER';
        }
      } else if (c.type === 'company') {
        reason = 'TAX_ID_REQUIRED_FOR_COMPANY';
      } else {
        identityType = 'ANONYMOUS';
      }
      const addr = parseLegacyAddress({ address: c.address, city: c.city, postalCode: c.postalCode, country: c.country }, REF);
      await q.query(
        `UPDATE \`customers\` SET \`identityType\` = ?, \`identityNumber\` = ?, \`needsReview\` = ?, \`reviewReason\` = ?, ${ADDRESS_SET} WHERE \`id\` = ?`,
        [identityType, identityNumber, reason ? 1 : 0, reason, ...addressParams(addr), c.id],
      );
    }
    for (const col of ['taxNumber', 'address', 'city', 'postalCode', 'country']) {
      await q.query(`ALTER TABLE \`customers\` DROP COLUMN \`${col}\``);
    }

    await q.query(
      "CREATE TABLE `customer_addresses` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `customerId` varchar(36) NOT NULL, `kind` varchar(10) NOT NULL DEFAULT 'DELIVERY', " +
        '`label` varchar(100) NULL, `isDefault` tinyint NOT NULL DEFAULT 0, `contactName` varchar(120) NULL, `phone` varchar(40) NULL, ' + ADDRESS_DDL + ', ' + ts + ', ' +
        'INDEX `IDX_customer_addresses_company_customer` (`companyId`, `customerId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await fk('customer_addresses', 'FK_customer_addresses_company', 'companyId', 'companies', 'CASCADE');
    await fk('customer_addresses', 'FK_customer_addresses_customer', 'customerId', 'customers', 'CASCADE');

    // ─── F. Suppliers ───
    for (const [c, t] of [
      ['type', "varchar(12) NOT NULL DEFAULT 'company'"],
      ['identityType', 'varchar(10) NULL'],
      ['identityNumber', 'varchar(20) NULL'],
      ['taxOfficeCode', 'varchar(10) NULL'],
      ['taxOfficeName', 'varchar(150) NULL'],
      ...ADDRESS_COLUMNS,
      ['isTaxpayer', 'tinyint NOT NULL DEFAULT 1'],
      ['isRealTaxationFarmer', 'tinyint NOT NULL DEFAULT 0'],
      ['isForeign', 'tinyint NOT NULL DEFAULT 0'],
      ['isVatTaxpayer', 'tinyint NOT NULL DEFAULT 1'],
      ['needsReview', 'tinyint NOT NULL DEFAULT 0'],
    ]) {
      await q.query(`ALTER TABLE \`suppliers\` ADD \`${c}\` ${t}`);
    }
    for (const s of (await q.query('SELECT `id`, `address` FROM `suppliers`')) as any[]) {
      const addr = parseLegacyAddress({ address: s.address }, REF);
      await q.query(`UPDATE \`suppliers\` SET \`needsReview\` = 1, ${ADDRESS_SET} WHERE \`id\` = ?`, [...addressParams(addr), s.id]);
    }
    await q.query('ALTER TABLE `suppliers` DROP COLUMN `address`');

    // ─── G. Warehouses ───
    for (const [c, t] of [
      ...ADDRESS_COLUMNS,
      ['isBranch', 'tinyint NOT NULL DEFAULT 0'],
      ['branchCode', 'varchar(20) NULL'],
      ['siteGroup', 'varchar(50) NULL'],
      ['defaultSeries', 'varchar(3) NULL'],
    ]) {
      await q.query(`ALTER TABLE \`warehouses\` ADD \`${c}\` ${t}`);
    }
    for (const w of (await q.query('SELECT `id`, `address` FROM `warehouses`')) as any[]) {
      const addr = parseLegacyAddress({ address: w.address }, REF);
      await q.query(`UPDATE \`warehouses\` SET ${ADDRESS_SET} WHERE \`id\` = ?`, [...addressParams(addr), w.id]);
    }
    await q.query('ALTER TABLE `warehouses` DROP COLUMN `address`');

    // ─── H. Users ───
    for (const [c, t] of [
      ['isSuperAdmin', 'tinyint NOT NULL DEFAULT 0'],
      ['mustChangePassword', 'tinyint NOT NULL DEFAULT 0'],
      ['failedLoginCount', "int NOT NULL DEFAULT '0'"],
      ['lockedUntil', 'datetime NULL'],
      ['inviteTokenHash', 'varchar(64) NULL'],
      ['inviteExpiresAt', 'datetime NULL'],
      ['passwordChangedAt', 'datetime NULL'],
    ]) {
      await q.query(`ALTER TABLE \`users\` ADD \`${c}\` ${t}`);
    }
    await q.query("UPDATE `users` SET `isSuperAdmin` = 1 WHERE `username` = 'admin' AND `companyId` = ? AND `role` = 'admin'", [DEFAULT_COMPANY_ID]);

    // ─── I. Local time -> UTC ───
    for (const [t, c] of LOCAL_TIME_COLUMNS) {
      await q.query(`UPDATE \`${t}\` SET \`${c}\` = CONVERT_TZ(\`${c}\`, ?, '+00:00') WHERE \`${c}\` IS NOT NULL`, [LEGACY_OFFSET]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const [t, c] of LOCAL_TIME_COLUMNS) {
      await q.query(`UPDATE \`${t}\` SET \`${c}\` = CONVERT_TZ(\`${c}\`, '+00:00', ?) WHERE \`${c}\` IS NOT NULL`, [LEGACY_OFFSET]);
    }
    for (const c of ['isSuperAdmin', 'mustChangePassword', 'failedLoginCount', 'lockedUntil', 'inviteTokenHash', 'inviteExpiresAt', 'passwordChangedAt']) {
      await q.query(`ALTER TABLE \`users\` DROP COLUMN \`${c}\``);
    }
    const joinAddress = "NULLIF(CONCAT_WS(', ', `addressLine1`, `addressLine2`, `addressDistrict`, `addressProvince`), '')";

    await q.query('ALTER TABLE `warehouses` ADD `address` varchar(255) NULL');
    await q.query(`UPDATE \`warehouses\` SET \`address\` = ${joinAddress}`);
    for (const c of [...ADDRESS_COLUMNS.map(([n]) => n), 'isBranch', 'branchCode', 'siteGroup', 'defaultSeries']) {
      await q.query(`ALTER TABLE \`warehouses\` DROP COLUMN \`${c}\``);
    }

    await q.query('ALTER TABLE `suppliers` ADD `address` varchar(255) NULL');
    await q.query(`UPDATE \`suppliers\` SET \`address\` = ${joinAddress}`);
    for (const c of ['type', 'identityType', 'identityNumber', 'taxOfficeCode', 'taxOfficeName', ...ADDRESS_COLUMNS.map(([n]) => n), 'isTaxpayer', 'isRealTaxationFarmer', 'isForeign', 'isVatTaxpayer', 'needsReview']) {
      await q.query(`ALTER TABLE \`suppliers\` DROP COLUMN \`${c}\``);
    }

    await q.query('DROP TABLE `customer_addresses`');
    await q.query('ALTER TABLE `customers` ADD `taxNumber` varchar(50) NULL');
    await q.query('ALTER TABLE `customers` ADD `address` varchar(255) NULL');
    await q.query('ALTER TABLE `customers` ADD `city` varchar(100) NULL');
    await q.query('ALTER TABLE `customers` ADD `postalCode` varchar(20) NULL');
    await q.query('ALTER TABLE `customers` ADD `country` varchar(2) NULL');
    await q.query(
      "UPDATE `customers` SET `taxNumber` = IF(`identityType` = 'ANONYMOUS', NULL, `identityNumber`), " +
        "`address` = NULLIF(CONCAT_WS(', ', `addressLine1`, `addressLine2`, `addressDistrict`), ''), `city` = `addressProvince`, " +
        '`postalCode` = `addressPostalCode`, `country` = `addressCountry`',
    );
    await q.query('DROP INDEX `IDX_customers_needs_review` ON `customers`');
    for (const c of [
      'identityType', 'identityNumber', 'taxOfficeCode', 'taxOfficeName', 'isVatTaxpayer', 'isDesignatedBuyer', 'passportNo', 'nationality', 'foreignTaxId',
      'eInvoiceRegistered', 'eInvoiceAliases', 'eInvoiceCheckedAt', 'eDespatchRegistered', 'eDespatchAliases', 'preferredProfile', 'noticeGivenAt',
      'noticeVersion', 'noticeChannel', ...ADDRESS_COLUMNS.map(([n]) => n), 'needsReview', 'reviewReason',
    ]) {
      await q.query(`ALTER TABLE \`customers\` DROP COLUMN \`${c}\``);
    }

    await q.query('DROP TABLE `company_ebelge_profiles`');
    for (const c of [
      'legalName', 'taxIdType', 'taxId', 'taxOfficeCode', 'taxOfficeName', 'mersisNo', 'tradeRegistryNo', 'tradeRegistryOffice', 'kepAddress', 'website',
      'phone', 'email', ...ADDRESS_COLUMNS.map(([n]) => n), 'bookkeepingType',
    ]) {
      await q.query(`ALTER TABLE \`companies\` DROP COLUMN \`${c}\``);
    }
    await q.query('DROP TABLE `legal_parameters`');
    await q.query('DROP TABLE `tax_offices`');
    await q.query('DROP TABLE `districts`');
    await q.query('DROP TABLE `provinces`');
  }
}
