import { CompanyEntity } from '../../entities/company.entity';
import { formatAddress } from '../../entities/address.embedded';

/**
 * Printable legal outputs (saved as PDF from the browser): always Turkish (VUK 215/1),
 * A4, "Sayfa X / Y" in the page margin box, company identity (unvan, VKN / TCKN, vergi dairesi,
 * adres, MERSİS) on every page header, signature blocks at the end.
 */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
export const money = (v: unknown, cur = 'TRY') => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)} ${cur === 'TRY' ? 'TL' : cur}`;
export const num = (v: unknown, max = 4) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: max }).format(Number(v) || 0);
export const trDay = (v: unknown) => (v ? String(v).slice(0, 10).split('-').reverse().join('.') : '-');

/** Abbreviations used on the outputs (R72: kısaltma sözlüğü). */
export const ABBREVIATIONS: [string, string][] = [
  ['VKN', 'Vergi Kimlik Numarası'],
  ['TCKN', 'T.C. Kimlik Numarası'],
  ['SKT', 'Son Kullanma / Son Tüketim Tarihi'],
  ['TETT', 'Tavsiye Edilen Tüketim Tarihi'],
  ['THP', 'Tekdüzen Hesap Planı'],
  ['VUK', 'Vergi Usul Kanunu'],
  ['TTK', 'Türk Ticaret Kanunu'],
  ['KDV', 'Katma Değer Vergisi'],
];

export function companyHeader(c: CompanyEntity): string {
  const id = c.taxId ? `${c.taxIdType === 'TCKN' ? 'TCKN' : 'VKN'}: ${esc(c.taxId)}` : 'VKN: -';
  return `<div class="co"><b>${esc(c.legalName || c.name)}</b><div>${id}${c.taxOfficeName ? ` &middot; ${esc(c.taxOfficeName)}` : ''}${c.mersisNo ? ` &middot; MERSİS: ${esc(c.mersisNo)}` : ''}</div><div>${esc(formatAddress(c.address as any) || '')}</div></div>`;
}

export function signatureBlock(labels: string[]): string {
  return `<div class="sign">${labels.map((l) => `<div><div class="sl">${esc(l)}</div><div class="sn">Ad Soyad / Unvan</div><div class="ss">İmza</div></div>`).join('')}</div>`;
}

export function abbreviations(keys?: string[]): string {
  const list = keys ? ABBREVIATIONS.filter(([k]) => keys.includes(k)) : ABBREVIATIONS;
  return `<div class="abbr"><b>Kısaltmalar:</b> ${list.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' &middot; ')}</div>`;
}

export function legalPage(title: string, company: CompanyEntity, body: string, opts: { landscape?: boolean; notice?: string | null } = {}): string {
  const generated = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: company.timezone || 'Europe/Istanbul' }).format(new Date());
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm 16mm;
      @bottom-right { content: "Sayfa " counter(page) " / " counter(pages); font: 9px "Segoe UI", Arial, sans-serif; color: #555; }
      @bottom-left { content: "${esc(company.legalName || company.name).replace(/"/g, '')} - ${esc(title).replace(/"/g, '')}"; font: 9px "Segoe UI", Arial, sans-serif; color: #555; } }
    body { font: 11px/1.4 "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 12px; }
    h1 { font-size: 16px; margin: 0 0 2px; } .muted { color: #555; } .co { margin: 4px 0 10px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } thead { display: table-header-group; } tr { page-break-inside: avoid; }
    th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; } th { background: #f1f1f1; font-size: 10px; }
    td.n, th.n { text-align: right; white-space: nowrap; } tfoot td { font-weight: 700; background: #fafafa; }
    .meta td { border: none; padding: 1px 8px 1px 0; } .grp td { background: #f7f7f7; font-weight: 600; }
    .notice { margin: 8px 0; padding: 6px 8px; border: 2px solid #b00; color: #b00; font-weight: 700; text-align: center; }
    .sign { display: flex; gap: 18px; margin-top: 36px; page-break-inside: avoid; } .sign > div { flex: 1; border-top: 1px solid #888; padding-top: 4px; text-align: center; }
    .sl { font-weight: 600; } .sn, .ss { color: #666; margin-top: 18px; } .abbr { margin-top: 14px; font-size: 9px; color: #555; }
    .warn { color: #a15c00; } .foot { margin-top: 10px; font-size: 9px; color: #666; }
    @media screen { body { max-width: ${opts.landscape ? '1200px' : '900px'}; margin: 0 auto; } }
  </style></head><body>
  <h1>${esc(title)}</h1>${companyHeader(company)}${opts.notice ? `<div class="notice">${esc(opts.notice)}</div>` : ''}${body}
  <div class="foot">Düzenlenme: ${esc(generated)} &middot; Stok Yönetimi</div></body></html>`;
}

/** "Ön rapordur, beyanname yerine geçmez" (R21 / R17). */
export const PRE_REPORT_NOTICE = 'Ön rapordur, beyanname yerine geçmez. Beyanname mali müşavir tarafından muhasebe kayıtlarından hazırlanır.';
