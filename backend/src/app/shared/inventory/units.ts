/**
 * Standard units created for every company; names are display fallbacks (UI translates `units.<code>`).
 * UN/ECE codes are not hard-coded: they come from legal parameter UNECE_STANDARD_UNIT_MAP.
 * `lb` is not created for TR companies (3516 s.K., SI units).
 */
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
 * Converts a quantity entered in an alternate unit into base units, rounded to the
 * base unit's precision (integral base units reject fractional results). Shared with
 * the frontend: see @stok/tr-compliance inventory.ts.
 */
export { toBaseQuantity, roundQty, sumQty, addQty, fitsDecimals, STANDARD_UNIT_DECIMALS, NON_SI_STANDARD_UNIT_CODES, NON_SI_UNECE_CODES } from '../tr';
