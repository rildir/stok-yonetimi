import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from '../../entities/order.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockMovementEntity } from '../../entities/stock-movement.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { AppGateway } from '../../app.gateway';
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
  date?: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | string;
  totalAmount: number;
  items: OrderItem[];
  carrier?: string;
  trackingNumber?: string;
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

      let totalAmount = 0;
      const items: OrderItem[] = [];

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

        if (order.status === 'Completed' || order.status === 'Pending') {
          const oldQty = prod.quantity;
          
          const activeWarehouses = await manager.find(WarehouseEntity, { where: { isDeleted: false } });
          const activeNames = activeWarehouses.map(w => w.name);
          prod.warehouses = this.stockHelper.deductStockFromWarehouses(prod.warehouses, item.quantity, activeNames);

          prod.quantity -= item.quantity;
          prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
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

      const newOrder = manager.create(OrderEntity, {
        ...order,
        date: order.date || new Date().toISOString(),
        orderNumber,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        items,
      });
      return await manager.save(OrderEntity, newOrder);
    });

    this.appGateway.server.emit('order_mutated', { type: 'create', order: savedOrder });
    for (const p of productsToEmit) {
      this.appGateway.server.emit('product_mutated', { type: 'update', product: p });
    }

    return savedOrder;
  }

  async updateOrderStatus(id: string, status: 'Completed' | 'Pending' | 'Cancelled' | string, performedBy: string = 'System'): Promise<OrderEntity | null> {
    const productsToEmit: ProductEntity[] = [];
    const savedOrder = await this.dataSource.transaction(async (manager) => {
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
            prod.warehouses = this.stockHelper.addStockToWarehouses(prod.warehouses, item.quantity, activeNames);

            prod.quantity += item.quantity;
            prod.status = this.stockHelper.calculateStatus(prod.quantity, prod.minQuantity);
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
}
