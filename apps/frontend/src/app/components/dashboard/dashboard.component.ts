import { Component, inject, ViewChild, ElementRef, signal, computed, OnInit, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <div>
        <h1>Panel Özeti</h1>
        <p>İşletmenizin anlık durumunu ve stok analizlerini takip edin.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" (click)="ui.toggleAiPanel()">
          <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Yapay Zeka Asistanı
        </button>
      </div>
    </header>

    <section class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-box products">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <span class="stat-label">Toplam Ürün</span>
          <div class="stat-value">{{ state.totalProducts() }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box lowstock">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </div>
        <div>
          <span class="stat-label">Kritik Stok</span>
          <div class="stat-value low">{{ state.lowStockCount() }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box outstock">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <span class="stat-label">Tükenen Ürün</span>
          <div class="stat-value out">{{ state.outOfStockCount() }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box revenue">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"/></svg>
        </div>
        <div>
          <span class="stat-label">Toplam Gelir</span>
          <div class="stat-value good">₺{{ state.totalRevenue().toLocaleString('tr-TR', { minimumFractionDigits: 2 }) }}</div>
        </div>
      </div>
    </section>

    <div class="dashboard-layout">
      <!-- SOL KOLON (AI chat alanı) -->
      <div class="dashboard-main">
        <!-- Dashboard Charts -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; flex-shrink: 0;">
          <div class="sidebar-card" style="padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; height: 285px;">
            <h4 style="font-size: 0.85rem; font-weight: 700; margin: 0;">Son 7 Günün Stok Hareketi</h4>
            <div style="flex: 1; position: relative; width: 100%; height: 100%;">
              <canvas #weeklyChart></canvas>
            </div>
          </div>
          <div class="sidebar-card" style="padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; height: 285px;">
            <h4 style="font-size: 0.85rem; font-weight: 700; margin: 0;">Kategori Bazlı Dağılım</h4>
            <div style="flex: 1; position: relative; width: 100%; height: 100%; padding: 1rem;">
              <canvas #categoryChart></canvas>
            </div>
          </div>
        </div>

        <div class="ai-container" style="flex: 1;">
          <!-- Header -->
          <div class="ai-header">
            <div class="ai-header-left">
              <span class="ai-spark">✦</span>
              <span class="ai-title-text">Asistan</span>
            </div>
            <div class="ai-header-right">
              <span class="online-dot"></span>
              <span class="online-text">Çevrimiçi</span>
            </div>
          </div>

          <!-- Messages -->
          <div class="ai-messages" #dbChatBody>
            @if (!hasUserMessages()) {
              <!-- Empty State -->
              <div class="ai-empty">
                <p class="ai-hint">Stok durumu, satış analizi veya sipariş özeti sorabilirsiniz.</p>
                <div class="ai-chips">
                  <button class="ai-chip" (click)="askQuestion('Kritik stoklar')" [disabled]="ui.isAiLoading()">
                    Kritik stoklar
                  </button>
                  <button class="ai-chip" (click)="askQuestion('Bu haftanın siparişleri')" [disabled]="ui.isAiLoading()">
                    Bu haftanın siparişleri
                  </button>
                  <button class="ai-chip" (click)="askQuestion('En çok satan ürün')" [disabled]="ui.isAiLoading()">
                    En çok satan ürün
                  </button>
                </div>
              </div>
            } @else {
              <!-- Message List -->
              @for (msg of ui.activeMessages(); track msg.id; let isLast = $last) {
                @if (msg.id !== 'welcome_' + ui.activeSessionId()) {
                  @if (msg.sender === 'user') {
                    <div class="user-message">
                      <div class="user-message-bubble">
                        {{ msg.text }}
                      </div>
                    </div>
                  } @else if (msg.text || (msg.card && (msg.card.description || msg.card.thinking))) {
                    <div class="ai-message">
                      <div class="ai-message-meta">
                        <span>✦</span>
                        <span>{{ msg.timestamp | date:'HH:mm' }}</span>
                      </div>
                      <div class="ai-message-bubble">
                        @if (msg.card) {
                          <div class="answer-card">
                            <div class="answer-card-header">
                              <h4>{{ msg.card.title }}</h4>
                            </div>
                            
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
                          <p>{{ msg.text }}</p>
                        }
                      </div>
                    </div>
                  }
                }
              }
            }
            
            @if (ui.isAiThinking()) {
              <div class="ai-message">
                <div class="ai-message-meta">
                  <span>✦</span>
                  <span>Analiz ediliyor...</span>
                </div>
                <div class="ai-message-bubble">
                  <div class="typing-dots">
                    <span class="typing-dot">.</span>
                    <span class="typing-dot">.</span>
                    <span class="typing-dot">.</span>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Input Wrapper -->
          <div class="ai-input-wrapper">
            <textarea 
              class="ai-input" 
              placeholder="Bir şey sor..." 
              [(ngModel)]="aiPrompt" 
              (keydown)="onKeydown($event)"
              [disabled]="ui.isAiLoading()">
            </textarea>
            <button 
              class="ai-send" 
              (click)="askQuestion(aiPrompt)" 
              [disabled]="ui.isAiLoading() || !aiPrompt.trim()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- SAĞ KOLON (Düşük Stok + Son Siparişler) -->
      <div class="dashboard-sidebar">
        <div class="sidebar-card">
          <h3 class="card-title">Düşük Stok Uyarıları</h3>
          <div class="scroll-list card-list">
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

        <div class="sidebar-card">
          <h3 class="card-title">Son Siparişler</h3>
          <div class="scroll-list card-list">
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
    </div>
  `
})
export class DashboardComponent implements OnInit, AfterViewInit {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  
  aiPrompt = '';

  @ViewChild('weeklyChart') weeklyCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryCanvas!: ElementRef<HTMLCanvasElement>;

  weeklyChartInstance: any = null;
  categoryChartInstance: any = null;

  hasUserMessages = computed(() => {
    return this.ui.activeMessages().some(m => m.sender === 'user');
  });

  @ViewChild('dbChatBody') private dbChatBodyContainer!: ElementRef;

  constructor() {
    effect(() => {
      const count = this.ui.activeMessages().length;
      const loading = this.ui.isAiLoading();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  ngOnInit() {
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
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

      if (this.weeklyCanvas) {
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
                  backgroundColor: '#111827',
                  borderRadius: 3
                },
                {
                  label: 'Çıkış',
                  data: exits,
                  backgroundColor: '#6B7280',
                  borderRadius: 3
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 9, family: 'Inter' } } },
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
                  backgroundColor: ['#111827', '#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB'],
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
    if (!promptText.trim() || this.ui.isAiLoading()) return;
    this.ui.askQuestion(promptText, false); // false keeps panel closed, streams inline
    this.aiPrompt = '';
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.askQuestion(this.aiPrompt);
    }
  }

  scrollToBottom(): void {
    try {
      this.dbChatBodyContainer.nativeElement.scrollTop = this.dbChatBodyContainer.nativeElement.scrollHeight;
    } catch(err) {
      // Ignore scroll errors on early ticks
    }
  }
}
