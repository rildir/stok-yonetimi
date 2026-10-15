import * as fs from 'fs';
import * as path from 'path';
import { buildInvoiceXml } from './invoice.builder';
import { buildDespatchXml } from './despatch.builder';
import { buildReceiptAdviceXml } from './receipt-advice.builder';
import { buildApplicationResponseXml } from './application-response.builder';
import { validateSchematron, validateUbl, validateXsd } from '../validation/ubl-validator';
import { parseUbl } from './parser';
import {
  branchDespatch,
  dovizInvoice,
  earsivInternetInvoice,
  iadeInvoice,
  istisnaInvoice,
  kabulResponse,
  matbudanDespatch,
  partialReceiptAdvice,
  satisInvoice,
  tevkifatInvoice,
} from './__fixtures__/golden-inputs';

/**
 * Golden UBL-TR documents (WP5): each builder output is compared with the reviewed file under
 * __fixtures__/golden (regenerate with UPDATE_GOLDEN=1) and must pass the GİB XSD and schematron.
 */
const GOLDEN = path.join(__dirname, '__fixtures__/golden');
const update = process.env['UPDATE_GOLDEN'] === '1';

const cases: { name: string; type: 'Invoice' | 'DespatchAdvice' | 'ReceiptAdvice' | 'ApplicationResponse'; xml: () => string; earchive?: boolean }[] = [
  { name: 'satis-temel', type: 'Invoice', xml: () => buildInvoiceXml(satisInvoice()) },
  { name: 'istisna-301-earsiv', type: 'Invoice', xml: () => buildInvoiceXml(istisnaInvoice()), earchive: true },
  { name: 'tevkifat-627', type: 'Invoice', xml: () => buildInvoiceXml(tevkifatInvoice()) },
  { name: 'iade', type: 'Invoice', xml: () => buildInvoiceXml(iadeInvoice()) },
  { name: 'doviz-usd-ticari', type: 'Invoice', xml: () => buildInvoiceXml(dovizInvoice()) },
  { name: 'earsiv-internet', type: 'Invoice', xml: () => buildInvoiceXml(earsivInternetInvoice()), earchive: true },
  { name: 'irsaliye-subeler-arasi', type: 'DespatchAdvice', xml: () => buildDespatchXml(branchDespatch()) },
  { name: 'irsaliye-matbudan', type: 'DespatchAdvice', xml: () => buildDespatchXml(matbudanDespatch()) },
  { name: 'irsaliye-yaniti-kismi', type: 'ReceiptAdvice', xml: () => buildReceiptAdviceXml(partialReceiptAdvice()) },
  { name: 'uygulama-yaniti-kabul', type: 'ApplicationResponse', xml: () => buildApplicationResponseXml(kabulResponse()) },
];

describe('UBL-TR golden documents', () => {
  if (update) fs.mkdirSync(GOLDEN, { recursive: true });

  it.each(cases)('$name matches the golden file and passes XSD + schematron', async (c) => {
    const xml = c.xml();
    const file = path.join(GOLDEN, `${c.name}.xml`);
    if (update) fs.writeFileSync(file, xml);
    expect(xml).toBe(fs.readFileSync(file, 'utf8'));
    const issues = await validateUbl(xml, c.type, { earchive: c.earchive });
    expect(issues.map((i) => i.tr)).toEqual([]);
  }, 60000);

  it('XSD validation reports structural errors', async () => {
    const xml = buildInvoiceXml(satisInvoice()).replace('<cbc:IssueDate>2026-10-14</cbc:IssueDate>', '');
    const issues = await validateXsd(xml, 'Invoice');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].source).toBe('XSD');
  });

  it('schematron errors come in Turkish and English', () => {
    const inv = satisInvoice();
    inv.customer = { ...inv.customer, identifiers: [{ schemeID: 'VKN', value: '73184620' }] };
    const issues = validateSchematron(buildInvoiceXml(inv));
    const vkn = issues.find((i) => i.tr.includes('10 haneli'));
    expect(vkn).toBeDefined();
    expect(vkn!.en).toBe('A VKN must have 10 digits.');
  });

  it('e-Arşiv runs the schematron with type=earchive (TEMELFATURA is rejected there)', () => {
    const inv = earsivInternetInvoice();
    inv.profileId = 'TEMELFATURA';
    expect(validateSchematron(buildInvoiceXml(inv), { earchive: true }).some((i) => i.tr.includes('ProfileIDTypeEarchive'))).toBe(true);
  });
});

describe('UBL-TR totals consistency', () => {
  it.each([
    ['SATIS', satisInvoice()],
    ['TEVKIFAT', tevkifatInvoice()],
    ['DOVIZ', dovizInvoice()],
    ['ISTISNA', istisnaInvoice()],
  ])('%s: LineExtension, TaxExclusive, TaxInclusive, Allowance and Payable add up', (_n, input) => {
    const doc = parseUbl(buildInvoiceXml(input));
    const lt = doc.legalMonetaryTotal!;
    const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;
    const lineNet = sum(doc.lines.map((l) => l.lineExtension));
    const lineAllowance = sum(doc.lines.map((l) => l.allowance));
    expect(lt.lineExtension).toBe(sum([lineNet, lineAllowance]));
    expect(lt.taxExclusive).toBe(sum([lt.lineExtension, -lt.allowanceTotal, lt.chargeTotal]));
    expect(lt.taxInclusive).toBe(sum([lt.taxExclusive, doc.taxTotal]));
    expect(lt.payable).toBe(sum([lt.taxInclusive, -doc.withholdingTotal]));
    expect(doc.taxTotal).toBe(sum(doc.lines.map((l) => l.taxAmount)));
    for (const l of doc.lines) expect(l.lineExtension).toBe(sum([l.quantity * l.unitPrice, -l.allowance]));
  });
});
