import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditChainHeadEntity } from '../../entities/kvkk.entity';
import { AUDIT_MASK_ACTION, ChainRow, ChainVerification, GENESIS_HASH, auditDigestSql, chainHash, maskEventDigests, verifyChain } from '../../shared/kvkk/audit-chain';

/**
 * Seals audit_logs rows into the per-company hash chain (in commit order) and verifies it.
 * Runs every AUDIT_SEAL_MS (default 5 s); `seal()` is also called before every verification.
 */
@Injectable()
export class AuditChainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditChainService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  onModuleInit() {
    if (process.env.JEST_WORKER_ID || process.env.AUDIT_SEAL === 'off') return;
    this.timer = setInterval(() => void this.seal().catch((e) => this.logger.warn(`audit seal: ${(e as Error).message}`)), Number(process.env.AUDIT_SEAL_MS) || 5000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Assigns chainSeq / prevHash / hash to unsealed rows. Returns the number of sealed rows. */
  async seal(limit = 2000): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const rows: { id: string; companyId: string | null; payloadDigest: string }[] = await this.ds.query(
        'SELECT id, companyId, payloadDigest FROM audit_logs WHERE hash IS NULL ORDER BY createdAt ASC, id ASC LIMIT ?',
        [limit],
      );
      if (!rows.length) return 0;
      const byKey = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = r.companyId ?? 'GLOBAL';
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(r);
      }
      let sealed = 0;
      for (const [key, list] of byKey) {
        sealed += await this.ds.transaction(async (m) => {
          let head = await m.findOne(AuditChainHeadEntity, { where: { chainKey: key }, lock: { mode: 'pessimistic_write' } });
          if (!head) {
            await m.query('INSERT IGNORE INTO audit_chain_heads (chainKey, lastSeq, lastHash) VALUES (?, 0, ?)', [key, GENESIS_HASH]);
            head = await m.findOneOrFail(AuditChainHeadEntity, { where: { chainKey: key }, lock: { mode: 'pessimistic_write' } });
          }
          let seq = Number(head.lastSeq);
          let prev = head.lastHash;
          let n = 0;
          for (const r of list) {
            const digest = r.payloadDigest;
            if (!digest) continue;
            const next = seq + 1;
            const hash = chainHash(prev, next, digest);
            const res = await m.query('UPDATE audit_logs SET chainSeq = ?, prevHash = ?, hash = ? WHERE id = ? AND hash IS NULL', [next, prev, hash, r.id]);
            if (!res?.affectedRows) continue;
            seq = next;
            prev = hash;
            n++;
          }
          await m.update(AuditChainHeadEntity, { chainKey: key }, { lastSeq: String(seq), lastHash: prev });
          return n;
        });
      }
      return sealed;
    } finally {
      this.running = false;
    }
  }

  /**
   * Verifies the company's chain (links + hashes) and recomputes the digest of every unmasked row
   * in the database (content tampering). Masked rows (KVKK erasure) are reported separately.
   */
  async verify(companyId: string): Promise<ChainVerification & { unsealed: number; maskedRows: number; tampered: string[]; head: { lastSeq: number; lastHash: string } | null; verifiedAt: string }> {
    await this.seal();
    const rows: ChainRow[] = await this.ds.query('SELECT id, chainSeq, prevHash, hash, payloadDigest FROM audit_logs WHERE companyId = ? AND hash IS NOT NULL ORDER BY chainSeq ASC', [companyId]);
    const chain = verifyChain(rows, rows.length ? undefined : GENESIS_HASH);
    const [{ n: unsealed }] = await this.ds.query('SELECT COUNT(*) n FROM audit_logs WHERE companyId = ? AND hash IS NULL', [companyId]);
    const [{ n: masked }] = await this.ds.query('SELECT COUNT(*) n FROM audit_logs WHERE companyId = ? AND maskedAt IS NOT NULL', [companyId]);
    const tampered: { id: string }[] = await this.ds.query(`SELECT a.id FROM audit_logs a WHERE a.companyId = ? AND a.maskedAt IS NULL AND (a.payloadDigest IS NULL OR a.payloadDigest <> ${auditDigestSql('a')}) LIMIT 100`, [companyId]);
    // Masked rows: the content must match the digest the trigger stored and a chained kvkk.audit_mask event.
    const masks = maskEventDigests(
      await this.ds.query('SELECT `after` FROM audit_logs WHERE companyId = ? AND action = ? ORDER BY chainSeq IS NULL, chainSeq ASC, createdAt ASC', [companyId, AUDIT_MASK_ACTION]),
    );
    const maskedRows: { id: string; maskedDigest: string | null; cur: string }[] = await this.ds.query(
      `SELECT a.id, a.maskedDigest, ${auditDigestSql('a')} AS cur FROM audit_logs a WHERE a.companyId = ? AND a.maskedAt IS NOT NULL`,
      [companyId],
    );
    for (const r of maskedRows) {
      if (tampered.length >= 100) break;
      if (!r.maskedDigest || r.maskedDigest !== r.cur || masks.get(r.id) !== r.maskedDigest) tampered.push({ id: r.id });
    }
    const head = await this.ds.manager.findOne(AuditChainHeadEntity, { where: { chainKey: companyId } });
    const lastOk = !rows.length || !head || (Number(head.lastSeq) === Number(rows[rows.length - 1].chainSeq) && head.lastHash === rows[rows.length - 1].hash);
    return {
      ...chain,
      ok: chain.ok && !tampered.length && lastOk,
      unsealed: Number(unsealed),
      maskedRows: Number(masked),
      tampered: tampered.map((t) => t.id),
      head: head ? { lastSeq: Number(head.lastSeq), lastHash: head.lastHash } : null,
      verifiedAt: new Date().toISOString(),
    };
  }
}
