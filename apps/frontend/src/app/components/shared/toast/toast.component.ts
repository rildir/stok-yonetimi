import { Component, Input, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../i18n';

export type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
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
        <button type="button" class="inline-toast-close" (click)="close()" [attr.aria-label]="'common.close' | t"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
    }
  `,
  styles: [`
    .inline-toast {
      --tone: var(--accent);
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 10px 10px 14px; margin-bottom: 16px;
      background: var(--pop-bg); border: 0; border-radius: var(--radius-md);
      box-shadow: var(--shadow-card), inset 3px 0 0 var(--tone);
      animation: toastIn var(--dur-3) var(--ease-out);
    }
    .toast-success { --tone: var(--success-dot); }
    .toast-error { --tone: var(--danger-dot); }
    .toast-info { --tone: var(--accent); }
    .inline-toast-icon { flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; color: var(--tone); }
    .inline-toast-icon svg { width: 100%; height: 100%; }
    .inline-toast-content { flex: 1; font-size: var(--text-sm); font-weight: 500; color: var(--fg); line-height: 1.45; }
    .inline-toast-close {
      display: inline-flex; align-items: center; justify-content: center; flex: none;
      width: 24px; height: 24px; background: transparent; border: 0; cursor: pointer;
      color: var(--fg-3); border-radius: var(--radius-2xs);
      transition: background-color var(--dur-1) var(--ease-out);
    }
    .inline-toast-close:hover { background: var(--surface-hover); color: var(--fg); }
    .inline-toast-close:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
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
