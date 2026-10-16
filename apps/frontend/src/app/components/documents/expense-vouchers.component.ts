import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { ExpenseVoucher, statusBadge } from '../../models/documents.models';
import { Supplier } from '../../models/inventory.models';
import { PAYMENT_CHANNELS, UNECE_UNIT_CODES } from '@stok/tr-compliance';
import { IconComponent } from '../shared/icon.component';

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
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, MoneyPipe, IconComponent],
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
    .doc-no.is-draft { font-family: var(--font-sans); font-weight: 400; color: var(--fg-3); }
    .tbl td.empty-cell { white-space: normal; max-width: none; padding: 0; height: auto; }
    .tbl tr.sk td { height: var(--row-h); }
    .tbl tr.sk .skeleton-row { height: 12px; }
    .drawer-h .t h2.dh-no { font-family: var(--font-mono); font-size: var(--text-lg); font-weight: 600; letter-spacing: -0.01em; }
    .drawer-h .tools { gap: 8px; }
    .drawer-body .doc-grid { margin-bottom: 0; }
    .drawer-body > .doc-section, .drawer-body > div > .doc-section { margin-top: 0; }
    .drawer-body .notice { align-items: flex-start; }
    .drawer-body .notice > app-icon { margin-top: 1px; }
    .draft-edit { display: flex; flex-direction: column; gap: 12px; }
    .draft-edit .btn { align-self: flex-start; }
    .drawer-body.fbody { gap: 0; padding-top: 0; }
    .fbody > .fsec:first-child { padding-top: 16px; }
    .line-tbl td { padding-top: 6px; padding-bottom: 6px; }
    .line-tbl td.qty-cell { width: 112px; }
    .line-tbl td.qty-cell .field { width: 100px; margin-left: auto; }
    .line-tbl td.unit-cell .field { width: 132px; }
    .line-tbl td.x-cell, .line-tbl th.x-cell { width: 40px; padding: 0 4px; text-align: right; }
    .add-line { justify-self: start; }
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
      .line-tbl td.qty-cell { width: 84px; }
      .line-tbl td.qty-cell .field { width: 76px; }
      .line-tbl td, .line-tbl th { padding-left: 6px; padding-right: 6px; }
    }
  `],
  template: `
    <header class="page-header">
      <div><h1>{{ 'expenseVouchers.title' | t }}</h1><p>{{ 'expenseVouchers.subtitle' | t }}</p></div>
      <div class="page-actions">@if (!ui.isReadonly()) { <button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" />{{ 'expenseVouchers.new' | t }}</button> }</div>
    </header>

    @if (rows().length) {
      <div class="toolbar list-bar">
        <div class="field l-search">
          <span class="lead"><app-icon name="search" size="sm" /></span>
          <input type="search" data-page-search [placeholder]="'expenseVouchers.searchPlaceholder' | t" [attr.aria-label]="'expenseVouchers.searchPlaceholder' | t" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          <span class="trail"><kbd>/</kbd></span>
        </div>
        <div class="summary-strip"><span><b>{{ visible().length | num }}</b>{{ 'documents.countLabel' | t }}</span></div>
      </div>
    }

    @if (visible().length) {
      <div class="mlist m-list" role="list">
        @for (v of visible(); track v.id) {
          <div class="mrow doc" role="listitem" tabindex="0" [class.is-selected]="selected()?.id === v.id" (click)="select(v)" (keydown.enter)="select(v)">
            <b [class.is-draft]="!v.documentNo">{{ v.documentNo || ('invoices.draftNo' | t) }}</b>
            <span class="v">{{ v.grossTotal | money: v.currency }}</span>
            <span class="s">@if (v.dueDate) { {{ v.dueDate | appDate }} · }{{ 'expenseVouchers.kind.' + v.kind | t }} · {{ v.sellerSnapshot?.name }}</span>
            <span class="s r">
              @if (v.status === 'DRAFT' && v.dueDate && v.dueDate < today) { <span class="badge badge-danger"><span class="dot"></span>{{ 'expenseVouchers.overdue' | t }}</span> }
              @else if (v.status === 'ISSUED' && !v.signedCopyReceived) { <span class="badge badge-warning"><span class="dot"></span>{{ 'expenseVouchers.unsigned' | t }}</span> }
              @else { <span class="badge" [ngClass]="badge(v.status)"><span class="dot"></span>{{ 'expenseVouchers.status.' + v.status | t }}</span> }
            </span>
          </div>
        }
      </div>
    }

    <div class="table-card" [class.has-m]="visible().length > 0">
      <div class="table-scroll">
        <table class="tbl table-responsive">
          <thead><tr>
            <th>{{ 'expenseVouchers.col.number' | t }}</th><th>{{ 'expenseVouchers.col.kind' | t }}</th><th>{{ 'expenseVouchers.col.seller' | t }}</th>
            <th>{{ 'expenseVouchers.dueDate' | t }}</th><th class="r">{{ 'expenseVouchers.gross' | t }}</th><th>{{ 'returns.col.status' | t }}</th><th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
          </tr></thead>
          <tbody>
            @if (loading() && rows().length === 0) {
              @for (i of [1, 2, 3, 4]; track i) { <tr class="sk"><td colspan="7"><div class="skeleton-row"></div></td></tr> }
            }
            @for (v of visible(); track v.id) {
              <tr class="clickable-row" [class.is-selected]="selected()?.id === v.id" (click)="select(v)">
                <td class="td-primary"><span class="doc-no" [class.is-draft]="!v.documentNo">{{ v.documentNo || ('invoices.draftNo' | t) }}</span></td>
                <td [attr.data-label]="'expenseVouchers.col.kind' | t">{{ 'expenseVouchers.kind.' + v.kind | t }}</td>
                <td [attr.data-label]="'expenseVouchers.col.seller' | t">{{ v.sellerSnapshot?.name }}</td>
                <td [attr.data-label]="'expenseVouchers.dueDate' | t">
                  {{ v.dueDate ? (v.dueDate | appDate) : '-' }}
                  @if (v.status === 'DRAFT' && v.dueDate && v.dueDate < today) { <span class="badge badge-danger"><span class="dot"></span>{{ 'expenseVouchers.overdue' | t }}</span> }
                </td>
                <td class="r" [attr.data-label]="'expenseVouchers.gross' | t">{{ v.grossTotal | money: v.currency }}</td>
                <td [attr.data-label]="'returns.col.status' | t"><span class="badge" [ngClass]="badge(v.status)"><span class="dot"></span>{{ 'expenseVouchers.status.' + v.status | t }}</span>@if (v.status === 'ISSUED' && !v.signedCopyReceived) { <span class="badge badge-warning"><span class="dot"></span>{{ 'expenseVouchers.unsigned' | t }}</span> }</td>
                <td class="w-act" (click)="$event.stopPropagation()"><button type="button" class="btn btn-ghost btn-xs btn-icon row-act" (click)="print(v)" [attr.aria-label]="'documents.print' | t" [title]="'documents.print' | t"><app-icon name="printer" size="sm" /></button></td>
              </tr>
            }
            @if (!loading() && visible().length === 0 && rows().length > 0) {
              <tr><td colspan="7" class="empty-cell"><div class="no-match">{{ 'documents.noMatch' | t }}</div></td></tr>
            }
            @if (!loading() && rows().length === 0) {
              <tr><td colspan="7" class="empty-cell">
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="expense" /></div>
                  <h3>{{ 'expenseVouchers.empty' | t }}</h3>
                  <p>{{ 'expenseVouchers.emptyHint' | t }}</p>
                  @if (!ui.isReadonly()) { <div class="actions cluster"><button type="button" class="btn btn-primary btn-sm" (click)="openForm()"><app-icon name="plus" size="sm" />{{ 'expenseVouchers.new' | t }}</button></div> }
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as v) {
      <div class="drawer-overlay" (click)="selected.set(null)" (document:keydown.escape)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'expenseVouchers.kind.' + v.kind | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="expense" size="sm" />{{ 'expenseVouchers.kind.' + v.kind | t }}</div>
              <h2 [class.dh-no]="!!v.documentNo">{{ v.documentNo || ('invoices.draftNo' | t) }}</h2>
            </div>
            <div class="tools">
              <span class="badge" [ngClass]="badge(v.status)"><span class="dot"></span>{{ 'expenseVouchers.status.' + v.status | t }}</span>
              <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            </div>
          </div>
          <div class="drawer-body">
            @if (v.status === 'DRAFT') { <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'expenseVouchers.draftInfo' | t: { date: (v.dueDate | appDate) } }}</span></div> }
            @if (v.status === 'CANCELLED') { <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ 'invoices.cancelledInfo' | t: { reason: v.cancelReason } }}</span></div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'expenseVouchers.col.seller' | t }}</label><span>{{ v.sellerSnapshot?.name }} <span class="mono cell-sec">{{ v.sellerSnapshot?.taxId }}</span></span></div>
              <div class="doc-field"><label>{{ 'expenseVouchers.payment' | t }}</label><span>{{ v.paymentChannel ? ('expenseVouchers.channel.' + v.paymentChannel | t) : '-' }} <span class="mono cell-sec">{{ v.paymentRef }}</span></span></div>
              <div class="doc-field"><label>{{ 'expenseVouchers.deliveryDate' | t }}</label><span>{{ v.deliveryDate | appDate }}</span></div>
              <div class="doc-field"><label>{{ 'expenseVouchers.dueDate' | t }}</label><span>{{ v.dueDate | appDate }}</span></div>
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ v.issueDate ? (v.issueDate | appDate) : '-' }}</span></div>
            </div>
            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'invoices.lines' | t }}</h4>
              <table class="doc-table">
                <thead><tr><th>{{ 'expenseVouchers.description' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num hide-xs">{{ 'invoices.unitPrice' | t }}</th><th class="num">{{ 'expenseVouchers.amount' | t }}</th></tr></thead>
                <tbody>@for (l of v.lines; track $index) { <tr><td>{{ l.description }}</td><td class="num">{{ l.quantity | num }} {{ l.unitCode | unitLabel }}</td><td class="num hide-xs">{{ l.unitPrice | money: v.currency }}</td><td class="num">{{ l.amount | money: v.currency }}</td></tr> }</tbody>
              </table>
              <div class="doc-totals">
                <div class="row"><span>{{ 'expenseVouchers.gross' | t }}</span><span>{{ v.grossTotal | money: v.currency }}</span></div>
                <div class="row"><span>{{ 'expenseVouchers.withholding' | t: { rate: (v.withholdingRate | num) } }}</span><span>{{ v.withholdingAmount | money: v.currency }}</span></div>
                @if (v.otherDeductions) { <div class="row"><span>{{ 'expenseVouchers.otherDeductions' | t }}</span><span>{{ v.otherDeductions | money: v.currency }}</span></div> }
                <div class="row grand"><span>{{ 'expenseVouchers.net' | t }}</span><span>{{ v.netPayable | money: v.currency }}</span></div>
              </div>
            </div>
            @if (v.status === 'DRAFT' && !ui.isReadonly()) {
              <div class="doc-section draft-edit">
                <div class="grid-2">
                  <div class="fld"><label class="fld-label" for="evRate">{{ 'expenseVouchers.withholdingRate' | t }}</label><div class="field"><span class="affix pre">%</span><input id="evRate" type="number" min="0" max="100" step="0.01" class="num" [(ngModel)]="draftRate" /></div></div>
                  <div class="fld"><label class="fld-label" for="evCh">{{ 'expenseVouchers.payment' | t }}</label>
                    <div class="field select"><select id="evCh" [(ngModel)]="draftChannel"><option value="">-</option>@for (c of channels; track c) { <option [value]="c">{{ 'expenseVouchers.channel.' + c | t }}</option> }</select></div></div>
                </div>
                <button type="button" class="btn btn-sm" [class.is-loading]="busy()" (click)="saveDraft(v)" [disabled]="busy()"><span>{{ 'common.save' | t }}</span></button>
              </div>
            }
          </div>
          <div class="drawer-footer">
            @if (!ui.isReadonly()) {
              @if (v.status === 'DRAFT') {
                <button type="button" class="btn btn-danger-ghost" (click)="remove(v)" [disabled]="busy()" [attr.aria-label]="'invoices.deleteDraft' | t"><app-icon name="trash" /><span class="lbl-m">{{ 'invoices.deleteDraft' | t }}</span></button>
              }
              @if (v.status === 'ISSUED') {
                <button type="button" class="btn btn-danger-ghost" (click)="cancel(v)" [disabled]="busy()">{{ 'invoices.cancel' | t }}</button>
              }
            }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="print(v)" [attr.aria-label]="'documents.print' | t"><app-icon name="printer" /><span class="lbl-m">{{ 'documents.print' | t }}</span></button>
            @if (!ui.isReadonly()) {
              @if (v.status === 'DRAFT') {
                <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="issue(v)" [disabled]="busy()"><span>{{ 'expenseVouchers.issue' | t }}</span><kbd>Ctrl ↵</kbd></button>
              }
              @if (v.status === 'ISSUED') {
                <button type="button" class="btn" (click)="signed(v)" [disabled]="busy()">@if (!v.signedCopyReceived) { <app-icon name="check" /> }{{ (v.signedCopyReceived ? 'expenseVouchers.unsign' : 'expenseVouchers.signedReceived') | t }}</button>
              }
            }
          </div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <div class="drawer-overlay" (click)="formOpen.set(false)" (document:keydown.escape)="formOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'expenseVouchers.new' | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="expense" size="sm" />{{ 'expenseVouchers.title' | t }}</div>
              <h2>{{ 'expenseVouchers.new' | t }}</h2>
            </div>
            <div class="tools"><button type="button" class="drawer-close" (click)="formOpen.set(false)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button></div>
          </div>
          <div class="drawer-body fbody">
            <section class="fsec">
              <div class="fsec-h"><span class="n">1</span><h3>{{ 'documents.section.seller' | t }}</h3></div>
              <div class="grid-2">
                <div class="fld"><label class="fld-label" for="nvKind">{{ 'expenseVouchers.col.kind' | t }}</label>
                  <div class="field select"><select id="nvKind" [(ngModel)]="kind"><option value="GIDER_PUSULASI">{{ 'expenseVouchers.kind.GIDER_PUSULASI' | t }}</option>@if (producerEnabled()) { <option value="MUSTAHSIL_MAKBUZU">{{ 'expenseVouchers.kind.MUSTAHSIL_MAKBUZU' | t }}</option> }</select></div></div>
                <div class="fld"><label class="fld-label" for="nvSup">{{ 'expenseVouchers.col.seller' | t }}</label>
                  <div class="field select"><select id="nvSup" [(ngModel)]="supplierId"><option value="">{{ 'expenseVouchers.adHocSeller' | t }}</option>@for (s of nonTaxpayers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div></div>
                @if (!supplierId) {
                  <div class="fld"><label class="fld-label" for="nvName">{{ 'expenseVouchers.sellerName' | t }}</label><div class="field"><input id="nvName" [(ngModel)]="sellerName" /></div></div>
                  <div class="fld"><label class="fld-label" for="nvTckn">{{ 'expenseVouchers.sellerTckn' | t }}</label><div class="field"><input id="nvTckn" class="mono" maxlength="11" inputmode="numeric" [(ngModel)]="sellerTckn" /></div></div>
                }
                <div class="fld"><label class="fld-label" for="nvDel">{{ 'expenseVouchers.deliveryDate' | t }}</label><div class="field"><input id="nvDel" type="date" [(ngModel)]="deliveryDate" /></div></div>
                <div class="fld"><label class="fld-label" for="nvRate">{{ 'expenseVouchers.withholdingRate' | t }}</label><div class="field"><span class="affix pre">%</span><input id="nvRate" type="number" min="0" max="100" step="0.01" class="num" [(ngModel)]="rate" /></div></div>
              </div>
            </section>
            <section class="fsec">
              <div class="fsec-h"><span class="n">2</span><h3>{{ 'invoices.lines' | t }}</h3></div>
              <table class="doc-table line-tbl">
                <thead><tr><th>{{ 'expenseVouchers.description' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="hide-xs">{{ 'expenseVouchers.unit' | t }}</th><th class="num">{{ 'invoices.unitPrice' | t }}</th><th class="x-cell"><span class="sr-only">{{ 'common.delete' | t }}</span></th></tr></thead>
                <tbody>
                  @for (l of lines(); track $index) {
                    <tr>
                      <td><div class="field field-sm"><input [(ngModel)]="l.description" [attr.aria-label]="'expenseVouchers.description' | t" /></div></td>
                      <td class="num qty-cell"><div class="field field-sm"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.quantity" [attr.aria-label]="'despatches.quantity' | t" /></div></td>
                      <td class="hide-xs unit-cell"><div class="field field-sm select"><select [(ngModel)]="l.unitCode" [attr.aria-label]="'expenseVouchers.unit' | t">@for (g of uneceGroups; track g.group) {<optgroup [label]="('units.uneceGroup.' + g.group) | t">@for (u of g.codes; track u.code) {<option [value]="u.code">{{ u.code | unitLabel }}</option>}</optgroup>}</select></div></td>
                      <td class="num qty-cell"><div class="field field-sm"><input type="number" min="0" step="0.01" class="num" [(ngModel)]="l.unitPrice" [attr.aria-label]="'invoices.unitPrice' | t" /></div></td>
                      <td class="x-cell"><button type="button" class="btn btn-ghost btn-xs btn-icon" (click)="removeLine($index)" [attr.aria-label]="'common.delete' | t"><app-icon name="x" size="sm" /></button></td>
                    </tr>
                  }
                </tbody>
              </table>
              <button type="button" class="btn btn-subtle btn-sm add-line" (click)="addLine()"><app-icon name="plus" size="sm" />{{ 'despatches.addLine' | t }}</button>
              <div class="fld-help">{{ 'expenseVouchers.formHint' | t }}</div>
            </section>
            @if (error()) { <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="create()" [disabled]="busy()"><span>{{ 'returns.saveDraft' | t }}</span><kbd>Ctrl ↵</kbd></button>
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
  q = signal('');
  visible = computed(() => {
    const q = this.q().trim().toLocaleLowerCase();
    return q ? this.rows().filter((v) => [v.documentNo, v.sellerSnapshot?.name, v.sellerSnapshot?.taxId].some((x) => (x || '').toLocaleLowerCase().includes(q))) : this.rows();
  });
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
  readonly uneceGroups = Array.from(new Set(UNECE_UNIT_CODES.map((u) => u.group))).map((group) => ({ group, codes: UNECE_UNIT_CODES.filter((u) => u.group === group) }));
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
