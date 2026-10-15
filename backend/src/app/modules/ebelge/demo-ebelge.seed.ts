import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity, DEFAULT_COMPANY } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { OrderStatus } from '../../entities/enums';
import { CompanyEBelgeSettingsEntity, EDocumentEntity } from '../../entities/ebelge.entity';
import { ensureEdocTriggers } from '../../shared/ebelge/ebelge-triggers';
import { addDays, dateKeyInZone, parseZonedDateTime, tcknCheckDigits, todayKey } from '../../shared/tr';
import { fiscalStatus } from '../company/fiscal';
import { companySnapshot } from '../documents/document-support';
import { DespatchService } from '../documents/despatch.service';
import { InvoiceService } from '../documents/invoice.service';
import { partyFromSnapshot } from '../../shared/ebelge/ubl/mapper';
import { sampleDespatch, sampleInvoice } from '../../shared/ebelge/samples';
import { MockEDocumentProvider, providerUsageAllowed } from '../../shared/ebelge/provider';
import { EBelgeSettingsService } from './ebelge-settings.service';
import { EDocumentService } from './edocument.service';
import { InboxService } from './inbox.service';

const SEED_USER = 'SeedSystem';
const MARMARA_VKN = '5640281390';
const DRIVER_TCKN = '612904735' + tcknCheckDigits('612904735').join('');

/**
 * WP5 safety net and demo data:
 *  - archive triggers and a settings row for every company (schema-sync databases);
 *  - demo tenant (once, after the WP4 demo): the mock integrator in TEST mode with encrypted
 *    credentials, e-Belge mode PROVIDER (bilanço esası: every invoice is an e-document since
 *    1/1/2026), a TEMELFATURA with e-İrsaliye to a registered office-furniture company, a
 *    TICARIFATURA to the construction customer (accepted by the mock receiver), an e-Arşiv
 *    internet sale to a consumer (e-mail delivery, 8-day cancellation window) and an inbox with a
 *    supplier TICARIFATURA matched to its goods receipt, an incoming e-İrsaliye waiting for the
 *    receipt advice, a TEMELFATURA and a customer's IADE invoice linked to our sale.
 */
@Injectable()
export class EBelgeDemoSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('EBelgeDemoSeeder');

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly moduleRef: ModuleRef,
    private readonly settings: EBelgeSettingsService,
    private readonly edocs: EDocumentService,
    private readonly inbox: InboxService,
    private readonly despatches: DespatchService,
    private readonly invoices: InvoiceService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const created = await ensureEdocTriggers((sql, params) => this.dataSource.query(sql, params));
      if (created.length) this.logger.log(`Created e-document archive triggers: ${created.join(', ')}`);
      for (const c of await this.dataSource.manager.find(CompanyEntity, { select: ['id'] })) await this.settings.getOrCreate(this.dataSource.manager, c.id);
    } catch (e) {
      this.logger.warn(`WP5 safety net skipped: ${(e as Error).message}`);
    }
    // After the WP4 demo seeder (its documents use the portal numbering of mode NONE).
    setTimeout(() => void this.tenant.run(DEFAULT_COMPANY.id, () => this.seedDemo()).catch((e) => this.logger.warn(`WP5 demo seed skipped: ${(e as Error).message}`)), 4000);
  }

  private async addr(line1: string, provinceCode: string, districtName: string, postalCode: string): Promise<AddressColumns> {
    const m = this.dataSource.manager;
    const p = await m.findOneByOrFail(ProvinceEntity, { code: provinceCode });
    const d = await m.findOneByOrFail(DistrictEntity, { provinceCode, name: districtName });
    return Object.assign(new AddressColumns(), { line1, line2: null, provinceCode: p.code, province: p.name, districtId: d.id, district: d.name, postalCode, country: 'TR', uavtCode: null });
  }

  private async seedDemo() {
    const m = this.dataSource.manager;
    const companyId = DEFAULT_COMPANY.id;
    const company = await m.findOne(CompanyEntity, { where: { id: companyId } });
    if (!company || company.country !== 'TR' || !fiscalStatus(company).complete) return;
    const settings = await this.settings.getOrCreate(m, companyId);
    // Once: the demo is complete when the tenant has outgoing e-documents (a failed run is retried on the next start).
    if (await m.exists(EDocumentEntity, { where: { companyId, direction: 'OUT' } })) return;
    if (settings.provider && settings.provider !== 'MOCK') return;
    // The demo runs on the mock integrator, which a production server only allows with EBELGE_ALLOW_MOCK=true.
    if (!providerUsageAllowed({ testOnly: true }, 'TEST')) {
      this.logger.log('WP5 demo seed skipped: the mock integrator is disabled on this server (EBELGE_ALLOW_MOCK).');
      return;
    }
    // WP4 demo must exist (farmer purchase is its last step).
    const farmer = await m.findOne(SupplierEntity, { where: { companyId, identityNumber: '28461593794' } });
    if (!farmer) return;
    const sku = async (s: string) => m.findOne(ProductEntity, { where: { companyId, sku: s, isDeleted: false } });
    const [mouse, hub, stand, keyboard, cable] = await Promise.all(['MS-320', 'HB-81', 'LS-ALUM', 'KB-85', 'KB-NYA25'].map(sku));
    const main = await m.findOne(WarehouseEntity, { where: { companyId, code: 'WH-001', isDeleted: false } });
    const baskent = await m.findOne(CustomerEntity, { where: { companyId, name: 'Başkent Yapı İnşaat Taahhüt Ltd. Şti.', isDeleted: false } });
    const selin = await m.findOne(CustomerEntity, { where: { companyId, name: 'Selin Aydın', isDeleted: false } });
    if (!mouse || !hub || !stand || !keyboard || !cable || !main || !baskent || !selin) return;
    this.logger.log('Seeding e-Belge demo data (WP5)...');

    // 1. Integrator: mock, TEST environment, encrypted credentials.
    const ownVkn = company.taxId as string;
    await this.settings.update({
      provider: 'MOCK',
      environment: 'TEST',
      credentials: {
        apiUser: 'demoteknoloji.test',
        apiPassword: `Mock-${randomBytes(6).toString('hex')}`,
        registeredInvoiceTaxIds: [ownVkn, MARMARA_VKN, baskent.identityNumber, '7777777770', '5555555553', '3258407167'],
        registeredDespatchTaxIds: [ownVkn, MARMARA_VKN, baskent.identityNumber, '5555555553'],
        rejectingTaxIds: [],
        partialReceiptTaxIds: [MARMARA_VKN],
        acceptDelaySeconds: 20,
        responseDelaySeconds: 90,
        webhookSecret: randomBytes(16).toString('hex'),
      },
      sealDeclarationDate: '2026-01-02',
      senderAlias: 'urn:mail:defaultgb@demoteknoloji.com.tr',
      receiverAlias: 'urn:mail:defaultpk@demoteknoloji.com.tr',
      earsivDefaultChannel: 'EMAIL',
      autoSend: true,
    });
    await m.update(CompanyEntity, { id: companyId }, { eDocumentMode: 'PROVIDER' });

    // 2. A registered e-Fatura / e-İrsaliye customer (office furniture, Kadıköy) and the e-Arşiv consumer's e-mail.
    let marmara = await m.findOne(CustomerEntity, { where: { companyId, identityNumber: MARMARA_VKN } });
    if (!marmara) {
      const office = await m.findOne(TaxOfficeEntity, { where: { provinceCode: '34', name: 'Kadıköy Vergi Dairesi Müdürlüğü' } });
      marmara = await m.save(
        CustomerEntity,
        m.create(CustomerEntity, {
          companyId,
          name: 'Marmara Ofis Mobilyaları San. ve Tic. Ltd. Şti.',
          type: 'company',
          email: 'muhasebe@marmaraofis.com.tr',
          phone: '+90 216 338 41 20',
          identityType: 'VKN',
          identityNumber: MARMARA_VKN,
          taxOfficeCode: office?.code ?? null,
          taxOfficeName: office?.name ?? 'Kadıköy Vergi Dairesi Müdürlüğü',
          isVatTaxpayer: true,
          preferredProfile: 'TEMELFATURA',
          address: await this.addr('Caferağa Mahallesi Moda Caddesi No: 45/2', '34', 'Kadıköy', '34710'),
          currency: 'TRY',
        }),
      );
    }
    await m.update(CustomerEntity, { id: baskent.id }, { preferredProfile: 'TICARIFATURA' });
    if (!selin.email) await m.update(CustomerEntity, { id: selin.id }, { email: 'selin.aydin@ornekposta.com.tr' });

    const { OrderService } = await import('../order/order.service');
    const orders = this.moduleRef.get(OrderService, { strict: false });
    const tz = company.timezone;
    const today = todayKey(tz);
    const at = (daysAgo: number, hhmm: string) => parseZonedDateTime(`${addDays(today, -daysAgo)}T${hhmm}`, tz) as Date;
    const driver = { firstName: 'Kemal', lastName: 'Aksoy', tckn: DRIVER_TCKN };
    const sale = (customerId: string, items: { product: ProductEntity; quantity: number }[], daysAgo: number, extra: Record<string, unknown> = {}) =>
      orders.createOrder({ customerId, status: OrderStatus.PENDING, warehouseId: main.id, date: at(daysAgo, '09:10').toISOString(), items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })), ...extra } as any, SEED_USER);
    const ship = async (orderId: string, daysAgo: number, hhmm = '10:30') => {
      const d = await this.dataSource.transaction((tx) =>
        this.despatches.createFromOrderTx(tx, orderId, { sourceWarehouseId: main.id, actualDespatchAt: `${addDays(today, -daysAgo)}T${hhmm}`, carrierParty: { name: `${company.legalName} (kendi aracı)` }, drivers: [driver], plates: [{ plate: '34 DMT 260', type: 'TRUCK' }] }, SEED_USER),
      );
      return this.dataSource.transaction((tx) => this.despatches.approveTx(tx, d.id, {}, SEED_USER, [], at(daysAgo, hhmm.replace(/:\d\d$/, ':00'))));
    };

    // 3a. TEMELFATURA + e-İrsaliye to the registered office-furniture customer (receiver answers with a partial receipt advice).
    const oA = await sale(marmara.id, [{ product: stand, quantity: 6 }, { product: hub, quantity: 4 }, { product: keyboard, quantity: 2 }], 1);
    await ship(oA.id, 1, '09:45');
    const invA = await this.invoices.createFromOrder(oA.id, { notes: 'Ödeme vadesi: fatura tarihinden itibaren 30 gün. IBAN TR32 0006 2000 4410 0006 2988 54' }, SEED_USER);
    await this.invoices.issue(invA.id, {}, SEED_USER);

    // 3b. TICARIFATURA to the construction customer (mock receiver answers KABUL).
    const oB = await sale(baskent.id, [{ product: cable, quantity: 150 }], 0);
    await ship(oB.id, 0, '08:30');
    const invB = await this.invoices.createFromOrder(oB.id, {}, SEED_USER);
    await this.invoices.issue(invB.id, {}, SEED_USER);

    // 3c. e-Arşiv internet sale to a consumer, delivered by e-mail (8-day cancellation window starts).
    const oC = await sale(selin.id, [{ product: mouse, quantity: 1 }, { product: hub, quantity: 1 }], 0, { salesChannel: 'WEB', isDistanceSale: true, channelOrderRef: 'WEB-105117', carrier: 'Anadolu Lojistik Kargo A.Ş.' });
    await ship(oC.id, 0, '09:15');
    const invC = await this.invoices.createFromOrder(oC.id, { internetSaleInfo: { webAddress: company.website, paymentMethod: 'KREDIKARTI/BANKAKARTI', paymentDate: today, carrierName: 'Anadolu Lojistik Kargo A.Ş.', carrierTaxId: '1294765301', shipmentDate: today } }, SEED_USER);
    await this.invoices.issue(invC.id, {}, SEED_USER);

    await this.edocs.processOutbox(25, companyId);

    // 4. Inbox: real UBL-TR documents from registered suppliers / a customer.
    const r = await this.settings.resolve(companyId);
    const mock = r.provider as MockEDocumentProvider;
    const specialIds = await this.edocs.param<any[]>('SPECIAL_TAX_IDS', [], 'TR');
    const us = partyFromSnapshot(companySnapshot(company), 'EFATURA', specialIds, 'seller').party;
    const partyOf = (s: SupplierEntity) => partyFromSnapshot({ name: s.name, taxIdType: s.identityType, taxId: s.identityNumber, taxOfficeName: s.taxOfficeName, address: { line1: s.address?.line1, district: s.address?.district, province: s.address?.province, postalCode: s.address?.postalCode, country: 'TR' } }, 'EFATURA', specialIds).party;
    const poOf = (n: string) => m.findOne(PurchaseOrderEntity, { where: { companyId, poNumber: n }, relations: { items: true } });
    const po2006 = await poOf('PO-2006');
    const akilli = po2006 ? await m.findOne(SupplierEntity, { where: { id: po2006.supplierId } }) : null;
    if (po2006 && akilli && po2006.items[0]) {
      const it = po2006.items[0];
      const inv = sampleInvoice({
        documentNo: 'AKC2026000001204',
        issueDate: addDays(today, -3),
        profileId: 'TICARIFATURA',
        supplier: partyOf(akilli),
        customer: us,
        lines: [{ name: it.productName, quantity: 11, unitCode: it.unitCode || 'C62', unitPrice: Number(it.unitPrice || it.price), vatRate: 20 }],
        orderRef: { id: po2006.poNumber, issueDate: dateKeyInZone(new Date(po2006.createdAt), tz) },
        despatchRefs: [{ id: 'AKC2026000000317', issueDate: addDays(today, -5) }],
      });
      await mock.deliverToInbox(companyId, { ettn: inv.ettn, docType: 'INVOICE', xml: inv.xml, senderTaxId: akilli.identityNumber, receivedAt: at(2, '11:20') });
    }
    const po2004 = await poOf('PO-2004');
    const tekno = po2004 ? await m.findOne(SupplierEntity, { where: { id: po2004.supplierId } }) : null;
    if (po2004 && tekno) {
      const lines = po2004.items.slice(0, 2).map((it) => ({ name: it.productName, quantity: Math.max(1, Number(it.unitQuantity || it.quantity) - Number(it.receivedQuantity || 0)), unitCode: it.unitCode || 'C62' }));
      const d = sampleDespatch({
        documentNo: 'TDG2026000000588',
        issueDate: addDays(today, -1),
        actualDespatchDate: addDays(today, -1),
        actualDespatchTime: '14:40:00',
        supplier: partyOf(tekno),
        customer: us,
        lines,
        orderRef: { id: po2004.poNumber, issueDate: dateKeyInZone(new Date(po2004.createdAt), tz) },
        driver: { firstName: 'Hasan', familyName: 'Kara', tckn: '19384726550' },
        plate: '41TDG588',
      });
      await mock.deliverToInbox(companyId, { ettn: d.ettn, docType: 'DESPATCH', xml: d.xml, senderTaxId: tekno.identityNumber, receivedAt: at(1, '14:45') });
    }
    const poDc = await poOf('PO-DC-0001');
    const ege = poDc ? await m.findOne(SupplierEntity, { where: { id: poDc.supplierId } }) : null;
    if (poDc && ege && poDc.items[0]) {
      const it = poDc.items[0];
      const inv = sampleInvoice({
        documentNo: 'EDC2026000003391',
        issueDate: addDays(today, -1),
        profileId: 'TEMELFATURA',
        supplier: partyOf(ege),
        customer: us,
        lines: [{ name: it.productName, quantity: Number(it.unitQuantity || it.quantity), unitCode: it.unitCode || 'KGM', unitPrice: Number(it.unitPrice || it.price), vatRate: 20 }],
        orderRef: { id: poDc.poNumber, issueDate: dateKeyInZone(new Date(poDc.createdAt), tz) },
        notes: ['Teslim: İzmir Aliağa fabrika çıkışı.'],
      });
      await mock.deliverToInbox(companyId, { ettn: inv.ettn, docType: 'INVOICE', xml: inv.xml, senderTaxId: ege.identityNumber, receivedAt: at(0, '08:05') });
    }
    await this.inbox.fetch(companyId);
    // A customer's IADE invoice referencing our TEMELFATURA (linked to the original sale).
    try {
      await this.inbox.simulateIncoming('IADE_INVOICE', mock);
    } catch (e) {
      this.logger.warn(`demo IADE invoice skipped: ${(e as Error).message}`);
    }
    await this.dataSource.manager.update(CompanyEBelgeSettingsEntity, { companyId }, { lastConnectionTestAt: new Date(), lastConnectionOk: true });
    this.logger.log('e-Belge demo data seeded.');
  }
}
