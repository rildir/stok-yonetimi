import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError, nowLocalInput } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { GoodsReceipt, Invoice, ReturnDoc, statusBadge } from '../../models/documents.models';
import { REFUND_CHANNELS, RETURN_CONDITIONS, returnableQuantity } from '@stok/tr-compliance';
import { SpecialCategoryWarningComponent } from '../shared/special-category-warning.component';

interface ReturnFormLine {
  sourceId: string;
  name: string;
  available: number;
  quantity: number | null;
  condition: string;
}

/** İadeler: sales returns / withdrawal (cayma) / defect against an invoice line, purchase returns against a goods receipt. */
@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, SpecialCategoryWarningComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  template: `
    <header class="page-header">
      <div><h1>{{ 'returns.title' | t }}</h1><p>{{ 'returns.subtitle' | t }}</p></div>
      <div class="page-actions">
        @if (!ui.isReadonly()) { <button class="btn btn-primary" (click)="openForm()">{{ 'returns.new' | t }}</button> }
      </div>
    </header>

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead><tr>
            <th>{{ 'returns.col.number' | t }}</th><th>{{ 'returns.col.type' | t }}</th><th>{{ 'returns.col.party' | t }}</th><th>{{ 'returns.col.original' | t }}</th>
            <th class="num">{{ 'invoices.grandTotal' | t }}</th><th>{{ 'returns.col.status' | t }}</th><th class="th-actions">{{ 'common.actions' | t }}</th>
          </tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="clickable-row" (click)="selected.set(r)">
                <td class="mono td-primary"><strong>{{ r.returnNo }}</strong><div class="text-xs text-muted">{{ r.createdAt | appDate }}</div></td>
                <td [attr.data-label]="'returns.col.type' | t">{{ 'returns.type.' + r.type | t }}</td>
                <td [attr.data-label]="'returns.col.party' | t">{{ r.partySnapshot?.name }}</td>
                <td class="mono" [attr.data-label]="'returns.col.original' | t">{{ r.invoiceNo || '-' }}</td>
                <td class="num" [attr.data-label]="'invoices.grandTotal' | t">{{ r.grandTotal | money: r.currency }}</td>
                <td [attr.data-label]="'returns.col.status' | t"><span class="badge" [ngClass]="badge(r.status)">{{ 'returns.status.' + r.status | t }}</span></td>
                <td class="td-actions" (click)="$event.stopPropagation()"><button class="btn btn-secondary btn-sm" (click)="print(r)">{{ 'documents.print' | t }}</button></td>
              </tr>
            }
            @if (!loading() && rows().length === 0) { <tr><td colspan="7"><div class="empty-state"><p class="empty-state-title">{{ 'returns.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ 'returns.detail' | t }}</span><span class="mono text-muted">{{ r.returnNo }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (r.status === 'DRAFT') { <div class="doc-alert info">{{ 'returns.draftInfo' | t }}</div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'returns.col.type' | t }}</label><span>{{ 'returns.type.' + r.type | t }}</span></div>
              <div class="doc-field"><label>{{ 'returns.col.status' | t }}</label><span><span class="badge" [ngClass]="badge(r.status)">{{ 'returns.status.' + r.status | t }}</span></span></div>
              <div class="doc-field"><label>{{ 'returns.col.party' | t }}</label><span>{{ r.partySnapshot?.name }}</span></div>
              <div class="doc-field"><label>{{ 'returns.col.original' | t }}</label><span class="mono">{{ r.invoiceNo || '-' }} @if (r.invoiceDate) { ({{ r.invoiceDate | appDate }}) }</span></div>
              @if (r.counterpartyDocNo) { <div class="doc-field"><label>{{ 'returns.counterpartyDoc' | t }}</label><span class="mono">{{ r.counterpartyDocNo }} ({{ r.counterpartyDocDate | appDate }})</span></div> }
              @if (r.refundChannel) { <div class="doc-field"><label>{{ 'returns.refundChannel' | t }}</label><span>{{ 'returns.channel.' + r.refundChannel | t }} {{ r.refundRef }}</span></div> }
              @if (r.type === 'WITHDRAWAL') {
                <div class="doc-field"><label>{{ 'returns.withdrawalDeadline' | t }}</label><span>{{ r.withdrawalDeadline | appDate }}</span></div>
                <div class="doc-field"><label>{{ 'returns.goodsReturnDeadline' | t }}</label><span>{{ r.goodsReturnDeadline | appDate }}</span></div>
                <div class="doc-field"><label>{{ 'returns.refundDueDate' | t }}</label><span>@if (r.refundDueDate) { {{ r.refundDueDate | appDate }} } @else { <span class="text-muted">{{ 'returns.refundPending' | t }}</span> }</span></div>
                @if (r.goodsHandedOverDate) { <div class="doc-field"><label>{{ 'returns.goodsHandedOverDate' | t }}</label><span>{{ r.goodsHandedOverDate | appDate }}</span></div> }
              }
              @if (r.returnInvoiceId) { <div class="doc-field"><label>{{ 'returns.returnInvoice' | t }}</label><span><a class="link" routerLink="/invoices" [queryParams]="{ id: r.returnInvoiceId }">{{ 'returns.openInvoice' | t }}</a></span></div> }
              @if (r.expenseVoucherId) { <div class="doc-field"><label>{{ 'returns.expenseVoucher' | t }}</label><span><a class="link" routerLink="/expense-vouchers" [queryParams]="{ id: r.expenseVoucherId }">{{ 'returns.openVoucher' | t }}</a></span></div> }
            </div>
            <table class="doc-table">
              <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num">{{ 'invoices.vat' | t }}</th><th class="num">{{ 'invoices.net' | t }}</th><th class="hide-xs">{{ 'returns.condition' | t }}</th></tr></thead>
              <tbody>
                @for (i of r.items; track i.id) {
                  <tr><td>{{ i.productName }}</td><td class="num">{{ i.quantity | num }} {{ i.unitCode }}</td><td class="num">%{{ i.taxRate | num }}</td><td class="num">{{ i.netAmount | money: r.currency }}</td><td class="hide-xs">{{ 'returns.conditions.' + i.condition | t }}</td></tr>
                }
              </tbody>
            </table>
            <div class="doc-totals">
              <div class="row"><span>{{ 'invoices.subtotal' | t }}</span><span>{{ r.subtotal | money: r.currency }}</span></div>
              <div class="row"><span>{{ 'invoices.vat' | t }}</span><span>{{ r.taxTotal | money: r.currency }}</span></div>
              <div class="row grand"><span>{{ 'invoices.grandTotal' | t }}</span><span>{{ r.grandTotal | money: r.currency }}</span></div>
            </div>
            @if (r.status === 'DRAFT' && r.type === 'WITHDRAWAL' && !ui.isReadonly()) {
              <div class="doc-section">
                <div class="doc-field"><label for="rtHand">{{ 'returns.goodsHandedOverDate' | t }}</label><input id="rtHand" type="date" class="input" [(ngModel)]="handedOver" /></div>
                <p class="doc-hint">{{ 'returns.goodsHandedOverHint' | t }}</p>
              </div>
            }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="print(r)">{{ 'documents.print' | t }}</button>
            @if (r.status === 'DRAFT' && !ui.isReadonly()) {
              <button class="btn btn-danger" (click)="remove(r)" [disabled]="busy()">{{ 'returns.deleteDraft' | t }}</button>
              <button class="btn btn-primary" (click)="complete(r)" [disabled]="busy()">{{ 'returns.complete' | t }}</button>
            }
          </div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <div class="drawer-overlay" (click)="formOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'returns.new' | t }}</span>
            <button class="drawer-close" (click)="formOpen.set(false)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            <div class="doc-grid">
              <div class="doc-field"><label for="rtType">{{ 'returns.col.type' | t }}</label>
                <select id="rtType" class="select" [(ngModel)]="type" (ngModelChange)="onTypeChange()">
                  @for (t of types; track t) { <option [value]="t">{{ 'returns.type.' + t | t }}</option> }
                </select>
              </div>
              @if (type !== 'PURCHASE_RETURN') {
                <div class="doc-field"><label for="rtInv">{{ 'returns.invoice' | t }}</label>
                  <select id="rtInv" class="select" [(ngModel)]="sourceId" (ngModelChange)="buildLines()">
                    <option value="">{{ 'returns.selectInvoice' | t }}</option>
                    @for (i of invoices(); track i.id) { <option [value]="i.id">{{ i.documentNo }} · {{ i.buyerSnapshot?.name }}</option> }
                  </select>
                </div>
              } @else {
                <div class="doc-field"><label for="rtGr">{{ 'returns.receipt' | t }}</label>
                  <select id="rtGr" class="select" [(ngModel)]="sourceId" (ngModelChange)="buildLines()">
                    <option value="">{{ 'returns.selectReceipt' | t }}</option>
                    @for (g of receipts(); track g.id) { <option [value]="g.id">{{ g.receiptNo }} · {{ g.supplierSnapshot?.name }}</option> }
                  </select>
                </div>
              }
            </div>
            @if (type === 'WITHDRAWAL') { <div class="doc-alert info">{{ 'returns.withdrawalInfo' | t }}</div> }
            @if (formLines().length) {
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'returns.returnable' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th>@if (type !== 'PURCHASE_RETURN') {<th>{{ 'returns.condition' | t }}</th>}</tr></thead>
                <tbody>
                  @for (l of formLines(); track l.sourceId) {
                    <tr>
                      <td>{{ l.name }}</td>
                      <td class="num">{{ l.available | num }}</td>
                      <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.quantity" [attr.max]="l.available" /></td>
                      @if (type !== 'PURCHASE_RETURN') {
                        <td><select class="select" [(ngModel)]="l.condition">@for (c of conditions; track c) { <option [value]="c">{{ 'returns.conditions.' + c | t }}</option> }</select></td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            }
            <div class="doc-grid doc-section">
              @if (type !== 'PURCHASE_RETURN') {
                <div class="doc-field"><label for="rtCh">{{ 'returns.refundChannel' | t }}</label>
                  <select id="rtCh" class="select" [(ngModel)]="refundChannel"><option value="">-</option>@for (c of channels; track c) { <option [value]="c">{{ 'returns.channel.' + c | t }}</option> }</select>
                </div>
                <div class="doc-field"><label for="rtRef">{{ 'returns.refundRef' | t }}</label><input id="rtRef" class="input" [(ngModel)]="refundRef" /></div>
              }
              <div class="doc-field"><label for="rtCp">{{ 'returns.counterpartyDoc' | t }}</label><input id="rtCp" class="input mono" [(ngModel)]="counterpartyDocNo" /></div>
              <div class="doc-field"><label for="rtCpDate">{{ 'returns.counterpartyDocDate' | t }}</label><input id="rtCpDate" type="date" class="input" [(ngModel)]="counterpartyDocDate" /></div>
              @if (type === 'WITHDRAWAL') { <div class="doc-field"><label for="rtNot">{{ 'returns.notifiedAt' | t }}</label><input id="rtNot" type="datetime-local" class="input" [(ngModel)]="notifiedAt" /></div> }
            </div>
            <p class="doc-hint">{{ 'returns.formHint' | t }}</p>
            <div class="doc-field"><label for="rtNote">{{ 'despatches.note' | t }}</label><textarea id="rtNote" class="textarea" rows="2" [(ngModel)]="note"></textarea><app-special-category-warning [text]="note" /></div>
            @if (error()) { <div class="doc-alert danger">{{ error() }}</div> }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="save()" [disabled]="busy() || !sourceId">{{ 'returns.saveDraft' | t }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ReturnsComponent implements OnInit {
  docs = inject(DocumentsService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  route = inject(ActivatedRoute);

  rows = signal<ReturnDoc[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<ReturnDoc | null>(null);
  formOpen = signal(false);
  error = signal<string | null>(null);
  invoices = signal<Invoice[]>([]);
  receipts = signal<GoodsReceipt[]>([]);
  formLines = signal<ReturnFormLine[]>([]);
  badge = statusBadge;
  types = ['SALES_RETURN', 'WITHDRAWAL', 'DEFECT', 'PURCHASE_RETURN'];
  conditions = RETURN_CONDITIONS as readonly string[];
  channels = REFUND_CHANNELS as readonly string[];
  type = 'SALES_RETURN';
  sourceId = '';
  refundChannel = '';
  refundRef = '';
  counterpartyDocNo = '';
  counterpartyDocDate = '';
  notifiedAt = nowLocalInput();
  note = '';
  handedOver = '';

  ngOnInit() {
    this.load();
    const invoiceId = this.route.snapshot.queryParamMap.get('invoiceId');
    if (invoiceId) this.openForm(invoiceId);
  }

  load() {
    this.loading.set(true);
    this.docs.returns().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        if (this.selected()) this.selected.set(rows.find((r) => r.id === this.selected()!.id) || null);
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error');
      },
    });
  }

  openForm(invoiceId?: string) {
    this.error.set(null);
    this.type = 'SALES_RETURN';
    this.sourceId = invoiceId || '';
    this.formLines.set([]);
    this.formOpen.set(true);
    this.docs.invoices({ kind: 'SALES' }).subscribe((rows) => {
      this.invoices.set(rows.filter((i) => !['DRAFT', 'CANCELLED'].includes(i.status)));
      if (this.sourceId) this.buildLines();
    });
    this.docs.goodsReceipts({ status: 'COMPLETED' }).subscribe((rows) => this.receipts.set(rows));
  }

  onTypeChange() {
    this.sourceId = '';
    this.formLines.set([]);
  }

  buildLines() {
    const condition = this.type === 'DEFECT' ? 'DAMAGED' : 'RESELLABLE';
    if (this.type === 'PURCHASE_RETURN') {
      const g = this.receipts().find((x) => x.id === this.sourceId);
      this.formLines.set((g?.items || []).map((i) => ({ sourceId: i.id, name: i.productName, available: returnableQuantity(i.acceptedQuantity, i.returnedQuantity), quantity: 0, condition })).filter((l) => l.available > 0));
    } else {
      const inv = this.invoices().find((x) => x.id === this.sourceId);
      this.formLines.set((inv?.lines || []).map((l) => ({ sourceId: l.id, name: l.productName, available: returnableQuantity(l.baseQuantity, l.returnedQuantity), quantity: 0, condition })).filter((l) => l.available > 0));
    }
  }

  save() {
    this.error.set(null);
    const lines = this.formLines()
      .filter((l) => Number(l.quantity) > 0)
      .map((l) => (this.type === 'PURCHASE_RETURN' ? { goodsReceiptItemId: l.sourceId, quantity: Number(l.quantity) } : { invoiceLineId: l.sourceId, quantity: Number(l.quantity), condition: l.condition }));
    if (!lines.length) return this.error.set(this.i18n.t('returns.linesRequired'));
    const body: Record<string, unknown> = {
      type: this.type,
      lines,
      [this.type === 'PURCHASE_RETURN' ? 'goodsReceiptId' : 'invoiceId']: this.sourceId,
      refundChannel: this.refundChannel || undefined,
      refundRef: this.refundRef || undefined,
      counterpartyDocNo: this.counterpartyDocNo || undefined,
      counterpartyDocDate: this.counterpartyDocDate || undefined,
      notifiedAt: this.type === 'WITHDRAWAL' ? this.notifiedAt : undefined,
      note: this.note || undefined,
    };
    this.busy.set(true);
    this.docs.createReturn(body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.ui.showToast(this.i18n.t('returns.toast.created', { number: r.returnNo }), 'success');
        this.load();
        this.selected.set(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiError(e, this.i18n.t('documents.actionError')));
      },
    });
  }

  complete(r: ReturnDoc) {
    this.ui.openConfirm({
      title: this.i18n.t('returns.complete'),
      message: this.i18n.t('returns.completeConfirm'),
      onConfirm: () => {
        this.busy.set(true);
        this.docs.completeReturn(r.id, r.type === 'WITHDRAWAL' && this.handedOver ? { goodsHandedOverDate: this.handedOver } : {}).subscribe({
          next: (out) => {
            this.busy.set(false);
            this.handedOver = '';
            this.selected.set(out);
            this.ui.showToast(this.i18n.t('returns.toast.completed'), 'success');
            this.load();
          },
          error: (e) => {
            this.busy.set(false);
            this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
          },
        });
      },
    });
  }

  remove(r: ReturnDoc) {
    this.docs.deleteReturn(r.id).subscribe({
      next: () => {
        this.selected.set(null);
        this.load();
      },
      error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error'),
    });
  }

  print(r: ReturnDoc) {
    this.docs.print(`returns/${r.id}/print`);
  }
}
