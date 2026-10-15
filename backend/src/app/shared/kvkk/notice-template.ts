import { DATA_CATALOG, SUBJECT_GROUP_LABELS, SubjectGroup, catalogText } from './data-catalog';

/**
 * Default privacy-notice text (aydınlatma metni, KVKK md. 10; Aydınlatma Yükümlülüğünün Yerine
 * Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ md. 4-5), filled from the company's fiscal
 * identity (R01), the inventory (data-catalog.ts), the sub-processors and the cross-border transfers.
 * Contains a cookie / local storage section (Çerez Uygulamaları Hakkında Rehber). The result is a
 * DRAFT the company reviews and publishes as a version; it is not legal advice.
 */
export type NoticeAudience = 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'USER';
export const NOTICE_AUDIENCES: NoticeAudience[] = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'USER'];
export const NOTICE_DOC_TYPES = ['PRIVACY', 'TOS', 'DPA'] as const;

const AUDIENCE_GROUPS: Record<NoticeAudience, SubjectGroup[]> = {
  CUSTOMER: ['CUSTOMER', 'CUSTOMER_CONTACT', 'DELIVERY_CONTACT'],
  SUPPLIER: ['SUPPLIER', 'DRIVER'],
  EMPLOYEE: ['USER'],
  USER: ['USER'],
};

export interface NoticeCompany {
  legalName?: string | null;
  name: string;
  taxIdType?: string | null;
  taxId?: string | null;
  mersisNo?: string | null;
  addressText?: string | null;
  kepAddress?: string | null;
  email?: string | null;
  kvkkContactEmail?: string | null;
  phone?: string | null;
  website?: string | null;
}

export interface NoticeProcessor {
  name: string;
  service: string;
  country: string;
  transferBasis?: string | null;
}

/** Browser storage of the application (strictly necessary or functional; no analytics / marketing). */
export const STORAGE_ITEMS = [
  { name: 'rt (httpOnly çerez)', nameEn: 'rt (httpOnly cookie)', purpose: 'Oturumun yenilenmesi (zorunlu)', purposeEn: 'Session renewal (strictly necessary)', duration: 'En fazla 12 saat; 30 dk hareketsizlikte geçersiz', durationEn: 'Max 12 hours; invalid after 30 min idle' },
  { name: 'smart_inventory_token (yerel depolama)', nameEn: 'smart_inventory_token (local storage)', purpose: 'Kısa süreli erişim jetonu (zorunlu)', purposeEn: 'Short-lived access token (strictly necessary)', duration: '30 dakika', durationEn: '30 minutes' },
  { name: 'app_lang, theme (yerel depolama)', nameEn: 'app_lang, theme (local storage)', purpose: 'Dil ve tema tercihi (işlevsel)', purposeEn: 'Language and theme preference (functional)', duration: 'Silinene kadar', durationEn: 'Until removed' },
  { name: 'smart_inventory_notifications, ecelon_ai_banner_dismissed (yerel depolama)', nameEn: 'smart_inventory_notifications, ecelon_ai_banner_dismissed (local storage)', purpose: 'Bildirim listesi ve kapatılan duyurular (işlevsel)', purposeEn: 'Notification list and dismissed banners (functional)', duration: 'Silinene kadar', durationEn: 'Until removed' },
];

const BASIS_TR: Record<string, string> = { ADEQUACY: 'yeterlilik kararı', SCC: 'standart sözleşme (Kurula bildirilmiştir)', BCR: 'bağlayıcı şirket kuralları', INCIDENTAL_CONSENT: 'arızi aktarım - açık rıza', DOMESTIC: 'yurt içi' };
const BASIS_EN: Record<string, string> = { ADEQUACY: 'adequacy decision', SCC: 'standard contract (notified to the Board)', BCR: 'binding corporate rules', INCIDENTAL_CONSENT: 'incidental transfer - explicit consent', DOMESTIC: 'domestic' };

export function buildPrivacyNotice(
  company: NoticeCompany,
  audience: NoticeAudience,
  lang: 'tr' | 'en',
  processors: NoticeProcessor[],
  transfers: NoticeProcessor[],
  retentionText: (category: string) => string,
): { title: string; body: string } {
  const tr = lang === 'tr';
  const groups = AUDIENCE_GROUPS[audience];
  const entries = DATA_CATALOG.filter((e) => groups.includes(e.subjectGroup) && !e.special);
  const unvan = company.legalName || company.name;
  const id = company.taxId ? `${company.taxIdType === 'TCKN' ? 'TCKN' : 'VKN'} ${company.taxId}` : '';
  const contact = company.kvkkContactEmail || company.email || '-';
  const L: string[] = [];
  const audienceLabel = groups.map((g) => SUBJECT_GROUP_LABELS[g][lang]).join(', ');
  const title = tr ? `Kişisel Verilerin Korunması Hakkında Aydınlatma Metni - ${audienceLabel}` : `Privacy Notice - ${audienceLabel}`;

  L.push(tr ? '## 1. Veri sorumlusu' : '## 1. Data controller');
  L.push(
    tr
      ? `${unvan}${id ? ` (${id})` : ''}${company.mersisNo ? `, MERSİS ${company.mersisNo}` : ''}${company.addressText ? `, ${company.addressText}` : ''}. 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu sıfatıyla kişisel verilerinizi aşağıda açıklanan kapsamda işlemekteyiz.`
      : `${unvan}${id ? ` (${id})` : ''}${company.mersisNo ? `, MERSIS ${company.mersisNo}` : ''}${company.addressText ? `, ${company.addressText}` : ''} processes your personal data as data controller under the Turkish Personal Data Protection Law No. 6698 ("KVKK") as described below.`,
  );

  L.push(tr ? '## 2. İşlenen kişisel veriler, amaçlar ve hukuki sebepler' : '## 2. Data processed, purposes and legal bases');
  for (const e of entries) {
    L.push(
      tr
        ? `- **${e.category}** (${SUBJECT_GROUP_LABELS[e.subjectGroup].tr}): ${e.purposes.join('; ')}. Hukuki sebep: ${e.legalBasis.join('; ')}. Saklama: ${retentionText(e.retentionCategory)}.`
        : `- **${e.categoryEn}** (${SUBJECT_GROUP_LABELS[e.subjectGroup].en}): ${e.purposesEn.join('; ')}. Legal basis: ${e.legalBasis.map((b) => catalogText(b, 'en')).join('; ')}. Retention: ${retentionText(e.retentionCategory)}.`,
    );
  }
  L.push(
    tr
      ? 'Fatura, irsaliye ve teslimat için açık rıza istenmez; bu işlemler sözleşmenin ifası ve hukuki yükümlülük sebebine dayanır. Açık rıza yalnızca ticari elektronik ileti gibi isteğe bağlı amaçlar için, ayrıca ve önceden işaretlenmemiş biçimde alınır.'
      : 'No consent is requested for invoicing, despatch or delivery: they rely on the performance of the contract and legal obligations. Consent is asked separately, never pre-ticked, only for optional purposes such as commercial e-messages.',
  );

  L.push(tr ? '## 3. Kişisel verilerin aktarılması' : '## 3. Recipients and transfers');
  const recips = Array.from(new Set(entries.flatMap((e) => e.recipients)));
  L.push(tr ? `Alıcı grupları: ${recips.join('; ')}.` : `Recipient groups: ${recips.map((r) => catalogText(r, 'en')).join('; ')}.`);
  if (processors.length) {
    L.push(tr ? 'Veri işleyenler (alt işleyenler):' : 'Processors (sub-processors):');
    for (const p of processors) L.push(`- ${p.name} - ${p.service} (${p.country}${p.transferBasis && p.country !== 'TR' ? `, ${(tr ? BASIS_TR : BASIS_EN)[p.transferBasis] || p.transferBasis}` : ''})`);
  }
  const abroad = transfers.filter((t) => t.country !== 'TR');
  if (abroad.length) {
    L.push(tr ? 'Yurt dışına aktarım (KVKK md. 9):' : 'Transfers abroad (KVKK art. 9):');
    for (const t of abroad) L.push(`- ${t.name} - ${t.service} (${t.country}, ${(tr ? BASIS_TR : BASIS_EN)[t.transferBasis || ''] || t.transferBasis || '-'})`);
  } else {
    L.push(tr ? 'Kişisel verileriniz yurt dışına aktarılmamaktadır.' : 'Your personal data is not transferred abroad.');
  }

  L.push(tr ? '## 4. Toplama yöntemi' : '## 4. Collection method');
  L.push(
    tr
      ? 'Kişisel verileriniz sipariş, teklif, sözleşme, fatura ve irsaliye süreçlerinde; yazılı, elektronik ortamda ve uygulama üzerinden, kısmen otomatik yollarla toplanmaktadır.'
      : 'Your data is collected during ordering, contracting, invoicing and despatch, in writing, electronically and through the application, partly by automated means.',
  );

  L.push(tr ? '## 5. KVKK md. 11 kapsamındaki haklarınız' : '## 5. Your rights (KVKK art. 11)');
  L.push(
    tr
      ? 'Kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde / yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, KVKK md. 7 şartları çerçevesinde silinmesini veya yok edilmesini ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.'
      : 'You may ask whether your data is processed and request information, learn the purpose and whether it is used accordingly, know the third parties it is transferred to in Türkiye or abroad, request rectification, erasure or destruction under KVKK art. 7 and notification of these to third parties, object to a result against you arising solely from automated analysis and claim compensation for damage caused by unlawful processing.',
  );
  L.push(
    tr
      ? `Başvurularınızı Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca yazılı olarak, ${company.kepAddress ? `KEP adresimize (${company.kepAddress}), ` : ''}güvenli elektronik imza veya mobil imza ile ya da sistemimizde kayıtlı e-posta adresinizden ${contact} adresine iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.`
      : `You can apply in writing, ${company.kepAddress ? `via registered e-mail (KEP: ${company.kepAddress}), ` : ''}with a secure electronic or mobile signature, or from your registered e-mail address to ${contact}. Applications are answered free of charge within 30 days.`,
  );

  L.push(tr ? '## 6. Çerezler ve yerel depolama' : '## 6. Cookies and local storage');
  L.push(
    tr
      ? 'Uygulama analiz, reklam veya pazarlama çerezi kullanmaz. Yalnızca oturumun güvenli çalışması için zorunlu ve tercihlerinizi hatırlamak için işlevsel kayıtlar kullanılır; bunlar için açık rıza gerekmez:'
      : 'The application uses no analytics, advertising or marketing cookies. Only strictly necessary items for a secure session and functional items remembering your preferences are used; they need no consent:',
  );
  for (const s of STORAGE_ITEMS) L.push(tr ? `- ${s.name}: ${s.purpose}; süre: ${s.duration}.` : `- ${s.nameEn}: ${s.purposeEn}; duration: ${s.durationEn}.`);

  L.push(tr ? '## 7. İletişim' : '## 7. Contact');
  L.push(`${unvan} - ${contact}${company.phone ? ` - ${company.phone}` : ''}${company.website ? ` - ${company.website}` : ''}`);
  return { title, body: L.join('\n\n') };
}

/** Platform documents of the SaaS operator (companyId NULL): terms of service and the processing agreement. */
export function platformDocument(docType: 'TOS' | 'DPA', lang: 'tr' | 'en'): { title: string; body: string } {
  const tr = lang === 'tr';
  if (docType === 'TOS') {
    return {
      title: tr ? 'Kullanım Koşulları' : 'Terms of Service',
      body: (tr
        ? [
            '## 1. Hizmet', 'Ecelon; stok, sipariş, belge ve e-Belge hazırlık süreçleri için bulut tabanlı bir uygulamadır. Uygulama yasal arşiv değildir; e-Belgelerin yasal arşivi şirketin özel entegratöründedir.',
            '## 2. Hesap güvenliği', 'Kullanıcı hesapları kişiye özeldir. Yöneticiler için iki adımlı doğrulama zorunludur. Parola ve doğrulama kodları üçüncü kişilerle paylaşılamaz.',
            '## 3. Veriler', 'Şirket verilerinin sahibi ve kişisel veriler bakımından veri sorumlusu müşteri şirkettir; işletmeci veri işleyen sıfatıyla Veri İşleme Sözleşmesi kapsamında hareket eder.',
            '## 4. Hesabın kapatılması', 'Şirket hesabı kapatıldığında tam dışa aktarım sağlanır; yasal saklama gerektirmeyen veriler silinir, kalan veriler saklama süresi sonuna kadar salt okunur tutulur.',
          ]
        : [
            '## 1. Service', 'Ecelon is a cloud application for inventory, orders, documents and e-document preparation. It is not a legal archive; the legal archive of e-documents is kept by the company\'s integrator.',
            '## 2. Account security', 'Accounts are personal. Two-factor authentication is mandatory for administrators. Passwords and codes must not be shared.',
            '## 3. Data', 'The customer company owns its data and is the data controller; the operator acts as processor under the Data Processing Agreement.',
            '## 4. Closing the account', 'On closure a full export is provided; data without a legal retention duty is deleted and the rest is kept read-only until the end of retention.',
          ]).join('\n\n'),
    };
  }
  return {
    title: tr ? 'Veri İşleme Sözleşmesi (KVKK md. 12/2)' : 'Data Processing Agreement (KVKK art. 12/2)',
    body: (tr
      ? [
          '## 1. Taraflar ve konu', 'Müşteri şirket veri sorumlusu, uygulama işletmecisi veri işleyendir. İşletmeci kişisel verileri yalnızca veri sorumlusunun talimatıyla ve hizmetin sunulması amacıyla işler.',
          '## 2. Güvenlik tedbirleri', 'Kimlik numaralarının şifrelenmesi, rol ve yetki bazlı erişim, değiştirilemez denetim kaydı, iki adımlı doğrulama, yedekleme ve erişim logları (KVKK md. 12/1).',
          '## 3. Alt işleyenler', 'Alt işleyenler ve bulundukları ülkeler uygulamadaki "Alt işleyenler" sayfasında güncel olarak listelenir. Yeni bir alt işleyen önceden bildirilir.',
          '## 4. İhlal bildirimi', 'İşletmeci bir veri ihlalini öğrendiğinde gecikmeksizin veri sorumlusuna bildirir; veri sorumlusunun Kurula 72 saat içinde bildirimine destek olur.',
          '## 5. İlgili kişi başvuruları', 'İşletmeci, başvuruların 30 gün içinde yanıtlanması için gerekli araçları (dışa aktarım, anonimleştirme, imha kayıtları) sağlar.',
          '## 6. Sürenin sonu', 'Sözleşme sona erdiğinde veriler veri sorumlusuna iade edilir; yasal saklama gerektirmeyenler silinir.',
        ]
      : [
          '## 1. Parties and subject', 'The customer company is the controller, the operator is the processor and processes personal data only on the controller\'s instructions to provide the service.',
          '## 2. Security measures', 'Encryption of identity numbers, role and permission based access, immutable audit trail, two-factor authentication, backups and access logs (KVKK art. 12/1).',
          '## 3. Sub-processors', 'Sub-processors and their countries are listed on the "Sub-processors" page. A new sub-processor is announced in advance.',
          '## 4. Breach notification', 'The operator informs the controller without delay and supports the 72-hour notification to the Board.',
          '## 5. Data subject requests', 'The operator provides the tools (export, anonymisation, destruction records) to answer requests within 30 days.',
          '## 6. Termination', 'At the end the data is returned to the controller; data without a retention duty is deleted.',
        ]).join('\n\n'),
  };
}
