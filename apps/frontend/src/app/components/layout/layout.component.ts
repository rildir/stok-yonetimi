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

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ModalComponent, TranslatePipe, AppDatePipe],
  template: `
    <div class="app-shell" [class.sidebar-collapsed]="isSidebarCollapsed()">
      <aside class="sidebar">
        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; width: 100%; overflow: hidden;">
          <div>
            <div class="sidebar-logo" style="justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                @if (!isSidebarCollapsed()) {
                  <div class="logo-text" style="display: flex; flex-direction: column;">
                    <h2 style="font-family: var(--font-heading); font-size: 0.95rem; font-weight: 800; color: #0F172A; margin: 0; line-height: 1.1;">ecelon</h2>
                  </div>
                } @else {
                  <span style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 900; color: #0F172A; padding-left: 2px;">e</span>
                }
              </div>
              <button class="toggle-sidebar-btn" (click)="toggleSidebar()" [attr.title]="(isSidebarCollapsed() ? 'layout.showMenu' : 'layout.hideMenu') | t" style="border: 1px solid #E2E8F0; border-radius: 50%; width: 28px; height: 28px; background: #FFFFFF; color: #64748B; display: flex; align-items: center; justify-content: center; margin: 0;">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" [style.transform]="isSidebarCollapsed() ? 'rotate(180deg)' : 'none'" style="transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
              </button>
            </div>
            
            <!-- Sidebar Search Input matching Mockup -->
            @if (!isSidebarCollapsed()) {
              <div style="padding: 12px 16px 4px 16px; position: relative;">
                <div style="display: flex; align-items: center; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC; padding: 6px 12px; gap: 8px; height: 38px;">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #64748B; stroke-width: 2.5;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input 
                    #searchInput
                    type="text" 
                    style="border: none; background: transparent; outline: none; font-size: 0.82rem; color: #0F172A; width: 100%; font-family: var(--font-body);"
                    [placeholder]="'layout.search.placeholder' | t: { shortcut: searchShortcut }" 
                    [ngModel]="navbarSearchQuery()" 
                    (ngModelChange)="onSearchQueryChange($event)"
                    (keyup.enter)="triggerNavbarSearch()"
                    (keydown.arrowdown)="onArrowDown($event)"
                    (keydown.arrowup)="onArrowUp($event)"
                    (focus)="onSearchFocus()"
                    (blur)="onSearchBlur()"
                  />
                  <kbd style="font-size: 0.65rem; color: #94A3B8; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 1px 4px; border-radius: 4px; font-family: var(--font-mono); pointer-events: none;">{{ searchShortcut }}</kbd>
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
            <nav class="nav-list">
              <!-- GENEL -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">{{ 'layout.group.main' | t }}</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a routerLink="/dashboard" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.dashboard' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"/></svg>
                <span class="nav-text">{{ 'layout.nav.dashboard' | t }}</span>
              </a>

              <!-- STOK YÖNETİMİ -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">{{ 'layout.group.stock' | t }}</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a routerLink="/products" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.products' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                <span class="nav-text">{{ 'layout.nav.products' | t }}</span>
              </a>
              <a routerLink="/stock-movements" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.stockMovements' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                <span class="nav-text">{{ 'layout.nav.stockMovements' | t }}</span>
              </a>
              <a routerLink="/stock-count" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.stockCount' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span class="nav-text">{{ 'layout.nav.stockCount' | t }}</span>
              </a>
              <a routerLink="/warehouses" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.warehouses' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span class="nav-text">{{ 'layout.nav.warehouses' | t }}</span>
              </a>

              <!-- OPERASYONLAR -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">{{ 'layout.group.operations' | t }}</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a routerLink="/orders" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.orders' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                <span class="nav-text">{{ 'layout.nav.orders' | t }}</span>
              </a>
              <a routerLink="/customers" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.customers' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                <span class="nav-text">{{ 'layout.nav.customers' | t }}</span>
              </a>
              <a routerLink="/purchase-orders" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.purchaseOrders' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                <span class="nav-text">{{ 'layout.nav.purchaseOrders' | t }}</span>
              </a>
              <a routerLink="/suppliers" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.suppliers' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                <span class="nav-text">{{ 'layout.nav.suppliers' | t }}</span>
              </a>

              <!-- SİSTEM -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">{{ 'layout.group.system' | t }}</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a routerLink="/reports" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.reports' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                <span class="nav-text">{{ 'layout.nav.reports' | t }}</span>
              </a>
              <a routerLink="/settings" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.settings' | t">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span class="nav-text">{{ 'layout.nav.settings' | t }}</span>
              </a>
              @if (currentUser().role === 'admin') {
                <a routerLink="/audit-log" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.auditLog' | t">
                  <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                  <span class="nav-text">{{ 'layout.nav.auditLog' | t }}</span>
                </a>
                <a routerLink="/integrations" routerLinkActive="active" class="nav-btn" [title]="'layout.nav.integrations' | t">
                  <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                  <span class="nav-text">{{ 'layout.nav.integrations' | t }}</span>
                </a>
              }
            </nav>
          </div>
        </div>
      </aside>

      <div class="main-layout-wrapper">
        <header class="top-navbar">
          <div class="navbar-left">
            <h1 style="font-size: 1.45rem; font-weight: 700; color: #0F172A; font-family: var(--font-heading); margin: 0; letter-spacing: -0.025em;">
              {{ getBreadcrumbs().page }}
            </h1>
          </div>

          <div class="navbar-right" style="gap: 1.25rem;">
            <!-- Language switcher (TR / EN) -->
            <div class="lang-switch" role="group" [attr.aria-label]="'common.language' | t" style="display: flex; align-items: center; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC; padding: 2px; gap: 2px;">
              @for (l of languages; track l) {
                <button type="button"
                        (click)="changeLanguage(l)"
                        [disabled]="isLangSaving()"
                        [attr.aria-pressed]="i18n.lang() === l"
                        [attr.title]="('layout.lang.' + l) | t"
                        [style.background]="i18n.lang() === l ? '#FFFFFF' : 'transparent'"
                        [style.color]="i18n.lang() === l ? '#0F172A' : '#64748B'"
                        [style.box-shadow]="i18n.lang() === l ? '0 1px 2px rgba(15,23,42,0.08)' : 'none'"
                        style="border: none; border-radius: 6px; padding: 4px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); letter-spacing: 0.03em; transition: all 0.2s;">
                  {{ l.toUpperCase() }}
                </button>
              }
            </div>

            <!-- Shopping Cart styled Notification Widget -->
            <div class="notification-widget">
              <button class="notif-btn" (click)="toggleNotifDropdown($event)" [attr.aria-label]="'layout.notifications.title' | t">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                @if (notifService.unreadCount() > 0) {
                  <span class="notif-badge" style="border: 2px solid #FFFFFF;">{{ notifService.unreadCount() }}</span>
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

            <!-- Avatars stack + Invite button from mockup -->
            <div style="display: flex; align-items: center; margin-right: -4px;">
              <div style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid #FFFFFF; background: #E2E8F0; overflow: hidden; margin-right: -8px; z-index: 3;"><img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" style="width: 100%; height: 100%; object-fit: cover;"/></div>
              <div style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid #FFFFFF; background: #CBD5E1; overflow: hidden; margin-right: -8px; z-index: 2;"><img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" style="width: 100%; height: 100%; object-fit: cover;"/></div>
              <div style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid #FFFFFF; background: #FF5A1F; color: #FFFFFF; font-size: 0.65rem; font-weight: bold; display: flex; align-items: center; justify-content: center; margin-right: -8px; z-index: 1;">+3</div>
              <button style="width: 28px; height: 28px; border-radius: 50%; border: 1.5px dashed #CBD5E1; background: #FFFFFF; color: #64748B; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-left: 12px; transition: all 0.2s;" onmouseover="this.style.borderColor='#94A3B8'; this.style.color='#0F172A'" onmouseout="this.style.borderColor='#CBD5E1'; this.style.color='#64748B'"><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg></button>
            </div>

            <!-- Profile Widget -->
            <div class="profile-widget" (click)="toggleProfileDropdown($event)">
              <div class="avatar-circle">
                @if (currentUser().avatar) {
                  <img [src]="currentUser().avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                } @else {
                  {{ currentUser().name.charAt(0) }}
                }
              </div>
              <div class="user-info">
                <span class="user-name">{{ 'layout.profile.greeting' | t: { name: currentUser().name } }}</span>
                <span class="user-role" style="display: flex; align-items: center; gap: 2px;">
                  {{ 'layout.profile.account' | t }}
                  <svg class="dropdown-chevron" [class.open]="isProfileOpen()" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"/>
                  </svg>
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
            <div style="background: #FFFBEB; border: 1px solid #FCD34D; color: #92400E; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; font-size: 0.84rem; font-weight: 500;">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="color: #F59E0B; flex-shrink: 0;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span><strong>{{ 'layout.demo.title' | t }}</strong> {{ 'layout.demo.message' | t }}</span>
            </div>
          }
          <router-outlet></router-outlet>
        </main>
      </div>


      @if (ui.confirmConfig()?.isDelete) {
        <app-modal [isOpen]="!!ui.confirmConfig()" [title]="''" [isDelete]="true" (onClose)="isConfirmLoading() ? null : ui.closeConfirm()">
          <div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 8px 0;">
            <!-- Red background circle trash icon -->
            <div style="width: 48px; height: 48px; border-radius: 50%; background-color: #FEE2E2; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #DC2626;">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            
            <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">{{ ui.confirmConfig()?.title }}</h3>
            
            <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0;">
              {{ ui.confirmConfig()?.message }}
            </p>
          </div>
          <div footer style="display: flex; gap: 8px; justify-content: flex-end; width: 100%;">
            <!-- Sol: Vazgeç - ghost/outline, nötr renk -->
            <button class="btn btn-outline" 
                    (click)="ui.closeConfirm()" 
                    [disabled]="isConfirmLoading()"
                    style="border: 1px solid #D1D5DB; background: transparent; color: #4B5563; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer;">
              {{ ui.confirmConfig()?.cancelText || ('layout.confirm.cancel' | t) }}
            </button>
            <!-- Sağ: Sil - dolu, kırmızı/danger renk -->
            <button class="btn" 
                    (click)="confirmGlobalAction()" 
                    [disabled]="isConfirmLoading()"
                    style="background-color: #DC2626; color: #FFFFFF; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              @if (isConfirmLoading()) {
                <span class="spinner-sm spinner-light" style="width: 14px; height: 14px; border-width: 2px;"></span> {{ 'layout.confirm.deleting' | t }}
              } @else {
                {{ ui.confirmConfig()?.confirmText || ('common.delete' | t) }}
              }
            </button>
          </div>
        </app-modal>
      } @else {
        <app-modal [isOpen]="!!ui.confirmConfig()" [title]="ui.confirmConfig()?.title || ''" (onClose)="ui.closeConfirm()">
          <div style="font-size: 14px; line-height: 1.5; color: var(--text-primary);">
            {{ ui.confirmConfig()?.message }}
          </div>
          <div footer style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" (click)="ui.closeConfirm()">{{ ui.confirmConfig()?.cancelText || ('layout.confirm.cancel' | t) }}</button>
            <button class="btn btn-primary" (click)="confirmGlobalAction()">{{ ui.confirmConfig()?.confirmText || ('common.confirm' | t) }}</button>
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
          subtitle: this.i18n.t('layout.search.warehouseSubtitle', { code: w.code, address: w.address || '-' }),
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
      if (e instanceof NavigationEnd) this.currentUrl.set(e.urlAfterRedirects);
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
