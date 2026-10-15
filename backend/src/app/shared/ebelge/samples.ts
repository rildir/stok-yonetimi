import { randomUUID } from 'crypto';
import { buildInvoiceXml } from './ubl/invoice.builder';
import { buildDespatchXml } from './ubl/despatch.builder';
import { UblInvoiceLine, UblParty } from './ubl/model';

/**
 * Incoming documents produced by the mock integrator (demo data and "Örnek gelen belge oluştur"):
 * real UBL-TR built with the same builders as outgoing documents.
 */
export interface SampleLine {
  name: string;
  sku?: string | null;
  quantity: number;
  unitCode?: string | null;
  unitPrice: number;
  vatRate: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function sampleInvoice(opts: {
  ettn?: string;
  documentNo: string;
  issueDate: string;
  issueTime?: string;
  profileId: 'TEMELFATURA' | 'TICARIFATURA' | 'EARSIVFATURA';
  typeCode?: 'SATIS' | 'IADE';
  supplier: UblParty;
  customer: UblParty;
  lines: SampleLine[];
  orderRef?: { id: string; issueDate: string } | null;
  despatchRefs?: { id: string; issueDate: string }[];
  billingRefs?: { id: string; issueDate: string }[];
  notes?: string[];
}): { ettn: string; xml: string } {
  const ettn = opts.ettn || randomUUID();
  const lines: UblInvoiceLine[] = opts.lines.map((l, i) => {
    const net = r2(l.quantity * l.unitPrice);
    const tax = r2((net * l.vatRate) / 100);
    return { id: i + 1, name: l.name, sellersItemId: l.sku ?? null, quantity: l.quantity, unitCode: l.unitCode || 'C62', unitPrice: l.unitPrice, lineExtension: net, taxes: [{ code: '0015', name: 'KDV', percent: l.vatRate, taxable: net, amount: tax }] };
  });
  const net = r2(lines.reduce((s, l) => s + l.lineExtension, 0));
  const tax = r2(lines.reduce((s, l) => s + l.taxes[0].amount, 0));
  const xml = buildInvoiceXml({
    ettn,
    documentNo: opts.documentNo,
    profileId: opts.profileId,
    typeCode: opts.typeCode || 'SATIS',
    issueDate: opts.issueDate,
    issueTime: opts.issueTime || '09:30:00',
    currency: 'TRY',
    notes: opts.notes || [],
    orderRef: opts.orderRef ?? null,
    despatchRefs: opts.despatchRefs || [],
    billingRefs: (opts.billingRefs || []).map((b) => ({ ...b, documentTypeCode: 'IADE' })),
    supplier: opts.supplier,
    customer: opts.customer,
    lines,
    totals: { lineExtension: net, taxExclusive: net, taxInclusive: r2(net + tax), allowanceTotal: 0, chargeTotal: 0, payable: r2(net + tax) },
  });
  return { ettn, xml };
}

export function sampleDespatch(opts: {
  ettn?: string;
  documentNo: string;
  issueDate: string;
  issueTime?: string;
  actualDespatchDate: string;
  actualDespatchTime?: string;
  supplier: UblParty;
  customer: UblParty;
  lines: Omit<SampleLine, 'unitPrice' | 'vatRate'>[];
  orderRef?: { id: string; issueDate: string } | null;
  driver?: { firstName: string; familyName: string; tckn: string };
  plate?: string;
}): { ettn: string; xml: string } {
  const ettn = opts.ettn || randomUUID();
  const xml = buildDespatchXml({
    ettn,
    documentNo: opts.documentNo,
    profileId: 'TEMELIRSALIYE',
    typeCode: 'SEVK',
    issueDate: opts.issueDate,
    issueTime: opts.issueTime || '08:00:00',
    notes: [],
    orderRef: opts.orderRef ?? null,
    supplier: opts.supplier,
    customer: opts.customer,
    deliveryAddress: opts.customer.address,
    despatchAddress: opts.supplier.address,
    drivers: opts.driver ? [opts.driver] : [],
    plates: opts.plate ? [opts.plate] : [],
    trailerPlates: [],
    actualDespatchDate: opts.actualDespatchDate,
    actualDespatchTime: opts.actualDespatchTime || '08:30:00',
    lines: opts.lines.map((l, i) => ({ id: i + 1, name: l.name, sellersItemId: l.sku ?? null, quantity: l.quantity, unitCode: l.unitCode || 'C62' })),
  });
  return { ettn, xml };
}
