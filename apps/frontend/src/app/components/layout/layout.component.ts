import { Component, inject, ViewChild, ElementRef, signal, computed, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { UiStateService } from '../../services/ui-state.service';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { ModalComponent } from '../modal.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ModalComponent],
  template: `
    <div class="app-shell" [class.sidebar-collapsed]="isSidebarCollapsed()">
      <aside class="sidebar">
        <div>
          <div class="sidebar-logo">
            <div class="logo-mark">S</div>
            <div class="logo-text">
              <h2>Smart Inventory</h2>
              <span>v1.2 · MONOCHROME</span>
            </div>
            <button class="toggle-sidebar-btn" (click)="toggleSidebar()" [attr.title]="isSidebarCollapsed() ? 'Menüyü Göster' : 'Menüyü Gizle'">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" [style.transform]="isSidebarCollapsed() ? 'rotate(180deg)' : 'none'" style="transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
            </button>
          </div>
          <nav class="nav-list">
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-btn" title="Panel Özeti">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"/></svg>
              <span class="nav-text">Panel Özeti</span>
            </a>
            <a routerLink="/products" routerLinkActive="active" class="nav-btn" title="Ürün Yönetimi">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              <span class="nav-text">Ürün Yönetimi</span>
            </a>
            <a routerLink="/stock-movements" routerLinkActive="active" class="nav-btn" title="Stok Hareketleri">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
              <span class="nav-text">Stok Hareketleri</span>
            </a>
            <a routerLink="/suppliers" routerLinkActive="active" class="nav-btn" title="Tedarikçiler">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              <span class="nav-text">Tedarikçiler</span>
            </a>
            <a routerLink="/purchase-orders" routerLinkActive="active" class="nav-btn" title="Satın Alma">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              <span class="nav-text">Satın Alma</span>
            </a>
            <a routerLink="/orders" routerLinkActive="active" class="nav-btn" title="Sipariş Takibi">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              <span class="nav-text">Sipariş Takibi</span>
            </a>
            <a routerLink="/reports" routerLinkActive="active" class="nav-btn" title="Raporlar">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span class="nav-text">Raporlar</span>
            </a>
            <a routerLink="/stock-count" routerLinkActive="active" class="nav-btn" title="Stok Sayımı">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              <span class="nav-text">Stok Sayımı</span>
            </a>
            <a routerLink="/settings" routerLinkActive="active" class="nav-btn" title="Ayarlar">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <span class="nav-text">Ayarlar</span>
            </a>
          </nav>
        </div>
      </aside>

      <div class="main-layout-wrapper">
        <header class="top-navbar">
          <div class="navbar-left">
            <span class="navbar-title">{{ getActivePageTitle() }}</span>
          </div>
          <div class="navbar-right">
            <div class="system-status">
              <span class="status-dot"></span> <span>Sistem Çevrimiçi</span>
            </div>

            <!-- Bildirim Paneli -->
            <div class="notification-widget">
              <button class="notif-btn" (click)="toggleNotifDropdown($event)" aria-label="Bildirimler">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                @if (notifService.unreadCount() > 0) {
                  <span class="notif-badge">{{ notifService.unreadCount() }}</span>
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
            
            <div class="profile-widget" (click)="toggleProfileDropdown($event)">
              <div class="avatar-circle">
                {{ currentUser().name.charAt(0) }}
              </div>
              <div class="user-info">
                <span class="user-name">{{ currentUser().name }}</span>
                <span class="user-role">{{ currentUser().role === 'admin' ? 'Yönetici' : 'Kullanıcı' }}</span>
              </div>
              <svg class="dropdown-chevron" [class.open]="isProfileOpen()" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>

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
          <router-outlet></router-outlet>
        </main>
      </div>

      @if (ui.isAiPanelOpen()) {
        <div class="ai-panel-backdrop" (click)="ui.toggleAiPanel()"></div>
      }
      <aside class="ai-panel" [class.open]="ui.isAiPanelOpen()" [class.expanded]="ui.isHistorySidebarOpen()">
        <!-- ─── AI History Sidebar (left column) ─── -->
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

        <!-- ─── AI Chat Container (right column) ─── -->
        <div class="ai-chat-container">
          <div class="ai-panel-header">
            <div class="ai-panel-title">
              <button class="toggle-history-btn" (click)="ui.toggleHistorySidebar()" [class.active]="ui.isHistorySidebarOpen()" title="Sohbet Geçmişi">
                <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
              <img src="/assets/image/f8ba49b9-052e-4780-b96d-411004b4884b.jpg" alt="AI Logo" style="width:22px;height:22px;object-fit:contain;border-radius:4px;"/>
              <div>
                <h3>{{ ui.activeSession()?.title || 'Yapay Zeka Asistanı' }}</h3>
                <span class="ai-badge"><span class="pulse-dot"></span> Gemma 3.5 Aktif</span>
              </div>
            </div>
            <div class="header-right-actions">
              <button class="new-chat-icon-btn" (click)="ui.createSession()" title="Yeni Sohbet Başlat">
                <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              </button>
              <button class="close-panel-btn" (click)="ui.toggleAiPanel()">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          <div class="ai-cards-body" #chatBody>
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
                    <img src="/assets/image/f8ba49b9-052e-4780-b96d-411004b4884b.jpg" alt="AI"/>
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
            
            @if (ui.isAiThinking()) {
              <div class="chat-bubble-wrapper ai loading-wrapper">
                <div class="ai-avatar pulse">
                  <img src="/assets/image/f8ba49b9-052e-4780-b96d-411004b4884b.jpg" alt="AI"/>
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

      <app-modal [isOpen]="!!ui.confirmConfig()" [title]="ui.confirmConfig()?.title || ''" (onClose)="ui.closeConfirm()">
        <div style="font-size: 14px; line-height: 1.5; color: var(--text-primary);">
          {{ ui.confirmConfig()?.message }}
        </div>
        <div footer style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" (click)="ui.closeConfirm()">{{ ui.confirmConfig()?.cancelText || 'Vazgeç' }}</button>
          <button class="btn btn-primary" (click)="confirmGlobalAction()">{{ ui.confirmConfig()?.confirmText || 'Onayla' }}</button>
        </div>
      </app-modal>
    </div>
  `
})
export class LayoutComponent {
  ui = inject(UiStateService);
  router = inject(Router);
  aiPrompt = '';

  confirmGlobalAction() {
    const config = this.ui.confirmConfig();
    if (config && config.onConfirm) {
      config.onConfirm();
    }
    this.ui.closeConfirm();
  }

  constructor() {
    effect(() => {
      const count = this.ui.activeMessages().length;
      const loading = this.ui.isAiLoading();
      setTimeout(() => this.scrollToBottom(), 50);
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
    if (!token) return { username: 'Misafir', role: 'guest', name: 'Misafir Kullanıcı' };
    try {
      const payloadBase64 = token.split('.')[1];
      const payloadJson = decodeURIComponent(atob(payloadBase64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(payloadJson);
      return {
        username: payload.username,
        role: payload.role,
        name: payload.username === 'admin' ? 'Ahmet Ildır' : payload.username
      };
    } catch (e) {
      return { username: 'Admin', role: 'admin', name: 'Ahmet Ildır' };
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
    if (url.includes('/settings')) return 'Ayarlar';
    return 'Smart Inventory';
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
    this.ui.showToast('Çıkış yapıldı.', 'info');
    this.router.navigate(['/login']);
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

