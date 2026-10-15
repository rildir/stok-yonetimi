/**
 * Seed rows of the global UBL-TR code tables (tax_exemption_codes, withholding_codes,
 * otv_codes). Inserted by migration 1784274132000, brought to v1.43 by migration
 * 1784274133000 (upsert per code / validFrom) and, for schema-sync databases, by SeedService.
 *
 * Source: GİB "UBL-TR Kod Listeleri" Versiyon 1.43 (27.07.2026, "Temmuz 2026"):
 *  - §1.8 TaxExemptionReasonCode: Kısmi istisna (201-250), Tam istisna (301-351), Diğer işlem
 *    türü (555, since v1.42 of 12.03.2026), İhraç kayıtlı / DİİB / geçici kabul (701-704);
 *  - §1.9 TaxTypeCode: Vergi kodları listesi (ÖTV 0071 / 0073-0077 / 9077) and Tevkifat kodları
 *    (601-627 partial, 801-825 full) with their rates.
 * Codes, names and rates are copied from the list (confidence 'high'). What the list does not
 * say - which buyers apply a withholding code (KDVGUT I/C-2.1.2.1 / 2.1.3), how 702-704 affect
 * VAT collection - is our legal mapping and carries confidence 'medium' with a note, as the plan
 * requires ("Ek" list). Super administrators add newer versions through POST /admin/tax-codes/:kind.
 */

export const CODE_LIST_VERSION = 'UBL-TR Kod Listeleri v1.43 (27.07.2026)';
const SRC_EX = 'GİB UBL-TR Kod Listeleri v1.43 §1.8 TaxExemptionReasonCode';
const SRC_W = 'GİB UBL-TR Kod Listeleri v1.43 §1.9 Tevkifat Kodları Listesi; KDVGUT I/C-2.1.3';
const SRC_OTV = 'GİB UBL-TR Kod Listeleri v1.43 §1.9 Vergi Kodları Listesi';
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

type Ex = [code: string, nameTr: string, nameEn: string, extra?: Partial<ExemptionSeed>];

const PARTIAL: Ex[] = [
  ['201', '17/1 Kültür ve Eğitim Amacı Taşıyan İşlemler', '17/1 Cultural and educational transactions'],
  ['202', '17/2-a Sağlık, Çevre ve Sosyal Yardım Amaçlı İşlemler', '17/2-a Health, environment and social aid transactions'],
  ['204', '17/2-c Yabancı Diplomatik Organ ve Hayır Kurumlarının Yapacakları Bağışlarla İlgili Mal ve Hizmet Alışları', '17/2-c Purchases related to donations by foreign diplomatic bodies and charities'],
  ['205', '17/2-d Taşınmaz Kültür Varlıklarına İlişkin Teslimler ve Mimarlık Hizmetleri', '17/2-d Deliveries of immovable cultural assets and related architecture services'],
  ['206', '17/2-e Mesleki Kuruluşların İşlemleri', '17/2-e Transactions of professional organisations'],
  ['207', '17/3 Askeri Fabrika, Tersane ve Atölyelerin İşlemleri', '17/3 Transactions of military factories, shipyards and workshops'],
  ['208', '17/4-c Birleşme, Devir, Dönüşüm ve Bölünme İşlemleri', '17/4-c Mergers, transfers, conversions and demergers'],
  ['209', '17/4-e Banka ve Sigorta Muameleleri Vergisi Kapsamına Giren İşlemler', '17/4-e Transactions subject to banking and insurance transactions tax'],
  ['211', '17/4-h Zirai Amaçlı Su Teslimleri ile Köy Tüzel Kişiliklerince Yapılan İçme Suyu Teslimleri', '17/4-h Agricultural water and village drinking water deliveries'],
  ['212', '17/4-ı Serbest Bölgelerde Verilen Hizmetler', '17/4-ı Services rendered in free zones'],
  ['213', '17/4-j Boru Hattı ile Yapılan Petrol ve Gaz Taşımacılığı', '17/4-j Oil and gas transport by pipeline'],
  ['214', '17/4-k Organize Sanayi Bölgelerindeki Arsa ve İşyeri Teslimleri ile Konut Yapı Kooperatiflerinin Üyelerine Konut Teslimleri', '17/4-k Land and workplace deliveries in organised industrial zones; housing cooperative deliveries to members'],
  ['215', '17/4-l Varlık Yönetim Şirketlerinin İşlemleri', '17/4-l Transactions of asset management companies'],
  ['216', '17/4-m Tasarruf Mevduatı Sigorta Fonunun İşlemleri', '17/4-m Transactions of the Savings Deposit Insurance Fund'],
  ['217', '17/4-n Basın-Yayın ve Enformasyon Genel Müdürlüğüne Verilen Haber Hizmetleri', '17/4-n News services to the Directorate General of Press and Information'],
  ['218', '17/4-o Gümrük Antrepoları, Geçici Depolama Yerleri ile Gümrüklü Sahalarda Vergisiz Satış Yapılan İşyeri, Depo ve Ardiye Gibi Bağımsız Birimlerin Kiralanması', '17/4-o Rental of duty-free shops, depots and storage units in customs areas'],
  ['219', 'Hazine, Toplu Konut İdaresi Başkanlığı, Belediyeler, İl Özel İdareleri ve Yatırım İzleme ve Koordinasyon Başkanlıklarının İşlemleri', 'Transactions of the Treasury, TOKİ, municipalities, special provincial administrations and investment monitoring agencies'],
  ['220', '17/4-r İki Tam Yıl Süreyle Sahip Olunan Taşınmaz ve İştirak Hisseleri ile 15/7/2023 Tarihinden Önce Kurumların Aktifinde Kayıtlı Taşınmaz Satışı', '17/4-r Sale of real estate and participations held for two full years; real estate on the books before 15.07.2023'],
  ['221', 'Geçici 15 Konut Yapı Kooperatifleri, Belediyeler ve Sosyal Güvenlik Kuruluşlarına Verilen İnşaat Taahhüt Hizmeti', 'Provisional 15 Construction services to housing cooperatives, municipalities and social security institutions'],
  ['223', 'Geçici 20/1 Teknoloji Geliştirme Bölgelerinde Yapılan İşlemler', 'Provisional 20/1 Transactions in technology development zones'],
  ['225', 'Geçici 23 Milli Eğitim Bakanlığına Yapılan Bilgisayar Bağışları ile İlgili Teslimler', 'Provisional 23 Deliveries related to computer donations to the Ministry of Education'],
  ['226', '17/2-b Özel Okullar, Üniversite ve Yüksekokullar Tarafından Verilen Bedelsiz Eğitim ve Öğretim Hizmetleri', '17/2-b Free education services by private schools and universities'],
  ['227', '17/2-b Kanunların Gösterdiği Gerek Üzerine Bedelsiz Olarak Yapılan Teslim ve Hizmetler', '17/2-b Free deliveries and services required by law'],
  ['228', '17/2-b Kanunun (17/1) Maddesinde Sayılan Kurum ve Kuruluşlara Bedelsiz Olarak Yapılan Teslimler', '17/2-b Free deliveries to institutions listed in art. 17/1'],
  ['229', 'Gıda Bankacılığı Faaliyetinde Bulunan Darülaceze, Dernek ve Vakıflara Bağışlanan Gıda, Temizlik, Giyecek ve Yakacak Maddeleri', 'Food, cleaning, clothing and fuel donated to food-bank charities and foundations'],
  ['230', '17/4-g Külçe Altın, Külçe Gümüş ve Kıymetli Taşların Teslimi', '17/4-g Delivery of gold / silver bullion and precious stones'],
  ['231', '17/4-g Metal, Plastik, Lastik, Kauçuk, Kâğıt, Cam Hurda ve Atıkların Teslimi', '17/4-g Delivery of metal, plastic, rubber, paper and glass scrap and waste', { note: 'Plan "Ek" listesindeki 231 anlamı v1.43 ile teyit edildi.' }],
  ['232', '17/4-g Döviz, Para, Damga Pulu, Değerli Kağıtlar, Hisse Senedi ve Tahvil Teslimleri', '17/4-g Delivery of foreign currency, money, stamps, securities, shares and bonds'],
  ['233', '2942 Sayılı Kamulaştırma Kanunu Kapsamında Taşınmazların Kamulaştırmayı Yapan Devlet ve Kamu Tüzel Kişilerine Devri', 'Transfer of expropriated real estate under Law 2942 to the expropriating public body'],
  ['234', '17/4-ş Konut Finansmanı Amacıyla Teminat Gösterilen ve İpotek Konulan Konutların Teslimi', '17/4-ş Delivery of mortgaged homes pledged for housing finance'],
  ['235', '16/1-c Transit ve Gümrük Antrepo Rejimleri ile Geçici Depolama ve Serbest Bölge Hükümlerinin Uygulandığı Malların Teslimi', '16/1-c Goods under transit, customs warehouse, temporary storage or free zone regimes', { note: 'Plan "Ek" listesindeki 235 anlamı v1.43 ile teyit edildi.' }],
  ['236', '19/2 Usulüne Göre Yürürlüğe Girmiş Uluslararası Anlaşmalar Kapsamındaki İstisnalar (İade Hakkı Tanınmayan)', '19/2 Exemptions under international agreements (no refund right)'],
  ['237', '17/4-t 5300 Sayılı Kanuna Göre Düzenlenen Ürün Senetlerinin İhtisas/Ticaret Borsaları Aracılığıyla İlk Teslimlerinden Sonraki Teslim', '17/4-t Deliveries of warehouse receipts (Law 5300) after the first delivery via exchanges'],
  ['238', '17/4-u Varlıkların Varlık Kiralama Şirketlerine Devri ile Bu Varlıkların Varlık Kiralama Şirketlerince Kiralanması ve Devralınan Kuruma Devri', '17/4-u Transfers to and leases by asset leasing companies (sukuk)'],
  ['239', '17/4-y Taşınmazların Finansal Kiralama Şirketlerine Devri, Finansal Kiralama Şirketi Tarafından Devredene Kiralanması ve Devri', '17/4-y Sale-and-leaseback of real estate with financial leasing companies'],
  ['240', '17/4-z Patentli veya Faydalı Model Belgeli Buluşa İlişkin Gayri Maddi Hakların Kiralanması, Devri ve Satışı', '17/4-z Lease, transfer and sale of patented / utility model rights'],
  ['241', 'TürkAkım Gaz Boru Hattı Projesine İlişkin Anlaşmanın (9/b) Maddesinde Yer Alan Hizmetler', 'Services under art. 9/b of the TurkStream pipeline agreement'],
  ['242', '17/4-ö Gümrük Antrepoları, Geçici Depolama Yerleri ile Gümrüklü Sahalarda, İthalat ve İhracat İşlemlerine Konu Mallar ile Transit Rejim Kapsamında İşlem Gören Mallar İçin Verilen Ardiye, Depolama ve Terminal Hizmetleri', '17/4-ö Storage and terminal services in customs areas for import, export and transit goods'],
  ['250', 'Diğerleri (kısmi istisna)', 'Other (partial exemption)'],
];

const FULL: Ex[] = [
  ['301', '11/1-a Mal İhracatı', '11/1-a Export of goods', { requiresForeignBuyer: true }],
  ['302', '11/1-a Hizmet İhracatı', '11/1-a Export of services', { requiresForeignBuyer: true }],
  ['303', '11/1-a Roaming Hizmetleri', '11/1-a Roaming services'],
  ['304', '13/a Deniz, Hava ve Demiryolu Taşıma Araçlarının Teslimi ile İnşa, Tadil, Bakım ve Onarımları', '13/a Delivery, construction and repair of sea, air and rail vehicles'],
  ['305', '13/b Deniz ve Hava Taşıma Araçları İçin Liman ve Hava Meydanlarında Yapılan Hizmetler', '13/b Port and airport services for sea and air vehicles'],
  ['306', '13/c Petrol Aramaları ve Petrol Boru Hatlarının İnşa ve Modernizasyonuna İlişkin Yapılan Teslim ve Hizmetler', '13/c Oil exploration and pipeline construction deliveries and services'],
  ['307', '13/c Maden Arama, Altın, Gümüş ve Platin Madenleri İçin İşletme, Zenginleştirme ve Rafinaj Faaliyetlerine İlişkin Teslim ve Hizmetler', '13/c Mining exploration; gold, silver and platinum processing and refining'],
  ['308', '13/d Teşvikli Yatırım Mallarının Teslimi', '13/d Delivery of investment goods under an incentive certificate'],
  ['309', '13/e Liman ve Hava Meydanlarının İnşası, Yenilenmesi ve Genişletilmesi', '13/e Construction, renewal and extension of ports and airports'],
  ['310', '13/f Ulusal Güvenlik Amaçlı Teslim ve Hizmetler', '13/f National security deliveries and services'],
  ['311', '14/1 Uluslararası Taşımacılık', '14/1 International transport'],
  ['312', '15/a Diplomatik Organ ve Misyonlara Yapılan Teslim ve Hizmetler', '15/a Deliveries and services to diplomatic missions'],
  ['313', '15/b Uluslararası Kuruluşlara Yapılan Teslim ve Hizmetler', '15/b Deliveries and services to international organisations'],
  ['314', '19/2 Usulüne Göre Yürürlüğe Girmiş Uluslararası Anlaşmalar Kapsamındaki İstisnalar', '19/2 Exemptions under international agreements'],
  ['315', '14/3 İhraç Konusu Eşyayı Taşıyan Kamyon, Çekici ve Yarı Römorklara Yapılan Motorin Teslimleri', '14/3 Diesel for trucks carrying export goods'],
  ['316', '11/1-a Serbest Bölgelerdeki Müşteriler İçin Yapılan Fason Hizmetler', '11/1-a Contract manufacturing for customers in free zones'],
  ['317', '17/4-s Engellilerin Eğitimleri, Meslekleri ve Günlük Yaşamlarına İlişkin Araç-Gereç ve Bilgisayar Programları', '17/4-s Equipment and software for persons with disabilities'],
  ['318', 'Geçici 29 Yap-İşlet-Devret (3996), Kiralama Karşılığı Sağlık Tesisi (3359) ve Eğitim Öğretim Tesisi (652 s. KHK) Projelerine İlişkin Teslim ve Hizmetler', 'Provisional 29 Build-operate-transfer and lease-based health / education facility projects'],
  ['319', '13/g Başbakanlık Merkez Teşkilatına Yapılan Araç Teslimleri', '13/g Vehicle deliveries to the Prime Ministry central organisation'],
  ['320', 'Geçici 16 (6111 s. K.) İSMEP Kapsamında İstanbul Proje Koordinasyon Birimine Yapılacak Teslim ve Hizmetler', 'Provisional 16 Deliveries and services to the Istanbul Project Coordination Unit (ISMEP)'],
  ['321', 'Geçici 26 BM, NATO ve OECD Temsilcilikleri ile Bağlı Kuruluşlarına Resmi Kullanımları İçin Yapılan Teslim ve Hizmetler', 'Provisional 26 Deliveries and services to UN, NATO and OECD bodies for official use'],
  ['322', "11/1-a Türkiye'de İkamet Etmeyenlere Özel Fatura ile Yapılan Teslimler (Bavul Ticareti)", '11/1-a Deliveries to non-residents with a special invoice (suitcase trade)', { requiresForeignBuyer: true }],
  ['323', '13/ğ 5300 Sayılı Kanuna Göre Düzenlenen Ürün Senetlerinin İhtisas/Ticaret Borsaları Aracılığıyla İlk Teslimi', '13/ğ First delivery of warehouse receipts (Law 5300) via exchanges'],
  ['324', '13/h Türkiye Kızılay Derneğine Yapılan Teslim ve Hizmetler ile Türkiye Kızılay Derneğinin Teslim ve Hizmetleri', '13/h Deliveries and services to and by the Turkish Red Crescent'],
  ['325', '13/ı Yem Teslimleri', '13/ı Animal feed deliveries'],
  ['326', '13/ı Gıda, Tarım ve Hayvancılık Bakanlığı Tarafından Tescil Edilmiş Gübrelerin Teslimi', '13/ı Delivery of registered fertilisers'],
  ['327', '13/ı Tescil Edilmiş Gübrelerin İçeriğinde Bulunan Hammaddelerin Gübre Üreticilerine Teslimi', '13/ı Raw materials of registered fertilisers delivered to fertiliser producers'],
  ['328', '13/i Konut veya İşyeri Teslimleri', '13/i Residential or workplace deliveries'],
  ['329', 'FATİH Projesi Kapsamında Milli Eğitim Bakanlığına Yapılacak Mal Teslimi ve Hizmet İfası', 'Deliveries and services to the Ministry of Education under the FATİH project'],
  ['330', '13/j Organize Sanayi Bölgeleri ile Küçük Sanayi Sitelerinin İnşasına İlişkin Teslim ve Hizmetler', '13/j Construction of organised industrial zones and small industrial sites'],
  ['331', '13/m Ar-Ge, Yenilik ve Tasarım Faaliyetlerinde Kullanılmak Üzere Yapılan Yeni Makina ve Teçhizat Teslimleri', '13/m New machinery and equipment for R&D, innovation and design'],
  ['332', 'Geçici 39 İmalat Sanayiinde Kullanılmak Üzere Yapılan Yeni Makina ve Teçhizat Teslimleri', 'Provisional 39 New machinery and equipment for manufacturing industry'],
  ['333', '13/k Genel ve Özel Bütçeli Kamu İdarelerine, İl Özel İdarelerine, Belediyelere ve Köylere Bağışlanan Tesislerin İnşası', '13/k Construction of facilities donated to public administrations, municipalities and villages'],
  ['334', '13/l Yabancılara Verilen Sağlık Hizmetleri', '13/l Health services to foreigners'],
  ['335', '13/n Basılı Kitap ve Süreli Yayınların Teslimleri', '13/n Delivery of printed books and periodicals'],
  ['336', 'Geçici 46 UEFA Müsabakaları Kapsamında Yapılacak Teslim ve Hizmetler', 'Provisional 46 Deliveries and services for UEFA competitions'],
  ['337', 'Türk Akım Gaz Boru Hattı Projesine İlişkin Anlaşmanın (9/h) Maddesi Kapsamındaki Gaz Taşıma Hizmetleri', 'Gas transport services under art. 9/h of the TurkStream agreement'],
  ['338', 'İmalatçıların Mal İhracatları', 'Export of goods by manufacturers', { requiresForeignBuyer: true }],
  ['339', 'İmalat Sanayii ile Turizme Yönelik Yatırım Teşvik Belgesi Kapsamındaki İnşaat İşlerine İlişkin Teslim ve Hizmetler', 'Construction works under manufacturing / tourism investment incentive certificates'],
  ['340', 'Elektrik Motorlu Taşıt Araçlarının Geliştirilmesine Yönelik Mühendislik Hizmetleri', 'Engineering services for developing electric motor vehicles'],
  ['341', 'Afetzedelere Bağışlanacak Konutların İnşasına İlişkin İstisna', 'Construction of homes donated to disaster victims'],
  ['342', 'Genel Bütçeli Kamu İdarelerine Bağışlanacak Taşınmazların İnşasına İlişkin İstisna', 'Construction of real estate donated to central government administrations'],
  ['343', 'Genel Bütçeli Kamu İdarelerine Bağışlanacak Konutların Yabancı Devlet Kurum ve Kuruluşlarına Teslimine İlişkin İstisna', 'Delivery of homes donated to central government to foreign state bodies'],
  ['344', '13/o Milli Savunma ve İç Güvenlik İhtiyaçlarında Kullanılmak Üzere Taşıt Teslimi', '13/o Vehicles for national defence and internal security'],
  ['350', 'Diğerleri (tam istisna)', 'Other (full exemption)'],
];

const ex = (type: ExemptionSeed['type'], invoiceType: string) => ([code, nameTr, nameEn, extra]: Ex): ExemptionSeed => ({ code, nameTr, nameEn, type, invoiceType, ...(extra || {}) });

export const EXEMPTION_CODE_SEEDS: ExemptionSeed[] = [
  // Kısmi istisna - ISTISNA invoice type
  ...PARTIAL.map(ex('PARTIAL', 'ISTISNA')),
  // Tam istisna - ISTISNA invoice type
  ...FULL.map(ex('FULL', 'ISTISNA')),
  {
    code: '351',
    nameTr: 'KDV - İstisna Olmayan Diğer',
    nameEn: 'VAT - other, not an exemption (0 % VAT invoice)',
    type: 'OTHER',
    invoiceType: 'SATIS',
    note: '1 No.lu KDV beyannamesi işlem kodları dışında, istisna olmayan ancak %0 KDV\'li fatura gereken durumlar.',
  },
  // Diğer işlem türü kodları (v1.42, 12.03.2026)
  {
    code: '555',
    nameTr: 'KDV Oran Kontrolüne Tabi Olmayan Satışlar',
    nameEn: 'Sales not subject to the VAT rate check',
    type: 'OTHER',
    invoiceType: 'SATIS',
    validFrom: '2026-03-12',
    note: 'Faaliyet ve sicil servislerinde faaliyet koduna uygun KDV oranı bulunmayan satışlarda (yansıtma, aktife kayıtlı demirbaş / taşıt satışı gibi) kullanılır; KDV satırın oranıyla hesaplanır.',
  },
  // İhraç kayıtlı satışlar, DİİB ve geçici kabul - IHRACKAYITLI invoice type
  {
    code: '701',
    nameTr: '3065 s. KDV Kanununun 11/1-c md. Kapsamındaki İhraç Kayıtlı Satış',
    nameEn: 'Export-registered sale under VAT Law 11/1-c',
    type: 'EXPORT_REGISTERED',
    invoiceType: 'IHRACKAYITLI',
    vatCalculatedNotCollected: true,
  },
  {
    code: '702',
    nameTr: 'DİİB ve Geçici Kabul Rejimi Kapsamındaki Satışlar',
    nameEn: 'Sales under inward processing (DİİB) and temporary admission',
    type: 'EXPORT_REGISTERED',
    invoiceType: 'IHRACKAYITLI',
    vatCalculatedNotCollected: true,
    confidence: 'medium',
    note: 'Kod ve ad v1.43; KDV\'nin hesaplanıp tahsil edilmemesi (701 ile aynı) uygulaması mali müşavirle teyit edilmeli.',
  },
  {
    code: '703',
    nameTr: '4760 s. ÖTV Kanununun 8/2 Md. Kapsamındaki İhraç Kayıtlı Satış',
    nameEn: 'Export-registered sale under SCT Law 8/2',
    type: 'EXPORT_REGISTERED',
    invoiceType: 'IHRACKAYITLI',
    confidence: 'medium',
    note: 'Kod ve ad v1.43; yalnız ÖTV ihraç kaydı, KDV normal hesaplanıp tahsil edilir - teyit edilmeli.',
  },
  {
    code: '704',
    nameTr: '3065 s. KDV Kanununun 11/1-c md. ve 4760 s. ÖTV Kanununun 8/2 md. Kapsamındaki İhraç Kayıtlı Satış',
    nameEn: 'Export-registered sale under VAT Law 11/1-c and SCT Law 8/2',
    type: 'EXPORT_REGISTERED',
    invoiceType: 'IHRACKAYITLI',
    vatCalculatedNotCollected: true,
    confidence: 'medium',
    note: 'Kod ve ad v1.43; KDV 701 gibi hesaplanır ama tahsil edilmez. ÖTV\'nin tahsil edilmemesi motor tarafından ayrıca uygulanmaz - teyit edilmeli.',
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

const DESIGNATED_NOTE = (ref: string) =>
  `Kod, ad ve oran v1.43. Yalnız belirlenmiş alıcılar (KDVGUT I/C-2.1.2.1) tevkifat yapar (${ref}) - alıcı eşlemesi mali müşavirle teyit edilmeli.`;

type W = [code: string, nameTr: string, nameEn: string, numerator: number, scope: 'SERVICE' | 'DELIVERY', designated: boolean, ref: string];

/** Partial withholding (6xx). Buyer rule: KDVGUT I/C-2.1.3.2 (services) / 2.1.3.3 (deliveries). */
const PARTIAL_W: W[] = [
  ['601', 'Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetleri', 'Construction works with related engineering / architecture services', 4, 'SERVICE', true, 'I/C-2.1.3.2.1'],
  ['602', 'Etüt, Plan-Proje, Danışmanlık, Denetim ve Benzeri Hizmetler', 'Survey, planning, consultancy, audit and similar services', 9, 'SERVICE', true, 'I/C-2.1.3.2.2'],
  ['603', 'Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım Hizmetleri', 'Modification, maintenance and repair of machinery, equipment and vehicles', 7, 'SERVICE', true, 'I/C-2.1.3.2.3'],
  ['604', 'Yemek Servis Hizmeti', 'Catering services', 5, 'SERVICE', false, 'I/C-2.1.3.2.4'],
  ['605', 'Organizasyon Hizmeti', 'Organisation services', 5, 'SERVICE', false, 'I/C-2.1.3.2.4'],
  ['606', 'İşgücü Temin Hizmetleri', 'Labour supply services', 9, 'SERVICE', false, 'I/C-2.1.3.2.5'],
  ['607', 'Özel Güvenlik Hizmeti', 'Private security services', 9, 'SERVICE', false, 'I/C-2.1.3.2.5'],
  ['608', 'Yapı Denetim Hizmetleri', 'Building inspection services', 9, 'SERVICE', false, 'I/C-2.1.3.2.6'],
  ['609', 'Fason Olarak Yaptırılan Tekstil ve Konfeksiyon İşleri, Çanta ve Ayakkabı Dikim İşleri ve Bu İşlere Aracılık Hizmetleri', 'Contract textile, garment, bag and shoe manufacturing and related brokerage', 7, 'SERVICE', false, 'I/C-2.1.3.2.7'],
  ['610', 'Turistik Mağazalara Verilen Müşteri Bulma / Götürme Hizmetleri', 'Customer referral services to tourist shops', 9, 'SERVICE', false, 'I/C-2.1.3.2.8'],
  ['611', 'Spor Kulüplerinin Yayın, Reklâm ve İsim Hakkı Gelirlerine Konu İşlemleri', 'Broadcasting, advertising and naming rights of sports clubs', 9, 'SERVICE', false, 'I/C-2.1.3.2.9'],
  ['612', 'Temizlik Hizmeti', 'Cleaning services', 9, 'SERVICE', true, 'I/C-2.1.3.2.10'],
  ['613', 'Çevre ve Bahçe Bakım Hizmetleri', 'Environmental and garden maintenance services', 9, 'SERVICE', true, 'I/C-2.1.3.2.10'],
  ['614', 'Servis Taşımacılığı Hizmeti', 'Shuttle transport services', 5, 'SERVICE', true, 'I/C-2.1.3.2.11'],
  ['615', 'Her Türlü Baskı ve Basım Hizmetleri', 'Printing services', 7, 'SERVICE', true, 'I/C-2.1.3.2.12'],
  ['616', 'Diğer Hizmetler', 'Other services', 5, 'SERVICE', true, 'I/C-2.1.3.2.13'],
  ['617', 'Hurda Metalden Elde Edilen Külçe Teslimleri', 'Ingots obtained from scrap metal', 7, 'DELIVERY', false, 'I/C-2.1.3.3.1'],
  ['618', 'Hurda Metalden Elde Edilenler Dışındaki Bakır, Çinko, Demir Çelik, Alüminyum ve Kurşun Külçe Teslimleri', 'Copper, zinc, iron-steel, aluminium and lead ingots not from scrap', 7, 'DELIVERY', false, 'I/C-2.1.3.3.1'],
  ['619', 'Bakır, Çinko ve Alüminyum Ürünlerinin Teslimi', 'Copper, zinc and aluminium products', 7, 'DELIVERY', false, 'I/C-2.1.3.3.2'],
  ['620', 'İstisnadan Vazgeçenlerin Hurda ve Atık Teslimi', 'Scrap and waste delivered by those waiving the exemption', 7, 'DELIVERY', false, 'I/C-2.1.3.3.3'],
  ['621', 'Metal, Plastik, Lastik, Kauçuk, Kâğıt ve Cam Hurda ve Atıklardan Elde Edilen Hammadde Teslimi', 'Raw materials obtained from metal, plastic, rubber, paper and glass scrap', 9, 'DELIVERY', false, 'I/C-2.1.3.3.4'],
  ['622', 'Pamuk, Tiftik, Yün ve Yapağı ile Ham Post ve Deri Teslimleri', 'Cotton, mohair, wool, raw hides and skins', 9, 'DELIVERY', false, 'I/C-2.1.3.3.5'],
  ['623', 'Ağaç ve Orman Ürünleri Teslimi', 'Wood and forest products', 5, 'DELIVERY', false, 'I/C-2.1.3.3.6'],
  ['624', 'Yük Taşımacılığı Hizmeti', 'Freight transport services', 2, 'SERVICE', false, 'I/C-2.1.3.2.11'],
  ['625', 'Ticari Reklam Hizmetleri', 'Commercial advertising services', 3, 'SERVICE', false, 'I/C-2.1.3.2.15'],
  ['626', 'Diğer Teslimler', 'Other deliveries', 2, 'DELIVERY', true, 'I/C-2.1.3.3.7'],
  ['627', 'Demir-Çelik Ürünlerinin Teslimi', 'Iron and steel products', 5, 'DELIVERY', false, 'I/C-2.1.3.3.8'],
];

/** Full withholding (8xx, 10/10) counterparts listed in v1.43 (same subject as the 6xx code). */
const FULL_W: [code: string, of: string][] = [
  ['801', '601'], ['802', '602'], ['803', '603'], ['804', '604'], ['805', '605'], ['806', '606'], ['807', '607'], ['808', '608'],
  ['809', '609'], ['810', '610'], ['811', '611'], ['812', '612'], ['813', '613'], ['814', '614'], ['815', '615'], ['816', '617'],
  ['817', '618'], ['818', '619'], ['819', '620'], ['820', '621'], ['821', '622'], ['822', '623'], ['823', '624'], ['824', '625'],
  ['825', '627'],
];

/** 8xx names that differ from their 6xx counterpart in v1.43 (818 adds lead). */
const FULL_W_NAMES: Record<string, [tr: string, en: string]> = {
  '818': ['Bakır, Çinko, Alüminyum ve Kurşun Ürünlerinin Teslimi', 'Copper, zinc, aluminium and lead products'],
};

export const WITHHOLDING_CODE_SEEDS: WithholdingSeed[] = [
  ...PARTIAL_W.map(([code, nameTr, nameEn, numerator, scope, designated, ref]): WithholdingSeed => ({
    code,
    nameTr,
    nameEn,
    numerator,
    scope,
    requiresDesignatedBuyer: designated,
    ...(code === '627'
      ? {
          exemptForImporterOrOreProducer: true,
          note: 'Kod, ad ve oran (5/10) v1.43. KDVGUT I/C-2.1.3.3.8: ithalatçıların ve cevherden üretim yapanların teslimleri kapsam dışı (şirket / tedarikçi ayarı).',
        }
      : designated
        ? { confidence: 'medium' as const, note: DESIGNATED_NOTE(ref) }
        : {}),
  })),
  ...FULL_W.map(([code, of]): WithholdingSeed => {
    const p = PARTIAL_W.find((w) => w[0] === of)!;
    return {
      code,
      nameTr: `${FULL_W_NAMES[code]?.[0] ?? p[1]} (tam tevkifat)`,
      nameEn: `${FULL_W_NAMES[code]?.[1] ?? p[2]} (full withholding)`,
      numerator: 10,
      scope: 'FULL',
      requiresDesignatedBuyer: p[5],
      confidence: 'medium',
      note: `Kod, ad ve oran (10/10) v1.43 (${p[6]}). Tam tevkifatın hangi durumda uygulanacağı kullanıcı tarafından açıkça seçilir; alıcı koşulu ${of} ile aynı kabul edildi - teyit edilmeli.`,
    };
  }),
];

export interface OtvSeed {
  code: string;
  nameTr: string;
  nameEn: string;
  list: string;
}

/** ÖTV tax-type codes (Vergi Kodları Listesi, v1.43 §1.9). */
export const OTV_CODE_SEEDS: OtvSeed[] = [
  { code: '0071', nameTr: 'Petrol ve Doğalgaz Ürünlerine İlişkin ÖTV', nameEn: 'SCT on petroleum and natural gas products', list: 'I' },
  { code: '9077', nameTr: 'Motorlu Taşıt Araçlarına İlişkin ÖTV (Tescile Tabi Olanlar)', nameEn: 'SCT on registrable motor vehicles', list: 'II' },
  { code: '0073', nameTr: 'Kolalı Gazoz, Alkollü İçecekler ve Tütün Mamullerine İlişkin ÖTV', nameEn: 'SCT on cola drinks, alcoholic beverages and tobacco', list: 'III' },
  { code: '0075', nameTr: 'Alkollü İçeceklere İlişkin ÖTV', nameEn: 'SCT on alcoholic beverages', list: 'III-A' },
  { code: '0076', nameTr: 'Tütün Mamullerine İlişkin ÖTV', nameEn: 'SCT on tobacco products', list: 'III-B' },
  { code: '0077', nameTr: 'Kolalı Gazozlara İlişkin ÖTV', nameEn: 'SCT on cola drinks', list: 'III-C' },
  { code: '0074', nameTr: 'Dayanıklı Tüketim ve Diğer Mallara İlişkin ÖTV', nameEn: 'SCT on durable consumer and other goods', list: 'IV' },
];

const ins = (table: string, cols: string[], upsertCols: string[] | null) =>
  `${upsertCols ? 'INSERT' : 'INSERT IGNORE'} INTO \`${table}\` (\`id\`, ${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})` +
  (upsertCols ? ` ON DUPLICATE KEY UPDATE ${upsertCols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ')}` : '');

/**
 * Rows as SQL parameter lists for the migrations / seed. 'ignore' (INSERT IGNORE) keeps existing
 * rows; 'upsert' also refreshes names, flags and the code-list metadata of rows with the same
 * (code, validFrom) - versions added by super administrators (other validFrom) are untouched.
 */
export function taxCodeSeedStatements(uuid: () => string, mode: 'ignore' | 'upsert' = 'ignore'): { sql: string; params: unknown[] }[] {
  const up = (cols: string[]) => (mode === 'upsert' ? cols.filter((c) => c !== 'code' && c !== 'validFrom') : null);
  const out: { sql: string; params: unknown[] }[] = [];
  const exCols = ['code', 'nameTr', 'nameEn', 'type', 'invoiceType', 'vatCalculatedNotCollected', 'requiresForeignBuyer', 'validFrom', 'validTo', 'codeListVersion', 'sourceRef', 'confidence', 'note'];
  for (const e of EXEMPTION_CODE_SEEDS) {
    out.push({
      sql: ins('tax_exemption_codes', exCols, up(exCols)),
      params: [uuid(), e.code, e.nameTr, e.nameEn, e.type, e.invoiceType, e.vatCalculatedNotCollected ? 1 : 0, e.requiresForeignBuyer ? 1 : 0, e.validFrom || FROM, null, e.codeListVersion || CODE_LIST_VERSION, e.sourceRef || SRC_EX, e.confidence || 'high', e.note || null],
    });
  }
  const wCols = ['code', 'nameTr', 'nameEn', 'numerator', 'denominator', 'scope', 'requiresDesignatedBuyer', 'exemptForImporterOrOreProducer', 'validFrom', 'validTo', 'codeListVersion', 'sourceRef', 'confidence', 'note'];
  for (const w of WITHHOLDING_CODE_SEEDS) {
    out.push({
      sql: ins('withholding_codes', wCols, up(wCols)),
      params: [uuid(), w.code, w.nameTr, w.nameEn, w.numerator, 10, w.scope, w.requiresDesignatedBuyer ? 1 : 0, w.exemptForImporterOrOreProducer ? 1 : 0, FROM, null, CODE_LIST_VERSION, SRC_W, w.confidence || 'high', w.note || null],
    });
  }
  const oCols = ['code', 'nameTr', 'nameEn', 'list', 'validFrom', 'validTo', 'codeListVersion', 'sourceRef', 'confidence', 'note'];
  for (const o of OTV_CODE_SEEDS) {
    out.push({
      sql: ins('otv_codes', oCols, up(oCols)),
      params: [uuid(), o.code, o.nameTr, o.nameEn, o.list, FROM, null, CODE_LIST_VERSION, SRC_OTV, 'high', 'Vergi kodu ve ÖTV listesi eşlemesi (plan "Ek" listesi) v1.43 Vergi Kodları Listesi ile teyit edildi.'],
    });
  }
  return out;
}
