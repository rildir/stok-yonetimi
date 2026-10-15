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

@Component({
  selector: 'app-stock-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent, ModalComponent, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, QuantityInputDirective],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'stockMovements.title' | t }}</h1>
        <p>{{ 'stockMovements.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" (click)="refreshAll()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>
          {{ 'stockMovements.refresh' | t }}
        </button>
        <button class="btn btn-secondary" (click)="exportToCSV()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          {{ 'stockMovements.export' | t }}
        </button>
        @if (canEdit()) {
          <button class="btn btn-primary" (click)="openDrawer()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'stockMovements.manualAdjustment' | t }}
          </button>
        }
      </div>
    </header>

    @if (pendingRequests().length) {
      <section class="card sm-approvals" aria-live="polite">
        <div class="sm-approvals-head">
          <h2 class="sm-approvals-title">{{ 'stockMovements.approvals.title' | t }}</h2>
          <span class="badge badge-warning">{{ pendingRequests().length }}</span>
        </div>
        <p class="text-sm text-muted">{{ 'stockMovements.approvals.hint' | t }}</p>
        <ul class="sm-approval-list">
          @for (r of pendingRequests(); track r.id) {
            <li class="sm-approval">
              <div class="sm-approval-main">
                <strong>{{ r.productName }}</strong>
                <span class="num" [class.text-success]="r.quantityDelta > 0" [class.text-danger]="r.quantityDelta < 0">{{ r.quantityDelta > 0 ? '+' : '' }}{{ r.quantityDelta | num }}</span>
                <span class="badge badge-neutral">{{ reasonLabel(r.payload.reasonCode) }}</span>
                <span class="text-sm text-muted">{{ 'stockMovements.approvals.value' | t: { value: (r.estimatedValue | money: r.currency), threshold: (r.threshold | money: r.currency) } }}</span>
              </div>
              <div class="sm-approval-meta text-xs text-muted">
                {{ 'stockMovements.approvals.requestedBy' | t: { user: r.requestedBy } }} · {{ r.createdAt | appDate: 'datetime' }}
                @if (r.payload.note) { · “{{ r.payload.note }}” }
              </div>
              @if (isAdmin()) {
                <div class="sm-approval-actions">
                  <button type="button" class="btn btn-sm btn-secondary" [disabled]="decidingId() === r.id" (click)="decide(r, false)">{{ 'stockMovements.approvals.reject' | t }}</button>
                  <button type="button" class="btn btn-sm btn-primary" [disabled]="decidingId() === r.id" (click)="decide(r, true)">{{ 'stockMovements.approvals.approve' | t }}</button>
                </div>
              }
            </li>
          }
        </ul>
      </section>
    }

    <div class="filter-bar sm-filters">
      <div class="sm-filter-group">
        <div class="search-box sm-search">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" [placeholder]="'stockMovements.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)" />
        </div>

        <select class="select sm-select" [ngModel]="selectedWarehouseId()" (ngModelChange)="selectedWarehouseId.set($event); loadMovements(1)" [title]="'stockMovements.filter.warehouse' | t">
          <option value="">{{ 'stockMovements.filter.allWarehouses' | t }}</option>
          @for (w of warehouses(); track w.id) {
            <option [value]="w.id">{{ w.name }}</option>
          }
        </select>

        <select class="select sm-select" [ngModel]="selectedReason()" (ngModelChange)="selectedReason.set($event); loadMovements(1)" [title]="'stockMovements.filter.reason' | t">
          <option value="">{{ 'stockMovements.filter.allReasons' | t }}</option>
          @for (r of allReasons; track r.code) {
            <option [value]="r.code">{{ reasonLabel(r.code) }}</option>
          }
        </select>

        <div class="sm-dates">
          <select class="select sm-datefield" [ngModel]="dateField()" (ngModelChange)="dateField.set($event); loadMovements(1)" [title]="'stockMovements.filter.dateField' | t">
            <option value="transactionDate">{{ 'stockMovements.transactionDate' | t }}</option>
            <option value="createdAt">{{ 'stockMovements.recordedAt' | t }}</option>
          </select>
          <input type="date" class="input sm-date" [ngModel]="startDate()" (ngModelChange)="onStartDateChange($event)" [title]="'stockMovements.startDateTitle' | t" [attr.aria-label]="'stockMovements.startDateTitle' | t" />
          <span class="text-muted">–</span>
          <input type="date" class="input sm-date" [ngModel]="endDate()" (ngModelChange)="onEndDateChange($event)" [title]="'stockMovements.endDateTitle' | t" [attr.aria-label]="'stockMovements.endDateTitle' | t" />
          @if (startDate() || endDate()) {
            <button class="btn btn-sm btn-ghost" (click)="clearDateFilter()">{{ 'stockMovements.clear' | t }}</button>
          }
        </div>
      </div>

      <div class="filter-pills">
        <button type="button" class="filter-pill" [class.active]="selectedTypes().length === 0" (click)="toggleType('ALL')">{{ 'stockMovements.filter.all' | t }}</button>
        @for (p of typePills; track p.type) {
          <button type="button" class="filter-pill" [class.active]="selectedTypes().includes(p.type)" (click)="toggleType(p.type)">{{ p.key | t }}</button>
        }
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div style="padding: var(--space-4); display: grid; gap: var(--space-3);"><div class="skeleton" style="height: 20px;"></div><div class="skeleton" style="height: 20px;"></div><div class="skeleton" style="height: 20px;"></div><div class="skeleton" style="height: 20px;"></div></div>
      } @else if (movements().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg></div>
          <p class="empty-state-title">{{ 'stockMovements.empty' | t }}</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive sm-table">
            <thead>
              <tr>
                <th>{{ 'stockMovements.transactionDate' | t }}</th>
                <th>{{ 'stockMovements.col.productName' | t }}</th>
                <th>{{ 'stockMovements.col.type' | t }}</th>
                <th>{{ 'stockMovements.col.warehouse' | t }}</th>
                <th>{{ 'stockMovements.col.lotSerial' | t }}</th>
                <th class="num">{{ 'stockMovements.col.quantity' | t }}</th>
                <th class="num">{{ 'stockMovements.col.newStock' | t }}</th>
                <th>{{ 'stockMovements.col.document' | t }}</th>
                <th>{{ 'stockMovements.col.noteRef' | t }}</th>
                <th>{{ 'stockMovements.recordedAt' | t }}</th>
                <th><span class="sr-only">{{ 'stockMovements.col.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (m of movements(); track m.id) {
                <tr [class.sm-row-reversed]="m.reversedByMovementId">
                  <td class="nowrap" [attr.data-label]="'stockMovements.transactionDate' | t">
                    <div>{{ m.transactionDate | appDate: 'datetime' }}</div>
                    <div class="text-2xs text-muted mono" [title]="'stockMovements.sequenceNo' | t">#{{ m.sequenceNo }}</div>
                  </td>
                  <td class="td-primary">
                    <strong>{{ m.productName }}</strong>
                    @if (m.productSku) { <div class="text-xs text-muted mono">{{ m.productSku }}</div> }
                  </td>
                  <td [attr.data-label]="'stockMovements.col.type' | t">
                    <span class="badge" [ngClass]="getBadgeClass(m.type)">{{ getTypeName(m.type) }}</span>
                    <div class="text-xs text-muted sm-reason">{{ reasonLabel(m.reasonCode) }}</div>
                  </td>
                  <td [attr.data-label]="'stockMovements.col.warehouse' | t">{{ m.warehouseName || getWarehouseName(m.warehouseId) }}</td>
                  <td [attr.data-label]="'stockMovements.col.lotSerial' | t">
                    @if (m.lotNumber) {
                      <span class="badge badge-neutral" [title]="'stockMovements.lot' | t">{{ 'stockMovements.lot' | t }}: {{ m.lotNumber }}</span>
                    }
                    @if (m.serials?.length) {
                      <div class="text-xs text-muted truncate mono" [title]="m.serials!.join(', ')" style="max-width: 180px;">
                        {{ 'stockMovements.serials' | t }}: {{ formatSerials(m.serials) }}
                      </div>
                    }
                    @if (!m.lotNumber && !m.serials?.length) { <span class="text-muted">-</span> }
                  </td>
                  <td class="num nowrap" [attr.data-label]="'stockMovements.col.quantity' | t">
                    <span [class.text-success]="m.quantity > 0" [class.text-danger]="m.quantity < 0">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity | num }}</span>
                    @if (m.unitCode) { <span class="text-xs text-muted"> {{ m.unitCode | unitLabel }}</span> }
                  </td>
                  <td class="num nowrap" [attr.data-label]="'stockMovements.col.newStock' | t">
                    <span class="text-xs text-muted">{{ m.previousQuantity | num }}&nbsp;→&nbsp;</span>
                    <strong>{{ m.newQuantity | num }}</strong>
                  </td>
                  <td [attr.data-label]="'stockMovements.col.document' | t">
                    @if (m.documentNo) {
                      <div class="text-xs"><span class="text-muted">{{ docTypeLabel(m.documentType) }}</span></div>
                      <div class="mono text-xs">{{ m.documentNo }}</div>
                      @if (m.documentDate) { <div class="text-2xs text-muted">{{ m.documentDate | appDate }}</div> }
                    } @else { <span class="text-muted">-</span> }
                    @if (m.counterpartyTaxId) { <div class="text-2xs text-muted mono" [title]="'stockMovements.counterpartyTaxId' | t">{{ 'stockMovements.vknShort' | t }} {{ m.counterpartyTaxId }}</div> }
                  </td>
                  <td [attr.data-label]="'stockMovements.col.noteRef' | t">
                    @if (m.note) { <div class="text-xs text-muted sm-note">{{ m.note }}</div> }
                    @if (m.reversesMovementId) {
                      <span class="badge badge-info">{{ 'stockMovements.reverse.isReversal' | t }}</span>
                    }
                    @if (m.reversedByMovementId) {
                      <span class="badge badge-neutral">{{ 'stockMovements.reverse.reversedBadge' | t }}</span>
                    }
                    @if (m.attachmentCount) {
                      <button type="button" class="btn btn-sm btn-ghost sm-att" (click)="openAttachments(m)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        {{ 'stockMovements.attachments.count' | t: { count: m.attachmentCount } }}
                      </button>
                    }
                  </td>
                  <td class="nowrap" [attr.data-label]="'stockMovements.recordedAt' | t">
                    <div class="text-xs text-muted">{{ m.createdAt | appDate: 'datetime' }}</div>
                    <span class="performed-badge" [class.performed-system]="isSystem(m.performedBy)" [class.performed-admin]="!isSystem(m.performedBy)">
                      {{ isSystem(m.performedBy) ? ('stockMovements.system' | t) : m.performedBy }}
                    </span>
                  </td>
                  <td class="sm-actions">
                    @if (canEdit() && m.reversible) {
                      <button type="button" class="btn btn-sm btn-secondary" (click)="openReverse(m)" [title]="'stockMovements.reverse.action' | t">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
                        {{ 'stockMovements.reverse.action' | t }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination-bar">
          <div class="pagination-info">
            {{ 'stockMovements.pagination' | t: { total: totalItems(), start: getStartCount(), end: getEndCount() } }}
          </div>
          <div class="pagination-actions">
            <button class="page-btn" [disabled]="currentPage() === 1" (click)="loadMovements(currentPage() - 1)">{{ 'stockMovements.prev' | t }}</button>
            @for (p of getPagesArray(); track p) {
              <button class="page-btn" [class.active]="p === currentPage()" (click)="loadMovements(p)">{{ p }}</button>
            }
            <button class="page-btn" [disabled]="currentPage() >= totalPages()" (click)="loadMovements(currentPage() + 1)">{{ 'stockMovements.next' | t }}</button>
          </div>
        </div>
      }
    </div>

    <!-- Manual adjustment drawer -->
    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'stockMovements.drawerTitle' | t }}</span>
            <button class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="adjustForm" (ngSubmit)="saveAdjustment()" class="drawer-form">
            <div class="drawer-body">
              <p class="text-sm text-muted sm-intro">{{ 'stockMovements.adjust.intro' | t }}</p>

              <div class="form-field">
                <select id="adjProduct" formControlName="productId" class="form-input form-select" [class.has-value]="hasValue('productId')" (change)="onProductSelect()">
                  <option value="" disabled></option>
                  @for (p of products(); track p.id) {
                    <option [value]="p.id">{{ p.name }} (SKU: {{ p.sku }})</option>
                  }
                </select>
                <label for="adjProduct" class="form-label">{{ 'stockMovements.selectProduct' | t }}</label>
                @if (isFieldInvalid('productId')) { <div class="form-error">{{ 'stockMovements.validation.productRequired' | t }}</div> }
              </div>

              @if (selectedProduct(); as sp) {
                @if (sp.trackingType === 'serial') {
                  <div class="alert-banner alert-banner--info text-sm">{{ 'stockMovements.adjust.serialHint' | t }}</div>
                } @else if (sp.trackingType === 'lot') {
                  <div class="form-field">
                    <select id="adjLot" formControlName="lotId" class="form-input form-select" [class.has-value]="hasValue('lotId')" (change)="syncCurrent()">
                      <option value="" disabled></option>
                      @for (l of lots(); track l.id) {
                        <option [value]="l.id">{{ l.lotNumber }} · {{ l.warehouseName }} · {{ l.quantity | num }}{{ l.expiryDate ? ' · ' + (l.expiryDate | appDate) : '' }}</option>
                      }
                    </select>
                    <label for="adjLot" class="form-label">{{ 'stockMovements.adjust.lot' | t }}</label>
                  </div>
                } @else {
                  <div class="form-field">
                    <select id="adjWh" formControlName="warehouseId" class="form-input form-select has-value" (change)="syncCurrent()">
                      <option value="">{{ 'stockMovements.adjust.productTotal' | t }}</option>
                      @for (w of warehouses(); track w.id) {
                        <option [value]="w.id">{{ w.name }}</option>
                      }
                    </select>
                    <label for="adjWh" class="form-label">{{ 'stockMovements.adjust.warehouse' | t }}</label>
                  </div>
                }

                <div class="sm-current">
                  <span class="text-muted">{{ 'stockMovements.currentStock' | t }}:</span>
                  <strong class="num">{{ currentQty() | num }} {{ sp.baseUnit || sp.unit | unitLabel }}</strong>
                </div>

                <div class="sm-grid-2">
                  <div class="form-field">
                    <input id="adjNewQty" type="text" appQty [qtyDecimals]="decimals()" formControlName="newQuantity" class="form-input" [class.has-value]="hasValue('newQuantity')" />
                    <label for="adjNewQty" class="form-label">{{ 'stockMovements.newQuantity' | t }}</label>
                    @if (adjustForm.get('newQuantity')?.errors?.['qtyPrecision'] && adjustForm.get('newQuantity')?.touched) {
                      <div class="form-error">{{ 'stockMovements.validation.precision' | t: { decimals: decimals() } }}</div>
                    } @else if (isFieldInvalid('newQuantity')) {
                      <div class="form-error">{{ 'stockMovements.validation.quantityInvalid' | t }}</div>
                    }
                  </div>
                  <div class="sm-delta" [class.text-success]="delta() > 0" [class.text-danger]="delta() < 0">
                    <span class="text-xs text-muted">{{ 'stockMovements.adjust.delta' | t }}</span>
                    <strong class="num">{{ delta() > 0 ? '+' : '' }}{{ delta() | num }}</strong>
                  </div>
                </div>
              }

              <div class="form-field">
                <select id="adjReason" formControlName="reasonCode" class="form-input form-select" [class.has-value]="hasValue('reasonCode')">
                  <option value="" disabled></option>
                  @for (r of reasonOptions(); track r.code) {
                    <option [value]="r.code">{{ reasonLabel(r.code) }}</option>
                  }
                </select>
                <label for="adjReason" class="form-label">{{ 'stockMovements.adjust.reason' | t }}</label>
                @if (isFieldInvalid('reasonCode')) { <div class="form-error">{{ 'stockMovements.validation.reasonRequired' | t }}</div> }
                @if (reasonHint()) { <div class="field-hint">{{ reasonHint() }}</div> }
              </div>

              <div class="form-field">
                <input id="adjTx" type="datetime-local" formControlName="transactionDate" class="form-input has-value" [max]="nowLocal()" />
                <label for="adjTx" class="form-label">{{ 'stockMovements.transactionDate' | t }}</label>
                <div class="field-hint">{{ 'stockMovements.adjust.transactionDateHint' | t }}</div>
              </div>

              <fieldset class="sm-fieldset">
                <legend>{{ 'stockMovements.adjust.document' | t }}@if (needsDocument()) { <span class="text-danger"> *</span> }</legend>
                <div class="sm-grid-2">
                  <div class="form-field">
                    <select id="adjDocType" formControlName="documentType" class="form-input form-select has-value">
                      <option value="">—</option>
                      @for (d of docTypes; track d) { <option [value]="d">{{ docTypeLabel(d) }}</option> }
                    </select>
                    <label for="adjDocType" class="form-label">{{ 'stockMovements.adjust.documentType' | t }}</label>
                  </div>
                  <div class="form-field">
                    <input id="adjDocDate" type="date" formControlName="documentDate" class="form-input has-value" />
                    <label for="adjDocDate" class="form-label">{{ 'stockMovements.adjust.documentDate' | t }}</label>
                  </div>
                </div>
                <div class="form-field">
                  <input id="adjDocNo" type="text" formControlName="documentNo" maxlength="50" class="form-input" [class.has-value]="hasValue('documentNo')" />
                  <label for="adjDocNo" class="form-label">{{ 'stockMovements.adjust.documentNo' | t }}</label>
                  @if (documentMissing()) { <div class="form-error">{{ 'stockMovements.validation.documentRequired' | t }}</div> }
                </div>
                <div class="sm-attach">
                  <label class="btn btn-sm btn-secondary sm-attach-btn">
                    <input type="file" class="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv" (change)="onFile($event)" />
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    {{ 'stockMovements.adjust.attach' | t }}
                  </label>
                  @if (attachment(); as a) {
                    <span class="text-sm truncate">{{ a.fileName }}</span>
                    <button type="button" class="btn btn-sm btn-ghost" (click)="attachment.set(null)">{{ 'stockMovements.adjust.attachmentRemove' | t }}</button>
                  } @else {
                    <span class="text-xs text-muted">{{ 'stockMovements.adjust.attachHint' | t }}</span>
                  }
                </div>
              </fieldset>

              <div class="form-field">
                <textarea id="adjNote" formControlName="note" maxlength="255" class="form-input" [class.has-value]="hasValue('note')"></textarea>
                <label for="adjNote" class="form-label">{{ 'stockMovements.adjust.note' | t }}</label>
                @if (isFieldInvalid('note')) { <div class="form-error">{{ 'stockMovements.validation.noteRequired' | t }}</div> }
              </div>
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="adjustForm.invalid || isSaving() || !delta() || documentMissing()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'stockMovements.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Reversal confirmation -->
    <app-modal [isOpen]="!!reverseTarget()" [title]="'stockMovements.reverse.title' | t" (onClose)="reverseTarget.set(null)">
      @if (reverseTarget(); as m) {
        <p class="text-sm">{{ 'stockMovements.reverse.body' | t: { qty: (-m.quantity | num), product: m.productName } }}</p>
        <div class="form-field">
          <textarea id="revNote" class="form-input" [class.has-value]="!!reverseNote()" maxlength="255" [ngModel]="reverseNote()" (ngModelChange)="reverseNote.set($event)"></textarea>
          <label for="revNote" class="form-label">{{ 'stockMovements.reverse.note' | t }}</label>
        </div>
      }
      <div footer class="modal-actions">
        <button type="button" class="btn btn-secondary" (click)="reverseTarget.set(null)">{{ 'common.cancel' | t }}</button>
        <button type="button" class="btn btn-primary" [disabled]="!reverseNote().trim() || isReversing()" (click)="confirmReverse()">{{ 'stockMovements.reverse.confirm' | t }}</button>
      </div>
    </app-modal>

    <!-- Attachments -->
    <app-modal [isOpen]="!!attachmentTarget()" [title]="'stockMovements.attachments.title' | t" (onClose)="attachmentTarget.set(null)">
      <ul class="sm-att-list">
        @for (a of attachments(); track a.id) {
          <li>
            <div><strong class="text-sm">{{ a.fileName }}</strong> <span class="text-xs text-muted">{{ (a.size / 1024) | num: 1 }} KB · {{ a.createdAt | appDate: 'datetime' }}</span></div>
            <div class="text-2xs text-muted mono truncate" [title]="a.sha256">SHA-256 {{ a.sha256 }}</div>
            <button type="button" class="btn btn-sm btn-secondary" (click)="download(a)">{{ 'stockMovements.attachments.download' | t }}</button>
          </li>
        }
      </ul>
      <div footer class="modal-actions">
        <button type="button" class="btn btn-secondary" (click)="attachmentTarget.set(null)">{{ 'common.close' | t }}</button>
      </div>
    </app-modal>

    <app-toast></app-toast>
  `,
  styles: [`
    .text-success { color: var(--color-success-text); font-weight: var(--weight-semibold); }
    .text-danger { color: var(--color-danger-text); font-weight: var(--weight-semibold); }
    .nowrap { white-space: nowrap; }
    table tbody td { vertical-align: top; }
    .sm-table .sm-reason { margin-top: 2px; }
    .sm-note { max-width: 240px; margin-bottom: var(--space-1); }
    .sm-row-reversed td { opacity: .72; }
    .sm-actions { text-align: right; white-space: nowrap; }
    .sm-filters { flex-direction: column; align-items: stretch; gap: var(--space-3); }
    .sm-filter-group { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; min-width: 0; }
    @media (min-width: 641px) {
      .sm-table { min-width: 1240px; }
      .sm-table td.td-primary { min-width: 190px; }
    }
    .sm-search { flex: 1 1 220px; max-width: 300px; margin: 0; }
    .sm-select { width: auto; min-width: 150px; max-width: 220px; }
    .sm-datefield { width: auto; }
    .sm-dates { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .sm-date { width: auto; }
    .sm-current { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); font-size: var(--text-sm); background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .sm-current strong { font-size: var(--text-md); color: var(--color-text); }
    .sm-intro { margin: 0 0 var(--space-4); }
    .drawer-body .form-field .field-hint { order: 3; }
    .sm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); align-items: start; }
    .sm-delta { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); border: 1px dashed var(--color-border); border-radius: var(--radius-md); min-height: 48px; justify-content: center; }
    .sm-fieldset { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4) var(--space-2); margin: 0 0 var(--space-4); }
    .sm-fieldset legend { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--color-text-muted); padding: 0 var(--space-1); }
    .sm-attach { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-2); min-width: 0; }
    .sm-attach-btn { cursor: pointer; }
    .sm-att { padding-left: 0; }
    .sm-att-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
    .sm-att-list li { display: grid; gap: var(--space-1); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border-subtle); }
    .modal-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
    .sm-approvals { margin-bottom: var(--space-4); padding: var(--space-4); border-color: var(--color-warning-border); background: var(--color-warning-subtle); }
    .sm-approvals-head { display: flex; align-items: center; gap: var(--space-2); }
    .sm-approvals-title { font-size: var(--text-md); margin: 0; }
    .sm-approval-list { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: grid; gap: var(--space-2); }
    .sm-approval { display: grid; grid-template-columns: 1fr auto; gap: var(--space-1) var(--space-3); padding: var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .sm-approval-main { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .sm-approval-meta { grid-column: 1; }
    .sm-approval-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: var(--space-2); align-items: center; }
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .badge-in, .badge-return { background: var(--color-success-subtle); color: var(--color-success-text); border-color: var(--color-success-border); }
    .badge-out, .badge-order, .badge-disposal { background: var(--color-danger-subtle); color: var(--color-danger-text); border-color: var(--color-danger-border); }
    .badge-transfer-in, .badge-transfer-out, .badge-quarantine { background: var(--color-info-subtle); color: var(--color-info-text); border-color: var(--color-info-border); }
    .badge-adjustment, .badge-reversal { background: var(--color-warning-subtle); color: var(--color-warning-text); border-color: var(--color-warning-border); }
    .performed-badge { display: inline-flex; align-items: center; margin-top: 2px; padding: 2px var(--space-2); border-radius: var(--radius-xs); font-size: var(--text-2xs); font-weight: var(--weight-semibold); white-space: nowrap; }
    .performed-system { background: var(--color-surface-muted); color: var(--color-text-muted); }
    .performed-admin { background: var(--color-primary-subtle); color: var(--color-primary-text); }
    @media (max-width: 640px) {
      .sm-search { max-width: none; flex-basis: 100%; }
      .sm-select { flex: 1 1 100%; max-width: none; }
      .sm-dates { width: 100%; }
      .sm-date { flex: 1; min-width: 0; }
      .filter-pills { overflow-x: auto; flex-wrap: nowrap; max-width: 100%; }
      .sm-grid-2 { grid-template-columns: 1fr; }
      .sm-approval { grid-template-columns: 1fr; }
      .sm-approval-actions { grid-column: 1; grid-row: auto; }
      .sm-actions { text-align: left; }
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
  needsDocument = computed(() => !!MOVEMENT_REASONS.find((r) => r.code === this.formValue()['reasonCode'])?.needsDocument);
  documentMissing = computed(() => this.needsDocument() && (!this.formValue()['documentNo'] || !this.formValue()['documentDate']));
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
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      this.loadMovements(1);
    });
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
    if (!id) return '-';
    return this.warehouseMap().get(id) || '-';
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
    if (this.adjustForm.invalid || this.documentMissing()) {
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
          const late = body?.warnings?.find((w) => w.code === 'LATE_ENTRY_WARNING');
          this.ui.showToast(late ? this.i18n.t('stockMovements.warning.lateEntry', late.params || {}) : this.i18n.t('stockMovements.toast.adjusted'), late ? 'info' : 'success');
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
      next: () => {
        this.isReversing.set(false);
        this.reverseTarget.set(null);
        this.ui.showToast(this.i18n.t('stockMovements.toast.reversed'), 'success');
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
      next: () => {
        this.decidingId.set(null);
        this.ui.showToast(this.i18n.t(approve ? 'stockMovements.approvals.approved' : 'stockMovements.approvals.rejected'), 'success');
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
