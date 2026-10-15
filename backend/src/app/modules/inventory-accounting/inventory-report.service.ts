import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { StockCountEntity } from '../../entities/stock-count.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { InventoryValuationAdjustmentEntity } from '../../entities/inventory-accounting.entity';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { Breakdown, ValuationService } from './valuation.service';
import { abbreviations, esc, legalPage, money, num, signatureBlock, trDay } from './legal-print';
import { buildXlsx } from '../../shared/inventory/xlsx';
import { roundMoney } from '../../shared/inventory/costing';
import { addDays, addMonths, dateKeyInZone, DEFAULT_TIMEZONE, INVENTORY_CLASS_ACCOUNTS, isDateKey, roundQty, todayKey, zonedDayStart } from '../../shared/tr';

const CLASS_NAMES: Record<string, string> = {
  '150': 'İlk Madde ve Malzeme',
  '151': 'Yarı Mamuller - Üretim',
  '152': 'Mamuller',
  '153': 'Ticari Mallar',
  '157': 'Diğer Stoklar',
  '158': 'Stok Değer Düşüklüğü Karşılığı (-)',
};
const COUNT_TYPE_TR: Record<string, string> = { YEAR_END: 'Yıl sonu sayımı', PERIODIC: 'Dönemsel sayım', CYCLE: 'Devirli (cycle) sayım', SAMPLING: 'Örnekleme sayımı' };

/**
 * Period-end inventory outputs (VUK 185-190; TTK 64/3, 66-67; R49): inventory list at cost as of a
 * date (product / warehouse / lot), stock card with costs, envanter defteri stock summary
 * (150/151/152/153/157 and 158 on its own line), e-Envanter-mappable export, count report
 * (sayım tutanağı) and count roll-forward / roll-back to the inventory date.
 */
@Injectable()
export class InventoryReportService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly valuation: ValuationService,
    private readonly legal: LegalParameterService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  private company(): Promise<CompanyEntity> {
    return this.dataSource.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
  }

  private day(v: string | undefined, company: CompanyEntity): string {
    if (!v) return todayKey(company.timezone);
    if (!isDateKey(v)) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    return v;
  }

  /** Physical count policy status (VUK 186 / 190, TTK 66/3): last full count and when the next one is due. */
  async countPolicyStatus(company?: CompanyEntity) {
    const c = company || (await this.company());
    const years = ((await this.legal.paramOrNull<Record<string, number>>('PHYSICAL_COUNT_MAX_YEARS', todayKey(c.timezone), c.country || 'TR')) || {})[c.physicalCountPolicy || 'ANNUAL'] ?? 1;
    const last = c.lastPhysicalCountDate ? String(c.lastPhysicalCountDate).slice(0, 10) : null;
    const dueBy = last ? addMonths(last, 12 * years) : null;
    const today = todayKey(c.timezone);
    return { policy: c.physicalCountPolicy || 'ANNUAL', maxYears: years, lastPhysicalCountDate: last, dueBy, overdue: !last || (dueBy !== null && dueBy < today) };
  }

  async inventoryList(asOf?: string, breakdown: Breakdown = 'product', warehouseId?: string) {
    const company = await this.company();
    const day = this.day(asOf, company);
    const v = await this.valuation.valuate(day, breakdown);
    const rows = warehouseId ? v.rows.filter((r) => r.warehouseId === warehouseId) : v.rows;
    return {
      ...v,
      rows,
      totals: warehouseId
        ? { quantity: roundQty(rows.reduce((s, r) => s + r.quantity, 0)), costValue: roundMoney(rows.reduce((s, r) => s + r.costValue, 0)), salesValue: roundMoney(rows.reduce((s, r) => s + (r.salesValue || 0), 0)) }
        : v.totals,
      bookkeepingType: company.bookkeepingType ?? null,
      countPolicy: await this.countPolicyStatus(company),
      costMissing: rows.some((r) => r.costMissing),
    };
  }

  /** Printable inventory list (envanter listesi): signature-ready, page X / Y, VKN on top. */
  async inventoryListHtml(asOf?: string, breakdown: Breakdown = 'lot', warehouseId?: string): Promise<string> {
    const company = await this.company();
    const data = await this.inventoryList(asOf, breakdown, warehouseId);
    const groups = new Map<string, typeof data.rows>();
    for (const r of data.rows) groups.set(r.inventoryClass, [...(groups.get(r.inventoryClass) || []), r]);
    let n = 0;
    const body = [...groups.entries()]
      .map(([cls, rows]) => {
        const acc = INVENTORY_CLASS_ACCOUNTS[cls] || '153';
        const sub = roundMoney(rows.reduce((s, r) => s + r.costValue, 0));
        return `<tr class="grp"><td colspan="9">${esc(acc)} ${esc(CLASS_NAMES[acc] || cls)}</td></tr>${rows
          .map(
            (r) =>
              `<tr><td>${++n}</td><td>${esc(r.sku || '')}</td><td>${esc(r.productName)}${r.costMissing ? ' <span class="warn">(maliyet eksik)</span>' : ''}</td><td>${esc(r.warehouseName || '')}</td><td>${esc(r.lotNumber || '')}${r.expiryDate ? ` / ${trDay(r.expiryDate)}` : ''}</td><td>${esc(r.unitCode || '')}</td><td class="n">${num(r.quantity)}</td><td class="n">${num(r.unitCost, 6)}</td><td class="n">${money(r.costValue, data.currency)}</td></tr>`,
          )
          .join('')}<tr class="grp"><td colspan="8">${esc(acc)} ara toplam</td><td class="n">${money(sub, data.currency)}</td></tr>`;
      })
      .join('');
    const html = `<table class="meta"><tr><td>Envanter tarihi:</td><td><b>${trDay(data.asOf)}</b></td><td>Değerleme:</td><td>Maliyet bedeli (VUK 274) - ${esc(methodTr(data.method))}</td></tr>
      <tr><td>Kırılım:</td><td>${breakdown === 'lot' ? 'Ürün / depo / parti' : breakdown === 'warehouse' ? 'Ürün / depo' : 'Ürün'}</td><td>Para birimi:</td><td>${esc(data.currency)}</td></tr></table>
      <table><thead><tr><th>#</th><th>Stok kodu</th><th>Mal adı</th><th>Depo</th><th>Parti / SKT</th><th>Birim</th><th class="n">Miktar</th><th class="n">Birim maliyet</th><th class="n">Tutar</th></tr></thead>
      <tbody>${body || '<tr><td colspan="9">Stok yok</td></tr>'}</tbody>
      <tfoot><tr><td colspan="6">GENEL TOPLAM</td><td class="n">${num(data.totals.quantity)}</td><td></td><td class="n">${money(data.totals.costValue, data.currency)}</td></tr></tfoot></table>
      <p class="muted">Satış fiyatıyla hesaplanan değer yasal stok değeri değildir ve bu listede yer almaz. Sayım ile envanter tarihi arasındaki hareketler ileri / geri hesaplanmıştır.</p>
      ${signatureBlock(['Sayımı yapan', 'Kontrol eden', 'Şirket yetkilisi'])}${abbreviations(['VKN', 'SKT', 'VUK', 'THP'])}`;
    return legalPage(`Envanter Listesi - ${trDay(data.asOf)}`, company, html, { landscape: true });
  }

  /** Stock card at cost (stok föyü): opening, every movement with unit / total cost, running balance. */
  async stockLedger(productId: string, from?: string, to?: string) {
    const company = await this.company();
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const p = await this.dataSource.manager.findOne(ProductEntity, { where: { companyId: this.companyId, id: productId } });
    if (!p) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
    const end = this.day(to, company);
    const start = from && isDateKey(from) ? from : `${end.slice(0, 4)}-01-01`;
    const opening = await this.valuation.valuate(addDays(start, -1), 'product', { includeZero: true, productIds: [p.id] });
    const o = opening.rows[0] || { quantity: 0, costValue: 0 };
    const rows = await this.dataSource.manager
      .createQueryBuilder(StockMovementEntity, 'm')
      .where('m.companyId = :c AND m.productId = :p AND m.transactionDate >= :s AND m.transactionDate < :e', { c: this.companyId, p: p.id, s: zonedDayStart(start, tz), e: zonedDayStart(addDays(end, 1), tz) })
      .orderBy('m.transactionDate', 'ASC')
      .addOrderBy('m.sequenceNo', 'ASC')
      .getMany();
    let qty = o.quantity;
    let value = o.costValue;
    const lines = rows.map((m) => {
      const transfer = ['TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT'].includes(m.type);
      if (!transfer) {
        qty = roundQty(qty + Number(m.quantity));
        value = roundMoney(value + Number(m.totalCost || 0));
      }
      return {
        id: m.id,
        sequenceNo: m.sequenceNo,
        date: dateKeyInZone(new Date(m.transactionDate), tz),
        type: m.type,
        reasonCode: m.reasonCode,
        documentType: m.documentType,
        documentNo: m.documentNo,
        warehouseName: m.warehouseName,
        lotNumber: m.lotNumber,
        quantity: Number(m.quantity),
        unitCost: m.unitCost === null || m.unitCost === undefined ? null : Number(m.unitCost),
        totalCost: m.totalCost === null || m.totalCost === undefined ? null : Number(m.totalCost),
        costSource: m.costSource,
        transfer,
        balanceQuantity: qty,
        balanceValue: value,
      };
    });
    const closing = await this.valuation.valuate(end, 'product', { includeZero: true, productIds: [p.id] });
    return {
      product: { id: p.id, name: p.name, sku: p.sku, unit: p.unit, inventoryClass: p.inventoryClass },
      from: start,
      to: end,
      currency: company.baseCurrency,
      method: closing.method,
      opening: { quantity: o.quantity, costValue: o.costValue },
      lines,
      closing: { quantity: closing.rows[0]?.quantity ?? 0, costValue: closing.rows[0]?.costValue ?? 0 },
    };
  }

  /** Envanter defteri stok icmali: totals per THP stock account; 158 (provision) on its own line. */
  async inventorySummary(asOf?: string) {
    const company = await this.company();
    const day = this.day(asOf, company);
    const v = await this.valuation.valuate(day, 'product');
    const byAcc = new Map<string, { account: string; name: string; quantity: number; costValue: number; products: number }>();
    for (const acc of ['150', '151', '152', '153', '157']) byAcc.set(acc, { account: acc, name: CLASS_NAMES[acc], quantity: 0, costValue: 0, products: 0 });
    for (const r of v.rows) {
      const acc = INVENTORY_CLASS_ACCOUNTS[r.inventoryClass] || '153';
      const row = byAcc.get(acc)!;
      row.quantity = roundQty(row.quantity + r.quantity);
      row.costValue = roundMoney(row.costValue + r.costValue);
      row.products += 1;
    }
    const year = day.slice(0, 4);
    const provisions = await this.dataSource.manager
      .createQueryBuilder(InventoryValuationAdjustmentEntity, 'a')
      .select('COALESCE(SUM(a.provision), 0)', 'p')
      .where('a.companyId = :c AND a.status = :s AND a.valuationDate <= :d AND a.valuationDate >= :y', { c: this.companyId, s: 'POSTED', d: day, y: `${year}-01-01` })
      .getRawOne();
    const provision = roundMoney(Number(provisions?.p || 0));
    const gross = roundMoney([...byAcc.values()].reduce((s, r) => s + r.costValue, 0));
    return {
      asOf: day,
      method: v.method,
      currency: company.baseCurrency,
      bookkeepingType: company.bookkeepingType ?? null,
      applicable: company.bookkeepingType === 'BILANCO',
      rows: [...byAcc.values()],
      provision: { account: '158', name: CLASS_NAMES['158'], amount: provision },
      grossTotal: gross,
      netTotal: roundMoney(gross - provision),
    };
  }

  async inventorySummaryHtml(asOf?: string): Promise<string> {
    const company = await this.company();
    const s = await this.inventorySummary(asOf);
    const rows = s.rows.map((r) => `<tr><td>${esc(r.account)}</td><td>${esc(r.name)}</td><td class="n">${r.products}</td><td class="n">${money(r.costValue, s.currency)}</td></tr>`).join('');
    const body = `<table class="meta"><tr><td>Envanter tarihi:</td><td><b>${trDay(s.asOf)}</b></td><td>Değerleme:</td><td>${esc(methodTr(s.method))}</td></tr></table>
      ${s.applicable ? '' : '<p class="warn">Şirket bilanço esasına göre defter tutmuyor; envanter defteri icmali bilgi amaçlıdır.</p>'}
      <table><thead><tr><th>Hesap</th><th>Hesap adı</th><th class="n">Kalem sayısı</th><th class="n">Tutar</th></tr></thead><tbody>${rows}
      <tr><td>158</td><td>${esc(s.provision.name)}</td><td></td><td class="n">(${money(s.provision.amount, s.currency)})</td></tr></tbody>
      <tfoot><tr><td colspan="3">Stoklar (brüt)</td><td class="n">${money(s.grossTotal, s.currency)}</td></tr><tr><td colspan="3">Stoklar (net, 158 düşülmüş)</td><td class="n">${money(s.netTotal, s.currency)}</td></tr></tfoot></table>
      ${signatureBlock(['Hazırlayan', 'Şirket yetkilisi'])}${abbreviations(['THP', 'VUK', 'VKN'])}`;
    return legalPage(`Envanter Defteri Stok İcmali - ${trDay(s.asOf)}`, company, body);
  }

  /** e-Envanter-mappable export (e-Defter GT No 6): one row per product / lot at cost. */
  async eEnvanterExport(asOf: string | undefined, format: 'json' | 'xlsx') {
    const company = await this.company();
    const day = this.day(asOf, company);
    const v = await this.valuation.valuate(day, 'lot');
    const rows = v.rows.map((r, i) => ({
      siraNo: i + 1,
      hesapKodu: INVENTORY_CLASS_ACCOUNTS[r.inventoryClass] || '153',
      stokKodu: r.sku || '',
      stokAdi: r.productName,
      depo: r.warehouseName || '',
      partiNo: r.lotNumber || '',
      sonKullanmaTarihi: r.expiryDate || '',
      birim: r.unitCode || '',
      miktar: r.quantity,
      birimMaliyet: r.unitCost,
      tutar: r.costValue,
    }));
    const header = {
      vkn: company.taxId || null,
      unvan: company.legalName || company.name,
      envanterTarihi: day,
      degerlemeYontemi: v.method,
      paraBirimi: v.currency,
      toplamTutar: v.totals.costValue,
      not: 'e-Envanter defterine eşlenmek üzere hazırlanmıştır; e-Defter üretimi muhasebe yazılımında yapılır.',
    };
    if (format === 'xlsx') {
      const buf = buildXlsx([
        { name: 'Envanter', rows: [['Sıra', 'Hesap', 'Stok kodu', 'Stok adı', 'Depo', 'Parti', 'SKT', 'Birim', 'Miktar', 'Birim maliyet', 'Tutar'], ...rows.map((r) => [r.siraNo, r.hesapKodu, r.stokKodu, r.stokAdi, r.depo, r.partiNo, r.sonKullanmaTarihi, r.birim, r.miktar, r.birimMaliyet, r.tutar])] },
        { name: 'Bilgi', rows: Object.entries(header).map(([k, val]) => [k, val as string | number | null]) },
      ]);
      return { buffer: buf, fileName: `e-envanter-${day}.xlsx` };
    }
    return { header, rows };
  }

  /**
   * Count roll-forward / roll-back: counted quantity at the count moment moved to the inventory
   * (asOf) date with the movements in between (the count's own adjustments excluded).
   */
  async countRoll(countId: string) {
    const company = await this.company();
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const c = await this.dataSource.manager.findOne(StockCountEntity, { where: { companyId: this.companyId, id: countId } });
    if (!c) throw new NotFoundException(err('STOCK_COUNT_NOT_FOUND'));
    const countDay = c.countDate ? String(c.countDate).slice(0, 10) : dateKeyInZone(new Date(c.completedAt || c.startedAt), tz);
    const asOf = c.asOfDate ? String(c.asOfDate).slice(0, 10) : countDay;
    const countInstant = c.completedAt ? new Date(c.completedAt) : zonedDayStart(addDays(countDay, 1), tz);
    const asOfInstant = zonedDayStart(addDays(asOf, 1), tz);
    const [lo, hi] = countInstant < asOfInstant ? [countInstant, asOfInstant] : [asOfInstant, countInstant];
    const moves: { productId: string; q: string }[] = await this.dataSource.manager.query(
      "SELECT `productId`, SUM(`quantity`) AS q FROM `stock_movements` WHERE `companyId` = ? AND `transactionDate` >= ? AND `transactionDate` < ? AND (`referenceId` IS NULL OR `referenceId` <> ?) AND `type` NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'QUARANTINE_IN', 'QUARANTINE_OUT') GROUP BY `productId`",
      [this.companyId, lo, hi, c.id],
    );
    const direction = countInstant <= asOfInstant ? 'FORWARD' : 'BACKWARD';
    const lines = (c.items || []).map((i) => {
      const between = Number(moves.find((x) => x.productId === i.productId)?.q || 0);
      const asOfQty = direction === 'FORWARD' ? roundQty(i.countedQuantity + between) : roundQty(i.countedQuantity - between);
      return { productId: i.productId, productName: i.productName, sku: i.sku, unit: i.unit, countedQuantity: i.countedQuantity, movementsBetween: roundQty(between), asOfQuantity: asOfQty };
    });
    return { countId: c.id, countNumber: c.countNumber, countDate: countDay, asOfDate: asOf, direction, lines };
  }

  /** Sayım tutanağı (count report) - signature-ready. */
  async countReportHtml(countId: string): Promise<string> {
    const company = await this.company();
    const c = await this.dataSource.manager.findOne(StockCountEntity, { where: { companyId: this.companyId, id: countId } });
    if (!c) throw new NotFoundException(err('STOCK_COUNT_NOT_FOUND'));
    const whs = await this.dataSource.manager.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const whNames = (c.warehouseIds || []).map((id) => whs.find((w) => w.id === id)?.name || id);
    const roll = c.asOfDate && c.countDate && String(c.asOfDate).slice(0, 10) !== String(c.countDate).slice(0, 10) ? await this.countRoll(c.id) : null;
    let n = 0;
    const rows = (c.items || [])
      .map((i) => {
        const lots = (i.lots || []).filter((l) => l.systemQuantity || l.countedQuantity).map((l) => `<div class="muted">Parti ${esc(l.lotNumber)}${l.expiryDate ? ` (SKT ${trDay(l.expiryDate)})` : ''} - ${esc(l.warehouseName || '')}: ${num(l.countedQuantity)}</div>`).join('');
        const missing = (i.serials || []).filter((s) => !s.present).map((s) => s.serial);
        const asOfQty = roll?.lines.find((l) => l.productId === i.productId)?.asOfQuantity;
        return `<tr><td>${++n}</td><td>${esc(i.sku)}</td><td>${esc(i.productName)}${lots}${missing.length ? `<div class="warn">Bulunamayan seri: ${esc(missing.join(', '))}</div>` : ''}</td><td>${esc(i.unit)}</td><td class="n">${num(i.systemQuantity)}</td><td class="n"><b>${num(i.countedQuantity)}</b></td><td class="n">${num(i.difference)}</td>${roll ? `<td class="n">${num(asOfQty)}</td>` : ''}<td class="n">${i.unitCost !== undefined ? num(i.unitCost, 6) : '-'}</td><td class="n">${i.countedValue !== undefined ? money(i.countedValue, company.baseCurrency) : '-'}</td></tr>`;
      })
      .join('');
    const total = roundMoney((c.items || []).reduce((s, i) => s + (Number(i.countedValue) || 0), 0));
    const body = `<table class="meta"><tr><td>Tutanak no:</td><td><b>${esc(c.documentNo || c.countNumber)}</b></td><td>Sayım türü:</td><td>${esc(COUNT_TYPE_TR[c.countType] || c.countType)}</td></tr>
      <tr><td>Sayım tarihi:</td><td>${trDay(c.countDate)}</td><td>Envanter tarihi:</td><td>${trDay(c.asOfDate)}</td></tr>
      <tr><td>Depolar:</td><td>${esc(whNames.join(', ') || 'Tüm depolar')}</td><td>Durum:</td><td>${c.status === 'Completed' ? 'Tamamlandı' : 'Devam ediyor'}</td></tr>
      <tr><td>Sayım ekibi:</td><td>${esc((c.countedBy || []).join(', ') || c.performedBy || '-')}</td><td>Gözetmen:</td><td>${esc(c.supervisedBy || '-')}</td></tr>
      <tr><td>Onaylayan:</td><td>${esc(c.approvedBy || '-')}${c.approvedAt ? ` (${trDay(new Date(c.approvedAt).toISOString())})` : ''}</td><td>Özet (SHA-256):</td><td style="font-size:8px">${esc(c.snapshotHash || '-')}</td></tr></table>
      <table><thead><tr><th>#</th><th>Stok kodu</th><th>Mal adı</th><th>Birim</th><th class="n">Kayıtlı</th><th class="n">Sayılan</th><th class="n">Fark</th>${roll ? '<th class="n">Envanter tarihine göre</th>' : ''}<th class="n">Birim maliyet</th><th class="n">Tutar</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td colspan="${roll ? 9 : 8}">Toplam (maliyet bedeli)</td><td class="n">${money(total, company.baseCurrency)}</td></tr></tfoot></table>
      ${c.notes ? `<p>${esc(c.notes)}</p>` : ''}
      <p class="muted">Sayım farkları 197 Sayım ve Tesellüm Noksanları / 397 Sayım ve Tesellüm Fazlaları hesaplarına alınır; nedeni araştırılır.</p>
      ${signatureBlock(['Sayımı yapan', 'Gözetmen', 'Onaylayan'])}${abbreviations(['SKT', 'VUK', 'VKN'])}`;
    return legalPage(`Sayım Tutanağı - ${c.documentNo || c.countNumber}`, company, body, { landscape: true });
  }
}

export function methodTr(m: string): string {
  return (
    {
      WAVG_MOVING: 'Hareketli ağırlıklı ortalama',
      WAVG_PERIODIC_QUARTERLY: 'Dönemsel ağırlıklı ortalama (çeyreklik)',
      WAVG_PERIODIC_YEARLY: 'Dönemsel ağırlıklı ortalama (yıllık)',
      FIFO: 'İlk giren ilk çıkar (FIFO)',
      SPECIFIC_LOT: 'Parti bazında özel maliyet',
    } as Record<string, string>
  )[m] || m;
}
