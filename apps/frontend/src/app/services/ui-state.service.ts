import { Injectable, signal, computed } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDelete?: boolean;
  onConfirm: () => any;
  onCancel?: () => void;
}

@Injectable({ providedIn: 'root' })
export class UiStateService {
  toasts = signal<Toast[]>([]);
  confirmConfig = signal<ConfirmConfig | null>(null);
  userProfile = signal<any>(null);
  /** Read-only roles: the demo viewer and the auditor (denetçi, WP7). */
  isReadonly = computed(() => this.userProfile()?.role === 'viewer' || this.userProfile()?.role === 'auditor');
  isAuditor = computed(() => this.userProfile()?.role === 'auditor');

  openConfirm(config: ConfirmConfig) {
    this.confirmConfig.set(config);
  }

  closeConfirm() {
    const config = this.confirmConfig();
    if (config && config.onCancel) {
      config.onCancel();
    }
    this.confirmConfig.set(null);
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    if (this.toasts().some(t => t.message === message && t.type === type)) {
      return;
    }
    const id = Math.random().toString(36).substr(2, 9);
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => { this.removeToast(id); }, 3000);
  }

  removeToast(id: string) {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }
}
