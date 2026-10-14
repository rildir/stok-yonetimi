export interface DefaultTaxRate {
  name: string;
  rate: number;
  country: string;
  isDefault: boolean;
}

/** Starter tax rates per country (used by seed, migration backfill and sign-up). */
export function defaultTaxRatesFor(country?: string | null): DefaultTaxRate[] {
  switch ((country || '').toUpperCase()) {
    case 'TR':
      return [
        { name: 'KDV %20', rate: 20, country: 'TR', isDefault: true },
        { name: 'KDV %10', rate: 10, country: 'TR', isDefault: false },
        { name: 'KDV %1', rate: 1, country: 'TR', isDefault: false },
      ];
    default:
      return [];
  }
}
