/**
 * Minimal Office Open XML (.xlsx) writer: one or more sheets of plain values (strings as
 * inline strings, numbers as numbers). Enough for e-Envanter / journal exports that the
 * advisor imports into a spreadsheet or accounting package; no styling.
 */
export interface XlsxSheet {
  name: string;
  rows: (string | number | null | undefined)[][];
}

const esc = (v: string) => v.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string)
  // XML 1.0 forbids most control characters.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colName(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows: XlsxSheet['rows']): string {
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          if (v === null || v === undefined || v === '') return '';
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  const names = sheets.map((s, i) => (s.name || `Sheet${i + 1}`).replace(/[[\]*?/\\:]/g, ' ').slice(0, 31));
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
      'utf8',
    ),
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'utf8',
    ),
  );
  zip.addFile(
    'xl/workbook.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
      'utf8',
    ),
  );
  zip.addFile(
    'xl/_rels/workbook.xml.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}</Relationships>`,
      'utf8',
    ),
  );
  sheets.forEach((s, i) => zip.addFile(`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(sheetXml(s.rows), 'utf8')));
  return zip.toBuffer();
}

/** CSV text. locale 'tr': ';' separator, decimal comma, UTF-8 BOM (opens correctly in Turkish Excel). */
export function buildCsv(rows: (string | number | null | undefined)[][], locale: 'tr' | 'en' = 'en'): string {
  const sep = locale === 'tr' ? ';' : ',';
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? (locale === 'tr' ? String(v).replace('.', ',') : String(v)) : String(v);
    // Spreadsheet formula injection guard.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    const special = locale === 'tr' ? /[";\n\r]/ : /[",;\n\r]/;
    return special.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = rows.map((r) => r.map(cell).join(sep)).join('\r\n');
  return (locale === 'tr' ? '﻿' : '') + text;
}
