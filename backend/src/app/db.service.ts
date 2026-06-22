import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';
import { StockMovementEntity } from './entities/stock-movement.entity';
import { SupplierEntity } from './entities/supplier.entity';
import { PurchaseOrderEntity } from './entities/purchase-order.entity';
import { CategoryEntity } from './entities/category.entity';
import { StockCountEntity, StockCountItem } from './entities/stock-count.entity';
import { WarehouseEntity } from './entities/warehouse.entity';
import { UserEntity } from './entities/user.entity';
import { AppGateway } from './app.gateway';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  minQuantity: number;
  status: 'In stock' | 'Low stock' | 'Out of stock' | string;
  isDeleted?: boolean;
  unit?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  date: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | string;
  totalAmount: number;
  items: OrderItem[];
  carrier?: string;
  trackingNumber?: string;
}

@Injectable()
export class DbService implements OnModuleInit {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(StockMovementEntity)
    private readonly stockMovementRepo: Repository<StockMovementEntity>,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedMockDataIfEmpty();
  }

  private async seedMockDataIfEmpty() {
    // Seed Users
    const userCount = await this.userRepo.count();
    if (userCount === 0) {
      console.log('[DbService] Users table is empty. Seeding initial users...');
      const initialUsers = [
        {
          username: 'admin',
          password: this.hashPassword('admin'),
          role: 'admin',
          fullName: 'Ahmet Ildır',
          email: 'admin@sirket.com',
          department: 'Sistem Yönetimi',
          tokenVersion: 0
        },
        {
          username: 'manager',
          password: this.hashPassword('manager123'),
          role: 'manager',
          fullName: 'Yönetici Demo',
          email: 'manager@sirket.com',
          department: 'Stok Yönetimi',
          tokenVersion: 0
        },
        {
          username: 'viewer',
          password: this.hashPassword('viewer123'),
          role: 'viewer',
          fullName: 'Gözlemci Demo',
          email: 'viewer@sirket.com',
          department: 'Gözlem Ekibi',
          tokenVersion: 0
        }
      ];
      for (const u of initialUsers) {
        await this.userRepo.save(this.userRepo.create(u));
      }
    }

    // Seed Categories
    const categoryCount = await this.categoryRepo.count();
    if (categoryCount === 0) {
      console.log('[DbService] Categories table is empty. Seeding initial categories...');
      const initialCategories = [
        { name: 'Aksesuarlar', slug: 'Accessories' },
        { name: 'Ses Ekipmanları', slug: 'Audio' },
        { name: 'Monitörler', slug: 'Monitors' },
        { name: 'Giyilebilir Teknoloji', slug: 'Wearables' },
        { name: 'Ofis Mobilyası', slug: 'Furniture' }
      ];
      for (const cat of initialCategories) {
        await this.categoryRepo.save(this.categoryRepo.create(cat));
      }
    }

    // Seed Warehouses
    const warehouseCount = await this.warehouseRepo.count();
    if (warehouseCount === 0) {
      console.log('[DbService] Warehouses table is empty. Seeding initial warehouses...');
      const initialWarehouses = [
        { name: 'Merkez Depo', code: 'WH-001', address: 'İstanbul Merkez' },
        { name: 'Ataşehir Şube', code: 'WH-002', address: 'Ataşehir, İstanbul' }
      ];
      for (const wh of initialWarehouses) {
        await this.warehouseRepo.save(this.warehouseRepo.create(wh));
      }
    }

    const productCount = await this.productRepo.count();
    if (productCount > 0) return;

    console.log('[DbService] Database is empty. Seeding initial data...');

    const initialProducts: Partial<ProductEntity>[] = [
      { name: 'Wireless Mouse M320', sku: 'MS-320', category: 'Accessories', price: 29.99, quantity: 45, minQuantity: 10, warehouses: { 'Merkez Depo': 30, 'Ataşehir Şube': 15 } },
      { name: 'Mechanical Keyboard K85', sku: 'KB-85', category: 'Accessories', price: 89.99, quantity: 8, minQuantity: 15, warehouses: { 'Merkez Depo': 5, 'Ataşehir Şube': 3 } },
      { name: 'UltraWide Monitor 34"', sku: 'MN-34U', category: 'Monitors', price: 449.99, quantity: 0, minQuantity: 5, warehouses: { 'Merkez Depo': 0, 'Ataşehir Şube': 0 } },
      { name: 'USB-C Hub 8-in-1', sku: 'HB-81', category: 'Accessories', price: 49.99, quantity: 60, minQuantity: 10, warehouses: { 'Merkez Depo': 40, 'Ataşehir Şube': 20 } },
      { name: 'Noise Cancelling Headphones', sku: 'HP-NC4', category: 'Audio', price: 199.99, quantity: 12, minQuantity: 10, warehouses: { 'Merkez Depo': 8, 'Ataşehir Şube': 4 } },
      { name: 'Ergonomic Office Chair', sku: 'CH-ERGO', category: 'Furniture', price: 289.99, quantity: 3, minQuantity: 5, warehouses: { 'Merkez Depo': 2, 'Ataşehir Şube': 1 } },
      { name: 'Webcam HD 1080p', sku: 'WC-1080', category: 'Accessories', price: 69.99, quantity: 25, minQuantity: 8, warehouses: { 'Merkez Depo': 15, 'Ataşehir Şube': 10 } },
      { name: 'Bluetooth Speaker Portable', sku: 'SP-BT5', category: 'Audio', price: 39.99, quantity: 1, minQuantity: 5, warehouses: { 'Merkez Depo': 1, 'Ataşehir Şube': 0 } },
      { name: 'Smart Watch Series 5', sku: 'SW-S5', category: 'Wearables', price: 249.99, quantity: 0, minQuantity: 8, warehouses: { 'Merkez Depo': 0, 'Ataşehir Şube': 0 } },
      { name: 'Laptop Stand Aluminum', sku: 'LS-ALUM', category: 'Accessories', price: 34.99, quantity: 80, minQuantity: 10, warehouses: { 'Merkez Depo': 50, 'Ataşehir Şube': 30 } },
    ];

    const savedProducts: ProductEntity[] = [];
    for (const p of initialProducts) {
      p.status = this.calculateStatus(p.quantity!, p.minQuantity!);
      p.isDeleted = false;
      const created = this.productRepo.create(p);
      savedProducts.push(await this.productRepo.save(created));
    }

    const today = new Date();
    const mockOrderTemplates = [
      { customer: 'Ahmet Yılmaz', daysAgo: 0, status: 'Completed', items: [{ pIndex: 0, qty: 2 }, { pIndex: 3, qty: 1 }] },
      { customer: 'Mehmet Kaya', daysAgo: 1, status: 'Completed', items: [{ pIndex: 4, qty: 1 }, { pIndex: 9, qty: 1 }] },
      { customer: 'Ayşe Demir', daysAgo: 1, status: 'Completed', items: [{ pIndex: 1, qty: 1 }] },
      { customer: 'Fatma Şahin', daysAgo: 2, status: 'Pending', items: [{ pIndex: 6, qty: 2 }] },
      { customer: 'Ali Çelik', daysAgo: 3, status: 'Completed', items: [{ pIndex: 3, qty: 3 }, { pIndex: 9, qty: 2 }] },
    ];

    for (let i = 0; i < mockOrderTemplates.length; i++) {
      const template = mockOrderTemplates[i];
      const orderDate = new Date();
      orderDate.setDate(today.getDate() - template.daysAgo);

      const items: OrderItem[] = template.items.map(item => {
        const prod = savedProducts[item.pIndex];
        return {
          productId: prod.id,
          productName: prod.name,
          quantity: item.qty,
          price: prod.price,
        };
      });

      const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      const newOrder = this.orderRepo.create({
        orderNumber: `ORD-${202600 + i + 1}`,
        customerName: template.customer,
        date: orderDate.toISOString(),
        status: template.status,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        items,
      });

      await this.orderRepo.save(newOrder);
    }
  }

  async getProducts(): Promise<ProductEntity[]> {
    return this.productRepo.find({ where: { isDeleted: false } });
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    return this.productRepo.findOne({ where: { id, isDeleted: false } });
  }

  async createProduct(data: Partial<ProductEntity>, performedBy: string = 'System'): Promise<ProductEntity> {
    return await this.dataSource.transaction(async manager => {
      // Validate category slug exists in db
      if (data.category) {
        const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: data.category, isDeleted: false } });
        if (!categoryExists) {
          throw new BadRequestException(`Geçersiz kategori: ${data.category}`);
        }
      }

      // Validate supplier exists in db
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
        status: this.calculateStatus(data.quantity || 0, data.minQuantity || 5)
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

  async bulkCreateProducts(products: Partial<ProductEntity>[], performedBy: string = 'System'): Promise<ProductEntity[]> {
    const skus = products.map(p => p.sku).filter(Boolean);
    
    // Check duplicates in payload
    const duplicateSkusInPayload = skus.filter((item, index) => skus.indexOf(item) !== index);
    if (duplicateSkusInPayload.length > 0) {
      console.warn(`[DbService] Toplu ürün yükleme çakışması: Yüklenen veri içerisinde yinelenen SKU'lar bulundu: ${duplicateSkusInPayload.join(', ')}`);
      throw new BadRequestException(`Yüklenen veri içerisinde yinelenen SKU'lar bulundu: ${duplicateSkusInPayload.join(', ')}`);
    }

    // Check duplicates in database
    if (skus.length > 0) {
      const existingProducts = await this.productRepo.createQueryBuilder('p')
        .where('p.sku IN (:...skus) AND p.isDeleted = false', { skus })
        .getMany();
      
      if (existingProducts.length > 0) {
        const existingSkus = existingProducts.map(p => p.sku);
        console.warn(`[DbService] Toplu ürün yükleme çakışması: Sistemde zaten kayıtlı olan SKU'lar bulundu: ${existingSkus.join(', ')}`);
        throw new BadRequestException(`Sistemde zaten kayıtlı olan SKU'lar bulundu: ${existingSkus.join(', ')}`);
      }
    }

    const savedProducts: ProductEntity[] = [];
    
    await this.dataSource.transaction(async manager => {
      const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
      const defaultWarehouseName = activeWarehouses.length > 0 ? activeWarehouses[0].name : null;

      for (const data of products) {
        // Validate category slug exists in db
        if (data.category) {
          const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: data.category, isDeleted: false } });
          if (!categoryExists) {
            throw new BadRequestException(`Geçersiz kategori: ${data.category}`);
          }
        }

        // Validate supplier exists in db
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
          status: this.calculateStatus(data.quantity || 0, data.minQuantity || 5)
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

  async updateProduct(id: string, updates: Partial<ProductEntity>, performedBy: string = 'System'): Promise<ProductEntity | null> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(ProductEntity, {
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return null;

      // Validate category slug exists in db if updated
      if (updates.category) {
        const categoryExists = await manager.findOne(CategoryEntity, { where: { slug: updates.category, isDeleted: false } });
        if (!categoryExists) {
          throw new BadRequestException(`Geçersiz kategori: ${updates.category}`);
        }
      }

      // Validate supplier exists in db if updated
      if (updates.supplierId) {
        const supplierExists = await manager.findOne(SupplierEntity, { where: { id: updates.supplierId, isDeleted: false } });
        if (!supplierExists) {
          throw new BadRequestException(`Geçersiz tedarikçi: ID ${updates.supplierId}`);
        }
      }

      const updatedQty = updates.quantity !== undefined ? updates.quantity : current.quantity;
      const updatedMin = updates.minQuantity !== undefined ? updates.minQuantity : current.minQuantity;
      const status = this.calculateStatus(updatedQty, updatedMin);

      if (updates.quantity !== undefined && updates.quantity !== current.quantity && !updates.warehouses) {
        const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
        const activeNames = activeWarehouses.map(w => w.name);
        const diff = updates.quantity - current.quantity;
        if (diff > 0) {
          current.warehouses = this.addStockToWarehouses(current.warehouses, diff, activeNames);
        } else if (diff < 0) {
          current.warehouses = this.deductStockFromWarehouses(current.warehouses, Math.abs(diff), activeNames);
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
    let success = false;
    for (const id of ids) {
      const deleted = await this.deleteProduct(id);
      if (deleted) success = true;
    }
    return success;
  }

  async bulkUpdateProducts(ids: string[], updates: Partial<ProductEntity>): Promise<boolean> {
    let success = false;
    for (const id of ids) {
      const updated = await this.updateProduct(id, updates);
      if (updated) success = true;
    }
    return success;
  }

  private calculateStatus(quantity: number, minQuantity: number): string {
    if (quantity <= 0) return 'Out of stock';
    if (quantity <= minQuantity) return 'Low stock';
    return 'In stock';
  }

  async getOrders(): Promise<OrderEntity[]> {
    return this.orderRepo.find({ order: { date: 'DESC' } });
  }

  async getOrderById(id: string): Promise<OrderEntity | null> {
    return this.orderRepo.findOne({ where: { id } });
  }

  async createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'totalAmount' | 'items'> & { items: Omit<OrderItem, 'price'>[] }, performedBy: string = 'System'): Promise<OrderEntity> {
    if (order.status === 'Cancelled') {
      throw new BadRequestException('Yeni bir sipariş "İptal Edildi" (Cancelled) durumuyla oluşturulamaz.');
    }
    const productsToEmit: ProductEntity[] = [];
    const savedOrder = await this.dataSource.transaction(async (manager) => {
      // 1. Generate orderNumber safely with retry loop to prevent collisions
      let orderNumber = '';
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await manager.findOne(OrderEntity, { where: { orderNumber } });
        if (!existing) break;
        attempts++;
      }
      if (attempts === maxAttempts) {
        throw new BadRequestException('Benzersiz sipariş numarası üretilemedi, lütfen tekrar deneyin.');
      }

      // 2. Verify stocks and subtract them within the transaction
      let totalAmount = 0;
      const items: OrderItem[] = [];

      // Merge items with duplicate productId (Bulgu #17)
      const mergedItemsMap = new Map<string, Omit<OrderItem, 'price'>>();
      for (const item of order.items) {
        if (mergedItemsMap.has(item.productId)) {
          const existing = mergedItemsMap.get(item.productId)!;
          existing.quantity += item.quantity;
        } else {
          mergedItemsMap.set(item.productId, { ...item });
        }
      }
      const orderItems = Array.from(mergedItemsMap.values());

      for (const item of orderItems) {
        // Find product with pessimistic write lock to block concurrent updates
        const prod = await manager.findOne(ProductEntity, {
          where: { id: item.productId, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });

        if (!prod) {
          throw new BadRequestException(`Ürün bulunamadı: ${item.productName}`);
        }
        if (prod.quantity < item.quantity) {
          throw new BadRequestException(`Yetersiz stok: ${prod.name} (Mevcut: ${prod.quantity})`);
        }

        // Subtract stock if completed or pending
        if (order.status === 'Completed' || order.status === 'Pending') {
          const oldQty = prod.quantity;
          
          const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
          const activeNames = activeWarehouses.map(w => w.name);
          prod.warehouses = this.deductStockFromWarehouses(prod.warehouses, item.quantity, activeNames);

          prod.quantity -= item.quantity;
          prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
          const savedProd = await manager.save(ProductEntity, prod);
          productsToEmit.push(savedProd);

          await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
            productId: savedProd.id,
            productName: savedProd.name,
            type: 'ORDER',
            quantity: -item.quantity,
            previousQuantity: oldQty,
            newQuantity: prod.quantity,
            referenceId: orderNumber,
            referenceType: 'order',
            note: `Sipariş oluşturuldu: ${orderNumber}`,
            performedBy
          }));
        }

        totalAmount += prod.price * item.quantity;
        items.push({
          productId: prod.id,
          productName: prod.name,
          quantity: item.quantity,
          price: prod.price,
        });
      }

      // 3. Save the order
      const newOrder = manager.create(OrderEntity, {
        ...order,
        orderNumber,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        items,
      });
      return await manager.save(OrderEntity, newOrder);
    });

    // Emit socket events outside of the transaction block (after successful commit)
    this.appGateway.server.emit('order_mutated', { type: 'create', order: savedOrder });
    for (const p of productsToEmit) {
      this.appGateway.server.emit('product_mutated', { type: 'update', product: p });
    }

    return savedOrder;
  }

  async updateOrderStatus(id: string, status: 'Completed' | 'Pending' | 'Cancelled' | string, performedBy: string = 'System'): Promise<OrderEntity | null> {
    const productsToEmit: ProductEntity[] = [];
    const savedOrder = await this.dataSource.transaction(async (manager) => {
      // Find the order and lock it
      const order = await manager.findOne(OrderEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' }
      });
      if (!order) return null;
      
      const oldStatus = order.status;
      if (oldStatus === status) return order;

      if (oldStatus === 'Cancelled') {
        throw new BadRequestException('İptal edilmiş bir siparişin durumu değiştirilemez.');
      }
      if (oldStatus === 'Completed' && status === 'Pending') {
        throw new BadRequestException('Tamamlanmış bir sipariş tekrar "Beklemede" (Pending) durumuna alınamaz.');
      }

      if (status === 'Cancelled' && (oldStatus === 'Pending' || oldStatus === 'Completed')) {
        for (const item of order.items) {
          const prod = await manager.findOne(ProductEntity, {
            where: { id: item.productId },
            lock: { mode: 'pessimistic_write' }
          });
          if (prod) {
            const oldQty = prod.quantity;

            const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
            const activeNames = activeWarehouses.map(w => w.name);
            prod.warehouses = this.addStockToWarehouses(prod.warehouses, item.quantity, activeNames);

            prod.quantity += item.quantity;
            prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
            const savedProd = await manager.save(ProductEntity, prod);
            productsToEmit.push(savedProd);

            await manager.save(StockMovementEntity, manager.create(StockMovementEntity, {
              productId: savedProd.id,
              productName: savedProd.name,
              type: 'RETURN',
              quantity: item.quantity,
              previousQuantity: oldQty,
              newQuantity: prod.quantity,
              referenceId: order.orderNumber,
              referenceType: 'order',
              note: `Sipariş iptal edildi: ${order.orderNumber}`,
              performedBy
            }));
          }
        }
      }

      order.status = status;
      return await manager.save(OrderEntity, order);
    });

    if (savedOrder) {
      this.appGateway.server.emit('order_mutated', { type: 'update', order: savedOrder });
      for (const p of productsToEmit) {
        this.appGateway.server.emit('product_mutated', { type: 'update', product: p });
      }
    }
    return savedOrder;
  }

  async deleteOrder(id: string): Promise<boolean> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (order) {
      if (order.status !== 'Cancelled') {
        throw new BadRequestException('Sadece iptal edilmiş siparişler silinebilir.');
      }
      await this.orderRepo.softRemove(order);
      this.appGateway.server.emit('order_mutated', { type: 'delete', orderId: id });
      return true;
    }
    return false;
  }

  // Stock Movements
  async getStockMovements(productId?: string, page: number = 1, limit: number = 20, search?: string): Promise<{ data: StockMovementEntity[], total: number }> {
    const query = this.stockMovementRepo.createQueryBuilder('sm').orderBy('sm.createdAt', 'DESC');
    if (productId) query.where('sm.productId = :productId', { productId });
    
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      query.andWhere(
        '(LOWER(sm.productName) LIKE :search OR LOWER(sm.note) LIKE :search OR LOWER(sm.type) LIKE :search)',
        { search: s }
      );
    }
    
    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
      
    return { data, total };
  }

  async createManualAdjustment(productId: string, newQuantity: number, note: string, performedBy: string): Promise<StockMovementEntity> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const prod = await manager.findOne(ProductEntity, {
        where: { id: productId, isDeleted: false },
        lock: { mode: 'pessimistic_write' }
      });
      if (!prod) throw new BadRequestException('Ürün bulunamadı');

      const oldQty = prod.quantity;
      const diff = newQuantity - oldQty;
      
      if (diff !== 0) {
        const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
        const activeNames = activeWarehouses.map(w => w.name);
        if (diff > 0) {
          prod.warehouses = this.addStockToWarehouses(prod.warehouses, diff, activeNames);
        } else {
          prod.warehouses = this.deductStockFromWarehouses(prod.warehouses, Math.abs(diff), activeNames);
        }
      }

      prod.quantity = newQuantity;
      prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
      const savedProd = await manager.save(ProductEntity, prod);

      const movement = manager.create(StockMovementEntity, {
        productId: savedProd.id,
        productName: savedProd.name,
        type: 'ADJUSTMENT',
        quantity: diff,
        previousQuantity: oldQty,
        newQuantity: newQuantity,
        note: note || 'Manuel düzeltme',
        referenceType: 'manual',
        performedBy
      });
      return await manager.save(StockMovementEntity, movement);
    });

    this.appGateway.server.emit('product_mutated', { type: 'update', product: await this.getProductById(productId) });
    return saved;
  }

  // Suppliers
  async getSuppliers(): Promise<SupplierEntity[]> {
    return this.supplierRepo.find({ where: { isDeleted: false }, order: { name: 'ASC' } });
  }

  async getSupplierById(id: string): Promise<SupplierEntity | null> {
    return this.supplierRepo.findOne({ where: { id, isDeleted: false } });
  }

  async createSupplier(data: Partial<SupplierEntity>): Promise<SupplierEntity> {
    if (data.name) {
      const existing = await this.supplierRepo.findOne({ where: { name: data.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu isimde bir tedarikçi zaten mevcut: ${data.name}`);
      }
    }
    if (data.email) {
      const existing = await this.supplierRepo.findOne({ where: { email: data.email, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu e-posta adresine sahip bir tedarikçi zaten mevcut: ${data.email}`);
      }
    }
    const newSupplier = this.supplierRepo.create(data);
    const saved = await this.supplierRepo.save(newSupplier);
    this.appGateway.server.emit('supplier_mutated', { type: 'create', supplier: saved });
    return saved;
  }

  async updateSupplier(id: string, updates: Partial<SupplierEntity>): Promise<SupplierEntity | null> {
    const supplier = await this.getSupplierById(id);
    if (!supplier) return null;

    if (updates.name && updates.name !== supplier.name) {
      const existing = await this.supplierRepo.findOne({ where: { name: updates.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu isimde bir tedarikçi zaten mevcut: ${updates.name}`);
      }
    }
    if (updates.email && updates.email !== supplier.email) {
      const existing = await this.supplierRepo.findOne({ where: { email: updates.email, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu e-posta adresine sahip bir tedarikçi zaten mevcut: ${updates.email}`);
      }
    }
    
    Object.assign(supplier, updates);
    const saved = await this.supplierRepo.save(supplier);
    this.appGateway.server.emit('supplier_mutated', { type: 'update', supplier: saved });
    return saved;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const supplier = await this.getSupplierById(id);
    if (supplier) {
      const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);
      const activePoCount = await poRepo.count({
        where: [
          { supplierId: id, status: 'Draft' },
          { supplierId: id, status: 'Sent' }
        ]
      });
      if (activePoCount > 0) {
        throw new BadRequestException('Bu tedarikçiye ait aktif satın alma siparişi bulunduğundan silinemez.');
      }

      // Set linked products' supplierId to null
      await this.productRepo.update({ supplierId: id }, { supplierId: null as any });

      supplier.isDeleted = true;
      await this.supplierRepo.save(supplier);
      this.appGateway.server.emit('supplier_mutated', { type: 'delete', supplierId: id });
      return true;
    }
    return false;
  }

  // Purchase Orders
  async getPurchaseOrders(): Promise<PurchaseOrderEntity[]> {
    return this.dataSource.getRepository(PurchaseOrderEntity).find({ order: { createdAt: 'DESC' } });
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderEntity | null> {
    return this.dataSource.getRepository(PurchaseOrderEntity).findOne({ where: { id } });
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
        // Stok artışı ve log
        for (const item of po.items) {
          const prod = await manager.findOne(ProductEntity, { where: { id: item.productId }, lock: { mode: 'pessimistic_write' } });
          if (prod) {
            const oldQty = prod.quantity;

            const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
            const activeNames = activeWarehouses.map(w => w.name);
            prod.warehouses = this.addStockToWarehouses(prod.warehouses, item.quantity, activeNames);

            prod.quantity += item.quantity;
            prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
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
    const repo = this.dataSource.getRepository(PurchaseOrderEntity);
    const po = await repo.findOne({ where: { id } });
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

    const saved = await repo.save(po);
    this.appGateway.server.emit('purchase_order_mutated', { type: 'update', purchaseOrder: saved });
    return saved;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    const repo = this.dataSource.getRepository(PurchaseOrderEntity);
    const po = await repo.findOne({ where: { id } });
    if (!po) return false;
    if (po.status !== 'Draft') {
      throw new BadRequestException('Sadece "Taslak" (Draft) durumundaki satın alma siparişleri silinebilir.');
    }
    await repo.remove(po);
    this.appGateway.server.emit('purchase_order_mutated', { type: 'delete', purchaseOrderId: id });
    return true;
  }

  // Categories CRUD
  async getCategories(): Promise<CategoryEntity[]> {
    return this.categoryRepo.find({ where: { isDeleted: false }, order: { name: 'ASC' } });
  }

  async createCategory(data: Partial<CategoryEntity>): Promise<CategoryEntity> {
    const slug = data.slug || this.slugify(data.name || '');
    const existing = await this.categoryRepo.findOne({ where: { slug, isDeleted: false } });
    if (existing) {
      throw new BadRequestException('Bu kategori slug bilgisi zaten kullanımda.');
    }
    const newCategory = this.categoryRepo.create({
      ...data,
      slug
    });
    return await this.categoryRepo.save(newCategory);
  }

  async updateCategory(id: string, updates: Partial<CategoryEntity>): Promise<CategoryEntity | null> {
    const category = await this.categoryRepo.findOne({ where: { id, isDeleted: false } });
    if (!category) return null;
    
    let targetSlug = updates.slug;
    if (updates.name && !targetSlug) {
      targetSlug = this.slugify(updates.name);
    }

    if (targetSlug && targetSlug !== category.slug) {
      const existing = await this.categoryRepo.findOne({ where: { slug: targetSlug, isDeleted: false } });
      if (existing) {
        throw new BadRequestException('Bu kategori slug bilgisi zaten kullanımda.');
      }
      updates.slug = targetSlug;
    }

    Object.assign(category, updates);
    return await this.categoryRepo.save(category);
  }

  async deleteCategory(id: string): Promise<boolean> {
    const category = await this.categoryRepo.findOne({ where: { id, isDeleted: false } });
    if (category) {
      const productCount = await this.productRepo.count({ where: { category: category.slug, isDeleted: false } });
      if (productCount > 0) {
        throw new BadRequestException('Bu kategoriye ait aktif ürünler bulunduğundan silinemez.');
      }
      category.isDeleted = true;
      await this.categoryRepo.save(category);
      return true;
    }
    return false;
  }

  private slugify(text: string): string {
    const trMap: Record<string, string> = {
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
    };
    for (const key in trMap) {
      text = text.replace(new RegExp(key, 'g'), trMap[key]);
    }
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  private deductStockFromWarehouses(
    warehouses: Record<string, number> | null,
    quantityToSubtract: number,
    activeWarehouseNames: string[]
  ): Record<string, number> {
    const wh = { ...(warehouses || {}) };
    let remaining = quantityToSubtract;

    for (const name of activeWarehouseNames) {
      if (remaining <= 0) break;
      const currentQty = wh[name] || 0;
      if (currentQty > 0) {
        const toSubtract = Math.min(currentQty, remaining);
        wh[name] = currentQty - toSubtract;
        remaining -= toSubtract;
      }
    }

    if (remaining > 0 && activeWarehouseNames.length > 0) {
      const firstWhName = activeWarehouseNames[0];
      const currentQty = wh[firstWhName] || 0;
      wh[firstWhName] = currentQty - remaining;
    }

    return wh;
  }

  private addStockToWarehouses(
    warehouses: Record<string, number> | null,
    quantityToAdd: number,
    activeWarehouseNames: string[]
  ): Record<string, number> {
    const wh = { ...(warehouses || {}) };
    if (activeWarehouseNames.length > 0) {
      const firstWhName = activeWarehouseNames[0];
      wh[firstWhName] = (wh[firstWhName] || 0) + quantityToAdd;
    }
    return wh;
  }

  // Reports API aggregation queries
  async getStockSummary(startDate?: string, endDate?: string) {
    const query = this.stockMovementRepo.createQueryBuilder('sm');
    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: new Date(endDate) });
    }
    
    const movements = await query.getMany();
    
    let totalIn = 0;
    let totalOut = 0;
    
    for (const m of movements) {
      const q = m.quantity || 0;
      if (q > 0) {
        totalIn += q;
      } else {
        totalOut += Math.abs(q);
      }
    }
    
    return {
      totalIn,
      totalOut,
      netChange: totalIn - totalOut
    };
  }

  async getProductMovementsReport(startDate?: string, endDate?: string) {
    const query = this.stockMovementRepo.createQueryBuilder('sm');
    if (startDate) {
      query.andWhere('sm.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      query.andWhere('sm.createdAt <= :endDate', { endDate: new Date(endDate) });
    }
    
    const movements = await query.getMany();
    const productReports: Record<string, { productId: string, productName: string, totalIn: number, totalOut: number }> = {};
    
    for (const m of movements) {
      const pId = m.productId;
      if (!pId) continue;
      if (!productReports[pId]) {
        productReports[pId] = {
          productId: pId,
          productName: m.productName || 'Bilinmeyen Ürün',
          totalIn: 0,
          totalOut: 0
        };
      }
      const qty = m.quantity || 0;
      if (qty > 0) {
        productReports[pId].totalIn += qty;
      } else {
        productReports[pId].totalOut += Math.abs(qty);
      }
    }
    
    return Object.values(productReports);
  }

  async getCategoryDistribution() {
    const products = await this.productRepo.find({ where: { isDeleted: false } });
    const distribution: Record<string, { category: string, productCount: number, totalStock: number, totalValue: number }> = {};
    
    for (const p of products) {
      const cat = p.category || 'Diğer';
      if (!distribution[cat]) {
        distribution[cat] = {
          category: cat,
          productCount: 0,
          totalStock: 0,
          totalValue: 0
        };
      }
      distribution[cat].productCount += 1;
      distribution[cat].totalStock += p.quantity || 0;
      distribution[cat].totalValue += (p.quantity || 0) * (p.price || 0);
    }
    return Object.values(distribution);
  }

  async getTopSelling(days: number = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);
    
    const orders = await this.orderRepo.find();
    const filteredOrders = orders.filter(o => 
      o.status === 'Completed' && 
      new Date(o.date).getTime() >= thresholdDate.getTime()
    );

    const productSales: Record<string, { productName: string, totalQty: number, totalRevenue: number }> = {};

    for (const order of filteredOrders) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        if (!item.productId) continue;
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            productName: item.productName || 'Bilinmeyen Ürün',
            totalQty: 0,
            totalRevenue: 0
          };
        }
        productSales[item.productId].totalQty += item.quantity || 0;
        productSales[item.productId].totalRevenue += (item.quantity || 0) * (item.price || 0);
      }
    }

    return Object.values(productSales)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);
  }

  async getSupplierSummary() {
    const pos = await this.dataSource.getRepository(PurchaseOrderEntity).find();
    const summary: Record<string, { supplierName: string, poCount: number, totalAmount: number }> = {};
    
    for (const po of pos) {
      if (po.status === 'Cancelled') continue;
      const sId = po.supplierId;
      if (!summary[sId]) {
        summary[sId] = {
          supplierName: po.supplierName || 'Bilinmeyen Tedarikçi',
          poCount: 0,
          totalAmount: 0
        };
      }
      summary[sId].poCount += 1;
      if (po.status === 'Received') {
        summary[sId].totalAmount += Number(po.totalAmount) || 0;
      }
    }
    return Object.values(summary);
  }

  async getStockCounts(): Promise<StockCountEntity[]> {
    return this.dataSource.getRepository(StockCountEntity).find({
      order: { createdAt: 'DESC' }
    });
  }

  async createStockCount(notes?: string, performedBy?: string): Promise<StockCountEntity> {
    const repo = this.dataSource.getRepository(StockCountEntity);
    
    const activeCount = await repo.findOne({ where: { status: 'InProgress' } });
    if (activeCount) {
      throw new BadRequestException('Halihazırda devam eden bir sayım seansı bulunmaktadır.');
    }
    
    // Generate countNumber format SC-YYYYMMDD-HHMMSS
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const countNumber = `SC-${dateStr}-${timeStr}`;

    // Get all active products
    const products = await this.productRepo.find({ where: { isDeleted: false } });
    
    // Map products to StockCountItem list
    const items: StockCountItem[] = products.map(p => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      systemQuantity: p.quantity,
      countedQuantity: p.quantity, // starts as system quantity
      difference: 0,
      unit: p.unit || 'Adet'
    }));

    const newCount = repo.create({
      countNumber,
      status: 'InProgress',
      items,
      startedAt: now,
      performedBy: performedBy || 'System',
      notes: notes || ''
    });

    const saved = await repo.save(newCount);
    this.appGateway.server.emit('stock_count_mutated', { type: 'create', stockCount: saved });
    return saved;
  }

  async updateStockCount(id: string, items: any[], notes?: string): Promise<StockCountEntity | null> {
    const repo = this.dataSource.getRepository(StockCountEntity);
    const count = await repo.findOne({ where: { id, status: 'InProgress' } });
    if (!count) return null;

    // Map and update difference for each item
    const updatedItems: StockCountItem[] = items.map(item => {
      const counted = Number(item.countedQuantity) || 0;
      const system = Number(item.systemQuantity) || 0;
      return {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        systemQuantity: system,
        countedQuantity: counted,
        difference: counted - system,
        unit: item.unit || 'Adet'
      };
    });

    count.items = updatedItems;
    if (notes !== undefined) {
      count.notes = notes;
    }

    const saved = await repo.save(count);
    this.appGateway.server.emit('stock_count_mutated', { type: 'update', stockCount: saved });
    return saved;
  }

  async completeStockCount(id: string, performedBy?: string): Promise<StockCountEntity | null> {
    const countRepo = this.dataSource.getRepository(StockCountEntity);
    const count = await countRepo.findOne({ where: { id, status: 'InProgress' } });
    if (!count) return null;

    // Run within a transaction to perform atomic stock adjustments
    const completedCount = await this.dataSource.transaction(async (manager) => {
      // Loop over items and perform adjustments if difference is non-zero
      for (const item of count.items) {
        // Lock and load product
        const product = await manager.findOne(ProductEntity, {
          where: { id: item.productId, isDeleted: false },
          lock: { mode: 'pessimistic_write' }
        });
        
        if (product) {
          const oldQty = product.quantity;
          const difference = Number(item.countedQuantity) - oldQty;
          
          // Update item's systemQuantity and difference to reflect reality at completion
          item.systemQuantity = oldQty;
          item.difference = difference;

          if (difference !== 0) {
            const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
            const activeNames = activeWarehouses.map(w => w.name);
            if (difference > 0) {
              product.warehouses = this.addStockToWarehouses(product.warehouses, difference, activeNames);
            } else {
              product.warehouses = this.deductStockFromWarehouses(product.warehouses, Math.abs(difference), activeNames);
            }

            product.quantity = item.countedQuantity;
            product.status = this.calculateStatus(product.quantity, product.minQuantity);
            const savedProd = await manager.save(ProductEntity, product);

            // Create StockMovement record
            const movementType = difference > 0 ? 'IN' : 'OUT';
            const newMovement = manager.create(StockMovementEntity, {
              productId: product.id,
              productName: product.name,
              type: movementType,
              quantity: Math.abs(difference),
              previousQuantity: oldQty,
              newQuantity: item.countedQuantity,
              referenceId: count.id,
              referenceType: 'stock_count',
              note: `Sayım Düzeltmesi (Fark: ${difference > 0 ? '+' : ''}${difference})`,
              performedBy: performedBy || 'System'
            });
            await manager.save(StockMovementEntity, newMovement);

            // Broadcast product update event
            this.appGateway.server.emit('product_mutated', { type: 'update', product: savedProd });
          }
        }
      }

      count.status = 'Completed';
      count.completedAt = new Date();
      if (performedBy) {
        count.performedBy = performedBy;
      }
      return await manager.save(StockCountEntity, count);
    });

    if (completedCount) {
      this.appGateway.server.emit('stock_count_mutated', { type: 'complete', stockCount: completedCount });
    }
    return completedCount;
  }

  // ─── Warehouse Management ────────────────────────────────────
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
    
    Object.assign(warehouse, updates);
    const saved = await this.warehouseRepo.save(warehouse);
    this.appGateway.server.emit('warehouse_mutated', { type: 'update', warehouse: saved });
    return saved;
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
    performedBy: string = 'System'
  ): Promise<ProductEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(ProductEntity, {
        where: { id: productId, isDeleted: false },
        lock: { mode: 'pessimistic_write' }
      });
      if (!product) return null;

      const warehouses = product.warehouses || {};
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

      // Create stock movement record for transfer
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

  // ─── Auto Draft Purchase Orders ──────────────────────────────
  async autoDraftPurchaseOrders(): Promise<any[]> {
    const products = await this.productRepo.find({ where: { isDeleted: false } });
    const lowStockProducts = products.filter(p => p.quantity < p.minQuantity && p.quantity >= 0 && p.supplierId);

    if (lowStockProducts.length === 0) {
      return [];
    }

    // Group by supplier
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
      // Recommended quantity = minQuantity * 2 - quantity (buffer order)
      const reorderQty = Math.max(p.minQuantity * 2 - p.quantity, p.minQuantity);
      supplierGroups[key].items.push({
        productId: p.id,
        productName: p.name,
        quantity: reorderQty
      });
    }

    // Create PO for each supplier group
    const poRepo = this.dataSource.getRepository(PurchaseOrderEntity);
    const createdPOs: any[] = [];
    const now = new Date();

    for (const group of Object.values(supplierGroups)) {
      const poNumber = `PO-AUTO-${now.getTime().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const totalAmount = group.items.reduce((sum: number, item: any) => {
        const prod = products.find(p => p.id === item.productId);
        return sum + (prod ? prod.price * item.quantity : 0);
      }, 0);

      const newPO = poRepo.create({
        poNumber,
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        status: 'Draft',
        items: group.items,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        notes: 'AI destekli otomatik sipariş taslağı. Stok kritik seviyenin altındaki ürünler için oluşturuldu.',
        createdAt: now
      });

      const saved = await poRepo.save(newPO);
      createdPOs.push(saved);
    }

    return createdPOs;
  }

  // ─── AI Forecast Data Helper ─────────────────────────────────
  async getProductForecastData(productId: string): Promise<any> {
    const product = await this.productRepo.findOne({ where: { id: productId, isDeleted: false } });
    if (!product) return null;

    // Get recent stock movements for this product (last 90 days)
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

  // ─── User Management Helpers ──────────────────────────────────
  hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  async getUserByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async updateUserProfile(username: string, updates: Partial<UserEntity>): Promise<UserEntity> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;

    const saved = await this.userRepo.save(user);
    delete (saved as any).password;
    return saved;
  }

  async updateUserPassword(username: string, newPasswordPlain: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    user.password = this.hashPassword(newPasswordPlain);
    user.tokenVersion++;
    await this.userRepo.save(user);
  }

  async terminateUserSessions(username: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    user.tokenVersion++;
    await this.userRepo.save(user);
  }

  async getAllUsers(): Promise<UserEntity[]> {
    const users = await this.userRepo.find({ order: { fullName: 'ASC' } });
    return users.map(u => {
      delete (u as any).password;
      return u;
    });
  }

  async createUser(adminUsername: string, data: any): Promise<UserEntity> {
    const admin = await this.getUserByUsername(adminUsername);
    if (!admin) {
      throw new BadRequestException('Yönetici bulunamadı.');
    }

    const currentCount = await this.userRepo.count();
    const plan = admin.subscriptionPlan || 'standard';

    let limit = 1;
    if (plan === 'professional') limit = 5;
    else if (plan === 'ultra') limit = 999999;
    else if (plan === 'none') limit = 0;

    if (currentCount >= limit) {
      const planName = plan === 'standard' ? 'Standart' : plan === 'professional' ? 'Profesyonel' : 'Ultra';
      throw new BadRequestException(
        `Mevcut planınız (${planName}) en fazla ${limit} kullanıcıya izin vermektedir. ` +
        `Yeni kullanıcı eklemek için lütfen planınızı yükseltin.`
      );
    }

    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) {
      throw new BadRequestException(`"${data.username}" kullanıcı adı zaten kullanımda.`);
    }

    const newUser = this.userRepo.create({
      username: data.username,
      password: this.hashPassword(data.password || '123456'),
      role: data.role || 'viewer',
      fullName: data.fullName,
      email: data.email,
      department: data.department || '',
      subscriptionPlan: 'standard',
      tokenVersion: 0
    });

    const saved = await this.userRepo.save(newUser);
    delete (saved as any).password;
    return saved;
  }

  async updateUser(id: string, updates: any): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }

    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.department !== undefined) user.department = updates.department;
    if (updates.role !== undefined) user.role = updates.role;
    
    if (updates.password) {
      user.password = this.hashPassword(updates.password);
      user.tokenVersion++;
    }

    const saved = await this.userRepo.save(user);
    delete (saved as any).password;
    return saved;
  }

  async deleteUser(id: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return false;
    
    if (user.role === 'admin') {
      throw new BadRequestException('Ana yönetici hesabı silinemez.');
    }

    await this.userRepo.remove(user);
    return true;
  }

  async updateSubscription(username: string, plan: string): Promise<void> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    user.subscriptionPlan = plan;
    if (plan === 'none') {
      user.subscriptionExpiresAt = null as any;
    } else {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      user.subscriptionExpiresAt = expires;
    }
    await this.userRepo.save(user);
  }
}
