import { UBL_CUSTOMIZATION_ID } from '../../tr';
import { el, opt, serialize, txt, ublRoot } from './xml';
import { address, extensions, header, signature } from './common';
import { UblApplicationResponseInput, UblParty } from './model';

/**
 * UBL-TR ApplicationResponse (Uygulama Yanıtı, CustomizationID TR1.2): KABUL / RED answer to a
 * TICARIFATURA within the period of TTK 21/2 (legal parameter TICARI_RESPONSE_DAYS).
 */
export function buildApplicationResponseXml(r: UblApplicationResponseInput): string {
  const root = ublRoot('ApplicationResponse');
  extensions(root);
  header(root, UBL_CUSTOMIZATION_ID.ApplicationResponse, r.profileId, r.documentNo, r.ettn, r.issueDate, r.issueTime, false);
  for (const n of r.notes) opt(root, 'cbc:Note', n);
  signature(root, r.sender, r.documentNo);
  simpleParty(root, 'cac:SenderParty', r.sender);
  simpleParty(root, 'cac:ReceiverParty', r.receiver);
  const dr = el(root, 'cac:DocumentResponse');
  const resp = el(dr, 'cac:Response');
  txt(resp, 'cbc:ReferenceID', r.ettn.toUpperCase());
  txt(resp, 'cbc:ResponseCode', r.responseCode);
  opt(resp, 'cbc:Description', r.description || (r.responseCode === 'KABUL' ? 'Fatura kabul edildi.' : 'Fatura reddedildi.'));
  const ref = el(dr, 'cac:DocumentReference');
  txt(ref, 'cbc:ID', r.invoice.ettn.toUpperCase());
  txt(ref, 'cbc:IssueDate', r.invoice.issueDate);
  txt(ref, 'cbc:DocumentTypeCode', 'FATURA');
  txt(ref, 'cbc:DocumentType', 'FATURA');
  return serialize(root);
}

function simpleParty(root: ReturnType<typeof ublRoot>, name: string, p: UblParty): void {
  const n = el(root, name);
  for (const id of p.identifiers) txt(el(n, 'cac:PartyIdentification'), 'cbc:ID', id.value, { schemeID: id.schemeID });
  if (p.name) txt(el(n, 'cac:PartyName'), 'cbc:Name', p.name);
  address(n, 'cac:PostalAddress', p.address);
  if (p.person) {
    const per = el(n, 'cac:Person');
    txt(per, 'cbc:FirstName', p.person.firstName);
    txt(per, 'cbc:FamilyName', p.person.familyName);
  }
}
