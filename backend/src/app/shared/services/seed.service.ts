import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { CompanyEntity, DEFAULT_COMPANY } from '../../entities/company.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { StockHelperService } from './stock-helper.service';
import { WarehouseStockService } from './warehouse-stock.service';
import { CustomerEntity } from '../../entities/customer.entity';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { defaultTaxRatesFor } from '../finance/tax-defaults';
import { calculateLine, calculateTotals } from '../finance/tax';
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
    private readonly warehouseStock: WarehouseStockService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedMockDataIfEmpty();
  }

  /** Ensures the default "Demo Şirketi" tenant exists and returns its id. */
  private async ensureDefaultCompany(): Promise<string> {
    const companyRepo = this.dataSource.getRepository(CompanyEntity);
    const existing = await companyRepo.findOne({ where: [{ id: DEFAULT_COMPANY.id }, { slug: DEFAULT_COMPANY.slug }] });
    if (existing) return existing.id;
    this.logger.log(`Creating default company "${DEFAULT_COMPANY.name}"...`);
    const saved = await companyRepo.save(companyRepo.create({ ...DEFAULT_COMPANY }));
    return saved.id;
  }

  private async seedMockDataIfEmpty() {
    const companyId = await this.ensureDefaultCompany();
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
          },
          {
            username: 'demo',
            password: this.stockHelper.hashPassword('demo123'),
            role: UserRole.VIEWER,
            fullName: 'Demo Kullanıcısı',
            email: 'demo@sirket.com',
            department: 'Demo Modu',
            tokenVersion: 0,
          }
        );
      }

      for (const u of initialUsers) {
        await this.userRepo.save(this.userRepo.create({ ...u, companyId }));
      }
    } else {
      // Ensure demo account exists even if DB already seeded
      const existingDemo = await this.userRepo.findOne({ where: { username: 'demo' } });
      if (!existingDemo) {
        this.logger.log('Seeding demo user account (demo / demo123)...');
        await this.userRepo.save(
          this.userRepo.create({
            companyId,
            username: 'demo',
            password: this.stockHelper.hashPassword('demo123'),
            role: UserRole.VIEWER,
            fullName: 'Demo Kullanıcısı',
            email: 'demo@sirket.com',
            department: 'Demo Modu',
            tokenVersion: 0,
          })
        );
      }
    }

    const categoryCount = await this.categoryRepo.count({ where: { companyId } });
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
        await this.categoryRepo.save(this.categoryRepo.create({ ...cat, companyId }));
      }
    }

    const warehouseCount = await this.warehouseRepo.count({ where: { companyId } });
    if (warehouseCount === 0) {
      this.logger.log('Warehouses table is empty. Seeding initial warehouses...');
      const initialWarehouses = [
        { name: 'Merkez Depo', code: 'WH-001', address: 'İstanbul Merkez' },
        { name: 'Ataşehir Şube', code: 'WH-002', address: 'Ataşehir, İstanbul' },
      ];
      for (const wh of initialWarehouses) {
        await this.warehouseRepo.save(this.warehouseRepo.create({ ...wh, companyId }));
      }
    }

    // Starter tax rates (KDV %20 default, %10, %1 for TR).
    const taxCount = await this.dataSource.manager.count(TaxRateEntity, { where: { companyId } });
    if (taxCount === 0) {
      const company = await this.dataSource.getRepository(CompanyEntity).findOneByOrFail({ id: companyId });
      for (const t of defaultTaxRatesFor(company.country)) {
        await this.dataSource.getRepository(TaxRateEntity).save({ ...t, companyId });
      }
    }

    const productCount = await this.productRepo.count({ where: { companyId } });
    if (productCount > 0) return;

    this.logger.log('Database is empty. Seeding initial products & orders...');

    const company = await this.dataSource.getRepository(CompanyEntity).findOneByOrFail({ id: companyId });
    const defaultTax = await this.dataSource.getRepository(TaxRateEntity).findOne({ where: { companyId, isDefault: true } });
    const taxPct = defaultTax ? Number(defaultTax.rate) : 0;

    // Per-warehouse opening stock: [Merkez Depo, Ataşehir Şube]
    const initialProducts: (Partial<ProductEntity> & { stock: [number, number] })[] = [
      { name: 'Wireless Mouse M320', sku: 'MS-320', category: 'Accessories', price: 29.99, minQuantity: 10, stock: [30, 15] },
      { name: 'Mechanical Keyboard K85', sku: 'KB-85', category: 'Accessories', price: 89.99, minQuantity: 15, stock: [5, 3] },
      { name: 'UltraWide Monitor 34"', sku: 'MN-34U', category: 'Monitors', price: 449.99, minQuantity: 5, stock: [0, 0] },
      { name: 'USB-C Hub 8-in-1', sku: 'HB-81', category: 'Accessories', price: 49.99, minQuantity: 10, stock: [40, 20] },
      { name: 'Noise Cancelling Headphones', sku: 'HP-NC4', category: 'Audio', price: 199.99, minQuantity: 10, stock: [8, 4] },
      { name: 'Ergonomic Office Chair', sku: 'CH-ERGO', category: 'Furniture', price: 289.99, minQuantity: 5, stock: [2, 1] },
      { name: 'Webcam HD 1080p', sku: 'WC-1080', category: 'Accessories', price: 69.99, minQuantity: 8, stock: [15, 10] },
      { name: 'Bluetooth Speaker Portable', sku: 'SP-BT5', category: 'Audio', price: 39.99, minQuantity: 5, stock: [1, 0] },
      { name: 'Smart Watch Series 5', sku: 'SW-S5', category: 'Wearables', price: 249.99, minQuantity: 8, stock: [0, 0] },
      { name: 'Laptop Stand Aluminum', sku: 'LS-ALUM', category: 'Accessories', price: 34.99, minQuantity: 10, stock: [50, 30] },
    ];

    const today = new Date();
    const mockOrderTemplates = [
      { customer: 'Ahmet Yılmaz', daysAgo: 0, status: OrderStatus.COMPLETED, items: [{ pIndex: 0, qty: 2 }, { pIndex: 3, qty: 1 }] },
      { customer: 'Mehmet Kaya', daysAgo: 1, status: OrderStatus.COMPLETED, items: [{ pIndex: 4, qty: 1 }, { pIndex: 9, qty: 1 }] },
      { customer: 'Ayşe Demir', daysAgo: 1, status: OrderStatus.COMPLETED, items: [{ pIndex: 1, qty: 1 }] },
      { customer: 'Fatma Şahin', daysAgo: 2, status: OrderStatus.PENDING, items: [{ pIndex: 6, qty: 2 }] },
      { customer: 'Ali Çelik', daysAgo: 3, status: OrderStatus.COMPLETED, items: [{ pIndex: 3, qty: 3 }, { pIndex: 9, qty: 2 }] },
    ];

    await this.dataSource.transaction(async (manager) => {
      const warehouses = await this.warehouseStock.activeWarehouses(manager, companyId);
      const savedProducts: ProductEntity[] = [];
      for (const { stock, ...p } of initialProducts) {
        const prod = await manager.save(
          ProductEntity,
          manager.create(ProductEntity, {
            ...p,
            companyId,
            currency: company.baseCurrency,
            quantity: 0,
            status: this.stockHelper.calculateStatus(0, p.minQuantity!),
            isDeleted: false,
          })
        );
        const allocations = stock
          .map((qty, i) => ({ warehouseId: warehouses[i]?.id ?? warehouses[0]?.id, delta: qty }))
          .filter((a) => a.warehouseId && a.delta > 0);
        await this.warehouseStock.apply(manager, prod, allocations);
        await this.warehouseStock.recordMovements(manager, prod, 0, allocations, {
          type: StockMovementType.IN, referenceType: 'manual', note: 'Initial seed stock', performedBy: 'SeedSystem',
        });
        savedProducts.push(prod);
      }

      // Customers + orders
      const customers = new Map<string, CustomerEntity>();
      for (let i = 0; i < mockOrderTemplates.length; i++) {
        const template = mockOrderTemplates[i];
        const orderDate = new Date();
        orderDate.setDate(today.getDate() - template.daysAgo);
        const orderNum = `ORD-${202600 + i + 1}`;

        let customer = customers.get(template.customer);
        if (!customer) {
          customer = await manager.save(CustomerEntity, manager.create(CustomerEntity, {
            companyId, name: template.customer, type: 'individual', country: company.country, currency: company.baseCurrency,
          }));
          customers.set(template.customer, customer);
        }

        const lines = [];
        const itemEntities: OrderItemEntity[] = [];
        for (const item of template.items) {
          const prod = savedProducts[item.pIndex];
          const oldQty = prod.quantity;
          const allocations = await this.warehouseStock.deduct(manager, prod, item.qty);
          await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
            type: StockMovementType.ORDER, referenceId: orderNum, referenceType: 'order',
            note: `Initial seed order: ${orderNum}`, performedBy: 'SeedSystem',
          });
          const line = calculateLine({ quantity: item.qty, unitPrice: prod.price, taxRate: taxPct }, company.pricesIncludeTax);
          lines.push(line);
          itemEntities.push(manager.create(OrderItemEntity, {
            productId: prod.id, productName: prod.name, quantity: item.qty,
            price: line.unitPrice, unitPrice: line.unitPrice, taxRate: line.taxRate, taxAmount: line.taxAmount, lineTotal: line.lineTotal,
          }));
        }
        const totals = calculateTotals(lines);

        await manager.save(OrderEntity, manager.create(OrderEntity, {
          companyId,
          orderNumber: orderNum,
          customerId: customer.id,
          customerName: template.customer,
          date: orderDate,
          status: template.status,
          currency: company.baseCurrency,
          exchangeRate: 1,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          totalAmount: totals.grandTotal,
          items: itemEntities,
        }));
      }
    });

    this.logger.log('Initial data seed complete with transactional stock deduction.');
  }
}

