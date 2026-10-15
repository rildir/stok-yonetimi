import { ParsedUbl } from './ubl/parser';

/**
 * Karekod (QR) content of e-documents (GİB Karekod Standardı Kılavuzu V1.2, §2.1-2.3): a flat JSON
 * object whose keys and value formats are fixed by the guide. Built from the UBL itself, so the
 * code always matches the signed document.
 */
export type QrPayload = Record<string, string>;

const money = (v: number) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
const pct = (v: number) => String(Number((Number(v) || 0).toFixed(2)));

export function invoiceQr(doc: ParsedUbl): QrPayload {
  const out: QrPayload = {
    vkntckn: doc.supplier?.taxId || '',
    avkntckn: doc.customer?.taxId || '',
    senaryo: doc.profileId || '',
    tip: doc.typeCode || '',
    tarih: doc.issueDate || '',
    no: doc.id || '',
    ettn: (doc.uuid || '').toLowerCase(),
    parabirimi: doc.currency || 'TRY',
    malhizmettoplam: money(doc.legalMonetaryTotal?.lineExtension || 0),
  };
  for (const t of doc.taxSubtotals.filter((x) => x.code === '0015')) {
    out[`kdvmatrah(${pct(t.percent)})`] = money(t.taxable);
    out[`hesaplanankdv(${pct(t.percent)})`] = money(t.amount);
  }
  out['vergidahil'] = money(doc.legalMonetaryTotal?.taxInclusive || 0);
  out['odenecek'] = money(doc.legalMonetaryTotal?.payable || 0);
  return out;
}

export function despatchQr(doc: ParsedUbl): QrPayload {
  const out: QrPayload = {
    vkntckn: doc.supplier?.taxId || '',
    avkntckn: doc.customer?.taxId || '',
    senaryo: doc.profileId || '',
    tip: doc.typeCode || '',
    tarih: doc.issueDate || '',
    no: doc.id || '',
    ettn: (doc.uuid || '').toLowerCase(),
    sevktarihi: doc.actualDespatchDate || '',
    sevkzamani: doc.actualDespatchTime || '',
  };
  if (doc.carrierTaxId) out['tasiyicivkn'] = doc.carrierTaxId;
  if (doc.plates[0]) out['plaka'] = doc.plates[0];
  return out;
}

export function qrPayload(doc: ParsedUbl): QrPayload | null {
  if (doc.docType === 'Invoice') return invoiceQr(doc);
  if (doc.docType === 'DespatchAdvice') return despatchQr(doc);
  return null;
}

/** Schema check of a QR payload (key set, order and value formats of the guide). Returns the problems. */
export function validateQrPayload(p: QrPayload, kind: 'invoice' | 'despatch'): string[] {
  const errors: string[] = [];
  const keys = Object.keys(p);
  const head = ['vkntckn', 'avkntckn', 'senaryo', 'tip', 'tarih', 'no', 'ettn'];
  if (keys.slice(0, head.length).join() !== head.join()) errors.push(`key order ${keys.slice(0, 7).join()}`);
  if (!/^(\d{10}|\d{11})$/.test(p['vkntckn'] || '')) errors.push('vkntckn');
  if (!/^(\d{10}|\d{11})$/.test(p['avkntckn'] || '')) errors.push('avkntckn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p['tarih'] || '')) errors.push('tarih');
  if (!/^[A-Z0-9]{3}\d{13}$/.test(p['no'] || '')) errors.push('no');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p['ettn'] || '')) errors.push('ettn');
  if (kind === 'invoice') {
    if (!/^[A-Z]{3}$/.test(p['parabirimi'] || '')) errors.push('parabirimi');
    for (const k of ['malhizmettoplam', 'vergidahil', 'odenecek']) if (!/^-?\d+\.\d{2}$/.test(p[k] || '')) errors.push(k);
    for (const k of keys.filter((x) => x.startsWith('kdvmatrah(') || x.startsWith('hesaplanankdv('))) {
      if (!/^(kdvmatrah|hesaplanankdv)\(\d+(\.\d+)?\)$/.test(k) || !/^-?\d+\.\d{2}$/.test(p[k])) errors.push(k);
    }
    const allowed = new Set([...head, 'parabirimi', 'malhizmettoplam', 'vergidahil', 'odenecek']);
    for (const k of keys) if (!allowed.has(k) && !/^(kdvmatrah|hesaplanankdv)\(/.test(k)) errors.push(`unexpected ${k}`);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p['sevktarihi'] || '')) errors.push('sevktarihi');
    if (!/^\d{2}:\d{2}:\d{2}$/.test(p['sevkzamani'] || '')) errors.push('sevkzamani');
    if (p['tasiyicivkn'] !== undefined && !/^(\d{10}|\d{11})$/.test(p['tasiyicivkn'])) errors.push('tasiyicivkn');
    const allowed = new Set([...head, 'sevktarihi', 'sevkzamani', 'tasiyicivkn', 'plaka']);
    for (const k of keys) if (!allowed.has(k)) errors.push(`unexpected ${k}`);
  }
  return errors;
}

/** QR image (SVG) of the JSON payload. */
export async function qrSvg(payload: QrPayload): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const QRCode = require('qrcode') as typeof import('qrcode');
  return QRCode.toString(JSON.stringify(payload), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
}
