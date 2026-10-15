/**
 * Değeri düşen mallar (VUK 274/2, 267/1; R51). Pure decision logic.
 *
 * VUK 274: when the sales value on the valuation day is at least 10 % below cost, the
 * taxpayer may value the goods at the emsal bedeli (except the "maliyet + %5/%10" method of
 * 267/2). VUK 267/1 ("ortalama fiyat esası"): the emsal value is the average sales price of
 * the valuation month (M), else of the previous month (M-1), else of the month before (M-2),
 * provided that month's sales quantity is at least 25 % of the quantity being valued.
 * Otherwise the value can only be set by the takdir komisyonu (267/3) - which is only worth
 * asking for when there is a sign of a value decline: sales in M..M-2 below cost by the decline
 * threshold that fail the quantity condition, or an indication from the caller (expired, blocked
 * or recalled lots, damage). Products that simply did not sell are not flagged.
 *
 * The 10 % and 25 % thresholds come from `legal_parameters` (IMPAIRMENT_MIN_DECLINE_PCT,
 * EMSAL_MIN_MONTHLY_SALES_PCT); the defaults here are only used when no parameter exists.
 */
import { roundCost, roundMoney } from './costing';

export interface MonthlySales {
  /** YYYY-MM */
  month: string;
  quantity: number;
  /** Net sales amount (base currency) */
  amount: number;
}

export interface ImpairmentInput {
  quantity: number;
  unitCost: number;
  /** Sales of the valuation month first, then M-1, M-2 (any order; matched by month key) */
  sales: MonthlySales[];
  /** YYYY-MM of the valuation day */
  valuationMonth: string;
  minDeclinePct?: number;
  minMonthlySalesPct?: number;
  /** Sign of a value decline known to the caller (e.g. EXPIRED_LOTS, BLOCKED_LOTS) */
  indication?: string | null;
}

export type EmsalBasis = 'M' | 'M-1' | 'M-2' | 'TAKDIR';

export interface ImpairmentResult {
  emsalBasis: EmsalBasis;
  emsalMonth: string | null;
  emsalUnitPrice: number | null;
  monthSalesQty: number | null;
  /** (cost - emsal) / cost x 100; null without an emsal value */
  declinePct: number | null;
  /** 274: decline >= minDeclinePct and an emsal value from 267/1 exists */
  qualifies: boolean;
  /** No emsal value under 267/1 but a sign of decline: valuation needs the takdir komisyonu (267/3) */
  requiresCommission: boolean;
  /** Why a commission valuation is suggested (PRICE_DECLINE_LOW_VOLUME or the caller's indication) */
  indication: string | null;
  costValue: number;
  /** Tax value (VUK): emsal value when it qualifies, else cost */
  taxValue: number;
  /** Book value (TMS 2 net realisable value, 158 provision): min(cost, emsal) */
  bookValue: number;
  provision: number;
}

/** Month key shifted by `delta` months (YYYY-MM). */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
}

export function evaluateImpairment(input: ImpairmentInput): ImpairmentResult {
  const minDecline = input.minDeclinePct ?? 10;
  const minSales = input.minMonthlySalesPct ?? 25;
  const qty = Number(input.quantity) || 0;
  const unitCost = Number(input.unitCost) || 0;
  const costValue = roundMoney(qty * unitCost);
  const order: [EmsalBasis, string][] = [
    ['M', input.valuationMonth],
    ['M-1', shiftMonth(input.valuationMonth, -1)],
    ['M-2', shiftMonth(input.valuationMonth, -2)],
  ];
  let lowVolumeDecline = false;
  for (const [basis, month] of order) {
    const s = input.sales.find((x) => x.month === month);
    if (!s || !(s.quantity > 0)) continue;
    // 25 % condition: monthly sales quantity / quantity valued (inclusive).
    if (qty > 0 && (s.quantity / qty) * 100 + 1e-9 < minSales) {
      const price = s.amount / s.quantity;
      if (unitCost > 0 && ((unitCost - price) / unitCost) * 100 + 1e-9 >= minDecline) lowVolumeDecline = true;
      continue;
    }
    const emsal = roundCost(s.amount / s.quantity);
    const declinePct = unitCost > 0 ? Math.round(((unitCost - emsal) / unitCost) * 10000) / 100 : 0;
    const qualifies = unitCost > 0 && declinePct + 1e-9 >= minDecline;
    const bookValue = roundMoney(qty * Math.min(unitCost, emsal));
    const taxValue = qualifies ? roundMoney(qty * emsal) : costValue;
    return {
      emsalBasis: basis,
      emsalMonth: month,
      emsalUnitPrice: emsal,
      monthSalesQty: s.quantity,
      declinePct,
      qualifies,
      requiresCommission: false,
      indication: null,
      costValue,
      taxValue,
      bookValue,
      provision: roundMoney(costValue - bookValue),
    };
  }
  return {
    emsalBasis: 'TAKDIR',
    emsalMonth: null,
    emsalUnitPrice: null,
    monthSalesQty: null,
    declinePct: null,
    qualifies: false,
    requiresCommission: lowVolumeDecline || !!input.indication,
    indication: lowVolumeDecline ? 'PRICE_DECLINE_LOW_VOLUME' : input.indication || null,
    costValue,
    taxValue: costValue,
    bookValue: costValue,
    provision: 0,
  };
}
