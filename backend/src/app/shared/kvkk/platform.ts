import { RETENTION_DEFAULTS } from './retention';
import { NoticeCompany } from './notice-template';

/**
 * Platform (SaaS operator) facts used by the platform documents and the sub-processor list.
 * The operator's identity comes from the environment (PLATFORM_OPERATOR_NAME, PLATFORM_KVKK_EMAIL,
 * PLATFORM_OPERATOR_ADDRESS); the sub-processors are the hosting layers of the deployment and must be
 * kept current by the operator (Settings > KVKK > Sub-processors lists them read-only for tenants).
 */
export const PLATFORM_OPERATOR: NoticeCompany = {
  name: process.env['PLATFORM_OPERATOR_NAME'] || 'Ecelon',
  legalName: process.env['PLATFORM_OPERATOR_NAME'] || 'Ecelon uygulama işletmecisi',
  kvkkContactEmail: process.env['PLATFORM_KVKK_EMAIL'] || null,
  addressText: process.env['PLATFORM_OPERATOR_ADDRESS'] || null,
};

export interface PlatformProcessor {
  name: string;
  service: string;
  country: string;
  transferBasis: string;
  dataCategories: string[];
  website?: string | null;
}

export const PLATFORM_SUBPROCESSORS: PlatformProcessor[] = [
  {
    name: 'Uygulama ve veritabanı barındırma (Türkiye veri merkezi)',
    service: 'Sunucu, MySQL veritabanı ve yedekleme barındırma',
    country: 'TR',
    transferBasis: 'DOMESTIC',
    dataCategories: ['Kimlik', 'İletişim', 'Müşteri İşlem', 'İşlem Güvenliği'],
  },
  {
    name: 'Özel entegratör (e-Belge) - şirketin sözleşmeli entegratörü',
    service: 'e-Fatura / e-Arşiv / e-İrsaliye mali mühür imzası, GİB iletimi ve yasal arşiv',
    country: 'TR',
    transferBasis: 'DOMESTIC',
    dataCategories: ['Kimlik', 'İletişim', 'Müşteri İşlem'],
  },
];

const UNIT_TR: Record<string, string> = { DAY: 'gün', MONTH: 'ay', YEAR: 'yıl' };
const UNIT_EN: Record<string, string> = { DAY: 'days', MONTH: 'months', YEAR: 'years' };
const START_TR: Record<string, string> = {
  CREATED: 'kayıt tarihinden itibaren', CALENDAR_YEAR_END: 'ilgili takvim yılı sonundan itibaren', LAST_TRANSACTION: 'son işlemden itibaren',
  DELETED: 'silinmeden itibaren', SHELF_LIFE_END: 'raf ömrü sonundan itibaren', CLOSED: 'kapanıştan itibaren',
};
const START_EN: Record<string, string> = {
  CREATED: 'from creation', CALENDAR_YEAR_END: 'from the end of the calendar year', LAST_TRANSACTION: 'from the last transaction',
  DELETED: 'from deletion', SHELF_LIFE_END: 'from the end of shelf life', CLOSED: 'from closure',
};

/** "10 yıl (ilgili takvim yılı sonundan itibaren)" for a retention category (global default). */
export function retentionLabel(category: string, lang: 'tr' | 'en', policy?: { periodValue: number; periodUnit: string; startEvent: string } | null): string {
  if (category === 'USERS' && !policy) return lang === 'tr' ? 'hesap süresince; sonrasında denetim kaydındaki izler 2 yıl' : 'while the account exists; traces in the audit log for 2 years';
  const p = policy ?? RETENTION_DEFAULTS.find((d) => d.dataCategory === category);
  if (!p) return '-';
  return lang === 'tr'
    ? `${p.periodValue} ${UNIT_TR[p.periodUnit] || p.periodUnit} (${START_TR[p.startEvent] || p.startEvent})`
    : `${p.periodValue} ${UNIT_EN[p.periodUnit] || p.periodUnit} (${START_EN[p.startEvent] || p.startEvent})`;
}
