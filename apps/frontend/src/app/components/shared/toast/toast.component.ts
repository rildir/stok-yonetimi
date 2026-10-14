import { Component, Input, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible()) {
      <div class="inline-toast" role="status" [class.toast-success]="type() === 'success'" [class.toast-error]="type() === 'error'" [class.toast-info]="type() === 'info'">
        <div class="inline-toast-icon">
          @if (type() === 'success') {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          } @else if (type() === 'error') {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          } @else {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          }
        </div>
        <div class="inline-toast-content">
          {{ message() }}
        </div>
        <button type="button" class="inline-toast-close" (click)="close()" aria-label="×"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
    }
  `,
  styles: [`
    .inline-toast {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3) var(--space-4); margin-bottom: var(--space-6);
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-md);
      animation: toastIn var(--duration-base) var(--ease-standard);
    }
    .toast-success { background: var(--color-success-subtle); border-color: var(--color-success-border); }
    .toast-error { background: var(--color-danger-subtle); border-color: var(--color-danger-border); }
    .toast-info { background: var(--color-info-subtle); border-color: var(--color-info-border); }
    .inline-toast-icon { flex-shrink: 0; width: 20px; height: 20px; }
    .inline-toast-icon svg { width: 100%; height: 100%; }
    .toast-success .inline-toast-icon { color: var(--color-success); }
    .toast-error .inline-toast-icon { color: var(--color-danger); }
    .toast-info .inline-toast-icon { color: var(--color-info); }
    .inline-toast-content { flex: 1; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text); line-height: 1.45; }
    .inline-toast-close {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; background: transparent; border: 0; cursor: pointer;
      color: var(--color-text-muted); border-radius: var(--radius-sm);
      transition: background var(--duration-fast) var(--ease-standard);
    }
    .inline-toast-close:hover { background: var(--color-surface-muted); color: var(--color-text); }
    .inline-toast-close:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  `]
})
export class ToastComponent {
  message = signal<string>('');
  type = signal<ToastType>('info');
  isVisible = signal<boolean>(false);
  
  private timeoutId: any;

  show(msg: string, t: ToastType = 'info') {
    this.message.set(msg);
    this.type.set(t);
    this.isVisible.set(true);
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = setTimeout(() => {
      this.close();
    }, 3000);
  }

  close() {
    this.isVisible.set(false);
  }
}
