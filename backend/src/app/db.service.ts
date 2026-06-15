import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';
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
}

@Injectable()
export class DbService implements OnModuleInit {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedMockDataIfEmpty();
  }

  private async seedMockDataIfEmpty() {
    const productCount = await this.productRepo.count();
    if (productCount > 0) return;

    console.log('[DbService] Database is empty. Seeding initial data...');

    const initialProducts: Partial<ProductEntity>[] = [
      { name: 'Wireless Mouse M320', sku: 'MS-320', category: 'Accessories', price: 29.99, quantity: 45, minQuantity: 10 },
      { name: 'Mechanical Keyboard K85', sku: 'KB-85', category: 'Accessories', price: 89.99, quantity: 8, minQuantity: 15 },
      { name: 'UltraWide Monitor 34"', sku: 'MN-34U', category: 'Monitors', price: 449.99, quantity: 0, minQuantity: 5 },
      { name: 'USB-C Hub 8-in-1', sku: 'HB-81', category: 'Accessories', price: 49.99, quantity: 60, minQuantity: 10 },
      { name: 'Noise Cancelling Headphones', sku: 'HP-NC4', category: 'Audio', price: 199.99, quantity: 12, minQuantity: 10 },
      { name: 'Ergonomic Office Chair', sku: 'CH-ERGO', category: 'Furniture', price: 289.99, quantity: 3, minQuantity: 5 },
      { name: 'Webcam HD 1080p', sku: 'WC-1080', category: 'Accessories', price: 69.99, quantity: 25, minQuantity: 8 },
      { name: 'Bluetooth Speaker Portable', sku: 'SP-BT5', category: 'Audio', price: 39.99, quantity: 1, minQuantity: 5 },
      { name: 'Smart Watch Series 5', sku: 'SW-S5', category: 'Wearables', price: 249.99, quantity: 0, minQuantity: 8 },
      { name: 'Laptop Stand Aluminum', sku: 'LS-ALUM', category: 'Accessories', price: 34.99, quantity: 80, minQuantity: 10 },
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

  async createProduct(prod: Omit<Product, 'id' | 'status' | 'isDeleted'>): Promise<ProductEntity> {
    const status = this.calculateStatus(prod.quantity, prod.minQuantity);
    const newProduct = this.productRepo.create({ ...prod, status, isDeleted: false });
    const saved = await this.productRepo.save(newProduct);
    this.appGateway.server.emit('product_mutated', { type: 'create', product: saved });
    return saved;
  }

  async updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'status' | 'isDeleted'>>): Promise<ProductEntity | null> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(ProductEntity, {
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return null;

      const updatedQty = updates.quantity !== undefined ? updates.quantity : current.quantity;
      const updatedMin = updates.minQuantity !== undefined ? updates.minQuantity : current.minQuantity;
      const status = this.calculateStatus(updatedQty, updatedMin);

      Object.assign(current, updates, { status });
      return await manager.save(ProductEntity, current);
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

  async createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'totalAmount' | 'items'> & { items: Omit<OrderItem, 'price'>[] }): Promise<OrderEntity> {
    const productsToEmit: ProductEntity[] = [];
    const savedOrder = await this.dataSource.transaction(async (manager) => {
      // 1. Generate orderNumber safely
      const orderNumber = `ORD-${Date.now()}`;

      // 2. Verify stocks and subtract them within the transaction
      let totalAmount = 0;
      const items: OrderItem[] = [];

      for (const item of order.items) {
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
          prod.quantity -= item.quantity;
          prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
          const savedProd = await manager.save(ProductEntity, prod);
          productsToEmit.push(savedProd);
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

  async updateOrderStatus(id: string, status: 'Completed' | 'Pending' | 'Cancelled' | string): Promise<OrderEntity | null> {
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

      if (oldStatus === 'Cancelled' && (status === 'Pending' || status === 'Completed')) {
        for (const item of order.items) {
          const prod = await manager.findOne(ProductEntity, {
            where: { id: item.productId },
            lock: { mode: 'pessimistic_write' }
          });
          if (!prod) throw new BadRequestException(`Ürün artık mevcut değil: ${item.productName}`);
          if (prod.quantity < item.quantity) throw new BadRequestException(`Yetersiz stok: ${prod.name} (Mevcut: ${prod.quantity})`);
          
          prod.quantity -= item.quantity;
          prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
          const savedProd = await manager.save(ProductEntity, prod);
          productsToEmit.push(savedProd);
        }
      }

      if (status === 'Cancelled' && (oldStatus === 'Pending' || oldStatus === 'Completed')) {
        for (const item of order.items) {
          const prod = await manager.findOne(ProductEntity, {
            where: { id: item.productId },
            lock: { mode: 'pessimistic_write' }
          });
          if (prod) {
            prod.quantity += item.quantity;
            prod.status = this.calculateStatus(prod.quantity, prod.minQuantity);
            const savedProd = await manager.save(ProductEntity, prod);
            productsToEmit.push(savedProd);
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
}
