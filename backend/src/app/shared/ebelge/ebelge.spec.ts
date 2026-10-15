import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { buildInvoiceXml } from './ubl/invoice.builder';
import { buildDespatchXml } from './ubl/despatch.builder';
import { parseUbl } from './ubl/parser';
import { branchDespatch, dovizInvoice, earsivInternetInvoice, satisInvoice, tevkifatInvoice } from './ubl/__fixtures__/golden-inputs';
import { despatchQr, invoiceQr, qrSvg, validateQrPayload } from './qr';
import { decryptCredentials, encryptCredentials, maskCredentials } from './credentials';
import { MemoryMockStore, MockEDocumentProvider, ProviderContext, ProviderError } from './provider';
import { renderHtml } from './render';
import { buildArchivePackage, sha256 } from './archive-package';
import { ebelgeAssetsRoot } from './assets';
import { edocTriggerDefs } from './ebelge-triggers';
import { addBusinessDays, dayWindow, despatchDeliveryChannel, retentionUntil, routeInvoiceProfile } from '../tr';

describe('Karekod (QR) JSON — Karekod Standardı Kılavuzu v1.2', () => {
  it('invoice payload has the guide keys, order and formats', () => {
    const p = invoiceQr(parseUbl(buildInvoiceXml(satisInvoice())));
    expect(Object.keys(p)).toEqual(['vkntckn', 'avkntckn', 'senaryo', 'tip', 'tarih', 'no', 'ettn', 'parabirimi', 'malhizmettoplam', 'kdvmatrah(20)', 'hesaplanankdv(20)', 'vergidahil', 'odenecek']);
    expect(p).toMatchObject({ vkntckn: '4820193752', avkntckn: '7318462058', senaryo: 'TEMELFATURA', tip: 'SATIS', tarih: '2026-10-14', no: 'DMT2026000000017', parabirimi: 'TRY', malhizmettoplam: '118500.00', 'kdvmatrah(20)': '112800.00', 'hesaplanankdv(20)': '22560.00', vergidahil: '135360.00', odenecek: '135360.00' });
    expect(validateQrPayload(p, 'invoice')).toEqual([]);
  });

  it('withholding and foreign currency invoices keep a valid payload', () => {
    const t = invoiceQr(parseUbl(buildInvoiceXml(tevkifatInvoice())));
    expect(t['odenecek']).toBe('341000.00');
    expect(validateQrPayload(t, 'invoice')).toEqual([]);
    const d = invoiceQr(parseUbl(buildInvoiceXml(dovizInvoice())));
    expect(d['parabirimi']).toBe('USD');
    expect(validateQrPayload(d, 'invoice')).toEqual([]);
  });

  it('despatch payload carries actual despatch date / time and plate', () => {
    const p = despatchQr(parseUbl(buildDespatchXml(branchDespatch())));
    expect(p).toMatchObject({ senaryo: 'TEMELIRSALIYE', tip: 'SEVK', sevktarihi: '2026-10-14', sevkzamani: '11:15:00', plaka: '34ABC123' });
    expect(validateQrPayload(p, 'despatch')).toEqual([]);
  });

  it('rejects malformed payloads', () => {
    expect(validateQrPayload({ vkntckn: '12', avkntckn: '7318462058', senaryo: 'X', tip: 'SATIS', tarih: '14.10.2026', no: 'X', ettn: 'Y', parabirimi: 'TL', malhizmettoplam: '1', vergidahil: '1.00', odenecek: '1.00', foo: 'bar' }, 'invoice').length).toBeGreaterThan(4);
  });

  it('renders as SVG', async () => {
    expect(await qrSvg({ a: 'b' })).toContain('<svg');
  });
});

describe('integrator credential encryption (AES-256-GCM)', () => {
  const env = { EBELGE_CREDENTIALS_KEY: crypto.randomBytes(32).toString('base64'), EBELGE_CREDENTIALS_KEY_ID: 'k7' };
  it('round-trips, binds the company and never stores plain text', () => {
    const blob = encryptCredentials({ apiUser: 'demo', apiPassword: 'S3cr3t!' }, 'company-a', env);
    expect(blob.startsWith('v1:k7:')).toBe(true);
    expect(blob).not.toContain('S3cr3t');
    expect(decryptCredentials(blob, 'company-a', env)).toEqual({ apiUser: 'demo', apiPassword: 'S3cr3t!' });
    expect(() => decryptCredentials(blob, 'company-b', env)).toThrow();
  });
  it('detects tampering and supports key rotation', () => {
    const blob = encryptCredentials({ apiPassword: 'x' }, 'c', env);
    const parts = blob.split(':');
    parts[4] = Buffer.from('tampered').toString('base64');
    expect(() => decryptCredentials(parts.join(':'), 'c', env)).toThrow();
    const rotated = { EBELGE_CREDENTIALS_KEY: crypto.randomBytes(32).toString('hex'), EBELGE_CREDENTIALS_KEY_ID: 'k8', EBELGE_CREDENTIALS_KEY_K7: env.EBELGE_CREDENTIALS_KEY };
    expect(decryptCredentials(blob, 'c', rotated)).toEqual({ apiPassword: 'x' });
  });
  it('requires a key in production and masks secrets', () => {
    expect(() => encryptCredentials({ a: 1 }, 'c', { NODE_ENV: 'production' })).toThrow();
    expect(maskCredentials({ apiPassword: 'abc', apiUser: 'demoteknoloji', registeredInvoiceTaxIds: ['7318462058'] })).toEqual({ apiPassword: '••••••••', apiUser: 'demoteknoloji', registeredInvoiceTaxIds: '["7318462058"]' });
  });
});

describe('e-Belge routing and periods', () => {
  it('registered receivers get e-Fatura, others e-Arşiv; IADE never TICARI; export only when enabled', () => {
    expect(routeInvoiceProfile({ typeCode: 'SATIS', buyerRegistered: true })).toBe('TEMELFATURA');
    expect(routeInvoiceProfile({ typeCode: 'SATIS', buyerRegistered: true, preferredProfile: 'TICARIFATURA' })).toBe('TICARIFATURA');
    expect(routeInvoiceProfile({ typeCode: 'IADE', buyerRegistered: true, preferredProfile: 'TICARIFATURA' })).toBe('TEMELFATURA');
    expect(routeInvoiceProfile({ typeCode: 'SATIS', buyerRegistered: false })).toBe('EARSIVFATURA');
    expect(routeInvoiceProfile({ typeCode: 'ISTISNA', buyerRegistered: false, isExport: true })).toBeNull();
    expect(routeInvoiceProfile({ typeCode: 'ISTISNA', buyerRegistered: false, isExport: true, exportEnabled: true })).toBe('IHRACAT');
    expect(routeInvoiceProfile({ typeCode: 'OZELMATRAH', buyerRegistered: true })).toBeNull();
  });
  it('every despatch advice is an e-İrsaliye; only the channel changes', () => {
    expect(despatchDeliveryChannel(true, 'a@b.c')).toBe('GIB');
    expect(despatchDeliveryChannel(false, 'a@b.c')).toBe('EMAIL');
    expect(despatchDeliveryChannel(false, null)).toBe('PRINT');
  });
  it('8-day e-Arşiv window counts calendar days in the company time zone', () => {
    const delivered = new Date('2026-10-05T21:30:00Z'); // 2026-10-06 00:30 in Istanbul
    const w = dayWindow(delivered, 8, new Date('2026-10-14T20:59:00Z'), 'Europe/Istanbul');
    expect(w.lastDay).toBe('2026-10-14');
    expect(w.open).toBe(true);
    expect(dayWindow(delivered, 8, new Date('2026-10-14T21:00:00Z'), 'Europe/Istanbul').open).toBe(false);
  });
  it('retention and the 3-business-day notice', () => {
    expect(retentionUntil('2026-10-15')).toBe('2036-12-31');
    expect(addBusinessDays('2026-10-16', 3)).toBe('2026-10-21'); // Friday -> Wednesday
  });
});

describe('mock integrator', () => {
  const store = new MemoryMockStore();
  const provider = new MockEDocumentProvider(store);
  const ctx = (extra: Record<string, unknown> = {}, now?: Date): ProviderContext => ({ companyId: 'c1', taxId: '4820193752', environment: 'TEST', credentials: { apiUser: 'u', registeredInvoiceTaxIds: ['7318462058'], registeredDespatchTaxIds: ['7318462058'], ...extra }, now });
  const doc = (ettn: string, profileId = 'TICARIFATURA') => ({ ettn, docType: 'INVOICE' as const, documentNo: 'DMT2026000000017', profileId, xml: buildInvoiceXml(satisInvoice()), receiverTaxId: '7318462058' });

  it('answers the registry from its configuration', async () => {
    expect((await provider.checkUser(ctx(), '7318462058', 'INVOICE')).registered).toBe(true);
    expect((await provider.checkUser(ctx(), '3905728147', 'INVOICE')).registered).toBe(false);
  });

  it('never accepts the same ETTN twice and simulates the GİB / receiver progress', async () => {
    const t0 = new Date('2026-10-15T08:00:00Z');
    await provider.sendInvoice(ctx({}, t0), doc('e1'));
    await expect(provider.sendInvoice(ctx({}, t0), doc('e1'))).rejects.toMatchObject({ code: 'DUPLICATE' });
    expect((await provider.getStatus(ctx({}, new Date(t0.getTime() + 1000)), 'e1', 'INVOICE'))!.status).toBe('PROVIDER_RECEIVED');
    expect((await provider.getStatus(ctx({}, new Date(t0.getTime() + 6000)), 'e1', 'INVOICE'))!.status).toBe('DELIVERED');
    expect((await provider.getStatus(ctx({}, new Date(t0.getTime() + 25000)), 'e1', 'INVOICE'))!.status).toBe('ACCEPTED');
    expect(await provider.getStatus(ctx(), 'unknown', 'INVOICE')).toBeNull();
  });

  it('simulates outages, lost answers and rejections', async () => {
    await expect(provider.sendInvoice(ctx({ simulate: 'UNAVAILABLE' }), doc('e2'))).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    await expect(provider.sendInvoice(ctx({ simulate: 'TIMEOUT' }), doc('e3'))).rejects.toBeInstanceOf(ProviderError);
    expect(await provider.getStatus(ctx(), 'e3', 'INVOICE')).not.toBeNull();
    expect((await provider.sendInvoice(ctx({ simulate: 'REJECT' }), doc('e4'))).status).toBe('REJECTED');
  });

  it('e-Arşiv is delivered at once and can be cancelled', async () => {
    const r = await provider.sendEArsiv(ctx(), { ...doc('e5', 'EARSIVFATURA'), docType: 'EARCHIVE', xml: buildInvoiceXml(earsivInternetInvoice()) }, { sendType: 'ELEKTRONIK', channel: 'EMAIL', recipient: 'x@y.z' });
    expect(r.status).toBe('DELIVERED');
    await provider.cancelEArsiv(ctx(), 'e5', 'Hatalı tutar');
    expect((await provider.getStatus(ctx(), 'e5', 'EARCHIVE'))!.status).toBe('CANCELLED');
  });

  it('answers a registered e-İrsaliye with a partial receipt advice in the inbox', async () => {
    const t0 = new Date('2026-10-15T08:00:00Z');
    const d = branchDespatch();
    d.customer = { ...d.customer, identifiers: [{ schemeID: 'VKN', value: '7318462058' }] };
    await provider.sendDespatch(ctx({}, t0), { ettn: 'd1', docType: 'DESPATCH', documentNo: d.documentNo, profileId: 'TEMELIRSALIYE', xml: buildDespatchXml(d), receiverTaxId: '7318462058' });
    const later = new Date(t0.getTime() + 30000);
    expect((await provider.getStatus(ctx({ partialReceiptTaxIds: ['7318462058'] }, later), 'd1', 'DESPATCH'))!.status).toBe('GIB_ACCEPTED');
    const inbox = await provider.fetchInbox(ctx({ partialReceiptTaxIds: ['7318462058'] }, later), null);
    const ra = inbox.find((i) => i.docType === 'RECEIPT_ADVICE');
    expect(ra).toBeDefined();
    const parsed = parseUbl(ra!.xml);
    expect(parsed.despatchRefs[0].id.toLowerCase()).toBe('d1');
    expect(parsed.lines[0].rejected).toBeGreaterThan(0);
  });

  it('verifies webhook signatures', () => {
    const body = JSON.stringify({ updates: [{ ettn: 'e1', status: 'DELIVERED' }] });
    const sig = crypto.createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(provider.parseWebhook(ctx({ webhookSecret: 'whsec' }), { 'x-mock-signature': sig }, body)).toHaveLength(1);
    expect(provider.parseWebhook(ctx({ webhookSecret: 'whsec' }), { 'x-mock-signature': 'bad' }, body)).toBeNull();
  });
});

describe('display, archive package and vendored assets', () => {
  it('renders the GİB layout with QR, emblem and mandatory wording', async () => {
    const html = await renderHtml(buildInvoiceXml(earsivInternetInvoice()));
    expect(html).toContain('e-ARŞİV FATURA');
    expect(html).not.toContain('NaN');
    expect(html).toContain('%20');
    expect(html).toContain('T.C. Hazine ve Maliye Bakanlığı');
    expect(html).toContain('e-Arşiv izni kapsamında elektronik ortamda iletilmiştir.');
    expect(html).toContain('<svg');
    expect(html).toContain('data:image/jpeg;base64,');
    const desp = await renderHtml(buildDespatchXml(branchDespatch()));
    expect(desp).toContain('e-İRSALİYE');
    expect(desp).toContain('34ABC123');
  }, 30000);

  it('builds the inspection package with index and SHA-256 manifest, flagging hash mismatches', () => {
    const AdmZip = require('adm-zip');
    const xml = buildInvoiceXml(satisInvoice());
    const pkg = buildArchivePackage(
      [
        { documentNo: 'DMT2026000000017', ettn: 'a', documentType: 'INVOICE', direction: 'OUT', issueDate: '2026-10-14', retentionUntil: '2036-12-31', sha256: sha256(Buffer.from(xml)), xml, html: '<html></html>' },
        { documentNo: 'DMT2026000000018', ettn: 'b', documentType: 'INVOICE', direction: 'OUT', issueDate: '2026-10-14', retentionUntil: '2036-12-31', sha256: 'x'.repeat(64), xml },
      ],
      { companyName: 'Demo', taxId: '4820193752', from: '2026-10-01', to: '2026-10-31', generatedAt: new Date() },
    );
    expect(pkg.mismatches).toEqual(['b']);
    const zip = new AdmZip(pkg.zip);
    const names = zip.getEntries().map((e: any) => e.entryName);
    expect(names).toEqual(expect.arrayContaining(['index.csv', 'manifest.sha256', 'BENIOKU.txt', 'xml/2026-10-14_DMT2026000000017_OUT.xml', 'html/2026-10-14_DMT2026000000017_OUT.html']));
    const manifest = zip.readAsText('manifest.sha256');
    expect(manifest).toContain(`${sha256(Buffer.from(xml))}  xml/2026-10-14_DMT2026000000017_OUT.xml`);
    expect(zip.readAsText('index.csv')).toContain('UYUŞMAZLIK');
  });

  it('vendored GİB packages match MANIFEST.json (update via tools/ebelge/build-ebelge-assets.js)', () => {
    const root = ebelgeAssetsRoot();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'));
    expect(manifest.ublTrPackage).toBe('1.2.1');
    for (const [file, hash] of Object.entries<string>(manifest.files)) {
      expect([file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]).toEqual([file, hash]);
    }
  });

  it('archive triggers freeze every identifying column', () => {
    const [frozen, noDelete] = edocTriggerDefs(['id', 'companyId', 'ettn', 'xml', 'sha256', 'gibStatus', 'legalHold', 'retentionUntil']);
    expect(frozen.sql).toContain('NEW.`xml` <=> OLD.`xml`');
    expect(frozen.sql).not.toContain('NEW.`gibStatus` <=> OLD.`gibStatus`');
    expect(frozen.sql).toContain('NEW.`retentionUntil` < OLD.`retentionUntil`');
    expect(noDelete.sql).toContain('EDOCUMENT_ARCHIVE_IMMUTABLE');
  });
});
