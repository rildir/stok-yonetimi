import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppStateService } from './app-state.service';
import { UiStateService } from './ui-state.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private appState = inject(AppStateService);
  private ui = inject(UiStateService);
  private socket!: Socket;

  init() {
    this.socket = io('http://localhost:3000', {
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
        // this.ui.showToast(`✨ Yeni ürün eklendi: ${data.product.name}`, 'success');
      } else if (data.type === 'update') {
        this.appState.products.update(prods => prods.map(p => p.id === data.product.id ? data.product : p));
        
        const statusText = data.product.status === 'Out of stock' 
          ? 'Tükendi 🔴' 
          : data.product.status === 'Low stock' 
            ? 'Kritik Seviye 🟡' 
            : `Stok: ${data.product.quantity} Adet 🟢`;
            
        // this.ui.showToast(`🔄 Stok Güncellendi: ${data.product.name} (${statusText})`, 'info');
      } else if (data.type === 'delete') {
        const idToDelete = data.productId || data.product?.id;
        this.appState.products.update(prods => prods.filter(p => p.id !== idToDelete));
        // this.ui.showToast(`🗑️ Bir ürün sistemden kaldırıldı.`, 'info');
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
        // this.ui.showToast(`🛒 Yeni sipariş alındı: ${data.order.orderNumber} (₺${data.order.totalAmount})`, 'success');
      } else if (data.type === 'update') {
        this.appState.orders.update(ords => ords.map(o => o.id === data.order.id ? data.order : o));
        
        const trStatus = data.order.status === 'Completed' 
          ? 'Tamamlandı' 
          : data.order.status === 'Cancelled' 
            ? 'İptal Edildi' 
            : 'Beklemede';
            
        // this.ui.showToast(`📋 Sipariş Durumu Güncellendi: ${data.order.orderNumber} (${trStatus})`, 'info');
      }
    });
  }
}
