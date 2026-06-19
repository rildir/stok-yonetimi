import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppStateService } from './app-state.service';
import { UiStateService } from './ui-state.service';
import { NotificationService } from './notification.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private appState = inject(AppStateService);
  private ui = inject(UiStateService);
  private notifications = inject(NotificationService);
  private socket!: Socket;

  init() {
    this.socket = io(environment.wsUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] Real-time connection established');
    });

    this.socket.on('disconnect', () => {
      console.log('[SocketService] Real-time connection closed');
    });

    this.socket.on('product_mutated', (data: { type: string; product: any; productId?: string }) => {
      console.log('[SocketService] product_mutated event received', data);
      
      // Update local products signal incrementally without full HTTP refetch
      if (data.type === 'create') {
        this.appState.products.update(prods => {
          if (prods.some(p => p.id === data.product.id)) return prods;
          return [data.product, ...prods];
        });
        this.notifications.addNotification(`Yeni ürün eklendi: ${data.product.name}`, 'success');
        this.ui.showToast(`✨ Yeni ürün eklendi: ${data.product.name}`, 'success');
      } else if (data.type === 'update') {
        this.appState.products.update(prods => prods.map(p => p.id === data.product.id ? data.product : p));
        
        if (data.product.status === 'Out of stock') {
          this.notifications.addNotification(`Kritik Stok Uyarısı: ${data.product.name} tükendi!`, 'error');
          this.ui.showToast(`🔴 Ürün Tükendi: ${data.product.name}`, 'error');
        } else if (data.product.status === 'Low stock') {
          this.notifications.addNotification(`Kritik Stok Uyarısı: ${data.product.name} stok seviyesi kritik düzeyde (${data.product.quantity} Adet)`, 'warning');
          this.ui.showToast(`🟡 Kritik Stok: ${data.product.name} (${data.product.quantity} Adet)`, 'error');
        } else {
          this.notifications.addNotification(`Ürün güncellendi: ${data.product.name} (Stok: ${data.product.quantity})`, 'info');
        }
      } else if (data.type === 'delete') {
        const idToDelete = data.productId || data.product?.id;
        this.appState.products.update(prods => prods.filter(p => p.id !== idToDelete));
        this.notifications.addNotification(`Bir ürün sistemden kaldırıldı.`, 'info');
        this.ui.showToast(`🗑️ Bir ürün sistemden kaldırıldı.`, 'info');
      }
    });

    this.socket.on('order_mutated', (data: { type: string; order: any }) => {
      console.log('[SocketService] order_mutated event received', data);

      // Update local orders signal incrementally without full HTTP refetch
      if (data.type === 'create') {
        this.appState.orders.update(ords => {
          if (ords.some(o => o.id === data.order.id)) return ords;
          return [data.order, ...ords];
        });
        this.notifications.addNotification(`Yeni sipariş alındı: ${data.order.orderNumber} (₺${data.order.totalAmount})`, 'success');
        this.ui.showToast(`🛒 Yeni sipariş: ${data.order.orderNumber} (₺${data.order.totalAmount})`, 'success');
      } else if (data.type === 'update') {
        this.appState.orders.update(ords => ords.map(o => o.id === data.order.id ? data.order : o));
        
        const trStatus = data.order.status === 'Completed' 
          ? 'Tamamlandı' 
          : data.order.status === 'Cancelled' 
            ? 'İptal Edildi' 
            : 'Beklemede';
            
        this.notifications.addNotification(`Sipariş durumu güncellendi: ${data.order.orderNumber} (${trStatus})`, 'info');
        this.ui.showToast(`📋 Sipariş durumu güncellendi: ${data.order.orderNumber}`, 'info');
      }
    });

    this.socket.on('purchase_order_mutated', (data: { type: string; purchaseOrder: any }) => {
      console.log('[SocketService] purchase_order_mutated event received', data);
      if (data.type === 'create') {
        this.notifications.addNotification(`Yeni satın alma siparişi oluşturuldu: ${data.purchaseOrder.poNumber} (${data.purchaseOrder.supplierName})`, 'success');
        this.ui.showToast(`✨ Yeni Satın Alma Siparişi: ${data.purchaseOrder.poNumber}`, 'success');
      } else if (data.type === 'update') {
        const trStatus = data.purchaseOrder.status === 'Received'
          ? 'Teslim Alındı'
          : data.purchaseOrder.status === 'Sent'
            ? 'Gönderildi'
            : data.purchaseOrder.status === 'Cancelled'
              ? 'İptal Edildi'
              : 'Taslak';
        this.notifications.addNotification(`Satın alma siparişi güncellendi: ${data.purchaseOrder.poNumber} (${trStatus})`, 'info');
        this.ui.showToast(`📋 Satın Alma Güncellendi: ${data.purchaseOrder.poNumber}`, 'info');
      }
    });

    this.socket.on('stock_count_mutated', (data: { type: string; stockCount: any }) => {
      console.log('[SocketService] stock_count_mutated event received', data);
      if (data.type === 'create') {
        this.notifications.addNotification(`Yeni stok sayımı başlatıldı: ${data.stockCount.countNumber}`, 'info');
        this.ui.showToast(`📊 Sayım Başlatıldı: ${data.stockCount.countNumber}`, 'info');
      } else if (data.type === 'update') {
        this.ui.showToast(`📋 Sayım Güncellendi: ${data.stockCount.countNumber}`, 'info');
      } else if (data.type === 'complete') {
        this.notifications.addNotification(`Stok sayımı tamamlandı ve eşitlendi: ${data.stockCount.countNumber}`, 'success');
        this.ui.showToast(`✅ Sayım Tamamlandı: ${data.stockCount.countNumber}`, 'success');
      }
    });

    this.socket.on('supplier_mutated', (data: { type: string; supplier?: any; supplierId?: string }) => {
      console.log('[SocketService] supplier_mutated event received', data);
      if (data.type === 'create') {
        this.notifications.addNotification(`Yeni tedarikçi eklendi: ${data.supplier.name}`, 'success');
        this.ui.showToast(`🏢 Tedarikçi Eklendi: ${data.supplier.name}`, 'success');
      } else if (data.type === 'update') {
        this.notifications.addNotification(`Tedarikçi güncellendi: ${data.supplier.name}`, 'info');
        this.ui.showToast(`🏢 Tedarikçi Güncellendi: ${data.supplier.name}`, 'info');
      } else if (data.type === 'delete') {
        this.notifications.addNotification(`Tedarikçi sistemden silindi.`, 'info');
        this.ui.showToast(`🗑️ Tedarikçi Silindi`, 'info');
      }
    });
  }
}
