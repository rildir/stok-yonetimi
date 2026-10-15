import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { AUDIT_LOG_TRIGGERS_VERSION_1, AUDIT_LOG_TRIGGERS_VERSION_2, AuditMaskItem, applyAuditMasks, dropAuditTriggers } from '../shared/kvkk/audit-chain';
import { redactStoredAuditJson } from '../shared/integrations/audit-diff';
import { decryptPii, piiHash } from '../shared/kvkk/crypto';
import { LEGAL_PARAMETER_SEEDS, WP7R1_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { LEGACY_PLATFORM_INTEGRATOR_NAME } from '../shared/kvkk/platform';

/**
 * WP7 review fixes (round 1):
 *  A. user_sessions.prevTokenHash: refresh-token reuse detection (a rotated token presented again
 *     revokes the session);
 *  B. audit_logs.maskedDigest and new append-only triggers: a KVKK masking may only replace values
 *     (same keys) and clear actor columns, the trigger stores the digest of the masked content and
 *     every masking is recorded as a chained kvkk.audit_mask event (tamper evidence);
 *  C. the rows masked before this migration get their maskedDigest and mask event; audit rows written
 *     before the deep redaction (document snapshots, drivers' TCKN, e-document payloads) are masked;
 *  D. identityNumberHash becomes tenant-scoped (HMAC over companyId + identifier);
 *  E. VERBİS parameters re-dated / re-sourced (2018/87, 2023/1154) and the 2025 rules added (low
 *     confidence), KVKK_ADEQUACY_COUNTRIES (no adequacy decision published);
 *  F. the platform-wide "e-Belge integrator" sub-processor placeholder is deactivated (the integrator
 *     is each company's own processor and was listed twice in tenant notices).
 */
export class KvkkReviewFixes1784274142000 implements MigrationInterface {
  name = 'KvkkReviewFixes1784274142000';

  public async up(q: QueryRunner): Promise<void> {
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);

    // A. sessions (a development database may already have the columns through the dev schema sync)
    if (!(await q.hasColumn('user_sessions', 'prevTokenHash'))) await q.query('ALTER TABLE `user_sessions` ADD `prevTokenHash` char(64) NULL');
    const idx = await q.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions' AND INDEX_NAME = 'IDX_user_sessions_prev_token'");
    if (!idx.length) await q.query('CREATE INDEX `IDX_user_sessions_prev_token` ON `user_sessions` (`prevTokenHash`)');

    // B. audit_logs
    if (!(await q.hasColumn('audit_logs', 'maskedDigest'))) await q.query('ALTER TABLE `audit_logs` ADD `maskedDigest` char(64) NULL');
    await dropAuditTriggers(query, AUDIT_LOG_TRIGGERS_VERSION_1);
    for (const t of AUDIT_LOG_TRIGGERS_VERSION_2) await q.query(t.sql);

    // C. masking backfill
    const rows: { id: string; companyId: string | null; before: unknown; after: unknown; maskedAt: Date | null }[] = await q.query(
      "SELECT id, companyId, `before`, `after`, maskedAt FROM audit_logs WHERE action <> 'kvkk.audit_mask'",
    );
    const items: AuditMaskItem[] = [];
    const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
    for (const r of rows) {
      const before = parse(r.before);
      const after = parse(r.after);
      const mb = redactStoredAuditJson(before);
      const ma = redactStoredAuditJson(after);
      const changed = JSON.stringify(mb) !== JSON.stringify(before ?? null) || JSON.stringify(ma) !== JSON.stringify(after ?? null);
      if (changed || r.maskedAt) items.push({ id: r.id, companyId: r.companyId, before: mb ?? null, after: ma ?? null });
    }
    await applyAuditMasks(query, items, { username: 'migration' });

    // D. tenant-scoped blind index
    for (const table of ['customers', 'suppliers']) {
      const list: { id: string; companyId: string; identityNumber: string | null }[] = await q.query(`SELECT id, companyId, identityNumber FROM \`${table}\` WHERE identityNumber IS NOT NULL`);
      for (const r of list) {
        await q.query(`UPDATE \`${table}\` SET identityNumberHash = ?, updatedAt = updatedAt WHERE id = ?`, [piiHash(decryptPii(r.identityNumber), r.companyId), r.id]);
      }
    }

    // E. legal parameters (rows created by migrations / seeders are replaced; administrator rows stay)
    await q.query(`DELETE FROM \`legal_parameters\` WHERE \`createdBy\` IN ('migration', 'seed') AND \`key\` IN (${WP7R1_PARAMETER_KEYS.map(() => '?').join(', ')})`, WP7R1_PARAMETER_KEYS);
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP7R1_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note ?? null, 'migration'],
      );
    }

    // F. sub-processor placeholder
    await q.query('UPDATE `subprocessors` SET `active` = 0 WHERE `companyId` IS NULL AND `name` = ?', [LEGACY_PLATFORM_INTEGRATOR_NAME]);
  }

  public async down(q: QueryRunner): Promise<void> {
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await q.query('UPDATE `subprocessors` SET `active` = 1 WHERE `companyId` IS NULL AND `name` = ?', [LEGACY_PLATFORM_INTEGRATOR_NAME]);
    for (const table of ['customers', 'suppliers']) {
      const list: { id: string; identityNumber: string | null }[] = await q.query(`SELECT id, identityNumber FROM \`${table}\` WHERE identityNumber IS NOT NULL`);
      for (const r of list) await q.query(`UPDATE \`${table}\` SET identityNumberHash = ?, updatedAt = updatedAt WHERE id = ?`, [piiHash(decryptPii(r.identityNumber)), r.id]);
    }
    // Masked content cannot be restored; the masking events stay in the chain.
    await dropAuditTriggers(query, AUDIT_LOG_TRIGGERS_VERSION_2);
    await q.query('ALTER TABLE `audit_logs` DROP COLUMN `maskedDigest`');
    for (const t of AUDIT_LOG_TRIGGERS_VERSION_1) await q.query(t.sql);
    await q.query('DROP INDEX `IDX_user_sessions_prev_token` ON `user_sessions`');
    await q.query('ALTER TABLE `user_sessions` DROP COLUMN `prevTokenHash`');
  }
}
