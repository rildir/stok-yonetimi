import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  imports: [CommonModule],
  template: `
    <div
      *ngIf="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto outline-none focus:outline-none"
    >
      <!-- Backdrop with blur and fade-in -->
      <div
        class="fixed inset-0 bg-primary/20 backdrop-blur-sm transition-opacity duration-300 ease-out"
        (click)="close()"
      ></div>

      <!-- Modal panel with smooth scale/fade-in -->
      <div
        class="relative w-full max-w-lg mx-auto bg-surface border border-secondary shadow-premium-lg rounded-lg overflow-hidden transform transition-all duration-300 ease-out z-10"
      >
        <!-- Header -->
        <div class="flex items-start justify-between p-5 border-b border-secondary">
          <h3 class="text-lg font-heading font-semibold text-primary">
            {{ title }}
          </h3>
          <button
            class="p-1 ml-auto bg-transparent border-0 text-textMuted hover:text-primary float-right text-2xl leading-none font-semibold outline-none focus:outline-none transition-colors duration-200"
            (click)="close()"
          >
            <span class="block text-xl">
              <!-- Close Icon SVG -->
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          </button>
        </div>

        <!-- Content -->
        <div class="relative p-6 flex-auto max-h-[70vh] overflow-y-auto">
          <ng-content></ng-content>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-3 p-4 border-t border-secondary bg-canvas">
          <ng-content select="[footer]"></ng-content>
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
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Output() onClose = new EventEmitter<void>();

  close() {
    this.onClose.emit();
  }
}
