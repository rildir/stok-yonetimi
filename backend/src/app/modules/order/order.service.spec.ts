import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderService } from './order.service';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
import { OrderStatus } from '../../entities/enums';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepoMock: any;
  let productRepoMock: any;
  let stockHelperMock: any;
  let appGatewayMock: any;
  let dataSourceMock: any;

  beforeEach(async () => {
    orderRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    productRepoMock = {
      findOne: jest.fn(),
    };

    stockHelperMock = {
      calculateStatus: jest.fn().mockReturnValue('In stock'),
      deductStockFromWarehouses: jest.fn().mockReturnValue({ 'Ana Depo': 9 }),
      addStockToWarehouses: jest.fn().mockReturnValue({ 'Ana Depo': 10 }),
    };

    appGatewayMock = {
      server: { emit: jest.fn() },
    };

    dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockImplementation((entity) => {
            if (entity === OrderEntity) return Promise.resolve(null);
            return Promise.resolve({ id: 'p-1', name: 'Laptop', price: 1000, quantity: 10, minQuantity: 2, warehouses: { 'Ana Depo': 10 } });
          }),
          find: jest.fn().mockResolvedValue([{ name: 'Ana Depo' }]),
          create: jest.fn().mockImplementation((entity, obj) => ({ id: 'order-1', ...obj })),
          save: jest.fn().mockImplementation((entity, obj) => Promise.resolve({ id: 'order-1', ...obj })),
        })
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepoMock },
        { provide: getRepositoryToken(ProductEntity), useValue: productRepoMock },
        { provide: StockHelperService, useValue: stockHelperMock },
        { provide: AppGateway, useValue: appGatewayMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrders', () => {
    it('should return all orders ordered by date DESC', async () => {
      const mockOrders = [{ id: 'ord-1', orderNumber: 'ORD-0001' }];
      orderRepoMock.find.mockResolvedValue(mockOrders);

      const result = await service.getOrders();
      expect(result).toEqual(mockOrders);
      expect(orderRepoMock.find).toHaveBeenCalledWith({
        relations: { items: true },
        order: { date: 'DESC' },
      });
    });
  });

  describe('createOrder', () => {
    it('should throw BadRequestException if order status is CANCELLED', async () => {
      const dto = {
        customerName: 'Ahmet Yılmaz',
        status: OrderStatus.CANCELLED,
        items: [{ productId: 'p-1', productName: 'Laptop', quantity: 1 }],
      };

      await expect(service.createOrder(dto, 'admin')).rejects.toThrow(BadRequestException);
    });

    it('should create order successfully in transaction', async () => {
      const dto = {
        customerName: 'Ahmet Yılmaz',
        status: OrderStatus.COMPLETED,
        items: [{ productId: 'p-1', productName: 'Laptop', quantity: 2 }],
      };

      const result = await service.createOrder(dto, 'admin');

      expect(result).toBeDefined();
      expect(result.customerName).toEqual('Ahmet Yılmaz');
      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(appGatewayMock.server.emit).toHaveBeenCalledWith('order_mutated', expect.any(Object));
    });
  });
});
