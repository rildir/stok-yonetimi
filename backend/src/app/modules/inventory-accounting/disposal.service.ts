import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockMovementType } from '../../entities/enums';
import { DisposalBatchEntity } from '../../entities/inventory-accounting.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { roundMoney } from '../../shared/inventory/costing';
import { addDays, dateKeyInZone, DEFAULT_TIMEZONE, DISPOSAL_BASES, DISPOSAL_TRANSITIONS, isDateKey, parseZonedDateTime, roundQty, zonedDayStart } from '../../shared/tr';
import { esc, legalPage, money, num, signatureBlock, trDay, abbreviations } from './legal-print';

export interface DisposalLineInput {
  productId: string;
  lotId?: string | null;
  warehouseId?: string | null;
  quantity: number;
}

const BASIS_TR: Record<string, string> = {
  TAKDIR_KOMISYONU: 'Takdir komisyonu kararı (VUK 278, 267/3)',
  VUK278A_IMHA_ORANI: 'Maliye Bakanlığınca tayin edilen imha oranı (VUK 278/A)',
  RESMI_KURUM: 'Resmî kurum gözetiminde imha (Tarım ve Orman İl Müdürlüğü vb.)',
};
const STATUS_TR: Record<string, string> = { REQUESTED: 'Talep', APPLIED: 'Başvuru yapıldı', DECIDED: 'Karar alındı', DESTROYED: 'İmha edildi', CANCELLED: 'İptal' };

/**
 * İmha / zayi dosyaları (VUK 278, 278/A; KDVK 30/c; R50): talep -> başvuru -> karar -> imha edildi.
 * Destruction books DISPOSAL movements (DESTRUCTION_IMHA, or DISASTER_LOSS for disasters) at cost
 * through WarehouseStockService; the tutanak is printable. The yearly report compares destroyed
 * quantities under VUK 278/A with the rate assigned to the company.
 */
@Injectable()
export class DisposalService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly warehouseStock: WarehouseStockService,
    private readonly finance: FinanceService,
    private readonly appGateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  list(status?: string) {
    return this.dataSource.manager.find(DisposalBatchEntity, { where: { companyId: this.companyId, ...(status ? { status } : {}) }, order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const b = await this.dataSource.manager.findOne(DisposalBatchEntity, { where: { companyId: this.companyId, id } });
    if (!b) throw new NotFoundException(err('DISPOSAL_NOT_FOUND'));
    return b;
  }

  async create(input: { basis: string; reason: string; disaster?: boolean; warehouseId?: string | null; lines: DisposalLineInput[]; note?: string | null }, user?: string) {
    if (!(DISPOSAL_BASES as readonly string[]).includes(input.basis)) throw new BadRequestException(err('DISPOSAL_BASIS_INVALID', { basis: String(input.basis) }));
    if (!String(input.reason || '').trim()) throw new BadRequestException(err('DISPOSAL_REASON_REQUIRED'));
    if (!input.lines?.length) throw new BadRequestException(err('DISPOSAL_LINES_REQUIRED'));
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const lines: Record<string, unknown>[] = [];
    // Every identifier must be present and belong to the tenant (an undefined key would match any row).
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId, isDeleted: false } });
    const ownWarehouse = (id: string | null | undefined) => !id || whs.some((w) => w.id === id);
    if (!ownWarehouse(input.warehouseId)) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    for (const l of input.lines) {
      const q = roundQty(Number(l.quantity));
      if (!(q > 0)) throw new BadRequestException(err('QUANTITY_INVALID'));
      if (!String(l.productId || '').trim()) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      if (!ownWarehouse(l.warehouseId)) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
      const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: l.productId } });
      if (!p) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      const lot = l.lotId ? await m.findOne(StockLotEntity, { where: { companyId: this.companyId, id: l.lotId, productId: p.id } }) : null;
      if (l.lotId && !lot) throw new BadRequestException(err('LOT_NOT_FOUND', { lot: l.lotId }));
      if (p.trackingType === 'lot' && !lot) throw new BadRequestException(err('LOT_NUMBER_REQUIRED', { name: p.name }));
      const warehouseId = lot?.warehouseId || l.warehouseId || input.warehouseId || null;
      if (!warehouseId) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
      const unit = (await this.warehouseStock.currentUnitCost(m, this.companyId, p.id)) ?? 0;
      const vatRate = await this.finance.taxRateForProduct(p).catch(() => 20);
      lines.push({
        productId: p.id, productName: p.name, sku: p.sku, lotId: lot?.id ?? null, lotNumber: lot?.lotNumber ?? null, expiryDate: lot?.expiryDate ? String(lot.expiryDate).slice(0, 10) : null,
        warehouseId, quantity: q, unitCode: p.unit, unitCost: unit, totalCost: roundMoney(q * unit), vatRate,
      });
    }
    const year = dateKeyInZone(new Date(), company.timezone || DEFAULT_TIMEZONE).slice(0, 4);
    const count = await m.count(DisposalBatchEntity, { where: { companyId: this.companyId, batchNo: Like(`IMH-${year}-%`) } });
    return m.save(
      DisposalBatchEntity,
      m.create(DisposalBatchEntity, {
        companyId: this.companyId,
        batchNo: `IMH-${year}-${String(count + 1).padStart(4, '0')}`,
        basis: input.basis,
        status: 'REQUESTED',
        reason: String(input.reason).trim().slice(0, 500),
        disaster: !!input.disaster,
        warehouseId: input.warehouseId || null,
        lines,
        totalCost: roundMoney(lines.reduce((s, l) => s + Number(l['totalCost']), 0)),
        requestedBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
        note: input.note ? String(input.note).slice(0, 1000) : null,
      }),
    );
  }

  /** Status change; DESTROYED books the disposal movements (one transaction). */
  async transition(
    id: string,
    input: {
      status: string;
      applicationDate?: string | null;
      applicationRef?: string | null;
      decisionDate?: string | null;
      decisionRef?: string | null;
      decisionValue?: number | null;
      destroyedAt?: string | null;
      destructionPlace?: string | null;
      witnesses?: { name: string; title?: string | null }[] | null;
    },
    user?: string,
  ) {
    const touched: string[] = [];
    const saved = await this.dataSource.transaction(async (m) => {
      await this.warehouseStock.begin(m, this.companyId);
      const b = await m.findOne(DisposalBatchEntity, { where: { companyId: this.companyId, id }, lock: { mode: 'pessimistic_write' } });
      if (!b) throw new NotFoundException(err('DISPOSAL_NOT_FOUND'));
      const allowed = DISPOSAL_TRANSITIONS[b.status] || [];
      if (!allowed.includes(input.status)) throw new BadRequestException(err('DISPOSAL_TRANSITION_INVALID', { from: b.status, to: String(input.status) }));
      const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
      const tz = company.timezone || DEFAULT_TIMEZONE;
      const dateOk = (d?: string | null) => !d || isDateKey(d);
      if (!dateOk(input.applicationDate) || !dateOk(input.decisionDate)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
      if (input.status === 'APPLIED') {
        b.applicationDate = input.applicationDate || dateKeyInZone(new Date(), tz);
        b.applicationRef = input.applicationRef ? String(input.applicationRef).slice(0, 100) : b.applicationRef ?? null;
      }
      if (input.status === 'DECIDED') {
        if (!input.decisionRef) throw new BadRequestException(err('DISPOSAL_DECISION_REQUIRED'));
        b.decisionDate = input.decisionDate || dateKeyInZone(new Date(), tz);
        b.decisionRef = String(input.decisionRef).slice(0, 100);
        b.decisionValue = input.decisionValue === undefined || input.decisionValue === null ? null : roundMoney(Number(input.decisionValue));
      }
      if (input.status === 'DESTROYED') {
        const at = input.destroyedAt ? parseZonedDateTime(input.destroyedAt, tz) : new Date();
        if (!at || Number.isNaN(at.getTime())) throw new BadRequestException(err('TRANSACTION_DATE_INVALID'));
        const witnesses = (input.witnesses || []).filter((w) => String(w?.name || '').trim());
        if (!witnesses.length) throw new BadRequestException(err('DISPOSAL_WITNESS_REQUIRED'));
        b.destroyedAt = at;
        b.destructionPlace = input.destructionPlace ? String(input.destructionPlace).slice(0, 255) : null;
        b.witnesses = witnesses.map((w) => ({ name: String(w.name).trim().slice(0, 100), title: w.title ? String(w.title).slice(0, 100) : null }));
        const ids: string[] = [];
        const lines = b.lines as Record<string, any>[];
        for (const l of lines) {
          const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: l['productId'] }, lock: { mode: 'pessimistic_write' } });
          if (!p) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
          const before = p.quantity;
          const allocations = await this.warehouseStock.issue(m, p, Number(l['quantity']), l['warehouseId'], l['lotId'] ? { lots: [{ lotId: l['lotId'], quantity: Number(l['quantity']) }] } : {}, { allowExpired: true, allowBlocked: true });
          const rows = await this.warehouseStock.recordMovements(m, p, before, allocations, {
            type: StockMovementType.DISPOSAL,
            reasonCode: b.disaster ? 'DISASTER_LOSS' : 'DESTRUCTION_IMHA',
            transactionDate: at,
            documentType: 'DESTRUCTION_REPORT',
            documentNo: b.batchNo,
            documentDate: dateKeyInZone(at, tz),
            referenceId: b.id,
            referenceType: 'disposal',
            note: `İmha ${b.batchNo}: ${b.reason}`.slice(0, 255),
            performedBy: user,
          });
          l['unitCost'] = rows.length ? Math.abs(Number(rows[0].unitCost || 0)) : l['unitCost'];
          l['totalCost'] = roundMoney(rows.reduce((s, r) => s + Math.abs(Number(r.totalCost || 0)), 0));
          ids.push(...rows.map((r) => r.id));
          touched.push(p.id);
        }
        b.lines = lines;
        b.totalCost = roundMoney(lines.reduce((s, l) => s + Number(l['totalCost'] || 0), 0));
        b.movementIds = ids;
      }
      b.status = input.status;
      return m.save(DisposalBatchEntity, b);
    });
    for (const pid of [...new Set(touched)]) {
      const p = await this.dataSource.manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: pid } });
      if (p) this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    }
    return saved;
  }

  /**
   * VUK 278/A: destroyed quantity under the assigned rate vs. quantity sold + destroyed in the
   * year, per product; exceeded when above the company's rate (destructionRatePct).
   */
  async yearlyRatioReport(year?: number) {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const y = Number(year) || Number(dateKeyInZone(new Date(), tz).slice(0, 4));
    const start = zonedDayStart(`${y}-01-01`, tz);
    const end = zonedDayStart(addDays(`${y}-12-31`, 1), tz);
    const batches = await m.find(DisposalBatchEntity, { where: { companyId: this.companyId, status: 'DESTROYED', basis: 'VUK278A_IMHA_ORANI' } });
    const inYear = batches.filter((b) => b.destroyedAt && new Date(b.destroyedAt) >= start && new Date(b.destroyedAt) < end);
    const destroyed = new Map<string, { productName: string; quantity: number; cost: number }>();
    for (const b of inYear) {
      for (const l of b.lines as Record<string, any>[]) {
        const cur = destroyed.get(l['productId']) || { productName: l['productName'], quantity: 0, cost: 0 };
        cur.quantity = roundQty(cur.quantity + Number(l['quantity']));
        cur.cost = roundMoney(cur.cost + Number(l['totalCost'] || 0));
        destroyed.set(l['productId'], cur);
      }
    }
    const sold: { productId: string; q: string }[] = await m.query(
      "SELECT `productId`, -SUM(`quantity`) AS q FROM `stock_movements` WHERE `companyId` = ? AND `reasonCode` = 'SALE' AND `transactionDate` >= ? AND `transactionDate` < ? GROUP BY `productId`",
      [this.companyId, start, end],
    );
    const rate = company.destructionRatePct === null || company.destructionRatePct === undefined ? null : Number(company.destructionRatePct);
    const rows = [...destroyed.entries()].map(([productId, d]) => {
      const s = Number(sold.find((x) => x.productId === productId)?.q || 0);
      const ratio = s + d.quantity > 0 ? Math.round((d.quantity / (s + d.quantity)) * 10000) / 100 : 0;
      return { productId, productName: d.productName, destroyedQuantity: d.quantity, destroyedCost: d.cost, soldQuantity: roundQty(s), ratioPct: ratio, exceeded: rate !== null && ratio > rate };
    });
    const totalDestroyed = rows.reduce((s, r) => s + r.destroyedQuantity, 0);
    const totalSold = rows.reduce((s, r) => s + r.soldQuantity, 0);
    const overall = totalDestroyed + totalSold > 0 ? Math.round((totalDestroyed / (totalDestroyed + totalSold)) * 10000) / 100 : 0;
    return {
      year: y,
      assignedRatePct: rate,
      rateValidUntil: company.destructionRateValidUntil ? String(company.destructionRateValidUntil).slice(0, 10) : null,
      rateRef: company.destructionRateRef ?? null,
      rows,
      overallRatioPct: overall,
      exceeded: rate !== null && overall > rate,
      rateExpired: !!company.destructionRateValidUntil && String(company.destructionRateValidUntil).slice(0, 10) < dateKeyInZone(new Date(), tz),
    };
  }

  /** İmha tutanağı (printable). */
  async tutanakHtml(id: string): Promise<string> {
    const b = await this.get(id);
    const company = await this.dataSource.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const whs = await this.dataSource.manager.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const lines = b.lines as Record<string, any>[];
    const rows = lines
      .map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l['sku'] || '')}</td><td>${esc(l['productName'])}</td><td>${esc(whs.find((w) => w.id === l['warehouseId'])?.name || '')}</td><td>${esc(l['lotNumber'] || '')}${l['expiryDate'] ? ` / ${trDay(l['expiryDate'])}` : ''}</td><td class="n">${num(l['quantity'])} ${esc(l['unitCode'] || '')}</td><td class="n">${num(l['unitCost'], 6)}</td><td class="n">${money(l['totalCost'], company.baseCurrency)}</td><td class="n">%${num(l['vatRate'])}</td></tr>`)
      .join('');
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const body = `<table class="meta"><tr><td>Dosya no:</td><td><b>${esc(b.batchNo)}</b></td><td>Durum:</td><td>${esc(STATUS_TR[b.status] || b.status)}</td></tr>
      <tr><td>Dayanak:</td><td colspan="3">${esc(BASIS_TR[b.basis] || b.basis)}${b.disaster ? ' &middot; <b>Afet nedeniyle (KDV indirimi düzeltilmez)</b>' : ''}</td></tr>
      <tr><td>Gerekçe:</td><td colspan="3">${esc(b.reason)}</td></tr>
      <tr><td>Başvuru:</td><td>${trDay(b.applicationDate)} ${esc(b.applicationRef || '')}</td><td>Karar:</td><td>${trDay(b.decisionDate)} ${esc(b.decisionRef || '')}${b.decisionValue !== null && b.decisionValue !== undefined ? ` (takdir edilen değer ${money(b.decisionValue, company.baseCurrency)})` : ''}</td></tr>
      <tr><td>İmha tarihi:</td><td>${b.destroyedAt ? `${trDay(dateKeyInZone(new Date(b.destroyedAt), tz))}` : '-'}</td><td>İmha yeri:</td><td>${esc(b.destructionPlace || '-')}</td></tr></table>
      <table><thead><tr><th>#</th><th>Stok kodu</th><th>Mal adı</th><th>Depo</th><th>Parti / SKT</th><th class="n">Miktar</th><th class="n">Birim maliyet</th><th class="n">Maliyet</th><th class="n">KDV oranı</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="7">Toplam maliyet bedeli</td><td class="n">${money(b.totalCost, company.baseCurrency)}</td><td></td></tr></tfoot></table>
      <p class="muted">Yukarıda dökümü yapılan mallar huzurumuzda imha edilmiştir. ${b.disaster ? '' : 'İmha edilen mallara ait indirilen KDV, KDVK 30/c uyarınca düzeltilir.'}</p>
      ${signatureBlock([...(b.witnesses || []).map((w) => `${w.name}${w.title ? ` (${w.title})` : ''}`), 'Şirket yetkilisi'].slice(0, 4))}${abbreviations(['VUK', 'KDV', 'SKT'])}`;
    return legalPage(`İmha Tutanağı - ${b.batchNo}`, company, body, { landscape: true });
  }
}
