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
];
