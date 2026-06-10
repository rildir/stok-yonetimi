import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-drawer',
  imports: [CommonModule],
  template: `
    <div
      *ngIf="isOpen"
      class="fixed inset-0 z-40 overflow-hidden"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-primary/10 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
        (click)="close()"
      ></div>

      <!-- Drawer panel sliding from right -->
      <div
        class="absolute inset-y-0 right-0 max-w-full flex pl-10"
      >
        <div
          class="w-screen max-w-lg bg-surface border-l border-secondary shadow-premium-lg flex flex-col transform transition-transform duration-300 ease-in-out"
        >
          <!-- Header -->
          <div class="px-6 py-5 border-b border-secondary flex items-center justify-between bg-surface">
            <h2 class="text-lg font-heading font-semibold text-primary">
              {{ title }}
            </h2>
            <button
              (click)="close()"
              class="rounded-md text-textMuted hover:text-primary focus:outline-none transition-colors duration-200"
            >
              <span class="sr-only">Kapat</span>
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body content -->
          <div class="flex-1 overflow-y-auto px-6 py-6 bg-canvas/40">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class DrawerComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Output() onClose = new EventEmitter<void>();

  close() {
    this.onClose.emit();
  }
}
