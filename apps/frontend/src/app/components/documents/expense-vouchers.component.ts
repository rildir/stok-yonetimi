import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { ExpenseVoucher, statusBadge } from '../../models/documents.models';
import { Supplier } from '../../models/inventory.models';
import { PAYMENT_CHANNELS } from '@stok/tr-compliance';

interface VoucherLineForm {
  description: string;
  quantity: number | null;
  unitCode: string;
  unitPrice: number | null;
}

/** Gider pusulası (VUK 234) and müstahsil makbuzu (VUK 235): 7-day issue deadline, stopaj, signed copy. */
@Component({
  selector: 'app-expense-vouchers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe],
  styleUrls: ['../../drawer.css', './documents.css'],
  template: `
    <header class="page-header">
      <div><h1>{{ 'expenseVouchers.title' | t }}</h1><p>{{ 'expenseVouchers.subtitle' | t }}</p></div>
      <div class="page-actions">@if (!ui.isReadonly()) { <button class="btn btn-primary" (click)="openForm()">{{ 'expenseVouchers.new' | t }}</button> }</div>
    </header>

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead><tr>
            <th>{{ 'expenseVouchers.col.number' | t }}</th><th>{{ 'expenseVouchers.col.kind' | t }}</th><th>{{ 'expenseVouchers.col.seller' | t }}</th>
            <th>{{ 'expenseVouchers.dueDate' | t }}</th><th class="num">{{ 'expenseVouchers.gross' | t }}</th><th>{{ 'returns.col.status' | t }}</th><th class="th-actions">{{ 'common.actions' | t }}</th>
          </tr></thead>
          <tbody>
            @for (v of rows(); track v.id) {
              <tr class="clickable-row" (click)="select(v)">
                <td class="mono td-primary"><strong>{{ v.documentNo || ('invoices.draftNo' | t) }}</strong></td>
                <td [attr.data-label]="'expenseVouchers.col.kind' | t">{{ 'expenseVouchers.kind.' + v.kind | t }}</td>
                <td [attr.data-label]="'expenseVouchers.col.seller' | t">{{ v.sellerSnapshot?.name }}</td>
                <td [attr.data-label]="'expenseVouchers.dueDate' | t">
                  {{ v.dueDate ? (v.dueDate | appDate) : '-' }}
                  @if (v.status === 'DRAFT' && v.dueDate && v.dueDate < today) { <span class="badge badge-danger">{{ 'expenseVouchers.overdue' | t }}</span> }
                </td>
                <td class="num" [attr.data-label]="'expenseVouchers.gross' | t">{{ v.grossTotal | money: v.currency }}</td>
                <td [attr.data-label]="'returns.col.status' | t"><span class="badge" [ngClass]="badge(v.status)">{{ 'expenseVouchers.status.' + v.status | t }}</span>@if (v.status === 'ISSUED' && !v.signedCopyReceived) { <span class="badge badge-warning">{{ 'expenseVouchers.unsigned' | t }}</span> }</td>
                <td class="td-actions" (click)="$event.stopPropagation()"><button class="btn btn-secondary btn-sm" (click)="print(v)">{{ 'documents.print' | t }}</button></td>
              </tr>
            }
            @if (!loading() && rows().length === 0) { <tr><td colspan="7"><div class="empty-state"><p class="empty-state-title">{{ 'expenseVouchers.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as v) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ 'expenseVouchers.kind.' + v.kind | t }}</span><span class="mono text-muted">{{ v.documentNo || ('invoices.draftNo' | t) }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (v.status === 'DRAFT') { <div class="doc-alert">{{ 'expenseVouchers.draftInfo' | t: { date: (v.dueDate | appDate) } }}</div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'expenseVouchers.col.seller' | t }}</label><span>{{ v.sellerSnapshot?.name }} <span class="mono text-muted">{{ v.sellerSnapshot?.taxId }}</span></span></div>
              <div class="doc-field"><label>{{ 'returns.col.status' | t }}</label><span><span class="badge" [ngClass]="badge(v.status)">{{ 'expenseVouchers.status.' + v.status | t }}</span></span></div>
              <div class="doc-field"><label>{{ 'expenseVouchers.deliveryDate' | t }}</label><span>{{ v.deliveryDate | appDate }}</span></div>
              <div class="doc-field"><label>{{ 'expenseVouchers.dueDate' | t }}</label><span>{{ v.dueDate | appDate }}</span></div>
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ v.issueDate ? (v.issueDate | appDate) : '-' }}</span></div>
              <div class="doc-field"><label>{{ 'expenseVouchers.payment' | t }}</label><span>{{ v.paymentChannel ? ('expenseVouchers.channel.' + v.paymentChannel | t) : '-' }} {{ v.paymentRef }}</span></div>
            </div>
            <table class="doc-table">
              <thead><tr><th>{{ 'expenseVouchers.description' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num">{{ 'invoices.unitPrice' | t }}</th><th class="num">{{ 'expenseVouchers.amount' | t }}</th></tr></thead>
              <tbody>@for (l of v.lines; track $index) { <tr><td>{{ l.description }}</td><td class="num">{{ l.quantity | num }} {{ l.unitCode }}</td><td class="num">{{ l.unitPrice | money: v.currency }}</td><td class="num">{{ l.amount | money: v.currency }}</td></tr> }</tbody>
            </table>
            <div class="doc-totals">
              <div class="row"><span>{{ 'expenseVouchers.gross' | t }}</span><span>{{ v.grossTotal | money: v.currency }}</span></div>
              <div class="row"><span>{{ 'expenseVouchers.withholding' | t: { rate: (v.withholdingRate | num) } }}</span><span>{{ v.withholdingAmount | money: v.currency }}</span></div>
              @if (v.otherDeductions) { <div class="row"><span>{{ 'expenseVouchers.otherDeductions' | t }}</span><span>{{ v.otherDeductions | money: v.currency }}</span></div> }
              <div class="row grand"><span>{{ 'expenseVouchers.net' | t }}</span><span>{{ v.netPayable | money: v.currency }}</span></div>
            </div>
            @if (v.status === 'DRAFT' && !ui.isReadonly()) {
              <div class="doc-grid doc-section">
                <div class="doc-field"><label for="evRate">{{ 'expenseVouchers.withholdingRate' | t }}</label><input id="evRate" type="number" min="0" max="100" step="0.01" class="input" [(ngModel)]="draftRate" /></div>
                <div class="doc-field"><label for="evCh">{{ 'expenseVouchers.payment' | t }}</label>
                  <select id="evCh" class="select" [(ngModel)]="draftChannel"><option value="">-</option>@for (c of channels; track c) { <option [value]="c">{{ 'expenseVouchers.channel.' + c | t }}</option> }</select></div>
              </div>
              <button class="btn btn-secondary btn-sm" (click)="saveDraft(v)" [disabled]="busy()">{{ 'common.save' | t }}</button>
            }
            @if (v.status === 'CANCELLED') { <div class="doc-alert danger doc-section">{{ 'invoices.cancelledInfo' | t: { reason: v.cancelReason } }}</div> }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="print(v)">{{ 'documents.print' | t }}</button>
            @if (!ui.isReadonly()) {
              @if (v.status === 'DRAFT') {
                <button class="btn btn-danger" (click)="remove(v)" [disabled]="busy()">{{ 'invoices.deleteDraft' | t }}</button>
                <button class="btn btn-primary" (click)="issue(v)" [disabled]="busy()">{{ 'expenseVouchers.issue' | t }}</button>
              }
              @if (v.status === 'ISSUED') {
                <button class="btn btn-secondary" (click)="signed(v)" [disabled]="busy()">{{ (v.signedCopyReceived ? 'expenseVouchers.unsign' : 'expenseVouchers.signedReceived') | t }}</button>
                <button class="btn btn-danger" (click)="cancel(v)" [disabled]="busy()">{{ 'invoices.cancel' | t }}</button>
              }
            }
          </div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <div class="drawer-overlay" (click)="formOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header"><span class="drawer-title">{{ 'expenseVouchers.new' | t }}</span>
            <button class="drawer-close" (click)="formOpen.set(false)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
          <div class="drawer-body">
            <div class="doc-grid">
              <div class="doc-field"><label for="nvKind">{{ 'expenseVouchers.col.kind' | t }}</label>
                <select id="nvKind" class="select" [(ngModel)]="kind"><option value="GIDER_PUSULASI">{{ 'expenseVouchers.kind.GIDER_PUSULASI' | t }}</option>@if (producerEnabled()) { <option value="MUSTAHSIL_MAKBUZU">{{ 'expenseVouchers.kind.MUSTAHSIL_MAKBUZU' | t }}</option> }</select></div>
              <div class="doc-field"><label for="nvSup">{{ 'expenseVouchers.col.seller' | t }}</label>
                <select id="nvSup" class="select" [(ngModel)]="supplierId"><option value="">{{ 'expenseVouchers.adHocSeller' | t }}</option>@for (s of nonTaxpayers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div>
              @if (!supplierId) {
                <div class="doc-field"><label for="nvName">{{ 'expenseVouchers.sellerName' | t }}</label><input id="nvName" class="input" [(ngModel)]="sellerName" /></div>
                <div class="doc-field"><label for="nvTckn">{{ 'expenseVouchers.sellerTckn' | t }}</label><input id="nvTckn" class="input mono" maxlength="11" [(ngModel)]="sellerTckn" /></div>
              }
              <div class="doc-field"><label for="nvDel">{{ 'expenseVouchers.deliveryDate' | t }}</label><input id="nvDel" type="date" class="input" [(ngModel)]="deliveryDate" /></div>
              <div class="doc-field"><label for="nvRate">{{ 'expenseVouchers.withholdingRate' | t }}</label><input id="nvRate" type="number" min="0" max="100" step="0.01" class="input" [(ngModel)]="rate" /></div>
            </div>
            <table class="doc-table">
              <thead><tr><th>{{ 'expenseVouchers.description' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="hide-xs">{{ 'expenseVouchers.unit' | t }}</th><th class="num">{{ 'invoices.unitPrice' | t }}</th><th></th></tr></thead>
              <tbody>
                @for (l of lines(); track $index) {
                  <tr>
                    <td><input class="input" [(ngModel)]="l.description" /></td>
                    <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.quantity" /></td>
                    <td class="hide-xs"><input class="input" style="width: 72px" [(ngModel)]="l.unitCode" /></td>
                    <td class="num"><input type="number" min="0" step="0.01" class="input qty" [(ngModel)]="l.unitPrice" /></td>
                    <td><button type="button" class="btn btn-ghost btn-sm" (click)="removeLine($index)">✕</button></td>
                  </tr>
                }
              </tbody>
            </table>
            <button type="button" class="btn btn-secondary btn-sm" style="margin-top: var(--space-2)" (click)="addLine()">{{ 'despatches.addLine' | t }}</button>
            <p class="doc-hint doc-section">{{ 'expenseVouchers.formHint' | t }}</p>
            @if (error()) { <div class="doc-alert danger">{{ error() }}</div> }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="create()" [disabled]="busy()">{{ 'returns.saveDraft' | t }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ExpenseVouchersComponent implements OnInit {
  docs = inject(DocumentsService);
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  route = inject(ActivatedRoute);

  rows = signal<ExpenseVoucher[]>([]);
  suppliers = signal<Supplier[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<ExpenseVoucher | null>(null);
  formOpen = signal(false);
  producerEnabled = signal(false);
  error = signal<string | null>(null);
  lines = signal<VoucherLineForm[]>([]);
  badge = statusBadge;
  channels = PAYMENT_CHANNELS as readonly string[];
  today = new Date().toISOString().slice(0, 10);
  kind = 'GIDER_PUSULASI';
  supplierId = '';
  sellerName = '';
  sellerTckn = '';
  deliveryDate = this.today;
  rate = 0;
  draftRate = 0;
  draftChannel = '';

  nonTaxpayers = computed(() => this.suppliers().filter((s: any) => s.isTaxpayer === false));

  ngOnInit() {
    this.docs.company().subscribe({ next: (c) => this.producerEnabled.set(!!c.producerReceiptEnabled), error: () => undefined });
    this.inventory.getSuppliers().subscribe({ next: (s) => this.suppliers.set(s || []), error: () => undefined });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.docs.vouchers().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        const cur = this.selected()?.id || this.route.snapshot.queryParamMap.get('id');
        if (cur) {
          const v = rows.find((r) => r.id === cur) || null;
          this.selected.set(v);
          if (v) {
            this.draftRate = v.withholdingRate;
            this.draftChannel = v.paymentChannel || '';
          }
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error');
      },
    });
  }

  select(v: ExpenseVoucher) {
    this.selected.set(v);
    this.draftRate = v.withholdingRate;
    this.draftChannel = v.paymentChannel || '';
  }

  print(v: ExpenseVoucher) {
    this.docs.print(`expense-vouchers/${v.id}/print`);
  }

  openForm() {
    this.error.set(null);
    this.lines.set([{ description: '', quantity: 1, unitCode: 'C62', unitPrice: 0 }]);
    this.formOpen.set(true);
  }
  addLine() {
    this.lines.update((l) => [...l, { description: '', quantity: 1, unitCode: 'C62', unitPrice: 0 }]);
  }
  removeLine(i: number) {
    this.lines.update((l) => l.filter((_, x) => x !== i));
  }

  create() {
    this.error.set(null);
    const lines = this.lines().filter((l) => l.description.trim() && Number(l.quantity) > 0).map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitCode: l.unitCode || null, unitPrice: Number(l.unitPrice) || 0 }));
    if (!lines.length) return this.error.set(this.i18n.t('expenseVouchers.linesRequired'));
    const body: Record<string, unknown> = { kind: this.kind, deliveryDate: this.deliveryDate, withholdingRate: Number(this.rate) || 0, lines };
    if (this.supplierId) body['supplierId'] = this.supplierId;
    else body['seller'] = { name: this.sellerName.trim(), taxIdType: this.sellerTckn ? 'TCKN' : null, taxId: this.sellerTckn || null };
    this.busy.set(true);
    this.docs.createVoucher(body).subscribe({
      next: (v) => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.selected.set(v);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiError(e, this.i18n.t('documents.actionError')));
      },
    });
  }

  saveDraft(v: ExpenseVoucher) {
    this.run(this.docs.updateVoucher(v.id, { withholdingRate: Number(this.draftRate) || 0, paymentChannel: this.draftChannel || null }));
  }
  issue(v: ExpenseVoucher) {
    this.ui.openConfirm({ title: this.i18n.t('expenseVouchers.issue'), message: this.i18n.t('expenseVouchers.issueConfirm'), onConfirm: () => this.run(this.docs.issueVoucher(v.id, {})) });
  }
  signed(v: ExpenseVoucher) {
    this.run(this.docs.signedCopy(v.id, !v.signedCopyReceived));
  }
  cancel(v: ExpenseVoucher) {
    const reason = typeof window !== 'undefined' ? window.prompt(this.i18n.t('documents.cancelReason')) : null;
    if (reason && reason.trim()) this.run(this.docs.cancelVoucher(v.id, reason.trim()));
  }
  remove(v: ExpenseVoucher) {
    this.docs.deleteVoucher(v.id).subscribe({
      next: () => {
        this.selected.set(null);
        this.load();
      },
      error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error'),
    });
  }

  private run(obs: import('rxjs').Observable<ExpenseVoucher>) {
    this.busy.set(true);
    obs.subscribe({
      next: (v) => {
        this.busy.set(false);
        this.selected.set(v);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
