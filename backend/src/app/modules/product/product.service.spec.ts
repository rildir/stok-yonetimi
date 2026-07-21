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
import { AppGateway } from '../../app.gateway';

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
      server: { emit: jest.fn() },
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
        { provide: AppGateway, useValue: appGatewayMock },
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

      const result = await service.getProducts();
      expect(result).toEqual(mockProducts);
      expect(productRepoMock.find).toHaveBeenCalledWith({ where: { isDeleted: false } });
    });
  });

  describe('getProductById', () => {
    it('should return product if exists and not deleted', async () => {
      const mockProd = { id: 'prod-1', name: 'Keyboard', isDeleted: false };
      productRepoMock.findOne.mockResolvedValue(mockProd);

      const result = await service.getProductById('prod-1');
      expect(result).toEqual(mockProd);
      expect(productRepoMock.findOne).toHaveBeenCalledWith({ where: { id: 'prod-1', isDeleted: false } });
    });
  });

  describe('createProduct', () => {
    it('should create product successfully in transaction', async () => {
      const dto = { name: 'Klavye', sku: 'KLV-01', category: 'elektronik', price: 200, quantity: 10, minQuantity: 2 };

      const result = await service.createProduct(dto as any, 'admin');

      expect(result).toBeDefined();
      expect(result.name).toEqual('Klavye');
      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(appGatewayMock.server.emit).toHaveBeenCalledWith('product_mutated', expect.any(Object));
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
