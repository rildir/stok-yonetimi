import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual } from 'typeorm';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { SecurityIncidentEntity } from '../../entities/kvkk.entity';
import { AppGateway } from '../../app.gateway';

/**
 * Breach alarms (R63): suspicious patterns open a SUSPECTED security incident for the company's
 * administrators to assess. The 72-hour clock (KVKK md. 12/5) starts only when an administrator
 * confirms the incident as a personal-data breach (awareAt). Thresholds are operational settings
 * (environment), not legal values:
 *  - KVKK_ALERT_LOGIN_FAILED: failed sign-ins of the company within 15 minutes (default 10);
 *  - KVKK_ALERT_EXPORT_ROWS: rows of personal data in one CSV export (default 500);
 *  - KVKK_ALERT_API_READS: API-key reads of personal-data resources within 10 minutes (default 200).
 * One open alert per company and source at a time.
 */
const num = (k: string, d: number) => (Number(process.env[k]) > 0 ? Number(process.env[k]) : d);
export const alertThresholds = () => ({
  loginFailed: num('KVKK_ALERT_LOGIN_FAILED', 10),
  loginWindowMin: 15,
  exportRows: num('KVKK_ALERT_EXPORT_ROWS', 500),
  apiReads: num('KVKK_ALERT_API_READS', 200),
  apiWindowMin: 10,
});

@Injectable()
export class SecurityAlertService {
  private readonly logger = new Logger(SecurityAlertService.name);
  private readonly apiReads = new Map<string, number[]>();

  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly gateway: AppGateway) {}

  /** After a failed sign-in of a known company. Never throws. */
  async onLoginFailed(companyId: string | null): Promise<void> {
    if (!companyId) return;
    try {
      const t = alertThresholds();
      const since = new Date(Date.now() - t.loginWindowMin * 60000);
      const n = await this.ds.manager.count(AuditLogEntity, { where: { companyId, action: 'login_failed', createdAt: MoreThanOrEqual(since) } });
      if (n >= t.loginFailed) {
        await this.raise(companyId, 'ALERT_LOGIN_FAILED', 'HIGH', `Art arda başarısız giriş denemesi (${n} deneme / ${t.loginWindowMin} dk)`, { failedLogins: n, windowMinutes: t.loginWindowMin }, ['İşlem Güvenliği']);
      }
    } catch (e) {
      this.logger.warn(`login alert: ${(e as Error).message}`);
    }
  }

  /** After a CSV export with personal data. */
  async onExport(companyId: string, resource: string, rows: number, username: string | null): Promise<void> {
    try {
      const t = alertThresholds();
      if (rows >= t.exportRows) {
        await this.raise(companyId, 'ALERT_BULK_EXPORT', 'MEDIUM', `Olağandışı büyük dışa aktarım: ${resource} (${rows} satır)`, { resource, rows, username }, ['Kimlik', 'İletişim']);
      }
    } catch (e) {
      this.logger.warn(`export alert: ${(e as Error).message}`);
    }
  }

  /** Every API-key request on a personal-data resource (customers, orders, export). In-memory sliding window. */
  onApiKeyRead(companyId: string, apiKeyId: string, resource: string | null): void {
    if (!resource || !['customers', 'orders', 'export'].includes(resource)) return;
    const t = alertThresholds();
    const now = Date.now();
    const from = now - t.apiWindowMin * 60000;
    const list = (this.apiReads.get(apiKeyId) || []).filter((x) => x >= from);
    list.push(now);
    this.apiReads.set(apiKeyId, list);
    if (list.length === t.apiReads) {
      void this.raise(companyId, 'ALERT_API_BULK_READ', 'MEDIUM', `API anahtarı ile toplu okuma (${list.length} istek / ${t.apiWindowMin} dk)`, { apiKeyId, requests: list.length, windowMinutes: t.apiWindowMin }, ['Kimlik', 'İletişim', 'Müşteri İşlem']).catch(() => undefined);
    }
  }

  private async raise(companyId: string, source: string, severity: string, title: string, evidence: Record<string, unknown>, categories: string[]): Promise<void> {
    await this.ds.transaction(async (m) => {
      const open = await m.findOne(SecurityIncidentEntity, { where: { companyId, source, status: 'SUSPECTED' }, lock: { mode: 'pessimistic_write' } });
      if (open) return;
      const year = new Date().getUTCFullYear();
      const count = await m.count(SecurityIncidentEntity, { where: { companyId } });
      const incident = await m.save(
        SecurityIncidentEntity,
        m.create(SecurityIncidentEntity, {
          companyId,
          incidentNo: `IHL-${year}-${String(count + 1).padStart(4, '0')}`,
          title,
          source,
          severity,
          status: 'SUSPECTED',
          detectedAt: new Date(),
          dataCategories: categories,
          evidence,
          createdBy: 'system',
        }),
      );
      this.gateway.emitToCompanyAdmins(companyId, 'kvkk_alert', { id: incident.id, incidentNo: incident.incidentNo, source, title });
    });
  }
}
