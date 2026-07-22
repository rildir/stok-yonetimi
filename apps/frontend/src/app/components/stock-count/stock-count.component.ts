import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { AppStateService } from '../../services/app-state.service';

interface StockCountItem {
  productId: string;
  productName: string;
  sku: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  unit: string;
  isModified?: boolean;
}

interface StockCount {
  id: string;
  countNumber: string;
  status: 'InProgress' | 'Completed';
  items: StockCountItem[];
  startedAt: string;
  completedAt?: string;
  performedBy: string;
  notes?: string;
  createdAt: string;
}

@Component({
  selector: 'app-stock-count',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    /* OVERLAY */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
    }

    /* PANEL */
    .drawer-panel {
      position: relative;
      width: 500px;
      height: 100vh;
      background: #fff;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.25s ease;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }

    /* HEADER */
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #f0f0f0;
      flex-shrink: 0;
    }

    .drawer-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .drawer-close {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      border-radius: 6px;
      font-size: 20px;
      color: #999;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .drawer-close:hover {
      background: #f5f5f5;
      color: #1a1a1a;
    }

    /* BODY */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .drawer-field {
      margin-bottom: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .drawer-field label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: none;
      letter-spacing: 0.5px;
    }

    .drawer-field span {
      font-size: 0.88rem;
      color: var(--text-primary);
    }

    .drawer-field .notes-box {
      background-color: var(--canvas);
      padding: 10px;
      border-radius: 6px;
      border: 1px dashed var(--secondary);
      font-style: italic;
    }

    .drawer-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.8rem;
    }

    .drawer-table th {
      text-align: left;
      padding: 8px 16px;
      background-color: var(--canvas);
      border-bottom: 2px solid var(--border-color);
      color: var(--text-muted);
      font-weight: bold;
      font-size: 11px;
      text-transform: none;
      letter-spacing: 0.05em;
    }

    .drawer-table td {
      padding: 8px;
      border-bottom: 1px solid var(--secondary);
      vertical-align: middle;
    }

    /* Active count page styles */
    .active-count-wrapper {
      background-color: var(--surface);
      border: 1px solid var(--secondary);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .active-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--secondary);
      padding-bottom: 0.75rem;
    }

    .active-header h3 {
      font-size: 1.1rem;
      margin: 0;
    }

    .active-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .diff-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-family: var(--font-mono);
      font-size: 0.75rem;
    }

    .diff-pos { background-color: rgba(5, 150, 105, 0.1); color: #059669; }
    .diff-neg { background-color: rgba(220, 38, 38, 0.1); color: #dc2626; }
    .diff-zero { background-color: #f1f5f9; color: #475569; }

    .qty-input {
      width: 80px;
      height: 32px;
      padding: 4px 8px;
      border: 1.5px solid var(--secondary);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      text-align: center;
      outline: none;
      transition: border-color 0.2s;
    }

    .qty-input:focus {
      border-color: var(--primary);
    }

    .zero-stock-row {
      background-color: #fffbeb !important;
    }
    .zero-stock-row:hover td {
      background-color: #fef3c7 !important;
    }

    .zero-stock-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      background-color: #fef3c7;
      color: #d97706;
      border: 1px solid #fcd34d;
      margin-left: 8px;
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>Stok Sayımı</h1>
        <p>Depodaki fiziksel ürün miktarlarını sayın, farkları tespit edin ve sistemi güncelleyin.</p>
      </div>
      <div class="header-actions">
        @if (!activeCount()) {
          <button class="btn btn-primary" (click)="startNewCount()">Yeni Sayım Başlat</button>
        }
      </div>
    </header>

    <!-- ─── Active In-Progress Count Session ─── -->
    @if (activeCount()) {
      <div class="active-count-wrapper">
        <div class="active-header">
          <div>
            <h3 class="mono">{{ activeCount()?.countNumber }}</h3>
            <span style="font-size: 0.75rem; color: var(--text-muted)">
              Başlangıç: {{ activeCount()?.startedAt | date:'dd.MM.yyyy HH:mm' }} · Yapan: {{ activeCount()?.performedBy }}
            </span>
          </div>
          <div style="display:flex; gap:8px">
            <button class="btn btn-outline btn-sm" (click)="saveDraft()" [disabled]="isActionLoading()">Sayımı Kaydet</button>
            <button class="btn btn-primary btn-sm" (click)="promptComplete()" [disabled]="isActionLoading()">Sayımı Tamamla</button>
          </div>
        </div>

        <div class="drawer-field">
          <label for="countNotes">Sayım notları (opsiyonel)</label>
          <input id="countNotes" type="text" [(ngModel)]="activeNotes" class="form-input" style="height:42px" placeholder="örn. A reyonu genel sayımı" [disabled]="isActionLoading()" />
        </div>

        <!-- Progress Indicator -->
        <div class="progress-container" style="background: var(--canvas); border: 1px solid var(--secondary); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.5rem;">
          <div class="progress-info" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary)">
              İlerleme: <span class="mono">{{ countedItemsCount() }}</span> / <span class="mono">{{ totalItemsCount() }}</span> ürün sayıldı
            </span>
            <span class="mono" style="font-size: 0.85rem; font-weight: 700; color: var(--primary)">
              {{ progressPercentage() }}%
            </span>
          </div>
          <div class="progress-bar-bg" style="width: 100%; height: 8px; background-color: var(--secondary); border-radius: 4px; overflow: hidden; position: relative;">
            <div class="progress-bar-fill" [style.width.%]="progressPercentage()" style="height: 100%; background: linear-gradient(90deg, var(--primary) 0%, #8b5cf6 100%); border-radius: 4px; transition: width 0.3s ease;"></div>
          </div>
        </div>

        <div class="table-card" style="margin: 0; box-shadow: none; border: 1px solid var(--secondary)">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ürün Adı</th>
                  <th>SKU</th>
                  <th>Birim</th>
                  <th style="width: 120px;">Sistem stoku</th>
                  <th style="width: 120px; text-align: center;">Sayılan stok</th>
                  <th style="width: 100px;">Fark</th>
                </tr>
              </thead>
              <tbody>
                @for (item of activeItems(); track item.productId) {
                  <tr [class.zero-stock-row]="item.systemQuantity === 0">
                    <td>
                      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <strong>{{ item.productName }}</strong>
                        @if (item.systemQuantity === 0) {
                          <span class="zero-stock-badge">Sistemde stok yok</span>
                        }
                      </div>
                    </td>
                    <td class="mono" style="color: var(--text-primary);">{{ item.sku }}</td>
                    <td>{{ item.unit || 'Adet' }}</td>
                    <td class="mono">{{ item.systemQuantity }}</td>
                    <td style="text-align: center;">
                      <input type="number" [(ngModel)]="item.countedQuantity" (ngModelChange)="onCountedChange(item)" class="qty-input" min="0" [disabled]="isActionLoading()" />
                    </td>
                    <td>
                      <span class="diff-badge" [class.diff-pos]="item.difference > 0" [class.diff-neg]="item.difference < 0" [class.diff-zero]="item.difference === 0">
                        {{ item.difference > 0 ? '+' : '' }}{{ item.difference }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }

    <!-- ─── Count History ─── -->
    <div class="table-card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Sayım No</th>
              <th>Tarih</th>
              <th>Yapan</th>
              <th>Durum</th>
              <th>Kalem sayısı</th>
              <th>Notlar</th>
              <th class="th-actions">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            @for (c of counts(); track c.id) {
              <tr>
                <td class="mono"><strong>{{ c.countNumber }}</strong></td>
                <td>{{ (c.completedAt || c.startedAt) | date:'dd.MM.yyyy HH:mm' }}</td>
                <td>{{ c.performedBy }}</td>
                <td>
                  <span class="badge" [class.badge-instock]="c.status === 'Completed'" [class.badge-lowstock]="c.status === 'InProgress'">
                    {{ c.status === 'Completed' ? 'Tamamlandı' : 'Devam ediyor' }}
                  </span>
                </td>
                <td class="mono">{{ c.items.length }}</td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {{ c.notes || '-' }}
                </td>
                <td class="td-actions">
                  @if (c.status === 'InProgress') {
                    <button class="btn btn-outline btn-xs" (click)="resumeCount(c)" style="padding: 4px 8px; font-size:0.75rem">Devam Et</button>
                  } @else {
                    <button class="btn btn-outline btn-xs" (click)="viewDetails(c)" style="padding: 4px 8px; font-size:0.75rem">Detay</button>
                  }
                </td>
              </tr>
            }
            @if (counts().length === 0) {
              <tr><td colspan="7" class="empty-state">Henüz envanter sayımı yapılmamış.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Complete Confirmation Modal ─── -->
    @if (showCompleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="showCompleteModal.set(false)" [disabled]="isActionLoading()">✕</button>
            <div class="delete-icon" style="background-color: rgba(17, 24, 39, 0.05); color: var(--primary)">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <h3 class="delete-modal-title">Sayımı Onayla ve Tamamla</h3>
            <p class="delete-modal-desc" style="font-size:0.85rem">
              Sayımı tamamladıktan sonra düzenleme yapılamaz. Devam edilsin mi?
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="showCompleteModal.set(false)" [disabled]="isActionLoading()">İptal</button>
            <button class="btn btn-primary" (click)="completeCount()" [disabled]="isActionLoading()">
              @if (isActionLoading()) { <span class="spinner-sm spinner-light"></span> Onaylanıyor... } @else { Onayla }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Historical Details Drawer ─── -->
    @if (selectedCount()) {
      <div class="drawer-overlay" (click)="selectedCount.set(null)">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">Sayım Detayları</span>
            <button class="drawer-close" (click)="selectedCount.set(null)">×</button>
          </div>
          
          <div class="drawer-body">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem">
              <div class="drawer-field">
                <label>Sayım no</label>
                <span class="mono" style="font-weight:700">{{ selectedCount()?.countNumber }}</span>
              </div>
              <div class="drawer-field">
                <label>Yapan</label>
                <span>{{ selectedCount()?.performedBy }}</span>
              </div>
              <div class="drawer-field">
                <label>Başlangıç</label>
                <span>{{ selectedCount()?.startedAt | date:'dd.MM.yyyy HH:mm' }}</span>
              </div>
              <div class="drawer-field">
                <label>Tamamlanma</label>
                <span>{{ selectedCount()?.completedAt ? (selectedCount()?.completedAt | date:'dd.MM.yyyy HH:mm') : '-' }}</span>
              </div>
            </div>

            <div class="drawer-field">
              <label>Notlar</label>
              <div class="notes-box">{{ selectedCount()?.notes || 'Not eklenmemiş.' }}</div>
            </div>

            <div class="drawer-field" style="margin-top:1.5rem">
              <label>Sayılan kalemler</label>
              <table class="drawer-table">
                <thead>
                  <tr>
                    <th>Ürün Adı</th>
                    <th>SKU</th>
                    <th>Sistem</th>
                    <th>Sayılan</th>
                    <th>Fark</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of selectedCount()?.items; track item.productId) {
                    <tr [class.zero-stock-row]="item.systemQuantity === 0">
                      <td>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                          <strong>{{ item.productName }}</strong>
                          @if (item.systemQuantity === 0) {
                            <span class="zero-stock-badge">Sistemde stok yok</span>
                          }
                        </div>
                      </td>
                      <td class="mono" style="color: var(--text-primary);">{{ item.sku }}</td>
                      <td class="mono">{{ item.systemQuantity }}</td>
                      <td class="mono">{{ item.countedQuantity }}</td>
                      <td>
                        <span class="diff-badge" [class.diff-pos]="item.difference > 0" [class.diff-neg]="item.difference < 0" [class.diff-zero]="item.difference === 0">
                          {{ item.difference > 0 ? '+' : '' }}{{ item.difference }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class StockCountComponent implements OnInit {
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);
  state = inject(AppStateService);

  counts = signal<StockCount[]>([]);
  activeCount = signal<StockCount | null>(null);
  activeItems = signal<StockCountItem[]>([]);
  activeNotes = '';

  selectedCount = signal<StockCount | null>(null);

  isActionLoading = signal(false);
  showCompleteModal = signal(false);

  countedItemsCount = computed(() => {
    return this.activeItems().filter((item) => item.isModified).length;
  });

  totalItemsCount = computed(() => {
    return this.activeItems().length;
  });

  progressPercentage = computed(() => {
    const total = this.totalItemsCount();
    if (total === 0) return 0;
    return Math.round((this.countedItemsCount() / total) * 100);
  });

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.inventoryService.getStockCounts().subscribe({
      next: (data) => {
        this.counts.set(data);
        // Find if there is an InProgress session
        const inProgress = data.find(c => c.status === 'InProgress');
        if (inProgress) {
          this.activeCount.set(inProgress);
          const clonedItems = JSON.parse(JSON.stringify(inProgress.items)).map((item: any) => ({
            ...item,
            isModified: item.difference !== 0
          }));
          this.activeItems.set(clonedItems);
          this.activeNotes = inProgress.notes || '';
        } else {
          this.activeCount.set(null);
          this.activeItems.set([]);
          this.activeNotes = '';
        }
      },
      error: () => {
        this.ui.showToast('Sayım geçmişi yüklenirken hata oluştu.', 'error');
      }
    });
  }

  startNewCount() {
    if (this.isActionLoading()) return;
    this.isActionLoading.set(true);

    this.inventoryService.createStockCount('').subscribe({
      next: (data) => {
        this.ui.showToast('Yeni sayım seansı başlatıldı.', 'success');
        this.isActionLoading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.ui.showToast('Yeni sayım başlatılırken hata oluştu.', 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  onCountedChange(item: StockCountItem) {
    const counted = Number(item.countedQuantity);
    item.difference = counted - item.systemQuantity;
    item.isModified = true;
    this.activeItems.set([...this.activeItems()]);
  }

  saveDraft() {
    const active = this.activeCount();
    if (!active || this.isActionLoading()) return;
    this.isActionLoading.set(true);

    this.inventoryService.updateStockCount(active.id, this.activeItems(), this.activeNotes).subscribe({
      next: () => {
        this.ui.showToast('Sayım taslağı kaydedildi.', 'success');
        this.isActionLoading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.ui.showToast('Taslak kaydedilirken hata oluştu.', 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  promptComplete() {
    this.showCompleteModal.set(true);
  }

  completeCount() {
    const active = this.activeCount();
    if (!active || this.isActionLoading()) return;
    this.isActionLoading.set(true);

    // Save draft first to ensure latest inputs are sent
    this.inventoryService.updateStockCount(active.id, this.activeItems(), this.activeNotes).subscribe({
      next: () => {
        // Complete the count session
        this.inventoryService.completeStockCount(active.id).subscribe({
          next: () => {
            this.ui.showToast('Sayım tamamlandı ve farklar stoklara uygulandı.', 'success');
            this.showCompleteModal.set(false);
            this.isActionLoading.set(false);
            this.activeCount.set(null);
            this.activeItems.set([]);
            // Force reload main products cache to show updated counts
            this.state.loadData();
            this.loadHistory();
          },
          error: () => {
            this.ui.showToast('Sayım tamamlanırken hata oluştu.', 'error');
            this.isActionLoading.set(false);
          }
        });
      },
      error: () => {
        this.ui.showToast('Sayım kaydedilirken hata oluştu.', 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  resumeCount(c: StockCount) {
    this.activeCount.set(c);
    const clonedItems = JSON.parse(JSON.stringify(c.items)).map((item: any) => ({
      ...item,
      isModified: item.difference !== 0
    }));
    this.activeItems.set(clonedItems);
    this.activeNotes = c.notes || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  viewDetails(c: StockCount) {
    this.selectedCount.set(c);
  }
}
