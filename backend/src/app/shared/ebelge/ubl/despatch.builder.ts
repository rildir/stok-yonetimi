import { UBL_CUSTOMIZATION_ID } from '../../tr';
import { el, money, num, opt, serialize, txt, ublRoot } from './xml';
import { address, attachment, documentRef, extensions, header, lotInstances, party, signature } from './common';
import { UblDespatchInput } from './model';

/**
 * UBL-TR DespatchAdvice (e-İrsaliye, UBL-TR İrsaliye V1.2, CustomizationID TR1.2.1): SEVK and
 * MATBUDAN (paper despatch issued during an outage, referenced as DocumentType MATBU). Plates
 * carry schemeID PLAKA, trailers DORSEPLAKA; drivers are DriverPerson with their TCKN.
 */
export function buildDespatchXml(d: UblDespatchInput): string {
  const root = ublRoot('DespatchAdvice');
  extensions(root);
  header(root, UBL_CUSTOMIZATION_ID.DespatchAdvice, d.profileId, d.documentNo, d.ettn, d.issueDate, d.issueTime);
  txt(root, 'cbc:DespatchAdviceTypeCode', d.typeCode);
  for (const n of d.notes) opt(root, 'cbc:Note', n);
  txt(root, 'cbc:LineCountNumeric', d.lines.length);
  if (d.orderRef) {
    const o = el(root, 'cac:OrderReference');
    txt(o, 'cbc:ID', d.orderRef.id);
    txt(o, 'cbc:IssueDate', d.orderRef.issueDate);
  }
  if (d.paperRef) documentRef(root, 'cac:AdditionalDocumentReference', { id: d.paperRef.id, issueDate: d.paperRef.issueDate, documentType: 'MATBU', description: 'Matbu sevk irsaliyesi' });
  for (const a of d.attachments || []) attachment(root, a);
  signature(root, d.supplier, d.documentNo);

  const sup = el(root, 'cac:DespatchSupplierParty');
  party(sup, d.supplier);
  txt(el(sup, 'cac:DespatchContact'), 'cbc:Name', d.supplier.name || (d.supplier.person ? `${d.supplier.person.firstName} ${d.supplier.person.familyName}` : '-'));
  party(el(root, 'cac:DeliveryCustomerParty'), d.customer);
  if (d.buyerCustomer) party(el(root, 'cac:BuyerCustomerParty'), d.buyerCustomer);

  const sh = el(root, 'cac:Shipment');
  txt(sh, 'cbc:ID', '1');
  if (d.totalValue) money(el(sh, 'cac:GoodsItem'), 'cbc:ValueAmount', d.totalValue.amount, d.totalValue.currency);
  if (d.plates.length || d.drivers.length) {
    const st = el(sh, 'cac:ShipmentStage');
    if (d.plates.length) {
      const tm = el(st, 'cac:TransportMeans');
      const rt = el(tm, 'cac:RoadTransport');
      txt(rt, 'cbc:LicensePlateID', d.plates[0], { schemeID: 'PLAKA' });
    }
    for (const dr of d.drivers) {
      const p = el(st, 'cac:DriverPerson');
      txt(p, 'cbc:FirstName', dr.firstName);
      txt(p, 'cbc:FamilyName', dr.familyName);
      txt(p, 'cbc:Title', 'Şoför');
      txt(p, 'cbc:NationalityID', dr.tckn);
    }
  }
  const del = el(sh, 'cac:Delivery');
  address(del, 'cac:DeliveryAddress', d.deliveryAddress);
  if (d.carrier) {
    const cp = el(del, 'cac:CarrierParty');
    txt(el(cp, 'cac:PartyIdentification'), 'cbc:ID', d.carrier.taxId, { schemeID: d.carrier.taxId.length === 11 ? 'TCKN' : 'VKN' });
    txt(el(cp, 'cac:PartyName'), 'cbc:Name', d.carrier.name);
    address(cp, 'cac:PostalAddress', d.carrier.address || d.supplier.address);
  }
  const ds = el(del, 'cac:Despatch');
  txt(ds, 'cbc:ActualDespatchDate', d.actualDespatchDate);
  txt(ds, 'cbc:ActualDespatchTime', d.actualDespatchTime);
  if (d.despatchAddress) address(ds, 'cac:DespatchAddress', d.despatchAddress);
  if (d.trailerPlates.length) {
    const thu = el(sh, 'cac:TransportHandlingUnit');
    for (const p of d.trailerPlates) txt(el(thu, 'cac:TransportEquipment'), 'cbc:ID', p, { schemeID: 'DORSEPLAKA' });
  }

  for (const l of d.lines) {
    const n = el(root, 'cac:DespatchLine');
    txt(n, 'cbc:ID', l.id);
    txt(n, 'cbc:DeliveredQuantity', num(l.quantity, 6), { unitCode: l.unitCode || 'C62' });
    txt(el(n, 'cac:OrderLineReference'), 'cbc:LineID', l.orderLineId || String(l.id));
    const item = el(n, 'cac:Item');
    txt(item, 'cbc:Name', l.name);
    if (l.sellersItemId) txt(el(item, 'cac:SellersItemIdentification'), 'cbc:ID', l.sellersItemId);
    lotInstances(item, l.lots);
    if (l.unitPrice !== null && l.unitPrice !== undefined && l.currency) {
      const s = el(n, 'cac:Shipment');
      txt(s, 'cbc:ID', '');
      const il = el(el(s, 'cac:GoodsItem'), 'cac:InvoiceLine');
      txt(il, 'cbc:ID', '');
      txt(il, 'cbc:InvoicedQuantity', '0');
      money(il, 'cbc:LineExtensionAmount', Math.round(l.quantity * l.unitPrice * 100) / 100, l.currency);
      txt(el(il, 'cac:Item'), 'cbc:Name', '');
      money(el(il, 'cac:Price'), 'cbc:PriceAmount', l.unitPrice, l.currency);
    }
  }
  return serialize(root);
}
