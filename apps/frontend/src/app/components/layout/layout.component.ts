import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { UiStateService } from '../../services/ui-state.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div>
          <div class="sidebar-logo">
            <div class="logo-mark">S</div>
            <div class="logo-text">
              <h2>Smart Inventory</h2>
              <span>v1.2 · MONOCHROME</span>
            </div>
          </div>
          <nav class="nav-list">
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-btn">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"/></svg>
              Panel Özeti
            </a>
            <a routerLink="/products" routerLinkActive="active" class="nav-btn">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              Ürün Yönetimi
            </a>
            <a routerLink="/orders" routerLinkActive="active" class="nav-btn">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              Sipariş Takibi
            </a>
            <a routerLink="/settings" routerLinkActive="active" class="nav-btn">
              <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Ayarlar
            </a>
          </nav>
        </div>
        <div class="sidebar-footer">
          <div class="system-status">
            <span class="status-dot"></span> Sistem Çevrimiçi
          </div>
          <button class="logout-btn" (click)="doLogout()">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Çıkış Yap
          </button>
        </div>
      </aside>

      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      @if (ui.isAiPanelOpen()) {
        <div class="ai-panel-backdrop" (click)="ui.toggleAiPanel()"></div>
      }
      <aside class="ai-panel" [class.open]="ui.isAiPanelOpen()">
        <div class="ai-panel-header">
          <div class="ai-panel-title">
            <svg style="width:18px;height:18px;color:var(--ai-accent)" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            <h3>Yapay Zeka Asistanı</h3>
          </div>
          <button class="close-panel-btn" (click)="ui.toggleAiPanel()">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="ai-cards-body">
          @if (ui.isAiLoading()) {
            <div class="ai-loading"><div class="spinner"></div><p>Analiz ediliyor...</p></div>
          }
          @for (answer of ui.aiAnswers(); track answer.id) {
            <div class="answer-card">
              <div class="answer-card-header"><h4>{{ answer.title }}</h4><span class="time">{{ answer.timestamp | date:'HH:mm' }}</span></div>
              <p class="desc">{{ answer.description }}</p>
              @if (answer.type === 'metric' && answer.metrics) {
                <div class="metrics-stack">
                  @for (m of answer.metrics; track m.label) {
                    <div class="metric-row"><span class="label">{{ m.label }}</span><div><span class="value">{{ m.value }}</span>@if (m.change) {<span class="change" [class.positive]="m.isPositive" [class.negative]="!m.isPositive">{{ m.change }}</span>}</div></div>
                  }
                </div>
              }
              @if (answer.type === 'table' && answer.tableData) {
                <div class="answer-table-wrapper"><table><thead><tr>@for (h of answer.tableData.headers; track h) {<th>{{ h }}</th>}</tr></thead><tbody>@for (row of answer.tableData.rows; track $index) {<tr>@for (cell of row; track $index) {<td>{{ cell }}</td>}</tr>}</tbody></table></div>
              }
              @if (answer.type === 'chart' && answer.chartData) {
                <div class="chart-wrapper">
                  @if (answer.chartType === 'bar') {
                    <svg viewBox="0 0 320 180"><line x1="20" y1="30" x2="300" y2="30" stroke="#F3F4F6"/><line x1="20" y1="90" x2="300" y2="90" stroke="#F3F4F6"/><line x1="20" y1="150" x2="300" y2="150" stroke="#E5E7EB" stroke-width="1.5"/>@for (label of answer.chartData.labels; track label; let idx = $index) {<g><rect [attr.x]="30 + idx * 55" [attr.y]="getBarY(answer.chartData.datasets[0].data[idx], answer.chartData.datasets[0].data)" width="36" [attr.height]="getBarHeight(answer.chartData.datasets[0].data[idx], answer.chartData.datasets[0].data)" rx="3" fill="#4F46E5"/><text [attr.x]="48 + idx * 55" [attr.y]="getBarY(answer.chartData.datasets[0].data[idx], answer.chartData.datasets[0].data) - 6" text-anchor="middle" style="font-family:var(--font-mono);font-size:9px;font-weight:700" fill="#111827">{{ answer.chartData.datasets[0].data[idx] }}</text><text [attr.x]="48 + idx * 55" y="168" text-anchor="middle" style="font-size:8px;font-weight:500" fill="#6B7280">{{ label | slice:0:7 }}..</text></g>}</svg>
                  }
                  @if (answer.chartType === 'pie' || answer.chartType === 'doughnut') {
                    <svg viewBox="0 0 320 200"><g transform="translate(10, 0)">@for (sector of getPieSectors(answer.chartData.datasets[0].data); track sector.label) {<path [attr.d]="sector.d" [attr.fill]="sector.color"/>}@if (answer.chartType === 'doughnut') {<circle cx="100" cy="100" r="45" fill="#FFFFFF"/>}@for (label of answer.chartData.labels; track label; let idx = $index) {<g [attr.transform]="'translate(200, ' + (40 + idx * 24) + ')'"><rect width="10" height="10" rx="2" [attr.fill]="getPieSectors(answer.chartData.datasets[0].data)[idx].color"/><text x="16" y="9" style="font-size:9px;font-weight:500" fill="#111827">{{ label | slice:0:12 }} ({{ answer.chartData.datasets[0].data[idx] }})</text></g>}</g></svg>
                  }
                  @if (answer.chartType === 'line') {
                    <svg viewBox="0 0 300 160"><line x1="20" y1="40" x2="280" y2="40" stroke="#F3F4F6"/><line x1="20" y1="90" x2="280" y2="90" stroke="#F3F4F6"/><line x1="20" y1="140" x2="280" y2="140" stroke="#E5E7EB"/><path [attr.d]="getLinePath(answer.chartData.datasets[0].data)" fill="none" stroke="#4F46E5" stroke-width="2.5" stroke-linecap="round"/>@for (pt of getLinePoints(answer.chartData.datasets[0].data); track $index; let idx = $index) {<g><circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="4" fill="#4F46E5" stroke="#FFFFFF" stroke-width="1.5"/><text [attr.x]="pt.x" y="153" text-anchor="middle" style="font-size:8px;font-weight:500" fill="#6B7280">{{ answer.chartData.labels[idx] }}</text><text [attr.x]="pt.x" [attr.y]="pt.y - 8" text-anchor="middle" style="font-family:var(--font-mono);font-size:8px;font-weight:700" fill="#4F46E5">₺{{ pt.val }}</text></g>}</svg>
                  }
                </div>
              }
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
      </aside>
    </div>
  `
})
export class LayoutComponent {
  ui = inject(UiStateService);
  router = inject(Router);
  aiPrompt = '';

  doLogout() {
    localStorage.removeItem('isLoggedIn');
    this.ui.showToast('Çıkış yapıldı.', 'info');
    this.router.navigate(['/login']);
  }

  askQuestionAndClear() {
    if (!this.aiPrompt.trim()) return;
    this.ui.askQuestion(this.aiPrompt);
    this.aiPrompt = '';
  }

  // ───── SVG Chart Helpers ─────
  getBarHeight(val: number, data: number[]): number {
    const max = Math.max(...data, 1);
    return (val / max) * 120;
  }
  getBarY(val: number, data: number[]): number {
    return 150 - this.getBarHeight(val, data);
  }
  getPieSectors(data: number[]): { d: string; color: string; label: string; value: number }[] {
    const total = data.reduce((a, b) => a + b, 0);
    let accumulatedAngle = 0;
    const colors = ['#4F46E5', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'];
    return data.map((val, idx) => {
      const percentage = val / (total || 1);
      const angle = percentage * 360;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle = endAngle;
      const x1 = 100 + 80 * Math.cos((startAngle - 90) * Math.PI / 180);
      const y1 = 100 + 80 * Math.sin((startAngle - 90) * Math.PI / 180);
      const x2 = 100 + 80 * Math.cos((endAngle - 90) * Math.PI / 180);
      const y2 = 100 + 80 * Math.sin((endAngle - 90) * Math.PI / 180);
      const largeArc = angle > 180 ? 1 : 0;
      const d = `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { d, color: colors[idx % colors.length], label: `Item ${idx}`, value: val };
    });
  }
  getLinePath(data: number[]): string {
    if (data.length === 0) return '';
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1 || 1)) * 260 + 20;
      const y = 140 - ((val - min) / range) * 100;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  }
  getLinePoints(data: number[]): { x: number; y: number; val: number }[] {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    return data.map((val, idx) => {
      const x = (idx / (data.length - 1 || 1)) * 260 + 20;
      const y = 140 - ((val - min) / range) * 100;
      return { x, y, val };
    });
  }
}
