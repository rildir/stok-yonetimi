/** Minimal RFC 4180 CSV parse / stringify (quoted fields, embedded delimiters/newlines, BOM). */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  // Accept ';' as delimiter when the header has none of ',' (Excel with TR locale).
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Parse into objects keyed by trimmed header names. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [head, ...body] = parseCsv(text);
  const headers = (head || []).map((h) => h.trim());
  return {
    headers,
    rows: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

export type CsvLocale = 'en' | 'tr';

function cell(v: unknown, locale: CsvLocale = 'en'): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Turkish Excel: decimal comma for numbers and numeric strings (DECIMAL columns).
  if (locale === 'tr' && (typeof v === 'number' || (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)))) s = s.replace('.', ',');
  // Formula-injection guard for spreadsheet consumers (numbers stay untouched).
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  const special = locale === 'tr' ? /["\r\n;]/ : /[",\r\n;]/;
  return special.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV with a UTF-8 BOM. locale 'tr' (R70, Turkish Excel): ';' separator and decimal comma;
 * default: ',' and decimal point.
 */
export function toCsv(headers: string[], rows: Record<string, unknown>[], locale: CsvLocale = 'en'): string {
  const sep = locale === 'tr' ? ';' : ',';
  const lines = [headers.join(sep), ...rows.map((r) => headers.map((h) => cell(r[h], locale)).join(sep))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
