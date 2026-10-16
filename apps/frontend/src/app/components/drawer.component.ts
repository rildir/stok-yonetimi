import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../i18n';

/**
 * Precision drawer: floating panel (8px insets, radius 14), eyebrow + 16/600 title,
 * scrolling body built from .fsec sections, sticky footer with a fade.
 *
 *   <app-drawer [isOpen]="open()" [title]="'products.new' | t" eyebrow="Ürünler / Yeni kayıt" width="md|lg|xl" (onClose)="close()">
 *     <span drawer-status class="badge badge-neutral">Taslak</span>
 *     <section class="fsec">…</section>
 *     <ng-container drawer-footer>
 *       <span class="hint"><kbd>Ctrl</kbd><kbd>↵</kbd></span><span class="spacer"></span>
 *       <button class="btn btn-ghost" (click)="close()">Vazgeç</button>
 *       <button class="btn btn-primary">Kaydet</button>
 *     </ng-container>
 *   </app-drawer>
 *
 * Ctrl/⌘+Enter clicks the footer's primary button (handled globally by the layout).
 */
@Component({
  selector: 'app-drawer',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    @if (isOpen) {
      <div class="scrim" (click)="close()"></div>
      <aside class="drawer" [class.w-md]="width === 'md'" [class.w-xl]="width === 'xl'" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <header class="drawer-h">
          <div class="t">
            @if (eyebrow) {
              <div class="eyebrow"><span class="truncate">{{ eyebrow }}</span><ng-content select="[drawer-status]"></ng-content></div>
            }
            <h2>{{ title }}</h2>
          </div>
          <div class="tools">
            <ng-content select="[drawer-tools]"></ng-content>
            <button type="button" class="drawer-close" (click)="close()" [attr.aria-label]="'common.close' | t">
              <kbd>Esc</kbd>
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>
        </header>
        <div class="drawer-b">
          <ng-content></ng-content>
        </div>
        <footer class="drawer-f">
          <ng-content select="[drawer-footer]"></ng-content>
        </footer>
      </aside>
    }
  `,
  styles: [`:host { display: contents; } .drawer-f:empty { display: none; }`]
})
export class DrawerComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() eyebrow = '';
  @Input() width: 'md' | 'lg' | 'xl' = 'lg';
  @Output() onClose = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen) this.close();
  }

  close() {
    this.onClose.emit();
  }
}
