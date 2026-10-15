import { el, Node, opt, txt } from './xml';
import { UblAddress, UblAttachment, UblDocumentRef, UblParty } from './model';

/** Common UBL-TR aggregates (UBL-TR Ortak Elemanlar V0.7). */

/** Namespace of the signature placeholder used by GİB's UBL-TR samples (xmlns:n4). */
export const SIGNATURE_PLACEHOLDER_NS = 'http://www.altova.com/samplexml/other-namespace';

/** Placeholder of the signature the integrator applies (ext:UBLExtensions is mandatory in Invoice / DespatchAdvice / ReceiptAdvice). */
export function extensions(root: Node): void {
  const ext = el(el(root, 'ext:UBLExtensions'), 'ext:UBLExtension');
  // ExtensionContent needs one element from another namespace (XSD ##other); the integrator
  // replaces this conventional placeholder with the XAdES signature (ds:Signature).
  el(ext, 'ext:ExtensionContent').ele(SIGNATURE_PLACEHOLDER_NS, 'n4:auto-generated_for_wildcard');
}

export function header(root: Node, customizationId: string, profileId: string, id: string, ettn: string, issueDate: string, issueTime: string | null, copyIndicator = true): void {
  txt(root, 'cbc:UBLVersionID', '2.1');
  txt(root, 'cbc:CustomizationID', customizationId);
  txt(root, 'cbc:ProfileID', profileId);
  txt(root, 'cbc:ID', id);
  if (copyIndicator) txt(root, 'cbc:CopyIndicator', 'false');
  txt(root, 'cbc:UUID', ettn.toUpperCase());
  txt(root, 'cbc:IssueDate', issueDate);
  if (issueTime) txt(root, 'cbc:IssueTime', normalizeTime(issueTime));
}

export function normalizeTime(t: string): string {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(t || ''));
  return m ? `${m[1]}:${m[2]}:${m[3] || '00'}` : '00:00:00';
}

/** Primary tax identifier (VKN / TCKN) of a party. */
export function primaryId(p: UblParty): { schemeID: string; value: string } | null {
  return p.identifiers.find((i) => i.schemeID === 'VKN' || i.schemeID === 'TCKN') || null;
}

export function address(parent: Node, name: string, a: UblAddress): void {
  const n = el(parent, name);
  opt(n, 'cbc:StreetName', a.street);
  opt(n, 'cbc:BuildingNumber', a.buildingNumber);
  txt(n, 'cbc:CitySubdivisionName', a.district || '-');
  txt(n, 'cbc:CityName', a.city || '-');
  opt(n, 'cbc:PostalZone', a.postalZone);
  const c = el(n, 'cac:Country');
  opt(c, 'cbc:IdentificationCode', a.countryCode);
  txt(c, 'cbc:Name', a.country || 'Türkiye');
}

export function party(parent: Node, p: UblParty, extraIds: { schemeID: string; value: string }[] = []): Node {
  const n = el(parent, 'cac:Party');
  opt(n, 'cbc:WebsiteURI', p.website);
  for (const id of [...p.identifiers, ...extraIds]) {
    if (!id.value) continue;
    txt(el(n, 'cac:PartyIdentification'), 'cbc:ID', id.value, { schemeID: id.schemeID });
  }
  const name = p.name || (p.person ? `${p.person.firstName} ${p.person.familyName}` : '');
  const isPerson = primaryId(p)?.schemeID === 'TCKN';
  if (name && (!isPerson || p.name)) txt(el(n, 'cac:PartyName'), 'cbc:Name', name);
  address(n, 'cac:PostalAddress', p.address);
  if (p.taxOffice) txt(el(el(n, 'cac:PartyTaxScheme'), 'cac:TaxScheme'), 'cbc:Name', p.taxOffice);
  if (p.legalName) txt(el(n, 'cac:PartyLegalEntity'), 'cbc:RegistrationName', p.legalName);
  if (p.phone || p.email) {
    const c = el(n, 'cac:Contact');
    opt(c, 'cbc:Telephone', p.phone);
    opt(c, 'cbc:ElectronicMail', p.email);
  }
  if (p.person) {
    const per = el(n, 'cac:Person');
    txt(per, 'cbc:FirstName', p.person.firstName);
    txt(per, 'cbc:FamilyName', p.person.familyName);
    opt(per, 'cbc:NationalityID', p.person.nationalityId);
  }
  return n;
}

/** cac:Signature: the signatory (issuer) and the reference to the XAdES signature the integrator adds. */
export function signature(root: Node, issuer: UblParty, docId: string): void {
  const id = primaryId(issuer);
  const s = el(root, 'cac:Signature');
  txt(s, 'cbc:ID', id?.value || '', { schemeID: 'VKN_TCKN' });
  const sp = el(s, 'cac:SignatoryParty');
  if (id) txt(el(sp, 'cac:PartyIdentification'), 'cbc:ID', id.value, { schemeID: id.schemeID });
  address(sp, 'cac:PostalAddress', issuer.address);
  txt(el(el(s, 'cac:DigitalSignatureAttachment'), 'cac:ExternalReference'), 'cbc:URI', `#Signature_${docId}`);
}

export function documentRef(root: Node, name: string, r: UblDocumentRef): void {
  const n = el(root, name);
  txt(n, 'cbc:ID', r.id);
  txt(n, 'cbc:IssueDate', r.issueDate);
  opt(n, 'cbc:DocumentTypeCode', r.documentTypeCode);
  opt(n, 'cbc:DocumentType', r.documentType);
  opt(n, 'cbc:DocumentDescription', r.description);
}

export function attachment(root: Node, a: UblAttachment): void {
  const n = el(root, 'cac:AdditionalDocumentReference');
  txt(n, 'cbc:ID', a.id);
  txt(n, 'cbc:IssueDate', a.issueDate);
  txt(n, 'cbc:DocumentType', a.documentType);
  txt(el(n, 'cac:Attachment'), 'cbc:EmbeddedDocumentBinaryObject', a.base64, {
    characterSetCode: 'UTF-8',
    encodingCode: 'Base64',
    filename: a.fileName,
    mimeCode: a.mimeCode,
  });
}

export function lotInstances(item: Node, lots?: { lot?: string | null; serial?: string | null; expiry?: string | null }[]): void {
  for (const l of lots || []) {
    if (!l.lot && !l.serial) continue;
    const inst = el(item, 'cac:ItemInstance');
    opt(inst, 'cbc:SerialID', l.serial);
    if (l.lot) {
      const lot = el(inst, 'cac:LotIdentification');
      txt(lot, 'cbc:LotNumberID', l.lot);
      opt(lot, 'cbc:ExpiryDate', l.expiry);
    }
  }
}
