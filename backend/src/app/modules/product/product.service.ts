import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';

@Injectable()
export class ProductService {
  constructor(
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
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async getProducts(): Promise<ProductEntity[]> {
    return this.productRepo.find({ where: { isDeleted: false } });
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    return this.productRepo.findOne({ where: { id, isDeleted: false } });
  }

  async createProduct(data: Partial<ProductEntity>, performedBy = 'System'): Promise<ProductEntity> {
    return await this.dataSource.transaction(async manager => {
      if (data.category) {
        const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: data.category, isDeleted: false } });
        if (!categoryExists) {
          throw new BadRequestException(`Geçersiz kategori: ${data.category}`);
        }
      }

      if (data.supplierId) {
        const supplierExists = await manager.findOne(SupplierEntity, { where: { id: data.supplierId, isDeleted: false } });
        if (!supplierExists) {
          throw new BadRequestException(`Geçersiz tedarikçi: ID ${data.supplierId}`);
        }
      }

      let warehouses = data.warehouses || {};
      if ((data.quantity || 0) > 0 && Object.keys(warehouses).length === 0) {
        const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
        if (activeWarehouses.length > 0) {
          warehouses = { [activeWarehouses[0].name]: data.quantity || 0 };
        }
      }

      const newProd = manager.create(ProductEntity, {
        ...data,
        warehouses,
        status: this.stockHelper.calculateStatus(data.quantity || 0, data.minQuantity || 5)
      });

      const savedProd = await manager.save(ProductEntity, newProd);
      
      if (savedProd.quantity > 0) {
        await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
          productId: savedProd.id,
          productName: savedProd.name,
          type: 'IN',
          quantity: savedProd.quantity,
          previousQuantity: 0,
          newQuantity: savedProd.quantity,
          note: 'Yeni ürün oluşturma stok girişi',
          referenceType: 'manual',
          performedBy
        }));
      }

      this.appGateway.server.emit('product_mutated', { type: 'create', product: savedProd });
      return savedProd;
    });
  }

  async bulkCreateProducts(products: Partial<ProductEntity>[], performedBy = 'System'): Promise<ProductEntity[]> {
    const skus = products.map(p => p.sku).filter(Boolean);
    const duplicateSkusInPayload = skus.filter((item, index) => skus.indexOf(item) !== index);
    if (duplicateSkusInPayload.length > 0) {
      throw new BadRequestException(`Yüklenen veri içerisinde yinelenen SKU'lar bulundu: ${duplicateSkusInPayload.join(', ')}`);
    }

    if (skus.length > 0) {
      const existingProducts = await this.productRepo.createQueryBuilder('p')
        .where('p.sku IN (:...skus) AND p.isDeleted = false', { skus })
        .getMany();
      if (existingProducts.length > 0) {
        const existingSkus = existingProducts.map(p => p.sku);
        throw new BadRequestException(`Sistemde zaten kayıtlı olan SKU'lar bulundu: ${existingSkus.join(', ')}`);
      }
    }

    const savedProducts: ProductEntity[] = [];
    
    await this.dataSource.transaction(async manager => {
      const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
      const defaultWarehouseName = activeWarehouses.length > 0 ? activeWarehouses[0].name : null;

      for (const data of products) {
        if (data.category) {
          const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: data.category, isDeleted: false } });
          if (!categoryExists) {
            throw new BadRequestException(`Geçersiz kategori: ${data.category}`);
          }
        }

        if (data.supplierId) {
          const supplierExists = await manager.findOne(SupplierEntity, { where: { id: data.supplierId, isDeleted: false } });
          if (!supplierExists) {
            throw new BadRequestException(`Geçersiz tedarikçi: ID ${data.supplierId}`);
          }
        }

        let warehouses = data.warehouses || {};
        if ((data.quantity || 0) > 0 && Object.keys(warehouses).length === 0 && defaultWarehouseName) {
          warehouses = { [defaultWarehouseName]: data.quantity || 0 };
        }

        const newProd = manager.create(ProductEntity, {
          ...data,
          warehouses,
          status: this.stockHelper.calculateStatus(data.quantity || 0, data.minQuantity || 5)
        });
        
        const savedProd = await manager.save(ProductEntity, newProd);
        savedProducts.push(savedProd);
        
        if (savedProd.quantity > 0) {
          await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
            productId: savedProd.id,
            productName: savedProd.name,
            type: 'IN',
            quantity: savedProd.quantity,
            previousQuantity: 0,
            newQuantity: savedProd.quantity,
            note: 'Toplu (Bulk) ürün yükleme',
            referenceType: 'manual',
            performedBy
          }));
        }
      }
    });

    for (const p of savedProducts) {
      this.appGateway.server.emit('product_mutated', { type: 'create', product: p });
    }
    
    return savedProducts;
  }

  async updateProduct(id: string, updates: Partial<ProductEntity>, performedBy = 'System'): Promise<ProductEntity | null> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(ProductEntity, {
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return null;

      if (updates.category) {
        const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: updates.category, isDeleted: false } });
        if (!categoryExists) {
          throw new BadRequestException(`Geçersiz kategori: ${updates.category}`);
        }
      }

      if (updates.supplierId) {
        const supplierExists = await manager.findOne(SupplierEntity, { where: { id: updates.supplierId, isDeleted: false } });
        if (!supplierExists) {
          throw new BadRequestException(`Geçersiz tedarikçi: ID ${updates.supplierId}`);
        }
      }

      const updatedQty = updates.quantity !== undefined ? updates.quantity : current.quantity;
      const updatedMin = updates.minQuantity !== undefined ? updates.minQuantity : current.minQuantity;
      const status = this.stockHelper.calculateStatus(updatedQty, updatedMin);

      if (updates.quantity !== undefined && updates.quantity !== current.quantity && !updates.warehouses) {
        const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
        const activeNames = activeWarehouses.map(w => w.name);
        const diff = updates.quantity - current.quantity;
        if (diff > 0) {
          current.warehouses = this.stockHelper.addStockToWarehouses(current.warehouses, diff, activeNames);
        } else if (diff < 0) {
          current.warehouses = this.stockHelper.deductStockFromWarehouses(current.warehouses, Math.abs(diff), activeNames);
        }
      }

      const oldQuantity = current.quantity;
      Object.assign(current, updates, { status });
      const savedProd = await manager.save(ProductEntity, current);

      if (updates.quantity !== undefined && oldQuantity !== updates.quantity) {
        const diff = updates.quantity - oldQuantity;
        await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
          productId: savedProd.id,
          productName: savedProd.name,
          type: 'ADJUSTMENT',
          quantity: diff,
          previousQuantity: oldQuantity,
          newQuantity: updates.quantity,
          note: 'Stock update',
          performedBy,
          referenceType: 'manual'
        }));
      }

      return savedProd;
    });

    if (saved) {
      this.appGateway.server.emit('product_mutated', { type: 'update', product: saved });
    }
    return saved;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const prod = await this.getProductById(id);
    if (prod) {
      prod.isDeleted = true;
      const saved = await this.productRepo.save(prod);
      this.appGateway.server.emit('product_mutated', { type: 'delete', productId: id, product: saved });
      return true;
    }
    return false;
  }

  async bulkDeleteProducts(ids: string[]): Promise<boolean> {
    return await this.dataSource.transaction(async manager => {
      for (const id of ids) {
        const prod = await manager.findOne(ProductEntity, {
          where: { id, isDeleted: false },
          lock: { mode: 'pessimistic_write' }
        });
        if (!prod) {
          throw new BadRequestException(`Ürün bulunamadı: ID ${id}`);
        }
        prod.isDeleted = true;
        const saved = await manager.save(ProductEntity, prod);
        this.appGateway.server.emit('product_mutated', { type: 'delete', productId: id, product: saved });
      }
      return true;
    });
  }

  async bulkUpdateProducts(ids: string[], updates: Partial<ProductEntity>): Promise<boolean> {
    return await this.dataSource.transaction(async manager => {
      const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
      const activeNames = activeWarehouses.map(w => w.name);

      for (const id of ids) {
        const current = await manager.findOne(ProductEntity, {
          where: { id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) {
          throw new BadRequestException(`Ürün bulunamadı: ID ${id}`);
        }

        if (updates.category) {
          const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: updates.category, isDeleted: false } });
          if (!categoryExists) {
            throw new BadRequestException(`Geçersiz kategori: ${updates.category}`);
          }
        }

        if (updates.supplierId) {
          const supplierExists = await manager.findOne(SupplierEntity, { where: { id: updates.supplierId, isDeleted: false } });
          if (!supplierExists) {
            throw new BadRequestException(`Geçersiz tedarikçi: ID ${updates.supplierId}`);
          }
        }

        const updatedQty = updates.quantity !== undefined ? updates.quantity : current.quantity;
        const updatedMin = updates.minQuantity !== undefined ? updates.minQuantity : current.minQuantity;
        const status = this.stockHelper.calculateStatus(updatedQty, updatedMin);

        if (updates.quantity !== undefined && updates.quantity !== current.quantity && !updates.warehouses) {
          const diff = updates.quantity - current.quantity;
          if (diff > 0) {
            current.warehouses = this.stockHelper.addStockToWarehouses(current.warehouses, diff, activeNames);
          } else if (diff < 0) {
            current.warehouses = this.stockHelper.deductStockFromWarehouses(current.warehouses, Math.abs(diff), activeNames);
          }
        }

        const oldQuantity = current.quantity;
        Object.assign(current, updates, { status });
        const savedProd = await manager.save(ProductEntity, current);

        if (updates.quantity !== undefined && oldQuantity !== updates.quantity) {
          const diff = updates.quantity - oldQuantity;
          await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
            productId: savedProd.id,
            productName: savedProd.name,
            type: 'ADJUSTMENT',
            quantity: diff,
            previousQuantity: oldQuantity,
            newQuantity: updates.quantity,
            note: 'Stok güncelleme (Toplu)',
            performedBy: 'System',
            referenceType: 'manual'
          }));
        }

        this.appGateway.server.emit('product_mutated', { type: 'update', product: savedProd });
      }
      return true;
    });
  }

  async getProductForecastData(productId: string): Promise<any> {
    const product = await this.productRepo.findOne({ where: { id: productId, isDeleted: false } });
    if (!product) return null;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const movements = await this.stockMovementRepo
      .createQueryBuilder('sm')
      .where('sm.productId = :productId', { productId })
      .andWhere('sm.createdAt >= :since', { since: ninetyDaysAgo })
      .orderBy('sm.createdAt', 'ASC')
      .getMany();

    return { product, movements };
  }
}
