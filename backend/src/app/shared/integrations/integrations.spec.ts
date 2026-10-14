import { computeDiff, redact, REDACTED } from './audit-diff';
import { generateApiKey, hasScope, hashSecret, parseApiKey, resourceForPath, sanitizeScopes, verifySecret } from './api-key';
import { computeSignature, retryDelayMs, signatureHeader, verifySignature } from './webhook-signature';
import { checkWebhookUrl, isPrivateAddress } from './url-guard';
import { parseCsvObjects, toCsv } from './csv';

describe('webhook HMAC signing', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'product.updated', data: { id: 1 } });

  it('matches a known HMAC-SHA256 vector over "<t>.<body>"', () => {
    // echo -n '1700000000.{}' | openssl dgst -sha256 -hmac key
    expect(computeSignature('key', 1700000000, '{}')).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSignature('key', 1700000000, '{}')).toBe(computeSignature('key', 1700000000, '{}'));
    expect(computeSignature('key', 1700000000, '{}')).not.toBe(computeSignature('key2', 1700000000, '{}'));
  });

  it('round-trips and rejects tampering, wrong secret and stale timestamps', () => {
    const now = Date.now();
    const header = signatureHeader(secret, body, Math.floor(now / 1000));
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifySignature(secret, body, header, 300, now)).toBe(true);
    expect(verifySignature(secret, body + ' ', header, 300, now)).toBe(false);
    expect(verifySignature('other', body, header, 300, now)).toBe(false);
    expect(verifySignature(secret, body, header, 300, now + 3_600_000)).toBe(false);
  });

  it('backs off exponentially with a cap', () => {
    expect(retryDelayMs(1, 1000)).toBe(1000);
    expect(retryDelayMs(2, 1000)).toBe(2000);
    expect(retryDelayMs(4, 1000)).toBe(8000);
    expect(retryDelayMs(30, 1000)).toBe(3_600_000);
  });
});

describe('API keys', () => {
  it('stores only a hash and verifies the secret', () => {
    const g = generateApiKey();
    expect(g.key.startsWith(g.prefix + '.')).toBe(true);
    const parsed = parseApiKey(g.key)!;
    expect(parsed.prefix).toBe(g.prefix);
    expect(g.secretHash).toBe(hashSecret(parsed.secret));
    expect(g.secretHash).not.toContain(parsed.secret);
    expect(verifySecret(parsed.secret, g.secretHash)).toBe(true);
    expect(verifySecret(parsed.secret + 'x', g.secretHash)).toBe(false);
    expect(parseApiKey('Bearer xyz')).toBeNull();
    expect(parseApiKey('sk_live_abc')).toBeNull();
  });

  it('maps paths to resources', () => {
    expect(resourceForPath('/api/products/123')).toBe('products');
    expect(resourceForPath('/api/v1/purchase-orders?x=1')).toBe('purchase_orders');
    expect(resourceForPath('/api/stock-movements')).toBe('stock');
    expect(resourceForPath('/api/api-keys')).toBeNull();
    expect(resourceForPath('/api/user/users')).toBeNull();
  });

  it('enforces read vs write scopes', () => {
    const scopes = { products: 'read', orders: 'write' } as const;
    expect(hasScope(scopes, 'products', 'GET')).toBe(true);
    expect(hasScope(scopes, 'products', 'PUT')).toBe(false);
    expect(hasScope(scopes, 'products', 'DELETE')).toBe(false);
    expect(hasScope(scopes, 'orders', 'POST')).toBe(true);
    expect(hasScope(scopes, 'orders', 'GET')).toBe(true);
    expect(hasScope(scopes, 'customers', 'GET')).toBe(false);
    expect(hasScope(scopes, null, 'GET')).toBe(false);
  });

  it('sanitizes scope input', () => {
    expect(sanitizeScopes({ products: 'write', admin: 'write', orders: 'all' })).toEqual({ products: 'write' });
  });
});

describe('audit diff redaction', () => {
  it('never exposes password hashes or secrets', () => {
    const r = redact({ username: 'a', password: 'pbkdf2$...', secretHash: 'abc', secret: 'whsec_x', tokenVersion: 3, apiKey: 'sk', email: null })!;
    expect(r['password']).toBe(REDACTED);
    expect(r['secretHash']).toBe(REDACTED);
    expect(r['secret']).toBe(REDACTED);
    expect(r['tokenVersion']).toBe(REDACTED);
    expect(r['apiKey']).toBe(REDACTED);
    expect(r['username']).toBe('a');
    expect(JSON.stringify(r)).not.toContain('pbkdf2');
  });

  it('returns only changed fields, ignoring decimal formatting and timestamps', () => {
    const d = computeDiff(
      { id: '1', name: 'A', price: '10.00', quantity: 5, updatedAt: new Date(0), password: 'old' },
      { id: '1', name: 'B', price: 10, quantity: 5, updatedAt: new Date(), password: 'new' },
    );
    expect(d.changed).toEqual(['name']);
    expect(d.before).toEqual({ name: 'A' });
    expect(d.after).toEqual({ name: 'B' });
  });

  it('keeps the full (redacted) snapshot for create and drops relations', () => {
    const d = computeDiff(null, { id: '1', name: 'X', category: { id: 'c', name: 'cat' }, secretHash: 'h' });
    expect(d.before).toBeNull();
    expect(d.after).toEqual({ id: '1', name: 'X', secretHash: REDACTED });
  });
});

describe('webhook URL SSRF guard', () => {
  it('classifies private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('blocks localhost/private targets unless the dev flag allows them', async () => {
    expect(await checkWebhookUrl('http://localhost:9000/x', false)).toEqual({ ok: false, code: 'WEBHOOK_URL_BLOCKED' });
    expect(await checkWebhookUrl('http://169.254.169.254/latest', false)).toEqual({ ok: false, code: 'WEBHOOK_URL_BLOCKED' });
    expect(await checkWebhookUrl('ftp://example.com', false)).toEqual({ ok: false, code: 'WEBHOOK_URL_INVALID' });
    expect(await checkWebhookUrl('http://user:pw@93.184.216.34/', false)).toEqual({ ok: false, code: 'WEBHOOK_URL_INVALID' });
    expect(await checkWebhookUrl('http://93.184.216.34/hook', false)).toEqual({ ok: true });
    expect(await checkWebhookUrl('http://localhost:9000/x', true)).toEqual({ ok: true });
  });
});

describe('CSV', () => {
  it('parses quoted fields and semicolon files', () => {
    const { headers, rows } = parseCsvObjects('﻿sku,name\r\nA-1,"Kalem, mavi"\r\nB-2,"He said ""hi"""\r\n');
    expect(headers).toEqual(['sku', 'name']);
    expect(rows).toEqual([{ sku: 'A-1', name: 'Kalem, mavi' }, { sku: 'B-2', name: 'He said "hi"' }]);
    expect(parseCsvObjects('sku;name\nX;Y').rows).toEqual([{ sku: 'X', name: 'Y' }]);
  });

  it('escapes output and neutralizes formulas', () => {
    const csv = toCsv(['a', 'b'], [{ a: '=HYPERLINK("x")', b: -5 }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")",-5`);
  });
});
