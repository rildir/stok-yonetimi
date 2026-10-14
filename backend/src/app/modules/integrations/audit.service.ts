import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { redact } from '../../shared/integrations/audit-diff';

export interface AuditRecordInput {
  companyId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  username?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AuditQuery {
  username?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>,
    private readonly tenant: TenantContext,
  ) {}

  /** Explicit audit entry (login, settings, ...). Never throws: auditing must not break the request. */
  async record(input: AuditRecordInput): Promise<void> {
    const actor = this.tenant.actor;
    try {
      await this.repo.insert({
        companyId: input.companyId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        userId: input.userId ?? actor.userId ?? null,
        username: (input.username ?? actor.username ?? null)?.slice(0, 100) ?? null,
        apiKeyId: actor.apiKeyId ?? null,
        before: redact(input.before) as any,
        after: redact(input.after) as any,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
      });
    } catch {
      /* swallow */
    }
  }

  async list(q: AuditQuery) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const qb = this.repo.createQueryBuilder('a').where('a.companyId = :companyId', { companyId: this.tenant.companyId });
    if (q.username) qb.andWhere('a.username = :username', { username: q.username });
    if (q.entityType) qb.andWhere('a.entityType = :entityType', { entityType: q.entityType });
    if (q.entityId) qb.andWhere('a.entityId = :entityId', { entityId: q.entityId });
    if (q.action) qb.andWhere('a.action = :action', { action: q.action });
    if (q.from) qb.andWhere('a.createdAt >= :from', { from: `${q.from} 00:00:00` });
    if (q.to) qb.andWhere('a.createdAt <= :to', { to: `${q.to} 23:59:59.999` });
    const [items, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total, page, pageSize };
  }

  async meta() {
    const companyId = this.tenant.companyId;
    const distinct = async (col: string) =>
      (
        await this.repo
          .createQueryBuilder('a')
          .select(`DISTINCT a.${col}`, 'v')
          .where('a.companyId = :companyId', { companyId })
          .andWhere(new Brackets((b) => b.where(`a.${col} IS NOT NULL`)))
          .orderBy('v', 'ASC')
          .getRawMany()
      ).map((r) => r.v as string);
    return {
      entityTypes: await distinct('entityType'),
      actions: await distinct('action'),
      usernames: await distinct('username'),
    };
  }
}
