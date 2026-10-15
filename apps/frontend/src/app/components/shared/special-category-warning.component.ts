import { Component, computed, inject, input } from '@angular/core';
import { detectSpecialCategoryData } from '@stok/tr-compliance';
import { I18nService, TranslatePipe } from '../../i18n';

/**
 * KVKK md. 6 (R66): warns while typing when a free-text note looks like special-category personal
 * data (health, religion, union membership, ...). Used under the note fields of suppliers, purchase
 * orders and documents (customers have their own warning in the customer form).
 */
@Component({
  selector: 'app-special-category-warning',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (categories().length) {
      <div class="review-note" role="alert">{{ 'kvkk.notesSensitiveWarning' | t: { categories: categoriesText() } }}</div>
    }
  `,
})
export class SpecialCategoryWarningComponent {
  private readonly i18n = inject(I18nService);
  readonly text = input<string | null | undefined>('');
  readonly categories = computed(() => detectSpecialCategoryData(this.text() || ''));
  readonly categoriesText = computed(() => this.categories().map((c) => this.i18n.t('kvkk.special.' + c)).join(', '));
}
