import { Injectable, BadRequestException } from '@nestjs/common';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  minQuantity: number;
  status: 'In stock' | 'Low stock' | 'Out of stock';
  isDeleted?: boolean; // Soft delete flag
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
  date: string; // ISO String
  status: 'Completed' | 'Pending' | 'Cancelled';
  totalAmount: number;
  items: OrderItem[];
}

@Injectable()
export class DbService {
  private products: Product[] = [
    { id: 'p1', name: 'Wireless Mouse M320', sku: 'MS-320', category: 'Accessories', price: 29.99, quantity: 45, minQuantity: 10, status: 'In stock' },
    { id: 'p2', name: 'Mechanical Keyboard K85', sku: 'KB-85', category: 'Accessories', price: 89.99, quantity: 8, minQuantity: 15, status: 'Low stock' },
    { id: 'p3', name: 'UltraWide Monitor 34"', sku: 'MN-34U', category: 'Monitors', price: 449.99, quantity: 0, minQuantity: 5, status: 'Out of stock' },
    { id: 'p4', name: 'USB-C Hub 8-in-1', sku: 'HB-81', category: 'Accessories', price: 49.99, quantity: 60, minQuantity: 10, status: 'In stock' },
    { id: 'p5', name: 'Noise Cancelling Headphones', sku: 'HP-NC4', category: 'Audio', price: 199.99, quantity: 12, minQuantity: 10, status: 'In stock' },
    { id: 'p6', name: 'Ergonomic Office Chair', sku: 'CH-ERGO', category: 'Furniture', price: 289.99, quantity: 3, minQuantity: 5, status: 'Low stock' },
    { id: 'p7', name: 'Webcam HD 1080p', sku: 'WC-1080', category: 'Accessories', price: 69.99, quantity: 25, minQuantity: 8, status: 'In stock' },
    { id: 'p8', name: 'Bluetooth Speaker Portable', sku: 'SP-BT5', category: 'Audio', price: 39.99, quantity: 1, minQuantity: 5, status: 'Low stock' },
    { id: 'p9', name: 'Smart Watch Series 5', sku: 'SW-S5', category: 'Wearables', price: 249.99, quantity: 0, minQuantity: 8, status: 'Out of stock' },
    { id: 'p10', name: 'Laptop Stand Aluminum', sku: 'LS-ALUM', category: 'Accessories', price: 34.99, quantity: 80, minQuantity: 10, status: 'In stock' },
  ];

  private orders: Order[] = [];

  constructor() {
    this.generateMockOrders();
  }

  private generateMockOrders() {
    const today = new Date();
    
    // Generate orders spread over last 7 days so AI chart is meaningful
    const mockOrderTemplates = [
      { customer: 'Ahmet Yılmaz', daysAgo: 0, status: 'Completed', items: [{ pId: 'p1', qty: 2 }, { pId: 'p4', qty: 1 }] },
      { customer: 'Mehmet Kaya', daysAgo: 1, status: 'Completed', items: [{ pId: 'p5', qty: 1 }, { pId: 'p10', qty: 1 }] },
      { customer: 'Ayşe Demir', daysAgo: 1, status: 'Completed', items: [{ pId: 'p2', qty: 1 }] },
      { customer: 'Fatma Şahin', daysAgo: 2, status: 'Pending', items: [{ pId: 'p7', qty: 2 }] },
      { customer: 'Ali Çelik', daysAgo: 3, status: 'Completed', items: [{ pId: 'p4', qty: 3 }, { pId: 'p10', qty: 2 }] },
      { customer: 'Zeynep Yıldız', daysAgo: 4, status: 'Cancelled', items: [{ pId: 'p3', qty: 1 }] },
      { customer: 'Can Öztürk', daysAgo: 4, status: 'Completed', items: [{ pId: 'p1', qty: 5 }, { pId: 'p7', qty: 1 }] },
      { customer: 'Elif Aslan', daysAgo: 5, status: 'Completed', items: [{ pId: 'p5', qty: 2 }] },
      { customer: 'Mustafa Aydın', daysAgo: 6, status: 'Completed', items: [{ pId: 'p10', qty: 5 }, { pId: 'p4', qty: 1 }] },
      { customer: 'Büşra Koç', daysAgo: 6, status: 'Completed', items: [{ pId: 'p6', qty: 1 }] },
      { customer: 'Ömer Bulut', daysAgo: 7, status: 'Completed', items: [{ pId: 'p8', qty: 1 }] },
    ];

    mockOrderTemplates.forEach((template, index) => {
      const orderDate = new Date();
      orderDate.setDate(today.getDate() - template.daysAgo);

      const items: OrderItem[] = template.items.map(item => {
        const prod = this.products.find(p => p.id === item.pId);
        return {
          productId: item.pId,
          productName: prod ? prod.name : 'Unknown Product',
          quantity: item.qty,
          price: prod ? prod.price : 0,
        };
      });

      const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      this.orders.push({
        id: `o${index + 1}`,
        orderNumber: `ORD-${202600 + index + 1}`,
        customerName: template.customer,
        date: orderDate.toISOString(),
        status: template.status as any,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        items,
      });
    });
  }

  // Product CRUD
  getProducts(): Product[] {
    // Soft delete: return only non-deleted products
    return this.products.filter(p => !p.isDeleted);
  }

  getProductById(id: string): Product | undefined {
    const prod = this.products.find(p => p.id === id);
    if (prod && prod.isDeleted) return undefined;
    return prod;
  }

  createProduct(prod: Omit<Product, 'id' | 'status' | 'isDeleted'>): Product {
    const id = `p${this.products.length + 1}`;
    const status = this.calculateStatus(prod.quantity, prod.minQuantity);
    const newProduct: Product = { ...prod, id, status, isDeleted: false };
    this.products.push(newProduct);
    return newProduct;
  }

  updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'status' | 'isDeleted'>>): Product | undefined {
    const prodIndex = this.products.findIndex(p => p.id === id);
    if (prodIndex === -1 || this.products[prodIndex].isDeleted) return undefined;

    const current = this.products[prodIndex];
    const updatedQty = updates.quantity !== undefined ? updates.quantity : current.quantity;
    const updatedMin = updates.minQuantity !== undefined ? updates.minQuantity : current.minQuantity;
    const status = this.calculateStatus(updatedQty, updatedMin);

    const updatedProduct = {
      ...current,
      ...updates,
      status,
    };
    this.products[prodIndex] = updatedProduct;
    return updatedProduct;
  }

  deleteProduct(id: string): boolean {
    const prod = this.products.find(p => p.id === id);
    if (prod && !prod.isDeleted) {
      prod.isDeleted = true; // Soft delete
      return true;
    }
    return false;
  }

  private calculateStatus(quantity: number, minQuantity: number): 'In stock' | 'Low stock' | 'Out of stock' {
    if (quantity <= 0) return 'Out of stock';
    if (quantity <= minQuantity) return 'Low stock';
    return 'In stock';
  }

  // Order CRUD
  getOrders(): Order[] {
    return this.orders;
  }

  getOrderById(id: string): Order | undefined {
    return this.orders.find(o => o.id === id);
  }

  createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'totalAmount'>): Order {
    const id = `o${this.orders.length + 1}`;
    const orderNumber = `ORD-${202600 + this.orders.length + 1}`;
    
    // Strict stock check BEFORE creating the order
    for (const item of order.items) {
      const prod = this.products.find(p => p.id === item.productId && !p.isDeleted);
      if (!prod) {
        throw new BadRequestException(`Ürün bulunamadı: ${item.productName}`);
      }
      if (prod.quantity < item.quantity) {
        throw new BadRequestException(`Yetersiz stok: ${prod.name} (Mevcut: ${prod.quantity})`);
      }
    }

    let totalAmount = 0;
    const items: OrderItem[] = order.items.map(item => {
      const prod = this.products.find(p => p.id === item.productId)!;
      // Reserve/Deduct stock immediately on Pending or Completed
      if (order.status === 'Completed' || order.status === 'Pending') {
        this.updateProduct(prod.id, { quantity: prod.quantity - item.quantity });
      }
      totalAmount += item.price * item.quantity;
      return item;
    });

    const newOrder: Order = {
      ...order,
      id,
      orderNumber,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      items,
    };
    this.orders.unshift(newOrder);
    return newOrder;
  }

  updateOrderStatus(id: string, status: 'Completed' | 'Pending' | 'Cancelled'): Order | undefined {
    const order = this.orders.find(o => o.id === id);
    if (!order) return undefined;
    
    const oldStatus = order.status;
    if (oldStatus === status) return order; // No change

    // If order was cancelled (stock returned), and now we want to reinstate it, we must check stock again
    if (oldStatus === 'Cancelled' && (status === 'Pending' || status === 'Completed')) {
      for (const item of order.items) {
        const prod = this.products.find(p => p.id === item.productId && !p.isDeleted);
        if (!prod) {
          throw new BadRequestException(`Ürün artık mevcut değil: ${item.productName}`);
        }
        if (prod.quantity < item.quantity) {
          throw new BadRequestException(`Yetersiz stok: ${prod.name} (Mevcut: ${prod.quantity})`);
        }
      }
      // Deduct stock
      order.items.forEach(item => {
        const prod = this.products.find(p => p.id === item.productId)!;
        this.updateProduct(prod.id, { quantity: prod.quantity - item.quantity });
      });
    }

    // If order is cancelled, return the reserved/deducted stock
    if (status === 'Cancelled' && (oldStatus === 'Pending' || oldStatus === 'Completed')) {
      order.items.forEach(item => {
        // Here we can restore stock even if product is soft deleted
        const prod = this.products.find(p => p.id === item.productId);
        if (prod) {
          this.updateProduct(prod.id, { quantity: prod.quantity + item.quantity });
        }
      });
    }

    order.status = status;
    return order;
  }
}
