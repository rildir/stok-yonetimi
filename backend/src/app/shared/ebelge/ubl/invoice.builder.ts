import { UBL_CUSTOMIZATION_ID } from '../../tr';
import { el, money, Node, num, opt, serialize, txt, ublRoot } from './xml';
import { attachment, documentRef, extensions, header, party, signature, lotInstances, address } from './common';
import { UblAllowanceCharge, UblInvoiceInput, UblInvoiceLine, UblLineTax, UblWithholding } from './model';

/**
 * UBL-TR Invoice (UBL-TR Fatura V1.0, CustomizationID TR1.2): TEMELFATURA / TICARIFATURA /
 * EARSIVFATURA / IHRACAT with types SATIS, IADE, ISTISNA, TEVKIFAT, TEVKIFATIADE, IHRACKAYITLI.
 *
 * Monetary totals follow the GİB convention (UBL-TR Fatura §2.3.43 example): the document
 * LineExtensionAmount is the goods / services total before discounts, AllowanceTotalAmount the
 * discounts, TaxExclusiveAmount = LineExtension - Allowance + Charge, PayableAmount =
 * TaxInclusive - withheld VAT. Line LineExtensionAmount is net of the line discounts.
 */
export function buildInvoiceXml(inv: UblInvoiceInput): string {
  const root = ublRoot('Invoice');
  extensions(root);
  header(root, UBL_CUSTOMIZATION_ID.Invoice, inv.profileId, inv.documentNo, inv.ettn, inv.issueDate, inv.issueTime);
  txt(root, 'cbc:InvoiceTypeCode', inv.typeCode);
  for (const n of inv.notes) opt(root, 'cbc:Note', n);
  txt(root, 'cbc:DocumentCurrencyCode', inv.currency);
  if (inv.currency !== 'TRY') txt(root, 'cbc:PricingCurrencyCode', inv.currency);
  txt(root, 'cbc:LineCountNumeric', inv.lines.length);
  if (inv.orderRef) {
    const o = el(root, 'cac:OrderReference');
    txt(o, 'cbc:ID', inv.orderRef.id);
    txt(o, 'cbc:IssueDate', inv.orderRef.issueDate);
  }
  for (const b of inv.billingRefs || []) documentRef(el(root, 'cac:BillingReference'), 'cac:InvoiceDocumentReference', b);
  for (const d of inv.despatchRefs || []) documentRef(root, 'cac:DespatchDocumentReference', d);
  for (const a of inv.additionalRefs || []) documentRef(root, 'cac:AdditionalDocumentReference', a);
  for (const a of inv.attachments || []) attachment(root, a);
  signature(root, inv.supplier, inv.documentNo);

  party(el(root, 'cac:AccountingSupplierParty'), inv.supplier);
  party(el(root, 'cac:AccountingCustomerParty'), inv.customer);
  if (inv.buyerCustomer) party(el(root, 'cac:BuyerCustomerParty'), inv.buyerCustomer, inv.profileId === 'IHRACAT' ? [{ schemeID: 'PARTYTYPE', value: 'EXPORT' }] : []);
  if (inv.delivery && (inv.delivery.carrier || inv.delivery.actualDate || inv.delivery.address)) {
    const d = el(root, 'cac:Delivery');
    opt(d, 'cbc:ActualDeliveryDate', inv.delivery.actualDate);
    if (inv.delivery.address) address(d, 'cac:DeliveryAddress', inv.delivery.address);
    if (inv.delivery.carrier) {
      const cp = el(d, 'cac:CarrierParty');
      if (inv.delivery.carrier.taxId) txt(el(cp, 'cac:PartyIdentification'), 'cbc:ID', inv.delivery.carrier.taxId, { schemeID: inv.delivery.carrier.taxId.length === 11 ? 'TCKN' : 'VKN' });
      txt(el(cp, 'cac:PartyName'), 'cbc:Name', inv.delivery.carrier.name);
      address(cp, 'cac:PostalAddress', inv.delivery.address || inv.customer.address);
    }
  }
  if (inv.paymentMeans) {
    const pm = el(root, 'cac:PaymentMeans');
    txt(pm, 'cbc:PaymentMeansCode', inv.paymentMeans.code);
    opt(pm, 'cbc:PaymentDueDate', inv.paymentMeans.dueDate);
    opt(pm, 'cbc:InstructionNote', inv.paymentMeans.note);
  }
  for (const a of inv.documentAllowances || []) allowanceCharge(root, a, inv.currency);
  if (inv.currency !== 'TRY') {
    const x = el(root, 'cac:PricingExchangeRate');
    txt(x, 'cbc:SourceCurrencyCode', inv.currency);
    txt(x, 'cbc:TargetCurrencyCode', 'TRY');
    txt(x, 'cbc:CalculationRate', num(inv.exchangeRate || 0, 6));
    opt(x, 'cbc:Date', inv.exchangeRateDate);
  }

  taxTotal(root, groupTaxes(inv.lines.flatMap((l) => l.taxes)), inv.currency, true);
  const wh = groupWithholding(inv.lines.flatMap((l) => l.withholding || []));
  if (wh.length) withholdingTotal(root, wh, inv.currency);

  const t = el(root, 'cac:LegalMonetaryTotal');
  money(t, 'cbc:LineExtensionAmount', inv.totals.lineExtension, inv.currency);
  money(t, 'cbc:TaxExclusiveAmount', inv.totals.taxExclusive, inv.currency);
  money(t, 'cbc:TaxInclusiveAmount', inv.totals.taxInclusive, inv.currency);
  money(t, 'cbc:AllowanceTotalAmount', inv.totals.allowanceTotal, inv.currency);
  money(t, 'cbc:ChargeTotalAmount', inv.totals.chargeTotal, inv.currency);
  money(t, 'cbc:PayableAmount', inv.totals.payable, inv.currency);

  for (const l of inv.lines) invoiceLine(root, l, inv);
  return serialize(root);
}

function allowanceCharge(parent: Node, a: UblAllowanceCharge, currency: string): void {
  const n = el(parent, 'cac:AllowanceCharge');
  txt(n, 'cbc:ChargeIndicator', a.charge ? 'true' : 'false');
  opt(n, 'cbc:AllowanceChargeReason', a.reason);
  if (a.multiplier !== null && a.multiplier !== undefined) txt(n, 'cbc:MultiplierFactorNumeric', num(a.multiplier, 4));
  money(n, 'cbc:Amount', a.amount, currency);
  if (a.base !== null && a.base !== undefined) money(n, 'cbc:BaseAmount', a.base, currency);
}

/** Groups line taxes per tax type, rate and exemption code (document TaxSubtotal rows). */
export function groupTaxes(taxes: UblLineTax[]): UblLineTax[] {
  const map = new Map<string, UblLineTax>();
  for (const t of taxes) {
    const key = `${t.code}|${t.percent}|${t.exemptionCode || ''}`;
    const prev = map.get(key);
    if (prev) {
      prev.taxable = round2(prev.taxable + t.taxable);
      prev.amount = round2(prev.amount + t.amount);
    } else map.set(key, { ...t });
  }
  return [...map.values()];
}

export function groupWithholding(rows: UblWithholding[]): UblWithholding[] {
  const map = new Map<string, UblWithholding>();
  for (const w of rows) {
    const key = `${w.code}|${w.percent}`;
    const prev = map.get(key);
    if (prev) {
      prev.taxable = round2(prev.taxable + w.taxable);
      prev.amount = round2(prev.amount + w.amount);
    } else map.set(key, { ...w });
  }
  return [...map.values()];
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Unit price: 2 decimals, up to 6 when the price has more (R14; PriceAmount is not limited to kuruş). */
export function priceAmount(v: number): string {
  const n = Number(v) || 0;
  const six = n.toFixed(6).replace(/0+$/, '');
  const decimals = six.split('.')[1]?.length || 0;
  return n.toFixed(Math.max(2, decimals));
}

function taxSubtotal(parent: Node, t: UblLineTax, currency: string, sequence?: number): void {
  const s = el(parent, 'cac:TaxSubtotal');
  money(s, 'cbc:TaxableAmount', t.taxable, currency);
  money(s, 'cbc:TaxAmount', t.amount, currency);
  if (sequence) txt(s, 'cbc:CalculationSequenceNumeric', num(sequence));
  txt(s, 'cbc:Percent', num(t.percent, 2));
  const c = el(s, 'cac:TaxCategory');
  opt(c, 'cbc:TaxExemptionReasonCode', t.exemptionCode);
  opt(c, 'cbc:TaxExemptionReason', t.exemptionCode ? t.exemptionReason || t.exemptionCode : null);
  const sch = el(c, 'cac:TaxScheme');
  txt(sch, 'cbc:Name', t.name);
  txt(sch, 'cbc:TaxTypeCode', t.code);
}

function taxTotal(parent: Node, taxes: UblLineTax[], currency: string, sequence = false): void {
  const tt = el(parent, 'cac:TaxTotal');
  money(tt, 'cbc:TaxAmount', round2(taxes.reduce((s, t) => s + t.amount, 0)), currency);
  taxes.forEach((t, i) => taxSubtotal(tt, t, currency, sequence ? i + 1 : undefined));
}

function withholdingTotal(parent: Node, rows: UblWithholding[], currency: string): void {
  const wt = el(parent, 'cac:WithholdingTaxTotal');
  money(wt, 'cbc:TaxAmount', round2(rows.reduce((s, w) => s + w.amount, 0)), currency);
  for (const w of rows) {
    const s = el(wt, 'cac:TaxSubtotal');
    money(s, 'cbc:TaxableAmount', w.taxable, currency);
    money(s, 'cbc:TaxAmount', w.amount, currency);
    txt(s, 'cbc:Percent', num(w.percent, 2));
    const sch = el(el(s, 'cac:TaxCategory'), 'cac:TaxScheme');
    txt(sch, 'cbc:Name', w.name);
    txt(sch, 'cbc:TaxTypeCode', w.code);
  }
}

function invoiceLine(root: Node, l: UblInvoiceLine, inv: UblInvoiceInput): void {
  const c = inv.currency;
  const n = el(root, 'cac:InvoiceLine');
  txt(n, 'cbc:ID', l.id);
  opt(n, 'cbc:Note', l.note);
  txt(n, 'cbc:InvoicedQuantity', num(l.quantity, 6), { unitCode: l.unitCode || 'C62' });
  money(n, 'cbc:LineExtensionAmount', l.lineExtension, c);
  if (inv.profileId === 'IHRACAT' && l.export) exportDelivery(n, l, inv);
  for (const a of l.allowances || []) allowanceCharge(n, a, c);
  taxTotal(n, l.taxes, c);
  if (l.withholding?.length) withholdingTotal(n, l.withholding, c);
  const item = el(n, 'cac:Item');
  txt(item, 'cbc:Name', l.name);
  if (l.buyersItemId) txt(el(item, 'cac:BuyersItemIdentification'), 'cbc:ID', l.buyersItemId);
  if (l.sellersItemId) txt(el(item, 'cac:SellersItemIdentification'), 'cbc:ID', l.sellersItemId);
  for (const a of l.additionalItemIds || []) txt(el(item, 'cac:AdditionalItemIdentification'), 'cbc:ID', a.value, { schemeID: a.schemeID });
  if (l.export?.originCountry) txt(el(item, 'cac:OriginCountry'), 'cbc:IdentificationCode', l.export.originCountry);
  lotInstances(item, l.lots);
  txt(el(n, 'cac:Price'), 'cbc:PriceAmount', priceAmount(l.unitPrice), { currencyID: c });
}

/** IHRACAT line delivery: INCOTERMS, GTİP (RequiredCustomsID), packaging and transport mode (Gümrük İşlemleri Kılavuzu). */
function exportDelivery(line: Node, l: UblInvoiceLine, inv: UblInvoiceInput): void {
  const e = l.export!;
  const d = el(line, 'cac:Delivery');
  address(d, 'cac:DeliveryAddress', inv.buyerCustomer?.address || inv.customer.address);
  txt(el(d, 'cac:DeliveryTerms'), 'cbc:ID', e.incoterms, { schemeID: 'INCOTERMS' });
  const s = el(d, 'cac:Shipment');
  txt(s, 'cbc:ID', '');
  const g = el(s, 'cac:GoodsItem');
  txt(g, 'cbc:RequiredCustomsID', e.gtip);
  const st = el(s, 'cac:ShipmentStage');
  txt(st, 'cbc:TransportModeCode', e.transportModeCode || '3');
  const thu = el(s, 'cac:TransportHandlingUnit');
  const pkg = el(thu, 'cac:ActualPackage');
  txt(pkg, 'cbc:ID', String(l.id));
  txt(pkg, 'cbc:Quantity', num(e.packageCount || 1));
  txt(pkg, 'cbc:PackagingTypeCode', e.packagingTypeCode || 'PK');
}
