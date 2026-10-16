import { Component, inject, signal, computed, HostListener, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray, FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService, Order, CreateOrderPayload } from '../../inventory.service';
import { Customer, TaxRate, OrderItem, Product, StockLot, SerialNumber, BarcodeLookupResult, Warehouse } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { tap, debounceTime, switchMap, of, catchError, Subscription } from 'rxjs';
import { TaxService } from '../../services/tax.service';
import { CHARGE_TYPES, ExemptionCode, SALES_CHANNELS, TaxQuote, TaxSummaryView, WithholdingCode, summaryFromDocument, summaryFromQuote } from '../../models/tax.models';
import { TaxSummaryComponent, TAX_WARNING_KEYS } from '../shared/tax-summary.component';
import { LineTaxFieldsComponent, chargeGroup, documentTaxGroup, documentTaxPayload, lineNeedsExemption, lineTaxControls, lineTaxPayload } from '../shared/tax-fields.component';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';
import { QuantityInputDirective, parseLocalizedQuantity, productDecimals } from '../shared/quantity-input.directive';
import { roundQty, sumQty } from '@stok/tr-compliance';
import { OrderDocumentsComponent } from '../documents/order-documents.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, FormsModule, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe, QuantityInputDirective, TaxSummaryComponent, LineTaxFieldsComponent, OrderDocumentsComponent, IconComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    .z-top { z-index: 3000; }
    .link { color: var(--accent-text); text-decoration: none; font-weight: 500; }
    .link:hover { text-decoration: underline; text-underline-offset: 3px; }

    /* toolbar */
    .o-toolbar { margin-bottom: 12px; }
    .o-search { flex: 1 1 260px; max-width: 360px; }
    .o-dates { display: flex; align-items: center; gap: 6px; }
    .o-date { width: 148px; }
    .o-dash { color: var(--fg-3); }

    /* list table */
    .o-no { display: inline-flex; align-items: center; gap: 2px; }
    .o-no .mono { font-size: var(--text-xs); color: var(--fg-2); }
    .o-items { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 240px; vertical-align: middle; }
    .tbl td.o-cust { max-width: 240px; }
    .o-ship { display: inline-flex; vertical-align: middle; margin-left: 6px; color: var(--fg-3); }
    .o-items .nm { overflow: hidden; text-overflow: ellipsis; }
    .o-sec { color: var(--fg-3); }
    .o-sec .mono { font-size: var(--text-xs); margin-left: 6px; }
    .o-act { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; }
    .tbl td.o-actcell { width: 76px; padding: 0 8px 0 0; text-align: right; overflow: visible; }
    .tbl td.o-date { width: 1%; }
    .tbl tbody tr { cursor: pointer; }
    .o-total { font-weight: 500; }
    .o-foot { justify-content: space-between; }

    /* mobile list */
    .o-mlist { display: none; }
    .o-mlist .mrow { cursor: pointer; }
    .o-mlist .mrow .thumb { font-size: 11px; }
    @media (max-width: 640px) {
      .o-toolbar .seg { width: 100%; }
      .o-toolbar .seg button { flex: 1 1 auto; padding: 0 6px; }
      .o-toolbar .seg .count { display: none; }
      .o-search .trail { display: none; }
      .o-search { max-width: none; flex-basis: 100%; }
      .o-dates { width: 100%; }
      .o-date { flex: 1; width: auto; min-width: 0; }
      .o-desk { display: none; }
      .o-mlist { display: block; }
    }

    /* create drawer */
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; gap: 0; }
    .drawer-body.secs { gap: 0; padding-top: 8px; }
    .grid-21 { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px 14px; }
    @media (max-width: 640px) { .grid-21 { grid-template-columns: minmax(0, 1fr); } }
    .ol-head-actions { margin-left: auto; display: flex; gap: 6px; }
    .ol-lines { display: flex; flex-direction: column; gap: 10px; }
    /* Line recipe shared with the purchase-order drawer (.po-line): numbered product row, labelled field grid, meta row */
    .ol-line { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 12px;
      background: var(--surface-2); border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); }
    .ol-line.highlight-row { box-shadow: inset 0 0 0 1px var(--accent), var(--focus-ring); }
    .ol-top { display: flex; align-items: center; gap: 8px; }
    .ol-n { width: 20px; flex: none; font-size: var(--text-xs); color: var(--fg-3); text-align: center; }
    .ol-product { flex: 1; min-width: 0; }
    .ol-product .custom-select-trigger { height: var(--h-sm); min-height: var(--h-sm); }
    .ol-remove { flex: none; }
    .ol-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px 14px; padding-left: 28px; }
    .ol-line app-line-tax-fields { display: block; padding-left: 28px; }
    .ol-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; padding: 8px 0 0 28px; box-shadow: inset 0 1px 0 var(--line); font-size: var(--text-xs); color: var(--fg-3); }
    .ol-meta b { font-weight: 500; color: var(--fg-2); }
    .ol-total { margin-left: auto; }
    .ol-total b { color: var(--fg); font-size: var(--text-sm); font-weight: 600; }
    .ol-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 100; max-height: 240px; overflow-y: auto; }
    .ol-dropdown .custom-option { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .opt-left { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .opt-name { font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt-stock { font-size: var(--text-xs); color: var(--fg-3); white-space: nowrap; }
    .opt-stock.low { color: var(--warning); }
    .opt-price { font-weight: 500; color: var(--fg); font-variant-numeric: tabular-nums; }
    .selected-stock { color: var(--fg-3); font-size: var(--text-xs); }
    .ol-tracking { padding-left: 28px; display: flex; flex-direction: column; gap: 8px; font-size: var(--text-xs); color: var(--fg-3); }
    .ol-lot { display: grid; grid-template-columns: 2fr 1.5fr 1fr 96px; gap: 8px; align-items: center; }
    .ol-serials { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow-y: auto; }
    .ol-serial { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: var(--radius-sm);
      background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); cursor: pointer; color: var(--fg-2); }
    .is-ok { color: var(--success); font-weight: 500; }
    .is-bad { color: var(--danger); font-weight: 500; }
    .ol-price input::-webkit-inner-spin-button, .ol-price input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    @media (max-width: 640px) {
      .ol-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-left: 0; }
      .ol-line app-line-tax-fields, .ol-meta, .ol-tracking { padding-left: 0; }
      .ol-lot { grid-template-columns: 1fr 1fr; }
    }
    .tax-section { display: flex; flex-direction: column; gap: 12px; }
    .ph-sans::placeholder { font-family: var(--font-sans); }
    .ol-product .ph { color: var(--fg-placeholder); }
    .ol-product .ol-chev { flex: none; color: var(--fg-3); }
    .ol-product .custom-select-trigger:hover .ol-chev { color: var(--fg-2); }
    .ch-list { display: flex; flex-direction: column; gap: 8px; }
    .ch-list:not(:empty) { margin-bottom: 8px; }
    .ch-row { display: grid; grid-template-columns: 150px 140px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    @media (max-width: 640px) {
      .ch-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
      .ch-desc { grid-column: 1 / -1; grid-row: 2; }
    }
    .totals-box { margin-left: auto; width: min(320px, 100%); display: flex; flex-direction: column; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
    .tot-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; box-shadow: inset 0 -1px 0 var(--line); }
    .tot-row > span:first-child { color: var(--fg-2); }
    .tot-grand { box-shadow: none; padding-top: 8px; font-weight: 600; }
    .tot-grand > span:first-child { color: var(--fg); }
    .tot-grand strong { font-size: var(--text-lg); font-weight: 600; }

    /* detail drawer */
    .od-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 14px 16px;
      background: var(--surface-2); border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); }
    .od-hero .lbl { font-size: var(--text-xs); color: var(--fg-3); font-weight: 500; }
    .od-hero .amt { font-size: var(--text-2xl); font-weight: 600; letter-spacing: var(--tracking-tighter); line-height: 1.15; font-variant-numeric: tabular-nums; }
    .od-grid { margin-bottom: 0; row-gap: 12px; }
    .od-grid .doc-field { margin-bottom: 0; }
    .detail-item-row { gap: 12px; align-items: flex-start; }
    .detail-item-info { min-width: 0; }
    .detail-item-total { white-space: nowrap; }
    .tp-edit { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-top: 12px; }
    .tp-edit .fld { flex: 0 1 200px; }
    .od-skel { display: flex; flex-direction: column; gap: 10px; }
    .od-skel .skeleton-row { height: 14px; }
    .skeleton-title.short { width: 40%; }
    .od-foot-skel { flex: 1; height: 32px; }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'orders.title' | t }}</h1>
        <p>{{ 'orders.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openCreateOrder()">
          <app-icon name="plus" />{{ 'orders.newOrder' | t }}
        </button>
      </div>
    </header>

    <div class="toolbar o-toolbar">
      <div class="seg" role="group" [attr.aria-label]="'orders.col.status' | t">
        <button type="button" [attr.aria-pressed]="orderFilterStatus() === 'all'" (click)="orderFilterStatus.set('all')">{{ 'orders.filter.all' | t }} <span class="count">{{ statusCounts().all }}</span></button>
        <button type="button" [attr.aria-pressed]="orderFilterStatus() === 'Pending'" (click)="orderFilterStatus.set('Pending')">{{ 'orders.filter.pending' | t }} <span class="count">{{ statusCounts().Pending }}</span></button>
        <button type="button" [attr.aria-pressed]="orderFilterStatus() === 'Completed'" (click)="orderFilterStatus.set('Completed')">{{ 'orders.filter.completed' | t }} <span class="count">{{ statusCounts().Completed }}</span></button>
        <button type="button" [attr.aria-pressed]="orderFilterStatus() === 'Cancelled'" (click)="orderFilterStatus.set('Cancelled')">{{ 'orders.filter.cancelled' | t }} <span class="count">{{ statusCounts().Cancelled }}</span></button>
      </div>
      <div class="field o-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [placeholder]="'orders.searchPlaceholder' | t" [attr.aria-label]="'orders.searchPlaceholder' | t" [value]="orderSearch()" (input)="onSearchInput($event)"/>
        <span class="trail"><kbd>/</kbd></span>
      </div>
      <span class="spacer"></span>
      <div class="o-dates" role="group" [attr.aria-label]="'orders.dateRange' | t">
        <div class="field o-date">
          <input type="date" [attr.aria-label]="'orders.startDate' | t" [title]="'orders.startDate' | t" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" />
        </div>
        <span class="o-dash" aria-hidden="true">–</span>
        <div class="field o-date">
          <input type="date" [attr.aria-label]="'orders.endDate' | t" [title]="'orders.endDate' | t" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" />
        </div>
        @if (startDate() || endDate()) {
          <button type="button" class="btn btn-ghost btn-icon" (click)="startDate.set(''); endDate.set('')" [attr.data-tip]="'orders.clearFilter' | t" [attr.aria-label]="'orders.clearFilter' | t">
            <app-icon name="x" />
          </button>
        }
      </div>
    </div>

    <div class="card">
      @if (filteredOrders().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="bag" /></div>
          @if (state.orders().length === 0) {
            <h3>{{ 'orders.emptyAll' | t }}</h3>
            <p>{{ 'orders.emptyHint' | t }}</p>
            <div class="actions cluster">
              <button type="button" class="btn btn-primary" (click)="openCreateOrder()"><app-icon name="plus" />{{ 'orders.newOrder' | t }}</button>
            </div>
          } @else {
            <h3>{{ 'orders.empty' | t }}</h3>
            <div class="actions cluster">
              <button type="button" class="btn" (click)="orderSearch.set(''); orderFilterStatus.set('all'); startDate.set(''); endDate.set('')"><app-icon name="x" />{{ 'orders.clearFilter' | t }}</button>
            </div>
          }
        </div>
      } @else {
        <div class="table-scroll o-desk">
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ 'orders.col.orderNo' | t }}</th>
                <th>{{ 'orders.col.date' | t }}</th>
                <th>{{ 'orders.col.customer' | t }}</th>
                <th>{{ 'orders.col.items' | t }}</th>
                <th>{{ 'orders.col.status' | t }}</th>
                <th class="r">{{ 'orders.col.total' | t }}</th>
                <th class="r"><span class="sr">{{ 'common.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (o of filteredOrders(); track o.id) {
                <tr [attr.data-od]="o.id" (click)="openOrderDetail(o)" [class.is-selected]="isOrderDetailOpen() && selectedOrder()?.id === o.id">
                  <td>
                    <span class="o-no">
                      <span class="mono">{{ o.orderNumber }}</span>
                      <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" (click)="copyToClipboard(o.orderNumber, o.id); $event.stopPropagation()"
                        [attr.data-tip]="(copiedOrderId() === o.id ? 'orders.card.copied' : 'orders.card.copyOrderNo') | t" [attr.aria-label]="'orders.card.copyOrderNo' | t">
                        <app-icon [name]="copiedOrderId() === o.id ? 'check' : 'copy'" size="xs" />
                      </button>
                    </span>
                  </td>
                  <td class="o-sec o-date">{{ o.date | appDate: 'datetime' }}</td>
                  <td class="o-cust"><strong>{{ o.customerName }}</strong></td>
                  <td>
                    @if (o.items.length) {
                      <span class="o-items" [title]="itemsTitle(o)">
                        <span class="nm">{{ o.items[0].productName }}</span>
                        <span class="o-sec">{{ itemQtyLabel(o.items[0], false) }}</span>
                        @if (o.items.length > 1) { <span class="tag">+{{ o.items.length - 1 }}</span> }
                      </span>
                      @if (o.carrier || o.trackingNumber) {
                        <span class="o-ship" [attr.data-tip]="(o.carrier || ('orders.card.unknown' | t)) + (o.trackingNumber ? ' · ' + o.trackingNumber : '')" [attr.aria-label]="'orders.card.carrier' | t"><app-icon name="truck" size="sm" /></span>
                      }
                    } @else { <span class="o-sec">—</span> }
                  </td>
                  <td>
                    <span class="badge" [class.badge-success]="o.status === 'Completed'" [class.badge-warning]="o.status === 'Pending'" [class.badge-danger]="o.status === 'Cancelled'" [class.badge-neutral]="o.status !== 'Completed' && o.status !== 'Pending' && o.status !== 'Cancelled'">
                      <span class="dot"></span>{{ (o.status === 'Completed' ? 'orders.status.delivered' : o.status === 'Pending' ? 'orders.status.onHold' : 'orders.status.cancelled') | t }}
                    </span>
                  </td>
                  <td class="r o-total">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</td>
                  <td class="o-actcell" (click)="$event.stopPropagation()">
                    <span class="o-act">
                      @if (o.status === 'Pending') {
                        @if (o.stockMode === 'despatch') {
                          <button type="button" class="btn btn-sm btn-icon" (click)="openOrderDetail(o)" [attr.data-tip]="'orderDocs.despatch' | t" [attr.aria-label]="'orderDocs.despatch' | t"><app-icon name="truck" /></button>
                        } @else {
                          <button type="button" class="btn btn-sm btn-icon" [class.is-loading]="updatingOrderId() === o.id" (click)="updateOrderStatus(o.id, 'Completed')" [disabled]="updatingOrderId() === o.id" [attr.data-tip]="'orders.action.markCompleted' | t" [attr.aria-label]="'orders.action.markCompleted' | t">
                            <app-icon name="check" />
                          </button>
                        }
                        <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id" [attr.data-tip]="'orders.action.cancel' | t" [attr.aria-label]="'orders.action.cancel' | t">
                          <app-icon name="x" />
                        </button>
                      } @else if (o.status === 'Completed') {
                        @if (o.stockMode === 'despatch') {
                          <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="openOrderDetail(o)" [attr.data-tip]="'orderDocs.documents' | t" [attr.aria-label]="'orderDocs.documents' | t"><app-icon name="file" /></button>
                        } @else {
                          <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="promptCancelOrder(o)" [disabled]="updatingOrderId() === o.id" [attr.data-tip]="'orders.action.refund' | t" [attr.aria-label]="'orders.action.refund' | t"><app-icon name="return" /></button>
                        }
                      } @else {
                        <button type="button" class="btn btn-ghost btn-sm btn-icon delete-btn" (click)="promptDeleteOrder(o)" [disabled]="updatingOrderId() === o.id" [attr.data-tip]="'common.delete' | t" [attr.aria-label]="'common.delete' | t">
                          <app-icon name="trash" />
                        </button>
                      }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="o-mlist">
          @for (o of filteredOrders(); track o.id) {
            <div class="mrow" role="button" tabindex="0" [attr.data-od]="o.id" (click)="openOrderDetail(o)" (keydown.enter)="openOrderDetail(o)">
              <span class="thumb">{{ initials(o.customerName) }}</span>
              <b>{{ o.customerName }}</b>
              <span class="v">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</span>
              <span class="s">{{ o.date | appDate }} · <span class="mono">{{ o.orderNumber }}</span></span>
              <span class="s r">
                <span class="badge" [class.badge-success]="o.status === 'Completed'" [class.badge-warning]="o.status === 'Pending'" [class.badge-danger]="o.status === 'Cancelled'" [class.badge-neutral]="o.status !== 'Completed' && o.status !== 'Pending' && o.status !== 'Cancelled'">
                  <span class="dot"></span>{{ (o.status === 'Completed' ? 'orders.status.delivered' : o.status === 'Pending' ? 'orders.status.onHold' : 'orders.status.cancelled') | t }}
                </span>
              </span>
            </div>
          }
        </div>

        <div class="tbl-foot o-foot">
          <span>{{ 'orders.resultCount' | t: { shown: (filteredOrders().length | num), total: (state.orders().length | num) } }}</span>
        </div>
      }
    </div>

    <!-- ─── Create Order Drawer ─── -->
    @if (showCreateOrderModal()) {
      <div class="drawer-overlay z-top" (click)="closeCreateOrder()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" aria-labelledby="orderCreateTitle" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2 class="drawer-title" id="orderCreateTitle">{{ 'orders.create.title' | t }}</h2>
            <button type="button" class="drawer-close" (click)="closeCreateOrder()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <form [formGroup]="orderForm" (ngSubmit)="saveOrder()" class="drawer-form">
            <div class="drawer-body secs">
              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'orders.section.customer' | t }}</h3><p>{{ (pricesIncludeTax() ? 'finance.pricesIncludeTax' : 'finance.pricesExcludeTax') | t }}</p></div>
                <div class="grid-21">
                  <div class="fld">
                    <label class="fld-label" for="customerIdSelect">{{ 'orders.create.customer' | t }}</label>
                    <div class="field select">
                      <select id="customerIdSelect" formControlName="customerId" (change)="onCustomerChange()">
                        <option value="">{{ 'orders.create.newCustomerPlaceholder' | t }}</option>
                        @for (c of customers(); track c.id) {
                          <option [value]="c.id">{{ c.name }}{{ c.currency ? ' (' + c.currency + ')' : '' }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="currencySelect">{{ 'finance.currency' | t }}</label>
                    <div class="field select">
                      <select id="currencySelect" formControlName="currency" class="mono">
                        @for (cur of currencyOptions(); track cur) {
                          <option [value]="cur">{{ cur }}</option>
                        }
                      </select>
                    </div>
                  </div>
                </div>
                @if (!orderForm.get('customerId')?.value) {
                  <div class="fld">
                    <label class="fld-label" for="customerNameInput">{{ 'orders.create.customerName' | t }} <span class="req">*</span></label>
                    <div class="field">
                      <input id="customerNameInput" type="text" formControlName="customerName" [attr.aria-invalid]="isFieldInvalid('customerName')" aria-describedby="customerNameErr" [placeholder]="'orders.create.customerNamePlaceholder' | t"/>
                    </div>
                    @if (isFieldInvalid('customerName')) { <div class="fld-error" id="customerNameErr"><app-icon name="alert" size="sm" />{{ 'orders.create.customerNameRequired' | t }}</div> }
                  </div>
                }
                @if (warehouses().length > 1) {
                  <div class="fld">
                    <label class="fld-label" for="orderWarehouse">{{ 'orders.create.warehouse' | t }}</label>
                    <div class="field select">
                      <select id="orderWarehouse" formControlName="warehouseId" (change)="onOrderWarehouseChange()">
                        <option value="">{{ 'orders.create.warehouseAuto' | t }}</option>
                        @for (w of warehouses(); track w.id) {
                          <option [value]="w.id">{{ w.name }}</option>
                        }
                      </select>
                    </div>
                  </div>
                }
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'orders.section.shipping' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="carrierInput">{{ 'orders.create.carrierOptional' | t }}</label>
                    <div class="field">
                      <span class="lead"><app-icon name="truck" size="sm" /></span>
                      <input id="carrierInput" type="text" formControlName="carrier" [disabled]="isOrderSaving()" [placeholder]="'orders.create.carrierPlaceholder' | t"/>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="trackingNumberInput">{{ 'orders.create.trackingOptional' | t }}</label>
                    <div class="field">
                      <input id="trackingNumberInput" type="text" class="mono ph-sans" formControlName="trackingNumber" [disabled]="isOrderSaving()" [placeholder]="'orders.create.trackingPlaceholder' | t"/>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="salesChannel">{{ 'orders.salesChannel' | t }}</label>
                    <div class="field select">
                      <select id="salesChannel" formControlName="salesChannel">
                        <option value="">{{ 'orders.channel.none' | t }}</option>
                        @for (c of salesChannels; track c) { <option [value]="c">{{ 'orders.channel.' + c | t }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="channelOrderRef">{{ 'orders.channelOrderRef' | t }}</label>
                    <div class="field">
                      <input id="channelOrderRef" type="text" class="mono" formControlName="channelOrderRef" maxlength="100" />
                    </div>
                  </div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h">
                  <span class="n">3</span><h3>{{ 'orders.items' | t }}</h3>
                  <p>{{ 'orders.create.lineCount' | t: { n: linesArray.length } }}</p>
                  <div class="ol-head-actions">
                    <button type="button" class="btn btn-sm" [class.is-loading]="scanning()" (click)="showScanner.set(true)" [disabled]="isOrderSaving() || scanning()">
                      <app-icon name="scan" />{{ 'orders.create.scan' | t }}
                    </button>
                    <button type="button" class="btn btn-sm btn-subtle" (click)="addOrderLine()" [disabled]="isOrderSaving()"><app-icon name="plus" />{{ 'orders.create.addProduct' | t }}</button>
                  </div>
                </div>

                <div formArrayName="lines" class="ol-lines">
                  @for (line of linesArray.controls; track $index; let i = $index) {
                    <div [formGroupName]="i" [class.highlight-row]="highlightLineIndex() === i" class="ol-line">
                      <div class="ol-top">
                        <span class="ol-n mono">{{ i + 1 }}</span>
                        <div class="ol-product">
                          <div class="custom-select-wrapper" (click)="toggleDropdown(i); $event.stopPropagation()">
                            <div class="custom-select-trigger" [class.open]="isDropdownOpen(i)" [class.disabled]="isOrderSaving()">
                              <span class="selected-text">
                                @if (line.get('productId')?.value) {
                                  {{ getProductName(line.get('productId')?.value) }} <span class="selected-stock">· {{ 'orders.create.stock' | t }} {{ line.get('maxQuantity')?.value | num }}</span>
                                } @else {
                                  <span class="ph">{{ 'orders.create.selectProductPh' | t }}</span>
                                }
                              </span>
                              <app-icon class="ol-chev" name="chevud" size="sm" />
                            </div>
                            @if (isDropdownOpen(i)) {
                              <div class="custom-select-dropdown ol-dropdown">
                                @for (p of state.products(); track p.id) {
                                  @if (p.quantity > 0) {
                                    <div class="custom-option" (click)="selectProduct(i, p.id); $event.stopPropagation()">
                                      <div class="opt-left">
                                        <span class="opt-name">{{ p.name }}</span>
                                        <span class="opt-stock" [class.low]="p.quantity < 10">{{ 'orders.create.stock' | t }} {{ p.quantity | num }}</span>
                                      </div>
                                      <span class="opt-price">{{ p.price | money }}</span>
                                    </div>
                                  }
                                }
                              </div>
                            }
                          </div>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm btn-icon ol-remove" (click)="removeOrderLine(i)" [disabled]="linesArray.length <= 1 || isOrderSaving()" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t">
                          <app-icon name="trash" />
                        </button>
                      </div>
                      <div class="ol-grid">
                        <div class="fld">
                          <label class="fld-label" [for]="'olQty' + i">{{ 'orders.create.quantity' | t }}</label>
                          <div class="field field-sm">
                            <input [id]="'olQty' + i" type="text" appQty [qtyDecimals]="lineDecimals(line)" formControlName="quantity" class="num" [attr.aria-invalid]="line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)" />
                          </div>
                          @if (line.get('quantity')?.hasError('max') && (line.get('quantity')?.dirty || line.get('quantity')?.touched)) {
                            <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'orders.create.max' | t }}: {{ maxForLine(line) | num }}</span>
                          }
                          @if (line.get('quantity')?.hasError('qtyPrecision')) {
                            <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'orders.create.precision' | t: { decimals: lineDecimals(line) } }}</span>
                          }
                        </div>
                        @if (lineProduct(line); as lp) {
                          @if (lp.units?.length) {
                            <div class="fld">
                              <label class="fld-label" [for]="'olUnit' + i">{{ 'orders.create.unit' | t }}</label>
                              <div class="field field-sm select">
                                <select [id]="'olUnit' + i" formControlName="unitId" (change)="onLineUnitChange(i)">
                                  <option value="">{{ (lp.baseUnit || lp.unit || 'pcs') | unitLabel }}</option>
                                  @for (u of lp.units; track u.unitId) {
                                    <option [value]="u.unitId">{{ (u.unit || u.unitId) | unitLabel }} (×{{ u.factor | num }})</option>
                                  }
                                </select>
                              </div>
                            </div>
                          }
                        }
                        <div class="fld ol-price">
                          <label class="fld-label" [for]="'olPrice' + i">{{ 'finance.unitPrice' | t }}</label>
                          <div class="field field-sm">
                            <input [id]="'olPrice' + i" type="number" formControlName="unitPrice" class="num" min="0" step="0.01" [placeholder]="productPricePlaceholder(line)" [title]="'orders.create.unitPriceOverride' | t" />
                            <span class="affix suf">{{ orderCurrency() }}</span>
                          </div>
                        </div>
                      </div>
                      @if (line.get('productId')?.value) {
                        <app-line-tax-fields [group]="$any(line)" [product]="lineProduct(line) || undefined" [rates]="taxRates()" [exemptions]="exemptions()" [withholdings]="withholdings()"></app-line-tax-fields>
                        <div class="ol-meta">
                          @if (quoteLine(i); as ql) {
                            <span>{{ 'finance.taxRate' | t }} <b>{{ ql.taxRate | num }}%</b></span>
                            <span>{{ 'finance.taxAmount' | t }} <b>{{ ql.taxAmount | money: orderCurrency() }}</b></span>
                            @if (ql.discountAmount > 0) { <span>{{ 'orders.discount' | t }} <b>−{{ ql.discountAmount | money: orderCurrency() }}</b></span> }
                            @if (ql.withheldTaxAmount > 0) { <span>{{ 'orders.withheldVat' | t }} <b>{{ ql.withheldTaxAmount | money: orderCurrency() }}</b></span> }
                            <span class="ol-total">{{ 'finance.lineTotal' | t }} <b>{{ ql.lineTotal | money: orderCurrency() }}</b></span>
                          } @else if (linePreview(line); as lpv) {
                            <span>{{ 'finance.taxRate' | t }} <b>{{ lpv.rate | num }}%</b></span>
                            <span>{{ 'finance.taxAmount' | t }} <b>{{ lpv.tax | money: orderCurrency() }}</b></span>
                            <span class="ol-total">{{ 'finance.lineTotal' | t }} <b>{{ lpv.total | money: orderCurrency() }}</b></span>
                          } @else {
                            <span>{{ 'orders.create.priceWillConvert' | t }}</span>
                          }
                        </div>
                      }
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
                                <button type="button" class="btn btn-xs" (click)="enableManualTracking(i)">{{ 'orders.tracking.pickLots' | t }}</button>
                              } @else {
                                <button type="button" class="btn btn-xs" (click)="disableManualTracking(i)">{{ 'orders.tracking.useAuto' | t }}</button>
                                <span [class.is-ok]="lotsSum(line) === lineBaseQty(line)" [class.is-bad]="lotsSum(line) !== lineBaseQty(line)">{{ 'orders.tracking.selectedOf' | t: { selected: (lotsSum(line) | num), total: (lineBaseQty(line) | num) } }}</span>
                              }
                            </div>
                            @if (line.get('trackMode')?.value === 'manual') {
                              @if (lotsCache()[trackingKey(lp.id)]; as lots) {
                                @for (lot of lots; track lot.id) {
                                  <div class="ol-lot">
                                    <span class="mono">{{ lot.lotNumber }}{{ lot.warehouseName ? ' · ' + lot.warehouseName : '' }}</span>
                                    <span>{{ lot.expiryDate ? (lot.expiryDate | appDate) : '-' }}</span>
                                    <span class="num">{{ 'orders.tracking.available' | t }}: {{ lot.quantity | num }}</span>
                                    <div class="field field-sm">
                                      <input type="text" inputmode="decimal" class="num" [attr.aria-label]="lot.lotNumber"
                                        [value]="lotQty(line, lot.id)" (change)="setLotQty(i, lot, $event)"/>
                                    </div>
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
                                <button type="button" class="btn btn-xs" (click)="enableManualTracking(i)">{{ 'orders.tracking.pickSerials' | t }}</button>
                              } @else {
                                <button type="button" class="btn btn-xs" (click)="disableManualTracking(i)">{{ 'orders.tracking.useAuto' | t }}</button>
                                <span [class.is-ok]="lineSerials(line).length === lineBaseQty(line)" [class.is-bad]="lineSerials(line).length !== lineBaseQty(line)">{{ 'orders.tracking.selectedOf' | t: { selected: lineSerials(line).length, total: (lineBaseQty(line) | num) } }}</span>
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
                  <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'orders.create.linesInvalid' | t }}</div>
                }
                @if (trackingInvalid()) {
                  <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'orders.tracking.mismatch' | t }}</div>
                }
              </section>

              <section class="fsec">
                <div class="fsec-h">
                  <span class="n">4</span><h3>{{ 'finance.charges' | t }}</h3><p>{{ 'orders.create.chargesOptional' | t }}</p>
                  <div class="ol-head-actions">
                    <button type="button" class="btn btn-sm btn-subtle" (click)="addCharge()" [disabled]="isOrderSaving()"><app-icon name="plus" />{{ 'finance.addCharge' | t }}</button>
                  </div>
                </div>
                <div [formGroup]="taxGroup">
                  <div formArrayName="charges" class="ch-list">
                    @for (c of chargesArray.controls; track $index; let i = $index) {
                      <div class="ch-row" [formGroupName]="i">
                        <div class="field select ch-type">
                          <select formControlName="type" [attr.aria-label]="'finance.chargeType' | t">
                            @for (ct of chargeTypes; track ct) { <option [value]="ct">{{ 'orders.charges.' + ct | t }}</option> }
                          </select>
                        </div>
                        <div class="field ch-amt">
                          <input type="number" min="0" step="0.01" class="num" formControlName="amount" [placeholder]="'finance.amount' | t" [attr.aria-label]="'finance.amount' | t" />
                          <span class="affix suf">{{ orderCurrency() }}</span>
                        </div>
                        <div class="field ch-desc">
                          <input type="text" formControlName="description" maxlength="255" [placeholder]="'finance.chargeDescription' | t" [attr.aria-label]="'finance.chargeDescription' | t" />
                        </div>
                        <button type="button" class="btn btn-ghost btn-icon ch-remove" (click)="chargesArray.removeAt(i)" [disabled]="isOrderSaving()" [attr.aria-label]="'common.delete' | t"><app-icon name="trash" /></button>
                      </div>
                    }
                  </div>
                  <div class="fld-help">{{ 'finance.chargesHint' | t }}</div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">5</span><h3>{{ 'orders.section.totals' | t }}</h3></div>
                <div class="tax-section">
                  <div class="grid-2" [formGroup]="taxGroup">
                    <div class="fld">
                      <label class="fld-label" for="orderDocDiscount">{{ 'finance.documentDiscount' | t }}</label>
                      <div class="field">
                        <input id="orderDocDiscount" type="number" min="0" step="0.01" class="num" formControlName="documentDiscountAmount" placeholder="0" />
                        <span class="affix suf">{{ orderCurrency() }}</span>
                      </div>
                    </div>
                    <div class="fld">
                      <label class="fld-label" for="orderTaxPoint">{{ 'finance.taxPointDate' | t }}</label>
                      <div class="field">
                        <span class="lead"><app-icon name="calendar" size="sm" /></span>
                        <input id="orderTaxPoint" type="date" formControlName="taxPointDate" />
                      </div>
                    </div>
                  </div>
                  @if (quote(); as q) {
                    <app-tax-summary [view]="quoteView()" [error]="quoteError()" [baseCurrency]="i18n.currency()"></app-tax-summary>
                  } @else {
                    @if (quoteError()) { <app-tax-summary [view]="null" [error]="quoteError()"></app-tax-summary> }
                    @if (previewTotals(); as tot) {
                      <div class="totals-box">
                        <div class="tot-row"><span>{{ 'finance.subtotal' | t }}</span><span>{{ tot.subtotal | money: orderCurrency() }}</span></div>
                        <div class="tot-row tot-grand"><span>{{ 'finance.grandTotal' | t }}</span><strong>{{ tot.grandTotal | money: orderCurrency() }}</strong></div>
                        @if (quoting()) { <div class="fld-help">{{ 'finance.quoting' | t }}</div> }
                      </div>
                    }
                  }
                </div>
              </section>
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-ghost" (click)="closeCreateOrder()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isOrderSaving()" [disabled]="orderForm.invalid || isOrderSaving() || trackingInvalid() || exemptionMissing()">
                <span>{{ 'orders.create.submit' | t }}</span><kbd>Ctrl ↵</kbd>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ─── Order Detail Drawer ─── -->
    @if (isOrderDetailOpen()) {
      <div class="drawer-overlay" (click)="closeOrderDetail()">
        <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="orderDetailTitle" (click)="$event.stopPropagation()">
          @if (selectedOrder(); as order) {
            <div class="drawer-h">
              <div class="t">
                <div class="eyebrow">
                  <span>{{ 'orders.detail.title' | t }}</span>
                  <span class="badge" [class.badge-success]="order.status === 'Completed'" [class.badge-warning]="order.status === 'Pending'" [class.badge-danger]="order.status === 'Cancelled'" [class.badge-neutral]="order.status !== 'Completed' && order.status !== 'Pending' && order.status !== 'Cancelled'">
                    <span class="dot"></span>{{ (order.status === 'Completed' ? 'orders.status.completed' : order.status === 'Pending' ? 'orders.status.pending' : 'orders.status.cancelled') | t }}
                  </span>
                </div>
                <h2 id="orderDetailTitle" class="mono">{{ order.orderNumber }}</h2>
              </div>
              <div class="tools">
                <button type="button" class="drawer-close" (click)="copyToClipboard(order.orderNumber, order.id)" [attr.data-tip]="(copiedOrderId() === order.id ? 'orders.card.copied' : 'orders.card.copyOrderNo') | t" [attr.aria-label]="'orders.card.copyOrderNo' | t">
                  <app-icon [name]="copiedOrderId() === order.id ? 'check' : 'copy'" />
                </button>
                <button type="button" class="drawer-close" (click)="closeOrderDetail()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
              </div>
            </div>

            <div class="drawer-body">
              @if (isOrderDetailLoading()) {
                <div class="od-skel" [attr.aria-label]="'common.loading' | t">
                  <div class="skeleton skeleton-title"></div>
                  <div class="skeleton skeleton-text"></div>
                  <div class="skeleton skeleton-text short"></div>
                  <div class="skeleton skeleton-title short"></div>
                  <div class="skeleton skeleton-row"></div>
                  <div class="skeleton skeleton-row"></div>
                </div>
              } @else {
                <div class="od-hero">
                  <div>
                    <div class="lbl">{{ 'orders.card.totalAmount' | t }}</div>
                    <div class="amt">{{ (order.grandTotal ?? order.totalAmount) | money: order.currency }}</div>
                  </div>
                  <span class="tag">{{ order.currency || i18n.currency() }}</span>
                </div>

                <div class="doc-grid od-grid">
                  <div class="doc-field">
                    <label>{{ 'orders.detail.customer' | t }}</label>
                    <span>
                      @if (order.customerId) {
                        <a [routerLink]="['/customers']" [queryParams]="{ q: order.customerName }" class="link">{{ order.customerName }}</a>
                      } @else {
                        {{ order.customerName }}
                      }
                    </span>
                  </div>
                  <div class="doc-field">
                    <label>{{ 'orders.detail.date' | t }}</label>
                    <span>{{ order.date | appDate: 'datetime' }}</span>
                  </div>
                  @if (order.carrier) {
                    <div class="doc-field">
                      <label>{{ 'orders.detail.carrier' | t }}</label>
                      <span>{{ order.carrier }}</span>
                    </div>
                  }
                  @if (order.trackingNumber) {
                    <div class="doc-field">
                      <label>{{ 'orders.detail.trackingNo' | t }}</label>
                      <span class="mono">{{ order.trackingNumber }}</span>
                    </div>
                  }
                </div>

                <div class="detail-items-section">
                  <h3 class="detail-section-title">{{ 'orders.items' | t }}</h3>
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
                          @if ((item.discountAmount || 0) > 0 || item.exemptionCode || item.withholdingCode) {
                            <span class="detail-item-calc">
                              @if ((item.discountAmount || 0) > 0) { {{ 'orders.discount' | t }}: −{{ item.discountAmount! | money: order.currency }} }
                              @if (item.exemptionCode) { · {{ 'finance.exemptionShort' | t: { code: item.exemptionCode } }} }
                              @if (item.withholdingCode) { · {{ 'finance.withholdingCodeShort' | t: { code: item.withholdingCode } }}: {{ (item.withheldTaxAmount || 0) | money: order.currency }} }
                            </span>
                          }
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
                        <span class="detail-item-total">{{ itemLineTotal(item) | money: order.currency }}</span>
                      </div>
                    }
                    @for (c of order.charges || []; track $index) {
                      <div class="detail-item-row">
                        <div class="detail-item-info">
                          <span class="detail-item-name">{{ 'orders.charges.' + c.type | t }}</span>
                          @if (c.description) { <span class="detail-item-calc">{{ c.description }}</span> }
                        </div>
                        <span class="detail-item-total">{{ (c.lineTotal ?? c.amount) | money: order.currency }}</span>
                      </div>
                    }
                  </div>
                  <app-tax-summary [view]="detailView(order)" [flat]="true" [baseCurrency]="i18n.currency()"></app-tax-summary>
                  @if (order.status === 'Pending' && !order.taxFrozenAt && order.stockMode !== 'despatch') {
                    <div class="tp-edit">
                      <div class="fld">
                        <label for="tpDate" class="fld-label">{{ 'finance.taxPointDate' | t }}</label>
                        <div class="field field-sm">
                          <input id="tpDate" type="date" [value]="order.taxPointDate || ''" #tpInput />
                        </div>
                      </div>
                      <button type="button" class="btn btn-sm" [class.is-loading]="savingTaxPoint()" (click)="saveTaxPoint(order, tpInput.value)" [disabled]="savingTaxPoint()"><span>{{ 'finance.updateTaxPoint' | t }}</span></button>
                    </div>
                  }
                </div>
              }
              @if (!isOrderDetailLoading()) {
                <app-order-documents [order]="order" (changed)="refreshSelectedOrder(order.id)"></app-order-documents>
              }
            </div>

            <div class="drawer-footer">
              @if (isOrderDetailLoading()) {
                <div class="skeleton od-foot-skel"></div>
              } @else {
                @if (order.status === 'Pending') {
                  <button type="button" class="btn btn-danger-ghost" (click)="promptCancelOrder(order)" [disabled]="updatingOrderId() === order.id">{{ 'orders.action.cancel' | t }}</button>
                  <span class="spacer"></span>
                  <button type="button" class="btn btn-ghost" (click)="closeOrderDetail()">{{ 'common.close' | t }}</button>
                  @if (order.stockMode !== 'despatch') {
                    <button type="button" class="btn btn-primary" [class.is-loading]="updatingOrderId() === order.id" (click)="updateOrderStatus(order.id, 'Completed')" [disabled]="updatingOrderId() === order.id">
                      <app-icon name="check" />{{ 'orders.action.complete' | t }}
                    </button>
                  }
                }
                @if (order.status === 'Completed') {
                  <span class="spacer"></span>
                  <button type="button" class="btn btn-ghost" (click)="closeOrderDetail()">{{ 'common.close' | t }}</button>
                  @if (order.stockMode !== 'despatch') {
                    <button type="button" class="btn" [class.is-loading]="updatingOrderId() === order.id" (click)="promptCancelOrder(order)" [disabled]="updatingOrderId() === order.id">
                      <app-icon name="return" />{{ 'orders.action.refund' | t }}
                    </button>
                  }
                }
                @if (order.status === 'Cancelled') {
                  <button type="button" class="btn btn-danger-outline" (click)="promptDeleteOrder(order)" [disabled]="updatingOrderId() === order.id"><app-icon name="trash" />{{ 'common.delete' | t }}</button>
                  <span class="spacer"></span>
                  <button type="button" class="btn btn-ghost" (click)="closeOrderDetail()">{{ 'common.close' | t }}</button>
                }
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- ─── Cancel Confirmation Modal ─── -->
    @if (showCancelModal()) {
      <div class="scrim z-top" (click)="updatingOrderId() === null && closeCancelModal()">
        <div class="modal w-sm" role="alertdialog" aria-modal="true" aria-labelledby="cancelModalTitle" aria-describedby="cancelModalDesc" (click)="$event.stopPropagation()">
          <div class="modal-h">
            <h3 id="cancelModalTitle">{{ (orderToCancel()?.status === 'Completed' ? 'orders.cancelModal.refundTitle' : 'orders.cancelModal.cancelTitle') | t }}</h3>
            <button type="button" class="modal-close" (click)="closeCancelModal()" [disabled]="updatingOrderId() !== null" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
          </div>
          <div class="modal-b">
            <div class="notice notice-warning">
              <app-icon name="warn" />
              <span class="t" id="cancelModalDesc">{{ 'orders.cancelModal.message' | t: { number: orderToCancel()?.orderNumber } }}</span>
            </div>
          </div>
          <div class="modal-f">
            <button type="button" class="btn btn-ghost" (click)="closeCancelModal()" [disabled]="updatingOrderId() !== null">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-danger" [class.is-loading]="updatingOrderId() !== null" (click)="confirmCancelOrder()" [disabled]="updatingOrderId() !== null">
              <span>{{ 'common.confirm' | t }}</span>
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

  /** Per-status counts for the segmented filter (presentation only). */
  statusCounts = computed(() => {
    const c = { all: 0, Pending: 0, Completed: 0, Cancelled: 0 } as Record<'all' | 'Pending' | 'Completed' | 'Cancelled', number>;
    for (const o of this.state.orders()) {
      c.all++;
      if (o.status === 'Pending' || o.status === 'Completed' || o.status === 'Cancelled') c[o.status]++;
    }
    return c;
  });

  /** Tooltip listing every line of an order in the list table. */
  itemsTitle(o: Order): string {
    return (o.items || []).map((i) => `${i.productName} · ${this.itemQtyLabel(i, false)}`).join('\n');
  }

  initials(name: string): string {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toLocaleUpperCase(this.i18n.lang() === 'tr' ? 'tr' : 'en');
  }

  /** Esc closes the topmost overlay (cancel modal, then create / detail drawer). */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showScanner()) return;
    if (this.showCancelModal()) { if (this.updatingOrderId() === null) this.closeCancelModal(); return; }
    if (this.showCreateOrderModal()) { if (!this.isOrderSaving()) this.closeCreateOrder(); return; }
    if (this.isOrderDetailOpen()) this.closeOrderDetail();
  }

  // Reactive Form
  orderForm: FormGroup = this.fb.group({
    customerId: [''],
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    currency: [''],
    warehouseId: [''],
    carrier: [''],
    trackingNumber: [''],
    salesChannel: [''],
    channelOrderRef: [''],
    tax: documentTaxGroup(this.fb),
    lines: this.fb.array([])
  });

  get taxGroup(): FormGroup {
    return this.orderForm.get('tax') as FormGroup;
  }

  readonly chargeTypes = CHARGE_TYPES;
  get chargesArray(): FormArray {
    return this.taxGroup.get('charges') as FormArray;
  }
  addCharge() {
    this.chargesArray.push(chargeGroup(this.fb));
  }

  // ─── Tax engine (WP3): live quote from the server ───
  taxService = inject(TaxService);
  readonly salesChannels = SALES_CHANNELS;
  exemptions = signal<ExemptionCode[]>([]);
  withholdings = signal<WithholdingCode[]>([]);
  quote = signal<TaxQuote | null>(null);
  quoteError = signal<string | null>(null);
  quoting = signal(false);
  savingTaxPoint = signal(false);
  /** form line index -> quote line index */
  private quoteIndex: number[] = [];
  private quoteSub?: Subscription;

  quoteView(): TaxSummaryView | null {
    const q = this.quote();
    return q ? summaryFromQuote(q) : null;
  }

  quoteLine(i: number) {
    const q = this.quote();
    const k = this.quoteIndex[i];
    return q && k !== undefined && k >= 0 ? q.doc.lines[k] ?? null : null;
  }

  detailView(order: Order): TaxSummaryView {
    return summaryFromDocument(order, this.i18n.currency());
  }

  exemptionMissing(): boolean {
    return this.linesArray.controls.some(l => lineNeedsExemption(l, this.lineProduct(l) || undefined, this.taxRates()));
  }

  private buildQuotePayload(): Record<string, unknown> | null {
    const v = this.orderForm.getRawValue();
    const items: Record<string, unknown>[] = [];
    this.quoteIndex = [];
    (v.lines || []).forEach((l: any) => {
      const qty = Number(l.quantity);
      if (!l.productId || !(qty > 0)) { this.quoteIndex.push(-1); return; }
      this.quoteIndex.push(items.length);
      const price = this.parsePrice(l.unitPrice);
      items.push({ productId: l.productId, quantity: qty, ...(l.unitId ? { unitId: l.unitId } : {}), ...(price !== null ? { unitPrice: price } : {}), ...lineTaxPayload(l) });
    });
    if (!items.length) return null;
    return { ...(v.customerId ? { customerId: v.customerId } : {}), currency: v.currency || undefined, items, ...documentTaxPayload(v.tax || {}) };
  }

  private startQuotes() {
    this.quoteSub?.unsubscribe();
    this.quoteSub = this.orderForm.valueChanges.pipe(
      debounceTime(400),
      switchMap(() => {
        const payload = this.buildQuotePayload();
        if (!payload || this.exemptionMissing()) { this.quote.set(null); return of(null); }
        this.quoting.set(true);
        return this.taxService.quoteOrder(payload).pipe(
          catchError((err) => { this.quoteError.set(err.error?.message || this.i18n.t('finance.quoteFailed')); this.quote.set(null); this.quoting.set(false); return of(null); }),
        );
      }),
    ).subscribe((q) => {
      if (q) { this.quote.set(q); this.quoteError.set(null); }
      this.quoting.set(false);
    });
  }

  saveTaxPoint(order: Order, date: string) {
    if (!date) return;
    this.savingTaxPoint.set(true);
    this.taxService.setOrderTaxPoint(order.id, { taxPointDate: date }).subscribe({
      next: (o) => {
        this.savingTaxPoint.set(false);
        this.selectedOrder.set(o);
        this.state.orders.update(list => list.map(x => (x.id === o.id ? o : x)));
        this.ui.showToast(this.i18n.t('finance.taxPointSaved'), 'success');
      },
      error: (err) => { this.savingTaxPoint.set(false); this.ui.showToast(err.error?.message || this.i18n.t('orders.toast.updateError'), 'error'); },
    });
  }

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
      if (params['id']) {
        const open = (list: Order[]) => {
          const o = list.find((x) => x.id === params['id']);
          if (o) this.openOrderDetail(o);
        };
        if (this.state.orders().length) open(this.state.orders());
        else this.inventoryService.getOrders().subscribe({ next: (list) => open(list), error: () => undefined });
      }
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
    this.quoteSub?.unsubscribe();
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
    this.orderForm.reset({ customerId: '', customerName: '', currency: this.i18n.currency(), warehouseId: '', carrier: '', trackingNumber: '', salesChannel: '', channelOrderRef: '' });
    this.orderForm.setControl('tax', documentTaxGroup(this.fb));
    this.quote.set(null);
    this.quoteError.set(null);
    this.startQuotes();
    this.onCustomerChange();
    this.loadLookups();
    this.linesArray.clear();
    this.addOrderLine();
    this.dropdownOpenIndex.set(null);
    this.showCreateOrderModal.set(true);
  }

  closeCreateOrder() {
    this.showCreateOrderModal.set(false);
    this.quoteSub?.unsubscribe();
  }

  createLineFormGroup(): FormGroup {
    return this.fb.group({
      productId: ['', Validators.required],
      productName: [''],
      price: [0],
      unitPrice: [null as number | null, [Validators.min(0)]],
      quantity: [1, [Validators.required, Validators.min(0.0001)]],
      maxQuantity: [0],
      unitId: [''],
      trackMode: ['auto'],
      lots: this.fb.control([] as { lotId: string; quantity: number }[]),
      serials: this.fb.control([] as string[]),
      ...lineTaxControls(this.fb),
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
    return roundQty((Number(line.get('quantity')?.value) || 0) * this.lineFactor(line));
  }

  /** Decimals allowed in the line's unit (base unit precision, or the alternate unit's). */
  lineDecimals(line: any): number {
    const p = this.lineProduct(line);
    const unitId = line.get('unitId')?.value;
    if (!p) return 0;
    if (!unitId) return productDecimals(p);
    const pu = p.units?.find(u => u.unitId === unitId);
    return Number(pu?.unit?.decimals) || 0;
  }

  maxForLine(line: any): number {
    const d = this.lineDecimals(line);
    const f = 10 ** d;
    return Math.floor(((Number(line.get('maxQuantity')?.value) || 0) / this.lineFactor(line)) * f + 1e-9) / f;
  }

  private applyMaxValidator(index: number) {
    const line = this.linesArray.at(index);
    const ctrl = line.get('quantity');
    ctrl?.setValidators([Validators.required, Validators.min(0.0001), Validators.max(this.maxForLine(line))]);
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
    return sumQty((line.get('lots')?.value || []).map((l: any) => Number(l.quantity) || 0));
  }

  setLotQty(index: number, lot: StockLot, event: Event) {
    const line = this.linesArray.at(index);
    const sep = (1.5).toLocaleString(this.i18n.locale()).includes(',') ? ',' : '.';
    const parsed = parseLocalizedQuantity((event.target as HTMLInputElement).value, sep);
    let qty = roundQty(Number.isNaN(parsed) ? 0 : parsed, productDecimals(this.lineProduct(line)));
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

  enforceMaxQuantity(_event: Event, index: number) {
    const lineGroup = this.linesArray.at(index);
    const max = this.maxForLine(lineGroup);
    if (Number(lineGroup.get('quantity')?.value) > max) lineGroup.patchValue({ quantity: max });
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
    this.taxService.exemptions().subscribe({ next: e => this.exemptions.set(e), error: () => {} });
    this.taxService.withholdings().subscribe({ next: w => this.withholdings.set(w), error: () => {} });
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
      const tax = lineTaxPayload(l);
      const key = `${l.productId}|${unitId}|${JSON.stringify(tax)}`;
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
          ...tax,
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
      ...(formValue.salesChannel ? { salesChannel: formValue.salesChannel } : {}),
      ...(formValue.channelOrderRef ? { channelOrderRef: String(formValue.channelOrderRef).trim() } : {}),
      ...documentTaxPayload(formValue.tax || {}),
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
        const warn = (order.warnings || []).filter(w => TAX_WARNING_KEYS[w.code]).map(w => this.i18n.t(TAX_WARNING_KEYS[w.code], (w.params || {}) as Record<string, any>));
        this.ui.showToast([this.i18n.t('orders.toast.created'), ...warn].join(' '), warn.length ? 'info' : 'success');
      },
      error: (err) => {
        this.isOrderSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('orders.toast.createError'), 'error');
      }
    });
  }

  /** Reloads one order after a document action (despatch / invoice / ÖKC receipt). */
  refreshSelectedOrder(id: string) {
    this.inventoryService.getOrders().subscribe({
      next: (list) => {
        this.state.orders.set(list);
        const o = list.find((x) => x.id === id);
        if (o && this.selectedOrder()?.id === id) this.selectedOrder.set(o);
      },
      error: () => undefined,
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
