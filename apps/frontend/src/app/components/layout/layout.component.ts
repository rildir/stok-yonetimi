import { Component, inject, signal, computed, effect, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { ModalComponent } from '../modal.component';
import { AppStateService } from '../../services/app-state.service';
import { Title } from '@angular/platform-browser';
import { I18nService, Lang, SUPPORTED_LANGS, TranslatePipe, AppDatePipe } from '../../i18n';
import { ThemeService } from '../../services/theme.service';
import { EBelgeBannerComponent } from '../ebelge/ebelge-banner.component';
import { AcceptanceModalComponent } from '../kvkk/acceptance-modal.component';
import { NoticeTextComponent } from '../kvkk/notice-text.component';
import { KvkkService, PrivacyNotice } from '../../services/kvkk.service';
import { SessionService } from '../../services/session.service';
import { IconComponent } from '../shared/icon.component';
import { CommandPaletteComponent, PaletteCommand } from './command-palette.component';
import { NoticeCenterComponent } from './notice-center.component';
import { CREATE_ACTIONS, visibleSections } from './nav.config';

/**
 * App shell (Precision): 232px canvas sidebar (workspace, ⌘K trigger, sectioned nav, user row),
 * 48px topbar (breadcrumbs · compliance notice pill · TR/EN · theme · bell), scrolling main column,
 * mobile tab bar. Global shortcuts: ⌘K/Ctrl K palette · "/" page search · N then P/M/O/C/B/S/W create ·
 * ⇧T theme · Ctrl/⌘↵ submit the open drawer · Esc closes overlays.
 */
@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ModalComponent, TranslatePipe, AppDatePipe, EBelgeBannerComponent, AcceptanceModalComponent, NoticeTextComponent, IconComponent, CommandPaletteComponent, NoticeCenterComponent],
  template: `
    <div class="app-shell" [class.sidebar-collapsed]="isSidebarCollapsed()" [class.mobile-nav-open]="isMobileNavOpen()">
      <div class="sidebar-backdrop" (click)="isMobileNavOpen.set(false)"></div>

      <!-- ─── Sidebar ─── -->
      <aside class="sidebar" [attr.aria-label]="'layout.group.main' | t">
        <div class="sidebar-inner">
          <div class="sb-top">
            <a routerLink="/dashboard" class="ws" [attr.title]="companyName()">
              <span class="logo-mark" aria-hidden="true">{{ companyInitial() }}</span>
              <b>{{ companyName() }}</b>
            </a>
            <button type="button" class="toggle-sidebar-btn" (click)="toggleSidebar()" [attr.aria-label]="(isSidebarCollapsed() ? 'layout.showMenu' : 'layout.hideMenu') | t" [attr.title]="(isSidebarCollapsed() ? 'layout.showMenu' : 'layout.hideMenu') | t">
              <app-icon name="sidebar" />
            </button>
            <button type="button" class="topbar-icon-btn m-only" (click)="isMobileNavOpen.set(false)" [attr.aria-label]="'layout.closeMenu' | t">
              <app-icon name="x" />
            </button>
          </div>

          <button type="button" class="search-trigger" (click)="openPalette()" [attr.aria-label]="'layout.palette.trigger' | t">
            <app-icon name="search" size="sm" />
            <span class="st-label">{{ 'layout.palette.trigger' | t }}</span>
            <span class="kbd-group"><kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd>K</kbd></span>
          </button>

          <nav class="nav-list" (click)="isMobileNavOpen.set(false)">
            @for (sec of navSections(); track $index) {
              @if (sec.labelKey) {
                @if (!isSidebarCollapsed() || isMobileNavOpen()) {
                  <div class="nav-sec">{{ sec.labelKey | t }}</div>
                } @else {
                  <div class="nav-group-divider"></div>
                }
              }
              @for (item of sec.items; track item.route) {
                <a [routerLink]="item.route" routerLinkActive="is-active" ariaCurrentWhenActive="page" class="nav-item" [attr.title]="isSidebarCollapsed() ? (item.labelKey | t) : null">
                  <app-icon [name]="item.icon" />
                  <span class="lbl">{{ item.labelKey | t }}</span>
                </a>
              }
            }
          </nav>

          <div class="sb-foot">
            <button type="button" class="me" (click)="toggleProfileDropdown($event)" [attr.aria-expanded]="isProfileOpen()" aria-haspopup="menu">
              <span class="avatar">
                @if (currentUser().avatar) { <img [src]="currentUser().avatar" alt="" /> } @else { {{ initials() }} }
              </span>
              <span class="who"><b>{{ currentUser().name }}</b><span>{{ roleLabel() }}</span></span>
              <app-icon name="more" size="sm" />
            </button>
            @if (isProfileOpen()) {
              <div class="pop me-menu" role="menu" (click)="$event.stopPropagation()">
                <div class="dropdown-header"><strong>{{ currentUser().name }}</strong><span>{{ currentUser().username }}</span></div>
                <div class="menu-sep"></div>
                <a routerLink="/settings" class="menu-i" role="menuitem" (click)="isProfileOpen.set(false); isMobileNavOpen.set(false)"><app-icon name="settings" />{{ 'layout.profile.settings' | t }}</a>
                <button type="button" class="menu-i" role="menuitem" (click)="theme.toggle()">
                  <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />{{ (theme.theme() === 'dark' ? 'layout.theme.toLight' : 'layout.theme.toDark') | t }}<kbd>⇧T</kbd>
                </button>
                <button type="button" class="menu-i" role="menuitemcheckbox" [attr.aria-checked]="theme.density() === 'comfortable'" (click)="theme.toggleDensity()">
                  <app-icon name="rows" />{{ 'layout.density.comfortable' | t }}
                  <span class="meta">{{ (theme.density() === 'comfortable' ? 'layout.density.on' : 'layout.density.off') | t }}</span>
                </button>
                <button type="button" class="menu-i m-only" role="menuitem" (click)="changeLanguage(i18n.lang() === 'tr' ? 'en' : 'tr')">
                  <app-icon name="globe" />{{ 'common.language' | t }}<span class="meta">{{ i18n.lang().toUpperCase() }}</span>
                </button>
                <div class="menu-sep"></div>
                <button type="button" class="menu-i danger" role="menuitem" (click)="doLogout(); isProfileOpen.set(false)"><app-icon name="logout" />{{ 'layout.profile.logout' | t }}</button>
              </div>
            }
          </div>
        </div>
      </aside>

      <!-- ─── Main column ─── -->
      <div class="main-layout-wrapper">
        <header class="topbar">
          <button type="button" class="topbar-icon-btn m-only" (click)="isMobileNavOpen.set(true)" [attr.aria-label]="'layout.openMenu' | t">
            <app-icon name="menu" />
          </button>
          <nav class="crumbs d-only" [attr.aria-label]="'layout.breadcrumb' | t">
            <span>{{ getBreadcrumbs().category }}</span>
            <span class="sep" aria-hidden="true">/</span>
            <b aria-current="page">{{ getBreadcrumbs().page }}</b>
          </nav>
          <div class="mcrumb">
            <span class="logo-mark" aria-hidden="true">{{ companyInitial() }}</span>
            <b>{{ getBreadcrumbs().page }}</b>
          </div>
          <span class="spacer"></span>

          <span class="d-only"><app-notice-center mode="pill"></app-notice-center></span>

          <div class="lang-switch d-only" role="group" [attr.aria-label]="'common.language' | t">
            @for (l of languages; track l) {
              <button type="button" (click)="changeLanguage(l)" [disabled]="isLangSaving()" [attr.aria-pressed]="i18n.lang() === l" [attr.title]="('layout.lang.' + l) | t">{{ l.toUpperCase() }}</button>
            }
          </div>

          <button type="button" class="topbar-icon-btn m-only" (click)="openPalette()" [attr.aria-label]="'layout.palette.trigger' | t">
            <app-icon name="search" />
          </button>
          <button type="button" class="topbar-icon-btn d-only" (click)="theme.toggle()"
                  [attr.aria-label]="(theme.theme() === 'dark' ? 'layout.theme.toLight' : 'layout.theme.toDark') | t"
                  [attr.data-tip]="(theme.theme() === 'dark' ? 'layout.theme.toLight' : 'layout.theme.toDark') | t">
            <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
          </button>

          <div class="notification-widget">
            <button type="button" class="notif-btn" (click)="toggleNotifDropdown($event)" [attr.aria-expanded]="isNotifOpen()"
                    [attr.aria-label]="('layout.notifications.title' | t) + (notifService.unreadCount() > 0 ? ' (' + notifService.unreadCount() + ')' : '')">
              <app-icon name="bell" />
              @if (notifService.unreadCount() > 0) { <span class="notif-badge" aria-hidden="true"></span> }
            </button>
            @if (isNotifOpen()) {
              <div class="notif-dropdown" (click)="$event.stopPropagation()">
                <div class="m-only"><app-notice-center mode="inline"></app-notice-center></div>
                <div class="notif-header">
                  <h4>{{ 'layout.notifications.title' | t }}</h4>
                  <div class="notif-actions">
                    @if (notifService.notifications().length > 0) {
                      <button class="notif-action-link" (click)="notifService.markAllAsRead()">{{ 'layout.notifications.markAllRead' | t }}</button>
                      <span class="divider" aria-hidden="true">·</span>
                      <button class="notif-action-link" (click)="notifService.clearAll()">{{ 'layout.notifications.clear' | t }}</button>
                    }
                  </div>
                </div>
                <div class="notif-list">
                  @if (notifService.notifications().length === 0) {
                    <div class="notif-empty">
                      <app-icon name="inbox" size="lg" />
                      <span>{{ 'layout.notifications.empty' | t }}</span>
                    </div>
                  } @else {
                    @for (n of notifService.notifications(); track n.id) {
                      <div class="notif-item" [class.unread]="!n.read" (click)="notifService.markAsRead(n.id)">
                        <div class="notif-indicator" [class]="n.type"></div>
                        <div class="notif-content">
                          <p class="notif-message">{{ n.key ? i18n.t(n.key, n.params) : n.message }}</p>
                          <span class="notif-time">{{ n.createdAt | appDate: 'short' }}</span>
                        </div>
                      </div>
                    }
                  }
                </div>
              </div>
            }
          </div>
        </header>

        <main class="main-content" id="main">
          @if (ui.isReadonly()) {
            <div class="readonly-banner">
              <app-icon name="info" />
              @if (ui.isAuditor()) {
                <span><strong>{{ 'kvkk.auditor.title' | t }}</strong> {{ 'kvkk.auditor.message' | t }}</span>
              } @else {
                <span><strong>{{ 'layout.demo.title' | t }}</strong> {{ 'layout.demo.message' | t }}</span>
              }
            </div>
          }
          <app-ebelge-banner></app-ebelge-banner>
          <router-outlet></router-outlet>
          <footer class="app-legal-footer">
            <button type="button" class="link-btn" (click)="openNotice()">{{ 'kvkk.footer.notice' | t }}</button>
            <span aria-hidden="true">·</span>
            <button type="button" class="link-btn" (click)="openNotice('TOS')">{{ 'kvkk.footer.tos' | t }}</button>
          </footer>
        </main>
      </div>

      <!-- ─── Mobile tab bar ─── -->
      <nav class="tabbar" [attr.aria-label]="'layout.tabbar' | t">
        <a routerLink="/dashboard" routerLinkActive="is-active" ariaCurrentWhenActive="page"><app-icon name="home" />{{ 'layout.tab.overview' | t }}</a>
        <a routerLink="/products" routerLinkActive="is-active" ariaCurrentWhenActive="page"><app-icon name="box" />{{ 'layout.tab.products' | t }}</a>
        <a routerLink="/stock-movements" routerLinkActive="is-active" ariaCurrentWhenActive="page"><app-icon name="swap" />{{ 'layout.tab.movements' | t }}</a>
        <a routerLink="/orders" routerLinkActive="is-active" ariaCurrentWhenActive="page"><app-icon name="bag" />{{ 'layout.tab.orders' | t }}</a>
        <button type="button" (click)="isMobileNavOpen.set(true)" [attr.aria-label]="'layout.openMenu' | t"><app-icon name="more" />{{ 'layout.tab.more' | t }}</button>
      </nav>

      @if (paletteOpen()) {
        <app-command-palette [role]="currentUser().role" [isDark]="theme.theme() === 'dark'" (closed)="paletteOpen.set(false)" (command)="onPaletteCommand($event)"></app-command-palette>
      }

      <app-acceptance-modal></app-acceptance-modal>
      @if (noticeOpen()) {
        <app-modal [isOpen]="true" size="lg" [title]="noticeOpen()?.title || ('kvkk.footer.notice' | t)" (onClose)="noticeOpen.set(null)">
          <p class="notice-meta">{{ 'kvkk.notice.version' | t }} <span class="mono">{{ noticeOpen()?.version }}</span> · {{ noticeOpen()?.publishedAt | appDate }}</p>
          <app-notice-text [text]="noticeOpen()?.body"></app-notice-text>
          <div footer class="modal-actions"><button type="button" class="btn btn-primary" (click)="noticeOpen.set(null)">{{ 'common.close' | t }}</button></div>
        </app-modal>
      }

      @if (ui.confirmConfig()?.isDelete) {
        <app-modal [isOpen]="!!ui.confirmConfig()" [title]="''" [isDelete]="true" size="sm" (onClose)="isConfirmLoading() ? null : ui.closeConfirm()">
          <div class="confirm-dialog">
            <div class="confirm-dialog-icon"><app-icon name="trash" /></div>
            <h3 class="confirm-dialog-title">{{ ui.confirmConfig()?.title }}</h3>
            <p class="confirm-dialog-text">{{ ui.confirmConfig()?.message }}</p>
          </div>
          <div footer class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="ui.closeConfirm()" [disabled]="isConfirmLoading()">
              {{ ui.confirmConfig()?.cancelText || ('layout.confirm.cancel' | t) }}
            </button>
            <button type="button" class="btn btn-danger" [class.is-loading]="isConfirmLoading()" (click)="confirmGlobalAction()" [attr.aria-busy]="isConfirmLoading() || null">
              <span>{{ ui.confirmConfig()?.confirmText || ('common.delete' | t) }}</span>
            </button>
          </div>
        </app-modal>
      } @else {
        <app-modal [isOpen]="!!ui.confirmConfig()" [title]="ui.confirmConfig()?.title || ''" (onClose)="ui.closeConfirm()">
          <p class="confirm-dialog-text">{{ ui.confirmConfig()?.message }}</p>
          <div footer class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="ui.closeConfirm()">{{ ui.confirmConfig()?.cancelText || ('layout.confirm.cancel' | t) }}</button>
            <button type="button" class="btn btn-primary" (click)="confirmGlobalAction()">{{ ui.confirmConfig()?.confirmText || ('common.confirm' | t) }}</button>
          </div>
        </app-modal>
      }
    </div>
  `
})
export class LayoutComponent implements OnInit {
  ui = inject(UiStateService);
  router = inject(Router);
  socketService = inject(SocketService);
  http = inject(HttpClient);
  state = inject(AppStateService);
  i18n = inject(I18nService);
  private titleService = inject(Title);
  isConfirmLoading = signal(false);
  isLangSaving = signal(false);
  languages: Lang[] = SUPPORTED_LANGS;

  isMac = false;
  paletteOpen = signal(false);
  private chordN = false;
  private chordTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    if (typeof window !== 'undefined') {
      const platform = navigator.platform || '';
      const userAgent = navigator.userAgent || '';
      this.isMac = /mac/i.test(platform) || /mac/i.test(userAgent);
    }
  }

  navSections = computed(() => visibleSections(this.currentUser().role));
  companyName = computed(() => this.ui.userProfile()?.company?.name || 'ecelon');
  companyInitial = computed(() => (this.companyName().trim().charAt(0) || 'e').toLocaleUpperCase(this.i18n.locale()));
  initials = computed(() => {
    const parts = String(this.currentUser().name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.charAt(0) || '') + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toLocaleUpperCase(this.i18n.locale());
  });
  roleLabel = computed(() => {
    const role = this.currentUser().role;
    const key = 'layout.role.' + role;
    const t = this.i18n.t(key);
    return t === key ? role : t;
  });

  openPalette() {
    this.isMobileNavOpen.set(false);
    this.isProfileOpen.set(false);
    this.isNotifOpen.set(false);
    this.paletteOpen.set(true);
  }

  onPaletteCommand(c: PaletteCommand) {
    if (c === 'theme') this.theme.toggle();
    else if (c === 'density') this.theme.toggleDensity();
    else if (c === 'lang') this.changeLanguage(this.i18n.lang() === 'tr' ? 'en' : 'tr');
    else if (c === 'logout') this.doLogout();
  }

  private static isTyping(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    // ⌘K / Ctrl K — command palette
    if (mod && key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.paletteOpen()) this.paletteOpen.set(false);
      else this.openPalette();
      return;
    }
    // ⌘↵ / Ctrl ↵ — submit the open drawer (clicks its primary button)
    if (mod && key === 'Enter' && !this.paletteOpen() && typeof document !== 'undefined') {
      const btn = document.querySelector<HTMLButtonElement>('.drawer-footer .btn-primary:not(:disabled), .drawer-f .btn-primary:not(:disabled)');
      if (btn) {
        event.preventDefault();
        btn.click();
      }
      return;
    }
    if (mod || event.altKey || this.paletteOpen() || LayoutComponent.isTyping(event.target)) return;
    if (typeof document !== 'undefined' && document.querySelector('.drawer-overlay, .drawer, .scrim, .modal-backdrop, .acc-overlay')) return;

    // "/" — focus the page's search field
    if (key === '/') {
      const el = Array.from(document.querySelectorAll<HTMLInputElement>('.main-content [data-page-search], .main-content .search-box input, .main-content .toolbar .field input[type="search"], .main-content input[type="search"]'))
        .find((i) => i.offsetParent !== null && !i.disabled);
      if (el) {
        event.preventDefault();
        el.focus();
        el.select?.();
      }
      return;
    }
    // ⇧T — theme
    if (key === 'T' && event.shiftKey) {
      event.preventDefault();
      this.theme.toggle();
      return;
    }
    // N then <key> — create
    if (this.chordN) {
      this.chordN = false;
      if (this.chordTimer) clearTimeout(this.chordTimer);
      const action = CREATE_ACTIONS.find((a) => a.key === key.toUpperCase());
      if (action) {
        event.preventDefault();
        this.router.navigate([action.route], { queryParams: { open: 'new' } });
      }
      return;
    }
    if ((key === 'n' || key === 'N') && !event.shiftKey) {
      this.chordN = true;
      if (this.chordTimer) clearTimeout(this.chordTimer);
      this.chordTimer = setTimeout(() => (this.chordN = false), 1200);
    }
  }

  confirmGlobalAction() {
    const config = this.ui.confirmConfig();
    if (!config) return;

    if (config.onConfirm) {
      const result = config.onConfirm();
      if (result instanceof Promise) {
        this.isConfirmLoading.set(true);
        result.then(() => {
          this.isConfirmLoading.set(false);
          this.ui.confirmConfig.set(null);
        }).catch(() => {
          this.isConfirmLoading.set(false);
        });
      } else if (result && typeof result.subscribe === 'function') {
        this.isConfirmLoading.set(true);
        result.subscribe({
          next: () => {
            this.isConfirmLoading.set(false);
            this.ui.confirmConfig.set(null);
          },
          error: () => {
            this.isConfirmLoading.set(false);
          }
        });
      } else {
        this.ui.closeConfirm();
      }
    } else {
      this.ui.closeConfirm();
    }
  }

  /** Current router URL as a signal (used for the document title). */
  private currentUrl = signal(this.router.url);

  changeLanguage(lang: Lang) {
    if (this.isLangSaving() || this.i18n.lang() === lang) return;
    const previous = this.i18n.lang();
    this.i18n.setLanguage(lang);
    const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
    if (!token) return;
    this.isLangSaving.set(true);
    this.http.put(`${environment.apiUrl}/user/profile`, { language: lang }).subscribe({
      next: () => {
        this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
          next: (profile: any) => {
            this.ui.userProfile.set(profile);
            this.i18n.applyLocale(profile?.locale);
            this.isLangSaving.set(false);
          },
          error: () => this.isLangSaving.set(false)
        });
      },
      error: () => {
        this.isLangSaving.set(false);
        this.i18n.setLanguage(previous);
        this.ui.showToast(this.i18n.t('layout.lang.saveError'), 'error');
      }
    });
  }

  private session = inject(SessionService);
  private kvkkApi = inject(KvkkService);
  /** Footer: privacy notice / terms in a modal. */
  noticeOpen = signal<PrivacyNotice | null>(null);

  openNotice(docType: 'PRIVACY' | 'TOS' = 'PRIVACY') {
    const lang = this.i18n.lang();
    const req = docType === 'PRIVACY' ? this.kvkkApi.currentNotice('EMPLOYEE', lang) : this.kvkkApi.publicNotice(docType, lang);
    req.subscribe({ next: (n) => this.noticeOpen.set(n), error: () => this.ui.showToast(this.i18n.t('kvkk.error'), 'error') });
  }

  constructor() {
    // WP7: close the session after inactivity (the server refuses the refresh after the same time).
    this.session.onIdleLogout = () => {
      this.socketService.disconnect();
      this.ui.userProfile.set(null);
      this.ui.showToast(this.i18n.t('kvkk.session.idleLogout'), 'info');
    };
    this.session.startIdleWatch();
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) { this.currentUrl.set(e.urlAfterRedirects); this.isMobileNavOpen.set(false); this.paletteOpen.set(false); }
    });

    const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
    if (token) {
      this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
        next: (profile: any) => {
          this.ui.userProfile.set(profile);
          this.i18n.applyLocale(profile?.locale);
        },
        error: () => {}
      });
    }

    // Keep the browser tab title in sync with the active page + language
    effect(() => {
      this.i18n.lang();
      this.currentUrl();
      this.titleService.setTitle(this.i18n.t('layout.documentTitle', { page: this.getActivePageTitle() }));
    });
  }

  notifService = inject(NotificationService);
  isSidebarCollapsed = signal(false);
  isMobileNavOpen = signal(false);
  theme = inject(ThemeService);
  isProfileOpen = signal(false);
  isNotifOpen = signal(false);

  toggleSidebar() {
    this.isSidebarCollapsed.update(v => !v);
  }

  toggleProfileDropdown(event: Event) {
    event.stopPropagation();
    this.isProfileOpen.update(v => !v);
    this.isNotifOpen.set(false);
  }

  toggleNotifDropdown(event: Event) {
    event.stopPropagation();
    this.isNotifOpen.update(v => !v);
    this.isProfileOpen.set(false);
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.isProfileOpen.set(false);
    this.isNotifOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeOnEscape() {
    this.isProfileOpen.set(false);
    this.isNotifOpen.set(false);
    this.isMobileNavOpen.set(false);
  }

  currentUser = computed(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
    if (!token) return { username: this.i18n.t('layout.guest'), role: 'guest', name: this.i18n.t('layout.guestUser'), avatar: null };
    try {
      const profile = this.ui.userProfile();
      if (profile) {
        return {
          username: profile.username,
          role: profile.role,
          name: profile.fullName,
          avatar: profile.avatar
        };
      }

      const payloadBase64 = token.split('.')[1];
      const payloadJson = decodeURIComponent(atob(payloadBase64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(payloadJson);
      return {
        username: payload.username,
        role: payload.role,
        name: payload.username === 'admin' ? 'Ahmet Ildır' :
              payload.username === 'manager' ? this.i18n.t('layout.demoManager') :
              payload.username === 'viewer' ? this.i18n.t('layout.demoViewer') : payload.username,
        avatar: null
      };
    } catch (e) {
      return { username: 'admin', role: 'admin', name: 'Ahmet Ildır', avatar: null };
    }
  });

  getActivePageTitle(): string {
    const url = this.router.url;
    if (url.includes('/dashboard')) return this.i18n.t('layout.nav.dashboard');
    if (url.includes('/invoices')) return this.i18n.t('layout.nav.invoices');
    if (url.includes('/despatches')) return this.i18n.t('layout.nav.despatches');
    if (url.includes('/goods-receipts')) return this.i18n.t('layout.nav.goodsReceipts');
    if (url.includes('/returns')) return this.i18n.t('layout.nav.returns');
    if (url.includes('/expense-vouchers')) return this.i18n.t('layout.nav.expenseVouchers');
    if (url.includes('/disposals')) return this.i18n.t('layout.nav.disposals');
    if (url.includes('/inbox')) return this.i18n.t('layout.nav.inbox');
    if (url.includes('/products')) return this.i18n.t('layout.nav.products');
    if (url.includes('/stock-movements')) return this.i18n.t('layout.nav.stockMovements');
    if (url.includes('/suppliers')) return this.i18n.t('layout.nav.suppliers');
    if (url.includes('/customers')) return this.i18n.t('layout.nav.customers');
    if (url.includes('/purchase-orders')) return this.i18n.t('layout.nav.purchaseOrders');
    if (url.includes('/orders')) return this.i18n.t('layout.nav.orders');
    if (url.includes('/reports')) return this.i18n.t('layout.nav.reportsAnalytics');
    if (url.includes('/stock-count')) return this.i18n.t('layout.nav.stockCount');
    if (url.includes('/warehouses')) return this.i18n.t('layout.nav.warehouses');
    if (url.includes('/settings')) return this.i18n.t('layout.nav.settings');
    if (url.includes('/audit-log')) return this.i18n.t('layout.nav.auditLog');
    if (url.includes('/integrations')) return this.i18n.t('layout.nav.integrations');
    return 'Ecelon';
  }

  getBreadcrumbs(): { category: string; page: string } {
    const url = this.router.url;
    if (url.includes('/dashboard')) return { category: this.i18n.t('layout.group.general'), page: this.i18n.t('layout.nav.dashboard') };
    if (url.includes('/invoices')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.invoices') };
    if (url.includes('/despatches')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.despatches') };
    if (url.includes('/goods-receipts')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.goodsReceipts') };
    if (url.includes('/returns')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.returns') };
    if (url.includes('/expense-vouchers')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.expenseVouchers') };
    if (url.includes('/disposals')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.disposals') };
    if (url.includes('/inbox')) return { category: this.i18n.t('layout.group.documents'), page: this.i18n.t('layout.nav.inbox') };
    if (url.includes('/products')) return { category: this.i18n.t('layout.group.stock'), page: this.i18n.t('layout.nav.products') };
    if (url.includes('/stock-movements')) return { category: this.i18n.t('layout.group.stock'), page: this.i18n.t('layout.nav.stockMovements') };
    if (url.includes('/stock-count')) return { category: this.i18n.t('layout.group.stock'), page: this.i18n.t('layout.nav.stockCount') };
    if (url.includes('/warehouses')) return { category: this.i18n.t('layout.group.stock'), page: this.i18n.t('layout.nav.warehouses') };
    if (url.includes('/customers')) return { category: this.i18n.t('layout.group.operations'), page: this.i18n.t('layout.nav.customers') };
    if (url.includes('/orders')) return { category: this.i18n.t('layout.group.operations'), page: this.i18n.t('layout.nav.orders') };
    if (url.includes('/purchase-orders')) return { category: this.i18n.t('layout.group.operations'), page: this.i18n.t('layout.nav.purchaseOrders') };
    if (url.includes('/suppliers')) return { category: this.i18n.t('layout.group.operations'), page: this.i18n.t('layout.nav.suppliers') };
    if (url.includes('/reports')) return { category: this.i18n.t('layout.group.analytics'), page: this.i18n.t('layout.nav.reports') };
    if (url.includes('/settings')) return { category: this.i18n.t('layout.group.analytics'), page: this.i18n.t('layout.nav.settings') };
    if (url.includes('/audit-log')) return { category: this.i18n.t('layout.group.system'), page: this.i18n.t('layout.nav.auditLog') };
    if (url.includes('/integrations')) return { category: this.i18n.t('layout.group.system'), page: this.i18n.t('layout.nav.integrations') };
    return { category: this.i18n.t('layout.group.system'), page: this.i18n.t('layout.nav.panel') };
  }

  doLogout() {
    this.session.logout();
    this.socketService.disconnect();
    this.ui.showToast(this.i18n.t('layout.loggedOut'), 'info');
    this.router.navigate(['/login']);
  }

  copyShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.ui.showToast(this.i18n.t('layout.linkCopied'), 'success');
    }).catch(() => {
      this.ui.showToast(this.i18n.t('layout.linkCopyError'), 'error');
    });
  }
}
