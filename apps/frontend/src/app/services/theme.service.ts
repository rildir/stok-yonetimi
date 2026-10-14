import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'theme';

/**
 * Light/dark theme. Defaults to the OS preference; a manual choice is
 * persisted in localStorage and applied as <html data-theme="…">.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  private initial(): Theme {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* storage unavailable */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }
}
