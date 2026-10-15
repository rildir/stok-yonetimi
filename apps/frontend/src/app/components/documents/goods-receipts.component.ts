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

/** Mal kabul fişleri: receipts per PO, discrepancies, supplier invoice (three-way match), own despatch when the buyer carries. */
@Component({
  selector: 'app-goods-receipts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, GoodsReceiptFormComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  template: `
    <header class="page-header">
      <div><h1>{{ 'goodsReceipt.title' | t }}</h1><p>{{ 'goodsReceipt.subtitle' | t }}</p></div>
      <div class="page-actions">
        @if (!ui.isReadonly() && openPos().length) {
          <select class="select" style="min-width: 220px" [(ngModel)]="poToReceive" [attr.aria-label]="'goodsReceipt.selectPo' | t">
            <option value="">{{ 'goodsReceipt.selectPo' | t }}</option>
            @for (p of openPos(); track p.id) { <option [value]="p.id">{{ p.poNumber }} · {{ p.supplierName }}</option> }
          </select>
          <button class="btn btn-primary" [disabled]="!poToReceive" (click)="startReceipt()">{{ 'goodsReceipt.new' | t }}</button>
        }
      </div>
    </header>

    <div class="filter-pills" style="margin-bottom: var(--space-4)">
      @for (f of filters; track f) { <button type="button" class="filter-pill" [class.active]="filter() === f" (click)="filter.set(f)">{{ 'goodsReceipt.filter.' + f | t }}</button> }
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead><tr>
            <th>{{ 'goodsReceipt.col.number' | t }}</th><th>{{ 'goodsReceipt.col.po' | t }}</th><th>{{ 'goodsReceipt.col.supplier' | t }}</th><th>{{ 'goodsReceipt.receivedAt' | t }}</th>
            <th>{{ 'goodsReceipt.col.supplierDocs' | t }}</th><th>{{ 'goodsReceipt.col.match' | t }}</th><th>{{ 'returns.col.status' | t }}</th><th class="th-actions">{{ 'common.actions' | t }}</th>
          </tr></thead>
          <tbody>
            @for (r of visible(); track r.id) {
              <tr class="clickable-row" (click)="select(r)">
                <td class="mono td-primary"><strong>{{ r.receiptNo }}</strong>@if (r.hasDiscrepancy) { <span class="badge badge-warning">{{ 'goodsReceipt.discrepancy' | t }}</span> }</td>
                <td class="mono" [attr.data-label]="'goodsReceipt.col.po' | t">{{ r.poNumber }}</td>
                <td [attr.data-label]="'goodsReceipt.col.supplier' | t">{{ r.supplierSnapshot?.name }}</td>
                <td [attr.data-label]="'goodsReceipt.receivedAt' | t">{{ r.receivedAt | appDate: 'datetime' }}</td>
                <td class="mono text-xs" [attr.data-label]="'goodsReceipt.col.supplierDocs' | t">{{ r.supplierDespatchNo || '-' }} / {{ r.supplierInvoiceNo || '-' }}</td>
                <td [attr.data-label]="'goodsReceipt.col.match' | t"><span class="badge" [ngClass]="matchBadge(r.matchStatus)">{{ 'goodsReceipt.match.' + (r.matchStatus || 'NO_INVOICE') | t }}</span></td>
                <td [attr.data-label]="'returns.col.status' | t"><span class="badge" [ngClass]="badge(r.status)">{{ 'returns.status.' + r.status | t }}</span></td>
                <td class="td-actions" (click)="$event.stopPropagation()"><button class="btn btn-secondary btn-sm" (click)="print(r)">{{ 'documents.print' | t }}</button></td>
              </tr>
            }
            @if (!loading() && visible().length === 0) { <tr><td colspan="8"><div class="empty-state"><p class="empty-state-title">{{ 'goodsReceipt.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ 'goodsReceipt.detail' | t }}</span><span class="mono text-muted">{{ r.receiptNo }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (r.requiresExpenseVoucher) {
              <div class="doc-alert">{{ 'goodsReceipt.voucherRequired' | t }} @if (r.expenseVoucherId) { <a class="link" routerLink="/expense-vouchers" [queryParams]="{ id: r.expenseVoucherId }">{{ 'returns.openVoucher' | t }}</a> }</div>
            }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'goodsReceipt.col.po' | t }}</label><span class="mono">{{ r.poNumber }}</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.col.supplier' | t }}</label><span>{{ r.supplierSnapshot?.name }} <span class="mono text-muted">{{ r.supplierSnapshot?.taxId }}</span></span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.receivedAt' | t }}</label><span>{{ r.receivedAt | appDate: 'datetime' }}</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.warehouse' | t }}</label><span>{{ whName(r.warehouseId) }}</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.supplierDespatchNo' | t }}</label><span class="mono">{{ r.supplierDespatchNo || '-' }} @if (r.supplierDespatchDate) { ({{ r.supplierDespatchDate | appDate }}) }</span></div>
              <div class="doc-field"><label>{{ 'goodsReceipt.acceptedNet' | t }}</label><span>{{ r.acceptedNetAmount | money: r.currency }}</span></div>
            </div>
            <table class="doc-table">
              <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'goodsReceipt.despatchQty' | t }}</th><th class="num">{{ 'goodsReceipt.counted' | t }}</th><th class="num">{{ 'goodsReceipt.rejected' | t }}</th><th class="num">{{ 'goodsReceipt.accepted' | t }}</th><th class="num hide-xs">{{ 'goodsReceipt.difference' | t }}</th></tr></thead>
              <tbody>
                @for (i of r.items; track i.id) {
                  <tr>
                    <td>{{ i.productName }}@for (t of i.tracking || []; track $index) { @if (t.lotNumber) { <div class="text-xs text-muted">{{ 'documents.lot' | t }}: {{ t.lotNumber }}</div> } }</td>
                    <td class="num">{{ i.despatchQuantity | num }}</td><td class="num">{{ i.countedQuantity | num }}</td>
                    <td class="num">{{ i.rejectedQuantity | num }}@if (i.rejectReason) { <div class="text-xs text-muted">{{ 'goodsReceipt.reject.' + i.rejectReason | t }}</div> }</td>
                    <td class="num"><strong>{{ i.acceptedQuantity | num }}</strong></td>
                    <td class="num hide-xs">@if (i.surplusQuantity) { <span class="text-warning">{{ 'goodsReceipt.surplus' | t: { qty: (i.surplusQuantity | num) } }}</span> } @if (i.shortageQuantity) { <span class="text-danger">{{ 'goodsReceipt.shortage' | t: { qty: (i.shortageQuantity | num) } }}</span> } @if (!i.surplusQuantity && !i.shortageQuantity) { - }</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (r.status === 'COMPLETED' && !ui.isReadonly()) {
              <div class="doc-section">
                <h4 class="doc-section-title">{{ 'goodsReceipt.supplierInvoice' | t }}</h4>
                <div class="doc-grid">
                  <div class="doc-field"><label for="siNo">{{ 'goodsReceipt.supplierInvoiceNo' | t }}</label><input id="siNo" class="input mono" [(ngModel)]="inv.no" /></div>
                  <div class="doc-field"><label for="siDate">{{ 'goodsReceipt.supplierInvoiceDate' | t }}</label><input id="siDate" type="date" class="input" [(ngModel)]="inv.date" /></div>
                  <div class="doc-field"><label for="siEttn">ETTN</label><input id="siEttn" class="input mono" maxlength="36" [(ngModel)]="inv.ettn" /></div>
                  <div class="doc-field"><label for="siAmt">{{ 'goodsReceipt.invoiceNetAmount' | t }}</label><input id="siAmt" type="number" step="0.01" class="input" [(ngModel)]="inv.amount" /></div>
                </div>
                <button class="btn btn-secondary btn-sm" (click)="saveInvoice(r)" [disabled]="busy()">{{ 'common.save' | t }}</button>
              </div>
            }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="print(r)">{{ 'documents.print' | t }}</button>
            @if (!ui.isReadonly()) {
              @if (r.status === 'COMPLETED' && r.buyerCarries && !r.ownDespatchId) { <button class="btn btn-secondary" (click)="ownDespatch(r)" [disabled]="busy()">{{ 'goodsReceipt.ownDespatch' | t }}</button> }
              @if (r.ownDespatchId) { <a class="btn btn-secondary" routerLink="/despatches" [queryParams]="{ id: r.ownDespatchId }">{{ 'goodsReceipt.openOwnDespatch' | t }}</a> }
              @if (r.status === 'COMPLETED') { <a class="btn btn-secondary" routerLink="/returns">{{ 'goodsReceipt.purchaseReturn' | t }}</a> }
            }
          </div>
        </div>
      </div>
    }

    @if (receivingPo(); as po) {
      <app-goods-receipt-form [po]="po" [warehouses]="warehouses()" [products]="products()" (done)="onReceived($event)" (closed)="receivingPo.set(null)"></app-goods-receipt-form>
    }
  `,
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
