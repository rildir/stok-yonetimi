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
} as const;

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
  // e-Arşiv / paper invoice limit for taxpayers not yet obliged
  { country: TR, key: 'EARSIV_PAPER_LIMIT_SIMPLE', validFrom: '2026-01-01', validTo: '2026-12-31', value: 3000, sourceRef: '509 Sıra No.lu VUK GT IV.2.4.3; 589 Sıra No.lu VUK GT', confidence: 'medium', note: 'İşletme hesabı / basit usul: 31.12.2026\'ya kadar kâğıt fatura sınırı (vergiler dahil).' },
  // VAT return due days
  { country: TR, key: 'KDV1_DUE_DAY', validFrom: '2021-01-01', validTo: null, value: 28, sourceRef: 'KDVK md. 41; 149 Sıra No.lu VUK Sirküleri', confidence: 'medium' },
  { country: TR, key: 'KDV2_DUE_DAY', validFrom: '2021-01-01', validTo: null, value: 25, sourceRef: 'KDVK md. 41, 46; 164 Sıra No.lu VUK Sirküleri', confidence: 'medium' },
  // e-Belge turnover thresholds, keyed by the revenue year
  { country: TR, key: 'EFATURA_GROSS_SALES_THRESHOLD', validFrom: '2018-01-01', validTo: '2021-12-31', value: 5000000, sourceRef: '509 Sıra No.lu VUK GT IV.1.4 (b)', confidence: 'medium' },
  { country: TR, key: 'EFATURA_GROSS_SALES_THRESHOLD', validFrom: '2022-01-01', validTo: '2022-12-31', value: 4000000, sourceRef: '509 Sıra No.lu VUK GT IV.1.4 (b), 535 SN ile değişik', confidence: 'medium' },
  { country: TR, key: 'EFATURA_GROSS_SALES_THRESHOLD', validFrom: '2023-01-01', validTo: null, value: 3000000, sourceRef: '509 Sıra No.lu VUK GT IV.1.4 (b), 545 SN ile değişik', confidence: 'medium' },
  { country: TR, key: 'EIRSALIYE_GROSS_SALES_THRESHOLD', validFrom: '2019-01-01', validTo: '2020-12-31', value: 25000000, sourceRef: '509 Sıra No.lu VUK GT IV.3.5 (a)', confidence: 'medium' },
  { country: TR, key: 'EIRSALIYE_GROSS_SALES_THRESHOLD', validFrom: '2021-01-01', validTo: null, value: 10000000, sourceRef: '509 Sıra No.lu VUK GT IV.3.5 (a)', confidence: 'medium' },
  // All invoices electronic, per bookkeeping type
  { country: TR, key: 'EBELGE_ALL_INVOICES_FROM_BILANCO', validFrom: '2025-01-01', validTo: null, value: '2026-01-01', sourceRef: '509 Sıra No.lu VUK GT IV.2.4.3 (573 SN ile değişik)', confidence: 'high' },
  { country: TR, key: 'EBELGE_ALL_INVOICES_FROM_ISLETME_BASIT', validFrom: '2025-01-01', validTo: null, value: '2027-01-01', sourceRef: '589 Sıra No.lu VUK GT (RG tarihi 30/31.12.2025 teyit edilmeli)', confidence: 'medium' },
  // Start / transition rules
  { country: TR, key: 'EBELGE_THRESHOLD_START_MMDD', validFrom: '2018-01-01', validTo: null, value: '07-01', sourceRef: '509 Sıra No.lu VUK GT IV.1.4, IV.3.5 (izleyen hesap döneminin 1 Temmuz\'u)', confidence: 'high' },
  { country: TR, key: 'EBELGE_TRANSITION_MONTHS', validFrom: '2018-01-01', validTo: null, value: 3, sourceRef: '509 Sıra No.lu VUK GT IV.1.5, IV.3.6 (izleyen 3. ayın başı)', confidence: 'medium' },
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
