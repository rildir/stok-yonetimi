import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormsModule } from '@angular/forms';
import { InventoryService, PurchaseOrderPayload, PurchaseOrderReceipt } from '../../inventory.service';
import { TaxRate, Warehouse, Product, BarcodeLookupResult, TrackingEntry } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap, debounceTime, switchMap, catchError } from 'rxjs/operators';
import { of, Subscription } from 'rxjs';
import { TaxService } from '../../services/tax.service';
import { ExemptionCode, TaxQuote, TaxSummaryView, WithholdingCode, summaryFromDocument, summaryFromQuote } from '../../models/tax.models';
import { TaxSummaryComponent } from '../shared/tax-summary.component';
import { DocumentTaxFieldsComponent, LineTaxFieldsComponent, documentTaxGroup, documentTaxPayload, lineNeedsExemption, lineTaxControls, lineTaxPayload } from '../shared/tax-fields.component';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';
import { QuantityInputDirective, productDecimals } from '../shared/quantity-input.directive';
import { fitsDecimals, roundQty, sumQty } from '@stok/tr-compliance';
import { toastMovementResult } from '../shared/movement-warnings';
import { GoodsReceiptFormComponent } from '../documents/goods-receipt-form.component';
import { DocumentsService } from '../../services/documents.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe, QuantityInputDirective, TaxSummaryComponent, LineTaxFieldsComponent, DocumentTaxFieldsComponent, GoodsReceiptFormComponent, RouterLink],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'purchaseOrders.title' | t }}</h1>
        <p>{{ 'purchaseOrders.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" (click)="autoDraft()" [disabled]="isAutoDrafting()" [class.is-loading]="isAutoDrafting()" [title]="'purchaseOrders.autoDraftTooltip' | t">
          @if (isAutoDrafting()) {
            <span class="spinner-sm"></span> {{ 'purchaseOrders.analyzing' | t }}
          } @else {
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            {{ 'purchaseOrders.autoDraft' | t }}
          }
        </button>
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          {{ 'purchaseOrders.new' | t }}
        </button>
      </div>
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'purchaseOrders.searchPlaceholder' | t" [ngModel]="poSearch()" (ngModelChange)="poSearch.set($event)"/>
      </div>
      <div class="po-dates">
        <input type="date" class="input" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" [title]="'purchaseOrders.startDate' | t" />
        <span class="text-muted">–</span>
        <input type="date" class="input" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" [title]="'purchaseOrders.endDate' | t" />
        @if (startDate() || endDate()) {
          <button class="icon-btn" (click)="startDate.set(''); endDate.set('')" [title]="'purchaseOrders.clearFilter' | t">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        }
      </div>
      <div class="filter-pills">
        <button class="filter-pill" [class.active]="poFilterStatus() === 'all'" (click)="poFilterStatus.set('all')">{{ 'purchaseOrders.filter.all' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Draft'" (click)="poFilterStatus.set('Draft')">{{ 'purchaseOrders.filter.draft' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Sent'" (click)="poFilterStatus.set('Sent')">{{ 'purchaseOrders.filter.sent' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Received'" (click)="poFilterStatus.set('Received')">{{ 'purchaseOrders.filter.received' | t }}</button>
        <button class="filter-pill" [class.active]="poFilterStatus() === 'Cancelled'" (click)="poFilterStatus.set('Cancelled')">{{ 'purchaseOrders.filter.cancelled' | t }}</button>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="po-skel">
          @for (r of [1,2,3,4,5]; track r) { <div class="skeleton skeleton-text"></div> }
        </div>
      } @else if (filteredOrders().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          </div>
          <div class="empty-state-title">{{ 'purchaseOrders.noResults' | t }}</div>
          <button class="btn btn-primary" (click)="openDrawer()">{{ 'purchaseOrders.create' | t }}</button>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'purchaseOrders.col.poNumber' | t }}</th>
                <th>{{ 'purchaseOrders.supplier' | t }}</th>
                <th>{{ 'purchaseOrders.orderDate' | t }}</th>
                <th>{{ 'purchaseOrders.items' | t }}</th>
                <th>{{ 'purchaseOrders.status' | t }}</th>
                <th class="num">{{ 'purchaseOrders.totalAmount' | t }}</th>
                <th class="th-actions">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (o of filteredOrders(); track o.id) {
                <tr>
                  <td [attr.data-label]="'purchaseOrders.col.poNumber' | t">
                    <a href="#" class="po-link mono" (click)="openDetailDrawer(o); $event.preventDefault()" [title]="'purchaseOrders.orderDetails' | t">{{ formatPoNumber(o.poNumber) }}</a>
                  </td>
                  <td [attr.data-label]="'purchaseOrders.supplier' | t"><span class="po-strong">{{ o.supplierName }}</span></td>
                  <td [attr.data-label]="'purchaseOrders.orderDate' | t">
                    <div>{{ o.createdAt | appDate }}</div>
                    @if (o.expectedDate) {
                      <div class="po-sub">{{ 'purchaseOrders.expectedDate' | t }}: {{ o.expectedDate | appDate }}</div>
                    }
                  </td>
                  <td [attr.data-label]="'purchaseOrders.items' | t" class="po-items">
                    <div class="po-items-in">
                    @for (item of getGroupedItems(o.items); track item.key) {
                      <div class="po-item">
                        <span class="po-strong">{{ item.productName }}</span>
                        <span class="po-sub">{{ 'purchaseOrders.itemLine' | t: { qty: qtyLabel(item), price: (item.price | money: o.currency), total: (item.lineTotal | money: o.currency) } }}</span>
                      </div>
                    }
                    @if (o.notes) { <div class="po-sub po-note" [title]="o.notes">{{ 'purchaseOrders.notes' | t }}: {{ o.notes }}</div> }
                    </div>
                  </td>
                  <td [attr.data-label]="'purchaseOrders.status' | t">
                    <span class="badge badge-dot" [ngClass]="getBadgeClass(o.status)">{{ getStatusName(o.status) }}</span>
                  </td>
                  <td class="num po-strong" [attr.data-label]="'purchaseOrders.totalAmount' | t">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</td>
                  <td class="po-actions-td" (click)="$event.stopPropagation()">
                    <div class="po-actions">
                      @if (o.status === 'Draft') {
                        <button class="btn btn-primary btn-sm" (click)="sendPurchaseOrder(o)">{{ 'purchaseOrders.send' | t }}</button>
                        <button class="edit-btn" [title]="'common.edit' | t" (click)="editPurchaseOrder(o)">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="delete-btn" [title]="'common.delete' | t" (click)="deletePurchaseOrder(o)">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      } @else if (o.status === 'Sent') {
                        <button class="btn btn-primary btn-sm" (click)="receivePurchaseOrder(o)">{{ 'purchaseOrders.receive' | t }}</button>
                        <button class="icon-btn" [title]="'purchaseOrders.cancelOrder' | t" (click)="cancelPurchaseOrder(o)">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                        </button>
                      } @else if (o.status === 'Partially Received') {
                        <button class="btn btn-primary btn-sm" (click)="receivePurchaseOrder(o)">{{ 'purchaseOrders.receiveMore' | t }}</button>
                      } @else if (o.status === 'Cancelled') {
                        <button class="delete-btn" [title]="'common.delete' | t" (click)="deletePurchaseOrder(o)">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      }
                      <button class="icon-btn" [title]="'purchaseOrders.orderDetails' | t" (click)="openDetailDrawer(o)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- New Order Drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editingPoId() ? 'purchaseOrders.editTitle' : 'purchaseOrders.newTitle') | t }}</span>
            <button class="drawer-close" (click)="closeDrawer()" [title]="'common.close' | t">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <form [formGroup]="poForm" (ngSubmit)="savePo()" class="po-form">
            <div class="drawer-body">
              <div class="form-field">
                <select formControlName="supplierId" class="form-input form-select" [class.has-value]="hasValue('supplierId')" (change)="onSupplierChange()">
                  <option value="" disabled selected></option>
                  @for (s of suppliers(); track s.id) {
                    <option [value]="s.id">{{ s.name }}</option>
                  }
                </select>
                <label class="form-label">{{ 'purchaseOrders.supplier' | t }}</label>
                @if (isFieldInvalid('supplierId')) { <div class="form-error">{{ 'purchaseOrders.supplierRequired' | t }}</div> }
              </div>

              <div class="form-row">
                <div class="form-field">
                  <select formControlName="currency" class="form-input form-select has-value">
                    @for (c of currencies(); track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                  <label class="form-label">{{ 'finance.currency' | t }}</label>
                </div>
                <div class="form-field">
                  <select formControlName="warehouseId" class="form-input form-select has-value">
                    <option value="">{{ 'purchaseOrders.defaultWarehouse' | t }}</option>
                    @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                  </select>
                  <label class="form-label">{{ 'purchaseOrders.receivingWarehouse' | t }}</label>
                </div>
              </div>
              <div class="field-hint po-hint">{{ (pricesIncludeTax() ? 'finance.pricesIncludeTax' : 'finance.pricesExcludeTax') | t }}</div>

              <div class="form-field">
                <input type="date" formControlName="expectedDate" class="form-input has-value" />
                <label class="form-label">{{ 'purchaseOrders.expectedDate' | t }}</label>
              </div>

              <div class="form-field">
                <textarea formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')"></textarea>
                <label class="form-label">{{ 'purchaseOrders.notes' | t }}</label>
              </div>

              <div class="po-section">
                <div class="po-section-head">
                  <h3 class="po-h3">{{ 'purchaseOrders.orderItems' | t }}</h3>
                  <div class="cluster">
                    <button type="button" class="btn btn-sm btn-secondary" (click)="openLineScanner()" [disabled]="scanning()">
                      @if (scanning()) { <span class="spinner-sm"></span> } @else {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8"/></svg>
                      } {{ 'purchaseOrders.scan' | t }}
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" (click)="addItem()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                      {{ 'purchaseOrders.addProduct' | t }}
                    </button>
                  </div>
                </div>

                <div formArrayName="items" class="stack po-lines">
                  @for (item of itemsArray.controls; track i; let i = $index) {
                    <div [formGroupName]="i" class="po-line" [class.po-line-hl]="highlightIndex() === i">
                      <div class="po-line-product">
                        <select formControlName="productId" class="select" (change)="onProductChange(i)">
                          <option value="" disabled selected>{{ 'purchaseOrders.selectProduct' | t }}</option>
                          @for (p of state.products(); track p.id) {
                            <option [value]="p.id">{{ p.name }} ({{ 'purchaseOrders.available' | t: { n: p.quantity } }})</option>
                          }
                        </select>
                      </div>
                      <div class="po-line-num">
                        <input type="text" appQty [qtyDecimals]="lineDecimals(item.get('productId')?.value, item.get('unitId')?.value)" formControlName="quantity" class="input" [placeholder]="'purchaseOrders.quantity' | t" [title]="'purchaseOrders.quantity' | t" />
                      </div>
                      @if (productById(item.get('productId')?.value); as lp) {
                        @if (lp.units?.length) {
                          <div class="po-line-num">
                            <select formControlName="unitId" class="select" (change)="onUnitChange(i)" [title]="'purchaseOrders.unit' | t">
                              <option value="">{{ (lp.baseUnit || lp.unit || 'pcs') | unitLabel }}</option>
                              @for (u of lp.units; track u.unitId) {
                                <option [value]="u.unitId">{{ (u.unit || u.unitId) | unitLabel }} (×{{ u.factor | num }})</option>
                              }
                            </select>
                          </div>
                        }
                      }
                      <div class="po-line-num">
                        <input type="number" formControlName="unitPrice" class="input" [placeholder]="'finance.unitPrice' | t" min="0" step="0.01" [title]="'finance.unitPrice' | t" />
                      </div>
                      <button type="button" class="delete-btn" (click)="removeItem(i)" [title]="'common.delete' | t">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                      </button>
                      @if (item.get('productId')?.value) {
                        <app-line-tax-fields [group]="$any(item)" [product]="productById(item.get('productId')?.value)" [rates]="taxRates()" [exemptions]="exemptions()" [withholdings]="withholdings()" [importLine]="foreignSupplier()" [showReverseCharge]="foreignSupplier()"></app-line-tax-fields>
                      }
                      @if (preview().lines[i]; as ln) {
                        <div class="po-line-meta">
                          @if (factorFor(item.get('productId')?.value, item.get('unitId')?.value) !== 1) {
                            <span>{{ 'purchaseOrders.baseQtyHint' | t: { qty: ((item.get('quantity')?.value || 0) * factorFor(item.get('productId')?.value, item.get('unitId')?.value) | num), unit: (baseUnitOf(item.get('productId')?.value) | unitLabel) } }}</span>
                          }
                          @if (quoteLine(i); as ql) {
                            <span>{{ 'finance.taxRate' | t }}: {{ ql.taxRate | num }}%</span>
                            <span>{{ 'finance.taxAmount' | t }}: {{ ql.taxAmount | money: formCurrency() }}</span>
                            @if (ql.withheldTaxAmount > 0) { <span>{{ 'orders.withheldVat' | t }}: {{ ql.withheldTaxAmount | money: formCurrency() }}</span> }
                            <span>{{ 'finance.lineTotal' | t }}: <strong>{{ ql.lineTotal | money: formCurrency() }}</strong></span>
                          } @else if (ln.hasPrice) {
                            <span>{{ 'finance.taxRate' | t }}: {{ ln.rate | num }}%</span>
                            <span>{{ 'finance.taxAmount' | t }}: {{ ln.tax | money: formCurrency() }}</span>
                            <span>{{ 'finance.lineTotal' | t }}: <strong>{{ ln.gross | money: formCurrency() }}</strong></span>
                          } @else if (ln.productId) {
                            <span>{{ 'purchaseOrders.serverPriceHint' | t }}</span>
                          }
                        </div>
                      }
                    </div>
                  }
                  @if (itemsArray.length > 0) {
                    <app-document-tax-fields [group]="taxGroup"></app-document-tax-fields>
                    @if (foreignSupplier()) {
                      <div class="form-row" [formGroup]="poForm">
                        <div class="form-field">
                          <input id="cdNo" type="text" formControlName="customsDeclarationNo" class="form-input has-value mono" maxlength="30" />
                          <label for="cdNo" class="form-label">{{ 'purchaseOrders.customsDeclarationNo' | t }}</label>
                        </div>
                        <div class="form-field">
                          <input id="cdDate" type="date" formControlName="customsDeclarationDate" class="form-input has-value" />
                          <label for="cdDate" class="form-label">{{ 'purchaseOrders.customsDeclarationDate' | t }}</label>
                        </div>
                      </div>
                    }
                    @if (quote()) {
                      <app-tax-summary [view]="quoteView()" [error]="quoteError()" [baseCurrency]="i18n.currency()"></app-tax-summary>
                    } @else {
                      @if (quoteError()) { <app-tax-summary [view]="null" [error]="quoteError()"></app-tax-summary> }
                      <div class="po-totals">
                        <div class="po-trow"><span>{{ 'finance.subtotal' | t }}</span><span class="num">{{ preview().subtotal | money: formCurrency() }}</span></div>
                        <div class="po-trow po-grand"><span>{{ 'finance.grandTotal' | t }}</span><span class="num">{{ preview().total | money: formCurrency() }}</span></div>
                        @if (preview().incomplete) { <div class="field-hint">{{ 'purchaseOrders.previewIncomplete' | t }}</div> }
                      </div>
                    }
                  }
                  @if (itemsArray.length === 0) {
                    <div class="po-empty-lines text-muted">{{ 'purchaseOrders.noItems' | t }}</div>
                  }
                </div>
              </div>
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="poForm.invalid || itemsArray.length === 0 || isSaving() || exemptionMissing()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'purchaseOrders.saving' | t }} } @else { {{ (editingPoId() ? 'purchaseOrders.update' : 'purchaseOrders.createBtn') | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Detail Drawer -->
    @if (detailOrder()) {
      <div class="drawer-overlay" (click)="closeDetailDrawer()">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div>
              <span class="drawer-title">{{ 'purchaseOrders.detailTitle' | t }}</span>
              <span class="po-sub mono po-block">{{ 'purchaseOrders.poNo' | t: { no: formatPoNumber(detailOrder().poNumber) } }}</span>
            </div>
            <button class="drawer-close" (click)="closeDetailDrawer()" [title]="'common.close' | t">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="drawer-body">
            <div class="detail-grid">
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.supplier' | t }}</span>
                <span class="detail-value">{{ detailOrder().supplierName }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.status' | t }}</span>
                <div>
                  <span class="badge badge-dot" [ngClass]="getBadgeClass(detailOrder().status)">{{ getStatusName(detailOrder().status) }}</span>
                </div>
              </div>
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.createdAt' | t }}</span>
                <span class="detail-value">{{ detailOrder().createdAt | appDate: 'datetime' }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">{{ 'purchaseOrders.expectedDate' | t }}</span>
                <span class="detail-value">{{ detailOrder().expectedDate ? (detailOrder().expectedDate | appDate) : '-' }}</span>
              </div>
            </div>

            <h3 class="detail-items-title">{{ 'purchaseOrders.items' | t }}</h3>
            <div class="stack po-gap-2">
              @for (item of getGroupedItems(detailOrder().items); track item.key) {
                <div class="detail-item-row">
                  <span class="detail-item-name">{{ item.productName }}</span>
                  <span class="detail-item-qty">
                    {{ 'purchaseOrders.itemQtyPrice' | t: { qty: qtyLabel(item), price: (item.price | money: detailOrder().currency) } }}
                    · {{ 'finance.taxRate' | t }} {{ item.taxRate | num }}% · {{ 'finance.tax' | t }} {{ item.taxAmount | money: detailOrder().currency }}
                    = <strong>{{ item.lineTotal | money: detailOrder().currency }}</strong>
                  </span>
                  @if ((item.discountAmount || 0) > 0 || item.exemptionCode || item.withholdingCode || item.reverseCharge) {
                    <span class="detail-item-qty">
                      @if ((item.discountAmount || 0) > 0) { {{ 'orders.discount' | t }}: −{{ item.discountAmount | money: detailOrder().currency }} }
                      @if (item.exemptionCode) { · {{ 'finance.exemptionShort' | t: { code: item.exemptionCode } }} }
                      @if (item.withholdingCode) { · {{ 'finance.withholdingCodeShort' | t: { code: item.withholdingCode } }}: {{ (item.withheldTaxAmount || 0) | money: detailOrder().currency }} }
                      @if (item.reverseCharge) { · {{ 'finance.reverseCharge' | t }} }
                    </span>
                  }
                  @if (item.tracking.length) {
                    <div class="po-tracking">
                      @for (tr of item.tracking; track $index) {
                        <span>
                          @if (tr.lotNumber) {
                            {{ 'purchaseOrders.tracking.lotLine' | t: { lot: tr.lotNumber, qty: (tr.quantity | num) } }}
                            @if (tr.expiryDate) { · {{ 'purchaseOrders.tracking.expiry' | t }}: {{ tr.expiryDate | appDate }} }
                          }
                          @if (tr.serials?.length) {
                            {{ 'purchaseOrders.tracking.serials' | t }}: <span class="mono">{{ tr.serials.join(', ') }}</span>
                          }
                        </span>
                      }
                    </div>
                  }
                </div>
              }
            </div>

            <div class="po-totals po-mt-3">
              @for (c of detailOrder().charges || []; track $index) {
                <div class="po-trow"><span>{{ 'orders.charges.' + c.type | t }}@if (c.description) { · {{ c.description }} }</span><span class="num">{{ (c.lineTotal ?? c.amount) | money: detailOrder().currency }}</span></div>
              }
              <app-tax-summary [view]="detailView()" [flat]="true" [baseCurrency]="i18n.currency()"></app-tax-summary>
              @if (detailOrder().isImport) {
                <div class="po-import">
                  <span class="badge badge-info">{{ 'purchaseOrders.import' | t }}</span>
                  <span class="field-hint">{{ 'finance.importVatHint' | t }}</span>
                  <div class="form-row">
                    <div class="form-field">
                      <input id="dCdNo" type="text" class="form-input has-value mono" [(ngModel)]="customsNo" maxlength="30" />
                      <label for="dCdNo" class="form-label">{{ 'purchaseOrders.customsDeclarationNo' | t }}</label>
                    </div>
                    <div class="form-field">
                      <input id="dCdDate" type="date" class="form-input has-value" [(ngModel)]="customsDate" />
                      <label for="dCdDate" class="form-label">{{ 'purchaseOrders.customsDeclarationDate' | t }}</label>
                    </div>
                    <div class="form-field">
                      <input id="dIv" type="number" min="0" step="0.01" class="form-input has-value num" [(ngModel)]="importVat" />
                      <label for="dIv" class="form-label">{{ 'purchaseOrders.importVatAmount' | t }}</label>
                    </div>
                    <div class="form-field">
                      <input id="dNd" type="number" min="0" step="0.01" class="form-input has-value num" [(ngModel)]="nonDeductibleVat" />
                      <label for="dNd" class="form-label">{{ 'purchaseOrders.nonDeductibleImportVat' | t }}</label>
                    </div>
                  </div>
                  @if (detailOrder().status !== 'Cancelled') {
                    <button type="button" class="btn btn-sm btn-secondary" (click)="saveCustoms()" [disabled]="isSaving()">{{ 'purchaseOrders.saveCustoms' | t }}</button>
                  }
                </div>
              }
              @if (warehouseName(detailOrder().warehouseId); as wn) {
                <div class="field-hint">{{ 'purchaseOrders.receivingWarehouse' | t }}: {{ wn }}</div>
              }
            </div>

            @if (detailOrder().notes) {
              <div class="po-section">
                <h3 class="po-h3">{{ 'purchaseOrders.notes' | t }}</h3>
                <p class="po-notes">{{ detailOrder().notes }}</p>
              </div>
            }

            @if (detailOrder().status === 'Received') {
              <div class="po-callout po-callout-success">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
                {{ 'purchaseOrders.receivedInfo' | t }}
              </div>
            } @else if (detailOrder().status === 'Cancelled') {
              <div class="po-callout po-callout-danger">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                {{ 'purchaseOrders.cancelledInfo' | t }}
              </div>
            }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="closeDetailDrawer()">{{ 'common.close' | t }}</button>
            <button class="btn btn-ghost" (click)="docs.print('purchase-orders/' + detailOrder().id + '/print')">{{ 'purchaseOrders.printForm' | t }}</button>
            @if (detailOrder().status !== 'Draft' && detailOrder().status !== 'Sent') {
              <a class="btn btn-ghost" routerLink="/goods-receipts">{{ 'purchaseOrders.goodsReceipts' | t }}</a>
            }
            @if (detailOrder().status === 'Partially Received') {
              <button class="btn btn-secondary" (click)="closePartial(detailOrder())">{{ 'purchaseOrders.closeShort' | t }}</button>
              <button class="btn btn-primary" (click)="receivePurchaseOrder(detailOrder())">{{ 'purchaseOrders.receiveMore' | t }}</button>
            }
            @if (detailOrder().status === 'Draft') {
              <button class="btn btn-outline-danger" (click)="deletePurchaseOrder(detailOrder())">{{ 'common.delete' | t }}</button>
              <button class="btn btn-secondary" (click)="editPurchaseOrder(detailOrder())">{{ 'common.edit' | t }}</button>
              <button class="btn btn-primary" (click)="sendPurchaseOrder(detailOrder())">{{ 'purchaseOrders.send' | t }}</button>
            } @else if (detailOrder().status === 'Sent') {
              <button class="btn btn-outline-danger" (click)="cancelPurchaseOrder(detailOrder())">{{ 'purchaseOrders.cancelOrder' | t }}</button>
              <button class="btn btn-primary" (click)="receivePurchaseOrder(detailOrder())">{{ 'purchaseOrders.receive' | t }}</button>
            } @else if (detailOrder().status === 'Cancelled') {
              <button class="btn btn-danger" (click)="deletePurchaseOrder(detailOrder())">{{ 'common.delete' | t }}</button>
            }
          </div>
        </div>
      </div>
    }

    @if (grTarget(); as po) {
      <app-goods-receipt-form [po]="po" [warehouses]="warehouses()" [products]="state.products()" (done)="onGoodsReceived()" (closed)="grTarget.set(null)"></app-goods-receipt-form>
    }

    @if (scannerMode()) {
      <app-barcode-scanner
        [products]="state.products()"
        (scanResult)="onBarcodeScanned($event)"
        (closeScanner)="scannerMode.set(null)"
      />
    }

    <app-toast></app-toast>
  `,
  styles: [`
    .po-import { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-3); padding-top: var(--space-3); border-top: var(--border-width) dashed var(--color-border); }
    .po-receipt-doc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
    @media (max-width: 640px) { .po-receipt-doc { grid-template-columns: 1fr; } }
    .po-dates { display: flex; align-items: center; gap: var(--space-2); }
    .po-dates .input { width: auto; min-width: 0; }
    .po-skel { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
    .po-link { color: var(--color-primary-text); font-weight: var(--weight-semibold); text-decoration: none; white-space: nowrap; }
    .po-link:hover { text-decoration: underline; }
    .po-strong { font-weight: var(--weight-medium); color: var(--color-text); }
    td.num.po-strong { font-weight: var(--weight-semibold); white-space: nowrap; }
    .po-sub { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
    .po-block { display: block; margin-top: 2px; }
    .po-items { min-width: 220px; max-width: 380px; }
    .po-item { display: flex; flex-direction: column; line-height: 1.35; }
    .po-item + .po-item { margin-top: var(--space-1); }
    .po-note { margin-top: var(--space-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 340px; }
    .po-actions-td { text-align: right; white-space: nowrap; }
    .po-items-in { display: flex; flex-direction: column; min-width: 0; }
    .po-actions { display: inline-flex; align-items: center; gap: var(--space-1); justify-content: flex-end; }
    .po-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .po-hint { margin: calc(var(--space-2) * -1) 0 var(--space-3); }
    .po-section { margin-top: var(--space-6); }
    .po-section-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
    .po-h3 { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-2); }
    .po-section-head .po-h3 { margin: 0; }
    .po-lines { gap: var(--space-3); }
    .po-line { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; padding: var(--space-3); background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-md); transition: box-shadow var(--duration-fast) var(--ease-standard); }
    .po-line-hl { box-shadow: var(--focus-ring); border-color: var(--color-primary); }
    .po-line-product { flex: 2 1 200px; min-width: 0; }
    .po-line-num { flex: 1 1 90px; min-width: 0; }
    .po-line .select, .po-line .input { width: 100%; }
    .po-line-meta { flex-basis: 100%; font-size: var(--text-xs); color: var(--color-text-secondary); display: flex; gap: var(--space-3); flex-wrap: wrap; }
    .po-totals { padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-size: var(--text-sm); display: flex; flex-direction: column; gap: var(--space-1); }
    .po-trow { display: flex; justify-content: space-between; gap: var(--space-3); }
    .po-grand { font-weight: var(--weight-bold); color: var(--color-text); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-2); margin-top: var(--space-1); }
    .po-empty-lines { text-align: center; padding: var(--space-4); border: 1px dashed var(--color-border); border-radius: var(--radius-md); font-size: var(--text-sm); }
    .po-mt-3 { margin-top: var(--space-3); }
    .po-gap-2 { gap: var(--space-2); }
    .po-notes { font-size: var(--text-sm); line-height: 1.5; color: var(--color-text-secondary); background: var(--color-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); margin: 0; white-space: pre-wrap; }
    .po-callout { margin-top: var(--space-6); padding: var(--space-3); border-radius: var(--radius-md); display: flex; align-items: center; gap: var(--space-2); font-weight: var(--weight-medium); font-size: var(--text-sm); border: 1px solid; }
    .po-callout-success { background: var(--color-success-subtle); border-color: var(--color-success-border); color: var(--color-success-text); }
    .po-callout-danger { background: var(--color-danger-subtle); border-color: var(--color-danger-border); color: var(--color-danger-text); }
    .po-tracking { flex-basis: 100%; font-size: var(--text-xs); color: var(--color-text-secondary); display: flex; flex-direction: column; gap: 2px; }
    .po-modal-overlay { display: flex; align-items: center; justify-content: center; padding: var(--space-4); }
    .po-modal { background: var(--color-surface-raised, var(--color-surface)); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); padding: var(--space-6); width: min(440px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-4); }
    .po-modal-wide { width: min(640px, 100%); }
    .po-modal-head { display: flex; flex-direction: column; gap: var(--space-1); }
    .po-modal-title { margin: 0; font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--color-text); }
    .po-modal-head .po-sub { font-size: var(--text-sm); color: var(--color-text-secondary); }
    .po-modal-foot { display: flex; justify-content: flex-end; gap: var(--space-2); }
    .po-rlines { display: flex; flex-direction: column; gap: var(--space-3); max-height: 50vh; overflow-y: auto; }
    .po-rline { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); background: var(--color-surface-subtle); }
    .po-rline-head, .po-rline-foot { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .po-lot { display: flex; gap: var(--space-2); align-items: center; }
    .po-lot .input { min-width: 0; }
    .po-lot-no { flex: 2; } .po-lot-date { flex: 1.6; } .po-lot-qty { flex: 1; }
    .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); background: var(--color-surface-subtle); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-border); }
    .detail-field { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
    .detail-label { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--color-text-muted); }
    .detail-value { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text); }
    .detail-items-title { font-size: var(--text-sm); font-weight: var(--weight-semibold); margin: var(--space-6) 0 var(--space-3); color: var(--color-text); }
    .detail-item-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); background: var(--color-surface); border-radius: var(--radius-md); border: 1px solid var(--color-border); }
    .detail-item-name { font-weight: var(--weight-semibold); font-size: var(--text-sm); color: var(--color-text); }
    .detail-item-qty { font-size: var(--text-xs); color: var(--color-text-secondary); text-align: right; font-variant-numeric: tabular-nums; }
    .detail-item-qty strong { color: var(--color-text); }
    @media (max-width: 640px) {
      .filter-bar .po-dates { width: 100%; }
      .po-dates .input { flex: 1; }
      .po-items, .po-note { max-width: none; min-width: 0; }
      .po-line-product { flex-basis: 100%; }
      .detail-grid { grid-template-columns: 1fr; }
      .detail-item-qty { text-align: left; }
      .po-lot { flex-wrap: wrap; }
      .po-lot-no { flex-basis: 100%; }
      .po-modal { padding: var(--space-4); }
      .po-items-in { align-items: flex-end; text-align: right; }
      .po-actions-td { text-align: left; }
    }
  `]
})
export class PurchaseOrdersComponent implements OnInit {
  inventory = inject(InventoryService);
  state = inject(AppStateService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  orders = signal<any[]>([]);
  suppliers = signal<any[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  isAutoDrafting = signal(false);
  detailOrder = signal<any>(null);
  editingPoId = signal<string | null>(null);
  taxRates = signal<TaxRate[]>([]);
  warehouses = signal<Warehouse[]>([]);
  receiveTarget = signal<any>(null);
  receiveWarehouseId = signal<string>('');
  /** Actual receipt moment (datetime-local, company time) and the supplier's despatch / invoice reference */
  receiveAt = signal<string>('');
  receiveDocNo = signal<string>('');
  receiveDocDate = signal<string>('');
  private formValue = signal<any>(null);

  nowLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  /** Decimals of a PO line's unit (base unit precision, or the alternate unit's). */
  lineDecimals(productId: string, unitId?: string | null): number {
    const p = this.productById(productId);
    if (!p) return 0;
    if (!unitId) return productDecimals(p);
    return Number(p.units?.find(u => u.unitId === unitId)?.unit?.decimals) || 0;
  }

  pricesIncludeTax = computed(() => !!this.ui.userProfile()?.company?.pricesIncludeTax);
  currencies = computed(() => Array.from(new Set([this.i18n.currency(), 'TRY', 'USD', 'EUR', 'GBP'])));
  formCurrency = computed(() => this.formValue()?.currency || this.i18n.currency());
  defaultWarehouseId = computed(() => this.warehouses().find(w => w.isDefault)?.id || '');

  preview = computed(() => {
    const v = this.formValue();
    const lines = (v?.items || []).map((it: any) => {
      const hasPrice = it.unitPrice !== null && it.unitPrice !== '' && it.unitPrice !== undefined && !isNaN(Number(it.unitPrice));
      const res = this.calcLine(it.productId, Number(it.quantity) || 0, hasPrice ? Number(it.unitPrice) : 0);
      return { ...res, productId: it.productId, hasPrice };
    });
    const priced = lines.filter((l: any) => l.hasPrice && l.productId);
    return {
      lines,
      ...this.summarize(priced.map((l: any) => ({ rate: l.rate, net: l.net, tax: l.tax }))),
      incomplete: lines.some((l: any) => l.productId && !l.hasPrice)
    };
  });

  detailTotals = computed(() => {
    const o = this.detailOrder();
    if (!o) return { subtotal: 0, total: 0, breakdown: [] as { rate: number; base: number; tax: number }[] };
    const s = this.summarize((o.items || []).map((it: any) => {
      const tax = Number(it.taxAmount) || 0;
      const gross = Number(it.lineTotal ?? 0);
      return { rate: Number(it.taxRate) || 0, net: this.round(gross - tax), tax };
    }));
    return {
      subtotal: o.subtotal ?? s.subtotal,
      total: o.grandTotal ?? o.totalAmount ?? s.total,
      breakdown: s.breakdown
    };
  });

  private round(n: number) { return Math.round(n * 100) / 100; }

  // ─── Tax engine (WP3) ───
  taxService = inject(TaxService);
  exemptions = signal<ExemptionCode[]>([]);
  withholdings = signal<WithholdingCode[]>([]);
  quote = signal<TaxQuote | null>(null);
  quoteError = signal<string | null>(null);
  private quoteIndex: number[] = [];
  private quoteSub?: Subscription;
  customsNo = '';
  customsDate = '';
  importVat: number | null = null;
  nonDeductibleVat: number | null = null;

  get taxGroup(): FormGroup {
    return this.poForm.get('tax') as FormGroup;
  }

  foreignSupplier = computed(() => {
    const id = this.formValue()?.supplierId;
    const s = this.suppliers().find((x: any) => x.id === id);
    return !!s && (s.isForeign || s.identityType === 'FOREIGN');
  });

  quoteView(): TaxSummaryView | null {
    const q = this.quote();
    return q ? summaryFromQuote(q) : null;
  }

  quoteLine(i: number) {
    const q = this.quote();
    const k = this.quoteIndex[i];
    return q && k !== undefined && k >= 0 ? q.doc.lines[k] ?? null : null;
  }

  detailView(): TaxSummaryView | null {
    const o = this.detailOrder();
    return o ? summaryFromDocument(o, this.i18n.currency()) : null;
  }

  exemptionMissing(): boolean {
    if (this.foreignSupplier()) return false;
    return this.itemsArray.controls.some(l => lineNeedsExemption(l, this.productById(l.get('productId')?.value), this.taxRates()));
  }

  private lineItems(v: any, collectIndex = false): any[] {
    const out: any[] = [];
    if (collectIndex) this.quoteIndex = [];
    (v.items || []).forEach((it: any) => {
      const qty = Number(it.quantity);
      if (!it.productId || !(qty > 0)) { if (collectIndex) this.quoteIndex.push(-1); return; }
      if (collectIndex) this.quoteIndex.push(out.length);
      const hasPrice = it.unitPrice !== null && it.unitPrice !== '' && it.unitPrice !== undefined;
      out.push({ productId: it.productId, quantity: qty, ...(it.unitId ? { unitId: it.unitId } : {}), ...(hasPrice ? { unitPrice: Number(it.unitPrice) } : {}), ...lineTaxPayload(it, true) });
    });
    return out;
  }

  private startQuotes() {
    this.quoteSub?.unsubscribe();
    this.quoteSub = this.poForm.valueChanges.pipe(
      debounceTime(400),
      switchMap(() => {
        const v = this.poForm.getRawValue();
        const items = this.lineItems(v, true);
        if (!v.supplierId || !items.length || this.exemptionMissing()) { this.quote.set(null); return of(null); }
        return this.taxService.quotePurchaseOrder({ supplierId: v.supplierId, currency: v.currency || undefined, items, ...documentTaxPayload(v.tax || {}) }).pipe(
          catchError((err) => { this.quoteError.set(err.error?.message || this.i18n.t('finance.quoteFailed')); this.quote.set(null); return of(null); }),
        );
      }),
    ).subscribe((q) => { if (q) { this.quote.set(q); this.quoteError.set(null); } });
  }

  saveCustoms() {
    const o = this.detailOrder();
    if (!o) return;
    this.isSaving.set(true);
    this.taxService.updatePurchaseOrderCustoms(o.id, {
      customsDeclarationNo: this.customsNo || null,
      customsDeclarationDate: this.customsDate || null,
      importVatAmount: this.importVat === null || (this.importVat as any) === '' ? null : Number(this.importVat),
      nonDeductibleImportVat: this.nonDeductibleVat === null || (this.nonDeductibleVat as any) === '' ? null : Number(this.nonDeductibleVat),
    }).subscribe({
      next: (po) => { this.isSaving.set(false); this.detailOrder.set(po); this.loadData(); this.ui.showToast(this.i18n.t('purchaseOrders.customsSaved'), 'success'); },
      error: (err) => { this.isSaving.set(false); this.ui.showToast(err.error?.message || this.i18n.t('purchaseOrders.actionFailed'), 'error'); },
    });
  }

  private taxRateFor(productId: string): number {
    const p: any = this.state.products().find(x => x.id === productId);
    const rates = this.taxRates();
    const r = (p?.taxRateId && rates.find(t => t.id === p.taxRateId)) || rates.find(t => t.isDefault);
    return r ? Number(r.rate) || 0 : 0;
  }

  private calcLine(productId: string, qty: number, price: number) {
    const rate = productId ? this.taxRateFor(productId) : 0;
    let net: number, tax: number, gross: number;
    if (this.pricesIncludeTax()) {
      gross = this.round(price * qty);
      net = this.round(gross / (1 + rate / 100));
      tax = this.round(gross - net);
    } else {
      net = this.round(price * qty);
      tax = this.round(net * rate / 100);
      gross = this.round(net + tax);
    }
    return { rate, net, tax, gross };
  }

  private summarize(lines: { rate: number; net: number; tax: number }[]) {
    const map = new Map<number, { rate: number; base: number; tax: number }>();
    let subtotal = 0, taxTotal = 0;
    for (const l of lines) {
      subtotal += l.net; taxTotal += l.tax;
      const e = map.get(l.rate) || { rate: l.rate, base: 0, tax: 0 };
      e.base = this.round(e.base + l.net); e.tax = this.round(e.tax + l.tax);
      map.set(l.rate, e);
    }
    subtotal = this.round(subtotal); taxTotal = this.round(taxTotal);
    return { subtotal, taxTotal, total: this.round(subtotal + taxTotal), breakdown: Array.from(map.values()).sort((a, b) => a.rate - b.rate) };
  }

  warehouseName(id?: string | null): string {
    return id ? (this.warehouses().find(w => w.id === id)?.name || '') : '';
  }

  /** Prefill unit price (per chosen unit) only when product currency matches PO currency */
  private suggestedPrice(productId: string, unitId?: string | null): number | null {
    const p: any = this.state.products().find(x => x.id === productId);
    if (!p) return null;
    const pc = p.currency || this.i18n.currency();
    return pc === this.formCurrency() ? this.round(Number(p.price) * this.factorFor(productId, unitId)) : null;
  }

  onProductChange(i: number) {
    const g = this.itemsArray.at(i);
    g.patchValue({ unitId: '' });
    g.patchValue({ unitPrice: this.suggestedPrice(g.get('productId')?.value) });
  }

  onUnitChange(i: number) {
    const g = this.itemsArray.at(i);
    g.patchValue({ unitPrice: this.suggestedPrice(g.get('productId')?.value, g.get('unitId')?.value) });
  }

  productById(id: string | null | undefined): Product | undefined {
    return id ? this.state.products().find(p => p.id === id) : undefined;
  }

  factorFor(productId: string | null | undefined, unitId: string | null | undefined): number {
    if (!unitId) return 1;
    const pu = this.productById(productId)?.units?.find(u => u.unitId === unitId);
    return pu ? Number(pu.factor) || 1 : 1;
  }

  baseUnitOf(productId: string | null | undefined): any {
    const p = this.productById(productId);
    return p?.baseUnit || p?.unit || 'pcs';
  }

  private unitLabelText(code: string): string {
    const key = `units.${code}`;
    const tr = this.i18n.t(key);
    return tr && tr !== key ? tr : code;
  }

  /** "3 Box (= 36)" for alternate-unit lines, else the base quantity */
  qtyLabel(item: any): string {
    const nf = (n: number) => this.i18n.formatNumber(n);
    if (item.unitFactor != null && Number(item.unitFactor) !== 1 && item.unitQuantity != null) {
      return `${nf(item.unitQuantity)} ${item.unitCode ? this.unitLabelText(item.unitCode) : ''} (= ${nf(item.quantity)})`;
    }
    return `${nf(item.quantity)} ${this.unitLabelText(item.unitCode || 'pcs')}`;
  }

  // ─── Barcode scanning ───
  scannerMode = signal<'line' | 'serial' | null>(null);
  scanning = signal(false);
  highlightIndex = signal<number | null>(null);
  private serialScanItemId: string | null = null;

  openLineScanner() {
    this.scannerMode.set('line');
  }

  openSerialScanner(itemId: string) {
    this.serialScanItemId = itemId;
    this.scannerMode.set('serial');
  }

  onBarcodeScanned(code: string) {
    const mode = this.scannerMode();
    this.scannerMode.set(null);
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    if (mode === 'serial') {
      const rl = this.receiveLines().find(l => l.itemId === this.serialScanItemId);
      if (!rl) return;
      const list = this.parseSerials(rl.serialsText);
      if (list.includes(trimmed)) {
        this.ui.showToast(this.i18n.t('purchaseOrders.receiveDialog.serialAlready', { serial: trimmed }), 'info');
        return;
      }
      rl.serialsText = [...list, trimmed].join('\n');
      this.touchReceive();
      return;
    }
    this.scanning.set(true);
    this.inventory.lookupBarcode(trimmed).subscribe({
      next: res => { this.scanning.set(false); this.applyLineScan(res); },
      error: () => {
        this.scanning.set(false);
        this.ui.showToast(this.i18n.t('purchaseOrders.scanNotFound', { code: trimmed }), 'error');
      }
    });
  }

  private applyLineScan(res: BarcodeLookupResult) {
    const productId = res.product.id;
    const unitId = res.unitId || '';
    let index = this.itemsArray.controls.findIndex(c => c.get('productId')?.value === productId && (c.get('unitId')?.value || '') === unitId);
    if (index !== -1) {
      const g = this.itemsArray.at(index);
      g.patchValue({ quantity: (Number(g.get('quantity')?.value) || 0) + 1 });
    } else {
      index = this.itemsArray.controls.findIndex(c => !c.get('productId')?.value);
      if (index === -1) { this.addItem(); index = this.itemsArray.length - 1; }
      this.itemsArray.at(index).patchValue({ productId, unitId, quantity: 1, unitPrice: this.suggestedPrice(productId, unitId) });
    }
    this.highlightIndex.set(index);
    setTimeout(() => this.highlightIndex.set(null), 600);
  }

  // ─── Receive with lot / serial capture ───
  receiveLines = signal<{
    itemId: string; productName: string; quantity: number; trackingType: 'lot' | 'serial'; hasExpiry: boolean; decimals: number;
    lots: { lotNumber: string; expiryDate: string; quantity: number | null }[]; serialsText: string;
  }[]>([]);
  private receiveVersion = signal(0);

  touchReceive() {
    this.receiveVersion.update(v => v + 1);
  }

  private parseSerials(text: string): string[] {
    return (text || '').split(/[\r\n,;]+/).map(x => x.trim()).filter(Boolean);
  }

  hasDuplicateSerials(rl: { serialsText: string }): boolean {
    const list = this.parseSerials(rl.serialsText);
    return new Set(list).size !== list.length;
  }

  receiveLineCount(rl: { trackingType: string; lots: { quantity: number | null }[]; serialsText: string }): number {
    if (rl.trackingType === 'lot') return sumQty(rl.lots.map((l) => Number(l.quantity) || 0));
    return this.parseSerials(rl.serialsText).length;
  }

  receiveLineValid(rl: any): boolean {
    if (rl.trackingType === 'lot') {
      const rowsOk = rl.lots.every((l: any) => (l.lotNumber || '').trim() && Number(l.quantity) > 0 && fitsDecimals(Number(l.quantity), rl.decimals) && (!rl.hasExpiry || l.expiryDate));
      return rowsOk && this.receiveLineCount(rl) === roundQty(rl.quantity);
    }
    return !this.hasDuplicateSerials(rl) && this.receiveLineCount(rl) === rl.quantity;
  }

  receiveValid(): boolean {
    this.receiveVersion();
    return this.receiveLines().every(rl => this.receiveLineValid(rl));
  }

  addReceiveLot(rl: { lots: any[] }) {
    rl.lots.push({ lotNumber: '', expiryDate: '', quantity: null });
    this.touchReceive();
  }

  removeReceiveLot(rl: { lots: any[] }, index: number) {
    rl.lots.splice(index, 1);
    this.touchReceive();
  }

  // Filter Signals
  poSearch = signal('');
  poFilterStatus = signal<string>('all');
  startDate = signal('');
  endDate = signal('');

  poForm: FormGroup = this.fb.group({
    supplierId: ['', Validators.required],
    supplierName: [''],
    currency: [''],
    warehouseId: [''],
    expectedDate: [''],
    notes: [''],
    customsDeclarationNo: [''],
    customsDeclarationDate: [''],
    tax: documentTaxGroup(this.fb),
    items: this.fb.array([])
  });

  get itemsArray() {
    return this.poForm.get('items') as FormArray;
  }

  filteredOrders = computed(() => {
    let list = this.orders();
    const search = this.poSearch().toLowerCase().trim();
    const status = this.poFilterStatus();
    const start = this.startDate();
    const end = this.endDate();

    if (search) {
      list = list.filter(o => 
        (o.supplierName && o.supplierName.toLowerCase().includes(search)) ||
        (o.poNumber && o.poNumber.toLowerCase().includes(search))
      );
    }
    if (status !== 'all') {
      list = list.filter(o => o.status === status);
    }
    if (start) {
      const startMs = new Date(start).setHours(0, 0, 0, 0);
      list = list.filter(o => new Date(o.createdAt).getTime() >= startMs);
    }
    if (end) {
      const endMs = new Date(end).setHours(23, 59, 59, 999);
      list = list.filter(o => new Date(o.createdAt).getTime() <= endMs);
    }
    return list;
  });

  hasValue(fieldName: string): boolean {
    const val = this.poForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.poForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  ngOnInit() {
    this.poForm.valueChanges.subscribe(v => this.formValue.set(v));
    let lastCurrency = '';
    this.poForm.get('currency')!.valueChanges.subscribe(c => {
      if (c && lastCurrency && c !== lastCurrency) {
        this.formValue.set(this.poForm.getRawValue());
        this.itemsArray.controls.forEach(g => g.patchValue({ unitPrice: this.suggestedPrice(g.get('productId')?.value) }, { emitEvent: false }));
        this.formValue.set(this.poForm.getRawValue());
      }
      lastCurrency = c;
    });
    this.inventory.getTaxRates().subscribe({ next: r => this.taxRates.set(r), error: () => {} });
    this.taxService.exemptions().subscribe({ next: e => this.exemptions.set(e), error: () => {} });
    this.taxService.withholdings().subscribe({ next: w => this.withholdings.set(w), error: () => {} });
    this.inventory.getWarehouses().subscribe({ next: w => this.warehouses.set(w), error: () => {} });
    this.loadData();
    if (this.state.products().length === 0) {
      this.state.loadData();
    }
    this.route.queryParams.subscribe(params => {
      this.poSearch.set(params['q'] || '');
      if (params['open'] === 'new') {
        this.openDrawer();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { open: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });
  }

  loadData() {
    this.isLoading.set(true);
    this.inventory.getSuppliers().subscribe(sups => {
      this.suppliers.set(sups);
      this.inventory.getPurchaseOrders().subscribe({
        next: (res) => {
          this.orders.set(res);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.ui.showToast(this.i18n.t('purchaseOrders.loadFailed'), 'error');
        }
      });
    });
  }

  openDrawer() {
    this.poForm.reset({
      supplierId: '',
      supplierName: '',
      currency: this.i18n.currency(),
      warehouseId: this.defaultWarehouseId(),
      expectedDate: '',
      notes: '',
      customsDeclarationNo: '',
      customsDeclarationDate: ''
    });
    this.poForm.setControl('tax', documentTaxGroup(this.fb));
    this.quote.set(null);
    this.quoteError.set(null);
    this.startQuotes();
    this.itemsArray.clear();
    this.addItem();
    this.formValue.set(this.poForm.getRawValue());
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.quoteSub?.unsubscribe();
    this.isDrawerOpen.set(false);
    this.editingPoId.set(null);
  }

  openDetailDrawer(order: any) {
    this.customsNo = order.customsDeclarationNo || '';
    this.customsDate = order.customsDeclarationDate || '';
    this.importVat = order.importVatAmount ?? null;
    this.nonDeductibleVat = order.nonDeductibleImportVat ?? null;
    this.detailOrder.set(order);
  }

  closeDetailDrawer() {
    this.detailOrder.set(null);
  }

  onSupplierChange() {
    const id = this.poForm.get('supplierId')?.value;
    const sup = this.suppliers().find(s => s.id === id);
    if (sup) {
      this.poForm.patchValue({ supplierName: sup.name });
    }
  }

  addItem() {
    this.itemsArray.push(this.fb.group({
      productId: ['', Validators.required],
      unitId: [''],
      quantity: [1, [Validators.required, Validators.min(0.0001)]],
      unitPrice: [null as number | null, [Validators.min(0)]],
      ...lineTaxControls(this.fb),
    }));
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
  }

  savePo() {
    if (this.poForm.invalid || this.itemsArray.length === 0) {
      this.poForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const data = this.poForm.value;
    
    const payload: PurchaseOrderPayload & { expectedDate?: string } = {
      supplierId: data.supplierId,
      currency: data.currency || undefined,
      warehouseId: data.warehouseId || undefined,
      notes: data.notes || undefined,
      items: this.lineItems(data),
      ...documentTaxPayload(data.tax || {}),
      ...(data.customsDeclarationNo ? { customsDeclarationNo: data.customsDeclarationNo } : {}),
      ...(data.customsDeclarationDate ? { customsDeclarationDate: data.customsDeclarationDate } : {}),
    };
    if (data.expectedDate) payload.expectedDate = data.expectedDate;


    const request$ = this.editingPoId()
      ? this.inventory.updatePurchaseOrder(this.editingPoId()!, payload as PurchaseOrderPayload)
      : this.inventory.createPurchaseOrder(payload as PurchaseOrderPayload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadData();
        this.ui.showToast(this.editingPoId() ? this.i18n.t('purchaseOrders.updated') : this.i18n.t('purchaseOrders.created'), 'success');
        this.editingPoId.set(null);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || (this.editingPoId() ? this.i18n.t('purchaseOrders.updateFailed') : this.i18n.t('purchaseOrders.createFailed')), 'error');
      }
    });
  }

  editPurchaseOrder(order: any) {
    this.editingPoId.set(order.id);
    this.poForm.reset({
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      currency: order.currency || this.i18n.currency(),
      warehouseId: order.warehouseId || '',
      expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : '',
      notes: order.notes || '',
      customsDeclarationNo: order.customsDeclarationNo || '',
      customsDeclarationDate: order.customsDeclarationDate || ''
    });
    this.poForm.setControl('tax', documentTaxGroup(this.fb, {
      documentDiscountAmount: order.documentDiscountEntered || null,
      taxPointDate: order.taxPointDate || '',
      charges: (order.charges || []).map((c: any) => ({ type: c.type, amount: Number(c.enteredAmount ?? c.amount), description: c.description })),
    }));
    this.quote.set(null);
    this.startQuotes();
    this.itemsArray.clear();
    order.items.forEach((it: any) => {
      const inUnit = !!it.unitId && it.unitQuantity != null;
      this.itemsArray.push(this.fb.group({
        productId: [it.productId, Validators.required],
        unitId: [it.unitId || ''],
        quantity: [inUnit ? it.unitQuantity : it.quantity, [Validators.required, Validators.min(0.0001)]],
        unitPrice: [it.enteredUnitPrice ?? it.unitPrice ?? it.price ?? null, [Validators.min(0)]],
        ...lineTaxControls(this.fb, { discountRate: it.discountRate || null, exemptionCode: it.exemptionCode || '', reverseCharge: it.reverseCharge }),
      }));
    });
    this.formValue.set(this.poForm.getRawValue());
    this.closeDetailDrawer();
    this.isDrawerOpen.set(true);
  }

  deletePurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.deleteTitle'),
      message: this.i18n.t('purchaseOrders.deleteMessage', { no: this.formatPoNumber(order.poNumber) }),
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deletePurchaseOrder(order.id).pipe(
          tap({
            next: () => {
              this.closeDetailDrawer();
              this.loadData();
              this.ui.showToast(this.i18n.t('purchaseOrders.deleted'), 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || this.i18n.t('purchaseOrders.actionFailed'), 'error');
            }
          })
        );
      }
    });
  }

  sendPurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.sendTitle'),
      message: this.i18n.t('purchaseOrders.sendMessage', { no: this.formatPoNumber(order.poNumber) }),
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Sent').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast(this.i18n.t('purchaseOrders.sentToast'), 'success');
          },
          error: () => {
            this.ui.showToast(this.i18n.t('purchaseOrders.actionFailed'), 'error');
          }
        });
      }
    });
  }

  docs = inject(DocumentsService);
  grTarget = signal<any>(null);

  /** Mal kabul (goods receipt): received / rejected / difference quantities per line; only the accepted quantity enters stock. */
  receivePurchaseOrder(order: any) {
    this.grTarget.set(order);
  }

  onGoodsReceived() {
    this.grTarget.set(null);
    this.closeDetailDrawer();
    this.loadData();
    this.state.loadData();
  }

  /** A partially received order is closed: the rest will not be delivered (no stock effect). */
  closePartial(order: any) {
    this.inventory.updatePurchaseOrderStatus(order.id, 'Received').subscribe({
      next: () => {
        this.closeDetailDrawer();
        this.loadData();
      },
      error: (err) => this.ui.showToast(err.error?.message || this.i18n.t('purchaseOrders.actionFailed'), 'error'),
    });
  }

  legacyReceivePurchaseOrder(order: any) {
    this.receiveWarehouseId.set(order.warehouseId || this.defaultWarehouseId());
    this.receiveAt.set(this.nowLocal());
    this.receiveDocNo.set('');
    this.receiveDocDate.set(this.nowLocal().slice(0, 10));
    const lines = (order.items || [])
      .map((it: any) => ({ it, p: this.productById(it.productId) }))
      .filter(({ it, p }: any) => it.id && (p?.trackingType === 'lot' || p?.trackingType === 'serial'))
      .map(({ it, p }: any) => ({
        itemId: it.id as string,
        productName: it.productName || p.name,
        quantity: Number(it.quantity) || 0,
        trackingType: p.trackingType as 'lot' | 'serial',
        hasExpiry: !!p.hasExpiry,
        decimals: productDecimals(p),
        lots: [{ lotNumber: '', expiryDate: '', quantity: Number(it.quantity) || null }],
        serialsText: ''
      }));
    this.receiveLines.set(lines);
    this.touchReceive();
    this.receiveTarget.set(order);
  }

  private buildReceipts(): PurchaseOrderReceipt[] {
    return this.receiveLines().map(rl => rl.trackingType === 'lot'
      ? { itemId: rl.itemId, lots: rl.lots.map(l => ({ lotNumber: l.lotNumber.trim(), expiryDate: l.expiryDate || null, quantity: Number(l.quantity) })) }
      : { itemId: rl.itemId, serials: this.parseSerials(rl.serialsText) });
  }

  confirmReceive() {
    const order = this.receiveTarget();
    if (!order || !this.receiveValid()) return;
    this.isSaving.set(true);
    const receipts = this.buildReceipts();
    const docNo = this.receiveDocNo().trim();
    this.inventory.updatePurchaseOrderStatus(order.id, 'Received', this.receiveWarehouseId() || undefined, receipts.length ? receipts : undefined, {
      transactionDate: this.receiveAt() || undefined,
      documentType: docNo ? 'DESPATCH' : undefined,
      documentNo: docNo || undefined,
      documentDate: docNo ? this.receiveDocDate() || undefined : undefined,
    }).subscribe({
      next: (po) => {
        this.isSaving.set(false);
        this.receiveTarget.set(null);
        this.closeDetailDrawer();
        this.loadData();
        this.state.loadData(); // Refetch products to get updated stocks
        // A back-dated receipt (VUK 219) comes back with a late-entry warning.
        toastMovementResult(this.ui, this.i18n, po?.warnings, 'purchaseOrders.receivedToast');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('purchaseOrders.actionFailed'), 'error');
      }
    });
  }

  cancelPurchaseOrder(order: any) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.cancelTitle'),
      message: this.i18n.t('purchaseOrders.cancelMessage', { no: this.formatPoNumber(order.poNumber) }),
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(order.id, 'Cancelled').subscribe({
          next: () => {
            this.closeDetailDrawer();
            this.loadData();
            this.ui.showToast(this.i18n.t('purchaseOrders.cancelledToast'), 'success');
          },
          error: () => {
            this.ui.showToast(this.i18n.t('purchaseOrders.actionFailed'), 'error');
          }
        });
      }
    });
  }

  updateStatus(id: string, status: string) {
    this.ui.openConfirm({
      title: this.i18n.t('purchaseOrders.updateStatusTitle'),
      message: this.i18n.t('purchaseOrders.updateStatusMessage'),
      onConfirm: () => {
        this.inventory.updatePurchaseOrderStatus(id, status).subscribe({
          next: () => {
            this.loadData();
            this.state.loadData(); // Refetch products to get updated stocks
            this.ui.showToast(this.i18n.t('purchaseOrders.receivedToastShort'), 'success');
          },
          error: () => {
            this.ui.showToast(this.i18n.t('purchaseOrders.actionFailed'), 'error');
          }
        });
      }
    });
  }

  getGroupedItems(items: any[]): any[] {
    if (!items) return [];
    const grouped: { [key: string]: any } = {};
    for (const item of items) {
      const productId = `${item.productId}|${item.unitId || ''}`;
      if (!grouped[productId]) {
        const p = this.state.products().find(x => x.id === item.productId);
        const price = item.unitPrice ?? item.price ?? item.unitCost ?? 0;
        grouped[productId] = {
          key: productId,
          unitCode: item.unitCode ?? null,
          unitFactor: item.unitFactor ?? 1,
          unitQuantity: 0,
          tracking: [] as TrackingEntry[],
          productId: item.productId,
          productName: item.productName || p?.name || this.i18n.t('purchaseOrders.unknownProduct'),
          quantity: 0,
          price: price,
          taxRate: item.taxRate ?? 0,
          taxAmount: 0,
          lineTotal: 0,
          occurrenceCount: 0
        };
      }
      grouped[productId].quantity += item.quantity;
      grouped[productId].unitQuantity += Number(item.unitQuantity ?? item.quantity) || 0;
      if (item.tracking?.length) grouped[productId].tracking.push(...item.tracking);
      grouped[productId].taxAmount += Number(item.taxAmount) || 0;
      grouped[productId].lineTotal += Number(item.lineTotal ?? item.quantity * grouped[productId].price) || 0;
      grouped[productId].occurrenceCount += 1;
    }
    return Object.values(grouped);
  }

  formatPoNumber(poNumber: string): string {
    if (!poNumber) return '';
    let clean = poNumber.replace(/^#?PO-/, '');
    if (clean.length > 4) {
      clean = clean.slice(-4);
    }
    return `#PO-${clean.toUpperCase()}`;
  }

  getStatusName(status: string) {
    switch (status) {
      case 'Draft': return this.i18n.t('purchaseOrders.status.draft');
      case 'Sent': return this.i18n.t('purchaseOrders.status.sent');
      case 'Received': return this.i18n.t('purchaseOrders.status.received');
      case 'Cancelled': return this.i18n.t('purchaseOrders.status.cancelled');
      case 'Ordered': return this.i18n.t('purchaseOrders.status.sent');
      case 'PartiallyReceived': case 'Partially Received': return this.i18n.t('purchaseOrders.status.partiallyReceived');
      default: return status;
    }
  }

  getBadgeClass(status: string) {
    switch (status) {
      case 'Draft': return 'badge-neutral';
      case 'Sent': case 'Ordered': return 'badge-info';
      case 'PartiallyReceived': case 'Partially Received': return 'badge-warning';
      case 'Received': return 'badge-success';
      case 'Cancelled': return 'badge-danger';
      default: return 'badge-neutral';
    }
  }

  autoDraft() {
    if (this.isAutoDrafting()) return;
    this.isAutoDrafting.set(true);

    this.inventory.autoDraftPurchaseOrders().subscribe({
      next: (res) => {
        this.isAutoDrafting.set(false);
        if (res.count > 0) {
          this.loadData();
          this.ui.showToast(this.i18n.t('purchaseOrders.autoDraftCreated', { count: res.count }), 'success');
        } else {
          this.ui.showToast(this.i18n.t('purchaseOrders.autoDraftNone'), 'success');
        }
      },
      error: () => {
        this.isAutoDrafting.set(false);
        this.ui.showToast(this.i18n.t('purchaseOrders.autoDraftFailed'), 'error');
      }
    });
  }
}
