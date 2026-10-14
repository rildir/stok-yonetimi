import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { err } from '../i18n/app-error';
import { TenantContext } from '../tenant/tenant-context.service';
import { UnitEntity } from '../../entities/unit.entity';
import { ProductEntity } from '../../entities/product.entity';
import { ProductUnitEntity } from '../../entities/product-unit.entity';
import { DEFAULT_UNIT_CODE, STANDARD_UNITS, toBaseQuantity } from '../inventory/units';

export interface LineUnit {
  unitId: string | null;
  unitCode: string;
  factor: number;
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

  /** Creates any missing standard unit for the company (idempotent). */
  async ensureStandardUnits(companyId: string, manager?: EntityManager): Promise<UnitEntity[]> {
    const mgr = this.m(manager);
    const existing = await mgr.find(UnitEntity, { where: { companyId } });
    for (const s of STANDARD_UNITS) {
      if (!existing.some((u) => u.code === s.code)) {
        existing.push(await mgr.save(UnitEntity, mgr.create(UnitEntity, { companyId, code: s.code, name: s.name, isStandard: true })));
      }
    }
    return existing;
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

  async create(data: { code: string; name: string }): Promise<UnitEntity> {
    const code = this.normCode(data.code);
    if (!code) throw new BadRequestException(err('UNIT_CODE_REQUIRED'));
    if (await this.dataSource.manager.exists(UnitEntity, { where: { companyId: this.tenant.companyId, code } })) {
      throw new BadRequestException(err('UNIT_CODE_TAKEN', { code }));
    }
    return this.dataSource.manager.save(
      UnitEntity,
      this.dataSource.manager.create(UnitEntity, { companyId: this.tenant.companyId, code, name: String(data.name || code).trim(), isStandard: false }),
    );
  }

  async update(id: string, data: { code?: string; name?: string }): Promise<UnitEntity> {
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
    if (!unitId || unitId === product.baseUnitId) {
      return { unitId: product.baseUnitId || null, unitCode: product.unit || DEFAULT_UNIT_CODE, factor: 1 };
    }
    const pu = await manager.findOne(ProductUnitEntity, {
      where: { companyId: product.companyId, productId: product.id, unitId },
      relations: { unit: true },
    });
    if (!pu) throw new BadRequestException(err('UNIT_NOT_FOR_PRODUCT', { name: product.name }));
    return { unitId, unitCode: pu.unit?.code || '?', factor: Number(pu.factor) };
  }

  /** Converts a line quantity to base units (must be a positive integer). */
  toBase(product: ProductEntity, quantity: number, lu: LineUnit): number {
    const base = toBaseQuantity(Number(quantity), lu.factor);
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
