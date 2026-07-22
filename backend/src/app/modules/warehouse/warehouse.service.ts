import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { AppGateway } from '../../app.gateway';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async getWarehouses(): Promise<any[]> {
    const activeWarehouses = await this.warehouseRepo.find({ where: { isDeleted: false } });
    const products = await this.productRepo.find({ where: { isDeleted: false } });
    const warehouseMap: Record<string, { id: string; name: string; code: string; address?: string; productCount: number; totalStock: number; totalValue: number }> = {};

    for (const wh of activeWarehouses) {
      warehouseMap[wh.name] = {
        id: wh.id,
        name: wh.name,
        code: wh.code,
        address: wh.address,
        productCount: 0,
        totalStock: 0,
        totalValue: 0
      };
    }

    for (const p of products) {
      const wh = p.warehouses || {};
      for (const [whName, qty] of Object.entries(wh)) {
        if (warehouseMap[whName]) {
          if (qty > 0) warehouseMap[whName].productCount++;
          warehouseMap[whName].totalStock += qty;
          warehouseMap[whName].totalValue += qty * p.price;
        }
      }
    }

    return Object.values(warehouseMap);
  }

  async createWarehouse(data: Partial<WarehouseEntity>): Promise<WarehouseEntity> {
    if (data.name) {
      const existing = await this.warehouseRepo.findOne({ where: { name: data.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu isimde bir depo zaten mevcut: ${data.name}`);
      }
    }
    if (data.code) {
      const existing = await this.warehouseRepo.findOne({ where: { code: data.code, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu kodda bir depo zaten mevcut: ${data.code}`);
      }
    }
    const newWarehouse = this.warehouseRepo.create(data);
    const saved = await this.warehouseRepo.save(newWarehouse);
    this.appGateway.server.emit('warehouse_mutated', { type: 'create', warehouse: saved });
    return saved;
  }

  async updateWarehouse(id: string, updates: Partial<WarehouseEntity>): Promise<WarehouseEntity | null> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id, isDeleted: false } });
    if (!warehouse) return null;

    if (updates.name && updates.name !== warehouse.name) {
      const existing = await this.warehouseRepo.findOne({ where: { name: updates.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu isimde bir depo zaten mevcut: ${updates.name}`);
      }
    }
    if (updates.code && updates.code !== warehouse.code) {
      const existing = await this.warehouseRepo.findOne({ where: { code: updates.code, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu kodda bir depo zaten mevcut: ${updates.code}`);
      }
    }

    await this.dataSource.transaction(async manager => {
      if (updates.name && updates.name !== warehouse.name) {
        const products = await manager.find(ProductEntity, { where: { isDeleted: false } });
        for (const p of products) {
          if (p.warehouses && p.warehouses[warehouse.name] !== undefined) {
            const qty = p.warehouses[warehouse.name];
            p.warehouses[updates.name] = qty;
            delete p.warehouses[warehouse.name];
            await manager.save(ProductEntity, p);
          }
        }
      }

      Object.assign(warehouse, updates);
      await manager.save(WarehouseEntity, warehouse);
    });

    this.appGateway.server.emit('warehouse_mutated', { type: 'update', warehouse });
    return warehouse;
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id, isDeleted: false } });
    if (warehouse) {
      const activeProducts = await this.productRepo.find({ where: { isDeleted: false } });
      for (const p of activeProducts) {
        const qty = p.warehouses?.[warehouse.name] || 0;
        if (qty > 0) {
          throw new BadRequestException(`Bu depoda aktif stok bulunduğundan silinemez. Ürün: ${p.name} (${qty} adet)`);
        }
      }
      warehouse.isDeleted = true;
      await this.warehouseRepo.save(warehouse);
      this.appGateway.server.emit('warehouse_mutated', { type: 'delete', warehouseId: id });
      return true;
    }
    return false;
  }

  async transferWarehouseStock(
    productId: string,
    fromWarehouse: string,
    toWarehouse: string,
    quantity: number,
    performedBy = 'System'
  ): Promise<ProductEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(ProductEntity, {
        where: { id: productId, isDeleted: false },
        lock: { mode: 'pessimistic_write' }
      });
      if (!product) return null;

      let warehouses = product.warehouses || {};
      if (Object.keys(warehouses).length === 0 && product.quantity > 0) {
        const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
        const defaultWarehouseName = activeWarehouses.length > 0 ? activeWarehouses[0].name : 'Merkez Depo';
        warehouses = { [defaultWarehouseName]: product.quantity };
      }
      const fromQty = warehouses[fromWarehouse] || 0;
      if (fromQty < quantity) {
        throw new BadRequestException(
          `${fromWarehouse} deposunda yeterli stok yok. Mevcut: ${fromQty}, İstenen: ${quantity}`
        );
      }

      warehouses[fromWarehouse] = fromQty - quantity;
      warehouses[toWarehouse] = (warehouses[toWarehouse] || 0) + quantity;
      product.warehouses = warehouses;

      const saved = await manager.save(ProductEntity, product);

      await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
        productId: product.id,
        productName: product.name,
        type: 'TRANSFER',
        quantity,
        previousQuantity: product.quantity,
        newQuantity: product.quantity,
        note: `Depo transferi: ${fromWarehouse} → ${toWarehouse} (${quantity} adet)`,
        referenceType: 'warehouse_transfer',
        performedBy
      }));

      this.appGateway.server.emit('product_mutated', { type: 'update', product: saved });
      return saved;
    });
  }
}
