import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
import { OrderStatus, StockMovementType } from '../../entities/enums';

export interface OrderItemInput {
  productId: string;
  productName: string;
  quantity: number;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async getOrders(): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      relations: { items: true },
      order: { date: 'DESC' },
    });
  }

  async getOrderById(id: string): Promise<OrderEntity | null> {
    return this.orderRepo.findOne({
      where: { id },
      relations: { items: true },
    });
  }

  async createOrder(
    data: {
      customerName: string;
      status: OrderStatus | string;
      items: OrderItemInput[];
      carrier?: string;
      trackingNumber?: string;
      date?: string;
    },
    performedBy: string = 'System'
  ): Promise<OrderEntity> {
    if (data.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Yeni bir sipariş "İptal Edildi" (Cancelled) durumuyla oluşturulamaz.');
    }

    const productsToEmit: ProductEntity[] = [];

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      let orderNumber = '';
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await manager.findOne(OrderEntity, { where: { orderNumber } });
        if (!existing) break;
        attempts++;
      }

      if (attempts === maxAttempts) {
        throw new BadRequestException('Benzersiz sipariş numarası üretilemedi, lütfen tekrar deneyin.');
      }

      // Merge duplicates in payload
      const mergedMap = new Map<string, OrderItemInput>();
      for (const item of data.items) {
        if (mergedMap.has(item.productId)) {
          mergedMap.get(item.productId)!.quantity += item.quantity;
        } else {
          mergedMap.set(item.productId, { ...item });
        }
      }
      const orderItems = Array.from(mergedMap.values());

      let totalAmount = 0;
      const orderItemEntities: OrderItemEntity[] = [];

      for (const item of orderItems) {
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

        if (data.status === OrderStatus.COMPLETED || data.status === OrderStatus.PENDING) {
          const oldQty = prod.quantity;

          const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
          const activeNames = activeWarehouses.map((w) => w.name);
          prod.warehouses = this.stockHelper.deductStockFromWarehouses(prod.warehouses, item.quantity, activeNames);

          prod.quantity -= item.quantity;
          prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
          const savedProd = await manager.save(ProductEntity, prod);
          productsToEmit.push(savedProd);

          await manager.save(
            StockMovementEntity,
            manager.create(StockMovementEntity, {
              productId: savedProd.id,
              productName: savedProd.name,
              type: StockMovementType.ORDER,
              quantity: -item.quantity,
              previousQuantity: oldQty,
              newQuantity: prod.quantity,
              referenceId: orderNumber,
              referenceType: 'order',
              note: `Sipariş oluşturuldu: ${orderNumber}`,
              performedBy,
            })
          );
        }

        const itemPrice = prod.price;
        totalAmount += itemPrice * item.quantity;

        const orderItem = manager.create(OrderItemEntity, {
          productId: prod.id,
          productName: prod.name,
          quantity: item.quantity,
          price: itemPrice,
        });
        orderItemEntities.push(orderItem);
      }

      const newOrder = manager.create(OrderEntity, {
        customerName: data.customerName,
        status: data.status || OrderStatus.PENDING,
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
        date: data.date ? new Date(data.date) : new Date(),
        orderNumber,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        items: orderItemEntities,
      });

      return await manager.save(OrderEntity, newOrder);
    });

    this.appGateway.server.emit('order_mutated', { type: 'create', order: savedOrder });
    for (const p of productsToEmit) {
      this.appGateway.server.emit('product_mutated', { type: 'update', product: p });
    }

    return savedOrder;
  }

  async updateOrderStatus(id: string, status: OrderStatus | string, performedBy: string = 'System'): Promise<OrderEntity | null> {
    const productsToEmit: ProductEntity[] = [];

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(OrderEntity, {
        where: { id },
        relations: { items: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) return null;

      const oldStatus = order.status;
      if (oldStatus === status) return order;

      if (oldStatus === OrderStatus.CANCELLED) {
        throw new BadRequestException('İptal edilmiş bir siparişin durumu değiştirilemez.');
      }
      if (oldStatus === OrderStatus.COMPLETED && status === OrderStatus.PENDING) {
        throw new BadRequestException('Tamamlanmış bir sipariş tekrar "Beklemede" (Pending) durumuna alınamaz.');
      }

      if (status === OrderStatus.CANCELLED && (oldStatus === OrderStatus.PENDING || oldStatus === OrderStatus.COMPLETED)) {
        for (const item of order.items) {
          if (!item.productId) continue;
          const prod = await manager.findOne(ProductEntity, {
            where: { id: item.productId },
            lock: { mode: 'pessimistic_write' },
          });
          if (prod) {
            const oldQty = prod.quantity;

            const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
            const activeNames = activeWarehouses.map((w) => w.name);
            prod.warehouses = this.stockHelper.addStockToWarehouses(prod.warehouses, item.quantity, activeNames);

            prod.quantity += item.quantity;
            prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
            const savedProd = await manager.save(ProductEntity, prod);
            productsToEmit.push(savedProd);

            await manager.save(
              StockMovementEntity,
              manager.create(StockMovementEntity, {
                productId: savedProd.id,
                productName: savedProd.name,
                type: StockMovementType.RETURN,
                quantity: item.quantity,
                previousQuantity: oldQty,
                newQuantity: prod.quantity,
                referenceId: order.orderNumber,
                referenceType: 'order',
                note: `Sipariş iptal edildi: ${order.orderNumber}`,
                performedBy,
              })
            );
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
      if (order.status !== OrderStatus.CANCELLED) {
        throw new BadRequestException('Sadece iptal edilmiş siparişler silinebilir.');
      }
      await this.orderRepo.softRemove(order);
      this.appGateway.server.emit('order_mutated', { type: 'delete', orderId: id });
      return true;
    }
    return false;
  }
}
