import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { err } from '../i18n/app-error';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { AddressColumns } from '../../entities/address.embedded';
import { isValidTrPostalCode } from '../tr';
import { trKey } from '../refdata/legacy-address';

export type AddressInput = Partial<AddressColumns> | string | null | undefined;

const clean = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Global reference data (provinces, districts, tax offices) with an in-memory
 * cache (the tables are static, seeded by migration). Also validates and
 * normalizes structured addresses / tax office references for every module.
 */
@Injectable()
export class RefdataService {
  private provinces: ProvinceEntity[] | null = null;
  private districts: DistrictEntity[] | null = null;
  private taxOffices: TaxOfficeEntity[] | null = null;

  constructor(private readonly dataSource: DataSource) {}

  private async load() {
    if (this.provinces && this.districts && this.taxOffices) return;
    const m = this.dataSource.manager;
    const collator = new Intl.Collator('tr');
    this.provinces = (await m.find(ProvinceEntity)).sort((a, b) => a.code.localeCompare(b.code));
    this.districts = (await m.find(DistrictEntity)).sort((a, b) => collator.compare(a.name, b.name));
    this.taxOffices = (await m.find(TaxOfficeEntity)).sort((a, b) => collator.compare(a.name, b.name));
  }

  /** Drops the cache (tests / after re-seeding). */
  invalidate() {
    this.provinces = this.districts = this.taxOffices = null;
  }

  async listProvinces(): Promise<ProvinceEntity[]> {
    await this.load();
    return this.provinces!;
  }

  async listDistricts(provinceCode?: string | null): Promise<DistrictEntity[]> {
    await this.load();
    const code = provinceCode ? String(provinceCode).padStart(2, '0') : null;
    return code ? this.districts!.filter((d) => d.provinceCode === code) : this.districts!;
  }

  async listTaxOffices(provinceCode?: string | null, q?: string | null, limit = 500): Promise<TaxOfficeEntity[]> {
    await this.load();
    const code = provinceCode ? String(provinceCode).padStart(2, '0') : null;
    const needle = trKey(q);
    return this.taxOffices!
      .filter((t) => (!code || t.provinceCode === code) && (!needle || trKey(t.name).includes(needle) || t.code.startsWith(needle)))
      .slice(0, Math.max(1, Math.min(limit, 1000)));
  }

  async province(code: string | null | undefined): Promise<ProvinceEntity | null> {
    if (!code) return null;
    await this.load();
    return this.provinces!.find((p) => p.code === String(code).padStart(2, '0')) ?? null;
  }

  async district(id: number | null | undefined): Promise<DistrictEntity | null> {
    if (id === null || id === undefined || (id as unknown) === '') return null;
    await this.load();
    return this.districts!.find((d) => d.id === Number(id)) ?? null;
  }

  async taxOffice(code: string | null | undefined): Promise<TaxOfficeEntity | null> {
    if (!code) return null;
    await this.load();
    return this.taxOffices!.find((t) => t.code === String(code).trim()) ?? null;
  }

  /**
   * Validates and normalizes an address. TR addresses: province code must exist,
   * district must belong to it, postal code must match the province; name
   * snapshots are filled from the reference tables. A plain string (legacy
   * clients) becomes line1. `defaultCountry` applies when no country is given.
   */
  async normalizeAddress(input: AddressInput, defaultCountry: string | null = 'TR'): Promise<AddressColumns> {
    const a: Partial<AddressColumns> = typeof input === 'string' ? { line1: input } : input || {};
    const out = new AddressColumns();
    out.line1 = clean(a.line1, 255);
    out.line2 = clean(a.line2, 255);
    out.uavtCode = clean(a.uavtCode, 20);
    out.postalCode = clean(a.postalCode, 10);
    const hasAny = !!(out.line1 || out.line2 || a.provinceCode || a.districtId || out.postalCode || a.province || a.district);
    out.country = (clean(a.country, 2) || (hasAny ? defaultCountry : null))?.toUpperCase() ?? null;

    if (out.country === 'TR') {
      const prov = a.provinceCode ? await this.province(a.provinceCode) : null;
      if (a.provinceCode && !prov) throw new BadRequestException(err('INVALID_PROVINCE'));
      out.provinceCode = prov?.code ?? null;
      out.province = prov?.name ?? null;
      if (a.districtId !== undefined && a.districtId !== null && (a.districtId as unknown) !== '') {
        const dist = await this.district(a.districtId);
        if (!dist || !prov || dist.provinceCode !== prov.code) throw new BadRequestException(err('INVALID_DISTRICT'));
        out.districtId = dist.id;
        out.district = dist.name;
      } else {
        out.districtId = null;
        out.district = null;
      }
      if (out.postalCode && !isValidTrPostalCode(out.postalCode, out.provinceCode)) throw new BadRequestException(err('INVALID_POSTAL_CODE'));
    } else {
      // Foreign / unknown country: free-text names, no TR codes.
      out.provinceCode = null;
      out.districtId = null;
      out.province = clean(a.province, 100);
      out.district = clean(a.district, 100);
    }
    return out;
  }

  /** Tax office by code (name snapshot from the GİB list) or free-text name when no code is given. */
  async resolveTaxOffice(code: string | null | undefined, name: string | null | undefined): Promise<{ code: string | null; name: string | null }> {
    const c = clean(code, 10);
    if (c) {
      const office = await this.taxOffice(c);
      if (!office) throw new BadRequestException(err('INVALID_TAX_OFFICE'));
      return { code: office.code, name: office.name };
    }
    return { code: null, name: clean(name, 150) };
  }
}
