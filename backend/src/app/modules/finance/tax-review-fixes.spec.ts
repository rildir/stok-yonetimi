import 'reflect-metadata';
import { FinanceService, storedLineEntry } from '../../shared/services/finance.service';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { LEGAL_PARAMETER_SEEDS } from '../../shared/legal/legal-parameter-seeds';
import { WITHHOLDING_CODE_SEEDS, EXEMPTION_CODE_SEEDS, CODE_LIST_VERSION } from '../../shared/finance/tax-code-seeds';
import { codesValidOn } from '../../shared/services/tax-code.service';
import { expectedBulletinDay, lastPublishedBulletinDay, lastWeekdayOnOrBefore } from '../../shared/finance/currency';
import { isDateKey } from '../../shared/tr';

const err = (e: any) => e?.response?.code;
const catalogRows = LEGAL_PARAMETER_SEEDS.filter((p) => p.key === 'KDV_RATE_CATALOG');

describe('date validation', () => {
  it('rejects impossible calendar days', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-13-45')).toBe(false);
    expect(isDateKey('2026-04-31')).toBe(false);
  });
});

describe('TCMB bulletin day of a tax point', () => {
  it('previous business day, capped at the last published bulletin', () => {
    expect(lastWeekdayOnOrBefore('2026-10-11')).toBe('2026-10-09'); // Sunday -> Friday
    // Tax point Tuesday 13.10 -> Monday 12.10 bulletin
    expect(expectedBulletinDay('2026-10-13', true, '2026-10-15')).toEqual({ expected: '2026-10-12', provisional: false });
    // Tax point Monday -> Friday
    expect(expectedBulletinDay('2026-10-12', true, '2026-10-15')).toEqual({ expected: '2026-10-09', provisional: false });
    // Same-day policy
    expect(expectedBulletinDay('2026-10-13', false, '2026-10-15')).toEqual({ expected: '2026-10-13', provisional: false });
    // Future tax point: provisional, latest published bulletin
    expect(expectedBulletinDay('2027-01-15', true, '2026-10-15')).toEqual({ expected: '2026-10-15', provisional: true });
  });

  it('today counts as published only after 15:30 Europe/Istanbul on a weekday', () => {
    expect(lastPublishedBulletinDay('2026-10-15', 15 * 60 + 29)).toBe('2026-10-14');
    expect(lastPublishedBulletinDay('2026-10-15', 15 * 60 + 30)).toBe('2026-10-15');
    expect(lastPublishedBulletinDay('2026-10-17', 18 * 60)).toBe('2026-10-16'); // Saturday
  });
});

describe('UBL-TR code lists v1.43', () => {
  it('records the package version and carries the full lists', () => {
    expect(CODE_LIST_VERSION).toContain('1.43');
    const w = (c: string) => WITHHOLDING_CODE_SEEDS.find((x) => x.code === c);
    expect(w('627')).toMatchObject({ numerator: 5, exemptForImporterOrOreProducer: true });
    expect(w('624')!.numerator).toBe(2);
    expect(w('625')!.numerator).toBe(3);
    for (let c = 801; c <= 825; c++) expect(w(String(c))).toMatchObject({ numerator: 10, scope: 'FULL' });
    const ex = (c: string, d = '2026-10-15') => codesValidOn(EXEMPTION_CODE_SEEDS.map((e) => ({ ...e, validFrom: e.validFrom || '2023-01-01' })), d).find((e) => e.code === c);
    expect(ex('704')).toMatchObject({ invoiceType: 'IHRACKAYITLI', vatCalculatedNotCollected: true });
    expect(ex('555')).toBeTruthy();
    expect(ex('555', '2026-03-11')).toBeUndefined();
    expect(ex('242')).toBeTruthy();
    expect(new Set(EXEMPTION_CODE_SEEDS.map((e) => e.code)).size).toBe(EXEMPTION_CODE_SEEDS.length);
  });
});

describe('re-pricing a stored line keeps what was entered', () => {
  it('uses the entered price, discount and withholding intent', () => {
    const e = storedLineEntry(
      { quantity: 10, unitQuantity: 10, unitFactor: 1, unitPrice: 100, enteredUnitPrice: 120, taxRate: 20, discountRate: 0, discountAmount: 50, discountAmountEntered: 60, exemptionCode: null, withholdingCodeEntered: null },
      true,
    );
    expect(e).toMatchObject({ quantity: 10, unitPrice: 120, discountAmount: 60, discountRate: null, exemptionCode: '', withholdingCode: null });
  });

  it('legacy lines are grossed up for tax-inclusive prices; legacy 0 % lines fall back to the product exemption', () => {
    const e = storedLineEntry({ quantity: 2, unitPrice: 100, taxRate: 20, discountAmount: 10, exemptionCode: null }, true);
    expect(e).toMatchObject({ unitPrice: 120, discountAmount: 12 });
    expect(storedLineEntry({ quantity: 1, unitPrice: 50, taxRate: 0, exemptionCode: null }, true).exemptionCode).toBeNull();
    expect(storedLineEntry({ quantity: 1, unitPrice: 50, taxRate: 20, withholdingCodeEntered: '' }, false).withholdingCode).toBe('');
  });
});

describe('FinanceService review fixes', () => {
  const COMPANY = { id: 'c1', country: 'TR', timezone: 'Europe/Istanbul', baseCurrency: 'TRY', pricesIncludeTax: true, fxAutoFetch: false, isImporterOrOreProducer: false, isDesignatedBuyer: false };

  function make(opts: { rates?: any[]; company?: any; staleDays?: number | null } = {}) {
    const company = { ...COMPANY, ...opts.company };
    const rows: Record<string, any> = {
      k20: { id: 'k20', companyId: 'c1', rate: 20, kind: 'STANDARD', code: 'KDV20', validFrom: '2023-07-10', supersedesId: null, taxTypeCode: '0015' },
      ex: { id: 'ex', rate: 0, kind: 'EXEMPT', code: 'KDV0' },
    };
    const saved: any[] = [];
    const manager = {
      findOne: jest.fn(async (e: any, q: any) => {
        if (e === TaxRateEntity) {
          if (q.where.kind === 'EXEMPT') return rows['ex'];
          if (q.where.isDefault) return null;
          return rows[q.where.id] ?? null;
        }
        return company;
      }),
      find: jest.fn(async (e: any, q: any) => {
        if (e === TaxRateEntity) return Object.values(rows).filter((r) => r.code === q.where.code);
        return opts.rates || [];
      }),
      create: jest.fn((_e: any, x: any) => x),
      save: jest.fn(async (_e: any, x: any) => {
        const row = { id: `new${saved.length}`, ...x };
        saved.push(row);
        rows[row.id] = row;
        return row;
      }),
      update: jest.fn(async (_e: any, where: any, patch: any) => Object.assign(rows[where.id], patch)),
    };
    const legal = {
      paramOrNull: jest.fn(async (key: string) => (key === 'KDV_FX_RATE_DAY' ? 'PREVIOUS_BULLETIN' : key === 'KDV_FX_MAX_STALE_DAYS' ? (opts.staleDays === undefined ? 10 : opts.staleDays) : null)),
      param: jest.fn().mockResolvedValue(12000),
      list: jest.fn().mockResolvedValue(catalogRows),
    };
    const taxCodes = {
      exemption: jest.fn(),
      withholding: jest.fn(async (code: string) => ({ ...WITHHOLDING_CODE_SEEDS.find((x) => x.code === code)!, denominator: 10 })),
      otv: jest.fn(),
    };
    const fin = new FinanceService({ companyId: 'c1' } as any, { manager } as any, legal as any, taxCodes as any);
    return { fin, manager, rows, saved };
  }

  it('a tax point before 10.07.2023 resolves the KDV20 catalog row to KDV18 (created once, linked)', async () => {
    const { fin, rows, saved } = make();
    const r = await fin.resolveProductRate({ taxRateId: 'k20', name: 'Demir' }, '2023-07-01', (fin as any).dataSource.manager);
    expect(r).toMatchObject({ rate: 18, code: 'KDV18', validFrom: '2008-01-01', validTo: '2023-07-09', isSystem: true });
    expect(rows['k20'].supersedesId).toBe(saved[0].id);
    // second call walks the version chain, no new row
    const again = await fin.resolveProductRate({ taxRateId: 'k20', name: 'Demir' }, '2023-07-01', (fin as any).dataSource.manager);
    expect(again!.rate).toBe(18);
    expect(saved).toHaveLength(1);
    expect((await fin.resolveProductRate({ taxRateId: 'k20', name: 'Demir' }, '2026-10-15', (fin as any).dataSource.manager))!.rate).toBe(20);
  });

  it('a tax point before any catalog entry is refused', async () => {
    const { fin } = make();
    await fin.resolveProductRate({ taxRateId: 'k20', name: 'Demir' }, '2007-05-01', (fin as any).dataSource.manager).catch((e) => expect(err(e)).toBe('TAX_RATE_NOT_VALID_ON_DATE'));
    expect.assertions(1);
  });

  it('an impossible tax point date is a coded 400, not a 500', async () => {
    const { fin } = make();
    await fin
      .priceDocumentFor({ kind: 'SALE', lines: [], currency: 'TRY', taxPointDate: '2026-02-30' }, (fin as any).dataSource.manager)
      .catch((e) => expect(err(e)).toBe('VALIDATION_DATE'));
    expect.assertions(1);
  });

  const usd = (date: string) => ({ baseCurrency: 'USD', quoteCurrency: 'TRY', rate: 40, date, source: 'TCMB', rateType: 'FOREX_BUYING' });

  it('an older rate than the expected bulletin is flagged stale, refused when freezing, and refused when too old', async () => {
    const { fin } = make({ rates: [usd('2026-10-09')] });
    const m = (fin as any).dataSource.manager;
    const fx = await fin.taxFxRate('USD', '2026-10-13', m);
    expect(fx).toMatchObject({ date: '2026-10-09', expectedDate: '2026-10-12', stale: true });
    await fin.taxFxRate('USD', '2026-10-13', m, { strict: true }).catch((e) => expect(err(e)).toBe('FX_RATE_STALE'));
    const old = make({ rates: [usd('2026-09-01')] });
    await old.fin.taxFxRate('USD', '2026-10-13', (old.fin as any).dataSource.manager).catch((e) => expect(err(e)).toBe('FX_RATE_STALE'));
    expect.assertions(3);
  });

  it('the bulletin of the expected day is used as is', async () => {
    const { fin } = make({ rates: [usd('2026-10-09'), { ...usd('2026-10-12'), rate: 41 }] });
    const fx = await fin.taxFxRate('USD', '2026-10-13', (fin as any).dataSource.manager, { strict: true });
    expect(fx).toMatchObject({ rate: 41, date: '2026-10-12' });
    expect(fx.stale).toBeUndefined();
  });

  const iron = { id: 'p', name: 'İnşaat demiri', price: 12500, currency: 'TRY', taxRateId: 'k20', withholdingCode: '627' };

  it('a designated buyer that is not VAT-registered (public body) still withholds 627', async () => {
    const { fin } = make();
    const kamu = { id: 'k', identityType: 'VKN', isVatTaxpayer: false, isDesignatedBuyer: true };
    const r = await fin.priceDocumentFor({ kind: 'SALE', lines: [{ product: iron as any, quantity: 1 }], currency: 'TRY', taxPointDate: '2026-10-15', customer: kamu as any }, (fin as any).dataSource.manager);
    expect(r.doc.withheldTaxTotal).toBe(1041.67);
  });

  it('purchases: the company is the buyer (designated-only codes need the company flag); 627 from an importer supplier is not withheld', async () => {
    const { fin } = make();
    const m = (fin as any).dataSource.manager;
    const supplier = { id: 's', isVatTaxpayer: true, isForeign: false, isImporterOrOreProducer: false };
    const service = { ...iron, withholdingCode: '612', price: 20000 };
    const p1 = await fin.priceDocumentFor({ kind: 'PURCHASE', lines: [{ product: service as any, quantity: 1 }], currency: 'TRY', taxPointDate: '2026-10-15', supplier: supplier as any }, m);
    expect(p1.doc.withheldTaxTotal).toBe(0);
    expect(p1.warnings.map((w) => w.code)).toContain('WITHHOLDING_NOT_APPLICABLE_PURCHASE');
    const designated = make({ company: { isDesignatedBuyer: true } });
    const p2 = await designated.fin.priceDocumentFor({ kind: 'PURCHASE', lines: [{ product: service as any, quantity: 1 }], currency: 'TRY', taxPointDate: '2026-10-15', supplier: supplier as any }, (designated.fin as any).dataSource.manager);
    expect(p2.doc.withheldTaxTotal).toBeGreaterThan(0);
    const p3 = await fin.priceDocumentFor(
      { kind: 'PURCHASE', lines: [{ product: iron as any, quantity: 1 }], currency: 'TRY', taxPointDate: '2026-10-15', supplier: { ...supplier, isImporterOrOreProducer: true } as any },
      m,
    );
    expect(p3.doc.withheldTaxTotal).toBe(0);
    expect(p3.warnings.map((w) => w.code)).toContain('WITHHOLDING_SUPPLIER_EXEMPT');
  });

  it('the line keeps the entered withholding intent even when the threshold is not reached', async () => {
    const { fin } = make();
    const buyer = { id: 'b', identityType: 'VKN', isVatTaxpayer: true };
    const r = await fin.priceDocumentFor({ kind: 'SALE', lines: [{ product: { ...iron, price: 1000 } as any, quantity: 1 }], currency: 'TRY', taxPointDate: '2026-10-15', customer: buyer as any }, (fin as any).dataSource.manager);
    expect(r.doc.withheldTaxTotal).toBe(0);
    expect(r.lineMeta[0].withholdingCodeEntered).toBeNull(); // product default stays in force for re-pricing
  });
});
