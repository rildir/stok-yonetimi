import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, MoreThan } from 'typeorm';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { dateKeyInZone, fitsDecimals, roundQty, transferNeedsDespatch, warehouseTypeAllowsSale } from '../../shared/tr';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { StockMovementType } from '../../entities/enums';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { RefdataService } from '../../shared/services/refdata.service';
import { FinanceService } from '../../shared/services/finance.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../../dto/warehouse.dto';
import { formatAddress } from '../../entities/address.embedded';
import { convertAmount } from '../../shared/finance/currency';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly warehouseStock: WarehouseStockService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
    private readonly refdata: RefdataService,
    private readonly finance: FinanceService,
  ) {}

  /** Copies DTO fields onto the entity; the address is validated against the TR reference data. */
  private async apply(wh: WarehouseEntity, dto: CreateWarehouseDto | UpdateWarehouseDto, isCreate: boolean): Promise<void> {
    if (dto.name !== undefined) wh.name = dto.name;
    if (dto.code !== undefined) wh.code = dto.code;
    if (dto.isBranch !== undefined) wh.isBranch = !!dto.isBranch;
    if (dto.branchCode !== undefined) wh.branchCode = dto.branchCode || null;
    if (dto.siteGroup !== undefined) wh.siteGroup = dto.siteGroup ? dto.siteGroup.trim() || null : null;
    if (dto.defaultSeries !== undefined) wh.defaultSeries = dto.defaultSeries || null;
    if (dto.type !== undefined) wh.type = dto.type || 'NORMAL';
    if (dto.ownership !== undefined) wh.ownership = dto.ownership || 'OWN';
    if (dto.isSellable !== undefined) wh.isSellable = !!dto.isSellable;
    if (isCreate && dto.isSellable === undefined) wh.isSellable = true;
    // Quarantine (awaiting destruction) and goods in transit are never sellable.
    if (!warehouseTypeAllowsSale(wh.type)) wh.isSellable = false;
    if (dto.address !== undefined || isCreate) {
      const country = (await this.finance.getCompany()).country || 'TR';
      wh.address = await this.refdata.normalizeAddress(dto.address || {}, country);
    }
  }

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getWarehouses(): Promise<any[]> {
    const activeWarehouses = await this.warehouseRepo.find({
      where: { companyId: this.companyId, isDeleted: false },
      order: { createdAt: 'ASC', name: 'ASC' },
    });
    const agg = await this.dataSource
      .getRepository(ProductWarehouseStockEntity)
      .createQueryBuilder('s')
      .innerJoin(ProductEntity, 'p', 'p.id = s.productId')
      .select('s.warehouseId', 'warehouseId')
      .addSelect('SUM(CASE WHEN s.quantity > 0 AND p.isDeleted = false THEN 1 ELSE 0 END)', 'productCount')
      // Stock of soft-deleted products is still physical stock (and part of the legal inventory).
      .addSelect('COALESCE(SUM(s.quantity), 0)', 'totalStock')
      // WP6: the stock value is the value at cost (VUK 274): quantity x the product's average layer cost.
      .addSelect(
        'COALESCE(SUM(s.quantity * COALESCE((SELECT SUM(l.qtyRemaining * l.unitCost) / NULLIF(SUM(l.qtyRemaining), 0) FROM stock_cost_layers l WHERE l.companyId = s.companyId AND l.productId = s.productId AND l.qtyRemaining > 0), 0)), 0)',
        'totalValue',
      )
      .where('s.companyId = :companyId', { companyId: this.companyId })
      .groupBy('s.warehouseId')
      .getRawMany();
    // Information only: quantity x sales price, converted per price currency to the base currency.
    const salesRows: { warehouseId: string; currency: string | null; v: string }[] = await this.dataSource
      .getRepository(ProductWarehouseStockEntity)
      .createQueryBuilder('s')
      .innerJoin(ProductEntity, 'p', 'p.id = s.productId AND p.isDeleted = false')
      .select('s.warehouseId', 'warehouseId')
      .addSelect('p.currency', 'currency')
      .addSelect('COALESCE(SUM(s.quantity * p.price), 0)', 'v')
      .where('s.companyId = :companyId', { companyId: this.companyId })
      .groupBy('s.warehouseId')
      .addGroupBy('p.currency')
      .getRawMany();
    const company = await this.finance.getCompany();
    const rates = await this.finance.getRates();
    const salesBy = new Map<string, number>();
    for (const r of salesRows) {
      const converted = convertAmount(Number(r.v) || 0, r.currency || company.baseCurrency, company.baseCurrency, rates, null, company.baseCurrency);
      if (converted !== null) salesBy.set(r.warehouseId, (salesBy.get(r.warehouseId) || 0) + converted);
    }
    const byId = new Map(agg.map((r) => [r.warehouseId, r]));
    return activeWarehouses.map((wh, i) => {
      const r = byId.get(wh.id);
      return {
        id: wh.id,
        name: wh.name,
        code: wh.code,
        address: wh.address,
        addressText: formatAddress(wh.address),
        isBranch: wh.isBranch,
        branchCode: wh.branchCode ?? null,
        siteGroup: wh.siteGroup ?? null,
        defaultSeries: wh.defaultSeries ?? null,
        type: wh.type || 'NORMAL',
        isSellable: wh.isSellable !== false,
        ownership: wh.ownership || 'OWN',
        isDefault: i === 0,
        productCount: Number(r?.productCount || 0),
        totalStock: Number(r?.totalStock || 0),
        totalValue: Math.round(Number(r?.totalValue || 0) * 100) / 100,
        salesValue: Math.round((salesBy.get(wh.id) || 0) * 100) / 100,
      };
    });
  }

  /** Per-product stock in one warehouse. */
  async getWarehouseStock(id: string): Promise<{ productId: string; productName: string; sku: string; quantity: number }[]> {
    const wh = await this.warehouseRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!wh) throw new NotFoundException(err('WAREHOUSE_NOT_FOUND'));
    const rows = await this.dataSource.getRepository(ProductWarehouseStockEntity).find({
      where: { companyId: this.companyId, warehouseId: id },
      relations: { product: true },
    });
    return rows
      .filter((r) => r.product && !r.product.isDeleted)
      .map((r) => ({ productId: r.productId, productName: r.product.name, sku: r.product.sku, quantity: r.quantity }));
  }

  async createWarehouse(data: CreateWarehouseDto): Promise<WarehouseEntity> {
    if (data.name) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, name: data.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_NAME_TAKEN', { name: data.name }));
      }
    }
    if (data.code) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, code: data.code, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_CODE_TAKEN', { code: data.code }));
      }
    }
    const newWarehouse = this.warehouseRepo.create({ companyId: this.companyId, isBranch: false });
    await this.apply(newWarehouse, data, true);
    const saved = await this.warehouseRepo.save(newWarehouse);
    this.appGateway.emitToCompany(this.companyId, 'warehouse_mutated', { type: 'create', warehouse: saved });
    return saved;
  }

  async updateWarehouse(id: string, updates: UpdateWarehouseDto): Promise<WarehouseEntity | null> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!warehouse) return null;

    if (updates.name && updates.name !== warehouse.name) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, name: updates.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_NAME_TAKEN', { name: updates.name }));
      }
    }
    if (updates.code && updates.code !== warehouse.code) {
      const existing = await this.warehouseRepo.findOne({ where: { companyId: this.companyId, code: updates.code, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('WAREHOUSE_CODE_TAKEN', { code: updates.code }));
      }
    }

    // Stock is keyed by warehouseId, so a rename needs no stock rewrite.
    const wasSellable = this.warehouseStock.isSellable(warehouse);
    await this.apply(warehouse, updates, false);
    const products = await this.dataSource.transaction(async (manager) => {
      await manager.save(WarehouseEntity, warehouse);
      // Sellable stock (availableQuantity / status) of the products held here follows the warehouse type.
      return wasSellable !== this.warehouseStock.isSellable(warehouse)
        ? this.warehouseStock.recomputeAvailability(manager, this.companyId, warehouse.id)
        : [];
    });
    for (const product of products) this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product });

    this.appGateway.emitToCompany(this.companyId, 'warehouse_mutated', { type: 'update', warehouse });
    return warehouse;
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (warehouse) {
      const stocked = await this.dataSource.getRepository(ProductWarehouseStockEntity).findOne({
        where: { companyId: this.companyId, warehouseId: warehouse.id, quantity: MoreThan(0) },
        relations: { product: true },
      });
      if (stocked) {
        throw new BadRequestException(err('WAREHOUSE_HAS_STOCK', { product: stocked.product?.name, qty: stocked.quantity }));
      }
      warehouse.isDeleted = true;
      await this.warehouseRepo.save(warehouse);
      this.appGateway.emitToCompany(this.companyId, 'warehouse_mutated', { type: 'delete', warehouseId: id });
      return true;
    }
    return false;
  }

  /** Resolves a warehouse by id (or, for older clients, by name). */
  private async resolveWarehouse(manager: EntityManager, ref: string): Promise<WarehouseEntity> {
    const wh =
      (await manager.findOne(WarehouseEntity, { where: { id: ref, companyId: this.companyId, isDeleted: false } })) ||
      (await manager.findOne(WarehouseEntity, { where: { name: ref, companyId: this.companyId, isDeleted: false } }));
    if (!wh) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    return wh;
  }

  /**
   * Moves stock between two warehouses in one transaction and records a
   * TRANSFER_OUT / TRANSFER_IN movement pair. The product total is unchanged.
   */
  async transferWarehouseStock(
    productId: string,
    fromWarehouse: string,
    toWarehouse: string,
    quantity: number,
    performedBy = 'System',
    note?: string,
    details: { lotId?: string; serials?: string[] } = {},
  ): Promise<ProductEntity | null> {
    const qty = roundQty(Number(quantity));
    if (!(qty > 0) || Math.abs(qty - Number(quantity)) > 1e-9) {
      throw new BadRequestException(err('TRANSFER_QUANTITY_INVALID'));
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const product = await manager.findOne(ProductEntity, {
        where: { id: productId, companyId: this.companyId, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
      const decimals = await this.unitDecimals(manager, product);
      if (!fitsDecimals(qty, decimals)) throw new BadRequestException(err('QUANTITY_PRECISION_EXCEEDED', { quantity: qty, decimals }));
      const from = await this.resolveWarehouse(manager, fromWarehouse);
      const to = await this.resolveWarehouse(manager, toWarehouse);
      if (from.id === to.id) {
        throw new BadRequestException(err('TRANSFER_SAME_WAREHOUSE'));
      }
      // VUK 230/5: goods moved to other premises travel with a despatch advice (POST /despatches, purpose TRANSFER).
      const company = await this.finance.getCompany(manager);
      if (transferNeedsDespatch(from, to, company.country || 'TR')) {
        throw new BadRequestException(err('TRANSFER_DESPATCH_REQUIRED', { from: from.name, to: to.name }));
      }

      const total = product.quantity;
      const moved = await this.warehouseStock.transfer(manager, product, from.id, to.id, qty, details);
      const ref = `TRF-${Date.now()}`;
      const text = note || `Depo transferi: ${from.name} -> ${to.name} (${qty})`;
      // Legs at a quarantine warehouse are typed QUARANTINE_IN / QUARANTINE_OUT.
      const outType = from.type === 'QUARANTINE' ? StockMovementType.QUARANTINE_OUT : StockMovementType.TRANSFER_OUT;
      const inType = to.type === 'QUARANTINE' ? StockMovementType.QUARANTINE_IN : StockMovementType.TRANSFER_IN;
      // Totals are unchanged by a transfer, so previous/new both equal the product total.
      await this.warehouseStock.recordMovements(
        manager,
        product,
        total,
        [...moved.out.map((a) => ({ ...a, type: outType })), ...moved.in.map((a) => ({ ...a, type: inType }))],
        {
          type: StockMovementType.TRANSFER_OUT,
          reasonCode: 'TRANSFER',
          totalsUnchanged: true,
          documentType: 'TRANSFER',
          documentNo: ref,
          documentDate: dateKeyInZone(new Date(), (await this.finance.getCompany(manager)).timezone),
          referenceId: ref,
          referenceType: 'warehouse_transfer',
          note: text,
          performedBy,
        },
      );
      await this.warehouseStock.attachWarehouseMap(manager, this.companyId, [product]);
      return product;
    });
    this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: saved });
    return saved;
  }

  private async unitDecimals(manager: EntityManager, product: ProductEntity): Promise<number> {
    if (product.trackingType === 'serial' || !product.baseUnitId) return 0;
    const unit = await manager.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: this.companyId } });
    return Number(unit?.decimals) || 0;
  }
}
