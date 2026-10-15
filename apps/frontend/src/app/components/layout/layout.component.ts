import { Component, inject, ViewChild, ElementRef, signal, computed, effect, HostListener, OnInit } from '@angular/core';
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
import { InventoryService } from '../../inventory.service';
import { Subject, of, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { SearchService, GlobalSearchResult } from '../../services/search.service';
import { Title } from '@angular/platform-browser';
import { I18nService, Lang, SUPPORTED_LANGS, TranslatePipe, AppDatePipe } from '../../i18n';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ModalComponent, TranslatePipe, AppDatePipe],
  template: `
    <div class="app-shell" [class.sidebar-collapsed]="isSidebarCollapsed()" [class.mobile-nav-open]="isMobileNavOpen()">
      <div class="sidebar-backdrop" (click)="isMobileNavOpen.set(false)"></div>
      <aside class="sidebar" [attr.aria-label]="'layout.group.main' | t">
        <div class="sidebar-inner">
          <div class="sidebar-logo">
            <a routerLink="/dashboard" class="brand">
              <span class="brand-mark" aria-hidden="true">e</span>
              <span class="brand-name">ecelon</span>
            </a>
            <button type="button" class="toggle-sidebar-btn" (click)="toggleSidebar()" [attr.title]="(isSidebarCollapsed() ? 'layout.showMenu' : 'layout.hideMenu') | t" [attr.aria-label]="(isSidebarCollapsed() ? 'layout.showMenu' : 'layout.hideMenu') | t">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [style.transform]="isSidebarCollapsed() ? 'rotate(180deg)' : 'none'"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>
            </button>
            <button type="button" class="topbar-icon-btn show-mobile" (click)="isMobileNavOpen.set(false)" [attr.aria-label]="'layout.closeMenu' | t">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          @if (!isSidebarCollapsed() || isMobileNavOpen()) {
            <div class="sidebar-search">
              <div class="sidebar-search-field">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input
                  #searchInput
                  type="text"
                  [attr.aria-label]="'layout.search.placeholder' | t: { shortcut: searchShortcut }"
                  [placeholder]="'layout.search.placeholder' | t: { shortcut: searchShortcut }"
                  [ngModel]="navbarSearchQuery()"
                  (ngModelChange)="onSearchQueryChange($event)"
                  (keyup.enter)="triggerNavbarSearch()"
                  (keydown.arrowdown)="onArrowDown($event)"
                  (keydown.arrowup)="onArrowUp($event)"
                  (focus)="onSearchFocus()"
                  (blur)="onSearchBlur()"
                />
                <kbd class="kbd hide-mobile">{{ searchShortcut }}</kbd>
              </div>
                <!-- Autocomplete suggestions floating dropdown overlay -->
                @if (isSearchFocused() && navbarSearchQuery().trim() !== '' && allVisibleSuggestions().length > 0) {
                  <div class="search-suggestions-dropdown">
                    
                    <!-- Section: Pages -->
                    @if (filteredSuggestionsByType('nav').length > 0) {
                      <div class="search-section">
                        <div class="search-section-header">
                          {{ 'layout.search.pages' | t }}
                        </div>
                        @for (s of filteredSuggestionsByType('nav'); track s.title) {
                          <div class="suggestion-item" 
                               [class.active]="isItemActive(s)"
                               (mousedown)="selectSuggestion(s); $event.preventDefault()"
                          >
                            <div class="suggestion-item-left">
                              <span class="suggestion-item-title" [innerHTML]="highlightMatch(s.title)"></span>
                            </div>
                            <span class="suggestion-item-category">{{ s.category }}</span>
                          </div>
                        }
                      </div>
                    }

                    <!-- Section: Actions -->
                    @if (filteredSuggestionsByType('action').length > 0) {
                      <div class="search-section">
                        <div class="search-section-header">
                          {{ 'layout.search.actions' | t }}
                        </div>
                        @for (s of filteredSuggestionsByType('action'); track s.title) {
                          <div class="suggestion-item" 
                               [class.active]="isItemActive(s)"
                               (mousedown)="selectSuggestion(s); $event.preventDefault()"
                          >
                            <div class="suggestion-item-left">
                              <span class="suggestion-item-title" style="color: var(--primary);" [innerHTML]="highlightMatch(s.title)"></span>
                            </div>
                            <span class="suggestion-badge action">{{ 'layout.search.trigger' | t }}</span>
                          </div>
                        }
                      </div>
                    }

                    <!-- Section: Database matches -->
                    @if (matchingInventory().length > 0) {
                      <div class="search-section">
                        <div class="search-section-header">
                          {{ 'layout.search.records' | t }}
                        </div>
                        @for (item of matchingInventory(); track item.type + '-' + (item.id || item.name)) {
                          <div class="suggestion-item" 
                               [class.active]="isItemActive(item)"
                               (mousedown)="selectSuggestion(item); $event.preventDefault()"
                          >
                            <div class="suggestion-item-left">
                              <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                <span class="suggestion-item-title" [innerHTML]="highlightMatch(item.name)"></span>
                                <span class="suggestion-item-subtitle">{{ item.subtitle }}</span>
                              </div>
                            </div>
                            <span class="suggestion-badge">{{ item.typeLabel }}</span>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
            </div>
          }

          <nav class="nav-list" (click)="isMobileNavOpen.set(false)">
            @if (!isSidebarCollapsed() || isMobileNavOpen()) {
              <div class="nav-group-label">{{ 'layout.group.main' | t }}</div>
            } @else {
              <div class="nav-group-divider"></div>
            }
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.dashboard' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
              <span class="nav-text">{{ 'layout.nav.dashboard' | t }}</span>
            </a>

            @if (!isSidebarCollapsed() || isMobileNavOpen()) {
              <div class="nav-group-label">{{ 'layout.group.stock' | t }}</div>
            } @else {
              <div class="nav-group-divider"></div>
            }
            <a routerLink="/products" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.products' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
              <span class="nav-text">{{ 'layout.nav.products' | t }}</span>
            </a>
            <a routerLink="/stock-movements" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.stockMovements' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
              <span class="nav-text">{{ 'layout.nav.stockMovements' | t }}</span>
            </a>
            <a routerLink="/stock-count" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.stockCount' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
              <span class="nav-text">{{ 'layout.nav.stockCount' | t }}</span>
            </a>
            <a routerLink="/warehouses" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.warehouses' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect x="6" y="10" width="12" height="12"/></svg>
              <span class="nav-text">{{ 'layout.nav.warehouses' | t }}</span>
            </a>

            @if (!isSidebarCollapsed() || isMobileNavOpen()) {
              <div class="nav-group-label">{{ 'layout.group.operations' | t }}</div>
            } @else {
              <div class="nav-group-divider"></div>
            }
            <a routerLink="/orders" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.orders' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              <span class="nav-text">{{ 'layout.nav.orders' | t }}</span>
            </a>
            <a routerLink="/customers" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.customers' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="nav-text">{{ 'layout.nav.customers' | t }}</span>
            </a>
            <a routerLink="/purchase-orders" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.purchaseOrders' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
              <span class="nav-text">{{ 'layout.nav.purchaseOrders' | t }}</span>
            </a>
            <a routerLink="/suppliers" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.suppliers' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
              <span class="nav-text">{{ 'layout.nav.suppliers' | t }}</span>
            </a>

            @if (!isSidebarCollapsed() || isMobileNavOpen()) {
              <div class="nav-group-label">{{ 'layout.group.system' | t }}</div>
            } @else {
              <div class="nav-group-divider"></div>
            }
            <a routerLink="/reports" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.reports' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
              <span class="nav-text">{{ 'layout.nav.reports' | t }}</span>
            </a>
            <a routerLink="/settings" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.settings' | t">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              <span class="nav-text">{{ 'layout.nav.settings' | t }}</span>
            </a>
            @if (currentUser().role === 'admin') {
              <a routerLink="/audit-log" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.auditLog' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                <span class="nav-text">{{ 'layout.nav.auditLog' | t }}</span>
              </a>
              <a routerLink="/integrations" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.integrations' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
                <span class="nav-text">{{ 'layout.nav.integrations' | t }}</span>
              </a>
            }
          </nav>
        </div>
      </aside>

      <div class="main-layout-wrapper">
        <header class="top-navbar">
          <div class="navbar-left">
            <button type="button" class="topbar-icon-btn mobile-menu-btn" (click)="isMobileNavOpen.set(true)" [attr.aria-label]="'layout.openMenu' | t">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
            </button>
            <nav class="breadcrumbs" [attr.aria-label]="'layout.breadcrumb' | t">
              <span class="hide-mobile">{{ getBreadcrumbs().category }}</span>
              <svg class="crumb-sep hide-mobile" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              <span class="crumb-current" aria-current="page">{{ getBreadcrumbs().page }}</span>
            </nav>
          </div>

          <div class="navbar-right">
            <div class="lang-switch" role="group" [attr.aria-label]="'common.language' | t">
              @for (l of languages; track l) {
                <button type="button"
                        (click)="changeLanguage(l)"
                        [disabled]="isLangSaving()"
                        [attr.aria-pressed]="i18n.lang() === l"
                        [attr.title]="('layout.lang.' + l) | t">
                  {{ l.toUpperCase() }}
                </button>
              }
            </div>

            <button type="button" class="topbar-icon-btn" (click)="theme.toggle()"
                    [attr.aria-label]="(theme.theme() === 'dark' ? 'layout.theme.toLight' : 'layout.theme.toDark') | t"
                    [attr.title]="(theme.theme() === 'dark' ? 'layout.theme.toLight' : 'layout.theme.toDark') | t">
              @if (theme.theme() === 'dark') {
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              } @else {
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              }
            </button>

            <div class="notification-widget">
              <button type="button" class="notif-btn" (click)="toggleNotifDropdown($event)" [attr.aria-label]="'layout.notifications.title' | t">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                @if (notifService.unreadCount() > 0) {
                  <span class="notif-badge">{{ notifService.unreadCount() }}</span>
                }
              </button>
              @if (isNotifOpen()) {
                <div class="notif-dropdown" (click)="$event.stopPropagation()">
                  <div class="notif-header">
                    <h4>{{ 'layout.notifications.title' | t }}</h4>
                    <div class="notif-actions">
                      @if (notifService.notifications().length > 0) {
                        <button class="notif-action-link" (click)="notifService.markAllAsRead()">{{ 'layout.notifications.markAllRead' | t }}</button>
                        <span class="divider">•</span>
                        <button class="notif-action-link" (click)="notifService.clearAll()">{{ 'layout.notifications.clear' | t }}</button>
                      }
                    </div>
                  </div>
                  <div class="notif-list">
                    @if (notifService.notifications().length === 0) {
                      <div class="notif-empty">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v2m16 4h-2a2 2 0 00-2 2v1a2 2 0 00-2 2H8a2 2 0 00-2-2v-1a2 2 0 00-2-2H2"/>
                        </svg>
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

            <span class="topbar-divider"></span>

            <div class="profile-widget" (click)="toggleProfileDropdown($event)">
              <div class="avatar-circle">
                @if (currentUser().avatar) {
                  <img [src]="currentUser().avatar" alt="" />
                } @else {
                  {{ currentUser().name.charAt(0) }}
                }
              </div>
              <div class="user-info">
                <span class="user-name">{{ 'layout.profile.greeting' | t: { name: currentUser().name } }}</span>
                <span class="user-role">
                  {{ 'layout.profile.account' | t }}
                  <svg class="dropdown-chevron" [class.open]="isProfileOpen()" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </span>
              </div>
              @if (isProfileOpen()) {
                <div class="profile-dropdown" (click)="$event.stopPropagation()">
                  <div class="dropdown-header">
                    <strong>{{ currentUser().name }}</strong>
                    <span>{{ currentUser().username }}</span>
                  </div>
                  <div class="dropdown-divider"></div>
                  <a routerLink="/settings" (click)="isProfileOpen.set(false)" class="dropdown-item">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    {{ 'layout.profile.settings' | t }}
                  </a>
                  <button (click)="doLogout(); isProfileOpen.set(false)" class="dropdown-item logout">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    {{ 'layout.profile.logout' | t }}
                  </button>
                </div>
              }
            </div>
          </div>
        </header>

        <main class="main-content">
          @if (ui.isReadonly()) {
            <div class="readonly-banner">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span><strong>{{ 'layout.demo.title' | t }}</strong> {{ 'layout.demo.message' | t }}</span>
            </div>
          }
          <router-outlet></router-outlet>
        </main>
      </div>

      @if (ui.confirmConfig()?.isDelete) {
        <app-modal [isOpen]="!!ui.confirmConfig()" [title]="''" [isDelete]="true" (onClose)="isConfirmLoading() ? null : ui.closeConfirm()">
          <div class="confirm-dialog">
            <div class="confirm-dialog-icon">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </div>
            <h3 class="confirm-dialog-title">{{ ui.confirmConfig()?.title }}</h3>
            <p class="confirm-dialog-text">{{ ui.confirmConfig()?.message }}</p>
          </div>
          <div footer class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="ui.closeConfirm()" [disabled]="isConfirmLoading()">
              {{ ui.confirmConfig()?.cancelText || ('layout.confirm.cancel' | t) }}
            </button>
            <button type="button" class="btn btn-danger" (click)="confirmGlobalAction()" [disabled]="isConfirmLoading()">
              @if (isConfirmLoading()) {
                <span class="spinner-sm spinner-light"></span> {{ 'layout.confirm.deleting' | t }}
              } @else {
                {{ ui.confirmConfig()?.confirmText || ('common.delete' | t) }}
              }
            </button>
          </div>
        </app-modal>
      } @else {
        <app-modal [isOpen]="!!ui.confirmConfig()" [title]="ui.confirmConfig()?.title || ''" (onClose)="ui.closeConfirm()">
          <p class="confirm-dialog-text">{{ ui.confirmConfig()?.message }}</p>
          <div footer class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="ui.closeConfirm()">{{ ui.confirmConfig()?.cancelText || ('layout.confirm.cancel' | t) }}</button>
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
  inventoryService = inject(InventoryService);
  searchService = inject(SearchService);
  i18n = inject(I18nService);
  private titleService = inject(Title);
  isConfirmLoading = signal(false);
  isLangSaving = signal(false);
  languages: Lang[] = SUPPORTED_LANGS;
  
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  searchShortcut = 'Ctrl+K';

  ngOnInit() {
    if (typeof window !== 'undefined') {
      const platform = navigator.platform || '';
      const userAgent = navigator.userAgent || '';
      const isMac = /mac/i.test(platform) || /mac/i.test(userAgent);
      this.searchShortcut = isMac ? '⌘K' : 'Ctrl+K';
    }
  }

  navbarSearchQuery = signal('');
  searchResults = signal<GlobalSearchResult | null>(null);
  private searchSubject = new Subject<string>();

  isSearchFocused = signal(false);
  activeIndex = signal<number>(-1);
  warehouses = signal<any[]>([]);
  suppliers = signal<any[]>([]);

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Ctrl+K or Cmd+K
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
        this.isSearchFocused.set(true);
      }
    }
  }

  onSearchQueryChange(val: string) {
    this.navbarSearchQuery.set(val);
    this.searchSubject.next(val);
  }

  private suggestionsSource = [
    {
      titleKey: 'layout.nav.warehouses',
      type: 'nav',
      categoryKey: 'layout.group.stock',
      route: '/warehouses',
      icon: '🏢',
      keywords: ['depo', 'yönetimi', 'warehouses', 'warehouse', 'depolar', 'şube', 'şubeler']
    },
    {
      titleKey: 'layout.nav.products',
      type: 'nav',
      categoryKey: 'layout.group.stock',
      route: '/products',
      icon: '📦',
      keywords: ['ürün', 'yönetimi', 'products', 'product', 'ürünler', 'stok', 'stoklar', 'malzeme']
    },
    {
      titleKey: 'layout.nav.stockMovements',
      type: 'nav',
      categoryKey: 'layout.group.stock',
      route: '/stock-movements',
      icon: '🔄',
      keywords: ['stok', 'hareketleri', 'giriş', 'çıkış', 'transfer', 'sevk', 'movements', 'movement', 'stock']
    },
    {
      titleKey: 'layout.nav.stockCount',
      type: 'nav',
      categoryKey: 'layout.group.stock',
      route: '/stock-count',
      icon: '📋',
      keywords: ['sayım', 'stok sayımı', 'count', 'inventory', 'envanter']
    },
    {
      titleKey: 'layout.nav.orders',
      type: 'nav',
      categoryKey: 'layout.group.operations',
      route: '/orders',
      icon: '🛒',
      keywords: ['sipariş', 'takibi', 'orders', 'order', 'sales', 'siparişler', 'müşteri', 'satış']
    },
    {
      titleKey: 'layout.nav.customers',
      type: 'nav',
      categoryKey: 'layout.group.operations',
      route: '/customers',
      icon: '👥',
      keywords: ['müşteri', 'müşteriler', 'customer', 'customers', 'client', 'cari', 'alıcı']
    },
    {
      titleKey: 'layout.nav.purchaseOrders',
      type: 'nav',
      categoryKey: 'layout.group.operations',
      route: '/purchase-orders',
      icon: '💳',
      keywords: ['satın', 'alma', 'purchase', 'po', 'tedarik', 'sipariş', 'procurement']
    },
    {
      titleKey: 'layout.nav.suppliers',
      type: 'nav',
      categoryKey: 'layout.group.operations',
      route: '/suppliers',
      icon: '🏭',
      keywords: ['tedarikçi', 'tedarikçiler', 'suppliers', 'supplier', 'vendor', 'üretici', 'satıcı']
    },
    {
      titleKey: 'layout.nav.reports',
      type: 'nav',
      categoryKey: 'layout.group.analytics',
      route: '/reports',
      icon: '📊',
      keywords: ['raporlar', 'analiz', 'reports', 'analytics', 'report', 'istatistik', 'grafik']
    },
    {
      titleKey: 'layout.nav.settings',
      type: 'nav',
      categoryKey: 'layout.group.analytics',
      route: '/settings',
      icon: '⚙️',
      keywords: ['ayarlar', 'settings', 'profile', 'security', 'password', 'language', 'profil', 'güvenlik', 'şifre']
    },
    {
      titleKey: 'layout.action.newOrder',
      type: 'action',
      categoryKey: 'layout.group.operations',
      route: '/orders',
      openParam: 'new',
      icon: '➕🛒',
      keywords: ['yeni', 'sipariş', 'oluştur', 'ekle', 'create', 'order', 'satış']
    },
    {
      titleKey: 'layout.action.newProduct',
      type: 'action',
      categoryKey: 'layout.group.stock',
      route: '/products',
      openParam: 'new',
      icon: '➕📦',
      keywords: ['yeni', 'ürün', 'ekle', 'create', 'product', 'stok']
    },
    {
      titleKey: 'layout.action.newWarehouse',
      type: 'action',
      categoryKey: 'layout.group.stock',
      route: '/warehouses',
      openParam: 'new',
      icon: '➕🏢',
      keywords: ['yeni', 'depo', 'tanımla', 'ekle', 'create', 'warehouse']
    },
    {
      titleKey: 'layout.action.newSupplier',
      type: 'action',
      categoryKey: 'layout.group.operations',
      route: '/suppliers',
      openParam: 'new',
      icon: '➕🏭',
      keywords: ['yeni', 'tedarikçi', 'ekle', 'create', 'supplier']
    },
    {
      titleKey: 'layout.action.newPurchaseOrder',
      type: 'action',
      categoryKey: 'layout.group.operations',
      route: '/purchase-orders',
      openParam: 'new',
      icon: '➕💳',
      keywords: ['yeni', 'satın', 'alma', 'siparişi', 'ekle', 'create', 'purchase', 'po']
    }
  ];

  /** Suggestions with titles/categories resolved in the active language. */
  suggestionsList = computed(() => this.suggestionsSource.map(s => ({
    ...s,
    title: this.i18n.t(s.titleKey),
    category: this.i18n.t(s.categoryKey)
  })));

  translateStatus(status: string): string {
    const keys: Record<string, string> = {
      'Completed': 'shared.orderStatus.completed',
      'Pending': 'shared.orderStatus.pending',
      'Cancelled': 'shared.orderStatus.cancelled',
      'Draft': 'shared.poStatus.draft',
      'Sent': 'shared.poStatus.sent',
      'Partially Received': 'shared.poStatus.partiallyReceived',
      'Received': 'shared.poStatus.received'
    };
    return keys[status] ? this.i18n.t(keys[status]) : status;
  }

  filteredSuggestions = computed(() => {
    const query = this.navbarSearchQuery().toLowerCase().trim();
    if (!query) {
      return this.suggestionsList();
    }
    return this.suggestionsList().filter(s =>
      s.title.toLowerCase().includes(query) ||
      s.category.toLowerCase().includes(query) ||
      s.keywords.some(k => k.toLowerCase().includes(query))
    );
  });

  filteredSuggestionsByType(type: 'nav' | 'action') {
    return this.filteredSuggestions().filter(s => s.type === type);
  }

  matchingInventory = computed(() => {
    const results = this.searchResults();
    if (!results) return [];

    const matches: any[] = [];

    // Match products
    if (results.products && results.products.length > 0) {
      results.products.forEach(p => {
        matches.push({
          id: p.id,
          name: p.name,
          type: 'product',
          typeLabel: this.i18n.t('layout.search.type.product'),
          subtitle: this.i18n.t('layout.search.productSubtitle', { sku: p.sku, qty: this.i18n.formatNumber(p.quantity), unit: p.unit || this.i18n.t('layout.search.unitDefault') }),
          icon: '📦',
          route: '/products',
          openParam: `edit-${p.id}`
        });
      });
    }

    // Match orders
    if (results.orders && results.orders.length > 0) {
      results.orders.forEach(o => {
        matches.push({
          id: o.id,
          name: o.orderNumber,
          type: 'order',
          typeLabel: this.i18n.t('layout.search.type.order'),
          subtitle: this.i18n.t('layout.search.orderSubtitle', { customer: o.customerName, total: this.i18n.formatMoney(o.totalAmount), status: this.translateStatus(o.status) }),
          icon: '🛒',
          route: '/orders',
          openParam: `edit-${o.id}`
        });
      });
    }

    // Match purchase orders
    if (results.purchaseOrders && results.purchaseOrders.length > 0) {
      results.purchaseOrders.forEach(po => {
        matches.push({
          id: po.id,
          name: po.poNumber,
          type: 'purchaseOrder',
          typeLabel: this.i18n.t('layout.search.type.purchaseOrder'),
          subtitle: this.i18n.t('layout.search.poSubtitle', { supplier: po.supplierName, total: this.i18n.formatMoney(po.totalAmount), status: this.translateStatus(po.status) }),
          icon: '💳',
          route: '/purchase-orders',
          openParam: `edit-${po.id}`
        });
      });
    }

    // Match warehouses
    if (results.warehouses && results.warehouses.length > 0) {
      results.warehouses.forEach(w => {
        matches.push({
          id: w.id,
          name: w.name,
          type: 'warehouse',
          typeLabel: this.i18n.t('layout.search.type.warehouse'),
          subtitle: this.i18n.t('layout.search.warehouseSubtitle', { code: w.code, address: [w.address?.district, w.address?.province].filter(Boolean).join(' / ') || '-' }),
          icon: '🏢',
          route: '/warehouses'
        });
      });
    }

    // Match suppliers
    if (results.suppliers && results.suppliers.length > 0) {
      results.suppliers.forEach(s => {
        matches.push({
          id: s.id,
          name: s.name,
          type: 'supplier',
          typeLabel: this.i18n.t('layout.search.type.supplier'),
          subtitle: this.i18n.t('layout.search.supplierSubtitle', { contact: s.contactPerson || '-', rating: s.rating }),
          icon: '🏭',
          route: '/suppliers'
        });
      });
    }

    return matches;
  });

  allVisibleSuggestions = computed(() => {
    const list: any[] = [];
    this.filteredSuggestionsByType('nav').forEach(s => list.push(s));
    this.filteredSuggestionsByType('action').forEach(s => list.push(s));
    this.matchingInventory().forEach(item => list.push(item));
    return list;
  });

  isItemActive(item: any): boolean {
    const list = this.allVisibleSuggestions();
    const idx = this.activeIndex();
    if (idx >= 0 && idx < list.length) {
      const active = list[idx];
      if (item.type === 'nav' || item.type === 'action') {
        return active.title === item.title && active.route === item.route;
      } else {
        return active.name === item.name && active.type === item.type;
      }
    }
    return false;
  }

  onArrowDown(event: Event) {
    event.preventDefault();
    const list = this.allVisibleSuggestions();
    if (list.length === 0) return;
    this.activeIndex.update(idx => idx < list.length - 1 ? idx + 1 : 0);
  }

  onArrowUp(event: Event) {
    event.preventDefault();
    const list = this.allVisibleSuggestions();
    if (list.length === 0) return;
    this.activeIndex.update(idx => idx > 0 ? idx - 1 : list.length - 1);
  }

  onSearchFocus() {
    this.isSearchFocused.set(true);
    this.activeIndex.set(-1);
    this.inventoryService.getWarehouses().subscribe(data => this.warehouses.set(data));
    this.inventoryService.getSuppliers().subscribe(data => this.suppliers.set(data));
  }

  onSearchBlur() {
    setTimeout(() => {
      this.isSearchFocused.set(false);
    }, 250);
  }

  triggerNavbarSearch() {
    const query = this.navbarSearchQuery().trim();
    const list = this.allVisibleSuggestions();
    const idx = this.activeIndex();

    // If a suggestion item is highlighted, execute that selection
    if (idx >= 0 && idx < list.length) {
      this.selectSuggestion(list[idx]);
      return;
    }

    if (query) {
      const currentUrl = this.router.url.split('?')[0];
      const searchableRoutes = ['/products', '/warehouses', '/suppliers', '/orders', '/purchase-orders', '/stock-movements'];
      let targetRoute = '/products'; // Default fallback

      if (searchableRoutes.includes(currentUrl)) {
        targetRoute = currentUrl;
      }

      this.router.navigate([targetRoute], { queryParams: { q: query } });
      this.isSearchFocused.set(false);
      this.navbarSearchQuery.set('');
      this.searchResults.set(null);
    }
  }

  selectSuggestion(suggestion: any) {
    this.isSearchFocused.set(false);
    this.activeIndex.set(-1);
    const queryParams: any = suggestion.openParam ? { open: suggestion.openParam } : {};
    this.router.navigate([suggestion.route], { queryParams });
    this.navbarSearchQuery.set('');
    this.searchResults.set(null);
  }

  highlightMatch(text: string): string {
    const query = this.navbarSearchQuery().toLowerCase().trim();
    if (!query) return text;
    const index = text.toLowerCase().indexOf(query);
    if (index === -1) return text;
    const originalText = text.substring(index, index + query.length);
    const regex = new RegExp(this.escapeRegExp(originalText), 'g');
    return text.replace(regex, `<strong style="color: #F08804; font-weight: 700;">$&</strong>`);
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  constructor() {
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) { this.currentUrl.set(e.urlAfterRedirects); this.isMobileNavOpen.set(false); }
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

    // Global Search Debounced Subscription
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 2) {
          return of(null);
        }
        return this.searchService.search(trimmed).pipe(
          catchError(err => {
            console.error('Global search error:', err);
            return of(null);
          })
        );
      })
    ).subscribe(results => {
      this.searchResults.set(results);
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
    localStorage.removeItem('smart_inventory_token');
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
