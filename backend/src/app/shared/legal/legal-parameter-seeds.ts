/**
 * Initial `legal_parameters` rows (TR). Inserted by migration 1784274127000 and,
 * for schema-sync databases, by SeedService (idempotent per country/key/validFrom).
 *
 * Every value cites its source. Rows marked confidence 'low' / 'medium' come from
 * the plan's "teyit edilmeden koda gömülmemeli" list and must be confirmed by a
 * financial advisor before relying on them; they are data, not code, so they can be
 * corrected through POST /admin/legal-parameters without a deployment.
 */
export interface LegalParameterSeed {
  country: string;
  key: string;
  validFrom: string;
  validTo: string | null;
  value: unknown;
  sourceRef: string;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

/** Keys that are revalued every calendar year: a missing row for the current year raises an admin warning. */
export const ANNUAL_PARAMETER_KEYS = ['VUK232_INVOICE_LIMIT', 'VUK353_1_FIRST', 'VUK353_2_FIRST'] as const;

/** Keys the e-Belge obligation engine reads. */
export const OBLIGATION_PARAMETER_KEYS = {
  eFaturaThreshold: 'EFATURA_GROSS_SALES_THRESHOLD',
  eIrsaliyeThreshold: 'EIRSALIYE_GROSS_SALES_THRESHOLD',
  allInvoicesBilanco: 'EBELGE_ALL_INVOICES_FROM_BILANCO',
  allInvoicesIsletmeBasit: 'EBELGE_ALL_INVOICES_FROM_ISLETME_BASIT',
  paperLimit: 'EARSIV_PAPER_LIMIT_SIMPLE',
  startMonthDay: 'EBELGE_THRESHOLD_START_MMDD',
  transitionMonths: 'EBELGE_TRANSITION_MONTHS',
  toleranceDay: 'EBELGE_TOLERANCE_DAY',
  sectorRules: 'EBELGE_SECTOR_RULES',
  gibNoticeMinMonths: 'EBELGE_GIB_NOTICE_MIN_MONTHS',
} as const;

/**
 * 509 Sıra No.lu VUK Genel Tebliği sector items (IV.1.4(a) for e-Fatura, IV.3.5 for
 * e-İrsaliye) with their start rules (IV.1.5, IV.3.6). Kept as data in
 * `legal_parameters` (key EBELGE_SECTOR_RULES): the flag list shown in the UI and
 * accepted by the API comes from here.
 */
const FOURTH_MONTH = { type: 'MONTH_START_PLUS', months: 4 } as const;
const ONLINE_THRESHOLDS = [
  { fromYear: 2020, toYear: 2021, amount: 1000000 },
  { fromYear: 2022, toYear: null, amount: 500000 },
];
export const EBELGE_SECTOR_RULES_SEED = [
  // e-Fatura (509 IV.1.4(a))
  { doc: 'EFATURA', code: 'EPDK_OTV1_LICENSE', start: FOURTH_MONTH, ref: '509 IV.1.4(a)(2), IV.1.5(b)' },
  { doc: 'EFATURA', code: 'OTV3_GOODS', start: FOURTH_MONTH, ref: '509 IV.1.4(a)(3), IV.1.5(b)' },
  { doc: 'EFATURA', code: 'ECOMMERCE_INTERMEDIARY', start: { type: 'WITHIN_MONTHS', months: 3 }, ref: '509 IV.1.4(a)(4), IV.1.5(c) (aracı hizmet sağlayıcı, ilan sitesi, internet reklamcılığı aracısı)' },
  { doc: 'EFATURA', code: 'ECOMMERCE_SELLER', start: { type: 'NEXT_YEAR_MMDD' }, thresholds: ONLINE_THRESHOLDS, ref: '509 IV.1.4(a)(4), IV.1.5(c) (internet satışı; 535 SN)' },
  { doc: 'EFATURA', code: 'HAL_TRADER', start: { type: 'WITHIN_MONTHS', months: 3 }, ref: '509 IV.1.4(a)(5), IV.1.5(ç)' },
  { doc: 'EFATURA', code: 'SGK_HEALTH_PROVIDER', start: { type: 'ON_DATE' }, ref: "509 IV.1.4(a)(6), IV.1.5(d) (SGK'ya fatura düzenlemeye başlamadan önce)" },
  { doc: 'EFATURA', code: 'REAL_ESTATE_VEHICLE', start: { type: 'NEXT_YEAR_MMDD' }, thresholds: ONLINE_THRESHOLDS, ref: '509 IV.1.4(a)(7), IV.1.5(e) (535 SN)' },
  { doc: 'EFATURA', code: 'HOTEL_ACCOMMODATION', start: FOURTH_MONTH, ref: '509 IV.1.4(a)(8), IV.1.5(f)' },
  { doc: 'EFATURA', code: 'EV_CHARGING', start: { type: 'ON_DATE' }, ref: '509 IV.1.4(a)(9), IV.1.5(g) (550 SN)' },
  // e-İrsaliye (509 IV.3.5; start IV.3.6: "şartların sağlandığı ayı izleyen dördüncü ayın başı")
  { doc: 'EIRSALIYE', code: 'EPDK_OTV1_LICENSE', start: FOURTH_MONTH, ref: '509 IV.3.5(1), IV.3.6' },
  { doc: 'EIRSALIYE', code: 'OTV3_GOODS', start: FOURTH_MONTH, ref: '509 IV.3.5(2), IV.3.6 (imal, inşa, ithal, ana bayi/distribütör)' },
  { doc: 'EIRSALIYE', code: 'MINING_LICENSE', start: FOURTH_MONTH, ref: '509 IV.3.5(3), IV.3.6' },
  { doc: 'EIRSALIYE', code: 'SUGAR_PRODUCER', start: FOURTH_MONTH, ref: '509 IV.3.5(4), IV.3.6' },
  { doc: 'EIRSALIYE', code: 'IRON_STEEL', start: FOURTH_MONTH, excludeBookkeeping: ['BASIT'], ref: '509 IV.3.5(5), IV.3.6 (GTİP 72/73; basit usul hariç)' },
  { doc: 'EIRSALIYE', code: 'FERTILIZER_TRACKING', start: FOURTH_MONTH, ref: '509 IV.3.5(6), IV.3.6 (Gübre Takip Sistemi)' },
  { doc: 'EIRSALIYE', code: 'HAL_TRADER', start: FOURTH_MONTH, ref: '509 IV.3.5(8), IV.3.6' },
  { doc: 'EIRSALIYE', code: 'CONSTRUCTION_STEEL_TRACKING', start: FOURTH_MONTH, thresholds: [{ fromYear: 2024, toYear: null, amount: 1000000 }], ref: '509 IV.3.5(9), IV.3.6 (İnşaat Demiri İzleme Sistemi; 573 SN)' },
];

export const SPECIAL_TAX_IDS_KEY = 'SPECIAL_TAX_IDS';

const TR = 'TR';

export const LEGAL_PARAMETER_SEEDS: LegalParameterSeed[] = [
  // VUK 232: invoice obligation limit (yearly revaluation)
  { country: TR, key: 'VUK232_INVOICE_LIMIT', validFrom: '2024-01-01', validTo: '2024-12-31', value: 6900, sourceRef: 'VUK md. 232/2 (2024 yeniden değerlenmiş tutar)', confidence: 'high' },
  { country: TR, key: 'VUK232_INVOICE_LIMIT', validFrom: '2025-01-01', validTo: '2025-12-31', value: 9900, sourceRef: 'VUK md. 232/2 (2025 yeniden değerlenmiş tutar)', confidence: 'high' },
  { country: TR, key: 'VUK232_INVOICE_LIMIT', validFrom: '2026-01-01', validTo: '2026-12-31', value: 12000, sourceRef: 'VUK md. 232/2; 588 Sıra No.lu VUK GT (2026)', confidence: 'high' },
  // VUK 353 penalties (first-tier amounts)
  { country: TR, key: 'VUK353_1_FIRST', validFrom: '2026-01-01', validTo: '2026-12-31', value: 17000, sourceRef: 'VUK md. 353/1; 588 Sıra No.lu VUK GT (2026)', confidence: 'high', note: 'Kademeli artış: aynı takvim yılında tekrarında artar.' },
  { country: TR, key: 'VUK353_2_FIRST', validFrom: '2026-01-01', validTo: '2026-12-31', value: 14000, sourceRef: 'VUK md. 353/2; 588 Sıra No.lu VUK GT (2026)', confidence: 'high' },
  // e-Arşiv / paper invoice limit for taxpayers not yet obliged (all types from 1/1/2025; BILANCO ends 31/12/2025
  // through EBELGE_ALL_INVOICES_FROM_BILANCO, işletme / basit usul continue until 31/12/2026)
  { country: TR, key: 'EARSIV_PAPER_LIMIT_SIMPLE', validFrom: '2025-01-01', validTo: '2026-12-31', value: 3000, sourceRef: '509 Sıra No.lu VUK GT IV.2.4.3 (573 SN; 589 SN, RG 31/12/2025-33124 5. Mük.)', confidence: 'high', note: 'Vergiler dahil 3.000 TL üzeri faturalar e-Arşiv. Bilanço: 1/1/2025-31/12/2025; işletme / basit usul: 1/1/2025-31/12/2026.' },
  // VAT return due days
  { country: TR, key: 'KDV1_DUE_DAY', validFrom: '2021-01-01', validTo: null, value: 28, sourceRef: 'KDVK md. 41; 149 Sıra No.lu VUK Sirküleri', confidence: 'medium' },
  { country: TR, key: 'KDV2_DUE_DAY', validFrom: '2021-01-01', validTo: null, value: 25, sourceRef: 'KDVK md. 41, 46; 164 Sıra No.lu VUK Sirküleri', confidence: 'medium' },
  // e-Belge turnover thresholds, keyed by the revenue year
  { country: TR, key: 'EFATURA_GROSS_SALES_THRESHOLD', validFrom: '2018-01-01', validTo: '2020-12-31', value: 5000000, sourceRef: '509 Sıra No.lu VUK GT IV.1.4(a)(1)(a)', confidence: 'high' },
  { country: TR, key: 'EFATURA_GROSS_SALES_THRESHOLD', validFrom: '2021-01-01', validTo: '2021-12-31', value: 4000000, sourceRef: '509 Sıra No.lu VUK GT IV.1.4(a)(1)(b) (535 SN, RG 22/01/2022-31727)', confidence: 'high' },
  { country: TR, key: 'EFATURA_GROSS_SALES_THRESHOLD', validFrom: '2022-01-01', validTo: null, value: 3000000, sourceRef: '509 Sıra No.lu VUK GT IV.1.4(a)(1)(c) (535 SN, RG 22/01/2022-31727)', confidence: 'high' },
  { country: TR, key: 'EIRSALIYE_GROSS_SALES_THRESHOLD', validFrom: '2018-01-01', validTo: '2020-12-31', value: 25000000, sourceRef: '509 Sıra No.lu VUK GT IV.3.5(7)(a)', confidence: 'high' },
  { country: TR, key: 'EIRSALIYE_GROSS_SALES_THRESHOLD', validFrom: '2021-01-01', validTo: null, value: 10000000, sourceRef: '509 Sıra No.lu VUK GT IV.3.5(7)(b) (535 SN)', confidence: 'high' },
  // All invoices electronic, per bookkeeping type
  { country: TR, key: 'EBELGE_ALL_INVOICES_FROM_BILANCO', validFrom: '2025-01-01', validTo: null, value: '2026-01-01', sourceRef: '509 Sıra No.lu VUK GT IV.2.4.3 (573 SN ile değişik)', confidence: 'high' },
  { country: TR, key: 'EBELGE_ALL_INVOICES_FROM_ISLETME_BASIT', validFrom: '2025-01-01', validTo: null, value: '2027-01-01', sourceRef: '509 Sıra No.lu VUK GT IV.2.4.3 (589 SN, RG 31/12/2025-33124 5. Mük.)', confidence: 'high' },
  // Start / transition rules
  { country: TR, key: 'EBELGE_THRESHOLD_START_MMDD', validFrom: '2018-01-01', validTo: null, value: '07-01', sourceRef: '509 Sıra No.lu VUK GT IV.1.4, IV.3.5 (izleyen hesap döneminin 1 Temmuz\'u)', confidence: 'high' },
  { country: TR, key: 'EBELGE_TRANSITION_MONTHS', validFrom: '2018-01-01', validTo: null, value: 4, sourceRef: '509 Sıra No.lu VUK GT IV.1.4(e),(g) (tescili izleyen ayın başından itibaren 3 ay)', confidence: 'medium', note: "Birleşme / bölünme / nev'i değişikliği / sermaye şirketine dönüşme: tescil ayından sonraki 4. ayın 1'i. Sektör kuralları EBELGE_SECTOR_RULES içinde." },
  { country: TR, key: 'EBELGE_SECTOR_RULES', validFrom: '2018-01-01', validTo: null, value: EBELGE_SECTOR_RULES_SEED, sourceRef: '509 Sıra No.lu VUK GT IV.1.4(a), IV.1.5, IV.3.5, IV.3.6', confidence: 'medium', note: 'Sektör bayrakları ve başlangıç kuralları; 2020 öncesi toplu geçiş tarihleri (1/7/2020 vb.) modellenmez.' },
  { country: TR, key: 'EBELGE_GIB_NOTICE_MIN_MONTHS', validFrom: '2018-01-01', validTo: null, value: 3, sourceRef: '509 Sıra No.lu VUK GT IV.1.4(ğ), IV.3.5(10)', confidence: 'medium', note: 'Yazılı bildirimde belirtilen süre esastır; en az 3 ay.' },
  { country: TR, key: 'EBELGE_TOLERANCE_DAY', validFrom: '2018-01-01', validTo: null, value: 7, sourceRef: '509 Sıra No.lu VUK GT VIII', confidence: 'low', note: 'e-Fatura / e-Arşiv için ayın 7\'si; e-İrsaliye için ay sonu. Mali müşavir teyidi gerekir.' },
  // Placeholder identities (low confidence for e-Arşiv usage)
  {
    country: TR,
    key: 'SPECIAL_TAX_IDS',
    validFrom: '2018-01-01',
    validTo: null,
    value: [
      { value: '11111111111', type: 'TCKN', scope: ['EIRSALIYE', 'EARSIV'] },
      { value: '2222222222', type: 'VKN', scope: ['EARSIV'] },
    ],
    sourceRef: 'e-İrsaliye Uygulaması Kılavuzu §15.33-34; e-Arşiv kullanımı uygulama pratiği',
    confidence: 'low',
    note: '11111111111 yalnızca e-İrsaliye için resmî; e-Arşiv kullanımı teyit edilmeli. Sürücü TCKN\'si bu değer olamaz.',
  },
  { country: TR, key: 'EXPORT_GTB_VKN', validFrom: '2018-01-01', validTo: null, value: '1460415308', sourceRef: '509 Sıra No.lu VUK GT IV.1.7.1; Gümrük İşlemleri Kılavuzu', confidence: 'low', note: 'İhracat faturasında alıcı VKN\'si; teyit edilmeli.' },
  // WP2: inventory core
  {
    country: TR,
    key: 'UNECE_STANDARD_UNIT_MAP',
    validFrom: '2018-01-01',
    validTo: null,
    value: { pcs: 'C62', box: 'BX', pack: 'PK', pallet: 'PF', kg: 'KGM', g: 'GRM', lb: 'LBR', l: 'LTR', ml: 'MLT', m: 'MTR' },
    sourceRef: 'UBL-TR Kod Listeleri §1.5 (UN/ECE Rec. 20 / Rec. 21 birim kodları)',
    confidence: 'low',
    note: 'Standart birim -> UN/ECE kodu. pack = PA veya PK, pallet = PF karşılıkları teyit edilmeli; diğerleri Rec. 20 ile birebir.',
  },
  { country: TR, key: 'VUK219_RECORD_DAYS', validFrom: '2018-01-01', validTo: null, value: 10, sourceRef: 'VUK md. 219/a (kayıtlar 10 günden fazla geciktirilemez)', confidence: 'high', note: 'Stok hareketi işlem tarihinden bu kadar gün sonra girilirse uyarı verilir.' },
  // WP2 review: evidence required for stock exits that change the tax base (zayi / imha / afet / hırsızlık)
  {
    country: TR,
    key: 'MOVEMENT_REASON_EVIDENCE',
    validFrom: '2018-01-01',
    validTo: null,
    value: {
      LOSS_ZAYI: { document: true, attachment: true },
      DISASTER_LOSS: { document: true, attachment: true },
      THEFT_LOSS: { document: true, attachment: true },
      EXPIRED_DESTROYED: { document: true, attachment: true },
      DESTRUCTION_IMHA: { document: true, attachment: true },
    },
    sourceRef: 'VUK md. 274, 278, 278/A; KDVK md. 30/c; KDVGUT III/C-2.4 (zayi / imha tevsiki)',
    confidence: 'medium',
    note: 'Neden kodu -> zorunlu belge no/tarih ve ek (tutanak, takdir komisyonu kararı, imha tutanağı, emniyet / afet tutanağı). Mali müşavir teyidi ile daraltılıp genişletilebilir.',
  },
  // WP3: tax engine
  {
    country: TR,
    key: 'KDV_RATE_CATALOG',
    validFrom: '2008-01-01',
    validTo: '2023-07-09',
    value: [{ rate: 18, code: 'KDV18' }, { rate: 8, code: 'KDV8' }, { rate: 1, code: 'KDV1' }],
    sourceRef: 'KDVK md. 28; 2007/13033 s. BKK',
    confidence: 'high',
    note: 'Yasal KDV oranları (genel / indirimli). %0 oran değil istisnadır (KDV0, istisna kodu zorunlu).',
  },
  {
    country: TR,
    key: 'KDV_RATE_CATALOG',
    validFrom: '2023-07-10',
    validTo: null,
    value: [{ rate: 20, code: 'KDV20', isDefault: true }, { rate: 10, code: 'KDV10' }, { rate: 1, code: 'KDV1' }],
    sourceRef: 'KDVK md. 28; 7346 s. CBK (RG 07/07/2023-32241, yürürlük 10/07/2023)',
    confidence: 'high',
    note: 'TR şirketlerinde yalnızca bu oranlar tanımlanabilir; %0 için KDV0 (istisna) satırı kullanılır.',
  },
  {
    country: TR,
    key: 'KDV_FX_RATE_DAY',
    validFrom: '2018-01-01',
    validTo: null,
    value: 'PREVIOUS_BULLETIN',
    sourceRef: 'KDVK md. 26; VUK md. 215/2-a, 280 (uygulama: vergiyi doğuran olay gününden önceki günün TCMB döviz alış kuru)',
    confidence: 'low',
    note: 'PREVIOUS_BULLETIN = vergiyi doğuran olaydan önceki son TCMB bülteni (D-1 15:30); SAME_DAY = aynı gün dahil son kur. Plan bölüm 4: mali müşavir onayıyla değiştirilir, koda gömülmez.',
  },
  {
    country: TR,
    key: 'TCMB_FETCH_TIME',
    validFrom: '2018-01-01',
    validTo: null,
    value: '15:45',
    sourceRef: 'TCMB gösterge niteliğindeki kurlar her iş günü 15:30 itibarıyla ilan edilir',
    confidence: 'medium',
    note: 'Europe/Istanbul; hafta sonu ve resmî tatillerde bülten yayımlanmaz, son kur geçerli kalır.',
  },
  {
    country: TR,
    key: 'KDV_FX_MAX_STALE_DAYS',
    validFrom: '2018-01-01',
    validTo: null,
    value: 10,
    sourceRef: 'KDVK md. 26; VUK md. 280 (son ilan edilen TCMB döviz alış kuru). Sınır teknik bir güvenlik değeridir: en uzun bayram tatili + hafta sonu ≈ 9 takvim günü bülten yayımlanmaz.',
    confidence: 'low',
    note: 'Vergiyi doğuran olayın gerektirdiği bülten kayıtlı değilse ve TCMB arşivi aradaki günlerde bülten olmadığını (tatil) doğrulayamazsa, bu kadar günden eski kur kullanılmaz (FX_RATE_STALE). Belge kesinleşirken doğrulanamayan eski kur hiç kullanılmaz.',
  },
  {
    country: TR,
    key: 'TCMB_NO_BULLETIN_DAYS',
    validFrom: '2025-01-01',
    validTo: '2025-12-31',
    value: ['2025-01-01', '2025-03-31', '2025-04-01', '2025-04-23', '2025-05-01', '2025-05-19', '2025-06-06', '2025-06-09', '2025-07-15', '2025-10-29'],
    sourceRef: '2429 s. Ulusal Bayram ve Genel Tatiller Hakkında Kanun md. 1-2; Diyanet 2025 dini günler takvimi (Ramazan Bayramı 30.03-01.04, Kurban Bayramı 06-09.06)',
    confidence: 'medium',
    note: 'Hafta içine denk gelen ve TCMB gösterge kuru yayımlanmayan tam gün tatiller. TCMB arşivi tatili doğrulayamadığında (elle kur girişi, arşiv hatası) kullanılır. Arife yarım günleri listede yoktur (bülten yayımlanır).',
  },
  {
    country: TR,
    key: 'TCMB_NO_BULLETIN_DAYS',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    value: ['2026-01-01', '2026-03-20', '2026-04-23', '2026-05-01', '2026-05-19', '2026-05-27', '2026-05-28', '2026-05-29', '2026-07-15', '2026-10-29'],
    sourceRef: '2429 s. Ulusal Bayram ve Genel Tatiller Hakkında Kanun md. 1-2; Diyanet 2026 dini günler takvimi (Ramazan Bayramı 20-22.03, Kurban Bayramı 27-30.05)',
    confidence: 'medium',
    note: 'Hafta içine denk gelen ve TCMB gösterge kuru yayımlanmayan tam gün tatiller. TCMB arşivi tatili doğrulayamadığında (elle kur girişi, arşiv hatası) kullanılır. Arife yarım günleri listede yoktur (bülten yayımlanır).',
  },
  {
    country: TR,
    key: 'TCMB_NO_BULLETIN_DAYS',
    validFrom: '2027-01-01',
    validTo: '2027-12-31',
    value: ['2027-01-01', '2027-04-23', '2027-07-15', '2027-08-30', '2027-10-29'],
    sourceRef: '2429 s. Ulusal Bayram ve Genel Tatiller Hakkında Kanun md. 1-2 (yalnızca sabit tarihli tatiller)',
    confidence: 'low',
    note: '2027 dini bayram günleri (Ramazan / Kurban Bayramı) Diyanet takvimi kesinleşince POST /admin/legal-parameters ile eklenmelidir; eklenmeden önce elle kur giren şirketler o günlerden sonraki belgeleri kesinleştiremez (FX_RATE_STALE).',
  },
  // WP4: document regime
  { country: TR, key: 'INVOICE_DEADLINE_DAYS', validFrom: '2018-01-01', validTo: null, value: 7, sourceRef: 'VUK md. 231/5 (malın teslimi veya hizmetin yapıldığı tarihten itibaren azami 7 gün)', confidence: 'high' },
  { country: TR, key: 'INVOICE_DEADLINE_WARN_DAYS', validFrom: '2018-01-01', validTo: null, value: 5, sourceRef: 'İç kontrol: VUK 231/5 süresinin dolmasından önce uyarı (yasal süre değildir)', confidence: 'high', note: 'Uyarı eşiği; şirket politikasıyla değiştirilebilir.' },
  { country: TR, key: 'DOCUMENT_SERIES_FORBIDDEN', validFrom: '2018-01-01', validTo: null, value: ['GIB'], sourceRef: 'e-Fatura / e-Arşiv Portal uygulaması: "GIB" seri öneki GİB portalında düzenlenen belgelere ayrılmıştır', confidence: 'low', note: 'Özel entegratör ve GİB kılavuzlarındaki yasaklı seri listesi teyit edilmeli; liste veri olarak güncellenebilir.' },
  { country: TR, key: 'WITHDRAWAL_PERIOD_DAYS', validFrom: '2015-02-27', validTo: null, value: 14, sourceRef: '6502 s. TKHK md. 48/4; Mesafeli Sözleşmeler Yönetmeliği md. 9 (teslimden itibaren 14 gün)', confidence: 'high' },
  { country: TR, key: 'WITHDRAWAL_REFUND_DAYS', validFrom: '2015-02-27', validTo: null, value: 14, sourceRef: 'Mesafeli Sözleşmeler Yönetmeliği md. 12/1-2 (satıcı bedeli 14 gün içinde iade eder; başlangıç olayı WITHDRAWAL_REFUND_BASIS)', confidence: 'high' },
  { country: TR, key: 'WITHDRAWAL_REFUND_BASIS', validFrom: '2015-02-27', validTo: '2022-09-30', value: 'NOTIFICATION', sourceRef: 'Mesafeli Sözleşmeler Yönetmeliği md. 12/1 (ilk metin: cayma bildiriminin satıcıya ulaştığı tarihten itibaren)', confidence: 'high' },
  { country: TR, key: 'WITHDRAWAL_REFUND_BASIS', validFrom: '2022-10-01', validTo: null, value: 'GOODS_RETURNED', sourceRef: 'Mesafeli Sözleşmeler Yönetmeliği md. 12/1-2 (RG 23.08.2022-31932 ile değişik, yürürlük 01.10.2022)', confidence: 'high', note: 'Süre, malın ön bilgilendirmede belirtilen taşıyıcıya teslim edildiği veya satıcıya ulaştığı tarihten başlar. Teslimden önce kullanılan cayma hakkında (md. 12/2) bildirimden başlar; uygulama bunu otomatik uygular.' },
  { country: TR, key: 'WITHDRAWAL_GOODS_RETURN_DAYS', validFrom: '2015-02-27', validTo: '2022-09-30', value: 10, sourceRef: 'Mesafeli Sözleşmeler Yönetmeliği md. 13/1 (ilk metin: tüketici malı cayma bildiriminden itibaren 10 gün içinde geri gönderir)', confidence: 'high' },
  { country: TR, key: 'WITHDRAWAL_GOODS_RETURN_DAYS', validFrom: '2022-10-01', validTo: null, value: 14, sourceRef: 'Mesafeli Sözleşmeler Yönetmeliği md. 13/1 (RG 23.08.2022-31932 Değişiklik Yön. md. 11 ile "on" yerine "on dört"; yürürlük 01.10.2022)', confidence: 'high' },
  { country: TR, key: 'EXPENSE_VOUCHER_DEADLINE_DAYS', validFrom: '2021-01-01', validTo: null, value: 7, sourceRef: 'VUK md. 234, 231/5 (7338 s.K.); 509 Sıra No.lu VUK GT IV.6', confidence: 'medium', note: 'Gider pusulasının teslimden itibaren 7 gün içinde düzenlenmesi.' },
  {
    country: TR,
    key: 'EXPENSE_VOUCHER_WITHHOLDING_RATES',
    validFrom: '2009-01-01',
    validTo: null,
    value: [
      { kind: 'MUSTAHSIL_MAKBUZU', rate: 2, label: 'Zirai mahsul alımı (bitkisel ürünler)' },
      { kind: 'MUSTAHSIL_MAKBUZU', rate: 1, label: 'Zirai mahsul alımı (hayvansal ürünler)' },
      { kind: 'GIDER_PUSULASI', rate: 0, label: 'Stopaj yok' },
    ],
    sourceRef: 'GVK md. 94/11; 2009/14592 s. BKK (oranlar)',
    confidence: 'low',
    note: 'Stopaj oranları mali müşavir tarafından teyit edilmeli; gider pusulası türüne göre (hurda, el emeği, serbest meslek) farklı oranlar eklenebilir.',
  },
  { country: TR, key: 'MATBUDAN_DEADLINE_DAYS', validFrom: '2018-01-01', validTo: null, value: 1, sourceRef: 'e-İrsaliye Uygulaması Kılavuzu §11-12 (kâğıt irsaliye bilgileri en geç izleyen gün e-İrsaliye olarak düzenlenir)', confidence: 'medium' },
  // WP5: e-Belge
  { country: TR, key: 'EARSIV_CANCEL_DAYS', validFrom: '2018-01-01', validTo: null, value: 8, sourceRef: '509 Sıra No.lu VUK GT V.10; e-Arşiv Uygulamaları İptal, İhtar, İtiraz Bildirim Kılavuzu v1.1 (alıcıya iletimden itibaren 8 gün)', confidence: 'medium', note: 'Süre, alıcıya iletim (edocument_deliveries) gününden başlar ve 8. günün sonunda biter; sayım yöntemi mali müşavirce teyit edilmeli.' },
  { country: TR, key: 'EIRSALIYE_RESPONSE_DAYS', validFrom: '2018-01-01', validTo: null, value: 7, sourceRef: '509 Sıra No.lu VUK GT IV.3.4; e-İrsaliye Uygulaması Kılavuzu §12 (irsaliye yanıtı fiili sevk tarihinden itibaren 7 gün)', confidence: 'high', note: 'Süresinde yanıt verilmeyen e-İrsaliye tamamen kabul edilmiş sayılır.' },
  { country: TR, key: 'TICARI_RESPONSE_DAYS', validFrom: '2012-07-01', validTo: null, value: 8, sourceRef: 'TTK md. 21/2 (faturanın alınmasından itibaren 8 gün içinde itiraz); e-Fatura TICARIFATURA senaryosu', confidence: 'high' },
  { country: TR, key: 'EFATURA_CANCEL_OBJECTION_DAYS', validFrom: '2018-01-01', validTo: null, value: 8, sourceRef: 'TTK md. 21/2, 18/3; e-Fatura iptal / itiraz bildirimleri (GİB e-Fatura Portalı iptal-itiraz talebi)', confidence: 'low', note: 'e-Fatura iptal / itiraz kılavuzundaki süreler teyit edilmeli (plan Ek listesi); yalnızca uyarı olarak kullanılır.' },
  { country: TR, key: 'EDOC_RETENTION_YEARS', validFrom: '2012-07-01', validTo: null, value: 10, sourceRef: 'TTK md. 82 (10 yıl); VUK md. 253 (5 yıl): uzun olan uygulanır; 509 Sıra No.lu VUK GT VI', confidence: 'high', note: 'retentionUntil = 31.12.(düzenleme yılı + 10).' },
  { country: TR, key: 'EDOC_INTEGRITY_NOTICE_BUSINESS_DAYS', validFrom: '2018-01-01', validTo: null, value: 3, sourceRef: '509 Sıra No.lu VUK GT VI (e-belgelerin bozulması / kaybolması halinde Başkanlığa bildirim)', confidence: 'medium', note: 'Bütünlük ihlali tespitinden itibaren iş günü sayısı; bildirim resmî kanaldan yapılır, uygulama yalnızca süreyi izler.' },
  {
    country: TR,
    key: 'EXPORT_GTB_PARTY',
    validFrom: '2018-01-01',
    validTo: null,
    value: { name: 'Gümrük ve Ticaret Bakanlığı Gümrükler Genel Müdürlüğü - Bilgi İşlem Dairesi Başkanlığı', district: 'Ulus', city: 'Ankara', taxOffice: 'Ulus' },
    sourceRef: '509 Sıra No.lu VUK GT IV.1.7.1; UBL-TR IHRACAT senaryosu (alıcı: GTB)',
    confidence: 'low',
    note: 'IHRACAT faturasında AccountingCustomerParty bilgileri; VKN EXPORT_GTB_VKN parametresinde. Teyit edilmeli.',
  },
  // ─── WP6: costing, inventory, impairment, food, price labels, journal export ───
  { country: TR, key: 'IMPAIRMENT_MIN_DECLINE_PCT', validFrom: '2004-01-01', validTo: null, value: 10, sourceRef: 'VUK md. 274/2 (5024 s.K.): satış bedelinin maliyete göre %10 ve daha fazla düşük olması', confidence: 'high' },
  { country: TR, key: 'EMSAL_MIN_MONTHLY_SALES_PCT', validFrom: '1961-01-01', validTo: null, value: 25, sourceRef: 'VUK md. 267/1 (ortalama fiyat esası: aylık satış miktarı değerlenecek miktarın en az %25 olmalı)', confidence: 'high' },
  {
    country: TR,
    key: 'COUNT_ASOF_WINDOW_MONTHS',
    validFrom: '2012-07-01',
    validTo: null,
    value: { before: 3, after: 2 },
    sourceRef: 'VUK md. 185-186; TTK md. 64/3, 66 (envanter bilanço günü itibarıyla; sayım tarihi ile envanter tarihi arası ileri / geri hesaplama)',
    confidence: 'medium',
    note: 'Sayım tarihi envanter (bilanço) gününden en fazla 3 ay önce veya 2 ay sonra olabilir; aradaki hareketler ileri / geri hesaplanır. Pencere mali müşavirce teyit edilmeli.',
  },
  {
    country: TR,
    key: 'PHYSICAL_COUNT_MAX_YEARS',
    validFrom: '2012-07-01',
    validTo: null,
    value: { ANNUAL: 1, TRIENNIAL_VUK190: 3, FIXED_VALUE_TTK66_3: 3 },
    sourceRef: 'VUK md. 186 (yıllık envanter), md. 190 (büyük mağazalar / eczaneler: 3 yılda bir); TTK md. 66/3 (sabit değerle kayıt: en az 3 yılda bir sayım)',
    confidence: 'medium',
  },
  {
    country: TR,
    key: 'DISCOUNT_REFERENCE_DAYS',
    validFrom: '2025-10-11',
    validTo: null,
    value: 10,
    sourceRef: 'Fiyat Etiketi Yönetmeliği md. 9/A (11.10.2025 değişikliği): indirimden önceki son 10 gündeki en düşük fiyat; çabuk bozulan ürünlerde bir önceki fiyat',
    confidence: 'medium',
    note: 'Gün sayısı yönetmelik metninden teyit edilmeli; veri olarak güncellenebilir.',
  },
  { country: TR, key: 'FOOD_TRACE_RETENTION_EXTRA_MONTHS', validFrom: '2026-01-01', validTo: null, value: 3, sourceRef: 'Gıda İzlenebilirlik Tebliği 2026/11 (kayıtlar raf ömrü + 3 ay saklanır)', confidence: 'medium' },
  { country: TR, key: 'FOOD_TRACE_COMPLIANCE_DATE', validFrom: '2026-01-01', validTo: null, value: '2026-12-31', sourceRef: 'Gıda İzlenebilirlik Tebliği 2026/11 (uyum son tarihi)', confidence: 'medium' },
  {
    country: TR,
    key: 'MOCK_RECALL_INTERVAL_MONTHS',
    validFrom: '2026-01-01',
    validTo: null,
    value: 12,
    sourceRef: 'Gıda İzlenebilirlik Tebliği 2026/11; Resmi Kontroller Yön. md. 39-40 (geri çağırma prosedürünün yılda en az bir kez denenmesi - iyi uygulama)',
    confidence: 'low',
    note: 'Yıllık tatbikat aralığı mevzuatta açıkça belirtilmemiş olabilir; şirket politikası olarak uygulanır.',
  },
  { country: TR, key: 'WARRANTY_MIN_MONTHS', validFrom: '2014-06-13', validTo: null, value: 24, sourceRef: '6502 s. TKHK md. 56; Garanti Belgesi Yönetmeliği md. 4 (asgari garanti süresi 2 yıl)', confidence: 'high' },
  {
    country: TR,
    key: 'EDEFTER_DOCUMENT_TYPES',
    validFrom: '2012-01-01',
    validTo: null,
    value: { INVOICE: 'invoice', EXPENSE_VOUCHER: 'other', DESPATCH: 'other', GOODS_RECEIPT: 'other', STOCK_COUNT: 'other', DESTRUCTION_REPORT: 'other', INTERNAL_VOUCHER: 'other', ORDER: 'other', PURCHASE_ORDER: 'other', TRANSFER: 'other', OTHER: 'other' },
    sourceRef: 'e-Defter Uygulama Kılavuzu (gl-documentType: invoice, check, cash, receipt, voucher, other + documentTypeDescription); e-Defter GT No 5',
    confidence: 'medium',
    note: '"other" için belge türü açıklaması (documentTypeDescription) yevmiye aktarımında doldurulur.',
  },
  // ─── WP6 review round 1 ───
  {
    country: TR,
    key: 'VAT_DEEMED_SUPPLY_REASONS',
    validFrom: '1985-01-01',
    validTo: null,
    value: ['WITHDRAWAL', 'GIFT_SAMPLE', 'PERSONNEL'],
    sourceRef: 'KDVK md. 3/a (malların işletmeden çekilmesi: bedelsiz verilmesi, işletme sahibinin kişisel kullanımı, vergiye tabi olmayan / istisna işlemlerde kullanılması), md. 27 (emsal bedel)',
    confidence: 'low',
    note: 'İşletmede vergiye tabi faaliyette kullanım (INTERNAL_USE) teslim sayılmaz. Hangi çıkış nedenlerinin emsal bedelle KDV doğurduğu mali müşavirce teyit edilmeli; liste veri olarak değiştirilebilir.',
  },
  {
    country: TR,
    key: 'EMSAL_COST_MARKUP_PCT',
    validFrom: '1961-01-01',
    validTo: null,
    value: 10,
    sourceRef: 'VUK md. 267/2 (ortalama fiyat yoksa emsal bedeli: maliyet bedeline %10 eklenerek); KDVK md. 27',
    confidence: 'medium',
    note: 'Aylık ortalama satış fiyatı VUK 267/1 koşulunu (ay içi satış miktarı >= değerlenen miktarın EMSAL_MIN_MONTHLY_SALES_PCT oranı) sağlamadığında kullanılır.',
  },
  // ─── WP7: KVKK ───
  { country: TR, key: 'KVKK_DSR_RESPONSE_DAYS', validFrom: '2016-04-07', validTo: null, value: 30, sourceRef: 'KVKK md. 13/2 (başvuru en kısa sürede ve en geç otuz gün içinde ücretsiz sonuçlandırılır)', confidence: 'high' },
  { country: TR, key: 'KVKK_BREACH_NOTIFY_HOURS', validFrom: '2019-01-24', validTo: null, value: 72, sourceRef: 'KVKK md. 12/5; Kişisel Verileri Koruma Kurulu Kararı 24.01.2019, 2019/10 (en geç 72 saat)', confidence: 'high' },
  { country: TR, key: 'KVKK_PERIODIC_DESTRUCTION_MAX_MONTHS', validFrom: '2018-01-01', validTo: null, value: 6, sourceRef: 'Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik md. 11/2 (6 ayı geçmeyen periyot)', confidence: 'high' },
  { country: TR, key: 'KVKK_DESTRUCTION_LOG_MIN_YEARS', validFrom: '2018-01-01', validTo: null, value: 3, sourceRef: 'Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik md. 7/3 (kayıtlar en az 3 yıl saklanır)', confidence: 'high' },
  { country: TR, key: 'KVKK_SCC_NOTIFY_BUSINESS_DAYS', validFrom: '2024-06-01', validTo: null, value: 5, sourceRef: 'KVKK md. 9/5 (7499 s.K. ile değişik): standart sözleşme imzadan itibaren 5 iş günü içinde Kurula bildirilir', confidence: 'high' },
  { country: TR, key: 'VERBIS_EMPLOYEE_THRESHOLD', validFrom: '2018-04-19', validTo: null, value: 50, sourceRef: 'Kişisel Verileri Koruma Kurulu Kararı 19.07.2018, 2018/87 (yıllık çalışan sayısı 50 ve üzeri)', confidence: 'medium', note: 'Eşik; 2023/1154, 2025/1572 ve 2025/2393 sayılı Kurul kararlarıyla yapılan güncellemeler karşısında teyit edilmeli.' },
  { country: TR, key: 'VERBIS_BALANCE_SHEET_THRESHOLD', validFrom: '2018-04-19', validTo: '2023-12-31', value: 25000000, sourceRef: 'Kişisel Verileri Koruma Kurulu Kararı 19.07.2018, 2018/87 (yıllık mali bilanço toplamı 25 milyon TL)', confidence: 'medium' },
  { country: TR, key: 'VERBIS_BALANCE_SHEET_THRESHOLD', validFrom: '2024-01-01', validTo: null, value: 100000000, sourceRef: 'Kişisel Verileri Koruma Kurulu Kararları 2023/1154, 2025/1572, 2025/2393 (yıllık mali bilanço toplamı eşiği)', confidence: 'low', note: 'Tutar ve yürürlük tarihi teyit edilmeden kullanılmamalı (plan Ek listesi): mali müşavir / hukuk onayıyla POST /admin/legal-parameters ile güncellenir. Uygulama yalnızca uyarı üretir.' },
];


/** Keys added by migration 1784274132000 (WP3). */
export const WP3_PARAMETER_KEYS = ['KDV_RATE_CATALOG', 'KDV_FX_RATE_DAY', 'TCMB_FETCH_TIME'];

/** Keys added by migration 1784274133000 (WP3 review fixes). */
export const WP3_FIX_PARAMETER_KEYS = ['KDV_FX_MAX_STALE_DAYS'];

/** Keys added by migration 1784274134000 (WP3 review fixes, round 2). */
export const WP3_FIX2_PARAMETER_KEYS = ['TCMB_NO_BULLETIN_DAYS'];

/** Keys added by migration 1784274135000 (WP4). */
export const WP4_PARAMETER_KEYS = [
  'INVOICE_DEADLINE_DAYS',
  'INVOICE_DEADLINE_WARN_DAYS',
  'DOCUMENT_SERIES_FORBIDDEN',
  'WITHDRAWAL_PERIOD_DAYS',
  'WITHDRAWAL_REFUND_DAYS',
  'WITHDRAWAL_GOODS_RETURN_DAYS',
  'EXPENSE_VOUCHER_DEADLINE_DAYS',
  'EXPENSE_VOUCHER_WITHHOLDING_RATES',
  'MATBUDAN_DEADLINE_DAYS',
];

/** Keys (re)written by migration 1784274136000 (WP4 review fixes: withdrawal periods per RG 31932). */
export const WP4_FIX_PARAMETER_KEYS = ['WITHDRAWAL_REFUND_DAYS', 'WITHDRAWAL_REFUND_BASIS', 'WITHDRAWAL_GOODS_RETURN_DAYS'];

/** Keys added by migration 1784274137000 (WP5 e-Belge). */
export const WP5_PARAMETER_KEYS = [
  'EARSIV_CANCEL_DAYS',
  'EIRSALIYE_RESPONSE_DAYS',
  'TICARI_RESPONSE_DAYS',
  'EFATURA_CANCEL_OBJECTION_DAYS',
  'EDOC_RETENTION_YEARS',
  'EDOC_INTEGRITY_NOTICE_BUSINESS_DAYS',
  'EXPORT_GTB_PARTY',
];

/** Keys added by migration 1784274140000 (WP6 review round 1: deemed-supply reasons, emsal mark-up). */
export const WP6R1_PARAMETER_KEYS = ['VAT_DEEMED_SUPPLY_REASONS', 'EMSAL_COST_MARKUP_PCT'];

/** Keys added by migration 1784274139000 (WP6 costing, inventory, food, price labels, journal export). */
export const WP6_PARAMETER_KEYS = [
  'IMPAIRMENT_MIN_DECLINE_PCT',
  'EMSAL_MIN_MONTHLY_SALES_PCT',
  'COUNT_ASOF_WINDOW_MONTHS',
  'PHYSICAL_COUNT_MAX_YEARS',
  'DISCOUNT_REFERENCE_DAYS',
  'FOOD_TRACE_RETENTION_EXTRA_MONTHS',
  'FOOD_TRACE_COMPLIANCE_DATE',
  'MOCK_RECALL_INTERVAL_MONTHS',
  'WARRANTY_MIN_MONTHS',
  'EDEFTER_DOCUMENT_TYPES',
];

/** Keys added by migration 1784274141000 (WP7 KVKK). */
export const WP7_PARAMETER_KEYS = [
  'KVKK_DSR_RESPONSE_DAYS',
  'KVKK_BREACH_NOTIFY_HOURS',
  'KVKK_PERIODIC_DESTRUCTION_MAX_MONTHS',
  'KVKK_DESTRUCTION_LOG_MIN_YEARS',
  'KVKK_SCC_NOTIFY_BUSINESS_DAYS',
  'VERBIS_EMPLOYEE_THRESHOLD',
  'VERBIS_BALANCE_SHEET_THRESHOLD',
];
