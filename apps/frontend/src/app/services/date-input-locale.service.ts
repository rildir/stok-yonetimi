import { Injectable, Injector, inject, afterEveryRender, DOCUMENT } from '@angular/core';
import { I18nService } from '../i18n';

/**
 * Native <input type="date"> renders its value/placeholder in the *browser* locale
 * (e.g. "mm/dd/yyyy" in an English Chrome while the app is in Turkish).
 * This service overlays every date input with the value formatted in the app language
 * (or a localized format hint when empty) while the input is not focused. On focus the
 * native editor is shown, so typing and the picker keep working unchanged.
 */
@Injectable({ providedIn: 'root' })
export class DateInputLocaleService {
  private document = inject(DOCUMENT);
  private i18n = inject(I18nService);
  private injector = inject(Injector);
  private started = false;

  init() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    const doc = this.document;
    // Value changes made by the user, plus focus toggling
    ['input', 'change', 'focusin', 'focusout'].forEach(ev =>
      doc.addEventListener(ev, (e) => {
        const t = e.target as HTMLElement | null;
        if (t instanceof HTMLInputElement && t.type === 'date') this.sync(t);
      }, true));
    // Programmatic (form/model) writes and newly rendered inputs
    afterEveryRender(() => this.syncAll(), { injector: this.injector });
    window.addEventListener('resize', () => this.syncAll());
  }

  private syncAll() {
    this.document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach(el => this.sync(el));
  }

  /** Localized format hint, e.g. "GG.AA.YYYY" (tr) / "MM/DD/YYYY" (en). */
  private placeholder(): string {
    const letters: Record<string, string> = {
      day: this.i18n.t('common.dateHint.day'),
      month: this.i18n.t('common.dateHint.month'),
      year: this.i18n.t('common.dateHint.year'),
    };
    const parts = new Intl.DateTimeFormat(this.i18n.locale(), { year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(Date.UTC(2026, 0, 1)));
    return parts.map(p => p.type === 'literal' ? p.value : (letters[p.type] || '').repeat(p.type === 'year' ? 4 : 2)).join('');
  }

  private format(value: string): string {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Intl.DateTimeFormat(this.i18n.locale(), { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }

  private sync(el: HTMLInputElement) {
    const parent = el.parentElement;
    if (!parent) return;
    el.setAttribute('lang', this.i18n.lang());
    let overlay = el.nextElementSibling as HTMLElement | null;
    if (!overlay || !overlay.classList.contains('date-overlay')) {
      overlay = this.document.createElement('span');
      overlay.className = 'date-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      el.insertAdjacentElement('afterend', overlay);
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    }
    const focused = this.document.activeElement === el;
    const hidden = focused || el.offsetParent === null;
    el.classList.toggle('date-localized', !hidden);
    overlay.hidden = hidden;
    if (hidden) return;
    const text = el.value ? this.format(el.value) : this.placeholder();
    if (overlay.textContent !== text) overlay.textContent = text;
    overlay.classList.toggle('is-empty', !el.value);
    const cs = getComputedStyle(el);
    const left = el.offsetLeft + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const style = overlay.style;
    style.left = `${left}px`;
    style.top = `${el.offsetTop + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop)}px`;
    style.height = `${el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)}px`;
    style.maxWidth = `${Math.max(0, el.clientWidth - parseFloat(cs.paddingLeft) - 28)}px`;
    style.fontSize = cs.fontSize;
    style.fontFamily = cs.fontFamily;
  }
}
