import { saxonJs } from '../saxon';
import { NS } from './xml';

/**
 * Reads the business content of a UBL-TR document (incoming invoices / despatch advices from the
 * provider, archived copies, tests). XPath 3.1 via SaxonJS; the document element is matched by
 * local name so any prefix convention of the sender works.
 */
export interface ParsedParty {
  schemeID: string | null;
  taxId: string | null;
  name: string;
  taxOffice: string | null;
  address: { street: string | null; buildingNumber: string | null; district: string | null; city: string | null; postalZone: string | null; country: string | null };
  email: string | null;
}

export interface ParsedLine {
  id: string;
  name: string;
  sellersItemId: string | null;
  quantity: number;
  unitCode: string | null;
  unitPrice: number;
  lineExtension: number;
  allowance: number;
  taxAmount: number;
  taxPercent: number | null;
  orderLineId: string | null;
  received?: number;
  rejected?: number;
  short?: number;
  oversupply?: number;
  rejectReason?: string | null;
  despatchLineId?: string | null;
}

export interface ParsedRef {
  id: string;
  issueDate: string | null;
  typeCode: string | null;
  type: string | null;
}

export interface ParsedUbl {
  docType: string;
  customizationId: string | null;
  profileId: string | null;
  id: string | null;
  uuid: string | null;
  issueDate: string | null;
  issueTime: string | null;
  typeCode: string | null;
  currency: string | null;
  exchangeRate: number | null;
  notes: string[];
  supplier: ParsedParty | null;
  customer: ParsedParty | null;
  orderRef: ParsedRef | null;
  despatchRefs: ParsedRef[];
  billingRefs: ParsedRef[];
  additionalRefs: ParsedRef[];
  actualDespatchDate: string | null;
  actualDespatchTime: string | null;
  legalMonetaryTotal: { lineExtension: number; taxExclusive: number; taxInclusive: number; allowanceTotal: number; chargeTotal: number; payable: number } | null;
  taxTotal: number;
  /** Document-level tax subtotals (QR code kdvmatrah(..) / hesaplanankdv(..)) */
  taxSubtotals: { code: string; percent: number; taxable: number; amount: number }[];
  withholdingTotal: number;
  carrierTaxId: string | null;
  plates: string[];
  lines: ParsedLine[];
  response: { code: string | null; description: string | null; referencedId: string | null } | null;
}

const ctx = { cac: NS.cac, cbc: NS.cbc };

export function parseUbl(xml: string): ParsedUbl {
  const S = saxonJs();
  const doc = S.XPath.evaluate('parse-xml($x)', null, { params: { x: xml } });
  const root = S.XPath.evaluate('/*', doc);
  const s = (expr: string, node: unknown = root): string | null => {
    const v = S.XPath.evaluate(`string((${expr})[1])`, node, { namespaceContext: ctx }) as string;
    return v === '' ? null : String(v).trim();
  };
  const n = (expr: string, node: unknown = root): number => {
    const v = S.XPath.evaluate(`sum((${expr})[. castable as xs:decimal] ! xs:decimal(.))`, node, { namespaceContext: ctx });
    return Math.round(Number(v) * 1e6) / 1e6;
  };
  const list = (expr: string, node: unknown = root): unknown[] => S.XPath.evaluate(expr, node, { namespaceContext: ctx, resultForm: 'array' }) as unknown[];
  const docType = String(S.XPath.evaluate('local-name(/*)', doc));

  const party = (path: string): ParsedParty | null => {
    const p = list(path)[0];
    if (!p) return null;
    const id = list('cac:PartyIdentification/cbc:ID[@schemeID = ("VKN", "TCKN")]', p)[0];
    const person = [s('cac:Person/cbc:FirstName', p), s('cac:Person/cbc:FamilyName', p)].filter(Boolean).join(' ');
    return {
      schemeID: id ? s('@schemeID', id) : null,
      taxId: id ? s('.', id) : null,
      name: s('cac:PartyName/cbc:Name', p) || person || '-',
      taxOffice: s('cac:PartyTaxScheme/cac:TaxScheme/cbc:Name', p),
      address: {
        street: s('cac:PostalAddress/cbc:StreetName', p),
        buildingNumber: s('cac:PostalAddress/cbc:BuildingNumber', p),
        district: s('cac:PostalAddress/cbc:CitySubdivisionName', p),
        city: s('cac:PostalAddress/cbc:CityName', p),
        postalZone: s('cac:PostalAddress/cbc:PostalZone', p),
        country: s('cac:PostalAddress/cac:Country/cbc:Name', p),
      },
      email: s('cac:Contact/cbc:ElectronicMail', p),
    };
  };
  const refs = (path: string): ParsedRef[] =>
    list(path).map((r) => ({ id: s('cbc:ID', r) || '', issueDate: s('cbc:IssueDate', r), typeCode: s('cbc:DocumentTypeCode', r), type: s('cbc:DocumentType', r) }));

  const isInvoice = docType === 'Invoice';
  const isDespatch = docType === 'DespatchAdvice';
  const isReceipt = docType === 'ReceiptAdvice';
  // supplier = issuer of the document (a receipt advice is issued by the receiver of the goods).
  const supplierPath = isInvoice ? 'cac:AccountingSupplierParty/cac:Party' : isDespatch ? 'cac:DespatchSupplierParty/cac:Party' : isReceipt ? 'cac:DeliveryCustomerParty/cac:Party' : 'cac:SenderParty';
  const customerPath = isInvoice ? 'cac:AccountingCustomerParty/cac:Party' : isDespatch ? 'cac:DeliveryCustomerParty/cac:Party' : isReceipt ? 'cac:DespatchSupplierParty/cac:Party' : 'cac:ReceiverParty';
  const lineName = isInvoice ? 'cac:InvoiceLine' : isDespatch ? 'cac:DespatchLine' : isReceipt ? 'cac:ReceiptLine' : '';
  const lines: ParsedLine[] = lineName
    ? list(lineName).map((l) => ({
        id: s('cbc:ID', l) || '',
        name: s('cac:Item/cbc:Name', l) || '',
        sellersItemId: s('cac:Item/cac:SellersItemIdentification/cbc:ID', l),
        quantity: n(isInvoice ? 'cbc:InvoicedQuantity' : isDespatch ? 'cbc:DeliveredQuantity' : 'cbc:ReceivedQuantity', l),
        unitCode: s(isInvoice ? 'cbc:InvoicedQuantity/@unitCode' : isDespatch ? 'cbc:DeliveredQuantity/@unitCode' : 'cbc:ReceivedQuantity/@unitCode', l),
        unitPrice: n('cac:Price/cbc:PriceAmount', l),
        lineExtension: n('cbc:LineExtensionAmount', l),
        allowance: n('cac:AllowanceCharge[cbc:ChargeIndicator = "false"]/cbc:Amount', l),
        taxAmount: n('cac:TaxTotal/cbc:TaxAmount', l),
        taxPercent: s('cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = "0015"]/cbc:Percent', l) !== null ? n('cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = "0015"]/cbc:Percent', l) : null,
        orderLineId: s('cac:OrderLineReference/cbc:LineID', l),
        ...(isReceipt
          ? { received: n('cbc:ReceivedQuantity', l), rejected: n('cbc:RejectedQuantity', l), short: n('cbc:ShortQuantity', l), oversupply: n('cbc:OversupplyQuantity', l), rejectReason: s('cbc:RejectReason', l), despatchLineId: s('cac:DespatchLineReference/cbc:LineID', l) }
          : {}),
      }))
    : [];
  const hasLmt = list('cac:LegalMonetaryTotal').length > 0;
  return {
    docType,
    customizationId: s('cbc:CustomizationID'),
    profileId: s('cbc:ProfileID'),
    id: s('cbc:ID'),
    uuid: s('cbc:UUID'),
    issueDate: s('cbc:IssueDate'),
    issueTime: s('cbc:IssueTime'),
    typeCode: s('cbc:InvoiceTypeCode | cbc:DespatchAdviceTypeCode | cbc:ReceiptAdviceTypeCode'),
    currency: s('cbc:DocumentCurrencyCode'),
    exchangeRate: s('cac:PricingExchangeRate/cbc:CalculationRate') ? n('cac:PricingExchangeRate/cbc:CalculationRate') : null,
    notes: list('cbc:Note').map((x) => s('.', x) || '').filter(Boolean),
    supplier: party(supplierPath),
    customer: party(customerPath),
    orderRef: refs('cac:OrderReference')[0] || null,
    despatchRefs: refs('cac:DespatchDocumentReference'),
    billingRefs: refs('cac:BillingReference/cac:InvoiceDocumentReference'),
    additionalRefs: refs('cac:AdditionalDocumentReference'),
    actualDespatchDate: s('cac:Shipment/cac:Delivery/cac:Despatch/cbc:ActualDespatchDate'),
    actualDespatchTime: s('cac:Shipment/cac:Delivery/cac:Despatch/cbc:ActualDespatchTime'),
    legalMonetaryTotal: hasLmt
      ? {
          lineExtension: n('cac:LegalMonetaryTotal/cbc:LineExtensionAmount'),
          taxExclusive: n('cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount'),
          taxInclusive: n('cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount'),
          allowanceTotal: n('cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount'),
          chargeTotal: n('cac:LegalMonetaryTotal/cbc:ChargeTotalAmount'),
          payable: n('cac:LegalMonetaryTotal/cbc:PayableAmount'),
        }
      : null,
    taxTotal: n('cac:TaxTotal/cbc:TaxAmount'),
    taxSubtotals: list('cac:TaxTotal/cac:TaxSubtotal').map((t) => ({
      code: s('cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode', t) || '',
      percent: n('cbc:Percent', t),
      taxable: n('cbc:TaxableAmount', t),
      amount: n('cbc:TaxAmount', t),
    })),
    withholdingTotal: n('cac:WithholdingTaxTotal/cbc:TaxAmount'),
    carrierTaxId: s('cac:Shipment/cac:Delivery/cac:CarrierParty/cac:PartyIdentification/cbc:ID | cac:Delivery/cac:CarrierParty/cac:PartyIdentification/cbc:ID'),
    plates: list('cac:Shipment/cac:ShipmentStage/cac:TransportMeans/cac:RoadTransport/cbc:LicensePlateID').map((x) => s('.', x) || '').filter(Boolean),
    lines,
    response:
      docType === 'ApplicationResponse'
        ? { code: s('cac:DocumentResponse/cac:Response/cbc:ResponseCode'), description: s('cac:DocumentResponse/cac:Response/cbc:Description'), referencedId: s('cac:DocumentResponse/cac:DocumentReference/cbc:ID') }
        : null,
  };
}
