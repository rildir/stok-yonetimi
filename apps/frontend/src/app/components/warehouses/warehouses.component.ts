import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs';
import { Warehouse, StockLot, SerialNumber, TrackingType } from '../../models/inventory.models';
import { AppStateService } from '../../services/app-state.service';

type WarehouseStockItem = { productId: string; productName: string; sku: string; quantity: number };
import { I18nService, TranslatePipe, MoneyPipe, NumberFormatPipe } from '../../i18n';
import { AddressFieldsComponent, addressFromForm, addressToForm, createAddressGroup } from '../shared/address-fields.component';
import { QuantityInputDirective, productDecimals } from '../shared/quantity-input.directive';
import { WAREHOUSE_OWNERSHIPS, WAREHOUSE_TYPES, warehouseTypeAllowsSale, transferNeedsDespatch, isValidDriverTckn, isValidTrPlate } from '@stok/tr-compliance';
import { DocumentsService, nowLocalInput } from '../../services/documents.service';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-warehouses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, MoneyPipe, NumberFormatPipe, AddressFieldsComponent, QuantityInputDirective, IconComponent],
  styleUrls: ['../../drawer.css'],
  host: { '(document:keydown.escape)': 'onEscape()', '(document:click)': 'menuFor.set(null)' },
  styles: [`
    .sec { color: var(--fg-3); }
    .wh-kpis { margin-bottom: 20px; }
    .wh-kpis .kpi-top app-icon { color: var(--fg-3); }
    .wh-tools { margin-bottom: 12px; }
    .wh-search { flex: 1 1 260px; max-width: 340px; }
    .wh-count { font-size: var(--text-xs); color: var(--fg-3); }
    .wh-skel { display: grid; gap: 14px; }
    .wh-table tbody tr { cursor: pointer; }
    .wh-name { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
    .wh-name b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .wh-name .badge { margin-left: 0; flex: none; }
    .wh-table td.td-primary { max-width: none; }
    .wh-table td.wh-addr { max-width: 240px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; }
    .wh-table td.r b { font-weight: 500; }
    .wh-acts { width: 1%; white-space: nowrap; }
    .wh-acts .btn + .btn { margin-left: 0; }
    .wh-del:not(:disabled):hover, .wh-del:not(:disabled):hover svg { color: var(--danger); }
    .wh-del:not(:disabled):hover { background: var(--danger-soft); }
    /* hover-revealed row actions: disabled ones too (the global disabled recipe resets opacity) */
    .wh-acts .row-act:disabled { opacity: 0; }
    .wh-table tr:hover .row-act:disabled, .wh-table tr:focus-within .row-act:disabled { opacity: 1; }
    @media (pointer: coarse) { .wh-acts .row-act:disabled { opacity: 1; } }
    .wh-mlist { display: none; }

    /* drawers */
    .drawer-body > * { flex-shrink: 0; }
    .drawer-form { flex: 1; min-height: 0; gap: 0; }
    .drawer-form .drawer-body { gap: 0; }
    .wh-checks { display: flex; flex-direction: column; gap: 10px; }
    .wh-stock { border-radius: var(--radius-md); box-shadow: 0 0 0 1px var(--line); overflow: hidden; }
    .wh-stock td { max-width: 240px; }
    .wh-stock td .cell-code { margin-left: 8px; }
    .wh-stock-sum { display: flex; align-items: baseline; gap: 16px; font-size: var(--text-xs); color: var(--fg-3); }
    .wh-stock-sum b { color: var(--fg); font-size: var(--text-sm); font-weight: 600; margin-right: 4px; font-variant-numeric: tabular-nums; }
    .wh-skel-d { display: grid; gap: 14px; padding-top: 8px; }
    .serial-list { max-height: 200px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .serial-list .check { font-size: var(--text-sm); align-items: center; }
    .serial-list .mono { font-size: var(--text-xs); }
    .wh-avail { margin-left: auto; font-weight: 400; color: var(--fg-3); font-variant-numeric: tabular-nums; }
    @media (max-width: 640px) {
      .wh-search { flex: 1 1 100%; max-width: none; }
      .wh-search kbd { display: none; }
      .wh-count { display: none; }
      .wh-kpis .kpi:last-child { grid-column: 1 / -1; }
      .table-scroll:has(.wh-table) { display: none; }
      .wh-mlist { display: block; }
      .wh-mrow { grid-template-columns: auto minmax(0, 1fr) auto auto; cursor: pointer; }
      .wh-mrow .thumb { grid-row: 1 / span 2; }
      .wh-m-meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .wh-m-meta .badge { margin-left: 0; flex: none; }
      .wh-m-txt { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .wh-mrow .s.r { white-space: nowrap; }
      .wh-m-act { grid-column: 4; grid-row: 1 / span 2; position: relative; margin-right: -6px; }
      .wh-pop { top: calc(100% + 4px); right: 0; min-width: 200px; }
      .wh-stock .hide-xs { display: none; }
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'warehouses.title' | t }}</h1>
        <p>{{ 'warehouses.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-primary" (click)="openDrawer()"><app-icon name="plus" />{{ 'warehouses.new' | t }}</button>
      </div>
    </header>

    <div class="kpi-grid wh-kpis">
      <div class="kpi">
        <div class="kpi-top"><app-icon name="warehouse" size="sm" />{{ 'warehouses.totalWarehouses' | t }}</div>
        <div class="kpi-val"><b>{{ totalWarehouseCount() | num }}</b></div>
      </div>
      <div class="kpi">
        <div class="kpi-top"><app-icon name="box" size="sm" />{{ 'warehouses.totalStock' | t }}</div>
        <div class="kpi-val"><b>{{ totalStockCount() | num }}</b></div>
      </div>
      <div class="kpi">
        <div class="kpi-top"><app-icon name="chart" size="sm" />{{ 'warehouses.totalValue' | t }}</div>
        <div class="kpi-val"><b class="truncate">{{ totalStockValue() | money }}</b></div>
      </div>
    </div>

    <div class="toolbar wh-tools">
      <div class="field field-sm wh-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="text" data-page-search [placeholder]="'warehouses.searchPlaceholder' | t" [attr.aria-label]="'common.search' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
        <span class="trail"><kbd>/</kbd></span>
      </div>
      <span class="spacer"></span>
      @if (!isLoading() && warehouses().length) { <span class="wh-count">{{ filteredWarehouses().length | num }} / {{ warehouses().length | num }}</span> }
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="card-b wh-skel">@for (i of [1, 2, 3, 4]; track i) { <div class="skeleton-row"></div> }</div>
      } @else if (warehouses().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="warehouse" /></div>
          <h3>{{ 'warehouses.empty' | t }}</h3>
          <div class="actions"><button type="button" class="btn btn-primary" (click)="openDrawer()"><app-icon name="plus" />{{ 'warehouses.addFirst' | t }}</button></div>
        </div>
      } @else if (filteredWarehouses().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="search" /></div>
          <h3>{{ 'warehouses.noResults' | t }}</h3>
          <div class="actions"><button type="button" class="btn btn-sm" (click)="searchQuery.set('')"><app-icon name="x" size="sm" />{{ 'common.clear' | t }}</button></div>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive wh-table">
            <thead>
              <tr>
                <th>{{ 'warehouses.col.name' | t }}</th>
                <th>{{ 'warehouses.col.code' | t }}</th>
                <th>{{ 'warehouses.col.address' | t }}</th>
                <th class="r">{{ 'warehouses.col.productCount' | t }}</th>
                <th class="r">{{ 'warehouses.col.totalStock' | t }}</th>
                <th class="r">{{ 'warehouses.col.totalValue' | t }}</th>
                <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (w of filteredWarehouses(); track w.id) {
                <tr (click)="goToWarehouseProducts(w)">
                  <td class="td-primary">
                    <span class="wh-name">
                      <b [title]="w.name">{{ w.name }}</b>
                      <ng-container *ngTemplateOutlet="whBadges; context: { $implicit: w }"></ng-container>
                    </span>
                  </td>
                  <td class="mono" [attr.data-label]="'warehouses.col.code' | t">{{ w.code }}</td>
                  <td class="wh-addr" [attr.data-label]="'warehouses.col.address' | t" [title]="w.addressText || ''">{{ w.addressText || '—' }}</td>
                  <td class="r" [attr.data-label]="'warehouses.col.productCount' | t">
                    @if (w.productCount === 0) { <span class="sec" [title]="'warehouses.noProductsAssigned' | t">—</span> } @else { {{ w.productCount | num }} }
                  </td>
                  <td class="r" [attr.data-label]="'warehouses.col.totalStock' | t">
                    @if (w.totalStock === 0) { <span class="sec" [title]="'warehouses.noProductsAssigned' | t">—</span> } @else { <b>{{ w.totalStock | num }}</b> }
                  </td>
                  <td class="r" [attr.data-label]="'warehouses.col.totalValue' | t"><b>{{ w.totalValue | money }}</b></td>
                  <td class="td-actions wh-acts" (click)="$event.stopPropagation()">
                    <button type="button" class="btn btn-ghost btn-sm btn-icon row-act" data-act="stock" [title]="'warehouses.stock.view' | t" [attr.aria-label]="'warehouses.stock.view' | t" (click)="openStock(w); $event.stopPropagation()"><app-icon name="box" /></button>
                    <button type="button" class="btn btn-ghost btn-sm btn-icon row-act" data-act="transfer" [title]="'warehouses.transfer.action' | t" [attr.aria-label]="'warehouses.transfer.action' | t" (click)="openTransfer(w); $event.stopPropagation()" [disabled]="!w.totalStock || warehouses().length < 2"><app-icon name="swap" /></button>
                    <button type="button" class="btn btn-ghost btn-sm btn-icon row-act" [title]="'common.edit' | t" [attr.aria-label]="'common.edit' | t" (click)="openDrawer(w); $event.stopPropagation()"><app-icon name="edit" /></button>
                    <button type="button" class="btn btn-ghost btn-sm btn-icon row-act wh-del" [title]="'common.delete' | t" [attr.aria-label]="'common.delete' | t" (click)="deleteWarehouse(w); $event.stopPropagation()" [disabled]="(w.totalStock ?? 0) > 0"><app-icon name="trash" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Mobile: one compact row per warehouse -->
        <div class="wh-mlist" role="list">
          @for (w of filteredWarehouses(); track w.id) {
            <div class="mrow wh-mrow" role="listitem" (click)="goToWarehouseProducts(w)">
              <span class="thumb"><app-icon name="warehouse" size="sm" /></span>
              <b [title]="w.name">{{ w.name }}</b>
              <span class="v">{{ w.totalValue | money }}</span>
              <span class="s wh-m-meta"><ng-container *ngTemplateOutlet="whBadges; context: { $implicit: w, compact: true }"></ng-container><span class="wh-m-txt"><span class="mono">{{ w.code }}</span>@if (w.addressText) { · {{ w.addressText }} }</span></span>
              <span class="s r" [title]="('warehouses.col.productCount' | t) + ': ' + (w.productCount | num)">{{ 'warehouses.m.stockLine' | t: { qty: (w.totalStock | num), count: (w.productCount | num) } }}</span>
              <span class="wh-m-act" (click)="$event.stopPropagation()">
                <button type="button" class="btn btn-ghost btn-sm btn-icon" aria-haspopup="menu" [attr.aria-expanded]="menuFor() === w.id" [attr.aria-label]="'warehouses.rowActions' | t: { name: w.name }" (click)="menuFor.set(menuFor() === w.id ? null : w.id); $event.stopPropagation()"><app-icon name="more" /></button>
                @if (menuFor() === w.id) {
                  <div class="pop wh-pop" role="menu">
                    <button type="button" class="menu-i" role="menuitem" (click)="menuFor.set(null); openStock(w)"><app-icon name="box" />{{ 'warehouses.stock.view' | t }}</button>
                    <button type="button" class="menu-i" role="menuitem" [disabled]="!w.totalStock || warehouses().length < 2" (click)="menuFor.set(null); openTransfer(w)"><app-icon name="swap" />{{ 'warehouses.transfer.action' | t }}</button>
                    <button type="button" class="menu-i" role="menuitem" (click)="menuFor.set(null); openDrawer(w)"><app-icon name="edit" />{{ 'common.edit' | t }}</button>
                    <div class="menu-sep"></div>
                    <button type="button" class="menu-i danger" role="menuitem" [disabled]="(w.totalStock ?? 0) > 0" (click)="menuFor.set(null); deleteWarehouse(w)"><app-icon name="trash" />{{ 'common.delete' | t }}</button>
                  </div>
                }
              </span>
            </div>
          }
        </div>
      }
    </div>

    <ng-template #whBadges let-w let-compact="compact">
      @if (w.isDefault) { <span class="badge badge-info" [title]="'warehouses.defaultHint' | t">{{ 'warehouses.default' | t }}</span> }
      @if (w.type && w.type !== 'NORMAL') { <span class="badge" [class.badge-warning]="w.type === 'QUARANTINE'" [class.badge-info]="w.type !== 'QUARANTINE'" [title]="'warehouses.notSellableHint' | t"><span class="dot"></span>{{ 'warehouses.type.' + w.type | t }}</span> }
      @else if (w.isSellable === false) { <span class="badge badge-neutral" [title]="'warehouses.notSellableHint' | t">{{ 'warehouses.notSellable' | t }}</span> }
      @if (!compact && w.ownership && w.ownership !== 'OWN') { <span class="badge badge-neutral">{{ 'warehouses.ownership.' + w.ownership | t }}</span> }
      @if (!compact && w.isBranch) { <span class="badge badge-neutral">{{ 'warehouses.branch' | t }}@if (w.branchCode) { · <span class="mono">{{ w.branchCode }}</span> }</span> }
    </ng-template>

    <!-- Warehouse form drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" role="dialog" aria-modal="true" [attr.aria-label]="(editId() ? 'warehouses.editTitle' : 'warehouses.addTitle') | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editId() ? 'warehouses.editTitle' : 'warehouses.addTitle') | t }}</span>
            <button type="button" class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>

          <form [formGroup]="warehouseForm" (ngSubmit)="saveWarehouse()" class="drawer-form">
            <div class="drawer-body">
              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'documents.section.general' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="warehouseName">{{ 'warehouses.form.name' | t }} <span class="req">*</span></label>
                    <div class="field"><input id="warehouseName" type="text" formControlName="name" [attr.aria-invalid]="isFieldInvalid('name')" [disabled]="isSaving()" /></div>
                    @if (isFieldInvalid('name')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'warehouses.form.nameRequired' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="warehouseCode">{{ 'warehouses.form.code' | t }} <span class="req">*</span></label>
                    <div class="field"><input id="warehouseCode" type="text" class="mono" formControlName="code" [attr.aria-invalid]="isFieldInvalid('code')" [disabled]="isSaving()" /></div>
                    @if (isFieldInvalid('code')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'warehouses.form.codeRequired' | t }}</div> }
                  </div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'warehouses.col.address' | t }}</h3></div>
                <app-address-fields [group]="addressGroup" idPrefix="wh"></app-address-fields>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">3</span><h3>{{ 'warehouses.section.inventory' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="whType">{{ 'warehouses.form.type' | t }}</label>
                    <div class="field select">
                      <select id="whType" formControlName="type" (change)="onTypeChange()">
                        @for (t of warehouseTypes; track t) { <option [value]="t">{{ 'warehouses.type.' + t | t }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="whOwnership">{{ 'warehouses.form.ownership' | t }}</label>
                    <div class="field select">
                      <select id="whOwnership" formControlName="ownership">
                        @for (o of ownerships; track o) { <option [value]="o">{{ 'warehouses.ownership.' + o | t }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
                <label class="check" [class.is-disabled]="warehouseForm.get('isSellable')?.disabled">
                  <input type="checkbox" formControlName="isSellable" />
                  <span>{{ 'warehouses.form.isSellable' | t }}<span class="sub">{{ ('warehouses.typeHint.' + (warehouseForm.get('type')?.value || 'NORMAL')) | t }}</span></span>
                </label>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">4</span><h3>{{ 'warehouses.section.legal' | t }}</h3></div>
                <label class="check"><input type="checkbox" formControlName="isBranch" /><span>{{ 'warehouses.form.isBranch' | t }}</span></label>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="whBranchCode">{{ 'warehouses.form.branchCode' | t }}</label>
                    <div class="field"><input id="whBranchCode" type="text" class="mono" formControlName="branchCode" maxlength="20" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="whSeries">{{ 'warehouses.form.defaultSeries' | t }}</label>
                    <div class="field"><input id="whSeries" type="text" class="mono" formControlName="defaultSeries" maxlength="3" (input)="upperSeries($event)" [attr.aria-invalid]="isFieldInvalid('defaultSeries')" /></div>
                    @if (isFieldInvalid('defaultSeries')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'warehouses.form.seriesInvalid' | t }}</div> }
                  </div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="whSiteGroup">{{ 'warehouses.form.siteGroup' | t }}</label>
                  <div class="field"><input id="whSiteGroup" type="text" formControlName="siteGroup" maxlength="50" /></div>
                  <div class="fld-help">{{ 'warehouses.form.siteGroupHint' | t }}</div>
                </div>
              </section>
            </div>

            <div class="drawer-footer">
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSaving()" [disabled]="warehouseForm.invalid || isSaving()"><span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd></button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Stock drawer -->
    @if (stockWarehouse(); as sw) {
      <div class="drawer-overlay" (click)="closeStock()">
        <div class="drawer-panel" role="dialog" aria-modal="true" [attr.aria-label]="'warehouses.stock.title' | t: { name: sw.name }" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'warehouses.stock.title' | t: { name: sw.name } }}</span>
            <button type="button" class="drawer-close" (click)="closeStock()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            @if (stockLoading()) {
              <div class="wh-skel-d">@for (i of [1, 2, 3, 4]; track i) { <div class="skeleton-row"></div> }</div>
            } @else if (stockItems().length === 0) {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="box" /></div>
                <h3>{{ 'warehouses.stock.empty' | t }}</h3>
              </div>
            } @else {
              <div class="wh-stock-sum">
                <span><b>{{ stockItems().length | num }}</b>{{ 'warehouses.col.productCount' | t }}</span>
                <span><b>{{ sw.totalStock | num }}</b>{{ 'warehouses.col.totalStock' | t }}</span>
                <span><b>{{ sw.totalValue | money }}</b>{{ 'warehouses.col.totalValue' | t }}</span>
              </div>
              <div class="wh-stock">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>{{ 'warehouses.stock.product' | t }}</th>
                      <th class="hide-xs">{{ 'warehouses.stock.sku' | t }}</th>
                      <th class="r">{{ 'warehouses.stock.quantity' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (it of stockItems(); track it.productId) {
                      <tr>
                        <td [title]="it.productName">{{ it.productName }}</td>
                        <td class="mono sec hide-xs">{{ it.sku }}</td>
                        <td class="r"><b>{{ it.quantity | num }}</b></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="closeStock()">{{ 'warehouses.close' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="openTransfer(sw)" [disabled]="!hasTransferable(stockItems()) || warehouses().length < 2"><app-icon name="swap" />{{ 'warehouses.transfer.action' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Transfer drawer -->
    @if (transferSource(); as src) {
      <div class="drawer-overlay" (click)="closeTransfer()">
        <div class="drawer-panel" role="dialog" aria-modal="true" [attr.aria-label]="'warehouses.transfer.title' | t: { name: src.name }" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'warehouses.transfer.title' | t: { name: src.name } }}</span>
            <button type="button" class="drawer-close" (click)="closeTransfer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <form [formGroup]="transferForm" (ngSubmit)="submitTransfer()" class="drawer-form">
            <div class="drawer-body">
              @if (transferLoading()) {
                <div class="wh-skel-d">@for (i of [1, 2, 3]; track i) { <div class="skeleton-row"></div> }</div>
              } @else if (transferItems().length === 0) {
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="box" /></div>
                  <h3>{{ 'warehouses.transfer.noStock' | t }}</h3>
                </div>
              } @else {
                <section class="fsec">
                  <div class="fld">
                    <label class="fld-label" for="trProduct">{{ 'warehouses.transfer.product' | t }} <span class="req">*</span></label>
                    <div class="field select">
                      <select id="trProduct" formControlName="productId" (change)="onTransferProductChange()" [attr.aria-invalid]="isTransferInvalid('productId')">
                        <option value="" disabled>{{ 'warehouses.transfer.selectProduct' | t }}</option>
                        @for (it of transferItems(); track it.productId) {
                          <option [value]="it.productId">{{ it.productName }} ({{ it.sku }}) — {{ 'warehouses.transfer.available' | t: { qty: it.quantity } }}</option>
                        }
                      </select>
                    </div>
                    @if (isTransferInvalid('productId')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'warehouses.transfer.productRequired' | t }}</div> }
                  </div>

                  <div class="fld">
                    <label class="fld-label" for="trTarget">{{ 'warehouses.transfer.target' | t }} <span class="req">*</span></label>
                    <div class="field select">
                      <select id="trTarget" formControlName="toWarehouseId" [attr.aria-invalid]="isTransferInvalid('toWarehouseId')">
                        <option value="" disabled>{{ 'warehouses.transfer.selectTarget' | t }}</option>
                        @for (t of transferTargets(); track t.id) { <option [value]="t.id">{{ t.name }} ({{ t.code }})</option> }
                      </select>
                    </div>
                    @if (isTransferInvalid('toWarehouseId')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'warehouses.transfer.targetRequired' | t }}</div> }
                  </div>

                  @if (selectedTracking() === 'lot') {
                    <div class="fld">
                      <label class="fld-label" for="trLot">{{ 'warehouses.transfer.lot' | t }}</label>
                      <div class="field select">
                        <select id="trLot" [ngModel]="selectedLotId()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="onLotChange($event)">
                          <option value="">{{ 'warehouses.transfer.selectLot' | t }}</option>
                          @for (l of transferLots(); track l.id) {
                            <option [value]="l.id">{{ l.lotNumber }}{{ l.expiryDate ? ' · ' + l.expiryDate : '' }} — {{ 'warehouses.transfer.available' | t: { qty: l.quantity } }}</option>
                          }
                        </select>
                      </div>
                      @if (trackingLoading()) { <div class="fld-help">{{ 'common.loading' | t }}</div> }
                      @else if (transferLots().length === 0) { <div class="fld-help">{{ 'warehouses.transfer.noLots' | t }}</div> }
                      @else if (!selectedLotId()) { <div class="fld-help">{{ 'warehouses.transfer.lotAutoHint' | t }}</div> }
                    </div>
                  }
                  @if (selectedTracking() === 'serial') {
                    <div class="fld">
                      <span class="fld-label">{{ 'warehouses.transfer.serials' | t }}<span class="opt mono">{{ selectedSerials().size | num }}</span></span>
                      @if (trackingLoading()) {
                        <div class="fld-help">{{ 'common.loading' | t }}</div>
                      } @else if (transferSerials().length === 0) {
                        <div class="fld-help">{{ 'warehouses.transfer.noSerials' | t }}</div>
                      } @else {
                        <div class="serial-list">
                          @for (s of transferSerials(); track s.id) {
                            <label class="check"><input type="checkbox" [checked]="selectedSerials().has(s.serial)" (change)="toggleSerial(s.serial)" /><span class="mono">{{ s.serial }}</span></label>
                          }
                        </div>
                        <div class="fld-help">{{ 'warehouses.transfer.serialsHint' | t }}</div>
                      }
                    </div>
                  }

                  <div class="fld">
                    <label class="fld-label" for="trQty">{{ 'warehouses.transfer.quantity' | t }} <span class="req">*</span>
                      @if (selectedTransferItem()) { <span class="wh-avail">{{ 'warehouses.transfer.available' | t: { qty: availableQty() } }}</span> }
                    </label>
                    <div class="field"><input id="trQty" type="text" inputmode="decimal" class="num" appQty [qtyDecimals]="transferDecimals()" formControlName="quantity" [readonly]="selectedTracking() === 'serial'" [attr.aria-invalid]="isTransferInvalid('quantity')" /></div>
                    @if (isTransferInvalid('quantity')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'warehouses.transfer.quantityInvalid' | t: { max: availableQty() } }}</div> }
                  </div>

                  <div class="fld">
                    <label class="fld-label" for="trNote">{{ 'warehouses.transfer.note' | t }}</label>
                    <div class="field has-area"><textarea id="trNote" formControlName="note" rows="3"></textarea></div>
                  </div>
                </section>
                @if (needsDespatch()) {
                  <section class="fsec">
                    <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'warehouses.transfer.despatchRequired' | t }}</span></div>
                    <div class="grid-2">
                      <div class="fld span-2">
                        <label class="fld-label" for="trDespAt">{{ 'despatches.actualDespatchAt' | t }}</label>
                        <div class="field"><input id="trDespAt" type="datetime-local" [(ngModel)]="despAt" [ngModelOptions]="{ standalone: true }" /></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="trPlate">{{ 'despatches.plate' | t }}</label>
                        <div class="field"><input id="trPlate" class="mono" maxlength="20" placeholder="34 ABC 123" [(ngModel)]="despPlate" [ngModelOptions]="{ standalone: true }" /></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="trTckn">{{ 'despatches.driverTckn' | t }}</label>
                        <div class="field"><input id="trTckn" class="mono" maxlength="11" inputmode="numeric" [(ngModel)]="despTckn" [ngModelOptions]="{ standalone: true }" /></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="trFirst">{{ 'despatches.driverFirstName' | t }}</label>
                        <div class="field"><input id="trFirst" [(ngModel)]="despFirst" [ngModelOptions]="{ standalone: true }" /></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="trLast">{{ 'despatches.driverLastName' | t }}</label>
                        <div class="field"><input id="trLast" [(ngModel)]="despLast" [ngModelOptions]="{ standalone: true }" /></div>
                      </div>
                    </div>
                  </section>
                }
              }
              @if (transferError()) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ transferError() }}</div> }
            </div>
            <div class="drawer-footer">
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeTransfer()" [disabled]="isTransferring()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isTransferring()" [disabled]="transferForm.invalid || isTransferring() || transferItems().length === 0"><span>{{ 'warehouses.transfer.submit' | t }}</span><kbd>Ctrl ↵</kbd></button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class WarehousesComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);

  warehouses = signal<Warehouse[]>([]);

  // Stock view
  stockWarehouse = signal<Warehouse | null>(null);
  stockItems = signal<WarehouseStockItem[]>([]);
  stockLoading = signal(false);

  // Transfer
  transferSource = signal<Warehouse | null>(null);
  transferItems = signal<WarehouseStockItem[]>([]);
  transferLoading = signal(false);
  isTransferring = signal(false);
  transferError = signal<string | null>(null);
  selectedProductId = signal<string>('');
  transferTargets = computed(() => {
    const src = this.transferSource();
    return src ? this.warehouses().filter(w => w.id !== src.id) : [];
  });
  selectedTransferItem = computed(() => this.transferItems().find(i => i.productId === this.selectedProductId()) || null);
  appState = inject(AppStateService);
  transferLots = signal<StockLot[]>([]);
  transferSerials = signal<SerialNumber[]>([]);
  selectedLotId = signal<string>('');
  selectedSerials = signal<Set<string>>(new Set());
  trackingLoading = signal(false);
  selectedTracking = computed<TrackingType>(() => {
    const id = this.selectedProductId();
    return (this.appState.products().find(p => p.id === id)?.trackingType as TrackingType) || 'none';
  });
  /** Precision of the selected product's base unit (kg: 3, pcs: 0). */
  transferDecimals = computed(() => productDecimals(this.appState.products().find(p => p.id === this.selectedProductId())));
  availableQty = computed(() => {
    if (this.selectedTracking() === 'lot' && this.selectedLotId()) {
      return this.transferLots().find(l => l.id === this.selectedLotId())?.quantity ?? 0;
    }
    return this.selectedTransferItem()?.quantity ?? 0;
  });

  transferForm: FormGroup = this.fb.group({
    productId: ['', Validators.required],
    toWarehouseId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(0.0001)]],
    note: ['']
  });
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  editId = signal<string | null>(null);
 
  searchQuery = signal('');
  /** Mobile row overflow menu (warehouse id). */
  menuFor = signal<string | null>(null);

  totalWarehouseCount = computed(() => {
    return this.warehouses().length;
  });

  totalStockCount = computed(() => {
    return this.warehouses().reduce((sum, w) => sum + (w.totalStock || 0), 0);
  });

  totalStockValue = computed(() => {
    return this.warehouses().reduce((sum, w) => sum + (w.totalValue || 0), 0);
  });

  goToWarehouseProducts(w: any) {
    this.router.navigate(['/products'], { queryParams: { warehouse: w.name } });
  }

  filteredWarehouses = computed(() => {
    const list = this.warehouses();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(w => 
      (w.name && w.name.toLowerCase().includes(query)) ||
      (w.code && w.code.toLowerCase().includes(query))
    );
  });

  addressGroup: FormGroup = createAddressGroup(this.fb);
  warehouseForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    address: this.addressGroup,
    isBranch: [false],
    branchCode: [''],
    siteGroup: [''],
    defaultSeries: ['', [Validators.pattern(/^[A-Z0-9]{3}$/)]],
    type: ['NORMAL'],
    isSellable: [true],
    ownership: ['OWN'],
  });
  readonly warehouseTypes = WAREHOUSE_TYPES;
  readonly ownerships = WAREHOUSE_OWNERSHIPS;

  /** Quarantine and in-transit stock is never sellable. */
  onTypeChange() {
    const type = this.warehouseForm.get('type')?.value;
    const sellable = this.warehouseForm.get('isSellable')!;
    if (!warehouseTypeAllowsSale(type)) {
      sellable.setValue(false);
      sellable.disable();
    } else {
      sellable.enable();
    }
  }

  upperSeries(event: Event) {
    const input = event.target as HTMLInputElement;
    const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    input.value = v;
    this.warehouseForm.get('defaultSeries')?.setValue(v);
  }

  hasValue(fieldName: string): boolean {
    const val = this.warehouseForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.warehouseForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  /** Esc closes the topmost drawer. */
  onEscape() {
    if (this.menuFor()) this.menuFor.set(null);
    else if (this.transferSource()) this.closeTransfer();
    else if (this.stockWarehouse()) this.closeStock();
    else if (this.isDrawerOpen()) this.closeDrawer();
  }

  ngOnInit() {
    this.loadWarehouses();
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
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

  loadWarehouses() {
    this.isLoading.set(true);
    this.inventory.getWarehouses().subscribe({
      next: (data) => {
        this.warehouses.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.ui.showToast(this.i18n.t('warehouses.loadError'), 'error');
      }
    });
  }

  openDrawer(warehouse?: any) {
    const country = this.ui.userProfile()?.company?.country || 'TR';
    if (warehouse) {
      this.editId.set(warehouse.id);
      this.warehouseForm.reset({
        name: warehouse.name,
        code: warehouse.code,
        address: addressToForm(warehouse.address, country),
        isBranch: !!warehouse.isBranch,
        branchCode: warehouse.branchCode || '',
        siteGroup: warehouse.siteGroup || '',
        defaultSeries: warehouse.defaultSeries || '',
        type: warehouse.type || 'NORMAL',
        isSellable: warehouse.isSellable !== false,
        ownership: warehouse.ownership || 'OWN',
      });
    } else {
      this.editId.set(null);
      this.warehouseForm.reset({ name: '', code: '', address: addressToForm(null, country), isBranch: false, branchCode: '', siteGroup: '', defaultSeries: '', type: 'NORMAL', isSellable: true, ownership: 'OWN' });
    }
    this.onTypeChange();
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.warehouseForm.reset();
    this.editId.set(null);
  }

  saveWarehouse() {
    if (this.warehouseForm.invalid) {
      this.warehouseForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const raw = this.warehouseForm.value;
    const data: any = {
      name: raw.name,
      code: raw.code,
      address: addressFromForm(raw.address),
      isBranch: !!raw.isBranch,
      branchCode: raw.branchCode?.trim() || null,
      siteGroup: raw.siteGroup?.trim() || null,
      defaultSeries: raw.defaultSeries || null,
      type: raw.type || 'NORMAL',
      isSellable: warehouseTypeAllowsSale(raw.type) && this.warehouseForm.getRawValue().isSellable !== false,
      ownership: raw.ownership || 'OWN',
    };
    const id = this.editId();

    const req = id ? this.inventory.updateWarehouse(id, data) : this.inventory.createWarehouse(data);

    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadWarehouses();
        this.ui.showToast(this.i18n.t(id ? 'warehouses.updated' : 'warehouses.created'), 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('warehouses.saveError'), 'error');
      }
    });
  }

  deleteWarehouse(warehouse: any) {
    if (warehouse.totalStock > 0) {
      this.ui.showToast(this.i18n.t('warehouses.cannotDeleteWithStock'), 'error');
      return;
    }
    
    this.ui.openConfirm({
      title: this.i18n.t('warehouses.deleteTitle'),
      message: this.i18n.t('warehouses.deleteMessage', { name: warehouse.name }),
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deleteWarehouse(warehouse.id).pipe(
          tap({
            next: () => {
              this.loadWarehouses();
              this.ui.showToast(this.i18n.t('warehouses.deleted'), 'success');
            },
            error: (err) => {
              this.ui.showToast(err.error?.message || this.i18n.t('warehouses.deleteError'), 'error');
            }
          })
        );
      }
    });
  }

  hasTransferable(items: WarehouseStockItem[]): boolean {
    return items.some(i => i.quantity > 0);
  }

  openStock(w: Warehouse) {
    this.stockWarehouse.set(w);
    this.stockItems.set([]);
    this.stockLoading.set(true);
    this.inventory.getWarehouseStock(w.id).subscribe({
      next: (items) => {
        this.stockItems.set(items || []);
        this.stockLoading.set(false);
      },
      error: (err) => {
        this.stockLoading.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('warehouses.stock.loadError'), 'error');
      }
    });
  }

  closeStock() {
    this.stockWarehouse.set(null);
    this.stockItems.set([]);
  }

  openTransfer(w: Warehouse) {
    this.closeStock();
    this.transferSource.set(w);
    this.transferError.set(null);
    this.transferItems.set([]);
    this.selectedProductId.set('');
    const others = this.warehouses().filter(x => x.id !== w.id);
    const defaultTarget = others.find(x => x.isDefault) || others[0];
    this.transferForm.reset({ productId: '', toWarehouseId: defaultTarget?.id || '', quantity: 1, note: '' });
    this.transferLoading.set(true);
    this.inventory.getWarehouseStock(w.id).subscribe({
      next: (items) => {
        this.transferItems.set((items || []).filter(i => i.quantity > 0));
        this.transferLoading.set(false);
      },
      error: (err) => {
        this.transferLoading.set(false);
        this.transferError.set(err.error?.message || this.i18n.t('warehouses.stock.loadError'));
      }
    });
  }

  closeTransfer() {
    if (this.isTransferring()) return;
    this.transferSource.set(null);
    this.transferItems.set([]);
    this.transferError.set(null);
  }

  onTransferProductChange() {
    this.selectedProductId.set(this.transferForm.get('productId')?.value || '');
    this.transferLots.set([]);
    this.transferSerials.set([]);
    this.selectedLotId.set('');
    this.selectedSerials.set(new Set());
    const src = this.transferSource();
    const productId = this.selectedProductId();
    const tracking = this.selectedTracking();
    if (src && productId && tracking === 'lot') {
      this.trackingLoading.set(true);
      this.inventory.getProductLots(productId, src.id).subscribe({
        next: (lots) => { this.transferLots.set((lots || []).filter(l => l.quantity > 0)); this.trackingLoading.set(false); },
        error: () => this.trackingLoading.set(false)
      });
    } else if (src && productId && tracking === 'serial') {
      this.trackingLoading.set(true);
      this.inventory.getProductSerials(productId, 'in_stock', src.id).subscribe({
        next: (serials) => { this.transferSerials.set(serials || []); this.trackingLoading.set(false); },
        error: () => this.trackingLoading.set(false)
      });
      this.transferForm.get('quantity')!.setValue(0);
    }
    this.applyQtyMax();
  }

  onLotChange(lotId: string) {
    this.selectedLotId.set(lotId || '');
    this.applyQtyMax();
  }

  toggleSerial(serial: string) {
    const next = new Set(this.selectedSerials());
    if (next.has(serial)) next.delete(serial); else next.add(serial);
    this.selectedSerials.set(next);
    const qtyCtrl = this.transferForm.get('quantity')!;
    qtyCtrl.setValue(next.size);
    qtyCtrl.markAsTouched();
  }

  private applyQtyMax() {
    const max = this.availableQty();
    const qtyCtrl = this.transferForm.get('quantity')!;
    qtyCtrl.setValidators([Validators.required, Validators.min(0.0001), Validators.max(max)]);
    if (qtyCtrl.value > max) qtyCtrl.setValue(max);
    qtyCtrl.updateValueAndValidity();
  }

  isTransferInvalid(field: string): boolean {
    const c = this.transferForm.get(field);
    return c ? (c.invalid && (c.dirty || c.touched)) : false;
  }

  docs = inject(DocumentsService);
  despAt = nowLocalInput();
  despPlate = '';
  despFirst = '';
  despLast = '';
  despTckn = '';
  private transferTarget = signal<string>('');

  /** VUK 230/5: a transfer to other premises (different site group / address) travels with a despatch advice. */
  needsDespatch(): boolean {
    const src = this.transferSource();
    const to = this.warehouses().find((w) => w.id === (this.transferForm?.get('toWarehouseId')?.value || this.transferTarget()));
    return !!src && !!to && transferNeedsDespatch(src as any, to as any);
  }

  submitTransfer() {
    const src = this.transferSource();
    if (!src) return;
    if (this.needsDespatch()) return this.submitTransferDespatch();
    if (this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }
    const { productId, toWarehouseId, quantity, note } = this.transferForm.value;
    const qty = Number(quantity);
    if (!(qty > 0) || qty > this.availableQty()) {
      this.transferError.set(this.i18n.t('warehouses.transfer.quantityInvalid', { max: this.availableQty() }));
      return;
    }
    const tracking = this.selectedTracking();
    const lotId = tracking === 'lot' && this.selectedLotId() ? this.selectedLotId() : undefined;
    const serials = tracking === 'serial' ? [...this.selectedSerials()] : undefined;
    if (serials && serials.length !== qty) {
      this.transferError.set(this.i18n.t('warehouses.transfer.serialsMismatch'));
      return;
    }
    this.isTransferring.set(true);
    this.transferError.set(null);
    this.inventory.transferWarehouseStock(productId, src.id, toWarehouseId, qty, note?.trim() || undefined, lotId, serials).subscribe({
      next: () => {
        this.isTransferring.set(false);
        this.closeTransfer();
        this.loadWarehouses();
        this.ui.showToast(this.i18n.t('warehouses.transfer.success'), 'success');
      },
      error: (err) => {
        this.isTransferring.set(false);
        const msg = err.error?.message || this.i18n.t('warehouses.transfer.error');
        this.transferError.set(msg);
        this.ui.showToast(msg, 'error');
      }
    });
  }

  /** Transfer with a despatch advice: draft + approval (stock moves to the in-transit warehouse; received at the target later). */
  private submitTransferDespatch() {
    const src = this.transferSource();
    if (!src || this.transferForm.invalid) return this.transferForm.markAllAsTouched();
    const { productId, toWarehouseId, quantity, note } = this.transferForm.value;
    const qty = Number(quantity);
    if (!(qty > 0) || qty > this.availableQty()) return this.transferError.set(this.i18n.t('warehouses.transfer.quantityInvalid', { max: this.availableQty() }));
    if (this.despTckn && !isValidDriverTckn(this.despTckn.trim())) return this.transferError.set(this.i18n.t('despatches.driverTcknInvalid'));
    if (this.despPlate && !isValidTrPlate(this.despPlate)) return this.transferError.set(this.i18n.t('despatches.plateInvalid'));
    const tracking = this.selectedTracking();
    const lotId = tracking === 'lot' && this.selectedLotId() ? this.selectedLotId() : null;
    const serials = tracking === 'serial' ? [...this.selectedSerials()] : null;
    this.isTransferring.set(true);
    this.transferError.set(null);
    this.docs
      .createDespatch({
        purpose: 'TRANSFER',
        sourceWarehouseId: src.id,
        targetWarehouseId: toWarehouseId,
        actualDespatchAt: this.despAt || null,
        drivers: this.despTckn ? [{ firstName: this.despFirst.trim(), lastName: this.despLast.trim(), tckn: this.despTckn.trim() }] : [],
        plates: this.despPlate ? [{ plate: this.despPlate.trim(), type: 'TRUCK' }] : [],
        note: note?.trim() || null,
        lines: [{ productId, quantity: qty, lots: lotId ? [{ lotId, quantity: qty }] : null, serials }],
      })
      .subscribe({
        next: (d) =>
          this.docs.approveDespatch(d.id).subscribe({
            next: (a) => {
              this.isTransferring.set(false);
              this.closeTransfer();
              this.loadWarehouses();
              this.ui.showToast(this.i18n.t('warehouses.transfer.despatchDone', { number: a.documentNo }), 'success');
            },
            error: (err) => {
              this.isTransferring.set(false);
              this.transferError.set(err.error?.message || this.i18n.t('warehouses.transfer.error'));
            },
          }),
        error: (err) => {
          this.isTransferring.set(false);
          this.transferError.set(err.error?.message || this.i18n.t('warehouses.transfer.error'));
        },
      });
  }
}
