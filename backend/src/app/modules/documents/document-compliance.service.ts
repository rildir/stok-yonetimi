import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { DespatchEntity } from '../../entities/despatch.entity';
import { OrderEntity } from '../../entities/order.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { ExpenseVoucherEntity } from '../../entities/expense-voucher.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { OrderStatus } from '../../entities/enums';
import { dateKeyInZone, daysBetween, DeadlineLevel, invoiceDeadlineStatus, roundQty, todayKey } from '../../shared/tr';

export interface UninvoicedRow {
  source: 'DESPATCH' | 'ORDER';
  id: string;
  documentNo: string | null;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string;
  deliveredAt: string;
  deliveryDate: string;
  days: number;
  daysLeft: number;
  level: DeadlineLevel;
  uninvoicedQuantity: number;
}

/**
 * VUK 231/5 and the purchase-side follow-ups: deliveries not invoiced within 7 days (warning from
 * day 5), goods receipts without the supplier invoice, expense vouchers still to be issued. A daily
 * job (09:00 Europe/Istanbul) pushes the counts to each company over WebSocket.
 */
@Injectable()
export class DocumentComplianceService {
  private readonly logger = new Logger(DocumentComplianceService.name);

  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly legalParams: LegalParameterService,
    private readonly gateway: AppGateway,
  ) {}

  private async limits(country: string): Promise<{ limit: number; warn: number }> {
    const get = async (k: string, d: number) => {
      try {
        return Number(await this.legalParams.param<number>(k, todayKey(), country || 'TR')) || d;
      } catch {
        return d;
      }
    };
    return { limit: await get('INVOICE_DEADLINE_DAYS', 7), warn: await get('INVOICE_DEADLINE_WARN_DAYS', 5) };
  }

  async uninvoicedDeliveries(companyId = this.tenant.companyId): Promise<{ limitDays: number; warnDays: number; today: string; rows: UninvoicedRow[] }> {
    const m = this.dataSource.manager;
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: companyId } });
    const tz = company.timezone;
    const today = todayKey(tz);
    const { limit, warn } = await this.limits(company.country);
    const rows: UninvoicedRow[] = [];
    const despatches = await m.find(DespatchEntity, {
      where: { companyId, purpose: 'SALE', status: Not('DRAFT'), invoiceStatus: In(['NONE', 'PARTIAL']) },
      relations: { lines: true },
    });
    for (const d of despatches) {
      const open = roundQty(d.lines.reduce((s, l) => s + Math.max(0, l.quantity - (l.invoicedQuantity || 0) - (l.returnedQuantity || 0)), 0));
      if (open <= 0 || !d.actualDespatchAt) continue;
      const day = dateKeyInZone(new Date(d.actualDespatchAt), tz);
      const st = invoiceDeadlineStatus(day, today, limit, warn);
      rows.push({
        source: 'DESPATCH', id: d.id, documentNo: d.documentNo ?? null, orderId: d.orderId ?? null, orderNumber: d.orderNumber ?? null,
        customerName: d.buyerSnapshot?.name || '-', deliveredAt: new Date(d.actualDespatchAt).toISOString(), deliveryDate: day, ...st, uninvoicedQuantity: open,
      });
    }
    // Orders delivered without a despatch record (legacy 'order' stock mode, completed after WP4).
    const orders = await m.find(OrderEntity, { where: { companyId, status: OrderStatus.COMPLETED, documentsLegacy: false, shippedAt: Not(IsNull()) }, relations: { items: true } });
    const withDespatch = new Set(despatches.map((d) => d.orderId).concat((await m.find(DespatchEntity, { where: { companyId, purpose: 'SALE' }, select: ['id', 'orderId'] })).map((d) => d.orderId)));
    for (const o of orders) {
      if (withDespatch.has(o.id)) continue;
      const open = roundQty(o.items.reduce((s, i) => s + Math.max(0, i.quantity - (i.invoicedQuantity || 0) - (i.returnedQuantity || 0)), 0));
      if (open <= 0) continue;
      const day = dateKeyInZone(new Date(o.shippedAt as Date), tz);
      rows.push({
        source: 'ORDER', id: o.id, documentNo: null, orderId: o.id, orderNumber: o.orderNumber, customerName: o.customerName,
        deliveredAt: new Date(o.shippedAt as Date).toISOString(), deliveryDate: day, ...invoiceDeadlineStatus(day, today, limit, warn), uninvoicedQuantity: open,
      });
    }
    rows.sort((a, b) => a.daysLeft - b.daysLeft);
    return { limitDays: limit, warnDays: warn, today, rows };
  }

  async receiptsWithoutInvoice(companyId = this.tenant.companyId) {
    const m = this.dataSource.manager;
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: companyId } });
    const today = todayKey(company.timezone);
    const rows = await m.find(GoodsReceiptEntity, { where: { companyId, status: 'COMPLETED', supplierInvoiceNo: IsNull() }, order: { receivedAt: 'ASC' } });
    return rows.map((r) => ({
      id: r.id, receiptNo: r.receiptNo, poNumber: r.poNumber, purchaseOrderId: r.purchaseOrderId, supplierName: r.supplierSnapshot?.name || '-',
      receivedAt: r.receivedAt, days: daysBetween(dateKeyInZone(new Date(r.receivedAt), company.timezone), today), acceptedNetAmount: r.acceptedNetAmount, currency: r.currency,
      supplierDespatchNo: r.supplierDespatchNo,
    }));
  }

  async pendingExpenseVouchers(companyId = this.tenant.companyId) {
    const m = this.dataSource.manager;
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: companyId } });
    const today = todayKey(company.timezone);
    const drafts = await m.find(ExpenseVoucherEntity, { where: { companyId, status: 'DRAFT' }, order: { dueDate: 'ASC' } });
    const missing = await m.find(GoodsReceiptEntity, { where: { companyId, status: 'COMPLETED', requiresExpenseVoucher: true, expenseVoucherId: IsNull() } });
    return {
      drafts: drafts.map((v) => ({
        id: v.id, kind: v.kind, sellerName: v.sellerSnapshot?.name || '-', deliveryDate: v.deliveryDate, dueDate: v.dueDate, grossTotal: v.grossTotal,
        daysLeft: v.dueDate ? daysBetween(today, String(v.dueDate)) : null, overdue: !!v.dueDate && String(v.dueDate) < today,
      })),
      receiptsMissingVoucher: missing.map((r) => ({ id: r.id, receiptNo: r.receiptNo, supplierName: r.supplierSnapshot?.name || '-', receivedAt: r.receivedAt })),
    };
  }

  /** Counts for the dashboard card and the daily notification. */
  async summary(companyId = this.tenant.companyId) {
    const u = await this.uninvoicedDeliveries(companyId);
    const receipts = await this.receiptsWithoutInvoice(companyId);
    const vouchers = await this.pendingExpenseVouchers(companyId);
    return {
      uninvoiced: { total: u.rows.length, warning: u.rows.filter((r) => r.level === 'warning').length, critical: u.rows.filter((r) => r.level === 'critical').length, limitDays: u.limitDays },
      receiptsWithoutInvoice: receipts.length,
      pendingExpenseVouchers: vouchers.drafts.length + vouchers.receiptsMissingVoucher.length,
      overdueExpenseVouchers: vouchers.drafts.filter((v) => v.overdue).length,
    };
  }

  /** Daily reminder: uninvoiced deliveries (day 5 warning, day 7 critical) and pending vouchers. */
  @Cron('0 0 9 * * *', { timeZone: 'Europe/Istanbul' })
  async daily(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    const companies = await this.dataSource.manager.find(CompanyEntity, { select: ['id'] });
    for (const c of companies) {
      try {
        const s = await this.tenant.run(c.id, () => this.summary(c.id));
        if (s.uninvoiced.warning || s.uninvoiced.critical || s.pendingExpenseVouchers) {
          this.gateway.emitToCompany(c.id, 'document_deadlines', s);
        }
      } catch (e) {
        this.logger.warn(`document deadline check failed for ${c.id}: ${(e as Error).message}`);
      }
    }
  }
}
