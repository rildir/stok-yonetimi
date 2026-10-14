import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { StockMovementType } from '../../entities/enums';

/** Input accepted for create/update; `quantity` is applied through warehouse stock. */
export type ProductInput = Partial<Omit<ProductEntity, 'warehouses'>> & { warehouseId?: string | null };

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
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getProducts(): Promise<ProductEntity[]> {
    const products = await this.productRepo.find({ where: { companyId: this.companyId, isDeleted: false } });
    return this.warehouseStock.attachWarehouseMap(this.dataSource.manager, this.companyId, products);
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    const product = await this.productRepo.findOne({ where: { companyId: this.companyId, id, isDeleted: false } });
    if (!product) return null;
    await this.warehouseStock.attachWarehouseMap(this.dataSource.manager, this.companyId, [product]);
    return product;
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
    const { warehouseId, quantity, ...rest } = data;
    const company = await this.finance.getCompany(manager);
    const product = await manager.save(
      ProductEntity,
      manager.create(ProductEntity, {
        ...rest,
        companyId: this.companyId,
        currency: (rest.currency || company.baseCurrency).toUpperCase(),
        quantity: 0,
        status: this.stockHelper.calculateStatus(0, rest.minQuantity ?? 5),
      })
    );
    const initial = Number(quantity) || 0;
    if (initial > 0) {
      const allocations = await this.warehouseStock.add(manager, product, initial, warehouseId);
      await this.warehouseStock.recordMovements(manager, product, 0, allocations, {
        type: StockMovementType.IN,
        referenceType: 'manual',
        note,
        performedBy,
      });
    }
    return product;
  }

  async createProduct(data: ProductInput, performedBy = 'System'): Promise<ProductEntity> {
    const saved = await this.dataSource.transaction(async (manager) => {
      if (data.sku && (await manager.exists(ProductEntity, { where: { companyId: this.companyId, sku: data.sku } }))) {
        throw new BadRequestException(err('PRODUCT_SKU_TAKEN', { sku: data.sku }));
      }
      const product = await this.insertProduct(manager, data, performedBy, 'Yeni ürün oluşturma stok girişi');
      return this.warehouseStock.attachWarehouseMap(manager, this.companyId, [product]).then(([p]) => p);
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
    const { warehouseId, quantity, id: _id, companyId: _c, status: _s, ...fields } = updates as any;
    delete fields.warehouses;
    delete fields.warehouseStocks;
    if (fields.currency) fields.currency = String(fields.currency).toUpperCase();
    Object.assign(current, fields);
    current.status = this.stockHelper.calculateStatus(current.quantity, current.minQuantity);
    let saved = await manager.save(ProductEntity, current);

    if (quantity !== undefined && quantity !== null && Number(quantity) !== saved.quantity) {
      const oldQty = saved.quantity;
      const allocations = await this.warehouseStock.setTotal(manager, saved, Number(quantity), warehouseId);
      await this.warehouseStock.recordMovements(manager, saved, oldQty, allocations, {
        type: StockMovementType.ADJUSTMENT,
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
      const current = await manager.findOne(ProductEntity, {
        where: { companyId: this.companyId, id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return null;
      const p = await this.applyUpdate(manager, current, updates, performedBy, 'Stock update');
      return this.warehouseStock.attachWarehouseMap(manager, this.companyId, [p]).then(([x]) => x);
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
      .andWhere('sm.createdAt >= :since', { since: ninetyDaysAgo })
      .orderBy('sm.createdAt', 'ASC')
      .getMany();

    return { product, movements };
  }
}
