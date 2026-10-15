import { createHash } from 'crypto';

/**
 * "İbraz paketi" (VUK 256; 509 VI): the e-documents of a period as a ZIP for the tax inspector —
 * XML (as archived), display (PDF, or HTML when no PDF renderer is available), an index CSV
 * (Turkish, semicolon separated, UTF-8 BOM) and a SHA-256 manifest of every file.
 */
export interface PackageDocument {
  documentNo: string | null;
  ettn: string;
  documentType: string;
  direction: string;
  profileId?: string | null;
  typeCode?: string | null;
  issueDate?: string | null;
  counterpartyTaxId?: string | null;
  counterpartyName?: string | null;
  payableAmount?: number | null;
  currency?: string | null;
  gibStatus?: string | null;
  retentionUntil: string;
  sha256: string;
  xml: string;
  pdf?: Buffer | null;
  html?: string | null;
}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');

export interface PackageResult {
  zip: Buffer;
  files: number;
  /** Documents whose stored hash no longer matches the XML (integrity breach) */
  mismatches: string[];
}

export function buildArchivePackage(docs: PackageDocument[], meta: { companyName: string; taxId: string | null; from: string; to: string; generatedAt: Date }): PackageResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  const manifest: { path: string; sha256: string }[] = [];
  const mismatches: string[] = [];
  const add = (path: string, data: Buffer) => {
    zip.addFile(path, data);
    manifest.push({ path, sha256: sha256(data) });
  };
  const rows: string[] = [
    ['Belge No', 'ETTN', 'Belge Türü', 'Yön', 'Senaryo', 'Tip', 'Tarih', 'Karşı Taraf VKN/TCKN', 'Karşı Taraf', 'Tutar', 'Para Birimi', 'GİB Durumu', 'Saklama Sonu', 'SHA-256', 'Bütünlük'].join(';'),
  ];
  for (const d of docs) {
    const base = safeName(`${d.issueDate || 'tarihsiz'}_${d.documentNo || d.ettn}_${d.direction}`);
    const xmlBuf = Buffer.from(d.xml, 'utf8');
    const ok = sha256(xmlBuf) === d.sha256;
    if (!ok) mismatches.push(d.ettn);
    add(`xml/${base}.xml`, xmlBuf);
    if (d.pdf) add(`pdf/${base}.pdf`, d.pdf);
    else if (d.html) add(`html/${base}.html`, Buffer.from(d.html, 'utf8'));
    rows.push(
      [d.documentNo, d.ettn, d.documentType, d.direction === 'OUT' ? 'Giden' : 'Gelen', d.profileId, d.typeCode, d.issueDate, d.counterpartyTaxId, d.counterpartyName, d.payableAmount, d.currency, d.gibStatus, d.retentionUntil, d.sha256, ok ? 'TAMAM' : 'UYUŞMAZLIK']
        .map(csvCell)
        .join(';'),
    );
  }
  add('index.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(rows.join('\r\n') + '\r\n', 'utf8')]));
  const readme = [
    `İbraz paketi: ${meta.companyName}${meta.taxId ? ` (VKN/TCKN ${meta.taxId})` : ''}`,
    `Dönem: ${meta.from} - ${meta.to}`,
    `Oluşturma: ${meta.generatedAt.toISOString()}`,
    `Belge sayısı: ${docs.length}`,
    'Yasal arşiv entegratördedir (509 Sıra No.lu VUK GT VI); bu paket uygulamadaki çalışma kopyasından üretilmiştir.',
    'manifest.sha256 dosyası paketteki her dosyanın SHA-256 özetini içerir.',
  ].join('\r\n');
  add('BENIOKU.txt', Buffer.from(readme + '\r\n', 'utf8'));
  zip.addFile('manifest.sha256', Buffer.from(manifest.map((m) => `${m.sha256}  ${m.path}`).join('\n') + '\n', 'utf8'));
  return { zip: zip.toBuffer(), files: manifest.length + 1, mismatches };
}
