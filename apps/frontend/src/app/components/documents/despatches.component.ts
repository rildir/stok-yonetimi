import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { Despatch, statusBadge } from '../../models/documents.models';
import { PAPER_REASONS } from '@stok/tr-compliance';
import { Product, Warehouse } from '../../models/inventory.models';
import { DespatchFormComponent } from './despatch-form.component';
import { EdocPanelComponent } from '../ebelge/edoc-panel.component';
import { IconComponent } from '../shared/icon.component';

/** İrsaliyeler: list, detail, approval (numbering + stock), transfer receipt, toplu fatura. No cancellation. */
@Component({
  selector: 'app-despatches',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, DespatchFormComponent, EdocPanelComponent, IconComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`
    :host { display: block; }
    .notice > app-icon { color: var(--tone); }
    .list-bar { margin-bottom: 12px; }
    .list-bar .seg { max-width: 100%; }
    .list-bar .seg button { flex: none; }
    .list-bar .summary-strip { margin-left: auto; }
    .list-bar .l-search { flex: 0 1 280px; min-width: 180px; }
    .m-list { display: none; }
    .mrow.doc { cursor: pointer; }
    .mrow.doc:hover { background: var(--row-hover); }
    .mrow.doc:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .mrow.doc b { font-family: var(--font-mono); }
    .mrow.doc b.is-draft { font-family: var(--font-sans); font-weight: 400; color: var(--fg-3); }
    .mrow.doc .s.r { overflow: visible; }
    .mrow.doc label.thumb { cursor: pointer; background: none; box-shadow: none; }
    .no-match { padding: 24px 16px; text-align: center; color: var(--fg-3); font-size: var(--text-sm); }
    .doc-no { font-family: var(--font-mono); font-weight: 500; }
    .tbl td.c-no { max-width: 300px; }
    .tbl td.c-purpose { max-width: 150px; }
    .tbl td.c-party { max-width: 200px; }
    .doc-no.is-draft { font-family: var(--font-sans); font-weight: 400; color: var(--fg-3); }
    .tbl td.empty-cell { white-space: normal; max-width: none; padding: 0; height: auto; }
    .tbl tr.sk td { height: var(--row-h); }
    .tbl tr.sk .skeleton-row { height: 12px; }
    .drawer-h .t h2.dh-no { font-family: var(--font-mono); font-size: var(--text-lg); font-weight: 600; letter-spacing: -0.01em; }
    .drawer-h .tools { gap: 8px; }
    .drawer-body .doc-grid { margin-bottom: 0; }
    .drawer-body > .doc-section, .drawer-body > div > .doc-section { margin-top: 0; }
    .drawer-body .notice, .modal-b .notice { align-items: flex-start; }
    .drawer-body .notice > app-icon { margin-top: 1px; }
    .ref-list { display: flex; flex-wrap: wrap; gap: 4px 12px; }
    .ref-list .sec { color: var(--fg-3); }
    .ref-list > span { display: inline-flex; align-items: baseline; gap: 6px; }
    .line-sub { display: block; font-size: var(--text-xs); color: var(--fg-3); margin-top: 2px; }
    .line-sub.mono { font-family: var(--font-mono); }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .radio-stack { display: flex; flex-direction: column; gap: 8px; }
    @media (max-width: 640px) {
      .list-bar .summary-strip { display: none; }
      .list-bar .l-search { flex: 1 1 100%; }
      .list-bar .l-search .trail { display: none; }
      .table-card.has-m { display: none; }
      .m-list { display: block; }
      .table-responsive td.w-act { display: none; }
      .table-responsive td.w-check:empty { display: none; }
      .table-responsive td.w-check { width: 100%; padding: 2px 0; }
      .table-responsive td.empty-cell { display: block; }
      .tbl.table-responsive td { max-width: none; }
      .drawer-footer .lbl-m { display: none; }
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'despatches.title' | t }}</h1>
        <p>{{ 'despatches.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        @if (!ui.isReadonly()) {
          <button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" />{{ 'despatches.new' | t }}</button>
        }
      </div>
    </header>

    <div class="toolbar list-bar">
      <div class="seg" role="group" [attr.aria-label]="'documents.statusFilter' | t">
        @for (f of filters; track f) {
          <button type="button" [attr.aria-pressed]="filter() === f" (click)="filter.set(f)">{{ 'despatches.filter.' + f | t }}</button>
        }
      </div>
      <div class="field l-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [placeholder]="'despatches.searchPlaceholder' | t" [attr.aria-label]="'despatches.searchPlaceholder' | t" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        <span class="trail"><kbd>/</kbd></span>
      </div>
      <div class="summary-strip"><span><b>{{ visible().length | num }}</b>{{ 'documents.countLabel' | t }}</span></div>
    </div>

    @if (visible().length) {
      <div class="mlist m-list" role="list">
        @for (d of visible(); track d.id) {
          <div class="mrow doc" role="listitem" tabindex="0" [class.is-selected]="selectedIds().has(d.id)" (click)="open(d)" (keydown.enter)="open(d)">
            @if (canInvoice(d)) {
              <label class="thumb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="selectedIds().has(d.id)" (change)="toggle(d.id)" [attr.aria-label]="'despatches.select' | t" /></label>
            } @else {
              <span class="thumb" aria-hidden="true"><app-icon [name]="d.purpose === 'TRANSFER' ? 'swap' : 'truck'" size="sm" /></span>
            }
            <b [class.is-draft]="!d.documentNo">{{ d.documentNo || ('despatches.draftNo' | t) }}</b>
            <span class="v"><span class="badge" [ngClass]="badge(d.status)"><span class="dot"></span>{{ 'despatches.status.' + d.status | t }}</span></span>
            <span class="s">@if (d.actualDespatchAt) { {{ d.actualDespatchAt | appDate }} · }{{ 'despatches.purpose.' + d.purpose | t }} · {{ d.purpose === 'TRANSFER' ? whName(d.targetWarehouseId) : d.buyerSnapshot?.name }}</span>
            <span class="s r">
              @if (d.purpose === 'SALE') { <span class="badge" [ngClass]="d.invoiceStatus === 'FULL' ? 'badge-success' : d.invoiceStatus === 'PARTIAL' ? 'badge-warning' : 'badge-neutral'"><span class="dot"></span>{{ 'despatches.invoiceStatus.' + d.invoiceStatus | t }}</span> }
              @else if (d.purpose === 'TRANSFER' && d.status !== 'DRAFT') { <span class="badge" [ngClass]="d.receivedAt ? 'badge-success' : 'badge-warning'"><span class="dot"></span>{{ (d.receivedAt ? 'despatches.received' : 'despatches.inTransit') | t }}</span> }
            </span>
          </div>
        }
      </div>
    }

    <div class="table-card" [class.has-m]="visible().length > 0">
      <div class="table-scroll">
        <table class="tbl table-responsive">
          <thead>
            <tr>
              <th class="w-check"><span class="sr-only">{{ 'despatches.select' | t }}</span></th>
              <th>{{ 'despatches.col.number' | t }}</th>
              <th>{{ 'despatches.col.purpose' | t }}</th>
              <th>{{ 'despatches.col.party' | t }}</th>
              <th>{{ 'despatches.actualDespatchAt' | t }}</th>
              <th>{{ 'despatches.col.status' | t }}</th>
              <th>{{ 'despatches.col.invoice' | t }}</th>
              <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
            </tr>
          </thead>
          <tbody>
            @if (loading() && rows().length === 0) {
              @for (i of [1, 2, 3, 4, 5]; track i) { <tr class="sk"><td colspan="8"><div class="skeleton-row"></div></td></tr> }
            }
            @for (d of visible(); track d.id) {
              <tr class="clickable-row" [class.is-selected]="selectedIds().has(d.id)" (click)="open(d)">
                <td class="w-check" [attr.data-label]="canInvoice(d) ? ('despatches.select' | t) : null" (click)="$event.stopPropagation()">
                  @if (canInvoice(d)) { <input type="checkbox" [checked]="selectedIds().has(d.id)" (change)="toggle(d.id)" [attr.aria-label]="'despatches.select' | t" /> }
                </td>
                <td class="td-primary c-no"><span class="doc-no" [class.is-draft]="!d.documentNo">{{ d.documentNo || ('despatches.draftNo' | t) }}</span>@if (d.orderNumber) { <span class="cell-code">{{ d.orderNumber }}</span> }</td>
                <td class="c-purpose" [attr.data-label]="'despatches.col.purpose' | t">{{ 'despatches.purpose.' + d.purpose | t }}@if (d.typeCode === 'MATBUDAN') { <span class="badge badge-neutral">{{ 'ebelge.gib.MATBUDAN' | t }}</span> }</td>
                <td class="c-party" [attr.data-label]="'despatches.col.party' | t">{{ d.purpose === 'TRANSFER' ? whName(d.targetWarehouseId) : d.buyerSnapshot?.name }}</td>
                <td [attr.data-label]="'despatches.actualDespatchAt' | t"><span class="cell-sec">{{ d.actualDespatchAt ? (d.actualDespatchAt | appDate: 'datetime') : '-' }}</span></td>
                <td [attr.data-label]="'despatches.col.status' | t">
                  <span class="badge" [ngClass]="badge(d.status)"><span class="dot"></span>{{ 'despatches.status.' + d.status | t }}</span>
                  @if (d.purpose === 'TRANSFER' && d.status !== 'DRAFT') { <span class="badge" [ngClass]="d.receivedAt ? 'badge-success' : 'badge-warning'"><span class="dot"></span>{{ (d.receivedAt ? 'despatches.received' : 'despatches.inTransit') | t }}</span> }
                </td>
                <td [attr.data-label]="'despatches.col.invoice' | t">
                  @if (d.purpose === 'SALE') { <span class="badge" [ngClass]="d.invoiceStatus === 'FULL' ? 'badge-success' : d.invoiceStatus === 'PARTIAL' ? 'badge-warning' : 'badge-neutral'"><span class="dot"></span>{{ 'despatches.invoiceStatus.' + d.invoiceStatus | t }}</span> } @else { <span class="cell-sec">-</span> }
                </td>
                <td class="w-act" (click)="$event.stopPropagation()">
                  <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" (click)="print(d)" [attr.aria-label]="'documents.print' | t" [title]="'documents.print' | t"><app-icon name="printer" size="sm" /></button>
                </td>
              </tr>
            }
            @if (!loading() && visible().length === 0 && rows().length > 0) {
              <tr><td colspan="8" class="empty-cell"><div class="no-match">{{ 'documents.noMatch' | t }}</div></td></tr>
            }
            @if (!loading() && rows().length === 0) {
              <tr><td colspan="8" class="empty-cell">
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="truck" /></div>
                  <h3>{{ 'despatches.empty' | t }}</h3>
                  <p>{{ 'despatches.emptyHint' | t }}</p>
                  @if (!ui.isReadonly()) { <div class="actions cluster"><button type="button" class="btn btn-primary btn-sm" (click)="openForm()"><app-icon name="plus" size="sm" />{{ 'despatches.new' | t }}</button></div> }
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selectedIds().size > 0) {
      <div class="bulkbar" role="toolbar" [attr.aria-label]="'despatches.bulkInvoice' | t: { count: selectedIds().size }" (document:keydown.escape)="clearOnEsc()">
        <span class="count"><span class="mono">{{ selectedIds().size }}</span> {{ 'documents.selectedLabel' | t }}</span>
        <span class="sep"></span>
        <button type="button" class="bb" (click)="bulkInvoice()" [disabled]="busy()" [attr.aria-label]="'despatches.bulkInvoice' | t: { count: selectedIds().size }"><app-icon name="receipt" /><span class="lbl">{{ 'despatches.bulkInvoice' | t: { count: selectedIds().size } }}</span></button>
        <button type="button" class="bb" (click)="clearSelection()" [attr.aria-label]="'documents.clearSelection' | t"><app-icon name="x" /><span class="lbl">{{ 'documents.clearSelection' | t }}</span><kbd>Esc</kbd></button>
      </div>
    }

    @if (selected(); as d) {
      <div class="drawer-overlay" (click)="selected.set(null)" (document:keydown.escape)="closeOnEsc()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'despatches.detail' | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="truck" size="sm" />{{ 'despatches.detail' | t }}<span class="sep">/</span>{{ 'despatches.purpose.' + d.purpose | t }}</div>
              <h2 [class.dh-no]="!!d.documentNo">{{ d.documentNo || ('despatches.draftNo' | t) }}</h2>
            </div>
            <div class="tools">
              <span class="badge" [ngClass]="badge(d.status)"><span class="dot"></span>{{ 'despatches.status.' + d.status | t }}</span>
              <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            </div>
          </div>
          <div class="drawer-body">
            @if (d.status === 'DRAFT') { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'despatches.draftInfo' | t }}</span></div> }
            @else { <div class="notice notice-warning"><app-icon name="lock" /><span class="t">{{ 'despatches.noCancelInfo' | t }}</span></div> }
            @if (d.status === 'PARTIALLY_ACCEPTED' || d.status === 'REJECTED') { <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ 'despatches.receiverDisputed' | t }}</span></div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ d.issueDate ? (d.issueDate | appDate) : '-' }} {{ d.issueTime?.slice(0, 5) }}</span></div>
              <div class="doc-field"><label>{{ 'despatches.actualDespatchAt' | t }}</label><span>{{ d.actualDespatchAt ? (d.actualDespatchAt | appDate: 'datetime') : '-' }}</span></div>
              <div class="doc-field"><label>{{ 'despatches.source' | t }}</label><span>{{ whName(d.sourceWarehouseId) }}</span></div>
              <div class="doc-field"><label>{{ d.purpose === 'TRANSFER' ? ('despatches.target' | t) : ('documents.buyer' | t) }}</label><span>{{ d.purpose === 'TRANSFER' ? whName(d.targetWarehouseId) : d.buyerSnapshot?.name }}@if (d.buyerSnapshot?.taxId) { <span class="mono cell-sec"> · {{ d.buyerSnapshot?.taxId }}</span> }</span></div>
              <div class="doc-field"><label>{{ 'documents.numberMode' | t }}</label><span>{{ d.numberMode ? ('documents.mode.' + d.numberMode | t) : '-' }}</span></div>
              <div class="doc-field"><label>ETTN</label><span class="mono text-xs">{{ d.ettn }}</span></div>
              @if (d.orderNumber) { <div class="doc-field"><label>{{ 'documents.order' | t }}</label><span><a routerLink="/orders" [queryParams]="{ id: d.orderId }" class="link mono">{{ d.orderNumber }}</a></span></div> }
              @if (d.invoiceRefs?.length) {
                <div class="doc-field"><label>{{ 'despatches.invoiceRefs' | t }}</label><span class="ref-list">@for (r of d.invoiceRefs!; track $index) { <span><span class="mono">{{ r.documentNo }}</span> <span class="sec">{{ r.issueDate | appDate }}</span></span> }</span></div>
              }
            </div>

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'despatches.transport' | t }}</h4>
              <div class="doc-grid-3">
                <div class="doc-field"><label>{{ 'despatches.carrier' | t }}</label><span>{{ d.carrierParty?.name || '-' }}</span></div>
                <div class="doc-field"><label>{{ 'despatches.driver' | t }}</label><span>@for (x of d.drivers || []; track $index) { {{ x.firstName }} {{ x.lastName }} <span class="mono cell-sec">{{ x.tckn }}</span> } @empty { - }</span></div>
                <div class="doc-field"><label>{{ 'despatches.plate' | t }}</label><span class="mono">{{ plates(d) }}</span></div>
              </div>
            </div>

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'despatches.lines' | t }}</h4>
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num hide-xs">{{ 'despatches.invoiced' | t }}</th><th class="num hide-xs">{{ 'despatches.returned' | t }}</th></tr></thead>
                <tbody>
                  @for (l of d.lines; track l.id) {
                    <tr>
                      <td>{{ l.productName }}@if (l.productSku) { <span class="cell-code">{{ l.productSku }}</span> }
                        @for (t of l.tracking || []; track $index) { @if (t.lotNumber) { <span class="line-sub">{{ 'documents.lot' | t }}: {{ t.lotNumber }}</span> } @if (t.serials?.length) { <span class="line-sub mono">{{ t.serials!.join(', ') }}</span> } }
                      </td>
                      <td class="num">{{ l.quantity | num }} {{ l.unitCode | unitLabel }}</td>
                      <td class="num hide-xs">{{ l.invoicedQuantity | num }}</td>
                      <td class="num hide-xs">{{ l.returnedQuantity | num }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (d.note) { <div class="doc-note">{{ d.note }}</div> }
            @if (d.numberMode === 'EDOCUMENT') { <app-edoc-panel sourceType="despatch" [sourceId]="d.id" [expected]="true"></app-edoc-panel> }
          </div>
          <div class="drawer-footer">
            @if (!ui.isReadonly() && d.status === 'DRAFT') {
              <button type="button" class="btn btn-danger-ghost" (click)="remove(d)" [disabled]="busy()" [attr.aria-label]="'despatches.deleteDraft' | t"><app-icon name="trash" /><span class="lbl-m">{{ 'despatches.deleteDraft' | t }}</span></button>
            }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="print(d)" [attr.aria-label]="'documents.print' | t"><app-icon name="printer" /><span class="lbl-m">{{ 'documents.print' | t }}</span></button>
            @if (d.numberMode === 'EDOCUMENT') { <a class="btn" [routerLink]="['/e-irsaliye', d.id]" [attr.aria-label]="'ebelge.vehicle.open' | t"><app-icon name="eye" /><span class="lbl-m">{{ 'ebelge.vehicle.open' | t }}</span></a> }
            @if (!ui.isReadonly()) {
              @if (d.status === 'DRAFT') {
                <button type="button" class="btn btn-primary" (click)="approve(d)" [disabled]="busy()">{{ 'despatches.approve' | t }}<kbd>Ctrl ↵</kbd></button>
              }
              @if (d.purpose === 'TRANSFER' && d.status !== 'DRAFT' && !d.receivedAt) {
                <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="receive(d)" [disabled]="busy()"><span>{{ 'despatches.receive' | t }}</span></button>
              }
              @if (canInvoice(d)) {
                <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="invoice([d.id])" [disabled]="busy()"><span>{{ 'despatches.createInvoice' | t }}</span></button>
              }
            }
          </div>
        </div>
      </div>
    }

    @if (approveFor(); as d) {
      <div class="modal-backdrop" (document:keydown.escape)="busy() ? null : approveFor.set(null)">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="dsApproveTitle">
          <div class="modal-header"><h3 id="dsApproveTitle">{{ 'despatches.approveConfirmTitle' | t }}</h3></div>
          <div class="modal-b form-stack">
            <p>{{ 'despatches.approveConfirm' | t }}</p>
            @if (eDocumentMode() !== 'PROVIDER') {
              <div class="fld" role="radiogroup" aria-labelledby="dsSrcLbl">
                <span class="fld-label" id="dsSrcLbl">{{ 'invoices.numberSource' | t }}</span>
                <div class="radio-stack">
                  <label class="radio"><input type="radio" name="dsrc" value="paper" [(ngModel)]="numberSource" />{{ 'despatches.numberPaper' | t }}</label>
                  <label class="radio"><input type="radio" name="dsrc" value="external" [(ngModel)]="numberSource" />{{ 'despatches.numberExternal' | t }}</label>
                </div>
              </div>
              @if (numberSource === 'external') {
                <div class="fld"><label class="fld-label" for="dsExt">{{ 'despatches.externalDocNo' | t }} <span class="req">*</span></label><div class="field"><input id="dsExt" class="mono" maxlength="50" [(ngModel)]="externalDocNo" placeholder="IRS2026000000123" /></div></div>
              } @else {
                <div class="fld"><label class="fld-label" for="dsReason">{{ 'documents.paperReasonIfMandatory' | t }}</label>
                  <div class="field select"><select id="dsReason" [(ngModel)]="paperReason"><option value="">{{ 'documents.paperReasonNone' | t }}</option>@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div>
                  <div class="fld-help">{{ 'documents.paperSeriesHint' | t }}</div>
                </div>
              }
            }
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" (click)="approveFor.set(null)" [disabled]="busy()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="doApprove(d)" [disabled]="busy() || (numberSource === 'external' && eDocumentMode() !== 'PROVIDER' && !externalDocNo.trim())"><span>{{ 'despatches.approve' | t }}</span></button>
          </div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <app-despatch-form [warehouses]="warehouses()" [products]="products()" (done)="onSaved($event)" (closed)="formOpen.set(false)"></app-despatch-form>
    }
  `,
})
export class DespatchesComponent implements OnInit {
  docs = inject(DocumentsService);
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  route = inject(ActivatedRoute);
  router = inject(Router);

  filters = ['all', 'DRAFT', 'APPROVED', 'uninvoiced', 'transit'];
  filter = signal('all');
  q = signal('');
  rows = signal<Despatch[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<Despatch | null>(null);
  selectedIds = signal<Set<string>>(new Set());
  formOpen = signal(false);
  warehouses = signal<Warehouse[]>([]);
  products = signal<Product[]>([]);
  badge = statusBadge;
  paperReasons = PAPER_REASONS as readonly string[];
  eDocumentMode = signal('NONE');
  approveFor = signal<Despatch | null>(null);
  numberSource: 'paper' | 'external' = 'paper';
  externalDocNo = '';
  paperReason = '';

  visible = computed(() => {
    const f = this.filter();
    const q = this.q().trim().toLocaleLowerCase();
    return this.rows().filter((d) =>
      (f === 'all' ? true : f === 'uninvoiced' ? this.canInvoice(d) : f === 'transit' ? d.purpose === 'TRANSFER' && d.status !== 'DRAFT' && !d.receivedAt : f === 'APPROVED' ? d.status !== 'DRAFT' : d.status === f)
      && (!q || [d.documentNo, d.orderNumber, d.buyerSnapshot?.name, d.buyerSnapshot?.taxId, d.purpose === 'TRANSFER' ? this.whName(d.targetWarehouseId) : ''].some((v) => (v || '').toLocaleLowerCase().includes(q))),
    );
  });

  ngOnInit() {
    this.docs.company().subscribe({ next: (c) => this.eDocumentMode.set(c.eDocumentMode || 'NONE'), error: () => undefined });
    this.inventory.getWarehouses().subscribe({ next: (w) => this.warehouses.set(w || []), error: () => undefined });
    this.inventory.getProducts().subscribe({ next: (p) => this.products.set((p || []).filter((x: any) => !x.isDeleted)), error: () => undefined });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.docs.despatches().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        const id = this.route.snapshot.queryParamMap.get('id');
        if (id && !this.selected()) {
          const d = rows.find((r) => r.id === id);
          if (d) this.selected.set(d);
        }
        if (this.selected()) this.selected.set(rows.find((r) => r.id === this.selected()!.id) || null);
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error');
      },
    });
  }

  whName(id?: string | null): string {
    return this.warehouses().find((w) => w.id === id)?.name || '-';
  }
  plates(d: Despatch): string {
    return (d.plates || []).map((p) => p.plate).join(', ') || '-';
  }
  canInvoice(d: Despatch): boolean {
    return d.purpose === 'SALE' && d.status !== 'DRAFT' && d.invoiceStatus !== 'FULL';
  }
  open(d: Despatch) {
    this.selected.set(d);
  }
  openForm() {
    this.formOpen.set(true);
  }
  onSaved(d: Despatch) {
    this.formOpen.set(false);
    this.load();
    this.selected.set(d);
  }
  toggle(id: string) {
    const s = new Set(this.selectedIds());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.selectedIds.set(s);
  }
  clearSelection() {
    this.selectedIds.set(new Set());
  }
  /** Esc: a stacked modal or the form closes first, then the drawer, then the bulk selection. */
  closeOnEsc() {
    if (!this.approveFor() && !this.formOpen()) this.selected.set(null);
  }
  clearOnEsc() {
    if (!this.selected() && !this.approveFor() && !this.formOpen()) this.clearSelection();
  }
  print(d: Despatch) {
    this.docs.print(`despatches/${d.id}/print`);
  }

  approve(d: Despatch) {
    this.numberSource = 'paper';
    this.externalDocNo = '';
    this.paperReason = '';
    this.approveFor.set(d);
  }

  doApprove(d: Despatch) {
    const body: Record<string, unknown> = {};
    if (this.eDocumentMode() !== 'PROVIDER') {
      if (this.numberSource === 'external') body['externalDocNo'] = this.externalDocNo.trim();
      else if (this.paperReason) body['paperReason'] = this.paperReason;
    }
    this.busy.set(true);
    this.docs.approveDespatch(d.id, body).subscribe({
      next: (a) => {
        this.busy.set(false);
        this.approveFor.set(null);
        this.ui.showToast(this.i18n.t('despatches.toast.approved', { number: a.documentNo }), 'success');
        this.selected.set(a);
        this.load();
      },
      error: (e) => this.fail(e, 'despatches.toast.approveError'),
    });
  }

  remove(d: Despatch) {
    this.ui.openConfirm({
      title: this.i18n.t('despatches.deleteDraft'),
      message: this.i18n.t('despatches.deleteConfirm'),
      isDelete: true,
      onConfirm: () => {
        this.busy.set(true);
        this.docs.deleteDespatch(d.id).subscribe({
          next: () => {
            this.busy.set(false);
            this.selected.set(null);
            this.load();
          },
          error: (e) => this.fail(e, 'documents.actionError'),
        });
      },
    });
  }

  receive(d: Despatch) {
    this.busy.set(true);
    this.docs.receiveDespatch(d.id).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('despatches.toast.received'), 'success');
        this.selected.set(r);
        this.load();
      },
      error: (e) => this.fail(e, 'documents.actionError'),
    });
  }

  bulkInvoice() {
    this.invoice([...this.selectedIds()]);
  }

  invoice(ids: string[]) {
    this.busy.set(true);
    this.docs.invoiceFromDespatches(ids).subscribe({
      next: (inv) => {
        this.busy.set(false);
        this.selectedIds.set(new Set());
        this.ui.showToast(this.i18n.t('invoices.toast.draftCreated'), 'success');
        this.router.navigate(['/invoices'], { queryParams: { id: inv.id } });
      },
      error: (e) => this.fail(e, 'documents.actionError'),
    });
  }

  private fail(e: unknown, key: string) {
    this.busy.set(false);
    this.ui.showToast(apiError(e, this.i18n.t(key)), 'error');
  }
}
