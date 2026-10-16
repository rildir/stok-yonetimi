import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError, nowLocalInput } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { GoodsReceipt, Invoice, ReturnDoc, statusBadge } from '../../models/documents.models';
import { REFUND_CHANNELS, RETURN_CONDITIONS, returnableQuantity } from '@stok/tr-compliance';
import { SpecialCategoryWarningComponent } from '../shared/special-category-warning.component';
import { IconComponent } from '../shared/icon.component';

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
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, SpecialCategoryWarningComponent, IconComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`
    :host { display: block; }
    .notice > app-icon { color: var(--tone); }
    .list-bar { margin-bottom: 12px; }
    .list-bar .summary-strip { margin-left: auto; }
    .list-bar .l-search { flex: 0 1 280px; min-width: 180px; }
    .m-list { display: none; }
    .mrow.doc { grid-template-columns: minmax(0, 1fr) auto; cursor: pointer; }
    .mrow.doc:hover { background: var(--row-hover); }
    .mrow.doc:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .mrow.doc b { font-family: var(--font-mono); }
    .mrow.doc b.is-draft { font-family: var(--font-sans); font-weight: 400; color: var(--fg-3); }
    .mrow.doc .s.r { overflow: visible; }
    .no-match { padding: 24px 16px; text-align: center; color: var(--fg-3); font-size: var(--text-sm); }
    .doc-no { font-family: var(--font-mono); font-weight: 500; }
    .tbl td.empty-cell { white-space: normal; max-width: none; padding: 0; height: auto; }
    .tbl tr.sk td { height: var(--row-h); }
    .tbl tr.sk .skeleton-row { height: 12px; }
    .drawer-h .t h2.dh-no { font-family: var(--font-mono); font-size: var(--text-lg); font-weight: 600; letter-spacing: -0.01em; }
    .drawer-h .tools { gap: 8px; }
    .drawer-body .doc-grid { margin-bottom: 0; }
    .drawer-body > .doc-section, .drawer-body > div > .doc-section { margin-top: 0; }
    .drawer-body .notice { align-items: flex-start; }
    .drawer-body .notice > app-icon { margin-top: 1px; }
    .drawer-body.fbody { gap: 0; padding-top: 0; }
    .fbody > .fsec:first-child { padding-top: 16px; }
    .fbody > .notice { margin-bottom: 16px; }
    .line-tbl td { padding-top: 6px; padding-bottom: 6px; }
    .line-tbl td.qty-cell { width: 124px; }
    .line-tbl td.qty-cell .field { width: 112px; margin-left: auto; }
    .line-tbl .field.select { min-width: 140px; }
    @media (max-width: 640px) {
      .list-bar .summary-strip { display: none; }
      .list-bar .l-search { flex: 1 1 100%; }
      .list-bar .l-search .trail { display: none; }
      .table-card.has-m { display: none; }
      .m-list { display: block; }
      .table-responsive td.w-act { display: none; }
      .table-responsive td.empty-cell { display: block; }
      .tbl.table-responsive td { max-width: none; }
      .drawer-footer .lbl-m { display: none; }
    }
  `],
  template: `
    <header class="page-header">
      <div><h1>{{ 'returns.title' | t }}</h1><p>{{ 'returns.subtitle' | t }}</p></div>
      <div class="page-actions">
        @if (!ui.isReadonly()) { <button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" />{{ 'returns.new' | t }}</button> }
      </div>
    </header>

    @if (rows().length) {
      <div class="toolbar list-bar">
        <div class="field l-search">
          <span class="lead"><app-icon name="search" size="sm" /></span>
          <input type="search" data-page-search [placeholder]="'returns.searchPlaceholder' | t" [attr.aria-label]="'returns.searchPlaceholder' | t" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          <span class="trail"><kbd>/</kbd></span>
        </div>
        <div class="summary-strip"><span><b>{{ visible().length | num }}</b>{{ 'documents.countLabel' | t }}</span></div>
      </div>
    }

    @if (visible().length) {
      <div class="mlist m-list" role="list">
        @for (r of visible(); track r.id) {
          <div class="mrow doc" role="listitem" tabindex="0" [class.is-selected]="selected()?.id === r.id" (click)="selected.set(r)" (keydown.enter)="selected.set(r)">
            <b>{{ r.returnNo }}</b>
            <span class="v">{{ r.grandTotal | money: r.currency }}</span>
            <span class="s">{{ r.createdAt | appDate }} · {{ 'returns.type.' + r.type | t }} · {{ r.partySnapshot?.name }}</span>
            <span class="s r"><span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'returns.status.' + r.status | t }}</span></span>
          </div>
        }
      </div>
    }

    <div class="table-card" [class.has-m]="visible().length > 0">
      <div class="table-scroll">
        <table class="tbl table-responsive">
          <thead><tr>
            <th>{{ 'returns.col.number' | t }}</th><th>{{ 'returns.col.type' | t }}</th><th>{{ 'returns.col.party' | t }}</th><th>{{ 'returns.col.original' | t }}</th>
            <th class="r">{{ 'invoices.grandTotal' | t }}</th><th>{{ 'returns.col.status' | t }}</th><th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
          </tr></thead>
          <tbody>
            @if (loading() && rows().length === 0) {
              @for (i of [1, 2, 3, 4]; track i) { <tr class="sk"><td colspan="7"><div class="skeleton-row"></div></td></tr> }
            }
            @for (r of visible(); track r.id) {
              <tr class="clickable-row" [class.is-selected]="selected()?.id === r.id" (click)="selected.set(r)">
                <td class="td-primary"><span class="doc-no">{{ r.returnNo }}</span><span class="cell-code">{{ r.createdAt | appDate }}</span></td>
                <td [attr.data-label]="'returns.col.type' | t">{{ 'returns.type.' + r.type | t }}</td>
                <td [attr.data-label]="'returns.col.party' | t">{{ r.partySnapshot?.name }}</td>
                <td [attr.data-label]="'returns.col.original' | t"><span class="mono" [class.cell-sec]="!r.invoiceNo">{{ r.invoiceNo || '-' }}</span></td>
                <td class="r" [attr.data-label]="'invoices.grandTotal' | t">{{ r.grandTotal | money: r.currency }}</td>
                <td [attr.data-label]="'returns.col.status' | t"><span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'returns.status.' + r.status | t }}</span></td>
                <td class="w-act" (click)="$event.stopPropagation()"><button type="button" class="btn btn-ghost btn-xs btn-icon row-act" (click)="print(r)" [attr.aria-label]="'documents.print' | t" [title]="'documents.print' | t"><app-icon name="printer" size="sm" /></button></td>
              </tr>
            }
            @if (!loading() && visible().length === 0 && rows().length > 0) {
              <tr><td colspan="7" class="empty-cell"><div class="no-match">{{ 'documents.noMatch' | t }}</div></td></tr>
            }
            @if (!loading() && rows().length === 0) {
              <tr><td colspan="7" class="empty-cell">
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="return" /></div>
                  <h3>{{ 'returns.empty' | t }}</h3>
                  <p>{{ 'returns.emptyHint' | t }}</p>
                  @if (!ui.isReadonly()) { <div class="actions cluster"><button type="button" class="btn btn-primary btn-sm" (click)="openForm()"><app-icon name="plus" size="sm" />{{ 'returns.new' | t }}</button></div> }
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      <div class="drawer-overlay" (click)="selected.set(null)" (document:keydown.escape)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'returns.detail' | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="return" size="sm" />{{ 'returns.detail' | t }}<span class="sep">/</span>{{ 'returns.type.' + r.type | t }}</div>
              <h2 class="dh-no">{{ r.returnNo }}</h2>
            </div>
            <div class="tools">
              <span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'returns.status.' + r.status | t }}</span>
              <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            </div>
          </div>
          <div class="drawer-body">
            @if (r.status === 'DRAFT') { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'returns.draftInfo' | t }}</span></div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'returns.col.party' | t }}</label><span>{{ r.partySnapshot?.name }}</span></div>
              <div class="doc-field"><label>{{ 'returns.col.original' | t }}</label><span><span class="mono">{{ r.invoiceNo || '-' }}</span>@if (r.invoiceDate) { <span class="cell-sec"> · {{ r.invoiceDate | appDate }}</span> }</span></div>
              @if (r.counterpartyDocNo) { <div class="doc-field"><label>{{ 'returns.counterpartyDoc' | t }}</label><span><span class="mono">{{ r.counterpartyDocNo }}</span><span class="cell-sec"> · {{ r.counterpartyDocDate | appDate }}</span></span></div> }
              @if (r.refundChannel) { <div class="doc-field"><label>{{ 'returns.refundChannel' | t }}</label><span>{{ 'returns.channel.' + r.refundChannel | t }} <span class="mono cell-sec">{{ r.refundRef }}</span></span></div> }
              @if (r.type === 'WITHDRAWAL') {
                <div class="doc-field"><label>{{ 'returns.withdrawalDeadline' | t }}</label><span>{{ r.withdrawalDeadline | appDate }}</span></div>
                <div class="doc-field"><label>{{ 'returns.goodsReturnDeadline' | t }}</label><span>{{ r.goodsReturnDeadline | appDate }}</span></div>
                <div class="doc-field"><label>{{ 'returns.refundDueDate' | t }}</label><span>@if (r.refundDueDate) { {{ r.refundDueDate | appDate }} } @else { <span class="cell-sec">{{ 'returns.refundPending' | t }}</span> }</span></div>
                @if (r.goodsHandedOverDate) { <div class="doc-field"><label>{{ 'returns.goodsHandedOverDate' | t }}</label><span>{{ r.goodsHandedOverDate | appDate }}</span></div> }
              }
              @if (r.returnInvoiceId) { <div class="doc-field"><label>{{ 'returns.returnInvoice' | t }}</label><span><a class="link" routerLink="/invoices" [queryParams]="{ id: r.returnInvoiceId }">{{ 'returns.openInvoice' | t }}</a></span></div> }
              @if (r.expenseVoucherId) { <div class="doc-field"><label>{{ 'returns.expenseVoucher' | t }}</label><span><a class="link" routerLink="/expense-vouchers" [queryParams]="{ id: r.expenseVoucherId }">{{ 'returns.openVoucher' | t }}</a></span></div> }
            </div>
            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'invoices.lines' | t }}</h4>
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num">{{ 'invoices.vat' | t }}</th><th class="num">{{ 'invoices.net' | t }}</th><th class="hide-xs">{{ 'returns.condition' | t }}</th></tr></thead>
                <tbody>
                  @for (i of r.items; track i.id) {
                    <tr><td>{{ i.productName }}</td><td class="num">{{ i.quantity | num }} {{ i.unitCode | unitLabel }}</td><td class="num">%{{ i.taxRate | num }}</td><td class="num">{{ i.netAmount | money: r.currency }}</td><td class="hide-xs">{{ 'returns.conditions.' + i.condition | t }}</td></tr>
                  }
                </tbody>
              </table>
              <div class="doc-totals">
                <div class="row"><span>{{ 'invoices.subtotal' | t }}</span><span>{{ r.subtotal | money: r.currency }}</span></div>
                <div class="row"><span>{{ 'invoices.vat' | t }}</span><span>{{ r.taxTotal | money: r.currency }}</span></div>
                <div class="row grand"><span>{{ 'invoices.grandTotal' | t }}</span><span>{{ r.grandTotal | money: r.currency }}</span></div>
              </div>
            </div>
            @if (r.status === 'DRAFT' && r.type === 'WITHDRAWAL' && !ui.isReadonly()) {
              <div class="doc-section">
                <div class="fld"><label class="fld-label" for="rtHand">{{ 'returns.goodsHandedOverDate' | t }}</label><div class="field"><input id="rtHand" type="date" [(ngModel)]="handedOver" /></div>
                  <div class="fld-help">{{ 'returns.goodsHandedOverHint' | t }}</div></div>
              </div>
            }
          </div>
          <div class="drawer-footer">
            @if (r.status === 'DRAFT' && !ui.isReadonly()) {
              <button type="button" class="btn btn-danger-ghost" (click)="remove(r)" [disabled]="busy()" [attr.aria-label]="'returns.deleteDraft' | t"><app-icon name="trash" /><span class="lbl-m">{{ 'returns.deleteDraft' | t }}</span></button>
            }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="print(r)" [attr.aria-label]="'documents.print' | t"><app-icon name="printer" /><span class="lbl-m">{{ 'documents.print' | t }}</span></button>
            @if (r.status === 'DRAFT' && !ui.isReadonly()) {
              <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="complete(r)" [disabled]="busy()"><span>{{ 'returns.complete' | t }}</span><kbd>Ctrl ↵</kbd></button>
            }
          </div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <div class="drawer-overlay" (click)="formOpen.set(false)" (document:keydown.escape)="formOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'returns.new' | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="return" size="sm" />{{ 'returns.title' | t }}</div>
              <h2>{{ 'returns.new' | t }}</h2>
            </div>
            <div class="tools"><button type="button" class="drawer-close" (click)="formOpen.set(false)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button></div>
          </div>
          <div class="drawer-body fbody">
            <section class="fsec">
              <div class="fsec-h"><span class="n">1</span><h3>{{ 'documents.section.source' | t }}</h3></div>
              <div class="grid-2">
                <div class="fld"><label class="fld-label" for="rtType">{{ 'returns.col.type' | t }}</label>
                  <div class="field select"><select id="rtType" [(ngModel)]="type" (ngModelChange)="onTypeChange()">
                    @for (t of types; track t) { <option [value]="t">{{ 'returns.type.' + t | t }}</option> }
                  </select></div>
                </div>
                @if (type !== 'PURCHASE_RETURN') {
                  <div class="fld"><label class="fld-label" for="rtInv">{{ 'returns.invoice' | t }} <span class="req">*</span></label>
                    <div class="field select"><select id="rtInv" [(ngModel)]="sourceId" (ngModelChange)="buildLines()">
                      <option value="">{{ 'returns.selectInvoice' | t }}</option>
                      @for (i of invoices(); track i.id) { <option [value]="i.id">{{ i.documentNo }} · {{ i.buyerSnapshot?.name }}</option> }
                    </select></div>
                  </div>
                } @else {
                  <div class="fld"><label class="fld-label" for="rtGr">{{ 'returns.receipt' | t }} <span class="req">*</span></label>
                    <div class="field select"><select id="rtGr" [(ngModel)]="sourceId" (ngModelChange)="buildLines()">
                      <option value="">{{ 'returns.selectReceipt' | t }}</option>
                      @for (g of receipts(); track g.id) { <option [value]="g.id">{{ g.receiptNo }} · {{ g.supplierSnapshot?.name }}</option> }
                    </select></div>
                  </div>
                }
              </div>
              @if (type === 'WITHDRAWAL') { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'returns.withdrawalInfo' | t }}</span></div> }
            </section>

            @if (formLines().length) {
              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'invoices.lines' | t }}</h3></div>
                <table class="doc-table line-tbl">
                  <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'returns.returnable' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th>@if (type !== 'PURCHASE_RETURN') {<th>{{ 'returns.condition' | t }}</th>}</tr></thead>
                  <tbody>
                    @for (l of formLines(); track l.sourceId) {
                      <tr>
                        <td>{{ l.name }}</td>
                        <td class="num">{{ l.available | num }}</td>
                        <td class="num qty-cell"><div class="field field-sm"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.quantity" [attr.max]="l.available" [attr.aria-label]="'despatches.quantity' | t" /></div></td>
                        @if (type !== 'PURCHASE_RETURN') {
                          <td><div class="field field-sm select"><select [(ngModel)]="l.condition" [attr.aria-label]="'returns.condition' | t">@for (c of conditions; track c) { <option [value]="c">{{ 'returns.conditions.' + c | t }}</option> }</select></div></td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }

            <section class="fsec">
              <div class="fsec-h"><span class="n">{{ formLines().length ? 3 : 2 }}</span><h3>{{ 'documents.section.refund' | t }}</h3></div>
              <div class="grid-2">
                @if (type !== 'PURCHASE_RETURN') {
                  <div class="fld"><label class="fld-label" for="rtCh">{{ 'returns.refundChannel' | t }}</label>
                    <div class="field select"><select id="rtCh" [(ngModel)]="refundChannel"><option value="">-</option>@for (c of channels; track c) { <option [value]="c">{{ 'returns.channel.' + c | t }}</option> }</select></div>
                  </div>
                  <div class="fld"><label class="fld-label" for="rtRef">{{ 'returns.refundRef' | t }}</label><div class="field"><input id="rtRef" [(ngModel)]="refundRef" /></div></div>
                }
                <div class="fld"><label class="fld-label" for="rtCp">{{ 'returns.counterpartyDoc' | t }}</label><div class="field"><input id="rtCp" class="mono" [(ngModel)]="counterpartyDocNo" /></div></div>
                <div class="fld"><label class="fld-label" for="rtCpDate">{{ 'returns.counterpartyDocDate' | t }}</label><div class="field"><input id="rtCpDate" type="date" [(ngModel)]="counterpartyDocDate" /></div></div>
                @if (type === 'WITHDRAWAL') { <div class="fld"><label class="fld-label" for="rtNot">{{ 'returns.notifiedAt' | t }}</label><div class="field"><input id="rtNot" type="datetime-local" [(ngModel)]="notifiedAt" /></div></div> }
              </div>
              <div class="fld-help">{{ 'returns.formHint' | t }}</div>
            </section>

            <section class="fsec">
              <div class="fld"><label class="fld-label" for="rtNote">{{ 'despatches.note' | t }}</label><div class="field has-area"><textarea id="rtNote" rows="2" [(ngModel)]="note"></textarea></div><app-special-category-warning [text]="note" /></div>
            </section>
            @if (error()) { <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="save()" [disabled]="busy() || !sourceId"><span>{{ 'returns.saveDraft' | t }}</span><kbd>Ctrl ↵</kbd></button>
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
  q = signal('');
  visible = computed(() => {
    const q = this.q().trim().toLocaleLowerCase();
    return q ? this.rows().filter((r) => [r.returnNo, r.partySnapshot?.name, r.invoiceNo].some((v) => (v || '').toLocaleLowerCase().includes(q))) : this.rows();
  });
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
