import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InventoryService, Product, Warehouse, StockMovement, StockLot, StockAdjustmentRequest, MovementAttachment } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { ModalComponent } from '../modal.component';
import { I18nService, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe } from '../../i18n';
import { QuantityInputDirective, productDecimals } from '../shared/quantity-input.directive';
import { MOVEMENT_REASONS, MOVEMENT_DOCUMENT_TYPES, reasonAllowsDirection } from '@stok/tr-compliance';
import { ReasonRule } from '../../models/inventory.models';
import { toastMovementResult } from '../shared/movement-warnings';
import { IconComponent } from '../shared/icon.component';

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
/** Type filter pills (server-side filter). */
const TYPE_PILLS: { type: string; key: string }[] = [
  { type: 'IN', key: 'stockMovements.type.in' },
  { type: 'ORDER', key: 'stockMovements.type.order' },
  { type: 'RETURN', key: 'stockMovements.type.return' },
  { type: 'ADJUSTMENT', key: 'stockMovements.type.adjustment' },
  { type: 'DISPOSAL', key: 'stockMovements.type.disposal' },
  { type: 'REVERSAL', key: 'stockMovements.type.reversal' },
  { type: 'TRANSFER_OUT,TRANSFER_IN', key: 'stockMovements.type.transfer' },
  { type: 'QUARANTINE_IN,QUARANTINE_OUT', key: 'stockMovements.type.quarantine' },
];

/** Backend-generated (Turkish) movement notes → i18n keys with captured params. */
const SYSTEM_NOTES: [RegExp, string, string[]][] = [
  [/^Sayım Düzeltmesi \(Fark: ([^)]+)\)$/, 'stockMovements.sysNote.countAdjustment', ['diff']],
  [/^Sayım farkı düzeltmesi$/, 'stockMovements.sysNote.countDiff', []],
  [/^Yeni ürün oluşturma stok girişi$/, 'stockMovements.sysNote.newProduct', []],
  [/^Depo transferi: (.+) -> (.+) \(([^)]+)\)$/, 'stockMovements.sysNote.transfer', ['from', 'to', 'qty']],
  [/^Transfer teslim alındı: (.+)$/, 'stockMovements.sysNote.transferReceived', ['no']],
  [/^Numune irsaliyesi (.+)$/, 'stockMovements.sysNote.sampleDespatch', ['no']],
  [/^İrsaliye yerine geçen fatura (.+)$/, 'stockMovements.sysNote.invoiceAsDespatch', ['no']],
  [/^İrsaliye (\S+) \((.+)\)$/, 'stockMovements.sysNote.despatchOrder', ['no', 'ref']],
  [/^İrsaliye (\S+)$/, 'stockMovements.sysNote.despatch', ['no']],
  [/^Mal kabul (\S+) \((.+)\) — alıcı taşıması$/, 'stockMovements.sysNote.receiptBuyerCarriage', ['no', 'ref']],
  [/^Mal kabul (\S+) \((.+)\)$/, 'stockMovements.sysNote.receipt', ['no', 'ref']],
  [/^Tesellüm fazlası \(397\) (.+)$/, 'stockMovements.sysNote.receiptSurplus', ['no']],
  [/^Satış iadesi (\S+)(?: \(fatura (.+)\))?$/, 'stockMovements.sysNote.salesReturn', ['no', 'inv']],
  [/^Alış iadesi (\S+)(?: \(fatura (.+)\))?$/, 'stockMovements.sysNote.purchaseReturn', ['no', 'inv']],
  [/^İade (\S+) \(fatura (.+)\)$/, 'stockMovements.sysNote.return', ['no', 'inv']],
  [/^İmha ([^:]+): (.*)$/, 'stockMovements.sysNote.disposal', ['no', 'reason']],
  [/^Sipariş oluşturuldu: (.+)$/, 'stockMovements.sysNote.orderCreated', ['no']],
  [/^Sipariş iptal edildi: (.+)$/, 'stockMovements.sysNote.orderCancelled', ['no']],
  [/^Sipariş: (.+)$/, 'stockMovements.sysNote.order', ['no']],
  [/^Satın alma siparişi teslim alındı: (.+)$/, 'stockMovements.sysNote.poReceived', ['no']],
  [/^Satın alma teslim alındı: (.+)$/, 'stockMovements.sysNote.poReceived', ['no']],
  [/^Açılış maliyeti içe aktarımı \(CSV\)$/, 'stockMovements.sysNote.openingCostImport', []],
];

@Component({
  selector: 'app-stock-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent, ModalComponent, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, QuantityInputDirective, IconComponent],
  host: { '(document:click)': 'moreOpen.set(false)', '(document:keydown.escape)': 'onEscape()' },
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'stockMovements.title' | t }}</h1>
        <p>{{ 'stockMovements.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn d-only" (click)="refreshAll()"><app-icon name="refresh" />{{ 'stockMovements.refresh' | t }}</button>
        <button type="button" class="btn d-only" (click)="exportToCSV()"><app-icon name="download" />{{ 'stockMovements.export' | t }}</button>
        <span class="sm-more m-only">
          <button type="button" class="btn btn-icon" [class.is-active]="moreOpen()" aria-haspopup="menu" [attr.aria-expanded]="moreOpen()" [attr.aria-label]="'stockMovements.moreActions' | t" (click)="moreOpen.set(!moreOpen()); $event.stopPropagation()"><app-icon name="more" /></button>
          @if (moreOpen()) {
            <div class="pop sm-more-pop" role="menu">
              <button type="button" class="menu-i" role="menuitem" (click)="moreOpen.set(false); refreshAll()"><app-icon name="refresh" />{{ 'stockMovements.refresh' | t }}</button>
              <button type="button" class="menu-i" role="menuitem" (click)="moreOpen.set(false); exportToCSV()"><app-icon name="download" />{{ 'stockMovements.export' | t }}</button>
            </div>
          }
        </span>
        @if (canEdit()) {
          <button type="button" class="btn btn-primary" (click)="openDrawer()"><app-icon name="plus" /><span class="d-only">{{ 'stockMovements.manualAdjustment' | t }}</span><span class="m-only">{{ 'stockMovements.manualAdjustmentShort' | t }}</span></button>
        }
      </div>
    </header>

    @if (pendingRequests().length) {
      <section class="card sm-approvals" aria-live="polite">
        <div class="card-h">
          <app-icon name="warn" size="sm" class="sm-appr-ic" />
          <h3>{{ 'stockMovements.approvals.title' | t }}</h3>
          <span class="badge badge-warning"><span class="dot"></span>{{ pendingRequests().length | num }}</span>
          <span class="sub d-only">{{ 'stockMovements.approvals.hint' | t }}</span>
        </div>
        <ul class="sm-appr-list">
          @for (r of pendingRequests(); track r.id) {
            <li class="sm-appr">
              <div class="sm-appr-main">
                @if (r.payload.kind === 'COMPANY_CONTROL') {
                  <b>{{ 'stockMovements.approvals.controlChange' | t }}</b>
                  @if (r.payload.change?.stockLockDate !== undefined) {
                    <span class="sec">{{ 'stockMovements.approvals.lockDateChange' | t: { from: r.payload.current?.stockLockDate || '—', to: r.payload.change?.stockLockDate || ('stockMovements.approvals.none' | t) } }}</span>
                  }
                  @if (r.payload.change?.adjustmentApprovalThreshold !== undefined) {
                    <span class="sec">{{ 'stockMovements.approvals.thresholdChange' | t: { from: r.payload.current?.adjustmentApprovalThreshold != null ? (r.payload.current!.adjustmentApprovalThreshold! | money: r.currency) : '—', to: r.payload.change?.adjustmentApprovalThreshold != null ? (r.payload.change!.adjustmentApprovalThreshold! | money: r.currency) : ('stockMovements.approvals.none' | t) } }}</span>
                  }
                } @else {
                  <b>{{ r.productName }}</b>
                  <span class="sm-qty" [class.pos]="r.quantityDelta > 0" [class.neg]="r.quantityDelta < 0">{{ r.quantityDelta > 0 ? '+' : '' }}{{ r.quantityDelta | num }}</span>
                  @if (r.payload.kind === 'REVERSAL') { <span class="badge badge-info">{{ 'stockMovements.approvals.reversalRequest' | t }}</span> }
                  @if (r.payload.kind === 'COUNT') { <span class="badge badge-info">{{ 'stockMovements.approvals.countRequest' | t: { count: r.payload.document?.countNumber || '' } }}</span> }
                  <span class="badge badge-neutral">{{ reasonLabel(r.payload.reasonCode) }}</span>
                  <span class="sec">{{ 'stockMovements.approvals.value' | t: { value: (r.estimatedValue | money: r.currency), threshold: (r.threshold | money: r.currency) } }}</span>
                }
              </div>
              <div class="sm-appr-meta">
                {{ 'stockMovements.approvals.requestedBy' | t: { user: r.requestedBy } }} · {{ r.createdAt | appDate: 'datetime' }}
                @if (r.payload.note) { · “{{ r.payload.note }}” }
              </div>
              @if (isAdmin()) {
                <div class="sm-appr-actions">
                  <button type="button" class="btn btn-sm btn-ghost" [disabled]="decidingId() === r.id" (click)="decide(r, false)">{{ 'stockMovements.approvals.reject' | t }}</button>
                  <button type="button" class="btn btn-sm btn-primary" [disabled]="decidingId() === r.id" (click)="decide(r, true)"><app-icon name="check" size="sm" />{{ 'stockMovements.approvals.approve' | t }}</button>
                </div>
              }
            </li>
          }
        </ul>
      </section>
    }

    <div class="sm-tools">
      <div class="toolbar">
        <div class="field field-sm sm-search">
          <span class="lead"><app-icon name="search" size="sm" /></span>
          <input type="text" data-page-search [placeholder]="'stockMovements.searchPlaceholderShort' | t" [title]="'stockMovements.searchPlaceholder' | t" [attr.aria-label]="'common.search' | t" [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)" />
          <span class="trail"><kbd>/</kbd></span>
        </div>
        <button type="button" class="btn btn-sm sm-ftoggle" [attr.aria-label]="'stockMovements.filter.toggle' | t" [class.is-active]="filtersOpen()" [attr.aria-expanded]="filtersOpen()" aria-controls="smFilters" (click)="filtersOpen.set(!filtersOpen())">
          <app-icon name="sliders" size="sm" /><span class="sm-flabel">{{ 'stockMovements.filter.toggle' | t }}</span>@if (activeFilterCount()) { <span class="sm-fcount mono">{{ activeFilterCount() }}</span> }
        </button>
        <div class="sm-filters" id="smFilters" [class.is-open]="filtersOpen()">
        <div class="field field-sm select sm-sel">
          <select [ngModel]="selectedWarehouseId()" (ngModelChange)="selectedWarehouseId.set($event); loadMovements(1)" [title]="'stockMovements.filter.warehouse' | t" [attr.aria-label]="'stockMovements.filter.warehouse' | t">
            <option value="">{{ 'stockMovements.filter.allWarehouses' | t }}</option>
            @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
          </select>
        </div>
        <div class="field field-sm select sm-sel">
          <select [ngModel]="selectedReason()" (ngModelChange)="selectedReason.set($event); loadMovements(1)" [title]="'stockMovements.filter.reason' | t" [attr.aria-label]="'stockMovements.filter.reason' | t">
            <option value="">{{ 'stockMovements.filter.allReasons' | t }}</option>
            @for (r of allReasons; track r.code) { <option [value]="r.code">{{ reasonLabel(r.code) }}</option> }
          </select>
        </div>
        <div class="sm-dates">
          <div class="field field-sm select sm-datefield">
            <select [ngModel]="dateField()" (ngModelChange)="dateField.set($event); loadMovements(1)" [title]="'stockMovements.filter.dateField' | t" [attr.aria-label]="'stockMovements.filter.dateField' | t">
              <option value="transactionDate">{{ 'stockMovements.transactionDate' | t }}</option>
              <option value="createdAt">{{ 'stockMovements.recordedAt' | t }}</option>
            </select>
          </div>
          <div class="field field-sm sm-date">
            <input type="date" [ngModel]="startDate()" (ngModelChange)="onStartDateChange($event)" [title]="'stockMovements.startDateTitle' | t" [attr.aria-label]="'stockMovements.startDateTitle' | t" />
          </div>
          <span class="sm-dash" aria-hidden="true">–</span>
          <div class="field field-sm sm-date">
            <input type="date" [ngModel]="endDate()" (ngModelChange)="onEndDateChange($event)" [title]="'stockMovements.endDateTitle' | t" [attr.aria-label]="'stockMovements.endDateTitle' | t" />
          </div>
          @if (startDate() || endDate()) {
            <button type="button" class="btn btn-sm btn-ghost" (click)="clearDateFilter()"><app-icon name="x" size="sm" />{{ 'stockMovements.clear' | t }}</button>
          }
        </div>
        </div>
      </div>
      <div class="seg seg-sm sm-types" role="group" [attr.aria-label]="'stockMovements.col.type' | t">
        <button type="button" [attr.aria-pressed]="selectedTypes().length === 0" (click)="toggleType('ALL')">{{ 'stockMovements.filter.all' | t }}</button>
        @for (p of typePills; track p.type) {
          <button type="button" [attr.aria-pressed]="selectedTypes().includes(p.type)" (click)="toggleType(p.type)">{{ p.key | t }}</button>
        }
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="card-b sm-skel">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton-row"></div> }
        </div>
      } @else if (movements().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="swap" /></div>
          <h3>{{ 'stockMovements.empty' | t }}</h3>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive sm-table">
            <thead>
              <tr>
                <th>{{ 'stockMovements.transactionDate' | t }}</th>
                <th>{{ 'stockMovements.col.productName' | t }}</th>
                <th>{{ 'stockMovements.col.type' | t }}</th>
                <th>{{ 'stockMovements.col.warehouse' | t }} <span class="th-sub">· {{ 'stockMovements.col.lotSerial' | t }}</span></th>
                <th class="r" [title]="('stockMovements.col.quantity' | t) + ' · ' + ('stockMovements.col.newStock' | t)">{{ 'stockMovements.col.quantity' | t }}</th>
                <th>{{ 'stockMovements.col.document' | t }}</th>
                <th>{{ 'stockMovements.col.noteRef' | t }}</th>
                <th>{{ 'stockMovements.recordedAt' | t }}</th>
                <th class="w-act"><span class="sr-only">{{ 'stockMovements.col.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (m of movements(); track m.id) {
                <tr [class.is-reversed]="m.reversedByMovementId">
                  <td class="sm-date" [attr.data-label]="'stockMovements.transactionDate' | t">
                    <span class="cv"><span class="sm-l1">{{ m.transactionDate | appDate }}</span><span class="sm-l2">{{ m.transactionDate | appDate: 'time' }} · <span class="mono" [title]="'stockMovements.sequenceNo' | t">#{{ m.sequenceNo }}</span></span></span>
                  </td>
                  <td class="td-primary sm-prod">
                    <b class="sm-l1" [title]="m.productName">{{ m.productName }}</b>@if (m.productSku) { <span class="sm-l2 mono">{{ m.productSku }}</span> }
                  </td>
                  <td class="sm-type" [attr.data-label]="'stockMovements.col.type' | t">
                    <span class="cv"><span class="sm-l1"><span class="badge" [ngClass]="getBadgeClass(m.type)"><span class="dot"></span>{{ getTypeName(m.type) }}</span></span><span class="sm-l2" [title]="reasonLabel(m.reasonCode)">{{ reasonLabel(m.reasonCode) }}</span></span>
                  </td>
                  <td class="sm-wh" [attr.data-label]="'stockMovements.col.warehouse' | t">
                    <span class="cv">
                      <span class="sm-l1" [class.sec]="!m.warehouseName && !m.warehouseId">{{ m.warehouseName || getWarehouseName(m.warehouseId) }}</span>
                      @if (m.lotNumber) { <span class="sm-l2 mono" [title]="('stockMovements.lot' | t) + ': ' + m.lotNumber">{{ 'stockMovements.lot' | t }} {{ m.lotNumber }}</span> }
                      @if (m.serials?.length) { <span class="sm-l2 mono" [title]="('stockMovements.serials' | t) + ': ' + m.serials!.join(', ')">{{ formatSerials(m.serials) }}</span> }
                    </span>
                  </td>
                  <td class="r sm-qtycell" [attr.data-label]="'stockMovements.col.quantity' | t">
                    <span class="cv">
                      <span class="sm-l1"><span class="sm-qty" [class.pos]="m.quantity > 0" [class.neg]="m.quantity < 0">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity | num }}</span>@if (m.unitCode) { <span class="sm-unit" [title]="m.unitCode">{{ m.unitCode | unitLabel }}</span> }</span>
                      <span class="sm-l2" [title]="'stockMovements.col.newStock' | t">{{ m.previousQuantity | num }} → <b>{{ m.newQuantity | num }}</b></span>
                    </span>
                  </td>
                  <td class="sm-doc" [attr.data-label]="'stockMovements.col.document' | t" [title]="m.counterpartyTaxId ? (('stockMovements.counterpartyTaxId' | t) + ': ' + m.counterpartyTaxId) : ''">
                    <span class="cv">
                      @if (m.documentNo) {
                        <span class="sm-l1 mono">{{ m.documentNo }}</span>
                        <span class="sm-l2"><span>{{ docTypeLabel(m.documentType) }}</span>@if (m.documentDate) { <span> · {{ m.documentDate | appDate }}</span> }@if (m.counterpartyTaxId) { <span class="mono sm-vkn"> · {{ 'stockMovements.vknShort' | t }} {{ m.counterpartyTaxId }}</span> }</span>
                      } @else {
                        <span class="sm-l1 sec">—</span>
                        @if (m.counterpartyTaxId) { <span class="sm-l2 mono">{{ 'stockMovements.vknShort' | t }} {{ m.counterpartyTaxId }}</span> }
                      }
                    </span>
                  </td>
                  @let ref = noteRef(m);
                  <td class="sm-notecell" [attr.data-label]="'stockMovements.col.noteRef' | t">
                    <span class="cv">
                      @if (ref) { <span class="sm-l1 sm-note" [title]="noteLabel(m.note)">{{ ref }}</span> }
                      @if (m.reversesMovementId || m.reversedByMovementId || m.attachmentCount) {
                        <span class="sm-chips">
                          @if (m.reversesMovementId) { <span class="badge badge-info">{{ 'stockMovements.reverse.isReversal' | t }}</span> }
                          @if (m.reversedByMovementId) { <span class="badge badge-neutral">{{ 'stockMovements.reverse.reversedBadge' | t }}</span> }
                          @if (m.attachmentCount) {
                            <button type="button" class="btn btn-xs btn-ghost sm-att" (click)="openAttachments(m)"><app-icon name="file" size="xs" />{{ 'stockMovements.attachments.count' | t: { count: m.attachmentCount } }}</button>
                          }
                        </span>
                      }
                      @if (!ref && !m.reversesMovementId && !m.reversedByMovementId && !m.attachmentCount) { <span class="sec">—</span> }
                    </span>
                  </td>
                  <td class="sm-rec" [attr.data-label]="'stockMovements.recordedAt' | t">
                    <span class="cv">
                      <span class="sm-l1">{{ m.createdAt | appDate }}</span>
                      <span class="sm-l2">{{ m.createdAt | appDate: 'time' }} · <span class="sm-by" [class.is-system]="isSystem(m.performedBy)">{{ isSystem(m.performedBy) ? ('stockMovements.system' | t) : m.performedBy }}</span>@if (m.approvedBy) { <span> · {{ 'stockMovements.approvedBy' | t: { user: m.approvedBy } }}</span> }</span>
                    </span>
                  </td>
                  <td class="w-act td-actions">
                    @if (canEdit() && m.reversible) {
                      <button type="button" class="btn btn-ghost btn-sm btn-icon row-act" (click)="openReverse(m)" [title]="'stockMovements.reverse.action' | t" [attr.aria-label]="'stockMovements.reverse.action' | t"><app-icon name="return" /></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Mobile ledger: 3–4 lines per movement -->
        <div class="sm-mlist" role="list">
          @for (m of movements(); track m.id) {
            @let ref = noteRef(m);
            <div class="mrow sm-mrow" role="listitem" [class.is-reversed]="m.reversedByMovementId">
              <b [title]="m.productName + (m.productSku ? ' · ' + m.productSku : '')">{{ m.productName }}</b>
              <span class="v"><span class="sm-qty" [class.pos]="m.quantity > 0" [class.neg]="m.quantity < 0">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity | num }}</span>@if (m.unitCode) { <span class="sm-unit">{{ m.unitCode | unitLabel }}</span> }</span>
              <span class="s sm-m-type"><span class="badge" [ngClass]="getBadgeClass(m.type)"><span class="dot"></span>{{ getTypeName(m.type) }}</span><span class="sm-m-reason">{{ reasonLabel(m.reasonCode) }}</span></span>
              <span class="s r" [title]="'stockMovements.col.newStock' | t">{{ m.previousQuantity | num }} → <b>{{ m.newQuantity | num }}</b></span>
              <span class="s sm-m-meta">{{ m.warehouseName || getWarehouseName(m.warehouseId) }}@if (m.lotNumber) { · <span class="mono">{{ m.lotNumber }}</span> }@else if (m.serials?.length) { · <span class="mono">{{ formatSerials(m.serials) }}</span> } · {{ m.transactionDate | appDate }} {{ m.transactionDate | appDate: 'time' }}</span>
              <span class="s r sm-m-act">
                @if (canEdit() && m.reversible) {
                  <button type="button" class="btn btn-ghost btn-xs btn-icon" (click)="openReverse(m)" [title]="'stockMovements.reverse.action' | t" [attr.aria-label]="'stockMovements.reverse.action' | t"><app-icon name="return" size="sm" /></button>
                }
              </span>
              @if (m.documentNo || ref || m.reversesMovementId || m.reversedByMovementId || m.attachmentCount) {
                <span class="s sm-m-doc">
                  @if (m.documentNo) { <span class="mono" [title]="docTypeLabel(m.documentType)">{{ m.documentNo }}</span> }
                  @if (ref) { <span class="sm-m-ref" [title]="noteLabel(m.note)">{{ ref }}</span> }
                  @if (m.reversesMovementId) { <span class="badge badge-info">{{ 'stockMovements.reverse.isReversal' | t }}</span> }
                  @if (m.reversedByMovementId) { <span class="badge badge-neutral">{{ 'stockMovements.reverse.reversedBadge' | t }}</span> }
                  @if (m.attachmentCount) { <button type="button" class="btn btn-xs btn-ghost sm-att" (click)="openAttachments(m)"><app-icon name="file" size="xs" />{{ m.attachmentCount | num }}</button> }
                </span>
              }
            </div>
          }
        </div>

        <div class="tbl-foot">
          <span>{{ 'stockMovements.pagination' | t: { total: (totalItems() | num), start: (getStartCount() | num), end: (getEndCount() | num) } }}</span>
          <span class="spacer"></span>
          <div class="pagination-actions">
            <button type="button" class="btn btn-sm btn-icon" [disabled]="currentPage() === 1" (click)="loadMovements(currentPage() - 1)" [attr.aria-label]="'stockMovements.prev' | t"><app-icon name="chevl" size="sm" /></button>
            @for (p of getPagesArray(); track p) {
              <button type="button" class="page-btn" [class.active]="p === currentPage()" [attr.aria-current]="p === currentPage() ? 'page' : null" (click)="loadMovements(p)">{{ p }}</button>
            }
            <button type="button" class="btn btn-sm btn-icon" [disabled]="currentPage() >= totalPages()" (click)="loadMovements(currentPage() + 1)" [attr.aria-label]="'stockMovements.next' | t"><app-icon name="chevr" size="sm" /></button>
          </div>
        </div>
      }
    </div>

    <!-- Manual adjustment drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" role="dialog" aria-modal="true" [attr.aria-label]="'stockMovements.drawerTitle' | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'stockMovements.drawerTitle' | t }}</span>
            <button type="button" class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>

          <form [formGroup]="adjustForm" (ngSubmit)="saveAdjustment()" class="drawer-form sm-form">
            <div class="drawer-body">
              <div class="notice notice-info sm-intro"><app-icon name="info" /><span class="t">{{ 'stockMovements.adjust.intro' | t }}</span></div>

              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'stockMovements.adjust.section.scope' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="adjProduct">{{ 'stockMovements.adjust.product' | t }} <span class="req">*</span></label>
                  <div class="field select">
                    <select id="adjProduct" formControlName="productId" (change)="onProductSelect()" [attr.aria-invalid]="isFieldInvalid('productId')">
                      <option value="" disabled>{{ 'stockMovements.selectProduct' | t }}</option>
                      @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }} · {{ p.sku }}</option> }
                    </select>
                  </div>
                  @if (isFieldInvalid('productId')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'stockMovements.validation.productRequired' | t }}</div> }
                </div>

                @if (selectedProduct(); as sp) {
                  @if (sp.trackingType === 'serial') {
                    <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'stockMovements.adjust.serialHint' | t }}</span></div>
                  } @else if (sp.trackingType === 'lot') {
                    <div class="fld">
                      <label class="fld-label" for="adjLot">{{ 'stockMovements.adjust.lot' | t }}</label>
                      <div class="field select">
                        <select id="adjLot" formControlName="lotId" (change)="syncCurrent()">
                          <option value="" disabled>{{ 'stockMovements.adjust.lot' | t }}</option>
                          @for (l of lots(); track l.id) {
                            <option [value]="l.id">{{ l.lotNumber }} · {{ l.warehouseName }} · {{ l.quantity | num }}{{ l.expiryDate ? ' · ' + (l.expiryDate | appDate) : '' }}</option>
                          }
                        </select>
                      </div>
                    </div>
                  } @else {
                    <div class="fld">
                      <label class="fld-label" for="adjWh">{{ 'stockMovements.adjust.warehouse' | t }}</label>
                      <div class="field select">
                        <select id="adjWh" formControlName="warehouseId" (change)="syncCurrent()">
                          <option value="">{{ 'stockMovements.adjust.productTotal' | t }}</option>
                          @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                        </select>
                      </div>
                    </div>
                  }

                  <div class="sm-calc">
                    <div class="sm-calc-c">
                      <span class="fld-label">{{ 'stockMovements.currentStock' | t }}</span>
                      <span class="sm-calc-v">{{ currentQty() | num }} <span class="sm-unit">{{ sp.baseUnit || sp.unit | unitLabel }}</span></span>
                    </div>
                    <div class="fld sm-calc-in">
                      <label class="fld-label" for="adjNewQty">{{ 'stockMovements.newQuantity' | t }} <span class="req">*</span></label>
                      <div class="field">
                        <input id="adjNewQty" type="text" inputmode="decimal" class="num" appQty [qtyDecimals]="decimals()" formControlName="newQuantity" [attr.aria-invalid]="isFieldInvalid('newQuantity')" />
                      </div>
                    </div>
                    <div class="sm-calc-c r">
                      <span class="fld-label">{{ 'stockMovements.adjust.delta' | t }}</span>
                      <span class="sm-calc-v sm-qty" [class.pos]="delta() > 0" [class.neg]="delta() < 0">{{ delta() > 0 ? '+' : '' }}{{ delta() | num }}</span>
                    </div>
                  </div>
                  @if (adjustForm.get('newQuantity')?.errors?.['qtyPrecision'] && adjustForm.get('newQuantity')?.touched) {
                    <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'stockMovements.validation.precision' | t: { decimals: decimals() } }}</div>
                  } @else if (isFieldInvalid('newQuantity')) {
                    <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'stockMovements.validation.quantityInvalid' | t }}</div>
                  }
                }
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'stockMovements.adjust.section.reason' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="adjReason">{{ 'stockMovements.adjust.reason' | t }} <span class="req">*</span></label>
                  <div class="field select">
                    <select id="adjReason" formControlName="reasonCode" [attr.aria-invalid]="isFieldInvalid('reasonCode')">
                      <option value="" disabled>{{ 'stockMovements.adjust.reason' | t }}</option>
                      @for (r of reasonOptions(); track r.code) { <option [value]="r.code">{{ reasonLabel(r.code) }}</option> }
                    </select>
                  </div>
                  @if (isFieldInvalid('reasonCode')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'stockMovements.validation.reasonRequired' | t }}</div> }
                  @if (reasonHint()) { <div class="fld-help">{{ reasonHint() }}</div> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="adjTx">{{ 'stockMovements.transactionDate' | t }}</label>
                  <div class="field">
                    <input id="adjTx" type="datetime-local" formControlName="transactionDate" [max]="nowLocal()" />
                  </div>
                  <div class="fld-help">{{ 'stockMovements.adjust.transactionDateHint' | t }}</div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">3</span><h3>{{ 'stockMovements.adjust.document' | t }}</h3>@if (needsDocument() || needsAttachment()) { <span class="aside">{{ 'stockMovements.adjust.required' | t }}</span> }</div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="adjDocType">{{ 'stockMovements.adjust.documentType' | t }}</label>
                    <div class="field select">
                      <select id="adjDocType" formControlName="documentType">
                        <option value="">—</option>
                        @for (d of docTypes; track d) { <option [value]="d">{{ docTypeLabel(d) }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="adjDocDate">{{ 'stockMovements.adjust.documentDate' | t }}@if (needsDocument()) { <span class="req">*</span> }</label>
                    <div class="field">
                      <input id="adjDocDate" type="date" formControlName="documentDate" />
                    </div>
                  </div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="adjDocNo">{{ 'stockMovements.adjust.documentNo' | t }}@if (needsDocument()) { <span class="req">*</span> }</label>
                  <div class="field">
                    <input id="adjDocNo" type="text" class="mono" formControlName="documentNo" maxlength="50" [attr.aria-invalid]="documentMissing() && adjustForm.get('documentNo')?.touched" />
                  </div>
                  @if (documentMissing()) { <div class="fld-help">{{ 'stockMovements.validation.documentRequired' | t }}</div> }
                </div>
                <div class="sm-attach" [class.is-missing]="needsAttachment() && !attachment()">
                  <label class="btn btn-sm">
                    <input type="file" class="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv" (change)="onFile($event)" />
                    <app-icon name="upload" size="sm" />{{ 'stockMovements.adjust.attach' | t }}
                  </label>
                  @if (attachment(); as a) {
                    <span class="sm-file"><app-icon name="file" size="sm" /><span class="truncate">{{ a.fileName }}</span></span>
                    <button type="button" class="btn btn-xs btn-ghost" (click)="attachment.set(null)">{{ 'stockMovements.adjust.attachmentRemove' | t }}</button>
                  } @else if (needsAttachment()) {
                    <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'stockMovements.validation.attachmentRequired' | t }}</span>
                  } @else {
                    <span class="fld-help">{{ 'stockMovements.adjust.attachHint' | t }}</span>
                  }
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">4</span><h3>{{ 'stockMovements.adjust.note' | t }} <span class="req">*</span></h3></div>
                <div class="fld">
                  <div class="field has-area">
                    <textarea id="adjNote" formControlName="note" maxlength="255" rows="3" [attr.aria-label]="'stockMovements.adjust.note' | t" [attr.aria-invalid]="isFieldInvalid('note')"></textarea>
                    <span class="counter">{{ (formValue()['note'] || '').length }} / 255</span>
                  </div>
                  @if (isFieldInvalid('note')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'stockMovements.validation.noteRequired' | t }}</div> }
                </div>
              </section>
            </div>

            <div class="drawer-footer">
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSaving()" [disabled]="adjustForm.invalid || isSaving() || !delta() || documentMissing() || attachmentMissing()">
                <span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Reversal confirmation -->
    <app-modal [isOpen]="!!reverseTarget()" [title]="'stockMovements.reverse.title' | t" (onClose)="reverseTarget.set(null)">
      @if (reverseTarget(); as m) {
        <p>{{ 'stockMovements.reverse.body' | t: { qty: (-m.quantity | num), product: m.productName } }}</p>
        <div class="fld sm-rev">
          <label class="fld-label" for="revNote">{{ 'stockMovements.reverse.note' | t }}</label>
          <div class="field has-area">
            <textarea id="revNote" maxlength="255" rows="3" [ngModel]="reverseNote()" (ngModelChange)="reverseNote.set($event)"></textarea>
            <span class="counter">{{ reverseNote().length }} / 255</span>
          </div>
        </div>
      }
      <div footer class="modal-actions">
        <button type="button" class="btn btn-ghost" (click)="reverseTarget.set(null)">{{ 'common.cancel' | t }}</button>
        <button type="button" class="btn btn-primary" [class.is-loading]="isReversing()" [disabled]="!reverseNote().trim() || isReversing()" (click)="confirmReverse()"><span>{{ 'stockMovements.reverse.confirm' | t }}</span></button>
      </div>
    </app-modal>

    <!-- Attachments -->
    <app-modal [isOpen]="!!attachmentTarget()" [title]="'stockMovements.attachments.title' | t" (onClose)="attachmentTarget.set(null)">
      <ul class="sm-att-list">
        @for (a of attachments(); track a.id) {
          <li>
            <span class="sm-att-ic"><app-icon name="file" /></span>
            <div class="sm-att-t">
              <b class="truncate">{{ a.fileName }}</b>
              <span class="sec">{{ (a.size / 1024) | num: 1 }} KB · {{ a.createdAt | appDate: 'datetime' }}</span>
              <span class="mono sm-sha truncate" [title]="a.sha256">SHA-256 {{ a.sha256 }}</span>
            </div>
            <button type="button" class="btn btn-sm" (click)="download(a)"><app-icon name="download" size="sm" />{{ 'stockMovements.attachments.download' | t }}</button>
          </li>
        }
      </ul>
      <div footer class="modal-actions">
        <button type="button" class="btn" (click)="attachmentTarget.set(null)">{{ 'common.close' | t }}</button>
      </div>
    </app-modal>

    <app-toast></app-toast>
  `,
  styles: [`
    /* header overflow menu (mobile) */
    .sm-more { position: relative; }
    .sm-more-pop { top: calc(100% + 4px); right: 0; min-width: 200px; }

    /* approvals */
    .sm-approvals { margin-bottom: 20px; }
    .sm-approvals .card-h { flex-wrap: wrap; row-gap: 0; }
    .sm-appr-ic { color: var(--warning); }
    .sm-appr-list { list-style: none; margin: 0; padding: 0; }
    .sm-appr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 12px 16px; box-shadow: inset 0 -1px 0 var(--line); }
    .sm-appr:last-child { box-shadow: none; }
    .sm-appr-main { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; min-width: 0; }
    .sm-appr-main b { font-weight: 500; }
    .sm-appr-main .badge { margin-left: 0; }
    .sm-appr-meta { grid-column: 1; font-size: var(--text-xs); color: var(--fg-3); min-width: 0; }
    .sm-appr-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: 8px; }
    .sec { color: var(--fg-3); }

    /* toolbar */
    .sm-tools { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .sm-search { flex: 1 1 260px; max-width: 340px; }
    .sm-ftoggle { display: none; }
    .sm-fcount { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: var(--text-2xs); }
    .sm-filters { display: contents; }
    .sm-sel { flex: 0 1 180px; min-width: 140px; }
    .sm-dates { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
    .sm-datefield { width: 150px; }
    .sm-date { width: 140px; }
    .sm-dash { color: var(--fg-3); }
    .sm-types { align-self: flex-start; }
    .sm-types button { flex: none; }

    /* ledger table: two-line rows (primary / secondary) */
    .sm-skel { display: grid; gap: 14px; }
    .sm-table td { height: 52px; vertical-align: middle; }
    .sm-table th, .sm-table td { padding-left: 10px; padding-right: 10px; }
    .sm-table th:first-child, .sm-table td:first-child { padding-left: 16px; }
    .sm-vkn { display: none; }
    .th-sub { font-weight: 400; color: var(--fg-3); }
    .sm-l1, .sm-l2 { display: block; overflow: hidden; text-overflow: ellipsis; }
    .sm-l2 { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); margin-top: 2px; }
    .sm-l1.mono, .sm-l2.mono, .sm-l2 .mono { font-size: var(--text-xs); }
    .sm-l2 b { font-weight: 600; color: var(--fg); }
    .sm-prod { max-width: 200px; }
    .sm-prod b { font-weight: 500; }
    .sm-table td.sm-type { max-width: 136px; }
    .sm-table td.sm-wh { max-width: 150px; }
    .sm-table td.sm-doc { max-width: 170px; }
    .sm-table td.sm-notecell { max-width: 170px; }
    .sm-qty { font-weight: 600; font-variant-numeric: tabular-nums; }
    .sm-qty.pos { color: var(--success); }
    .sm-qty.neg { color: var(--danger); }
    .sm-unit { margin-left: 4px; color: var(--fg-3); font-size: var(--text-xs); }
    .sm-note { color: var(--fg-2); }
    .sm-chips { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .sm-chips .badge { margin-left: 0; }
    .sm-att { margin-left: -4px; }
    .sm-by { font-weight: 500; color: var(--fg-2); }
    .sm-by.is-system { font-weight: 400; color: var(--fg-3); }
    tr.is-reversed td { color: var(--fg-3); }
    tr.is-reversed .sm-qty { color: var(--fg-3); text-decoration: line-through; }
    .badge-in, .badge-return { --badge-bg: var(--success-soft); --badge-fg: var(--success); --badge-line: var(--success-line); --badge-dot: var(--success-dot); }
    .badge-out, .badge-order { --badge-bg: var(--neutral-badge-bg); --badge-fg: var(--neutral-badge-fg); --badge-line: var(--neutral-badge-line); --badge-dot: var(--fg-3); }
    .badge-disposal { --badge-bg: var(--danger-soft); --badge-fg: var(--danger); --badge-line: var(--danger-line); --badge-dot: var(--danger-dot); }
    .badge-transfer-in, .badge-transfer-out, .badge-quarantine { --badge-bg: var(--info-soft); --badge-fg: var(--info); --badge-line: var(--info-line); --badge-dot: var(--accent); }
    .badge-adjustment, .badge-reversal { --badge-bg: var(--warning-soft); --badge-fg: var(--warning); --badge-line: var(--warning-line); --badge-dot: var(--warning-dot); }
    .tbl-foot .pagination-actions .btn-icon svg { color: var(--fg-2); }
    .sm-mlist { display: none; }

    /* adjustment drawer */
    .drawer-body > * { flex-shrink: 0; }
    .sm-form { flex: 1; min-height: 0; gap: 0; }
    .sm-form .drawer-body { gap: 0; }
    .sm-intro { margin-bottom: 4px; }
    .sm-calc { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px; align-items: end; padding: 12px 14px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .sm-calc-c { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .sm-calc-c.r { align-items: flex-end; text-align: right; }
    .sm-calc-v { height: var(--h-md); display: flex; align-items: center; font-size: var(--text-md); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--fg); white-space: nowrap; }
    .sm-calc-in .field { background: var(--surface); }
    .sm-attach { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
    .sm-attach > label.btn { cursor: pointer; }
    .sm-file { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 220px; font-size: var(--text-sm); color: var(--fg-2); }
    .sm-file app-icon { color: var(--fg-3); flex: none; }
    .sm-rev { margin-top: 12px; }

    /* attachments modal */
    .sm-att-list { list-style: none; margin: 0; padding: 0; }
    .sm-att-list li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 0; box-shadow: inset 0 -1px 0 var(--line); }
    .sm-att-list li:last-child { box-shadow: none; }
    .sm-att-ic { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--line); color: var(--fg-3); }
    .sm-att-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sm-att-t b { font-weight: 500; color: var(--fg); }
    .sm-att-t .sec { font-size: var(--text-xs); }
    .sm-sha { font-size: var(--text-2xs); color: var(--fg-3); }

    @media (max-width: 640px) {
      /* header: title left, "…" + primary inline right (as /products, /orders) */
      .page-header { flex-wrap: nowrap; }
      .page-header > :first-child { flex: 1 1 auto; }
      .page-actions { flex-wrap: nowrap; flex: none; }

      /* toolbar: search + "Filters" toggle on one row; the rest collapses */
      .sm-tools .toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
      .sm-search { max-width: none; }
      .sm-search kbd { display: none; }
      .sm-ftoggle { display: inline-flex; height: var(--h-md); min-width: var(--h-md); padding: 0 10px; gap: 6px; }
      .sm-flabel { display: none; }
      .sm-filters { display: none; }
      .sm-filters.is-open { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .sm-sel { min-width: 0; }
      .sm-dates { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 6px; }
      .sm-datefield { width: auto; grid-column: 1 / -1; }
      .sm-date { width: auto; min-width: 0; }
      .sm-dates > .btn { grid-column: 1 / -1; justify-self: start; }
      .sm-types { align-self: stretch; mask-image: linear-gradient(90deg, black calc(100% - 24px), transparent); padding-right: 20px; }

      .sm-appr { grid-template-columns: minmax(0, 1fr); }
      .sm-appr-actions { grid-column: 1; grid-row: auto; }

      /* compact ledger list (table hidden):
           product ··························· qty unit
           [type] reason ······················ prev → new
           warehouse · lot · date time ········ [reverse]
           DOC-NO  reference  chips                       */
      .table-scroll:has(.sm-table) { display: none; }
      .sm-mlist { display: block; }
      .sm-mrow { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; padding: 10px 14px; }
      .sm-mrow .v { white-space: nowrap; }
      .sm-mrow .s.r { white-space: nowrap; }
      .sm-mrow .s.r b { font-weight: 600; color: var(--fg); overflow: visible; }
      .sm-m-type { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--fg-2); }
      .sm-m-type .badge { margin-left: 0; flex: none; }
      .sm-m-reason { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .sm-m-meta .mono { font-size: var(--text-2xs); }
      .sm-m-act { display: flex; justify-content: flex-end; min-height: 0; overflow: visible; }
      .sm-m-act .btn { margin: -4px -6px -4px 0; }
      .sm-m-doc { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .sm-m-doc > * { flex: none; }
      .sm-m-doc .mono { color: var(--fg-2); }
      .sm-m-doc .badge { margin-left: 0; }
      .sm-m-doc .sm-m-ref { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .sm-mrow.is-reversed b, .sm-mrow.is-reversed .sm-m-reason { color: var(--fg-3); }
      .sm-mrow.is-reversed .sm-qty { color: var(--fg-3); text-decoration: line-through; }
      .sm-calc { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .sm-calc-in { grid-column: 1 / -1; order: 3; }
    }
  `]
})
export class StockMovementsComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  readonly typePills = TYPE_PILLS;
  readonly allReasons = MOVEMENT_REASONS;
  readonly docTypes = MOVEMENT_DOCUMENT_TYPES.filter((d) => !['ORDER', 'PURCHASE_ORDER', 'STOCK_COUNT', 'TRANSFER'].includes(d));

  movements = signal<StockMovement[]>([]);
  products = signal<Product[]>([]);
  warehouses = signal<Warehouse[]>([]);
  lots = signal<StockLot[]>([]);
  pendingRequests = signal<StockAdjustmentRequest[]>([]);
  selectedWarehouseId = signal<string>('');
  selectedReason = signal<string>('');
  dateField = signal<'transactionDate' | 'createdAt'>('transactionDate');
  warehouseMap = computed(() => new Map(this.warehouses().map(w => [w.id, w.name])));
  isLoading = signal(true);
  searchQuery = signal('');

  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedTypes = signal<string[]>([]);

  currentPage = signal(1);
  totalItems = signal(0);
  pageSize = signal(10);
  totalPages = computed(() => Math.ceil(this.totalItems() / this.pageSize()));

  isDrawerOpen = signal(false);
  isSaving = signal(false);
  selectedProduct = signal<Product | null>(null);
  currentQty = signal(0);
  formValue = signal<Record<string, any>>({});
  attachment = signal<{ fileName: string; mimeType: string; dataBase64: string } | null>(null);

  reverseTarget = signal<StockMovement | null>(null);
  reverseNote = signal('');
  isReversing = signal(false);
  decidingId = signal<string | null>(null);
  attachmentTarget = signal<StockMovement | null>(null);
  attachments = signal<MovementAttachment[]>([]);
  /** Mobile header overflow menu. */
  moreOpen = signal(false);
  /** Mobile: filter panel (warehouse, reason, dates) is collapsed behind a toggle. */
  filtersOpen = signal(false);
  activeFilterCount = computed(() => [this.selectedWarehouseId(), this.selectedReason(), this.startDate() || this.endDate()].filter(Boolean).length);

  /** Effective evidence rules from the server (legal parameter); library defaults until loaded. */
  reasonRules = signal<ReasonRule[]>([]);

  isAdmin = computed(() => this.ui.userProfile()?.role === 'admin');
  canEdit = computed(() => ['admin', 'manager'].includes(this.ui.userProfile()?.role));

  adjustForm: FormGroup = this.fb.group({
    productId: ['', Validators.required],
    warehouseId: [''],
    lotId: [''],
    newQuantity: [null as number | null, [Validators.required, Validators.min(0)]],
    reasonCode: ['', Validators.required],
    transactionDate: [''],
    documentType: [''],
    documentNo: [''],
    documentDate: [''],
    note: ['', Validators.required],
  });

  decimals = computed(() => productDecimals(this.selectedProduct()));
  delta = computed(() => {
    const v = this.formValue()['newQuantity'];
    if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return 0;
    return Math.round((Number(v) - this.currentQty()) * 10000) / 10000;
  });
  /** Manual reasons that fit the direction of the change. */
  reasonOptions = computed(() => MOVEMENT_REASONS.filter((r) => r.manual && reasonAllowsDirection(r.code, this.delta())));
  private rule(code: string | null | undefined): { needsDocument: boolean; needsAttachment: boolean } | undefined {
    return this.reasonRules().find((r) => r.code === code) || MOVEMENT_REASONS.find((r) => r.code === code);
  }
  needsDocument = computed(() => !!this.rule(this.formValue()['reasonCode'])?.needsDocument);
  needsAttachment = computed(() => !!this.rule(this.formValue()['reasonCode'])?.needsAttachment);
  documentMissing = computed(() => this.needsDocument() && (!this.formValue()['documentNo'] || !this.formValue()['documentDate']));
  attachmentMissing = computed(() => this.needsAttachment() && !this.attachment());
  reasonHint = computed(() => {
    const code = this.formValue()['reasonCode'];
    if (!code) return '';
    const key = `stockMovements.reasonHint.${code}`;
    const t = this.i18n.t(key);
    return t === key ? '' : t;
  });

  constructor() {
    this.adjustForm.valueChanges.subscribe((v) => {
      this.formValue.set({ ...v });
      const r = v.reasonCode;
      if (r && !this.reasonOptions().some((o) => o.code === r)) this.adjustForm.patchValue({ reasonCode: '' }, { emitEvent: false });
    });
  }

  ngOnInit() {
    this.loadProducts();
    this.inventory.getWarehouses().subscribe({ next: (data) => this.warehouses.set(data || []) });
    this.loadPending();
    this.inventory.getReasonRules().subscribe({ next: (rules) => this.reasonRules.set(rules || []), error: () => this.reasonRules.set([]) });
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      this.loadMovements(1);
      // "N then M" / command palette: open the adjustment drawer.
      if (params['open'] === 'new') {
        if (this.canEdit()) this.openDrawer();
        this.router.navigate([], { relativeTo: this.route, queryParams: { open: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    });
  }

  /** Esc closes the topmost overlay. */
  onEscape() {
    if (this.moreOpen()) this.moreOpen.set(false);
    else if (this.isDrawerOpen()) this.closeDrawer();
  }

  private searchTimeout: any;

  refreshAll() {
    this.loadMovements(this.currentPage());
    this.loadPending();
  }

  loadPending() {
    this.inventory.getAdjustmentRequests('PENDING').subscribe({
      next: (list) => this.pendingRequests.set(list || []),
      error: () => this.pendingRequests.set([]),
    });
  }

  private typeParam(): string | undefined {
    return this.selectedTypes().length > 0 ? this.selectedTypes().join(',') : undefined;
  }

  loadMovements(page = 1) {
    this.isLoading.set(true);
    this.inventory.getStockMovements(
      undefined, page, this.pageSize(), this.searchQuery(), this.startDate() || undefined, this.endDate() || undefined,
      this.typeParam(), this.selectedWarehouseId() || undefined, this.selectedReason() || undefined, this.dateField(),
    ).subscribe({
      next: (res) => {
        this.movements.set(res.data);
        this.totalItems.set(res.total);
        this.currentPage.set(page);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.ui.showToast(this.i18n.t('stockMovements.toast.loadError'), 'error');
      }
    });
  }

  loadProducts() {
    this.inventory.getProducts().subscribe({ next: (data) => this.products.set(data) });
  }

  onStartDateChange(val: string) { this.startDate.set(val); this.loadMovements(1); }
  onEndDateChange(val: string) { this.endDate.set(val); this.loadMovements(1); }
  clearDateFilter() { this.startDate.set(''); this.endDate.set(''); this.loadMovements(1); }

  toggleType(type: string) {
    if (type === 'ALL') {
      this.selectedTypes.set([]);
    } else {
      const current = this.selectedTypes();
      this.selectedTypes.set(current.includes(type) ? current.filter(t => t !== type) : [...current, type]);
    }
    this.loadMovements(1);
  }

  exportToCSV() {
    this.inventory.getStockMovements(
      undefined, 1, 100000, this.searchQuery(), this.startDate() || undefined, this.endDate() || undefined,
      this.typeParam(), this.selectedWarehouseId() || undefined, this.selectedReason() || undefined, this.dateField(),
    ).subscribe({
      next: (res) => {
        const list = res.data;
        if (!list || list.length === 0) {
          this.ui.showToast(this.i18n.t('stockMovements.toast.nothingToExport'), 'error');
          return;
        }
        const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const headers = [
          'stockMovements.csv.sequenceNo', 'stockMovements.csv.transactionDate', 'stockMovements.csv.recordedAt', 'stockMovements.csv.productName', 'stockMovements.csv.sku',
          'stockMovements.csv.type', 'stockMovements.csv.reason', 'stockMovements.csv.warehouse', 'stockMovements.csv.lot', 'stockMovements.csv.quantity', 'stockMovements.csv.unit',
          'stockMovements.csv.previousStock', 'stockMovements.csv.newStock', 'stockMovements.csv.documentType', 'stockMovements.csv.documentNo', 'stockMovements.csv.documentDate',
          'stockMovements.csv.counterpartyTaxId', 'stockMovements.csv.note', 'stockMovements.csv.referenceType', 'stockMovements.csv.referenceId', 'stockMovements.csv.performedBy', 'stockMovements.csv.hash',
        ].map(k => q(this.i18n.t(k)));
        const num = (n: number) => q(this.i18n.formatNumber(n, { useGrouping: false, maximumFractionDigits: 4 }));
        const rows = list.map((m) => [
          m.sequenceNo, q(this.i18n.formatDate(m.transactionDate, 'datetime')), q(this.i18n.formatDate(m.createdAt, 'datetime')), q(m.productName), q(m.productSku),
          q(this.getTypeName(m.type)), q(this.reasonLabel(m.reasonCode)), q(m.warehouseName || this.getWarehouseName(m.warehouseId)), q(m.lotNumber), num(m.quantity), q(m.unitCode),
          num(m.previousQuantity), num(m.newQuantity), q(m.documentType ? this.docTypeLabel(m.documentType) : ''), q(m.documentNo), q(m.documentDate),
          q(m.counterpartyTaxId), q(m.note), q(m.referenceType), q(m.referenceId), q(m.performedBy), q(m.hash),
        ].join(';'));
        const csvContent = [headers.join(';'), ...rows].join('\n');
        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${this.i18n.t('stockMovements.csv.fileName')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.ui.showToast(this.i18n.t('stockMovements.toast.exported'), 'success');
      },
      error: () => this.ui.showToast(this.i18n.t('stockMovements.toast.exportError'), 'error'),
    });
  }

  onSearch(query: string) {
    this.searchQuery.set(query);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadMovements(1), 300);
  }

  formatSerials(serials: string[] | null | undefined): string {
    const list = serials || [];
    if (list.length <= 3) return list.join(', ');
    return list.slice(0, 3).join(', ') + ' ' + this.i18n.t('stockMovements.moreSerials', { count: list.length - 3 });
  }

  getWarehouseName(id: string | null | undefined): string {
    if (!id) return '—';
    return this.warehouseMap().get(id) || '—';
  }

  /**
   * System-generated movement notes are stored in Turkish by the backend.
   * Map the known patterns to dictionary keys so every UI language reads them localized and in sentence case;
   * free-text notes typed by users are shown as is.
   */
  /** Note/reference text without the document number the Document column already shows. */
  noteRef(m: StockMovement): string {
    const note = m.note;
    if (!note) return '';
    const doc = m.documentNo;
    if (doc) {
      for (const [re, , names] of SYSTEM_NOTES) {
        const hit = note.match(re);
        if (!hit) continue;
        const p: Record<string, string> = {};
        names.forEach((n, i) => (p[n] = hit[i + 1] ?? ''));
        if (p['no'] !== doc) break;
        if (p['ref']) return p['ref'];
        if (p['reason']) return p['reason'];
        if (p['inv']) return this.i18n.t('stockMovements.sysNote.invoiceRef', { no: p['inv'] }).trim().replace(/^\((.*)\)$/, '$1');
        return '';
      }
    }
    const label = this.noteLabel(note);
    return label === doc ? '' : label;
  }

  noteLabel(note: string | null | undefined): string {
    if (!note) return '';
    for (const [re, key, names] of SYSTEM_NOTES) {
      const m = note.match(re);
      if (!m) continue;
      const params: Record<string, string> = {};
      names.forEach((n, i) => (params[n] = m[i + 1] ?? ''));
      if (params['inv'] !== undefined) params['inv'] = params['inv'] ? this.i18n.t('stockMovements.sysNote.invoiceRef', { no: params['inv'] }) : '';
      const t = this.i18n.t(key, params);
      return t === key ? note : t;
    }
    return note;
  }

  isSystem(by: string | null | undefined): boolean {
    return !by || by.toLowerCase() === 'system' || by === 'SeedSystem';
  }

  getStartCount(): number {
    if (this.totalItems() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  }

  getEndCount(): number {
    return Math.min(this.currentPage() * this.pageSize(), this.totalItems());
  }

  getPagesArray(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) if (i >= 1 && i <= total) pages.push(i);
    return pages;
  }

  // ─── Adjustment drawer ───

  /** Current local time as datetime-local value (max of the transaction date). */
  nowLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  openDrawer() {
    this.adjustForm.reset({ productId: '', warehouseId: '', lotId: '', newQuantity: null, reasonCode: '', transactionDate: this.nowLocal(), documentType: '', documentNo: '', documentDate: '', note: '' });
    this.selectedProduct.set(null);
    this.attachment.set(null);
    this.currentQty.set(0);
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.selectedProduct.set(null);
    this.attachment.set(null);
  }

  onProductSelect() {
    const pId = this.adjustForm.get('productId')?.value;
    const prod = this.products().find(p => p.id === pId) || null;
    this.selectedProduct.set(prod);
    this.lots.set([]);
    this.adjustForm.patchValue({ warehouseId: '', lotId: '' });
    if (prod?.trackingType === 'lot') {
      this.inventory.getProductLots(prod.id).subscribe({ next: (lots) => { this.lots.set(lots || []); this.syncCurrent(); } });
    }
    this.syncCurrent();
  }

  /** Current quantity of the adjusted scope (lot / warehouse / product total); prefills the target. */
  syncCurrent() {
    const prod = this.selectedProduct();
    if (!prod) return;
    const { warehouseId, lotId } = this.adjustForm.value;
    let qty = prod.quantity;
    if (prod.trackingType === 'lot') {
      qty = this.lots().find((l) => l.id === lotId)?.quantity ?? 0;
    } else if (warehouseId) {
      const name = this.warehouseMap().get(warehouseId);
      qty = (name && prod.warehouses?.[name]) || 0;
    }
    this.currentQty.set(Number(qty) || 0);
    this.adjustForm.patchValue({ newQuantity: Number(qty) || 0 });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      this.ui.showToast(this.i18n.t('stockMovements.adjust.attachmentTooLarge'), 'error');
      return;
    }
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/octet-stream');
    if (!ATTACHMENT_TYPES.includes(mimeType)) {
      this.ui.showToast(this.i18n.t('stockMovements.adjust.attachmentType'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      this.attachment.set({ fileName: file.name, mimeType, dataBase64: data.slice(data.indexOf(',') + 1) });
    };
    reader.readAsDataURL(file);
  }

  hasValue(fieldName: string): boolean {
    const val = this.adjustForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.adjustForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  saveAdjustment() {
    if (this.adjustForm.invalid || this.documentMissing() || this.attachmentMissing()) {
      this.adjustForm.markAllAsTouched();
      return;
    }
    const v = this.adjustForm.value;
    const prod = this.selectedProduct();
    this.isSaving.set(true);
    this.inventory.createManualAdjustment({
      productId: v.productId,
      newQuantity: Number(v.newQuantity),
      warehouseId: prod?.trackingType === 'lot' ? null : v.warehouseId || null,
      lotId: prod?.trackingType === 'lot' ? v.lotId || null : null,
      reasonCode: v.reasonCode,
      note: v.note,
      transactionDate: v.transactionDate || null,
      documentType: v.documentType || null,
      documentNo: v.documentNo || null,
      documentDate: v.documentDate || null,
      attachment: this.attachment(),
    }).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.closeDrawer();
        const body = res.body;
        if (res.status === 202 || body?.status === 'PENDING_APPROVAL') {
          this.ui.showToast(this.i18n.t('stockMovements.toast.pendingApproval'), 'info');
          this.loadPending();
        } else {
          toastMovementResult(this.ui, this.i18n, body?.warnings, 'stockMovements.toast.adjusted');
        }
        this.loadMovements(1);
        this.loadProducts();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err?.error?.message || this.i18n.t('stockMovements.toast.adjustError'), 'error');
      }
    });
  }

  // ─── Reversal ───

  openReverse(m: StockMovement) {
    this.reverseNote.set('');
    this.reverseTarget.set(m);
  }

  confirmReverse() {
    const m = this.reverseTarget();
    if (!m || !this.reverseNote().trim()) return;
    this.isReversing.set(true);
    this.inventory.reverseMovement(m.id, this.reverseNote().trim()).subscribe({
      next: (res) => {
        this.isReversing.set(false);
        this.reverseTarget.set(null);
        if (res.status === 202 || res.body?.status === 'PENDING_APPROVAL') {
          this.ui.showToast(this.i18n.t('stockMovements.toast.reversalPending'), 'info');
          this.loadPending();
        } else {
          toastMovementResult(this.ui, this.i18n, res.body?.warnings, 'stockMovements.toast.reversed');
        }
        this.loadMovements(1);
        this.loadProducts();
      },
      error: (err) => {
        this.isReversing.set(false);
        this.ui.showToast(err?.error?.message || this.i18n.t('stockMovements.toast.reverseError'), 'error');
      },
    });
  }

  // ─── Maker-checker ───

  decide(r: StockAdjustmentRequest, approve: boolean) {
    this.decidingId.set(r.id);
    this.inventory.decideAdjustmentRequest(r.id, approve).subscribe({
      next: (res) => {
        this.decidingId.set(null);
        toastMovementResult(this.ui, this.i18n, res?.warnings, approve ? 'stockMovements.approvals.approved' : 'stockMovements.approvals.rejected');
        this.loadPending();
        this.loadMovements(1);
        this.loadProducts();
      },
      error: (err) => {
        this.decidingId.set(null);
        this.ui.showToast(err?.error?.message || this.i18n.t('stockMovements.toast.adjustError'), 'error');
      },
    });
  }

  // ─── Attachments ───

  openAttachments(m: StockMovement) {
    this.attachments.set([]);
    this.attachmentTarget.set(m);
    this.inventory.getMovementAttachments(m.id).subscribe({ next: (list) => this.attachments.set(list || []) });
  }

  download(a: MovementAttachment) {
    this.inventory.downloadMovementAttachment(a.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      error: () => this.ui.showToast(this.i18n.t('stockMovements.attachments.downloadError'), 'error'),
    });
  }

  // ─── Labels ───

  reasonLabel(code: string | null | undefined): string {
    if (!code) return '';
    const key = `stockMovements.reason.${code}`;
    const t = this.i18n.t(key);
    return t === key ? code : t;
  }

  docTypeLabel(type: string | null | undefined): string {
    if (!type) return '';
    const key = `stockMovements.docType.${type}`;
    const t = this.i18n.t(key);
    return t === key ? type : t;
  }

  getTypeName(type: string) {
    switch (type) {
      case 'IN': return this.i18n.t('stockMovements.type.in');
      case 'OUT': return this.i18n.t('stockMovements.type.out');
      case 'ORDER': return this.i18n.t('stockMovements.type.order');
      case 'RETURN': return this.i18n.t('stockMovements.type.return');
      case 'ADJUSTMENT': return this.i18n.t('stockMovements.type.adjustment');
      case 'TRANSFER_OUT': return this.i18n.t('stockMovements.type.transferOut');
      case 'TRANSFER_IN': return this.i18n.t('stockMovements.type.transferIn');
      case 'REVERSAL': return this.i18n.t('stockMovements.type.reversal');
      case 'DISPOSAL': return this.i18n.t('stockMovements.type.disposal');
      case 'QUARANTINE_IN': return this.i18n.t('stockMovements.type.quarantineIn');
      case 'QUARANTINE_OUT': return this.i18n.t('stockMovements.type.quarantineOut');
      default: return type;
    }
  }

  getBadgeClass(type: string) {
    switch (type) {
      case 'IN': return 'badge-in';
      case 'ORDER': return 'badge-order';
      case 'RETURN': return 'badge-return';
      case 'ADJUSTMENT': return 'badge-adjustment';
      case 'OUT': return 'badge-out';
      case 'TRANSFER_OUT': return 'badge-transfer-out';
      case 'TRANSFER_IN': return 'badge-transfer-in';
      case 'REVERSAL': return 'badge-reversal';
      case 'DISPOSAL': return 'badge-disposal';
      case 'QUARANTINE_IN':
      case 'QUARANTINE_OUT': return 'badge-quarantine';
      default: return '';
    }
  }
}
