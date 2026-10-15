import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../guards/roles.guard';
import { REQUIRE_PERMISSION_KEY, SELF_SERVICE_KEY } from '../../guards/security.decorators';
import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, hotp, otpauthUrl, totp, verifyTotp } from './totp';
import { decryptPii, encryptPii, isEncrypted, piiHash } from './crypto';
import { maskCustomer, maskPersonalIdentifiers } from './masking';
import { apiKeyPermissions, effectivePermissions } from './permissions';
import { ANON_MARK, anonymousCustomerName, customerErasurePatch, customerReplacement, maskJson, PERSONAL_KEYS } from './anonymizer';
import { GENESIS_HASH, chainHash, verifyChain } from './audit-chain';
import { addPeriod, legalRecordRetentionUntil, nextDestructionDue, retentionUntil, violatesMinimum, RETENTION_DEFAULTS } from './retention';
import { addBusinessDays, sccNoticeStatus, validateTransfer } from './transfer';
import { stripPersonalData } from './data-catalog';
import { buildPrivacyNotice } from './notice-template';
import { detectSpecialCategoryData, isMaskedValue, kvkkDaysLeft, kvkkHoursLeft, maskEmail, maskIdentifier } from '../tr';
import { computeDiff, REDACTED } from '../integrations/audit-diff';
import { CustomerService } from '../../modules/customer/customer.service';
import { totpSetupBlocking } from './company-policy';
import { accessTokenTtlSeconds, assertSecurityConfig, dbSslOptions, sessionPolicy, SecurityConfigError } from '../security/security-config';

describe('WP7 TOTP (RFC 6238)', () => {
  // RFC 6238 Appendix B, SHA-1 secret "12345678901234567890"; 6-digit codes are the last 6 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  it('base32 round trip and the RFC secret', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString('ascii')).toBe('12345678901234567890');
  });
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('T=%s -> %s', (t, code) => {
    expect(totp(secret, t * 1000)).toBe(code);
  });
  it('HOTP RFC 4226 vector', () => {
    expect(hotp(Buffer.from('12345678901234567890'), 0)).toBe('755224');
  });
  it('verifies within one step, refuses other codes and malformed input', () => {
    const now = 1234567890 * 1000;
    expect(verifyTotp(secret, '005924', now)).toBe(Math.floor(1234567890 / 30));
    expect(verifyTotp(secret, totp(secret, now - 30000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 90000), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });
  it('recovery codes are single strings, hashed case-insensitively', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(hashRecoveryCode(codes[0].toLowerCase())).toBe(hashRecoveryCode(codes[0]));
    expect(otpauthUrl(secret, 'admin')).toContain('otpauth://totp/Ecelon%3Aadmin?secret=');
  });
  it('administrators are blocked only after the grace period', () => {
    const policy = { status: 'ACTIVE', adminTotpRequired: true, adminTotpGraceUntil: new Date(Date.now() + 86400000), retentionUntil: null };
    expect(totpSetupBlocking(policy, { role: 'admin', totpEnabledAt: null })).toBe(false);
    expect(totpSetupBlocking({ ...policy, adminTotpGraceUntil: new Date(Date.now() - 1000) }, { role: 'admin', totpEnabledAt: null })).toBe(true);
    expect(totpSetupBlocking({ ...policy, adminTotpGraceUntil: null }, { role: 'manager', totpEnabledAt: null })).toBe(false);
    expect(totpSetupBlocking({ ...policy, adminTotpGraceUntil: null }, { role: 'admin', totpEnabledAt: new Date() })).toBe(false);
  });
});

describe('WP7 field encryption (AES-256-GCM + HMAC blind index)', () => {
  it('encrypts, decrypts, is deterministic per value and leaves legacy clear text readable', () => {
    const a = encryptPii('10000000146')!;
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain('10000000146');
    expect(decryptPii(a)).toBe('10000000146');
    expect(encryptPii('10000000146')).toBe(a);
    expect(encryptPii('10000000078')).not.toBe(a);
    expect(decryptPii('12345678901')).toBe('12345678901');
    expect(encryptPii(null)).toBeNull();
  });
  it('detects tampering of the ciphertext (GCM tag)', () => {
    const a = encryptPii('10000000146')!;
    const raw = Buffer.from(a.slice(7), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decryptPii('enc:v1:' + raw.toString('base64'))).toThrow();
  });
  it('blind index is keyed, normalized and never computed from ciphertext', () => {
    expect(piiHash(' 100 000 001 46 ')).toBe(piiHash('10000000146'));
    expect(piiHash('10000000146')).toMatch(/^[0-9a-f]{64}$/);
    expect(piiHash(encryptPii('10000000146'))).toBeNull();
  });
  it('production refuses to start without PII keys, DB password; tokens are 15-60 minutes', () => {
    expect(() => assertSecurityConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DB_PASSWORD: 'p' })).toThrow();
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(() => assertSecurityConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), PII_ENCRYPTION_KEY: key, PII_HMAC_KEY: key })).toThrow(SecurityConfigError);
    expect(() => assertSecurityConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), PII_ENCRYPTION_KEY: key, PII_HMAC_KEY: key, DB_PASSWORD: 'p', DB_SSL: 'false' })).not.toThrow();
    expect(accessTokenTtlSeconds({})).toBe(1800);
    expect(accessTokenTtlSeconds({ ACCESS_TOKEN_TTL_MINUTES: '240' })).toBe(3600);
    expect(accessTokenTtlSeconds({ ACCESS_TOKEN_TTL_MINUTES: '5' })).toBe(900);
    expect(sessionPolicy({ NODE_ENV: 'production' }).cookieSecure).toBe(true);
    expect(dbSslOptions({})).toBe(false);
    expect(dbSslOptions({ NODE_ENV: 'production' })).toEqual({ rejectUnauthorized: false });
  });
});

describe('WP7 masking and permission matrix', () => {
  it('identifier masks keep the last 4 characters', () => {
    expect(maskIdentifier('10000000146')).toBe('*******0146');
    expect(maskEmail('selin.aydin@ornekposta.com.tr')).toBe('s*****@ornekposta.com.tr');
    expect(isMaskedValue('*******0146')).toBe(true);
    expect(isMaskedValue('10000000146')).toBe(false);
  });
  it('deep mask: 11-digit identity numbers anywhere (documents, drivers), VKN stays visible', () => {
    const out = maskPersonalIdentifiers({
      customer: { identityNumber: '10000000146', taxNumber: '10000000146', passportNo: 'U12345678' },
      invoice: { buyerSnapshot: { taxId: '10000000146' }, sellerSnapshot: { taxId: '5640281390' } },
      despatch: { drivers: [{ firstName: 'Ali', tckn: '10000000078' }] },
      note: '10000000146',
    });
    expect(out.customer.identityNumber).toBe('*******0146');
    expect(out.customer.taxNumber).toBe('*******0146');
    expect(out.customer.passportNo).toBe('*******5678');
    expect(out.invoice.buyerSnapshot.taxId).toBe('*******0146');
    expect(out.invoice.sellerSnapshot.taxId).toBe('5640281390');
    expect(out.despatch.drivers[0].tckn).toBe('*******0078');
    expect(out.note).toBe('10000000146');
  });
  it('customer presenter: identity masked until revealed; contact masked without pii.read', () => {
    const c = { type: 'individual', identityType: 'TCKN', identityNumber: '10000000146', email: 'a.b@x.com', phone: '+90 532 418 27 63', taxNumber: '10000000146' };
    const viewer = maskCustomer(c, { canReadPii: false });
    expect(viewer.identityNumber).toBe('*******0146');
    expect(viewer.email).toBe('a*****@x.com');
    expect(viewer.phone).toBe('*******7 63');
    const manager = maskCustomer(c, { canReadPii: true });
    expect(manager.identityNumber).toBe('*******0146');
    expect(manager.email).toBe('a.b@x.com');
    expect(maskCustomer(c, { canReadPii: true, revealed: true }).identityNumber).toBe('10000000146');
    expect(maskCustomer(c, { canReadPii: false, revealed: true }).identityNumber).toBe('*******0146');
    const company = maskCustomer({ type: 'company', identityType: 'VKN', identityNumber: '5640281390', email: 'muhasebe@x.com' }, { canReadPii: false });
    expect(company.identityNumber).toBe('5640281390');
    expect(company.email).toBe('muhasebe@x.com');
  });
  it('role -> permission defaults and API key scopes', () => {
    expect(effectivePermissions('admin')).toEqual(expect.arrayContaining(['customers.pii.read', 'customers.pii.export', 'kvkk.manage']));
    expect(effectivePermissions('manager')).toEqual(['customers.pii.read']);
    expect(effectivePermissions('viewer')).toEqual([]);
    expect(effectivePermissions('auditor')).toEqual([]);
    expect(effectivePermissions('viewer', ['customers.pii.read', 'bogus'])).toEqual(['customers.pii.read']);
    expect(apiKeyPermissions({ customers: 'read' })).toEqual([]);
    expect(apiKeyPermissions({ customers_pii: 'read' })).toEqual(['customers.pii.read']);
  });

  const guardFor = (meta: Record<string, unknown>) => {
    const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
    return new RolesGuard(reflector);
  };
  const ctx = (user: Record<string, unknown>, method = 'GET') =>
    ({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user, method }) }) }) as any;
  it('viewer cannot reveal (customers.pii.read), manager can; auditor reads staff GETs, writes nothing', () => {
    const reveal = guardFor({ [REQUIRE_PERMISSION_KEY]: 'customers.pii.read' });
    expect(() => reveal.canActivate(ctx({ role: 'viewer', permissions: [] }, 'POST'))).toThrow(ForbiddenException);
    expect(reveal.canActivate(ctx({ role: 'manager', permissions: ['customers.pii.read'] }, 'POST'))).toBe(true);
    const adminGet = guardFor({ roles: ['admin'] });
    expect(adminGet.canActivate(ctx({ role: 'auditor', permissions: [] }, 'GET'))).toBe(true);
    expect(() => adminGet.canActivate(ctx({ role: 'auditor', permissions: [] }, 'POST'))).toThrow(ForbiddenException);
    expect(() => adminGet.canActivate(ctx({ role: 'viewer', permissions: [] }, 'GET'))).toThrow(ForbiddenException);
    const open = guardFor({});
    expect(() => open.canActivate(ctx({ role: 'auditor', permissions: [] }, 'PUT'))).toThrow(ForbiddenException);
    const self = guardFor({ [SELF_SERVICE_KEY]: true });
    expect(self.canActivate(ctx({ role: 'auditor', permissions: [] }, 'PUT'))).toBe(true);
    const manage = guardFor({ roles: ['admin'], [REQUIRE_PERMISSION_KEY]: 'kvkk.manage' });
    expect(() => manage.canActivate(ctx({ role: 'auditor', permissions: [] }, 'GET'))).toThrow(ForbiddenException);
  });
});

describe('WP7 WebSocket and webhook payloads carry no personal data', () => {
  it('customer_mutated: only id and changed field names', () => {
    const ev = CustomerService.mutationEvent('update', 'c-1', ['email', 'phone']);
    expect(ev).toEqual({ type: 'update', customerId: 'c-1', changedFields: ['email', 'phone'] });
    expect(JSON.stringify(ev)).not.toMatch(/@|\+90|Selin/);
  });
  it('webhook payloads drop personal keys unless the endpoint opts in', () => {
    const data = { id: 'o-1', orderNumber: 'ORD-1', customerId: 'c-1', customerName: 'Selin Aydın', items: [{ productName: 'Masa', quantity: 1 }], buyerSnapshot: { name: 'Selin', taxId: '10000000146' }, performedBy: 'admin' };
    const out = stripPersonalData(data);
    expect(out).toEqual({ id: 'o-1', orderNumber: 'ORD-1', customerId: 'c-1', items: [{ productName: 'Masa', quantity: 1 }] });
  });
  it('audit diff hides identity / contact values but still records the change', () => {
    const d = computeDiff({ id: '1', name: 'A', email: 'a@x.com', identityNumber: '10000000146' }, { id: '1', name: 'A', email: 'b@x.com', identityNumber: '10000000146' });
    expect(d.changed).toEqual(['email']);
    expect(d.before).toEqual({ email: REDACTED });
    expect(d.after).toEqual({ email: REDACTED });
    const created = computeDiff(null, { identityNumber: '10000000146', phone: '+90', name: 'X', totpRecoveryCodes: ['h'] });
    expect(created.after).toEqual({ identityNumber: REDACTED, phone: REDACTED, name: 'X', totpRecoveryCodes: REDACTED });
  });
});

describe('WP7 cross-border transfer (KVKK md. 9)', () => {
  it('an endpoint abroad needs a basis to be active; SCC needs the Board notification', () => {
    expect(validateTransfer({ destinationCountry: 'TR', transferBasis: 'DOMESTIC', active: true })).toBeNull();
    expect(validateTransfer({ destinationCountry: 'DE', transferBasis: null, active: true })).toBe('TRANSFER_BASIS_REQUIRED');
    expect(validateTransfer({ destinationCountry: 'DE', transferBasis: 'DOMESTIC', active: true })).toBe('TRANSFER_BASIS_REQUIRED');
    expect(validateTransfer({ destinationCountry: 'DE', transferBasis: null, active: false })).toBeNull();
    expect(validateTransfer({ destinationCountry: 'US', transferBasis: 'SCC', sccNotifiedAt: null, active: true })).toBe('SCC_NOTICE_REQUIRED');
    expect(validateTransfer({ destinationCountry: 'US', transferBasis: 'SCC', sccNotifiedAt: '2026-10-05', active: true })).toBeNull();
    expect(validateTransfer({ destinationCountry: 'TR', transferBasis: 'SCC', active: true })).toBe('TRANSFER_BASIS_INVALID');
    expect(validateTransfer({ destinationCountry: 'XYZ', active: true })).toBe('TRANSFER_COUNTRY_INVALID');
  });
  it('SCC notification deadline: signing + 5 business days', () => {
    expect(addBusinessDays('2026-10-15', 5)).toBe('2026-10-22');
    expect(sccNoticeStatus('2026-10-15', '2026-10-23')).toEqual({ deadline: '2026-10-22', late: true });
    expect(sccNoticeStatus('2026-10-15', '2026-10-20').late).toBe(false);
  });
});

describe('WP7 anonymisation', () => {
  it('anonymous name is keyed by the id (not the name) and stable; FULL erases identity and contact', () => {
    const n = anonymousCustomerName('11111111-2222-3333-4444-555555555555');
    expect(n).toMatch(/^Anonim Müşteri #[0-9A-F]{8}$/);
    expect(anonymousCustomerName('11111111-2222-3333-4444-555555555555')).toBe(n);
    const now = new Date('2026-10-16T10:00:00Z');
    const full = customerErasurePatch('id-1', 'FULL', now, null);
    for (const k of ['email', 'phone', 'notes', 'identityNumber', 'passportNo', 'foreignTaxId', 'nationality']) expect(full[k]).toBeNull();
    expect(full['identityType']).toBe('ANONYMOUS');
    expect(Object.values(full['address'] as object).every((v) => v === null)).toBe(true);
    const partial = customerErasurePatch('id-1', 'PARTIAL', now, '2036-12-31');
    expect(partial).toEqual(expect.objectContaining({ email: null, phone: null, notes: null, processingRestricted: true, erasureRestrictedUntil: '2036-12-31' }));
    expect(partial).not.toHaveProperty('identityNumber');
    expect(partial).not.toHaveProperty('name');
  });
  it('maskJson replaces personal keys at any depth and keeps references when nothing changes', () => {
    const repl = customerReplacement('id-1');
    const before = { name: 'Selin Aydın', email: 'selin@x.com', nested: { customerName: 'Selin Aydın', qty: 2 }, list: [{ phone: '+90' }] };
    const m = maskJson(before, PERSONAL_KEYS, repl) as any;
    expect(m.name).toBe(anonymousCustomerName('id-1'));
    expect(m.nested.customerName).toBe(anonymousCustomerName('id-1'));
    expect(m.email).toBe(ANON_MARK);
    expect(m.list[0].phone).toBe(ANON_MARK);
    expect(JSON.stringify(m)).not.toContain('Selin');
    const clean = { qty: 1, status: 'ok' };
    expect(maskJson(clean, PERSONAL_KEYS, repl)).toBe(clean);
  });
});

describe('WP7 audit hash chain (pure)', () => {
  const build = (n: number) => {
    const rows = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= n; i++) {
      const digest = String(i).padStart(64, 'a');
      const hash = chainHash(prev, i, digest);
      rows.push({ id: `r${i}`, chainSeq: i, prevHash: prev, hash, payloadDigest: digest });
      prev = hash;
    }
    return rows;
  };
  it('a valid chain verifies; a changed digest, a broken link or a gap is detected', () => {
    expect(verifyChain(build(5)).ok).toBe(true);
    const tampered = build(5);
    tampered[2].payloadDigest = 'b'.repeat(64);
    expect(verifyChain(tampered).brokenAt).toEqual(expect.objectContaining({ chainSeq: 3, reason: 'HASH_MISMATCH' }));
    const relinked = build(5);
    relinked[3].prevHash = GENESIS_HASH;
    expect(verifyChain(relinked).brokenAt?.reason).toBe('PREV_HASH_MISMATCH');
    const gap = build(5).filter((r) => r.chainSeq !== 3);
    expect(verifyChain(gap).brokenAt?.reason).toBe('SEQ_GAP');
  });
});

describe('WP7 retention, deadlines and special-category warning', () => {
  it('legal records: 31.12.(year + 10); periods; minimum check', () => {
    expect(legalRecordRetentionUntil('2026-03-14')).toBe('2036-12-31');
    expect(retentionUntil({ periodValue: 10, periodUnit: 'YEAR', startEvent: 'CALENDAR_YEAR_END' }, '2026-03-14')).toBe('2036-12-31');
    expect(retentionUntil({ periodValue: 30, periodUnit: 'DAY', startEvent: 'DELETED' }, '2026-10-16')).toBe('2026-11-15');
    expect(addPeriod('2026-08-31', 6, 'MONTH')).toBe('2027-02-28');
    expect(addPeriod('2026-10-16', -90, 'DAY')).toBe('2026-07-18');
    const audit = RETENTION_DEFAULTS.find((d) => d.dataCategory === 'ORDERS')!;
    expect(violatesMinimum(audit, 5, 'YEAR')).toBe(true);
    expect(violatesMinimum(audit, 12, 'YEAR')).toBe(false);
    expect(RETENTION_DEFAULTS.every((d) => d.sourceRef && d.legalBasis)).toBe(true);
    expect(RETENTION_DEFAULTS.find((d) => d.dataCategory === 'AUDIT_LOGS')!.requiresApproval).toBe(true);
    expect(nextDestructionDue('2026-03-01', 6, '2026-10-16')).toEqual({ due: '2026-09-01', overdue: true });
    expect(nextDestructionDue(null, 6, '2026-10-16').overdue).toBe(true);
  });
  it('DSR due date counts down; breach clock in hours', () => {
    const now = new Date('2026-10-16T09:00:00Z');
    const received = new Date('2026-09-24T08:15:00Z');
    const due = new Date(received.getTime() + 30 * 86400000);
    expect(due.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(kvkkDaysLeft(due, now)).toBe(8);
    expect(kvkkDaysLeft(new Date('2026-10-15T09:00:00Z'), now)).toBe(-1);
    expect(kvkkHoursLeft(new Date(now.getTime() + 72 * 3600000), now)).toBe(72);
  });
  it('special-category stems in notes (KVKK md. 6) are warned, ordinary text is not', () => {
    expect(detectSpecialCategoryData('Müşteri diyabet hastası, şekersiz ürün tercih ediyor')).toContain('HEALTH');
    expect(detectSpecialCategoryData('Sendika üyesi olduğunu belirtti')).toContain('ASSOCIATION');
    expect(detectSpecialCategoryData('Adli sicil kaydı istendi')).toContain('CRIMINAL');
    expect(detectSpecialCategoryData('Teslimat 09:00-17:00 arası, kapıda ödeme')).toEqual([]);
    expect(detectSpecialCategoryData('Kurumsal müşteri, teklif istedi')).toEqual([]);
  });
  it('privacy notice template: identity, rights, no consent for invoicing, cookie section', () => {
    const n = buildPrivacyNotice({ name: 'Demo', legalName: 'Demo A.Ş.', taxId: '5640281390', kvkkContactEmail: 'kvkk@demo.com.tr', kepAddress: 'demo@hs01.kep.tr' }, 'CUSTOMER', 'tr', [{ name: 'Entegratör', service: 'e-Belge', country: 'TR' }], [{ name: 'hooks.example.com', service: 'Webhook', country: 'DE', transferBasis: 'SCC' }], () => '10 yıl');
    expect(n.body).toContain('Demo A.Ş. (VKN 5640281390)');
    expect(n.body).toContain('KVKK md. 11');
    expect(n.body).toContain('açık rıza istenmez');
    expect(n.body).toContain('Çerezler ve yerel depolama');
    expect(n.body).toContain('hooks.example.com');
    expect(n.body).toContain('demo@hs01.kep.tr');
  });
});
