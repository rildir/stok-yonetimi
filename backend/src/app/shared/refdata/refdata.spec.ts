import { parseLegacyAddress, RefLookup } from './legacy-address';
import { TR_DISTRICTS, TR_PROVINCES, TR_TAX_OFFICES } from './tr-refdata';
import { pickParameter } from '../services/legal-parameter.service';
import { LEGAL_PARAMETER_SEEDS, ANNUAL_PARAMETER_KEYS } from '../legal/legal-parameter-seeds';
import { fiscalStatus } from '../../modules/company/fiscal';

const REF: RefLookup = { provinces: TR_PROVINCES, districts: TR_DISTRICTS };

describe('reference data', () => {
  it('has 81 provinces, 973 districts and the GİB tax office list', () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(new Set(TR_PROVINCES.map(([c]) => c)).size).toBe(81);
    expect(TR_DISTRICTS).toHaveLength(973);
    expect(new Set(TR_DISTRICTS.map(([id]) => id)).size).toBe(973);
    expect(TR_TAX_OFFICES.length).toBeGreaterThan(900);
    expect(TR_TAX_OFFICES.every(([code, p]) => /^\d{5}$/.test(code) && TR_PROVINCES.some(([c]) => c === p))).toBe(true);
    expect(TR_TAX_OFFICES.find(([c]) => c === '34272')?.[2]).toBe('Kadıköy Vergi Dairesi Müdürlüğü');
  });
});

describe('legacy address migration (parseLegacyAddress)', () => {
  it('splits "street, district, province"', () => {
    const a = parseLegacyAddress({ address: 'Barbaros Mah., Ataşehir, İstanbul' }, REF);
    expect(a).toMatchObject({ line1: 'Barbaros Mah.', district: 'Ataşehir', districtId: 3403, provinceCode: '34', province: 'İstanbul', country: 'TR' });
  });
  it('handles "district, province" without street and Turkish casing', () => {
    const a = parseLegacyAddress({ address: 'ÇANKAYA, ANKARA' }, REF);
    expect(a).toMatchObject({ line1: null, district: 'Çankaya', provinceCode: '06' });
  });
  it('uses the legacy city column and keeps unmatched text in line1', () => {
    const a = parseLegacyAddress({ address: 'Kemalpaşa OSB 2. Cad.', city: 'izmir', postalCode: '35730', country: 'tr' }, REF);
    expect(a).toMatchObject({ line1: 'Kemalpaşa OSB 2. Cad.', provinceCode: '35', province: 'İzmir', districtId: null, postalCode: '35730', country: 'TR' });
  });
  it('keeps foreign / unknown cities as free text', () => {
    const a = parseLegacyAddress({ address: '5th Avenue 10', city: 'New York', country: 'US' }, REF);
    expect(a).toMatchObject({ line1: '5th Avenue 10', provinceCode: null, province: 'New York', country: 'US' });
  });
  it('empty input stays empty', () => {
    expect(parseLegacyAddress({}, REF)).toMatchObject({ line1: null, provinceCode: null, country: null });
  });
});

describe('legal parameters', () => {
  const rows = LEGAL_PARAMETER_SEEDS.filter((p) => p.key === 'VUK232_INVOICE_LIMIT');
  it('picks the value valid on a date', () => {
    expect(pickParameter(rows, '2024-06-30')?.value).toBe(6900);
    expect(pickParameter(rows, '2025-01-01')?.value).toBe(9900);
    expect(pickParameter(rows, '2026-12-31')?.value).toBe(12000);
  });
  it('has no 2027 value yet (admin warning on 1 January 2027)', () => {
    expect(pickParameter(rows, '2027-01-01')).toBeNull();
    const missing2027 = ANNUAL_PARAMETER_KEYS.filter((k) => !pickParameter(LEGAL_PARAMETER_SEEDS.filter((p) => p.key === k), '2027-01-01'));
    expect(missing2027).toContain('VUK232_INVOICE_LIMIT');
  });
  it('every seed row cites a source; low-confidence items are flagged', () => {
    expect(LEGAL_PARAMETER_SEEDS.every((p) => p.sourceRef && p.sourceRef.trim().length > 5)).toBe(true);
    for (const key of ['SPECIAL_TAX_IDS', 'EXPORT_GTB_VKN', 'EBELGE_TOLERANCE_DAY']) {
      expect(LEGAL_PARAMETER_SEEDS.find((p) => p.key === key)?.confidence).toBe('low');
    }
  });
});

describe('fiscalStatus', () => {
  const base = { country: 'TR', email: null, phone: null, mersisNo: null, tradeRegistryNo: null, kepAddress: null } as any;
  it('lists the fields a TR company must fill before issuing documents', () => {
    const st = fiscalStatus({ ...base, address: {} });
    expect(st.complete).toBe(false);
    expect(st.missing).toEqual(['legalName', 'taxId', 'taxOffice', 'address.line1', 'address.province', 'address.district', 'bookkeepingType']);
  });
  it('is complete with identity, tax office, address and bookkeeping type', () => {
    const st = fiscalStatus({
      ...base,
      legalName: 'Demo A.Ş.',
      taxIdType: 'VKN',
      taxId: '4890598016',
      taxOfficeCode: '34272',
      taxOfficeName: 'Kadıköy',
      bookkeepingType: 'BILANCO',
      address: { line1: 'x', provinceCode: '34', districtId: 3423 },
    });
    expect(st.complete).toBe(true);
    expect(st.recommended).toEqual(expect.arrayContaining(['mersisNo', 'kepAddress']));
  });
});
