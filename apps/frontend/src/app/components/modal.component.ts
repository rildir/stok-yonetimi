import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  imports: [CommonModule],
  template: `
    <div *ngIf="isOpen" class="modal-overlay">
      <!-- Backdrop with blur and fade-in -->
      <div class="modal-backdrop" (click)="close()"></div>

      <!-- Modal panel with smooth scale/fade-in -->
      <div class="modal-panel" [class.is-delete]="isDelete">
        <!-- Header -->
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
          <button class="modal-close" (click)="close()">
            <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <ng-content></ng-content>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <ng-content select="[footer]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      overflow: hidden;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      z-index: -1;
      animation: fadeIn 0.2s ease-out;
    }
    .modal-panel {
      position: relative;
      width: 100%;
      max-width: 480px;
      background: var(--surface, #fff);
      border: 1px solid var(--secondary, #e5e7eb);
      border-radius: var(--radius-lg, 10px);
      box-shadow: var(--shadow-xl, 0 20px 40px -8px rgba(0,0,0,0.1));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
      border-bottom: 1px solid var(--secondary, #f0f0f0);
    }
    .modal-title {
      font-family: var(--font-heading);
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary, #111827);
      margin: 0;
    }
    .modal-close {
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--text-muted, #999);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      border-radius: var(--radius-sm, 6px);
      transition: background 0.15s ease, color 0.15s ease;
    }
    .modal-close:hover {
      background: var(--canvas, #f5f5f5);
      color: var(--text-primary, #111827);
    }
    .modal-content {
      padding: 24px;
      font-family: var(--font-body);
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary, #111827);
      max-height: 60vh;
      overflow-y: auto;
    }
    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid var(--secondary, #f0f0f0);
      background: var(--canvas, #f9fafb);
    }
    .modal-panel.is-delete .modal-header {
      border-bottom: none;
      padding-bottom: 0;
    }
    .modal-panel.is-delete .modal-footer {
      border-top: none;
      background: transparent;
      padding-top: 0;
    }
    .modal-panel.is-delete .modal-content {
      padding: 12px 24px 20px 24px;
    }
  `]
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() isDelete = false;
  @Output() onClose = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  handleEscapeKey() {
    if (this.isOpen) {
      this.close();
    }
  }

  close() {
    this.onClose.emit();
  }
}
