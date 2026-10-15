/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * SaxonJS (XSLT 3.0 / XPath 3.1 processor, Saxonica) for the schematron and the display template.
 * Loaded lazily: the module is ~2 MB and only needed when e-documents are built or shown.
 */
export interface SaxonApi {
  transform(options: Record<string, unknown>, mode: 'sync'): { principalResult: string | null };
  XPath: { evaluate(expr: string, context: unknown, options?: Record<string, unknown>): any };
}

let saxon: SaxonApi | null = null;

export function saxonJs(): SaxonApi {
  if (!saxon) saxon = require('saxon-js') as SaxonApi;
  return saxon;
}
