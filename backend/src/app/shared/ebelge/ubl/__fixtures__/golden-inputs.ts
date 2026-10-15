import { UblApplicationResponseInput, UblDespatchInput, UblInvoiceInput, UblInvoiceLine, UblParty, UblReceiptAdviceInput } from '../model';

/**
 * Deterministic inputs of the golden UBL-TR tests (WP5). Identities are checksum-valid VKN / TCKN
 * values, addresses use real provinces, districts, postal codes and tax offices.
 */

export const SELLER: UblParty = {
  name: 'Demo Teknoloji Ürünleri Ticaret A.Ş.',
  identifiers: [
    { schemeID: 'VKN', value: '4820193752' },
    { schemeID: 'MERSISNO', value: '0482019375200015' },
    { schemeID: 'TICARETSICILNO', value: '987654-5' },
  ],
  taxOffice: 'Kozyatağı',
  address: { street: 'Kayışdağı Caddesi Değirmen Sokak', buildingNumber: '12/4', district: 'Ataşehir', city: 'İstanbul', postalZone: '34750', country: 'Türkiye', countryCode: 'TR' },
  phone: '+90 216 555 01 23',
  email: 'efatura@demoteknoloji.com.tr',
  website: 'https://www.demoteknoloji.com.tr',
};

export const BUYER_VKN: UblParty = {
  name: 'Başkent Yapı İnşaat Taahhüt Ltd. Şti.',
  identifiers: [{ schemeID: 'VKN', value: '7318462058' }],
  taxOffice: 'Kavaklıdere',
  address: { street: 'Atatürk Bulvarı', buildingNumber: '211', district: 'Çankaya', city: 'Ankara', postalZone: '06680', country: 'Türkiye', countryCode: 'TR' },
  email: 'muhasebe@baskentyapi.com.tr',
};

export const STEEL_BUYER: UblParty = {
  name: 'Ege Demir Çelik Sanayi ve Ticaret A.Ş.',
  identifiers: [{ schemeID: 'VKN', value: '3905728147' }],
  taxOffice: 'Karşıyaka',
  address: { street: 'Cumhuriyet Mahallesi 2040 Sokak', buildingNumber: '8', district: 'Karşıyaka', city: 'İzmir', postalZone: '35540', country: 'Türkiye', countryCode: 'TR' },
};

export const SUPPLIER_GAZIANTEP: UblParty = {
  name: 'Gaziantep Kuruyemiş Gıda San. ve Tic. A.Ş.',
  identifiers: [{ schemeID: 'VKN', value: '6152039482' }],
  taxOffice: 'Şehitkamil',
  address: { street: 'İncilipınar Mahallesi Prof. Muammer Aksoy Bulvarı', buildingNumber: '45', district: 'Şehitkamil', city: 'Gaziantep', postalZone: '27060', country: 'Türkiye', countryCode: 'TR' },
};

export const PERSON_BUYER: UblParty = {
  person: { firstName: 'Ayşe', familyName: 'Demir' },
  identifiers: [{ schemeID: 'TCKN', value: '28741509354' }],
  address: { street: 'Bahçelievler Mahallesi 7. Cadde', buildingNumber: '19/3', district: 'Çankaya', city: 'Ankara', postalZone: '06490', country: 'Türkiye', countryCode: 'TR' },
  email: 'ayse.demir@example.com.tr',
};

export const FOREIGN_BUYER: UblParty = {
  name: 'Hellas Trading S.A.',
  identifiers: [{ schemeID: 'VKN', value: '2222222222' }],
  address: { street: 'Leoforos Vasilissis Sofias', buildingNumber: '72', district: 'Kolonaki', city: 'Athens', postalZone: '11528', country: 'Yunanistan', countryCode: 'GR' },
};

const KDV = (percent: number, taxable: number, amount: number, exemptionCode?: string, exemptionReason?: string) => ({
  code: '0015',
  name: 'KDV',
  percent,
  taxable,
  amount,
  exemptionCode: exemptionCode ?? null,
  exemptionReason: exemptionReason ?? null,
});

function totals(lines: UblInvoiceLine[], withheld = 0) {
  const r = (v: number) => Math.round(v * 100) / 100;
  const net = r(lines.reduce((s, l) => s + l.lineExtension, 0));
  const allowance = r(lines.reduce((s, l) => s + (l.allowances || []).filter((a) => !a.charge).reduce((x, a) => x + a.amount, 0), 0));
  const tax = r(lines.reduce((s, l) => s + l.taxes.reduce((x, t) => x + t.amount, 0), 0));
  return { lineExtension: r(net + allowance), taxExclusive: net, taxInclusive: r(net + tax), allowanceTotal: allowance, chargeTotal: 0, payable: r(net + tax - withheld) };
}

const base = { issueDate: '2026-10-14', issueTime: '10:42:00', notes: [] as string[] };

export function satisInvoice(): UblInvoiceInput {
  const lines: UblInvoiceLine[] = [
    { id: 1, name: 'Dizüstü Bilgisayar 15,6"', sellersItemId: 'NB-1560', quantity: 4, unitCode: 'C62', unitPrice: 28500, lineExtension: 108300, allowances: [{ charge: false, reason: 'Kampanya iskontosu', multiplier: 0.05, amount: 5700, base: 114000 }], taxes: [KDV(20, 108300, 21660)] },
    { id: 2, name: 'Kablosuz Mouse', sellersItemId: 'MS-200', quantity: 10, unitCode: 'C62', unitPrice: 450, lineExtension: 4500, taxes: [KDV(20, 4500, 900)] },
  ];
  return {
    ...base,
    ettn: '6f3c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a41',
    documentNo: 'DMT2026000000017',
    profileId: 'TEMELFATURA',
    typeCode: 'SATIS',
    currency: 'TRY',
    notes: ['Sipariş SIP-2026-0412 kapsamında teslim edilmiştir.'],
    orderRef: { id: 'SIP-2026-0412', issueDate: '2026-10-09' },
    despatchRefs: [{ id: 'DMI2026000000008', issueDate: '2026-10-12' }],
    supplier: SELLER,
    customer: BUYER_VKN,
    paymentMeans: { code: '42', dueDate: '2026-11-13' },
    lines,
    totals: totals(lines),
  };
}

export function istisnaInvoice(): UblInvoiceInput {
  const lines: UblInvoiceLine[] = [
    { id: 1, name: 'Antep Fıstığı (Kavrulmuş) 1 kg', sellersItemId: 'FST-1000', quantity: 250, unitCode: 'KGM', unitPrice: 920, lineExtension: 230000, taxes: [KDV(0, 230000, 0, '301', '11/1-a Mal İhracatı')] },
  ];
  return {
    ...base,
    ettn: '0d8e7f21-5c3a-4b9e-8f10-7a6b5c4d3e2f',
    documentNo: 'DEA2026000000031',
    profileId: 'EARSIVFATURA',
    typeCode: 'ISTISNA',
    currency: 'TRY',
    notes: ['Gönderim şekli: ELEKTRONIK'],
    supplier: SELLER,
    customer: FOREIGN_BUYER,
    lines,
    totals: totals(lines),
  };
}

export function tevkifatInvoice(): UblInvoiceInput {
  const lines: UblInvoiceLine[] = [
    {
      id: 1,
      name: 'Nervürlü İnşaat Demiri Ø12',
      sellersItemId: 'IND-12',
      quantity: 12.5,
      unitCode: 'TNE',
      unitPrice: 24800,
      lineExtension: 310000,
      taxes: [KDV(20, 310000, 62000)],
      withholding: [{ code: '627', name: 'Demir-Çelik Ürünlerinin Teslimi', percent: 50, taxable: 62000, amount: 31000 }],
    },
  ];
  return {
    ...base,
    ettn: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    documentNo: 'DMT2026000000018',
    profileId: 'TEMELFATURA',
    typeCode: 'TEVKIFAT',
    currency: 'TRY',
    supplier: SELLER,
    customer: STEEL_BUYER,
    lines,
    totals: totals(lines, 31000),
  };
}

export function iadeInvoice(): UblInvoiceInput {
  const lines: UblInvoiceLine[] = [
    { id: 1, name: 'Çiğ Badem İçi 1 kg (hasarlı ambalaj)', sellersItemId: 'BDM-1000', quantity: 15, unitCode: 'KGM', unitPrice: 540, lineExtension: 8100, taxes: [KDV(1, 8100, 81)] },
  ];
  return {
    ...base,
    ettn: '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7',
    documentNo: 'DMT2026000000019',
    profileId: 'TEMELFATURA',
    typeCode: 'IADE',
    currency: 'TRY',
    notes: ['Hasarlı teslim edilen malların iadesidir.'],
    billingRefs: [{ id: 'GKY2026000004211', issueDate: '2026-10-02', documentTypeCode: 'IADE' }],
    supplier: SELLER,
    customer: SUPPLIER_GAZIANTEP,
    lines,
    totals: totals(lines),
  };
}

export function dovizInvoice(): UblInvoiceInput {
  const lines: UblInvoiceLine[] = [
    { id: 1, name: 'Endüstriyel Tablet 10"', sellersItemId: 'TB-10R', quantity: 6, unitCode: 'C62', unitPrice: 412.5, lineExtension: 2475, taxes: [KDV(20, 2475, 495)] },
    { id: 2, name: 'Nakliye Bedeli', quantity: 1, unitCode: 'C62', unitPrice: 85, lineExtension: 85, taxes: [KDV(20, 85, 17)] },
  ];
  return {
    ...base,
    ettn: '9c8b7a6f-5e4d-4c3b-a2f1-0e9d8c7b6a50',
    documentNo: 'DMT2026000000020',
    profileId: 'TICARIFATURA',
    typeCode: 'SATIS',
    currency: 'USD',
    exchangeRate: 41.8235,
    exchangeRateDate: '2026-10-13',
    notes: ['Kur: TCMB döviz alış kuru 13.10.2026.'],
    supplier: SELLER,
    customer: BUYER_VKN,
    lines,
    totals: totals(lines),
  };
}

export function earsivInternetInvoice(): UblInvoiceInput {
  const lines: UblInvoiceLine[] = [{ id: 1, name: 'Bluetooth Kulaklık', sellersItemId: 'BT-90', quantity: 1, unitCode: 'C62', unitPrice: 1249.17, lineExtension: 1249.17, taxes: [KDV(20, 1249.17, 249.83)] }];
  return {
    ...base,
    ettn: '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e',
    documentNo: 'DEA2026000000032',
    profileId: 'EARSIVFATURA',
    typeCode: 'SATIS',
    currency: 'TRY',
    notes: ['Gönderim şekli: ELEKTRONIK', 'İnternet satışı: https://www.demoteknoloji.com.tr; ödeme şekli KREDIKARTI/BANKAKARTI; ödeme tarihi 2026-10-14; taşıyıcı Anadolu Lojistik Kargo (1294765301); gönderim tarihi 2026-10-14.'],
    supplier: SELLER,
    customer: PERSON_BUYER,
    delivery: { carrier: { name: 'Anadolu Lojistik Kargo A.Ş.', taxId: '1294765301' }, actualDate: '2026-10-14' },
    paymentMeans: { code: '48', dueDate: '2026-10-14', note: 'KREDIKARTI/BANKAKARTI' },
    lines,
    totals: totals(lines),
    internetSale: { webAddress: 'https://www.demoteknoloji.com.tr', paymentMethod: 'KREDIKARTI/BANKAKARTI', paymentDate: '2026-10-14', carrierName: 'Anadolu Lojistik Kargo A.Ş.', carrierTaxId: '1294765301', shipmentDate: '2026-10-14' },
  };
}

/** Transfer between own branches (VUK 230/5): the receiver is the company itself at the branch address. */
export function branchDespatch(): UblDespatchInput {
  return {
    ...base,
    ettn: '7d6c5b4a-3f2e-4d1c-9b0a-8f7e6d5c4b3a',
    documentNo: 'DMI2026000000009',
    profileId: 'TEMELIRSALIYE',
    typeCode: 'SEVK',
    notes: ['Şubeler arası transfer (Ataşehir merkez depo -> Gebze şube deposu).'],
    supplier: SELLER,
    customer: { ...SELLER, address: { street: 'Güzeller OSB Mahallesi Kuzey Caddesi', buildingNumber: '3', district: 'Gebze', city: 'Kocaeli', postalZone: '41400', country: 'Türkiye', countryCode: 'TR' } },
    deliveryAddress: { street: 'Güzeller OSB Mahallesi Kuzey Caddesi', buildingNumber: '3', district: 'Gebze', city: 'Kocaeli', postalZone: '41400', country: 'Türkiye', countryCode: 'TR' },
    despatchAddress: SELLER.address,
    drivers: [{ firstName: 'Mehmet', familyName: 'Yılmaz', tckn: '45612037884' }],
    plates: ['34ABC123'],
    trailerPlates: [],
    actualDespatchDate: '2026-10-14',
    actualDespatchTime: '11:15:00',
    lines: [
      { id: 1, name: 'Dizüstü Bilgisayar 15,6"', sellersItemId: 'NB-1560', quantity: 12, unitCode: 'C62', lots: [{ serial: 'NB1560-24A0091' }] },
      { id: 2, name: 'Antep Fıstığı (Kavrulmuş) 1 kg', sellersItemId: 'FST-1000', quantity: 40, unitCode: 'KGM', lots: [{ lot: 'L2026-0917', expiry: '2027-09-17' }] },
    ],
  };
}

export function matbudanDespatch(): UblDespatchInput {
  return {
    ...branchDespatch(),
    ettn: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    documentNo: 'DMI2026000000010',
    typeCode: 'MATBUDAN',
    notes: ['Entegratör kesintisi sırasında düzenlenen matbu irsaliyenin e-İrsaliye kaydıdır.'],
    paperRef: { id: 'A-000412', issueDate: '2026-10-13' },
    customer: BUYER_VKN,
    deliveryAddress: BUYER_VKN.address,
    actualDespatchDate: '2026-10-13',
    actualDespatchTime: '16:40:00',
  };
}

export function partialReceiptAdvice(): UblReceiptAdviceInput {
  return {
    ...base,
    ettn: '4a5b6c7d-8e9f-4a0b-b1c2-d3e4f5a6b7c8',
    documentNo: 'DMY2026000000003',
    profileId: 'TEMELIRSALIYE',
    notes: ['2 koli hasarlı teslim alındı.'],
    despatch: { ettn: 'e1d2c3b4-a596-4877-8695-a4b3c2d1e0f9', documentNo: 'GKY2026000000877', issueDate: '2026-10-12' },
    orderRef: { id: 'SA-2026-0088', issueDate: '2026-10-05' },
    deliveryCustomer: SELLER,
    despatchSupplier: SUPPLIER_GAZIANTEP,
    actualDespatchDate: '2026-10-12',
    lines: [
      { id: 1, despatchLineId: '1', name: 'Antep Fıstığı (Kavrulmuş) 1 kg', sellersItemId: 'GK-FST1', unitCode: 'KGM', received: 96, rejected: 4, rejectReason: 'Ambalaj hasarlı' },
      { id: 2, despatchLineId: '2', name: 'Çiğ Badem İçi 1 kg', sellersItemId: 'GK-BDM1', unitCode: 'KGM', received: 50 },
    ],
  };
}

export function kabulResponse(): UblApplicationResponseInput {
  return {
    ...base,
    ettn: '8f9e0d1c-2b3a-4c5d-8e6f-7a8b9c0d1e2f',
    documentNo: '8f9e0d1c-2b3a-4c5d-8e6f-7a8b9c0d1e2f',
    profileId: 'TICARIFATURA',
    notes: [],
    sender: SELLER,
    receiver: SUPPLIER_GAZIANTEP,
    responseCode: 'KABUL',
    invoice: { ettn: 'b7c8d9e0-f1a2-4b3c-9d4e-5f6a7b8c9d0e', documentNo: 'GKY2026000004230', issueDate: '2026-10-12' },
  };
}
