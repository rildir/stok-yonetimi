import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { AiResponseCard } from './inventory.service';

@Injectable({
  providedIn: 'root'
})
export class AiInventoryService {
  
  queryAi(prompt: string): Observable<AiResponseCard> {
    const normalizedPrompt = prompt.toLowerCase().trim();
    let response: AiResponseCard;

    if (normalizedPrompt.includes('en az satan') || normalizedPrompt.includes('least selling') || normalizedPrompt.includes('satan 5')) {
      response = {
        title: 'En Az Satan 5 Ürün (Geçen Ay)',
        type: 'chart',
        description: 'Geçen aya ait sipariş analizlerine göre en düşük satış hacmine sahip 5 ürün aşağıda listelenmiştir. Bu ürünlerin pazarlama stratejileri veya stok seviyeleri gözden geçirilmelidir.',
        chartType: 'bar',
        chartData: {
          labels: ['USB-C Hub', 'Kablosuz Mouse', 'HD Web Kamera', 'Bluetooth Hoparlör', 'Mekanik Klavye'],
          datasets: [{
            label: 'Satış Adedi',
            data: [2, 3, 5, 8, 12]
          }]
        }
      };
    } else if (normalizedPrompt.includes('kritik') || normalizedPrompt.includes('stoktaki kritik') || normalizedPrompt.includes('low stock')) {
      response = {
        title: 'Kritik Stok Seviyesindeki Ürünler',
        type: 'table',
        description: 'Minimum belirlenen eşik değerinin altına düşen veya tamamen tükenen ürünlerin anlık durum tablosudur.',
        tableData: {
          headers: ['Ürün Adı', 'SKU', 'Mevcut Stok', 'Min. Stok Seviyesi', 'Durum'],
          rows: [
            ['HD Web Kamera', 'CAM-505', 0, 5, 'Stokta Yok'],
            ['USB-C Hub', 'HUB-303', 2, 5, 'Düşük Stok'],
            ['Kablosuz Mouse', 'MS-202', 3, 10, 'Düşük Stok']
          ]
        }
      };
    } else if (normalizedPrompt.includes('satış') || normalizedPrompt.includes('gelir') || normalizedPrompt.includes('genel')) {
      response = {
        title: 'Genel Satış ve Performans Metrikleri',
        type: 'metric',
        description: 'Son 30 güne ait genel finansal performans ve sipariş hacmi özet verileri aşağıda yer almaktadır.',
        metrics: [
          { label: 'Toplam Ciro', value: '₺84,250', change: '+14.6%', isPositive: true },
          { label: 'Toplam Sipariş', value: '184 Adet', change: '+8.2%', isPositive: true },
          { label: 'Ortalama Sepet Tutarı', value: '₺457.80', change: '-2.1%', isPositive: false }
        ]
      };
    } else {
      // Fallback response
      response = {
        title: 'Genel Durum Analizi',
        type: 'list',
        description: `"${prompt}" sorgunuz için detaylı veritabanı taraması yapıldı. Genel stok durumunuz stabil görünmektedir. Öneri olarak:`,
        metrics: [
          { label: 'Öneri 1', value: 'Kritik stok uyarısı veren 3 ürünü kontrol edin.' },
          { label: 'Öneri 2', value: 'Geçen ay en az satan ürünler için kampanya düzenleyin.' },
          { label: 'Öneri 3', value: 'Bekleyen siparişlerin statülerini güncelleyin.' }
        ]
      };
    }

    return of(response).pipe(delay(1500));
  }
}
