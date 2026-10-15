import 'reflect-metadata';
import { ConflictException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { FinanceSettingsService } from './finance-settings.service';
import { FinanceService } from '../../shared/services/finance.service';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { LEGAL_PARAMETER_SEEDS } from '../../shared/legal/legal-parameter-seeds';
import { pickParameter } from '../../shared/services/legal-parameter.service';
import { codesValidOn } from '../../shared/services/tax-code.service';
import { EXEMPTION_CODE_SEEDS, WITHHOLDING_CODE_SEEDS } from '../../shared/finance/tax-code-seeds';
import { priceDocument } from '../../shared/finance/tax';

const COMPANY = { id: 'c1', country: 'TR', timezone: 'Europe/Istanbul', baseCurrency: 'TRY', pricesIncludeTax: true, fxAutoFetch: false, isImporterOrOreProducer: false };
const catalogRows = LEGAL_PARAMETER_SEEDS.filter((p) => p.key === 'KDV_RATE_CATALOG');

const err = (e: any) => e?.response?.code;

function settings(opts: { used?: number; row?: Partial<TaxRateEntity> } = {}) {
  const row = { id: 'r1', companyId: 'c1', name: 'KDV %20', rate: 20, kind: 'STANDARD', isDefault: false, isDeleted: false, isSystem: false, ...opts.row } as TaxRateEntity;
  const taxRepo = {
    findOne: jest.fn().mockResolvedValue(row),
    find: jest.fn().mockResolvedValue([row]),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
    exists: jest.fn().mockResolvedValue(true),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([{ n: opts.used ?? 0 }]),
    transaction: jest.fn(async (cb: any) => cb({ update: jest.fn(), save: jest.fn(async (_e: any, x: any) => x), create: jest.fn((_e: any, x: any) => x), query: jest.fn() })),
  };
  const finance = { getCompany: jest.fn().mockResolvedValue(COMPANY), today: jest.fn().mockResolvedValue('2026-10-15') };
  const legal = { list: jest.fn().mockResolvedValue(catalogRows) };
  const svc = new FinanceSettingsService({ companyId: 'c1' } as any, taxRepo as any, {} as any, finance as any, dataSource as any, legal as any, {} as any);
  return { svc, taxRepo, dataSource, row };
}

describe('tax rate catalog (R12)', () => {
  it('catalog: 20/10/1 since 10.07.2023, 18/8/1 before', () => {
    expect(((pickParameter(catalogRows as any[], '2026-10-15') as any).value as any[]).map((r) => r.rate)).toEqual([20, 10, 1]);
    expect(((pickParameter(catalogRows as any[], '2023-07-09') as any).value as any[]).map((r) => r.rate)).toEqual([18, 8, 1]);
  });

  it('acceptance: an 18 % rate cannot be entered for a TR company', async () => {
    const { svc } = settings();
    await expect(svc.createTaxRate({ name: 'KDV %18', rate: 18 })).rejects.toBeInstanceOf(UnprocessableEntityException);
    await svc.createTaxRate({ name: 'KDV %18', rate: 18 }).catch((e) => expect(err(e)).toBe('TAX_RATE_LOCKED_TR'));
  });

  it('a back-dated 18 % rate is accepted only for its legal period', async () => {
    const { svc, taxRepo } = settings();
    taxRepo.find.mockResolvedValue([]);
    const r = await svc.createTaxRate({ name: 'KDV %18 (2023 öncesi)', rate: 18, validFrom: '2023-01-01' });
    expect(r).toMatchObject({ rate: 18, code: 'KDV18', validFrom: '2023-01-01', validTo: '2023-07-09', isDefault: false });
  });

  it('0 % is an EXEMPT row, never a standard rate', async () => {
    const { svc, taxRepo } = settings();
    taxRepo.find.mockResolvedValue([]);
    expect(await svc.createTaxRate({ name: 'İstisna', rate: 0 })).toMatchObject({ kind: 'EXEMPT', code: 'KDV0', isDefault: false });
    await svc.createTaxRate({ name: 'x', rate: 0, kind: 'STANDARD' }).catch((e) => expect(err(e)).toBe('TAX_RATE_LOCKED_TR'));
  });

  it('a system (catalog) rate cannot be changed', async () => {
    const { svc } = settings({ row: { isSystem: true, code: 'KDV20' } });
    await svc.updateTaxRate('r1', { rate: 18 }).catch((e) => expect(err(e)).toBe('TAX_RATE_LOCKED_TR'));
    expect.assertions(1);
  });

  it('updateTaxRate never edits a rate in place: it closes the version and inserts a new one', async () => {
    const { svc, row } = settings({ row: { rate: 10, code: 'KDV10', validFrom: '2023-07-10' } });
    const next = await svc.updateTaxRate('r1', { rate: 20, validFrom: '2027-01-01' });
    expect(row.validTo).toBe('2026-12-31');
    expect(row.rate).toBe(10);
    expect(next).toMatchObject({ rate: 20, validFrom: '2027-01-01', supersedesId: 'r1' });
  });

  it('deleteTaxRate answers 409 TAX_RATE_IN_USE while products or lines use the rate', async () => {
    const { svc } = settings({ used: 3 });
    await expect(svc.deleteTaxRate('r1')).rejects.toBeInstanceOf(ConflictException);
    await svc.deleteTaxRate('r1').catch((e) => expect(err(e)).toBe('TAX_RATE_IN_USE'));
  });
});

describe('FinanceService tax resolution', () => {
  const rows: Record<string, Partial<TaxRateEntity>> = {
    v1: { id: 'v1', rate: 10, kind: 'STANDARD', validFrom: '2023-07-10', validTo: '2026-12-31' },
    v2: { id: 'v2', rate: 20, kind: 'STANDARD', validFrom: '2027-01-01', supersedesId: 'v1' },
    ex: { id: 'ex', rate: 0, kind: 'EXEMPT', code: 'KDV0' },
  };
  const manager = {
    findOne: jest.fn(async (_e: any, q: any) => {
      if (_e === TaxRateEntity) {
        if (q.where.kind === 'EXEMPT') return rows.ex;
        if (q.where.isDefault) return null;
        return rows[q.where.id] ?? null;
      }
      return COMPANY;
    }),
    find: jest.fn().mockResolvedValue([]),
  };
  const taxCodes = {
    exemption: jest.fn(async (code: string, date: string) => {
      const hit = codesValidOn(EXEMPTION_CODE_SEEDS.map((e) => ({ ...e, validFrom: e.validFrom || '2023-01-01' })), date).find((e) => e.code === code);
      if (!hit) throw new BadRequestException({ code: 'EXEMPTION_CODE_INVALID' });
      return hit;
    }),
    withholding: jest.fn(async (code: string) => {
      const w = WITHHOLDING_CODE_SEEDS.find((x) => x.code === code)!;
      return { ...w, denominator: 10 };
    }),
    otv: jest.fn(),
  };
  const legal = { paramOrNull: jest.fn().mockResolvedValue('PREVIOUS_BULLETIN'), param: jest.fn().mockResolvedValue(12000) };
  const fin = new FinanceService({ companyId: 'c1' } as any, { manager } as any, legal as any, taxCodes as any);

  it('frozen history: before the new version starts the superseded rate applies', async () => {
    expect((await fin.resolveProductRate({ taxRateId: 'v2', name: 'P' }, '2026-10-15', manager as any))!.rate).toBe(10);
    expect((await fin.resolveProductRate({ taxRateId: 'v2', name: 'P' }, '2027-01-02', manager as any))!.rate).toBe(20);
  });

  it('a TR product without a rate is an error, not a silent default', async () => {
    await fin.resolveProductRate({ taxRateId: null, name: 'Çay' }, '2026-10-15', manager as any).catch((e) => expect(err(e)).toBe('PRODUCT_TAX_RATE_MISSING'));
    expect.assertions(1);
  });

  const product = (p: any) => ({ id: 'p', name: 'Ürün', price: 100, currency: 'TRY', taxRateId: 'v1', ...p });
  const doc = (lines: any[], extra: any = {}) =>
    fin.priceDocumentFor({ kind: 'SALE', lines, currency: 'TRY', taxPointDate: '2026-10-15', ...extra }, manager as any);

  it('acceptance: a 0 % line cannot be saved without an exemption code', async () => {
    await doc([{ product: product({ taxRateId: 'ex' }), quantity: 1 }]).catch((e) => expect(err(e)).toBe('EXEMPTION_CODE_REQUIRED'));
    const ok = await doc([{ product: product({ taxRateId: 'ex' }), quantity: 1, exemptionCode: '335' }]);
    expect(ok.doc.taxTotal).toBe(0);
    expect(ok.invoiceTypeHint).toBe('ISTISNA');
  });

  it('export exemption 301 needs a foreign buyer', async () => {
    const domestic = { id: 'k', identityType: 'VKN', address: { country: 'TR' } };
    await doc([{ product: product({}), quantity: 1, exemptionCode: '301' }], { customer: domestic }).catch((e) => expect(err(e)).toBe('EXPORT_REQUIRES_FOREIGN_BUYER'));
    const foreign = { id: 'f', identityType: 'FOREIGN', address: { country: 'GR' } };
    const r = await doc([{ product: product({}), quantity: 2, exemptionCode: '301' }], { customer: foreign });
    expect(r.doc.lines[0].taxRate).toBe(0);
    expect(r.lineMeta[0].taxRateId).toBe('ex');
  });

  it('explicit withholding to a non-taxpayer buyer is refused; the product default is skipped with a warning', async () => {
    const consumer = { id: 'k', identityType: 'TCKN', isVatTaxpayer: false };
    await doc([{ product: product({}), quantity: 200, withholdingCode: '627' }], { customer: consumer }).catch((e) => expect(err(e)).toBe('WITHHOLDING_REQUIRES_TAXPAYER_BUYER'));
    const r = await doc([{ product: product({ withholdingCode: '627' }), quantity: 200 }], { customer: consumer });
    expect(r.doc.withheldTaxTotal).toBe(0);
    expect(r.warnings.map((w) => w.code)).toContain('WITHHOLDING_NOT_APPLICABLE_BUYER');
  });

  it('acceptance: 12.500 TL demir-çelik sale to a VAT taxpayer withholds 5/10 automatically', async () => {
    const buyer = { id: 'b', identityType: 'VKN', isVatTaxpayer: true, isDesignatedBuyer: false };
    const r = await doc([{ product: product({ taxRateId: 'v2', withholdingCode: '627', price: 12500 }), quantity: 1 }], { customer: buyer, taxPointDate: '2027-02-01' });
    expect(r.withholdingApplied).toBe(true);
    expect(r.doc).toMatchObject({ grandTotal: 12500, taxTotal: 2083.33, withheldTaxTotal: 1041.67, payableTotal: 11458.33 });
    expect(r.doc.lines[0].withholdingCode).toBe('627');
  });

  it('a foreign supplier invoice carries no VAT (import, paid at customs)', async () => {
    const r = await fin.priceDocumentFor(
      { kind: 'PURCHASE', lines: [{ product: product({}), quantity: 1 }], currency: 'TRY', taxPointDate: '2026-10-15', supplier: { isForeign: true } as any },
      manager as any,
    );
    expect(r.doc.taxTotal).toBe(0);
    expect(r.isImport).toBe(true);
    expect(r.lineMeta[0].label).toBe('IMPORT_VAT_AT_CUSTOMS');
    expect(r.lineMeta[0].deductibleVat).toBe(0);
  });

  it('engine sanity: priceDocument keeps the frozen per-line rate snapshot it is given', () => {
    expect(priceDocument({ lines: [{ quantity: 1, unitPrice: 110, taxRate: 10 }], pricesIncludeTax: true }).taxTotal).toBe(10);
  });
});
