import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity, DEFAULT_COMPANY } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { DistrictEntity, ProvinceEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { DocumentSeriesEntity } from '../../entities/document-series.entity';
import { OrderStatus } from '../../entities/enums';
import { ensureDocumentTriggers } from '../../shared/documents/document-triggers';
import { DEFAULT_SERIES } from '../../shared/documents/default-series';
import { addDays, parseZonedDateTime, tcknCheckDigits, todayKey } from '../../shared/tr';
import { fiscalStatus } from '../company/fiscal';
import { DespatchService } from './despatch.service';
import { InvoiceService } from './invoice.service';
import { ReturnService } from './return.service';
import { GoodsReceiptService } from './goods-receipt.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { DocumentNumberService } from './document-number.service';

const FARMER_TCKN = '284615937' + tcknCheckDigits('284615937').join('');
const DRIVER_TCKN = '345178209' + tcknCheckDigits('345178209').join('');
const DRIVER2_TCKN = '512730846' + tcknCheckDigits('512730846').join('');
const SEED_USER = 'SeedSystem';

/**
 * WP4 safety net and demo data (runs after every module's init):
 *  - document triggers and default series for databases built by schema sync / new companies;
 *  - demo tenant (once, guarded by the farmer supplier's TCKN): sales orders in despatch mode with
 *    approved despatch advices 9 / 6 / 3 / 2 days old (critical / warning / invoiced), invoices
 *    registered from the GİB portal (external numbers), a partial sales return and a distance-sale
 *    withdrawal, a branch transfer in transit, a partial goods receipt with a shortage and no
 *    supplier invoice yet, and an olive-oil purchase from a farmer with a müstahsil makbuzu.
 * Everything goes through the document services (stock via WarehouseStockService).
 */
@Injectable()
export class DocumentsDemoSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('DocumentsDemoSeeder');

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly moduleRef: ModuleRef,
    private readonly despatches: DespatchService,
    private readonly invoices: InvoiceService,
    private readonly returns: ReturnService,
    private readonly receipts: GoodsReceiptService,
    private readonly vouchers: ExpenseVoucherService,
    private readonly numbers: DocumentNumberService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const created = await ensureDocumentTriggers((sql, params) => this.dataSource.query(sql, params));
      if (created.length) this.logger.log(`Created document triggers: ${created.join(', ')}`);
      const companies = await this.dataSource.manager.find(CompanyEntity, { select: ['id'] });
      for (const c of companies) await this.tenant.run(c.id, () => this.numbers.ensureDefaults(this.dataSource.manager, c.id, DEFAULT_SERIES));
      await this.tenant.run(DEFAULT_COMPANY.id, () => this.seedDemo());
      await this.tenant.run(DEFAULT_COMPANY.id, () => this.repairDemo());
    } catch (e) {
      this.logger.warn(`WP4 demo seed skipped: ${(e as Error).message}`);
    }
  }

  /**
   * Demo databases seeded before the WP4 review fixes: the farmer purchase's own despatch advice was
   * left as a draft although the goods moved. Register it with its e-İrsaliye portal number, issued
   * just before the actual despatch.
   */
  private async repairDemo() {
    const m = this.dataSource.manager;
    const companyId = DEFAULT_COMPANY.id;
    const farmer = await m.findOne(SupplierEntity, { where: { companyId, identityNumber: FARMER_TCKN } });
    if (!farmer) return;
    const rows: { id: string; actualDespatchAt: Date | null }[] = await m.query(
      "SELECT d.`id`, d.`actualDespatchAt` FROM `despatches` d JOIN `goods_receipts` g ON g.`ownDespatchId` = d.`id` WHERE d.`companyId` = ? AND d.`status` = 'DRAFT' AND d.`purpose` = 'PURCHASE_PICKUP' AND g.`supplierId` = ? AND g.`createdBy` = ?",
      [companyId, farmer.id, SEED_USER],
    );
    for (const r of rows) {
      if (!r.actualDespatchAt) continue;
      const clock = new Date(new Date(r.actualDespatchAt).getTime() - 15 * 60_000);
      const externalDocNo = `GIB${clock.getUTCFullYear()}000000106`;
      await this.dataSource.transaction((tx) => this.despatches.approveTx(tx, r.id, { externalDocNo }, SEED_USER, [], clock));
      this.logger.log(`Approved demo despatch ${r.id} (farmer pickup)`);
    }
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
    if (!company || company.country !== 'TR' || !fiscalStatus(company).complete) return;
    if (await m.exists(SupplierEntity, { where: { companyId, identityNumber: FARMER_TCKN } })) return;
    const sku = async (s: string) => m.findOne(ProductEntity, { where: { companyId, sku: s, isDeleted: false } });
    const customer = async (name: string) => m.findOne(CustomerEntity, { where: { companyId, name, isDeleted: false } });
    const wh = async (code: string) => m.findOne(WarehouseEntity, { where: { companyId, code, isDeleted: false } });
    const [cable, mouse, hub, stand, cam, oil] = await Promise.all(['KB-NYA25', 'MS-320', 'HB-81', 'LS-ALUM', 'WC-1080', 'GD-ZYTN'].map(sku));
    const [baskent, abc, selin] = await Promise.all(['Başkent Yapı İnşaat Taahhüt Ltd. Şti.', 'ABC Yazılım A.Ş.', 'Selin Aydın'].map(customer));
    const [main, izmir] = await Promise.all(['WH-001', 'WH-003'].map(wh));
    if (!cable || !mouse || !hub || !stand || !cam || !oil || !baskent || !abc || !selin || !main || !izmir) return;
    this.logger.log('Seeding document regime demo data (WP4)...');

    const { OrderService } = await import('../order/order.service');
    const { PurchaseOrderService } = await import('../purchase-order/purchase-order.service');
    const orders = this.moduleRef.get(OrderService, { strict: false });
    const pos = this.moduleRef.get(PurchaseOrderService, { strict: false });

    company.producerReceiptEnabled = true;
    company.stockDeductOn = 'despatch';
    await m.save(CompanyEntity, company);
    // Printed series bought from the licensed printer (matbu): invoice A, despatch A; e-document series for later.
    for (const s of [
      { kind: 'INVOICE', mode: 'EDOCUMENT', seriesCode: 'DMT', note: 'e-Fatura / e-Arşiv serisi (entegratör etkinleşince)' },
      { kind: 'DESPATCH', mode: 'EDOCUMENT', seriesCode: 'DMI', note: 'e-İrsaliye serisi (entegratör etkinleşince)' },
    ]) {
      if (!(await m.exists(DocumentSeriesEntity, { where: { companyId, kind: s.kind, mode: s.mode } }))) {
        await m.save(DocumentSeriesEntity, m.create(DocumentSeriesEntity, { companyId, ...s, isDefault: true, isActive: true }));
      }
    }

    const tz = company.timezone;
    const today = todayKey(tz);
    const at = (daysAgo: number, hhmm: string) => parseZonedDateTime(`${addDays(today, -daysAgo)}T${hhmm}`, tz) as Date;
    const transport = (driver: { firstName: string; lastName: string; tckn: string }, plate: string) => ({
      carrierParty: { name: 'Demo Teknoloji Ürünleri Ticaret A.Ş. (kendi aracı)' },
      drivers: [driver],
      plates: [{ plate, type: 'TRUCK' }],
    });
    // The demo company is an e-İrsaliye user without an integrator (eDocumentMode NONE): its despatch
    // advices are issued on the GİB e-İrsaliye portal and registered here with the portal number.
    let portalNo = 100;
    const eIrsaliyeNo = () => ({ externalDocNo: `GIB${today.slice(0, 4)}${String(++portalNo).padStart(9, '0')}` });
    const ahmet = { firstName: 'Murat', lastName: 'Kılıç', tckn: DRIVER_TCKN };
    const emre = { firstName: 'Serdar', lastName: 'Öztürk', tckn: DRIVER2_TCKN };

    const sale = async (cust: CustomerEntity, items: { product: ProductEntity; quantity: number }[], daysAgo: number, extra: Record<string, unknown> = {}) =>
      orders.createOrder(
        { customerId: cust.id, status: OrderStatus.PENDING, warehouseId: main.id, date: at(daysAgo + 1, '10:15').toISOString(), items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })), ...extra } as any,
        SEED_USER,
      );
    const ship = async (orderId: string, daysAgo: number, driver = ahmet, plate = '34 KLM 482') => {
      const d = await this.dataSource.transaction((tx) => this.despatches.createFromOrderTx(tx, orderId, { sourceWarehouseId: main.id, actualDespatchAt: `${addDays(today, -daysAgo)}T08:30`, ...transport(driver, plate) }, SEED_USER));
      const issue = at(daysAgo, '08:05');
      return this.dataSource.transaction((tx) => this.despatches.approveTx(tx, d.id, eIrsaliyeNo(), SEED_USER, [], issue));
    };

    // A: construction customer, delivered 9 days ago, not invoiced -> critical (VUK 231/5)
    const oA = await sale(baskent, [{ product: cable, quantity: 120 }, { product: mouse, quantity: 4 }], 9);
    await ship(oA.id, 9);
    // B: software company, delivered 6 days ago -> warning
    const oB = await sale(abc, [{ product: hub, quantity: 6 }, { product: stand, quantity: 5 }], 6, { salesChannel: 'B2B' });
    await ship(oB.id, 6, emre, '34 TRV 2051');
    // C: delivered 3 days ago, invoiced on the GİB e-Arşiv portal, one webcam returned as defective
    const oC = await sale(abc, [{ product: cam, quantity: 4 }], 3, { salesChannel: 'B2B' });
    await ship(oC.id, 3);
    const invC = await this.invoices.createFromOrder(oC.id, {}, SEED_USER);
    const issuedC = await this.invoices.issue(invC.id, { externalDocNo: 'GIB2026000000041', externalDocDate: addDays(today, -2), issueDate: addDays(today, -2), issueTime: '16:20' }, SEED_USER);
    const retC = await this.returns.create(
      {
        type: 'DEFECT', invoiceId: issuedC.id, lines: [{ invoiceLineId: issuedC.lines[0].id, quantity: 1, condition: 'DAMAGED' }],
        counterpartyDocNo: 'ABC2026000000012', counterpartyDocDate: today, refundChannel: 'OFFSET', note: 'Görüntü yok; müşteri iade faturası ile geri gönderdi',
      },
      SEED_USER,
    );
    await this.returns.complete(retC.id, {}, SEED_USER);
    // D: web shop sale to a consumer (distance sale), delivered 2 days ago, invoiced, withdrawal notified today
    const oD = await sale(selin, [{ product: mouse, quantity: 2 }], 2, { salesChannel: 'WEB', isDistanceSale: true, channelOrderRef: 'WEB-104582', carrier: 'Yurtiçi Kargo' });
    await ship(oD.id, 2);
    const invD = await this.invoices.createFromOrder(oD.id, { internetSaleInfo: { paymentMethod: 'KREDIKARTI', paymentDate: addDays(today, -3), carrierName: 'Yurtiçi Kargo' } }, SEED_USER);
    const issuedD = await this.invoices.issue(invD.id, { externalDocNo: 'GIB2026000000057', issueDate: addDays(today, -2), issueTime: '09:40' }, SEED_USER);
    const retD = await this.returns.create(
      { type: 'WITHDRAWAL', invoiceId: issuedD.id, lines: [{ invoiceLineId: issuedD.lines[0].id, quantity: 1, condition: 'RESELLABLE' }], refundChannel: 'CARD_REVERSAL', refundRef: 'POS-IADE-778120', note: 'Cayma hakkı: ürün kutusunda iade edildi' },
      SEED_USER,
    );
    await this.returns.complete(retD.id, {}, SEED_USER);

    // E: branch transfer Merkez -> İzmir in transit (despatch advice required: different premises)
    const tr = await this.despatches.create(
      { purpose: 'TRANSFER', sourceWarehouseId: main.id, targetWarehouseId: izmir.id, lines: [{ productId: stand.id, quantity: 12 }], actualDespatchAt: `${addDays(today, -1)}T17:45`, ...transport(emre, '34 TRV 2051'), note: 'İzmir bölge deposu ikmali' },
      SEED_USER,
    );
    await this.dataSource.transaction((tx) => this.despatches.approveTx(tx, tr.id, eIrsaliyeNo(), SEED_USER, [], at(1, '17:30')));

    // F: partial goods receipt with a shortage, supplier invoice not yet received
    const po2006 = await m.findOne(PurchaseOrderEntity, { where: { companyId, poNumber: 'PO-2006' }, relations: { items: true } });
    if (po2006 && po2006.status === 'Sent' && po2006.items[0]) {
      await this.receipts.create(
        po2006.id,
        {
          warehouseId: main.id, receivedAt: `${addDays(today, -4)}T14:10`, supplierDespatchNo: 'AKC2026000000317', supplierDespatchDate: addDays(today, -5),
          lines: [{ purchaseOrderItemId: po2006.items[0].id, despatchQuantity: 12, countedQuantity: 11, rejectedQuantity: 1, rejectReason: 'DAMAGED' }],
          note: 'Bir kutu ezik geldi, iade edildi; irsaliyedeki 12 adetten 11 adet sayıldı.', complete: true,
        },
        SEED_USER,
      );
    }

    // G: olive oil bought from a farmer (not a taxpayer): müstahsil makbuzu, 2 % stopaj
    const farmer = await m.save(SupplierEntity, m.create(SupplierEntity, {
      companyId, name: 'Hüseyin Aydın (Zeytin Üreticisi)', type: 'farmer', identityType: 'TCKN', identityNumber: FARMER_TCKN, isTaxpayer: false, isVatTaxpayer: false, isRealTaxationFarmer: false,
      isForeign: false, contactPerson: 'Hüseyin Aydın', phone: '+90 532 418 27 60', email: null as any,
      address: await this.addr('Küçükköy Mah. Zeytinlik Sok. No:14', '10', 1002, '10400'), rating: 5, leadTimeDays: 2, notes: 'Ayvalık zeytinyağı; gerçek usulde vergilendirilmeyen çiftçi',
    }));
    const poOil = await pos.createPurchaseOrder({ supplierId: farmer.id, warehouseId: main.id, items: [{ productId: oil.id, quantity: 60, unitPrice: 290 }], expectedDate: addDays(today, -1), notes: 'Erken hasat sızma zeytinyağı, 60 L' } as any);
    const freshPo = await m.findOneOrFail(PurchaseOrderEntity, { where: { companyId, id: poOil.id }, relations: { items: true } });
    const gr = await this.receipts.create(
      freshPo.id,
      {
        warehouseId: main.id, receivedAt: `${addDays(today, -1)}T11:00`, buyerCarries: true,
        lines: [{ purchaseOrderItemId: freshPo.items[0].id, countedQuantity: 60, lots: [{ lotNumber: 'L2610-AYV', expiryDate: addDays(today, 540), quantity: 60 }] }],
        note: 'Ürün üreticinin işletmesinden şirket aracıyla alındı.', complete: true,
      },
      SEED_USER,
    );
    const own = await this.receipts.createOwnDespatch(gr.id, { drivers: [ahmet], plates: [{ plate: '34 KLM 482', type: 'TRUCK' }], actualDespatchAt: `${addDays(today, -1)}T07:30` }, SEED_USER);
    // The company's own despatch advice is issued before the goods leave the farm (509 V.5.3).
    await this.dataSource.transaction((tx) => this.despatches.approveTx(tx, own.id, eIrsaliyeNo(), SEED_USER, [], at(1, '07:15')));
    const grDone = await this.receipts.get(gr.id);
    if (grDone.expenseVoucherId) {
      await this.vouchers.update(grDone.expenseVoucherId, { withholdingRate: 2, paymentChannel: 'BANK_TRANSFER', paymentRef: 'EFT-2026-55120' });
      await this.vouchers.issue(grDone.expenseVoucherId, { issueDate: today }, SEED_USER);
    }
    this.logger.log('WP4 demo documents seeded.');
  }
}
