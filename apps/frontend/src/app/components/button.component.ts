import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'subtle' | 'danger' | 'danger-outline' | 'danger-ghost' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Precision button. Prefer plain markup (<button class="btn btn-primary">) in templates;
 * this wrapper exists for places that want loading/kbd handled for them.
 *
 *   <app-button variant="primary" kbd="N" [loading]="saving()">Yeni ürün</app-button>
 *
 * Loading keeps the width, hides the label and centres a spinner. Disabled never uses opacity.
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [attr.type]="type"
      [disabled]="disabled"
      [class]="buttonClass"
      [attr.aria-busy]="loading || null"
      [attr.aria-label]="ariaLabel || null"
      (click)="onClick($event)"
    >
      <span class="btn-label"><ng-content></ng-content></span>
      @if (kbd) { <kbd>{{ kbd }}</kbd> }
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }
    :host(.block) { display: flex; }
    .btn-label { display: inline-flex; align-items: center; gap: inherit; }
  `]
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'secondary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() icon = false;
  @Input() block = false;
  @Input() kbd = '';
  @Input() ariaLabel = '';

  get buttonClass(): string {
    const variant = this.variant === 'secondary' || this.variant === 'outline' ? '' : `btn-${this.variant}`;
    const size = this.size === 'md' ? '' : `btn-${this.size}`;
    return ['btn', variant, size, this.icon ? 'btn-icon' : '', this.block ? 'btn-block' : '', this.loading ? 'is-loading' : '']
      .filter(Boolean)
      .join(' ');
  }

  onClick(event: Event) {
    if (this.disabled || this.loading) {
      event.stopPropagation();
      event.preventDefault();
    }
  }
}
