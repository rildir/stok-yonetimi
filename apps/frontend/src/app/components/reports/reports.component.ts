import { Component, inject, signal, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <div>
        <h1>Raporlar & Analiz</h1>
        <p>İşletmenizin stok hareketleri, satış grafikleri ve tedarik maliyeti raporları.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" (click)="exportToCsv()" [disabled]="isLoading()">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4-4v12"/></svg>
          CSV Raporu İndir
        </button>
      </div>
    </header>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="date-filters" style="padding: 0.4rem 0.85rem;">
        <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-right: 0.25rem;">Tarih Aralığı:</span>
        <input type="date" class="date-input" [(ngModel)]="startDate" title="Başlangıç Tarihi" />
        <span class="date-separator">-</span>
        <input type="date" class="date-input" [(ngModel)]="endDate" title="Bitiş Tarihi" />
      </div>
      <button class="btn btn-outline" (click)="loadReports()">Uygula</button>
      <button class="btn btn-outline btn-xs" *ngIf="startDate || endDate" (click)="clearFilters()" style="padding: 0.5rem 0.75rem;">Filtreleri Temizle</button>
    </div>

    @if (isLoading()) {
      <div class="loading-state" style="padding: 4rem 0;">Veriler Hesaplanıyor...</div>
    } @else {
      <!-- Summary Metrics Cards -->
      <div class="reports-grid-metrics">
        <div class="metric-card">
          <span class="m-label">Toplam Stok Girişi</span>
          <h2 class="m-val text-success">+{{ summary().totalIn | number }}</h2>
          <p class="m-desc">Seçilen dönemde depoya giren toplam ürün</p>
        </div>
        <div class="metric-card">
          <span class="m-label">Toplam Stok Çıkışı</span>
          <h2 class="m-val text-danger">-{{ summary().totalOut | number }}</h2>
          <p class="m-desc">Seçilen dönemde depodan çıkan toplam ürün</p>
        </div>
        <div class="metric-card">
          <span class="m-label">Net Stok Değişimi</span>
          <h2 class="m-val" [class.text-success]="summary().netChange > 0" [class.text-danger]="summary().netChange < 0">
            {{ summary().netChange > 0 ? '+' : '' }}{{ summary().netChange | number }}
          </h2>
          <p class="m-desc">Depodaki toplam ürün değişimi</p>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="reports-grid-charts">
        <div class="report-chart-card">
          <h3 class="card-title">Kategori Dağılımı (Mali Değer)</h3>
          <p class="card-subtitle">Kategorilerin toplam stok maliyetine göre dağılımı.</p>
          <div class="chart-container">
            <canvas #catChart></canvas>
          </div>
        </div>
        <div class="report-chart-card">
          <h3 class="card-title">En Çok Satan Ürünler</h3>
          <p class="card-subtitle">Seçilen dönemde en yüksek sipariş adedine ulaşan 10 ürün.</p>
          <div class="chart-container">
            <canvas #topChart></canvas>
          </div>
        </div>
      </div>

      <!-- Tables Section -->
      <div class="reports-grid-tables" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
        
        <!-- Product Movements Table -->
        <div class="table-card" style="margin: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
          <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid #D5D9D9;">
            <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">Ürün Bazlı Hareket Detayları</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Her ürün için toplam giriş-çıkış adetleri.</p>
          </div>
          <div class="table-scroll" style="max-height: 350px;">
            <table>
              <thead>
                <tr>
                  <th>Ürün Adı</th>
                  <th class="text-right">Toplam Giriş</th>
                  <th class="text-right">Toplam Çıkış</th>
                  <th class="text-right">Net Değişim</th>
                </tr>
              </thead>
              <tbody>
                @for (p of productMovements(); track p.productId) {
                  <tr>
                    <td class="font-medium">{{ p.productName }}</td>
                    <td class="text-right text-success">+{{ p.totalIn }}</td>
                    <td class="text-right text-danger">-{{ p.totalOut }}</td>
                    <td class="text-right font-medium" [class.text-success]="p.totalIn - p.totalOut > 0" [class.text-danger]="p.totalIn - p.totalOut < 0">
                      {{ p.totalIn - p.totalOut }}
                    </td>
                  </tr>
                }
                @if (productMovements().length === 0) {
                  <tr>
                    <td colspan="4" class="text-muted text-center" style="padding: 1.5rem;">Stok hareketi bulunamadı.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Supplier summary -->
        <div class="table-card" style="margin: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
          <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid #D5D9D9;">
            <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">Tedarikçi Satın Alma Raporu</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Tedarikçilere verilen sipariş adetleri ve maliyetler.</p>
          </div>
          <div class="table-scroll" style="max-height: 350px;">
            <table>
              <thead>
                <tr>
                  <th>Tedarikçi Firması</th>
                  <th class="text-right">PO Sayısı</th>
                  <th class="text-right">Toplam Ödeme</th>
                </tr>
              </thead>
              <tbody>
                @for (s of supplierSummary(); track s.supplierName) {
                  <tr>
                    <td class="font-medium">{{ s.supplierName }}</td>
                    <td class="text-right font-medium mono">{{ s.poCount }}</td>
                    <td class="text-right font-medium mono">₺{{ s.totalAmount | number:'1.2-2' }}</td>
                  </tr>
                }
                @if (supplierSummary().length === 0) {
                  <tr>
                    <td colspan="3" class="text-muted text-center" style="padding: 1.5rem;">Satın alma kaydı bulunamadı.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- AI Demand Forecasting Section -->
      <div class="forecast-section" style="position: relative;">
        @if (ui.subscription().plan !== 'ultra') {
          <div class="forecast-lock-overlay" style="position: absolute; inset: 0; background: rgba(255,255,255,0.92); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(4px); border-radius: 8px; border: 1px dashed #D5D9D9; text-align: center; padding: 2rem;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔒</div>
            <h4 style="font-size: 1rem; font-weight: bold; margin: 0; color: #0F1111;">Talep Tahmini & AI Öngörü</h4>
            <p style="font-size: 0.8rem; color: #565959; max-width: 340px; margin: 8px 0 16px 0; line-height: 1.5;">Gelişmiş talep tahminleme ve yapay zeka destekli stok öngörüleri için Ultra Plan'a yükseltin.</p>
            <button class="btn btn-primary" (click)="router.navigate(['/billing'])" style="font-size: 0.8rem; padding: 6px 16px; border-radius: 20px; font-weight: bold;">Ultra Plan'a Yükselt</button>
          </div>
        }
        <div class="report-chart-card" style="grid-column: 1 / -1;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div>
              <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: var(--brand, #3ecf8e);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Talep Tahmini & AI Öngörü
              </h3>
              <p class="card-subtitle">Seçtiğiniz ürün için yapay zeka destekli talep analizi ve stok projeksiyonu.</p>
            </div>
            <div class="forecast-select">
              <select class="form-input form-select" style="height: 40px; padding: 0 36px 0 12px; font-size: 13px; min-width: 250px;" (change)="onForecastProductChange($event)" [disabled]="ui.subscription().plan !== 'ultra'">
                <option value="">Ürün Seçin...</option>
                @for (p of allProducts(); track p.id) {
                  <option [value]="p.id">{{ p.name }} ({{ p.sku }})</option>
                }
              </select>
            </div>
          </div>

          @if (forecastLoading()) {
            <div class="loading-state" style="padding: 3rem 0;">AI modeli analiz yapıyor...</div>
          } @else if (forecastData()) {
            <div class="forecast-grid">
              <div class="forecast-metric">
                <span class="fm-label">7 Günlük Tahmini Talep</span>
                <h2 class="fm-value">{{ forecastData().predictedDemand7Days }} Adet</h2>
              </div>
              <div class="forecast-metric">
                <span class="fm-label">30 Günlük Tahmini Talep</span>
                <h2 class="fm-value">{{ forecastData().predictedDemand30Days }} Adet</h2>
              </div>
              <div class="forecast-metric">
                <span class="fm-label">Önerilen Sipariş Miktarı</span>
                <h2 class="fm-value" style="color: var(--brand, #3ecf8e);">{{ forecastData().recommendedReorderQty }} Adet</h2>
              </div>
              <div class="forecast-metric">
                <span class="fm-label">Güvenilirlik</span>
                <h2 class="fm-value">
                  %{{ forecastData().confidence }}
                  <span class="confidence-badge" [class.high]="forecastData().confidence >= 60" [class.medium]="forecastData().confidence >= 40 && forecastData().confidence < 60" [class.low]="forecastData().confidence < 40">
                    {{ forecastData().confidence >= 60 ? 'Yüksek' : forecastData().confidence >= 40 ? 'Orta' : 'Düşük' }}
                  </span>
                </h2>
              </div>
            </div>

            <div class="forecast-insight">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="flex-shrink: 0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>{{ forecastData().insightText }}</span>
            </div>

            <div class="chart-container" style="height: 200px; margin-top: 1rem;">
              <canvas #forecastChart></canvas>
            </div>

            <div class="forecast-source" style="margin-top: 8px; text-align: right; font-size: 11px; color: var(--text-muted, #6b6b6b);">
              Kaynak: {{ forecastData().source === 'gemini' ? 'Gemini AI' : forecastData().source === 'ollama' ? 'Ollama (Yerel)' : 'İstatistiksel Model' }}
            </div>
          } @else {
            <div class="empty-state" style="padding: 3rem 0; color: var(--text-muted, #6b6b6b);">
              <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-bottom: 8px; opacity: 0.4;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <p>Talep tahmini görmek için yukarıdan bir ürün seçin.</p>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .reports-grid-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    .metric-card {
      background: #FFFFFF;
      border: 1px solid #D5D9D9;
      border-radius: 8px;
      padding: 1.5rem;
    }
    .m-label {
      font-family: var(--font-heading);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .m-val {
      font-family: var(--font-mono);
      font-size: 2rem;
      font-weight: 700;
      margin: 0.5rem 0;
      letter-spacing: -1px;
    }
    .m-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin: 0;
    }
    .reports-grid-charts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }
    .report-chart-card {
      background: #FFFFFF;
      border: 1px solid #D5D9D9;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
    }
    .chart-container {
      position: relative;
      height: 250px;
      margin-top: 1.5rem;
      width: 100%;
    }
    .text-success { color: var(--status-instock); }
    .text-danger { color: var(--status-outstock); }
    
    @media (max-width: 1024px) {
      .reports-grid-metrics, .reports-grid-charts, .reports-grid-tables {
        grid-template-columns: 1fr !important;
      }
    }

    /* Forecast Section */
    .forecast-section {
      margin-top: 1.5rem;
    }
    .forecast-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }
    .forecast-metric {
      background: #FFFFFF;
      border: 1px solid #D5D9D9;
      border-radius: 8px;
      padding: 1rem 1.25rem;
    }
    .fm-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted, #6b6b6b);
    }
    .fm-value {
      font-family: var(--font-mono, monospace);
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0.3rem 0 0 0;
      color: var(--text-primary, #0F1111);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .confidence-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .confidence-badge.high { background: rgba(0, 113, 133, 0.1); color: #007185; }
    .confidence-badge.medium { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .confidence-badge.low { background: rgba(177, 39, 4, 0.1); color: #B12704; }
    .forecast-insight {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 1rem;
      padding: 12px 16px;
      background: #F7FAFA;
      border: 1px solid #D5D9D9;
      border-radius: 8px;
      font-size: 0.85rem;
      color: var(--text-secondary, #565959);
      line-height: 1.5;
    }
    @media (max-width: 768px) {
      .forecast-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `]
})
export class ReportsComponent implements OnInit, AfterViewInit {
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);
  router = inject(Router);

  @ViewChild('catChart') catCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topChart') topCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('forecastChart') forecastCanvas!: ElementRef<HTMLCanvasElement>;

  catChartInstance: any = null;
  topChartInstance: any = null;
  forecastChartInstance: any = null;

  // Forecast
  allProducts = signal<any[]>([]);
  forecastLoading = signal(false);
  forecastData = signal<any>(null);
  selectedForecastProductId = signal<string | null>(null);

  isLoading = signal(true);
  
  // Date range inputs
  startDate = '';
  endDate = '';

  // Data signals
  summary = signal<{ totalIn: number, totalOut: number, netChange: number }>({ totalIn: 0, totalOut: 0, netChange: 0 });
  productMovements = signal<any[]>([]);
  categoriesDistribution = signal<any[]>([]);
  topSelling = signal<any[]>([]);
  supplierSummary = signal<any[]>([]);
  categories = signal<any[]>([]);

  ngOnInit() {
    this.loadCategories();
    this.loadReports();
    this.loadAllProducts();
  }

  ngAfterViewInit() {
    // Render charts once data is loaded and views are checked
  }

  loadCategories() {
    this.inventoryService.getCategories().subscribe(cats => {
      this.categories.set(cats);
    });
  }

  getCategoryName(slug: string): string {
    return this.categories().find(c => c.slug === slug)?.name || slug || 'Diğer';
  }

  clearFilters() {
    this.startDate = '';
    this.endDate = '';
    this.loadReports();
  }

  loadReports() {
    this.isLoading.set(true);
    
    // Call all reporting endpoints
    this.inventoryService.getStockSummary(this.startDate, this.endDate).subscribe(summaryRes => {
      this.summary.set(summaryRes);
      
      this.inventoryService.getProductMovementsReport(this.startDate, this.endDate).subscribe(movementsRes => {
        this.productMovements.set(movementsRes);
        
        this.inventoryService.getCategoryDistributionReport().subscribe(catRes => {
          this.categoriesDistribution.set(catRes);
          
          this.inventoryService.getTopSellingReport(30).subscribe(topRes => {
            this.topSelling.set(topRes);
            
            this.inventoryService.getSupplierSummaryReport().subscribe(supRes => {
              this.supplierSummary.set(supRes);
              this.isLoading.set(false);
              
              // Trigger chart rendering in next tick after loading is set to false
              setTimeout(() => this.renderCharts(), 50);
            });
          });
        });
      });
    });
  }

  renderCharts() {
    if (this.catChartInstance) this.catChartInstance.destroy();
    if (this.topChartInstance) this.topChartInstance.destroy();

    const catData = this.categoriesDistribution();
    const catLabels = catData.map(c => this.getCategoryName(c.category));
    const catValues = catData.map(c => c.totalValue);

    if (this.catCanvas) {
      const ctx = this.catCanvas.nativeElement.getContext('2d');
      if (ctx) {
        this.catChartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: catLabels,
            datasets: [{
              data: catValues,
              backgroundColor: ['#131921', '#232F3E', '#FFD814', '#F7CA00', '#B12704', '#D5D9D9'],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Amazon Ember, Arial, sans-serif', size: 11 } } }
            }
          }
        });
      }
    }

    const topData = this.topSelling();
    const topLabels = topData.map(t => t.productName.length > 15 ? t.productName.substring(0, 13) + '..' : t.productName);
    const topValues = topData.map(t => t.totalQty);

    if (this.topCanvas) {
      const ctx = this.topCanvas.nativeElement.getContext('2d');
      if (ctx) {
        this.topChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: topLabels,
            datasets: [{
              label: 'Satış Adedi',
              data: topValues,
              backgroundColor: '#232F3E',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { family: 'Amazon Ember, Arial, sans-serif' } } },
              x: { grid: { display: false }, ticks: { font: { family: 'Amazon Ember, Arial, sans-serif', size: 10 } } }
            }
          }
        });
      }
    }
  }

  exportToCsv() {
    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    
    // 1. Stock Summary Section
    csvContent += 'STOK HAREKET OZETI\r\n';
    csvContent += `Toplam Stok Girisi;${this.summary().totalIn}\r\n`;
    csvContent += `Toplam Stok Cikisi;${this.summary().totalOut}\r\n`;
    csvContent += `Net Degisim;${this.summary().netChange}\r\n\r\n`;

    // 2. Product movements report
    csvContent += 'URUN BAZLI HAREKETLER\r\n';
    csvContent += 'Urun Adi;Giris Miktari;Cikis Miktari;Net Degisim\r\n';
    for (const item of this.productMovements()) {
      csvContent += `${item.productName};${item.totalIn};${item.totalOut};${item.totalIn - item.totalOut}\r\n`;
    }
    csvContent += '\r\n';

    // 3. Category distribution
    csvContent += 'KATEGORI BAZLI STOK DEGERLERI\r\n';
    csvContent += 'Kategori;Urun Sayisi;Toplam Stok;Toplam Deger (TL)\r\n';
    for (const item of this.categoriesDistribution()) {
      csvContent += `${this.getCategoryName(item.category)};${item.productCount};${item.totalStock};${item.totalValue}\r\n`;
    }
    csvContent += '\r\n';

    // 4. Supplier summary
    csvContent += 'TEDARIKCI BAZLI SATIN ALMA\r\n';
    csvContent += 'Tedarikci Adi;Siparis Sayisi;Toplam Odeme (TL)\r\n';
    for (const item of this.supplierSummary()) {
      csvContent += `${item.supplierName};${item.poCount};${item.totalAmount}\r\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = this.startDate || 'tum';
    const dateEndStr = this.endDate || 'donem';
    link.setAttribute('download', `Smart_Inventory_Rapor_${dateStr}_${dateEndStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ─── Forecast ─────────────────────────────────────────────────
  loadAllProducts() {
    this.inventoryService.getProducts().subscribe({
      next: (products) => this.allProducts.set(products),
    });
  }

  onForecastProductChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const productId = select.value;
    if (!productId) {
      this.forecastData.set(null);
      this.selectedForecastProductId.set(null);
      return;
    }
    this.selectedForecastProductId.set(productId);
    this.loadForecast(productId);
  }

  loadForecast(productId: string) {
    this.forecastLoading.set(true);
    this.forecastData.set(null);

    this.inventoryService.getAiForecast(productId).subscribe({
      next: (data) => {
        this.forecastData.set(data);
        this.forecastLoading.set(false);
        setTimeout(() => this.renderForecastChart(data), 50);
      },
      error: () => {
        this.forecastLoading.set(false);
        this.ui.showToast('Talep tahmini yüklenemedi.', 'error');
      }
    });
  }

  renderForecastChart(data: any) {
    if (this.forecastChartInstance) this.forecastChartInstance.destroy();
    if (!this.forecastCanvas) return;

    const ctx = this.forecastCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Generate a simple projection chart: current stock declining over 30 days
    const product = this.allProducts().find(p => p.id === this.selectedForecastProductId());
    const currentStock = product ? product.quantity : 0;
    const dailyDemand = data.predictedDemand30Days / 30;

    const labels: string[] = [];
    const stockProjection: number[] = [];
    const minLine: number[] = [];

    for (let day = 0; day <= 30; day += 3) {
      labels.push(day === 0 ? 'Bugün' : `${day}. gün`);
      stockProjection.push(Math.max(0, Math.round(currentStock - dailyDemand * day)));
      minLine.push(product ? product.minQuantity : 0);
    }

    this.forecastChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tahmini Stok',
            data: stockProjection,
            borderColor: '#007185',
            backgroundColor: 'rgba(0, 113, 133, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#007185',
          },
          {
            label: 'Kritik Seviye',
            data: minLine,
            borderColor: '#B12704',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { family: 'Amazon Ember, Arial, sans-serif', size: 11 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { family: 'Amazon Ember, Arial, sans-serif' }, color: '#565959' },
          },
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Amazon Ember, Arial, sans-serif', size: 10 }, color: '#565959' },
          },
        },
      },
    });
  }
}
