import 'reflect-metadata';
import {
  canTransition,
  DESPATCH_TRANSITIONS,
  EXPENSE_VOUCHER_TRANSITIONS,
  formatDocumentNumber,
  formatEDocNumber,
  GOODS_RECEIPT_TRANSITIONS,
  INVOICE_TRANSITIONS,
  invoiceDeadlineStatus,
  invoiceRequirement,
  isLateInvoice,
  isValidEDocSeries,
  isValidPaperSeries,
  isValidTrPlate,
  parseEDocNumber,
  receiptSplit,
  RETURN_TRANSITIONS,
  returnableQuantity,
  transferNeedsDespatch,
  withdrawalDates,
  isValidDriverTckn,
  tcknCheckDigits,
} from '../tr';
import { buildBreakdown, documentTotals, proRataPart, splitAllocations } from './document-math';
import { documentTriggerDefs, documentTriggerNames } from './document-triggers';
import { ReturnService } from '../../modules/documents/return.service';

describe('WP4 numbering formats', () => {
  it('e-document numbers are series (3) + year + 9 digits', () => {
    expect(formatEDocNumber('ABC', 2026, 1)).toBe('ABC2026000000001');
    expect(formatEDocNumber('ABC', 2026, 1)).toHaveLength(16);
    expect(parseEDocNumber('ABC2026000000123')).toEqual({ series: 'ABC', year: 2026, sequence: 123 });
    expect(parseEDocNumber('AB2026000000123')).toBeNull();
  });

  it('paper and internal formats', () => {
    expect(formatDocumentNumber('PAPER', 'A', 0, 7)).toBe('A-000007');
    expect(formatDocumentNumber('INTERNAL', 'MKB', 2026, 12)).toBe('MKB-2026-000012');
  });

  it('series validation per mode', () => {
    expect(isValidEDocSeries('A1B')).toBe(true);
    expect(isValidEDocSeries('ab1')).toBe(false);
    expect(isValidEDocSeries('ABCD')).toBe(false);
    expect(isValidPaperSeries('A')).toBe(true);
    expect(isValidPaperSeries('A1')).toBe(false);
  });
});

describe('WP4 state machines (table)', () => {
  const table: [string, Record<string, readonly string[]>, string, string, boolean][] = [
    ['despatch draft -> approved', DESPATCH_TRANSITIONS, 'DRAFT', 'APPROVED', true],
    ['despatch approved -> provider', DESPATCH_TRANSITIONS, 'APPROVED', 'HANDED_TO_PROVIDER', true],
    ['despatch approved -> cancelled (never)', DESPATCH_TRANSITIONS, 'APPROVED', 'CANCELLED', false],
    ['despatch draft -> cancelled (never; drafts are deleted)', DESPATCH_TRANSITIONS, 'DRAFT', 'CANCELLED', false],
    ['despatch provider -> GIB accepted', DESPATCH_TRANSITIONS, 'HANDED_TO_PROVIDER', 'GIB_ACCEPTED', true],
    ['despatch provider -> partially accepted', DESPATCH_TRANSITIONS, 'HANDED_TO_PROVIDER', 'PARTIALLY_ACCEPTED', true],
    ['despatch accepted -> draft', DESPATCH_TRANSITIONS, 'GIB_ACCEPTED', 'DRAFT', false],
    ['invoice draft -> issued', INVOICE_TRANSITIONS, 'DRAFT', 'ISSUED', true],
    ['invoice draft -> sent (must be issued first)', INVOICE_TRANSITIONS, 'DRAFT', 'SENT', false],
    ['invoice issued -> queued', INVOICE_TRANSITIONS, 'ISSUED', 'QUEUED', true],
    ['invoice issued -> cancelled', INVOICE_TRANSITIONS, 'ISSUED', 'CANCELLED', true],
    ['invoice issued -> draft', INVOICE_TRANSITIONS, 'ISSUED', 'DRAFT', false],
    ['invoice sent -> accepted', INVOICE_TRANSITIONS, 'SENT', 'ACCEPTED', true],
    ['invoice rejected -> cancelled', INVOICE_TRANSITIONS, 'REJECTED', 'CANCELLED', false],
    ['invoice cancelled -> issued', INVOICE_TRANSITIONS, 'CANCELLED', 'ISSUED', false],
    ['return draft -> completed', RETURN_TRANSITIONS, 'DRAFT', 'COMPLETED', true],
    ['return completed -> draft', RETURN_TRANSITIONS, 'COMPLETED', 'DRAFT', false],
    ['receipt draft -> completed', GOODS_RECEIPT_TRANSITIONS, 'DRAFT', 'COMPLETED', true],
    ['voucher issued -> cancelled', EXPENSE_VOUCHER_TRANSITIONS, 'ISSUED', 'CANCELLED', true],
    ['voucher cancelled -> issued', EXPENSE_VOUCHER_TRANSITIONS, 'CANCELLED', 'ISSUED', false],
  ];
  it.each(table)('%s', (_name, machine, from, to, allowed) => {
    expect(canTransition(machine, from, to)).toBe(allowed);
  });
});

describe('VUK 231/5: 7-day invoicing rule (boundary days)', () => {
  const delivery = '2026-10-01';
  it.each([
    ['2026-10-01', 0, 7, 'ok'],
    ['2026-10-05', 4, 3, 'ok'],
    ['2026-10-06', 5, 2, 'warning'],
    ['2026-10-07', 6, 1, 'warning'],
    ['2026-10-08', 7, 0, 'critical'],
    ['2026-10-12', 11, -4, 'critical'],
  ])('today %s: %i days, %i left, %s', (today, days, left, level) => {
    expect(invoiceDeadlineStatus(delivery, today, 7, 5)).toEqual({ days, daysLeft: left, level });
  });

  it('issuing on day 7 is in time, day 8 needs confirmation; before delivery is allowed', () => {
    expect(isLateInvoice(delivery, '2026-10-08', 7)).toBe(false);
    expect(isLateInvoice(delivery, '2026-10-09', 7)).toBe(true);
    expect(isLateInvoice(delivery, '2026-09-28', 7)).toBe(false);
    expect(isLateInvoice(null, '2026-10-09', 7)).toBe(false);
  });

  it('crosses month and year ends', () => {
    expect(invoiceDeadlineStatus('2026-12-28', '2027-01-04', 7, 5).level).toBe('critical');
    expect(invoiceDeadlineStatus('2026-02-25', '2026-03-03', 7, 5)).toMatchObject({ days: 6, level: 'warning' });
  });
});

describe('Withdrawal (cayma) deadlines', () => {
  const p = { periodDays: 14, goodsReturnDays: 10, refundDays: 14 };
  it('adds calendar days to delivery / notification', () => {
    expect(withdrawalDates('2026-10-01', '2026-10-10', p)).toEqual({
      withdrawalDeadline: '2026-10-15',
      goodsReturnDeadline: '2026-10-20',
      refundDueDate: '2026-10-24',
      inTime: true,
    });
    expect(withdrawalDates('2026-10-01', '2026-10-16', p).inTime).toBe(false);
  });

  it('uses the company time zone for the notification day', async () => {
    const legal: any = { param: jest.fn().mockRejectedValue(new Error('missing')) };
    const svc = new ReturnService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, legal, {} as any);
    // 22:30 UTC on 14 Oct is 01:30 on 15 Oct in Istanbul (UTC+3) but still 14 Oct in New York.
    const at = new Date('2026-10-14T22:30:00Z');
    const ist = await svc.withdrawalPlan({ country: 'TR', timezone: 'Europe/Istanbul' } as any, '2026-10-05', at);
    const ny = await svc.withdrawalPlan({ country: 'TR', timezone: 'America/New_York' } as any, '2026-10-05', at);
    expect(ist.refundDueDate).toBe('2026-10-29');
    expect(ny.refundDueDate).toBe('2026-10-28');
    expect(ist.withdrawalDeadline).toBe('2026-10-19');
  });
});

describe('Partial return limits', () => {
  it('returnable = sold - already returned, never negative', () => {
    expect(returnableQuantity(5, 0)).toBe(5);
    expect(returnableQuantity(5, 2)).toBe(3);
    expect(returnableQuantity(2.5, 2.25)).toBe(0.25);
    expect(returnableQuantity(5, 6)).toBe(0);
  });
});

describe('Transfers: despatch advice between premises (VUK 230/5)', () => {
  const a = { id: 'a', siteGroup: null, address: { line1: 'Hadımköy Yolu No:41', districtId: 3402 } };
  const b = { id: 'b', siteGroup: null, address: { line1: 'Kemalpaşa OSB 2. Cad. No:12', districtId: 3518 } };
  it('different addresses need a despatch', () => expect(transferNeedsDespatch(a, b)).toBe(true));
  it('same site group skips it', () => expect(transferNeedsDespatch({ ...a, siteGroup: 'HQ' }, { ...b, siteGroup: 'hq' })).toBe(false));
  it('same street address in the same district skips it', () => expect(transferNeedsDespatch(a, { id: 'c', address: { line1: 'hadımköy yolu  no:41', districtId: 3402 } })).toBe(false));
  it('non-TR companies are not affected', () => expect(transferNeedsDespatch(a, b, 'US')).toBe(false));
});

describe('Drivers, plates, invoice requirement', () => {
  const real = '345178209' + tcknCheckDigits('345178209').join('');
  it('driver TCKN must be real (placeholder rejected even when whitelisted)', () => {
    expect(isValidDriverTckn(real)).toBe(true);
    expect(isValidDriverTckn('11111111111', [{ value: '11111111111', type: 'TCKN', scope: ['EIRSALIYE'] }])).toBe(false);
  });
  it('TR plates', () => {
    expect(isValidTrPlate('34 ABC 123')).toBe(true);
    expect(isValidTrPlate('06A1234')).toBe(true);
    expect(isValidTrPlate('99 ABC 12')).toBe(false);
  });
  it('VUK 232: merchants always, consumers above the limit', () => {
    expect(invoiceRequirement({ isFinalConsumer: false }, 10, 12000)).toBe('REQUIRED');
    expect(invoiceRequirement({ isFinalConsumer: true }, 12000, 12000)).toBe('OPTIONAL');
    expect(invoiceRequirement({ isFinalConsumer: true }, 12000.01, 12000)).toBe('REQUIRED');
  });
});

describe('Goods receipt split (tesellüm fazlası / noksanı)', () => {
  it('surplus above the supplier document', () => expect(receiptSplit(10, 12, 0)).toEqual({ accepted: 12, againstDocument: 10, surplus: 2, shortage: 0 }));
  it('shortage and rejection', () => expect(receiptSplit(12, 11, 1)).toEqual({ accepted: 10, againstDocument: 10, surplus: 0, shortage: 1 }));
  it('splits lot / serial allocations', () => {
    const [a, b] = splitAllocations([{ warehouseId: 'w', delta: 6, lotId: 'l1' }, { warehouseId: 'w', delta: 4, lotId: 'l2' }], 8);
    expect(a).toEqual([{ warehouseId: 'w', delta: 6, lotId: 'l1' }, { warehouseId: 'w', delta: 2, lotId: 'l2' }]);
    expect(b).toEqual([{ warehouseId: 'w', delta: 2, lotId: 'l2' }]);
    const [s1, s2] = splitAllocations([{ warehouseId: 'w', delta: 3, serials: ['a', 'b', 'c'] }], 1);
    expect(s1[0].serials).toEqual(['a']);
    expect(s2[0].serials).toEqual(['b', 'c']);
  });
});

describe('Pro-rata invoicing of a frozen line', () => {
  const src = { baseQuantity: 3, unitFactor: 1, unitPrice: 33.333333, grossAmount: 100, discountAmount: 0, documentDiscountShare: 0, netAmount: 100, taxRate: 20, taxAmount: 20, withheldTaxAmount: 0, otvAmount: 0, lineTotal: 120 };
  it('parts always add up to the source line (remainder on the last part)', () => {
    const p1 = proRataPart(src, 1, 0);
    const p2 = proRataPart(src, 1, 1, p1);
    const sum = { netAmount: p1.netAmount + p2.netAmount, taxAmount: p1.taxAmount + p2.taxAmount, lineTotal: p1.lineTotal + p2.lineTotal } as any;
    const p3 = proRataPart(src, 1, 2, sum);
    expect(+(p1.netAmount + p2.netAmount + p3.netAmount).toFixed(2)).toBe(100);
    expect(+(p1.taxAmount + p2.taxAmount + p3.taxAmount).toFixed(2)).toBe(20);
    expect(+(p1.lineTotal + p2.lineTotal + p3.lineTotal).toFixed(2)).toBe(120);
    expect(p1.netAmount).toBe(33.33);
    expect(p3.netAmount).toBe(33.34);
  });
  it('breakdown and totals', () => {
    const lines = [
      { taxRate: 20, netAmount: 100, taxAmount: 20, withheldTaxAmount: 0, grossAmount: 100, discountAmount: 0, otvAmount: 0 },
      { taxRate: 10, netAmount: 50, taxAmount: 5, withheldTaxAmount: 0, grossAmount: 50, discountAmount: 0, otvAmount: 0 },
      { taxRate: 20, netAmount: 10, taxAmount: 2, withheldTaxAmount: 1, withholdingRate: 50, grossAmount: 10, discountAmount: 0, otvAmount: 0 },
    ];
    const b = buildBreakdown(lines);
    expect(b).toHaveLength(3);
    expect(b.find((r) => r.rate === 20 && !r.withholdingRate)?.tax).toBe(20);
    const t = documentTotals({ lines });
    expect(t).toMatchObject({ subtotal: 160, taxTotal: 27, withheldTaxTotal: 1, grandTotal: 187, payableTotal: 186 });
  });
});

describe('Document immutability triggers', () => {
  const cols = {
    invoices: ['id', 'companyId', 'documentNo', 'status', 'gibStatus', 'grandTotal', 'updatedAt'],
    invoice_lines: ['id', 'invoiceId', 'unitPrice', 'returnedQuantity'],
  };
  const defs = documentTriggerDefs(cols);
  it('freezes every non-workflow column of an issued invoice', () => {
    const t = defs.find((d) => d.name === 'trg_invoices_frozen')!;
    expect(t.sql).toContain('NEW.`grandTotal` <=> OLD.`grandTotal`');
    expect(t.sql).toContain('NEW.`documentNo` <=> OLD.`documentNo`');
    expect(t.sql).not.toContain('NEW.`gibStatus` <=> OLD.`gibStatus`');
    expect(t.sql).toContain("SET MESSAGE_TEXT = 'DOCUMENT_IMMUTABLE'");
  });
  it('lines: only the running counters may change; no insert / delete after issue', () => {
    const t = defs.find((d) => d.name === 'trg_invoice_lines_frozen')!;
    expect(t.sql).toContain('NEW.`unitPrice` <=> OLD.`unitPrice`');
    expect(t.sql).not.toContain('NEW.`returnedQuantity` <=> OLD.`returnedQuantity`');
    expect(defs.map((d) => d.name)).toEqual(expect.arrayContaining(['trg_invoice_lines_no_insert', 'trg_invoice_lines_no_delete', 'trg_invoices_no_delete']));
  });
  it('names cover all document tables', () => {
    expect(documentTriggerNames()).toEqual(expect.arrayContaining(['trg_despatches_frozen', 'trg_despatch_lines_frozen', 'trg_returns_frozen', 'trg_goods_receipts_frozen', 'trg_expense_vouchers_frozen']));
  });
});
