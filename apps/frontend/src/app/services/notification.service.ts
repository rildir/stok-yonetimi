import { Injectable, signal, computed } from '@angular/core';

export interface AppNotification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  notifications = signal<AppNotification[]>([]);
  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const saved = localStorage.getItem('smart_inventory_notifications');
      if (saved) {
        this.notifications.set(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('smart_inventory_notifications', JSON.stringify(this.notifications()));
    } catch (e) {
      console.error('Failed to save notifications', e);
    }
  }

  addNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const newNotif: AppNotification = {
      id: Math.random().toString(36).substr(2, 9),
      message,
      type,
      createdAt: new Date().toISOString(),
      read: false
    };

    // Keep only last 50 notifications in history
    this.notifications.update(list => [newNotif, ...list].slice(0, 50));
    this.saveToStorage();
  }

  markAsRead(id: string) {
    this.notifications.update(list => 
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
    this.saveToStorage();
  }

  markAllAsRead() {
    this.notifications.update(list => 
      list.map(n => ({ ...n, read: true }))
    );
    this.saveToStorage();
  }

  clearAll() {
    this.notifications.set([]);
    this.saveToStorage();
  }
}
