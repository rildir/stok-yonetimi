import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { err } from '../i18n/app-error';
import { TenantContext } from '../tenant/tenant-context.service';
import { UnitEntity } from '../../entities/unit.entity';
import { ProductEntity } from '../../entities/product.entity';
import { ProductUnitEntity } from '../../entities/product-unit.entity';
import { DEFAULT_UNIT_CODE, STANDARD_UNITS, toBaseQuantity } from '../inventory/units';
import { CompanyEntity } from '../../entities/company.entity';
import { LegalParameterEntity } from '../../entities/legal-parameter.entity';
import { pickParameter } from './legal-parameter.service';
import { fitsDecimals, isUneceCode, maxDecimalsForUnece, NON_SI_STANDARD_UNIT_CODES, NON_SI_UNECE_CODES, STANDARD_UNIT_DECIMALS, UNIT_MAX_DECIMALS } from '../tr';

export interface UnitInput {
  code?: string;
  name?: string;
  decimals?: number;
  uneceCode?: string | null;
  allowsFraction?: boolean;
}

export interface LineUnit {
  unitId: string | null;
  unitCode: string;
  factor: number;
  /** Decimals allowed for quantities entered in this unit */
  decimals: number;
  /** Decimals of the product's base unit (stock precision) */
  baseDecimals: number;
}

/** Units of measure (per company) and product unit conversions. */
@Injectable()
export class UnitService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  private m(manager?: EntityManager): EntityManager {
    return manager || this.dataSource.manager;
  }

  private async company(companyId: string, manager?: EntityManager): Promise<CompanyEntity | null> {
    return this.m(manager).findOne(CompanyEntity, { where: { id: companyId }, select: ['id', 'country'] });
  }

  /** Standard unit -> UN/ECE code (legal parameter UNECE_STANDARD_UNIT_MAP; pack / pallet need confirmation). */
  async standardUneceMap(manager?: EntityManager): Promise<Record<string, string>> {
    const rows = await this.m(manager).find(LegalParameterEntity, { where: { country: 'TR', key: 'UNECE_STANDARD_UNIT_MAP' } });
    return (pickParameter(rows, new Date().toISOString().slice(0, 10))?.value as Record<string, string>) || {};
  }

  /**
   * Creates any missing standard unit for the company (idempotent). Turkish companies
   * do not get non-SI units (lb); existing ones are listed as `deprecated`.
   */
  async ensureStandardUnits(companyId: string, manager?: EntityManager): Promise<UnitEntity[]> {
    const mgr = this.m(manager);
    const existing = await mgr.find(UnitEntity, { where: { companyId } });
    const tr = (await this.company(companyId, manager))?.country === 'TR';
    const missing = STANDARD_UNITS.filter((s) => !existing.some((u) => u.code === s.code) && !(tr && NON_SI_STANDARD_UNIT_CODES.includes(s.code)));
    if (missing.length) {
      const unece = await this.standardUneceMap(manager);
      for (const s of missing) {
        const decimals = STANDARD_UNIT_DECIMALS[s.code] ?? 0;
        existing.push(
          await mgr.save(
            UnitEntity,
            mgr.create(UnitEntity, { companyId, code: s.code, name: s.name, isStandard: true, decimals, allowsFraction: decimals > 0, uneceCode: unece[s.code] ?? null }),
          ),
        );
      }
    }
    for (const u of existing) {
      u.deprecated = tr && (NON_SI_STANDARD_UNIT_CODES.includes(u.code) || (!!u.uneceCode && NON_SI_UNECE_CODES.includes(u.uneceCode)));
    }
    return existing;
  }

  /** Validates precision / UN/ECE code and copies them onto `unit`. */
  private async applyCodeFields(unit: UnitEntity, data: UnitInput, isCreate: boolean): Promise<void> {
    const tr = (await this.company(this.tenant.companyId))?.country === 'TR';
    if (data.decimals !== undefined) {
      const d = Number(data.decimals);
      if (!Number.isInteger(d) || d < 0 || d > UNIT_MAX_DECIMALS) throw new BadRequestException(err('UNIT_DECIMALS_INVALID', { max: UNIT_MAX_DECIMALS }));
      unit.decimals = d;
    }
    if (data.allowsFraction !== undefined) unit.allowsFraction = !!data.allowsFraction;
    if (data.allowsFraction === false) unit.decimals = 0;
    else if (data.decimals !== undefined) unit.allowsFraction = unit.decimals > 0;
    if (data.uneceCode !== undefined) {
      const code = data.uneceCode ? String(data.uneceCode).trim().toUpperCase() : null;
      if (code && !isUneceCode(code)) throw new BadRequestException(err('UNECE_CODE_INVALID', { code }));
      if (code && tr && NON_SI_UNECE_CODES.includes(code)) throw new BadRequestException(err('UNIT_NOT_ALLOWED_IN_COUNTRY', { code }));
      unit.uneceCode = code;
    }
    // e-Belge lines need a UN/ECE code: required for new units of Turkish companies.
    if (isCreate && tr && !unit.uneceCode) throw new BadRequestException(err('UNIT_CODE_MISSING', { unit: unit.code }));
    // Count / package codes (C62, DZN, BX, ...) are whole units.
    if (unit.uneceCode && unit.decimals > maxDecimalsForUnece(unit.uneceCode)) {
      throw new BadRequestException(err('UNIT_DECIMALS_NOT_ALLOWED_FOR_CODE', { code: unit.uneceCode, max: maxDecimalsForUnece(unit.uneceCode) }));
    }
  }

  /** Lowering a unit's precision must not strand existing fractional stock. */
  private async assertDecimalsFit(unit: UnitEntity): Promise<void> {
    const products = await this.dataSource.manager.find(ProductEntity, {
      where: { companyId: this.tenant.companyId, baseUnitId: unit.id, isDeleted: false },
      select: ['id', 'quantity', 'minQuantity'],
    });
    if (products.some((p) => !fitsDecimals(p.quantity, unit.decimals) || !fitsDecimals(p.minQuantity, unit.decimals))) {
      throw new BadRequestException(err('UNIT_DECIMALS_IN_USE', { decimals: unit.decimals }));
    }
  }

  async defaultUnit(companyId: string, manager?: EntityManager): Promise<UnitEntity> {
    const units = await this.ensureStandardUnits(companyId, manager);
    return units.find((u) => u.code === DEFAULT_UNIT_CODE) as UnitEntity;
  }

  async list(): Promise<UnitEntity[]> {
    const units = await this.ensureStandardUnits(this.tenant.companyId);
    return units.sort((a, b) => Number(b.isStandard) - Number(a.isStandard) || a.code.localeCompare(b.code));
  }

  async requireUnit(unitId: string, manager?: EntityManager): Promise<UnitEntity> {
    const unit = await this.m(manager).findOne(UnitEntity, { where: { id: unitId, companyId: this.tenant.companyId } });
    if (!unit) throw new BadRequestException(err('UNIT_NOT_FOUND'));
    return unit;
  }

  private normCode(code: string): string {
    return String(code || '').trim().toLowerCase();
  }

  async create(data: UnitInput & { code: string; name: string }): Promise<UnitEntity> {
    const code = this.normCode(data.code);
    if (!code) throw new BadRequestException(err('UNIT_CODE_REQUIRED'));
    if (await this.dataSource.manager.exists(UnitEntity, { where: { companyId: this.tenant.companyId, code } })) {
      throw new BadRequestException(err('UNIT_CODE_TAKEN', { code }));
    }
    const unit = this.dataSource.manager.create(UnitEntity, {
      companyId: this.tenant.companyId, code, name: String(data.name || code).trim(), isStandard: false, decimals: 0, allowsFraction: false, uneceCode: null,
    });
    await this.applyCodeFields(unit, data, true);
    return this.dataSource.manager.save(UnitEntity, unit);
  }

  async update(id: string, data: UnitInput): Promise<UnitEntity> {
    const unit = await this.dataSource.manager.findOne(UnitEntity, { where: { id, companyId: this.tenant.companyId } });
    if (!unit) throw new NotFoundException(err('UNIT_NOT_FOUND'));
    if (data.code !== undefined && this.normCode(data.code) !== unit.code) {
      if (unit.isStandard) throw new BadRequestException(err('UNIT_STANDARD_CODE_LOCKED'));
      const code = this.normCode(data.code);
      if (!code) throw new BadRequestException(err('UNIT_CODE_REQUIRED'));
      if (await this.dataSource.manager.exists(UnitEntity, { where: { companyId: this.tenant.companyId, code } })) {
        throw new BadRequestException(err('UNIT_CODE_TAKEN', { code }));
      }
      unit.code = code;
      await this.dataSource.manager.update(ProductEntity, { companyId: this.tenant.companyId, baseUnitId: unit.id }, { unit: code });
    }
    if (data.name !== undefined && String(data.name).trim()) unit.name = String(data.name).trim();
    const prevDecimals = unit.decimals;
    await this.applyCodeFields(unit, data, false);
    if (unit.decimals < prevDecimals) await this.assertDecimalsFit(unit);
    return this.dataSource.manager.save(UnitEntity, unit);
  }

  async remove(id: string): Promise<boolean> {
    const unit = await this.dataSource.manager.findOne(UnitEntity, { where: { id, companyId: this.tenant.companyId } });
    if (!unit) return false;
    if (unit.isStandard) throw new BadRequestException(err('UNIT_STANDARD_DELETE'));
    const used =
      (await this.dataSource.manager.exists(ProductEntity, { where: { companyId: this.tenant.companyId, baseUnitId: id, isDeleted: false } })) ||
      (await this.dataSource.manager.exists(ProductUnitEntity, { where: { companyId: this.tenant.companyId, unitId: id } }));
    if (used) throw new BadRequestException(err('UNIT_IN_USE'));
    await this.dataSource.manager.remove(UnitEntity, unit);
    return true;
  }

  /**
   * Resolves the unit a document line was entered in. `unitId` omitted or
   * equal to the base unit => factor 1; otherwise it must be one of the
   * product's alternate units.
   */
  async resolveLineUnit(manager: EntityManager, product: ProductEntity, unitId?: string | null): Promise<LineUnit> {
    const baseUnit = product.baseUnitId ? await manager.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: product.companyId } }) : null;
    // Serial-tracked stock is counted in whole pieces.
    const baseDecimals = product.trackingType === 'serial' ? 0 : Number(baseUnit?.decimals) || 0;
    if (!unitId || unitId === product.baseUnitId) {
      return { unitId: product.baseUnitId || null, unitCode: product.unit || DEFAULT_UNIT_CODE, factor: 1, decimals: baseDecimals, baseDecimals };
    }
    const pu = await manager.findOne(ProductUnitEntity, {
      where: { companyId: product.companyId, productId: product.id, unitId },
      relations: { unit: true },
    });
    if (!pu) throw new BadRequestException(err('UNIT_NOT_FOR_PRODUCT', { name: product.name }));
    return { unitId, unitCode: pu.unit?.code || '?', factor: Number(pu.factor), decimals: Number(pu.unit?.decimals) || 0, baseDecimals };
  }

  /**
   * Converts a line quantity to base units. The entered quantity must fit the line
   * unit's precision; the result is rounded to the base unit's precision (integral
   * base units reject fractional results).
   */
  toBase(product: ProductEntity, quantity: number, lu: LineUnit): number {
    if (!fitsDecimals(Number(quantity), lu.decimals)) {
      throw new BadRequestException(err('QUANTITY_PRECISION_EXCEEDED', { quantity, decimals: lu.decimals }));
    }
    const base = toBaseQuantity(Number(quantity), lu.factor, lu.baseDecimals);
    if (base === null) throw new BadRequestException(err('UNIT_QUANTITY_NOT_INTEGRAL', { name: product.name, unit: lu.unitCode }));
    return base;
  }

  /** Loads base unit + alternate units onto products for API responses. */
  async attachUnits<T extends ProductEntity>(manager: EntityManager, companyId: string, products: T[]): Promise<T[]> {
    if (!products.length) return products;
    const units = await manager.find(UnitEntity, { where: { companyId } });
    const alts = await manager.find(ProductUnitEntity, {
      where: { companyId, productId: In(products.map((p) => p.id)) },
    });
    for (const p of products) {
      p.baseUnit = units.find((u) => u.id === p.baseUnitId) || null;
      p.units = alts
        .filter((a) => a.productId === p.id)
        .map((a) => ({ ...a, unit: units.find((u) => u.id === a.unitId) }) as ProductUnitEntity);
    }
    return products;
  }
}
