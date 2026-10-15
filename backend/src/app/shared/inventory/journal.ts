/**
 * Yevmiye fişi (journal voucher) building from the costed stock ledger (VUK 175, 219; MSUGT
 * No 1 Tekdüzen Hesap Planı; R52). Pure functions; the default account map follows THP and can
 * be overridden per company in `account_mappings` (event x inventory class x category / warehouse).
 *
 * Every voucher balances (debit = credit) by construction: each movement produces one debit and
 * one credit line of the same amount.
 */
import { roundMoney } from './costing';

export interface AccountRule {
  event: string;
  /** null = any class */
  inventoryClass?: string | null;
  categoryId?: string | null;
  warehouseId?: string | null;
  debitAccount: string;
  creditAccount: string;
  enabled?: boolean;
}

/** `{STOCK}` is replaced by the inventory class account (150/151/152/153/157), `{COGS}` by its cost-of-sales account. */
export const DEFAULT_ACCOUNT_RULES: AccountRule[] = [
  { event: 'PURCHASE', debitAccount: '{STOCK}', creditAccount: '320' },
  { event: 'SALE_COGS', debitAccount: '{COGS}', creditAccount: '{STOCK}' },
  { event: 'SALES_RETURN', debitAccount: '{STOCK}', creditAccount: '{COGS}' },
  { event: 'PURCHASE_RETURN', debitAccount: '320', creditAccount: '{STOCK}' },
  { event: 'COUNT_SURPLUS', debitAccount: '{STOCK}', creditAccount: '397' },
  { event: 'COUNT_SHORTAGE', debitAccount: '197', creditAccount: '{STOCK}' },
  { event: 'TESELLUM_SURPLUS', debitAccount: '{STOCK}', creditAccount: '397' },
  { event: 'TESELLUM_SHORTAGE', debitAccount: '197', creditAccount: '{STOCK}' },
  { event: 'WASTAGE_NORMAL', debitAccount: '{COGS}', creditAccount: '{STOCK}' },
  { event: 'LOSS', debitAccount: '689', creditAccount: '{STOCK}' },
  { event: 'DISASTER_LOSS', debitAccount: '689', creditAccount: '{STOCK}' },
  { event: 'SCRAP', debitAccount: '689', creditAccount: '{STOCK}' },
  { event: 'INTERNAL_USE', debitAccount: '770', creditAccount: '{STOCK}' },
  { event: 'GIFT_SAMPLE', debitAccount: '760', creditAccount: '{STOCK}' },
  // The opening balance is booked by the accounting package (açılış kaydı): off by default.
  { event: 'OPENING', debitAccount: '{STOCK}', creditAccount: '500', enabled: false },
  { event: 'CORRECTION_IN', debitAccount: '{STOCK}', creditAccount: '397' },
  { event: 'CORRECTION_OUT', debitAccount: '197', creditAccount: '{STOCK}' },
  { event: 'LANDED_COST', debitAccount: '{STOCK}', creditAccount: '320' },
  { event: 'LANDED_COST_COGS', debitAccount: '{COGS}', creditAccount: '320' },
  { event: 'IMPAIRMENT', debitAccount: '654', creditAccount: '158' },
];

export const CLASS_STOCK_ACCOUNT: Record<string, string> = { ILK_MADDE_150: '150', YARI_MAMUL_151: '151', MAMUL_152: '152', TICARI_MAL_153: '153', DIGER_157: '157' };
export const CLASS_COGS_ACCOUNT: Record<string, string> = { ILK_MADDE_150: '622', YARI_MAMUL_151: '622', MAMUL_152: '620', TICARI_MAL_153: '621', DIGER_157: '622' };

export const ACCOUNT_NAMES: Record<string, string> = {
  '150': 'İlk Madde ve Malzeme', '151': 'Yarı Mamuller - Üretim', '152': 'Mamuller', '153': 'Ticari Mallar', '157': 'Diğer Stoklar', '158': 'Stok Değer Düşüklüğü Karşılığı (-)',
  '197': 'Sayım ve Tesellüm Noksanları', '320': 'Satıcılar', '397': 'Sayım ve Tesellüm Fazlaları', '500': 'Sermaye',
  '620': 'Satılan Mamuller Maliyeti (-)', '621': 'Satılan Ticari Mallar Maliyeti (-)', '622': 'Satılan Hizmet Maliyeti (-)',
  '654': 'Karşılık Giderleri (-)', '689': 'Diğer Olağandışı Gider ve Zararlar (-)', '760': 'Pazarlama Satış ve Dağıtım Giderleri (-)', '770': 'Genel Yönetim Giderleri (-)',
};

/** Accounting event of a stock movement (null: no entry, e.g. transfers between own warehouses). */
export function accountingEvent(m: { type: string; reasonCode: string; quantity: number }): string | null {
  const q = Number(m.quantity) || 0;
  if (!q) return null;
  if (['TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT'].includes(m.type) || m.reasonCode === 'TRANSFER') return null;
  switch (m.reasonCode) {
    case 'PURCHASE': return q > 0 ? 'PURCHASE' : 'PURCHASE_RETURN';
    case 'SALE': return q < 0 ? 'SALE_COGS' : 'SALES_RETURN';
    case 'RETURN': return q > 0 ? 'SALES_RETURN' : 'PURCHASE_RETURN';
    case 'OPENING': return 'OPENING';
    case 'COUNT_SURPLUS': return 'COUNT_SURPLUS';
    case 'COUNT_SHORTAGE': return 'COUNT_SHORTAGE';
    case 'TESELLUM_SURPLUS': return 'TESELLUM_SURPLUS';
    case 'TESELLUM_SHORTAGE': return 'TESELLUM_SHORTAGE';
    case 'WASTAGE_NORMAL': return 'WASTAGE_NORMAL';
    case 'LOSS_ZAYI':
    case 'THEFT_LOSS':
    case 'EXPIRED_DESTROYED':
    case 'DESTRUCTION_IMHA': return 'LOSS';
    case 'DISASTER_LOSS': return 'DISASTER_LOSS';
    case 'SCRAP': return 'SCRAP';
    case 'INTERNAL_USE':
    case 'WITHDRAWAL':
    case 'PERSONNEL': return 'INTERNAL_USE';
    case 'GIFT_SAMPLE': return 'GIFT_SAMPLE';
    default: return q > 0 ? 'CORRECTION_IN' : 'CORRECTION_OUT';
  }
}

/** Most specific enabled rule: warehouse / category / class matches beat the generic rule. */
export function pickRule(rules: AccountRule[], event: string, ctx: { inventoryClass?: string | null; categoryId?: string | null; warehouseId?: string | null }): AccountRule | null {
  let best: AccountRule | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (r.event !== event) continue;
    if (r.inventoryClass && r.inventoryClass !== ctx.inventoryClass) continue;
    if (r.categoryId && r.categoryId !== ctx.categoryId) continue;
    if (r.warehouseId && r.warehouseId !== ctx.warehouseId) continue;
    const score = (r.warehouseId ? 4 : 0) + (r.categoryId ? 2 : 0) + (r.inventoryClass ? 1 : 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

export function resolveAccount(account: string, inventoryClass: string | null | undefined): string {
  const cls = inventoryClass || 'TICARI_MAL_153';
  return account.replace('{STOCK}', CLASS_STOCK_ACCOUNT[cls] || '153').replace('{COGS}', CLASS_COGS_ACCOUNT[cls] || '621');
}

export interface JournalSource {
  id: string;
  /** YYYY-MM-DD (company time) */
  date: string;
  event: string;
  amount: number;
  inventoryClass?: string | null;
  categoryId?: string | null;
  warehouseId?: string | null;
  documentType?: string | null;
  documentNo?: string | null;
  documentDate?: string | null;
  description: string;
}

export interface JournalLine {
  account: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
  sourceId: string;
}

export interface JournalVoucher {
  voucherNo: string;
  date: string;
  documentType: string | null;
  documentNo: string | null;
  documentDate: string | null;
  /** e-Defter documentType (invoice / check / cash / receipt / voucher / other) */
  eDefterDocumentType: string;
  eDefterDocumentDescription: string | null;
  lines: JournalLine[];
  debitTotal: number;
  creditTotal: number;
}

export interface JournalBuildResult {
  vouchers: JournalVoucher[];
  skipped: { id: string; event: string; reason: 'NO_RULE' | 'DISABLED' | 'ZERO_AMOUNT' }[];
  debitTotal: number;
  creditTotal: number;
}

/**
 * Builds vouchers: one per (date, document) group. `edefterTypes` maps internal document types to
 * e-Defter `documentType` values (legal parameter EDEFTER_DOCUMENT_TYPES); unmapped -> "other".
 */
export function buildJournal(sources: JournalSource[], rules: AccountRule[], edefterTypes: Record<string, string> = {}, docNames: Record<string, string> = {}): JournalBuildResult {
  const groups = new Map<string, JournalVoucher>();
  const skipped: JournalBuildResult['skipped'] = [];
  const sorted = [...sources].sort((a, b) => a.date.localeCompare(b.date) || String(a.documentNo || '').localeCompare(String(b.documentNo || '')) || a.id.localeCompare(b.id));
  for (const s of sorted) {
    const amount = roundMoney(Math.abs(s.amount));
    if (!amount) {
      skipped.push({ id: s.id, event: s.event, reason: 'ZERO_AMOUNT' });
      continue;
    }
    const rule = pickRule(rules, s.event, s);
    if (!rule) {
      skipped.push({ id: s.id, event: s.event, reason: 'NO_RULE' });
      continue;
    }
    if (rule.enabled === false) {
      skipped.push({ id: s.id, event: s.event, reason: 'DISABLED' });
      continue;
    }
    const key = `${s.date}|${s.documentType || ''}|${s.documentNo || ''}`;
    let v = groups.get(key);
    if (!v) {
      const type = s.documentType || 'OTHER';
      const eType = edefterTypes[type] || 'other';
      v = {
        voucherNo: '',
        date: s.date,
        documentType: s.documentType || null,
        documentNo: s.documentNo || null,
        documentDate: s.documentDate || s.date,
        eDefterDocumentType: eType,
        eDefterDocumentDescription: eType === 'other' ? docNames[type] || type : null,
        lines: [],
        debitTotal: 0,
        creditTotal: 0,
      };
      groups.set(key, v);
    }
    const debit = resolveAccount(rule.debitAccount, s.inventoryClass);
    const credit = resolveAccount(rule.creditAccount, s.inventoryClass);
    v.lines.push({ account: debit, accountName: ACCOUNT_NAMES[debit] || '', debit: amount, credit: 0, description: s.description, sourceId: s.id });
    v.lines.push({ account: credit, accountName: ACCOUNT_NAMES[credit] || '', debit: 0, credit: amount, description: s.description, sourceId: s.id });
    v.debitTotal = roundMoney(v.debitTotal + amount);
    v.creditTotal = roundMoney(v.creditTotal + amount);
  }
  const vouchers = [...groups.values()];
  vouchers.forEach((v, i) => (v.voucherNo = String(i + 1).padStart(6, '0')));
  return {
    vouchers,
    skipped,
    debitTotal: roundMoney(vouchers.reduce((s, v) => s + v.debitTotal, 0)),
    creditTotal: roundMoney(vouchers.reduce((s, v) => s + v.creditTotal, 0)),
  };
}
