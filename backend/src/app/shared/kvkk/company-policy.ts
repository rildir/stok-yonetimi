import { DataSource } from 'typeorm';
import { CompanyEntity } from '../../entities/company.entity';

/**
 * Per-request company policy used by AuthGuard (closed tenant, administrator 2FA), cached for a few
 * seconds so the guard does not hit the database on every call. Writers invalidate the entry.
 */
export interface CompanyPolicy {
  status: string;
  adminTotpRequired: boolean;
  adminTotpGraceUntil: Date | null;
  retentionUntil: string | null;
}

const TTL_MS = 10_000;
const cache = new Map<string, { at: number; policy: CompanyPolicy }>();

export async function companyPolicy(ds: DataSource, companyId: string): Promise<CompanyPolicy> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.policy;
  const c = await ds.manager.findOne(CompanyEntity, {
    where: { id: companyId },
    select: { id: true, status: true, adminTotpRequired: true, adminTotpGraceUntil: true, retentionUntil: true },
  });
  const policy: CompanyPolicy = {
    status: c?.status || 'ACTIVE',
    adminTotpRequired: c?.adminTotpRequired ?? true,
    adminTotpGraceUntil: c?.adminTotpGraceUntil ?? null,
    retentionUntil: c?.retentionUntil ?? null,
  };
  cache.set(companyId, { at: Date.now(), policy });
  return policy;
}

export function invalidateCompanyPolicy(companyId?: string): void {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

/** True when an administrator without 2FA must set it up now (grace period over). */
export function totpSetupBlocking(policy: CompanyPolicy, user: { role: string; totpEnabledAt?: Date | null }, now = new Date()): boolean {
  if (user.role !== 'admin' || !policy.adminTotpRequired || user.totpEnabledAt) return false;
  return !policy.adminTotpGraceUntil || new Date(policy.adminTotpGraceUntil).getTime() <= now.getTime();
}

/** Administrator without 2FA, still inside the grace period: the UI shows a reminder. */
export function totpSetupPending(policy: CompanyPolicy, user: { role: string; totpEnabledAt?: Date | null }): boolean {
  return user.role === 'admin' && policy.adminTotpRequired && !user.totpEnabledAt;
}
