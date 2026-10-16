import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { AccountingService } from '../../services/accounting.service';
import { COUNT_TYPES } from '@stok/tr-compliance';
import { UiStateService } from '../../services/ui-state.service';
import { AppStateService } from '../../services/app-state.service';
import { I18nService, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe } from '../../i18n';
import { QuantityInputDirective } from '../shared/quantity-input.directive';
import { roundQty, sumQty } from '@stok/tr-compliance';
import { Unit } from '../../models/inventory.models';
import { BarcodeScannerComponent } from '../shared/barcode-scanner.component';
import { StockCount, StockCountItem } from '../../models/inventory.models';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-stock-count',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, BarcodeScannerComponent, QuantityInputDirective, IconComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .field.select { padding: 0; }
    .sc-active { margin-bottom: 20px; }
    .sc-active-h { flex-wrap: wrap; padding-top: 10px; padding-bottom: 10px; row-gap: 10px; }
    .sc-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sc-title-row { display: flex; align-items: center; gap: 8px; }
    .sc-title h3 { font-family: var(--font-mono); font-weight: 500; }
    .sc-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .sc-more { position: relative; display: inline-flex; }
    .sc-more-pop { right: 0; top: calc(100% + 6px); width: 220px; }
    .sc-more-pop .sc-m { display: none; }
    .sc-date input[type=date] { cursor: text; }
    .sc-date input[type=date]::-webkit-calendar-picker-indicator { display: none; }
    .sc-body { display: flex; flex-direction: column; gap: 16px; }
    .sc-tutanak { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); gap: 16px 14px; }
    .sc-progress { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .sc-progress-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: var(--text-sm); }
    .sc-progress-row b { font-weight: 500; }
    .sc-progress-row .pct { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-2); }
    .sc-progress .meter { height: 6px; }
    .sc-progress .meter > i { background: var(--accent); transition: width var(--dur-3) var(--ease-out); }
    .sc-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .sc-name b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
    .sc-name .badge { margin-left: 0; flex: none; }
    .sc-expand svg { transition: transform var(--dur-1) var(--ease-out); }
    .sc-expand.open svg { transform: rotate(90deg); }
    .sc-expand-spacer { display: inline-block; width: var(--h-xs); flex: none; }
    .sc-qty { width: 104px; margin-left: auto; }
    .sc-th-name { display: flex; align-items: center; gap: 8px; }
    .sc-active > .table-scroll { border-radius: 0 0 var(--radius-lg) var(--radius-lg); overflow-y: hidden; }
    .sc-table td.sc-name-cell { max-width: 420px; }
    .sc-table tr.sc-zero td { background: var(--warning-soft); }
    .sc-table tr.sc-hl td { background: var(--accent-soft); }
    .sc-table tr.sc-sub td { background: var(--surface-2); font-size: var(--text-xs); }
    .sc-table tr.sc-sub td.sc-indent { padding-left: 52px; }
    .sc-serial-missing { text-decoration: line-through; color: var(--danger); }
    .sc-diff { min-width: 36px; justify-content: center; font-variant-numeric: tabular-nums; }
    .sc-detail-table td:first-child { white-space: normal; max-width: none; }
    .sc-detail-table .sc-name { flex-wrap: wrap; }
    .sc-detail-table .sc-name b { overflow: visible; }
    .sc-hist .card-h .sub { font-variant-numeric: tabular-nums; }
    .sc-hist td.sc-notes-cell { max-width: 260px; }
    .sc-hist .td-actions .btn + .btn { margin-left: 4px; }
    .sc-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; margin: 0; }
    .sc-kv dt { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); }
    .sc-kv dd { margin: 3px 0 0; font-size: var(--text-sm); color: var(--fg); overflow-wrap: anywhere; }
    .sc-notes { padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); font-size: var(--text-sm); color: var(--fg-2); }
    .sc-section-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sc-modal-sum { display: flex; gap: 20px; margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); font-size: var(--text-xs); color: var(--fg-3); }
    .sc-modal-sum b { display: block; font-size: var(--text-md); font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; }
    @media (max-width: 640px) {
      .sc-actions { width: 100%; }
      .sc-actions .btn-primary { flex: 1; }
      .sc-actions .sc-sec { display: none; }
      .sc-more-pop { left: 0; right: auto; }
      .sc-more-pop .sc-m { display: flex; }
      .sc-more-pop div.sc-m { display: block; }
      .sc-kv { gap: 12px; }
      .sc-detail-table .hide-xs { display: none; }
      .sc-table td.sc-name-cell { max-width: none; }
      .sc-table tbody tr { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; }
      .sc-table tbody tr td { width: auto; overflow: visible; }
      .sc-table td.sc-name-cell, .sc-table td.sc-indent, .sc-table td.sc-c-full { grid-column: 1 / -1; }
      .sc-table td.sc-c-sku { grid-column: 1 / span 2; justify-content: flex-start; }
      .sc-table td.sc-c-unit { justify-content: flex-end; }
      .sc-table td.sc-c-sku::before, .sc-table td.sc-c-unit::before { display: none; }
      .sc-table td.sc-c-num { flex-direction: column; align-items: flex-end; justify-content: flex-start; gap: 2px; padding-top: 4px; }
      .sc-table td.sc-c-num .sc-qty { width: 100%; margin: 0; }
      .sc-table td.sc-c-full { justify-content: flex-start; gap: 8px; }
      .sc-table .sc-name { flex-wrap: wrap; }
      .sc-table tr.sc-sub { background: var(--surface-2); padding-left: 28px; }
      .sc-table tr.sc-sub td, .sc-table tr.sc-sub td.sc-indent { background: transparent; padding-left: 0; text-align: left; }
      .sc-table tr.sc-zero { background: var(--warning-soft); }
      .sc-table tr.sc-zero td { background: transparent; }
      .sc-hist .td-actions { justify-content: flex-start; }
      .sc-hist td.sc-notes-cell { max-width: none; }
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'stockCount.title' | t }}</h1>
        <p>{{ 'stockCount.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        @if (!activeCount()) {
          <button type="button" class="btn btn-primary" (click)="startNewCount()"><app-icon name="plus" />{{ 'stockCount.startNew' | t }}</button>
        }
      </div>
    </header>

    <!-- ─── Active In-Progress Count Session ─── -->
    @if (activeCount()) {
      <section class="card sc-active" [attr.aria-label]="activeCount()?.countNumber">
        <div class="card-h sc-active-h">
          <div class="sc-title">
            <div class="sc-title-row">
              <h3>{{ activeCount()?.countNumber }}</h3>
              <span class="badge badge-warning"><span class="dot"></span>{{ 'stockCount.status.inProgress' | t }}</span>
            </div>
            <span class="sub">{{ 'stockCount.startedAt' | t }} {{ activeCount()?.startedAt | appDate: 'datetime' }} · {{ 'stockCount.performedBy' | t }} {{ activeCount()?.performedBy }}</span>
          </div>
          <span class="spacer"></span>
          <div class="sc-actions">
            <button type="button" class="btn btn-sm sc-sec" (click)="showScanner.set(true)" [disabled]="isActionLoading()"><app-icon name="scan" />{{ 'stockCount.scan' | t }}</button>
            <button type="button" class="btn btn-sm sc-sec" (click)="saveDraft()" [disabled]="isActionLoading()">{{ 'stockCount.saveCount' | t }}</button>
            <span class="sc-more" (click)="$event.stopPropagation()">
              <button type="button" class="btn btn-sm btn-icon" [class.is-active]="moreOpen()" [attr.aria-label]="'stockCount.moreActions' | t" aria-haspopup="menu" [attr.aria-expanded]="moreOpen()" (click)="moreOpen.update(v => !v)" [disabled]="isActionLoading()"><app-icon name="more" /></button>
              @if (moreOpen()) {
                <div class="pop sc-more-pop" role="menu">
                  <button type="button" class="menu-i sc-m" role="menuitem" (click)="moreOpen.set(false); showScanner.set(true)"><app-icon name="scan" />{{ 'stockCount.scan' | t }}</button>
                  <button type="button" class="menu-i sc-m" role="menuitem" (click)="moreOpen.set(false); saveDraft()"><app-icon name="file" />{{ 'stockCount.saveCount' | t }}</button>
                  <div class="menu-sep sc-m"></div>
                  <button type="button" class="menu-i danger" role="menuitem" (click)="moreOpen.set(false); promptCancel()"><app-icon name="x" />{{ 'stockCount.cancelCount' | t }}</button>
                </div>
              }
            </span>
            <button type="button" class="btn btn-primary btn-sm" (click)="promptComplete()" [disabled]="isActionLoading()"><app-icon name="check" />{{ 'stockCount.completeCount' | t }}</button>
          </div>
        </div>

        <div class="card-b sc-body">
          <div class="sc-tutanak">
            <div class="fld">
              <label class="fld-label" for="scType">{{ 'stockCount.countType' | t }}</label>
              <div class="field select">
                <select id="scType" [(ngModel)]="header.countType" [disabled]="isActionLoading()">@for (ct of countTypes; track ct) { <option [value]="ct">{{ 'stockCount.countType.' + ct | t }}</option> }</select>
              </div>
            </div>
            <div class="fld">
              <label class="fld-label" for="scDate">{{ 'stockCount.countDate' | t }}</label>
              <div class="field sc-date"><span class="lead"><app-icon name="calendar" size="sm" /></span><input id="scDate" type="date" (click)="openPicker($event)" [(ngModel)]="header.countDate" [disabled]="isActionLoading()" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="scAsOf">{{ 'stockCount.asOfDate' | t }}</label>
              <div class="field sc-date"><span class="lead"><app-icon name="calendar" size="sm" /></span><input id="scAsOf" type="date" (click)="openPicker($event)" [(ngModel)]="header.asOfDate" [disabled]="isActionLoading()" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="scTeam">{{ 'stockCount.countedBy' | t }}</label>
              <div class="field"><span class="lead"><app-icon name="users" size="sm" /></span><input id="scTeam" [(ngModel)]="header.countedByText" [placeholder]="'stockCount.countedByHint' | t" [disabled]="isActionLoading()" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="scSup">{{ 'stockCount.supervisedBy' | t }}</label>
              <div class="field"><span class="lead"><app-icon name="user" size="sm" /></span><input id="scSup" [(ngModel)]="header.supervisedBy" [disabled]="isActionLoading()" /></div>
            </div>
          </div>
          <div class="fld-help">{{ 'stockCount.tutanakHint' | t }}</div>

          <div class="fld">
            <label class="fld-label" for="countNotes">{{ 'stockCount.notes' | t }}<span class="opt">{{ 'stockCount.ui.optional' | t }}</span></label>
            <div class="field"><input id="countNotes" type="text" [(ngModel)]="activeNotes" [placeholder]="'stockCount.notesPlaceholder' | t" [disabled]="isActionLoading()" /></div>
          </div>

          <div class="sc-progress" role="group" [attr.aria-label]="'stockCount.progress' | t: { counted: countedItemsCount(), total: totalItemsCount() }">
            <div class="sc-progress-row">
              <b>{{ 'stockCount.progress' | t: { counted: countedItemsCount(), total: totalItemsCount() } }}</b>
              <span class="pct">{{ 'stockCount.ui.pct' | t: { value: progressPercentage() } }}</span>
            </div>
            <div class="meter" role="progressbar" [attr.aria-valuenow]="progressPercentage()" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="progressPercentage()"></i></div>
          </div>
        </div>

        <div class="table-scroll">
          <table class="tbl table-responsive sc-table">
            <thead>
              <tr>
                <th><span class="sc-th-name"><span class="sc-expand-spacer d-only" aria-hidden="true"></span>{{ 'stockCount.col.productName' | t }}</span></th>
                <th>{{ 'stockCount.col.sku' | t }}</th>
                <th>{{ 'stockCount.col.unit' | t }}</th>
                <th class="r">{{ 'stockCount.col.systemStock' | t }}</th>
                <th class="r">{{ 'stockCount.col.countedStock' | t }}</th>
                <th class="r">{{ 'stockCount.col.difference' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of activeItems(); track item.productId) {
                <tr [id]="'sc-row-' + item.productId" [class.sc-zero]="item.systemQuantity === 0" [class.sc-hl]="highlightedId() === item.productId">
                  <td class="td-primary sc-name-cell">
                    <div class="sc-name">
                      @if (isTracked(item)) {
                        <button type="button" class="btn btn-ghost btn-xs btn-icon sc-expand" [class.open]="expanded().has(item.productId)" (click)="toggleExpand(item.productId)" [attr.aria-label]="'stockCount.toggleDetails' | t" [attr.aria-expanded]="expanded().has(item.productId)"><app-icon name="chevr" size="sm" /></button>
                      } @else {
                        <span class="sc-expand-spacer d-only"></span>
                      }
                      <b>{{ item.productName }}</b>
                      @if (item.trackingType === 'lot') { <span class="badge badge-neutral">{{ 'stockCount.lotTracked' | t }}</span> }
                      @if (item.trackingType === 'serial') { <span class="badge badge-neutral">{{ 'stockCount.serialTracked' | t }}</span> }
                      @if (item.systemQuantity === 0) { <span class="badge badge-warning"><app-icon name="warn" size="xs" />{{ 'stockCount.noSystemStock' | t }}</span> }
                    </div>
                  </td>
                  <td class="mono sec sc-c-sku" [attr.data-label]="'stockCount.col.sku' | t">{{ item.sku }}</td>
                  <td class="sec sc-c-unit" [attr.data-label]="'stockCount.col.unit' | t">{{ item.unit ? (item.unit | unitLabel) : ('stockCount.defaultUnit' | t) }}</td>
                  <td class="r sc-c-num" [attr.data-label]="'stockCount.col.systemStock' | t">{{ item.systemQuantity | num }}</td>
                  <td class="r sc-c-num" [attr.data-label]="'stockCount.col.countedStock' | t">
                    @if (isTracked(item)) {
                      <span [title]="'stockCount.trackedSumHint' | t">{{ item.countedQuantity | num }}</span>
                    } @else {
                      <div class="field field-sm sc-qty"><input type="text" class="num" appQty [qtyDecimals]="unitDecimals(item.unit)" [(ngModel)]="item.countedQuantity" (ngModelChange)="onCountedChange(item)" [disabled]="isActionLoading()" [attr.aria-label]="('stockCount.col.countedStock' | t) + ': ' + item.productName" /></div>
                    }
                  </td>
                  <td class="r sc-c-num" [attr.data-label]="'stockCount.col.difference' | t">
                    <span class="badge sc-diff" [class.badge-success]="item.difference > 0" [class.badge-danger]="item.difference < 0" [class.badge-neutral]="item.difference === 0">{{ item.difference > 0 ? '+' : '' }}{{ item.difference | num }}</span>
                  </td>
                </tr>
                @if (isTracked(item) && expanded().has(item.productId)) {
                  @if (item.trackingType === 'lot') {
                    @for (lot of item.lots || []; track lot.lotId) {
                      <tr class="sc-sub">
                        <td class="sc-indent">{{ 'stockCount.lot' | t }} <span class="mono">{{ lot.lotNumber }}</span></td>
                        <td class="sec sc-c-sku" [attr.data-label]="'products.lots.expiry' | t">{{ lot.expiryDate ? (lot.expiryDate | appDate) : '-' }}</td>
                        <td class="sec sc-c-unit" [attr.data-label]="'products.lots.warehouse' | t">{{ lot.warehouseName || '-' }}</td>
                        <td class="r sc-c-num" [attr.data-label]="'stockCount.col.systemStock' | t">{{ lot.systemQuantity | num }}</td>
                        <td class="r sc-c-num" [attr.data-label]="'stockCount.col.countedStock' | t">
                          <div class="field field-sm sc-qty"><input type="text" class="num" appQty [qtyDecimals]="unitDecimals(item.unit)" [(ngModel)]="lot.countedQuantity" (ngModelChange)="recomputeTracked(item)" [disabled]="isActionLoading()" [attr.aria-label]="('stockCount.col.countedStock' | t) + ': ' + lot.lotNumber" /></div>
                        </td>
                        <td class="r sc-c-num" [attr.data-label]="'stockCount.col.difference' | t">{{ diff(lot.countedQuantity, lot.systemQuantity) | num }}</td>
                      </tr>
                    } @empty {
                      <tr class="sc-sub"><td colspan="6" class="sc-indent muted">{{ 'stockCount.noLots' | t }}</td></tr>
                    }
                  } @else {
                    @for (sn of item.serials || []; track sn.serial) {
                      <tr class="sc-sub">
                        <td class="sc-indent" colspan="3">
                          <label class="check">
                            <input type="checkbox" [(ngModel)]="sn.present" (ngModelChange)="recomputeTracked(item)" [disabled]="isActionLoading()" />
                            <span class="mono" [class.sc-serial-missing]="!sn.present">{{ sn.serial }}</span>
                          </label>
                        </td>
                        <td colspan="3" class="sec sc-c-full">
                          {{ sn.warehouseName || '' }}
                          <span class="badge" [class.badge-success]="sn.present" [class.badge-danger]="!sn.present"><span class="dot"></span>{{ (sn.present ? 'stockCount.serialPresent' : 'stockCount.serialMissing') | t }}</span>
                        </td>
                      </tr>
                    } @empty {
                      <tr class="sc-sub"><td colspan="6" class="sc-indent muted">{{ 'stockCount.noSerials' | t }}</td></tr>
                    }
                  }
                }
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    @if (showScanner()) {
      <app-barcode-scanner
        [products]="state.products()"
        (scanResult)="onScan($event)"
        (closeScanner)="showScanner.set(false)"
      ></app-barcode-scanner>
    }

    <!-- ─── Count History ─── -->
    <section class="card sc-hist">
      <div class="card-h">
        <h3>{{ 'stockCount.ui.history' | t }}</h3>
        <span class="sub">{{ counts().length | num }}</span>
      </div>
      @if (counts().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="count" /></div>
          <h3>{{ 'stockCount.empty' | t }}</h3>
          <p>{{ 'stockCount.ui.emptyBody' | t }}</p>
          @if (!activeCount()) {
            <div class="cluster actions"><button type="button" class="btn btn-primary" (click)="startNewCount()"><app-icon name="plus" />{{ 'stockCount.startNew' | t }}</button></div>
          }
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive">
            <thead>
              <tr>
                <th>{{ 'stockCount.col.countNo' | t }}</th>
                <th>{{ 'stockCount.col.date' | t }}</th>
                <th>{{ 'stockCount.performedBy' | t }}</th>
                <th>{{ 'stockCount.col.status' | t }}</th>
                <th class="r">{{ 'stockCount.col.itemCount' | t }}</th>
                <th>{{ 'stockCount.notes' | t }}</th>
                <th class="r"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (c of counts(); track c.id) {
                <tr>
                  <td class="mono td-primary">{{ c.countNumber }}</td>
                  <td class="sec" [attr.data-label]="'stockCount.col.date' | t">{{ (c.completedAt || c.startedAt) | appDate: 'datetime' }}</td>
                  <td [attr.data-label]="'stockCount.performedBy' | t">{{ c.performedBy }}</td>
                  <td [attr.data-label]="'stockCount.col.status' | t">
                    <span class="badge" [class.badge-success]="c.status === 'Completed'" [class.badge-warning]="c.status === 'InProgress'" [class.badge-neutral]="c.status === 'Cancelled'"><span class="dot"></span>{{ (c.status === 'Completed' ? 'stockCount.status.completed' : c.status === 'Cancelled' ? 'stockCount.status.cancelled' : 'stockCount.status.inProgress') | t }}</span>
                  </td>
                  <td class="r" [attr.data-label]="'stockCount.col.itemCount' | t">{{ c.items.length | num }}</td>
                  <td class="sec sc-notes-cell" [attr.data-label]="'stockCount.notes' | t" [title]="c.notes || ''">{{ c.notes || '-' }}</td>
                  <td class="td-actions">
                    @if (c.status === 'InProgress') {
                      <button type="button" class="btn btn-sm" (click)="resumeCount(c)"><app-icon name="arrowr" />{{ 'stockCount.resume' | t }}</button>
                    } @else {
                      <button type="button" class="btn btn-sm" (click)="viewDetails(c)">{{ 'stockCount.details' | t }}</button>
                    }
                    <button type="button" class="btn btn-ghost btn-sm" (click)="printTutanak(c)"><app-icon name="printer" />{{ 'stockCount.tutanak' | t }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <!-- ─── Complete Confirmation Modal ─── -->
    @if (showCompleteModal()) {
      <div class="modal-backdrop">
        <div class="modal w-sm" role="dialog" aria-modal="true" aria-labelledby="scConfirmTitle">
          <div class="modal-h">
            <h2 id="scConfirmTitle">{{ 'stockCount.confirm.title' | t }}</h2>
            <button type="button" class="modal-close" (click)="showCompleteModal.set(false)" [disabled]="isActionLoading()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
          </div>
          <div class="modal-b">
            <p>{{ 'stockCount.confirm.message' | t }}</p>
            <div class="sc-modal-sum">
              <span><b>{{ countedItemsCount() | num }} / {{ totalItemsCount() | num }}</b>{{ 'stockCount.col.counted' | t }}</span>
              <span><b>{{ 'stockCount.ui.pct' | t: { value: progressPercentage() } }}</b>{{ 'stockCount.ui.progressShort' | t }}</span>
            </div>
          </div>
          <div class="modal-f">
            <button type="button" class="btn btn-ghost" (click)="showCompleteModal.set(false)" [disabled]="isActionLoading()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="isActionLoading()" (click)="completeCount()" [disabled]="isActionLoading()"><span>{{ 'common.confirm' | t }}</span></button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Historical Details Drawer ─── -->
    @if (selectedCount(); as sc) {
      <div class="drawer-overlay" (click)="selectedCount.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" aria-labelledby="scDetailTitle" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title" id="scDetailTitle">{{ 'stockCount.detailsTitle' | t }}</span>
            <div class="drawer-tools">
              <button type="button" class="btn btn-ghost btn-sm" (click)="printTutanak(sc)"><app-icon name="printer" />{{ 'stockCount.tutanak' | t }}</button>
              <button type="button" class="drawer-close" (click)="selectedCount.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </div>

          <div class="drawer-body">
            <dl class="sc-kv">
              <div><dt>{{ 'stockCount.col.countNo' | t }}</dt><dd class="mono">{{ sc.countNumber }}</dd></div>
              <div><dt>{{ 'stockCount.col.status' | t }}</dt><dd>
                <span class="badge" [class.badge-success]="sc.status === 'Completed'" [class.badge-warning]="sc.status === 'InProgress'" [class.badge-neutral]="sc.status === 'Cancelled'"><span class="dot"></span>{{ (sc.status === 'Completed' ? 'stockCount.status.completed' : sc.status === 'Cancelled' ? 'stockCount.status.cancelled' : 'stockCount.status.inProgress') | t }}</span>
              </dd></div>
              <div><dt>{{ 'stockCount.startedAt' | t }}</dt><dd>{{ sc.startedAt | appDate: 'datetime' }}</dd></div>
              <div><dt>{{ 'stockCount.completedAt' | t }}</dt><dd>{{ sc.completedAt ? (sc.completedAt | appDate: 'datetime') : '-' }}</dd></div>
              <div><dt>{{ 'stockCount.countType' | t }}</dt><dd>{{ 'stockCount.countType.' + (sc.countType || 'PERIODIC') | t }}</dd></div>
              <div><dt>{{ 'stockCount.performedBy' | t }}</dt><dd>{{ sc.performedBy }}</dd></div>
              <div><dt>{{ 'stockCount.countDate' | t }}</dt><dd>{{ sc.countDate ? (sc.countDate | appDate) : '-' }}</dd></div>
              <div><dt>{{ 'stockCount.asOfDate' | t }}</dt><dd>{{ sc.asOfDate ? (sc.asOfDate | appDate) : '-' }}</dd></div>
              <div><dt>{{ 'stockCount.countedBy' | t }}</dt><dd>{{ teamText(sc) }}</dd></div>
              <div><dt>{{ 'stockCount.supervisedBy' | t }}</dt><dd>{{ sc.supervisedBy || '-' }}</dd></div>
              <div><dt>{{ 'stockCount.approvedBy' | t }}</dt><dd>{{ sc.approvedBy || '-' }}</dd></div>
            </dl>

            <div class="fld">
              <span class="fld-label">{{ 'stockCount.notes' | t }}</span>
              <div class="sc-notes">{{ sc.notes || ('stockCount.noNotes' | t) }}</div>
            </div>

            <div class="fld">
              <div class="sc-section-h"><span class="fld-label">{{ 'stockCount.countedItems' | t }}</span><span class="fld-help">{{ sc.items.length | num }}</span></div>
              <div class="table-card">
                <div class="table-scroll">
                  <table class="tbl dense sc-detail-table">
                    <thead>
                      <tr>
                        <th>{{ 'stockCount.col.productName' | t }}</th>
                        <th class="hide-xs">{{ 'stockCount.col.sku' | t }}</th>
                        <th class="r">{{ 'stockCount.col.system' | t }}</th>
                        <th class="r">{{ 'stockCount.col.counted' | t }}</th>
                        <th class="r">{{ 'stockCount.col.difference' | t }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of sc.items; track item.productId) {
                        <tr [class.sc-zero]="item.systemQuantity === 0">
                          <td [title]="item.productName">
                            <div class="sc-name">
                              <b>{{ item.productName }}</b>
                              @if (item.systemQuantity === 0) { <span class="badge badge-warning"><app-icon name="warn" size="xs" />{{ 'stockCount.noSystemStock' | t }}</span> }
                            </div>
                          </td>
                          <td class="mono sec hide-xs">{{ item.sku }}</td>
                          <td class="r">{{ item.systemQuantity | num }}</td>
                          <td class="r">{{ item.countedQuantity | num }}</td>
                          <td class="r">
                            @if (item.approvalRequestId) {
                              <span class="badge badge-warning" [title]="'stockCount.sentForApprovalHint' | t"><app-icon name="lock" size="xs" />{{ 'stockCount.sentForApproval' | t }}</span>
                            }
                            <span class="badge sc-diff" [class.badge-success]="item.difference > 0" [class.badge-danger]="item.difference < 0" [class.badge-neutral]="item.difference === 0">{{ item.difference > 0 ? '+' : '' }}{{ item.difference | num }}</span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class StockCountComponent implements OnInit {
  inventoryService = inject(InventoryService);
  units = signal<Unit[]>([]);
  ui = inject(UiStateService);
  state = inject(AppStateService);
  i18n = inject(I18nService);

  readonly countTypes = COUNT_TYPES;
  private accounting = inject(AccountingService);
  /** Tutanak header of the active count (WP6) */
  header = { countType: 'PERIODIC', countDate: '', asOfDate: '', countedByText: '', supervisedBy: '' };

  counts = signal<StockCount[]>([]);
  activeCount = signal<StockCount | null>(null);
  activeItems = signal<StockCountItem[]>([]);
  activeNotes = '';

  selectedCount = signal<StockCount | null>(null);

  isActionLoading = signal(false);
  showScanner = signal(false);
  moreOpen = signal(false);
  expanded = signal<Set<string>>(new Set());
  highlightedId = signal<string | null>(null);
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  showCompleteModal = signal(false);

  /** Esc closes the confirmation modal, then the details drawer. */
  @HostListener('document:click')
  closeMenus() { this.moreOpen.set(false); }

  /** Opens the native date picker when the field is clicked (the native glyph is hidden in favour of the lead icon). */
  openPicker(ev: Event) {
    const el = ev.target as HTMLInputElement;
    try { if (!el.disabled) el.showPicker?.(); } catch { /* not supported */ }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showScanner()) return;
    if (this.moreOpen()) { this.moreOpen.set(false); return; }
    if (this.showCompleteModal()) { if (!this.isActionLoading()) this.showCompleteModal.set(false); return; }
    if (this.selectedCount()) this.selectedCount.set(null);
  }

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
    this.inventoryService.getUnits().subscribe({ next: (u) => this.units.set(u || []), error: () => undefined });
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
          this.fillHeader(inProgress);
        } else {
          this.activeCount.set(null);
          this.activeItems.set([]);
          this.activeNotes = '';
        }
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.loadError'), 'error');
      }
    });
  }

  startNewCount() {
    if (this.isActionLoading()) return;
    this.isActionLoading.set(true);

    this.inventoryService.createStockCount('').subscribe({
      next: (data) => {
        this.ui.showToast(this.i18n.t('stockCount.toast.started'), 'success');
        this.isActionLoading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.startError'), 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  /** Unit precision for count inputs (kg: 3, pcs: 0). */
  unitDecimals(code: string | null | undefined): number {
    return Number(this.units().find((u) => u.code === code)?.decimals) || 0;
  }

  diff(a: number, b: number): number {
    return roundQty((Number(a) || 0) - (Number(b) || 0));
  }

  onCountedChange(item: StockCountItem) {
    const counted = Number(item.countedQuantity) || 0;
    item.difference = roundQty(counted - item.systemQuantity);
    item.isModified = true;
    this.activeItems.set([...this.activeItems()]);
  }

  isTracked(item: StockCountItem): boolean {
    return item.trackingType === 'lot' || item.trackingType === 'serial';
  }

  toggleExpand(productId: string) {
    const next = new Set(this.expanded());
    if (next.has(productId)) next.delete(productId); else next.add(productId);
    this.expanded.set(next);
  }

  recomputeTracked(item: StockCountItem) {
    if (item.trackingType === 'lot') {
      item.countedQuantity = sumQty((item.lots || []).map((l) => Number(l.countedQuantity) || 0));
    } else if (item.trackingType === 'serial') {
      item.countedQuantity = (item.serials || []).filter((s) => s.present).length;
    }
    item.difference = roundQty(item.countedQuantity - item.systemQuantity);
    item.isModified = true;
    this.activeItems.set([...this.activeItems()]);
  }

  onScan(code: string) {
    this.showScanner.set(false);
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    this.inventoryService.lookupBarcode(trimmed).subscribe({
      next: (res) => {
        const item = this.activeItems().find((i) => i.productId === res.product.id);
        if (!item) {
          this.ui.showToast(this.i18n.t('stockCount.toast.scanNotInCount', { name: res.product.name }), 'error');
          return;
        }
        if (item.trackingType === 'serial') {
          const sn = res.serial ? (item.serials || []).find((s) => s.serial === res.serial) : undefined;
          if (!sn) {
            this.ui.showToast(this.i18n.t('stockCount.toast.scanSerialRequired'), 'error');
            this.focusItem(item, true);
            return;
          }
          sn.present = true;
          this.recomputeTracked(item);
          this.ui.showToast(this.i18n.t('stockCount.toast.scanSerialMarked', { serial: sn.serial }), 'success');
        } else if (item.trackingType === 'lot') {
          this.ui.showToast(this.i18n.t('stockCount.toast.scanLotHint'), 'info');
        } else {
          const factor = Number(res.factor) || 1;
          item.countedQuantity = (Number(item.countedQuantity) || 0) + factor;
          this.onCountedChange(item);
          this.ui.showToast(this.i18n.t('stockCount.toast.scanAdded', { name: item.productName, qty: factor }), 'success');
        }
        this.focusItem(item, item.trackingType === 'lot');
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.scanNotFound', { code: trimmed }), 'error');
      }
    });
  }

  private focusItem(item: StockCountItem, expand: boolean) {
    if (expand && !this.expanded().has(item.productId)) this.toggleExpand(item.productId);
    this.highlightedId.set(item.productId);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlightedId.set(null), 2000);
    setTimeout(() => document.getElementById('sc-row-' + item.productId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  saveDraft() {
    const active = this.activeCount();
    if (!active || this.isActionLoading()) return;
    this.isActionLoading.set(true);

    this.inventoryService.updateStockCount(active.id, this.activeItems(), this.activeNotes, this.headerPayload()).subscribe({
      next: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.draftSaved'), 'success');
        this.isActionLoading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.draftError'), 'error');
        this.isActionLoading.set(false);
      }
    });
  }

  promptCancel() {
    const active = this.activeCount();
    if (!active) return;
    this.ui.openConfirm({
      title: this.i18n.t('stockCount.cancelConfirm.title'),
      message: this.i18n.t('stockCount.cancelConfirm.message', { number: active.countNumber }),
      confirmText: this.i18n.t('stockCount.cancelCount'),
      isDelete: true,
      onConfirm: () => {
        this.isActionLoading.set(true);
        this.inventoryService.cancelStockCount(active.id).subscribe({
          next: () => {
            this.isActionLoading.set(false);
            this.ui.showToast(this.i18n.t('stockCount.toast.cancelled'), 'success');
            this.activeCount.set(null);
            this.activeItems.set([]);
            this.loadHistory();
          },
          error: () => {
            this.isActionLoading.set(false);
            this.ui.showToast(this.i18n.t('stockCount.toast.cancelError'), 'error');
          },
        });
      },
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
    this.inventoryService.updateStockCount(active.id, this.activeItems(), this.activeNotes, this.headerPayload()).subscribe({
      next: () => {
        // Complete the count session
        this.inventoryService.completeStockCount(active.id).subscribe({
          next: (res) => {
            const pending = res?.pendingApprovals?.length || 0;
            if (pending) this.ui.showToast(this.i18n.t('stockCount.toast.completedPending', { count: pending }), 'info');
            else this.ui.showToast(this.i18n.t('stockCount.toast.completed'), 'success');
            this.showCompleteModal.set(false);
            this.isActionLoading.set(false);
            this.activeCount.set(null);
            this.activeItems.set([]);
            // Force reload main products cache to show updated counts
            this.state.loadData();
            this.loadHistory();
          },
          error: () => {
            this.ui.showToast(this.i18n.t('stockCount.toast.completeError'), 'error');
            this.isActionLoading.set(false);
          }
        });
      },
      error: () => {
        this.ui.showToast(this.i18n.t('stockCount.toast.saveError'), 'error');
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
    this.fillHeader(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private fillHeader(c: StockCount) {
    this.header = {
      countType: c.countType || 'PERIODIC',
      countDate: c.countDate || '',
      asOfDate: c.asOfDate || '',
      countedByText: (c.countedBy || []).join(', '),
      supervisedBy: c.supervisedBy || '',
    };
  }

  /** Tutanak fields sent with save / complete. */
  headerPayload(): Partial<StockCount> {
    return {
      countType: this.header.countType,
      countDate: this.header.countDate || null,
      asOfDate: this.header.asOfDate || null,
      countedBy: this.header.countedByText.split(',').map((n) => n.trim()).filter(Boolean),
      supervisedBy: this.header.supervisedBy.trim() || null,
    };
  }

  teamText(c: StockCount): string {
    return (c.countedBy || []).join(', ') || '-';
  }

  printTutanak(c: StockCount) {
    this.accounting.openPrintable(`stock-counts/${c.id}/report`);
  }

  viewDetails(c: StockCount) {
    this.selectedCount.set(c);
  }
}
