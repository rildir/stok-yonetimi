import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../i18n';

/**
 * Precision modal frame: 520px (size sm 420 / lg 720), radius 14, 16/600 title,
 * body capped at 68ch, surface-2 footer with actions on the right.
 *
 *   <app-modal [isOpen]="open()" [title]="'…' | t" (onClose)="open.set(false)">
 *     <p>Body…</p>
 *     <div footer class="modal-actions">
 *       <button class="btn btn-ghost">Vazgeç</button><button class="btn btn-primary">Kaydet</button>
 *     </div>
 *   </app-modal>
 *
 * isDelete: compact destructive confirmation (no header rule; title rendered by the content).
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    @if (isOpen) {
      <div class="scrim" (click)="close()">
        <div class="modal" [class.w-sm]="size === 'sm'" [class.w-lg]="size === 'lg'" [class.is-delete]="isDelete"
             role="dialog" aria-modal="true" [attr.aria-label]="title || null" (click)="$event.stopPropagation()">
          @if (title || !isDelete) {
            <div class="modal-h">
              <h2>{{ title }}</h2>
              <button type="button" class="modal-close" (click)="close()" [attr.aria-label]="'common.close' | t">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
          }
          <div class="modal-b" [class.is-delete-body]="isDelete">
            <ng-content></ng-content>
          </div>
          <div class="modal-f">
            <ng-content select="[footer]"></ng-content>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .modal-b { max-height: 64vh; }
    .is-delete-body { padding-top: 20px; }
    .modal-f:empty { display: none; }
  `]
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() isDelete = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
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
