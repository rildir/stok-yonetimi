import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Order } from '../../inventory.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>Sipariş Takibi</h1>
        <p>Tüm siparişlerinizi, iadelerinizi ve müşteri taleplerini yönetin.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" (click)="openCreateOrder()">+ Yeni Sipariş</button>
        <button class="btn btn-primary" (click)="ui.toggleAiPanel()">
          <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
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
      <div class="filter-pills">
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'all'" (click)="orderFilterStatus.set('all')">Tümü</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Pending'" (click)="orderFilterStatus.set('Pending')">Bekleyen</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Completed'" (click)="orderFilterStatus.set('Completed')">Tamamlanan</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Cancelled'" (click)="orderFilterStatus.set('Cancelled')">İptal Edilen</button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Tarih</th>
              <th>Ürünler</th>
              <th>Toplam</th>
              <th>Durum</th>
              <th class="th-actions">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            @for (o of filteredOrders(); track o.id) {
              <tr class="clickable-row" (click)="openOrderDetail(o)">
                <td class="mono" style="font-weight:600">{{ o.orderNumber }}</td>
                <td style="font-weight:500">{{ o.customerName }}</td>
                <td class="mono" style="color:var(--text-muted)">{{ o.date | date:'dd.MM.yyyy HH:mm' }}</td>
                <td class="order-items-cell" [attr.data-order-id]="o.id">
                  <div class="measure-tags" style="visibility: hidden; position: absolute; white-space: nowrap; display: flex; gap: 4px; pointer-events: none; opacity: 0; z-index: -1;">
                    @for (item of o.items; track item.productName) {
                      <span class="order-item-tag">{{ item.productName }} ({{ item.quantity }}x)</span>
                    }
                  </div>
                  <div class="order-items-flex">
                    @for (item of o.items.slice(0, visibleTagsMap()[o.id] ?? o.items.length); track item.productName) {
                      <span class="order-item-tag">{{ item.productName }} ({{ item.quantity }}x)</span>
                    }
                    @if ((visibleTagsMap()[o.id] ?? o.items.length) < o.items.length) {
                      <span class="order-item-tag more-tag">+{{ o.items.length - (visibleTagsMap()[o.id] ?? o.items.length) }} daha</span>
                    }
                  </div>
                </td>
                <td class="mono" style="font-weight:700">₺{{ o.totalAmount }}</td>
                <td>
                  <span class="badge" [class.badge-instock]="o.status === 'Completed'" [class.badge-lowstock]="o.status === 'Pending'" [class.badge-outstock]="o.status === 'Cancelled'">
                    {{ o.status === 'Completed' ? 'Tamamlandı' : o.status === 'Pending' ? 'Bekliyor' : 'İptal Edildi' }}
                  </span>
                </td>
                <td (click)="$event.stopPropagation()">
                  @if (o.status === 'Pending') {
                    <div class="order-actions-row">
                      <button class="action-btn-sm approve" (click)="updateOrderStatus(o.id, 'Completed')" [disabled]="updatingOrderId() === o.id">
                        @if (updatingOrderId() === o.id) { <span class="spinner-sm"></span> } @else { Tamamla }
                      </button>
                      <button class="action-btn-sm cancel" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id">İptal</button>
                    </div>
                  } @else if (o.status === 'Completed') {
                    <div class="order-actions-row">
                      <button class="action-btn-sm cancel" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id">
                        @if (updatingOrderId() === o.id) { <span class="spinner-sm"></span> } @else { İade Et }
                      </button>
                    </div>
                  } @else {
                    <span class="text-muted" style="text-align:right;display:block;">—</span>
                  }
                </td>
              </tr>
            }
            @if (filteredOrders().length === 0) {
              <tr><td colspan="7" class="empty-state">Arama kriterlerinize uygun sipariş bulunamadı.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Create Order Modal ─── -->
    @if (showCreateOrderModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-lg">
          <div class="modal-header"><h3>Yeni Sipariş Oluştur</h3><button class="close-modal-btn" (click)="closeCreateOrder()">✕</button></div>
          <form [formGroup]="orderForm" (ngSubmit)="saveOrder()">
            <div class="modal-body">
              <div class="form-group" [class.has-error]="isFieldInvalid('customerName')">
                <label>Müşteri Adı</label>
                <input type="text" formControlName="customerName" placeholder="Müşteri adı girin" [disabled]="isOrderSaving()"/>
                @if (isFieldInvalid('customerName')) { <span class="error-msg">Müşteri adı zorunludur.</span> }
              </div>
              
              <label class="form-section-label">Sipariş Kalemleri</label>
              <div formArrayName="lines">
                @for (line of linesArray.controls; track $index; let i = $index) {
                  <div class="order-line-row" [formGroupName]="i" [class.highlight-row]="highlightLineIndex() === i">
                    <div class="form-group row-col-product">
                      <select formControlName="productId" (change)="onOrderLineProductChange(i)" [disabled]="isOrderSaving()">
                        <option value="">Ürün seçin...</option>
                        @for (p of state.products(); track p.id) {
                          @if (p.quantity > 0) {
                            <option [value]="p.id">{{ p.name }} (Stok: {{ p.quantity }})</option>
                          }
                        }
                      </select>
                    </div>
                    <div class="form-group row-col-qty" [class.has-error]="line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)">
                      <input type="number" formControlName="quantity" min="1" [max]="line.get('maxQuantity')?.value" (input)="enforceMaxQuantity($event, i)" [disabled]="isOrderSaving()"/>
                      @if (line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)) {
                        <span class="error-msg-small">Maksimum stok: {{ line.get('maxQuantity')?.value }}</span>
                      }
                    </div>
                    <div class="form-group row-col-price">
                      <input type="text" [value]="'₺' + (line.get('price')?.value * line.get('quantity')?.value).toFixed(2)" disabled class="mono"/>
                    </div>
                    <button type="button" class="delete-btn" (click)="removeOrderLine(i)" [disabled]="linesArray.length <= 1 || isOrderSaving()">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                }
              </div>
              @if (linesArray.invalid && (linesArray.dirty || linesArray.touched)) {
                <span class="error-msg" style="display:block;margin-top:0.25rem;">Tüm satırlarda geçerli bir ürün ve miktar (en az 1) seçilmelidir.</span>
              }
              
              <button type="button" class="btn btn-outline btn-sm" (click)="addOrderLine()" [disabled]="isOrderSaving()" style="margin-top:0.5rem">+ Ürün Satırı Ekle</button>
              
              <div class="order-total-bar">
                <span>Toplam Tutar</span>
                <strong class="mono">₺{{ getNewOrderTotal().toFixed(2) }}</strong>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeCreateOrder()" [disabled]="isOrderSaving()">Vazgeç</button>
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
      <div class="drawer-backdrop" (click)="closeOrderDetail()"></div>
    }
    <aside class="drawer" [class.open]="isOrderDetailOpen()">
      @if (selectedOrder(); as order) {
        <div class="drawer-header">
          <div class="detail-header-left">
            <h3>Sipariş Detayı</h3>
            <span class="detail-order-no" style="margin-left:8px; color:#666; font-size:13px">{{ order.orderNumber }}</span>
          </div>
          <button class="drawer-close-btn" (click)="closeOrderDetail()">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
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
              <span class="detail-value-col mono" style="font-weight: 500">{{ order.date | date:'dd.MM.yyyy HH:mm' }}</span>
              
              <span class="detail-label-col">Durum</span>
              <div style="text-align: right">
                <span class="badge" [class.badge-instock]="order.status === 'Completed'" [class.badge-lowstock]="order.status === 'Pending'" [class.badge-outstock]="order.status === 'Cancelled'">
                  {{ order.status === 'Completed' ? 'TAMAMLANDI' : order.status === 'Pending' ? 'BEKLİYOR' : 'İPTAL EDİLDİ' }}
                </span>
              </div>
            </div>

            <div class="detail-items-section">
              <h4 class="detail-section-title">Sipariş Kalemleri</h4>
              <div class="detail-item-list">
                @for (item of order.items; track item.productName) {
                  <div class="detail-item-row">
                    <div class="detail-item-info">
                      <span class="detail-item-name">{{ item.productName }}</span>
                      <span class="detail-item-calc">{{ item.quantity }}x · ₺{{ item.price }}</span>
                    </div>
                    <span class="detail-item-total">₺{{ (item.price * item.quantity).toFixed(2) }}</span>
                  </div>
                }
                <div class="detail-grand-total">
                  <span class="detail-grand-label">Genel Toplam</span>
                  <span class="detail-grand-value">₺{{ order.totalAmount.toFixed(2) }}</span>
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
              <div style="color: #999; font-size: 13px; text-align: center; width: 100%; align-self: center;">Bu sipariş iptal edilmiştir.</div>
            }
          }
        </div>
      }
    </aside>

    <!-- ─── Cancel Confirmation Modal ─── -->
    @if (showCancelModal()) {
      <div class="modal-backdrop">
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
export class OrdersComponent {
  state = inject(AppStateService);
  ui = inject(UiStateService);
  inventoryService = inject(InventoryService);
  fb = inject(FormBuilder);

  showCreateOrderModal = signal(false);
  isOrderSaving = signal(false);
  updatingOrderId = signal<string | null>(null);

  selectedOrder = signal<Order | null>(null);
  isOrderDetailOpen = signal(false);
  isOrderDetailLoading = signal(false);

  // Cancel Confirmation Modal
  showCancelModal = signal(false);
  orderToCancel = signal<Order | null>(null);

  // Search & Filter
  orderSearch = signal('');
  orderFilterStatus = signal<'all' | 'Pending' | 'Completed' | 'Cancelled'>('all');

  filteredOrders = computed(() => {
    let list = this.state.orders();
    const search = this.orderSearch().toLowerCase().trim();
    const statusFilter = this.orderFilterStatus();

    if (search) {
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(search) ||
        o.orderNumber.toLowerCase().includes(search)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter);
    }
    return list;
  });

  // Reactive Form
  orderForm: FormGroup = this.fb.group({
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    lines: this.fb.array([])
  });

  get linesArray() {
    return this.orderForm.get('lines') as FormArray;
  }

  highlightLineIndex = signal<number | null>(null);

  // Table Tags Calculation
  visibleTagsMap = signal<Record<string, number>>({});
  private resizeObserver: ResizeObserver | null = null;

  ngOnInit() {
    if (this.state.orders().length === 0) {
      this.state.loadData();
    }
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

  // Create Order
  openCreateOrder() {
    this.orderForm.reset({ customerName: '' });
    this.linesArray.clear();
    this.addOrderLine();
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

      // Increment quantity of the existing line
      const existingGroup = this.linesArray.at(existingIndex);
      const currentQty = existingGroup.get('quantity')?.value || 0;
      existingGroup.patchValue({ quantity: currentQty + 1 });
      
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
    const orderPayload = {
      customerName: formValue.customerName.trim(),
      date: new Date().toISOString(),
      status: 'Pending' as const,
      items: formValue.lines.map((l: any) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        price: l.price,
      })),
    };

    this.inventoryService.createOrder(orderPayload).subscribe({
      next: (order) => {
        this.state.orders.update(o => [order, ...o]);
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
