import { Component, inject, ViewChild, ElementRef, signal, computed, HostListener, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
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

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ModalComponent],
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
                    <span style="font-size: 0.65rem; color: #64748B; margin-top: 1px; display: block;">{{ ui.subscription().plan === 'ultra' ? 'Ultra Plan' : ui.subscription().plan === 'professional' ? 'Profesyonel Plan' : ui.subscription().plan === 'standard' ? 'Standart Plan' : 'Ücretsiz Plan' }}</span>
                  </div>
                } @else {
                  <span style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 900; color: #0F172A; padding-left: 2px;">e</span>
                }
              </div>
              <button class="toggle-sidebar-btn" (click)="toggleSidebar()" [attr.title]="isSidebarCollapsed() ? 'Menüyü Göster' : 'Menüyü Gizle'" style="border: 1px solid #E2E8F0; border-radius: 50%; width: 28px; height: 28px; background: #FFFFFF; color: #64748B; display: flex; align-items: center; justify-content: center; margin: 0;">
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
                    placeholder="Ara... (Ctrl+K)" 
                    [ngModel]="navbarSearchQuery()" 
                    (ngModelChange)="onSearchQueryChange($event)"
                    (keyup.enter)="triggerNavbarSearch()"
                    (keydown.arrowdown)="onArrowDown($event)"
                    (keydown.arrowup)="onArrowUp($event)"
                    (focus)="onSearchFocus()"
                    (blur)="onSearchBlur()"
                  />
                  <kbd style="font-size: 0.65rem; color: #94A3B8; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 1px 4px; border-radius: 4px; font-family: var(--font-mono); pointer-events: none;">Ctrl+K</kbd>
                </div>

                <!-- Autocomplete suggestions floating dropdown overlay -->
                @if (isSearchFocused() && navbarSearchQuery().trim() !== '' && allVisibleSuggestions().length > 0) {
                  <div class="search-suggestions-dropdown">
                    
                    <!-- Section: Pages -->
                    @if (filteredSuggestionsByType('nav').length > 0) {
                      <div class="search-section">
                        <div class="search-section-header">
                          Sayfalar ve Menüler
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
                          Hızlı İşlemler
                        </div>
                        @for (s of filteredSuggestionsByType('action'); track s.title) {
                          <div class="suggestion-item" 
                               [class.active]="isItemActive(s)"
                               (mousedown)="selectSuggestion(s); $event.preventDefault()"
                          >
                            <div class="suggestion-item-left">
                              <span class="suggestion-item-title" style="color: var(--primary);" [innerHTML]="highlightMatch(s.title)"></span>
                            </div>
                            <span class="suggestion-badge action">Tetikle</span>
                          </div>
                        }
                      </div>
                    }

                    <!-- Section: Database matches -->
                    @if (matchingInventory().length > 0) {
                      <div class="search-section">
                        <div class="search-section-header">
                          Veritabanı Kayıtları
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
                            <span class="suggestion-badge">{{ item.type }}</span>
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
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Ana Menü</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/dashboard'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Panel Özeti">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"/></svg>
                <span class="nav-text">Panel Özeti</span>
              </a>

              <!-- STOK YÖNETİMİ -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Stok Yönetimi</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/products'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Ürün Yönetimi">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                <span class="nav-text">Ürün Yönetimi</span>
              </a>
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/stock-movements'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Stok Hareketleri">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                <span class="nav-text">Stok Hareketleri</span>
              </a>
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/stock-count'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Stok Sayımı">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span class="nav-text">Stok Sayımı</span>
              </a>
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/warehouses'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Depo Yönetimi">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span class="nav-text">Depo Yönetimi</span>
              </a>

              <!-- OPERASYONLAR -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Operasyonlar</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/orders'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Sipariş Takibi">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                <span class="nav-text">Sipariş Takibi</span>
              </a>
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/purchase-orders'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Satın Alma">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                <span class="nav-text">Satın Alma</span>
              </a>
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/suppliers'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Tedarikçiler">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                <span class="nav-text">Tedarikçiler</span>
              </a>

              <!-- SİSTEM -->
              @if (!isSidebarCollapsed()) {
                <div class="nav-group-label" style="color: #64748B; font-size: 0.65rem; font-weight: bold; text-transform: uppercase; padding-left: 1.5rem; margin-top: 1.25rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Sistem</div>
              } @else {
                <div class="nav-group-divider" style="border-top: 1px solid #F1F5F9; margin: 0.5rem 0;"></div>
              }
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/reports'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Raporlar">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                <span class="nav-text">Raporlar</span>
              </a>
              <a routerLink="/billing" routerLinkActive="active" class="nav-btn" title="Abonelik & Fatura">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                <span class="nav-text">Abonelik & Fatura</span>
              </a>
              <a [routerLink]="ui.subscription().plan === 'none' ? null : '/settings'" routerLinkActive="active" class="nav-btn" [class.disabled]="ui.subscription().plan === 'none'" title="Ayarlar">
                <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span class="nav-text">Ayarlar</span>
              </a>
            </nav>
          </div>

          <!-- Sidebar Footer Upgrade Banner -->
          @if (ui.subscription().plan !== 'ultra') {
            <div class="sidebar-footer" style="border-top: 1px solid #F1F5F9; padding: 12px;">
              <div class="sidebar-upgrade-box" [class.collapsed]="isSidebarCollapsed()" routerLink="/billing" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                @if (!isSidebarCollapsed()) {
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="color: #FFFFFF;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 0M12 3c-1.2 2-3 4-3 7a3 3 0 006 0c0-3-1.8-5-3-7z"/></svg>
                    <strong style="color: #FFFFFF; font-size: 0.78rem; font-weight: 700; font-family: var(--font-heading);">Ultra Plan'a Geçin</strong>
                  </div>
                  <p style="color: rgba(255, 255, 255, 0.85); font-size: 0.68rem; margin: 0; line-height: 1.35; font-family: var(--font-body);">Yapay zeka ve gelişmiş analitikleri aktif edin.</p>
                } @else {
                  <div style="display: flex; justify-content: center; align-items: center; height: 24px;" title="Ultra Plan'a Geçin">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="color: #FFFFFF;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 0M12 3c-1.2 2-3 4-3 7a3 3 0 006 0c0-3-1.8-5-3-7z"/></svg>
                  </div>
                }
              </div>
            </div>
          }
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
            <!-- Shopping Cart styled Notification Widget -->
            <div class="notification-widget">
              <button class="notif-btn" (click)="toggleNotifDropdown($event)" aria-label="Bildirimler">
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
                    <h4>Bildirimler</h4>
                    <div class="notif-actions">
                      @if (notifService.notifications().length > 0) {
                        <button class="notif-action-link" (click)="notifService.markAllAsRead()">Tümünü Okundu Say</button>
                        <span class="divider">•</span>
                        <button class="notif-action-link" (click)="notifService.clearAll()">Temizle</button>
                      }
                    </div>
                  </div>
                  <div class="notif-list">
                    @if (notifService.notifications().length === 0) {
                      <div class="notif-empty">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v2m16 4h-2a2 2 0 00-2 2v1a2 2 0 00-2 2H8a2 2 0 00-2-2v-1a2 2 0 00-2-2H2"/>
                        </svg>
                        <span>Bildirim bulunmuyor.</span>
                      </div>
                    } @else {
                      @for (n of notifService.notifications(); track n.id) {
                        <div class="notif-item" [class.unread]="!n.read" (click)="notifService.markAsRead(n.id)">
                          <div class="notif-indicator" [class]="n.type"></div>
                          <div class="notif-content">
                            <p class="notif-message">{{ n.message }}</p>
                            <span class="notif-time">{{ n.createdAt | date:'dd.MM HH:mm' }}</span>
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
                <span class="user-name">Merhaba, {{ currentUser().name }}</span>
                <span class="user-role" style="display: flex; align-items: center; gap: 2px;">
                  Hesap ve Listeler
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
                    Profil Ayarları
                  </a>
                  <button (click)="doLogout(); isProfileOpen.set(false)" class="dropdown-item logout">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    Çıkış Yap
                  </button>
                </div>
              }
            </div>
          </div>
        </header>

        <main class="main-content">
          @if (ui.subscription().plan === 'none' && router.url !== '/billing') {
            <div class="lockout-screen">
              <div class="lockout-card">
                <div class="lockout-icon-wrapper">
                  <svg class="lockout-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </div>
                <h2>Aboneliğiniz Sona Erdi</h2>
                <p>Ecelon özelliklerine erişmeye devam etmek ve verilerinizi yönetmek için lütfen aboneliğinizi yenileyin veya yeni bir plan seçin.</p>
                <div class="lockout-actions">
                  <button class="btn btn-primary" routerLink="/billing">Aboneliği Yenile</button>
                  <button class="btn btn-secondary" (click)="doLogout()">Çıkış Yap</button>
                </div>
              </div>
            </div>
          } @else {
            <router-outlet></router-outlet>
          }
        </main>
      </div>

      <!-- Global Yapay Zeka Floating Action Button (FAB) -->
      @if (ui.subscription().plan !== 'none') {
        <button class="global-ai-fab" (click)="ui.toggleAiPanel()" [class.active]="ui.isAiPanelOpen()" title="Yapay Zeka Asistanı">
          <svg class="fab-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M7 5H3"/></svg>
        </button>
      }

      @if (ui.isAiPanelOpen()) {
        <div class="ai-panel-backdrop" (click)="ui.toggleAiPanel()"></div>
      }
      <aside class="ai-panel" [class.open]="ui.isAiPanelOpen()" [class.expanded]="ui.subscription().plan === 'ultra' && ui.isHistorySidebarOpen()">
        <!-- ─── AI History Sidebar (left column) ─── -->
        @if (ui.subscription().plan === 'ultra') {
          <div class="ai-history-sidebar">
            <div class="sidebar-action-header">
              <h4>Sohbet Geçmişi</h4>
              <button class="new-chat-btn" (click)="ui.createSession()" title="Yeni Sohbet Başlat">
                <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                Yeni Sohbet
              </button>
            </div>
            <div class="history-sessions-list">
              @for (s of ui.sessions(); track s.id) {
                <div class="history-item" [class.active]="s.id === ui.activeSessionId()" (click)="ui.selectSession(s.id)">
                  <svg class="history-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                  <div class="history-details">
                    @if (editingSessionId() === s.id) {
                      <input type="text" class="edit-title-input" [(ngModel)]="editingTitle" (blur)="saveTitle(s.id)" (keyup.enter)="saveTitle(s.id)" (click)="$event.stopPropagation()" />
                    } @else {
                      <span class="session-title">{{ s.title }}</span>
                      <span class="session-time">{{ s.timestamp | date:'dd.MM.yyyy HH:mm' }}</span>
                    }
                  </div>
                  <div class="history-actions-row" (click)="$event.stopPropagation()">
                    @if (editingSessionId() !== s.id) {
                      <button class="edit-session-btn" (click)="startEdit($event, s.id, s.title)" title="Düzenle">
                        <svg style="width:13px;height:13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                      </button>
                      <button class="delete-session-btn" (click)="ui.deleteSession(s.id)" title="Sil">
                        <svg style="width:13px;height:13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- ─── AI Chat Container (right column) ─── -->
        <div class="ai-chat-container">
          @if (ui.subscription().plan !== 'ultra') {
            <div class="ai-locked-overlay">
              <div class="lock-card">
                <div class="lock-icon">
                  <svg style="width:20px;height:20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </div>
                <h3>Yapay Zeka Asistanı</h3>
                <p class="lock-desc">Akıllı analizler, kritik stok tahminleri ve grafiksel raporlar için hemen Ultra Plan'a yükseltin.</p>
                <button class="billing-route-btn" routerLink="/billing" (click)="ui.isAiPanelOpen.set(false)">
                  Ultra Plan'a Yükselt
                </button>
              </div>
            </div>
          }
          <div class="ai-panel-header">
            <div class="ai-panel-title">
              @if (ui.subscription().plan === 'ultra') {
                <button class="toggle-history-btn" (click)="ui.toggleHistorySidebar()" [class.active]="ui.isHistorySidebarOpen()" title="Sohbet Geçmişi">
                  <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </button>
              }
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#FF5A1F" stroke-width="2.5" style="background: rgba(255, 90, 31, 0.1); border-radius: 6px; padding: 3px; flex-shrink: 0; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l-.813-5.096a2 2 0 00-1.666-1.666L1.428 13.5l5.096-.813a2 2 0 001.666-1.666L9 5.904l.813 5.096a2 2 0 001.666 1.666l5.096.813-5.096.813a2 2 0 00-1.666 1.666zM19 3v4m2-2h-4"/></svg>
              <div>
                <h3>{{ ui.subscription().plan === 'ultra' ? (ui.activeSession()?.title || 'Yapay Zeka Asistanı') : 'Yapay Zeka Asistanı' }}</h3>
                <span class="ai-badge"><span class="pulse-dot"></span> Gemma 3.5 Aktif</span>
              </div>
            </div>
            <div class="header-right-actions">
              @if (ui.subscription().plan === 'ultra') {
                <button class="new-chat-icon-btn" (click)="ui.createSession()" title="Yeni Sohbet Başlat">
                  <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                </button>
              }
              <button class="close-panel-btn" (click)="ui.toggleAiPanel()">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          <div class="ai-cards-body" #chatBody>
            @if (ui.subscription().plan !== 'ultra') {
              <!-- Illustrative Mock Thread to showcase AI value behind the overlay -->
              <div class="chat-bubble-wrapper user">
                <div class="chat-bubble">
                  <p>Kritik seviyedeki stoklarımı analiz et ve ne sipariş vermem gerektiğini söyle.</p>
                  <span class="msg-time">10:42</span>
                </div>
              </div>
              <div class="chat-bubble-wrapper ai">
                <div class="ai-avatar">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l-.813-5.096a2 2 0 00-1.666-1.666L1.428 13.5l5.096-.813a2 2 0 001.666-1.666L9 5.904l.813 5.096a2 2 0 001.666 1.666l5.096.813-5.096.813a2 2 0 00-1.666 1.666zM19 3v4m2-2h-4"/></svg>
                </div>
                <div class="answer-card">
                  <div class="answer-card-header">
                    <h4>Kritik Stok Analizi & Sipariş Önerileri</h4>
                    <span class="time">10:42</span>
                  </div>
                  
                  <div class="thinking-process-block">
                    <div class="thinking-process-header">
                      <svg class="thinking-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                      </svg>
                      <span>Analiz Hazırlığı & Düşünme Süreci</span>
                    </div>
                    <div class="thinking-process-content">Veritabanındaki ürünler taranıyor. Mevcut miktar (quantity) <= kritik eşik (minQuantity) olan ürünler filtreleniyor. 2 kritik stoklu ürün bulundu.</div>
                  </div>

                  <p class="desc">Sistemde stok miktarı kritik seviyenin altına düşmüş veya tükenmiş 2 adet ürün tespit edilmiştir:</p>
                  
                  <div class="answer-table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Ürün Adı</th>
                          <th>Mevcut Stok</th>
                          <th>Min Stok</th>
                          <th>Önerilen Sipariş</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Dell UltraSharp 27</td>
                          <td>0 adet</td>
                          <td>5 adet</td>
                          <td>+10 adet (PO-1001 yolda)</td>
                        </tr>
                        <tr>
                          <td>Ergonomik Ofis Koltuğu</td>
                          <td>3 adet</td>
                          <td>5 adet</td>
                          <td>+7 adet</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            } @else {
              @for (msg of ui.activeMessages(); track msg.id; let isLast = $last) {
              @if (msg.sender === 'user') {
                <div class="chat-bubble-wrapper user">
                  <div class="chat-bubble">
                    <p>{{ msg.text }}</p>
                    <span class="msg-time">{{ msg.timestamp | date:'HH:mm' }}</span>
                  </div>
                </div>
              } @else if (msg.text || (msg.card && (msg.card.description || msg.card.thinking))) {
                <div class="chat-bubble-wrapper ai">
                  <div class="ai-avatar">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l-.813-5.096a2 2 0 00-1.666-1.666L1.428 13.5l5.096-.813a2 2 0 001.666-1.666L9 5.904l.813 5.096a2 2 0 001.666 1.666l5.096.813-5.096.813a2 2 0 00-1.666 1.666zM19 3v4m2-2h-4"/></svg>
                  </div>
                  
                  @if (msg.card) {
                    <div class="answer-card">
                      <div class="answer-card-header">
                        <h4>{{ msg.card.title }}</h4>
                        <span class="time">{{ msg.timestamp | date:'HH:mm' }}</span>
                      </div>
                      
                      <!-- ─── Thinking Process Block ─── -->
                      @if (msg.card.thinking) {
                        <div class="thinking-process-block">
                          <div class="thinking-process-header">
                            <svg class="thinking-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                            </svg>
                            <span>Analiz Hazırlığı & Düşünme Süreci</span>
                            @if (ui.isAiLoading() && isLast && !msg.card.description) {
                              <span class="thinking-mini-pulse"></span>
                            }
                          </div>
                          <div class="thinking-process-content">{{ msg.card.thinking }}</div>
                        </div>
                      }
                      
                      @if (msg.card.description) {
                        <p class="desc">{{ msg.card.description }}</p>
                      } @else if (ui.isAiLoading() && isLast) {
                        <div class="skeleton-text-lines">
                          <div class="skeleton-line w-75"></div>
                          <div class="skeleton-line w-100"></div>
                          <div class="skeleton-line w-50"></div>
                        </div>
                      }
                      
                      @if (msg.card.type === 'metric') {
                        @if (msg.card.metrics && msg.card.metrics.length > 0) {
                          <div class="metrics-stack">
                            @for (m of msg.card.metrics; track m.label) {
                              <div class="metric-row">
                                <span class="label">{{ m.label }}</span>
                                <div>
                                  <span class="value">{{ m.value }}</span>
                                  @if (m.change) {
                                    <span class="change" [class.positive]="m.isPositive" [class.negative]="!m.isPositive">
                                      {{ m.change }}
                                    </span>
                                  }
                                </div>
                              </div>
                            }
                          </div>
                        } @else if (ui.isAiLoading() && isLast) {
                          <div class="skeleton-metrics">
                            <div class="skeleton-metric-box"></div>
                            <div class="skeleton-metric-box"></div>
                          </div>
                        }
                      }
                      
                      @if (msg.card.type === 'table') {
                        @if (msg.card.tableData && msg.card.tableData.headers && msg.card.tableData.rows && msg.card.tableData.rows.length > 0) {
                          <div class="answer-table-wrapper">
                            <table>
                              <thead>
                                <tr>
                                  @for (h of msg.card.tableData.headers; track h) {
                                    <th>{{ h }}</th>
                                  }
                                </tr>
                              </thead>
                              <tbody>
                                @for (row of msg.card.tableData.rows; track $index) {
                                  <tr>
                                    @for (cell of row; track $index) {
                                      <td>{{ cell }}</td>
                                    }
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                        } @else if (ui.isAiLoading() && isLast) {
                          <div class="skeleton-table">
                            <div class="skeleton-row header"></div>
                            <div class="skeleton-row"></div>
                            <div class="skeleton-row"></div>
                          </div>
                        }
                      }
                      
                      @if (msg.card.type === 'chart') {
                        @if (msg.card.chartData && msg.card.chartData.labels && msg.card.chartData.labels.length > 0) {
                          <div class="chart-wrapper">
                            @if (msg.card.chartType === 'bar') {
                              <svg viewBox="0 0 320 180">
                                <line x1="20" y1="30" x2="300" y2="30" stroke="#F3F4F6"/>
                                <line x1="20" y1="90" x2="300" y2="90" stroke="#F3F4F6"/>
                                <line x1="20" y1="150" x2="300" y2="150" stroke="#E5E7EB" stroke-width="1.5"/>
                                @for (label of msg.card.chartData.labels; track label; let idx = $index) {
                                  <g>
                                    <rect [attr.x]="30 + idx * 55" [attr.y]="ui.getBarY(msg.card.chartData.datasets[0].data[idx], msg.card.chartData.datasets[0].data)" width="36" [attr.height]="ui.getBarHeight(msg.card.chartData.datasets[0].data[idx], msg.card.chartData.datasets[0].data)" rx="3" fill="#111827"/>
                                    <text [attr.x]="48 + idx * 55" [attr.y]="ui.getBarY(msg.card.chartData.datasets[0].data[idx], msg.card.chartData.datasets[0].data) - 6" text-anchor="middle" style="font-family:var(--font-mono);font-size:9px;font-weight:700" fill="#111827">{{ msg.card.chartData.datasets[0].data[idx] }}</text>
                                    <text [attr.x]="48 + idx * 55" y="168" text-anchor="middle" style="font-size:8px;font-weight:500" fill="#6B7280">{{ label | slice:0:7 }}..</text>
                                  </g>
                                }
                              </svg>
                            }
                            @if (msg.card.chartType === 'pie' || msg.card.chartType === 'doughnut') {
                              <svg viewBox="0 0 320 200">
                                <g transform="translate(10, 0)">
                                  @for (sector of ui.getPieSectors(msg.card.chartData.datasets[0].data); track sector.label) {
                                    <path [attr.d]="sector.d" [attr.fill]="sector.color"/>
                                  }
                                  @if (msg.card.chartType === 'doughnut') {
                                    <circle cx="100" cy="100" r="45" fill="#FFFFFF"/>
                                  }
                                  @for (label of msg.card.chartData.labels; track label; let idx = $index) {
                                    <g [attr.transform]="'translate(200, ' + (40 + idx * 24) + ')'">
                                      <rect width="10" height="10" rx="2" [attr.fill]="ui.getPieSectors(msg.card.chartData.datasets[0].data)[idx].color"/>
                                      <text x="16" y="9" style="font-size:9px;font-weight:500" fill="#111827">{{ label | slice:0:12 }} ({{ msg.card.chartData.datasets[0].data[idx] }})</text>
                                    </g>
                                  }
                                  </g>
                              </svg>
                            }
                            @if (msg.card.chartType === 'line') {
                              <svg viewBox="0 0 300 160">
                                <line x1="20" y1="40" x2="280" y2="40" stroke="#F3F4F6"/>
                                <line x1="20" y1="90" x2="280" y2="90" stroke="#F3F4F6"/>
                                <line x1="20" y1="140" x2="280" y2="140" stroke="#E5E7EB"/>
                                <path [attr.d]="ui.getLinePath(msg.card.chartData.datasets[0].data)" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round"/>
                                @for (pt of ui.getLinePoints(msg.card.chartData.datasets[0].data); track $index; let idx = $index) {
                                  <g>
                                    <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="4" fill="#111827" stroke="#FFFFFF" stroke-width="1.5"/>
                                    <text [attr.x]="pt.x" y="153" text-anchor="middle" style="font-size:8px;font-weight:500" fill="#6B7280">{{ msg.card.chartData.labels[idx] }}</text>
                                    <text [attr.x]="pt.x" [attr.y]="pt.y - 8" text-anchor="middle" style="font-family:var(--font-mono);font-size:8px;font-weight:700" fill="#111827">₺{{ pt.val }}</text>
                                  </g>
                                }
                              </svg>
                            }
                          </div>
                        } @else if (ui.isAiLoading() && isLast) {
                          <div class="skeleton-chart">
                            <div class="skeleton-chart-bar"></div>
                            <div class="skeleton-chart-bar"></div>
                            <div class="skeleton-chart-bar"></div>
                          </div>
                        }
                      }
                    </div>
                  } @else {
                    <div class="chat-bubble fallback-text">
                      <p>{{ msg.text }}</p>
                      <span class="msg-time">{{ msg.timestamp | date:'HH:mm' }}</span>
                    </div>
                  }
                </div>
              }
            }
            }
            
            @if (ui.isAiThinking()) {
              <div class="chat-bubble-wrapper ai loading-wrapper">
                <div class="ai-avatar pulse">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l-.813-5.096a2 2 0 00-1.666-1.666L1.428 13.5l5.096-.813a2 2 0 001.666-1.666L9 5.904l.813 5.096a2 2 0 001.666 1.666l5.096.813-5.096.813a2 2 0 00-1.666 1.666zM19 3v4m2-2h-4"/></svg>
                </div>
                <div class="thinking-card">
                  <span class="thinking-text">Asistan verileri analiz ediyor</span>
                  <div class="thinking-dots">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                </div>
              </div>
            }
          </div>

          <div class="ai-input-area">
            <div class="quick-prompts">
              <button class="quick-btn" (click)="ui.askQuestion('Geçen ay en az satan 5 ürünü listele')" [disabled]="ui.isAiLoading()">📉 En az satan 5 ürün</button>
              <button class="quick-btn" (click)="ui.askQuestion('Kritik stok seviyesindeki ürünler')" [disabled]="ui.isAiLoading()">⚠️ Kritik stoklar</button>
              <button class="quick-btn" (click)="ui.askQuestion('Genel satış durumunu göster')" [disabled]="ui.isAiLoading()">📈 Satış durumu</button>
            </div>
            <div class="input-row">
              <input class="ai-input" type="text" placeholder="Asistana sorun..." [(ngModel)]="aiPrompt" (keyup.enter)="askQuestionAndClear()" [disabled]="ui.isAiLoading()"/>
              <button class="send-btn" (click)="askQuestionAndClear()" [disabled]="ui.isAiLoading() || !aiPrompt.trim()">Gönder</button>
            </div>
          </div>
        </div>
      </aside>


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
              Vazgeç
            </button>
            <!-- Sağ: Sil - dolu, kırmızı/danger renk -->
            <button class="btn" 
                    (click)="confirmGlobalAction()" 
                    [disabled]="isConfirmLoading()"
                    style="background-color: #DC2626; color: #FFFFFF; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              @if (isConfirmLoading()) {
                <span class="spinner-sm spinner-light" style="width: 14px; height: 14px; border-width: 2px;"></span> Siliniyor...
              } @else {
                Sil
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
            <button class="btn btn-secondary" (click)="ui.closeConfirm()">{{ ui.confirmConfig()?.cancelText || 'Vazgeç' }}</button>
            <button class="btn btn-primary" (click)="confirmGlobalAction()">{{ ui.confirmConfig()?.confirmText || 'Onayla' }}</button>
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
  isConfirmLoading = signal(false);
  
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

  aiPrompt = '';
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

  suggestionsList = [
    {
      title: 'Depo Yönetimi',
      type: 'nav',
      category: 'Stok Yönetimi',
      route: '/warehouses',
      icon: '🏢',
      keywords: ['depo', 'yönetimi', 'warehouses', 'depolar', 'şube', 'şubeler']
    },
    {
      title: 'Ürün Yönetimi',
      type: 'nav',
      category: 'Stok Yönetimi',
      route: '/products',
      icon: '📦',
      keywords: ['ürün', 'yönetimi', 'products', 'ürünler', 'stok', 'stoklar', 'malzeme']
    },
    {
      title: 'Stok Hareketleri',
      type: 'nav',
      category: 'Stok Yönetimi',
      route: '/stock-movements',
      icon: '🔄',
      keywords: ['stok', 'hareketleri', 'giriş', 'çıkış', 'transfer', 'sevk', 'movements']
    },
    {
      title: 'Stok Sayımı',
      type: 'nav',
      category: 'Stok Yönetimi',
      route: '/stock-count',
      icon: '📋',
      keywords: ['sayım', 'stok sayımı', 'count', 'envanter']
    },
    {
      title: 'Sipariş Takibi',
      type: 'nav',
      category: 'Operasyonlar',
      route: '/orders',
      icon: '🛒',
      keywords: ['sipariş', 'takibi', 'orders', 'siparişler', 'müşteri', 'satış']
    },
    {
      title: 'Satın Alma',
      type: 'nav',
      category: 'Operasyonlar',
      route: '/purchase-orders',
      icon: '💳',
      keywords: ['satın', 'alma', 'purchase', 'po', 'tedarik', 'sipariş']
    },
    {
      title: 'Tedarikçiler',
      type: 'nav',
      category: 'Operasyonlar',
      route: '/suppliers',
      icon: '🏭',
      keywords: ['tedarikçi', 'tedarikçiler', 'suppliers', 'üretici', 'satıcı']
    },
    {
      title: 'Raporlar',
      type: 'nav',
      category: 'Analiz & Sistem',
      route: '/reports',
      icon: '📊',
      keywords: ['raporlar', 'analiz', 'reports', 'istatistik', 'grafik']
    },
    {
      title: 'Abonelik & Fatura',
      type: 'nav',
      category: 'Analiz & Sistem',
      route: '/billing',
      icon: '💵',
      keywords: ['fatura', 'abonelik', 'billing', 'plan', 'ödeme', 'paket']
    },
    {
      title: 'Ayarlar',
      type: 'nav',
      category: 'Analiz & Sistem',
      route: '/settings',
      icon: '⚙️',
      keywords: ['ayarlar', 'settings', 'profil', 'güvenlik', 'şifre']
    },
    {
      title: 'Yeni Sipariş Oluştur',
      type: 'action',
      category: 'Operasyonlar',
      route: '/orders',
      openParam: 'new',
      icon: '➕🛒',
      keywords: ['yeni', 'sipariş', 'oluştur', 'ekle', 'create', 'order', 'satış']
    },
    {
      title: 'Yeni Ürün Ekle',
      type: 'action',
      category: 'Stok Yönetimi',
      route: '/products',
      openParam: 'new',
      icon: '➕📦',
      keywords: ['yeni', 'ürün', 'ekle', 'create', 'product', 'stok']
    },
    {
      title: 'Yeni Depo Tanımla',
      type: 'action',
      category: 'Stok Yönetimi',
      route: '/warehouses',
      openParam: 'new',
      icon: '➕🏢',
      keywords: ['yeni', 'depo', 'tanımla', 'ekle', 'create', 'warehouse']
    },
    {
      title: 'Yeni Tedarikçi Ekle',
      type: 'action',
      category: 'Operasyonlar',
      route: '/suppliers',
      openParam: 'new',
      icon: '➕🏭',
      keywords: ['yeni', 'tedarikçi', 'ekle', 'create', 'supplier']
    },
    {
      title: 'Yeni Satın Alma Siparişi',
      type: 'action',
      category: 'Operasyonlar',
      route: '/purchase-orders',
      openParam: 'new',
      icon: '➕💳',
      keywords: ['yeni', 'satın', 'alma', 'siparişi', 'ekle', 'create', 'purchase', 'po']
    }
  ];

  translateStatus(status: string): string {
    const translations: Record<string, string> = {
      'Completed': 'Tamamlandı',
      'Pending': 'Beklemede',
      'Cancelled': 'İptal Edildi',
      'Draft': 'Taslak',
      'Sent': 'Gönderildi',
      'Partially Received': 'Kısmen Alındı',
      'Received': 'Teslim Alındı'
    };
    return translations[status] || status;
  }

  filteredSuggestions = computed(() => {
    const query = this.navbarSearchQuery().toLowerCase().trim();
    if (!query) {
      return this.suggestionsList;
    }
    return this.suggestionsList.filter(s =>
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
          type: 'Ürün',
          subtitle: `SKU: ${p.sku} | Stok: ${p.quantity} ${p.unit || 'Adet'}`,
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
          type: 'Müşteri Siparişi',
          subtitle: `Müşteri: ${o.customerName} | Toplam: ₺${o.totalAmount} | Durum: ${this.translateStatus(o.status)}`,
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
          type: 'Tedarik Siparişi',
          subtitle: `Tedarikçi: ${po.supplierName} | Toplam: ₺${po.totalAmount} | Durum: ${this.translateStatus(po.status)}`,
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
          type: 'Depo',
          subtitle: `Kod: ${w.code} | Adres: ${w.address || '-'}`,
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
          type: 'Tedarikçi',
          subtitle: `İrtibat: ${s.contactPerson || '-'} | Derece: ${s.rating}/5`,
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

  constructor() {
    effect(() => {
      const count = this.ui.activeMessages().length;
      const loading = this.ui.isAiLoading();
      setTimeout(() => this.scrollToBottom(), 50);
    });

    const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
    if (token) {
      this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
        next: (profile: any) => {
          this.ui.userProfile.set(profile);
        },
        error: () => {}
      });
    }

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
    if (!token) return { username: 'Misafir', role: 'guest', name: 'Misafir Kullanıcı', avatar: null };
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
              payload.username === 'manager' ? 'Yönetici Demo' :
              payload.username === 'viewer' ? 'Gözlemci Demo' : payload.username,
        avatar: null
      };
    } catch (e) {
      return { username: 'admin', role: 'admin', name: 'Ahmet Ildır', avatar: null };
    }
  });

  getActivePageTitle(): string {
    const url = this.router.url;
    if (url.includes('/dashboard')) return 'Panel Özeti';
    if (url.includes('/products')) return 'Ürün Yönetimi';
    if (url.includes('/stock-movements')) return 'Stok Hareketleri';
    if (url.includes('/suppliers')) return 'Tedarikçiler';
    if (url.includes('/purchase-orders')) return 'Satın Alma';
    if (url.includes('/orders')) return 'Sipariş Takibi';
    if (url.includes('/reports')) return 'Raporlar & Analiz';
    if (url.includes('/stock-count')) return 'Stok Sayımı';
    if (url.includes('/billing')) return 'Abonelik & Fatura';
    if (url.includes('/warehouses')) return 'Depo Yönetimi';
    if (url.includes('/settings')) return 'Ayarlar';
    return 'Ecelon';
  }

  getBreadcrumbs(): { category: string; page: string } {
    const url = this.router.url;
    if (url.includes('/dashboard')) return { category: 'Genel', page: 'Panel Özeti' };
    if (url.includes('/products')) return { category: 'Stok Yönetimi', page: 'Ürün Yönetimi' };
    if (url.includes('/stock-movements')) return { category: 'Stok Yönetimi', page: 'Stok Hareketleri' };
    if (url.includes('/stock-count')) return { category: 'Stok Yönetimi', page: 'Stok Sayımı' };
    if (url.includes('/warehouses')) return { category: 'Stok Yönetimi', page: 'Depo Yönetimi' };
    if (url.includes('/orders')) return { category: 'Operasyonlar', page: 'Sipariş Takibi' };
    if (url.includes('/purchase-orders')) return { category: 'Operasyonlar', page: 'Satın Alma' };
    if (url.includes('/suppliers')) return { category: 'Operasyonlar', page: 'Tedarikçiler' };
    if (url.includes('/reports')) return { category: 'Analiz & Sistem', page: 'Raporlar' };
    if (url.includes('/billing')) return { category: 'Analiz & Sistem', page: 'Abonelik & Fatura' };
    if (url.includes('/settings')) return { category: 'Analiz & Sistem', page: 'Ayarlar' };
    return { category: 'Sistem', page: 'Panel' };
  }

  editingSessionId = signal<string | null>(null);
  editingTitle = '';

  startEdit(event: Event, id: string, title: string) {
    event.stopPropagation();
    this.editingSessionId.set(id);
    this.editingTitle = title;
    setTimeout(() => {
      const inputEl = document.querySelector('.edit-title-input') as HTMLInputElement;
      if (inputEl) inputEl.focus();
    }, 50);
  }

  saveTitle(id: string) {
    if (this.editingTitle.trim()) {
      this.ui.updateSessionTitle(id, this.editingTitle);
    }
    this.editingSessionId.set(null);
  }

  @ViewChild('chatBody') private chatBodyContainer!: ElementRef;


  scrollToBottom(): void {
    try {
      this.chatBodyContainer.nativeElement.scrollTop = this.chatBodyContainer.nativeElement.scrollHeight;
    } catch(err) {
      // Ignore scroll errors on early ticks
    }
  }

  doLogout() {
    localStorage.removeItem('smart_inventory_token');
    this.socketService.disconnect();
    this.ui.showToast('Çıkış yapıldı.', 'info');
    this.router.navigate(['/login']);
  }

  copyShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.ui.showToast('Sayfa bağlantısı panoya kopyalandı.', 'success');
    }).catch(() => {
      this.ui.showToast('Bağlantı kopyalanamadı.', 'error');
    });
  }

  askQuestionAndClear() {
    if (!this.aiPrompt.trim()) return;
    this.ui.askQuestion(this.aiPrompt);
    this.aiPrompt = '';
  }

  deleteSessionAndStop(event: Event, id: string) {
    event.stopPropagation();
    this.ui.deleteSession(id);
  }


}

