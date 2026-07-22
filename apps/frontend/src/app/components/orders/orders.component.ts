import { Component, inject, signal, computed, HostListener, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray, FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Order } from '../../inventory.service';
import { tap } from 'rxjs';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>Sipariş Takibi</h1>
        <p>Tüm siparişlerinizi, iadelerinizi ve müşteri taleplerini yönetin.</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-primary" (click)="openCreateOrder()">+ Yeni Sipariş</button>
        <div style="width: 1px; height: 20px; background-color: #D5D9D9; margin: 0 8px; align-self: center;"></div>
        <button class="btn btn-outline" (click)="ui.toggleAiPanel()">
          <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #9333ea; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Yapay Zeka Asistanı
        </button>
      </div>
    </header>

    <!-- Search & Filter Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Müşteri adı veya sipariş no ara..." [value]="orderSearch()" (input)="onSearchInput($event)"/>
      </div>
      
      <div class="date-filters" style="border: none; padding: 0; background: transparent; display: flex; align-items: center; gap: 8px;">
        <input 
          type="text" 
          placeholder="Başlangıç tarihi" 
          style="width: 130px; padding: 0.55rem 0.75rem; border: 1px solid var(--secondary); border-radius: var(--radius-md); font-size: 0.85rem; font-family: var(--font-body); outline: none; background: var(--surface); color: var(--text-primary); transition: border-color 0.15s;"
          onfocus="(this.type='date')" 
          onblur="if(!this.value)this.type='text'"
          [ngModel]="startDate()" 
          (ngModelChange)="startDate.set($event)" 
        />
        <span class="date-separator">-</span>
        <input 
          type="text" 
          placeholder="Bitiş tarihi" 
          style="width: 130px; padding: 0.55rem 0.75rem; border: 1px solid var(--secondary); border-radius: var(--radius-md); font-size: 0.85rem; font-family: var(--font-body); outline: none; background: var(--surface); color: var(--text-primary); transition: border-color 0.15s;"
          onfocus="(this.type='date')" 
          onblur="if(!this.value)this.type='text'"
          [ngModel]="endDate()" 
          (ngModelChange)="endDate.set($event)" 
        />
        @if (startDate() || endDate()) {
          <button class="btn-clear" (click)="startDate.set(''); endDate.set('')" title="Filtreyi Temizle" style="margin-left: 4px;">✕</button>
        }
      </div>

      <div class="filter-pills">
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'all'" (click)="orderFilterStatus.set('all')">Tümü</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Pending'" (click)="orderFilterStatus.set('Pending')">Bekleyen</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Completed'" (click)="orderFilterStatus.set('Completed')">Tamamlanan</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Cancelled'" (click)="orderFilterStatus.set('Cancelled')">İptal Edilen</button>
      </div>
    </div>

      <!-- Result Cards Stack (Ecelon layout) -->
      <div class="orders-list-stack" style="display: flex; flex-direction: column; gap: 1rem;">
        @for (o of filteredOrders(); track o.id) {
          <div class="ecelon-order-card" style="border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: var(--surface-card); font-size: 0.875rem;">
          <!-- Header Bar (Light Grey background) -->
          <div class="order-card-header" style="background-color: #F0F2F2; border-bottom: 1px solid #D5D9D9; padding: 12px 18px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; color: #565959;">
            <div style="display: flex; gap: 2.5rem; flex-wrap: wrap;">
              <div>
                <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">Sipariş tarihi</div>
                <div style="color: #0F1111; font-weight: 500;">{{ o.date | date:'dd.MM.yyyy HH:mm' }}</div>
              </div>
              <div>
                <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">Toplam tutar</div>
                <div style="color: #0F1111; font-weight: bold; font-family: var(--font-mono);">₺{{ o.totalAmount }}</div>
              </div>
              <div>
                <div style="font-size: 11px; text-transform: none; font-weight: bold; margin-bottom: 2px;">Alıcı (müşteri)</div>
                <div style="color: #0F1111; font-weight: 500;">{{ o.customerName }}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; font-weight: bold; text-transform: none; margin-bottom: 2px; color: #0F1111; display: flex; align-items: center; justify-content: flex-end; gap: 4px; position: relative;">
                <span>Sipariş no: #{{ o.orderNumber }}</span>
                <button 
                  (click)="copyToClipboard(o.orderNumber, o.id); $event.stopPropagation()" 
                  style="background: none; border: none; padding: 2px; cursor: pointer; color: #565959; display: inline-flex; align-items: center; justify-content: center; outline: none;" 
                  title="Sipariş Numarasını Kopyala"
                >
                  <svg style="width: 13px; height: 13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
                @if (copiedOrderId() === o.id) {
                  <span style="position: absolute; bottom: 100%; right: 0; background: #333; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: normal; margin-bottom: 4px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;">
                    Kopyalandı
                  </span>
                }
              </div>
              <div>
                <a href="#" (click)="openOrderDetail(o); $event.preventDefault()" style="color: #007185; text-decoration: none; font-weight: 500;" onmouseover="this.style.color='#C45500'" onmouseout="this.style.color='#007185'">Sipariş Detayları</a>
              </div>
            </div>
          </div>

          <!-- Body (White background) -->
          <div class="order-card-body" style="padding: 16px 18px; display: flex; justify-content: space-between; align-items: start; gap: 1.5rem; flex-wrap: wrap;">
            <!-- Left: Items list -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 250px;">
              <h4 style="margin: 0; font-size: 14px; font-weight: bold; color: #0F1111; display: flex; align-items: center; gap: 8px;">
                <!-- Status badge -->
                <span class="badge" [class.badge-instock]="o.status === 'Completed'" [class.badge-lowstock]="o.status === 'Pending'" [class.badge-outstock]="o.status === 'Cancelled'">
                  {{ o.status === 'Completed' ? 'Teslim edildi' : o.status === 'Pending' ? 'Beklemede' : 'İptal edildi' }}
                </span>
              </h4>
              
              <!-- Item detail rows -->
              <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                @for (item of o.items; track item.productName) {
                  <div style="display: flex; justify-content: space-between; width: 100%; max-width: 450px; font-size: 13px;">
                    <span style="color: #007185; font-weight: 500;">{{ item.productName }}</span>
                    <span style="color: #565959;">{{ item.quantity }} adet x ₺{{ item.price }}</span>
                  </div>
                }
              </div>

              <!-- Shipping Info if available -->
              @if (o.carrier || o.trackingNumber) {
                <div style="display: flex; justify-content: space-between; width: 100%; max-width: 450px; font-size: 13px; margin-top: 8px;">
                  <span style="color: #565959; display: flex; align-items: center; gap: 6px;">
                    <svg style="width: 14px; height: 14px; color: #565959;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    Kargo: <strong style="color: #0F1111;">{{ o.carrier || 'Bilinmiyor' }}</strong>
                  </span>
                  <span style="color: #565959;">
                    Takip No: <strong style="font-family: var(--font-mono); color: #0F1111;">{{ o.trackingNumber || '-' }}</strong>
                  </span>
                </div>
              }
            </div>

            <!-- Right: Actions drop-down / buttons -->
            <div style="display: flex; flex-direction: column; gap: 8px; width: 160px; flex-shrink: 0;" (click)="$event.stopPropagation()">
              @if (o.status === 'Pending') {
                <button class="btn btn-primary btn-sm" (click)="updateOrderStatus(o.id, 'Completed')" [disabled]="updatingOrderId() === o.id" style="width: 100%; border-radius: 20px;">
                  @if (updatingOrderId() === o.id) { <span class="spinner-sm"></span> } @else { Tamamlandı İşaretle }
                </button>
                <button class="btn btn-secondary btn-sm" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id" style="width: 100%; border-radius: 20px;">
                  İptal Et
                </button>
              } @else if (o.status === 'Completed') {
                <button class="btn btn-secondary btn-sm" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id" style="width: 100%; border-radius: 20px;">
                  İade Et
                </button>
              } @else {
                <button class="btn btn-secondary btn-sm" (click)="promptDeleteOrder(o)" [disabled]="updatingOrderId() === o.id" style="width: 100%; border-radius: 20px; color: #B12704; border-color: rgba(220,38,38,0.2);">
                  Sil
                </button>
              }
            </div>
          </div>
        </div>
      }
      @if (filteredOrders().length === 0) {
        <div class="empty-state" style="padding: 3rem; text-align: center; border: 1px dashed #D5D9D9; border-radius: 8px; background: #FFFFFF; width: 100%;">
          <p style="font-size: 15px; color: #565959;">Arama kriterlerinize uygun sipariş bulunamadı.</p>
        </div>
      }
    </div>

    <!-- ─── Create Order Drawer ─── -->
    @if (showCreateOrderModal()) {
      <div class="drawer-overlay" (click)="closeCreateOrder()" style="z-index: 3000;">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">Yeni Sipariş Oluştur</span>
            <button class="drawer-close" (click)="closeCreateOrder()">×</button>
          </div>
          <form [formGroup]="orderForm" (ngSubmit)="saveOrder()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="customerNameInput" type="text" formControlName="customerName" class="form-input" [class.has-value]="hasValue('customerName')" [disabled]="isOrderSaving()" placeholder="Müşteri adı girin"/>
                <label for="customerNameInput" class="form-label">Müşteri Adı</label>
                @if (isFieldInvalid('customerName')) { <div class="form-error">⚠ Müşteri adı zorununludur.</div> }
              </div>

              <!-- Shipping Info Rows -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="form-field">
                  <input id="carrierInput" type="text" formControlName="carrier" class="form-input" [class.has-value]="hasValue('carrier')" [disabled]="isOrderSaving()" placeholder="Örn: Yurtiçi Kargo"/>
                  <label for="carrierInput" class="form-label">Kargo Firması (Opsiyonel)</label>
                </div>
                <div class="form-field">
                  <input id="trackingNumberInput" type="text" formControlName="trackingNumber" class="form-input" [class.has-value]="hasValue('trackingNumber')" [disabled]="isOrderSaving()" placeholder="Örn: YK123456"/>
                  <label for="trackingNumberInput" class="form-label">Takip Numarası (Opsiyonel)</label>
                </div>
              </div>
              
              <div style="margin-top: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0;">Sipariş Kalemleri</h3>
                  <button type="button" class="btn btn-sm btn-outline" (click)="addOrderLine()" [disabled]="isOrderSaving()">+ Ürün Ekle</button>
                </div>

                <div formArrayName="lines" style="display: flex; flex-direction: column; gap: 10px;">
                  @for (line of linesArray.controls; track $index; let i = $index) {
                    <div [formGroupName]="i" [class.highlight-row]="highlightLineIndex() === i" style="display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--canvas); border: 1px solid var(--secondary); border-radius: 8px; position: relative;">
                      <div style="flex: 2;">
                        <div class="custom-select-wrapper" (click)="toggleDropdown(i); $event.stopPropagation()">
                          <div class="custom-select-trigger" [class.open]="isDropdownOpen(i)" [class.disabled]="isOrderSaving()" style="height: 40px; padding: 0 12px; font-size: 13px;">
                            <span class="selected-text">
                              @if (line.get('productId')?.value) {
                                {{ getProductName(line.get('productId')?.value) }} <span class="selected-stock" style="color: var(--text-muted); font-size: 11px;">(Stok: {{ line.get('maxQuantity')?.value }})</span>
                              } @else {
                                Ürün seçin...
                              }
                            </span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                          </div>
                          @if (isDropdownOpen(i)) {
                            <div class="custom-select-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; z-index: 100; max-height: 200px; overflow-y: auto; background: var(--surface); border: 1px solid var(--secondary); border-radius: 8px; box-shadow: var(--shadow-lg);">
                              @for (p of state.products(); track p.id) {
                                @if (p.quantity > 0) {
                                  <div class="custom-option" (click)="selectProduct(i, p.id); $event.stopPropagation()" style="padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--secondary); font-size: 13px;" onmouseover="this.style.background='var(--canvas)'" onmouseout="this.style.background='transparent'">
                                    <div class="opt-left" style="display: flex; flex-direction: column;">
                                      <span class="opt-name" style="font-weight: 500;">{{ p.name }}</span>
                                      <span class="opt-stock" [class.low]="p.quantity < 10" style="font-size: 11px; color: var(--text-muted);">Stok: {{ p.quantity }}</span>
                                    </div>
                                    <span class="opt-price" style="font-family: var(--font-mono); font-weight: 600; color: var(--primary);">₺{{ p.price.toFixed(2) }}</span>
                                  </div>
                                }
                              }
                            </div>
                          }
                        </div>
                      </div>
                      <div style="flex: 1;" [class.has-error]="line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)">
                        <input type="number" formControlName="quantity" class="form-input" style="height: 40px; padding: 0 12px; font-size: 13px;" placeholder="Miktar" min="1" [max]="line.get('maxQuantity')?.value" (input)="enforceMaxQuantity($event, i)" [disabled]="isOrderSaving()"/>
                        @if (line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)) {
                          <span class="error-msg-small" style="color: var(--status-outstock); font-size: 10px; display: block; margin-top: 2px;">Maks: {{ line.get('maxQuantity')?.value }}</span>
                        }
                      </div>
                      <div style="flex: 1;">
                        <input type="text" [value]="'₺' + (line.get('price')?.value * line.get('quantity')?.value).toFixed(2)" disabled class="form-input mono" style="height: 40px; padding: 0 12px; font-size: 13px; background: var(--canvas);"/>
                      </div>
                      <button type="button" class="delete-btn" (click)="removeOrderLine(i)" [disabled]="linesArray.length <= 1 || isOrderSaving()" style="padding: 6px;">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  }
                </div>
                @if (linesArray.invalid && (linesArray.dirty || linesArray.touched)) {
                  <span class="form-error" style="display:block;margin-top:0.5rem;">Tüm satırlarda geçerli bir ürün ve miktar (en az 1) seçilmelidir.</span>
                }
              </div>

              <div class="order-total-bar" style="margin-top: 24px; padding: 16px; background: var(--canvas); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--secondary);">
                <span style="font-weight: 600; font-size: 14px;">Toplam Tutar</span>
                <strong class="mono" style="font-size: 16px; color: var(--primary);">₺{{ getNewOrderTotal().toFixed(2) }}</strong>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeCreateOrder()">Vazgeç</button>
              <button type="submit" class="btn btn-primary" [disabled]="orderForm.invalid || isOrderSaving()">
                @if (isOrderSaving()) { <span class="spinner-sm spinner-light"></span> Oluşturuluyor... } @else { Sipariş Oluştur }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ─── Order Detail Drawer ─── -->
    @if (isOrderDetailOpen()) {
      <div class="drawer-overlay" (click)="closeOrderDetail()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          @if (selectedOrder(); as order) {
            <div class="drawer-header">
              <div style="display: flex; align-items: baseline; gap: 8px;">
                <span class="drawer-title">Sipariş Detayı</span>
                <span class="mono text-muted" style="font-size: 13px;">{{ order.orderNumber }}</span>
              </div>
              <button class="drawer-close" (click)="closeOrderDetail()">×</button>
            </div>
            
            <div class="drawer-body">
              @if (isOrderDetailLoading()) {
                <!-- Skeleton Loader -->
                <div>
                  <div class="skeleton skeleton-title"></div>
                  <div class="skeleton skeleton-text"></div>
                  <div class="skeleton skeleton-text short"></div>
                </div>
                <div>
                  <div class="skeleton skeleton-title" style="width: 40%"></div>
                  <div class="skeleton skeleton-row"></div>
                  <div class="skeleton skeleton-row"></div>
                </div>
              } @else {
                <div class="detail-metadata-grid">
                  <span class="detail-label-col">Müşteri</span>
                  <span class="detail-value-col">{{ order.customerName }}</span>
                  
                  <span class="detail-label-col">Tarih</span>
                  <span class="detail-value-col mono">{{ order.date | date:'dd.MM.yyyy HH:mm' }}</span>
                  
                  <span class="detail-label-col">Durum</span>
                  <div style="text-align: right">
                    <span class="badge" [class.badge-instock]="order.status === 'Completed'" [class.badge-lowstock]="order.status === 'Pending'" [class.badge-outstock]="order.status === 'Cancelled'">
                      {{ order.status === 'Completed' ? 'Tamamlandı' : order.status === 'Pending' ? 'Bekliyor' : 'İptal edildi' }}
                    </span>
                  </div>

                  @if (order.carrier) {
                    <span class="detail-label-col">Kargo Firması</span>
                    <span class="detail-value-col">{{ order.carrier }}</span>
                  }
                  @if (order.trackingNumber) {
                    <span class="detail-label-col">Kargo Takip No</span>
                    <span class="detail-value-col mono" style="font-weight: 500;">{{ order.trackingNumber }}</span>
                  }
                </div>

                <div class="detail-items-section" style="margin-top: 12px;">
                  <h4 class="detail-section-title">Sipariş Kalemleri</h4>
                  <div class="detail-item-list">
                    @for (item of order.items; track item.productName) {
                      <div class="detail-item-row" style="padding: 10px 0;">
                        <div class="detail-item-info">
                          <span class="detail-item-name" style="font-weight:600; font-size:14px;">{{ item.productName }}</span>
                          <span class="detail-item-calc" style="font-size:12px; color:var(--text-muted);">{{ item.quantity }}x · ₺{{ item.price }}</span>
                        </div>
                        <span class="detail-item-total mono" style="font-weight:600; font-size:14px;">₺{{ (item.price * item.quantity).toFixed(2) }}</span>
                      </div>
                    }
                    <div class="detail-grand-total" style="display:flex; justify-content:space-between; margin-top:16px; padding-top:16px; border-top:1.5px solid var(--secondary);">
                      <span class="detail-grand-label" style="font-weight:700; font-size:14px;">Genel Toplam</span>
                      <span class="detail-grand-value mono" style="font-weight:700; font-size:15px; color:var(--primary);">₺{{ order.totalAmount.toFixed(2) }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>

            <div class="drawer-footer" [class.single-action]="order.status === 'Completed' || order.status === 'Cancelled'">
              @if (isOrderDetailLoading()) {
                <div class="skeleton skeleton-row" style="margin: 0; width: 100%"></div>
              } @else {
                @if (order.status === 'Pending') {
                  <button class="btn btn-outline" (click)="promptCancelOrder(order)" [disabled]="updatingOrderId() === order.id">İptal Et</button>
                  <button class="btn btn-primary" (click)="updateOrderStatus(order.id, 'Completed')" [disabled]="updatingOrderId() === order.id">
                    @if (updatingOrderId() === order.id) { <span class="spinner-sm spinner-light"></span> } @else { Tamamla }
                  </button>
                }
                @if (order.status === 'Completed') {
                  <button class="btn btn-outline" (click)="promptCancelOrder(order)" [disabled]="updatingOrderId() === order.id" style="width: 100%">
                    @if (updatingOrderId() === order.id) { <span class="spinner-sm"></span> } @else { İade Et }
                  </button>
                }
                @if (order.status === 'Cancelled') {
                  <button class="btn btn-danger" (click)="promptDeleteOrder(order)" [disabled]="updatingOrderId() === order.id" style="width: 100%">Sil</button>
                }
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- ─── Cancel Confirmation Modal ─── -->
    @if (showCancelModal()) {
      <div class="modal-backdrop" style="z-index: 3000;">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="closeCancelModal()" [disabled]="updatingOrderId() !== null">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 class="delete-modal-title">{{ orderToCancel()?.status === 'Completed' ? 'Siparişi İade Et' : 'Siparişi İptal Et' }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ orderToCancel()?.orderNumber }}</strong> numaralı siparişi iptal etmek/iade etmek istediğinize emin misiniz? Bu işlem sonucunda stoklar geri eklenecektir.
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="closeCancelModal()" [disabled]="updatingOrderId() !== null">Vazgeç</button>
            <button class="btn btn-danger" (click)="confirmCancelOrder()" [disabled]="updatingOrderId() !== null">
              @if (updatingOrderId() !== null) { <span class="spinner-sm spinner-light"></span> İşleniyor... } @else { Onayla }
            </button>
          </div>
        </div>
      </div>
    }


  `
})
export class OrdersComponent implements OnInit, AfterViewInit, OnDestroy {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);

  showCreateOrderModal = signal(false);
  isOrderSaving = signal(false);
  updatingOrderId = signal<string | null>(null);
  copiedOrderId = signal<string | null>(null);

  selectedOrder = signal<Order | null>(null);
  isOrderDetailOpen = signal(false);
  isOrderDetailLoading = signal(false);

  // Cancel Confirmation Modal
  showCancelModal = signal(false);
  orderToCancel = signal<Order | null>(null);



  // Search & Filter
  orderSearch = signal('');
  orderFilterStatus = signal<'all' | 'Pending' | 'Completed' | 'Cancelled'>('all');
  startDate = signal('');
  endDate = signal('');

  filteredOrders = computed(() => {
    let list = this.state.orders();
    const search = this.orderSearch().toLowerCase().trim();
    const statusFilter = this.orderFilterStatus();
    const start = this.startDate();
    const end = this.endDate();

    if (search) {
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(search) ||
        o.orderNumber.toLowerCase().includes(search)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter);
    }
    if (start) {
      const startMs = new Date(start).setHours(0, 0, 0, 0);
      list = list.filter(o => new Date(o.date).getTime() >= startMs);
    }
    if (end) {
      const endMs = new Date(end).setHours(23, 59, 59, 999);
      list = list.filter(o => new Date(o.date).getTime() <= endMs);
    }
    return list;
  });

  // Reactive Form
  orderForm: FormGroup = this.fb.group({
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    carrier: [''],
    trackingNumber: [''],
    lines: this.fb.array([])
  });

  get linesArray() {
    return this.orderForm.get('lines') as FormArray;
  }

  highlightLineIndex = signal<number | null>(null);

  // Table Tags Calculation
  visibleTagsMap = signal<Record<string, number | undefined>>({});
  private resizeObserver: ResizeObserver | null = null;

  copyToClipboard(text: string, orderId: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.copiedOrderId.set(orderId);
      setTimeout(() => {
        if (this.copiedOrderId() === orderId) {
          this.copiedOrderId.set(null);
        }
      }, 1500);
    });
  }

  ngOnInit() {
    if (this.state.orders().length === 0) {
      this.state.loadData();
    }
    this.route.queryParams.subscribe(params => {
      this.orderSearch.set(params['q'] || '');
      if (params['open'] === 'new') {
        this.openCreateOrder();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { open: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });
  }

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(entries => {
      // Use requestAnimationFrame to avoid ResizeObserver loop limit errors
      requestAnimationFrame(() => this.calculateTags());
    });
    
    // Observe the table body for changes in size
    setTimeout(() => {
      const tableBody = document.querySelector('table tbody');
      if (tableBody) {
        this.resizeObserver?.observe(tableBody);
      }
      this.calculateTags();
    }, 100);
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  calculateTags() {
    const cells = document.querySelectorAll('.order-items-cell');
    const newMap: Record<string, number> = {};
    let changed = false;
    const currentMap = this.visibleTagsMap();

    cells.forEach(cell => {
      const orderId = cell.getAttribute('data-order-id');
      if (!orderId) return;

      const containerWidth = cell.clientWidth;
      if (containerWidth === 0) return; // Hidden or not rendered

      // Find the hidden full-list container which we use for measuring
      const measureContainer = cell.querySelector('.measure-tags') as HTMLElement;
      if (!measureContainer) return;

      const items = Array.from(measureContainer.children) as HTMLElement[];
      let currentWidth = 0;
      const gap = 4;
      const badgeWidth = 65; // Approximate width of "+X daha"
      let visibleCount = items.length;

      for (let i = 0; i < items.length; i++) {
        currentWidth += items[i].offsetWidth + gap;
        // If this is the last item, it just needs to fit.
        // If it's not the last item, we need to leave room for the badge.
        const requiredWidth = i === items.length - 1 ? currentWidth : currentWidth + badgeWidth;
        
        if (requiredWidth > containerWidth) {
          visibleCount = i > 0 ? i : 1; // Force at least 1 if space is too small
          break;
        }
      }

      if (currentMap[orderId] !== visibleCount) {
        newMap[orderId] = visibleCount;
        changed = true;
      } else {
        newMap[orderId] = currentMap[orderId];
      }
    });

    if (changed) {
      this.visibleTagsMap.set(newMap);
    }
  }

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.orderSearch.set(input.value);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.orderForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasValue(fieldName: string): boolean {
    const val = this.orderForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  // Custom Select Logic
  dropdownOpenIndex = signal<number | null>(null);

  @HostListener('document:click')
  closeDropdowns() {
    this.dropdownOpenIndex.set(null);
  }

  toggleDropdown(index: number) {
    if (this.isOrderSaving()) return;
    this.dropdownOpenIndex.set(this.dropdownOpenIndex() === index ? null : index);
  }

  isDropdownOpen(index: number) {
    return this.dropdownOpenIndex() === index;
  }

  getProductName(productId: string) {
    return this.state.products().find(p => p.id === productId)?.name || '';
  }

  selectProduct(index: number, productId: string) {
    const lineGroup = this.linesArray.at(index);
    lineGroup.patchValue({ productId });
    this.onOrderLineProductChange(index);
    this.dropdownOpenIndex.set(null);
  }

  // Create Order
  openCreateOrder() {
    this.orderForm.reset({ customerName: '', carrier: '', trackingNumber: '' });
    this.linesArray.clear();
    this.addOrderLine();
    this.dropdownOpenIndex.set(null);
    this.showCreateOrderModal.set(true);
  }

  closeCreateOrder() {
    this.showCreateOrderModal.set(false);
  }

  createLineFormGroup(): FormGroup {
    return this.fb.group({
      productId: ['', Validators.required],
      productName: [''],
      price: [0],
      quantity: [1, [Validators.required, Validators.min(1)]],
      maxQuantity: [0]
    });
  }

  addOrderLine() {
    this.linesArray.push(this.createLineFormGroup());
  }

  removeOrderLine(index: number) {
    this.linesArray.removeAt(index);
  }

  onOrderLineProductChange(index: number) {
    const lineGroup = this.linesArray.at(index);
    const productId = lineGroup.get('productId')?.value;
    const product = this.state.products().find(p => p.id === productId);

    if (!product) return;

    // Check if product already exists in another line
    const existingIndex = this.linesArray.controls.findIndex((ctrl, i) => i !== index && ctrl.get('productId')?.value === productId);

    if (existingIndex !== -1) {
      // Product exists. Remove the current line.
      this.linesArray.removeAt(index);

      // Increment quantity of the existing line up to max stock
      const existingGroup = this.linesArray.at(existingIndex);
      const currentQty = existingGroup.get('quantity')?.value || 0;
      const maxQty = existingGroup.get('maxQuantity')?.value || 0;
      const newQty = Math.min(currentQty + 1, maxQty);
      existingGroup.patchValue({ quantity: newQty });
      
      existingGroup.get('quantity')?.markAsTouched();
      existingGroup.get('quantity')?.markAsDirty();
      existingGroup.get('quantity')?.updateValueAndValidity();

      // Highlight the existing line
      this.highlightLineIndex.set(existingIndex);
      setTimeout(() => this.highlightLineIndex.set(null), 300);

      return;
    }

    // Normal behavior for new product
    lineGroup.patchValue({
      productName: product.name,
      price: product.price,
      quantity: 1,
      maxQuantity: product.quantity
    });
    // Set max validator dynamically based on current stock
    lineGroup.get('quantity')?.setValidators([Validators.required, Validators.min(1), Validators.max(product.quantity)]);
    lineGroup.get('quantity')?.updateValueAndValidity();
  }

  enforceMaxQuantity(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const lineGroup = this.linesArray.at(index);
    const max = lineGroup.get('maxQuantity')?.value || 0;
    
    if (input.value !== '' && parseInt(input.value) > max) {
      input.value = max.toString();
      lineGroup.patchValue({ quantity: max });
    }
  }

  getNewOrderTotal(): number {
    return this.linesArray.controls.reduce((sum, line) => {
      const p = line.get('price')?.value || 0;
      const q = line.get('quantity')?.value || 0;
      return sum + (p * q);
    }, 0);
  }

  saveOrder() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }
    
    if (this.isOrderSaving()) return;
    this.isOrderSaving.set(true);

    const formValue = this.orderForm.value;

    // Merge duplicate lines by summing their quantities
    const mergedMap = new Map<string, { productName: string, quantity: number, price: number }>();
    formValue.lines.forEach((l: any) => {
      const existing = mergedMap.get(l.productId);
      if (existing) {
        existing.quantity += Number(l.quantity);
      } else {
        mergedMap.set(l.productId, {
          productName: l.productName,
          quantity: Number(l.quantity),
          price: Number(l.price)
        });
      }
    });

    const mergedItems = Array.from(mergedMap.entries()).map(([productId, data]) => ({
      productId,
      productName: data.productName,
      quantity: data.quantity,
      price: data.price
    }));

    const orderPayload = {
      customerName: formValue.customerName.trim(),
      date: new Date().toISOString(),
      status: 'Pending' as const,
      carrier: formValue.carrier ? formValue.carrier.trim() : null,
      trackingNumber: formValue.trackingNumber ? formValue.trackingNumber.trim() : null,
      items: mergedItems,
    };

    this.inventoryService.createOrder(orderPayload).subscribe({
      next: (order) => {
        this.state.orders.update(o => {
          if (o.some(x => x.id === order.id)) return o;
          return [order, ...o];
        });
        // Reload products since stock was reserved
        this.inventoryService.getProducts().subscribe({
          next: (prods) => this.state.products.set(prods),
        });
        this.isOrderSaving.set(false);
        this.closeCreateOrder();
        this.ui.showToast('Sipariş başarıyla oluşturuldu.', 'success');
      },
      error: (err) => {
        this.isOrderSaving.set(false);
        this.ui.showToast(err.error?.message || 'Sipariş oluşturulurken hata oluştu.', 'error');
      }
    });
  }

  // Order Detail Drawer
  openOrderDetail(order: Order) {
    this.selectedOrder.set(order);
    this.isOrderDetailOpen.set(true);
    this.isOrderDetailLoading.set(true);
    setTimeout(() => {
      this.isOrderDetailLoading.set(false);
    }, 400);
  }
  
  closeOrderDetail() {
    this.isOrderDetailOpen.set(false);
    setTimeout(() => this.selectedOrder.set(null), 250);
  }

  // Cancel Confirmation Modal Logic
  promptCancelOrder(order: Order) {
    this.orderToCancel.set(order);
    this.showCancelModal.set(true);
  }

  closeCancelModal() {
    this.showCancelModal.set(false);
    this.orderToCancel.set(null);
  }

  confirmCancelOrder() {
    const order = this.orderToCancel();
    if (!order) return;
    this.updateOrderStatus(order.id, 'Cancelled');
    this.closeCancelModal();
  }

  // Delete Confirmation Modal Logic
  promptDeleteOrder(order: Order) {
    this.ui.openConfirm({
      title: 'Siparişi sil',
      message: `#${order.orderNumber} numaralı sipariş kalıcı olarak silinecek, bu işlem geri alınamaz.`,
      isDelete: true,
      onConfirm: () => {
        return this.inventoryService.deleteOrder(order.id).pipe(
          tap({
            next: () => {
              this.state.orders.update(ords => ords.filter(o => o.id !== order.id));
              this.closeOrderDetail();
              this.ui.showToast('Sipariş başarıyla silindi.', 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || 'Sipariş silinirken hata oluştu.', 'error');
            }
          })
        );
      }
    });
  }

  // Order Status Update
  updateOrderStatus(orderId: string, status: 'Completed' | 'Pending' | 'Cancelled') {
    if (this.updatingOrderId()) return;
    this.updatingOrderId.set(orderId);

    this.inventoryService.updateOrderStatus(orderId, status).subscribe({
      next: (updatedOrder) => {
        this.state.orders.update(ords => {
          const idx = ords.findIndex(o => o.id === orderId);
          if (idx !== -1) {
            const newOrds = [...ords];
            newOrds[idx] = updatedOrder;
            return newOrds;
          }
          return ords;
        });
        // Also update the drawer if open
        if (this.selectedOrder()?.id === orderId) {
          this.selectedOrder.set(updatedOrder);
        }
        this.inventoryService.getProducts().subscribe({
          next: (prods) => {
            this.state.products.set(prods);
            this.updatingOrderId.set(null);
            this.ui.showToast('Sipariş durumu güncellendi.', 'success');
          },
          error: () => {
            this.updatingOrderId.set(null);
            this.ui.showToast('Durum güncellendi ancak stoklar alınamadı.', 'info');
          }
        });
      },
      error: (err) => {
        this.updatingOrderId.set(null);
        this.ui.showToast(err.error?.message || 'Sipariş güncellenirken hata oluştu.', 'error');
      }
    });
  }
}
