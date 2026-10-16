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
import { CHARGE_TYPES, ExemptionCode, TaxQuote, TaxSummaryView, WithholdingCode, summaryFromDocument, summaryFromQuote } from '../../models/tax.models';
import { TaxSummaryComponent } from '../shared/tax-summary.component';
import { LineTaxFieldsComponent, chargeGroup, documentTaxGroup, documentTaxPayload, lineNeedsExemption, lineTaxControls, lineTaxPayload } from '../shared/tax-fields.component';
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe } from '../../i18n';
import { QuantityInputDirective, productDecimals } from '../shared/quantity-input.directive';
import { fitsDecimals, roundQty, sumQty } from '@stok/tr-compliance';
import { toastMovementResult } from '../shared/movement-warnings';
import { GoodsReceiptFormComponent } from '../documents/goods-receipt-form.component';
import { DocumentsService } from '../../services/documents.service';
import { RouterLink } from '@angular/router';
import { SpecialCategoryWarningComponent } from '../shared/special-category-warning.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, BarcodeScannerComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AppDatePipe, UnitLabelPipe, QuantityInputDirective, TaxSummaryComponent, LineTaxFieldsComponent, GoodsReceiptFormComponent, RouterLink, SpecialCategoryWarningComponent, IconComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'purchaseOrders.title' | t }}</h1>
        <p>{{ 'purchaseOrders.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn" (click)="autoDraft()" [disabled]="isAutoDrafting()" [class.is-loading]="isAutoDrafting()" [attr.data-tip]="'purchaseOrders.autoDraftTooltip' | t" [attr.aria-label]="'purchaseOrders.autoDraft' | t">
          <app-icon name="zap" /><span class="no-xs">{{ (isAutoDrafting() ? 'purchaseOrders.analyzing' : 'purchaseOrders.autoDraft') | t }}</span>
        </button>
        <button type="button" class="btn btn-primary" (click)="openDrawer()">
          <app-icon name="plus" /><span>{{ 'purchaseOrders.new' | t }}</span><kbd>N</kbd><kbd>B</kbd>
        </button>
      </div>
    </header>

    <div class="toolbar po-toolbar">
      <div class="seg seg-sm" role="group" [attr.aria-label]="'purchaseOrders.status' | t">
        @for (f of poFilters; track f.v) {
          <button type="button" [attr.aria-pressed]="poFilterStatus() === f.v" (click)="poFilterStatus.set(f.v)">{{ f.k | t }} <span class="count">{{ statusCount(f.v) }}</span></button>
        }
      </div>
      <div class="field field-sm po-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [placeholder]="'purchaseOrders.searchPlaceholder' | t" [attr.aria-label]="'common.search' | t" [ngModel]="poSearch()" (ngModelChange)="poSearch.set($event)" />
        <span class="trail"><kbd>/</kbd></span>
      </div>
      <span class="spacer"></span>
      <div class="po-dates">
        <div class="field field-sm">
          <input type="date" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" [attr.aria-label]="'purchaseOrders.startDate' | t" [title]="'purchaseOrders.startDate' | t" />
        </div>
        <span class="po-dash" aria-hidden="true">–</span>
        <div class="field field-sm">
          <input type="date" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" [attr.aria-label]="'purchaseOrders.endDate' | t" [title]="'purchaseOrders.endDate' | t" />
        </div>
        @if (startDate() || endDate()) {
          <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="startDate.set(''); endDate.set('')" [attr.aria-label]="'purchaseOrders.clearFilter' | t" [attr.data-tip]="'purchaseOrders.clearFilter' | t">
            <app-icon name="x" size="sm" />
          </button>
        }
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="po-skel" aria-busy="true">
          @for (r of [1,2,3,4,5,6]; track r) { <div class="skeleton-row"></div> }
        </div>
      } @else if (filteredOrders().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="cart" /></div>
          <h3>{{ 'purchaseOrders.noResults' | t }}</h3>
          <div class="actions cluster">
            <button type="button" class="btn btn-primary" (click)="openDrawer()"><app-icon name="plus" />{{ 'purchaseOrders.create' | t }}</button>
          </div>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive po-table">
            <thead>
              <tr>
                <th>{{ 'purchaseOrders.col.poNumber' | t }}</th>
                <th>{{ 'purchaseOrders.supplier' | t }}</th>
                <th>{{ 'purchaseOrders.orderDate' | t }}</th>
                <th class="lg-only">{{ 'purchaseOrders.expectedDate' | t }}</th>
                <th>{{ 'purchaseOrders.items' | t }}</th>
                <th>{{ 'purchaseOrders.status' | t }}</th>
                <th class="r">{{ 'purchaseOrders.totalAmount' | t }}</th>
                <th class="w-acts po-th-acts"><span class="sr">{{ 'common.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (o of filteredOrders(); track o.id) {
                @let g = getGroupedItems(o.items);
                <tr class="clickable-row" (click)="openDetailDrawer(o)">
                  <td class="td-primary">
                    <span class="po-head">
                      <button type="button" class="mono po-no" [attr.aria-label]="('purchaseOrders.orderDetails' | t) + ' ' + formatPoNumber(o.poNumber)" (click)="$event.stopPropagation(); openDetailDrawer(o)">{{ formatPoNumber(o.poNumber) }}</button>
                      <span class="badge xs-only" [ngClass]="getBadgeClass(o.status)"><span class="dot"></span>{{ getStatusName(o.status) }}</span>
                    </span>
                  </td>
                  <td class="po-sup" [attr.data-label]="'purchaseOrders.supplier' | t"><span class="truncate">{{ o.supplierName }}</span></td>
                  <td [attr.data-label]="'purchaseOrders.orderDate' | t">{{ o.createdAt | appDate }}</td>
                  <td class="no-xs lg-only cell-sec">{{ o.expectedDate ? (o.expectedDate | appDate) : '—' }}</td>
                  <td class="no-xs po-items-td" [title]="o.notes || ''">
                    @if (g.length) {
                      <span class="po-items"><span class="truncate">{{ g[0].productName }}</span><span class="cell-sec">{{ qtyLabel(g[0]) }}</span>@if (g.length > 1) { <span class="tag">+{{ g.length - 1 }}</span> }</span>
                    } @else { <span class="cell-sec">—</span> }
                  </td>
                  <td class="no-xs"><span class="badge" [ngClass]="getBadgeClass(o.status)"><span class="dot"></span>{{ getStatusName(o.status) }}</span></td>
                  <td class="r po-total" [attr.data-label]="'purchaseOrders.totalAmount' | t">{{ (o.grandTotal ?? o.totalAmount) | money: o.currency }}</td>
                  <td class="td-actions w-acts" (click)="$event.stopPropagation()">
                    <div class="po-acts">
                      <span class="po-act-main">
                        @if (o.status === 'Draft') {
                          <button type="button" class="btn btn-ghost btn-sm po-main" (click)="sendPurchaseOrder(o)"><app-icon name="arrowur" size="sm" /><span>{{ 'purchaseOrders.send' | t }}</span></button>
                        } @else if (o.status === 'Sent') {
                          <button type="button" class="btn btn-ghost btn-sm po-main" (click)="receivePurchaseOrder(o)"><app-icon name="box-in" size="sm" /><span>{{ 'purchaseOrders.receive' | t }}</span></button>
                        } @else if (o.status === 'Partially Received') {
                          <button type="button" class="btn btn-ghost btn-sm po-main" (click)="receivePurchaseOrder(o)"><app-icon name="box-in" size="sm" /><span>{{ 'purchaseOrders.receive' | t }}</span></button>
                        }
                      </span>
                      <span class="po-act-icons">
                        @if (o.status === 'Draft') {
                          <button type="button" class="btn btn-ghost btn-sm btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="editPurchaseOrder(o)"><app-icon name="edit" /></button>
                          <button type="button" class="btn btn-ghost btn-sm btn-icon row-act po-del" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="deletePurchaseOrder(o)"><app-icon name="trash" /></button>
                        } @else if (o.status === 'Sent') {
                          <button type="button" class="btn btn-ghost btn-sm btn-icon row-act po-del" [attr.aria-label]="'purchaseOrders.cancelOrder' | t" [attr.data-tip]="'purchaseOrders.cancelOrder' | t" (click)="cancelPurchaseOrder(o)"><app-icon name="x" /></button>
                        } @else if (o.status === 'Cancelled') {
                          <button type="button" class="btn btn-ghost btn-sm btn-icon row-act po-del" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="deletePurchaseOrder(o)"><app-icon name="trash" /></button>
                        }
                      </span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="tbl-foot">
          <span>{{ 'purchaseOrders.count' | t: { n: filteredOrders().length } }}</span>
        </div>
      }
    </div>

    <!-- New / edit order drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()" (document:keydown.escape)="!scannerMode() && closeDrawer()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="(editingPoId() ? 'purchaseOrders.editTitle' : 'purchaseOrders.newTitle') | t" (click)="$event.stopPropagation()">
          <header class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="cart" size="sm" /><span class="truncate">{{ 'purchaseOrders.title' | t }}</span></div>
              <h2>{{ (editingPoId() ? 'purchaseOrders.editTitle' : 'purchaseOrders.newTitle') | t }}</h2>
            </div>
            <div class="tools">
              <button type="button" class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </header>

          <form [formGroup]="poForm" (ngSubmit)="savePo()" class="po-form">
            <div class="drawer-body drawer-b">
              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'purchaseOrders.section.supplier' | t }}</h3><p>{{ 'purchaseOrders.section.supplierSub' | t }}</p></div>
                <div class="grid-2">
                  <div class="fld span-2">
                    <label class="fld-label" for="poSupplier">{{ 'purchaseOrders.supplier' | t }} <span class="req">*</span></label>
                    <div class="field select">
                      <span class="lead"><app-icon name="truck" size="sm" /></span>
                      <select id="poSupplier" formControlName="supplierId" (change)="onSupplierChange()" [attr.aria-invalid]="isFieldInvalid('supplierId')">
                        <option value="" disabled>{{ 'purchaseOrders.selectSupplier' | t }}</option>
                        @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                      </select>
                    </div>
                    @if (isFieldInvalid('supplierId')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'purchaseOrders.supplierRequired' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="poCurrency">{{ 'finance.currency' | t }}</label>
                    <div class="field select">
                      <select id="poCurrency" formControlName="currency">
                        @for (c of currencies(); track c) { <option [value]="c">{{ c }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="poExpected">{{ 'purchaseOrders.expectedDate' | t }}</label>
                    <div class="field">
                      <input id="poExpected" type="date" formControlName="expectedDate" />
                    </div>
                  </div>
                  <div class="fld span-2">
                    <label class="fld-label" for="poWarehouse">{{ 'purchaseOrders.receivingWarehouse' | t }}</label>
                    <div class="field select">
                      <span class="lead"><app-icon name="warehouse" size="sm" /></span>
                      <select id="poWarehouse" formControlName="warehouseId">
                        <option value="">{{ 'purchaseOrders.defaultWarehouse' | t }}</option>
                        @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld span-2">
                    <label class="fld-label" for="poNotes">{{ 'purchaseOrders.notes' | t }}</label>
                    <div class="field has-area"><textarea id="poNotes" rows="2" formControlName="notes"></textarea></div>
                    <app-special-category-warning [text]="poForm.get('notes')?.value" />
                  </div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h">
                  <span class="n">2</span><h3>{{ 'purchaseOrders.orderItems' | t }}</h3>
                  <p>@if (itemsArray.length) { {{ 'purchaseOrders.lineCount' | t: { n: itemsArray.length } }} · }{{ (pricesIncludeTax() ? 'finance.pricesIncludeTax' : 'finance.pricesExcludeTax') | t }}</p>
                  <span class="aside po-sec-acts">
                    <button type="button" class="btn btn-sm" (click)="openLineScanner()" [disabled]="scanning()" [class.is-loading]="scanning()"><app-icon name="barcode" size="sm" /><span>{{ 'purchaseOrders.scan' | t }}</span></button>
                    <button type="button" class="btn btn-sm btn-subtle" (click)="addItem()"><app-icon name="plus" size="sm" />{{ 'purchaseOrders.addProduct' | t }}</button>
                  </span>
                </div>

                <div formArrayName="items" class="po-lines">
                  @for (item of itemsArray.controls; track i; let i = $index) {
                    <div [formGroupName]="i" class="po-line" [class.po-line-hl]="highlightIndex() === i">
                      <div class="po-line-top">
                        <span class="po-line-n mono">{{ i + 1 }}</span>
                        <div class="field field-sm select po-line-product">
                          <select formControlName="productId" (change)="onProductChange(i)" [attr.aria-label]="'purchaseOrders.selectProduct' | t">
                            <option value="" disabled>{{ 'purchaseOrders.selectProduct' | t }}</option>
                            @for (p of state.products(); track p.id) {
                              <option [value]="p.id">{{ p.name }} ({{ 'purchaseOrders.available' | t: { n: p.quantity } }})</option>
                            }
                          </select>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm btn-icon po-del" (click)="removeItem(i)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" /></button>
                      </div>
                      <div class="po-line-grid">
                        <div class="fld">
                          <label class="fld-label" [for]="'poQty' + i">{{ 'purchaseOrders.quantity' | t }}</label>
                          <div class="field field-sm"><input [id]="'poQty' + i" type="text" class="num" inputmode="decimal" appQty [qtyDecimals]="lineDecimals(item.get('productId')?.value, item.get('unitId')?.value)" formControlName="quantity" /></div>
                        </div>
                        @if (productById(item.get('productId')?.value); as lp) {
                          @if (lp.units?.length) {
                            <div class="fld">
                              <label class="fld-label" [for]="'poUnit' + i">{{ 'purchaseOrders.unit' | t }}</label>
                              <div class="field field-sm select">
                                <select [id]="'poUnit' + i" formControlName="unitId" (change)="onUnitChange(i)">
                                  <option value="">{{ (lp.baseUnit || lp.unit || 'pcs') | unitLabel }}</option>
                                  @for (u of lp.units; track u.unitId) {
                                    <option [value]="u.unitId">{{ (u.unit || u.unitId) | unitLabel }} (×{{ u.factor | num }})</option>
                                  }
                                </select>
                              </div>
                            </div>
                          }
                        }
                        <div class="fld">
                          <label class="fld-label" [for]="'poPrice' + i">{{ 'finance.unitPrice' | t }}</label>
                          <div class="field field-sm"><input [id]="'poPrice' + i" type="number" class="num" formControlName="unitPrice" min="0" step="0.01" /><span class="affix suf">{{ formCurrency() }}</span></div>
                        </div>
                      </div>
                      @if (item.get('productId')?.value) {
                        <app-line-tax-fields [group]="$any(item)" [product]="productById(item.get('productId')?.value)" [rates]="taxRates()" [exemptions]="exemptions()" [withholdings]="withholdings()" [importLine]="foreignSupplier()" [showReverseCharge]="foreignSupplier()"></app-line-tax-fields>
                      }
                      @if (preview().lines[i]; as ln) {
                        <div class="po-line-meta">
                          @if (factorFor(item.get('productId')?.value, item.get('unitId')?.value) !== 1) {
                            <span>{{ 'purchaseOrders.baseQtyHint' | t: { qty: ((item.get('quantity')?.value || 0) * factorFor(item.get('productId')?.value, item.get('unitId')?.value) | num), unit: (baseUnitOf(item.get('productId')?.value) | unitLabel) } }}</span>
                          }
                          @if (quoteLine(i); as ql) {
                            <span>{{ 'finance.taxRate' | t }} <b>{{ ql.taxRate | num }}%</b></span>
                            <span>{{ 'finance.taxAmount' | t }} <b>{{ ql.taxAmount | money: formCurrency() }}</b></span>
                            @if (ql.withheldTaxAmount > 0) { <span>{{ 'orders.withheldVat' | t }} <b>{{ ql.withheldTaxAmount | money: formCurrency() }}</b></span> }
                            <span class="po-line-total">{{ 'finance.lineTotal' | t }} <b>{{ ql.lineTotal | money: formCurrency() }}</b></span>
                          } @else if (ln.hasPrice) {
                            <span>{{ 'finance.taxRate' | t }} <b>{{ ln.rate | num }}%</b></span>
                            <span>{{ 'finance.taxAmount' | t }} <b>{{ ln.tax | money: formCurrency() }}</b></span>
                            <span class="po-line-total">{{ 'finance.lineTotal' | t }} <b>{{ ln.gross | money: formCurrency() }}</b></span>
                          } @else if (ln.productId) {
                            <span>{{ 'purchaseOrders.serverPriceHint' | t }}</span>
                          }
                        </div>
                      }
                    </div>
                  }
                  @if (itemsArray.length === 0) {
                    <div class="empty-state po-empty-lines">
                      <div class="empty-art"><app-icon name="box" /></div>
                      <p>{{ 'purchaseOrders.noItems' | t }}</p>
                      <div class="actions cluster">
                        <button type="button" class="btn btn-sm btn-subtle" (click)="addItem()"><app-icon name="plus" size="sm" />{{ 'purchaseOrders.addProduct' | t }}</button>
                      </div>
                    </div>
                  }
                </div>
              </section>

              @if (itemsArray.length > 0) {
                <section class="fsec">
                  <div class="fsec-h">
                    <span class="n">3</span><h3>{{ 'finance.charges' | t }}</h3><p>{{ 'orders.create.chargesOptional' | t }}</p>
                    <span class="aside po-sec-acts">
                      <button type="button" class="btn btn-sm btn-subtle" (click)="addCharge()"><app-icon name="plus" size="sm" />{{ 'finance.addCharge' | t }}</button>
                    </span>
                  </div>
                  <div [formGroup]="taxGroup">
                    <div formArrayName="charges" class="po-ch-list">
                      @for (c of chargesArray.controls; track $index; let i = $index) {
                        <div class="po-ch-row" [formGroupName]="i">
                          <div class="field field-sm select">
                            <select formControlName="type" [attr.aria-label]="'finance.chargeType' | t">
                              @for (ct of chargeTypes; track ct) { <option [value]="ct">{{ 'orders.charges.' + ct | t }}</option> }
                            </select>
                          </div>
                          <div class="field field-sm">
                            <input type="number" min="0" step="0.01" class="num" formControlName="amount" [placeholder]="'finance.amount' | t" [attr.aria-label]="'finance.amount' | t" />
                            <span class="affix suf">{{ formCurrency() }}</span>
                          </div>
                          <div class="field field-sm po-ch-desc">
                            <input type="text" formControlName="description" maxlength="255" [placeholder]="'finance.chargeDescription' | t" [attr.aria-label]="'finance.chargeDescription' | t" />
                          </div>
                          <button type="button" class="btn btn-ghost btn-sm btn-icon po-del" (click)="chargesArray.removeAt(i)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" /></button>
                        </div>
                      }
                    </div>
                    <div class="fld-help">{{ 'finance.chargesHint' | t }}</div>
                  </div>
                </section>

                <section class="fsec">
                  <div class="fsec-h"><span class="n">4</span><h3>{{ 'purchaseOrders.section.totals' | t }}</h3></div>
                  <div class="grid-2" [formGroup]="taxGroup">
                    <div class="fld">
                      <label class="fld-label" for="poDocDiscount">{{ 'finance.documentDiscount' | t }}</label>
                      <div class="field">
                        <input id="poDocDiscount" type="number" min="0" step="0.01" class="num" formControlName="documentDiscountAmount" placeholder="0" />
                        <span class="affix suf">{{ formCurrency() }}</span>
                      </div>
                    </div>
                    <div class="fld">
                      <label class="fld-label" for="poTaxPoint">{{ 'finance.taxPointDate' | t }}</label>
                      <div class="field">
                        <span class="lead"><app-icon name="calendar" size="sm" /></span>
                        <input id="poTaxPoint" type="date" formControlName="taxPointDate" />
                      </div>
                    </div>
                  </div>
                  @if (foreignSupplier()) {
                    <div class="grid-2" [formGroup]="poForm">
                      <div class="fld">
                        <label class="fld-label" for="cdNo">{{ 'purchaseOrders.customsDeclarationNo' | t }}</label>
                        <div class="field"><input id="cdNo" type="text" class="mono" formControlName="customsDeclarationNo" maxlength="30" /></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="cdDate">{{ 'purchaseOrders.customsDeclarationDate' | t }}</label>
                        <div class="field"><input id="cdDate" type="date" formControlName="customsDeclarationDate" /></div>
                      </div>
                    </div>
                  }
                  @if (quote()) {
                    <app-tax-summary [view]="quoteView()" [error]="quoteError()" [baseCurrency]="i18n.currency()"></app-tax-summary>
                  } @else {
                    @if (quoteError()) { <app-tax-summary [view]="null" [error]="quoteError()"></app-tax-summary> }
                    <div class="po-totals">
                      <div class="row"><span>{{ 'finance.subtotal' | t }}</span><span>{{ preview().subtotal | money: formCurrency() }}</span></div>
                      <div class="row grand"><span>{{ 'finance.grandTotal' | t }}</span><span>{{ preview().total | money: formCurrency() }}</span></div>
                      @if (preview().incomplete) { <div class="fld-help">{{ 'purchaseOrders.previewIncomplete' | t }}</div> }
                    </div>
                  }
                </section>
              }
            </div>

            <div class="drawer-footer">
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeDrawer()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSaving()" [disabled]="poForm.invalid || itemsArray.length === 0 || isSaving() || exemptionMissing()">
                <span>{{ (isSaving() ? 'purchaseOrders.saving' : (editingPoId() ? 'purchaseOrders.update' : 'purchaseOrders.createBtn')) | t }}</span><kbd>Ctrl ↵</kbd>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Detail drawer -->
    @if (detailOrder()) {
      <div class="drawer-overlay" (click)="closeDetailDrawer()" (document:keydown.escape)="!grTarget() && closeDetailDrawer()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'purchaseOrders.detailTitle' | t" (click)="$event.stopPropagation()">
          <header class="drawer-h">
            <div class="t">
              <div class="eyebrow">
                <span class="mono">{{ formatPoNumber(detailOrder().poNumber) }}</span>
                <span class="badge" [ngClass]="getBadgeClass(detailOrder().status)"><span class="dot"></span>{{ getStatusName(detailOrder().status) }}</span>
                @if (detailOrder().isImport) { <span class="badge badge-info">{{ 'purchaseOrders.import' | t }}</span> }
              </div>
              <h2 class="truncate">{{ detailOrder().supplierName }}</h2>
            </div>
            <div class="tools">
              @if (detailOrder().status !== 'Draft' && detailOrder().status !== 'Sent') {
                <a class="btn btn-ghost btn-sm" routerLink="/goods-receipts" [attr.aria-label]="'purchaseOrders.goodsReceipts' | t"><app-icon name="box-in" size="sm" /><span class="no-xs">{{ 'purchaseOrders.goodsReceipts' | t }}</span></a>
              }
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="docs.print('purchase-orders/' + detailOrder().id + '/print')" [attr.aria-label]="'purchaseOrders.printForm' | t" [attr.data-tip]="'purchaseOrders.printForm' | t"><app-icon name="printer" /></button>
              <button type="button" class="drawer-close" (click)="closeDetailDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </header>
          <div class="drawer-body">
            @if (detailOrder().status === 'Received') {
              <div class="notice notice-success"><app-icon name="okc" /><span class="t">{{ 'purchaseOrders.receivedInfo' | t }}</span></div>
            } @else if (detailOrder().status === 'Cancelled') {
              <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ 'purchaseOrders.cancelledInfo' | t }}</span></div>
            }

            <div class="doc-grid po-meta">
              <div class="doc-field"><label>{{ 'purchaseOrders.createdAt' | t }}</label><span>{{ detailOrder().createdAt | appDate: 'datetime' }}</span></div>
              <div class="doc-field"><label>{{ 'purchaseOrders.expectedDate' | t }}</label><span>{{ detailOrder().expectedDate ? (detailOrder().expectedDate | appDate) : '—' }}</span></div>
              @if (warehouseName(detailOrder().warehouseId); as wn) {
                <div class="doc-field"><label>{{ 'purchaseOrders.receivingWarehouse' | t }}</label><span>{{ wn }}</span></div>
              }
              <div class="doc-field"><label>{{ 'finance.currency' | t }}</label><span class="mono">{{ detailOrder().currency }}</span></div>
            </div>

            <section class="doc-section">
              <h3 class="doc-section-title">{{ 'purchaseOrders.items' | t }} <span class="tag">{{ getGroupedItems(detailOrder().items).length }}</span></h3>
              <div class="table-scroll po-dt-wrap">
                <table class="doc-table po-dt">
                  <thead><tr>
                    <th>{{ 'despatches.product' | t }}</th>
                    <th class="num">{{ 'purchaseOrders.quantity' | t }}</th>
                    <th class="num hide-xs">{{ 'finance.unitPrice' | t }}</th>
                    <th class="num hide-xs">{{ 'finance.tax' | t }}</th>
                    <th class="num">{{ 'finance.lineTotal' | t }}</th>
                  </tr></thead>
                  <tbody>
                    @for (item of getGroupedItems(detailOrder().items); track item.key) {
                      <tr>
                        <td>
                          <div class="po-dt-name">{{ item.productName }}</div>
                          @if ((item.discountAmount || 0) > 0 || item.exemptionCode || item.withholdingCode || item.reverseCharge) {
                            <div class="po-dt-sub">
                              @if ((item.discountAmount || 0) > 0) { <span>{{ 'orders.discount' | t }} −{{ item.discountAmount | money: detailOrder().currency }}</span> }
                              @if (item.exemptionCode) { <span class="tag">{{ 'finance.exemptionShort' | t: { code: item.exemptionCode } }}</span> }
                              @if (item.withholdingCode) { <span>{{ 'finance.withholdingCodeShort' | t: { code: item.withholdingCode } }}: {{ (item.withheldTaxAmount || 0) | money: detailOrder().currency }}</span> }
                              @if (item.reverseCharge) { <span class="tag">{{ 'finance.reverseCharge' | t }}</span> }
                            </div>
                          }
                          @if (item.tracking.length) {
                            <div class="po-dt-sub">
                              @for (tr of item.tracking; track $index) {
                                <span>
                                  @if (tr.lotNumber) {
                                    <span class="mono">{{ 'purchaseOrders.tracking.lotLine' | t: { lot: tr.lotNumber, qty: (tr.quantity | num) } }}</span>
                                    @if (tr.expiryDate) { · {{ 'purchaseOrders.tracking.expiry' | t }} {{ tr.expiryDate | appDate }} }
                                  }
                                  @if (tr.serials?.length) {
                                    {{ 'purchaseOrders.tracking.serials' | t }}: <span class="mono">{{ tr.serials.join(', ') }}</span>
                                  }
                                </span>
                              }
                            </div>
                          }
                        </td>
                        <td class="num nowrap">{{ qtyLabel(item) }}</td>
                        <td class="num hide-xs nowrap">{{ item.price | money: detailOrder().currency }}</td>
                        <td class="num hide-xs nowrap"><span class="po-dt-rate">%{{ item.taxRate | num }}</span> {{ item.taxAmount | money: detailOrder().currency }}</td>
                        <td class="num nowrap"><b class="po-dt-total">{{ item.lineTotal | money: detailOrder().currency }}</b></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="po-sum">
                @for (c of detailOrder().charges || []; track $index) {
                  <div class="po-sum-row"><span>{{ 'orders.charges.' + c.type | t }}@if (c.description) { · {{ c.description }} }</span><span>{{ (c.lineTotal ?? c.amount) | money: detailOrder().currency }}</span></div>
                }
                <app-tax-summary [view]="detailView()" [flat]="true" [baseCurrency]="i18n.currency()"></app-tax-summary>
              </div>
            </section>

            @if (detailOrder().isImport) {
              <section class="doc-section">
                <h3 class="doc-section-title">{{ 'purchaseOrders.import' | t }}</h3>
                <div class="fld-help po-import-hint">{{ 'finance.importVatHint' | t }}</div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="dCdNo">{{ 'purchaseOrders.customsDeclarationNo' | t }}</label>
                    <div class="field"><input id="dCdNo" type="text" class="mono" [(ngModel)]="customsNo" maxlength="30" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="dCdDate">{{ 'purchaseOrders.customsDeclarationDate' | t }}</label>
                    <div class="field"><input id="dCdDate" type="date" [(ngModel)]="customsDate" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="dIv">{{ 'purchaseOrders.importVatAmount' | t }}</label>
                    <div class="field"><input id="dIv" type="number" min="0" step="0.01" class="num" [(ngModel)]="importVat" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="dNd">{{ 'purchaseOrders.nonDeductibleImportVat' | t }}</label>
                    <div class="field"><input id="dNd" type="number" min="0" step="0.01" class="num" [(ngModel)]="nonDeductibleVat" /></div>
                  </div>
                </div>
                @if (detailOrder().status !== 'Cancelled') {
                  <div><button type="button" class="btn btn-sm" (click)="saveCustoms()" [disabled]="isSaving()">{{ 'purchaseOrders.saveCustoms' | t }}</button></div>
                }
              </section>
            }

            @if (detailOrder().notes) {
              <section class="doc-section">
                <h3 class="doc-section-title">{{ 'purchaseOrders.notes' | t }}</h3>
                <p class="doc-note po-notes">{{ detailOrder().notes }}</p>
              </section>
            }
          </div>
          <div class="drawer-footer">
            @if (detailOrder().status === 'Draft') {
              <button type="button" class="btn btn-danger-ghost" (click)="deletePurchaseOrder(detailOrder())"><app-icon name="trash" size="sm" />{{ 'common.delete' | t }}</button>
            } @else if (detailOrder().status === 'Sent') {
              <button type="button" class="btn btn-danger-ghost" (click)="cancelPurchaseOrder(detailOrder())">{{ 'purchaseOrders.cancelOrder' | t }}</button>
            } @else if (detailOrder().status === 'Cancelled') {
              <button type="button" class="btn btn-danger-ghost" (click)="deletePurchaseOrder(detailOrder())"><app-icon name="trash" size="sm" />{{ 'common.delete' | t }}</button>
            }
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" [class.no-xs]="detailOrder().status !== 'Received'" (click)="closeDetailDrawer()">{{ 'common.close' | t }}</button>
            @if (detailOrder().status === 'Partially Received') {
              <button type="button" class="btn" (click)="closePartial(detailOrder())">{{ 'purchaseOrders.closeShort' | t }}</button>
              <button type="button" class="btn btn-primary" (click)="receivePurchaseOrder(detailOrder())"><app-icon name="box-in" />{{ 'purchaseOrders.receive' | t }}</button>
            } @else if (detailOrder().status === 'Draft') {
              <button type="button" class="btn" (click)="editPurchaseOrder(detailOrder())"><app-icon name="edit" />{{ 'common.edit' | t }}</button>
              <button type="button" class="btn btn-primary" (click)="sendPurchaseOrder(detailOrder())"><app-icon name="arrowur" />{{ 'purchaseOrders.send' | t }}</button>
            } @else if (detailOrder().status === 'Sent') {
              <button type="button" class="btn btn-primary" (click)="receivePurchaseOrder(detailOrder())"><app-icon name="box-in" />{{ 'purchaseOrders.receive' | t }}</button>
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
    .drawer-h .eyebrow .mono { flex: none; white-space: nowrap; }
    .drawer-h .eyebrow .truncate { min-width: 0; }
    .xs-only { display: none !important; }
    .nowrap { white-space: nowrap; }
    /* toolbar */
    .po-toolbar { margin-bottom: 12px; }
    .po-search { flex: 1 1 240px; max-width: 360px; }
    .po-dates { display: flex; align-items: center; gap: 6px; }
    .po-dates .field { width: 140px; }
    .po-dash { color: var(--fg-3); font-size: var(--text-xs); }
    /* table */
    .po-skel { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .po-table td { white-space: nowrap; }
    .po-table td.w-acts { overflow: visible; }
    .po-no { all: unset; font-family: var(--font-mono); font-feature-settings: 'zero'; font-size: inherit; font-weight: 500; white-space: nowrap; color: var(--fg); cursor: pointer; border-radius: var(--radius-sm); }
    .po-no:hover { color: var(--accent-text); text-decoration: underline; text-underline-offset: 3px; }
    .po-no:focus-visible { box-shadow: var(--focus-ring); }
    .po-head { display: inline-flex; align-items: center; gap: 8px; }
    .po-sup { width: 22%; max-width: 0; }
    .po-sup .truncate { display: block; }
    /* the items column absorbs the remaining width; product names truncate only when space truly runs out */
    .po-items-td { width: 34%; max-width: 0; }
    .po-items { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .po-items .truncate { min-width: 0; flex: 0 1 auto; }
    .po-items .cell-sec { white-space: nowrap; font-size: var(--text-xs); flex: none; }
    .po-items .tag { flex: none; }
    .po-total { font-weight: 500; white-space: nowrap; }
    .w-acts { width: 1%; text-align: right; padding-right: 8px; }
    /* fixed icon slot so every row's main action ends at the same x: [main (natural width)][2 hover icons] */
    .po-acts { display: grid; grid-template-columns: auto calc(var(--h-sm) * 2 + 2px); align-items: center; justify-content: end; gap: 2px; }
    .po-act-main { display: flex; justify-content: flex-end; }
    .po-act-main .btn { white-space: nowrap; }
    .po-main { padding-inline: 8px; }
    .po-act-icons { display: flex; justify-content: flex-start; gap: 2px; }
    /* keep the global toast stack clear of a drawer's sticky footer */
    ::ng-deep body:has(.drawer-overlay .drawer-footer) .toast-container { bottom: calc(var(--h-md) + 48px); }
    .po-del:hover { color: var(--danger); }
    .po-ch-list { display: flex; flex-direction: column; gap: 8px; }
    .po-ch-list:not(:empty) { margin-bottom: 8px; }
    .po-ch-row { display: grid; grid-template-columns: 150px 140px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    @media (max-width: 640px) {
      .po-ch-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
      .po-ch-desc { grid-column: 1 / -1; grid-row: 2; }
    }
    /* drawer form */
    .po-form { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .po-sec-acts { display: inline-flex; gap: 6px; align-items: center; }
    .po-lines { display: flex; flex-direction: column; gap: 10px; }
    .po-line {
      display: flex; flex-direction: column; gap: 12px; padding: 12px; border-radius: var(--radius-md);
      background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line);
      transition: box-shadow var(--dur-2) var(--ease-out);
    }
    .po-line-hl { box-shadow: inset 0 0 0 1px var(--accent), var(--focus-ring); }
    .po-line-top { display: flex; align-items: center; gap: 8px; }
    .po-line-n { width: 20px; flex: none; font-size: var(--text-xs); color: var(--fg-3); text-align: center; }
    .po-line-product { flex: 1; min-width: 0; }
    .po-line-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px 14px; padding-left: 28px; }
    .po-line app-line-tax-fields { display: block; padding-left: 28px; }
    .po-line-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; padding: 8px 0 0 28px; box-shadow: inset 0 1px 0 var(--line); font-size: var(--text-xs); color: var(--fg-3); }
    .po-line-meta:empty { display: none; }
    .po-line-meta b { font-weight: 500; color: var(--fg-2); }
    .po-line-total { margin-left: auto; }
    .po-line-total b { color: var(--fg); font-size: var(--text-sm); }
    .po-empty-lines { padding: 24px 16px; border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); background: var(--surface-2); }
    .po-totals { margin-left: auto; width: min(340px, 100%); }
    .po-totals .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: var(--text-sm); box-shadow: inset 0 -1px 0 var(--line); }
    .po-totals .row > :first-child { color: var(--fg-2); }
    .po-totals .row > :last-child { font-variant-numeric: tabular-nums; }
    .po-totals .row.grand { box-shadow: none; padding-top: 8px; font-weight: 600; font-size: var(--text-md); }
    .po-totals .row.grand > :first-child { color: var(--fg); }
    /* detail */
    .po-meta { margin-bottom: 0; }
    .po-dt-wrap { border-radius: var(--radius-md); }
    .po-dt td { vertical-align: top; padding-top: 9px; padding-bottom: 9px; }
    .po-dt-name { font-weight: 500; }
    .po-dt-sub { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 3px; font-size: var(--text-xs); color: var(--fg-3); }
    .po-dt-rate { color: var(--fg-3); font-size: var(--text-xs); margin-right: 4px; }
    .po-dt-total { font-weight: 600; }
    .po-sum { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
    .po-sum-row { display: flex; justify-content: space-between; gap: 12px; font-size: var(--text-sm); color: var(--fg-2); }
    .po-sum-row > :last-child { color: var(--fg); font-variant-numeric: tabular-nums; }
    .po-import-hint { margin: -4px 0 12px; }
    .po-notes { margin: 0; white-space: pre-wrap; line-height: 1.5; }
    @media (min-width: 641px) and (max-width: 1500px) { .lg-only { display: none; } }
    @media (max-width: 640px) {
      .xs-only { display: inline-flex !important; }
      .no-xs { display: none !important; }
      .po-search { flex-basis: 100%; max-width: none; }
      .po-dates { flex: 1 1 100%; }
      .po-dates .field { flex: 1; width: auto; min-width: 0; }
      .po-toolbar .seg { width: 100%; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
      .po-toolbar .seg::-webkit-scrollbar { display: none; }
      .po-toolbar .seg button { flex: 1 0 auto; padding: 0 8px; white-space: nowrap; }
      .po-toolbar .seg .count { display: none; }
      .po-table td { max-width: none; white-space: normal; }
      .po-sup, .po-items-td { width: auto; }
      .po-toolbar .spacer { display: none; }
      .po-head { display: flex; justify-content: space-between; width: 100%; }
      .po-sup .truncate { max-width: 60vw; }
      .po-total { font-weight: 600; }
      .po-table .row-act { opacity: 1; }
      .po-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .table-responsive td.w-acts { width: 100%; padding-top: 6px; }
      .po-acts { display: flex; justify-content: flex-end; }
      .po-act-main:empty, .po-act-icons:empty { display: none; }
      .po-act-main .btn { width: auto; }
      .po-line-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-left: 0; }
      .po-line app-line-tax-fields, .po-line-meta { padding-left: 0; }
      .po-sec-acts { margin-left: 0; width: 100%; }
      .po-sec-acts .btn { flex: 1; }
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

  readonly chargeTypes = CHARGE_TYPES;
  get chargesArray(): FormArray {
    return this.taxGroup.get('charges') as FormArray;
  }
  addCharge() {
    this.chargesArray.push(chargeGroup(this.fb));
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

  /** Status filter segments (display only) */
  readonly poFilters = [
    { v: 'all', k: 'purchaseOrders.filter.all' },
    { v: 'Draft', k: 'purchaseOrders.filter.draft' },
    { v: 'Sent', k: 'purchaseOrders.filter.sent' },
    { v: 'Received', k: 'purchaseOrders.filter.received' },
    { v: 'Cancelled', k: 'purchaseOrders.filter.cancelled' },
  ];
  private statusCounts = computed(() => {
    const m: Record<string, number> = { all: this.orders().length };
    for (const o of this.orders()) m[o.status] = (m[o.status] || 0) + 1;
    return m;
  });
  statusCount(v: string): number {
    return this.statusCounts()[v] || 0;
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
    return `PO-${clean.toUpperCase()}`;
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
