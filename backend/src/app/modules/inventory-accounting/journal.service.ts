import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import {
  AccountMappingEntity,
  FiscalPeriodEntity,
  InventoryValuationAdjustmentEntity,
  JournalExportBatchEntity,
  JournalExportItemEntity,
  LandedCostAllocationEntity,
} from '../../entities/inventory-accounting.entity';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { accountingEvent, AccountRule, buildJournal, DEFAULT_ACCOUNT_RULES, JournalBuildResult, JournalSource, ACCOUNT_NAMES } from '../../shared/inventory/journal';
import { buildCsv, buildXlsx } from '../../shared/inventory/xlsx';
import { ACCOUNTING_EVENTS, addDays, dateKeyInZone, DEFAULT_TIMEZONE, INVENTORY_CLASSES, isDateKey, zonedDayStart } from '../../shared/tr';

const DOC_NAMES: Record<string, string> = {
  DESPATCH: 'Sevk İrsaliyesi',
  GOODS_RECEIPT: 'Mal Kabul Fişi',
  STOCK_COUNT: 'Sayım Tutanağı',
  DESTRUCTION_REPORT: 'İmha Tutanağı',
  INTERNAL_VOUCHER: 'İç Fiş',
  ORDER: 'Sipariş',
  PURCHASE_ORDER: 'Satın Alma Siparişi',
  TRANSFER: 'Transfer Fişi',
  EXPENSE_VOUCHER: 'Gider Pusulası',
  LANDED_COST: 'Maliyet Dağıtım Fişi',
  IMPAIRMENT: 'Değer Düşüklüğü Hesap Cetveli',
  OTHER: 'Diğer',
};

export interface JournalExportContent extends JournalBuildResult {
  exportBatchId: string;
  from: string;
  to: string;
  currency: string;
  generatedAt: string;
}

/**
 * Yevmiye fişi aktarımı (R52): costed stock ledger, landed costs and impairment provisions ->
 * balanced vouchers on the company's account map (THP defaults). Only for companies keeping
 * books on the balance-sheet basis. Idempotent by exportBatchId (the stored content is returned
 * again); every source is exported once, so a period already exported is never exported again.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly legal: LegalParameterService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async mappings() {
    const rows = await this.dataSource.manager.find(AccountMappingEntity, { where: { companyId: this.companyId }, order: { event: 'ASC', createdAt: 'ASC' } });
    return { rows, defaults: DEFAULT_ACCOUNT_RULES, events: ACCOUNTING_EVENTS, inventoryClasses: INVENTORY_CLASSES, accountNames: ACCOUNT_NAMES };
  }

  async saveMapping(input: Partial<AccountMappingEntity> & { id?: string }) {
    if (!(ACCOUNTING_EVENTS as readonly string[]).includes(String(input.event))) throw new BadRequestException(err('ACCOUNT_MAPPING_EVENT_INVALID', { event: String(input.event) }));
    const acc = /^(\{STOCK\}|\{COGS\}|\d{3}(\.[0-9A-Za-z]{1,10}){0,4})$/;
    if (!acc.test(String(input.debitAccount || '')) || !acc.test(String(input.creditAccount || ''))) throw new BadRequestException(err('ACCOUNT_CODE_INVALID'));
    if (input.inventoryClass && !(INVENTORY_CLASSES as readonly string[]).includes(input.inventoryClass)) throw new BadRequestException(err('INVENTORY_CLASS_INVALID'));
    const m = this.dataSource.manager;
    // Scope keys must belong to the tenant.
    if (input.categoryId && !(await m.exists(CategoryEntity, { where: { companyId: this.companyId, id: String(input.categoryId) } }))) throw new BadRequestException(err('PRODUCT_INVALID_CATEGORY', { category: String(input.categoryId) }));
    if (input.warehouseId && !(await m.exists(WarehouseEntity, { where: { companyId: this.companyId, id: String(input.warehouseId) } }))) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    let row = input.id ? await m.findOne(AccountMappingEntity, { where: { companyId: this.companyId, id: input.id } }) : null;
    if (input.id && !row) throw new NotFoundException(err('ACCOUNT_MAPPING_NOT_FOUND'));
    row = row || m.create(AccountMappingEntity, { companyId: this.companyId });
    Object.assign(row, {
      event: input.event,
      inventoryClass: input.inventoryClass || null,
      categoryId: input.categoryId || null,
      warehouseId: input.warehouseId || null,
      debitAccount: String(input.debitAccount),
      creditAccount: String(input.creditAccount),
      enabled: input.enabled !== false,
      description: input.description ? String(input.description).slice(0, 255) : null,
    });
    return m.save(AccountMappingEntity, row);
  }

  async deleteMapping(id: string) {
    const m = this.dataSource.manager;
    const row = await m.findOne(AccountMappingEntity, { where: { companyId: this.companyId, id } });
    if (!row) throw new NotFoundException(err('ACCOUNT_MAPPING_NOT_FOUND'));
    await m.remove(AccountMappingEntity, row);
    return { ok: true };
  }

  private async rules(): Promise<AccountRule[]> {
    const own = await this.dataSource.manager.find(AccountMappingEntity, { where: { companyId: this.companyId } });
    // Company rows win over the THP default of the same event (same specificity).
    const ownGeneric = new Set(own.filter((r) => !r.inventoryClass && !r.categoryId && !r.warehouseId).map((r) => r.event));
    return [...DEFAULT_ACCOUNT_RULES.filter((d) => !ownGeneric.has(d.event)), ...own];
  }

  listBatches() {
    return this.dataSource.manager.find(JournalExportBatchEntity, {
      where: { companyId: this.companyId },
      order: { createdAt: 'DESC' },
      select: ['id', 'exportBatchId', 'fromDate', 'toDate', 'voucherCount', 'sourceCount', 'debitTotal', 'creditTotal', 'contentSha256', 'createdBy', 'createdAt'],
      take: 100,
    });
  }

  /** Builds (or returns the stored) journal export. */
  async export(from: string, to: string, exportBatchId?: string | null, user?: string): Promise<{ content: JournalExportContent; repeated: boolean }> {
    if (!isDateKey(from) || !isDateKey(to) || from > to) throw new BadRequestException(err('REPORT_PERIOD_INVALID'));
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    if (company.bookkeepingType !== 'BILANCO') throw new ForbiddenException(err('JOURNAL_EXPORT_BILANCO_ONLY'));
    const batchId = String(exportBatchId || '').trim().slice(0, 64) || `JRN-${from}-${to}-${randomUUID().slice(0, 8)}`;
    const existing = await m.findOne(JournalExportBatchEntity, { where: { companyId: this.companyId, exportBatchId: batchId } });
    if (existing) {
      if (String(existing.fromDate).slice(0, 10) !== from || String(existing.toDate).slice(0, 10) !== to) throw new ConflictException(err('JOURNAL_BATCH_ID_REUSED', { batch: batchId }));
      return { content: JSON.parse(existing.content), repeated: true };
    }
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const start = zonedDayStart(from, tz);
    const end = zonedDayStart(addDays(to, 1), tz);
    const exported = new Set<string>(
      (await m.query('SELECT CONCAT(`sourceType`, \':\', `sourceId`) AS k FROM `journal_export_items` WHERE `companyId` = ?', [this.companyId])).map((r: { k: string }) => r.k),
    );
    const products = await m.find(ProductEntity, { where: { companyId: this.companyId }, select: ['id', 'inventoryClass', 'categoryId'] });
    const pInfo = (id: string) => products.find((p) => p.id === id);
    const sources: (JournalSource & { sourceType: string; sourceId: string })[] = [];
    const movements = await m
      .createQueryBuilder(StockMovementEntity, 'sm')
      .where('sm.companyId = :c AND sm.transactionDate >= :s AND sm.transactionDate < :e', { c: this.companyId, s: start, e: end })
      .orderBy('sm.transactionDate', 'ASC')
      .addOrderBy('sm.sequenceNo', 'ASC')
      .getMany();
    let alreadyExported = 0;
    for (const mv of movements) {
      const event = accountingEvent({ type: mv.type, reasonCode: mv.reasonCode, quantity: Number(mv.quantity) });
      if (!event) continue;
      if (exported.has(`MOVEMENT:${mv.id}`)) {
        alreadyExported++;
        continue;
      }
      const p = pInfo(mv.productId);
      sources.push({
        sourceType: 'MOVEMENT',
        sourceId: mv.id,
        id: mv.id,
        date: dateKeyInZone(new Date(mv.transactionDate), tz),
        event,
        amount: Number(mv.totalCost || 0),
        inventoryClass: p?.inventoryClass ?? null,
        categoryId: p?.categoryId ?? null,
        warehouseId: mv.warehouseId ?? null,
        documentType: mv.documentType || null,
        documentNo: mv.documentNo || null,
        documentDate: mv.documentDate ? String(mv.documentDate).slice(0, 10) : null,
        description: `${mv.productName} ${Number(mv.quantity)} ${mv.unitCode || ''} (${mv.reasonCode})`.slice(0, 200),
      });
    }
    const landed = await m
      .createQueryBuilder(LandedCostAllocationEntity, 'l')
      .where('l.companyId = :c AND l.allocatedOn >= :f AND l.allocatedOn <= :t', { c: this.companyId, f: from, t: to })
      .getMany();
    for (const l of landed) {
      if (exported.has(`LANDED_COST:${l.id}`)) {
        alreadyExported++;
        continue;
      }
      for (const line of l.lines as Record<string, any>[]) {
        const p = pInfo(line['productId']);
        const common = { sourceType: 'LANDED_COST', sourceId: l.id, date: String(l.allocatedOn).slice(0, 10), inventoryClass: p?.inventoryClass ?? null, categoryId: p?.categoryId ?? null, warehouseId: null, documentType: 'LANDED_COST', documentNo: l.documentNo || l.receiptNo || l.id.slice(0, 8), documentDate: l.documentDate ? String(l.documentDate).slice(0, 10) : String(l.allocatedOn).slice(0, 10) };
        const desc = `${l.costType} ${line['productName'] || ''}`.slice(0, 200);
        if (l.costType === 'ACILIS_MALIYETI') {
          if (Number(line['toInventory'])) sources.push({ ...common, id: `${l.id}:${line['productId']}:o`, event: 'OPENING', amount: Number(line['toInventory']), description: desc });
          continue;
        }
        if (Number(line['toInventory'])) sources.push({ ...common, id: `${l.id}:${line['movementId']}:i`, event: 'LANDED_COST', amount: Number(line['toInventory']), description: desc });
        if (Number(line['toCogs'])) sources.push({ ...common, id: `${l.id}:${line['movementId']}:c`, event: 'LANDED_COST_COGS', amount: Number(line['toCogs']), description: desc });
      }
    }
    const impairments = await m
      .createQueryBuilder(InventoryValuationAdjustmentEntity, 'a')
      .where('a.companyId = :c AND a.status = :s AND a.valuationDate >= :f AND a.valuationDate <= :t AND a.provision > 0', { c: this.companyId, s: 'POSTED', f: from, t: to })
      .getMany();
    for (const a of impairments) {
      if (exported.has(`IMPAIRMENT:${a.id}`)) {
        alreadyExported++;
        continue;
      }
      sources.push({ sourceType: 'IMPAIRMENT', sourceId: a.id, id: a.id, date: String(a.valuationDate).slice(0, 10), event: 'IMPAIRMENT', amount: Number(a.provision), inventoryClass: a.inventoryClass ?? null, categoryId: null, warehouseId: null, documentType: 'IMPAIRMENT', documentNo: `DD-${String(a.valuationDate).slice(0, 10)}`, documentDate: String(a.valuationDate).slice(0, 10), description: `Değer düşüklüğü ${a.productName}`.slice(0, 200) });
    }
    if (!sources.length && alreadyExported) {
      // "Kapalı dönem yeniden aktarılmaz": everything in the range went out in an earlier batch.
      const closed = await m
        .createQueryBuilder(FiscalPeriodEntity, 'p')
        .where('p.companyId = :c AND p.status = :s AND p.startDate <= :f AND p.endDate >= :t', { c: this.companyId, s: 'CLOSED', f: from, t: to })
        .getCount();
      throw new ConflictException(err(closed ? 'JOURNAL_PERIOD_ALREADY_EXPORTED' : 'JOURNAL_NOTHING_TO_EXPORT', { from, to }));
    }
    const edefter = (await this.legal.paramOrNull<Record<string, string>>('EDEFTER_DOCUMENT_TYPES', to, company.country || 'TR')) || {};
    const built = buildJournal(sources, await this.rules(), edefter, DOC_NAMES);
    const content: JournalExportContent = { exportBatchId: batchId, from, to, currency: company.baseCurrency, generatedAt: new Date().toISOString(), ...built };
    const text = JSON.stringify(content);
    await this.dataSource.transaction(async (tx) => {
      const batch = await tx.save(
        JournalExportBatchEntity,
        tx.create(JournalExportBatchEntity, {
          companyId: this.companyId,
          exportBatchId: batchId,
          fromDate: from,
          toDate: to,
          voucherCount: built.vouchers.length,
          sourceCount: sources.length,
          debitTotal: built.debitTotal,
          creditTotal: built.creditTotal,
          contentSha256: createHash('sha256').update(text).digest('hex'),
          content: text,
          createdBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
        }),
      );
      const keys = new Set<string>();
      for (const s of sources) {
        const k = `${s.sourceType}:${s.sourceId}`;
        if (keys.has(k)) continue;
        keys.add(k);
        await tx.insert(JournalExportItemEntity, { companyId: this.companyId, batchId: batch.id, sourceType: s.sourceType, sourceId: s.sourceId });
      }
    });
    return { content, repeated: false };
  }

  /** CSV / XLSX rendering of an export (one line per voucher line). */
  render(content: JournalExportContent, format: 'csv' | 'xlsx', locale: 'tr' | 'en' = 'tr'): { body: Buffer | string; contentType: string; fileName: string } {
    const header = ['Fiş no', 'Tarih', 'Belge türü (e-Defter)', 'Belge açıklaması', 'Belge no', 'Belge tarihi', 'Hesap kodu', 'Hesap adı', 'Borç', 'Alacak', 'Açıklama'];
    const rows: (string | number | null)[][] = [];
    for (const v of content.vouchers) {
      for (const l of v.lines) rows.push([v.voucherNo, v.date, v.eDefterDocumentType, v.eDefterDocumentDescription, v.documentNo, v.documentDate, l.account, l.accountName, l.debit, l.credit, l.description]);
    }
    const name = `yevmiye-${content.from}_${content.to}-${content.exportBatchId}`.replace(/[^\w.-]/g, '_');
    if (format === 'xlsx') {
      return { body: buildXlsx([{ name: 'Yevmiye', rows: [header, ...rows] }]), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${name}.xlsx` };
    }
    return { body: buildCsv([header, ...rows], locale), contentType: 'text/csv; charset=utf-8', fileName: `${name}.csv` };
  }
}
