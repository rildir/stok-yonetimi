import { EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { CustomerAddressEntity } from '../../entities/customer-address.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { CompanyEBelgeProfileEntity } from '../../entities/company-ebelge-profile.entity';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { tcknCheckDigits, vknCheckDigit } from '../tr';

/** Checksum-valid but fictitious identifiers for demo data (never real persons / entities). */
export const demoVkn = (first9: string) => first9 + vknCheckDigit(first9);
export const demoTckn = (first9: string) => first9 + tcknCheckDigits(first9).join('');

interface AddrSpec {
  line1: string;
  provinceCode: string;
  districtId: number;
  postalCode: string;
}

async function addr(m: EntityManager, a: AddrSpec): Promise<AddressColumns> {
  const p = await m.findOneByOrFail(ProvinceEntity, { code: a.provinceCode });
  const d = await m.findOneByOrFail(DistrictEntity, { id: a.districtId });
  return Object.assign(new AddressColumns(), {
    line1: a.line1,
    line2: null,
    provinceCode: p.code,
    province: p.name,
    districtId: d.id,
    district: d.name,
    postalCode: a.postalCode,
    country: 'TR',
    uavtCode: null,
  });
}

async function office(m: EntityManager, code: string): Promise<{ taxOfficeCode: string; taxOfficeName: string }> {
  const o = await m.findOneByOrFail(TaxOfficeEntity, { code });
  return { taxOfficeCode: o.code, taxOfficeName: o.name };
}

/**
 * Realistic Turkish fiscal data for the demo tenant (runs once: guarded by an
 * empty company taxId). Customers / suppliers are only touched while still
 * flagged `needsReview` by the WP1 migration, so user edits are never overwritten.
 * "Mavi Ofis Ltd." is intentionally left for review to demonstrate the filter.
 */
export async function seedDemoFiscalData(m: EntityManager, companyId: string, logger: Logger): Promise<void> {
  const company = await m.findOne(CompanyEntity, { where: { id: companyId } });
  if (!company || company.taxId || !(await m.count(ProvinceEntity))) return;
  logger.log('Seeding demo fiscal identity / addresses (WP1)...');

  const vkn = demoVkn('847291035');
  Object.assign(company, {
    legalName: 'Demo Teknoloji Ürünleri Ticaret A.Ş.',
    taxIdType: 'VKN',
    taxId: vkn,
    ...(await office(m, '34246')), // Kozyatağı VD
    mersisNo: `0${vkn}00017`,
    tradeRegistryNo: '845213-5',
    tradeRegistryOffice: 'İstanbul Ticaret Sicili Müdürlüğü',
    kepAddress: 'demoteknoloji@hs01.kep.tr',
    website: 'https://www.demoteknoloji.com.tr',
    phone: '+90 216 555 01 23',
    email: 'muhasebe@demoteknoloji.com.tr',
    bookkeepingType: 'BILANCO',
    address: await addr(m, { line1: 'Kozyatağı Mah. Değirmen Sok. No:18 Kat:3', provinceCode: '34', districtId: 3423, postalCode: '34742' }),
  });
  await m.save(CompanyEntity, company);

  if (!(await m.exists(CompanyEBelgeProfileEntity, { where: { companyId } }))) {
    await m.save(
      CompanyEBelgeProfileEntity,
      m.create(CompanyEBelgeProfileEntity, {
        companyId,
        annualGrossSales: [
          { year: 2023, amount: 14250000 },
          { year: 2024, amount: 18450000 },
          { year: 2025, amount: 24800000 },
        ],
        sectorFlagsEFatura: [],
        sectorFlagsEIrsaliye: [],
        eFaturaSince: '2024-07-01',
        eArsivSince: '2024-07-01',
        eIrsaliyeSince: '2024-07-01',
        mandatoryVsVoluntary: 'MANDATORY',
        gibWrittenNoticeDate: null,
        corporateEvents: [],
      }),
    );
  }

  // Warehouses (structured addresses, branches, document series)
  const whSpecs: Record<string, { a: AddrSpec; isBranch: boolean; branchCode: string | null; series: string }> = {
    'WH-001': { a: { line1: 'Hadımköy Lojistik Merkezi, Ömerli Mah. Hadımköy Yolu Cad. No:41', provinceCode: '34', districtId: 3402, postalCode: '34555' }, isBranch: false, branchCode: null, series: 'MRK' },
    'WH-002': { a: { line1: 'Barbaros Mah. Begonya Sok. No:7', provinceCode: '34', districtId: 3403, postalCode: '34746' }, isBranch: true, branchCode: 'ATS', series: 'ATS' },
    'WH-003': { a: { line1: 'Kemalpaşa OSB, Atatürk Mah. 2. Cad. No:12', provinceCode: '35', districtId: 3518, postalCode: '35730' }, isBranch: true, branchCode: 'IZM', series: 'IZM' },
  };
  for (const w of await m.find(WarehouseEntity, { where: { companyId } })) {
    const spec = whSpecs[w.code];
    if (!spec) continue;
    Object.assign(w, { address: await addr(m, spec.a), isBranch: spec.isBranch, branchCode: spec.branchCode, defaultSeries: spec.series });
    await m.save(WarehouseEntity, w);
  }

  // Suppliers
  const supSpecs: Record<string, { vkn: string; office: string; a: AddrSpec }> = {
    'Ses & Görüntü Elektronik': { vkn: demoVkn('781204563'), office: '34272', a: { line1: 'Caferağa Mah. Moda Cad. No:112', provinceCode: '34', districtId: 3423, postalCode: '34710' } },
    'EkranPro Bilişim': { vkn: demoVkn('379015284'), office: '06257', a: { line1: 'Kızılırmak Mah. 1450. Sok. No:3', provinceCode: '06', districtId: 607, postalCode: '06510' } },
    'TeknoDağıtım A.Ş.': { vkn: demoVkn('836702419'), office: '34252', a: { line1: 'Esenşehir Mah. Hale Sok. No:6', provinceCode: '34', districtId: 3437, postalCode: '34776' } },
    'Ofis Merkezi Ltd. Şti.': { vkn: demoVkn('645183207'), office: '34247', a: { line1: 'Maslak Mah. Büyükdere Cad. No:255', provinceCode: '34', districtId: 3430, postalCode: '34485' } },
    'Akıllı Cihaz Toptan': { vkn: demoVkn('128450937'), office: '35264', a: { line1: 'Kazımdirik Mah. 372. Sok. No:21', provinceCode: '35', districtId: 3507, postalCode: '35100' } },
  };
  for (const s of await m.find(SupplierEntity, { where: { companyId, needsReview: true } })) {
    const spec = supSpecs[s.name];
    if (!spec) continue;
    Object.assign(s, { type: 'company', identityType: 'VKN', identityNumber: spec.vkn, ...(await office(m, spec.office)), address: await addr(m, spec.a), isTaxpayer: true, isVatTaxpayer: true, needsReview: false });
    await m.save(SupplierEntity, s);
  }

  // Customers: companies with VKN + tax office; some individuals with TCKN; everyone gets an address.
  const custCompanies: Record<string, { vkn: string; office: string; a: AddrSpec; delivery?: AddrSpec }> = {
    'ABC Yazılım A.Ş.': {
      vkn: demoVkn('104827365'),
      office: '34247',
      a: { line1: 'Maslak Mah. AOS 55. Sok. No:2 Kat:14', provinceCode: '34', districtId: 3430, postalCode: '34398' },
      delivery: { line1: 'İkitelli OSB Mah. Atatürk Bulvarı No:9 Depo 4', provinceCode: '34', districtId: 3408, postalCode: '34490' },
    },
    'Delta Danışmanlık': { vkn: demoVkn('290318475'), office: '06253', a: { line1: 'Kavaklıdere Mah. Tunalı Hilmi Cad. No:88/5', provinceCode: '06', districtId: 607, postalCode: '06680' } },
  };
  const homes: AddrSpec[] = [
    { line1: 'Bağdat Cad. No:214 D:8', provinceCode: '34', districtId: 3423, postalCode: '34728' },
    { line1: 'Yıldız Mah. Çırağan Cad. No:30', provinceCode: '34', districtId: 3410, postalCode: '34349' },
    { line1: 'Bahçelievler Mah. 7. Cad. No:44/2', provinceCode: '06', districtId: 607, postalCode: '06490' },
    { line1: 'Alsancak Mah. Kıbrıs Şehitleri Cad. No:61', provinceCode: '35', districtId: 3521, postalCode: '35220' },
    { line1: 'Fethiye Mah. Kırlangıç Sok. No:5', provinceCode: '16', districtId: 1612, postalCode: '16140' },
    { line1: 'Teşvikiye Mah. Rumeli Cad. No:19 D:4', provinceCode: '34', districtId: 3435, postalCode: '34365' },
    { line1: 'Altunizade Mah. Kuşbakışı Cad. No:11', provinceCode: '34', districtId: 3438, postalCode: '34662' },
  ];
  const tckns = [demoTckn('285104637'), demoTckn('419027385')];
  let i = 0;
  for (const c of await m.find(CustomerEntity, { where: { companyId }, order: { name: 'ASC' } })) {
    const spec = custCompanies[c.name];
    if (spec && c.needsReview) {
      Object.assign(c, { identityType: 'VKN', identityNumber: spec.vkn, ...(await office(m, spec.office)), isVatTaxpayer: true, address: await addr(m, spec.a), needsReview: false, reviewReason: null });
      await m.save(CustomerEntity, c);
      if (spec.delivery && !(await m.exists(CustomerAddressEntity, { where: { customerId: c.id } }))) {
        await m.save(CustomerAddressEntity, m.create(CustomerAddressEntity, { companyId, customerId: c.id, kind: 'DELIVERY', label: 'İkitelli depo', isDefault: true, contactName: 'Sevkiyat Sorumlusu', phone: '+90 212 555 44 10', address: await addr(m, spec.delivery) }));
        await m.save(CustomerAddressEntity, m.create(CustomerAddressEntity, { companyId, customerId: c.id, kind: 'BILLING', label: 'Merkez', isDefault: true, address: await addr(m, spec.a) }));
      }
      continue;
    }
    if (c.type === 'individual' && !c.address?.provinceCode) {
      const home = homes[i % homes.length];
      const tckn = i < tckns.length ? tckns[i] : null;
      Object.assign(c, { address: await addr(m, home), ...(tckn ? { identityType: 'TCKN', identityNumber: tckn } : {}) });
      await m.save(CustomerEntity, c);
      i++;
    }
  }
}
