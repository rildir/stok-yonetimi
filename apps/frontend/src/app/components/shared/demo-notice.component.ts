import { Component, Input } from '@angular/core';
import { TranslatePipe } from '../../i18n';
import { IconComponent } from './icon.component';

/**
 * Demo / portfolio disclaimer shown above every legal text (privacy notice, consent, terms, DPA,
 * data-subject requests) and, as a single line, near the legal links of the sign-in screens.
 */
@Component({
  selector: 'app-demo-notice',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  styles: [`
    :host { display: block; }
    .demo-box { align-items: flex-start; margin: 0 0 var(--space-3, 12px); }
    .demo-box > app-icon { margin-top: 1px; color: var(--warning); }
    .demo-box b { display: block; margin-bottom: 2px; }
    .demo-line { margin: 0; font-size: var(--text-xs); color: var(--fg-3); }
    :host(.in-foot) { order: 99; flex-basis: 100%; margin-top: -8px; text-align: right; }
  `],
  template: `
    @if (variant === 'line') {
      <p class="demo-line">{{ 'demo.notice.short' | t }}</p>
    } @else {
      <div class="notice notice-warning demo-box" role="note">
        <app-icon name="info" size="sm" />
        <span class="t"><b>{{ 'demo.notice.title' | t }}</b>{{ 'demo.notice.body' | t }}</span>
      </div>
    }
  `,
})
export class DemoNoticeComponent {
  @Input() variant: 'box' | 'line' = 'box';
}
