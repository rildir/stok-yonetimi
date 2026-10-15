import { Component, inject, signal, computed, HostListener, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray, FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Order, CreateOrderPayload } from '../../inventory.service';
import { Customer, TaxRate, OrderItem, Product, StockLot, SerialNumber, BarcodeLookupResult, Warehouse } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { tap } from 'rxjs';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, FormsModule, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .z-top { z-index: 3000; }
    .block { width: 100%; }
    .strong { font-weight: var(--weight-semibold); color: var(--color-text); }
    .link { color: var(--color-primary-text); text-decoration: none; font-weight: var(--weight-medium); }
    .link:hover { text-decoration: underline; }
    .date-input { width: 140px; }

    .orders-list { display: flex; flex-direction: column; gap: var(--space-3); }
    .order-card { padding: 0; gap: 0; overflow: visible; }
    .oc-head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);
      padding: var(--space-3) var(--space-4); background: var(--color-surface-subtle);
      border-bottom: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    .oc-meta { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-8); }
    .oc-label { font-size: var(--text-2xs); font-weight: var(--weight-medium); color: var(--color-text-muted);
      text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
    .oc-value { font-size: var(--text-sm); color: var(--color-text); }
    .oc-ref { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .oc-no { position: relative; display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-text-secondary); }
    .oc-copy { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0;
      background: transparent; color: var(--color-text-muted); border-radius: var(--radius-sm); cursor: pointer; }
    .oc-copy:hover { background: var(--color-surface-muted); color: var(--color-text); }
    .oc-copy:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .oc-tooltip { position: absolute; bottom: 100%; right: 0; margin-bottom: var(--space-1); padding: 2px var(--space-2);
      background: var(--color-text); color: var(--color-bg); border-radius: var(--radius-sm); font-size: var(--text-2xs);
      white-space: nowrap; box-shadow: var(--shadow-md); z-index: 10; }
    .oc-link { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-primary-text); text-decoration: none; }
    .oc-link:hover { text-decoration: underline; }
    .oc-body { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); padding: var(--space-4); }
    .oc-items { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
    .oc-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); max-width: 520px; }
    .oc-lines li { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--text-sm); }
    .oc-product { color: var(--color-text); font-weight: var(--weight-medium); min-width: 0; }
    .oc-ship { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); font-size: var(--text-xs); color: var(--color-text-secondary); }
    .oc-ship > span { display: inline-flex; align-items: center; gap: var(--space-1); }
    .oc-ship strong { color: var(--color-text); font-weight: var(--weight-medium); }
    .oc-actions { display: flex; flex-direction: column; gap: var(--space-2); width: 168px; flex-shrink: 0; }
    @media (max-width: 640px) {
      .date-filters { width: 100%; }
      .date-input { flex: 1; width: auto; min-width: 0; }
      .oc-head, .oc-body { flex-direction: column; }
      .oc-ref { align-items: flex-start; }
      .oc-meta { gap: var(--space-3) var(--space-6); }
      .oc-actions { width: 100%; flex-direction: row; }
      .oc-actions .btn { flex: 1; }
      .oc-lines li { flex-direction: column; gap: 0; }
    }

    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .form-row-2-1 { grid-template-columns: 2fr 1fr; }
    @media (max-width: 640px) { .form-row, .form-row-2-1 { grid-template-columns: 1fr; gap: var(--space-3); } }
    .ol-section { margin-top: var(--space-6); }
    .ol-section-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
    .ol-title { margin: 0; font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--color-text); }
    .ol-lines { display: flex; flex-direction: column; gap: var(--space-2); }
    .ol-line { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-3);
      background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .ol-line.highlight-row { background: var(--color-primary-subtle); border-color: var(--color-primary-border); }
    .ol-product { flex: 2 1 220px; min-width: 0; }
    .ol-qty, .ol-price { flex: 1 1 90px; min-width: 0; }
    .ol-unit { flex: .9 1 90px; min-width: 0; }
    .ol-input { height: 38px; padding: 0 var(--space-3); font-size: var(--text-sm); }
    .ol-total { flex: 1.3 1 110px; text-align: right; font-size: var(--text-sm); line-height: 1.35; }
    .ol-sub { font-size: var(--text-2xs); color: var(--color-text-muted); }
    .ol-remove { flex-shrink: 0; }
    .ol-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 100; max-height: 220px; overflow-y: auto; }
    .ol-dropdown .custom-option { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-3); cursor: pointer; font-size: var(--text-sm); border-bottom: 1px solid var(--color-border-subtle); }
    .ol-dropdown .custom-option:hover { background: var(--color-surface-muted); }
    .opt-left { display: flex; flex-direction: column; min-width: 0; }
    .opt-name { font-weight: var(--weight-medium); color: var(--color-text); }
    .opt-stock { font-size: var(--text-2xs); color: var(--color-text-muted); }
    .opt-stock.low { color: var(--color-warning-text); }
    .opt-price { font-weight: var(--weight-semibold); color: var(--color-text); }
    .selected-stock { color: var(--color-text-muted); font-size: var(--text-2xs); }
    .ol-tracking { flex-basis: 100%; display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-xs); color: var(--color-text-muted); }
    .ol-lot { display: grid; grid-template-columns: 2fr 1.5fr 1fr 80px; gap: var(--space-2); align-items: center; }
    .ol-lot-input { height: 30px; padding: 0 var(--space-2); font-size: var(--text-xs); }
    .ol-serials { display: flex; flex-wrap: wrap; gap: var(--space-1); max-height: 120px; overflow-y: auto; }
    .ol-serial { display: inline-flex; align-items: center; gap: var(--space-1); padding: 2px var(--space-2);
      border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; }
    .ol-error { display: block; margin-top: var(--space-2); }
    @media (max-width: 640px) {
      .ol-product { flex-basis: 100%; }
      .ol-total { flex: 1; text-align: left; }
      .ol-lot { grid-template-columns: 1fr 1fr; }
    }

    .totals-box { margin-top: var(--space-4); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2);
      background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-sm); }
    .tot-row { display: flex; justify-content: space-between; gap: var(--space-3); }
    .tot-row > span:last-child, .tot-row > strong { font-variant-numeric: tabular-nums; }
    .tot-grand { align-items: center; padding-top: var(--space-2); border-top: 1px solid var(--color-border); font-weight: var(--weight-semibold); color: var(--color-text); }
    .tot-grand strong { font-size: var(--text-lg); color: var(--color-text); }
    .detail-items-section > .detail-item-list > .tot-grand { margin-top: var(--space-3); padding: var(--space-3) 0 0; }
    .totals-box.flat { background: none; border: 0; border-top: 1px solid var(--color-border); border-radius: 0; padding: var(--space-3) 0 0; }
    .detail-value-col { color: var(--color-text); }
    .tot-small { font-size: var(--text-xs); margin-top: var(--space-1); }
    .tot-note { text-align: right; }
    .detail-items-section { margin-top: var(--space-4); }
    .detail-item-row { padding: var(--space-3) 0; }
    .detail-item-name { font-weight: var(--weight-semibold); font-size: var(--text-sm); color: var(--color-text); }
    .detail-item-calc { font-size: var(--text-xs); color: var(--color-text-muted); }
    .detail-item-total { font-family: inherit; font-weight: var(--weight-semibold); font-size: var(--text-sm); }
    .skeleton-title.short { width: 40%; }
    .skeleton-row.block { margin: 0; }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'orders.title' | t }}</h1>
        <p>{{ 'orders.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openCreateOrder()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          {{ 'orders.newOrder' | t }}
        </button>
      </div>
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'orders.searchPlaceholder' | t" [value]="orderSearch()" (input)="onSearchInput($event)"/>
      </div>

      <div class="date-filters">
        <input type="text" class="input date-input" [placeholder]="'orders.startDate' | t"
          onfocus="(this.type='date')" onblur="if(!this.value)this.type='text'"
          [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" />
        <span class="date-separator">–</span>
        <input type="text" class="input date-input" [placeholder]="'orders.endDate' | t"
          onfocus="(this.type='date')" onblur="if(!this.value)this.type='text'"
          [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" />
        @if (startDate() || endDate()) {
          <button class="btn-clear" (click)="startDate.set(''); endDate.set('')" [title]="'orders.clearFilter' | t" [attr.aria-label]="'orders.clearFilter' | t">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        }
      </div>

      <div class="filter-pills">
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'all'" (click)="orderFilterStatus.set('all')">{{ 'orders.filter.all' | t }}</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Pending'" (click)="orderFilterStatus.set('Pending')">{{ 'orders.filter.pending' | t }}</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Completed'" (click)="orderFilterStatus.set('Completed')">{{ 'orders.filter.completed' | t }}</button>
        <button class="filter-pill" [class.active]="orderFilterStatus() === 'Cancelled'" (click)="orderFilterStatus.set('Cancelled')">{{ 'orders.filter.cancelled' | t }}</button>
      </div>
    </div>

    <div class="orders-list">
      @for (o of filteredOrders(); track o.id) {
        <article class="card order-card">
          <div class="oc-head">
            <div class="oc-meta">
              <div>
                <div class="oc-label">{{ 'orders.card.orderDate' | t }}</div>
                <div class="oc-value">{{ o.date | appDate: 'datetime' }}</div>
              </div>
              <div>
                <div class="oc-label">{{ 'orders.card.totalAmount' | t }}</div>
                <div class="oc-value num strong">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</div>
              </div>
              <div>
                <div class="oc-label">{{ 'orders.card.recipient' | t }}</div>
                <div class="oc-value">{{ o.customerName }}</div>
              </div>
            </div>
            <div class="oc-ref">
              <div class="oc-no">
                <span class="num">{{ 'orders.card.orderNo' | t: { number: o.orderNumber } }}</span>
                <button class="oc-copy" (click)="copyToClipboard(o.orderNumber, o.id); $event.stopPropagation()" [title]="'orders.card.copyOrderNo' | t" [attr.aria-label]="'orders.card.copyOrderNo' | t">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                @if (copiedOrderId() === o.id) {
                  <span class="oc-tooltip">{{ 'orders.card.copied' | t }}</span>
                }
              </div>
              <a href="#" class="oc-link" (click)="openOrderDetail(o); $event.preventDefault()">{{ 'orders.card.details' | t }}</a>
            </div>
          </div>

          <div class="oc-body">
            <div class="oc-items">
              <div>
                <span class="badge badge-dot" [class.badge-success]="o.status === 'Completed'" [class.badge-warning]="o.status === 'Pending'" [class.badge-danger]="o.status === 'Cancelled'" [class.badge-neutral]="o.status !== 'Completed' && o.status !== 'Pending' && o.status !== 'Cancelled'">
                  {{ (o.status === 'Completed' ? 'orders.status.delivered' : o.status === 'Pending' ? 'orders.status.onHold' : 'orders.status.cancelled') | t }}
                </span>
              </div>
              <ul class="oc-lines">
                @for (item of o.items; track item.productName) {
                  <li>
                    <span class="oc-product truncate">{{ item.productName }}</span>
                    <span class="text-muted num">{{ 'orders.card.itemLine' | t: { qty: itemQtyLabel(item, false), price: ((item.unitPrice ?? item.price) | money: o.currency) } }}</span>
                  </li>
                }
              </ul>
              @if (o.carrier || o.trackingNumber) {
                <div class="oc-ship">
                  <span>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>
                    {{ 'orders.card.carrier' | t }}: <strong>{{ o.carrier || ('orders.card.unknown' | t) }}</strong>
                  </span>
                  <span>{{ 'orders.card.trackingNo' | t }}: <strong class="mono">{{ o.trackingNumber || '-' }}</strong></span>
                </div>
              }
            </div>

            <div class="oc-actions" (click)="$event.stopPropagation()">
              @if (o.status === 'Pending') {
                <button class="btn btn-primary btn-sm" (click)="updateOrderStatus(o.id, 'Completed')" [disabled]="updatingOrderId() === o.id">
                  @if (updatingOrderId() === o.id) { <span class="spinner-sm spinner-light"></span> } @else { {{ 'orders.action.markCompleted' | t }} }
                </button>
                <button class="btn btn-secondary btn-sm" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id">
                  {{ 'orders.action.cancel' | t }}
                </button>
              } @else if (o.status === 'Completed') {
                <button class="btn btn-secondary btn-sm" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id">
                  {{ 'orders.action.refund' | t }}
                </button>
              } @else {
                <button class="btn btn-outline-danger btn-sm" (click)="promptDeleteOrder(o)" [disabled]="updatingOrderId() === o.id">
                  {{ 'common.delete' | t }}
                </button>
              }
            </div>
          </div>
        </article>
      }
      @if (filteredOrders().length === 0) {
        <div class="card empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>
          </div>
          <p class="empty-state-title">{{ 'orders.empty' | t }}</p>
        </div>
      }
    </div>

    <!-- ─── Create Order Drawer ─── -->
    @if (showCreateOrderModal()) {
      <div class="drawer-overlay z-top" (click)="closeCreateOrder()">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'orders.create.title' | t }}</span>
            <button class="drawer-close" (click)="closeCreateOrder()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <form [formGroup]="orderForm" (ngSubmit)="saveOrder()" class="drawer-form">
            <div class="drawer-body">
              <div class="form-row form-row-2-1">
                <div class="form-field">
                  <select id="customerIdSelect" formControlName="customerId" class="form-input has-value" (change)="onCustomerChange()">
                    <option value="">{{ 'orders.create.newCustomerOption' | t }}</option>
                    @for (c of customers(); track c.id) {
                      <option [value]="c.id">{{ c.name }}{{ c.currency ? ' (' + c.currency + ')' : '' }}</option>
                    }
                  </select>
                  <label for="customerIdSelect" class="form-label">{{ 'orders.create.customer' | t }}</label>
                </div>
                <div class="form-field">
                  <select id="currencySelect" formControlName="currency" class="form-input has-value mono">
                    @for (cur of currencyOptions(); track cur) {
                      <option [value]="cur">{{ cur }}</option>
                    }
                  </select>
                  <label for="currencySelect" class="form-label">{{ 'finance.currency' | t }}</label>
                </div>
              </div>
              @if (!orderForm.get('customerId')?.value) {
                <div class="form-field">
                  <input id="customerNameInput" type="text" formControlName="customerName" class="form-input" [class.has-value]="hasValue('customerName')" [placeholder]="'orders.create.customerNamePlaceholder' | t"/>
                  <label for="customerNameInput" class="form-label">{{ 'orders.create.customerName' | t }}</label>
                  @if (isFieldInvalid('customerName')) { <div class="form-error">{{ 'orders.create.customerNameRequired' | t }}</div> }
                </div>
              }
              @if (warehouses().length > 1) {
                <div class="form-field">
                  <select id="orderWarehouse" formControlName="warehouseId" class="form-input form-select has-value" (change)="onOrderWarehouseChange()">
                    <option value="">{{ 'orders.create.warehouseAuto' | t }}</option>
                    @for (w of warehouses(); track w.id) {
                      <option [value]="w.id">{{ w.name }}</option>
                    }
                  </select>
                  <label for="orderWarehouse" class="form-label">{{ 'orders.create.warehouse' | t }}</label>
                </div>
              }
              <div class="field-hint">
                {{ (pricesIncludeTax() ? 'finance.pricesIncludeTax' : 'finance.pricesExcludeTax') | t }}
              </div>

              <!-- Shipping Info Rows -->
              <div class="form-row">
                <div class="form-field">
                  <input id="carrierInput" type="text" formControlName="carrier" class="form-input" [class.has-value]="hasValue('carrier')" [disabled]="isOrderSaving()" [placeholder]="'orders.create.carrierPlaceholder' | t"/>
                  <label for="carrierInput" class="form-label">{{ 'orders.create.carrierOptional' | t }}</label>
                </div>
                <div class="form-field">
                  <input id="trackingNumberInput" type="text" formControlName="trackingNumber" class="form-input" [class.has-value]="hasValue('trackingNumber')" [disabled]="isOrderSaving()" [placeholder]="'orders.create.trackingPlaceholder' | t"/>
                  <label for="trackingNumberInput" class="form-label">{{ 'orders.create.trackingOptional' | t }}</label>
                </div>
              </div>
              
              <div class="ol-section">
                <div class="ol-section-head">
                  <h3 class="ol-title">{{ 'orders.items' | t }}</h3>
                  <div class="cluster">
                    <button type="button" class="btn btn-sm btn-secondary" (click)="showScanner.set(true)" [disabled]="isOrderSaving() || scanning()">
                      @if (scanning()) { <span class="spinner-sm"></span> } @else { <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8"/></svg> } {{ 'orders.create.scan' | t }}
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" (click)="addOrderLine()" [disabled]="isOrderSaving()"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> {{ 'orders.create.addProduct' | t }}</button>
                  </div>
                </div>

                <div formArrayName="lines" class="ol-lines">
                  @for (line of linesArray.controls; track $index; let i = $index) {
                    <div [formGroupName]="i" [class.highlight-row]="highlightLineIndex() === i" class="ol-line">
                      <div class="ol-product">
                        <div class="custom-select-wrapper" (click)="toggleDropdown(i); $event.stopPropagation()">
                          <div class="custom-select-trigger" [class.open]="isDropdownOpen(i)" [class.disabled]="isOrderSaving()">
                            <span class="selected-text">
                              @if (line.get('productId')?.value) {
                                {{ getProductName(line.get('productId')?.value) }} <span class="selected-stock">({{ 'orders.create.stock' | t }}: {{ line.get('maxQuantity')?.value | num }})</span>
                              } @else {
                                {{ 'orders.create.selectProduct' | t }}
                              }
                            </span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                          </div>
                          @if (isDropdownOpen(i)) {
                            <div class="custom-select-dropdown ol-dropdown">
                              @for (p of state.products(); track p.id) {
                                @if (p.quantity > 0) {
                                  <div class="custom-option" (click)="selectProduct(i, p.id); $event.stopPropagation()">
                                    <div class="opt-left">
                                      <span class="opt-name">{{ p.name }}</span>
                                      <span class="opt-stock" [class.low]="p.quantity < 10">{{ 'orders.create.stock' | t }}: {{ p.quantity | num }}</span>
                                    </div>
                                    <span class="opt-price num">{{ p.price | money }}</span>
                                  </div>
                                }
                              }
                            </div>
                          }
                        </div>
                      </div>
                      <div class="ol-qty" [class.has-error]="line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)">
                        <input type="number" formControlName="quantity" class="form-input ol-input" [placeholder]="'orders.create.quantity' | t" min="1" [max]="line.get('maxQuantity')?.value" (input)="enforceMaxQuantity($event, i)" [disabled]="isOrderSaving()"/>
                        @if (line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)) {
                          <span class="form-error">{{ 'orders.create.max' | t }}: {{ maxForLine(line) | num }}</span>
                        }
                      </div>
                      @if (lineProduct(line); as lp) {
                        @if (lp.units?.length) {
                          <div class="ol-unit">
                            <select class="form-input ol-input" formControlName="unitId" (change)="onLineUnitChange(i)" [title]="'orders.create.unit' | t">
                              <option value="">{{ (lp.baseUnit || lp.unit || 'pcs') | unitLabel }}</option>
                              @for (u of lp.units; track u.unitId) {
                                <option [value]="u.unitId">{{ (u.unit || u.unitId) | unitLabel }} (×{{ u.factor | num }})</option>
                              }
                            </select>
                          </div>
                        }
                      }
                      <div class="ol-price">
                        <input type="number" formControlName="unitPrice" class="form-input ol-input num" min="0" step="0.01" [placeholder]="productPricePlaceholder(line)" [title]="'orders.create.unitPriceOverride' | t"/>
                      </div>
                      <div class="ol-total">
                        @if (linePreview(line); as lp) {
                          <div class="num strong">{{ lp.total | money: orderCurrency() }}</div>
                          <div class="ol-sub">{{ 'finance.tax' | t }} %{{ lp.rate | num }}: {{ lp.tax | money: orderCurrency() }}</div>
                        } @else if (line.get('productId')?.value) {
                          <div class="ol-sub">{{ 'orders.create.priceWillConvert' | t }}</div>
                        }
                      </div>
                      <button type="button" class="icon-btn delete-btn ol-remove" (click)="removeOrderLine(i)" [disabled]="linesArray.length <= 1 || isOrderSaving()" [attr.aria-label]="'common.delete' | t">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                      @if (lineProduct(line); as lp) {
                        <div class="ol-tracking">
                          @if (lineFactor(line) !== 1) {
                            <span>{{ 'orders.create.baseQtyHint' | t: { qty: (lineBaseQty(line) | num), unit: ((lp.baseUnit || lp.unit || 'pcs') | unitLabel) } }}</span>
                          }
                          @if (lp.trackingType === 'lot') {
                            <div class="cluster">
                              <span>{{ 'orders.tracking.lots' | t }}:</span>
                              @if (line.get('trackMode')?.value !== 'manual') {
                                <span>{{ 'orders.tracking.autoFefo' | t }}</span>
                                <button type="button" class="btn btn-sm btn-outline" (click)="enableManualTracking(i)">{{ 'orders.tracking.pickLots' | t }}</button>
                              } @else {
                                <button type="button" class="btn btn-sm btn-outline" (click)="disableManualTracking(i)">{{ 'orders.tracking.useAuto' | t }}</button>
                                <span [style.color]="lotsSum(line) === lineBaseQty(line) ? 'var(--color-success-text)' : 'var(--color-danger-text)'">{{ 'orders.tracking.selectedOf' | t: { selected: (lotsSum(line) | num), total: (lineBaseQty(line) | num) } }}</span>
                              }
                            </div>
                            @if (line.get('trackMode')?.value === 'manual') {
                              @if (lotsCache()[trackingKey(lp.id)]; as lots) {
                                @for (lot of lots; track lot.id) {
                                  <div class="ol-lot">
                                    <span class="mono">{{ lot.lotNumber }}{{ lot.warehouseName ? ' · ' + lot.warehouseName : '' }}</span>
                                    <span>{{ lot.expiryDate ? (lot.expiryDate | appDate) : '-' }}</span>
                                    <span class="num">{{ 'orders.tracking.available' | t }}: {{ lot.quantity | num }}</span>
                                    <input type="number" class="form-input ol-lot-input" min="0" [max]="lot.quantity"
                                      [value]="lotQty(line, lot.id)" (input)="setLotQty(i, lot, $event)"/>
                                  </div>
                                } @empty {
                                  <span>{{ 'orders.tracking.noLots' | t }}</span>
                                }
                              } @else {
                                <span class="spinner-sm"></span>
                              }
                            }
                          }
                          @if (lp.trackingType === 'serial') {
                            <div class="cluster">
                              <span>{{ 'orders.tracking.serials' | t }}:</span>
                              @if (line.get('trackMode')?.value !== 'manual') {
                                <span>{{ 'orders.tracking.autoSerial' | t }}</span>
                                <button type="button" class="btn btn-sm btn-outline" (click)="enableManualTracking(i)">{{ 'orders.tracking.pickSerials' | t }}</button>
                              } @else {
                                <button type="button" class="btn btn-sm btn-outline" (click)="disableManualTracking(i)">{{ 'orders.tracking.useAuto' | t }}</button>
                                <span [style.color]="lineSerials(line).length === lineBaseQty(line) ? 'var(--color-success-text)' : 'var(--color-danger-text)'">{{ 'orders.tracking.selectedOf' | t: { selected: lineSerials(line).length, total: (lineBaseQty(line) | num) } }}</span>
                              }
                            </div>
                            @if (line.get('trackMode')?.value === 'manual') {
                              @if (serialsCache()[trackingKey(lp.id)]; as serials) {
                                <div class="ol-serials">
                                  @for (sn of serials; track sn.id) {
                                    <label class="ol-serial">
                                      <input type="checkbox" [checked]="lineSerials(line).includes(sn.serial)" (change)="toggleSerial(i, sn.serial)"/>
                                      <span class="mono">{{ sn.serial }}</span>
                                      @if (sn.warehouseName) { <span>· {{ sn.warehouseName }}</span> }
                                    </label>
                                  } @empty {
                                    <span>{{ 'orders.tracking.noSerials' | t }}</span>
                                  }
                                </div>
                              } @else {
                                <span class="spinner-sm"></span>
                              }
                            }
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
                @if (linesArray.invalid && (linesArray.dirty || linesArray.touched)) {
                  <span class="form-error ol-error">{{ 'orders.create.linesInvalid' | t }}</span>
                }
                @if (trackingInvalid()) {
                  <span class="form-error ol-error">{{ 'orders.tracking.mismatch' | t }}</span>
                }
              </div>

              @if (previewTotals(); as tot) {
                <div class="totals-box">
                  <div class="tot-row">
                    <span>{{ 'finance.subtotal' | t }}</span>
                    <span class="num">{{ tot.subtotal | money: orderCurrency() }}</span>
                  </div>
                  @for (b of tot.breakdown; track b.rate) {
                    <div class="tot-row text-muted">
                      <span>{{ 'finance.taxLine' | t: { rate: (b.rate | num), base: (b.base | money: orderCurrency()) } }}</span>
                      <span class="num">{{ b.tax | money: orderCurrency() }}</span>
                    </div>
                  }
                  <div class="tot-row tot-grand">
                    <span>{{ 'finance.grandTotal' | t }}</span>
                    <strong class="num">{{ tot.grandTotal | money: orderCurrency() }}</strong>
                  </div>
                  @if (tot.incomplete) {
                    <div class="field-hint">{{ 'orders.create.totalsIncomplete' | t }}</div>
                  }
                </div>
              }
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeCreateOrder()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="orderForm.invalid || isOrderSaving() || trackingInvalid()">
                @if (isOrderSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'orders.create.creating' | t }} } @else { {{ 'orders.create.submit' | t }} }
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
              <div class="cluster">
                <span class="drawer-title">{{ 'orders.detail.title' | t }}</span>
                <span class="mono text-muted">{{ order.orderNumber }}</span>
              </div>
              <button class="drawer-close" (click)="closeOrderDetail()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
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
                  <div class="skeleton skeleton-title short"></div>
                  <div class="skeleton skeleton-row"></div>
                  <div class="skeleton skeleton-row"></div>
                </div>
              } @else {
                <div class="detail-metadata-grid">
                  <span class="detail-label-col">{{ 'orders.detail.customer' | t }}</span>
                  <span class="detail-value-col">
                    @if (order.customerId) {
                      <a [routerLink]="['/customers']" [queryParams]="{ q: order.customerName }" class="link">{{ order.customerName }}</a>
                    } @else {
                      {{ order.customerName }}
                    }
                  </span>

                  <span class="detail-label-col">{{ 'finance.currency' | t }}</span>
                  <span class="detail-value-col mono">{{ order.currency || i18n.currency() }}</span>
                  
                  <span class="detail-label-col">{{ 'orders.detail.date' | t }}</span>
                  <span class="detail-value-col num">{{ order.date | appDate: 'datetime' }}</span>
                  
                  <span class="detail-label-col">{{ 'orders.detail.status' | t }}</span>
                  <div class="detail-value-col">
                    <span class="badge badge-dot" [class.badge-success]="order.status === 'Completed'" [class.badge-warning]="order.status === 'Pending'" [class.badge-danger]="order.status === 'Cancelled'" [class.badge-neutral]="order.status !== 'Completed' && order.status !== 'Pending' && order.status !== 'Cancelled'">
                      {{ (order.status === 'Completed' ? 'orders.status.completed' : order.status === 'Pending' ? 'orders.status.pending' : 'orders.status.cancelled') | t }}
                    </span>
                  </div>

                  @if (order.carrier) {
                    <span class="detail-label-col">{{ 'orders.detail.carrier' | t }}</span>
                    <span class="detail-value-col">{{ order.carrier }}</span>
                  }
                  @if (order.trackingNumber) {
                    <span class="detail-label-col">{{ 'orders.detail.trackingNo' | t }}</span>
                    <span class="detail-value-col mono">{{ order.trackingNumber }}</span>
                  }
                </div>

                <div class="detail-items-section">
                  <h4 class="detail-section-title">{{ 'orders.items' | t }}</h4>
                  <div class="detail-item-list">
                    @for (item of order.items; track $index) {
                      <div class="detail-item-row">
                        <div class="detail-item-info">
                          <span class="detail-item-name">{{ item.productName }}</span>
                          <span class="detail-item-calc">
                            {{ itemQtyLabel(item, true) }} · {{ 'finance.unitPrice' | t }}: {{ (item.unitPrice ?? item.price) | money: order.currency }}
                            · {{ 'finance.taxRate' | t }}: %{{ (item.taxRate ?? 0) | num }}
                            · {{ 'finance.taxAmount' | t }}: {{ (item.taxAmount ?? 0) | money: order.currency }}
                          </span>
                          @for (tr of item.tracking || []; track $index) {
                            <span class="detail-item-calc">
                              @if (tr.lotNumber) {
                                {{ 'orders.tracking.lotLine' | t: { lot: tr.lotNumber, qty: (tr.quantity | num) } }}
                                @if (tr.expiryDate) { · {{ 'orders.tracking.expiry' | t }}: {{ tr.expiryDate | appDate }} }
                              }
                              @if (tr.serials?.length) {
                                {{ 'orders.tracking.serials' | t }}: <span class="mono">{{ tr.serials!.join(', ') }}</span>
                              }
                            </span>
                          }
                        </div>
                        <span class="detail-item-total num">{{ itemLineTotal(item) | money: order.currency }}</span>
                      </div>
                    }
                    <div class="totals-box flat">
                      <div class="tot-row">
                        <span>{{ 'finance.subtotal' | t }}</span>
                        <span class="num">{{ orderSubtotal(order) | money: order.currency }}</span>
                      </div>
                      @for (b of orderTaxBreakdown(order); track b.rate) {
                        <div class="tot-row text-muted">
                          <span>{{ 'finance.taxLine' | t: { rate: (b.rate | num), base: (b.base | money: order.currency) } }}</span>
                          <span class="num">{{ b.tax | money: order.currency }}</span>
                        </div>
                      }
                    </div>
                    <div class="tot-row tot-grand">
                      <span>{{ 'finance.grandTotal' | t }}</span>
                      <strong class="num">{{ (order.grandTotal ?? order.totalAmount) | money: order.currency }}</strong>
                      </div>
                    @if (order.currency && order.currency !== i18n.currency() && order.exchangeRate) {
                      <div class="tot-row text-muted tot-small">
                        <span>{{ 'finance.inBaseCurrency' | t: { currency: i18n.currency() } }}</span>
                        <span class="num">{{ ((order.grandTotal ?? order.totalAmount) * order.exchangeRate) | money: i18n.currency() }}</span>
                      </div>
                      <div class="field-hint tot-note">{{ 'finance.exchangeRateNote' | t: { from: order.currency, rate: (order.exchangeRate | num: 4), to: i18n.currency() } }}</div>
                    }
                  </div>
                </div>
              }
            </div>

            <div class="drawer-footer" [class.single-action]="order.status === 'Completed' || order.status === 'Cancelled'">
              @if (isOrderDetailLoading()) {
                <div class="skeleton skeleton-row block"></div>
              } @else {
                @if (order.status === 'Pending') {
                  <button class="btn btn-secondary" (click)="promptCancelOrder(order)" [disabled]="updatingOrderId() === order.id">{{ 'orders.action.cancel' | t }}</button>
                  <button class="btn btn-primary" (click)="updateOrderStatus(order.id, 'Completed')" [disabled]="updatingOrderId() === order.id">
                    @if (updatingOrderId() === order.id) { <span class="spinner-sm spinner-light"></span> } @else { {{ 'orders.action.complete' | t }} }
                  </button>
                }
                @if (order.status === 'Completed') {
                  <button class="btn btn-secondary block" (click)="promptCancelOrder(order)" [disabled]="updatingOrderId() === order.id">
                    @if (updatingOrderId() === order.id) { <span class="spinner-sm"></span> } @else { {{ 'orders.action.refund' | t }} }
                  </button>
                }
                @if (order.status === 'Cancelled') {
                  <button class="btn btn-danger block" (click)="promptDeleteOrder(order)" [disabled]="updatingOrderId() === order.id">{{ 'common.delete' | t }}</button>
                }
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- ─── Cancel Confirmation Modal ─── -->
    @if (showCancelModal()) {
      <div class="modal-backdrop z-top">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="closeCancelModal()" [disabled]="updatingOrderId() !== null" [attr.aria-label]="'common.cancel' | t"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 class="delete-modal-title">{{ (orderToCancel()?.status === 'Completed' ? 'orders.cancelModal.refundTitle' : 'orders.cancelModal.cancelTitle') | t }}</h3>
            <p class="delete-modal-desc">
              {{ 'orders.cancelModal.message' | t: { number: orderToCancel()?.orderNumber } }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="closeCancelModal()" [disabled]="updatingOrderId() !== null">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-danger" (click)="confirmCancelOrder()" [disabled]="updatingOrderId() !== null">
              @if (updatingOrderId() !== null) { <span class="spinner-sm spinner-light"></span> {{ 'orders.cancelModal.processing' | t }} } @else { {{ 'common.confirm' | t }} }
            </button>
          </div>
        </div>
      </div>
    }

    @if (showScanner()) {
      <app-barcode-scanner
        [products]="state.products()"
        (scanResult)="onBarcodeScanned($event)"
        (closeScanner)="showScanner.set(false)"
      />
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
  i18n = inject(I18nService);

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
    customerId: [''],
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    currency: [''],
    warehouseId: [''],
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
    this.inventoryService.getWarehouses().subscribe({ next: (w) => this.warehouses.set(w || []), error: () => {} });
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
    this.orderForm.reset({ customerId: '', customerName: '', currency: this.i18n.currency(), warehouseId: '', carrier: '', trackingNumber: '' });
    this.onCustomerChange();
    this.loadLookups();
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
      unitPrice: [null as number | null, [Validators.min(0)]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      maxQuantity: [0],
      unitId: [''],
      trackMode: ['auto'],
      lots: this.fb.control([] as { lotId: string; quantity: number }[]),
      serials: this.fb.control([] as string[])
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
      maxQuantity: product.quantity,
      unitId: '',
      trackMode: 'auto',
      lots: [],
      serials: []
    });
    this.applyMaxValidator(index);
  }

  // ─── Units ───
  lineProduct(line: any): Product | undefined {
    const id = line.get('productId')?.value;
    return id ? this.state.products().find(p => p.id === id) : undefined;
  }

  lineFactor(line: any): number {
    const unitId = line.get('unitId')?.value;
    if (!unitId) return 1;
    const pu = this.lineProduct(line)?.units?.find(u => u.unitId === unitId);
    return pu ? Number(pu.factor) || 1 : 1;
  }

  lineBaseQty(line: any): number {
    return (Number(line.get('quantity')?.value) || 0) * this.lineFactor(line);
  }

  maxForLine(line: any): number {
    return Math.floor((Number(line.get('maxQuantity')?.value) || 0) / this.lineFactor(line));
  }

  private applyMaxValidator(index: number) {
    const line = this.linesArray.at(index);
    const ctrl = line.get('quantity');
    ctrl?.setValidators([Validators.required, Validators.min(1), Validators.max(this.maxForLine(line))]);
    ctrl?.updateValueAndValidity();
  }

  onLineUnitChange(index: number) {
    const line = this.linesArray.at(index);
    const max = this.maxForLine(line);
    if ((Number(line.get('quantity')?.value) || 0) > max) line.patchValue({ quantity: Math.max(1, max) });
    this.applyMaxValidator(index);
  }

  /** "3 Box (= 36)" when entered in an alternate unit, else "5x" */
  itemQtyLabel(item: OrderItem, _withX = false): string {
    const nf = (n: number) => this.i18n.formatNumber(n);
    if (item.unitFactor != null && Number(item.unitFactor) !== 1 && item.unitQuantity != null) {
      const unit = item.unitCode ? this.unitLabelText(item.unitCode) : '';
      return `${nf(item.unitQuantity)} ${unit} (= ${nf(item.quantity)})`;
    }
    // Show the line's actual unit instead of a hard-coded "pcs/adet"
    const unit = this.unitLabelText(item.unitCode || 'pcs');
    return `${nf(item.quantity)} ${unit}`;
  }

  private unitLabelText(code: string): string {
    const key = `units.${code}`;
    const tr = this.i18n.t(key);
    return tr && tr !== key ? tr : code;
  }

  // ─── Lot / serial tracking ───
  lotsCache = signal<Record<string, StockLot[]>>({});
  serialsCache = signal<Record<string, SerialNumber[]>>({});

  /** Optional order warehouse: allocation and the lot/serial picker are restricted to it. */
  warehouses = signal<Warehouse[]>([]);

  /** Cache key per product + selected warehouse ('' = all warehouses). */
  trackingKey(productId: string): string {
    return `${productId}|${this.orderForm.get('warehouseId')?.value || ''}`;
  }

  onOrderWarehouseChange() {
    // Picked lots/serials may belong to another warehouse: fall back to automatic allocation
    this.linesArray.controls.forEach(line => {
      if (line.get('trackMode')?.value === 'manual') {
        line.patchValue({ lots: [], serials: [] });
        const product = this.lineProduct(line);
        if (product) this.ensureTrackingData(product);
      }
    });
  }

  private ensureTrackingData(product: Product) {
    const key = this.trackingKey(product.id);
    const warehouseId = this.orderForm.get('warehouseId')?.value || undefined;
    if (product.trackingType === 'lot' && !this.lotsCache()[key]) {
      this.inventoryService.getProductLots(product.id, warehouseId).subscribe({
        next: lots => this.lotsCache.update(c => ({ ...c, [key]: lots })),
        error: () => this.lotsCache.update(c => ({ ...c, [key]: [] }))
      });
    }
    if (product.trackingType === 'serial' && !this.serialsCache()[key]) {
      this.inventoryService.getProductSerials(product.id, 'in_stock', warehouseId).subscribe({
        next: sn => this.serialsCache.update(c => ({ ...c, [key]: sn })),
        error: () => this.serialsCache.update(c => ({ ...c, [key]: [] }))
      });
    }
  }

  enableManualTracking(index: number) {
    const line = this.linesArray.at(index);
    const product = this.lineProduct(line);
    if (!product) return;
    this.ensureTrackingData(product);
    line.patchValue({ trackMode: 'manual' });
  }

  disableManualTracking(index: number) {
    this.linesArray.at(index).patchValue({ trackMode: 'auto', lots: [], serials: [] });
  }

  lotQty(line: any, lotId: string): number {
    return (line.get('lots')?.value || []).find((l: any) => l.lotId === lotId)?.quantity || 0;
  }

  lotsSum(line: any): number {
    return (line.get('lots')?.value || []).reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0), 0);
  }

  setLotQty(index: number, lot: StockLot, event: Event) {
    const line = this.linesArray.at(index);
    let qty = Math.floor(Number((event.target as HTMLInputElement).value) || 0);
    qty = Math.max(0, Math.min(qty, lot.quantity));
    const lots = (line.get('lots')?.value || []).filter((l: any) => l.lotId !== lot.id);
    if (qty > 0) lots.push({ lotId: lot.id, quantity: qty });
    line.patchValue({ lots });
  }

  lineSerials(line: any): string[] {
    return line.get('serials')?.value || [];
  }

  toggleSerial(index: number, serial: string) {
    const line = this.linesArray.at(index);
    const cur = this.lineSerials(line);
    line.patchValue({ serials: cur.includes(serial) ? cur.filter(x => x !== serial) : [...cur, serial] });
  }

  trackingInvalid(): boolean {
    return this.linesArray.controls.some(line => {
      if (line.get('trackMode')?.value !== 'manual') return false;
      const p = this.lineProduct(line);
      if (p?.trackingType === 'lot') return this.lotsSum(line) !== this.lineBaseQty(line);
      if (p?.trackingType === 'serial') return this.lineSerials(line).length !== this.lineBaseQty(line);
      return false;
    });
  }

  // ─── Barcode scan ───
  showScanner = signal(false);
  scanning = signal(false);

  onBarcodeScanned(code: string) {
    this.showScanner.set(false);
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    this.scanning.set(true);
    this.inventoryService.lookupBarcode(trimmed).subscribe({
      next: res => { this.scanning.set(false); this.applyScan(res); },
      error: () => {
        this.scanning.set(false);
        this.ui.showToast(this.i18n.t('orders.scan.notFound', { code: trimmed }), 'error');
      }
    });
  }

  private applyScan(res: BarcodeLookupResult) {
    const product = this.state.products().find(p => p.id === res.product.id) || res.product;
    if ((product.quantity ?? 0) <= 0) {
      this.ui.showToast(this.i18n.t('orders.scan.outOfStock', { name: product.name }), 'error');
      return;
    }
    // Serials are always counted in the base unit
    const unitId = res.serial ? '' : (res.unitId || '');
    let index = this.linesArray.controls.findIndex(c => c.get('productId')?.value === product.id && (c.get('unitId')?.value || '') === unitId);
    if (index === -1) {
      index = this.linesArray.controls.findIndex(c => !c.get('productId')?.value);
      if (index === -1) { this.addOrderLine(); index = this.linesArray.length - 1; }
      const line = this.linesArray.at(index);
      line.patchValue({ productId: product.id, productName: product.name, price: product.price, quantity: 1, maxQuantity: product.quantity, unitId, trackMode: 'auto', lots: [], serials: [] });
      if (res.serial) {
        this.ensureTrackingData(product);
        line.patchValue({ trackMode: 'manual', serials: [res.serial] });
      }
      this.applyMaxValidator(index);
    } else {
      const line = this.linesArray.at(index);
      const curQty = Number(line.get('quantity')?.value) || 0;
      if (res.serial) {
        const manual = line.get('trackMode')?.value === 'manual';
        const cur = manual ? this.lineSerials(line) : [];
        if (cur.includes(res.serial)) {
          this.ui.showToast(this.i18n.t('orders.scan.serialAlready', { serial: res.serial }), 'info');
        } else {
          const serials = [...cur, res.serial];
          this.ensureTrackingData(product);
          // Switching from auto to manual: the scanned serials define the line quantity
          line.patchValue({ trackMode: 'manual', serials, quantity: manual ? Math.max(curQty, serials.length) : serials.length });
        }
      } else {
        line.patchValue({ quantity: Math.min(curQty + 1, this.maxForLine(line)) });
      }
      line.get('quantity')?.markAsDirty();
      line.get('quantity')?.updateValueAndValidity();
    }
    this.highlightLineIndex.set(index);
    setTimeout(() => this.highlightLineIndex.set(null), 600);
  }

  enforceMaxQuantity(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const lineGroup = this.linesArray.at(index);
    const max = this.maxForLine(lineGroup);
    
    if (input.value !== '' && parseInt(input.value) > max) {
      input.value = max.toString();
      lineGroup.patchValue({ quantity: max });
    }
  }

  // Customers / currency / tax preview
  customers = signal<Customer[]>([]);
  taxRates = signal<TaxRate[]>([]);
  pricesIncludeTax = computed(() => !!this.ui.userProfile()?.company?.pricesIncludeTax);
  private lookupsLoaded = false;

  currencyOptions = computed(() => {
    const set = new Set<string>(['TRY', 'USD', 'EUR', 'GBP']);
    const base = this.i18n.currency();
    if (base) set.add(base);
    this.customers().forEach(c => { if (c.currency) set.add(c.currency); });
    this.state.products().forEach(p => { if (p.currency) set.add(p.currency); });
    this.state.orders().forEach(o => { if (o.currency) set.add(o.currency); });
    return Array.from(set).sort();
  });

  loadLookups(force = false) {
    if (this.lookupsLoaded && !force) return;
    this.lookupsLoaded = true;
    this.inventoryService.getCustomers().subscribe({ next: c => this.customers.set(c), error: () => (this.lookupsLoaded = false) });
    this.inventoryService.getTaxRates().subscribe({ next: r => this.taxRates.set(r) });
  }

  onCustomerChange() {
    const id = this.orderForm.get('customerId')?.value;
    const nameCtrl = this.orderForm.get('customerName');
    const customer = this.customers().find(c => c.id === id);
    if (id) {
      nameCtrl?.clearValidators();
      nameCtrl?.setValue(customer?.name || '');
    } else {
      nameCtrl?.setValidators([Validators.required, Validators.minLength(2)]);
      nameCtrl?.setValue('');
    }
    nameCtrl?.updateValueAndValidity();
    this.orderForm.get('currency')?.setValue(customer?.currency || this.i18n.currency());
  }

  orderCurrency(): string {
    return this.orderForm.get('currency')?.value || this.i18n.currency();
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private parsePrice(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isFinite(n) && n >= 0 ? n : null;
  }

  private rateForProduct(productId: string): number {
    const product = this.state.products().find(p => p.id === productId);
    const rates = this.taxRates();
    const r = (product?.taxRateId && rates.find(t => t.id === product.taxRateId)) || rates.find(t => t.isDefault);
    return r ? Number(r.rate) : 0;
  }

  productPricePlaceholder(line: any): string {
    const product = this.state.products().find(p => p.id === line.get('productId')?.value);
    if (!product) return this.i18n.t('finance.unitPrice');
    const cur = product.currency || this.i18n.currency();
    return cur === this.orderCurrency() ? String(this.round2((Number(product.price) || 0) * this.lineFactor(line))) : this.i18n.t('finance.unitPrice');
  }

  linePreview(line: any): { rate: number; net: number; tax: number; total: number } | null {
    const productId = line.get('productId')?.value;
    if (!productId) return null;
    const qty = Number(line.get('quantity')?.value) || 0;
    let price = this.parsePrice(line.get('unitPrice')?.value);
    if (price === null) {
      const product = this.state.products().find(p => p.id === productId);
      if (!product || (product.currency || this.i18n.currency()) !== this.orderCurrency()) return null;
      price = (Number(product.price) || 0) * this.lineFactor(line);
    }
    const rate = this.rateForProduct(productId);
    let net: number, tax: number, total: number;
    if (this.pricesIncludeTax()) {
      total = this.round2(price * qty);
      net = this.round2(total / (1 + rate / 100));
      tax = this.round2(total - net);
    } else {
      net = this.round2(price * qty);
      tax = this.round2(net * rate / 100);
      total = this.round2(net + tax);
    }
    return { rate, net, tax, total };
  }

  previewTotals(): { subtotal: number; grandTotal: number; incomplete: boolean; breakdown: { rate: number; base: number; tax: number }[] } {
    let subtotal = 0, grandTotal = 0, incomplete = false;
    const groups = new Map<number, { rate: number; base: number; tax: number }>();
    this.linesArray.controls.forEach(line => {
      if (!line.get('productId')?.value) return;
      const lp = this.linePreview(line);
      if (!lp) { incomplete = true; return; }
      subtotal += lp.net;
      grandTotal += lp.total;
      const g = groups.get(lp.rate) || { rate: lp.rate, base: 0, tax: 0 };
      g.base += lp.net; g.tax += lp.tax;
      groups.set(lp.rate, g);
    });
    const breakdown = Array.from(groups.values())
      .map(g => ({ rate: g.rate, base: this.round2(g.base), tax: this.round2(g.tax) }))
      .sort((a, b) => b.rate - a.rate);
    return { subtotal: this.round2(subtotal), grandTotal: this.round2(grandTotal), incomplete, breakdown };
  }

  // Order detail helpers
  itemLineTotal(item: OrderItem): number {
    if (item.lineTotal != null) return item.lineTotal;
    return (item.unitPrice ?? item.price) * item.quantity + (item.taxAmount ?? 0);
  }

  private itemNet(item: OrderItem): number {
    if (item.lineTotal != null) return item.lineTotal - (item.taxAmount ?? 0);
    return (item.unitPrice ?? item.price) * item.quantity;
  }

  orderSubtotal(order: Order): number {
    if (order.subtotal != null) return order.subtotal;
    return this.round2(order.items.reduce((sum, i) => sum + this.itemNet(i), 0));
  }

  orderTaxBreakdown(order: Order): { rate: number; base: number; tax: number }[] {
    const groups = new Map<number, { rate: number; base: number; tax: number }>();
    order.items.forEach(i => {
      const rate = Number(i.taxRate ?? 0);
      const g = groups.get(rate) || { rate, base: 0, tax: 0 };
      g.base += this.itemNet(i);
      g.tax += Number(i.taxAmount ?? 0);
      groups.set(rate, g);
    });
    return Array.from(groups.values())
      .map(g => ({ rate: g.rate, base: this.round2(g.base), tax: this.round2(g.tax) }))
      .sort((a, b) => b.rate - a.rate);
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

    // Merge duplicate lines (same product + unit) by summing their quantities
    type Item = CreateOrderPayload['items'][number];
    const mergedMap = new Map<string, Item>();
    formValue.lines.forEach((l: any) => {
      const unitId: string = l.unitId || '';
      const key = `${l.productId}|${unitId}`;
      const override = this.parsePrice(l.unitPrice);
      const manual = l.trackMode === 'manual';
      const lots: { lotId: string; quantity: number }[] = manual ? (l.lots || []) : [];
      const serials: string[] = manual ? (l.serials || []) : [];
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity += Number(l.quantity);
        if (existing.unitPrice === undefined && override !== null) existing.unitPrice = override;
        if (lots.length) existing.lots = [...(existing.lots || []), ...lots];
        if (serials.length) existing.serials = [...(existing.serials || []), ...serials];
      } else {
        mergedMap.set(key, {
          productId: l.productId,
          productName: l.productName,
          quantity: Number(l.quantity),
          ...(unitId ? { unitId } : {}),
          ...(override !== null ? { unitPrice: override } : {}),
          ...(lots.length ? { lots } : {}),
          ...(serials.length ? { serials } : {}),
        });
      }
    });

    const items = Array.from(mergedMap.values());
    const customerId: string = formValue.customerId || '';

    const orderPayload: CreateOrderPayload = {
      ...(customerId ? { customerId } : { customerName: (formValue.customerName || '').trim() }),
      status: 'Pending',
      currency: formValue.currency || undefined,
      ...(formValue.warehouseId ? { warehouseId: formValue.warehouseId } : {}),
      carrier: formValue.carrier ? formValue.carrier.trim() : undefined,
      trackingNumber: formValue.trackingNumber ? formValue.trackingNumber.trim() : undefined,
      items,
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
        this.ui.showToast(this.i18n.t('orders.toast.created'), 'success');
      },
      error: (err) => {
        this.isOrderSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('orders.toast.createError'), 'error');
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
      title: this.i18n.t('orders.delete.title'),
      message: this.i18n.t('orders.delete.message', { number: order.orderNumber }),
      isDelete: true,
      onConfirm: () => {
        return this.inventoryService.deleteOrder(order.id).pipe(
          tap({
            next: () => {
              this.state.orders.update(ords => ords.filter(o => o.id !== order.id));
              this.closeOrderDetail();
              this.ui.showToast(this.i18n.t('orders.toast.deleted'), 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || this.i18n.t('orders.toast.deleteError'), 'error');
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
            this.ui.showToast(this.i18n.t('orders.toast.statusUpdated'), 'success');
          },
          error: () => {
            this.updatingOrderId.set(null);
            this.ui.showToast(this.i18n.t('orders.toast.stockReloadFailed'), 'info');
          }
        });
      },
      error: (err) => {
        this.updatingOrderId.set(null);
        this.ui.showToast(err.error?.message || this.i18n.t('orders.toast.updateError'), 'error');
      }
    });
  }
}
