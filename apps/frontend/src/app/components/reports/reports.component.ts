import { Component, inject, signal, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
        <div class="table-card" style="margin: 0;">
          <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--secondary);">
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
        <div class="table-card" style="margin: 0;">
          <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--secondary);">
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
    }
  `,
  styles: [`
    .reports-grid-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--secondary);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      box-shadow: var(--shadow-sm);
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
      background: var(--surface);
      border: 1px solid var(--secondary);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      box-shadow: var(--shadow-sm);
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
  `]
})
export class ReportsComponent implements OnInit, AfterViewInit {
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);

  @ViewChild('catChart') catCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topChart') topCanvas!: ElementRef<HTMLCanvasElement>;

  catChartInstance: any = null;
  topChartInstance: any = null;

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
              backgroundColor: ['#111827', '#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB'],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Inter', size: 11 } } }
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
              backgroundColor: '#111827',
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
              y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { family: 'Inter' } } },
              x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } }
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
}
