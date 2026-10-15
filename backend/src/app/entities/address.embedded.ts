import { Column } from 'typeorm';

/**
 * Structured postal address (UBL-TR cac:PostalAddress compatible), embedded with
 * `prefix: false` in companies, customers, customer_addresses, suppliers and
 * warehouses; column names are explicit (addressLine1, addressProvinceCode, ...).
 *
 * For TR addresses `provinceCode` (plate code) and `districtId` reference the
 * global `provinces` / `districts` tables; `province` / `district` are name
 * snapshots filled by the server. Foreign addresses use the free-text names only.
 */
export class AddressColumns {
  @Column({ name: 'addressLine1', type: 'varchar', length: 255, nullable: true })
  line1?: string | null;

  @Column({ name: 'addressLine2', type: 'varchar', length: 255, nullable: true })
  line2?: string | null;

  @Column({ name: 'addressDistrictId', type: 'int', nullable: true })
  districtId?: number | null;

  @Column({ name: 'addressDistrict', type: 'varchar', length: 100, nullable: true })
  district?: string | null;

  /** Province plate code, '01'..'81' */
  @Column({ name: 'addressProvinceCode', type: 'varchar', length: 2, nullable: true })
  provinceCode?: string | null;

  @Column({ name: 'addressProvince', type: 'varchar', length: 100, nullable: true })
  province?: string | null;

  @Column({ name: 'addressPostalCode', type: 'varchar', length: 10, nullable: true })
  postalCode?: string | null;

  /** ISO 3166-1 alpha-2 */
  @Column({ name: 'addressCountry', type: 'varchar', length: 2, nullable: true })
  country?: string | null;

  /** Ulusal Adres Veri Tabanı (UAVT) address code, optional */
  @Column({ name: 'addressUavtCode', type: 'varchar', length: 20, nullable: true })
  uavtCode?: string | null;
}

export const ADDRESS_FIELDS: (keyof AddressColumns)[] = ['line1', 'line2', 'districtId', 'district', 'provinceCode', 'province', 'postalCode', 'country', 'uavtCode'];

/** One-line rendering used in lists and search results. */
export function formatAddress(a?: Partial<AddressColumns> | null): string {
  if (!a) return '';
  const place = [a.district, a.province].filter(Boolean).join(' / ');
  return [a.line1, a.line2, [a.postalCode, place].filter(Boolean).join(' '), a.country && a.country !== 'TR' ? a.country : null]
    .filter((x) => !!x && String(x).trim())
    .join(', ');
}
