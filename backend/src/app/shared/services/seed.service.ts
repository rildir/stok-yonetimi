import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { StockHelperService } from './stock-helper.service';
import { UserRole, OrderStatus, StockMovementType } from '../../entities/enums';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedMockDataIfEmpty();
  }

  private async seedMockDataIfEmpty() {
    const userCount = await this.userRepo.count();
    if (userCount === 0) {
      this.logger.log('Users table is empty. Seeding initial users...');
      const isProduction = process.env.NODE_ENV === 'production';
      const initialUsers = [
        {
          username: process.env.ADMIN_USERNAME || 'admin',
          password: this.stockHelper.hashPassword(process.env.ADMIN_PASSWORD || 'admin'),
          role: UserRole.ADMIN,
          fullName: 'Ahmet Ildır',
          email: 'admin@sirket.com',
          department: 'Sistem Yönetimi',
          tokenVersion: 0,
        },
      ];

      if (!isProduction) {
        initialUsers.push(
          {
            username: 'manager',
            password: this.stockHelper.hashPassword('manager123'),
            role: UserRole.MANAGER,
            fullName: 'Yönetici Demo',
            email: 'manager@sirket.com',
            department: 'Stok Yönetimi',
            tokenVersion: 0,
          },
          {
            username: 'viewer',
            password: this.stockHelper.hashPassword('viewer123'),
            role: UserRole.VIEWER,
            fullName: 'Gözlemci Demo',
            email: 'viewer@sirket.com',
            department: 'Gözlem Ekibi',
            tokenVersion: 0,
          }
        );
      }

      for (const u of initialUsers) {
        await this.userRepo.save(this.userRepo.create(u));
      }
    }

    const categoryCount = await this.categoryRepo.count();
    if (categoryCount === 0) {
      this.logger.log('Categories table is empty. Seeding initial categories...');
      const initialCategories = [
        { name: 'Aksesuarlar', slug: 'Accessories' },
        { name: 'Ses Ekipmanları', slug: 'Audio' },
        { name: 'Monitörler', slug: 'Monitors' },
        { name: 'Giyilebilir Teknoloji', slug: 'Wearables' },
        { name: 'Ofis Mobilyası', slug: 'Furniture' },
      ];
      for (const cat of initialCategories) {
        await this.categoryRepo.save(this.categoryRepo.create(cat));
      }
    }

    const warehouseCount = await this.warehouseRepo.count();
    if (warehouseCount === 0) {
      this.logger.log('Warehouses table is empty. Seeding initial warehouses...');
      const initialWarehouses = [
        { name: 'Merkez Depo', code: 'WH-001', address: 'İstanbul Merkez' },
        { name: 'Ataşehir Şube', code: 'WH-002', address: 'Ataşehir, İstanbul' },
      ];
      for (const wh of initialWarehouses) {
        await this.warehouseRepo.save(this.warehouseRepo.create(wh));
      }
    }

    const productCount = await this.productRepo.count();
    if (productCount > 0) return;

    this.logger.log('Database is empty. Seeding initial products & orders...');

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
      p.status = this.stockHelper.calculateStatus(p.quantity!, p.minQuantity!);
      p.isDeleted = false;
      const created = this.productRepo.create(p);
      savedProducts.push(await this.productRepo.save(created));
    }

    const today = new Date();
    const mockOrderTemplates = [
      { customer: 'Ahmet Yılmaz', daysAgo: 0, status: OrderStatus.COMPLETED, items: [{ pIndex: 0, qty: 2 }, { pIndex: 3, qty: 1 }] },
      { customer: 'Mehmet Kaya', daysAgo: 1, status: OrderStatus.COMPLETED, items: [{ pIndex: 4, qty: 1 }, { pIndex: 9, qty: 1 }] },
      { customer: 'Ayşe Demir', daysAgo: 1, status: OrderStatus.COMPLETED, items: [{ pIndex: 1, qty: 1 }] },
      { customer: 'Fatma Şahin', daysAgo: 2, status: OrderStatus.PENDING, items: [{ pIndex: 6, qty: 2 }] },
      { customer: 'Ali Çelik', daysAgo: 3, status: OrderStatus.COMPLETED, items: [{ pIndex: 3, qty: 3 }, { pIndex: 9, qty: 2 }] },
    ];

    await this.dataSource.transaction(async (manager) => {
      const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
      const activeNames = activeWarehouses.map((w) => w.name);

      for (let i = 0; i < mockOrderTemplates.length; i++) {
        const template = mockOrderTemplates[i];
        const orderDate = new Date();
        orderDate.setDate(today.getDate() - template.daysAgo);

        const orderNum = `ORD-${202600 + i + 1}`;
        let totalAmount = 0;
        const itemEntities: OrderItemEntity[] = [];

        for (const item of template.items) {
          const prod = savedProducts[item.pIndex];
          const oldQty = prod.quantity;

          if (template.status === OrderStatus.COMPLETED || template.status === OrderStatus.PENDING) {
            prod.warehouses = this.stockHelper.deductStockFromWarehouses(prod.warehouses, item.qty, activeNames);
            prod.quantity = Math.max(0, prod.quantity - item.qty);
            prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
            await manager.save(ProductEntity, prod);

            await manager.save(
              StockMovementEntity,
              manager.create(StockMovementEntity, {
                productId: prod.id,
                productName: prod.name,
                type: StockMovementType.ORDER,
                quantity: -item.qty,
                previousQuantity: oldQty,
                newQuantity: prod.quantity,
                referenceId: orderNum,
                referenceType: 'order',
                note: `Initial seed order: ${orderNum}`,
                performedBy: 'SeedSystem',
              })
            );
          }

          totalAmount += prod.price * item.qty;

          itemEntities.push(
            manager.create(OrderItemEntity, {
              productId: prod.id,
              productName: prod.name,
              quantity: item.qty,
              price: prod.price,
            })
          );
        }

        const newOrder = manager.create(OrderEntity, {
          orderNumber: orderNum,
          customerName: template.customer,
          date: orderDate,
          status: template.status,
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          items: itemEntities,
        });

        await manager.save(OrderEntity, newOrder);
      }
    });

    this.logger.log('Initial data seed complete with transactional stock deduction.');
  }
}
