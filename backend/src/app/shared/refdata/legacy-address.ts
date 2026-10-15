/**
 * Converts pre-WP1 free-text addresses ("Barbaros Mah., Ataşehir, İstanbul",
 * city = "Ankara") into structured address columns. Used by migration
 * 1784274127000 (unit tested in refdata.spec.ts). Nothing is dropped: text that
 * cannot be matched to a province / district stays in line1.
 */
export interface StructuredAddress {
  line1: string | null;
  line2: string | null;
  districtId: number | null;
  district: string | null;
  provinceCode: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  uavtCode: string | null;
}

export interface LegacyAddressInput {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface RefLookup {
  provinces: [string, string][];
  districts: [number, string, string][];
}

export const trKey = (s: string | null | undefined): string =>
  String(s ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');

export function findProvince(name: string | null | undefined, ref: RefLookup): [string, string] | null {
  const k = trKey(name).replace(/ (ili|il)$/, '');
  if (!k) return null;
  return ref.provinces.find(([, n]) => trKey(n) === k) ?? null;
}

export function findDistrict(provinceCode: string, name: string | null | undefined, ref: RefLookup): [number, string, string] | null {
  const k = trKey(name).replace(/ (ilçesi|ilçe)$/, '');
  if (!k) return null;
  return ref.districts.find(([, p, n]) => p === provinceCode && trKey(n) === k) ?? null;
}

export function parseLegacyAddress(input: LegacyAddressInput, ref: RefLookup): StructuredAddress {
  const out: StructuredAddress = {
    line1: null,
    line2: null,
    districtId: null,
    district: null,
    provinceCode: null,
    province: null,
    postalCode: null,
    country: input.country ? String(input.country).trim().toUpperCase().slice(0, 2) || null : null,
    uavtCode: null,
  };
  const parts = String(input.address ?? '')
    .split(/[,/]/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Province: explicit city column first, else the last address segment.
  let prov = findProvince(input.city, ref);
  if (!prov && parts.length) {
    prov = findProvince(parts[parts.length - 1], ref);
    if (prov) parts.pop();
  } else if (prov && parts.length && findProvince(parts[parts.length - 1], ref)?.[0] === prov[0]) {
    parts.pop();
  }
  if (prov) {
    out.provinceCode = prov[0];
    out.province = prov[1];
    out.country = out.country || 'TR';
    const dist = parts.length ? findDistrict(prov[0], parts[parts.length - 1], ref) : null;
    if (dist) {
      out.districtId = dist[0];
      out.district = dist[2];
      parts.pop();
    }
  } else if (input.city && String(input.city).trim()) {
    out.province = String(input.city).trim().slice(0, 100); // foreign / unknown city kept as text
  }
  out.line1 = parts.length ? parts.join(', ').slice(0, 255) : null;
  const pc = String(input.postalCode ?? '').trim();
  out.postalCode = pc ? pc.slice(0, 10) : null;
  return out;
}
