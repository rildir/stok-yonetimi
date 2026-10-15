import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';

/** UBL 2.1 namespaces used by UBL-TR documents. */
export const NS = {
  Invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  DespatchAdvice: 'urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2',
  ReceiptAdvice: 'urn:oasis:names:specification:ubl:schema:xsd:ReceiptAdvice-2',
  ApplicationResponse: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
} as const;

export type Node = XMLBuilder;
type Attrs = Record<string, string | number | null | undefined>;

/** Root element with the UBL namespace declarations. */
export function ublRoot(type: 'Invoice' | 'DespatchAdvice' | 'ReceiptAdvice' | 'ApplicationResponse'): Node {
  return create({ version: '1.0', encoding: 'UTF-8' }).ele(NS[type], type, {
    'xmlns:cac': NS.cac,
    'xmlns:cbc': NS.cbc,
    'xmlns:ext': NS.ext,
    'xmlns:ds': NS.ds,
    'xmlns:xades': NS.xades,
    'xmlns:xsi': NS.xsi,
  });
}

function nsOf(name: string): string {
  const prefix = name.split(':')[0] as keyof typeof NS;
  const ns = NS[prefix];
  if (!ns) throw new Error(`unknown prefix ${prefix}`);
  return ns;
}

function cleanAttrs(attrs?: Attrs): Record<string, string> | undefined {
  if (!attrs) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== '') out[k] = String(v);
  return out;
}

/** Child element (aggregate). */
export function el(parent: Node, name: string, attrs?: Attrs): Node {
  return parent.ele(nsOf(name), name, cleanAttrs(attrs));
}

/** Child element with text; always written (use `opt` for optional values). */
export function txt(parent: Node, name: string, value: string | number | boolean, attrs?: Attrs): Node {
  parent.ele(nsOf(name), name, cleanAttrs(attrs)).txt(String(value));
  return parent;
}

/** Child element with text, skipped when the value is empty. */
export function opt(parent: Node, name: string, value: string | number | null | undefined, attrs?: Attrs): Node {
  if (value === null || value === undefined || String(value).trim() === '') return parent;
  return txt(parent, name, String(value).trim(), attrs);
}

/** Amount with 2 decimals (UBL-TR monetary values). */
export function amt(v: number | null | undefined): string {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return (Object.is(n, -0) ? 0 : n).toFixed(2);
}

/** Quantity / rate without trailing zeros (max 6 decimals). */
export function num(v: number | null | undefined, max = 6): string {
  const n = Number(v) || 0;
  return String(Number(n.toFixed(max)));
}

export function money(parent: Node, name: string, value: number | null | undefined, currency: string): Node {
  return txt(parent, name, amt(value), { currencyID: currency });
}

export function serialize(root: Node): string {
  return root.end({ prettyPrint: true, indent: '\t', newline: '\n' }) + '\n';
}
