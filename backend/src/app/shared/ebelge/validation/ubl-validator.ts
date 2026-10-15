import * as fs from 'fs';
import * as path from 'path';
import { ebelgeAsset } from '../assets';
import { saxonJs } from '../saxon';
import { englishSchematronMessage, shortLocation } from './schematron-messages';

/**
 * Local validation before anything is handed to the integrator (509 V.2; WP5):
 *  1. XSD: GİB UBL-TR 1.2.1 package (vendor/ubltr-1.2.1/xsdrt) with libxml2 (xmllint-wasm);
 *  2. Schematron: the official GİB schematron (vendor/schematron, compiled to SaxonJS SEF by
 *     tools/ebelge/build-ebelge-assets.js); e-Arşiv invoices run with the parameter type=earchive.
 * Every issue carries a Turkish and an English text (the GİB texts are Turkish; see schematron-messages.ts).
 */
export type UblDocType = 'Invoice' | 'DespatchAdvice' | 'ReceiptAdvice' | 'ApplicationResponse';

export interface UblIssue {
  source: 'XSD' | 'SCHEMATRON' | 'PRECHECK';
  tr: string;
  en: string;
  location?: string | null;
}

let xsdFiles: { fileName: string; contents: string }[] | null = null;
let schematronSef: unknown = null;

function loadXsds(): { fileName: string; contents: string }[] {
  if (xsdFiles) return xsdFiles;
  const root = ebelgeAsset('vendor/ubltr-1.2.1/xsdrt');
  const out: { fileName: string; contents: string }[] = [];
  for (const sub of ['common', 'maindoc']) {
    for (const f of fs.readdirSync(path.join(root, sub))) out.push({ fileName: `${sub}/${f}`, contents: fs.readFileSync(path.join(root, sub, f), 'utf8') });
  }
  xsdFiles = out;
  return out;
}

function loadSchematron(): unknown {
  if (!schematronSef) schematronSef = JSON.parse(fs.readFileSync(ebelgeAsset('vendor/schematron/ubltr-schematron.sef.json'), 'utf8'));
  return schematronSef;
}

const stripNs = (s: string) => s.replace(/\{[^}]*\}/g, '');

export async function validateXsd(xml: string, docType: UblDocType): Promise<UblIssue[]> {
  // Loaded lazily (WebAssembly module).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { validateXML } = require('xmllint-wasm') as typeof import('xmllint-wasm');
  const files = loadXsds();
  const schemaName = `maindoc/UBL-${docType}-2.1.xsd`;
  const schema = files.find((f) => f.fileName === schemaName);
  if (!schema) throw new Error(`XSD ${schemaName} missing`);
  const res = await validateXML({
    xml: [{ fileName: 'document.xml', contents: xml }],
    schema: [schema],
    preload: files.filter((f) => f !== schema),
  });
  return (res.errors || []).map((e: any) => {
    const msg = stripNs(String(e.message || e.rawMessage || '')).trim();
    const line = e.loc?.lineNumber ?? null;
    return {
      source: 'XSD' as const,
      tr: `UBL-TR XSD şema hatası${line ? ` (satır ${line})` : ''}: ${msg}`,
      en: `UBL-TR XSD schema error${line ? ` (line ${line})` : ''}: ${msg}`,
      location: line ? `line ${line}` : null,
    };
  });
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function validateSchematron(xml: string, opts: { earchive?: boolean } = {}): UblIssue[] {
  const res = saxonJs().transform(
    {
      stylesheetInternal: loadSchematron(),
      sourceText: xml,
      destination: 'serialized',
      stylesheetParams: opts.earchive ? { type: 'earchive' } : {},
    },
    'sync',
  );
  const svrl = res.principalResult || '';
  const out: UblIssue[] = [];
  for (const m of svrl.matchAll(/<svrl:failed-assert\b([^>]*)>([^]*?)<\/svrl:failed-assert>/g)) {
    const location = /location="([^"]*)"/.exec(m[1])?.[1] || null;
    const text = decode(/<svrl:text>([^]*?)<\/svrl:text>/.exec(m[2])?.[1] || '').replace(/\s+/g, ' ').trim();
    const loc = location ? shortLocation(decode(location)) : null;
    out.push({ source: 'SCHEMATRON', tr: loc ? `${text} (${loc})` : text, en: englishSchematronMessage(text, location ? decode(location) : null), location: loc });
  }
  return out;
}

/** XSD first (a schema error makes the schematron results meaningless), then schematron. */
export async function validateUbl(xml: string, docType: UblDocType, opts: { earchive?: boolean } = {}): Promise<UblIssue[]> {
  const xsd = await validateXsd(xml, docType);
  if (xsd.length) return xsd;
  return validateSchematron(xml, opts);
}
