import { Component, Input, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible()) {
      <div class="inline-toast" [class.toast-success]="type() === 'success'" [class.toast-error]="type() === 'error'">
        <div class="inline-toast-icon">
          @if (type() === 'success') {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          } @else if (type() === 'error') {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          }
        </div>
        <div class="inline-toast-content">
          {{ message() }}
        </div>
        <button class="inline-toast-close" (click)="close()">✕</button>
      </div>
    }
  `,
  styles: [`
    .inline-toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      margin-bottom: 24px;
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
      animation: slideDown 0.3s ease-out;
      border-left: 4px solid var(--secondary);
    }
    
    .inline-toast.toast-success {
      border-left-color: var(--status-instock);
      background: rgba(16, 185, 129, 0.05);
    }
    
    .inline-toast.toast-error {
      border-left-color: var(--status-outstock);
      background: rgba(220, 38, 38, 0.05);
    }
    
    .inline-toast-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }
    
    .toast-success .inline-toast-icon { color: var(--status-instock); }
    .toast-error .inline-toast-icon { color: var(--status-outstock); }
    
    .inline-toast-content {
      flex: 1;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--primary);
    }
    
    .inline-toast-close {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.8rem;
      padding: 4px;
    }
    
    .inline-toast-close:hover {
      color: var(--primary);
    }
    
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
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
