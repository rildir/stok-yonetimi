import { Component, inject, ViewChild, ElementRef, computed, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <header class="page-header" style="border:none; padding-bottom:0; margin-bottom: 1.25rem;">
      <div>
        <h1 style="font-size: 1.25rem;">Panel Özeti</h1>
      </div>
    </header>

    <!-- SLEEK AI SEARCH BAR -->
    @if (ui.subscription().plan === 'ultra') {
      <div class="ai-search-centerpiece">
        <div class="ai-search-content-wrapper">
          <div class="ai-search-bar" [class.ai-loading]="ui.isAiLoading()">
            <div class="ai-search-icon">✦</div>
            <input 
              type="text" 
              class="ai-search-input" 
              placeholder="Yapay Zeka Asistanı ile stok analizi yapın, sipariş özetleri isteyin..." 
              [(ngModel)]="aiPrompt" 
              (keydown)="onKeydown($event)"
            />
            <button class="ai-search-submit" (click)="askQuestion(aiPrompt)" [disabled]="!aiPrompt.trim()">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
          <div class="ai-search-suggestions">
            <span class="suggestion-label">Şunu deneyin:</span>
            <button class="suggestion-tag" (click)="askQuestion('Kritik stok seviyesindeki ürünler hangileri?')">⚠️ Kritik Stoklar</button>
            <button class="suggestion-tag" (click)="askQuestion('En çok satan ürün hangisi?')">🔥 En Çok Satan</button>
            <button class="suggestion-tag" (click)="askQuestion('Haftalık stok hareket analizi yap')">📊 Stok Hareketi</button>
          </div>
        </div>
      </div>
    }

    <div class="dashboard-unified-grid" style="display: grid; grid-template-columns: repeat(24, 1fr); gap: 16px; width: 100%; padding-bottom: 2.5rem;">
      <!-- ROW 1: Stat Cards -->
      <div class="stat-card" style="grid-column: span 6; height: 100%;">
        <div class="stat-icon-box products">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <span class="stat-label">Toplam Ürün</span>
          <div class="stat-value">{{ state.totalProducts() }}</div>
        </div>
      </div>
      
      <div class="stat-card" [class.warning-yellow]="state.lowStockCount() > 0" style="grid-column: span 6; height: 100%;">
        <div class="stat-icon-box lowstock">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </div>
        <div>
          <span class="stat-label">Kritik Stok</span>
          <div class="stat-value low">{{ state.lowStockCount() }}</div>
        </div>
      </div>
      
      <div class="stat-card" [class.warning-red]="state.outOfStockCount() > 0" style="grid-column: span 6; height: 100%;">
        <div class="stat-icon-box outstock">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <span class="stat-label">Tükenen Ürün</span>
          <div class="stat-value out">{{ state.outOfStockCount() }}</div>
        </div>
      </div>
      
      <div class="stat-card" style="grid-column: span 6; height: 100%;">
        <div class="stat-icon-box revenue">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"/></svg>
        </div>
        <div>
          <span class="stat-label">Toplam Gelir</span>
          <div class="stat-value good">₺{{ state.totalRevenue().toLocaleString('tr-TR', { minimumFractionDigits: 2 }) }}</div>
        </div>
      </div>
 
      <!-- ROW 2: Charts & Quick Actions -->
      <!-- SON 7 GÜNÜN STOK HAREKETİ -->
      <div class="sidebar-card" style="grid-column: span 10; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; height: 285px;">
        <h4 style="font-size: 0.85rem; font-weight: 700; margin: 0; text-transform: uppercase; color: var(--text-primary); letter-spacing: 0.05em;">Son 7 Günün Stok Hareketi (Adet)</h4>
        <div style="flex: 1; position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <canvas #weeklyChart [style.display]="isChartEmpty ? 'none' : 'block'"></canvas>
          @if (isChartEmpty) {
            <div class="chart-empty-state" style="position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-muted); gap: 10px; width: 100%; height: 100%; padding: 1rem; box-sizing: border-box;">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="color: var(--secondary-focus);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v16.5c0 .621.504 1.125 1.125 1.125h16.5m-15.375-3h15m-15-3.75h12m-12-3.75h9m-9-3.75h3" />
              </svg>
              <div>
                <strong style="display: block; font-size: 0.8rem; color: var(--text-primary); margin-bottom: 2px;">Henüz Stok Hareketi Yok</strong>
                <span style="font-size: 0.72rem; line-height: 1.3;">Bu hafta herhangi bir ürün girişi veya çıkışı kaydedilmedi.</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- KATEGORİ BAZLI DAĞILIM -->
      <div class="sidebar-card" style="grid-column: span 8; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; height: 285px;">
        <h4 style="font-size: 0.85rem; font-weight: 700; margin: 0; text-transform: none; color: var(--text-primary); letter-spacing: 0.05em;">Kategori bazlı dağılım</h4>
        <div style="flex: 1; position: relative; width: 100%; height: 100%; padding: 0.5rem;">
          <canvas #categoryChart></canvas>
        </div>
      </div>

      <!-- HIZLI İŞLEMLER -->
      <div class="sidebar-card" style="grid-column: span 6; display: flex; flex-direction: column; height: 285px; padding: 1rem;">
        <h3 class="card-title" style="margin-bottom: 0.75rem;">Hızlı İşlemler</h3>
        <div class="quick-actions-list" style="display: flex; flex-direction: column; gap: 8px; flex: 1; justify-content: center;">
          <a routerLink="/products" [queryParams]="{ action: 'new' }" class="quick-action-row-btn">
            <span class="qa-badge-icon" style="background: rgba(17, 24, 39, 0.04); color: var(--primary);">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </span>
            <span class="qa-text">Yeni Ürün Ekle</span>
          </a>
          <a routerLink="/stock-movements" class="quick-action-row-btn">
            <span class="qa-badge-icon" style="background: rgba(5, 150, 105, 0.06); color: var(--status-instock);">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            </span>
            <span class="qa-text">Yeni Stok Hareketi</span>
          </a>
          <a routerLink="/stock-count" class="quick-action-row-btn">
            <span class="qa-badge-icon" style="background: rgba(217, 119, 6, 0.06); color: var(--status-lowstock);">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
            </span>
            <span class="qa-text">Stok Sayımı Başlat</span>
          </a>
          <button (click)="ui.isAiPanelOpen.set(true)" class="quick-action-row-btn">
            <span class="qa-badge-icon" style="background: rgba(147, 51, 234, 0.06); color: #9333ea;">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </span>
            <span class="qa-text">Yapay Zeka Asistanı</span>
          </button>
        </div>
      </div>

      <!-- ROW 3: Alerts & Lists -->
      <!-- DÜŞÜK STOK UYARILARI -->
      <div class="sidebar-card" style="grid-column: span 8; height: 285px; display: flex; flex-direction: column; padding: 1.25rem;">
        <h3 class="card-title">Düşük Stok Uyarıları</h3>
        <div class="scroll-list card-list" style="flex: 1; overflow-y: auto; margin-top: 0.5rem;">
          @for (p of state.products(); track p.id) {
            @if (p.status !== 'In stock') {
              <div class="list-item">
                <div class="list-item-name">
                  <strong>{{ p.name }}</strong>
                  <span>{{ p.sku }}</span>
                </div>
                <span class="badge" [class.badge-lowstock]="p.status === 'Low stock'" [class.badge-outstock]="p.status === 'Out of stock'">
                  {{ p.quantity }} Adet
                </span>
              </div>
            }
          }
          @if (state.lowStockCount() === 0 && state.outOfStockCount() === 0) {
            <div class="empty-state">🎉 Harika! Kritik veya tükenmiş stok bulunmuyor.</div>
          }
        </div>
      </div>

      <!-- EN ÇOK SATAN ÜRÜNLER -->
      <div class="sidebar-card" style="grid-column: span 8; height: 285px; display: flex; flex-direction: column; padding: 1.25rem;">
        <h3 class="card-title">En Çok Satan Ürünler</h3>
        <div class="scroll-list card-list" style="flex: 1; overflow-y: auto; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 12px;">
          @for (tp of topSellingProducts(); track tp.name) {
            <div class="top-selling-item" style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
                <span>{{ tp.name }}</span>
                <span style="font-family: var(--font-mono); color: var(--text-muted);">{{ tp.quantity }} Adet</span>
              </div>
              <div class="progress-bar-bg" style="width: 100%; height: 6px; background: var(--secondary); border-radius: 3px; overflow: hidden;">
                <div class="progress-bar-fill" [style.width.%]="tp.percentage" style="height: 100%; background: var(--primary); border-radius: 3px; transition: width 0.8s ease-out;"></div>
              </div>
            </div>
          }
          @if (topSellingProducts().length === 0) {
            <div class="empty-state">Satış verisi bulunmuyor.</div>
          }
        </div>
      </div>

      <!-- SON SİPARİŞLER -->
      <div class="sidebar-card" style="grid-column: span 8; display: flex; flex-direction: column; height: 285px; padding: 1.25rem;">
        <h3 class="card-title">Son Siparişler</h3>
        <div class="scroll-list card-list" style="flex: 1; overflow-y: auto; margin-top: 0.5rem;">
          @for (o of state.orders().slice(0, 5); track o.id) {
            <div class="list-item">
              <div class="list-item-name">
                <strong>{{ o.customerName }}</strong>
                <span>{{ o.orderNumber }} · {{ o.date | date:'dd.MM.yyyy' }}</span>
              </div>
              <div class="list-item-right">
                <strong class="mono" style="font-size:0.82rem;">₺{{ o.totalAmount }}</strong>
                <span class="sdot" [class.completed]="o.status === 'Completed'" [class.pending]="o.status === 'Pending'" [class.cancelled]="o.status === 'Cancelled'"></span>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit, AfterViewInit {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  
  aiPrompt = '';
  isBannerDismissed = false;
  isChartEmpty = false;

  @ViewChild('weeklyChart') weeklyCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryCanvas!: ElementRef<HTMLCanvasElement>;

  weeklyChartInstance: any = null;
  categoryChartInstance: any = null;

  topSellingProducts = computed(() => {
    const completedOrders = this.state.orders().filter(o => o.status === 'Completed');
    const productQuantities: Record<string, { name: string, quantity: number, totalAmount: number }> = {};
    for (const order of completedOrders) {
      for (const item of order.items) {
        if (!productQuantities[item.productId]) {
          productQuantities[item.productId] = { name: item.productName, quantity: 0, totalAmount: 0 };
        }
        productQuantities[item.productId].quantity += item.quantity;
        productQuantities[item.productId].totalAmount += item.quantity * item.price;
      }
    }
    const list = Object.values(productQuantities).sort((a, b) => b.quantity - a.quantity);
    const maxQty = list.length > 0 ? list[0].quantity : 1;
    return list.slice(0, 5).map(item => ({
      ...item,
      percentage: Math.round((item.quantity / maxQty) * 100)
    }));
  });

  ngOnInit() {
    this.isBannerDismissed = localStorage.getItem('ecelon_ai_banner_dismissed') === 'true';
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
  }

  dismissBanner(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.isBannerDismissed = true;
    localStorage.setItem('ecelon_ai_banner_dismissed', 'true');
  }

  ngAfterViewInit() {
    setTimeout(() => this.renderDashboardCharts(), 50);
  }

  renderDashboardCharts() {
    if (this.weeklyChartInstance) this.weeklyChartInstance.destroy();
    if (this.categoryChartInstance) this.categoryChartInstance.destroy();

    const labels: string[] = [];
    const entries: number[] = [];
    const exits: number[] = [];
    const daysMap: Record<string, { in: number, out: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      daysMap[key] = { in: 0, out: 0 };
      labels.push(d.toLocaleDateString('tr-TR', { weekday: 'short' }));
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    this.inventoryService.getStockMovements(undefined, 1, 100).subscribe(res => {
      const movements = res.data || [];
      for (const m of movements) {
        const mDate = new Date(m.createdAt);
        if (mDate.getTime() >= sevenDaysAgo.getTime()) {
          const key = mDate.toDateString();
          if (daysMap[key]) {
            const qty = m.quantity || 0;
            if (qty > 0) {
              daysMap[key].in += qty;
            } else {
              daysMap[key].out += Math.abs(qty);
            }
          }
        }
      }

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toDateString();
        entries.push(daysMap[key].in);
        exits.push(daysMap[key].out);
      }

      const isDataEmpty = entries.every(v => v === 0) && exits.every(v => v === 0);
      this.isChartEmpty = isDataEmpty;

      if (!isDataEmpty && this.weeklyCanvas) {
        const ctx = this.weeklyCanvas.nativeElement.getContext('2d');
        if (ctx) {
          this.weeklyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  label: 'Giriş',
                  data: entries,
                  backgroundColor: '#4F46E5', /* Indigo */
                  borderRadius: 3
                },
                {
                  label: 'Çıkış',
                  data: exits,
                  backgroundColor: '#8B5CF6', /* Violet */
                  borderRadius: 3
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: function(context: any) {
                      let label = context.dataset.label || '';
                      if (label) {
                        label += ': ';
                      }
                      if (context.parsed.y !== null) {
                        label += context.parsed.y + ' Adet';
                      }
                      return label;
                    }
                  }
                }
              },
              scales: {
                y: { 
                  beginAtZero: true, 
                  grid: { color: '#f3f4f6' }, 
                  ticks: { 
                    font: { size: 9, family: 'Inter' },
                    callback: function(value: any) {
                      return value + ' Adet';
                    }
                  } 
                },
                x: { grid: { display: false }, ticks: { font: { size: 9, family: 'Inter' } } }
              }
            }
          });
        }
      }
    });

    this.inventoryService.getCategoryDistributionReport().subscribe(catRes => {
      this.inventoryService.getCategories().subscribe(cats => {
        const catLabels = catRes.map(c => {
          const matched = cats.find(x => x.slug === c.category);
          return matched ? matched.name : c.category;
        });
        const catValues = catRes.map(c => c.totalStock);

        if (this.categoryCanvas) {
          const ctx = this.categoryCanvas.nativeElement.getContext('2d');
          if (ctx) {
            this.categoryChartInstance = new Chart(ctx, {
              type: 'doughnut',
              data: {
                labels: catLabels,
                datasets: [{
                  data: catValues,
                  backgroundColor: ['#4F46E5', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#E2E8F0'],
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9, family: 'Inter' } } }
                }
              }
            });
          }
        }
      });
    });
  }

  askQuestion(promptText: string) {
    if (!promptText.trim()) return;
    this.ui.isAiPanelOpen.set(true);
    this.ui.askQuestion(promptText);
    this.aiPrompt = '';
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.askQuestion(this.aiPrompt);
    }
  }
}
