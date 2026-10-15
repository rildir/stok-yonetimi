export interface DefaultTaxRate {
  name: string;
  rate: number;
  country: string;
  isDefault: boolean;
  code?: string;
  kind?: 'STANDARD' | 'EXEMPT';
  isSystem?: boolean;
  validFrom?: string | null;
  taxTypeCode?: string;
}

export interface CatalogRate {
  rate: number;
  code: string;
  isDefault?: boolean;
}

/**
 * Starter tax rates per country (seed, sign-up). For TR they mirror the legal catalog
 * (legal_parameters KDV_RATE_CATALOG; pass the rows valid today when available) plus the
 * KDV0 exemption row: 0 % is not a rate but an exemption that needs a reason code.
 */
export function defaultTaxRatesFor(country?: string | null, catalog?: CatalogRate[] | null, validFrom: string | null = '2023-07-10'): DefaultTaxRate[] {
  switch ((country || '').toUpperCase()) {
    case 'TR': {
      const rows: CatalogRate[] = catalog?.length
        ? catalog
        : [
            { rate: 20, code: 'KDV20', isDefault: true },
            { rate: 10, code: 'KDV10' },
            { rate: 1, code: 'KDV1' },
          ];
      return [
        ...rows.map((r) => ({
          name: `KDV %${r.rate}`,
          rate: r.rate,
          country: 'TR',
          isDefault: !!r.isDefault,
          code: r.code,
          kind: 'STANDARD' as const,
          isSystem: true,
          validFrom,
          taxTypeCode: '0015',
        })),
        { name: 'KDV İstisna (%0)', rate: 0, country: 'TR', isDefault: false, code: 'KDV0', kind: 'EXEMPT' as const, isSystem: true, validFrom: null, taxTypeCode: '0015' },
      ];
    }
    default:
      return [];
  }
}
