import { CompanyEntity } from '../../entities/company.entity';

export interface FiscalStatus {
  /** All legally required fields are present (for the company's country). */
  complete: boolean;
  missing: string[];
  /** Good practice / conditional fields that are empty. */
  recommended: string[];
}

/**
 * Fiscal completeness. For TR companies the fields printed on every legal
 * document (VUK 227/230, 509 IV.1.3) are required: legal name, VKN/TCKN, tax
 * office, head-office address (street, province, district) and bookkeeping type.
 * MERSİS / trade registry / KEP apply to registered merchants and are recommended.
 */
export function fiscalStatus(c: Pick<CompanyEntity, 'country' | 'legalName' | 'taxIdType' | 'taxId' | 'taxOfficeCode' | 'taxOfficeName' | 'address' | 'bookkeepingType' | 'mersisNo' | 'tradeRegistryNo' | 'kepAddress' | 'email' | 'phone'>): FiscalStatus {
  const missing: string[] = [];
  const recommended: string[] = [];
  const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
  if (!has(c.legalName)) missing.push('legalName');
  if (!has(c.taxId) || !has(c.taxIdType)) missing.push('taxId');
  if ((c.country || 'TR') === 'TR') {
    if (!has(c.taxOfficeName) && !has(c.taxOfficeCode)) missing.push('taxOffice');
    if (!has(c.address?.line1)) missing.push('address.line1');
    if (!has(c.address?.provinceCode)) missing.push('address.province');
    if (!has(c.address?.districtId)) missing.push('address.district');
    if (!has(c.bookkeepingType)) missing.push('bookkeepingType');
    if (c.taxIdType === 'VKN') {
      if (!has(c.mersisNo)) recommended.push('mersisNo');
      if (!has(c.tradeRegistryNo)) recommended.push('tradeRegistryNo');
      if (!has(c.kepAddress)) recommended.push('kepAddress');
    }
    if (!has(c.address?.postalCode)) recommended.push('address.postalCode');
  }
  if (!has(c.email)) recommended.push('email');
  if (!has(c.phone)) recommended.push('phone');
  return { complete: missing.length === 0, missing, recommended };
}
