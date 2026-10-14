import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../i18n';

@Component({
  selector: 'app-button',
  imports: [CommonModule, TranslatePipe],
  template: `
    <button
      [disabled]="disabled || loading"
      [class]="buttonClass"
      [attr.aria-busy]="loading"
      (click)="onClick($event)"
    >
      <span *ngIf="loading" class="spinner-sm" aria-hidden="true"></span>
      <ng-content *ngIf="!loading"></ng-content>
      <span *ngIf="loading">{{ 'common.loading' | t }}</span>
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    .spinner-sm { border-color: currentColor; border-top-color: transparent; opacity: .8; }
  `]
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' = 'primary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() disabled = false;
  @Input() loading = false;

  get buttonClass(): string {
    const variants = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      outline: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
    };
    const sizes = { sm: 'btn-sm', md: '', lg: 'btn-lg' };
    return `btn ${variants[this.variant]} ${sizes[this.size]}`.trim();
  }

  onClick(event: Event) {
    if (this.disabled || this.loading) {
      event.stopPropagation();
      event.preventDefault();
    }
  }
}
