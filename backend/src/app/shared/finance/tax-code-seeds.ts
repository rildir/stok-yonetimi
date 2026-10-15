/**
 * Seed rows of the global UBL-TR code tables (tax_exemption_codes, withholding_codes,
 * otv_codes). Inserted by migration 1784274132000 and, for schema-sync databases, by
 * SeedService (idempotent per code / validFrom).
 *
 * Source: GİB "UBL-TR Kod Listeleri" Versiyon 1.31 (Ocak 2023), downloaded from
 * ebelge.gib.gov.tr/dosyalar/kilavuzlar/UBL-TR_Kod_Listeleri-V_1_31.pdf - the latest
 * package file reachable at that path on 15.10.2026. Names are copied from it; where the
 * PDF text could not be read unambiguously (the rate column of the withholding table, the
 * ÖTV tax-type code mapping) or the code comes from a later announcement, the row carries
 * confidence 'medium' / 'low' and a note, as required by the plan ("Ek" list). Super
 * administrators add corrected / newer versions through POST /admin/tax-codes/:kind.
 */

export const CODE_LIST_VERSION = 'UBL-TR Kod Listeleri v1.31 (01.2023)';
const SRC = 'GİB UBL-TR Kod Listeleri v1.31 §1.8 TaxExemptionReasonCode';
const FROM = '2023-01-01';

export interface ExemptionSeed {
  code: string;
  nameTr: string;
  nameEn: string;
  type: 'PARTIAL' | 'FULL' | 'EXPORT_REGISTERED' | 'OTHER';
  invoiceType: string;
  vatCalculatedNotCollected?: boolean;
  requiresForeignBuyer?: boolean;
  validFrom?: string;
  codeListVersion?: string;
  sourceRef?: string;
  confidence?: 'high' | 'medium' | 'low';
  note?: string;
}

export const EXEMPTION_CODE_SEEDS: ExemptionSeed[] = [
  // Kısmi istisna (KDVK 17 vb.) - ISTISNA invoice type
  { code: '201', nameTr: '17/1 Kültür ve Eğitim Amacı Taşıyan İşlemler', nameEn: '17/1 Cultural and educational transactions', type: 'PARTIAL', invoiceType: 'ISTISNA' },
  { code: '202', nameTr: '17/2-a Sağlık, Çevre ve Sosyal Yardım Amaçlı İşlemler', nameEn: '17/2-a Health, environment and social aid transactions', type: 'PARTIAL', invoiceType: 'ISTISNA' },
  { code: '213', nameTr: '17/4-j Boru Hattı ile Yapılan Petrol ve Gaz Taşımacılığı', nameEn: '17/4-j Oil and gas transport by pipeline', type: 'PARTIAL', invoiceType: 'ISTISNA', confidence: 'medium', note: 'Kısmi istisna tablosunun PDF metni kaymalı; kod-ad eşleşmesi teyit edilmeli.' },
  { code: '220', nameTr: '17/4-r İki Tam Yıl Süreyle Sahip Olunan Taşınmaz ve İştirak Hisseleri Satışları', nameEn: '17/4-r Sale of real estate and participations held for two full years', type: 'PARTIAL', invoiceType: 'ISTISNA', confidence: 'medium', note: 'Kısmi istisna tablosunun PDF metni kaymalı; kod-ad eşleşmesi teyit edilmeli.' },
  { code: '230', nameTr: '17/4-g Külçe Altın, Külçe Gümüş ve Kıymetli Taşların Teslimi', nameEn: '17/4-g Delivery of gold / silver bullion and precious stones', type: 'PARTIAL', invoiceType: 'ISTISNA' },
  { code: '231', nameTr: '17/4-g Metal, Plastik, Lastik, Kauçuk, Kağıt, Cam Hurda ve Atıkların Teslimi', nameEn: '17/4-g Delivery of metal, plastic, rubber, paper and glass scrap', type: 'PARTIAL', invoiceType: 'ISTISNA', confidence: 'low', note: 'Plan "Ek" listesi: 231 kısmi istisna kodunun anlamı teyit edilmeli.' },
  { code: '232', nameTr: '17/4-g Döviz, Para, Damga Pulu, Değerli Kağıtlar, Hisse Senedi ve Tahvil Teslimleri', nameEn: '17/4-g Delivery of foreign currency, money, stamps, securities, shares and bonds', type: 'PARTIAL', invoiceType: 'ISTISNA' },
  { code: '235', nameTr: '16/1-c Transit ve Gümrük Antrepo Rejimleri ile Geçici Depolama ve Serbest Bölge Hükümlerinin Uygulandığı Malların Teslimi', nameEn: '16/1-c Goods under transit, customs warehouse, temporary storage or free zone regimes', type: 'PARTIAL', invoiceType: 'ISTISNA', confidence: 'low', note: 'Plan "Ek" listesi: 235 kodunun anlamı teyit edilmeli.' },
  { code: '250', nameTr: 'Diğerleri (kısmi istisna)', nameEn: 'Other (partial exemption)', type: 'PARTIAL', invoiceType: 'ISTISNA' },
  // Tam istisna (KDVK 11, 13, 14, 15) - ISTISNA invoice type
  { code: '301', nameTr: '11/1-a Mal İhracatı', nameEn: '11/1-a Export of goods', type: 'FULL', invoiceType: 'ISTISNA', requiresForeignBuyer: true },
  { code: '302', nameTr: '11/1-a Hizmet İhracatı', nameEn: '11/1-a Export of services', type: 'FULL', invoiceType: 'ISTISNA', requiresForeignBuyer: true },
  { code: '303', nameTr: '11/1-a Roaming Hizmetleri', nameEn: '11/1-a Roaming services', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '304', nameTr: '13/a Deniz, Hava ve Demiryolu Taşıma Araçlarının Teslimi ile İnşa, Tadil, Bakım ve Onarımları', nameEn: '13/a Delivery, construction and repair of sea, air and rail vehicles', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '308', nameTr: '13/d Teşvikli Yatırım Mallarının Teslimi', nameEn: '13/d Delivery of investment goods under an incentive certificate', type: 'FULL', invoiceType: 'ISTISNA', confidence: 'medium', note: 'Tam istisna tablosunun 304-310 aralığı PDF metninde kaymalı; kod-ad eşleşmesi teyit edilmeli.' },
  { code: '311', nameTr: '14/1 Uluslararası Taşımacılık', nameEn: '14/1 International transport', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '312', nameTr: '15/a Diplomatik Organ ve Misyonlara Yapılan Teslim ve Hizmetler', nameEn: '15/a Deliveries and services to diplomatic missions', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '313', nameTr: '15/b Uluslararası Kuruluşlara Yapılan Teslim ve Hizmetler', nameEn: '15/b Deliveries and services to international organisations', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '317', nameTr: '17/4-s Engellilerin Eğitimleri, Meslekleri ve Günlük Yaşamlarına İlişkin Araç-Gereç ve Bilgisayar Programları', nameEn: '17/4-s Equipment and software for persons with disabilities', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '322', nameTr: "11/1-a Türkiye'de İkamet Etmeyenlere Özel Fatura ile Yapılan Teslimler (Bavul Ticareti)", nameEn: '11/1-a Deliveries to non-residents with a special invoice (suitcase trade)', type: 'FULL', invoiceType: 'ISTISNA', requiresForeignBuyer: true },
  { code: '325', nameTr: '13/ı Yem Teslimleri', nameEn: '13/ı Animal feed deliveries', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '326', nameTr: '13/ı Tescil Edilmiş Gübrelerin Teslimi', nameEn: '13/ı Delivery of registered fertilisers', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '335', nameTr: '13/n Basılı Kitap ve Süreli Yayınların Teslimleri', nameEn: '13/n Delivery of printed books and periodicals', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '338', nameTr: 'İmalatçıların Mal İhracatları', nameEn: 'Export of goods by manufacturers', type: 'FULL', invoiceType: 'ISTISNA', requiresForeignBuyer: true },
  { code: '350', nameTr: 'Diğerleri (tam istisna)', nameEn: 'Other (full exemption)', type: 'FULL', invoiceType: 'ISTISNA' },
  { code: '351', nameTr: 'KDV - İstisna Olmayan Diğer', nameEn: 'VAT - other, not an exemption (0 % VAT invoice)', type: 'OTHER', invoiceType: 'SATIS', note: '1 No.lu KDV beyannamesi işlem kodları dışında, istisna olmayan ancak %0 KDV\'li fatura gereken durumlar.' },
  // İhraç kayıtlı satışlar, DİİB ve geçici kabul - IHRACKAYITLI invoice type (VAT calculated, not collected)
  { code: '701', nameTr: '3065 s. KDV Kanununun 11/1-c md. Kapsamındaki İhraç Kayıtlı Satış', nameEn: 'Export-registered sale under VAT Law 11/1-c', type: 'EXPORT_REGISTERED', invoiceType: 'IHRACKAYITLI', vatCalculatedNotCollected: true },
  { code: '702', nameTr: 'DİİB ve Geçici Kabul Rejimi Kapsamındaki Satışlar', nameEn: 'Sales under inward processing (DİİB) and temporary admission', type: 'EXPORT_REGISTERED', invoiceType: 'IHRACKAYITLI', vatCalculatedNotCollected: true, confidence: 'medium', note: 'KDV hesaplanıp tahsil edilmemesi (701 ile aynı) uygulaması mali müşavirle teyit edilmeli.' },
  { code: '703', nameTr: '4760 s. ÖTV Kanununun 8/2 Md. Kapsamındaki İhraç Kayıtlı Satış', nameEn: 'Export-registered sale under SCT Law 8/2', type: 'EXPORT_REGISTERED', invoiceType: 'IHRACKAYITLI', confidence: 'medium', note: 'ÖTV ihraç kaydı; KDV etkisi teyit edilmeli.' },
  // Diğer işlem türü kodları (2026 duyurusu; v1.31 paketinde yok)
  {
    code: '555',
    nameTr: 'KDV Oran Kontrolüne Tabi Olmayan Satışlar',
    nameEn: 'Sales not subject to the VAT rate check',
    type: 'OTHER',
    invoiceType: 'SATIS',
    validFrom: '2026-03-27',
    codeListVersion: 'GİB duyurusu 27.03.2026',
    sourceRef: 'UBL-TR Kod Listeleri "Diğer İşlem Türü Kodları" (Mart 2026); GİB 27.03.2026 erteleme duyurusu',
    confidence: 'low',
    note: 'Ertelenmiş NACE kontrolü: NACE koduna göre KDV oranı kontrolünün ertelendiği dönemde kullanılır. Resmî paket sürümü teyit edilmeli.',
  },
];

export interface WithholdingSeed {
  code: string;
  nameTr: string;
  nameEn: string;
  numerator: number;
  scope: 'SERVICE' | 'DELIVERY' | 'FULL';
  requiresDesignatedBuyer: boolean;
  exemptForImporterOrOreProducer?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  note?: string;
}

const W_NOTE = 'Oran sütunu PDF metninde kaymalı; oran KDVGUT I/C-2.1.3 ile teyit edilmeli.';

/** Partial (6xx) and full (8xx) withholding. Services of 2.1.3.2 are withheld only by the "belirlenmiş alıcılar". */
export const WITHHOLDING_CODE_SEEDS: WithholdingSeed[] = [
  { code: '601', nameTr: 'Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetleri', nameEn: 'Construction works with related engineering / architecture services', numerator: 4, scope: 'SERVICE', requiresDesignatedBuyer: true },
  { code: '602', nameTr: 'Etüt, Plan-Proje, Danışmanlık, Denetim ve Benzeri Hizmetler', nameEn: 'Survey, planning, consultancy, audit and similar services', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: true },
  { code: '603', nameTr: 'Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım Hizmetleri', nameEn: 'Modification, maintenance and repair of machinery, equipment and vehicles', numerator: 7, scope: 'SERVICE', requiresDesignatedBuyer: true },
  { code: '604', nameTr: 'Yemek Servis Hizmeti', nameEn: 'Catering services', numerator: 5, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '605', nameTr: 'Organizasyon Hizmeti', nameEn: 'Organisation services', numerator: 5, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '606', nameTr: 'İşgücü Temin Hizmetleri', nameEn: 'Labour supply services', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '607', nameTr: 'Özel Güvenlik Hizmeti', nameEn: 'Private security services', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '608', nameTr: 'Yapı Denetim Hizmetleri', nameEn: 'Building inspection services', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '609', nameTr: 'Fason Olarak Yaptırılan Tekstil ve Konfeksiyon İşleri, Çanta ve Ayakkabı Dikim İşleri ve Bu İşlere Aracılık Hizmetleri', nameEn: 'Contract textile, garment, bag and shoe manufacturing and related brokerage', numerator: 7, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '610', nameTr: 'Turistik Mağazalara Verilen Müşteri Bulma / Götürme Hizmetleri', nameEn: 'Customer referral services to tourist shops', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '611', nameTr: 'Spor Kulüplerinin Yayın, Reklâm ve İsim Hakkı Gelirlerine Konu İşlemleri', nameEn: 'Broadcasting, advertising and naming rights of sports clubs', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '612', nameTr: 'Temizlik Hizmeti', nameEn: 'Cleaning services', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '613', nameTr: 'Çevre ve Bahçe Bakım Hizmetleri', nameEn: 'Environmental and garden maintenance services', numerator: 9, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '614', nameTr: 'Servis Taşımacılığı Hizmeti', nameEn: 'Shuttle transport services', numerator: 5, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '615', nameTr: 'Her Türlü Baskı ve Basım Hizmetleri', nameEn: 'Printing services', numerator: 7, scope: 'SERVICE', requiresDesignatedBuyer: false },
  { code: '616', nameTr: 'Diğer Hizmetler', nameEn: 'Other services', numerator: 5, scope: 'SERVICE', requiresDesignatedBuyer: true },
  { code: '617', nameTr: 'Hurda Metalden Elde Edilen Külçe Teslimleri', nameEn: 'Ingots obtained from scrap metal', numerator: 7, scope: 'DELIVERY', requiresDesignatedBuyer: false },
  { code: '618', nameTr: 'Hurda Metalden Elde Edilenler Dışındaki Bakır, Çinko, Demir Çelik, Alüminyum ve Kurşun Külçe Teslimleri', nameEn: 'Copper, zinc, iron-steel, aluminium and lead ingots not from scrap', numerator: 7, scope: 'DELIVERY', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '619', nameTr: 'Bakır, Çinko, Alüminyum ve Kurşun Ürünlerinin Teslimi', nameEn: 'Copper, zinc, aluminium and lead products', numerator: 7, scope: 'DELIVERY', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '620', nameTr: 'İstisnadan Vazgeçenlerin Hurda ve Atık Teslimi', nameEn: 'Scrap and waste delivered by those waiving the exemption', numerator: 7, scope: 'DELIVERY', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '621', nameTr: 'Metal, Plastik, Lastik, Kauçuk, Kâğıt ve Cam Hurda ve Atıklardan Elde Edilen Hammadde Teslimi', nameEn: 'Raw materials obtained from metal, plastic, rubber, paper and glass scrap', numerator: 9, scope: 'DELIVERY', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '622', nameTr: 'Pamuk, Tiftik, Yün ve Yapağı ile Ham Post ve Deri Teslimleri', nameEn: 'Cotton, mohair, wool, raw hides and skins', numerator: 9, scope: 'DELIVERY', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '623', nameTr: 'Ağaç ve Orman Ürünleri Teslimi', nameEn: 'Wood and forest products', numerator: 5, scope: 'DELIVERY', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '624', nameTr: 'Yük Taşımacılığı Hizmeti', nameEn: 'Freight transport services', numerator: 2, scope: 'SERVICE', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '625', nameTr: 'Ticari Reklam Hizmetleri', nameEn: 'Commercial advertising services', numerator: 3, scope: 'SERVICE', requiresDesignatedBuyer: false, confidence: 'medium', note: W_NOTE },
  { code: '626', nameTr: 'Diğer Teslimler', nameEn: 'Other deliveries', numerator: 2, scope: 'DELIVERY', requiresDesignatedBuyer: true, confidence: 'medium', note: W_NOTE },
  {
    code: '627',
    nameTr: 'Demir-Çelik Ürünlerinin Teslimi',
    nameEn: 'Iron and steel products',
    numerator: 5,
    scope: 'DELIVERY',
    requiresDesignatedBuyer: false,
    exemptForImporterOrOreProducer: true,
    confidence: 'medium',
    note: 'KDVGUT I/C-2.1.3.3.8. İthalatçılar ve cevherden üretim yapanların teslimleri kapsam dışı (şirket ayarı). ' + W_NOTE,
  },
  // Full withholding (8xx, 10/10)
  { code: '801', nameTr: 'Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetleri (tam)', nameEn: 'Construction works (full withholding)', numerator: 10, scope: 'FULL', requiresDesignatedBuyer: true },
  { code: '812', nameTr: 'Temizlik Hizmeti (tam)', nameEn: 'Cleaning services (full withholding)', numerator: 10, scope: 'FULL', requiresDesignatedBuyer: true },
  { code: '825', nameTr: 'Demir-Çelik Ürünlerinin Teslimi (tam)', nameEn: 'Iron and steel products (full withholding)', numerator: 10, scope: 'FULL', requiresDesignatedBuyer: true },
];

export interface OtvSeed {
  code: string;
  nameTr: string;
  nameEn: string;
  list: string;
}

/** ÖTV tax-type codes (VERGİ KODLARI LİSTESİ). Mapping marked low confidence by the plan. */
export const OTV_CODE_SEEDS: OtvSeed[] = [
  { code: '0071', nameTr: 'Petrol ve Doğalgaz Ürünlerine İlişkin ÖTV', nameEn: 'SCT on petroleum and natural gas products', list: 'I' },
  { code: '9077', nameTr: 'Motorlu Taşıt Araçlarına İlişkin ÖTV (Tescile Tabi Olanlar)', nameEn: 'SCT on registrable motor vehicles', list: 'II' },
  { code: '0073', nameTr: 'Kolalı Gazoz, Alkollü İçecekler ve Tütün Mamullerine İlişkin ÖTV', nameEn: 'SCT on cola drinks, alcoholic beverages and tobacco', list: 'III' },
  { code: '0075', nameTr: 'Alkollü İçeceklere İlişkin ÖTV', nameEn: 'SCT on alcoholic beverages', list: 'III-A' },
  { code: '0076', nameTr: 'Tütün Mamullerine İlişkin ÖTV', nameEn: 'SCT on tobacco products', list: 'III-B' },
  { code: '0077', nameTr: 'Kolalı Gazozlara İlişkin ÖTV', nameEn: 'SCT on cola drinks', list: 'III-C' },
  { code: '0074', nameTr: 'Dayanıklı Tüketim ve Diğer Mallara İlişkin ÖTV', nameEn: 'SCT on durable consumer and other goods', list: 'IV' },
];

const ins = (cols: string[]) => `INSERT IGNORE INTO \`%t\` (\`id\`, ${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`;

/** Rows as SQL parameter lists for the migration / seed (INSERT IGNORE keeps it idempotent). */
export function taxCodeSeedStatements(uuid: () => string): { sql: string; params: unknown[] }[] {
  const out: { sql: string; params: unknown[] }[] = [];
  const exCols = ['code', 'nameTr', 'nameEn', 'type', 'invoiceType', 'vatCalculatedNotCollected', 'requiresForeignBuyer', 'validFrom', 'validTo', 'codeListVersion', 'sourceRef', 'confidence', 'note'];
  for (const e of EXEMPTION_CODE_SEEDS) {
    out.push({
      sql: ins(exCols).replace('%t', 'tax_exemption_codes'),
      params: [uuid(), e.code, e.nameTr, e.nameEn, e.type, e.invoiceType, e.vatCalculatedNotCollected ? 1 : 0, e.requiresForeignBuyer ? 1 : 0, e.validFrom || FROM, null, e.codeListVersion || CODE_LIST_VERSION, e.sourceRef || SRC, e.confidence || 'high', e.note || null],
    });
  }
  const wCols = ['code', 'nameTr', 'nameEn', 'numerator', 'denominator', 'scope', 'requiresDesignatedBuyer', 'exemptForImporterOrOreProducer', 'validFrom', 'validTo', 'codeListVersion', 'sourceRef', 'confidence', 'note'];
  for (const w of WITHHOLDING_CODE_SEEDS) {
    out.push({
      sql: ins(wCols).replace('%t', 'withholding_codes'),
      params: [uuid(), w.code, w.nameTr, w.nameEn, w.numerator, 10, w.scope, w.requiresDesignatedBuyer ? 1 : 0, w.exemptForImporterOrOreProducer ? 1 : 0, FROM, null, CODE_LIST_VERSION, 'GİB UBL-TR Kod Listeleri v1.31 §1.9 Tevkifat Kodları; KDVGUT I/C-2.1.3', w.confidence || 'high', w.note || null],
    });
  }
  const oCols = ['code', 'nameTr', 'nameEn', 'list', 'validFrom', 'validTo', 'codeListVersion', 'sourceRef', 'confidence', 'note'];
  for (const o of OTV_CODE_SEEDS) {
    out.push({
      sql: ins(oCols).replace('%t', 'otv_codes'),
      params: [uuid(), o.code, o.nameTr, o.nameEn, o.list, FROM, null, CODE_LIST_VERSION, 'GİB UBL-TR Kod Listeleri v1.31 §1.9 Vergi Kodları Listesi', 'low', 'Plan "Ek" listesi: ÖTV kod eşlemesi (0073/0075/0076/0077) teyit edilmeli.'],
    });
  }
  return out;
}
