/**
 * Retention policies (saklama ve imha politikası, KVKK md. 7; Kişisel Verilerin Silinmesi, Yok
 * Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik md. 5-12) and the pure date math.
 *
 * Global defaults are rows of `retention_policies` with companyId NULL (seeded by migration
 * 1784274141000 from RETENTION_DEFAULTS); a tenant may override a category, but never below the
 * legal minimum (`minimumValue` in the same unit). Every default cites its source; the ones that are
 * recommendations (öneri) need the company's approval (requiresApproval) before the periodic
 * destruction uses them.
 */
export type RetentionUnit = 'DAY' | 'MONTH' | 'YEAR';
/** CREATED: record date; CALENDAR_YEAR_END: end of the record's calendar year (TTK 82 / VUK 253);
 *  LAST_TRANSACTION: last order / document of the subject; DELETED: soft delete; SHELF_LIFE_END: food lot expiry. */
export type RetentionStart = 'CREATED' | 'CALENDAR_YEAR_END' | 'LAST_TRANSACTION' | 'DELETED' | 'SHELF_LIFE_END' | 'CLOSED';
/** DELETE / ANONYMIZE: done by the periodic destruction after approval; REVIEW: legal records,
 *  listed for a manual archive-and-destroy decision; NONE: kept with another category. */
export type RetentionAction = 'DELETE' | 'ANONYMIZE' | 'REVIEW' | 'NONE';

export interface RetentionDefault {
  dataCategory: string;
  periodValue: number;
  periodUnit: RetentionUnit;
  startEvent: RetentionStart;
  action: RetentionAction;
  minimumValue: number;
  legalBasis: string;
  sourceRef: string;
  requiresApproval: boolean;
}

export const RETENTION_DEFAULTS: RetentionDefault[] = [
  { dataCategory: 'ORDERS', periodValue: 10, periodUnit: 'YEAR', startEvent: 'CALENDAR_YEAR_END', action: 'REVIEW', minimumValue: 10, legalBasis: 'Ticari defter ve belgeler', sourceRef: 'TTK md. 82/1 (10 yıl); VUK md. 253 (5 yıl): uzun olan', requiresApproval: false },
  { dataCategory: 'DOCUMENTS', periodValue: 10, periodUnit: 'YEAR', startEvent: 'CALENDAR_YEAR_END', action: 'REVIEW', minimumValue: 10, legalBasis: 'Fatura, irsaliye, iade, mal kabul, gider pusulası, e-Belge', sourceRef: 'TTK md. 82/1; VUK md. 253; 509 Sıra No.lu VUK GT VI', requiresApproval: false },
  { dataCategory: 'STOCK_MOVEMENTS', periodValue: 10, periodUnit: 'YEAR', startEvent: 'CALENDAR_YEAR_END', action: 'REVIEW', minimumValue: 10, legalBasis: 'Stok hareketleri (envanter kayıtları)', sourceRef: 'TTK md. 82/1; VUK md. 253', requiresApproval: false },
  { dataCategory: 'STOCK_COUNTS', periodValue: 10, periodUnit: 'YEAR', startEvent: 'CALENDAR_YEAR_END', action: 'REVIEW', minimumValue: 10, legalBasis: 'Sayım tutanakları ve envanter', sourceRef: 'TTK md. 82/1; VUK md. 253', requiresApproval: false },
  { dataCategory: 'CUSTOMER_IDENTITY', periodValue: 10, periodUnit: 'YEAR', startEvent: 'LAST_TRANSACTION', action: 'ANONYMIZE', minimumValue: 10, legalBasis: 'Müşteri kimlik ve iletişim bilgisi (son işlemden itibaren)', sourceRef: 'TTK md. 82/1; VUK md. 253; KVKK md. 7', requiresApproval: false },
  { dataCategory: 'CUSTOMER_INACTIVE', periodValue: 30, periodUnit: 'DAY', startEvent: 'DELETED', action: 'ANONYMIZE', minimumValue: 0, legalBasis: 'İşlemi olmayan, silinmiş müşteri kaydı', sourceRef: 'KVKK md. 7/1; İmha Yönetmeliği md. 8', requiresApproval: false },
  { dataCategory: 'AUDIT_LOGS', periodValue: 2, periodUnit: 'YEAR', startEvent: 'CREATED', action: 'ANONYMIZE', minimumValue: 0, legalBasis: 'Denetim kaydındaki kişisel veriler (kullanıcı, IP, tarayıcı, değişen alanlar)', sourceRef: 'Kişisel Veri Güvenliği Rehberi (öneri; işletme onayı gerekir)', requiresApproval: true },
  { dataCategory: 'LOGIN_ATTEMPTS', periodValue: 1, periodUnit: 'YEAR', startEvent: 'CREATED', action: 'ANONYMIZE', minimumValue: 0, legalBasis: 'Giriş denemeleri (kullanıcı adı, IP, tarayıcı)', sourceRef: 'Kişisel Veri Güvenliği Rehberi (öneri)', requiresApproval: false },
  { dataCategory: 'WEBHOOK_DELIVERIES', periodValue: 90, periodUnit: 'DAY', startEvent: 'CREATED', action: 'DELETE', minimumValue: 0, legalBasis: 'Webhook teslimat kayıtları (yük içeriği)', sourceRef: 'KVKK md. 4/2-d (amaçla sınırlı süre); işletme uygulaması', requiresApproval: false },
  { dataCategory: 'USER_SESSIONS', periodValue: 30, periodUnit: 'DAY', startEvent: 'CLOSED', action: 'DELETE', minimumValue: 0, legalBasis: 'Sona ermiş oturum kayıtları (IP, tarayıcı)', sourceRef: 'KVKK md. 4/2-d; işletme uygulaması', requiresApproval: false },
  { dataCategory: 'FOOD_TRACEABILITY', periodValue: 3, periodUnit: 'MONTH', startEvent: 'SHELF_LIFE_END', action: 'NONE', minimumValue: 3, legalBasis: 'Gıda izlenebilirlik kayıtları belge ve hareketlerle birlikte 10 yıl saklanır (asgari: raf ömrü + 3 ay)', sourceRef: 'Gıda İzlenebilirlik Tebliği 2026/11; TTK md. 82', requiresApproval: false },
  { dataCategory: 'DESTRUCTION_LOGS', periodValue: 3, periodUnit: 'YEAR', startEvent: 'CREATED', action: 'DELETE', minimumValue: 3, legalBasis: 'İmha işlemi kayıtları', sourceRef: 'İmha Yönetmeliği md. 7/3 (en az 3 yıl)', requiresApproval: false },
  { dataCategory: 'DSR_REQUESTS', periodValue: 3, periodUnit: 'YEAR', startEvent: 'CLOSED', action: 'ANONYMIZE', minimumValue: 0, legalBasis: 'İlgili kişi başvuruları ve yanıtları (ispat)', sourceRef: 'KVKK md. 13; Başvuru Tebliği (öneri: ispat amaçlı 3 yıl)', requiresApproval: true },
  { dataCategory: 'SECURITY_INCIDENTS', periodValue: 3, periodUnit: 'YEAR', startEvent: 'CLOSED', action: 'NONE', minimumValue: 0, legalBasis: 'Veri ihlali kayıtları (Kurul incelemesi için)', sourceRef: 'KVKK md. 12/5; Kurul Kararı 2019/10 (öneri)', requiresApproval: true },
  { dataCategory: 'CONSENTS', periodValue: 3, periodUnit: 'YEAR', startEvent: 'CLOSED', action: 'DELETE', minimumValue: 0, legalBasis: 'Geri alınmış rıza kayıtları (rızanın ispatı)', sourceRef: 'KVKK md. 5/1; 6563 s.K. ve Ticari İletişim Yönetmeliği md. 7 (öneri)', requiresApproval: true },
  { dataCategory: 'LEGAL_ACCEPTANCES', periodValue: 10, periodUnit: 'YEAR', startEvent: 'CALENDAR_YEAR_END', action: 'NONE', minimumValue: 10, legalBasis: 'Kullanım koşulları / veri işleme sözleşmesi kabul kayıtları', sourceRef: 'TTK md. 82; TBK md. 146', requiresApproval: false },
];

export const RETENTION_CATEGORIES = RETENTION_DEFAULTS.map((d) => d.dataCategory);

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Adds a period to a YYYY-MM-DD date (month ends are clamped). */
export function addPeriod(day: string, value: number, unit: RetentionUnit): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  if (unit === 'DAY') return dateKey(new Date(Date.UTC(y, m - 1, d + value)));
  const months = unit === 'YEAR' ? value * 12 : value;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return dateKey(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))));
}

/** End of retention for a record whose start event happened on `eventDay` (YYYY-MM-DD). */
export function retentionUntil(policy: Pick<RetentionDefault, 'periodValue' | 'periodUnit' | 'startEvent'>, eventDay: string): string {
  const base = policy.startEvent === 'CALENDAR_YEAR_END' ? `${eventDay.slice(0, 4)}-12-31` : eventDay.slice(0, 10);
  return addPeriod(base, policy.periodValue, policy.periodUnit);
}

/** Legal records (TTK 82): 31.12 of (year of the record + 10). */
export function legalRecordRetentionUntil(day: string, years = 10): string {
  return `${Number(day.slice(0, 4)) + years}-12-31`;
}

/** True when the destruction may happen on `today` (retention ended strictly before today). */
export function isExpired(until: string, today: string): boolean {
  return until < today;
}

/** Period expressed in days (approximate) to compare overrides with the legal minimum. */
export function periodInDays(value: number, unit: RetentionUnit): number {
  return unit === 'DAY' ? value : unit === 'MONTH' ? value * 30 : value * 365;
}

/** A tenant override may lengthen but never shorten a legal minimum. */
export function violatesMinimum(def: Pick<RetentionDefault, 'minimumValue' | 'periodUnit'>, value: number, unit: RetentionUnit): boolean {
  return periodInDays(value, unit) < periodInDays(def.minimumValue, def.periodUnit);
}

/** Next periodic destruction due date: last run + the maximum interval (months). */
export function nextDestructionDue(lastExecutedDay: string | null, maxMonths: number, today: string): { due: string; overdue: boolean } {
  if (!lastExecutedDay) return { due: today, overdue: true };
  const due = addPeriod(lastExecutedDay, maxMonths, 'MONTH');
  return { due, overdue: due < today };
}
