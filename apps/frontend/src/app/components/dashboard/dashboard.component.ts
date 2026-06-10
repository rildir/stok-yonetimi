import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
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

    <div class="dashboard-grid">
      <div class="card" style="grid-row: 1 / 3;">
        <h3 class="card-title">Hızlı Erişim Analizleri</h3>
        <p class="card-subtitle">Verileriniz üzerinde anlık sorgular gerçekleştirmek için sağdaki Yapay Zeka panelini kullanabilirsiniz.</p>
        <div class="suggestion-pills">
          <button class="pill-btn" (click)="ui.askQuestion('Geçen ay en az satan 5 ürünü listele')" [disabled]="ui.isAiLoading()">📉 Geçen ay en az satan 5 ürün hangileri?</button>
          <button class="pill-btn" (click)="ui.askQuestion('Kritik stok seviyesindeki ürünler')" [disabled]="ui.isAiLoading()">⚠️ Hangi ürünlerin stoku kritik seviyede?</button>
          <button class="pill-btn" (click)="ui.askQuestion('Genel satış durumunu göster')" [disabled]="ui.isAiLoading()">📈 Haftalık ciro ve satış durumu nedir?</button>
        </div>
        <div class="ai-cta">
          <div class="ai-cta-icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <h4>Soru Sorun, Cevabı Grafik Olarak Alın</h4>
          <p>Doğal dil sorguları sayesinde mini grafikler, tablolar ve finansal metrikler anında sağ panelde belirir.</p>
          <button class="btn btn-outline btn-sm" (click)="ui.toggleAiPanel()">Yapay Zeka Panelini Aç</button>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">Düşük Stok Uyarıları</h3>
        <div class="scroll-list">
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
      <div class="card">
        <h3 class="card-title">Son Siparişler</h3>
        <div class="scroll-list">
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
export class DashboardComponent {
  state = inject(AppStateService);
  ui = inject(UiStateService);

  ngOnInit() {
    // Only load if not already loaded, though App component loaded it.
    // Actually, AppStateService can load it.
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
  }
}
