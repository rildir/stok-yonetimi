import { MigrationInterface, QueryRunner } from 'typeorm';
import { AUDIT_LOG_TRIGGERS_VERSION_2, AUDIT_LOG_TRIGGERS_CURRENT, auditDigestSql, dropAuditTriggers, maskEventDigests, writeAuditMaskEvents } from '../shared/kvkk/audit-chain';

/**
 * WP7 review fixes (round 2), audit-log tamper evidence:
 *  A. audit_logs triggers version 3: a KVKK masking (@kvkk_erasure = 1) may only turn leaf values
 *     into masking markers ([REDACTED], [ANONIMLESTIRILDI], anonymous names, NULL for text /
 *     objects, TCKNs masked inside a text) with the JSON structure unchanged; a rewrite of business
 *     values is refused with AUDIT_MASK_NOT_MARKER;
 *  B. kvkk.audit_mask events carry a MAC per row under a server-only key (derived from
 *     PII_HMAC_KEY): the rows masked so far whose content still matches their recorded masked digest
 *     are attested by a new event (`reattestation: true`); a row that does not match keeps being
 *     reported as tampered. No column changes.
 */
export class KvkkAuditMaskAttestation1784274143000 implements MigrationInterface {
  name = 'KvkkAuditMaskAttestation1784274143000';

  public async up(q: QueryRunner): Promise<void> {
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await dropAuditTriggers(query, AUDIT_LOG_TRIGGERS_VERSION_2);
    for (const t of AUDIT_LOG_TRIGGERS_CURRENT) await q.query(t.sql);

    const companies: { companyId: string | null }[] = await q.query('SELECT DISTINCT companyId FROM audit_logs WHERE maskedAt IS NOT NULL');
    for (const { companyId } of companies) {
      const events = await q.query(
        'SELECT `after` FROM audit_logs WHERE companyId <=> ? AND action = ? ORDER BY chainSeq IS NULL, chainSeq ASC, createdAt ASC',
        [companyId, 'kvkk.audit_mask'],
      );
      const latest = maskEventDigests(events);
      const rows: { id: string; maskedDigest: string | null; cur: string }[] = await q.query(
        `SELECT a.id, a.maskedDigest, ${auditDigestSql('a')} AS cur FROM audit_logs a WHERE a.companyId <=> ? AND a.maskedAt IS NOT NULL`,
        [companyId],
      );
      // only rows the previous verifier accepted (content = masked digest = latest event digest) and not attested yet
      const ids = rows.filter((r) => r.maskedDigest && r.maskedDigest === r.cur && latest.get(r.id)?.digest === r.maskedDigest && !latest.get(r.id)?.mac).map((r) => r.id);
      if (ids.length) await writeAuditMaskEvents(query, ids, { username: 'migration' }, () => true, { reattestation: true });
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // The attestation events stay in the chain (append-only).
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await dropAuditTriggers(query, AUDIT_LOG_TRIGGERS_CURRENT);
    for (const t of AUDIT_LOG_TRIGGERS_VERSION_2) await q.query(t.sql);
  }
}
