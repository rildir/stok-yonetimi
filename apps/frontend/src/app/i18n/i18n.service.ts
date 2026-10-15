import { DOCUMENT, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Dict, TR_DICTIONARY, loadDictionary } from '../../i18n';

export type Lang = 'tr' | 'en';
export const SUPPORTED_LANGS: Lang[] = ['tr', 'en'];
const LANG_STORAGE_KEY = 'app_lang';

export interface EffectiveLocale {
  language?: string | null;
  timezone?: string | null;
  currency?: string | null;
  country?: string | null;
}

/**
 * Signal-based runtime i18n + locale settings.
 * - lang: current UI language (switchable at runtime, no rebuild)
 * - currency/timeZone: from the effective locale (GET /user/profile -> locale)
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private document = inject(DOCUMENT);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lang = signal<Lang>(this.initialLang());
  readonly currency = signal<string>('TRY');
  readonly timeZone = signal<string | undefined>(undefined);

  /** BCP-47 locale used by Intl formatters. */
  readonly locale = computed(() => (this.lang() === 'en' ? 'en-US' : 'tr-TR'));
  /** Loaded dictionaries (Turkish is bundled; English arrives from a lazy chunk). */
  private readonly dicts = signal<Partial<Record<Lang, Dict>>>({ tr: TR_DICTIONARY });
  private dict = computed(() => this.dicts()[this.lang()] ?? TR_DICTIONARY);
  private loading = new Map<Lang, Promise<void>>();
  private requested: Lang | null = null;
  /** Resolves when the initial language's dictionary is loaded (awaited by the app initializer). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.ensure(this.lang());
    effect(() => {
      const lang = this.lang();
      this.document?.documentElement?.setAttribute('lang', lang);
    });
  }

  static normalize(lang: string | null | undefined): Lang | null {
    if (!lang) return null;
    const l = lang.toLowerCase().slice(0, 2);
    return (SUPPORTED_LANGS as string[]).includes(l) ? (l as Lang) : null;
  }

  private initialLang(): Lang {
    if (typeof window === 'undefined') return 'tr';
    try {
      const stored = I18nService.normalize(localStorage.getItem(LANG_STORAGE_KEY));
      if (stored) return stored;
    } catch {
      /* storage unavailable */
    }
    return I18nService.normalize(navigator.language) ?? 'tr';
  }

  /** Translate a key; `{name}` placeholders are replaced from params. Falls back to tr, then the key. */
  t(key: string, params?: Record<string, unknown> | null): string {
    let text = this.dict()[key] ?? TR_DICTIONARY[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(v == null ? '' : String(v));
      }
    }
    return text;
  }

  has(key: string): boolean {
    return key in this.dict();
  }

  /** Loads the dictionary of `lang` once. */
  ensure(lang: Lang): Promise<void> {
    if (this.dicts()[lang]) return Promise.resolve();
    let p = this.loading.get(lang);
    if (!p) {
      p = loadDictionary(lang)
        .then((d) => this.dicts.update((all) => ({ ...all, [lang]: d })))
        .catch(() => undefined);
      this.loading.set(lang, p);
    }
    return p;
  }

  setLanguage(lang: string | null | undefined, persist = true) {
    const l = I18nService.normalize(lang);
    if (!l) return;
    // Switch once the dictionary is there (no flash of fallback texts); the last request wins.
    this.requested = l;
    if (this.dicts()[l]) this.lang.set(l);
    else void this.ensure(l).then(() => this.requested === l && this.lang.set(l));
    if (persist && this.isBrowser) {
      try {
        localStorage.setItem(LANG_STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
    }
  }

  /** Apply the effective locale returned by GET /user/profile. */
  applyLocale(locale: EffectiveLocale | null | undefined) {
    if (!locale) return;
    if (locale.language) this.setLanguage(locale.language);
    if (locale.currency) this.currency.set(locale.currency);
    if (locale.timezone) this.timeZone.set(locale.timezone);
  }

  // ─── Formatting helpers (Intl with the effective locale) ───

  formatMoney(value: number | string | null | undefined, currency?: string, opts?: Intl.NumberFormatOptions): string {
    const n = Number(value ?? 0);
    const cur = currency || this.currency();
    try {
      return new Intl.NumberFormat(this.locale(), {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...opts,
      }).format(isFinite(n) ? n : 0);
    } catch {
      return `${n.toFixed(2)} ${cur}`;
    }
  }

  formatNumber(value: number | string | null | undefined, opts?: Intl.NumberFormatOptions): string {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat(this.locale(), opts).format(isFinite(n) ? n : 0);
  }

  /** Currency symbol only (e.g. ₺ or $). */
  currencySymbol(currency?: string): string {
    const cur = currency || this.currency();
    try {
      const part = new Intl.NumberFormat(this.locale(), { style: 'currency', currency: cur })
        .formatToParts(0)
        .find((p) => p.type === 'currency');
      return part?.value ?? cur;
    } catch {
      return cur;
    }
  }

  formatDate(
    value: Date | string | number | null | undefined,
    kind: 'date' | 'datetime' | 'time' | 'short' | 'long' = 'date',
    opts?: Intl.DateTimeFormatOptions,
  ): string {
    if (value === null || value === undefined || value === '') return '';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    const presets: Record<string, Intl.DateTimeFormatOptions> = {
      date: { year: 'numeric', month: '2-digit', day: '2-digit' },
      datetime: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
      time: { hour: '2-digit', minute: '2-digit' },
      short: { day: 'numeric', month: 'short' },
      long: { year: 'numeric', month: 'long', day: 'numeric' },
    };
    const options: Intl.DateTimeFormatOptions = { ...presets[kind], ...opts };
    const tz = this.timeZone();
    if (tz) options.timeZone = tz;
    try {
      return new Intl.DateTimeFormat(this.locale(), options).format(d);
    } catch {
      delete options.timeZone;
      return new Intl.DateTimeFormat(this.locale(), options).format(d);
    }
  }
}
