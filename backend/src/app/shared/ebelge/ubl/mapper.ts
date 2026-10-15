import type { InvoiceEntity } from '../../../entities/invoice.entity';
import type { DespatchEntity } from '../../../entities/despatch.entity';
import type { PartySnapshot } from '../../../entities/document-common';
import { dateKeyInZone, SpecialTaxId, timeKeyInZone } from '../../tr';
import type { UblIssue } from '../validation/ubl-validator';
import { UblAddress, UblAttachment, UblDespatchInput, UblInvoiceInput, UblInvoiceLine, UblLineTax, UblParty } from './model';

/**
 * Maps the frozen WP4 documents to the builder model and pre-checks what the GİB schematron
 * would reject with a less readable message (missing address parts, buyer identity, totals).
 */
export interface MapContext {
  timezone: string;
  exemptionNames?: Record<string, string>;
  withholdingNames?: Record<string, string>;
  otvNames?: Record<string, string>;
  /** Placeholder identities (legal parameter SPECIAL_TAX_IDS) */
  specialIds?: SpecialTaxId[];
  orderRef?: { id: string; issueDate: string } | null;
  extraOrderNumbers?: string[];
  /** e-Arşiv: ELEKTRONIK | KAGIT (printed on the invoice and reported by the integrator) */
  earsivSendType?: 'ELEKTRONIK' | 'KAGIT' | null;
  xslt?: UblAttachment | null;
  products?: Record<string, { sku?: string | null; gtin14?: string | null; regulatoryCategory?: string | null }>;
  sectoralItemIds?: boolean;
  /** IHRACAT: customs party (legal parameters EXPORT_GTB_VKN / EXPORT_GTB_PARTY) */
  exportCustoms?: { vkn: string; name: string; district: string; city: string; taxOffice?: string | null } | null;
}

const issue = (tr: string, en: string): UblIssue => ({ source: 'PRECHECK', tr, en });

const COUNTRY_NAMES: Record<string, string> = {
  TR: 'Türkiye', DE: 'Almanya', GR: 'Yunanistan', US: 'Amerika Birleşik Devletleri', GB: 'Birleşik Krallık', FR: 'Fransa', IT: 'İtalya', NL: 'Hollanda',
  BE: 'Belçika', ES: 'İspanya', AT: 'Avusturya', CH: 'İsviçre', BG: 'Bulgaristan', RO: 'Romanya', AZ: 'Azerbaycan', IQ: 'Irak', IR: 'İran', RU: 'Rusya Federasyonu',
  CN: 'Çin Halk Cumhuriyeti', AE: 'Birleşik Arap Emirlikleri', SA: 'Suudi Arabistan', SY: 'Suriye', GE: 'Gürcistan', UA: 'Ukrayna', PL: 'Polonya', SE: 'İsveç',
};

const CHARGE_NAMES: Record<string, string> = { SHIPPING: 'Nakliye bedeli', PACKAGING: 'Ambalaj bedeli', INSURANCE: 'Sigorta bedeli', OTHER: 'Diğer masraf' };

export function countryName(code?: string | null): string {
  const c = String(code || 'TR').toUpperCase();
  return COUNTRY_NAMES[c] || c;
}

export function addressFromSnapshot(a: PartySnapshot['address'] | null | undefined): UblAddress {
  const street = [a?.line1, a?.line2].filter((x) => x && String(x).trim()).join(' ');
  return {
    street: street || null,
    buildingNumber: null,
    district: a?.district || '',
    city: a?.province || '',
    postalZone: a?.postalCode || null,
    country: countryName(a?.country),
    countryCode: a?.country ? String(a.country).toUpperCase() : 'TR',
  };
}

function splitName(name: string): { firstName: string; familyName: string } {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || '-', familyName: '-' };
  return { firstName: parts.slice(0, -1).join(' '), familyName: parts[parts.length - 1] };
}

/**
 * Party of a snapshot. Identity: VKN -> schemeID VKN; TCKN / YKN -> TCKN with the person's name;
 * foreign buyers and anonymous final consumers use the placeholders of legal parameter
 * SPECIAL_TAX_IDS for the scope (e-Arşiv: 2222222222 / 11111111111; low confidence, see Ek list).
 */
export function partyFromSnapshot(s: PartySnapshot | null | undefined, scope: 'EFATURA' | 'EARSIV' | 'EIRSALIYE', specialIds: SpecialTaxId[] = [], role = 'buyer'): { party: UblParty; issues: UblIssue[] } {
  const issues: UblIssue[] = [];
  const snap: PartySnapshot = s || { name: '-' };
  const type = String(snap.taxIdType || '').toUpperCase();
  const taxId = String(snap.taxId || '').replace(/\s/g, '');
  const ids: UblParty['identifiers'] = [];
  let person: UblParty['person'] = null;
  if (type === 'VKN' && /^\d{10}$/.test(taxId)) ids.push({ schemeID: 'VKN', value: taxId });
  else if ((type === 'TCKN' || type === 'YKN') && /^\d{11}$/.test(taxId)) {
    ids.push({ schemeID: 'TCKN', value: taxId });
    person = splitName(snap.name);
  } else {
    const wantType = type === 'FOREIGN' ? 'VKN' : 'TCKN';
    const placeholder = specialIds.find((x) => x.type === wantType && x.scope.includes(scope)) || specialIds.find((x) => x.scope.includes(scope));
    if (placeholder && (type === 'FOREIGN' || type === 'ANONYMOUS' || !type)) {
      ids.push({ schemeID: placeholder.type, value: placeholder.value });
      if (placeholder.type === 'TCKN') person = splitName(snap.name && snap.name !== '-' ? snap.name : 'Nihai Tüketici');
    } else {
      issues.push(
        issue(
          `${role === 'seller' ? 'Satıcının' : 'Alıcının'} vergi kimlik numarası (VKN / TCKN) eksik veya geçersiz: "${snap.name}".`,
          `The ${role} has no valid tax identity number (VKN / TCKN): "${snap.name}".`,
        ),
      );
    }
  }
  if (role === 'seller') {
    if (snap.mersisNo) ids.push({ schemeID: 'MERSISNO', value: String(snap.mersisNo) });
    if (snap.tradeRegistryNo) ids.push({ schemeID: 'TICARETSICILNO', value: String(snap.tradeRegistryNo) });
  }
  const address = addressFromSnapshot(snap.address);
  if (!address.district || !address.city) {
    issues.push(issue(`${role === 'seller' ? 'Satıcının' : 'Alıcının'} adresinde il / ilçe eksik: "${snap.name}".`, `The ${role}'s address has no province / district: "${snap.name}".`));
  }
  const taxOffice = snap.taxOfficeName ? String(snap.taxOfficeName).replace(/\s*Vergi Dairesi( Müdürlüğü| Başkanlığı)?\s*$/i, '') : null;
  return {
    party: {
      name: person ? null : snap.legalName || snap.name,
      person,
      identifiers: ids,
      taxOffice,
      address,
      phone: snap.phone ?? null,
      email: snap.email ?? null,
      website: snap.website ?? null,
    },
    issues,
  };
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

type LotRef = { lot?: string | null; serial?: string | null; expiry?: string | null };

/** Lots / serials shipped on a line (ItemInstance; food traceability, R68). */
function trackingLots(tracking: { lotNumber?: string | null; expiryDate?: string | null; serials?: string[] }[] | null | undefined): LotRef[] {
  const out: LotRef[] = [];
  for (const t of tracking || []) {
    if (t.serials?.length) for (const sn of t.serials) out.push({ serial: sn, lot: t.lotNumber ?? null, expiry: t.expiryDate ?? null });
    else if (t.lotNumber) out.push({ lot: t.lotNumber, expiry: t.expiryDate ?? null });
  }
  return out;
}

export function mapInvoice(inv: InvoiceEntity, ctx: MapContext): { input: UblInvoiceInput; issues: UblIssue[] } {
  const issues: UblIssue[] = [];
  const scope = inv.profileId === 'EARSIVFATURA' ? 'EARSIV' : 'EFATURA';
  const seller = partyFromSnapshot(inv.sellerSnapshot, scope, ctx.specialIds, 'seller');
  const buyer = partyFromSnapshot(inv.buyerSnapshot, scope, ctx.specialIds, 'buyer');
  issues.push(...seller.issues, ...buyer.issues);
  const currency = inv.currency || 'TRY';
  const lines: UblInvoiceLine[] = [];
  for (const l of [...(inv.lines || [])].sort((a, b) => a.lineNo - b.lineNo)) {
    const gross = round2(Number(l.grossAmount) || Number(l.quantity) * Number(l.unitPrice));
    const discount = round2(Number(l.discountAmount) || 0);
    const net = round2(Number(l.netAmount));
    const taxes: UblLineTax[] = [];
    const lineTaxes = l.taxes?.length ? l.taxes : [{ code: '0015', rate: Number(l.taxRate) || 0, base: net, amount: Number(l.taxAmount) || 0, exemptionCode: l.exemptionCode ?? null }];
    for (const t of lineTaxes) {
      if (t.code === '0015' || !t.code) {
        taxes.push({ code: '0015', name: 'KDV', percent: Number(t.rate) || 0, taxable: round2(t.base), amount: round2(t.amount), exemptionCode: t.exemptionCode || null, exemptionReason: t.exemptionCode ? ctx.exemptionNames?.[t.exemptionCode] || t.exemptionCode : null });
      } else {
        const code = /^\d{4}$/.test(t.code) ? t.code : l.otvCode && /^\d{4}$/.test(l.otvCode) ? l.otvCode : '0071';
        taxes.push({ code, name: ctx.otvNames?.[code] || 'ÖTV', percent: Number(t.rate) || 0, taxable: round2(t.base), amount: round2(t.amount) });
      }
    }
    const product = l.productId ? ctx.products?.[l.productId] : undefined;
    const additional: UblInvoiceLine['additionalItemIds'] = [];
    if (ctx.sectoralItemIds && product?.gtin14) {
      if (product.regulatoryCategory === 'medicine_its') additional.push({ schemeID: 'ILAC', value: product.gtin14 });
      if (product.regulatoryCategory === 'medical_device_uts') additional.push({ schemeID: 'TIBBICIHAZ', value: product.gtin14 });
    }
    lines.push({
      id: lines.length + 1,
      name: l.productName,
      sellersItemId: l.productSku || product?.sku || null,
      additionalItemIds: additional,
      quantity: Number(l.quantity),
      unitCode: l.unitCode || 'C62',
      unitPrice: Number(l.unitPrice),
      lineExtension: net,
      allowances: discount > 0 ? [{ charge: false, multiplier: gross ? Math.round((discount / gross) * 10000) / 10000 : null, amount: discount, base: gross }] : [],
      taxes,
      withholding:
        l.withholdingCode && Number(l.withheldTaxAmount) > 0
          ? [{ code: l.withholdingCode, name: ctx.withholdingNames?.[l.withholdingCode] || `KDV Tevkifatı ${l.withholdingCode}`, percent: Number(l.withholdingRate) || 0, taxable: round2(Number(l.taxAmount)), amount: round2(Number(l.withheldTaxAmount)) }]
          : [],
      lots: trackingLots(l.tracking),
    });
  }
  // Order charges (nakliye, ambalaj, sigorta) travel as service lines so the tax totals stay exact.
  for (const c of inv.charges || []) {
    const amount = round2(c.amount);
    const tax = round2(c.taxAmount);
    const percent = amount ? Math.round((tax / amount) * 100) : 0;
    lines.push({
      id: lines.length + 1,
      name: [CHARGE_NAMES[c.type] || c.type, c.description].filter(Boolean).join(' - '),
      quantity: 1,
      unitCode: 'C62',
      unitPrice: amount,
      lineExtension: amount,
      taxes: [{ code: '0015', name: 'KDV', percent, taxable: amount, amount: tax }],
    });
  }
  const sum = (f: (l: UblInvoiceLine) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
  const net = sum((l) => l.lineExtension);
  const allowance = sum((l) => (l.allowances || []).reduce((s, a) => s + (a.charge ? 0 : a.amount), 0));
  const taxTotal = sum((l) => l.taxes.reduce((s, t) => s + t.amount, 0));
  const withheld = sum((l) => (l.withholding || []).reduce((s, w) => s + w.amount, 0));
  const notCollected = round2(Number(inv.notCollectedTaxTotal) || 0);
  const totals = { lineExtension: round2(net + allowance), taxExclusive: net, taxInclusive: round2(net + taxTotal), allowanceTotal: allowance, chargeTotal: 0, payable: round2(net + taxTotal - withheld - notCollected) };
  if (Math.abs(totals.payable - round2(Number(inv.payableTotal))) > 0.05) {
    issues.push(issue(`Fatura toplamları tutarsız: ödenecek ${totals.payable} ≠ ${inv.payableTotal}.`, `Invoice totals are inconsistent: payable ${totals.payable} ≠ ${inv.payableTotal}.`));
  }

  const notes: string[] = [];
  if (inv.notes) notes.push(String(inv.notes).slice(0, 500));
  if (ctx.extraOrderNumbers?.length) notes.push(`Diğer siparişler: ${ctx.extraOrderNumbers.join(', ')}`);
  if (inv.profileId === 'EARSIVFATURA' && ctx.earsivSendType) notes.push(`Gönderim şekli: ${ctx.earsivSendType}`);
  if (inv.replacesDespatch) notes.push('İrsaliye yerine geçer.');
  const isInfo = inv.internetSaleInfo;
  if (isInfo) {
    notes.push(
      `İnternet satışı: ${[isInfo.webAddress, isInfo.paymentMethod ? `ödeme şekli ${isInfo.paymentMethod}` : null, isInfo.paymentDate ? `ödeme tarihi ${isInfo.paymentDate}` : null, isInfo.carrierName ? `taşıyıcı ${isInfo.carrierName}${isInfo.carrierTaxId ? ` (${isInfo.carrierTaxId})` : ''}` : null, isInfo.shipmentDate ? `gönderim tarihi ${isInfo.shipmentDate}` : null].filter(Boolean).join('; ')}.`,
    );
  }
  const paymentCode: Record<string, string> = { 'KREDIKARTI/BANKAKARTI': '48', 'EFT/HAVALE': '42', KAPIDAODEME: '10', ODEMEARACISI: '1', DIGER: '1' };

  let customer = buyer.party;
  let buyerCustomer: UblParty | null = null;
  if (inv.profileId === 'IHRACAT') {
    if (!ctx.exportCustoms) issues.push(issue('İhracat faturası için gümrük (GTB) bilgileri tanımlı değil.', 'Customs (GTB) party for export invoices is not configured.'));
    customer = {
      name: ctx.exportCustoms?.name || 'GTB',
      identifiers: [{ schemeID: 'VKN', value: ctx.exportCustoms?.vkn || '' }],
      taxOffice: ctx.exportCustoms?.taxOffice ?? null,
      address: { district: ctx.exportCustoms?.district || '-', city: ctx.exportCustoms?.city || '-', country: 'Türkiye', countryCode: 'TR' },
    };
    buyerCustomer = { ...buyer.party, identifiers: [], legalName: buyer.party.name || inv.buyerSnapshot?.name || '-' };
    if (lines.some((l) => !l.export)) issues.push(issue('İhracat faturasında her satır için GTİP ve teslim şekli (INCOTERMS) gereklidir.', 'Every export line needs a GTİP code and INCOTERMS.'));
  }

  return {
    issues,
    input: {
      ettn: inv.ettn,
      documentNo: inv.documentNo || '',
      profileId: inv.profileId,
      typeCode: inv.typeCode,
      issueDate: String(inv.issueDate),
      issueTime: inv.issueTime || '00:00:00',
      currency,
      exchangeRate: currency !== 'TRY' ? Number(inv.exchangeRate) : null,
      exchangeRateDate: currency !== 'TRY' ? inv.exchangeRateDate ?? null : null,
      notes,
      orderRef: ctx.orderRef ?? null,
      billingRefs: (inv.billingReferences || []).filter((r) => r.documentNo).map((r) => ({ id: String(r.documentNo), issueDate: String(r.issueDate || inv.issueDate), documentTypeCode: 'IADE' })),
      despatchRefs: (inv.despatchRefs || []).filter((r) => r.documentNo && r.issueDate).map((r) => ({ id: String(r.documentNo), issueDate: String(r.issueDate) })),
      attachments: ctx.xslt ? [ctx.xslt] : [],
      supplier: seller.party,
      customer,
      buyerCustomer,
      delivery: isInfo?.carrierName ? { carrier: { name: isInfo.carrierName, taxId: isInfo.carrierTaxId ?? null }, actualDate: isInfo.shipmentDate ?? null, address: null } : null,
      paymentMeans: isInfo?.paymentMethod ? { code: paymentCode[String(isInfo.paymentMethod).toUpperCase()] || '1', dueDate: isInfo.paymentDate ?? null, note: isInfo.paymentMethod } : null,
      lines,
      totals,
      internetSale: isInfo ?? null,
    },
  };
}

const PURPOSE_NOTES: Record<string, string> = {
  SALE: 'Satış sevkiyatı',
  TRANSFER: 'Şubeler / depolar arası transfer',
  CONSIGNMENT: 'Konsinye sevk',
  REPAIR: 'Tamir / bakım amaçlı sevk',
  SAMPLE: 'Numune sevki',
  SUBCONTRACT: 'Fason imalat amaçlı sevk',
  RETURN: 'İade sevkiyatı',
  PURCHASE_PICKUP: 'Alıcı tarafından taşınan alış',
};

export function mapDespatch(d: DespatchEntity, ctx: MapContext): { input: UblDespatchInput; issues: UblIssue[] } {
  const issues: UblIssue[] = [];
  const seller = partyFromSnapshot(d.sellerSnapshot, 'EIRSALIYE', ctx.specialIds, 'seller');
  const buyer = partyFromSnapshot(d.buyerSnapshot || d.sellerSnapshot, 'EIRSALIYE', ctx.specialIds, 'buyer');
  issues.push(...seller.issues, ...buyer.issues);
  const deliveryAddress = d.deliveryAddress ? addressFromSnapshot(d.deliveryAddress) : buyer.party.address;
  // Province / district are pre-checked here; the postal code format is left to the GİB schematron.
  if (!deliveryAddress.district || !deliveryAddress.city) {
    issues.push(issue('Teslimat adresinde il veya ilçe eksik.', 'The delivery address needs a province and a district.'));
  }
  const at = d.actualDespatchAt ? new Date(d.actualDespatchAt) : new Date();
  const plates = (d.plates || []).filter((p) => (p.type || 'TRUCK') !== 'TRAILER').map((p) => String(p.plate).toUpperCase().replace(/\s+/g, ''));
  const trailers = (d.plates || []).filter((p) => p.type === 'TRAILER').map((p) => String(p.plate).toUpperCase().replace(/\s+/g, ''));
  const notes: string[] = [];
  if (PURPOSE_NOTES[d.purpose]) notes.push(`Sevk amacı: ${PURPOSE_NOTES[d.purpose]}`);
  if (d.note) notes.push(String(d.note).slice(0, 500));
  return {
    issues,
    input: {
      ettn: d.ettn,
      documentNo: d.documentNo || '',
      profileId: d.profileId || 'TEMELIRSALIYE',
      typeCode: d.typeCode || 'SEVK',
      issueDate: String(d.issueDate),
      issueTime: d.issueTime || '00:00:00',
      notes,
      orderRef: ctx.orderRef ?? null,
      paperRef: d.typeCode === 'MATBUDAN' && d.paperNo && d.paperDate ? { id: d.paperNo, issueDate: String(d.paperDate) } : null,
      attachments: ctx.xslt ? [ctx.xslt] : [],
      supplier: seller.party,
      customer: buyer.party,
      deliveryAddress,
      despatchAddress: d.originAddress ? addressFromSnapshot(d.originAddress) : null,
      carrier: d.carrierParty?.name && d.carrierParty.taxId ? { name: d.carrierParty.name, taxId: String(d.carrierParty.taxId) } : null,
      drivers: (d.drivers || []).map((x) => ({ firstName: x.firstName, familyName: x.lastName, tckn: x.tckn })),
      plates,
      trailerPlates: trailers,
      actualDespatchDate: dateKeyInZone(at, ctx.timezone),
      actualDespatchTime: timeKeyInZone(at, ctx.timezone),
      lines: [...(d.lines || [])]
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((l, i) => ({
          id: i + 1,
          name: l.productName,
          sellersItemId: l.productSku ?? null,
          quantity: Number(l.quantity),
          unitCode: l.unitCode || 'C62',
          orderLineId: String(i + 1),
          lots: trackingLots(l.tracking),
        })),
    },
  };
}
