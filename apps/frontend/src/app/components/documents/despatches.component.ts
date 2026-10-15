import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { Despatch, statusBadge } from '../../models/documents.models';
import { PAPER_REASONS } from '@stok/tr-compliance';
import { Product, Warehouse } from '../../models/inventory.models';
import { DespatchFormComponent } from './despatch-form.component';

/** İrsaliyeler: list, detail, approval (numbering + stock), transfer receipt, toplu fatura. No cancellation. */
@Component({
  selector: 'app-despatches',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, DespatchFormComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'despatches.title' | t }}</h1>
        <p>{{ 'despatches.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        @if (selectedIds().size > 0) {
          <button class="btn btn-secondary" (click)="bulkInvoice()" [disabled]="busy()">{{ 'despatches.bulkInvoice' | t: { count: selectedIds().size } }}</button>
        }
        @if (!ui.isReadonly()) {
          <button class="btn btn-primary" (click)="openForm()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> {{ 'despatches.new' | t }}</button>
        }
      </div>
    </header>

    <div class="filter-pills" style="margin-bottom: var(--space-4)">
      @for (f of filters; track f) {
        <button type="button" class="filter-pill" [class.active]="filter() === f" (click)="filter.set(f)">{{ 'despatches.filter.' + f | t }}</button>
      }
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead>
            <tr>
              <th style="width: 32px"></th>
              <th>{{ 'despatches.col.number' | t }}</th>
              <th>{{ 'despatches.col.purpose' | t }}</th>
              <th>{{ 'despatches.col.party' | t }}</th>
              <th>{{ 'despatches.actualDespatchAt' | t }}</th>
              <th>{{ 'despatches.col.status' | t }}</th>
              <th>{{ 'despatches.col.invoice' | t }}</th>
              <th class="th-actions">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (d of visible(); track d.id) {
              <tr class="clickable-row" (click)="open(d)">
                <td (click)="$event.stopPropagation()">
                  @if (canInvoice(d)) { <input type="checkbox" [checked]="selectedIds().has(d.id)" (change)="toggle(d.id)" [attr.aria-label]="'despatches.select' | t" /> }
                </td>
                <td class="mono td-primary"><strong>{{ d.documentNo || ('despatches.draftNo' | t) }}</strong>@if (d.orderNumber) { <div class="text-xs text-muted">{{ d.orderNumber }}</div> }</td>
                <td [attr.data-label]="'despatches.col.purpose' | t">{{ 'despatches.purpose.' + d.purpose | t }}@if (d.typeCode === 'MATBUDAN') { <span class="badge badge-warning">MATBUDAN</span> }</td>
                <td [attr.data-label]="'despatches.col.party' | t">{{ d.purpose === 'TRANSFER' ? whName(d.targetWarehouseId) : d.buyerSnapshot?.name }}</td>
                <td class="text-muted" [attr.data-label]="'despatches.actualDespatchAt' | t">{{ d.actualDespatchAt ? (d.actualDespatchAt | appDate: 'datetime') : '-' }}</td>
                <td [attr.data-label]="'despatches.col.status' | t">
                  <span class="badge" [ngClass]="badge(d.status)">{{ 'despatches.status.' + d.status | t }}</span>
                  @if (d.purpose === 'TRANSFER' && d.status !== 'DRAFT') { <span class="badge" [ngClass]="d.receivedAt ? 'badge-success' : 'badge-warning'">{{ (d.receivedAt ? 'despatches.received' : 'despatches.inTransit') | t }}</span> }
                </td>
                <td [attr.data-label]="'despatches.col.invoice' | t">
                  @if (d.purpose === 'SALE') { <span class="badge" [ngClass]="d.invoiceStatus === 'FULL' ? 'badge-success' : d.invoiceStatus === 'PARTIAL' ? 'badge-warning' : 'badge-neutral'">{{ 'despatches.invoiceStatus.' + d.invoiceStatus | t }}</span> } @else { - }
                </td>
                <td class="td-actions" (click)="$event.stopPropagation()">
                  <button class="btn btn-secondary btn-sm" (click)="print(d)">{{ 'documents.print' | t }}</button>
                </td>
              </tr>
            }
            @if (!loading() && visible().length === 0) {
              <tr><td colspan="8"><div class="empty-state"><p class="empty-state-title">{{ 'despatches.empty' | t }}</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as d) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ 'despatches.detail' | t }}</span><span class="mono text-muted">{{ d.documentNo || ('despatches.draftNo' | t) }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (d.status === 'DRAFT') { <div class="doc-alert info">{{ 'despatches.draftInfo' | t }}</div> }
            @else { <div class="doc-alert">{{ 'despatches.noCancelInfo' | t }}</div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'despatches.col.status' | t }}</label><span><span class="badge" [ngClass]="badge(d.status)">{{ 'despatches.status.' + d.status | t }}</span></span></div>
              <div class="doc-field"><label>{{ 'despatches.col.purpose' | t }}</label><span>{{ 'despatches.purpose.' + d.purpose | t }}</span></div>
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ d.issueDate ? (d.issueDate | appDate) : '-' }} {{ d.issueTime?.slice(0, 5) }}</span></div>
              <div class="doc-field"><label>{{ 'despatches.actualDespatchAt' | t }}</label><span>{{ d.actualDespatchAt ? (d.actualDespatchAt | appDate: 'datetime') : '-' }}</span></div>
              <div class="doc-field"><label>{{ 'documents.numberMode' | t }}</label><span>{{ d.numberMode ? ('documents.mode.' + d.numberMode | t) : '-' }}</span></div>
              <div class="doc-field"><label>ETTN</label><span class="mono text-xs">{{ d.ettn }}</span></div>
              <div class="doc-field"><label>{{ 'despatches.source' | t }}</label><span>{{ whName(d.sourceWarehouseId) }}</span></div>
              <div class="doc-field"><label>{{ d.purpose === 'TRANSFER' ? ('despatches.target' | t) : ('documents.buyer' | t) }}</label><span>{{ d.purpose === 'TRANSFER' ? whName(d.targetWarehouseId) : d.buyerSnapshot?.name }}@if (d.buyerSnapshot?.taxId) { <span class="mono text-muted"> · {{ d.buyerSnapshot?.taxId }}</span> }</span></div>
              @if (d.orderNumber) { <div class="doc-field"><label>{{ 'documents.order' | t }}</label><span><a routerLink="/orders" [queryParams]="{ id: d.orderId }" class="link">{{ d.orderNumber }}</a></span></div> }
              <div class="doc-field"><label>{{ 'despatches.carrier' | t }}</label><span>{{ d.carrierParty?.name || '-' }}</span></div>
              <div class="doc-field"><label>{{ 'despatches.driver' | t }}</label><span>@for (x of d.drivers || []; track $index) { {{ x.firstName }} {{ x.lastName }} <span class="mono text-muted">({{ x.tckn }})</span> } @empty { - }</span></div>
              <div class="doc-field"><label>{{ 'despatches.plate' | t }}</label><span class="mono">{{ plates(d) }}</span></div>
            </div>
            @if (d.invoiceRefs?.length) {
              <div class="doc-field"><label>{{ 'despatches.invoiceRefs' | t }}</label><span>@for (r of d.invoiceRefs!; track $index) { <span class="mono">{{ r.documentNo }}</span> ({{ r.issueDate | appDate }}) }</span></div>
            }
            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'despatches.lines' | t }}</h4>
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num hide-xs">{{ 'despatches.invoiced' | t }}</th><th class="num hide-xs">{{ 'despatches.returned' | t }}</th></tr></thead>
                <tbody>
                  @for (l of d.lines; track l.id) {
                    <tr>
                      <td>{{ l.productName }} @if (l.productSku) { <span class="mono text-muted text-xs">{{ l.productSku }}</span> }
                        @for (t of l.tracking || []; track $index) { @if (t.lotNumber) { <div class="text-xs text-muted">{{ 'documents.lot' | t }}: {{ t.lotNumber }}</div> } @if (t.serials?.length) { <div class="text-xs text-muted mono">{{ t.serials!.join(', ') }}</div> } }
                      </td>
                      <td class="num">{{ l.quantity | num }} {{ l.unitCode }}</td>
                      <td class="num hide-xs">{{ l.invoicedQuantity | num }}</td>
                      <td class="num hide-xs">{{ l.returnedQuantity | num }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (d.note) { <div class="doc-section doc-note">{{ d.note }}</div> }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="print(d)">{{ 'documents.print' | t }}</button>
            @if (!ui.isReadonly()) {
              @if (d.status === 'DRAFT') {
                <button class="btn btn-danger" (click)="remove(d)" [disabled]="busy()">{{ 'despatches.deleteDraft' | t }}</button>
                <button class="btn btn-primary" (click)="approve(d)" [disabled]="busy()">{{ 'despatches.approve' | t }}</button>
              }
              @if (d.purpose === 'TRANSFER' && d.status !== 'DRAFT' && !d.receivedAt) {
                <button class="btn btn-primary" (click)="receive(d)" [disabled]="busy()">{{ 'despatches.receive' | t }}</button>
              }
              @if (canInvoice(d)) {
                <button class="btn btn-primary" (click)="invoice([d.id])" [disabled]="busy()">{{ 'despatches.createInvoice' | t }}</button>
              }
            }
          </div>
        </div>
      </div>
    }

    @if (approveFor(); as d) {
      <div class="modal-backdrop z-top">
        <div class="modal-panel">
          <div class="modal-header"><h3>{{ 'despatches.approveConfirmTitle' | t }}</h3></div>
          <div style="padding: var(--space-5)">
            <p class="doc-hint">{{ 'despatches.approveConfirm' | t }}</p>
            @if (eDocumentMode() !== 'PROVIDER') {
              <div class="doc-field">
                <label>{{ 'invoices.numberSource' | t }}</label>
                <label class="doc-check"><input type="radio" name="dsrc" value="paper" [(ngModel)]="numberSource" /> {{ 'despatches.numberPaper' | t }}</label>
                <label class="doc-check"><input type="radio" name="dsrc" value="external" [(ngModel)]="numberSource" /> {{ 'despatches.numberExternal' | t }}</label>
              </div>
              @if (numberSource === 'external') {
                <div class="doc-field"><label for="dsExt">{{ 'despatches.externalDocNo' | t }}</label><input id="dsExt" class="input mono" maxlength="50" [(ngModel)]="externalDocNo" placeholder="IRS2026000000123" /></div>
              } @else {
                <div class="doc-field"><label for="dsReason">{{ 'documents.paperReasonIfMandatory' | t }}</label>
                  <select id="dsReason" class="select" [(ngModel)]="paperReason"><option value="">{{ 'documents.paperReasonNone' | t }}</option>@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div>
                <p class="doc-hint">{{ 'documents.paperSeriesHint' | t }}</p>
              }
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="approveFor.set(null)" [disabled]="busy()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="doApprove(d)" [disabled]="busy() || (numberSource === 'external' && eDocumentMode() !== 'PROVIDER' && !externalDocNo.trim())">{{ 'despatches.approve' | t }}</button>
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
    return this.rows().filter((d) =>
      f === 'all' ? true : f === 'uninvoiced' ? this.canInvoice(d) : f === 'transit' ? d.purpose === 'TRANSFER' && d.status !== 'DRAFT' && !d.receivedAt : f === 'APPROVED' ? d.status !== 'DRAFT' : d.status === f,
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
