import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { AppStateService } from './app-state.service';
import { UiStateService } from './ui-state.service';
import { NotificationService } from './notification.service';
import { environment } from '../../environments/environment';
import { I18nService } from '../i18n';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private appState = inject(AppStateService);
  private ui = inject(UiStateService);
  private notifications = inject(NotificationService);
  private i18n = inject(I18nService);
  private socket!: Socket;
  /** WP5 e-Belge events (status changes, inbox, provider outage) for live panels. */
  readonly ebelge$ = new Subject<{ event: string; data: any }>();

  private notify(key: string, params: Record<string, string | number>, type: 'info' | 'success' | 'warning' | 'error') {
    this.notifications.addNotification(this.i18n.t(key, params), type, key, params);
  }

  private toast(key: string, params: Record<string, string | number>, type: 'success' | 'error' | 'info') {
    this.ui.showToast(this.i18n.t(key, params), type);
  }

  init() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
    this.socket = io(environment.wsUrl, {
      transports: ['websocket', 'polling'],
      auth: { token }
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
        this.notify('shared.socket.productCreated', { name: data.product.name }, 'success');
        this.toast('shared.socket.productCreatedToast', { name: data.product.name }, 'success');
      } else if (data.type === 'update') {
        this.appState.products.update(prods => prods.map(p => p.id === data.product.id ? data.product : p));
        
        if (data.product.status === 'Out of stock') {
          this.notify('shared.socket.outOfStock', { name: data.product.name }, 'error');
          this.toast('shared.socket.outOfStockToast', { name: data.product.name }, 'error');
        } else if (data.product.status === 'Low stock') {
          this.notify('shared.socket.lowStock', { name: data.product.name, qty: this.i18n.formatNumber(data.product.quantity) }, 'warning');
          this.toast('shared.socket.lowStockToast', { name: data.product.name, qty: this.i18n.formatNumber(data.product.quantity) }, 'error');
        } else {
          this.notify('shared.socket.productUpdated', { name: data.product.name, qty: this.i18n.formatNumber(data.product.quantity) }, 'info');
        }
      } else if (data.type === 'delete') {
        const idToDelete = data.productId || data.product?.id;
        this.appState.products.update(prods => prods.filter(p => p.id !== idToDelete));
        this.notify('shared.socket.productDeleted', {}, 'info');
        this.toast('shared.socket.productDeletedToast', {}, 'info');
      }
    });

    this.socket.on('order_mutated', (data: { type: string; order?: any; orderId?: string }) => {
      console.log('[SocketService] order_mutated event received', data);

      // Update local orders signal incrementally without full HTTP refetch
      if (data.type === 'create') {
        this.appState.orders.update(ords => {
          if (ords.some(o => o.id === data.order.id)) return ords;
          return [data.order, ...ords];
        });
        this.notify('shared.socket.orderCreated', { number: data.order.orderNumber, amount: this.i18n.formatMoney(data.order.totalAmount) }, 'success');
        this.toast('shared.socket.orderCreatedToast', { number: data.order.orderNumber, amount: this.i18n.formatMoney(data.order.totalAmount) }, 'success');
      } else if (data.type === 'update') {
        this.appState.orders.update(ords => ords.map(o => o.id === data.order.id ? data.order : o));
        
        const statusKey = data.order.status === 'Completed'
          ? 'shared.orderStatus.completed'
          : data.order.status === 'Cancelled'
            ? 'shared.orderStatus.cancelled'
            : 'shared.orderStatus.pending';
            
        this.notify('shared.socket.orderUpdated', { number: data.order.orderNumber, status: this.i18n.t(statusKey) }, 'info');
        this.toast('shared.socket.orderUpdatedToast', { number: data.order.orderNumber }, 'info');
      } else if (data.type === 'delete') {
        const idToDelete = data.orderId;
        this.appState.orders.update(ords => ords.filter(o => o.id !== idToDelete));
        this.notify('shared.socket.orderDeleted', {}, 'info');
        this.toast('shared.socket.orderDeletedToast', {}, 'info');
      }
    });

    this.socket.on('purchase_order_mutated', (data: { type: string; purchaseOrder: any }) => {
      console.log('[SocketService] purchase_order_mutated event received', data);
      if (data.type === 'create') {
        this.notify('shared.socket.poCreated', { number: data.purchaseOrder.poNumber, supplier: data.purchaseOrder.supplierName }, 'success');
        this.toast('shared.socket.poCreatedToast', { number: data.purchaseOrder.poNumber }, 'success');
      } else if (data.type === 'update') {
        const statusKey = data.purchaseOrder.status === 'Received'
          ? 'shared.poStatus.received'
          : data.purchaseOrder.status === 'Sent'
            ? 'shared.poStatus.sent'
            : data.purchaseOrder.status === 'Cancelled'
              ? 'shared.poStatus.cancelled'
              : 'shared.poStatus.draft';
        this.notify('shared.socket.poUpdated', { number: data.purchaseOrder.poNumber, status: this.i18n.t(statusKey) }, 'info');
        this.toast('shared.socket.poUpdatedToast', { number: data.purchaseOrder.poNumber }, 'info');
      }
    });

    this.socket.on('stock_count_mutated', (data: { type: string; stockCount: any }) => {
      console.log('[SocketService] stock_count_mutated event received', data);
      if (data.type === 'create') {
        this.notify('shared.socket.countCreated', { number: data.stockCount.countNumber }, 'info');
        this.toast('shared.socket.countCreatedToast', { number: data.stockCount.countNumber }, 'info');
      } else if (data.type === 'update') {
        this.toast('shared.socket.countUpdatedToast', { number: data.stockCount.countNumber }, 'info');
      } else if (data.type === 'complete') {
        this.notify('shared.socket.countCompleted', { number: data.stockCount.countNumber }, 'success');
        this.toast('shared.socket.countCompletedToast', { number: data.stockCount.countNumber }, 'success');
      }
    });

    this.socket.on('warehouse_mutated', (data: { type: string; warehouse?: any; warehouseId?: string }) => {
      console.log('[SocketService] warehouse_mutated event received', data);
      this.notify('shared.socket.warehouseUpdated', {}, 'info');
      this.toast('shared.socket.warehouseUpdatedToast', {}, 'info');
    });

    this.socket.on('supplier_mutated', (data: { type: string; supplier?: any; supplierId?: string }) => {
      console.log('[SocketService] supplier_mutated event received', data);
      if (data.type === 'create') {
        this.notify('shared.socket.supplierCreated', { name: data.supplier.name }, 'success');
        this.toast('shared.socket.supplierCreatedToast', { name: data.supplier.name }, 'success');
      } else if (data.type === 'update') {
        this.notify('shared.socket.supplierUpdated', { name: data.supplier.name }, 'info');
        this.toast('shared.socket.supplierUpdatedToast', { name: data.supplier.name }, 'info');
      } else if (data.type === 'delete') {
        this.notify('shared.socket.supplierDeleted', {}, 'info');
        this.toast('shared.socket.supplierDeletedToast', {}, 'info');
      }
    });

    this.socket.on('password_reset_requested', (data: { username: string; fullName: string }) => {
      console.log('[SocketService] password_reset_requested event received', data);
      this.notify('shared.socket.passwordReset', { fullName: data.fullName, username: data.username }, 'warning');
      this.toast('shared.socket.passwordResetToast', { username: data.username }, 'info');
    });

    // Yearly legal parameter (e.g. VUK 232 limit) missing for the new year: admins are told to update it.
    this.socket.on('compliance_warning', (data: { code: string; keys: string[]; year: number }) => {
      this.notify('compliance.socket.parameterMissing', { keys: (data.keys || []).join(', '), year: data.year }, 'warning');
    });

    // WP5 e-Belge: status timeline / inbox / outage / integrity / MATBUDAN deadline.
    for (const ev of ['edocument_status', 'ebelge_status', 'inbox_updated', 'invoice_mutated', 'despatch_mutated']) {
      this.socket.on(ev, (data: any) => this.ebelge$.next({ event: ev, data }));
    }
    this.socket.on('inbox_updated', (data: { stored: number }) => this.notify('ebelge.socket.inbox', { n: data?.stored ?? 0 }, 'info'));
    this.socket.on('ebelge_status', (data: { outage: boolean; message?: string }) => {
      if (data?.outage) this.notify('ebelge.socket.outage', { message: data.message || '-' }, 'error');
    });
    this.socket.on('edocument_integrity_alert', (data: { mismatches: number; noticeDeadline: string }) => {
      this.notify('ebelge.socket.integrity', { n: data.mismatches, date: data.noticeDeadline }, 'error');
    });
    this.socket.on('ebelge_matbudan_deadline', (data: { documents: unknown[] }) => {
      this.notify('ebelge.socket.matbudan', { n: (data.documents || []).length }, 'warning');
    });

    // Daily VUK 231/5 reminder: deliveries to invoice (day 5 warning, day 7 critical) and pending expense vouchers.
    this.socket.on('document_deadlines', (data: { uninvoiced?: { warning: number; critical: number }; pendingExpenseVouchers?: number }) => {
      this.notify('compliance.socket.documentDeadlines', {
        critical: data.uninvoiced?.critical ?? 0,
        warning: data.uninvoiced?.warning ?? 0,
        vouchers: data.pendingExpenseVouchers ?? 0,
      }, (data.uninvoiced?.critical ?? 0) > 0 ? 'error' : 'warning');
    });
  }

  connect() {
    if (this.socket) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
      this.socket.auth = { token };
      if (this.socket.disconnected) {
        this.socket.connect();
      } else {
        this.socket.disconnect().connect();
      }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
