import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';

@Injectable()
export class PurchaseOrderService {
  constructor(
    @InjectRepository(PurchaseOrderEntity)
    private readonly poRepo: Repository<PurchaseOrderEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async getPurchaseOrders(): Promise<PurchaseOrderEntity[]> {
    return this.poRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderEntity | null> {
    return this.poRepo.findOne({ where: { id } });
  }

  async createPurchaseOrder(data: Partial<PurchaseOrderEntity>): Promise<PurchaseOrderEntity> {
    return await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(PurchaseOrderEntity);

      let poNumber = '';
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        poNumber = `PO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await repo.findOne({ where: { poNumber } });
        if (!existing) break;
        attempts++;
      }
      if (attempts === maxAttempts) {
        throw new BadRequestException('Benzersiz satın alma sipariş numarası üretilemedi, lütfen tekrar deneyin.');
      }

      if (!data.supplierId) {
        throw new BadRequestException('Tedarikçi ID\'si (supplierId) belirtilmelidir.');
      }
      const supplier = await manager.findOne(SupplierEntity, { where: { id: data.supplierId, isDeleted: false } });
      if (!supplier) {
        throw new BadRequestException(`Tedarikçi bulunamadı: ID ${data.supplierId}`);
      }
      data.supplierName = supplier.name;

      let calculatedTotal = 0;
      if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        throw new BadRequestException('Sipariş kalemi (items) belirtilmelidir.');
      }
      for (const item of data.items) {
        if (!item.productId) {
          throw new BadRequestException('Sipariş kalemi için ürün ID\'si (productId) belirtilmelidir.');
        }
        const product = await manager.findOne(ProductEntity, { where: { id: item.productId, isDeleted: false } });
        if (!product) {
          throw new BadRequestException(`Ürün bulunamadı: ID ${item.productId}`);
        }
        item.productName = product.name;
        if (item.price === undefined || item.price === null || item.price === 0) {
          item.price = product.price;
        }
        calculatedTotal += (item.price || 0) * (item.quantity || 0);
      }
      data.totalAmount = parseFloat(calculatedTotal.toFixed(2));
      
      const newPo = repo.create({
        ...data,
        poNumber,
        status: 'Draft'
      });
      const saved = await repo.save(newPo);
      this.appGateway.server.emit('purchase_order_mutated', { type: 'create', purchaseOrder: saved });
      return saved;
    });
  }

  async updatePurchaseOrderStatus(id: string, status: string, performedBy: string = 'System'): Promise<PurchaseOrderEntity | null> {
    const saved = await this.dataSource.transaction(async manager => {
      const po = await manager.findOne(PurchaseOrderEntity, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!po) return null;

      const oldStatus = po.status;
      if (oldStatus === status) return po;

      if (oldStatus === 'Received') {
        throw new BadRequestException('Teslim alınmış bir satın alma siparişinin durumu değiştirilemez.');
      }
      if (oldStatus === 'Cancelled') {
        throw new BadRequestException('İptal edilmiş bir satın alma siparişinin durumu değiştirilemez.');
      }

      if (oldStatus !== 'Received' && status === 'Received') {
        for (const item of po.items) {
          const prod = await manager.findOne(ProductEntity, { where: { id: item.productId }, lock: { mode: 'pessimistic_write' } });
          if (prod) {
            const oldQty = prod.quantity;

            const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
            const activeNames = activeWarehouses.map(w => w.name);
            prod.warehouses = this.stockHelper.addStockToWarehouses(prod.warehouses, item.quantity, activeNames);

            prod.quantity += item.quantity;
            prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
            await manager.save(ProductEntity, prod);

            await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
              productId: prod.id,
              productName: prod.name,
              type: 'IN',
              quantity: item.quantity,
              previousQuantity: oldQty,
              newQuantity: prod.quantity,
              referenceId: po.poNumber,
              referenceType: 'purchase_order',
              note: `Satın alma siparişi teslim alındı: ${po.poNumber}`,
              performedBy
            }));
            
            this.appGateway.server.emit('product_mutated', { type: 'update', product: prod });
          }
        }
      }
      
      po.status = status;
      return await manager.save(PurchaseOrderEntity, po);
    });

    if (saved) {
      this.appGateway.server.emit('purchase_order_mutated', { type: 'update', purchaseOrder: saved });
    }
    return saved;
  }

  async updatePurchaseOrder(id: string, updates: Partial<PurchaseOrderEntity>): Promise<PurchaseOrderEntity | null> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) return null;
    if (po.status !== 'Draft') {
      throw new BadRequestException('Sadece "Taslak" (Draft) durumundaki satın alma siparişleri güncellenebilir.');
    }

    if (updates.supplierId && updates.supplierId !== po.supplierId) {
      const supplier = await this.supplierRepo.findOne({ where: { id: updates.supplierId, isDeleted: false } });
      if (!supplier) {
        throw new BadRequestException(`Tedarikçi bulunamadı: ID ${updates.supplierId}`);
      }
      po.supplierId = updates.supplierId;
      po.supplierName = supplier.name;
    }

    if (updates.items) {
      if (!Array.isArray(updates.items) || updates.items.length === 0) {
        throw new BadRequestException('Sipariş kalemi (items) belirtilmelidir.');
      }
      let calculatedTotal = 0;
      for (const item of updates.items) {
        if (!item.productId) {
          throw new BadRequestException('Sipariş kalemi için ürün ID\'si (productId) belirtilmelidir.');
        }
        const product = await this.productRepo.findOne({ where: { id: item.productId, isDeleted: false } });
        if (!product) {
          throw new BadRequestException(`Ürün bulunamadı: ID ${item.productId}`);
        }
        item.productName = product.name;
        if (item.price === undefined || item.price === null || item.price === 0) {
          item.price = product.price;
        }
        calculatedTotal += (item.price || 0) * (item.quantity || 0);
      }
      po.items = updates.items;
      po.totalAmount = parseFloat(calculatedTotal.toFixed(2));
    }

    if (updates.notes !== undefined) {
      po.notes = updates.notes;
    }

    const saved = await this.poRepo.save(po);
    this.appGateway.server.emit('purchase_order_mutated', { type: 'update', purchaseOrder: saved });
    return saved;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) return false;
    if (po.status !== 'Draft') {
      throw new BadRequestException('Sadece "Taslak" (Draft) durumundaki satın alma siparişleri silinebilir.');
    }
    await this.poRepo.remove(po);
    this.appGateway.server.emit('purchase_order_mutated', { type: 'delete', purchaseOrderId: id });
    return true;
  }

  async autoDraftPurchaseOrders(): Promise<any[]> {
    const products = await this.productRepo.find({ where: { isDeleted: false } });
    const lowStockProducts = products.filter(p => p.quantity < p.minQuantity && p.quantity >= 0 && p.supplierId);

    if (lowStockProducts.length === 0) {
      return [];
    }

    const supplierGroups: Record<string, { supplierId: string; supplierName: string; items: any[] }> = {};
    const suppliers = await this.supplierRepo.find();

    for (const p of lowStockProducts) {
      const supplierId = p.supplierId || null;
      let supplierName = 'Genel Tedarikçi';

      if (supplierId) {
        const sup = suppliers.find(s => s.id === supplierId);
        if (sup) supplierName = sup.name;
      }

      const key = supplierId || '__default__';
      if (!supplierGroups[key]) {
        supplierGroups[key] = { supplierId: supplierId || '', supplierName, items: [] };
      }
      const reorderQty = Math.max(p.minQuantity * 2 - p.quantity, p.minQuantity);
      supplierGroups[key].items.push({
        productId: p.id,
        productName: p.name,
        quantity: reorderQty
      });
    }

    const createdPOs: any[] = [];
    const now = new Date();

    for (const group of Object.values(supplierGroups)) {
      const poNumber = `PO-AUTO-${now.getTime().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const totalAmount = group.items.reduce((sum: number, item: any) => {
        const prod = products.find(p => p.id === item.productId);
        return sum + (prod ? prod.price * item.quantity : 0);
      }, 0);

      const newPO = this.poRepo.create({
        poNumber,
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        status: 'Draft',
        items: group.items,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        notes: 'AI destekli otomatik sipariş taslağı. Stok kritik seviyenin altındaki ürünler için oluşturuldu.',
        createdAt: now
      });

      const saved = await this.poRepo.save(newPO);
      createdPOs.push(saved);
    }

    return createdPOs;
  }
}
