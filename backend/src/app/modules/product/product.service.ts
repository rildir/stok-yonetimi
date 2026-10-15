import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, Not, MoreThan } from 'typeorm';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { StockMovementType } from '../../entities/enums';
import { UnitService } from '../../shared/services/unit.service';
import { ProductUnitEntity } from '../../entities/product-unit.entity';
import { StockLotEntity } from '../../entities/stock-lot.entity';
import { SerialNumberEntity, SerialStatus } from '../../entities/serial-number.entity';
import { TrackingType } from '../../entities/tracking';
import { BarcodeType, validateBarcode } from '../../shared/inventory/barcode';
import { isTracked, LotReceiptInput } from '../../shared/services/warehouse-stock.service';
import { NotFoundException } from '@nestjs/common';
import { UnitEntity } from '../../entities/unit.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { checkCategoryRules } from '../../shared/compliance/category-rules';
import { fitsDecimals, INVENTORY_CLASSES, toGtin14 } from '../../shared/tr';

/** Input accepted for create/update; `quantity` is applied through warehouse stock. */
export type ProductInput = Partial<Omit<ProductEntity, 'warehouses' | 'units'>> & {
  warehouseId?: string | null;
  units?: { unitId: string; factor: number; barcode?: string | null }[];
  /** Opening stock details for tracked products */
  lots?: LotReceiptInput[];
  serials?: string[];
  /** Required when an update changes the stock quantity */
  reasonCode?: string;
};

@Injectable()
export class ProductService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(StockMovementEntity)
    private readonly stockMovementRepo: Repository<StockMovementEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly warehouseStock: WarehouseStockService,
    private readonly finance: FinanceService,
    private readonly unitService: UnitService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getProducts(): Promise<ProductEntity[]> {
    const products = await this.productRepo.find({ where: { companyId: this.companyId, isDeleted: false } });
    await this.unitService.attachUnits(this.dataSource.manager, this.companyId, products);
    return this.warehouseStock.attachWarehouseMap(this.dataSource.manager, this.companyId, products);
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    const product = await this.productRepo.findOne({ where: { companyId: this.companyId, id, isDeleted: false } });
    if (!product) return null;
    return this.decorate(this.dataSource.manager, product);
  }

  /** Adds units + warehouse map for API responses. */
  private async decorate(manager: EntityManager, product: ProductEntity): Promise<ProductEntity> {
    await this.unitService.attachUnits(manager, this.companyId, [product]);
    await this.warehouseStock.attachWarehouseMap(manager, this.companyId, [product]);
    return product;
  }

  // ─── Barcodes ───

  private normBarcode(code: unknown): string | null {
    const c = typeof code === 'string' ? code.trim() : '';
    return c ? c : null;
  }

  /** Throws when `code` is used by another product or another product's unit. */
  private async assertBarcodeFree(manager: EntityManager, code: string, productId?: string): Promise<void> {
    const p = await manager.findOne(ProductEntity, { where: { companyId: this.companyId, barcode: code } });
    const u = await manager.findOne(ProductUnitEntity, { where: { companyId: this.companyId, barcode: code } });
    if ((p && p.id !== productId) || (u && u.productId !== productId)) {
      throw new BadRequestException(err('BARCODE_TAKEN', { code }));
    }
  }

  private checkBarcode(code: string, type?: string | null): BarcodeType {
    const r = validateBarcode(code, (type || null) as BarcodeType | null);
    if (r.error) throw new BadRequestException(err(r.error, { code, type: r.type }));
    return r.type;
  }

  /** Product lookup by product barcode, alternate-unit barcode, SKU or in-stock serial. */
  async lookupByBarcode(rawCode: string) {
    const code = String(rawCode || '').trim();
    const m = this.dataSource.manager;
    const base = { companyId: this.companyId, isDeleted: false };
    let product = code ? await m.findOne(ProductEntity, { where: { ...base, barcode: code } }) : null;
    let unitId: string | null = null;
    let unitCode: string | null = null;
    let factor = 1;
    let serial: string | null = null;
    if (!product && code) {
      const pu = await m.findOne(ProductUnitEntity, { where: { companyId: this.companyId, barcode: code }, relations: { unit: true } });
      if (pu) {
        product = await m.findOne(ProductEntity, { where: { ...base, id: pu.productId } });
        unitId = pu.unitId;
        unitCode = pu.unit?.code || null;
        factor = Number(pu.factor);
      }
    }
    if (!product && code) product = await m.findOne(ProductEntity, { where: { ...base, sku: code } });
    if (!product && code) {
      const sn = await m.findOne(SerialNumberEntity, { where: { companyId: this.companyId, serial: code, status: SerialStatus.IN_STOCK } });
      if (sn) {
        product = await m.findOne(ProductEntity, { where: { ...base, id: sn.productId } });
        serial = sn.serial;
      }
    }
    if (!product) throw new NotFoundException(err('PRODUCT_BARCODE_NOT_FOUND', { code }));
    await this.decorate(m, product);
    return { product, unitId, unitCode, factor, serial };
  }

  // ─── Lots / serials ───

  private async requireProduct(id: string): Promise<ProductEntity> {
    const product = await this.productRepo.findOne({ where: { companyId: this.companyId, id, isDeleted: false } });
    if (!product) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
    return product;
  }

  /** In-stock lots, FEFO ordered, with warehouse names and days to expiry. */
  async getLots(productId: string, warehouseId?: string) {
    await this.requireProduct(productId);
    const lots = await this.dataSource.manager.find(StockLotEntity, {
      where: { companyId: this.companyId, productId, quantity: MoreThan(0), ...(warehouseId ? { warehouseId } : {}) },
      relations: { warehouse: true },
    });
    const today = await this.finance.today();
    return lots
      .filter((l) => l.warehouse && !l.warehouse.isDeleted)
      .sort((a, b) => String(a.expiryDate || '9999').localeCompare(String(b.expiryDate || '9999')) || +a.createdAt - +b.createdAt)
      .map(({ warehouse, ...l }) => ({
        ...l,
        warehouseName: warehouse?.name,
        expired: !!l.expiryDate && String(l.expiryDate) < today,
      }));
  }

  async getSerials(productId: string, status?: string, warehouseId?: string) {
    await this.requireProduct(productId);
    const rows = await this.dataSource.manager.find(SerialNumberEntity, {
      where: {
        companyId: this.companyId,
        productId,
        ...(status && status !== 'all' ? { status } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      relations: { warehouse: true },
      order: { createdAt: 'ASC', serial: 'ASC' },
    });
    return rows.map(({ warehouse, ...r }) => ({ ...r, warehouseName: warehouse?.name }));
  }

  // ─── Units / tracking on save ───

  /** Validates barcode/unit/tracking fields of the payload and normalizes them onto `target`. */
  private async applyCatalogFields(manager: EntityManager, target: ProductEntity, data: ProductInput, isNew: boolean): Promise<void> {
    if (data.barcode !== undefined || data.barcodeType !== undefined) {
      const code = this.normBarcode(data.barcode !== undefined ? data.barcode : target.barcode);
      if (code) {
        target.barcodeType = this.checkBarcode(code, data.barcodeType ?? (data.barcode !== undefined ? null : target.barcodeType));
        await this.assertBarcodeFree(manager, code, isNew ? undefined : target.id);
      } else {
        target.barcodeType = null;
      }
      target.barcode = code;
    }
    if (data.baseUnitId !== undefined || isNew || !target.baseUnitId) {
      const unit = data.baseUnitId
        ? await this.unitService.requireUnit(data.baseUnitId, manager)
        : target.baseUnitId
          ? await this.unitService.requireUnit(target.baseUnitId, manager)
          : await this.unitService.defaultUnit(this.companyId, manager);
      target.baseUnitId = unit.id;
      target.unit = unit.code;
    }
    if (data.hasExpiry !== undefined) target.hasExpiry = !!data.hasExpiry;
    if (data.regulatoryCategory !== undefined) target.regulatoryCategory = data.regulatoryCategory || 'none';
    if (data.inventoryClass !== undefined) {
      if (!(INVENTORY_CLASSES as readonly string[]).includes(String(data.inventoryClass))) {
        throw new BadRequestException(err('INVENTORY_CLASS_INVALID', { value: String(data.inventoryClass) }));
      }
      target.inventoryClass = data.inventoryClass;
    }
    if (data.gtin14 !== undefined) {
      const raw = typeof data.gtin14 === 'string' ? data.gtin14.trim() : '';
      if (raw) {
        const gtin = toGtin14(raw);
        if (!gtin) throw new BadRequestException(err('GTIN_INVALID', { code: raw }));
        target.gtin14 = gtin;
      } else {
        target.gtin14 = null;
      }
    }
  }

  /**
   * Regulatory category rules (R67): errors reject the save, warnings (rules a later
   * package enforces, e.g. food lot / expiry in WP6) are returned with the product.
   */
  private async checkCategory(manager: EntityManager, product: ProductEntity): Promise<string[]> {
    const company = await manager.findOne(CompanyEntity, { where: { id: this.companyId }, select: ['id', 'enabledComplianceModules'] });
    const issues = checkCategoryRules(product, company?.enabledComplianceModules || []);
    const error = issues.find((i) => i.severity === 'error');
    if (error) throw new BadRequestException(err(error.code, error.params));
    return issues.map((i) => i.code);
  }

  /** Quantities of a product must fit its base unit's precision. */
  private async assertPrecision(manager: EntityManager, product: ProductEntity, values: (number | null | undefined)[]): Promise<void> {
    const unit = product.baseUnitId ? await manager.findOne(UnitEntity, { where: { id: product.baseUnitId, companyId: this.companyId } }) : null;
    const decimals = product.trackingType === TrackingType.SERIAL ? 0 : Number(unit?.decimals) || 0;
    for (const v of values) {
      if (v !== null && v !== undefined && !fitsDecimals(Number(v), decimals)) {
        throw new BadRequestException(err('QUANTITY_PRECISION_EXCEEDED', { quantity: v, decimals }));
      }
    }
  }

  /** Replaces the product's alternate units. */
  private async saveUnits(manager: EntityManager, product: ProductEntity, units: ProductInput['units']): Promise<void> {
    if (units === undefined) return;
    const list = units || [];
    const seenUnits = new Set<string>();
    const seenCodes = new Set<string>(product.barcode ? [product.barcode] : []);
    for (const u of list) {
      await this.unitService.requireUnit(u.unitId, manager);
      if (u.unitId === product.baseUnitId) throw new BadRequestException(err('UNIT_BASE_AS_ALTERNATE'));
      if (seenUnits.has(u.unitId)) throw new BadRequestException(err('UNIT_DUPLICATE'));
      seenUnits.add(u.unitId);
      if (!(Number(u.factor) > 0)) throw new BadRequestException(err('UNIT_FACTOR_INVALID'));
      const code = this.normBarcode(u.barcode);
      if (code) {
        this.checkBarcode(code);
        if (seenCodes.has(code)) throw new BadRequestException(err('BARCODE_DUPLICATE_IN_PAYLOAD', { code }));
        seenCodes.add(code);
        await this.assertBarcodeFree(manager, code, product.id);
      }
    }
    await manager.delete(ProductUnitEntity, { companyId: this.companyId, productId: product.id });
    for (const u of list) {
      await manager.save(
        ProductUnitEntity,
        manager.create(ProductUnitEntity, {
          companyId: this.companyId,
          productId: product.id,
          unitId: u.unitId,
          factor: Number(u.factor),
          barcode: this.normBarcode(u.barcode),
        }),
      );
    }
  }

  /**
   * Tracking type changes: none -> lot converts existing warehouse stock into
   * one opening lot per warehouse; every other change needs zero stock.
   */
  private async changeTracking(manager: EntityManager, product: ProductEntity, next: string): Promise<void> {
    const current = product.trackingType || TrackingType.NONE;
    if (next === current) return;
    if (!Object.values(TrackingType).includes(next as TrackingType)) throw new BadRequestException(err('PRODUCT_TRACKING_INVALID'));
    if (product.quantity > 0) {
      if (!(current === TrackingType.NONE && next === TrackingType.LOT)) {
        throw new BadRequestException(err('PRODUCT_TRACKING_CHANGE_STOCK', { name: product.name }));
      }
      const rows = await manager.find(ProductWarehouseStockEntity, { where: { companyId: this.companyId, productId: product.id, quantity: MoreThan(0) } });
      const lotNumber = `OPEN-${(await this.finance.today(manager)).replace(/-/g, '')}`;
      for (const r of rows) {
        await manager.save(
          StockLotEntity,
          manager.create(StockLotEntity, { companyId: this.companyId, productId: product.id, warehouseId: r.warehouseId, lotNumber, expiryDate: null, quantity: r.quantity }),
        );
      }
    } else if (current === TrackingType.LOT) {
      await manager.delete(StockLotEntity, { companyId: this.companyId, productId: product.id, quantity: 0 });
    }
    product.trackingType = next;
  }


  private async validateRefs(manager: EntityManager, data: ProductInput): Promise<void> {
    if (data.category) {
      const categoryExists = await manager.findOne(CategoryEntity, { where: { companyId: this.companyId, slug: data.category, isDeleted: false } });
      if (!categoryExists) {
        throw new BadRequestException(err('PRODUCT_INVALID_CATEGORY', { category: data.category }));
      }
    }
    if (data.supplierId) {
      const supplierExists = await manager.findOne(SupplierEntity, { where: { companyId: this.companyId, id: data.supplierId, isDeleted: false } });
      if (!supplierExists) {
        throw new BadRequestException(err('PRODUCT_INVALID_SUPPLIER', { id: data.supplierId }));
      }
    }
    if (data.taxRateId) {
      await this.finance.assertTaxRate(data.taxRateId, manager);
    }
  }

  /** Inserts a product with zero stock, then books the initial quantity into a warehouse. */
  private async insertProduct(manager: EntityManager, data: ProductInput, performedBy: string, note: string): Promise<ProductEntity> {
    await this.validateRefs(manager, data);
    const { warehouseId, quantity, units, lots, serials, baseUnit: _bu, ...rest } = data as any;
    const company = await this.finance.getCompany(manager);
    const draft = manager.create(ProductEntity, {
      ...rest,
      companyId: this.companyId,
      currency: (rest.currency || company.baseCurrency).toUpperCase(),
      trackingType: rest.trackingType || TrackingType.NONE,
      hasExpiry: rest.trackingType === TrackingType.LOT ? !!rest.hasExpiry : false,
      quantity: 0,
      status: this.stockHelper.calculateStatus(0, rest.minQuantity ?? 5),
    }) as unknown as ProductEntity;
    await this.applyCatalogFields(manager, draft, data, true);
    if (draft.trackingType !== TrackingType.LOT) draft.hasExpiry = false;
    const warnings = await this.checkCategory(manager, draft);
    await this.assertPrecision(manager, draft, [Number(quantity) || 0, draft.minQuantity]);
    const product = await manager.save(ProductEntity, draft);
    (product as any).complianceWarnings = warnings;
    await this.saveUnits(manager, product, units);
    const initial = Number(quantity) || 0;
    if (initial > 0) {
      const allocations = await this.warehouseStock.receive(manager, product, initial, warehouseId, { lots, serials });
      await this.warehouseStock.recordMovements(manager, product, 0, allocations, {
        type: StockMovementType.IN,
        reasonCode: 'OPENING',
        referenceType: 'manual',
        note,
        performedBy,
      });
    }
    return product;
  }

  async createProduct(data: ProductInput, performedBy = 'System'): Promise<ProductEntity> {
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      if (data.sku && (await manager.exists(ProductEntity, { where: { companyId: this.companyId, sku: data.sku } }))) {
        throw new BadRequestException(err('PRODUCT_SKU_TAKEN', { sku: data.sku }));
      }
      const product = await this.insertProduct(manager, data, performedBy, 'Yeni ürün oluşturma stok girişi');
      return this.decorate(manager, product);
    });
    this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'create', product: saved });
    return saved;
  }

  async bulkCreateProducts(products: ProductInput[], performedBy = 'System'): Promise<ProductEntity[]> {
    const skus = products.map((p) => p.sku).filter(Boolean);
    const duplicateSkusInPayload = skus.filter((item, index) => skus.indexOf(item) !== index);
    if (duplicateSkusInPayload.length > 0) {
      throw new BadRequestException(err('PRODUCT_DUPLICATE_SKUS_IN_PAYLOAD', { skus: duplicateSkusInPayload.join(', ') }));
    }

    if (skus.length > 0) {
      const existingProducts = await this.productRepo
        .createQueryBuilder('p')
        .where('p.companyId = :companyId', { companyId: this.companyId })
        .andWhere('p.sku IN (:...skus) AND p.isDeleted = false', { skus })
        .getMany();
      if (existingProducts.length > 0) {
        const existingSkus = existingProducts.map((p) => p.sku);
        throw new BadRequestException(err('PRODUCT_SKUS_EXIST', { skus: existingSkus.join(', ') }));
      }
    }

    const savedProducts = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const out: ProductEntity[] = [];
      for (const data of products) {
        out.push(await this.insertProduct(manager, data, performedBy, 'Toplu (Bulk) ürün yükleme'));
      }
      return this.warehouseStock.attachWarehouseMap(manager, this.companyId, out);
    });

    for (const p of savedProducts) {
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'create', product: p });
    }
    return savedProducts;
  }

  /** Applies field updates; a quantity change goes through warehouse stock + ADJUSTMENT movement(s). */
  private async applyUpdate(manager: EntityManager, current: ProductEntity, updates: ProductInput, performedBy: string, note: string) {
    await this.validateRefs(manager, updates);
    const { warehouseId, quantity, id: _id, companyId: _c, status: _s, units, lots: _l, serials: _sr, trackingType, reasonCode, ...fields } = updates as any;
    delete fields.warehouses;
    delete fields.warehouseStocks;
    delete fields.baseUnit;
    delete fields.barcode;
    delete fields.barcodeType;
    delete fields.baseUnitId;
    delete fields.hasExpiry;
    delete fields.unit; // derived from the base unit
    delete fields.regulatoryCategory;
    delete fields.inventoryClass;
    delete fields.gtin14;
    delete fields.complianceWarnings;
    if (fields.currency) fields.currency = String(fields.currency).toUpperCase();
    Object.assign(current, fields);
    if (updates.baseUnitId && updates.baseUnitId !== current.baseUnitId && current.quantity > 0) {
      // Stock is stored in the base unit; changing it with stock would silently rescale quantities.
      throw new BadRequestException(err('PRODUCT_TRACKING_CHANGE_STOCK', { name: current.name }));
    }
    await this.applyCatalogFields(manager, current, updates, false);
    if (trackingType !== undefined) await this.changeTracking(manager, current, trackingType);
    if (current.trackingType !== TrackingType.LOT) current.hasExpiry = false;
    const warnings = await this.checkCategory(manager, current);
    await this.assertPrecision(manager, current, [current.minQuantity, quantity]);
    await this.saveUnits(manager, current, units);
    current.status = this.stockHelper.calculateStatus(current.quantity, current.minQuantity);
    let saved = await manager.save(ProductEntity, current);

    (saved as any).complianceWarnings = warnings;

    if (quantity !== undefined && quantity !== null && Number(quantity) !== saved.quantity) {
      // A stock change needs a reason (corrections normally go through POST /stock-movements/adjust).
      if (!reasonCode) throw new BadRequestException(err('REASON_CODE_REQUIRED'));
      const oldQty = saved.quantity;
      const allocations = await this.warehouseStock.setTotal(manager, saved, Number(quantity), warehouseId);
      await this.warehouseStock.recordMovements(manager, saved, oldQty, allocations, {
        type: StockMovementType.ADJUSTMENT,
        reasonCode,
        referenceType: 'manual',
        note,
        performedBy,
      });
      saved = current;
    }
    return saved;
  }

  async updateProduct(id: string, updates: ProductInput, performedBy = 'System'): Promise<ProductEntity | null> {
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const current = await manager.findOne(ProductEntity, {
        where: { companyId: this.companyId, id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return null;
      const p = await this.applyUpdate(manager, current, updates, performedBy, 'Stock update');
      return this.decorate(manager, p);
    });

    if (saved) {
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: saved });
    }
    return saved;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const prod = await this.productRepo.findOne({ where: { companyId: this.companyId, id, isDeleted: false } });
    if (prod) {
      prod.isDeleted = true;
      const saved = await this.productRepo.save(prod);
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'delete', productId: id, product: saved });
      return true;
    }
    return false;
  }

  async bulkDeleteProducts(ids: string[]): Promise<boolean> {
    return await this.dataSource.transaction(async (manager) => {
      for (const id of ids) {
        const prod = await manager.findOne(ProductEntity, {
          where: { companyId: this.companyId, id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!prod) {
          throw new BadRequestException(err('PRODUCT_NOT_FOUND_ID', { id }));
        }
        prod.isDeleted = true;
        const saved = await manager.save(ProductEntity, prod);
        this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'delete', productId: id, product: saved });
      }
      return true;
    });
  }

  async bulkUpdateProducts(ids: string[], updates: ProductInput): Promise<boolean> {
    const updated = await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, this.companyId);
      const out: ProductEntity[] = [];
      for (const id of ids) {
        const current = await manager.findOne(ProductEntity, {
          where: { companyId: this.companyId, id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) {
          throw new BadRequestException(err('PRODUCT_NOT_FOUND_ID', { id }));
        }
        out.push(await this.applyUpdate(manager, current, updates, 'System', 'Stok güncelleme (Toplu)'));
      }
      return out;
    });
    for (const p of updated) {
      this.appGateway.emitToCompany(this.companyId, 'product_mutated', { type: 'update', product: p });
    }
    return true;
  }

  async getProductForecastData(productId: string): Promise<any> {
    const product = await this.productRepo.findOne({ where: { companyId: this.companyId, id: productId, isDeleted: false } });
    if (!product) return null;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const movements = await this.stockMovementRepo
      .createQueryBuilder('sm')
      .where('sm.companyId = :companyId', { companyId: this.companyId })
      .andWhere('sm.productId = :productId', { productId })
      .andWhere('sm.transactionDate >= :since', { since: ninetyDaysAgo })
      .orderBy('sm.transactionDate', 'ASC')
      .getMany();

    return { product, movements };
  }
}
