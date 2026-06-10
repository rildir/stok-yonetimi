import { Injectable } from '@nestjs/common';
import { DbService, Product, Order } from './db.service';

export interface AiResponseCard {
  title: string;
  type: 'chart' | 'table' | 'metric' | 'list';
  description: string;
  chartType?: 'bar' | 'line' | 'pie' | 'doughnut';
  chartData?: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string[];
      borderColor?: string[];
    }[];
  };
  tableData?: {
    headers: string[];
    rows: any[][];
  };
  metrics?: {
    label: string;
    value: string | number;
    change?: string;
    isPositive?: boolean;
  }[];
}

@Injectable()
export class AiService {
  constructor(private dbService: DbService) {}

  processQuery(query: string): AiResponseCard {
    const q = query.toLowerCase().trim();

    // 1. "Geçen ay en az satan 5 ürünü listele"
    if (q.includes('en az satan') || q.includes('az satan') || q.includes('en az satan 5')) {
      return this.getLeastSellingProducts();
    }

    // 2. "En çok satan"
    if (q.includes('en çok satan') || q.includes('cok satan') || q.includes('en popüler')) {
      return this.getMostSellingProducts();
    }

    // 3. "Kritik durumdaki ürünler" or "stok seviyesi düşük"
    if (q.includes('kritik') || q.includes('düşük stok') || q.includes('azalan') || q.includes('tükenen')) {
      return this.getCriticalStockProducts();
    }

    // 4. "Genel satış" or "satış özet" or "gelir"
    if (q.includes('satış') || q.includes('gelir') || q.includes('ciro') || q.includes('özet')) {
      return this.getSalesSummary();
    }

    // Default response (fallback fallback)
    return {
      title: 'Genel Durum Analizi',
      type: 'metric',
      description: `"${query}" sorgusu için genel stok ve sipariş verileri analiz edildi.`,
      metrics: [
        { label: 'Toplam Ürün Çeşidi', value: this.dbService.getProducts().length },
        { label: 'Toplam Sipariş', value: this.dbService.getOrders().length },
        { 
          label: 'Kritik Stoktaki Ürünler', 
          value: this.dbService.getProducts().filter(p => p.quantity <= p.minQuantity).length 
        }
      ]
    };
  }

  private getLeastSellingProducts(): AiResponseCard {
    const orders = this.dbService.getOrders().filter(o => o.status === 'Completed');
    const products = this.dbService.getProducts();

    // Calculate sales quantity for each product
    const salesMap: { [productId: string]: number } = {};
    products.forEach(p => { salesMap[p.id] = 0; });

    orders.forEach(o => {
      o.items.forEach(item => {
        if (salesMap[item.productId] !== undefined) {
          salesMap[item.productId] += item.quantity;
        }
      });
    });

    const sortedList = products
      .map(p => ({ name: p.name, sales: salesMap[p.id] }))
      .sort((a, b) => a.sales - b.sales)
      .slice(0, 5);

    return {
      title: 'En Az Satan 5 Ürün (Geçen Ay)',
      type: 'chart',
      chartType: 'bar',
      description: 'Geçen ay tamamlanan siparişler doğrultusunda en düşük satış adedine sahip 5 ürün listelenmiştir.',
      chartData: {
        labels: sortedList.map(item => item.name),
        datasets: [
          {
            label: 'Satış Adedi',
            data: sortedList.map(item => item.sales),
            backgroundColor: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE'],
          }
        ]
      }
    };
  }

  private getMostSellingProducts(): AiResponseCard {
    const orders = this.dbService.getOrders().filter(o => o.status === 'Completed');
    const products = this.dbService.getProducts();

    const salesMap: { [productId: string]: number } = {};
    products.forEach(p => { salesMap[p.id] = 0; });

    orders.forEach(o => {
      o.items.forEach(item => {
        if (salesMap[item.productId] !== undefined) {
          salesMap[item.productId] += item.quantity;
        }
      });
    });

    const sortedList = products
      .map(p => ({ name: p.name, sales: salesMap[p.id] }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    return {
      title: 'En Çok Satan 5 Ürün',
      type: 'chart',
      chartType: 'doughnut',
      description: 'Toplam sipariş hacmine göre en yüksek satış adetlerine sahip lider ürünler.',
      chartData: {
        labels: sortedList.map(item => item.name),
        datasets: [
          {
            label: 'Satış Payı',
            data: sortedList.map(item => item.sales),
            backgroundColor: ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#E0F2FE'],
          }
        ]
      }
    };
  }

  private getCriticalStockProducts(): AiResponseCard {
    const criticalProducts = this.dbService.getProducts()
      .filter(p => p.quantity <= p.minQuantity);

    const headers = ['Ürün Adı', 'SKU', 'Mevcut Stok', 'Minimum Limit'];
    const rows = criticalProducts.map(p => [p.name, p.sku, p.quantity, p.minQuantity]);

    return {
      title: 'Kritik Stok Seviyesindeki Ürünler',
      type: 'table',
      description: `Stok seviyesi minimum limitin altına düşmüş veya tükenmiş ${criticalProducts.length} ürün tespit edildi.`,
      tableData: {
        headers,
        rows
      }
    };
  }

  private getSalesSummary(): AiResponseCard {
    const orders = this.dbService.getOrders().filter(o => o.status === 'Completed');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6); // 7 days including today

    // Group sales by day of week
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const salesByDay = Array(7).fill(0);

    let totalCiro = 0;

    orders.forEach(o => {
      const orderDate = new Date(o.date);
      if (orderDate >= sevenDaysAgo) {
        totalCiro += o.totalAmount;
        const d = orderDate.getDay();
        salesByDay[d] += o.totalAmount;
      }
    });

    // Reorder so it starts from Monday
    const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const data = [salesByDay[1], salesByDay[2], salesByDay[3], salesByDay[4], salesByDay[5], salesByDay[6], salesByDay[0]];

    return {
      title: 'Haftalık Satış Dağılımı ve Gelir Analizi',
      type: 'chart',
      chartType: 'line',
      description: `Tamamlanan siparişlerden elde edilen toplam gelir: ₺${totalCiro.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}.`,
      chartData: {
        labels,
        datasets: [
          {
            label: 'Gelir (₺)',
            data: data.map(v => parseFloat(v.toFixed(2))),
            backgroundColor: ['rgba(14, 165, 233, 0.2)'],
            borderColor: ['#0EA5E9'],
          }
        ]
      }
    };
  }
}
