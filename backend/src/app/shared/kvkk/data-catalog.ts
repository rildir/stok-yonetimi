/**
 * Personal-data inventory of the application (kişisel veri işleme envanteri, KVKK md. 16 / VERBİS,
 * Veri Sorumluları Sicili Hakkında Yönetmelik md. 5, 11). One entry per data category and subject
 * group: the fields that hold it, purposes, legal basis (KVKK md. 5/2, 6), recipient groups,
 * retention policy (retention_policies.dataCategory) and whether it can leave Türkiye.
 *
 * Used for the VERBİS-shaped inventory export (CSV / printable PDF), the privacy-notice template,
 * the data-subject report and the personal-data filter of webhook payloads.
 */
export type SubjectGroup = 'CUSTOMER' | 'CUSTOMER_CONTACT' | 'SUPPLIER' | 'USER' | 'DRIVER' | 'DELIVERY_CONTACT';

export interface CatalogEntry {
  /** VERBİS data category */
  category: string;
  categoryEn: string;
  subjectGroup: SubjectGroup;
  /** table.column list */
  fields: string[];
  purposes: string[];
  purposesEn: string[];
  /** KVKK md. 5/2 bentleri */
  legalBasis: string[];
  recipients: string[];
  retentionCategory: string;
  transferAbroad: boolean;
  special?: boolean;
}

const B_CONTRACT = 'KVKK 5/2-c (sözleşmenin kurulması / ifası)';
const B_LEGAL = 'KVKK 5/2-ç (hukuki yükümlülük: VUK 230, 253; TTK 82)';
const B_LEGIT = 'KVKK 5/2-f (meşru menfaat)';
const B_LAW = 'KVKK 5/2-a (kanunlarda açıkça öngörülme: VUK, KDVK, 7223 s.K.)';
const B_RIGHT = 'KVKK 5/2-e (bir hakkın tesisi, kullanılması veya korunması)';
const B_CONSENT = 'KVKK 5/1 (açık rıza) - yalnızca pazarlama ileti izinleri';

const R_GIB = 'Gelir İdaresi Başkanlığı ve özel entegratör (e-Fatura / e-Arşiv / e-İrsaliye)';
const R_ADVISOR = 'Mali müşavir / denetçi';
const R_CARRIER = 'Taşıyıcı / kargo firması';
const R_AUTH = 'Yetkili kamu kurum ve kuruluşları';
const R_HOST = 'Barındırma hizmet sağlayıcısı (veri işleyen)';
const R_WEBHOOK = 'Şirketin tanımladığı entegrasyonlar (webhook alıcıları; kişisel veri varsayılan olarak gönderilmez)';

/** English wording of the legal bases and recipient groups (English privacy notices). */
const CATALOG_TEXT_EN: Record<string, string> = {
  [B_CONTRACT]: 'KVKK 5/2-c (formation / performance of a contract)',
  [B_LEGAL]: 'KVKK 5/2-ç (legal obligation: VUK 230, 253; TTK 82)',
  [B_LEGIT]: 'KVKK 5/2-f (legitimate interest)',
  [B_LAW]: 'KVKK 5/2-a (expressly provided for by law: VUK, KDVK, Law No. 7223)',
  [B_RIGHT]: 'KVKK 5/2-e (establishment, exercise or protection of a right)',
  [B_CONSENT]: 'KVKK 5/1 (explicit consent) - marketing message permissions only',
  [R_GIB]: 'Revenue Administration (GİB) and the private e-document integrator (e-Invoice / e-Archive / e-Despatch)',
  [R_ADVISOR]: 'Financial advisor / auditor',
  [R_CARRIER]: 'Carrier / courier company',
  [R_AUTH]: 'Authorised public institutions',
  [R_HOST]: 'Hosting service provider (processor)',
  [R_WEBHOOK]: 'Integrations defined by the company (webhook receivers; no personal data is sent by default)',
};

/** A catalog legal basis / recipient group in the given language. */
export function catalogText(text: string, lang: 'tr' | 'en'): string {
  return lang === 'en' ? CATALOG_TEXT_EN[text] ?? text : text;
}

export const DATA_CATALOG: CatalogEntry[] = [
  {
    category: 'Kimlik', categoryEn: 'Identity', subjectGroup: 'CUSTOMER',
    fields: ['customers.name', 'customers.identityType', 'customers.identityNumber', 'customers.passportNo', 'customers.nationality', 'customers.foreignTaxId', 'invoices.buyerSnapshot', 'despatches.buyerSnapshot'],
    purposes: ['Fatura ve irsaliye düzenlenmesi', 'Mal / hizmet satış süreçlerinin yürütülmesi', 'Mevzuata uygun kayıt tutulması'],
    purposesEn: ['Issuing invoices and despatch advices', 'Running sales processes', 'Keeping records required by law'],
    legalBasis: [B_CONTRACT, B_LEGAL, B_LAW], recipients: [R_GIB, R_ADVISOR, R_AUTH, R_HOST], retentionCategory: 'CUSTOMER_IDENTITY', transferAbroad: false,
  },
  {
    category: 'İletişim', categoryEn: 'Contact', subjectGroup: 'CUSTOMER',
    fields: ['customers.email', 'customers.phone', 'customers.address*', 'customer_addresses.*'],
    purposes: ['Sipariş, teslimat ve faturaların iletilmesi', 'Müşteri ilişkilerinin yürütülmesi'],
    purposesEn: ['Delivering orders, goods and invoices', 'Customer relationship management'],
    legalBasis: [B_CONTRACT, B_LEGIT], recipients: [R_GIB, R_CARRIER, R_HOST], retentionCategory: 'CUSTOMER_IDENTITY', transferAbroad: false,
  },
  {
    category: 'Müşteri İşlem', categoryEn: 'Customer transaction', subjectGroup: 'CUSTOMER',
    fields: ['orders.customerName', 'orders.*', 'invoices.*', 'despatches.*', 'returns.*', 'document_line_tracking.partyName'],
    purposes: ['Satış ve iade süreçleri', 'Gıda izlenebilirliği ve geri çağırma (Tebliğ 2026/11)', 'Finans ve muhasebe işlerinin yürütülmesi'],
    purposesEn: ['Sales and returns', 'Food traceability and recall', 'Finance and accounting'],
    legalBasis: [B_CONTRACT, B_LEGAL], recipients: [R_GIB, R_ADVISOR, R_AUTH, R_HOST, R_WEBHOOK], retentionCategory: 'ORDERS', transferAbroad: false,
  },
  {
    category: 'Pazarlama', categoryEn: 'Marketing', subjectGroup: 'CUSTOMER',
    fields: ['consents.*'],
    purposes: ['Ticari elektronik ileti izinlerinin yönetimi'],
    purposesEn: ['Managing commercial e-message permissions'],
    legalBasis: [B_CONSENT], recipients: [R_HOST], retentionCategory: 'CONSENTS', transferAbroad: false,
  },
  {
    category: 'Kimlik', categoryEn: 'Identity', subjectGroup: 'CUSTOMER_CONTACT',
    fields: ['customer_addresses.contactName'],
    purposes: ['Teslimatın yapılması'], purposesEn: ['Delivery'],
    legalBasis: [B_CONTRACT, B_LEGIT], recipients: [R_CARRIER, R_HOST], retentionCategory: 'CUSTOMER_IDENTITY', transferAbroad: false,
  },
  {
    category: 'Kimlik', categoryEn: 'Identity', subjectGroup: 'SUPPLIER',
    fields: ['suppliers.name', 'suppliers.contactPerson', 'suppliers.identityNumber', 'goods_receipts.supplierSnapshot', 'expense_vouchers.*'],
    purposes: ['Satın alma ve mal kabul', 'Gider pusulası / müstahsil makbuzu düzenlenmesi'],
    purposesEn: ['Purchasing and goods receipt', 'Expense vouchers / producer receipts'],
    legalBasis: [B_CONTRACT, B_LEGAL, B_LAW], recipients: [R_GIB, R_ADVISOR, R_AUTH, R_HOST], retentionCategory: 'DOCUMENTS', transferAbroad: false,
  },
  {
    category: 'İletişim', categoryEn: 'Contact', subjectGroup: 'SUPPLIER',
    fields: ['suppliers.email', 'suppliers.phone', 'suppliers.address*'],
    purposes: ['Tedarik süreçlerinin yürütülmesi'], purposesEn: ['Supply processes'],
    legalBasis: [B_CONTRACT, B_LEGIT], recipients: [R_HOST], retentionCategory: 'DOCUMENTS', transferAbroad: false,
  },
  {
    category: 'Kimlik', categoryEn: 'Identity', subjectGroup: 'DRIVER',
    fields: ['despatches.drivers (ad, soyad, TCKN)', 'despatches.plates'],
    purposes: ['Sevk irsaliyesi düzenlenmesi (VUK 230/5; e-İrsaliye Kılavuzu)'], purposesEn: ['Issuing despatch advices'],
    legalBasis: [B_LEGAL, B_LAW], recipients: [R_GIB, R_AUTH, R_HOST], retentionCategory: 'DOCUMENTS', transferAbroad: false,
  },
  {
    category: 'Kimlik', categoryEn: 'Identity', subjectGroup: 'USER',
    fields: ['users.fullName', 'users.username', 'users.department', 'users.avatar'],
    purposes: ['Uygulama kullanıcı hesaplarının yönetimi', 'Yetki ve erişim yönetimi'], purposesEn: ['User accounts', 'Access management'],
    legalBasis: [B_CONTRACT, B_LEGIT], recipients: [R_HOST], retentionCategory: 'USERS', transferAbroad: false,
  },
  {
    category: 'İletişim', categoryEn: 'Contact', subjectGroup: 'USER',
    fields: ['users.email'], purposes: ['Hesap bildirimleri'], purposesEn: ['Account notifications'],
    legalBasis: [B_CONTRACT], recipients: [R_HOST], retentionCategory: 'USERS', transferAbroad: false,
  },
  {
    category: 'İşlem Güvenliği', categoryEn: 'Transaction security', subjectGroup: 'USER',
    fields: ['audit_logs.username / ip / userAgent', 'audit_logs (login, login_failed)', 'user_sessions.ip / userAgent', 'legal_acceptances.ip'],
    purposes: ['Bilgi güvenliği süreçlerinin yürütülmesi', 'Denetim izi (TTK 64/1, VUK 256 incelemesi)', 'İhlal tespiti'],
    purposesEn: ['Information security', 'Audit trail', 'Breach detection'],
    legalBasis: [B_LEGAL, B_LEGIT, B_RIGHT], recipients: [R_AUTH, R_HOST], retentionCategory: 'AUDIT_LOGS', transferAbroad: false,
  },
  {
    category: 'İletişim', categoryEn: 'Contact', subjectGroup: 'DELIVERY_CONTACT',
    fields: ['despatches.deliveryAddress', 'customer_addresses.phone'],
    purposes: ['Teslimatın yapılması'], purposesEn: ['Delivery'],
    legalBasis: [B_CONTRACT], recipients: [R_CARRIER, R_HOST], retentionCategory: 'DOCUMENTS', transferAbroad: false,
  },
  {
    category: 'Özel Nitelikli (risk)', categoryEn: 'Special category (risk)', subjectGroup: 'CUSTOMER',
    fields: ['customers.notes', 'suppliers.notes', 'orders.note'],
    purposes: ['Serbest not alanları özel nitelikli veri için kullanılmamalıdır; uygulama uyarı verir'],
    purposesEn: ['Free-text notes must not hold special-category data; the application warns'],
    legalBasis: ['KVKK md. 6 - işleme amacı yoktur'], recipients: [], retentionCategory: 'CUSTOMER_IDENTITY', transferAbroad: false, special: true,
  },
];

export const SUBJECT_GROUP_LABELS: Record<SubjectGroup, { tr: string; en: string }> = {
  CUSTOMER: { tr: 'Müşteri (gerçek kişi)', en: 'Customer (natural person)' },
  CUSTOMER_CONTACT: { tr: 'Müşteri yetkilisi / irtibat kişisi', en: 'Customer contact person' },
  SUPPLIER: { tr: 'Tedarikçi (gerçek kişi / çiftçi)', en: 'Supplier (natural person / farmer)' },
  USER: { tr: 'Çalışan (uygulama kullanıcısı)', en: 'Employee (application user)' },
  DRIVER: { tr: 'Sürücü', en: 'Driver' },
  DELIVERY_CONTACT: { tr: 'Teslimat alıcısı', en: 'Delivery recipient' },
};

/** Technical and administrative measures (VERBİS "alınan tedbirler"), as implemented in the application. */
export const SECURITY_MEASURES = [
  'Kimlik numaraları AES-256-GCM ile şifreli; aramada anahtarlı özet (HMAC) kullanılır',
  'Rol ve yetki bazlı erişim; kişisel veri görüntüleme ayrı yetki (customers.pii.read), görüntüleme ve dışa aktarım loglanır',
  'Yöneticiler için iki adımlı doğrulama (TOTP); 15-60 dk erişim jetonu, httpOnly yenileme çerezi, boşta oturum kapatma',
  'Parola politikası (en az 10 karakter, 3 karakter sınıfı), hesap kilitleme',
  'Değiştirilemez, hash zincirli denetim kaydı; ihlal alarmı ve 72 saatlik bildirim takibi',
  'Saklama ve imha politikası; en geç 6 ayda bir periyodik imha, imha kayıtları en az 3 yıl',
  'Yurt dışı aktarımda aktarım dayanağı (KVKK md. 9) zorunlu; webhook yüklerinde kişisel veri varsayılan kapalı',
];

/** Personal-data keys removed from webhook payloads unless the endpoint opts in (includePersonalData). */
export const WEBHOOK_PII_KEYS = new Set([
  'customerName', 'email', 'phone', 'identityNumber', 'identityNumberHash', 'taxNumber', 'passportNo', 'foreignTaxId', 'nationality', 'notes', 'note',
  'buyerSnapshot', 'partySnapshot', 'supplierSnapshot', 'deliveryAddress', 'drivers', 'contactName', 'contactPerson', 'address', 'addressText',
  'addressLine1', 'addressLine2', 'addressPostalCode', 'addressUavtCode', 'city', 'postalCode', 'noticeChannel', 'affectedCustomers', 'partyName', 'partyTaxId',
  'username', 'performedBy', 'createdBy', 'requestedBy', 'approvedBy', 'ip', 'userAgent', 'counterpartyName', 'counterpartyTaxId', 'receiverName', 'senderName',
]);

/** Deep copy without personal-data keys (customer ids stay so the subscriber can call the API). */
export function stripPersonalData<T>(value: T, depth = 0): T {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripPersonalData(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (WEBHOOK_PII_KEYS.has(k)) continue;
    out[k] = stripPersonalData(v, depth + 1);
  }
  return out as T;
}

/** VERBİS-shaped rows of the inventory (one row per entry). */
export function inventoryRows(retentionText: (category: string) => string): Record<string, string>[] {
  return DATA_CATALOG.map((e) => ({
    veriKategorisi: e.category,
    veriKonusuKisiGrubu: SUBJECT_GROUP_LABELS[e.subjectGroup].tr,
    kisiselVeriler: e.fields.join('; '),
    islemeAmaclari: e.purposes.join('; '),
    hukukiSebep: e.legalBasis.join('; '),
    aliciGruplari: e.recipients.join('; ') || '-',
    saklamaSuresi: retentionText(e.retentionCategory),
    yurtDisiAktarim: e.transferAbroad ? 'Var' : 'Yok (webhook hedefleri ayrıca listelenir)',
    ozelNitelikli: e.special ? 'Risk: serbest metin (uyarı)' : 'Hayır',
  }));
}
