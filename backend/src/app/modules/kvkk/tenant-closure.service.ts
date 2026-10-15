import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Not } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { UserEntity } from '../../entities/user.entity';
import { DestructionLogEntity } from '../../entities/kvkk.entity';
import { decryptPii, isEncrypted } from '../../shared/kvkk/crypto';
import { addPeriod, legalRecordRetentionUntil } from '../../shared/kvkk/retention';
import { invalidateCompanyPolicy } from '../../shared/kvkk/company-policy';
import { todayKey } from '../../shared/tr';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AuditService } from '../integrations/audit.service';
import { ErasureService } from './erasure.service';

/** Columns never exported (credentials, secrets). */
const SECRET_COLUMN = /^(password|secret|secretHash|tokenHash|inviteTokenHash|totpSecret|totpPendingSecret|totpRecoveryCodes|credentials|encryptedCredentials|apiSecret)$/i;
const EXPORT_MAX_AGE_HOURS = 24;

/**
 * Tenant closure (R35 retention side, WP7): 1) full export (JSON per table, zip), 2) data that
 * needs no legal retention is deleted / anonymised (API keys, webhooks and their deliveries,
 * sessions, non-administrator accounts, customers without legal records), 3) the rest is frozen
 * read-only (AuthGuard: TENANT_UNDER_RETENTION) until retentionUntil = 31.12.(closing year + 10).
 */
@Injectable()
export class TenantClosureService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly stockHelper: StockHelperService,
    private readonly audit: AuditService,
    private readonly erasure: ErasureService,
  ) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  /** Every table with a companyId column (tenant data). */
  private async tenantTables(): Promise<string[]> {
    const rows: { t: string }[] = await this.ds.query(
      "SELECT TABLE_NAME t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'companyId' ORDER BY TABLE_NAME",
    );
    return rows.map((r) => r.t);
  }

  /** Full export: zip with one JSON file per table (+ the company row and a manifest). */
  async exportAll(): Promise<{ buffer: Buffer; fileName: string }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const manifest: Record<string, number> = {};
    const clean = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (SECRET_COLUMN.test(k)) continue;
        out[k] = isEncrypted(v) ? decryptPii(v as string) : v;
      }
      return out;
    };
    const company = await this.ds.query('SELECT * FROM companies WHERE id = ?', [this.companyId]);
    zip.addFile('companies.json', Buffer.from(JSON.stringify(company.map(clean), null, 2), 'utf8'));
    for (const t of await this.tenantTables()) {
      const rows: Record<string, unknown>[] = await this.ds.query(`SELECT * FROM \`${t}\` WHERE companyId = ?`, [this.companyId]);
      manifest[t] = rows.length;
      zip.addFile(`${t}.json`, Buffer.from(JSON.stringify(rows.map(clean), null, 2), 'utf8'));
    }
    const now = new Date();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ companyId: this.companyId, exportedAt: now.toISOString(), tables: manifest }, null, 2), 'utf8'));
    await this.ds.manager.update(CompanyEntity, { id: this.companyId }, { lastFullExportAt: now });
    await this.audit.record({ companyId: this.companyId, action: 'read_export', entityType: 'companies', entityId: this.companyId, after: { fullExport: true, tables: Object.keys(manifest).length } });
    return { buffer: zip.toBuffer(), fileName: `tam-disa-aktarim-${todayKey('Europe/Istanbul', now)}.zip` };
  }

  async close(input: { confirmSlug: string; password: string }, user: { sub: string; username: string }) {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    if (c.status === 'CLOSED') throw new BadRequestException(err('TENANT_ALREADY_CLOSED'));
    if ((input.confirmSlug || '').trim() !== c.slug) throw new BadRequestException(err('TENANT_CLOSE_CONFIRMATION_INVALID'));
    const admin = await this.ds.manager.findOneByOrFail(UserEntity, { id: user.sub });
    if (!(await this.stockHelper.verifyPassword(input.password || '', admin.password))) throw new BadRequestException(err('AUTH_WRONG_CURRENT_PASSWORD'));
    if (!c.lastFullExportAt || Date.now() - new Date(c.lastFullExportAt).getTime() > EXPORT_MAX_AGE_HOURS * 3600000) throw new BadRequestException(err('TENANT_EXPORT_REQUIRED'));

    const now = new Date();
    const today = todayKey(c.timezone, now);
    const ctx = { reason: 'Şirket hesabının kapatılması (yasal saklama gerektirmeyen veriler)', performedBy: user.username, performedByUserId: user.sub };
    // Customers: anonymised unless legal records keep them (partial erasure: restricted until retention ends).
    const customers: { id: string }[] = await this.ds.query('SELECT id FROM customers WHERE companyId = ? AND anonymizedAt IS NULL', [this.companyId]);
    let full = 0;
    let partial = 0;
    for (const cu of customers) {
      const r = await this.erasure.eraseCustomer(cu.id, ctx);
      if (r.mode === 'FULL') full++;
      else partial++;
    }
    const summary = await this.ds.transaction(async (m) => {
      const del = async (sql: string) => (await m.query(sql, [this.companyId]))?.affectedRows ?? 0;
      const deliveries = await del('DELETE FROM webhook_deliveries WHERE companyId = ?');
      const endpoints = await del('DELETE FROM webhook_endpoints WHERE companyId = ?');
      const keys = await del('DELETE FROM api_keys WHERE companyId = ?');
      const sessions = await del('DELETE FROM user_sessions WHERE companyId = ?');
      // Accounts other than administrators / auditors are removed (their audit entries keep the trail).
      const users = await m.find(UserEntity, { where: { companyId: this.companyId, role: Not(In(['admin', 'auditor'])) } });
      if (users.length) await m.delete(UserEntity, { id: In(users.map((u) => u.id)) });
      const retainUntil = addPeriod(today, 3, 'YEAR');
      const logs: [string, string, number, string][] = [
        ['WEBHOOK_DELIVERIES', 'webhook_deliveries', deliveries, 'DELETION'],
        ['INTEGRATIONS', 'webhook_endpoints', endpoints, 'DELETION'],
        ['INTEGRATIONS', 'api_keys', keys, 'DELETION'],
        ['USER_SESSIONS', 'user_sessions', sessions, 'DELETION'],
        ['USERS', 'users', users.length, 'DELETION'],
      ];
      for (const [cat, type, n, method] of logs) {
        if (!n) continue;
        await m.insert(DestructionLogEntity, { companyId: this.companyId, dataCategory: cat, entityType: type, recordCount: n, method, result: 'DONE', reason: ctx.reason, performedBy: user.username, performedByUserId: user.sub, performedAt: now, retainUntil } as DestructionLogEntity);
      }
      const retentionUntil = legalRecordRetentionUntil(today);
      await m.update(CompanyEntity, { id: this.companyId }, { status: 'CLOSED', closedAt: now, closedBy: user.username, retentionUntil });
      return { deliveries, endpoints, apiKeys: keys, sessions, users: users.length, retentionUntil };
    });
    invalidateCompanyPolicy(this.companyId);
    await this.audit.record({ companyId: this.companyId, action: 'tenant_closed', entityType: 'companies', entityId: this.companyId, after: { ...summary, customersAnonymized: full, customersRestricted: partial } });
    return { status: 'CLOSED', ...summary, customersAnonymized: full, customersRestricted: partial };
  }
}
