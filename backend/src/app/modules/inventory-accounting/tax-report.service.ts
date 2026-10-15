import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { InvoiceEntity } from '../../entities/invoice.entity';
import { ReturnEntity } from '../../entities/return.entity';
import { IncomingDocumentEntity } from '../../entities/ebelge.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { FinanceService } from '../../shared/services/finance.service';
import { groupVatLines, totalsOf, VatLine, vatSummary } from '../../shared/inventory/vat-report';
import { roundMoney } from '../../shared/inventory/costing';
import { addDays, DEFAULT_TIMEZONE, endOfMonth, isDateKey, roundQty, VAT_CORRECTION_REASONS, VAT_DEEMED_SUPPLY_REASONS, withDayOfMonth, zonedDayStart, dateKeyInZone } from '../../shared/tr';
import { ValuationService } from './valuation.service';
import { esc, legalPage, money, num, PRE_REPORT_NOTICE, trDay } from './legal-print';

const LIVE_INVOICE = ['ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'];
const SALES_RETURN_TYPES = ['SALES_RETURN', 'WITHDRAWAL', 'DEFECT'];

/**
 * KDV ön raporları (R21, R17) and VAT-relevant stock movements (KDVK 3/a, 27, 30/c):
 *  - GET /reports/vat?period=YYYY-MM: sales by rate / exemption / withholding, returns, the
 *    deductible VAT list (supplier VKN, document no / date, base, VAT), import VAT lines and the
 *    due days (KDV-1: 28th, KDV-2: 25th of the next month; legal parameters);
 *  - GET /reports/vat-withholding: KDV-2 pre-report (VAT withheld by the company as buyer and
 *    reverse-charge VAT);
 *  - GET /reports/vat-impact-movements: withdrawals / gifts at the emsal value and losses whose
 *    deducted VAT must be corrected (zayi; disaster exits and scrap excluded).
 * Every output carries "Ön rapordur, beyanname yerine geçmez".
 */
@Injectable()
export class TaxReportService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly finance: FinanceService,
    private readonly valuation: ValuationService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  private parsePeriod(period?: string): { from: string; to: string; month: string } {
    const p = String(period || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new BadRequestException(err('REPORT_PERIOD_INVALID'));
    const from = `${p}-01`;
    return { from, to: endOfMonth(from), month: p };
  }

  private async dueDates(month: string) {
    const nextMonthFirst = addDays(endOfMonth(`${month}-01`), 1);
    const kdv1 = Number(await this.finance.param<number>('KDV1_DUE_DAY', nextMonthFirst).catch(() => 28)) || 28;
    const kdv2 = Number(await this.finance.param<number>('KDV2_DUE_DAY', nextMonthFirst).catch(() => 25)) || 25;
    return { kdv1Due: withDayOfMonth(nextMonthFirst, kdv1), kdv2Due: withDayOfMonth(nextMonthFirst, kdv2), kdv1Day: kdv1, kdv2Day: kdv2 };
  }

  /** All VAT lines of the month (TRY). */
  async collectVatLines(period: string): Promise<{ lines: VatLine[]; invoiceTotals: { subtotalTry: number; taxTotalTry: number; count: number }; notes: string[] }> {
    const { from, to } = this.parsePeriod(period);
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const lines: VatLine[] = [];
    const notes: string[] = [];

    // Sales invoices (and our return invoices = purchase returns).
    const invoices = await m
      .createQueryBuilder(InvoiceEntity, 'i')
      .leftJoinAndSelect('i.lines', 'l')
      .where('i.companyId = :c AND i.status IN (:...st) AND i.issueDate >= :f AND i.issueDate <= :t', { c: this.companyId, st: LIVE_INVOICE, f: from, t: to })
      .getMany();
    let subtotalTry = 0;
    let taxTotalTry = 0;
    for (const inv of invoices) {
      const rate = Number(inv.exchangeRate) || 1;
      const kind = inv.kind === 'RETURN' ? 'PURCHASE_RETURN' : 'SALE';
      const party = inv.buyerSnapshot;
      subtotalTry = roundMoney(subtotalTry + Number(inv.subtotalTry || 0));
      taxTotalTry = roundMoney(taxTotalTry + Number(inv.taxTotalTry || 0));
      for (const l of inv.lines || []) {
        lines.push({
          kind, documentId: inv.id, documentNo: inv.documentNo ?? null, documentDate: inv.issueDate ?? null, partyTaxId: party?.taxId ?? null, partyName: party?.legalName || party?.name || null,
          rate: Number(l.taxRate) || 0, exemptionCode: l.exemptionCode ?? null, withholdingCode: l.withholdingCode ?? null, withholdingRate: l.withholdingRate ?? null,
          base: roundMoney(Number(l.netAmount) * rate), tax: roundMoney(Number(l.taxAmount) * rate), withheld: roundMoney(Number(l.withheldTaxAmount || 0) * rate),
        });
      }
      for (const ch of inv.charges || []) {
        const base = Number(ch.amount) || 0;
        const tax = Number(ch.taxAmount) || 0;
        lines.push({
          kind, documentId: inv.id, documentNo: inv.documentNo ?? null, documentDate: inv.issueDate ?? null, partyTaxId: party?.taxId ?? null, partyName: party?.legalName || party?.name || null,
          rate: base ? Math.round((tax / base) * 100) : 0, exemptionCode: null, withholdingCode: null, withholdingRate: null, base: roundMoney(base * rate), tax: roundMoney(tax * rate), withheld: 0,
        });
      }
    }

    // Incoming e-invoices (deductible VAT); incoming IADE invoices are sales returns.
    const incoming = await m.find(IncomingDocumentEntity, { where: { companyId: this.companyId, documentType: 'INVOICE', status: Not(In(['REJECTED'])) } });
    const incomingEttns = new Set<string>();
    const incomingNos = new Set<string>();
    for (const d of incoming) {
      if (!d.issueDate || String(d.issueDate) < from || String(d.issueDate) > to) {
        incomingEttns.add(d.ettn);
        if (d.documentNo) incomingNos.add(`${d.senderTaxId}|${d.documentNo}`);
        continue;
      }
      incomingEttns.add(d.ettn);
      if (d.documentNo) incomingNos.add(`${d.senderTaxId}|${d.documentNo}`);
      const fx = d.currency && d.currency !== company.baseCurrency ? (await this.finance.convertToBase(1, d.currency, d.issueDate)) ?? 1 : 1;
      const kind = d.typeCode === 'IADE' ? 'SALES_RETURN' : 'PURCHASE';
      const docLines = (d.lines || []) as { taxPercent?: number | null; lineExtension?: number; taxAmount?: number; allowance?: number }[];
      if (docLines.length && docLines.some((l) => l.taxPercent !== null && l.taxPercent !== undefined)) {
        for (const l of docLines) {
          lines.push({
            kind, documentId: d.id, documentNo: d.documentNo ?? null, documentDate: String(d.issueDate), partyTaxId: d.senderTaxId ?? null, partyName: d.senderName ?? null,
            rate: Number(l.taxPercent) || 0, exemptionCode: null, withholdingCode: d.typeCode === 'TEVKIFAT' ? 'TEVKIFAT' : null, withholdingRate: null,
            base: roundMoney((Number(l.lineExtension) || 0) * fx), tax: roundMoney((Number(l.taxAmount) || 0) * fx), withheld: 0,
          });
        }
      } else {
        const tax = Number(d.taxTotal) || 0;
        lines.push({
          kind, documentId: d.id, documentNo: d.documentNo ?? null, documentDate: String(d.issueDate), partyTaxId: d.senderTaxId ?? null, partyName: d.senderName ?? null,
          rate: 0, exemptionCode: null, withholdingCode: null, withholdingRate: null, base: roundMoney(((Number(d.payableAmount) || 0) - tax) * fx), tax: roundMoney(tax * fx), withheld: 0,
        });
      }
    }

    // Paper / external supplier invoices recorded on goods receipts (not received electronically).
    const receipts = await m.find(GoodsReceiptEntity, { where: { companyId: this.companyId, status: 'COMPLETED' }, relations: { items: true } });
    const seen = new Set<string>();
    for (const r of receipts) {
      if (!r.supplierInvoiceNo || !r.supplierInvoiceDate) continue;
      const day = String(r.supplierInvoiceDate);
      if (day < from || day > to) continue;
      const taxId = r.supplierSnapshot?.taxId ?? null;
      if ((r.supplierInvoiceEttn && incomingEttns.has(r.supplierInvoiceEttn)) || incomingNos.has(`${taxId}|${r.supplierInvoiceNo}`)) continue;
      const po = await m.findOne(PurchaseOrderEntity, { where: { companyId: this.companyId, id: r.purchaseOrderId }, relations: { items: true } });
      if (!po || po.isImport) continue;
      const key = `${taxId}|${r.supplierInvoiceNo}|${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rate = Number(po.exchangeRate) || 1;
      for (const gi of r.items || []) {
        const pi = po.items.find((x) => x.id === gi.purchaseOrderItemId);
        if (!pi || !(Number(pi.quantity) > 0) || !(gi.acceptedQuantity > 0)) continue;
        const share = Math.min(1, gi.acceptedQuantity / Number(pi.quantity));
        const vat = pi.deductibleVat !== null && pi.deductibleVat !== undefined ? Number(pi.deductibleVat) : Number(pi.taxAmount);
        lines.push({
          kind: 'PURCHASE', documentId: r.id, documentNo: r.supplierInvoiceNo, documentDate: day, partyTaxId: taxId, partyName: r.supplierSnapshot?.legalName || r.supplierSnapshot?.name || po.supplierName,
          rate: Number(pi.taxRate) || 0, exemptionCode: pi.exemptionCode ?? null, withholdingCode: pi.withholdingCode ?? null, withholdingRate: pi.withholdingRate ?? null,
          base: roundMoney(Number(pi.netAmount) * share * rate), tax: roundMoney(vat * share * rate), withheld: roundMoney(Number(pi.withheldTaxAmount || 0) * share * rate),
        });
      }
    }

    // Import VAT paid at customs (gümrük beyannamesi).
    const imports = await m.find(PurchaseOrderEntity, { where: { companyId: this.companyId, isImport: true } });
    for (const po of imports) {
      if (!po.customsDeclarationNo || !po.customsDeclarationDate) continue;
      const day = String(po.customsDeclarationDate);
      if (day < from || day > to) continue;
      const vat = roundMoney(Number(po.importVatAmount || 0) - Number(po.nonDeductibleImportVat || 0));
      lines.push({
        kind: 'IMPORT', documentId: po.id, documentNo: po.customsDeclarationNo, documentDate: day, partyTaxId: null, partyName: po.supplierName,
        rate: Number(po.subtotalTry) ? Math.round((Number(po.importVatAmount || 0) / Number(po.subtotalTry)) * 100) : 0, exemptionCode: null, withholdingCode: null, withholdingRate: null,
        base: roundMoney(Number(po.subtotalTry || 0)), tax: vat, withheld: 0,
      });
    }
    if (imports.some((p) => !p.customsDeclarationNo)) notes.push('IMPORT_WITHOUT_DECLARATION');

    // Sales returns received (return documents), unless the return invoice came electronically.
    const returns = await m.find(ReturnEntity, { where: { companyId: this.companyId, status: 'COMPLETED', type: In(SALES_RETURN_TYPES) }, relations: { items: true } });
    for (const r of returns) {
      const day = r.counterpartyDocDate ? String(r.counterpartyDocDate) : r.completedAt ? dateKeyInZone(new Date(r.completedAt), company.timezone || DEFAULT_TIMEZONE) : null;
      if (!day || day < from || day > to) continue;
      if (r.counterpartyEttn && incomingEttns.has(r.counterpartyEttn)) continue;
      let rate = 1;
      if (r.currency && r.currency !== 'TRY' && r.invoiceId) {
        const inv = await m.findOne(InvoiceEntity, { where: { companyId: this.companyId, id: r.invoiceId } });
        rate = Number(inv?.exchangeRate) || 1;
      }
      for (const it of r.items || []) {
        lines.push({
          kind: 'SALES_RETURN', documentId: r.id, documentNo: r.counterpartyDocNo || r.returnNo, documentDate: day, partyTaxId: r.partySnapshot?.taxId ?? null, partyName: r.partySnapshot?.legalName || r.partySnapshot?.name || null,
          rate: Number(it.taxRate) || 0, exemptionCode: it.exemptionCode ?? null, withholdingCode: it.withholdingCode ?? null, withholdingRate: it.withholdingRate ?? null,
          base: roundMoney(Number(it.netAmount) * rate), tax: roundMoney(Number(it.taxAmount) * rate), withheld: roundMoney(Number(it.withheldTaxAmount || 0) * rate),
        });
      }
    }
    return { lines, invoiceTotals: { subtotalTry, taxTotalTry, count: invoices.length }, notes };
  }

  async vatReport(period?: string) {
    const { month, from, to } = this.parsePeriod(period);
    const { lines, invoiceTotals, notes } = await this.collectVatLines(month);
    const company = await this.finance.getCompany();
    const of = (k: VatLine['kind']) => lines.filter((l) => l.kind === k);
    return {
      period: month,
      from,
      to,
      currency: 'TRY',
      baseCurrency: company.baseCurrency,
      notice: 'PRE_REPORT',
      noticeText: PRE_REPORT_NOTICE,
      ...(await this.dueDates(month)),
      sales: { groups: groupVatLines(of('SALE')), totals: totalsOf(of('SALE')) },
      salesReturns: { groups: groupVatLines(of('SALES_RETURN')), totals: totalsOf(of('SALES_RETURN')), documents: of('SALES_RETURN') },
      purchaseReturns: { groups: groupVatLines(of('PURCHASE_RETURN')), totals: totalsOf(of('PURCHASE_RETURN')) },
      deductible: { documents: this.byDocument(of('PURCHASE')), totals: totalsOf(of('PURCHASE')) },
      imports: { documents: this.byDocument(of('IMPORT')), totals: totalsOf(of('IMPORT')) },
      summary: vatSummary(lines),
      reconciliation: {
        invoices: invoiceTotals.count,
        invoiceSubtotalTry: invoiceTotals.subtotalTry,
        invoiceTaxTotalTry: invoiceTotals.taxTotalTry,
        reportBase: roundMoney(totalsOf([...of('SALE'), ...of('PURCHASE_RETURN')]).base),
        reportTax: roundMoney(totalsOf([...of('SALE'), ...of('PURCHASE_RETURN')]).tax),
      },
      notes,
    };
  }

  /** One row per document (deductible VAT list: supplier VKN, document no / date, base, VAT). */
  private byDocument(lines: VatLine[]) {
    const map = new Map<string, { documentId: string; documentNo: string | null; documentDate: string | null; partyTaxId: string | null; partyName: string | null; base: number; tax: number; withheld: number; rates: number[] }>();
    for (const l of lines) {
      const k = l.documentId + '|' + (l.documentNo || '');
      const row = map.get(k) || { documentId: l.documentId, documentNo: l.documentNo, documentDate: l.documentDate, partyTaxId: l.partyTaxId, partyName: l.partyName, base: 0, tax: 0, withheld: 0, rates: [] };
      row.base = roundMoney(row.base + l.base);
      row.tax = roundMoney(row.tax + l.tax);
      row.withheld = roundMoney(row.withheld + l.withheld);
      if (!row.rates.includes(l.rate)) row.rates.push(l.rate);
      map.set(k, row);
    }
    return [...map.values()].sort((a, b) => String(a.documentDate).localeCompare(String(b.documentDate)) || String(a.documentNo).localeCompare(String(b.documentNo)));
  }

  /**
   * KDV-2 pre-report: VAT the company withholds as buyer (tevkifat: PO lines with a withholding
   * code / incoming TEVKIFAT invoices) and reverse-charge VAT (sorumlu sıfatıyla, e.g. services
   * from abroad), by tax point in the month.
   */
  async vatWithholdingReport(period?: string) {
    const { month, from, to } = this.parsePeriod(period);
    const m = this.dataSource.manager;
    const pos = await m
      .createQueryBuilder(PurchaseOrderEntity, 'po')
      .leftJoinAndSelect('po.items', 'i')
      .where('po.companyId = :c AND po.taxPointDate >= :f AND po.taxPointDate <= :t', { c: this.companyId, f: from, t: to })
      .andWhere("po.status IN ('Received', 'Partially Received')")
      .getMany();
    const rows: { source: string; documentNo: string | null; documentDate: string | null; partyTaxId: string | null; partyName: string | null; withholdingCode: string | null; withholdingRate: number | null; base: number; tax: number; withheld: number; reverseCharge: boolean }[] = [];
    for (const po of pos) {
      const rate = Number(po.exchangeRate) || 1;
      const gr = await m.findOne(GoodsReceiptEntity, { where: { companyId: this.companyId, purchaseOrderId: po.id, status: 'COMPLETED' }, order: { receivedAt: 'ASC' } });
      for (const i of po.items || []) {
        const withheld = Number(i.withheldTaxAmount || 0);
        if (!(withheld > 0) && !i.reverseCharge) continue;
        rows.push({
          source: 'PURCHASE_ORDER', documentNo: gr?.supplierInvoiceNo || po.poNumber, documentDate: gr?.supplierInvoiceDate ? String(gr.supplierInvoiceDate) : String(po.taxPointDate), partyTaxId: gr?.supplierSnapshot?.taxId ?? null, partyName: po.supplierName,
          withholdingCode: i.withholdingCode ?? null, withholdingRate: i.withholdingRate ?? null, base: roundMoney(Number(i.netAmount) * rate), tax: roundMoney(Number(i.taxAmount) * rate),
          withheld: roundMoney((i.reverseCharge ? Number(i.taxAmount) : withheld) * rate), reverseCharge: !!i.reverseCharge,
        });
      }
    }
    const incoming = await m.find(IncomingDocumentEntity, { where: { companyId: this.companyId, documentType: 'INVOICE', typeCode: 'TEVKIFAT', status: Not(In(['REJECTED'])) } });
    for (const d of incoming) {
      if (!d.issueDate || String(d.issueDate) < from || String(d.issueDate) > to) continue;
      rows.push({ source: 'INCOMING_EINVOICE', documentNo: d.documentNo ?? null, documentDate: String(d.issueDate), partyTaxId: d.senderTaxId ?? null, partyName: d.senderName ?? null, withholdingCode: null, withholdingRate: null, base: roundMoney((Number(d.payableAmount) || 0) - (Number(d.taxTotal) || 0)), tax: roundMoney(Number(d.taxTotal) || 0), withheld: 0, reverseCharge: false });
    }
    const byCode = new Map<string, { withholdingCode: string; base: number; tax: number; withheld: number; count: number }>();
    for (const r of rows) {
      const k = r.reverseCharge ? 'SORUMLU' : r.withholdingCode || '-';
      const g = byCode.get(k) || { withholdingCode: k, base: 0, tax: 0, withheld: 0, count: 0 };
      g.base = roundMoney(g.base + r.base);
      g.tax = roundMoney(g.tax + r.tax);
      g.withheld = roundMoney(g.withheld + r.withheld);
      g.count += 1;
      byCode.set(k, g);
    }
    return {
      period: month,
      from,
      to,
      notice: 'PRE_REPORT',
      noticeText: PRE_REPORT_NOTICE,
      ...(await this.dueDates(month)),
      rows,
      byCode: [...byCode.values()],
      totals: { base: roundMoney(rows.reduce((s, r) => s + r.base, 0)), tax: roundMoney(rows.reduce((s, r) => s + r.tax, 0)), withheld: roundMoney(rows.reduce((s, r) => s + r.withheld, 0)) },
    };
  }

  /**
   * VAT-relevant stock exits of the month:
   *  - deemed supplies (KDVK 3/a, 27): withdrawals for own use / personnel, gifts and samples,
   *    taxed at the emsal value (average sales price of the month, else cost + 10 %);
   *  - KDV indirim düzeltmesi (KDVK 30/c): zayi, theft, expired / destroyed goods and wastage
   *    above the normal rate; the input VAT deducted on them is added back. Disaster exits
   *    (afet) and scrap (VUK 278 hurda) are listed but excluded.
   */
  async vatImpactMovements(period?: string) {
    const { month, from, to } = this.parsePeriod(period);
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const reasons = [...VAT_DEEMED_SUPPLY_REASONS, ...VAT_CORRECTION_REASONS, 'DISASTER_LOSS', 'SCRAP'];
    const moves = await m
      .createQueryBuilder(StockMovementEntity, 'sm')
      .where('sm.companyId = :c AND sm.transactionDate >= :s AND sm.transactionDate < :e AND sm.quantity < 0 AND sm.reasonCode IN (:...r)', { c: this.companyId, s: zonedDayStart(from, tz), e: zonedDayStart(addDays(to, 1), tz), r: reasons })
      .orderBy('sm.transactionDate', 'ASC')
      .getMany();
    const products = await m.find(ProductEntity, { where: { companyId: this.companyId } });
    const sales = await this.monthlySalesPrices(month);
    const rateOf = async (p: ProductEntity | undefined) => (p ? await this.finance.taxRateForProduct(p).catch(() => 20) : 20);
    const deemed = [];
    const corrections = [];
    const excluded = [];
    for (const mv of moves) {
      const p = products.find((x) => x.id === mv.productId);
      const qty = Math.abs(Number(mv.quantity));
      const cost = Math.abs(Number(mv.totalCost || 0));
      const vatRate = await rateOf(p);
      const day = dateKeyInZone(new Date(mv.transactionDate), tz);
      const base = { movementId: mv.id, date: day, productId: mv.productId, productName: mv.productName, reasonCode: mv.reasonCode, documentNo: mv.documentNo ?? null, quantity: qty, costValue: roundMoney(cost), vatRate };
      if ((VAT_DEEMED_SUPPLY_REASONS as readonly string[]).includes(mv.reasonCode)) {
        const avg = sales.get(mv.productId);
        const emsalUnit = avg ?? (qty ? (cost / qty) * 1.1 : 0);
        const emsal = roundMoney(emsalUnit * qty);
        deemed.push({ ...base, emsalBasis: avg !== undefined ? 'MONTH_AVG_SALES_PRICE' : 'COST_PLUS_10', emsalValue: emsal, vat: roundMoney((emsal * vatRate) / 100) });
      } else if ((VAT_CORRECTION_REASONS as readonly string[]).includes(mv.reasonCode)) {
        corrections.push({ ...base, vatToCorrect: roundMoney((cost * vatRate) / 100) });
      } else {
        excluded.push({ ...base, exclusion: mv.reasonCode === 'DISASTER_LOSS' ? 'DISASTER' : 'SCRAP_VUK278' });
      }
    }
    // Wastage above the normal rate counts as zayi for VAT.
    const wastage = await this.wastageReport(from, to);
    for (const w of wastage.rows.filter((r) => r.abnormalQuantity > 0)) {
      const p = products.find((x) => x.id === w.productId);
      const vatRate = await rateOf(p);
      corrections.push({ movementId: null, date: to, productId: w.productId, productName: w.productName, reasonCode: 'WASTAGE_ABNORMAL', documentNo: null, quantity: w.abnormalQuantity, costValue: w.abnormalCost, vatRate, vatToCorrect: roundMoney((w.abnormalCost * vatRate) / 100) });
    }
    return {
      period: month,
      from,
      to,
      notice: 'PRE_REPORT',
      noticeText: PRE_REPORT_NOTICE,
      deemedSupplies: deemed,
      vatCorrections: corrections,
      excluded,
      totals: {
        deemedVat: roundMoney(deemed.reduce((s, d) => s + d.vat, 0)),
        correctionVat: roundMoney(corrections.reduce((s, c) => s + c.vatToCorrect, 0)),
      },
    };
  }

  /** Average net sales price (TRY) per product in a month, from issued invoices. */
  async monthlySalesPrices(month: string): Promise<Map<string, number>> {
    const from = `${month}-01`;
    const to = endOfMonth(from);
    const rows: { productId: string; q: string; v: string }[] = await this.dataSource.manager.query(
      'SELECT l.`productId`, SUM(l.`baseQuantity`) AS q, SUM(l.`netAmount` * i.`exchangeRate`) AS v FROM `invoice_lines` l JOIN `invoices` i ON i.`id` = l.`invoiceId` ' +
        "WHERE i.`companyId` = ? AND i.`kind` = 'SALES' AND i.`status` IN (?) AND i.`issueDate` >= ? AND i.`issueDate` <= ? AND l.`productId` IS NOT NULL GROUP BY l.`productId`",
      [this.companyId, LIVE_INVOICE, from, to],
    );
    return new Map(rows.filter((r) => Number(r.q) > 0).map((r) => [r.productId, Number(r.v) / Number(r.q)]));
  }

  /**
   * Fire / zayi report (VUK 186, 278; R50): per product the throughput of the period (opening +
   * receipts), the normal wastage booked (WASTAGE_NORMAL), the tolerated quantity at the product's
   * (else category's) normal rate and the excess (anormal fire), valued at cost.
   */
  async wastageReport(from?: string, to?: string) {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const end = to && isDateKey(to) ? to : dateKeyInZone(new Date(), tz);
    const start = from && isDateKey(from) ? from : `${end.slice(0, 4)}-01-01`;
    const opening = await this.valuation.valuate(addDays(start, -1), 'product', { includeZero: true });
    const flows: { productId: string; reasonCode: string; q: string; v: string }[] = await m.query(
      "SELECT `productId`, `reasonCode`, SUM(`quantity`) AS q, SUM(COALESCE(`totalCost`, 0)) AS v FROM `stock_movements` WHERE `companyId` = ? AND `transactionDate` >= ? AND `transactionDate` < ? AND `type` NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT') GROUP BY `productId`, `reasonCode`",
      [this.companyId, zonedDayStart(start, tz), zonedDayStart(addDays(end, 1), tz)],
    );
    const products = await m.find(ProductEntity, { where: { companyId: this.companyId } });
    const cats = await m.find(CategoryEntity, { where: { companyId: this.companyId } });
    const rows = [];
    for (const p of products) {
      const f = flows.filter((x) => x.productId === p.id);
      const wastage = f.filter((x) => x.reasonCode === 'WASTAGE_NORMAL');
      const losses = f.filter((x) => ['LOSS_ZAYI', 'THEFT_LOSS', 'EXPIRED_DESTROYED', 'DESTRUCTION_IMHA', 'DISASTER_LOSS', 'SCRAP'].includes(x.reasonCode));
      if (!wastage.length && !losses.length) continue;
      const receipts = f.filter((x) => Number(x.q) > 0).reduce((s, x) => s + Number(x.q), 0);
      const open = opening.rows.find((r) => r.productId === p.id)?.quantity || 0;
      const throughput = roundQty(open + receipts);
      const wasted = roundQty(-wastage.reduce((s, x) => s + Number(x.q), 0));
      const wastedCost = roundMoney(-wastage.reduce((s, x) => s + Number(x.v), 0));
      const cat = cats.find((c) => c.id === p.categoryId);
      const ratePct = p.normalWastageRatePct ?? cat?.normalWastageRatePct ?? null;
      const source = p.normalWastageRatePct !== null && p.normalWastageRatePct !== undefined ? p.normalWastageSource || null : cat?.normalWastageSource || null;
      const allowed = ratePct === null ? 0 : roundQty((throughput * Number(ratePct)) / 100);
      const abnormal = roundQty(Math.max(0, wasted - allowed));
      const unit = wasted > 0 ? wastedCost / wasted : 0;
      rows.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        throughput,
        normalRatePct: ratePct === null ? null : Number(ratePct),
        rateSource: ratePct === null ? null : source,
        rateLevel: p.normalWastageRatePct !== null && p.normalWastageRatePct !== undefined ? 'PRODUCT' : ratePct === null ? null : 'CATEGORY',
        wastedQuantity: wasted,
        wastedCost,
        actualRatePct: throughput > 0 ? Math.round((wasted / throughput) * 10000) / 100 : null,
        allowedQuantity: allowed,
        abnormalQuantity: abnormal,
        abnormalCost: roundMoney(abnormal * unit),
        losses: losses.map((x) => ({ reasonCode: x.reasonCode, quantity: roundQty(-Number(x.q)), cost: roundMoney(-Number(x.v)) })),
      });
    }
    return { from: start, to: end, currency: company.baseCurrency, rows };
  }

  /** Printable KDV pre-report (Turkish). */
  async vatReportHtml(period?: string): Promise<string> {
    const r = await this.vatReport(period);
    const company = await this.finance.getCompany();
    const g = (title: string, groups: ReturnType<typeof groupVatLines>) =>
      groups.length
        ? `<h3>${esc(title)}</h3><table><thead><tr><th class="n">Oran</th><th>İstisna</th><th>Tevkifat</th><th class="n">Matrah</th><th class="n">KDV</th><th class="n">Tevkif edilen</th><th class="n">Belge</th></tr></thead><tbody>${groups
            .map((x) => `<tr><td class="n">%${num(x.rate)}</td><td>${esc(x.exemptionCode || '')}</td><td>${esc(x.withholdingCode || '')}${x.withholdingRate ? ` (${esc(x.withholdingRate)})` : ''}</td><td class="n">${money(x.base)}</td><td class="n">${money(x.tax)}</td><td class="n">${money(x.withheld)}</td><td class="n">${x.documents}</td></tr>`)
            .join('')}</tbody></table>`
        : '';
    const docs = (title: string, list: ReturnType<TaxReportService['byDocument']>) =>
      `<h3>${esc(title)}</h3><table><thead><tr><th>Tarih</th><th>Belge no</th><th>VKN / TCKN</th><th>Unvan</th><th class="n">Matrah</th><th class="n">KDV</th></tr></thead><tbody>${
        list.map((d) => `<tr><td>${trDay(d.documentDate)}</td><td>${esc(d.documentNo || '')}</td><td>${esc(d.partyTaxId || '')}</td><td>${esc(d.partyName || '')}</td><td class="n">${money(d.base)}</td><td class="n">${money(d.tax)}</td></tr>`).join('') || '<tr><td colspan="6">Kayıt yok</td></tr>'
      }</tbody></table>`;
    const s = r.summary;
    const body = `<table class="meta"><tr><td>Dönem:</td><td><b>${esc(r.period)}</b></td><td>KDV-1 son gün:</td><td>${trDay(r.kdv1Due)}</td><td>KDV-2 son gün:</td><td>${trDay(r.kdv2Due)}</td></tr></table>
      ${g('Satışlar (hesaplanan KDV)', r.sales.groups)}${g('Alış iadeleri (düzenlenen iade faturaları)', r.purchaseReturns.groups)}${g('Satış iadeleri', r.salesReturns.groups)}
      ${docs('İndirilecek KDV listesi', r.deductible.documents)}${docs('İthalatta ödenen KDV', r.imports.documents)}
      <h3>Özet</h3><table><tbody><tr><td>Hesaplanan KDV (tevkifat düşülmüş)</td><td class="n">${money(s.computedVat)}</td></tr><tr><td>İndirilecek KDV (alış + ithalat + satış iadeleri)</td><td class="n">${money(s.deductibleVat)}</td></tr><tr><td><b>${s.payable >= 0 ? 'Ödenecek KDV (tahmini)' : 'Devreden KDV (tahmini)'}</b></td><td class="n"><b>${money(Math.abs(s.payable))}</b></td></tr></tbody></table>`;
    return legalPage(`KDV Ön Raporu - ${r.period}`, company, body, { notice: PRE_REPORT_NOTICE });
  }
}
