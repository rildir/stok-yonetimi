/** Standard units created for every company; names are display fallbacks (UI translates `units.<code>`). */
export const STANDARD_UNITS: { code: string; name: string }[] = [
  { code: 'pcs', name: 'Adet' },
  { code: 'box', name: 'Kutu' },
  { code: 'pack', name: 'Paket' },
  { code: 'pallet', name: 'Palet' },
  { code: 'kg', name: 'Kilogram' },
  { code: 'g', name: 'Gram' },
  { code: 'lb', name: 'Libre' },
  { code: 'l', name: 'Litre' },
  { code: 'ml', name: 'Mililitre' },
  { code: 'm', name: 'Metre' },
];

export const DEFAULT_UNIT_CODE = 'pcs';

/** Maps legacy free-text `products.unit` values to standard unit codes. */
const LEGACY_UNIT_MAP: Record<string, string> = {
  adet: 'pcs', ad: 'pcs', piece: 'pcs', pcs: 'pcs', pc: 'pcs', unit: 'pcs',
  kutu: 'box', box: 'box', koli: 'box',
  paket: 'pack', pack: 'pack',
  palet: 'pallet', pallet: 'pallet',
  kg: 'kg', kilogram: 'kg', kilo: 'kg',
  g: 'g', gr: 'g', gram: 'g',
  lb: 'lb', libre: 'lb', pound: 'lb',
  l: 'l', lt: 'l', litre: 'l', liter: 'l',
  ml: 'ml', mililitre: 'ml',
  m: 'm', metre: 'm', meter: 'm', mt: 'm',
};

export function legacyUnitCode(unit: string | null | undefined): string | null {
  const k = (unit || '').trim().toLocaleLowerCase('tr');
  if (!k) return DEFAULT_UNIT_CODE;
  return LEGACY_UNIT_MAP[k] ?? null;
}

/**
 * Converts a quantity entered in an alternate unit into base units.
 * Stock is integral, so the result must be a positive integer; returns null otherwise.
 */
export function toBaseQuantity(quantity: number, factor: number): number | null {
  if (!(quantity > 0) || !(factor > 0)) return null;
  const raw = quantity * factor;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-6 || rounded <= 0) return null;
  return rounded;
}
