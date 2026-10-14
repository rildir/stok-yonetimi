import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../i18n';

@Component({
  selector: 'app-drawer',
  imports: [CommonModule, TranslatePipe],
  template: `
    <div *ngIf="isOpen" class="drawer-overlay" (click)="close()">
      <div class="drawer-panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <h2 class="drawer-title">{{ title }}</h2>
          <button type="button" class="drawer-close" (click)="close()" [attr.aria-label]="'common.close' | t">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="drawer-body">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`]
})
export class DrawerComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Output() onClose = new EventEmitter<void>();

  close() {
    this.onClose.emit();
  }
}
