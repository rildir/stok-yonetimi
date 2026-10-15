import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity, DEFAULT_COMPANY } from '../../entities/company.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { GoodsReceiptEntity } from '../../entities/goods-receipt.entity';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { OrderStatus, StockMovementType } from '../../entities/enums';
import {
  AccountMappingEntity,
  DocumentLineTrackingEntity,
  FiscalPeriodEntity,
  InventoryPeriodBalanceEntity,
  LandedCostAllocationEntity,
  LotRecallEntity,
  ProductPriceHistoryEntity,
} from '../../entities/inventory-accounting.entity';
import { LEGAL_PARAMETER_SEEDS, WP6_PARAMETER_KEYS, WP6R1_PARAMETER_KEYS } from '../../shared/legal/legal-parameter-seeds';
import { ensurePeriodTriggers } from '../../shared/inventory/period-triggers';
import { applyPeriodReopen, ensureFiscalPeriods } from '../../shared/inventory/period-ops';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { addDays, dateKeyInZone, generateGtin13, parseZonedDateTime, tcknCheckDigits, timeKeyInZone, todayKey, vknCheckDigit } from '../../shared/tr';
import { FiscalPeriodService } from './fiscal-period.service';
import { ValuationService } from './valuation.service';
import { CostingService } from './costing.service';
import { TraceabilityService } from './traceability.service';
import { DisposalService } from './disposal.service';

const SEED_USER = 'SeedSystem';
const DRIVER_TCKN = '417305928' + tcknCheckDigits('417305928').join('');
const DAIRY_VKN = `892417305${vknCheckDigit('892417305')}`;
const MARKET_VKN = `613820457${vknCheckDigit('613820457')}`;
const CARRIER_VKN = `071935284${vknCheckDigit('071935284')}`;
const GS1_PREFIX = '8691234';

/**
 * WP6 safety net and demo data (after every module's init):
 *  - period triggers, WP6 legal parameters and fiscal periods for databases built by schema sync /
 *    new companies;
 *  - demo tenant (idempotent steps; done when the company's GIFT_SAMPLE account mapping exists):
 *    a food supplier (Nilüfer / Bursa) and a market chain customer (Ortahisar / Trabzon) with
 *    checksum-valid VKNs; a use-by (STT) dairy product with an older delivery whose lot is now
 *    expired (quarantine suggestion, disposal file) and two goods receipts with production date /
 *    supplier lot; sales of one lot to two customers through despatch advices (traceability /
 *    recall); a landed cost (nakliye) on the farmer olive-oil receipt; price history (discount
 *    reference); wastage rates with their sources and a wastage booking above the rate; a VUK
 *    278/A rate; a mock recall; a custom account mapping; closed periods 2025 and 2026 Q1-Q2.
 * Numbered documents are dated today (their series must stay in date order). Stock always goes
 * through the document services / WarehouseStockService.
 */
@Injectable()
export class InventoryAccountingDemoSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('InventoryAccountingDemoSeeder');

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly moduleRef: ModuleRef,
    private readonly warehouseStock: WarehouseStockService,
    private readonly periods: FiscalPeriodService,
    private readonly costing: CostingService,
    private readonly trace: TraceabilityService,
    private readonly disposals: DisposalService,
    private readonly valuation: ValuationService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const created = await ensurePeriodTriggers((sql, params) => this.dataSource.query(sql, params));
      if (created.length) this.logger.log(`Created period triggers: ${created.join(', ')}`);
      for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP6_PARAMETER_KEYS.includes(x.key) || WP6R1_PARAMETER_KEYS.includes(x.key))) {
        await this.dataSource.query(
          'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'seed'],
        );
      }
      const companies = await this.dataSource.manager.find(CompanyEntity);
      for (const c of companies) {
        const y = Number(todayKey(c.timezone).slice(0, 4));
        await ensureFiscalPeriods(this.dataSource.manager, c, [y - 1, y]);
      }
      await this.tenant.run(DEFAULT_COMPANY.id, () => this.seedDemo());
      await this.tenant.run(DEFAULT_COMPANY.id, () => this.repairDemoClosings());
    } catch (e) {
      this.logger.warn(`WP6 demo seed skipped: ${(e as Error).message}`);
    }
  }

  /**
   * WP6 review fix (one-off, idempotent): the demo periods were first closed while the warehouse /
   * lot breakdown was not yet reconciled to the product level, so their snapshots held more stock
   * than the product-level inventory list. Periods closed by the seed and never reopened whose
   * snapshot differs from a fresh valuation are reopened (reason recorded on the period, reopen
   * counter +1) and closed again in order, which writes a new closing sequence; the old snapshot
   * rows stay (append-only). Skipped when any closing check would fail.
   */
  private async repairDemoClosings() {
    const m = this.dataSource.manager;
    const companyId = DEFAULT_COMPANY.id;
    const closed = await m.find(FiscalPeriodEntity, { where: { companyId, status: 'CLOSED', closedBy: SEED_USER, reopenCount: 0 } });
    if (!closed.length) return;
    let stale = false;
    for (const p of closed) {
      const end = String(p.endDate).slice(0, 10);
      const rows = await m.find(InventoryPeriodBalanceEntity, { where: { companyId, periodId: p.id, closingSeq: 1 } });
      const snapQty = rows.reduce((s, r) => s + Number(r.quantity), 0);
      const snapCost = rows.reduce((s, r) => s + Number(r.totalCost), 0);
      const fresh = await this.valuation.valuate(end, 'lot', { ignoreSnapshot: true });
      if (Math.abs(fresh.totals.quantity - snapQty) > 0.0001 || Math.abs(fresh.totals.costValue - snapCost) > 0.01) {
        stale = true;
        break;
      }
    }
    if (!stale) return;
    for (const p of closed) {
      if ((await this.periods.checks(p.id)).length) {
        this.logger.warn('Demo closing snapshots are stale but a closing check fails; not re-closing.');
        return;
      }
    }
    const order = [...closed].sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)) || (a.periodType === 'QUARTER' ? -1 : 1));
    const reason = 'WP6 gözden geçirme düzeltmesi: kapanış bakiyesi depo / parti kırılımı ürün toplamına uzlaştırılarak yeniden hesaplandı.';
    await this.dataSource.transaction(async (tx) => {
      for (const p of [...order].reverse()) await applyPeriodReopen(tx, companyId, p.id, reason);
    });
    for (const p of order) await this.periods.close(p.id, SEED_USER);
    this.logger.log(`Re-closed ${order.length} demo periods with reconciled closing snapshots.`);
  }

  private async addr(line1: string, provinceCode: string, districtId: number, postalCode: string): Promise<AddressColumns> {
    const m = this.dataSource.manager;
    const p = await m.findOneByOrFail(ProvinceEntity, { code: provinceCode });
    const d = await m.findOneByOrFail(DistrictEntity, { id: districtId });
    return Object.assign(new AddressColumns(), { line1, line2: null, provinceCode: p.code, province: p.name, districtId: d.id, district: d.name, postalCode, country: 'TR', uavtCode: null });
  }

  private async seedDemo() {
    const m = this.dataSource.manager;
    const companyId = DEFAULT_COMPANY.id;
    const company = await m.findOne(CompanyEntity, { where: { id: companyId } });
    if (!company || company.country !== 'TR') return;
    // Done marker: the company's own account mapping is written last.
    if (await m.exists(AccountMappingEntity, { where: { companyId, event: 'GIFT_SAMPLE' } })) return;
    const sku = (s: string) => m.findOne(ProductEntity, { where: { companyId, sku: s, isDeleted: false } });
    const [fistik, oil, headphones] = await Promise.all(['GD-FISTIK', 'GD-ZYTN', 'HP-NC4'].map(sku));
    const main = await m.findOne(WarehouseEntity, { where: { companyId, code: 'WH-001', isDeleted: false } });
    const pcs = await m.findOne(UnitEntity, { where: { companyId, code: 'pcs' } });
    const kdv1 = await m.findOne(TaxRateEntity, { where: { companyId, code: 'KDV1', isDeleted: false } });
    const food = await m.findOne(CategoryEntity, { where: { companyId, slug: 'Food' } });
    const nilufer = await m.findOne(TaxOfficeEntity, { where: { code: '16257' } });
    const hizirbey = await m.findOne(TaxOfficeEntity, { where: { code: '61201' } });
    if (!fistik || !oil || !main || !pcs || !food || !nilufer || !hizirbey) return;
    this.logger.log('Seeding costing / periods / food traceability demo data (WP6)...');

    const { OrderService } = await import('../order/order.service');
    const { PurchaseOrderService } = await import('../purchase-order/purchase-order.service');
    const { GoodsReceiptService } = await import('../documents/goods-receipt.service');
    const { DespatchService } = await import('../documents/despatch.service');
    const orders = this.moduleRef.get(OrderService, { strict: false });
    const pos = this.moduleRef.get(PurchaseOrderService, { strict: false });
    const receipts = this.moduleRef.get(GoodsReceiptService, { strict: false });
    const despatches = this.moduleRef.get(DespatchService, { strict: false });
    const tz = company.timezone;
    const today = todayKey(tz);
    const at = (daysAgo: number, hhmm: string) => parseZonedDateTime(`${addDays(today, -daysAgo)}T${hhmm}`, tz) as Date;
    const hoursAgo = (h: number) => {
      const d = new Date(Date.now() - h * 3600000);
      return { day: dateKeyInZone(d, tz), time: timeKeyInZone(d, tz).slice(0, 5), date: d };
    };

    // Company policies.
    company.gs1CompanyPrefix = GS1_PREFIX;
    company.destructionRatePct = 2.5;
    company.destructionRateValidUntil = `${today.slice(0, 4)}-12-31`;
    company.destructionRateRef = 'Gelir İdaresi Bşk. imha oranı yazısı (demo, 2026/İO-118)';
    company.physicalCountPolicy = 'ANNUAL';
    await m.save(CompanyEntity, company);

    // Wastage rates with their source; food expiry rules; shelf-label data.
    food.normalWastageRatePct = 1;
    food.normalWastageSource = 'Şirket iç politikası: gıda depolama / taşıma firesi (sektör ortalaması)';
    await m.save(CategoryEntity, food);
    Object.assign(fistik, {
      expiryType: 'best_before', expiryPrecision: 'day', originCountry: 'TR', normalWastageRatePct: 1.5,
      normalWastageSource: 'Ayıklama / kavurma firesi - ticaret odası ekspertiz raporu (demo)', labelNetQuantity: 1, labelNetUnit: 'kg', categoryId: food.id,
    });
    Object.assign(oil, {
      expiryType: 'best_before', expiryPrecision: 'month', originCountry: 'TR', normalWastageRatePct: 0.5,
      normalWastageSource: 'Dolum ve tortu firesi - teknik rapor (demo)', labelNetQuantity: 1, labelNetUnit: 'l', categoryId: food.id,
    });
    await m.save(ProductEntity, [fistik, oil]);
    if (headphones) await m.update(ProductEntity, { id: headphones.id }, { warrantyRequired: true, warrantyMonths: 24 });

    // Price history of the olive oil: 420 -> 410 -> 395,50 (discount reference = 410).
    if (!(await m.exists(ProductPriceHistoryEntity, { where: { companyId, productId: oil.id, source: 'PRODUCT_UPDATE' } }))) {
      for (const [daysAgo, price] of [[13, 420], [7, 410], [1, 395.5]] as [number, number][]) {
        await m.insert(ProductPriceHistoryEntity, { companyId, productId: oil.id, price, currency: 'TRY', priceInclTax: null, validFrom: at(daysAgo, '09:00'), source: 'PRODUCT_UPDATE', changedBy: SEED_USER });
      }
    }

    // Food supplier and market customer (checksum-valid VKNs, real districts / tax offices).
    const dairy =
      (await m.findOne(SupplierEntity, { where: { companyId, identityNumber: DAIRY_VKN } })) ||
      (await m.save(
        SupplierEntity,
        m.create(SupplierEntity, {
          companyId, name: 'Uludağ Süt Ürünleri Gıda San. ve Tic. A.Ş.', contactPerson: 'Elif Karaca', email: 'siparis@uludagsut.com.tr', phone: '+90 224 443 52 10',
          type: 'company', identityType: 'VKN', identityNumber: DAIRY_VKN, taxOfficeCode: nilufer.code, taxOfficeName: nilufer.name,
          address: await this.addr('Organize Sanayi Bölgesi Mavi Cad. No:9', '16', 1612, '16140'), isTaxpayer: true, isVatTaxpayer: true, isForeign: false, needsReview: false, leadTimeDays: 1,
          notes: 'İşletme kayıt no: TR-16-K-004518 (demo). Soğuk zincir.',
        } as Partial<SupplierEntity>),
      ));
    const market =
      (await m.findOne(CustomerEntity, { where: { companyId, identityNumber: MARKET_VKN } })) ||
      (await m.save(
        CustomerEntity,
        m.create(CustomerEntity, {
          companyId, name: 'Karadeniz Market Gıda Tic. Ltd. Şti.', type: 'company', email: 'satinalma@karadenizmarket.com.tr', phone: '+90 462 321 44 80',
          identityType: 'VKN', identityNumber: MARKET_VKN, taxOfficeCode: hizirbey.code, taxOfficeName: hizirbey.name, isVatTaxpayer: true, isDesignatedBuyer: false,
          address: await this.addr('Kemerkaya Mah. Kahramanmaraş Cad. No:41', '61', 6113, '61100'), currency: 'TRY', needsReview: false,
        } as Partial<CustomerEntity>),
      ));
    const abc = await m.findOne(CustomerEntity, { where: { companyId, name: 'ABC Yazılım A.Ş.', isDeleted: false } });

    // STT dairy product (lot + expiry mandatory), GTIN from the company prefix.
    const gtin = generateGtin13(GS1_PREFIX, 1)!;
    let yogurt = await sku('GD-YOGURT-1KG');
    if (!yogurt) {
      yogurt = await m.save(
        ProductEntity,
        m.create(ProductEntity, {
          companyId, name: 'Süzme Yoğurt Tam Yağlı 1 kg', sku: 'GD-YOGURT-1KG', category: food.slug, categoryId: food.id, price: 135, currency: 'TRY',
          quantity: 0, availableQuantity: 0, minQuantity: 10, unit: 'pcs', baseUnitId: pcs.id, barcode: gtin, barcodeType: 'EAN13', gtin14: `0${gtin}`,
          trackingType: 'lot', hasExpiry: true, regulatoryCategory: 'food', inventoryClass: 'TICARI_MAL_153', taxRateId: kdv1?.id ?? null,
          expiryType: 'use_by', expiryPrecision: 'day', perishable: true, originCountry: 'TR', labelNetQuantity: 1, labelNetUnit: 'kg', supplierId: dairy.id,
          normalWastageRatePct: 2, normalWastageSource: 'Soğuk zincir kırılma / ambalaj hasarı - üretici teknik şartnamesi (demo)',
        } as Partial<ProductEntity>),
      );
    }
    const yogurtId = yogurt.id;
    if (!(await m.exists(ProductPriceHistoryEntity, { where: { companyId, productId: yogurtId } }))) {
      await m.insert(ProductPriceHistoryEntity, { companyId, productId: yogurtId, price: 135, currency: 'TRY', priceInclTax: null, validFrom: at(30, '08:00'), source: 'PRODUCT_UPDATE', changedBy: SEED_USER });
    }
    const lotExists = (lot: string) => m.exists(StockLotEntity, { where: { companyId, productId: yogurtId, lotNumber: lot } });

    // An older delivery (24 days ago) booked from the supplier's despatch advice; its lot is now past its STT.
    if (!(await lotExists('L2609-UL07'))) {
      await this.dataSource.transaction(async (tx) => {
        await this.warehouseStock.begin(tx, companyId);
        const p = await tx.findOneOrFail(ProductEntity, { where: { companyId, id: yogurtId }, lock: { mode: 'pessimistic_write' } });
        const before = p.quantity;
        const alloc = await this.warehouseStock.receive(tx, p, 8, main.id, {
          lots: [{ lotNumber: 'L2609-UL07', expiryDate: addDays(today, -1), quantity: 8, productionDate: addDays(today, -26), supplierLotNumber: 'UL-07-0921', lotSource: 'PURCHASE' }],
        });
        await this.warehouseStock.recordMovements(tx, p, before, alloc, {
          type: StockMovementType.IN, reasonCode: 'PURCHASE', transactionDate: at(24, '07:40'), documentType: 'DESPATCH', documentNo: 'UST2026IRS000781', documentDate: addDays(today, -24),
          counterpartyTaxId: DAIRY_VKN, referenceType: 'manual', note: 'Uludağ Süt irsaliyesi UST2026IRS000781 (soğuk zincir +4 °C)', performedBy: SEED_USER, unitCost: 62.5,
          party: { type: 'SUPPLIER', id: dairy.id, name: dairy.name, taxId: DAIRY_VKN },
        });
      });
    }

    // Purchase order with two partial goods receipts today (lots with production date / supplier lot).
    let po = await m.findOne(PurchaseOrderEntity, { where: { companyId, supplierId: dairy.id }, relations: { items: true } });
    if (!po) {
      const created = await pos.createPurchaseOrder({ supplierId: dairy.id, warehouseId: main.id, items: [{ productId: yogurtId, quantity: 90, unitPrice: 62.5 }], expectedDate: today, notes: 'Haftalık süt ürünleri siparişi (soğuk zincir)' } as any);
      po = await m.findOneOrFail(PurchaseOrderEntity, { where: { companyId, id: created.id }, relations: { items: true } });
    }
    const poId = po.id;
    const lineId = po.items[0].id;
    const receive = async (h: number, no: string, lot: string, supplierLot: string, qty: number, expiry: string, production: string) => {
      if (await lotExists(lot)) return;
      const t = hoursAgo(h);
      await receipts.create(
        poId,
        {
          warehouseId: main.id, receivedAt: `${t.day}T${t.time}`, supplierDespatchNo: no, supplierDespatchDate: t.day, supplierInvoiceNo: no.replace('IRS', 'FTR'), supplierInvoiceDate: t.day,
          lines: [{ purchaseOrderItemId: lineId, despatchQuantity: qty, countedQuantity: qty, lots: [{ lotNumber: lot, expiryDate: expiry, quantity: qty, productionDate: production, supplierLotNumber: supplierLot }] }],
          note: `Soğuk zincir kontrolü yapıldı (+4 °C). Üretici parti: ${supplierLot}`,
          complete: true,
        },
        SEED_USER,
      );
    };
    await receive(6, 'UST2026IRS000834', 'L2610-UL18', 'UL-18-1005', 40, addDays(today, 3), addDays(today, -10));
    await receive(5, 'UST2026IRS000856', 'L2610-UL42', 'UL-42-1010', 50, addDays(today, 14), addDays(today, -5));

    // Sales of lot L2610-UL18 to two customers (despatch mode: stock leaves on despatch approval).
    const driver = { firstName: 'Kemal', lastName: 'Arslan', tckn: DRIVER_TCKN };
    let portalNo = 700;
    const sell = async (customer: CustomerEntity, qty: number, h: number) => {
      const t = hoursAgo(h);
      const o = await orders.createOrder({ customerId: customer.id, status: OrderStatus.PENDING, warehouseId: main.id, date: new Date(t.date.getTime() - 3600000).toISOString(), items: [{ productId: yogurtId, quantity: qty }] } as any, SEED_USER);
      const d = await this.dataSource.transaction((tx) =>
        despatches.createFromOrderTx(
          tx,
          o.id,
          { sourceWarehouseId: main.id, actualDespatchAt: `${t.day}T${t.time}`, carrierParty: { name: 'Demo Teknoloji Ürünleri Ticaret A.Ş. (kendi aracı)' }, drivers: [driver], plates: [{ plate: '16 SGK 418', type: 'TRUCK' }] } as any,
          SEED_USER,
        ),
      );
      await this.dataSource.transaction((tx) => despatches.approveTx(tx, d.id, { externalDocNo: `GIB${today.slice(0, 4)}${String(++portalNo).padStart(9, '0')}` }, SEED_USER, [], new Date(t.date.getTime() - 600000)));
    };
    if (!(await m.exists(DocumentLineTrackingEntity, { where: { companyId, productId: yogurtId, direction: 'OUT' } }))) {
      await sell(market, 30, 4);
      if (abc) await sell(abc, 6, 3);
    }

    // Landed cost: transport of the farmer olive oil (VUK 262), split by amount.
    const oilReceipt = await m.findOne(GoodsReceiptEntity, { where: { companyId, receiptNo: 'MKB-2026-000002' } });
    if (oilReceipt && oilReceipt.status === 'COMPLETED' && !(await m.exists(LandedCostAllocationEntity, { where: { companyId, goodsReceiptId: oilReceipt.id } }))) {
      await this.costing.addLandedCost(
        {
          goodsReceiptId: oilReceipt.id, costType: 'NAKLIYE', amount: 1250, basis: 'AMOUNT', documentNo: 'ALT2026000000318', documentDate: addDays(today, -1),
          vendorName: 'Anadolu Lojistik Taşımacılık Ltd. Şti.', vendorTaxId: CARRIER_VKN, note: 'Ayvalık - İstanbul frigorifik nakliye',
        },
        SEED_USER,
      );
    }

    // Normal wastage above the tolerated rate (anormal fire -> KDV düzeltmesi): 1,2 kg pistachio.
    if (!(await m.exists(StockMovementEntity, { where: { companyId, documentNo: 'FIRE-2026-014' } }))) {
      await this.dataSource.transaction(async (tx) => {
        await this.warehouseStock.begin(tx, companyId);
        const p = await tx.findOneOrFail(ProductEntity, { where: { companyId, id: fistik.id }, lock: { mode: 'pessimistic_write' } });
        const lot = await tx.findOne(StockLotEntity, { where: { companyId, productId: p.id, lotNumber: 'FST-2610-A', warehouseId: main.id } });
        if (!lot || Number(lot.quantity) < 1.2) return;
        const before = p.quantity;
        const alloc = await this.warehouseStock.issue(tx, p, 1.2, main.id, { lots: [{ lotId: lot.id, quantity: 1.2 }] });
        await this.warehouseStock.recordMovements(tx, p, before, alloc, {
          type: StockMovementType.ADJUSTMENT, reasonCode: 'WASTAGE_NORMAL', transactionDate: at(2, '17:00'), documentType: 'INTERNAL_VOUCHER', documentNo: 'FIRE-2026-014',
          documentDate: addDays(today, -2), referenceType: 'manual', note: 'Ayıklama firesi (kırık / boş kabuk)', performedBy: SEED_USER,
        });
      });
    }

    // Disposal file for the expired STT lot (official supervision).
    const expiredLot = await m.findOne(StockLotEntity, { where: { companyId, productId: yogurtId, lotNumber: 'L2609-UL07' } });
    const hasBatch = (await this.disposals.list()).some((b) => (b.lines as Record<string, unknown>[]).some((l) => l['productId'] === yogurtId));
    if (expiredLot && Number(expiredLot.quantity) > 0 && !hasBatch) {
      const batch = await this.disposals.create(
        { basis: 'RESMI_KURUM', reason: 'Son tüketim tarihi geçmiş süt ürünü (STT); Bursa İl Tarım ve Orman Müdürlüğü gözetiminde imha edilecek', lines: [{ productId: yogurtId, lotId: expiredLot.id, quantity: Number(expiredLot.quantity) }] },
        SEED_USER,
      );
      await this.disposals.transition(batch.id, { status: 'APPLIED', applicationDate: today, applicationRef: 'Bursa İl Tarım ve Orman Md. başvuru 2026/4471 (demo)' }, SEED_USER);
    }

    // Yearly mock recall drill (lots are not blocked).
    if (!(await m.exists(LotRecallEntity, { where: { companyId, isMock: true } }))) {
      const mock = await this.trace.recall({ productId: yogurtId, lotNumbers: ['L2610-UL18'], reason: 'Yıllık geri çağırma tatbikatı (mock recall)', isMock: true }, SEED_USER);
      await this.trace.updateRecall(mock.id, { consumerNoticeAt: new Date().toISOString(), consumerNoticeChannel: 'Tatbikat: web sitesi duyuru taslağı', close: true });
    }

    // Closed periods: 2025 (quarters + year), 2026 Q1-Q2.
    const y = Number(today.slice(0, 4));
    for (const p of [
      { periodType: 'QUARTER', fiscalYear: y - 1, quarter: 1 },
      { periodType: 'QUARTER', fiscalYear: y - 1, quarter: 2 },
      { periodType: 'QUARTER', fiscalYear: y - 1, quarter: 3 },
      { periodType: 'QUARTER', fiscalYear: y - 1, quarter: 4 },
      { periodType: 'YEAR', fiscalYear: y - 1, quarter: 0 },
      { periodType: 'QUARTER', fiscalYear: y, quarter: 1 },
      { periodType: 'QUARTER', fiscalYear: y, quarter: 2 },
    ]) {
      const row = await m.findOne(FiscalPeriodEntity, { where: { companyId, ...p } });
      if (row && row.status === 'OPEN') await this.periods.close(row.id, SEED_USER);
    }

    // Company account map: samples to a sub-account of 760 (also the "done" marker).
    await m.save(AccountMappingEntity, m.create(AccountMappingEntity, { companyId, event: 'GIFT_SAMPLE', debitAccount: '760.01', creditAccount: '{STOCK}', enabled: true, description: 'Numune ve promosyon giderleri' }));
    this.logger.log('WP6 demo data seeded.');
  }
}
