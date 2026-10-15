import { DataSource, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { LegalParameterEntity } from '../../entities/legal-parameter.entity';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { PurchaseOrderStatus, StockMovementType } from '../../entities/enums';
import { WarehouseStockService } from './warehouse-stock.service';
import { pickParameter } from './legal-parameter.service';
import { priceWithWithholdingThreshold } from '../finance/tax';
import { addDays, dateKeyInZone, todayKey, vknCheckDigit, zonedDayStart } from '../tr';

/**
 * WP3 demo data for the demo tenant (runs once: guarded by SKU DC-NERV12). Fictitious parties
 * with checksum-valid VKNs, real provinces / districts / tax offices:
 *  - iron-steel supplier (Aliağa, İzmir) and a received purchase of 5.000 kg rebar priced by
 *    the tax engine (627 demir-çelik 5/10 withholding above the VUK 232 limit);
 *  - rebar product with the default withholding code 627;
 *  - a VAT-registered construction customer (Çankaya, Ankara) for withheld sales;
 *  - a foreign customer (EUR, export 301) and a foreign supplier (EUR, import);
 *  - an exempt product (printed book, KDV0 + exemption 335) with stock.
 * Stock goes through WarehouseStockService (ledger + hash chain).
 */
async function addr(m: EntityManager, line1: string, provinceCode: string, districtId: number, postalCode: string): Promise<AddressColumns> {
  const p = await m.findOneByOrFail(ProvinceEntity, { code: provinceCode });
  const d = await m.findOneByOrFail(DistrictEntity, { id: districtId });
  return Object.assign(new AddressColumns(), {
    line1, line2: null, provinceCode: p.code, province: p.name, districtId: d.id, district: d.name, postalCode, country: 'TR', uavtCode: null,
  });
}

const foreignAddr = (line1: string, country: string): AddressColumns =>
  Object.assign(new AddressColumns(), { line1, line2: null, provinceCode: null, province: null, districtId: null, district: null, postalCode: null, country, uavtCode: null });

export async function seedDemoTaxData(dataSource: DataSource, companyId: string, stock: WarehouseStockService, logger: Logger): Promise<void> {
  const m = dataSource.manager;
  const company = await m.findOne(CompanyEntity, { where: { id: companyId } });
  if (!company || (company.country || '').toUpperCase() !== 'TR') return;
  if (await m.exists(ProductEntity, { where: { companyId, sku: 'DC-NERV12' } })) return;
  if (!(await m.count(ProvinceEntity))) return;
  if (!(await m.exists(TaxOfficeEntity, { where: { code: '35213' } }))) return;
  const kg = await m.findOne(UnitEntity, { where: { companyId, code: 'kg' } });
  const pcs = await m.findOne(UnitEntity, { where: { companyId, code: 'pcs' } });
  const std = await m.findOne(TaxRateEntity, { where: { companyId, code: 'KDV20', isDeleted: false } });
  const exempt = await m.findOne(TaxRateEntity, { where: { companyId, kind: 'EXEMPT', isDeleted: false } });
  if (!kg || !pcs || !std || !exempt) return;
  logger.log('Seeding tax engine demo data (WP3)...');

  const tz = company.timezone;
  const today = todayKey(tz);
  const at = (offset: number, hh: number) => new Date(Math.min(zonedDayStart(addDays(today, offset), tz).getTime() + hh * 3600000, Date.now() - 60000));

  await dataSource.transaction(async (manager) => {
    await stock.begin(manager, companyId);
    for (const [slug, name] of [['Construction', 'Yapı Malzemesi'], ['Books', 'Kitap / Yayın']]) {
      if (!(await manager.exists(CategoryEntity, { where: { companyId, slug } }))) await manager.save(CategoryEntity, manager.create(CategoryEntity, { companyId, name, slug }));
    }

    const aliaga = await manager.findOneByOrFail(TaxOfficeEntity, { code: '35213' });
    const kavaklidere = await manager.findOneByOrFail(TaxOfficeEntity, { code: '06253' });

    const steelSupplier = await manager.save(
      SupplierEntity,
      manager.create(SupplierEntity, {
        companyId,
        name: 'Ege Demir Çelik Sanayi ve Ticaret A.Ş.',
        contactPerson: 'Serkan Aydoğdu',
        email: 'satis@egedemircelik.com.tr',
        phone: '+90 232 616 35 35',
        type: 'company',
        identityType: 'VKN',
        identityNumber: `325840716${vknCheckDigit('325840716')}`,
        taxOfficeCode: aliaga.code,
        taxOfficeName: aliaga.name,
        address: await addr(manager, 'Horozgediği Mah. Demir Çelik Cad. No:18', '35', 3501, '35800'),
        isTaxpayer: true,
        isVatTaxpayer: true,
        isForeign: false,
        needsReview: false,
        leadTimeDays: 5,
      } as Partial<SupplierEntity>),
    );
    await manager.save(
      SupplierEntity,
      manager.create(SupplierEntity, {
        companyId,
        name: 'Rhein Maschinenbau GmbH',
        contactPerson: 'Jonas Becker',
        email: 'export@rhein-maschinenbau.example',
        phone: '+49 221 555 0100',
        type: 'company',
        identityType: 'FOREIGN',
        identityNumber: null,
        address: foreignAddr('Industriestraße 12, 50735 Köln', 'DE'),
        isTaxpayer: false,
        isVatTaxpayer: false,
        isForeign: true,
        needsReview: false,
        leadTimeDays: 21,
      } as Partial<SupplierEntity>),
    );

    await manager.save(
      CustomerEntity,
      manager.create(CustomerEntity, {
        companyId,
        name: 'Başkent Yapı İnşaat Taahhüt Ltd. Şti.',
        type: 'company',
        email: 'satinalma@baskentyapi.com.tr',
        phone: '+90 312 468 06 06',
        identityType: 'VKN',
        identityNumber: `147258036${vknCheckDigit('147258036')}`,
        taxOfficeCode: kavaklidere.code,
        taxOfficeName: kavaklidere.name,
        isVatTaxpayer: true,
        isDesignatedBuyer: false,
        address: await addr(manager, 'Kızılırmak Mah. 1450. Sok. No:7/12', '06', 607, '06510'),
        currency: 'TRY',
        needsReview: false,
      } as Partial<CustomerEntity>),
    );
    await manager.save(
      CustomerEntity,
      manager.create(CustomerEntity, {
        companyId,
        name: 'Hellas Trading S.A.',
        type: 'company',
        email: 'orders@hellastrading.example',
        identityType: 'FOREIGN',
        identityNumber: null,
        nationality: 'GR',
        foreignTaxId: 'EL094123456',
        isVatTaxpayer: false,
        isDesignatedBuyer: false,
        address: foreignAddr('Leof. Kifisias 120, 115 26 Athens', 'GR'),
        currency: 'EUR',
        needsReview: false,
      } as Partial<CustomerEntity>),
    );

    const rebar = await manager.save(
      ProductEntity,
      manager.create(ProductEntity, {
        companyId,
        name: 'İnşaat Demiri Nervürlü Ø12 mm (B420C) — kg',
        sku: 'DC-NERV12',
        category: 'Construction',
        price: 28.5,
        currency: company.baseCurrency,
        minQuantity: 1000,
        unit: 'kg',
        baseUnitId: kg.id,
        quantity: 0,
        status: 'Out of stock',
        isDeleted: false,
        inventoryClass: 'TICARI_MAL_153',
        regulatoryCategory: 'none',
        supplierId: steelSupplier.id,
        taxRateId: std.id,
        withholdingCode: '627',
      } as Partial<ProductEntity>),
    );
    const book = await manager.save(
      ProductEntity,
      manager.create(ProductEntity, {
        companyId,
        name: 'Vergi Mevzuatı El Kitabı 2026 (Basılı)',
        sku: 'KT-VERGI26',
        category: 'Books',
        price: 450,
        currency: company.baseCurrency,
        minQuantity: 5,
        unit: 'pcs',
        baseUnitId: pcs.id,
        quantity: 0,
        status: 'Out of stock',
        isDeleted: false,
        inventoryClass: 'TICARI_MAL_153',
        regulatoryCategory: 'none',
        taxRateId: exempt.id,
        exemptionCode: '335',
      } as Partial<ProductEntity>),
    );

    // Received purchase of 5.000 kg rebar, priced by the engine (627 withholding: total > VUK 232 limit).
    const receivedAt = at(-6, 10);
    const day = dateKeyInZone(receivedAt, tz);
    const limitRow = pickParameter(await manager.find(LegalParameterEntity, { where: { country: 'TR', key: 'VUK232_INVOICE_LIMIT' } }), day);
    const limit = limitRow ? Number(limitRow.value) : null;
    const priced = priceWithWithholdingThreshold(
      {
        lines: [{ quantity: 5000, unitPrice: 24, taxRate: 20, withholdingRate: 50, withholdingCode: '627' }],
        charges: [{ type: 'SHIPPING', amount: 3600, description: 'Aliağa - İstanbul tır nakliyesi' }],
        documentDiscountAmount: 0,
        pricesIncludeTax: company.pricesIncludeTax,
      },
      limit,
    );
    const d = priced.doc;
    const l = d.lines[0];
    const poNumber = 'PO-DC-0001';
    const despatchNo = 'EDC2026000004812';
    const po = await manager.save(
      PurchaseOrderEntity,
      manager.create(PurchaseOrderEntity, {
        companyId,
        poNumber,
        supplierId: steelSupplier.id,
        supplierName: steelSupplier.name,
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'TRY',
        exchangeRate: 1,
        exchangeRateSource: 'BASE',
        exchangeRateDate: null,
        taxPointDate: day,
        subtotal: d.subtotal,
        taxTotal: d.taxTotal,
        grandTotal: d.grandTotal,
        totalAmount: d.grandTotal,
        chargesTotal: d.chargesTotal,
        withheldTaxTotal: d.withheldTaxTotal,
        payableTotal: d.payableTotal,
        taxBreakdown: d.breakdown,
        subtotalTry: d.subtotal,
        taxTotalTry: d.taxTotal,
        grandTotalTry: d.grandTotal,
        invoiceTypeHint: 'TEVKIFAT',
        taxFrozenAt: receivedAt,
        notes: 'Demo: 627 demir-çelik tevkifatlı alım (5/10).',
        items: [
          manager.create(PurchaseOrderItemEntity, {
            productId: rebar.id,
            productName: rebar.name,
            quantity: 5000,
            unitId: kg.id,
            unitCode: 'kg',
            unitFactor: 1,
            unitQuantity: 5000,
            price: l.unitPrice,
            unitPrice: l.unitPrice,
            enteredUnitPrice: 24,
            grossAmount: l.grossAmount,
            netAmount: l.netAmount,
            taxRateId: std.id,
            taxCode: '0015',
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
            withholdingCode: l.withholdingCode,
            withholdingRate: l.withholdingRate || null,
            withheldTaxAmount: l.withheldTaxAmount,
            deductibleVat: l.taxAmount,
            lineTotal: l.lineTotal,
          }),
        ],
        charges: d.charges.map((c) => ({ companyId, type: c.type, description: c.description, enteredAmount: 3600, amount: c.amount, taxAmount: c.taxAmount, withheldTaxAmount: c.withheldTaxAmount, lineTotal: c.lineTotal, allocations: c.allocations })),
      } as Partial<PurchaseOrderEntity>),
    );
    const wh = await stock.defaultWarehouse(manager, companyId);
    po.warehouseId = wh.id;
    await manager.update(PurchaseOrderEntity, { id: po.id }, { warehouseId: wh.id });

    const before = rebar.quantity;
    const alloc = await stock.receive(manager, rebar, 5000, wh.id);
    await stock.recordMovements(manager, rebar, before, alloc, {
      type: StockMovementType.IN,
      reasonCode: 'PURCHASE',
      transactionDate: receivedAt,
      documentType: 'DESPATCH',
      documentNo: despatchNo,
      documentDate: day,
      counterpartyTaxId: steelSupplier.identityNumber,
      referenceId: poNumber,
      referenceType: 'purchase_order',
      note: `Satın alma siparişi teslim alındı: ${poNumber}`,
      performedBy: 'SeedSystem',
    });

    const bookBefore = book.quantity;
    const bookAlloc = await stock.receive(manager, book, 40, wh.id);
    await stock.recordMovements(manager, book, bookBefore, bookAlloc, {
      type: StockMovementType.IN,
      reasonCode: 'OPENING',
      transactionDate: at(-20, 9),
      referenceType: 'manual',
      note: 'Demo açılış stoğu (KDV istisnalı basılı kitap, 335)',
      performedBy: 'SeedSystem',
    });
  });
}
