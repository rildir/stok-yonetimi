import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, Like, MoreThan, Not } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { SerialNumberEntity } from '../../entities/serial-number.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { DocumentLineTrackingEntity, LotGenealogyEntity, LotRecallEntity } from '../../entities/inventory-accounting.entity';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { AuditService } from '../integrations/audit.service';
import { addMonths, dateKeyInZone, DEFAULT_TIMEZONE, effectiveExpiryType, generateGtin13, isValidGtin, looksLikeGs1, parseGs1ElementString, restrictedGs1Prefix, roundQty, todayKey } from '../../shared/tr';

export interface TraceQuery {
  productId?: string;
  lotNumber?: string;
  lotId?: string;
  serial?: string;
}

/**
 * Food / lot traceability (Tebliğ 2026/11; Resmi Kontroller Yön. m.39-40; R68, R69, R71):
 *  - one step back / one step forward: suppliers that delivered a lot and customers that
 *    received it (document_line_tracking), lot genealogy, stock by warehouse;
 *  - recall: lots blocked everywhere, customer list frozen on the record, ministry notification
 *    and consumer notice fields, `lot.recalled` webhook; yearly mock recalls;
 *  - quarantine suggestions for expired (STT) / blocked lots still in sellable warehouses;
 *  - GS1: element-string parsing with product / lot resolution, GTIN generation from the company
 *    prefix with the restricted-circulation prefix warning.
 */
@Injectable()
export class TraceabilityService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly legal: LegalParameterService,
    private readonly audit: AuditService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  private async resolve(q: TraceQuery): Promise<{ product: ProductEntity; lotNumber: string | null; serial: string | null }> {
    const m = this.dataSource.manager;
    if (q.lotId) {
      const lot = await m.findOne(StockLotEntity, { where: { companyId: this.companyId, id: q.lotId } });
      if (!lot) throw new NotFoundException(err('LOT_NOT_FOUND', { lot: q.lotId }));
      const product = await m.findOneByOrFail(ProductEntity, { companyId: this.companyId, id: lot.productId });
      return { product, lotNumber: lot.lotNumber, serial: null };
    }
    if (q.serial) {
      const s = await m.findOne(SerialNumberEntity, { where: { companyId: this.companyId, serial: q.serial, ...(q.productId ? { productId: q.productId } : {}) } });
      if (!s) throw new NotFoundException(err('SERIAL_NOT_FOUND', { serial: q.serial }));
      const product = await m.findOneByOrFail(ProductEntity, { companyId: this.companyId, id: s.productId });
      return { product, lotNumber: null, serial: s.serial };
    }
    if (q.lotNumber) {
      const lot = await m.findOne(StockLotEntity, { where: { companyId: this.companyId, lotNumber: q.lotNumber, ...(q.productId ? { productId: q.productId } : {}) } });
      const productId = q.productId || lot?.productId;
      if (!productId) throw new NotFoundException(err('LOT_NOT_FOUND', { lot: q.lotNumber }));
      const product = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: productId } });
      if (!product) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
      return { product, lotNumber: q.lotNumber, serial: null };
    }
    throw new BadRequestException(err('TRACE_QUERY_REQUIRED'));
  }

  /** Customers who received the lot / serial net of their returns. */
  private customers(rows: DocumentLineTrackingEntity[]) {
    const map = new Map<string, { partyId: string | null; partyName: string | null; partyTaxId: string | null; shipped: number; returned: number; documents: { documentType: string | null; documentNo: string | null; documentDate: string | null; quantity: number }[] }>();
    for (const r of rows.filter((x) => x.partyType === 'CUSTOMER')) {
      const key = r.partyId || r.partyTaxId || r.partyName || '-';
      const cur = map.get(key) || { partyId: r.partyId ?? null, partyName: r.partyName ?? null, partyTaxId: r.partyTaxId ?? null, shipped: 0, returned: 0, documents: [] };
      if (r.direction === 'OUT') cur.shipped = roundQty(cur.shipped + Number(r.quantity));
      else cur.returned = roundQty(cur.returned + Number(r.quantity));
      cur.documents.push({ documentType: r.documentType ?? null, documentNo: r.documentNo ?? null, documentDate: r.documentDate ? String(r.documentDate).slice(0, 10) : null, quantity: r.direction === 'OUT' ? Number(r.quantity) : -Number(r.quantity) });
      map.set(key, cur);
    }
    return [...map.values()].map((c) => ({ ...c, net: roundQty(c.shipped - c.returned) })).sort((a, b) => String(a.partyName).localeCompare(String(b.partyName), 'tr'));
  }

  /**
   * Trace rows of a lot / serial: movement rows written since WP6 plus rows normalised from the
   * documents' JSON. A document shipped before WP6 has only its document row; one shipped after
   * has only movement rows - no double counting.
   */
  private async rows(productId: string, lotNumber: string | null, serial: string | null): Promise<DocumentLineTrackingEntity[]> {
    return this.dataSource.manager.find(DocumentLineTrackingEntity, {
      where: { companyId: this.companyId, productId, ...(lotNumber ? { lotNumber } : {}), ...(serial ? { serial } : {}) },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    });
  }

  async trace(q: TraceQuery) {
    const { product, lotNumber, serial } = await this.resolve(q);
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const rows = await this.rows(product.id, lotNumber, serial);
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId } });
    const lots = lotNumber ? await m.find(StockLotEntity, { where: { companyId: this.companyId, productId: product.id, lotNumber } }) : [];
    const parents = lotNumber ? await m.find(LotGenealogyEntity, { where: { companyId: this.companyId, childProductId: product.id, childLotNumber: lotNumber } }) : [];
    const children = lotNumber ? await m.find(LotGenealogyEntity, { where: { companyId: this.companyId, parentProductId: product.id, parentLotNumber: lotNumber } }) : [];
    const expiry = lots.map((l) => (l.expiryDate ? String(l.expiryDate).slice(0, 10) : null)).filter(Boolean).sort()[0] || null;
    const extra = Number(await this.legal.paramOrNull<number>('FOOD_TRACE_RETENTION_EXTRA_MONTHS', todayKey(company.timezone), company.country || 'TR')) || 3;
    const recalls = await m.find(LotRecallEntity, { where: { companyId: this.companyId, productId: product.id } });
    return {
      product: { id: product.id, name: product.name, sku: product.sku, gtin14: product.gtin14 ?? null, regulatoryCategory: product.regulatoryCategory, expiryType: effectiveExpiryType(product) },
      lotNumber,
      serial,
      lots: lots.map((l) => ({
        id: l.id, warehouseId: l.warehouseId, warehouseName: whs.find((w) => w.id === l.warehouseId)?.name ?? null, quantity: Number(l.quantity), expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
        productionDate: l.productionDate ? String(l.productionDate).slice(0, 10) : null, supplierLotNumber: l.supplierLotNumber ?? null, lotSource: l.lotSource ?? null, status: l.status, statusReason: l.statusReason ?? null,
      })),
      inStock: roundQty(lots.reduce((s, l) => s + Number(l.quantity), 0)),
      suppliers: rows.filter((r) => r.partyType === 'SUPPLIER' && r.direction === 'IN').map((r) => ({ partyId: r.partyId, partyName: r.partyName, partyTaxId: r.partyTaxId, documentType: r.documentType, documentNo: r.documentNo, documentDate: r.documentDate ? String(r.documentDate).slice(0, 10) : null, quantity: Number(r.quantity) })),
      customers: this.customers(rows),
      movements: rows.map((r) => ({ direction: r.direction, documentType: r.documentType, documentNo: r.documentNo, documentDate: r.documentDate ? String(r.documentDate).slice(0, 10) : null, partyType: r.partyType, partyName: r.partyName, warehouseName: whs.find((w) => w.id === r.warehouseId)?.name ?? null, quantity: Number(r.quantity), occurredAt: r.occurredAt })),
      genealogy: {
        parents: parents.map((g) => ({ productId: g.parentProductId, lotNumber: g.parentLotNumber, relation: g.relation, quantity: g.quantity })),
        children: children.map((g) => ({ productId: g.childProductId, lotNumber: g.childLotNumber, relation: g.relation, quantity: g.quantity })),
      },
      retainUntil: expiry ? addMonths(expiry, extra) : null,
      recalls: recalls.filter((r) => !lotNumber || (r.lotNumbers || []).includes(lotNumber)),
    };
  }

  /**
   * Lot block / unblock (all warehouses). The lot is named by `lotId` or by productId + lotNumber;
   * both identifiers are required - an empty key would otherwise match every lot of the company.
   */
  async setLotStatus(input: { lotId?: string | null; productId?: string | null; lotNumber?: string | null; status: 'active' | 'blocked'; reason?: string | null }) {
    const { status, reason } = input;
    if (!['active', 'blocked'].includes(status)) throw new BadRequestException(err('LOT_STATUS_INVALID'));
    if (status === 'blocked' && !String(reason || '').trim()) throw new BadRequestException(err('LOT_BLOCK_REASON_REQUIRED'));
    const m = this.dataSource.manager;
    let productId = String(input.productId || '').trim();
    let lotNumber = String(input.lotNumber || '').trim();
    if (input.lotId) {
      const lot = await m.findOne(StockLotEntity, { where: { companyId: this.companyId, id: String(input.lotId) } });
      if (!lot || (productId && lot.productId !== productId) || (lotNumber && lot.lotNumber !== lotNumber)) throw new NotFoundException(err('LOT_NOT_FOUND', { lot: String(input.lotId) }));
      productId = lot.productId;
      lotNumber = lot.lotNumber;
    }
    if (!productId || !lotNumber) throw new BadRequestException(err('TRACE_QUERY_REQUIRED'));
    const lots = await m.find(StockLotEntity, { where: { companyId: this.companyId, productId, lotNumber } });
    if (!lots.length) throw new NotFoundException(err('LOT_NOT_FOUND', { lot: lotNumber }));
    if (status === 'active' && lots.some((l) => l.status === 'recalled')) throw new BadRequestException(err('LOT_RECALLED_CANNOT_UNBLOCK', { lot: lotNumber }));
    for (const l of lots) {
      l.status = status;
      l.statusReason = status === 'blocked' ? String(reason).slice(0, 255) : null;
      await m.save(StockLotEntity, l);
    }
    return lots;
  }

  /** Starts a recall (or a mock recall drill): lots blocked, customers frozen on the record. */
  async recall(input: { productId: string; lotNumbers: string[]; reason: string; isMock?: boolean }, user?: string) {
    const lotNumbers = [...new Set((input.lotNumbers || []).map((l) => String(l || '').trim()).filter(Boolean))];
    if (!lotNumbers.length) throw new BadRequestException(err('RECALL_LOTS_REQUIRED'));
    if (!String(input.reason || '').trim()) throw new BadRequestException(err('RECALL_REASON_REQUIRED'));
    if (!String(input.productId || '').trim()) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
    const m = this.dataSource.manager;
    const product = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: input.productId } });
    if (!product) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    return this.dataSource.transaction(async (tx) => {
      const lots = await tx.find(StockLotEntity, { where: { companyId: this.companyId, productId: product.id, lotNumber: In(lotNumbers) }, lock: { mode: 'pessimistic_write' } });
      const known = new Set(lots.map((l) => l.lotNumber));
      const traced = await tx.find(DocumentLineTrackingEntity, { where: { companyId: this.companyId, productId: product.id, lotNumber: In(lotNumbers) } });
      for (const ln of lotNumbers) if (!known.has(ln) && !traced.some((t) => t.lotNumber === ln)) throw new NotFoundException(err('LOT_NOT_FOUND', { lot: ln }));
      if (!input.isMock) {
        for (const l of lots) {
          l.status = 'recalled';
          l.statusReason = String(input.reason).slice(0, 255);
          await tx.save(StockLotEntity, l);
        }
      }
      const customers = this.customers(traced);
      const year = dateKeyInZone(new Date(), company.timezone || DEFAULT_TIMEZONE).slice(0, 4);
      const count = await tx.count(LotRecallEntity, { where: { companyId: this.companyId, recallNo: Like(`GRC-${year}-%`) } });
      const saved = await tx.save(
        LotRecallEntity,
        tx.create(LotRecallEntity, {
          companyId: this.companyId,
          recallNo: `GRC-${year}-${String(count + 1).padStart(4, '0')}`,
          productId: product.id,
          productName: product.name,
          lotNumbers,
          reason: String(input.reason).trim().slice(0, 500),
          isMock: !!input.isMock,
          status: 'OPEN',
          affectedCustomers: customers as unknown as Record<string, unknown>[],
          quantityShipped: roundQty(customers.reduce((s, c) => s + c.net, 0)),
          quantityInStock: roundQty(lots.reduce((s, l) => s + Number(l.quantity), 0)),
          createdBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
        }),
      );
      return saved;
    });
  }

  listRecalls() {
    return this.dataSource.manager.find(LotRecallEntity, { where: { companyId: this.companyId }, order: { createdAt: 'DESC' } });
  }

  async updateRecall(id: string, input: { ministryNotifiedAt?: string | null; ministryNotificationRef?: string | null; consumerNoticeAt?: string | null; consumerNoticeChannel?: string | null; close?: boolean }) {
    const m = this.dataSource.manager;
    const r = await m.findOne(LotRecallEntity, { where: { companyId: this.companyId, id } });
    if (!r) throw new NotFoundException(err('RECALL_NOT_FOUND'));
    const at = (v: string | null | undefined) => (v ? new Date(v) : null);
    if (input.ministryNotifiedAt !== undefined) r.ministryNotifiedAt = at(input.ministryNotifiedAt);
    if (input.ministryNotificationRef !== undefined) r.ministryNotificationRef = input.ministryNotificationRef ? String(input.ministryNotificationRef).slice(0, 100) : null;
    if (input.consumerNoticeAt !== undefined) r.consumerNoticeAt = at(input.consumerNoticeAt);
    if (input.consumerNoticeChannel !== undefined) r.consumerNoticeChannel = input.consumerNoticeChannel ? String(input.consumerNoticeChannel).slice(0, 255) : null;
    if (input.close) {
      if (!r.isMock && !r.ministryNotifiedAt) throw new BadRequestException(err('RECALL_MINISTRY_NOTICE_REQUIRED'));
      r.status = 'CLOSED';
      r.closedAt = new Date();
    }
    return m.save(LotRecallEntity, r);
  }

  /** Yearly mock recall drill status. */
  async mockRecallStatus() {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const months = Number(await this.legal.paramOrNull<number>('MOCK_RECALL_INTERVAL_MONTHS', todayKey(company.timezone), company.country || 'TR')) || 12;
    const last = await m.findOne(LotRecallEntity, { where: { companyId: this.companyId, isMock: true }, order: { createdAt: 'DESC' } });
    const lastDay = last ? dateKeyInZone(new Date(last.createdAt), company.timezone || DEFAULT_TIMEZONE) : null;
    const due = lastDay ? addMonths(lastDay, months) : null;
    const foodEnabled = (company.enabledComplianceModules || []).includes('food');
    return { intervalMonths: months, lastMockRecall: lastDay, dueBy: due, overdue: foodEnabled && (!due || due < todayKey(company.timezone)), foodEnabled };
  }

  /** Lots that should go to quarantine: expired STT lots and blocked / recalled lots outside a quarantine warehouse. */
  async quarantineSuggestions() {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const today = todayKey(company.timezone);
    const whs = await m.find(WarehouseEntity, { where: { companyId: this.companyId, isDeleted: false } });
    const quarantine = whs.find((w) => w.type === 'QUARANTINE') || null;
    const lots = await m.find(StockLotEntity, { where: { companyId: this.companyId, quantity: MoreThan(0) } });
    const products = await m.find(ProductEntity, { where: { companyId: this.companyId, id: In([...new Set(lots.map((l) => l.productId))].concat(['-'])) } });
    const out = [];
    for (const l of lots) {
      const wh = whs.find((w) => w.id === l.warehouseId);
      if (!wh || wh.type === 'QUARANTINE') continue;
      const p = products.find((x) => x.id === l.productId);
      if (!p) continue;
      const exp = l.expiryDate ? String(l.expiryDate).slice(0, 10) : null;
      const type = effectiveExpiryType(p);
      const expired = !!exp && exp < today;
      const reason = l.status === 'recalled' ? 'RECALLED' : l.status === 'blocked' ? 'BLOCKED' : expired && type === 'use_by' ? 'EXPIRED_USE_BY' : expired && type === 'best_before' ? 'EXPIRED_BEST_BEFORE' : expired ? 'EXPIRED' : null;
      if (!reason) continue;
      out.push({ lotId: l.id, productId: p.id, productName: p.name, sku: p.sku, lotNumber: l.lotNumber, expiryDate: exp, quantity: Number(l.quantity), warehouseId: wh.id, warehouseName: wh.name, reason, status: l.status });
    }
    return { quarantineWarehouseId: quarantine?.id ?? null, quarantineWarehouseName: quarantine?.name ?? null, items: out };
  }

  /** Lot genealogy row (split / merge / repack / process). Only whitelisted fields are stored. */
  async addGenealogy(input: { parentProductId: string; parentLotNumber: string; childProductId: string; childLotNumber: string; relation: string; quantity?: number | null; note?: string | null }, user?: string) {
    if (!['SPLIT', 'MERGE', 'REPACK', 'PROCESS'].includes(String(input?.relation))) throw new BadRequestException(err('GENEALOGY_RELATION_INVALID'));
    const parentProductId = String(input.parentProductId || '').trim();
    const parentLotNumber = String(input.parentLotNumber || '').trim();
    const childProductId = String(input.childProductId || '').trim();
    const childLotNumber = String(input.childLotNumber || '').trim();
    if (!parentProductId || !childProductId) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
    if (!parentLotNumber || !childLotNumber) throw new BadRequestException(err('TRACE_QUERY_REQUIRED'));
    const quantity = input.quantity === null || input.quantity === undefined ? null : roundQty(Number(input.quantity));
    if (quantity !== null && !(quantity > 0)) throw new BadRequestException(err('QUANTITY_INVALID'));
    const m = this.dataSource.manager;
    for (const [pid, ln] of [[parentProductId, parentLotNumber], [childProductId, childLotNumber]]) {
      const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: pid } });
      if (!p) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
      if (!(await m.exists(StockLotEntity, { where: { companyId: this.companyId, productId: pid, lotNumber: ln } }))) throw new NotFoundException(err('LOT_NOT_FOUND', { lot: ln }));
    }
    return m.save(
      LotGenealogyEntity,
      m.create(LotGenealogyEntity, {
        companyId: this.companyId,
        parentProductId,
        parentLotNumber,
        childProductId,
        childLotNumber,
        relation: input.relation,
        quantity,
        note: input.note ? String(input.note).slice(0, 500) : null,
        createdBy: (user || this.tenant.actor.username || null)?.slice(0, 100) ?? null,
      }),
    );
  }

  // ─── GS1 ───

  /** Parses a scanned GS1 element string and resolves the product (GTIN / barcode) and lot. */
  async parseGs1(code: string) {
    const parsed = parseGs1ElementString(code);
    const m = this.dataSource.manager;
    let product: ProductEntity | null = null;
    if (parsed.gtin) {
      const g13 = parsed.gtin.slice(1);
      product = await m.findOne(ProductEntity, { where: [{ companyId: this.companyId, gtin14: parsed.gtin, isDeleted: false }, { companyId: this.companyId, barcode: In([g13, parsed.gtin]), isDeleted: false }] });
    }
    const lot = product && parsed.lot ? await m.findOne(StockLotEntity, { where: { companyId: this.companyId, productId: product.id, lotNumber: parsed.lot, quantity: MoreThan(0) } }) : null;
    return {
      isGs1: looksLikeGs1(code),
      ...parsed,
      restrictedPrefix: restrictedGs1Prefix(parsed.gtin),
      product: product ? { id: product.id, name: product.name, sku: product.sku, trackingType: product.trackingType, hasExpiry: product.hasExpiry } : null,
      lot: lot ? { id: lot.id, warehouseId: lot.warehouseId, quantity: Number(lot.quantity), expiryDate: lot.expiryDate ? String(lot.expiryDate).slice(0, 10) : null, status: lot.status } : null,
    };
  }

  /** Next free GTIN-13 under the company's GS1 prefix (+ the 14-digit form). */
  async nextGtin() {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const prefix = String(company.gs1CompanyPrefix || '').trim();
    if (!/^\d{6,11}$/.test(prefix)) throw new BadRequestException(err('GS1_PREFIX_MISSING'));
    const used = await m.find(ProductEntity, { where: [{ companyId: this.companyId, gtin14: Like(`0${prefix}%`) }, { companyId: this.companyId, barcode: Like(`${prefix}%`) }], select: ['id', 'gtin14', 'barcode'] });
    const refLen = 12 - prefix.length;
    let max = -1;
    for (const p of used) {
      for (const code of [p.gtin14 ? p.gtin14.slice(1) : null, p.barcode]) {
        if (code && code.length === 13 && code.startsWith(prefix)) max = Math.max(max, Number(code.slice(prefix.length, 12)));
      }
    }
    const next = max + 1;
    if (String(next).length > refLen) throw new BadRequestException(err('GS1_PREFIX_EXHAUSTED'));
    const gtin13 = generateGtin13(prefix, next)!;
    return { prefix, itemReference: next, gtin13, gtin14: `0${gtin13}`, restrictedPrefix: restrictedGs1Prefix(gtin13), valid: isValidGtin(gtin13) };
  }

  /** Serial warranty trace (Garanti Belgesi Yön.). */
  async serialTrace(serial: string) {
    const m = this.dataSource.manager;
    const rows = await m.find(SerialNumberEntity, { where: { companyId: this.companyId, serial } });
    if (!rows.length) throw new NotFoundException(err('SERIAL_NOT_FOUND', { serial }));
    const out = [];
    for (const s of rows) {
      const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: s.productId } });
      const start = s.deliveredAt || s.soldAt;
      const months = p?.warrantyMonths ?? null;
      const until = start && months ? addMonths(dateKeyInZone(new Date(start), DEFAULT_TIMEZONE), months) : null;
      out.push({ serial: s.serial, productId: s.productId, productName: p?.name ?? null, status: s.status, soldAt: s.soldAt, deliveredAt: s.deliveredAt, soldOrderId: s.soldOrderId, soldCustomerId: s.soldCustomerId, warrantyMonths: months, warrantyUntil: until });
    }
    return out;
  }

  /** Statuses for the product filter: products with lots under recall / blocked. */
  async blockedLots() {
    return this.dataSource.manager.find(StockLotEntity, { where: { companyId: this.companyId, status: Not('active') } });
  }
}
