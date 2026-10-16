import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { Invoice, statusBadge } from '../../models/documents.models';
import { NOTICE_CHANNELS, PAPER_REASONS } from '@stok/tr-compliance';
import { EdocPanelComponent } from '../ebelge/edoc-panel.component';

/** Faturalar: drafts from orders / despatches, issue (numbering, freeze, 7-day rule), cancel, print. */
@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, EdocPanelComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'invoices.title' | t }}</h1>
        <p>{{ 'invoices.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary" routerLink="/despatches">{{ 'invoices.fromDespatches' | t }}</a>
      </div>
    </header>

    @if (eDocumentMode() !== 'PROVIDER') { <div class="doc-alert info">{{ 'invoices.noneModeInfo' | t }}</div> }

    <div class="filter-pills" style="margin-bottom: var(--space-4)">
      @for (f of filters; track f) {
        <button type="button" class="filter-pill" [class.active]="filter() === f" (click)="filter.set(f)">{{ 'invoices.filter.' + f | t }}</button>
      }
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead>
            <tr>
              <th>{{ 'invoices.col.number' | t }}</th>
              <th>{{ 'invoices.col.type' | t }}</th>
              <th>{{ 'documents.buyer' | t }}</th>
              <th>{{ 'documents.issueDate' | t }}</th>
              <th>{{ 'invoices.deliveryDate' | t }}</th>
              <th class="num">{{ 'invoices.grandTotal' | t }}</th>
              <th>{{ 'invoices.col.status' | t }}</th>
              <th class="th-actions">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (inv of visible(); track inv.id) {
              <tr class="clickable-row" (click)="selected.set(inv)">
                <td class="mono td-primary"><strong>{{ inv.documentNo || ('invoices.draftNo' | t) }}</strong></td>
                <td [attr.data-label]="'invoices.col.type' | t">{{ inv.typeCode }} <span class="text-xs text-muted">{{ inv.profileId }}</span></td>
                <td [attr.data-label]="'documents.buyer' | t">{{ inv.buyerSnapshot?.name }}</td>
                <td [attr.data-label]="'documents.issueDate' | t">{{ inv.issueDate ? (inv.issueDate | appDate) : '-' }}</td>
                <td [attr.data-label]="'invoices.deliveryDate' | t">{{ inv.deliveryDate ? (inv.deliveryDate | appDate) : '-' }}</td>
                <td class="num" [attr.data-label]="'invoices.grandTotal' | t">{{ inv.grandTotal | money: inv.currency }}</td>
                <td [attr.data-label]="'invoices.col.status' | t">
                  <span class="badge" [ngClass]="badge(inv.status)">{{ 'invoices.status.' + inv.status | t }}</span>
                  @if (inv.lateIssueConfirmed) { <span class="badge badge-warning">{{ 'invoices.late' | t }}</span> }
                </td>
                <td class="td-actions" (click)="$event.stopPropagation()"><button class="btn btn-secondary btn-sm" (click)="print(inv)">{{ 'documents.print' | t }}</button></td>
              </tr>
            }
            @if (!loading() && visible().length === 0) {
              <tr><td colspan="8"><div class="empty-state"><p class="empty-state-title">{{ 'invoices.empty' | t }}</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as inv) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ (inv.kind === 'RETURN' ? 'invoices.returnInvoice' : 'invoices.detail') | t }}</span><span class="mono text-muted">{{ inv.documentNo || ('invoices.draftNo' | t) }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (inv.status === 'DRAFT') { <div class="doc-alert info">{{ 'invoices.draftInfo' | t }}</div> }
            @if (inv.status === 'CANCELLED') { <div class="doc-alert danger">{{ 'invoices.cancelledInfo' | t: { reason: inv.cancelReason } }}</div> }
            @for (dd of inv.disputedDespatches || []; track dd.id) { <div class="doc-alert">{{ 'invoices.disputedDespatch' | t: { no: dd.documentNo, status: ('despatches.status.' + dd.status | t) } }}</div> }
            @if (inv.status === 'QUEUED') { <div class="doc-alert info">{{ 'invoices.cancelAfterSend' | t }}</div> }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'invoices.col.status' | t }}</label><span><span class="badge" [ngClass]="badge(inv.status)">{{ 'invoices.status.' + inv.status | t }}</span></span></div>
              <div class="doc-field"><label>{{ 'invoices.col.type' | t }}</label><span>{{ inv.typeCode }} · {{ inv.profileId }}</span></div>
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ inv.issueDate ? (inv.issueDate | appDate) : '-' }} {{ inv.issueTime?.slice(0, 5) }}</span></div>
              <div class="doc-field"><label>{{ 'invoices.deliveryDate' | t }}</label><span>{{ inv.deliveryDate ? (inv.deliveryDate | appDate) : ('invoices.notDelivered' | t) }}</span></div>
              <div class="doc-field"><label>{{ 'documents.numberMode' | t }}</label><span>{{ inv.numberMode ? ('documents.mode.' + inv.numberMode | t) : '-' }}</span></div>
              <div class="doc-field"><label>ETTN</label><span class="mono text-xs">{{ inv.ettn }}</span></div>
              <div class="doc-field"><label>{{ 'documents.seller' | t }}</label><span>{{ inv.sellerSnapshot?.name }} <span class="mono text-muted">{{ inv.sellerSnapshot?.taxId }}</span></span></div>
              <div class="doc-field"><label>{{ 'documents.buyer' | t }}</label><span>{{ inv.buyerSnapshot?.name }} <span class="mono text-muted">{{ inv.buyerSnapshot?.taxId }}</span></span></div>
            </div>
            @if (inv.status !== 'DRAFT' && inv.issuedBeforeDelivery) { <div class="doc-hint">{{ 'invoices.beforeDeliveryInfo' | t }}</div> }
            <div class="doc-field">
              <label>{{ 'invoices.despatchRefs' | t }}</label>
              <span>@for (r of inv.despatchRefs || []; track $index) { <a class="link mono" routerLink="/despatches" [queryParams]="{ id: r.id }">{{ r.documentNo }}</a> ({{ r.issueDate | appDate }})&nbsp; } @empty { - }</span>
            </div>
            @if (inv.billingReferences?.length) {
              <div class="doc-field"><label>{{ 'invoices.billingRefs' | t }}</label><span>@for (r of inv.billingReferences!; track $index) { <span class="mono">{{ r.documentNo }}</span> ({{ r.issueDate | appDate }}) }</span></div>
            }
            @if (inv.replacesDespatch) { <div class="doc-alert info">{{ 'invoices.replacesDespatch' | t }}</div> }

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'invoices.lines' | t }}</h4>
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num hide-xs">{{ 'invoices.unitPrice' | t }}</th><th class="num">{{ 'invoices.vat' | t }}</th><th class="num">{{ 'invoices.net' | t }}</th></tr></thead>
                <tbody>
                  @for (l of inv.lines; track l.id) {
                    <tr>
                      <td>{{ l.productName }}@if (l.withholdingCode) { <div class="text-xs text-muted">{{ 'invoices.withholding' | t }} {{ l.withholdingCode }}</div> }@if (l.returnedQuantity) { <div class="text-xs text-muted">{{ 'invoices.returnedQty' | t: { qty: (l.returnedQuantity | num) } }}</div> }</td>
                      <td class="num">{{ l.quantity | num }} {{ l.unitCode | unitLabel }}</td>
                      <td class="num hide-xs">{{ l.unitPrice | money: inv.currency }}</td>
                      <td class="num">%{{ l.taxRate | num }}@if (l.exemptionCode) { ({{ l.exemptionCode }}) }</td>
                      <td class="num">{{ l.netAmount | money: inv.currency }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <div class="doc-totals">
                <div class="row"><span>{{ 'invoices.subtotal' | t }}</span><span>{{ inv.subtotal | money: inv.currency }}</span></div>
                @for (b of inv.taxBreakdown || []; track $index) {
                  <div class="row"><span>{{ 'invoices.vatRow' | t: { rate: b.rate } }}@if (b.exemptionCode) { ({{ b.exemptionCode }}) }</span><span>{{ b.tax | money: inv.currency }}</span></div>
                }
                <div class="row grand"><span>{{ 'invoices.grandTotal' | t }}</span><span>{{ inv.grandTotal | money: inv.currency }}</span></div>
                @if (inv.withheldTaxTotal) {
                  <div class="row"><span>{{ 'invoices.withheld' | t }}</span><span>{{ inv.withheldTaxTotal | money: inv.currency }}</span></div>
                  <div class="row grand"><span>{{ 'invoices.payable' | t }}</span><span>{{ inv.payableTotal | money: inv.currency }}</span></div>
                }
              </div>
            </div>
            @if (inv.numberMode === 'EDOCUMENT') { <app-edoc-panel sourceType="invoice" [sourceId]="inv.id" [expected]="true"></app-edoc-panel> }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="print(inv)">{{ 'documents.print' | t }}</button>
            @if (!ui.isReadonly()) {
              @if (inv.status === 'DRAFT') {
                <button class="btn btn-danger" (click)="remove(inv)" [disabled]="busy()">{{ 'invoices.deleteDraft' | t }}</button>
                <button class="btn btn-primary" (click)="openIssue(inv)" [disabled]="busy()">{{ 'invoices.issue' | t }}</button>
              } @else if (inv.status !== 'CANCELLED' && inv.status !== 'REJECTED') {
                @if (inv.kind === 'SALES') { <a class="btn btn-secondary" routerLink="/returns" [queryParams]="{ invoiceId: inv.id }">{{ 'invoices.createReturn' | t }}</a> }
                @if (inv.status !== 'QUEUED') { <button class="btn btn-danger" (click)="openCancel(inv)" [disabled]="busy()">{{ 'invoices.cancel' | t }}</button> }
              }
            }
          </div>
        </div>
      </div>
    }

    @if (issueFor(); as inv) {
      <div class="modal-backdrop z-top">
        <div class="modal-panel">
          <div class="modal-header"><h3>{{ 'invoices.issueTitle' | t }}</h3></div>
          <div style="padding: var(--space-5)">
            @if (eDocumentMode() === 'PROVIDER') {
              <p class="doc-hint">{{ 'invoices.issueProviderInfo' | t }}</p>
              <label class="doc-check"><input type="checkbox" [(ngModel)]="paperFallback" /> {{ 'invoices.paperFallback' | t }}</label>
              @if (paperFallback) {
                <div class="doc-field" style="margin-top: var(--space-2)"><label for="ivReason">{{ 'despatches.paperReason' | t }}</label>
                  <select id="ivReason" class="select" [(ngModel)]="paperReason"><option value="" disabled>{{ 'despatches.selectPaperReason' | t }}</option>@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div>
              }
            } @else {
              <div class="doc-field">
                <label>{{ 'invoices.numberSource' | t }}</label>
                <label class="doc-check"><input type="radio" name="src" value="paper" [(ngModel)]="numberSource" /> {{ 'invoices.numberPaper' | t }}</label>
                <label class="doc-check"><input type="radio" name="src" value="external" [(ngModel)]="numberSource" /> {{ 'invoices.numberExternal' | t }}</label>
              </div>
              @if (numberSource === 'external') {
                <div class="doc-grid">
                  <div class="doc-field"><label for="ivExt">{{ 'invoices.externalDocNo' | t }}</label><input id="ivExt" class="input mono" maxlength="50" [(ngModel)]="externalDocNo" placeholder="GIB2026000000123" /></div>
                  <div class="doc-field"><label for="ivExtDate">{{ 'invoices.externalDocDate' | t }}</label><input id="ivExtDate" type="date" class="input" [(ngModel)]="issueDate" /></div>
                </div>
              } @else {
                <div class="doc-grid">
                  <div class="doc-field"><label for="ivDate">{{ 'documents.issueDate' | t }}</label><input id="ivDate" type="date" class="input" [(ngModel)]="issueDate" /></div>
                  <div class="doc-field"><label for="ivTime">{{ 'invoices.issueTime' | t }}</label><input id="ivTime" type="time" class="input" [(ngModel)]="issueTime" /></div>
                </div>
                <div class="doc-field"><label for="ivPaperReason">{{ 'documents.paperReasonIfMandatory' | t }}</label>
                  <select id="ivPaperReason" class="select" [(ngModel)]="paperReason"><option value="">{{ 'documents.paperReasonNone' | t }}</option>@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div>
                <p class="doc-hint">{{ 'documents.paperSeriesHint' | t }}</p>
              }
            }
            @if (lateInfo()) {
              <div class="doc-alert danger">{{ lateInfo() }}</div>
              <label class="doc-check"><input type="checkbox" [(ngModel)]="lateConfirm" /> {{ 'invoices.lateConfirm' | t }}</label>
            }
            <p class="doc-hint" style="margin-top: var(--space-3)">{{ 'invoices.issueWarning' | t }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="issueFor.set(null)" [disabled]="busy()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="issue(inv)" [disabled]="busy() || (!!lateInfo() && !lateConfirm)">{{ 'invoices.issue' | t }}</button>
          </div>
        </div>
      </div>
    }

    @if (cancelFor(); as inv) {
      <div class="modal-backdrop z-top">
        <div class="modal-panel modal-panel-sm">
          <div class="modal-header"><h3>{{ 'invoices.cancelTitle' | t }}</h3></div>
          <div style="padding: var(--space-5)">
            <p class="doc-hint">{{ 'invoices.cancelInfo' | t }}</p>
            @if (needsNotice(inv)) {
              <div class="doc-alert info">{{ 'ebelge.cancel.noticeInfo' | t }}</div>
              <div class="doc-grid">
                <div class="doc-field"><label for="ivNch">{{ 'ebelge.cancel.channel' | t }}</label>
                  <select id="ivNch" class="select" [(ngModel)]="noticeChannel">@for (c of noticeChannels; track c) { <option [value]="c">{{ 'ebelge.noticeChannel.' + c | t }}</option> }</select></div>
                <div class="doc-field"><label for="ivNdate">{{ 'ebelge.cancel.date' | t }}</label><input id="ivNdate" type="date" class="input" [(ngModel)]="noticeDate" /></div>
              </div>
              <div class="doc-field"><label for="ivNref">{{ 'ebelge.cancel.reference' | t }}</label><input id="ivNref" class="input" maxlength="100" [(ngModel)]="noticeRef" /></div>
            } @else if (inv.profileId === 'EARSIVFATURA' && inv.numberMode === 'EDOCUMENT') {
              <div class="doc-alert info">{{ 'ebelge.cancel.earsivInfo' | t }}</div>
            }
            <div class="doc-field"><label for="ivCancel">{{ 'documents.cancelReason' | t }}</label><textarea id="ivCancel" class="textarea" rows="3" [(ngModel)]="cancelReason"></textarea></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="cancelFor.set(null)">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-danger" (click)="cancel(inv)" [disabled]="busy() || !cancelReason.trim() || (needsNotice(inv) && (!noticeChannel || !noticeDate))">{{ 'invoices.cancel' | t }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class InvoicesComponent implements OnInit {
  docs = inject(DocumentsService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  route = inject(ActivatedRoute);
  router = inject(Router);

  filters = ['all', 'DRAFT', 'ISSUED', 'CANCELLED'];
  filter = signal('all');
  rows = signal<Invoice[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<Invoice | null>(null);
  eDocumentMode = signal('NONE');
  badge = statusBadge;
  paperReasons = PAPER_REASONS as readonly string[];

  issueFor = signal<Invoice | null>(null);
  lateInfo = signal<string | null>(null);
  numberSource: 'paper' | 'external' = 'external';
  externalDocNo = '';
  issueDate = '';
  issueTime = '';
  lateConfirm = false;
  paperFallback = false;
  paperReason = '';
  cancelFor = signal<Invoice | null>(null);
  cancelReason = '';
  noticeChannels = NOTICE_CHANNELS as readonly string[];
  noticeChannel = 'KEP';
  noticeDate = '';
  noticeRef = '';

  /** e-Fatura already handed to the integrator: cancellation only with the external notice (TTK 18/3). */
  needsNotice(inv: Invoice): boolean {
    return inv.numberMode === 'EDOCUMENT' && (inv.profileId === 'TEMELFATURA' || inv.profileId === 'TICARIFATURA') && inv.status !== 'QUEUED' && inv.status !== 'ISSUED';
  }

  visible = computed(() => {
    const f = this.filter();
    return this.rows().filter((i) => f === 'all' || (f === 'ISSUED' ? !['DRAFT', 'CANCELLED'].includes(i.status) : i.status === f));
  });

  ngOnInit() {
    this.docs.company().subscribe({ next: (c) => this.eDocumentMode.set(c.eDocumentMode || 'NONE'), error: () => undefined });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.docs.invoices().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        const id = this.route.snapshot.queryParamMap.get('id');
        const cur = this.selected()?.id || id;
        if (cur) this.selected.set(rows.find((r) => r.id === cur) || null);
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error');
      },
    });
  }

  print(inv: Invoice) {
    this.docs.print(`invoices/${inv.id}/print`);
  }

  openIssue(inv: Invoice) {
    this.lateInfo.set(null);
    this.lateConfirm = false;
    this.externalDocNo = '';
    // Local calendar day (the UTC day is still "yesterday" between 00:00 and 03:00 in Istanbul).
    const now = new Date();
    this.issueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.issueTime = '';
    this.paperFallback = false;
    this.paperReason = '';
    this.issueFor.set(inv);
  }

  issue(inv: Invoice) {
    const body: Record<string, unknown> = { lateConfirm: this.lateConfirm || undefined };
    if (this.eDocumentMode() === 'PROVIDER') {
      if (this.paperFallback) {
        // 509 V.7: the user must pick the reason explicitly; nothing is assumed.
        if (!this.paperReason) {
          this.ui.showToast(this.i18n.t('despatches.selectPaperReason'), 'error');
          return;
        }
        Object.assign(body, { paperFallback: true, paperReason: this.paperReason });
      }
    } else if (this.numberSource === 'external') {
      Object.assign(body, { externalDocNo: this.externalDocNo.trim(), externalDocDate: this.issueDate || undefined, issueDate: this.issueDate || undefined });
    } else {
      Object.assign(body, { issueDate: this.issueDate || undefined, issueTime: this.issueTime || undefined });
      if (this.paperReason) Object.assign(body, { paperFallback: true, paperReason: this.paperReason });
    }
    this.busy.set(true);
    this.docs.issueInvoice(inv.id, body).subscribe({
      next: (out) => {
        this.busy.set(false);
        this.issueFor.set(null);
        this.ui.showToast(this.i18n.t('invoices.toast.issued', { number: out.documentNo }), 'success');
        this.selected.set(out);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        // VUK 231/5: more than 7 days after delivery -> show the reason and ask for explicit confirmation.
        const code = (e as any)?.error?.code;
        if (code === 'INVOICE_LATE_CONFIRM_REQUIRED' || code === 'INVOICE_BACKDATED_CONFIRM_REQUIRED') return this.lateInfo.set(apiError(e, ''));
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  remove(inv: Invoice) {
    this.ui.openConfirm({
      title: this.i18n.t('invoices.deleteDraft'),
      message: this.i18n.t('invoices.deleteConfirm'),
      isDelete: true,
      onConfirm: () =>
        this.docs.deleteInvoice(inv.id).subscribe({
          next: () => {
            this.selected.set(null);
            this.load();
          },
          error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error'),
        }),
    });
  }

  openCancel(inv: Invoice) {
    this.cancelReason = '';
    this.noticeChannel = 'KEP';
    this.noticeDate = new Date().toISOString().slice(0, 10);
    this.noticeRef = '';
    this.cancelFor.set(inv);
  }

  cancel(inv: Invoice) {
    this.busy.set(true);
    const notice = this.needsNotice(inv) ? { noticeChannel: this.noticeChannel, noticeDate: this.noticeDate, noticeRef: this.noticeRef.trim() || null } : {};
    this.docs.cancelInvoice(inv.id, this.cancelReason.trim(), notice).subscribe({
      next: (out) => {
        this.busy.set(false);
        this.cancelFor.set(null);
        this.selected.set(out);
        this.ui.showToast(this.i18n.t('invoices.toast.cancelled'), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
