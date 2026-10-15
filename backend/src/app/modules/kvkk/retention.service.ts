import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { DestructionCandidate, DestructionLogEntity, DestructionRunEntity, RetentionPolicyEntity } from '../../entities/kvkk.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { RETENTION_DEFAULTS, RetentionUnit, addPeriod, nextDestructionDue, violatesMinimum } from '../../shared/kvkk/retention';
import { PERSONAL_KEYS } from '../../shared/kvkk/anonymizer';
import { todayKey } from '../../shared/tr';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { ErasureService } from './erasure.service';
import { AppGateway } from '../../app.gateway';

export interface PolicyOverrideInput {
  periodValue?: number;
  periodUnit?: string;
  enabled?: boolean;
  note?: string | null;
}

/** Effective policy of a category for a company (override or global default). */
export type EffectivePolicy = RetentionPolicyEntity & { isOverride: boolean; defaultPeriodValue: number; defaultPeriodUnit: string; approved: boolean };

/**
 * Retention policies and the periodic destruction (R58, İmha Yönetmeliği md. 11):
 *  - candidates are computed per category from the effective policies (monthly job, or on demand);
 *  - an administrator approves the run; only then data is anonymised / deleted (REVIEW categories -
 *    legal records - are listed for a manual archive-and-destroy decision and never auto-deleted);
 *  - every executed item is written to destruction_logs (kept at least 3 years).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly erasure: ErasureService,
    private readonly legal: LegalParameterService,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  async policies(companyId = this.companyId): Promise<EffectivePolicy[]> {
    const rows = await this.ds.manager.find(RetentionPolicyEntity, { where: [{ companyId }, { companyId: IsNull() }], order: { dataCategory: 'ASC' } });
    const globals = rows.filter((r) => !r.companyId);
    return globals.map((g) => {
      const o = rows.find((r) => r.companyId && r.dataCategory === g.dataCategory);
      const eff = o ?? g;
      return {
        ...g,
        ...(o ? { periodValue: o.periodValue, periodUnit: o.periodUnit, enabled: o.enabled, note: o.note, approvedAt: o.approvedAt, approvedBy: o.approvedBy, id: o.id, companyId: o.companyId } : {}),
        isOverride: !!o,
        defaultPeriodValue: g.periodValue,
        defaultPeriodUnit: g.periodUnit,
        approved: !g.requiresApproval || !!eff.approvedAt,
      } as EffectivePolicy;
    });
  }

  private async override(category: string): Promise<RetentionPolicyEntity> {
    const g = await this.ds.manager.findOne(RetentionPolicyEntity, { where: { companyId: IsNull(), dataCategory: category } });
    if (!g) throw new BadRequestException(err('RETENTION_CATEGORY_INVALID'));
    let o = await this.ds.manager.findOne(RetentionPolicyEntity, { where: { companyId: this.companyId, dataCategory: category } });
    if (!o) {
      const { id, createdAt, updatedAt, ...rest } = g;
      o = this.ds.manager.create(RetentionPolicyEntity, { ...rest, companyId: this.companyId, approvedAt: null, approvedBy: null });
    }
    return o;
  }

  /** Tenant override: a longer period is always allowed; below the legal minimum is refused. */
  async setOverride(category: string, input: PolicyOverrideInput) {
    const o = await this.override(category);
    const unit = (input.periodUnit ?? o.periodUnit) as RetentionUnit;
    const value = input.periodValue ?? o.periodValue;
    if (!['DAY', 'MONTH', 'YEAR'].includes(unit) || !Number.isInteger(value) || value < 0) throw new BadRequestException(err('VALIDATION_FAILED'));
    const def = RETENTION_DEFAULTS.find((d) => d.dataCategory === category);
    if (def && violatesMinimum(def, value, unit)) throw new BadRequestException(err('RETENTION_BELOW_LEGAL_MINIMUM', { min: `${def.minimumValue} ${def.periodUnit}`, source: def.sourceRef }));
    o.periodValue = value;
    o.periodUnit = unit;
    if (input.enabled !== undefined) o.enabled = !!input.enabled;
    if (input.note !== undefined) o.note = input.note || null;
    await this.ds.manager.save(RetentionPolicyEntity, o);
    return (await this.policies()).find((p) => p.dataCategory === category);
  }

  /** Company approval of a recommended (öneri) period, e.g. 2 years for the audit log. */
  async approvePolicy(category: string, username: string) {
    const o = await this.override(category);
    o.approvedAt = new Date();
    o.approvedBy = username;
    await this.ds.manager.save(RetentionPolicyEntity, o);
    return (await this.policies()).find((p) => p.dataCategory === category);
  }

  // ------------------------------------------------------------------ candidates
  private cutoff(today: string, p: { periodValue: number; periodUnit: string }): string {
    return addPeriod(today, -p.periodValue, p.periodUnit as RetentionUnit);
  }

  /** Destruction candidates of a company on `today` (YYYY-MM-DD). */
  async candidates(companyId: string, today: string): Promise<{ candidates: DestructionCandidate[]; awaitingApproval: string[] }> {
    const pol = await this.policies(companyId);
    const m = this.ds.manager;
    const out: DestructionCandidate[] = [];
    const awaiting: string[] = [];
    const count = async (sql: string, params: unknown[]) => Number((await m.query(sql, params))[0]?.n || 0);
    for (const p of pol) {
      if (!p.enabled || p.action === 'NONE') continue;
      if (!p.approved) {
        awaiting.push(p.dataCategory);
        continue;
      }
      const cut = this.cutoff(today, p);
      const base = { policyId: p.id, retentionUntil: null as string | null };
      switch (p.dataCategory) {
        case 'CUSTOMER_INACTIVE': {
          const rows: { id: string; deletedAt: Date }[] = await m.query(
            'SELECT id, deletedAt FROM customers WHERE companyId = ? AND isDeleted = 1 AND anonymizedAt IS NULL AND processingRestricted = 0 AND deletedAt IS NOT NULL AND DATE(deletedAt) <= ?',
            [companyId, cut],
          );
          for (const r of rows) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'customers', entityId: r.id, label: `#${r.id.slice(0, 8)}`, action: 'ANONYMIZE', count: 1, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'CUSTOMER_IDENTITY': {
          const rows: { id: string; erasureRestrictedUntil: string }[] = await m.query(
            'SELECT id, erasureRestrictedUntil FROM customers WHERE companyId = ? AND anonymizedAt IS NULL AND processingRestricted = 1 AND erasureRestrictedUntil IS NOT NULL AND erasureRestrictedUntil < ?',
            [companyId, today],
          );
          for (const r of rows) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'customers', entityId: r.id, label: `#${r.id.slice(0, 8)}`, action: 'ANONYMIZE', count: 1, retentionUntil: String(r.erasureRestrictedUntil).slice(0, 10), reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'AUDIT_LOGS': {
          const n = await count("SELECT COUNT(*) n FROM audit_logs WHERE companyId = ? AND entityType <> 'auth' AND maskedAt IS NULL AND DATE(createdAt) < ?", [companyId, cut]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'audit_logs', entityId: null, label: `< ${cut}`, action: 'ANONYMIZE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'LOGIN_ATTEMPTS': {
          const n = await count("SELECT COUNT(*) n FROM audit_logs WHERE companyId = ? AND entityType = 'auth' AND maskedAt IS NULL AND DATE(createdAt) < ?", [companyId, cut]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'audit_logs', entityId: null, label: `< ${cut}`, action: 'ANONYMIZE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'WEBHOOK_DELIVERIES': {
          const n = await count('SELECT COUNT(*) n FROM webhook_deliveries WHERE companyId = ? AND DATE(createdAt) < ?', [companyId, cut]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'webhook_deliveries', entityId: null, label: `< ${cut}`, action: 'DELETE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'USER_SESSIONS': {
          const n = await count('SELECT COUNT(*) n FROM user_sessions WHERE companyId = ? AND DATE(COALESCE(revokedAt, expiresAt)) < ?', [companyId, cut]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'user_sessions', entityId: null, label: `< ${cut}`, action: 'DELETE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'CONSENTS': {
          const n = await count('SELECT COUNT(*) n FROM consents WHERE companyId = ? AND withdrawnAt IS NOT NULL AND DATE(withdrawnAt) < ?', [companyId, cut]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'consents', entityId: null, label: `< ${cut}`, action: 'DELETE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'DSR_REQUESTS': {
          const n = await count("SELECT COUNT(*) n FROM dsr_requests WHERE companyId = ? AND respondedAt IS NOT NULL AND applicantName <> '[anonim]' AND DATE(respondedAt) < ?", [companyId, cut]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'dsr_requests', entityId: null, label: `< ${cut}`, action: 'ANONYMIZE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'DESTRUCTION_LOGS': {
          const n = await count('SELECT COUNT(*) n FROM destruction_logs WHERE companyId = ? AND retainUntil < ?', [companyId, today]);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: 'destruction_logs', entityId: null, label: `< ${today}`, action: 'DELETE', count: n, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        case 'ORDERS':
        case 'DOCUMENTS':
        case 'STOCK_MOVEMENTS':
        case 'STOCK_COUNTS': {
          // Legal records: 31.12.(year + 10). Only listed (archive + manual destruction decision).
          const lastYear = Number(today.slice(0, 4)) - p.periodValue - 1;
          const limit = `${lastYear}-12-31`;
          const sql: Record<string, string> = {
            ORDERS: 'SELECT COUNT(*) n FROM orders WHERE companyId = ? AND DATE(date) <= ?',
            DOCUMENTS: 'SELECT (SELECT COUNT(*) FROM invoices WHERE companyId = ? AND COALESCE(issueDate, DATE(createdAt)) <= ?) + (SELECT COUNT(*) FROM despatches WHERE companyId = ? AND COALESCE(issueDate, DATE(createdAt)) <= ?) n',
            STOCK_MOVEMENTS: 'SELECT COUNT(*) n FROM stock_movements WHERE companyId = ? AND DATE(transactionDate) <= ?',
            STOCK_COUNTS: 'SELECT COUNT(*) n FROM stock_counts WHERE companyId = ? AND DATE(createdAt) <= ?',
          };
          const params = p.dataCategory === 'DOCUMENTS' ? [companyId, limit, companyId, limit] : [companyId, limit];
          const n = await count(sql[p.dataCategory], params);
          if (n) out.push({ ...base, dataCategory: p.dataCategory, entityType: p.dataCategory.toLowerCase(), entityId: null, label: `<= ${limit}`, action: 'REVIEW', count: n, retentionUntil: `${lastYear + p.periodValue}-12-31`, reason: `${p.legalBasis} (${p.sourceRef})` });
          break;
        }
        default:
          break;
      }
    }
    return { candidates: out, awaitingApproval: awaiting };
  }

  // ------------------------------------------------------------------ runs
  async createRun(trigger: 'SCHEDULED' | 'MANUAL', createdBy: string, companyId = this.companyId) {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: companyId });
    const today = todayKey(c.timezone);
    const { candidates, awaitingApproval } = await this.candidates(companyId, today);
    return this.ds.transaction(async (m) => {
      const year = today.slice(0, 4);
      // Yearly counter, serialised per company (scheduled and manual runs created at the same time).
      await m.query('SELECT id FROM companies WHERE id = ? FOR UPDATE', [companyId]);
      const prefix = `IMH-${year}-`;
      const [row] = await m.query('SELECT MAX(CAST(SUBSTRING(runNo, ?) AS UNSIGNED)) n FROM destruction_runs WHERE companyId = ? AND runNo LIKE ?', [prefix.length + 1, companyId, `${prefix}%`]);
      const n = Number(row?.n || 0);
      return m.save(
        DestructionRunEntity,
        m.create(DestructionRunEntity, {
          companyId,
          runNo: `${prefix}${String(n + 1).padStart(4, '0')}`,
          trigger,
          status: 'PENDING_APPROVAL',
          asOfDate: today,
          candidates,
          summary: { awaitingApproval, items: candidates.length, records: candidates.reduce((s, x) => s + x.count, 0) },
          createdBy,
        }),
      );
    });
  }

  async runs() {
    return this.ds.manager.find(DestructionRunEntity, { where: { companyId: this.companyId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async run(id: string) {
    const r = await this.ds.manager.findOne(DestructionRunEntity, { where: { id, companyId: this.companyId } });
    if (!r) throw new NotFoundException(err('DESTRUCTION_RUN_NOT_FOUND'));
    return r;
  }

  async reject(id: string, reason: string, username: string, userId: string | null) {
    const r = await this.run(id);
    if (r.status !== 'PENDING_APPROVAL') throw new BadRequestException(err('DESTRUCTION_RUN_NOT_PENDING'));
    await this.ds.manager.update(DestructionRunEntity, { id: r.id }, { status: 'REJECTED', rejectReason: (reason || '').slice(0, 500) || null, decidedBy: username, decidedByUserId: userId, decidedAt: new Date() });
    return this.run(id);
  }

  /** Approval executes the run (REVIEW items stay listed only). */
  async approve(id: string, username: string, userId: string | null) {
    const r = await this.run(id);
    if (r.status !== 'PENDING_APPROVAL') throw new BadRequestException(err('DESTRUCTION_RUN_NOT_PENDING'));
    // Claim the run first (a concurrent approval finds it no longer pending).
    const claimed = await this.ds.manager.update(DestructionRunEntity, { id: r.id, status: 'PENDING_APPROVAL' }, { status: 'EXECUTING', decidedBy: username, decidedByUserId: userId, decidedAt: new Date() });
    if (!claimed.affected) throw new BadRequestException(err('DESTRUCTION_RUN_NOT_PENDING'));
    const ctx = { reason: '', runId: r.id, performedBy: username, performedByUserId: userId };
    const results: Record<string, number> = {};
    const today = r.asOfDate;
    const pol = await this.policies();
    try {
      for (const cand of r.candidates) {
        if (cand.action === 'REVIEW') continue;
        const p = pol.find((x) => x.dataCategory === cand.dataCategory);
        if (!p) continue;
        const cut = this.cutoff(today, p);
        const reason = cand.reason;
        let n = 0;
        if (cand.entityType === 'customers' && cand.entityId) {
          const res = await this.erasure.eraseCustomer(cand.entityId, { ...ctx, reason, retentionEnded: cand.dataCategory === 'CUSTOMER_IDENTITY' });
          n = res.mode === 'FULL' ? 1 : 0;
        } else {
          n = await this.ds.transaction((m) => this.executeBulk(m, cand.dataCategory, cut, today, { ...ctx, reason }));
        }
        results[cand.dataCategory] = (results[cand.dataCategory] || 0) + n;
      }
    } catch (e) {
      await this.ds.manager.update(DestructionRunEntity, { id: r.id }, { status: 'FAILED', summary: { ...(r.summary || {}), executed: results, error: (e as Error).message?.slice(0, 300) } });
      throw e;
    }
    await this.ds.manager.update(DestructionRunEntity, { id: r.id }, { status: 'EXECUTED', executedAt: new Date(), summary: { ...(r.summary || {}), executed: results } });
    return this.run(id);
  }

  private async log(m: EntityManager, ctx: { runId: string; performedBy: string; performedByUserId: string | null; reason: string }, row: Partial<DestructionLogEntity>) {
    const now = new Date();
    await m.insert(DestructionLogEntity, {
      companyId: this.companyId, runId: ctx.runId, performedBy: ctx.performedBy, performedByUserId: ctx.performedByUserId, performedAt: now,
      retainUntil: addPeriod(todayKey('Europe/Istanbul', now), 3, 'YEAR'), reason: ctx.reason, result: 'DONE', ...row,
    } as DestructionLogEntity);
  }

  private async executeBulk(m: EntityManager, category: string, cut: string, today: string, ctx: { runId: string; performedBy: string; performedByUserId: string | null; reason: string }): Promise<number> {
    const cid = this.companyId;
    let n = 0;
    switch (category) {
      case 'AUDIT_LOGS':
      case 'LOGIN_ATTEMPTS': {
        const where = category === 'AUDIT_LOGS' ? "entityType <> 'auth' AND maskedAt IS NULL AND DATE(createdAt) < ?" : "entityType = 'auth' AND maskedAt IS NULL AND DATE(createdAt) < ?";
        n = await this.erasure.maskAuditRows(m, where, [cut], PERSONAL_KEYS, () => '[ANONIMLESTIRILDI]', true);
        if (n) await this.log(m, ctx, { dataCategory: category, entityType: 'audit_logs', recordCount: n, method: 'ANONYMIZATION' });
        break;
      }
      case 'WEBHOOK_DELIVERIES': {
        const r = await m.query('DELETE FROM webhook_deliveries WHERE companyId = ? AND DATE(createdAt) < ?', [cid, cut]);
        n = r?.affectedRows ?? 0;
        if (n) await this.log(m, ctx, { dataCategory: category, entityType: 'webhook_deliveries', recordCount: n, method: 'DELETION' });
        break;
      }
      case 'USER_SESSIONS': {
        const r = await m.query('DELETE FROM user_sessions WHERE companyId = ? AND DATE(COALESCE(revokedAt, expiresAt)) < ?', [cid, cut]);
        n = r?.affectedRows ?? 0;
        if (n) await this.log(m, ctx, { dataCategory: category, entityType: 'user_sessions', recordCount: n, method: 'DELETION' });
        break;
      }
      case 'CONSENTS': {
        const r = await m.query('DELETE FROM consents WHERE companyId = ? AND withdrawnAt IS NOT NULL AND DATE(withdrawnAt) < ?', [cid, cut]);
        n = r?.affectedRows ?? 0;
        if (n) await this.log(m, ctx, { dataCategory: category, entityType: 'consents', recordCount: n, method: 'DELETION' });
        break;
      }
      case 'DSR_REQUESTS': {
        const r = await m.query("UPDATE dsr_requests SET applicantName = '[anonim]', applicantContact = NULL, description = NULL WHERE companyId = ? AND respondedAt IS NOT NULL AND applicantName <> '[anonim]' AND DATE(respondedAt) < ?", [cid, cut]);
        n = r?.affectedRows ?? 0;
        if (n) await this.log(m, ctx, { dataCategory: category, entityType: 'dsr_requests', recordCount: n, method: 'ANONYMIZATION' });
        break;
      }
      case 'DESTRUCTION_LOGS': {
        const r = await m.query('DELETE FROM destruction_logs WHERE companyId = ? AND retainUntil < ?', [cid, today]);
        n = r?.affectedRows ?? 0;
        if (n) await this.log(m, ctx, { dataCategory: category, entityType: 'destruction_logs', recordCount: n, method: 'DELETION' });
        break;
      }
      default:
        break;
    }
    return n;
  }

  async logs(q: { from?: string; to?: string; category?: string } = {}) {
    const qb = this.ds.manager.createQueryBuilder(DestructionLogEntity, 'l').where('l.companyId = :cid', { cid: this.companyId });
    if (q.category) qb.andWhere('l.dataCategory = :cat', { cat: q.category });
    if (q.from) qb.andWhere('DATE(l.performedAt) >= :from', { from: q.from });
    if (q.to) qb.andWhere('DATE(l.performedAt) <= :to', { to: q.to });
    return qb.orderBy('l.performedAt', 'DESC').take(1000).getMany();
  }

  /** Last executed run and the next due date (at most every KVKK_PERIODIC_DESTRUCTION_MAX_MONTHS months). */
  async schedule(companyId = this.companyId) {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: companyId });
    const today = todayKey(c.timezone);
    const last = await this.ds.manager.findOne(DestructionRunEntity, { where: { companyId, status: 'EXECUTED' }, order: { executedAt: 'DESC' } });
    const maxMonths = Number((await this.legal.paramOrNull<number>('KVKK_PERIODIC_DESTRUCTION_MAX_MONTHS', today, c.country || 'TR')) ?? 6);
    const pending = await this.ds.manager.count(DestructionRunEntity, { where: { companyId, status: In(['PENDING_APPROVAL']) } });
    const lastDay = last?.executedAt ? todayKey(c.timezone, new Date(last.executedAt)) : null;
    return { lastExecutedAt: last?.executedAt ?? null, lastRunNo: last?.runNo ?? null, maxMonths, pendingRuns: pending, ...nextDestructionDue(lastDay, maxMonths, today) };
  }

  /** Monthly (1st, 03:00): a candidate list per active company for the administrators to approve. */
  @Cron('0 3 1 * *')
  async monthlyCandidates(): Promise<number> {
    if (process.env.JEST_WORKER_ID) return 0;
    const companies = await this.ds.manager.find(CompanyEntity, { where: { status: 'ACTIVE' }, select: ['id'] });
    let created = 0;
    for (const c of companies) {
      try {
        const open = await this.ds.manager.count(DestructionRunEntity, { where: { companyId: c.id, status: 'PENDING_APPROVAL' } });
        if (open) continue;
        const run = await this.tenant.run(c.id, () => this.createRun('SCHEDULED', 'system', c.id));
        this.gateway.emitToCompanyAdmins(c.id, 'kvkk_destruction_pending', { runNo: run.runNo, items: run.candidates.length });
        created++;
      } catch (e) {
        this.logger.warn(`periodic destruction ${c.id}: ${(e as Error).message}`);
      }
    }
    return created;
  }
}
