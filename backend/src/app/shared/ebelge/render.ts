import * as fs from 'fs';
import * as path from 'path';
import { ebelgeAsset, readEbelgeAsset } from './assets';
import { saxonJs } from './saxon';
import { parseUbl } from './ubl/parser';
import { qrPayload, qrSvg } from './qr';
import { UblAttachment } from './ubl/model';
import { maskPersonalIdsInText, maskQrPayload } from '../kvkk/masking';

/**
 * Display of e-documents (509 V.3-V.4): the default XSLT (GİB emblem, "T.C. Hazine ve Maliye
 * Bakanlığı / Gelir İdaresi Başkanlığı", document title, mandatory wordings, karekod top right)
 * rendered server side with SaxonJS (SEF compiled by tools/ebelge/build-ebelge-assets.js); the QR
 * JSON placeholder becomes an SVG. PDF: headless Chromium with "Sayfa x / y" in the footer.
 */
let displaySef: unknown = null;

function sef(): unknown {
  if (!displaySef) displaySef = JSON.parse(fs.readFileSync(ebelgeAsset('xslt/edocument.sef.json'), 'utf8'));
  return displaySef;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * `maskPii` (caller without customers.pii.read, R61): the karekod is built from a payload whose
 * natural-person identifiers (vkntckn / avkntckn / tasiyicivkn holding a TCKN) are masked, so the
 * QR image cannot be scanned for the clear TCKN, and every TCKN in the HTML text is masked.
 */
export async function renderHtml(xml: string, opts: { logoDataUri?: string | null; watermark?: string | null; maskPii?: boolean } = {}): Promise<string> {
  const parsed = parseUbl(xml);
  const rawQr = qrPayload(parsed);
  const qr = rawQr && opts.maskPii ? maskQrPayload(rawQr) : rawQr;
  const res = saxonJs().transform(
    {
      stylesheetInternal: sef(),
      sourceText: xml,
      destination: 'serialized',
      stylesheetParams: { logo: opts.logoDataUri || '', qr: qr ? JSON.stringify(qr) : '' },
    },
    'sync',
  );
  let html = res.principalResult || '';
  if (qr) {
    const svg = await qrSvg(qr);
    html = html.replace(/<div class="qr" id="ebelge-qr" data-qr="[^"]*">\s*<!--QR-->\s*<\/div>/, `<div class="qr" id="ebelge-qr" title="${escapeAttr(JSON.stringify(qr))}">${svg}</div>`);
  }
  if (opts.watermark) {
    html = html.replace('</body>', `<div style="position:fixed;top:40%;left:0;right:0;text-align:center;font-size:64px;color:rgba(200,0,0,.18);transform:rotate(-20deg);pointer-events:none">${escapeAttr(opts.watermark)}</div></body>`);
  }
  if (opts.maskPii) html = maskPersonalIdsInText(html);
  return html.startsWith('<!DOCTYPE') ? html : `<!DOCTYPE html>${html}`;
}

/** The display XSLT embedded in each UBL document (AdditionalDocumentReference, base64). */
export function xsltAttachment(documentNo: string, issueDate: string, logoDataUri?: string | null): UblAttachment {
  let xslt = readEbelgeAsset('xslt/edocument.xslt');
  if (logoDataUri) xslt = xslt.replace(`<xsl:param name="logo" select="''"/>`, `<xsl:param name="logo" select="'${logoDataUri.replace(/'/g, '')}'"/>`);
  return { id: documentNo, issueDate, documentType: 'XSLT', fileName: `${documentNo}.xslt`, mimeCode: 'application/xml', base64: Buffer.from(xslt, 'utf8').toString('base64') };
}

let browserPromise: Promise<any> | null = null;

/**
 * Browser for PDF output: EBELGE_CHROMIUM_PATH, else the newest Chromium / headless shell installed by
 * Playwright (ms-playwright cache), else playwright-core's own default.
 */
export function chromiumExecutable(env: Record<string, string | undefined> = process.env): string | null {
  if (env['EBELGE_CHROMIUM_PATH'] && fs.existsSync(env['EBELGE_CHROMIUM_PATH'])) return env['EBELGE_CHROMIUM_PATH'];
  const home = env['USERPROFILE'] || env['HOME'] || '';
  const roots = [env['PLAYWRIGHT_BROWSERS_PATH'], home && path.join(home, 'AppData/Local/ms-playwright'), home && path.join(home, '.cache/ms-playwright'), home && path.join(home, 'Library/Caches/ms-playwright')].filter(Boolean) as string[];
  const candidates: { rev: number; file: string }[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const m = /^(chromium_headless_shell|chromium)-(\d+)$/.exec(dir);
      if (!m) continue;
      for (const rel of ['chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const file = path.join(root, dir, rel);
        if (fs.existsSync(file)) candidates.push({ rev: Number(m[2]), file });
      }
    }
  }
  candidates.sort((a, b) => b.rev - a.rev);
  return candidates[0]?.file || null;
}

/** HTML -> PDF with headless Chromium (playwright-core). Throws when no browser is installed. */
export async function htmlToPdf(html: string, footerLabel = 'Sayfa'): Promise<Buffer> {
  if (!browserPromise) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright-core') as typeof import('playwright-core');
    const exe = chromiumExecutable();
    browserPromise = chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) }).catch((e: Error) => {
      browserPromise = null;
      throw e;
    });
  }
  const browser = await browserPromise;
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '16mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#555">${footerLabel} <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
  } finally {
    await page.close();
  }
}
