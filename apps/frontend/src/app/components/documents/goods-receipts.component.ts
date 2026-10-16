import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { GoodsReceipt, statusBadge } from '../../models/documents.models';
import { Product, PurchaseOrder, Warehouse } from '../../models/inventory.models';
import { GoodsReceiptFormComponent } from './goods-receipt-form.component';
import { IconComponent } from '../shared/icon.component';

/** Mal kabul fişleri: receipts per PO, discrepancies, supplier invoice (three-way match), own despatch when the buyer carries. */
@Component({
  selector: 'app-goods-receipts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, GoodsReceiptFormComponent, IconComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  template: `
    <header class="page-header">
      <div><h1>{{ 'goodsReceipt.title' | t }}</h1><p>{{ 'goodsReceipt.subtitle' | t }}</p></div>
    </header>

    @if (!ui.isReadonly() && openPos().length) {
      <div class="card gr-start">
        <div class="gr-start-t">
          <span class="gr-start-ic" aria-hidden="true"><app-icon name="box-in" /></span>
          <div class="gr-start-tx">
            <b>{{ 'goodsReceipt.startTitle' | t }}</b>
            <span>{{ 'goodsReceipt.startHint' | t: { n: openPos().length } }}</span>
          </div>
        </div>
        <div class="gr-start-c">
          <div class="field select gr-po-select">
            <span class="lead"><app-icon name="cart" size="sm" /></span>
            <select [(ngModel)]="poToReceive" [attr.aria-label]="'goodsReceipt.selectPo' | t">
              <option value="">{{ 'goodsReceipt.selectPo' | t }}</option>
              @for (p of openPos(); track p.id) { <option [value]="p.id">{{ p.poNumber }} · {{ p.supplierName }}</option> }
            </select>
          </div>
          <button type="button" class="btn btn-primary" [disabled]="!poToReceive" (click)="startReceipt()"><app-icon name="box-in" />{{ 'goodsReceipt.new' | t }}</button>
        </div>
      </div>
    }

    <div class="toolbar gr-toolbar">
      <div class="seg seg-sm" role="group" [attr.aria-label]="'returns.col.status' | t">
        @for (f of filters; track f) { <button type="button" [attr.aria-pressed]="filter() === f" (click)="filter.set(f)">{{ 'goodsReceipt.filter.' + f | t }}</button> }
      </div>
      <span class="spacer"></span>
      @if (rows().length) { <div class="summary-strip"><span><b>{{ visible().length | num }}</b>{{ 'goodsReceipt.countLabel' | t }}</span></div> }
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="tbl table-responsive gr-table">
          <thead><tr>
            <th>{{ 'goodsReceipt.col.number' | t }}</th><th class="lg-only">{{ 'goodsReceipt.col.po' | t }}</th><th>{{ 'goodsReceipt.col.supplier' | t }}</th><th>{{ 'goodsReceipt.receivedAt' | t }}</th>
            <th>{{ 'goodsReceipt.col.supplierDocs' | t }}</th><th>{{ 'goodsReceipt.col.match' | t }}</th><th>{{ 'returns.col.status' | t }}</th><th class="w-act"><span class="sr">{{ 'common.actions' | t }}</span></th>
          </tr></thead>
          <tbody>
            @if (loading() && rows().length === 0) {
              @for (i of [1, 2, 3, 4, 5]; track i) { <tr class="gr-sk"><td colspan="8"><div class="skeleton-row"></div></td></tr> }
            }
            @for (r of visible(); track r.id) {
              <tr class="clickable-row" [class.is-selected]="selected()?.id === r.id" (click)="select(r)">
                <td class="td-primary">
                  <span class="gr-head">
                    <span class="mono gr-no">{{ r.receiptNo }}</span>
                    @if (r.hasDiscrepancy) { <span class="badge badge-warning"><app-icon name="warn" size="xs" />{{ 'goodsReceipt.discrepancy' | t }}</span> }
                    <span class="badge xs-only" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'returns.status.' + r.status | t }}</span>
                  </span>
                </td>
                <td class="mono cell-sec gr-po lg-only" [attr.data-label]="'goodsReceipt.col.po' | t">{{ r.poNumber }}</td>
                <td class="gr-sup" [attr.data-label]="'goodsReceipt.col.supplier' | t"><span class="truncate" [title]="r.supplierSnapshot?.name || ''">{{ r.supplierSnapshot?.name }}</span></td>
                <td [attr.data-label]="'goodsReceipt.receivedAt' | t">{{ r.receivedAt | appDate: 'datetime' }}</td>
                <td class="mono gr-docs no-xs"><span [class.cell-sec]="!r.supplierDespatchNo">{{ r.supplierDespatchNo || '—' }}</span><span class="gr-slash">/</span><span [class.cell-sec]="!r.supplierInvoiceNo">{{ r.supplierInvoiceNo || '—' }}</span></td>
                <td [attr.data-label]="'goodsReceipt.col.match' | t"><span class="badge" [ngClass]="matchBadge(r.matchStatus)"><span class="dot"></span>{{ 'goodsReceipt.match.' + (r.matchStatus || 'NO_INVOICE') | t }}</span></td>
                <td class="no-xs"><span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'returns.status.' + r.status | t }}</span></td>
                <td class="w-act td-actions" (click)="$event.stopPropagation()"><button type="button" class="btn btn-ghost btn-sm btn-icon row-act" (click)="print(r)" [attr.aria-label]="'documents.print' | t" [attr.data-tip]="'documents.print' | t"><app-icon name="printer" /></button></td>
              </tr>
            }
            @if (!loading() && visible().length === 0) {
              <tr class="gr-empty"><td colspan="8">
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="box-in" /></div>
                  <h3>{{ 'goodsReceipt.empty' | t }}</h3>
                  @if (filter() !== 'all') {
                    <div class="actions cluster"><button type="button" class="btn btn-sm" (click)="filter.set('all')">{{ 'goodsReceipt.filter.all' | t }}</button></div>
                  }
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      <div class="drawer-overlay" (click)="selected.set(null)" (document:keydown.escape)="!receivingPo() && selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'goodsReceipt.detail' | t" (click)="$event.stopPropagation()">
          <header class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="box-in" size="sm" /><span class="truncate">{{ 'goodsReceipt.detail' | t }}</span><span class="sep no-xs">/</span><span class="mono no-xs">{{ r.poNumber }}</span></div>
              <h2 class="mono gr-dh">{{ r.receiptNo }}</h2>
            </div>
            <div class="tools">
              <span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'returns.status.' + r.status | t }}</span>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="print(r)" [attr.aria-label]="'documents.print' | t" [attr.data-tip]="'documents.print' | t"><app-icon name="printer" /></button>
              <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </header>
          <div class="drawer-body">
            @if (r.requiresExpenseVoucher) {
              <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'goodsReceipt.voucherRequired' | t }}</span>@if (r.expenseVoucherId) { <a class="link" routerLink="/expense-vouchers" [queryParams]="{ id: r.expenseVoucherId }">{{ 'returns.openVoucher' | t }}</a> }</div>
            }
            <div class="doc-grid gr-meta">
              <div class="doc-field"><label>{{ 'goodsReceipt.col.supplier' | t }}</label><span>{{ r.supplierSnapshot?.name }} @if (r.supplierSnapshot?.taxId) { <span class="mono cell-sec">· {{ r.supplierSnapshot?.taxId }}</span> }</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.col.po' | t }}</label><span class="mono">{{ r.poNumber }}</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.receivedAt' | t }}</label><span>{{ r.receivedAt | appDate: 'datetime' }}</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.warehouse' | t }}</label><span>{{ whName(r.warehouseId) }}</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.supplierDespatchNo' | t }}</label><span><span class="mono">{{ r.supplierDespatchNo || '—' }}</span>@if (r.supplierDespatchDate) { <span class="cell-sec"> · {{ r.supplierDespatchDate | appDate }}</span> }</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.col.match' | t }}</label><span><span class="badge" [ngClass]="matchBadge(r.matchStatus)"><span class="dot"></span>{{ 'goodsReceipt.match.' + (r.matchStatus || 'NO_INVOICE') | t }}</span></span></div>
            </div>

            <div class="gr-net">
              <span>{{ 'goodsReceipt.acceptedNet' | t }}</span>
              <b>{{ r.acceptedNetAmount | money: r.currency }}</b>
            </div>

            <section class="doc-section">
              <h3 class="doc-section-title">{{ 'purchaseOrders.items' | t }} <span class="tag">{{ r.items.length }}</span></h3>
              <div class="table-scroll">
                <table class="doc-table gr-lines">
                  <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num hide-xs">{{ 'goodsReceipt.despatchQty' | t }}</th><th class="num">{{ 'goodsReceipt.counted' | t }}</th><th class="num">{{ 'goodsReceipt.rejected' | t }}</th><th class="num">{{ 'goodsReceipt.accepted' | t }}</th><th class="hide-xs">{{ 'goodsReceipt.difference' | t }}</th></tr></thead>
                  <tbody>
                    @for (i of r.items; track i.id) {
                      <tr>
                        <td>
                          <div class="gr-pname">{{ i.productName }}</div>
                          @for (t of i.tracking || []; track $index) { @if (t.lotNumber) { <div class="gr-sub"><span class="tag">{{ 'documents.lot' | t }}</span> <span class="mono">{{ t.lotNumber }}</span></div> } }
                        </td>
                        <td class="num hide-xs">{{ i.despatchQuantity | num }}</td>
                        <td class="num">{{ i.countedQuantity | num }}</td>
                        <td class="num">
                          <span [class.cell-sec]="!i.rejectedQuantity">{{ i.rejectedQuantity | num }}</span>
                          @if (i.rejectReason) { <div class="gr-sub">{{ 'goodsReceipt.reject.' + i.rejectReason | t }}</div> }
                        </td>
                        <td class="num"><b>{{ i.acceptedQuantity | num }}</b></td>
                        <td class="hide-xs">
                          @if (i.surplusQuantity) { <span class="badge badge-warning"><span class="dot"></span>{{ 'goodsReceipt.surplus' | t: { qty: (i.surplusQuantity | num) } }}</span> }
                          @if (i.shortageQuantity) { <span class="badge badge-danger"><span class="dot"></span>{{ 'goodsReceipt.shortage' | t: { qty: (i.shortageQuantity | num) } }}</span> }
                          @if (!i.surplusQuantity && !i.shortageQuantity) { <span class="cell-sec">—</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            @if (r.status === 'COMPLETED' && !ui.isReadonly()) {
              <section class="doc-section">
                <h3 class="doc-section-title">{{ 'goodsReceipt.supplierInvoice' | t }}</h3>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="siNo">{{ 'goodsReceipt.supplierInvoiceNo' | t }}</label>
                    <div class="field"><input id="siNo" class="mono" [(ngModel)]="inv.no" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="siDate">{{ 'goodsReceipt.supplierInvoiceDate' | t }}</label>
                    <div class="field"><input id="siDate" type="date" [(ngModel)]="inv.date" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="siEttn">ETTN</label>
                    <div class="field"><input id="siEttn" class="mono" maxlength="36" [(ngModel)]="inv.ettn" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="siAmt">{{ 'goodsReceipt.invoiceNetAmount' | t }}</label>
                    <div class="field"><input id="siAmt" type="number" step="0.01" class="num" [(ngModel)]="inv.amount" /><span class="affix suf">{{ r.currency }}</span></div>
                  </div>
                </div>
                <div class="gr-inv-act"><button type="button" class="btn btn-sm" (click)="saveInvoice(r)" [disabled]="busy()" [class.is-loading]="busy()"><span>{{ 'common.save' | t }}</span></button></div>
              </section>
            }
          </div>
          <div class="drawer-footer">
            @if (!ui.isReadonly() && r.status === 'COMPLETED') {
              <a class="btn btn-ghost" routerLink="/returns"><app-icon name="return" size="sm" />{{ 'goodsReceipt.purchaseReturn' | t }}</a>
            }
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost no-xs" (click)="selected.set(null)">{{ 'common.close' | t }}</button>
            @if (!ui.isReadonly()) {
              @if (r.status === 'COMPLETED' && r.buyerCarries && !r.ownDespatchId) { <button type="button" class="btn" (click)="ownDespatch(r)" [disabled]="busy()"><app-icon name="truck" size="sm" />{{ 'goodsReceipt.ownDespatch' | t }}</button> }
              @if (r.ownDespatchId) { <a class="btn" routerLink="/despatches" [queryParams]="{ id: r.ownDespatchId }"><app-icon name="truck" size="sm" />{{ 'goodsReceipt.openOwnDespatch' | t }}</a> }
            }
          </div>
        </div>
      </div>
    }

    @if (receivingPo(); as po) {
      <app-goods-receipt-form [po]="po" [warehouses]="warehouses()" [products]="products()" (done)="onReceived($event)" (closed)="receivingPo.set(null)"></app-goods-receipt-form>
    }
  `,
  styles: [`
    .drawer-h .eyebrow .mono { flex: none; white-space: nowrap; }
    .drawer-h .eyebrow .truncate { min-width: 0; }
    .xs-only { display: none !important; }
    .gr-start { display: flex; flex-direction: row; align-items: center; gap: 16px; flex-wrap: wrap; padding: 12px 12px 12px 16px; margin-bottom: 20px; }
    .gr-start-t { display: flex; align-items: center; gap: 12px; flex: 1 1 260px; min-width: 0; }
    .gr-start-ic { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--accent-soft); color: var(--accent-text); box-shadow: inset 0 0 0 1px var(--accent-line); }
    .gr-start-tx { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .gr-start-tx b { font-size: var(--text-sm); font-weight: 600; color: var(--fg); }
    .gr-start-tx span { font-size: var(--text-xs); color: var(--fg-3); }
    .gr-start-c { display: flex; align-items: center; gap: 8px; flex: 1 1 420px; min-width: 0; }
    .gr-po-select { flex: 1; min-width: 0; }
    .gr-toolbar { margin-bottom: 12px; }
    .gr-table td { max-width: 240px; }
    .gr-table td.w-act { overflow: visible; }
    .gr-head { display: inline-flex; align-items: center; gap: 8px; }
    .gr-no { font-weight: 500; color: var(--fg); }
    .gr-po { font-size: var(--text-xs); }
    .gr-sup .truncate { display: block; max-width: 200px; }
    .gr-table td.gr-docs { max-width: 220px; }
    .gr-docs { font-size: var(--text-xs); }
    .gr-slash { color: var(--fg-3); margin: 0 6px; }
    .gr-sk td, .gr-empty td { height: auto; padding: 10px 12px; }
    .gr-empty:hover td { background: transparent; }
    .gr-dh { font-family: var(--font-mono); font-size: var(--text-md); }
    .gr-meta { margin-bottom: 0; }
    .gr-net { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); font-size: var(--text-sm); color: var(--fg-2); }
    .gr-net b { font-size: var(--text-lg); font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; letter-spacing: var(--tracking-tighter); }
    .gr-lines td { vertical-align: top; padding-top: 9px; padding-bottom: 9px; }
    .gr-lines td .badge { white-space: nowrap; }
    .gr-pname { font-weight: 500; }
    .gr-sub { margin-top: 3px; font-size: var(--text-xs); color: var(--fg-3); }
    .gr-inv-act { display: flex; justify-content: flex-end; margin-top: 12px; }
    @media (min-width: 641px) and (max-width: 1500px) { .lg-only { display: none; } }
    @media (max-width: 640px) {
      .xs-only { display: inline-flex !important; }
      .no-xs { display: none !important; }
      .gr-start { padding: 12px; gap: 12px; }
      .gr-start-c { flex-wrap: wrap; flex-basis: 100%; }
      .gr-po-select { flex-basis: 100%; }
      .gr-start-c .btn { flex: 1; }
      .gr-table td { max-width: none; }
      .gr-head { display: flex; flex-wrap: wrap; width: 100%; }
      .gr-head .xs-only { margin-left: auto; }
      .gr-sup .truncate { max-width: 60vw; }
      .gr-toolbar .summary-strip { display: none; }
      .gr-table .row-act { opacity: 1; }
    }
  `],
})
export class GoodsReceiptsComponent implements OnInit {
  docs = inject(DocumentsService);
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  route = inject(ActivatedRoute);
  router = inject(Router);

  filters = ['all', 'noInvoice', 'discrepancy'];
  filter = signal('all');
  rows = signal<GoodsReceipt[]>([]);
  pos = signal<PurchaseOrder[]>([]);
  warehouses = signal<Warehouse[]>([]);
  products = signal<Product[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<GoodsReceipt | null>(null);
  receivingPo = signal<PurchaseOrder | null>(null);
  poToReceive = '';
  inv = { no: '', date: '', ettn: '', amount: null as number | null };
  badge = statusBadge;

  openPos = computed(() => this.pos().filter((p) => ['Draft', 'Sent', 'Partially Received'].includes(p.status)));
  visible = computed(() => {
    const f = this.filter();
    return this.rows().filter((r) => (f === 'noInvoice' ? !r.supplierInvoiceNo && r.status === 'COMPLETED' : f === 'discrepancy' ? r.hasDiscrepancy : true));
  });

  ngOnInit() {
    this.inventory.getWarehouses().subscribe({ next: (w) => this.warehouses.set((w || []).filter((x) => x.type !== 'IN_TRANSIT')), error: () => undefined });
    this.inventory.getProducts().subscribe({ next: (p) => this.products.set(p || []), error: () => undefined });
    this.inventory.getPurchaseOrders().subscribe({ next: (p) => this.pos.set(p || []), error: () => undefined });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.docs.goodsReceipts().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        const cur = this.selected()?.id || this.route.snapshot.queryParamMap.get('id');
        if (cur) this.select(rows.find((r) => r.id === cur) || null);
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error');
      },
    });
  }

  select(r: GoodsReceipt | null) {
    this.selected.set(r);
    if (r) this.inv = { no: r.supplierInvoiceNo || '', date: r.supplierInvoiceDate || '', ettn: r.supplierInvoiceEttn || '', amount: r.supplierInvoiceAmount ?? null };
  }

  whName(id: string) {
    return this.warehouses().find((w) => w.id === id)?.name || '-';
  }
  matchBadge(s?: string) {
    return s === 'MATCHED' ? 'badge-success' : s === 'AMOUNT_MISMATCH' ? 'badge-danger' : 'badge-warning';
  }
  print(r: GoodsReceipt) {
    this.docs.print(`goods-receipts/${r.id}/print`);
  }

  startReceipt() {
    const po = this.pos().find((p) => p.id === this.poToReceive);
    if (po) this.receivingPo.set(po);
  }

  onReceived(r: GoodsReceipt) {
    this.receivingPo.set(null);
    this.poToReceive = '';
    this.inventory.getPurchaseOrders().subscribe({ next: (p) => this.pos.set(p || []), error: () => undefined });
    this.load();
    this.select(r);
  }

  saveInvoice(r: GoodsReceipt) {
    this.busy.set(true);
    this.docs.setSupplierInvoice(r.id, { supplierInvoiceNo: this.inv.no || null, supplierInvoiceDate: this.inv.date || null, supplierInvoiceEttn: this.inv.ettn || null, supplierInvoiceAmount: this.inv.amount ?? null }).subscribe({
      next: (out) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('goodsReceipt.toast.invoiceSaved'), 'success');
        this.select(out);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  ownDespatch(r: GoodsReceipt) {
    this.busy.set(true);
    this.docs.ownDespatch(r.id, {}).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.router.navigate(['/despatches'], { queryParams: { id: d.id } });
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
