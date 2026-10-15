import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductService } from './product.service';
import { ProductEntity } from '../../entities/product.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { UnitService } from '../../shared/services/unit.service';

const financeStub = { getCompany: jest.fn().mockResolvedValue({ baseCurrency: 'TRY' }), assertTaxRate: jest.fn() };
const unitStub = {
  attachUnits: jest.fn().mockImplementation(async (_m: any, _c: string, ps: any[]) => ps),
  defaultUnit: jest.fn().mockResolvedValue({ id: 'u-pcs', code: 'pcs' }),
  requireUnit: jest.fn().mockResolvedValue({ id: 'u-pcs', code: 'pcs' }),
};
const stockStub = () => ({
  add: jest.fn().mockResolvedValue([{ warehouseId: 'w1', delta: 3 }]),
  receive: jest.fn().mockResolvedValue([{ warehouseId: 'w1', delta: 3 }]),
  recordMovements: jest.fn().mockImplementation(async (m: any, p: any, prev: number, alloc: any[]) =>
    Promise.all(alloc.map((a) => m.save('StockMovement', m.create('StockMovement', { companyId: p.companyId, productId: p.id, quantity: a.delta }))))),
  attachWarehouseMap: jest.fn().mockImplementation(async (_m: any, _c: string, ps: any[]) => ps),
  begin: jest.fn().mockResolvedValue({}),
});
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

const COMPANY_ID = 'company-1';

describe('ProductService', () => {
  let service: ProductService;
  let productRepoMock: any;
  let categoryRepoMock: any;
  let supplierRepoMock: any;
  let stockMovementRepoMock: any;
  let warehouseRepoMock: any;
  let stockHelperMock: any;
  let appGatewayMock: any;
  let dataSourceMock: any;

  beforeEach(async () => {
    productRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    categoryRepoMock = { findOne: jest.fn() };
    supplierRepoMock = { findOne: jest.fn() };
    stockMovementRepoMock = { save: jest.fn() };
    warehouseRepoMock = { find: jest.fn() };
    stockHelperMock = {
      calculateStatus: jest.fn().mockReturnValue('In stock'),
    };
    appGatewayMock = {
      emitToCompany: jest.fn(),
    };
    dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockImplementation((entity, opts) => {
            if (entity === CategoryEntity) return Promise.resolve({ id: 'cat-1', slug: 'elektronik' });
            if (entity === SupplierEntity) return Promise.resolve({ id: 'sup-1' });
            return Promise.resolve(null);
          }),
          find: jest.fn().mockResolvedValue([{ name: 'Ana Depo' }]),
          exists: jest.fn().mockResolvedValue(false),
          create: jest.fn().mockImplementation((entity, obj) => ({ id: 'prod-100', ...obj })),
          save: jest.fn().mockImplementation((entity, obj) => Promise.resolve({ id: 'prod-100', ...obj })),
        })
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(ProductEntity), useValue: productRepoMock },
        { provide: getRepositoryToken(CategoryEntity), useValue: categoryRepoMock },
        { provide: getRepositoryToken(SupplierEntity), useValue: supplierRepoMock },
        { provide: getRepositoryToken(StockMovementEntity), useValue: stockMovementRepoMock },
        { provide: getRepositoryToken(WarehouseEntity), useValue: warehouseRepoMock },
        { provide: StockHelperService, useValue: stockHelperMock },
        { provide: WarehouseStockService, useValue: stockStub() },
        { provide: FinanceService, useValue: financeStub },
        { provide: UnitService, useValue: unitStub },
        { provide: AppGateway, useValue: appGatewayMock },
        { provide: TenantContext, useValue: { companyId: COMPANY_ID } },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProducts', () => {
    it('should return list of non-deleted products', async () => {
      const mockProducts = [{ id: '1', name: 'Product 1', isDeleted: false }];
      productRepoMock.find.mockResolvedValue(mockProducts);

      (service as any).dataSource.manager = {};
      const result = await service.getProducts();
      expect(result).toEqual(mockProducts);
      expect(productRepoMock.find).toHaveBeenCalledWith({ where: { companyId: COMPANY_ID, isDeleted: false } });
    });
  });

  describe('getProductById', () => {
    it('should return product if exists and not deleted', async () => {
      const mockProd = { id: 'prod-1', name: 'Keyboard', isDeleted: false };
      productRepoMock.findOne.mockResolvedValue(mockProd);

      (service as any).dataSource.manager = {};
      const result = await service.getProductById('prod-1');
      expect(result).toEqual(mockProd);
      expect(productRepoMock.findOne).toHaveBeenCalledWith({ where: { companyId: COMPANY_ID, id: 'prod-1', isDeleted: false } });
    });
  });

  describe('createProduct', () => {
    it('should create product successfully in transaction', async () => {
      const dto = { name: 'Klavye', sku: 'KLV-01', category: 'elektronik', price: 200, quantity: 10, minQuantity: 2 };

      const result = await service.createProduct(dto as any, 'admin');

      expect(result).toBeDefined();
      expect(result.name).toEqual('Klavye');
      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(appGatewayMock.emitToCompany).toHaveBeenCalledWith(COMPANY_ID, 'product_mutated', expect.any(Object));
    });
  });

  describe('bulkCreateProducts', () => {
    it('should throw BadRequestException if duplicate SKUs exist in payload', async () => {
      const products = [
        { name: 'P1', sku: 'DUPLICATE-SKU' },
        { name: 'P2', sku: 'DUPLICATE-SKU' },
      ];

      await expect(service.bulkCreateProducts(products as any, 'admin')).rejects.toThrow(BadRequestException);
    });
  });
});

describe('ProductService tenant isolation', () => {
  it('stamps companyId on created products and stock movements', async () => {
    const saved: any[] = [];
    const manager = {
      exists: jest.fn().mockResolvedValue(false),
      findOne: jest.fn().mockResolvedValue({ id: 'x' }),
      find: jest.fn().mockResolvedValue([{ name: 'Depo' }]),
      create: jest.fn().mockImplementation((_e, obj) => ({ ...obj })),
      save: jest.fn().mockImplementation((_e, obj) => { saved.push(obj); return Promise.resolve({ id: 'p', ...obj }); }),
    };
    const module = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(ProductEntity), useValue: {} },
        { provide: getRepositoryToken(CategoryEntity), useValue: {} },
        { provide: getRepositoryToken(SupplierEntity), useValue: {} },
        { provide: getRepositoryToken(StockMovementEntity), useValue: {} },
        { provide: getRepositoryToken(WarehouseEntity), useValue: {} },
        { provide: StockHelperService, useValue: { calculateStatus: () => 'In stock' } },
        { provide: WarehouseStockService, useValue: stockStub() },
        { provide: FinanceService, useValue: financeStub },
        { provide: UnitService, useValue: unitStub },
        { provide: AppGateway, useValue: { emitToCompany: jest.fn() } },
        { provide: TenantContext, useValue: { companyId: 'tenant-A' } },
        { provide: DataSource, useValue: { transaction: (cb: any) => cb(manager) } },
      ],
    }).compile();
    const svc = module.get(ProductService);

    // A client-supplied companyId must be overridden by the tenant context.
    await svc.createProduct({ name: 'N', sku: 'S', category: 'c', price: 1, quantity: 3, minQuantity: 1, companyId: 'tenant-B' } as any);

    expect(saved.length).toBe(2);
    expect(saved.every((o) => o.companyId === 'tenant-A')).toBe(true);
    expect(manager.exists).toHaveBeenCalledWith(ProductEntity, { where: { companyId: 'tenant-A', sku: 'S' } });
  });
});
