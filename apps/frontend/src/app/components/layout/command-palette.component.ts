import { Component, ElementRef, EventEmitter, Output, ViewChild, computed, effect, inject, input, signal, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { I18nService, TranslatePipe } from '../../i18n';
import { SearchService, GlobalSearchResult } from '../../services/search.service';
import { IconComponent } from '../shared/icon.component';
import { CREATE_ACTIONS, visibleSections } from './nav.config';

export type PaletteCommand = 'theme' | 'density' | 'lang' | 'logout';
type Scope = 'all' | 'pages' | 'records' | 'commands';

interface PaletteItem {
  id: string;
  group: 'pages' | 'actions' | 'records' | 'commands';
  label: string;
  sub?: string;
  icon: string;
  meta?: string;
  keys?: string[];
  route?: string;
  queryParams?: Record<string, string>;
  command?: PaletteCommand;
}

/**
 * ⌘K / Ctrl K command palette: pages, create actions (N-chords), live records from
 * GET /search, and app commands. Keyboard: ↑↓ move · ↵ open · Esc close · Tab scope.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="cmdk-scrim" (mousedown)="close()">
      <div class="cmdk" role="dialog" aria-modal="true" [attr.aria-label]="'layout.palette.title' | t" (mousedown)="$event.stopPropagation()">
        <div class="cmdk-in">
          <app-icon name="search" />
          <input #input type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"
                 [attr.aria-activedescendant]="active() ? 'cmdk-' + active()!.id : null"
                 [placeholder]="'layout.palette.placeholder' | t" [value]="query()"
                 (input)="onQuery($any($event.target).value)" (keydown)="onKey($event)" autocomplete="off" spellcheck="false" />
          <kbd>Esc</kbd>
        </div>
        <div class="cmdk-scope">
          <div class="seg seg-sm" role="group" [attr.aria-label]="'layout.palette.scope' | t">
            @for (s of scopes; track s) {
              <button type="button" [attr.aria-pressed]="scope() === s" (click)="setScope(s)">{{ ('layout.palette.scope.' + s) | t }}</button>
            }
          </div>
        </div>
        <div class="cmdk-list" id="cmdk-list" role="listbox" #list>
          @for (g of groups(); track g.key) {
            <div class="cmdk-g" role="presentation">{{ ('layout.palette.group.' + g.key) | t }}</div>
            @for (it of g.items; track it.id) {
              <button type="button" class="cmdk-i" role="option" [id]="'cmdk-' + it.id" [class.is-active]="active()?.id === it.id"
                      [attr.aria-selected]="active()?.id === it.id" (mousemove)="hover(it)" (click)="run(it)">
                <app-icon [name]="it.icon" />
                <span class="lbl">
                  @for (p of parts(it.label); track $index) { @if (p.m) { <mark>{{ p.t }}</mark> } @else { {{ p.t }} } }
                </span>
                @if (it.sub) { <span class="lbl-sub">{{ it.sub }}</span> }
                <span class="meta">
                  @if (it.meta) { <span class="mono">{{ it.meta }}</span> }
                  @if (it.keys) { <span class="kbd-group">@for (k of it.keys; track $index) { <kbd>{{ k }}</kbd> }</span> }
                </span>
              </button>
            }
          } @empty {
            <div class="cmdk-empty">
              @if (loading()) { <span class="spinner-sm"></span> } @else { {{ 'layout.palette.empty' | t: { q: query() } }} }
            </div>
          }
        </div>
        <div class="cmdk-f">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ 'layout.palette.hint.move' | t }}</span>
          <span><kbd>↵</kbd> {{ 'layout.palette.hint.open' | t }}</span>
          <span><kbd>Tab</kbd> {{ 'layout.palette.hint.scope' | t }}</span>
          <span class="spacer"></span>
          <span class="mono">{{ 'layout.palette.count' | t: { n: flat().length } }}</span>
          <span class="brand-mark sm" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  `,
})
export class CommandPaletteComponent implements AfterViewInit {
  private router = inject(Router);
  private i18n = inject(I18nService);
  private searchService = inject(SearchService);

  role = input<string | undefined>(undefined);
  isDark = input(false);
  @Output() closed = new EventEmitter<void>();
  @Output() command = new EventEmitter<PaletteCommand>();
  @ViewChild('input') input!: ElementRef<HTMLInputElement>;
  @ViewChild('list') list!: ElementRef<HTMLElement>;

  readonly scopes: Scope[] = ['all', 'pages', 'records', 'commands'];
  query = signal('');
  scope = signal<Scope>('all');
  activeIndex = signal(0);
  loading = signal(false);
  private results = signal<GlobalSearchResult | null>(null);
  private search$ = new Subject<string>();

  constructor() {
    this.search$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => {
          const t = q.trim();
          if (t.length < 2) {
            this.loading.set(false);
            return of(null);
          }
          this.loading.set(true);
          return this.searchService.search(t).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((r) => {
        this.loading.set(false);
        this.results.set(r);
      });
    // keep the active row in view
    effect(() => {
      const a = this.active();
      if (!a || typeof document === 'undefined') return;
      queueMicrotask(() => document.getElementById('cmdk-' + a.id)?.scrollIntoView({ block: 'nearest' }));
    });
  }

  ngAfterViewInit() {
    this.input?.nativeElement.focus();
    setTimeout(() => this.input?.nativeElement.focus());
  }

  private matches(label: string, keywords: string[] = []): boolean {
    const q = this.query().toLocaleLowerCase(this.i18n.locale()).trim();
    if (!q) return true;
    return label.toLocaleLowerCase(this.i18n.locale()).includes(q) || keywords.some((k) => k.toLocaleLowerCase(this.i18n.locale()).includes(q));
  }

  private pageItems = computed<PaletteItem[]>(() => {
    this.i18n.lang();
    return visibleSections(this.role())
      .flatMap((s) => s.items.map((i) => ({ i, section: s.labelKey })))
      .filter(({ i }) => this.matches(this.i18n.t(i.labelKey), i.keywords))
      .map(({ i, section }) => ({
        id: 'p' + i.route,
        group: 'pages' as const,
        label: this.i18n.t(i.labelKey),
        sub: section ? this.i18n.t(section) : undefined,
        icon: i.icon,
        route: i.route,
      }));
  });

  private actionItems = computed<PaletteItem[]>(() => {
    this.i18n.lang();
    return CREATE_ACTIONS.filter((a) => this.matches(this.i18n.t(a.labelKey), a.keywords)).map((a) => ({
      id: 'a' + a.key,
      group: 'actions' as const,
      label: this.i18n.t(a.labelKey),
      icon: 'plus',
      keys: ['N', a.key],
      route: a.route,
      queryParams: { open: 'new' },
    }));
  });

  private recordItems = computed<PaletteItem[]>(() => {
    const r = this.results();
    if (!r || this.query().trim().length < 2) return [];
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p);
    const out: PaletteItem[] = [];
    (r.products || []).forEach((p) =>
      out.push({ id: 'rp' + p.id, group: 'records', label: p.name, icon: 'box', meta: p.sku, sub: t('layout.search.productSubtitle', { sku: p.sku, qty: this.i18n.formatNumber(p.quantity), unit: p.unit || t('layout.search.unitDefault') }), route: '/products', queryParams: { open: `edit-${p.id}` } }),
    );
    (r.orders || []).forEach((o) =>
      out.push({ id: 'ro' + o.id, group: 'records', label: o.orderNumber, icon: 'bag', meta: this.i18n.formatMoney(o.totalAmount), sub: o.customerName, route: '/orders', queryParams: { open: `edit-${o.id}` } }),
    );
    (r.purchaseOrders || []).forEach((po) =>
      out.push({ id: 'rb' + po.id, group: 'records', label: po.poNumber, icon: 'cart', meta: this.i18n.formatMoney(po.totalAmount), sub: po.supplierName, route: '/purchase-orders', queryParams: { open: `edit-${po.id}` } }),
    );
    (r.warehouses || []).forEach((w) =>
      out.push({ id: 'rw' + w.id, group: 'records', label: w.name, icon: 'warehouse', meta: w.code, sub: [w.address?.district, w.address?.province].filter(Boolean).join(' / ') || undefined, route: '/warehouses' }),
    );
    (r.suppliers || []).forEach((s) =>
      out.push({ id: 'rs' + s.id, group: 'records', label: s.name, icon: 'truck', sub: s.contactPerson || undefined, route: '/suppliers' }),
    );
    return out;
  });

  private commandItems = computed<PaletteItem[]>(() => {
    this.i18n.lang();
    const list: PaletteItem[] = [
      { id: 'c-theme', group: 'commands', label: this.i18n.t(this.isDark() ? 'layout.theme.toLight' : 'layout.theme.toDark'), icon: this.isDark() ? 'sun' : 'moon', keys: ['⇧', 'T'], command: 'theme' },
      { id: 'c-lang', group: 'commands', label: this.i18n.t('layout.palette.cmd.lang'), icon: 'globe', meta: this.i18n.lang() === 'tr' ? 'TR → EN' : 'EN → TR', command: 'lang' },
      { id: 'c-density', group: 'commands', label: this.i18n.t('layout.palette.cmd.density'), icon: 'rows', command: 'density' },
      { id: 'c-logout', group: 'commands', label: this.i18n.t('layout.profile.logout'), icon: 'logout', command: 'logout' },
    ];
    return list.filter((c) => this.matches(c.label));
  });

  groups = computed(() => {
    const s = this.scope();
    const all: { key: PaletteItem['group']; items: PaletteItem[] }[] = [];
    const hasQuery = this.query().trim().length > 0;
    if (s === 'all' || s === 'records') all.push({ key: 'records', items: this.recordItems() });
    if (s === 'all' || s === 'pages') {
      all.push({ key: 'pages', items: hasQuery || s === 'pages' ? this.pageItems() : this.pageItems().slice(0, 6) });
      all.push({ key: 'actions', items: this.actionItems() });
    }
    if (s === 'all' || s === 'commands') all.push({ key: 'commands', items: this.commandItems() });
    return all.filter((g) => g.items.length);
  });

  flat = computed(() => this.groups().flatMap((g) => g.items));
  active = computed(() => {
    const f = this.flat();
    return f.length ? f[Math.min(this.activeIndex(), f.length - 1)] : null;
  });

  parts(label: string): { t: string; m: boolean }[] {
    const q = this.query().trim();
    if (!q) return [{ t: label, m: false }];
    const i = label.toLocaleLowerCase(this.i18n.locale()).indexOf(q.toLocaleLowerCase(this.i18n.locale()));
    if (i < 0) return [{ t: label, m: false }];
    return [
      { t: label.slice(0, i), m: false },
      { t: label.slice(i, i + q.length), m: true },
      { t: label.slice(i + q.length), m: false },
    ].filter((p) => p.t);
  }

  onQuery(v: string) {
    this.query.set(v);
    this.activeIndex.set(0);
    this.search$.next(v);
  }

  setScope(s: Scope) {
    this.scope.set(s);
    this.activeIndex.set(0);
    this.input?.nativeElement.focus();
  }

  hover(it: PaletteItem) {
    const i = this.flat().findIndex((x) => x.id === it.id);
    if (i >= 0 && i !== this.activeIndex()) this.activeIndex.set(i);
  }

  onKey(e: KeyboardEvent) {
    const n = this.flat().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (n) this.activeIndex.set((this.activeIndex() + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.activeIndex.set((this.activeIndex() - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = this.active();
      if (a) this.run(a);
      else this.searchFallback();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const i = this.scopes.indexOf(this.scope());
      this.setScope(this.scopes[(i + (e.shiftKey ? this.scopes.length - 1 : 1)) % this.scopes.length]);
    }
  }

  /** Enter with no match: search the current list page (or products) for the text, as before. */
  private searchFallback() {
    const q = this.query().trim();
    if (!q) return;
    const current = this.router.url.split('?')[0];
    const searchable = ['/products', '/warehouses', '/suppliers', '/orders', '/purchase-orders', '/stock-movements', '/customers'];
    this.router.navigate([searchable.includes(current) ? current : '/products'], { queryParams: { q } });
    this.close();
  }

  run(it: PaletteItem) {
    if (it.command) {
      this.command.emit(it.command);
      if (it.command !== 'density' && it.command !== 'theme') this.close();
      return;
    }
    if (it.route) this.router.navigate([it.route], { queryParams: it.queryParams || {} });
    this.close();
  }

  close() {
    this.closed.emit();
  }
}
