import { UBL_CUSTOMIZATION_ID } from '../../tr';
import { el, num, opt, serialize, txt, ublRoot } from './xml';
import { documentRef, extensions, header, party, signature } from './common';
import { UblReceiptAdviceInput } from './model';

/**
 * UBL-TR ReceiptAdvice (İrsaliye Yanıtı V1.0, CustomizationID TR1.2.1): the receiver's full or
 * partial acceptance of an e-İrsaliye. Received / rejected / short / oversupplied quantities per
 * despatch line (e-İrsaliye Kılavuzu §12; answered within the legal period, else fully accepted).
 */
export function buildReceiptAdviceXml(r: UblReceiptAdviceInput): string {
  const root = ublRoot('ReceiptAdvice');
  extensions(root);
  header(root, UBL_CUSTOMIZATION_ID.ReceiptAdvice, r.profileId, r.documentNo, r.ettn, r.issueDate, r.issueTime);
  txt(root, 'cbc:ReceiptAdviceTypeCode', 'SEVK');
  for (const n of r.notes) opt(root, 'cbc:Note', n);
  txt(root, 'cbc:LineCountNumeric', r.lines.length);
  if (r.orderRef) {
    const o = el(root, 'cac:OrderReference');
    txt(o, 'cbc:ID', r.orderRef.id);
    txt(o, 'cbc:IssueDate', r.orderRef.issueDate);
  }
  documentRef(root, 'cac:DespatchDocumentReference', { id: r.despatch.ettn.toUpperCase(), issueDate: r.despatch.issueDate });
  documentRef(root, 'cac:AdditionalDocumentReference', { id: r.despatch.documentNo, issueDate: r.despatch.issueDate, documentTypeCode: 'DespatchAdviceID', documentType: 'DespatchAdvice ID' });
  signature(root, r.deliveryCustomer, r.documentNo);
  party(el(root, 'cac:DeliveryCustomerParty'), r.deliveryCustomer);
  party(el(root, 'cac:DespatchSupplierParty'), r.despatchSupplier);
  if (r.actualDespatchDate) {
    const sh = el(root, 'cac:Shipment');
    txt(sh, 'cbc:ID', '');
    txt(el(el(sh, 'cac:Delivery'), 'cac:Despatch'), 'cbc:ActualDespatchDate', r.actualDespatchDate);
  }
  for (const l of r.lines) {
    const n = el(root, 'cac:ReceiptLine');
    txt(n, 'cbc:ID', l.id);
    const u = { unitCode: l.unitCode || 'C62' };
    txt(n, 'cbc:ReceivedQuantity', num(l.received, 6), u);
    if (l.short) txt(n, 'cbc:ShortQuantity', num(l.short, 6), u);
    if (l.rejected) txt(n, 'cbc:RejectedQuantity', num(l.rejected, 6), u);
    if (l.rejected) opt(n, 'cbc:RejectReason', l.rejectReason || 'Kabul edilmedi');
    if (l.oversupply) txt(n, 'cbc:OversupplyQuantity', num(l.oversupply, 6), u);
    txt(el(n, 'cac:DespatchLineReference'), 'cbc:LineID', l.despatchLineId);
    const item = el(n, 'cac:Item');
    txt(item, 'cbc:Name', l.name);
    if (l.sellersItemId) txt(el(item, 'cac:SellersItemIdentification'), 'cbc:ID', l.sellersItemId);
  }
  return serialize(root);
}
