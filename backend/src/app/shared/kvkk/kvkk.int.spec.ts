import 'reflect-metadata';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../../../data-source';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { OrderEntity } from '../../entities/order.entity';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { ConsentEntity, DestructionLogEntity, DsrRequestEntity, RetentionPolicyEntity, SecurityIncidentEntity } from '../../entities/kvkk.entity';
import { TenantContext } from '../tenant/tenant-context.service';
import { ensureAuditTriggers, dropAuditTriggers } from './audit-chain';
import { ensureDocumentTriggers } from '../documents/document-triggers';
import { RETENTION_DEFAULTS } from './retention';
import { ErasureService } from '../../modules/kvkk/erasure.service';
import { RetentionService } from '../../modules/kvkk/retention.service';
import { DsrService } from '../../modules/kvkk/dsr.service';
import { ConsentService } from '../../modules/kvkk/consent.service';
import { IncidentService } from '../../modules/kvkk/incident.service';
import { AuditChainService } from '../../modules/kvkk/audit-chain.service';
import { triggerErrorCode } from '../i18n/i18n-exception.filter';
import { anonymousCustomerName } from './anonymizer';
import { UserEntity } from '../../entities/user.entity';
import { UserService } from '../../modules/user/user.service';
import { StockHelperService } from '../services/stock-helper.service';
import { totp } from './totp';

/**
 * WP7 database tests (MySQL, throw-away schema DB_TEST_DATABASE_WP7, default `stok_wp7_itest`):
 * irreversible anonymisation incl. the audit trail, legal retention keeps invoices (partial
 * erasure), DSR deadline / identity rule, append-only hash-chained audit log, periodic destruction
 * with destruction records and tenant isolation of the new tables. Skipped without MySQL.
 */
const TEST_DB = process.env.DB_TEST_DATABASE_WP7 || 'stok_wp7_itest';
// The suite runs next to the other MySQL suites (parallel schema builds): generous timeouts.
jest.setTimeout(180000);

function envFromFile(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [path.resolve(__dirname, '../../../../../.env'), path.resolve(process.cwd(), '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}
const fileEnv = envFromFile();
const env = (k: string, d: string) => process.env[k] ?? fileEnv[k] ?? d;
const conn = { host: env('DB_HOST', '127.0.0.1'), port: Number(env('DB_PORT', '3306')), username: env('DB_USERNAME', 'root'), password: env('DB_PASSWORD', '') };

let ds: DataSource | null = null;
let available = false;

beforeAll(async () => {
  try {
    const admin = new DataSource({ type: 'mysql', ...conn, connectTimeout: 3000 });
    await admin.initialize();
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    await admin.destroy();
    ds = new DataSource({ type: 'mysql', ...conn, database: TEST_DB, entities: AppDataSource.options.entities, synchronize: true, dropSchema: true, timezone: 'Z', dateStrings: ['DATE'] });
    await ds.initialize();
    await ensureAuditTriggers((sql, params) => ds!.query(sql, params));
    await ensureDocumentTriggers((sql, params) => ds!.query(sql, params));
    for (const d of RETENTION_DEFAULTS) await ds.manager.insert(RetentionPolicyEntity, { ...d, companyId: null });
    available = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`WP7 DB tests skipped (no MySQL): ${(e as Error).message}`);
  }
}, 300000);

afterAll(async () => {
  if (ds?.isInitialized) {
    await dropAuditTriggers((sql) => ds!.query(sql));
    await ds.destroy();
  }
});

const tenant = new TenantContext();
const webhooks: any = { emitMany: jest.fn(async () => undefined) };
const gateway: any = { emitToCompany: jest.fn(), emitToCompanyAdmins: jest.fn() };
const legal: any = { paramOrNull: async (key: string) => ({ KVKK_DSR_RESPONSE_DAYS: 30, KVKK_BREACH_NOTIFY_HOURS: 72, KVKK_PERIODIC_DESTRUCTION_MAX_MONTHS: 6 })[key] ?? null };
const services = () => {
  const erasure = new ErasureService(ds!, tenant, webhooks, gateway);
  return {
    erasure,
    retention: new RetentionService(ds!, tenant, erasure, legal, gateway),
    dsr: new DsrService(ds!, tenant, legal, erasure, gateway),
    consents: new ConsentService(ds!, tenant),
    incidents: new IncidentService(ds!, tenant, legal),
    chain: new AuditChainService(ds!),
  };
};

async function company(m: EntityManager, slug: string) {
  return m.save(CompanyEntity, m.create(CompanyEntity, { name: `IT ${slug}`, slug: `it7-${slug}-${Date.now()}-${Math.round(Math.random() * 1e6)}`, country: 'TR', baseCurrency: 'TRY', timezone: 'Europe/Istanbul', bookkeepingType: 'BILANCO' }));
}

async function customer(m: EntityManager, companyId: string, name: string, extra: Partial<CustomerEntity> = {}) {
  return m.save(CustomerEntity, m.create(CustomerEntity, {
    companyId, name, type: 'individual', identityType: 'TCKN', identityNumber: '10000000146', email: `${name.split(' ')[0].toLowerCase()}@ornekposta.com.tr`, phone: '+90 532 418 27 63',
    notes: 'Kapıda ödeme', isVatTaxpayer: false, isDesignatedBuyer: false, needsReview: false, address: { line1: 'Moda Cad. No: 12', provinceCode: '34', province: 'İstanbul', district: 'Kadıköy', country: 'TR' } as any, ...extra,
  }));
}

async function auditRow(m: EntityManager, companyId: string, entityType: string, entityId: string, after: Record<string, unknown>) {
  await m.insert(AuditLogEntity, { companyId, action: 'update', entityType, entityId, username: 'admin', after: after as any, before: null, ip: '10.0.0.5', userAgent: 'jest' });
}

const skip = () => !available;

describe('WP7 KVKK (MySQL)', () => {
  it('anonymisation is irreversible and masks the audit trail and orders; the hash chain still verifies', async () => {
    if (skip()) return;
    const { erasure, chain } = services();
    const m = ds!.manager;
    const co = await company(m, 'anon');
    const c = await customer(m, co.id, 'Selin Aydın');
    const order = await m.save(OrderEntity, m.create(OrderEntity, { companyId: co.id, orderNumber: `ORD-${Date.now()}`, customerId: c.id, customerName: 'Selin Aydın', status: 'Pending', date: new Date() } as any));
    await auditRow(m, co.id, 'customers', c.id, { name: 'Selin Aydın', email: 'selin@ornekposta.com.tr', phone: '+90 532 418 27 63' });
    await auditRow(m, co.id, 'orders', order.id, { customerName: 'Selin Aydın', status: 'Pending' });
    await m.insert(ConsentEntity, { companyId: co.id, subjectType: 'CUSTOMER', subjectId: c.id, purposeCode: 'MARKETING_EMAIL', channel: 'WEB', givenAt: new Date() });
    await chain.seal();

    // Orders are kept 10 years (TTK 82): the erasure is partial while they are in retention ...
    const p = await tenant.run(co.id, () => erasure.eraseCustomer(c.id, { reason: 'test', performedBy: 'admin' }));
    expect(p.mode).toBe('PARTIAL');
    expect(p.retained.map((g) => g.type)).toEqual(['orders']);
    expect(p.maskedOrders).toBe(0);
    // ... and full once the retention has ended (periodic destruction).
    const r = await tenant.run(co.id, () => erasure.eraseCustomer(c.id, { reason: 'test', performedBy: 'admin', retentionEnded: true }));
    expect(r.mode).toBe('FULL');
    expect(r.maskedAuditRows).toBeGreaterThanOrEqual(2);
    expect(r.maskedOrders).toBe(1);
    expect(p.withdrawnConsents).toBe(1);

    const row = (await ds!.query('SELECT * FROM customers WHERE id = ?', [c.id]))[0];
    expect(row.name).toBe(anonymousCustomerName(c.id));
    expect(row.identityNumber).toBeNull();
    expect(row.identityNumberHash).toBeNull();
    expect(row.email).toBeNull();
    expect(row.addressLine1).toBeNull();
    expect(row.anonymizedAt).not.toBeNull();
    // Irreversible: the original values are nowhere in the tenant's rows any more.
    const leaks = await ds!.query(
      "SELECT (SELECT COUNT(*) FROM customers WHERE companyId = ? AND (name LIKE '%Selin%' OR email LIKE '%selin%' OR phone IS NOT NULL)) + " +
        "(SELECT COUNT(*) FROM orders WHERE companyId = ? AND customerName LIKE '%Selin%') + " +
        "(SELECT COUNT(*) FROM audit_logs WHERE companyId = ? AND (CAST(`before` AS CHAR) LIKE '%Selin%' OR CAST(`after` AS CHAR) LIKE '%Selin%' OR CAST(`after` AS CHAR) LIKE '%+90 532%')) n",
      [co.id, co.id, co.id],
    );
    expect(Number(leaks[0].n)).toBe(0);
    const masked = await ds!.query('SELECT COUNT(*) n FROM audit_logs WHERE companyId = ? AND maskedAt IS NOT NULL', [co.id]);
    expect(Number(masked[0].n)).toBeGreaterThanOrEqual(2);
    expect(await m.count(DestructionLogEntity, { where: { companyId: co.id, entityId: c.id } })).toBeGreaterThanOrEqual(1);
    expect(webhooks.emitMany).toHaveBeenCalledWith([expect.objectContaining({ event: 'customer.erased', data: expect.not.objectContaining({ name: expect.anything() }) })], expect.anything());
    // every masking is a chained, visible event
    const events = await ds!.query("SELECT COUNT(*) n FROM audit_logs WHERE companyId = ? AND action = 'kvkk.audit_mask'", [co.id]);
    expect(Number(events[0].n)).toBeGreaterThanOrEqual(2);

    const v = await chain.verify(co.id);
    expect(v.ok).toBe(true);
    expect(v.maskedRows).toBeGreaterThanOrEqual(2);
    expect(v.tampered).toEqual([]);
  });

  it('an invoice in legal retention is never deleted: the erasure is partial with a reasoned restriction', async () => {
    if (skip()) return;
    const { dsr } = services();
    const m = ds!.manager;
    const co = await company(m, 'partial');
    const c = await customer(m, co.id, 'Murat Öztürk');
    const invoiceId = randomUUID();
    await ds!.query(
      "INSERT INTO invoices (id, companyId, ettn, profileId, status, customerId, issueDate, documentNo, buyerSnapshot) VALUES (?, ?, ?, 'EARSIVFATURA', 'ISSUED', ?, '2026-03-14', 'DMO2026000000001', ?)",
      [invoiceId, co.id, randomUUID(), c.id, JSON.stringify({ name: 'Murat Öztürk', taxIdType: 'TCKN', taxId: '10000000146' })],
    );
    const req = await tenant.run(co.id, () => dsr.create({ subjectType: 'CUSTOMER', subjectId: c.id, applicantName: 'Murat Öztürk', requestType: 'ERASURE', channel: 'KEP', receivedAt: '2026-10-01T09:00:00Z' }, 'admin'));
    expect(new Date(req.dueAt).toISOString().slice(0, 10)).toBe('2026-10-31');
    await expect(tenant.run(co.id, () => dsr.erase(req.id, 'admin', null))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DSR_IDENTITY_NOT_VERIFIED' }) });
    await tenant.run(co.id, () => dsr.verifyIdentity(req.id, 'KEP ile güvenli e-imzalı başvuru', 'admin'));
    const out = await tenant.run(co.id, () => dsr.erase(req.id, 'admin', null));
    expect(out.result.mode).toBe('PARTIAL');
    expect(out.result.restrictedUntil).toBe('2036-12-31');
    expect(out.result.retained).toEqual([expect.objectContaining({ type: 'invoices', count: 1, retentionUntil: '2036-12-31' })]);
    expect(out.request.status).toBe('PARTIALLY_COMPLETED');
    expect(out.responseText).toContain('2036-12-31');
    expect((out.request.outcome as any).restrictionCode).toBe('ERASURE_RESTRICTED_BY_RETENTION');

    const inv = (await ds!.query('SELECT buyerSnapshot, status FROM invoices WHERE id = ?', [invoiceId]))[0];
    const snap = typeof inv.buyerSnapshot === 'string' ? JSON.parse(inv.buyerSnapshot) : inv.buyerSnapshot;
    expect(snap.name).toBe('Murat Öztürk');
    expect(inv.status).toBe('ISSUED');
    await expect(ds!.query('DELETE FROM invoices WHERE id = ?', [invoiceId])).rejects.toBeTruthy();

    const cu = await m.findOneByOrFail(CustomerEntity, { id: c.id });
    expect(cu.name).toBe('Murat Öztürk');
    expect(cu.identityNumber).toBe('10000000146');
    expect(cu.email).toBeNull();
    expect(cu.processingRestricted).toBe(true);
    expect(cu.erasureRestrictedUntil).toBe('2036-12-31');
    const log = await m.findOneByOrFail(DestructionLogEntity, { companyId: co.id, entityId: c.id, dataCategory: 'CUSTOMER_IDENTITY' });
    expect(log.result).toBe('RESTRICTED');
    expect(log.restrictedUntil).toBe('2036-12-31');
  });

  it('audit log is append-only: content updates and deletes are refused; tampering is detected', async () => {
    if (skip()) return;
    const { chain } = services();
    const m = ds!.manager;
    const co = await company(m, 'chain');
    for (let i = 0; i < 5; i++) await auditRow(m, co.id, 'products', `p-${i}`, { price: i });
    await chain.seal();
    expect((await chain.verify(co.id)).ok).toBe(true);
    const [first] = await ds!.query('SELECT id FROM audit_logs WHERE companyId = ? ORDER BY chainSeq LIMIT 1', [co.id]);
    let code: string | null = null;
    try {
      await ds!.query("UPDATE audit_logs SET action = 'delete' WHERE id = ?", [first.id]);
    } catch (e) {
      code = triggerErrorCode(e);
    }
    expect(code).toBe('AUDIT_LOG_IMMUTABLE');
    await expect(ds!.query('DELETE FROM audit_logs WHERE id = ?', [first.id])).rejects.toBeTruthy();
    // masking only with the KVKK session flag
    await expect(ds!.query('UPDATE audit_logs SET username = NULL, maskedAt = UTC_TIMESTAMP() WHERE id = ?', [first.id])).rejects.toBeTruthy();
    // the masking flag does not allow a silent rewrite: keys must stay, actor columns only cleared ...
    // session variable: one connection
    const qr = ds!.createQueryRunner();
    await qr.connect();
    const flagged = async (sql: string, id: string = first.id) => {
      await qr.query('SET @kvkk_erasure = 1');
      try {
        await qr.query(sql, [id]);
      } finally {
        await qr.query('SET @kvkk_erasure = NULL');
      }
    };
    await expect(flagged("UPDATE audit_logs SET `after` = JSON_OBJECT('other', 1), maskedAt = UTC_TIMESTAMP() WHERE id = ?")).rejects.toBeTruthy();
    await expect(flagged("UPDATE audit_logs SET username = 'mallory', maskedAt = UTC_TIMESTAMP() WHERE id = ?")).rejects.toBeTruthy();
    // ... and a value rewrite under the flag without a chained kvkk.audit_mask event is reported as tampered
    const [second] = await ds!.query('SELECT id FROM audit_logs WHERE companyId = ? ORDER BY chainSeq LIMIT 1 OFFSET 1', [co.id]);
    await flagged("UPDATE audit_logs SET `after` = JSON_OBJECT('price', 1234), maskedAt = UTC_TIMESTAMP() WHERE id = ?", second.id);
    await qr.release();
    const silent = await chain.verify(co.id);
    expect(silent.ok).toBe(false);
    expect(silent.tampered).toContain(second.id);
    // simulate a privileged tamper (triggers dropped): the verifier finds the changed row
    await ds!.query('DROP TRIGGER trg_audit_logs_append_only');
    await ds!.query("UPDATE audit_logs SET `after` = JSON_OBJECT('price', 999) WHERE id = ?", [first.id]);
    await ensureAuditTriggers((sql, params) => ds!.query(sql, params));
    const v = await chain.verify(co.id);
    expect(v.ok).toBe(false);
    expect(v.tampered).toContain(first.id);
  });

  it('periodic destruction: candidates -> approval -> anonymisation + destruction records (3 years)', async () => {
    if (skip()) return;
    const { retention } = services();
    const m = ds!.manager;
    const co = await company(m, 'destroy');
    const old = await customer(m, co.id, 'Eski Müşteri', { isDeleted: true, deletedAt: new Date(Date.now() - 45 * 86400000) });
    await customer(m, co.id, 'Yeni Silinen', { isDeleted: true, deletedAt: new Date(Date.now() - 5 * 86400000) });
    const run = await tenant.run(co.id, () => retention.createRun('MANUAL', 'admin'));
    expect(run.status).toBe('PENDING_APPROVAL');
    const ids = run.candidates.filter((x) => x.dataCategory === 'CUSTOMER_INACTIVE').map((x) => x.entityId);
    expect(ids).toEqual([old.id]);
    expect((run.summary as any).awaitingApproval).toContain('AUDIT_LOGS');
    const done = await tenant.run(co.id, () => retention.approve(run.id, 'admin', null));
    expect(done.status).toBe('EXECUTED');
    expect((await m.findOneByOrFail(CustomerEntity, { id: old.id })).anonymizedAt).toBeTruthy();
    const logs = await tenant.run(co.id, () => retention.logs());
    expect(logs.length).toBeGreaterThan(0);
    const until = new Date();
    until.setUTCFullYear(until.getUTCFullYear() + 3);
    expect(logs[0].retainUntil.slice(0, 4)).toBe(String(until.getUTCFullYear()));
    await expect(ds!.query('DELETE FROM destruction_logs WHERE id = ?', [logs[0].id])).rejects.toBeTruthy();
    await expect(tenant.run(co.id, () => retention.approve(run.id, 'admin', null))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DESTRUCTION_RUN_NOT_PENDING' }) });
  });

  it('tenant isolation of the KVKK tables', async () => {
    if (skip()) return;
    const { dsr, consents, incidents, retention } = services();
    const m = ds!.manager;
    const a = await company(m, 'iso-a');
    const b = await company(m, 'iso-b');
    const ca = await customer(m, a.id, 'Ayşe Kaya');
    const reqA = await tenant.run(a.id, () => dsr.create({ subjectType: 'CUSTOMER', subjectId: ca.id, applicantName: 'Ayşe Kaya', requestType: 'ACCESS', channel: 'WRITTEN' }, 'admin'));
    await tenant.run(a.id, () => consents.give({ subjectType: 'CUSTOMER', subjectId: ca.id, purposeCode: 'MARKETING_SMS', channel: 'WEB' }, 'admin'));
    const incA = await tenant.run(a.id, () => incidents.create({ title: 'Test', awareAt: new Date().toISOString() }, 'admin'));
    expect(incA.status).toBe('CONFIRMED');
    expect(incA.hoursLeft).toBeGreaterThanOrEqual(71);
    await tenant.run(a.id, () => retention.createRun('MANUAL', 'admin'));

    expect(await tenant.run(b.id, () => dsr.list())).toEqual([]);
    expect(await tenant.run(b.id, () => consents.list())).toEqual([]);
    expect(await tenant.run(b.id, () => incidents.list())).toEqual([]);
    expect(await tenant.run(b.id, () => retention.runs())).toEqual([]);
    await expect(tenant.run(b.id, () => dsr.get(reqA.id))).rejects.toMatchObject({ status: 404 });
    await expect(tenant.run(b.id, () => incidents.get(incA.id))).rejects.toMatchObject({ status: 404 });
    // B cannot attach a consent / request to A's customer
    await expect(tenant.run(b.id, () => consents.give({ subjectType: 'CUSTOMER', subjectId: ca.id, purposeCode: 'MARKETING_SMS', channel: 'WEB' }, 'x'))).rejects.toMatchObject({ status: 404 });
    await expect(tenant.run(b.id, () => dsr.create({ subjectType: 'CUSTOMER', subjectId: ca.id, applicantName: 'X', requestType: 'ACCESS', channel: 'WRITTEN' }, 'x'))).rejects.toMatchObject({ status: 404 });
    // consent for invoicing is refused (legal basis is the contract)
    await expect(tenant.run(a.id, () => consents.give({ subjectType: 'CUSTOMER', subjectId: ca.id, purposeCode: 'INVOICING', channel: 'WEB' }, 'x'))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CONSENT_NOT_REQUIRED' }) });
    expect(await m.count(DsrRequestEntity, { where: { companyId: b.id } })).toBe(0);
    expect(await m.count(SecurityIncidentEntity, { where: { companyId: b.id } })).toBe(0);
  });

  it('TOTP flow: enrolment with the first code, no replay of a used code, single-use recovery codes, secrets encrypted at rest', async () => {
    if (skip()) return;
    const m = ds!.manager;
    const co = await company(m, 'totp');
    const helper = new StockHelperService();
    const sessions: any = { revokeAll: jest.fn(async () => undefined) };
    const users = new UserService(tenant, m.getRepository(UserEntity), helper, gateway, sessions);
    const username = `totp-${Date.now()}`;
    await m.save(UserEntity, m.create(UserEntity, { companyId: co.id, username, password: helper.hashPassword('Guclu-Parola-2026'), role: 'admin', fullName: 'TOTP Admin', tokenVersion: 0 }));
    const setup = await users.totpSetup(username);
    expect(setup.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    await expect(users.totpEnable(username, '000000')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TOTP_INVALID' }) });
    const { recoveryCodes } = await users.totpEnable(username, totp(setup.secret, Date.now() - 30000));
    expect(recoveryCodes).toHaveLength(10);
    const raw = (await ds!.query('SELECT totpSecret, totpRecoveryCodes FROM users WHERE username = ?', [username]))[0];
    expect(String(raw.totpSecret).startsWith('enc:v1:')).toBe(true);
    expect(JSON.stringify(raw.totpRecoveryCodes)).not.toContain(recoveryCodes[0]);
    const user = (await users.getUserByUsername(username))!;
    const code = totp(setup.secret);
    expect(await users.verifySecondFactor(user, code)).toBe(true);
    expect(await users.verifySecondFactor(user, code)).toBe(false); // replay
    expect(await users.verifySecondFactor(user, recoveryCodes[3])).toBe(true);
    expect(await users.verifySecondFactor(user, recoveryCodes[3])).toBe(false); // consumed
    expect(await users.verifySecondFactor(user, '123456')).toBe(false);
  });

  it('DSR deadline: 30 days from receipt; administrators are reminded once a day within the last 7 days', async () => {
    if (skip()) return;
    const { dsr } = services();
    const m = ds!.manager;
    const co = await company(m, 'remind');
    const received = new Date(Date.now() - 25 * 86400000 - 3600000); // 4 days 23 h left (DATETIME rounds to seconds)
    const soon = await tenant.run(co.id, () => dsr.create({ subjectType: 'OTHER', applicantName: 'Başvuran', requestType: 'INFO', channel: 'KEP', receivedAt: received.toISOString() }, 'admin'));
    const later = await tenant.run(co.id, () => dsr.create({ subjectType: 'OTHER', applicantName: 'Yeni Başvuran', requestType: 'INFO', channel: 'WRITTEN' }, 'admin'));
    expect(new Date(soon.dueAt).getTime() - received.getTime()).toBe(30 * 86400000);
    expect(soon.daysLeft).toBe(5);
    expect(later.daysLeft).toBe(30);
    gateway.emitToCompanyAdmins.mockClear();
    await dsr.remind();
    const calls = gateway.emitToCompanyAdmins.mock.calls.filter((c: any[]) => c[0] === co.id);
    expect(calls).toEqual([[co.id, 'kvkk_dsr_due', expect.objectContaining({ requestNo: soon.requestNo, daysLeft: 5, overdue: false })]]);
    gateway.emitToCompanyAdmins.mockClear();
    await dsr.remind();
    expect(gateway.emitToCompanyAdmins.mock.calls.filter((c: any[]) => c[0] === co.id)).toEqual([]);
  });
});
