import { DataSource, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';
import { CompanyEntity } from '../../entities/company.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { StockMovementType } from '../../entities/enums';
import { TrackingType } from '../../entities/tracking';
import { WarehouseStockService } from './warehouse-stock.service';
import { makeEan13 } from '../inventory/barcode';
import { attachmentsDigest } from '../inventory/movement-hash';
import { StockMovementAttachmentEntity } from '../../entities/stock-movement-attachment.entity';
import { createHash } from 'crypto';
import { addDays, todayKey, vknCheckDigit, zonedDayStart } from '../tr';

/**
 * WP2 demo data for the demo tenant (runs once: guarded by SKU GD-FISTIK):
 *  - food compliance module on, maker-checker threshold 25.000 TRY;
 *  - quarantine warehouse "Karantina / İmha Bekleyen" (Tuzla, İstanbul; not sellable);
 *  - food supplier with a structured address, tax office and a checksum-valid,
 *    recognisably fictitious VKN (1234567890-style);
 *  - decimal-quantity products (kg, l, m) incl. lot + expiry food products;
 *  - movements with reason codes, document references and back-dated transaction dates:
 *    opening stock, an expired-lot transfer to quarantine and its destruction (DISPOSAL,
 *    with the destruction report attached as evidence).
 * All stock goes through WarehouseStockService, so balances, lots and the hash chain agree.
 */
async function addr(m: EntityManager, line1: string, provinceCode: string, districtId: number, postalCode: string): Promise<AddressColumns> {
  const p = await m.findOneByOrFail(ProvinceEntity, { code: provinceCode });
  const d = await m.findOneByOrFail(DistrictEntity, { id: districtId });
  return Object.assign(new AddressColumns(), {
    line1, line2: null, provinceCode: p.code, province: p.name, districtId: d.id, district: d.name, postalCode, country: 'TR', uavtCode: null,
  });
}

export async function seedDemoInventoryCore(dataSource: DataSource, companyId: string, stock: WarehouseStockService, logger: Logger): Promise<void> {
  const m = dataSource.manager;
  const company = await m.findOne(CompanyEntity, { where: { id: companyId } });
  if (!company || (await m.exists(ProductEntity, { where: { companyId, sku: 'GD-FISTIK' } }))) return;
  if (!(await m.count(ProvinceEntity))) return;
  const units = await m.find(UnitEntity, { where: { companyId } });
  const unit = (code: string) => units.find((u) => u.code === code);
  if (!unit('kg') || !unit('l') || !unit('m')) return;
  const mainWh = await stock.defaultWarehouse(m, companyId);
  logger.log('Seeding inventory core demo data (WP2)...');

  const tz = company.timezone;
  const today = todayKey(tz);
  /** Local time `hh:mm` on the day `offset` days from today, as a UTC instant (never in the future). */
  const at = (offset: number, hh: number, mm = 0) =>
    new Date(Math.min(zonedDayStart(addDays(today, offset), tz).getTime() + (hh * 60 + mm) * 60000, Date.now() - 60000));

  await dataSource.transaction(async (manager) => {
    await stock.begin(manager, companyId);

    // Company settings: food module (lot traceability, Tebliğ 2026/11), maker-checker threshold.
    if (!company.enabledComplianceModules?.length) company.enabledComplianceModules = ['food'];
    if (company.adjustmentApprovalThreshold === null || company.adjustmentApprovalThreshold === undefined) company.adjustmentApprovalThreshold = 25000;
    await manager.save(CompanyEntity, company);

    // Quarantine warehouse (awaiting destruction), never sellable.
    let quarantine = await manager.findOne(WarehouseEntity, { where: { companyId, code: 'WH-KRN' } });
    if (!quarantine) {
      quarantine = await manager.save(
        WarehouseEntity,
        manager.create(WarehouseEntity, {
          companyId,
          name: 'Karantina / İmha Bekleyen',
          code: 'WH-KRN',
          type: 'QUARANTINE',
          isSellable: false,
          ownership: 'OWN',
          isBranch: false,
          address: await addr(manager, 'Aydınlı Mah. Orhanlı Cad. No:24 (Tuzla Kimya OSB yanı)', '34', 3436, '34956'),
        }),
      );
    }

    if (!(await manager.exists(CategoryEntity, { where: { companyId, slug: 'Food' } }))) {
      await manager.save(CategoryEntity, manager.create(CategoryEntity, { companyId, name: 'Gıda', slug: 'Food' }));
    }

    // Food supplier (fictitious checksum-valid VKN 123456789X).
    const supplierName = 'Gaziantep Kuruyemiş Gıda San. ve Tic. A.Ş.';
    let supplier = await manager.findOne(SupplierEntity, { where: { companyId, name: supplierName } });
    if (!supplier) {
      const office = await manager.findOneByOrFail(TaxOfficeEntity, { code: '27252' }); // Şehitkâmil VD
      supplier = await manager.save(
        SupplierEntity,
        manager.create(SupplierEntity, {
          companyId,
          name: supplierName,
          contactPerson: 'Mehmet Fıstıkçıoğlu',
          email: 'satis@antepkuruyemis.com.tr',
          phone: '+90 342 555 27 27',
          type: 'company',
          identityType: 'VKN',
          identityNumber: `123456789${vknCheckDigit('123456789')}`,
          taxOfficeCode: office.code,
          taxOfficeName: office.name,
          address: await addr(manager, 'Gaziantep OSB 3. Bölge, 83409 Nolu Cad. No:12', '27', 2708, '27600'),
          isTaxpayer: true,
          isVatTaxpayer: true,
          needsReview: false,
        } as Partial<SupplierEntity>),
      );
    }

    const mk = async (p: Partial<ProductEntity>) =>
      manager.save(
        ProductEntity,
        manager.create(ProductEntity, {
          companyId, currency: company.baseCurrency, quantity: 0, status: 'Out of stock', isDeleted: false, inventoryClass: 'TICARI_MAL_153', ...p,
        }),
      );

    const fistik = await mk({
      name: 'Antep Fıstığı İç (Boz) — kg', sku: 'GD-FISTIK', category: 'Food', price: 1250, minQuantity: 10, unit: 'kg', baseUnitId: unit('kg')!.id,
      barcode: makeEan13('869400000001'), barcodeType: 'EAN13', gtin14: '0' + makeEan13('869400000001'),
      trackingType: TrackingType.LOT, hasExpiry: true, regulatoryCategory: 'food', supplierId: supplier.id,
    });
    const zeytinyagi = await mk({
      name: 'Natürel Sızma Zeytinyağı — litre', sku: 'GD-ZYTN', category: 'Food', price: 395.5, minQuantity: 40, unit: 'l', baseUnitId: unit('l')!.id,
      barcode: makeEan13('869400000002'), barcodeType: 'EAN13', gtin14: '0' + makeEan13('869400000002'),
      trackingType: TrackingType.LOT, hasExpiry: true, regulatoryCategory: 'food', supplierId: supplier.id,
    });
    const kablo = await mk({
      name: 'NYA Bakır Kablo 2,5 mm² — metre', sku: 'KB-NYA25', category: 'Accessories', price: 18.75, minQuantity: 100, unit: 'm', baseUnitId: unit('m')!.id,
      trackingType: TrackingType.NONE, hasExpiry: false, regulatoryCategory: 'none',
    });

    const supplierTaxId = supplier.identityNumber;
    const receipt = async (prod: ProductEntity, lots: { lotNumber: string; expiryDate: string; quantity: number }[], doc: string, day: number) => {
      const before = prod.quantity;
      const qty = Math.round(lots.reduce((s, l) => s + l.quantity, 0) * 10000) / 10000;
      const allocs = await stock.receive(manager, prod, qty, mainWh.id, { lots });
      await stock.recordMovements(manager, prod, before, allocs, {
        type: StockMovementType.IN, reasonCode: 'PURCHASE', transactionDate: at(day, 10, 30),
        documentType: 'DESPATCH', documentNo: doc, documentDate: addDays(today, day), counterpartyTaxId: supplierTaxId,
        referenceType: 'manual', note: 'Tedarikçi irsaliyesi ile mal kabul', performedBy: 'SeedSystem',
      });
    };
    await receipt(fistik, [
      { lotNumber: 'FST-2609-B', expiryDate: addDays(today, -3), quantity: 6.4 },
      { lotNumber: 'FST-2610-A', expiryDate: addDays(today, 240), quantity: 42.75 },
    ], 'GKY2026000004127', -12);
    await receipt(zeytinyagi, [{ lotNumber: 'ZYT-2610-07', expiryDate: addDays(today, 540), quantity: 118.5 }], 'GKY2026000004131', -9);

    // Cable sold by the metre (2 decimals): opening + a 37,25 m internal use.
    let before = kablo.quantity;
    let allocs = await stock.add(manager, kablo, 350.5, mainWh.id);
    await stock.recordMovements(manager, kablo, before, allocs, {
      type: StockMovementType.IN, reasonCode: 'OPENING', transactionDate: at(-20, 9), referenceType: 'manual', note: 'Açılış stoğu (devir)', performedBy: 'SeedSystem',
    });
    before = kablo.quantity;
    allocs = await stock.deduct(manager, kablo, 37.25, mainWh.id);
    await stock.recordMovements(manager, kablo, before, allocs, {
      type: StockMovementType.ADJUSTMENT, reasonCode: 'INTERNAL_USE', transactionDate: at(-6, 14, 15),
      documentType: 'INTERNAL_VOUCHER', documentNo: 'IKF-2026-0187', documentDate: addDays(today, -6),
      referenceType: 'manual', note: 'Depo aydınlatma tesisatı için iç kullanım', performedBy: 'SeedSystem',
    });

    // Expired pistachio lot -> quarantine (QUARANTINE_IN) -> destroyed with a report (DISPOSAL).
    const total = fistik.quantity;
    const expired = await manager.findOneOrFail(StockLotEntity, { where: { companyId, productId: fistik.id, warehouseId: mainWh.id, lotNumber: 'FST-2609-B' } });
    const lot = await stock.transfer(manager, fistik, mainWh.id, quarantine.id, 6.4, { lotId: expired.id });
    await stock.recordMovements(
      manager, fistik, total,
      [...lot.out.map((a) => ({ ...a, type: StockMovementType.TRANSFER_OUT })), ...lot.in.map((a) => ({ ...a, type: StockMovementType.QUARANTINE_IN }))],
      {
        type: StockMovementType.TRANSFER_OUT, reasonCode: 'TRANSFER', totalsUnchanged: true, transactionDate: at(-2, 11),
        documentType: 'TRANSFER', documentNo: 'TRF-KRN-0003', documentDate: addDays(today, -2),
        referenceType: 'warehouse_transfer', referenceId: 'TRF-KRN-0003', note: 'TETT geçen parti karantinaya alındı', performedBy: 'SeedSystem',
      },
    );
    before = fistik.quantity;
    const quarantineLot = lot.in[0];
    const out = await stock.issue(manager, fistik, 6.4, quarantine.id, { lots: [{ lotId: quarantineLot.lotId as string, quantity: 6.4 }] }, { allowExpired: true });
    // Disposals need the destruction report as evidence (legal parameter MOVEMENT_REASON_EVIDENCE):
    // the report file is sealed into the movement hash (attachmentsSha256) and linked to it.
    const report = Buffer.from(
      [
        'İMHA TUTANAĞI — IMHA-2026-014 (örnek / demo)',
        `Tarih: ${addDays(today, -1)}`,
        'Ürün: Antep fıstığı (GD-FISTIK), parti FST-2609-B, 6,4 kg',
        'Gerekçe: Tavsiye edilen tüketim tarihi (TETT) geçmiş; karantina deposundan imha edildi.',
        'Komisyon: Depo sorumlusu, kalite sorumlusu, muhasebe (demo kişiler).',
      ].join('\n'),
      'utf8',
    );
    const reportSha = createHash('sha256').update(report).digest('hex');
    const destroyed = await stock.recordMovements(manager, fistik, before, out, {
      type: StockMovementType.DISPOSAL, reasonCode: 'EXPIRED_DESTROYED', transactionDate: at(-1, 16),
      documentType: 'DESTRUCTION_REPORT', documentNo: 'IMHA-2026-014', documentDate: addDays(today, -1),
      referenceType: 'manual', note: 'TETT geçen ürün imha tutanağı ile imha edildi', performedBy: 'SeedSystem',
      attachmentsSha256: attachmentsDigest([reportSha]),
    });
    await manager.save(
      StockMovementAttachmentEntity,
      manager.create(StockMovementAttachmentEntity, {
        companyId, movementId: destroyed[0].id, adjustmentRequestId: null, fileName: 'IMHA-2026-014-imha-tutanagi.txt',
        mimeType: 'text/plain', size: report.length, sha256: reportSha, content: report, uploadedBy: 'SeedSystem',
      }),
    );
  });
}
