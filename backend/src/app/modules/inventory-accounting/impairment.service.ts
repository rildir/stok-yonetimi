import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { InventoryValuationAdjustmentEntity } from '../../entities/inventory-accounting.entity';
import { FinanceService } from '../../shared/services/finance.service';
import { evaluateImpairment, shiftMonth } from '../../shared/inventory/impairment';
import { roundMoney } from '../../shared/inventory/costing';
import { endOfMonth, isDateKey, todayKey } from '../../shared/tr';
import { ValuationService } from './valuation.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { esc, legalPage, money, num, signatureBlock, trDay, abbreviations } from './legal-print';

const LIVE_INVOICE = ['ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'];

/**
 * Değeri düşen mallar (VUK 274/2, 267/1; R51): candidates on a valuation day with the emsal
 * value from the sales of M, M-1 or M-2 (25 % rule) and the 10 % decline test; otherwise
 * "takdir komisyonu gerekli". Posted rows form the hesap cetveli (tax value and book value /
 * 158 provision in separate columns).
 */
@Injectable()
export class ImpairmentService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly finance: FinanceService,
    private readonly valuation: ValuationService,
    private readonly periods: FiscalPeriodService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /** Monthly sales (quantity, TRY net amount) of the three months ending with `month`. */
  private async sales(month: string): Promise<Map<string, { month: string; quantity: number; amount: number }[]>> {
    const from = `${shiftMonth(month, -2)}-01`;
    const to = endOfMonth(`${month}-01`);
    const rows: { productId: string; ym: string; q: string; v: string }[] = await this.dataSource.manager.query(
      "SELECT l.`productId`, DATE_FORMAT(i.`issueDate`, '%Y-%m') AS ym, SUM(l.`baseQuantity`) AS q, SUM(l.`netAmount` * i.`exchangeRate`) AS v FROM `invoice_lines` l JOIN `invoices` i ON i.`id` = l.`invoiceId` " +
        "WHERE i.`companyId` = ? AND i.`kind` = 'SALES' AND i.`status` IN (?) AND i.`issueDate` >= ? AND i.`issueDate` <= ? AND l.`productId` IS NOT NULL GROUP BY l.`productId`, ym",
      [this.companyId, LIVE_INVOICE, from, to],
    );
    const out = new Map<string, { month: string; quantity: number; amount: number }[]>();
    for (const r of rows) out.set(r.productId, [...(out.get(r.productId) || []), { month: r.ym, quantity: Number(r.q) || 0, amount: Number(r.v) || 0 }]);
    return out;
  }

  async candidates(valuationDate?: string) {
    const company = await this.dataSource.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const day = valuationDate && isDateKey(valuationDate) ? valuationDate : todayKey(company.timezone);
    const month = day.slice(0, 7);
    const minDecline = Number(await this.finance.param<number>('IMPAIRMENT_MIN_DECLINE_PCT', day).catch(() => 10)) || 10;
    const minSales = Number(await this.finance.param<number>('EMSAL_MIN_MONTHLY_SALES_PCT', day).catch(() => 25)) || 25;
    const v = await this.valuation.valuate(day, 'product');
    const sales = await this.sales(month);
    // Signs of a value decline known from the lots: expired on the valuation day, blocked or recalled.
    const lotSigns: { productId: string; expired: string; blocked: string }[] = await this.dataSource.manager.query(
      "SELECT `productId`, SUM(CASE WHEN `expiryDate` IS NOT NULL AND `expiryDate` < ? THEN 1 ELSE 0 END) AS expired, SUM(CASE WHEN `status` <> 'active' THEN 1 ELSE 0 END) AS blocked " +
        'FROM `stock_lots` WHERE `companyId` = ? AND `quantity` > 0 GROUP BY `productId`',
      [day, this.companyId],
    );
    const indicationOf = (productId: string): string | null => {
      const l = lotSigns.find((x) => x.productId === productId);
      return l && Number(l.expired) > 0 ? 'EXPIRED_LOTS' : l && Number(l.blocked) > 0 ? 'BLOCKED_LOTS' : null;
    };
    const rows = v.rows.map((r) => {
      const res = evaluateImpairment({ quantity: r.quantity, unitCost: r.unitCost, sales: sales.get(r.productId) || [], valuationMonth: month, minDeclinePct: minDecline, minMonthlySalesPct: minSales, indication: indicationOf(r.productId) });
      return { productId: r.productId, productName: r.productName, sku: r.sku, inventoryClass: r.inventoryClass, quantity: r.quantity, unitCost: r.unitCost, ...res };
    });
    return {
      valuationDate: day,
      currency: v.currency,
      thresholds: { minDeclinePct: minDecline, minMonthlySalesPct: minSales },
      rows,
      candidates: rows.filter((r) => r.qualifies).length,
      commission: rows.filter((r) => r.requiresCommission).length,
    };
  }

  /** Posts the selected candidates (hesap cetveli archive). */
  async post(valuationDate: string, productIds: string[], note?: string, user?: string) {
    if (!isDateKey(valuationDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    if (!productIds?.length) throw new BadRequestException(err('IMPAIRMENT_SELECTION_REQUIRED'));
    await this.periods.assertOpen(valuationDate);
    const c = await this.candidates(valuationDate);
    const picked = c.rows.filter((r) => productIds.includes(r.productId));
    const m = this.dataSource.manager;
    await m.delete(InventoryValuationAdjustmentEntity, { companyId: this.companyId, valuationDate, productId: In(picked.map((p) => p.productId)) });
    const saved = [];
    for (const r of picked) {
      saved.push(
        await m.save(
          InventoryValuationAdjustmentEntity,
          m.create(InventoryValuationAdjustmentEntity, {
            companyId: this.companyId,
            valuationDate,
            productId: r.productId,
            productName: r.productName,
            inventoryClass: r.inventoryClass,
            quantity: r.quantity,
            unitCost: r.unitCost,
            costValue: r.costValue,
            emsalUnitPrice: r.emsalUnitPrice,
            emsalMonth: r.emsalMonth,
            emsalBasis: r.emsalBasis,
            monthSalesQty: r.monthSalesQty,
            declinePct: r.declinePct,
            taxValue: r.taxValue,
            bookValue: r.bookValue,
            provision: r.provision,
            requiresCommission: r.requiresCommission,
            status: 'POSTED',
            note: note ? String(note).slice(0, 500) : null,
            createdBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
          }),
        ),
      );
    }
    return { valuationDate, saved: saved.length, provision: roundMoney(saved.reduce((s, r) => s + Number(r.provision), 0)), rows: saved };
  }

  list(valuationDate?: string) {
    return this.dataSource.manager.find(InventoryValuationAdjustmentEntity, {
      where: { companyId: this.companyId, ...(valuationDate ? { valuationDate } : {}) },
      order: { valuationDate: 'DESC', productName: 'ASC' },
      take: 500,
    });
  }

  /** Hesap cetveli (printable). */
  async sheetHtml(valuationDate: string): Promise<string> {
    const company = await this.dataSource.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const rows = await this.list(valuationDate);
    const basisTr: Record<string, string> = { M: 'Değerleme ayı', 'M-1': 'Önceki ay', 'M-2': 'İki önceki ay', TAKDIR: 'Takdir komisyonu gerekli' };
    const body = `<table class="meta"><tr><td>Değerleme günü:</td><td><b>${trDay(valuationDate)}</b></td><td>Dayanak:</td><td>VUK 274/2 (%10 düşüş), 267/1 (ortalama satış fiyatı, aylık satış ≥ %25)</td></tr></table>
      <table><thead><tr><th>#</th><th>Mal</th><th class="n">Miktar</th><th class="n">Birim maliyet</th><th class="n">Maliyet bedeli</th><th>Emsal dayanağı</th><th class="n">Emsal birim fiyat</th><th class="n">Ay satışı</th><th class="n">Düşüş %</th><th class="n">Vergi değeri</th><th class="n">Muhasebe değeri</th><th class="n">158 karşılık</th></tr></thead><tbody>${rows
        .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.productName)}</td><td class="n">${num(r.quantity)}</td><td class="n">${num(r.unitCost, 6)}</td><td class="n">${money(r.costValue, company.baseCurrency)}</td><td>${esc(basisTr[r.emsalBasis] || r.emsalBasis)}${r.emsalMonth ? ` (${esc(r.emsalMonth)})` : ''}</td><td class="n">${r.emsalUnitPrice !== null && r.emsalUnitPrice !== undefined ? num(r.emsalUnitPrice, 6) : '-'}</td><td class="n">${r.monthSalesQty !== null && r.monthSalesQty !== undefined ? num(r.monthSalesQty) : '-'}</td><td class="n">${r.declinePct !== null && r.declinePct !== undefined ? num(r.declinePct, 2) : '-'}</td><td class="n">${money(r.taxValue, company.baseCurrency)}</td><td class="n">${money(r.bookValue, company.baseCurrency)}</td><td class="n">${money(r.provision, company.baseCurrency)}</td></tr>`)
        .join('') || '<tr><td colspan="12">Kayıt yok</td></tr>'}</tbody>
      <tfoot><tr><td colspan="9">Toplam</td><td class="n">${money(rows.reduce((s, r) => s + Number(r.taxValue), 0), company.baseCurrency)}</td><td class="n">${money(rows.reduce((s, r) => s + Number(r.bookValue), 0), company.baseCurrency)}</td><td class="n">${money(rows.reduce((s, r) => s + Number(r.provision), 0), company.baseCurrency)}</td></tr></tfoot></table>
      <p class="muted">Vergi değeri VUK hükümlerine, muhasebe değeri TMS 2 / BOBİ net gerçekleşebilir değerine göredir; aradaki fark 158 Stok Değer Düşüklüğü Karşılığı hesabında izlenir. Emsal bedeli belirlenemeyen mallar için takdir komisyonuna başvurulur.</p>
      ${signatureBlock(['Hazırlayan', 'Mali müşavir', 'Şirket yetkilisi'])}${abbreviations(['VUK', 'THP'])}`;
    return legalPage(`Değeri Düşen Mallar Hesap Cetveli - ${trDay(valuationDate)}`, company, body, { landscape: true });
  }
}
