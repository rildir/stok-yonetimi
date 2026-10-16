import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';
const THEME_STORAGE_KEY = 'theme';
const DENSITY_STORAGE_KEY = 'ui_density';

/**
 * Light/dark theme and UI density. The theme defaults to the OS preference; a manual choice is
 * persisted in localStorage and applied as <html data-theme="…">. Density "comfortable" (14px text,
 * 36px controls, 44px rows — floor monitors, tablets) is applied as <html data-density="comfortable">.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());
  readonly density = signal<Density>(this.initialDensity());

  constructor() {
    if (typeof document !== 'undefined' && this.density() === 'comfortable') {
      document.documentElement.setAttribute('data-density', 'comfortable');
    }
  }

  private initial(): Theme {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* storage unavailable */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private initialDensity(): Density {
    if (typeof window === 'undefined') return 'compact';
    try {
      return localStorage.getItem(DENSITY_STORAGE_KEY) === 'comfortable' ? 'comfortable' : 'compact';
    } catch {
      return 'compact';
    }
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

  toggleDensity(): void {
    this.setDensity(this.density() === 'comfortable' ? 'compact' : 'comfortable');
  }

  setDensity(density: Density): void {
    this.density.set(density);
    if (typeof document === 'undefined') return;
    if (density === 'comfortable') document.documentElement.setAttribute('data-density', 'comfortable');
    else document.documentElement.removeAttribute('data-density');
    try { localStorage.setItem(DENSITY_STORAGE_KEY, density); } catch { /* ignore */ }
    // Charts re-read sizes/tokens on this event as well.
    window.dispatchEvent(new CustomEvent('themechange', { detail: this.theme() }));
  }
}
