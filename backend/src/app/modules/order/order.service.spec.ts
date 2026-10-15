import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderService } from './order.service';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { WarehouseStockService } from '../../shared/services/warehouse-stock.service';
import { FinanceService } from '../../shared/services/finance.service';
import { UnitService } from '../../shared/services/unit.service';
import { priceDocument } from '../../shared/finance/tax';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

const COMPANY_ID = 'company-1';
import { OrderStatus } from '../../entities/enums';
import { DespatchEntity } from '../../entities/despatch.entity';
import { InvoiceEntity } from '../../entities/invoice.entity';
import { ConflictException } from '@nestjs/common';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepoMock: any;
  let productRepoMock: any;
  let stockHelperMock: any;
  let financeMock: any;
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
      deduct: jest.fn().mockImplementation(async (_m: any, p: any, qty: number) => {
        p.quantity -= qty;
        return [{ warehouseId: 'w1', delta: -qty }];
      }),
      add: jest.fn().mockResolvedValue([{ warehouseId: 'w1', delta: 1 }]),
      issue: jest.fn().mockImplementation(async (_m: any, p: any, qty: number) => {
        p.quantity -= qty;
        return [{ warehouseId: 'w1', delta: -qty }];
      }),
      toTracking: jest.fn().mockReturnValue([]),
      apply: jest.fn(),
      recordMovements: jest.fn().mockResolvedValue([]),
      begin: jest.fn().mockResolvedValue({}),
    };
    financeMock = {
      getCompany: jest.fn().mockResolvedValue({ id: COMPANY_ID, baseCurrency: 'TRY', pricesIncludeTax: true }),
      param: jest.fn().mockResolvedValue(10),
      priceDocumentFor: jest.fn().mockImplementation(async (input: any) => {
        const doc = priceDocument({
          lines: input.lines.map((i: any) => ({ quantity: i.quantity, unitPrice: i.unitPrice ?? i.product.price, taxRate: 20 })),
          pricesIncludeTax: true,
        });
        return {
          doc,
          lineMeta: doc.lines.map(() => ({ enteredUnitPrice: 0, taxRateId: 'kdv20', taxCode: '0015', exemptionCode: null, withholdingCode: null, otvCode: null, reverseCharge: false, deductibleVat: 0, label: null })),
          currency: input.currency,
          exchangeRate: 1,
          exchangeRateSource: 'BASE',
          exchangeRateDate: null,
          taxPointDate: input.taxPointDate,
          subtotalTry: doc.subtotal,
          taxTotalTry: doc.taxTotal,
          grandTotalTry: doc.grandTotal,
          invoiceTypeHint: 'SATIS',
          withholdingApplied: false,
          isImport: false,
          pricesIncludeTax: true,
          warnings: [],
        };
      }),
    };

    appGatewayMock = {
      emitToCompany: jest.fn(),
    };

    dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockImplementation((entity) => {
            if (entity === OrderEntity) return Promise.resolve(null);
            return Promise.resolve({ id: 'p-1', name: 'Laptop', price: 1000, quantity: 10, minQuantity: 2, warehouses: { 'Ana Depo': 10 } });
          }),
          find: jest.fn().mockResolvedValue([{ name: 'Ana Depo' }]),
          exists: jest.fn().mockResolvedValue(false),
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
        { provide: WarehouseStockService, useValue: stockHelperMock },
        { provide: FinanceService, useValue: financeMock },
        {
          provide: UnitService,
          useValue: {
            resolveLineUnit: jest.fn().mockResolvedValue({ unitId: null, unitCode: 'pcs', factor: 1 }),
            toBase: jest.fn().mockImplementation((_p: any, q: number, lu: any) => q * lu.factor),
          },
        },
        { provide: AppGateway, useValue: appGatewayMock },
        { provide: TenantContext, useValue: { companyId: COMPANY_ID } },
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
        where: { companyId: COMPANY_ID },
        relations: { items: true, charges: true },
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
      // 2 x 1000 gross incl. 20% tax
      expect(result.grandTotal).toBe(2000);
      expect(result.totalAmount).toBe(2000);
      expect(result.taxTotal).toBe(333.33);
      expect(result.subtotal).toBe(1666.67);
      expect(result.currency).toBe('TRY');
      // completed order: shipped at the order date, tax data frozen, TRY equivalents stored
      expect(result.taxFrozenAt).toBeInstanceOf(Date);
      expect(result.payableTotal).toBe(2000);
      expect(result.taxPointDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.items[0].taxRateId).toBe('kdv20');
      expect(stockHelperMock.issue).toHaveBeenCalled();
      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(appGatewayMock.emitToCompany).toHaveBeenCalledWith(COMPANY_ID, 'order_mutated', expect.any(Object));
    });
  });

  describe('WP4 document regime', () => {
    it("despatch mode: the order only reserves stock and cannot be created completed", async () => {
      financeMock.getCompany.mockResolvedValue({ id: COMPANY_ID, baseCurrency: 'TRY', pricesIncludeTax: true, stockDeductOn: 'despatch', timezone: 'Europe/Istanbul' });
      const manager: any = {
        findOne: jest.fn().mockImplementation((entity: any) => (entity === OrderEntity ? null : { id: 'p-1', name: 'Laptop', price: 1000, quantity: 10, availableQuantity: 10, minQuantity: 2 })),
        find: jest.fn().mockResolvedValue([]),
        query: jest.fn().mockResolvedValue([{ productId: 'p-1', qty: '8' }]),
        create: jest.fn().mockImplementation((_e: any, o: any) => ({ id: 'order-1', ...o })),
        save: jest.fn().mockImplementation((_e: any, o: any) => Promise.resolve({ id: 'order-1', ...o })),
      };
      dataSourceMock.transaction.mockImplementation((cb: any) => cb(manager));
      await expect(service.createOrder({ customerName: 'X', status: OrderStatus.COMPLETED, items: [{ productId: 'p-1', quantity: 1 }] }, 'admin')).rejects.toMatchObject({ response: { code: 'ORDER_DESPATCH_MODE_COMPLETE' } });
      // 10 available, 8 reserved by other pending orders: 3 more cannot be promised
      await expect(service.createOrder({ customerName: 'X', status: OrderStatus.PENDING, items: [{ productId: 'p-1', quantity: 3 }] }, 'admin')).rejects.toMatchObject({ response: { code: 'ORDER_INSUFFICIENT_STOCK' } });
      const ok = await service.createOrder({ customerName: 'X', status: OrderStatus.PENDING, items: [{ productId: 'p-1', quantity: 2 }] }, 'admin');
      expect(ok.stockMode).toBe('despatch');
      expect(stockHelperMock.issue).not.toHaveBeenCalled();
      expect(stockHelperMock.recordMovements).not.toHaveBeenCalled();
    });

    it('an order with an approved despatch or an issued invoice cannot be cancelled', async () => {
      const order = { id: 'o-1', orderNumber: 'ORD-1', status: OrderStatus.PENDING, stockMode: 'despatch', items: [], charges: [] };
      for (const [despatches, invoices] of [
        [[{ id: 'd1', status: 'APPROVED', orderId: 'o-1' }], []],
        [[], [{ id: 'i1', status: 'ISSUED', orderIds: ['o-1'] }]],
      ] as any[]) {
        const manager: any = {
          findOne: jest.fn().mockResolvedValue({ ...order }),
          find: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity === DespatchEntity ? despatches : entity === InvoiceEntity ? invoices : [])),
          remove: jest.fn(),
          save: jest.fn(),
        };
        dataSourceMock.transaction.mockImplementation((cb: any) => cb(manager));
        await expect(service.updateOrderStatus('o-1', OrderStatus.CANCELLED)).rejects.toThrow(ConflictException);
        await expect(service.updateOrderStatus('o-1', OrderStatus.CANCELLED)).rejects.toMatchObject({ response: { code: 'ORDER_HAS_ISSUED_DOCUMENTS' } });
        expect(manager.save).not.toHaveBeenCalled();
      }
    });
  });
});
