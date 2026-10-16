import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppDatePipe, I18nService, MoneyPipe, NumberFormatPipe, UnitLabelPipe, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { InventoryService } from '../../inventory.service';
import { IncomingDocument, edocBadge } from '../../models/ebelge.models';
import { GoodsReceipt } from '../../models/documents.models';
import { EdocPanelComponent } from './edoc-panel.component';

interface ReceiptLineForm {
  lineId: string;
  name: string;
  quantity: number;
  unitCode: string | null;
  accepted: number;
  rejected: number;
  reason: string;
}

/**
 * Gelen Kutusu: incoming e-Fatura / e-İrsaliye, three-way matching (supplier -> purchase order ->
 * goods receipt), KABUL / RED for TICARIFATURA (8 days, TTK 21/2) and full / partial receipt advice
 * for e-İrsaliye (7 days from the actual despatch), with countdowns.
 */
@Component({
  selector: 'app-ebelge-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, MoneyPipe, NumberFormatPipe, UnitLabelPipe, EdocPanelComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    .inbox-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4); }
    .inbox-kpi { padding: var(--space-3) var(--space-4); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); display: flex; flex-direction: column; gap: 2px; }
    .inbox-kpi .v { font-size: var(--text-xl); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; color: var(--color-text); }
    .inbox-kpi .l { font-size: var(--text-xs); color: var(--color-text-muted); }
    .countdown { white-space: nowrap; }
    .match-box { display: flex; flex-direction: column; gap: var(--space-1); }
    .respond-box { border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); background: var(--color-surface-subtle); }
    .ra-reason { min-width: 140px; }
    .page-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .page-actions .select { width: auto; min-width: 180px; }
    @media (max-width: 900px) { .inbox-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'ebelge.inbox.title' | t }}</h1>
        <p>{{ 'ebelge.inbox.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        @if (!ui.isReadonly()) {
          <button class="btn btn-secondary" (click)="fetch()" [disabled]="busy()">{{ 'ebelge.inbox.fetch' | t }}</button>
          @if (isAdmin() && provider() === 'MOCK') {
            <select class="select" [(ngModel)]="simKind" [attr.aria-label]="'ebelge.inbox.simulate' | t">
              @for (k of simKinds; track k) { <option [value]="k">{{ 'ebelge.inbox.sim.' + k | t }}</option> }
            </select>
            <button class="btn btn-secondary" (click)="simulate()" [disabled]="busy()">{{ 'ebelge.inbox.simulate' | t }}</button>
          }
        }
      </div>
    </header>

    <div class="inbox-kpis">
      <div class="inbox-kpi"><span class="v">{{ rows().length }}</span><span class="l">{{ 'ebelge.inbox.kpi.total' | t }}</span></div>
      <div class="inbox-kpi"><span class="v">{{ awaiting().length }}</span><span class="l">{{ 'ebelge.inbox.kpi.awaiting' | t }}</span></div>
      <div class="inbox-kpi"><span class="v days-left" [class.critical]="dueSoon() > 0">{{ dueSoon() }}</span><span class="l">{{ 'ebelge.inbox.kpi.dueSoon' | t }}</span></div>
      <div class="inbox-kpi"><span class="v">{{ unmatched() }}</span><span class="l">{{ 'ebelge.inbox.kpi.unmatched' | t }}</span></div>
    </div>

    <div class="filter-pills" style="margin-bottom: var(--space-4)">
      @for (f of filters; track f) {
        <button type="button" class="filter-pill" [class.active]="filter() === f" (click)="filter.set(f)">{{ 'ebelge.inbox.filter.' + f | t }}</button>
      }
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead>
            <tr>
              <th>{{ 'ebelge.inbox.col.number' | t }}</th>
              <th>{{ 'ebelge.inbox.col.type' | t }}</th>
              <th>{{ 'ebelge.inbox.col.sender' | t }}</th>
              <th>{{ 'documents.issueDate' | t }}</th>
              <th class="num">{{ 'ebelge.inbox.col.amount' | t }}</th>
              <th>{{ 'ebelge.inbox.col.match' | t }}</th>
              <th>{{ 'ebelge.inbox.col.status' | t }}</th>
              <th>{{ 'ebelge.inbox.col.deadline' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of visible(); track r.id) {
              <tr class="clickable-row" (click)="open(r)">
                <td class="mono td-primary"><strong>{{ r.documentNo || '-' }}</strong></td>
                <td [attr.data-label]="'ebelge.inbox.col.type' | t">{{ 'ebelge.docType.' + r.documentType | t }} <span class="text-xs text-muted">{{ r.profileId }} {{ r.typeCode }}</span></td>
                <td [attr.data-label]="'ebelge.inbox.col.sender' | t">{{ r.senderName }} <div class="text-xs text-muted mono">{{ r.senderTaxId }}</div></td>
                <td [attr.data-label]="'documents.issueDate' | t">{{ r.issueDate ? (r.issueDate | appDate) : '-' }}</td>
                <td class="num" [attr.data-label]="'ebelge.inbox.col.amount' | t">{{ r.payableAmount !== null ? (r.payableAmount | money: (r.currency || 'TRY')) : '-' }}</td>
                <td [attr.data-label]="'ebelge.inbox.col.match' | t">@if (r.status === 'INFO') { <span class="text-muted">-</span> } @else { <span class="badge" [class.badge-success]="r.matchStatus === 'RECEIPT' || r.matchStatus === 'INVOICE'" [class.badge-warning]="r.matchStatus === 'ORDER' || r.matchStatus === 'SUPPLIER'" [class.badge-neutral]="r.matchStatus === 'UNMATCHED'">{{ 'ebelge.inbox.match.' + r.matchStatus | t }}</span> }</td>
                <td [attr.data-label]="'ebelge.inbox.col.status' | t"><span class="badge" [ngClass]="badge(r.status)">{{ 'ebelge.inbox.status.' + r.status | t }}</span></td>
                <td [attr.data-label]="'ebelge.inbox.col.deadline' | t">
                  @if (r.responseRequired && r.responseDueAt) {
                    <span class="countdown days-left" [class.critical]="(r.hoursLeft ?? 0) < 24" [class.warning]="(r.hoursLeft ?? 0) < 72">{{ countdown(r) }}</span>
                  } @else { <span class="text-muted">{{ 'ebelge.inbox.noResponse' | t }}</span> }
                </td>
              </tr>
            }
            @if (!loading() && visible().length === 0) {
              <tr><td colspan="8"><div class="empty-state"><p class="empty-state-title">{{ 'ebelge.inbox.empty' | t }}</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ 'ebelge.docType.' + r.documentType | t }}</span><span class="mono text-muted">{{ r.documentNo }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            @if (r.responseRequired && r.responseDueAt) {
              <div class="doc-alert" [class.danger]="(r.hoursLeft ?? 0) < 24">
                {{ (r.documentType === 'DESPATCH' ? 'ebelge.inbox.despatchDeadline' : 'ebelge.inbox.ticariDeadline') | t: { date: (r.responseDueAt | appDate: 'datetime'), left: countdown(r) } }}
              </div>
            }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'ebelge.inbox.col.sender' | t }}</label><span>{{ r.senderName }} <span class="mono text-muted">{{ r.senderTaxId }}</span></span></div>
              <div class="doc-field"><label>{{ 'ebelge.panel.scenario' | t }}</label><span>{{ r.profileId }} / {{ r.typeCode }}</span></div>
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ r.issueDate | appDate }}</span></div>
              <div class="doc-field"><label>{{ 'ebelge.inbox.receivedAt' | t }}</label><span>{{ r.receivedAt | appDate: 'datetime' }}</span></div>
              @if (r.actualDespatchAt) { <div class="doc-field"><label>{{ 'ebelge.inbox.actualDespatch' | t }}</label><span>{{ r.actualDespatchAt | appDate: 'datetime' }}</span></div> }
              @if (r.payableAmount !== null) { <div class="doc-field"><label>{{ 'ebelge.inbox.col.amount' | t }}</label><span>{{ r.payableAmount | money: (r.currency || 'TRY') }}</span></div> }
              <div class="doc-field"><label>ETTN</label><span class="mono text-xs">{{ r.ettn }}</span></div>
              <div class="doc-field"><label>{{ 'ebelge.inbox.col.status' | t }}</label><span><span class="badge" [ngClass]="badge(r.status)">{{ 'ebelge.inbox.status.' + r.status | t }}</span>@if (r.respondedBy) { <span class="text-xs text-muted"> · {{ r.respondedBy }} {{ r.respondedAt | appDate: 'datetime' }}</span> }</span></div>
            </div>
            @if (r.refs?.orderRef || r.refs?.despatchRefs?.length || r.refs?.billingRefs?.length) {
              <div class="doc-field"><label>{{ 'ebelge.inbox.refs' | t }}</label>
                <span>
                  @if (r.refs?.orderRef; as o) { {{ 'ebelge.inbox.orderRef' | t }}: <span class="mono">{{ o.id }}</span> }
                  @for (d of r.refs?.despatchRefs || []; track d.id) { · {{ 'ebelge.inbox.despatchRef' | t }}: <span class="mono">{{ d.id }}</span> }
                  @for (b of r.refs?.billingRefs || []; track b.id) { · {{ 'ebelge.inbox.billingRef' | t }}: <span class="mono">{{ b.id }}</span> }
                </span>
              </div>
            }

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'ebelge.inbox.matching' | t }} <span class="badge" [class.badge-success]="r.matchStatus === 'RECEIPT' || r.matchStatus === 'INVOICE'" [class.badge-warning]="r.matchStatus === 'ORDER' || r.matchStatus === 'SUPPLIER'" [class.badge-neutral]="r.matchStatus === 'UNMATCHED'">{{ 'ebelge.inbox.match.' + r.matchStatus | t }}</span></h4>
              <div class="match-box">
                <span>{{ 'ebelge.inbox.supplier' | t }}: @if (r.supplier) { <a class="link" routerLink="/suppliers">{{ r.supplier.name }}</a> } @else { - }</span>
                <span>{{ 'ebelge.inbox.purchaseOrder' | t }}: @if (r.purchaseOrder) { <a class="link mono" routerLink="/purchase-orders">{{ r.purchaseOrder.poNumber }}</a> } @else { - }</span>
                <span>{{ 'ebelge.inbox.goodsReceipt' | t }}: @if (r.goodsReceipt) { <a class="link mono" routerLink="/goods-receipts" [queryParams]="{ id: r.goodsReceipt.id }">{{ r.goodsReceipt.receiptNo }}</a> } @else { - }</span>
                @if (r.originalInvoice) { <span>{{ 'ebelge.inbox.originalInvoice' | t }}: <a class="link mono" routerLink="/invoices" [queryParams]="{ id: r.originalInvoice.id }">{{ r.originalInvoice.documentNo }}</a></span> }
              </div>
              @if (!ui.isReadonly() && (r.documentType === 'INVOICE' || r.documentType === 'DESPATCH') && r.supplierId && !r.originalInvoiceId) {
                <div class="doc-grid" style="margin-top: var(--space-3)">
                  <div class="doc-field"><label for="mPo">{{ 'ebelge.inbox.purchaseOrder' | t }}</label>
                    <select id="mPo" class="select" [(ngModel)]="matchPo" (ngModelChange)="loadReceipts()"><option value="">-</option>@for (p of supplierPos(); track p.id) { <option [value]="p.id">{{ p.poNumber }} · {{ p.status }}</option> }</select></div>
                  <div class="doc-field"><label for="mGr">{{ 'ebelge.inbox.goodsReceipt' | t }}</label>
                    <select id="mGr" class="select" [(ngModel)]="matchGr"><option value="">-</option>@for (g of receipts(); track g.id) { <option [value]="g.id">{{ g.receiptNo }}@if (g.supplierDespatchNo) { · {{ g.supplierDespatchNo }} }</option> }</select></div>
                </div>
                <button class="btn btn-secondary btn-sm" (click)="saveMatch(r)" [disabled]="busy()">{{ 'ebelge.inbox.saveMatch' | t }}</button>
              }
            </div>

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'ebelge.inbox.lines' | t }}</h4>
              <div class="table-scroll">
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th>
                  @if (r.documentType === 'INVOICE') { <th class="num hide-xs">{{ 'invoices.unitPrice' | t }}</th><th class="num">{{ 'invoices.net' | t }}</th> }
                  @if (raMode()) { <th class="num">{{ 'ebelge.receiptAdvice.accepted' | t }}</th><th class="num">{{ 'ebelge.receiptAdvice.rejectedQty' | t }}</th><th>{{ 'ebelge.receiptAdvice.reason' | t }}</th> }
                </tr></thead>
                <tbody>
                  @if (raMode()) {
                    @for (l of raLines; track l.lineId) {
                      <tr>
                        <td>{{ l.name }}</td>
                        <td class="num">{{ l.quantity | num }} {{ l.unitCode | unitLabel }}</td>
                        <td class="num"><input class="input qty" type="number" min="0" [max]="l.quantity" step="any" [(ngModel)]="l.accepted" [attr.aria-label]="'ebelge.receiptAdvice.accepted' | t" /></td>
                        <td class="num"><input class="input qty" type="number" min="0" [max]="l.quantity" step="any" [(ngModel)]="l.rejected" [attr.aria-label]="'ebelge.receiptAdvice.rejectedQty' | t" /></td>
                        <td><input class="input ra-reason" maxlength="200" [(ngModel)]="l.reason" [disabled]="!l.rejected" [attr.aria-label]="'ebelge.receiptAdvice.reason' | t" /></td>
                      </tr>
                    }
                  } @else {
                    @for (l of r.lines || []; track l.id) {
                      <tr>
                        <td>{{ l.name }}@if (l.sellersItemId) { <div class="text-xs text-muted">{{ l.sellersItemId }}</div> }</td>
                        <td class="num">{{ l.quantity | num }} {{ l.unitCode | unitLabel }}</td>
                        @if (r.documentType === 'INVOICE') { <td class="num hide-xs">{{ l.unitPrice | money: (r.currency || 'TRY') }}</td><td class="num">{{ l.lineExtension | money: (r.currency || 'TRY') }}</td> }
                      </tr>
                    }
                  }
                </tbody>
              </table>
              </div>
              @if (r.responseLines?.length) {
                <p class="doc-hint">@for (x of r.responseLines!; track $index) { #{{ x.despatchLineId }}: {{ 'ebelge.receiptAdvice.summary' | t: { received: x.received, rejected: x.rejected, short: x.short } }} @if (x.rejectReason) { ({{ x.rejectReason }}) } }</p>
              }
            </div>

            @if (!ui.isReadonly() && r.status === 'RECEIVED' && !r.expired) {
              @if (r.documentType === 'INVOICE' && r.profileId === 'TICARIFATURA') {
                <div class="doc-section respond-box">
                  <h4 class="doc-section-title">{{ 'ebelge.response.title' | t }}</h4>
                  <div class="doc-field"><label for="respNote">{{ 'ebelge.response.note' | t }}</label><textarea id="respNote" class="textarea" rows="2" maxlength="500" [(ngModel)]="responseNote"></textarea></div>
                  <p class="doc-hint">{{ 'ebelge.response.hint' | t }}</p>
                  <div class="doc-actions">
                    <button class="btn btn-danger" (click)="respond(r, 'RED')" [disabled]="busy() || !responseNote.trim()">{{ 'ebelge.response.RED' | t }}</button>
                    <button class="btn btn-primary" (click)="respond(r, 'KABUL')" [disabled]="busy()">{{ 'ebelge.response.KABUL' | t }}</button>
                  </div>
                </div>
              }
              @if (r.documentType === 'DESPATCH') {
                <div class="doc-section respond-box">
                  <h4 class="doc-section-title">{{ 'ebelge.receiptAdvice.title' | t }}</h4>
                  <p class="doc-hint">{{ 'ebelge.receiptAdvice.hint' | t }}</p>
                  @if (!raMode()) {
                    <div class="doc-actions">
                      <button class="btn btn-secondary" (click)="startRa(r)">{{ 'ebelge.receiptAdvice.partial' | t }}</button>
                      <button class="btn btn-primary" (click)="startRa(r); sendRa(r)" [disabled]="busy()">{{ 'ebelge.receiptAdvice.acceptAll' | t }}</button>
                    </div>
                  } @else {
                    <div class="doc-field"><label for="raNote">{{ 'ebelge.response.note' | t }}</label><input id="raNote" class="input" maxlength="500" [(ngModel)]="responseNote" /></div>
                    <div class="doc-actions">
                      <button class="btn btn-secondary" (click)="raMode.set(false)">{{ 'common.cancel' | t }}</button>
                      <button class="btn btn-primary" (click)="sendRa(r)" [disabled]="busy()">{{ 'ebelge.receiptAdvice.send' | t }}</button>
                    </div>
                  }
                </div>
              }
            }

            <app-edoc-panel sourceType="incoming" [sourceId]="r.id"></app-edoc-panel>
            @if (r.responseEttn) { <p class="doc-hint">{{ 'ebelge.inbox.responseSent' | t: { ettn: r.responseEttn } }}</p> }
          </div>
        </div>
      </div>
    }
  `,
})
export class EBelgeInboxComponent implements OnInit, OnDestroy {
  private api = inject(EBelgeService);
  private docs = inject(DocumentsService);
  private inventory = inject(InventoryService);
  private socket = inject(SocketService, { optional: true });
  private route = inject(ActivatedRoute);
  ui = inject(UiStateService);
  private i18n = inject(I18nService);
  private sub?: Subscription;

  filters = ['all', 'awaiting', 'INVOICE', 'DESPATCH', 'answered'];
  filter = signal('all');
  rows = signal<IncomingDocument[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<IncomingDocument | null>(null);
  provider = signal<string | null>(null);
  raMode = signal(false);
  raLines: ReceiptLineForm[] = [];
  responseNote = '';
  simKinds = ['TICARI_INVOICE', 'TEMEL_INVOICE', 'DESPATCH', 'IADE_INVOICE'];
  simKind = 'TICARI_INVOICE';
  badge = edocBadge;
  supplierPos = signal<{ id: string; poNumber: string; status: string }[]>([]);
  receipts = signal<GoodsReceipt[]>([]);
  matchPo = '';
  matchGr = '';

  isAdmin = () => this.ui.userProfile()?.role === 'admin';
  awaiting = computed(() => this.rows().filter((r) => r.responseRequired));
  dueSoon = computed(() => this.awaiting().filter((r) => (r.hoursLeft ?? 999) < 48).length);
  unmatched = computed(() => this.rows().filter((r) => r.matchStatus === 'UNMATCHED' && (r.documentType === 'INVOICE' || r.documentType === 'DESPATCH')).length);
  visible = computed(() => {
    const f = this.filter();
    return this.rows().filter((r) => f === 'all' || (f === 'awaiting' ? r.responseRequired : f === 'answered' ? !!r.respondedAt || r.status === 'AUTO_ACCEPTED' : r.documentType === f));
  });

  ngOnInit() {
    this.api.status().subscribe({ next: (s) => this.provider.set(s.provider), error: () => undefined });
    this.load();
    if (this.socket) this.sub = this.socket.ebelge$.subscribe((e) => e.event === 'inbox_updated' && this.load());
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  load() {
    this.loading.set(true);
    this.api.inbox().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        const id = this.route.snapshot.queryParamMap.get('id');
        if (id && !this.selected()) {
          const r = rows.find((x) => x.id === id);
          if (r) this.open(r);
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error');
      },
    });
  }

  countdown(r: IncomingDocument): string {
    const h = r.hoursLeft ?? 0;
    if (h <= 0) return this.i18n.t('ebelge.inbox.expired');
    return h >= 48 ? this.i18n.t('ebelge.inbox.daysLeft', { n: Math.floor(h / 24) }) : this.i18n.t('ebelge.inbox.hoursLeft', { n: h });
  }

  open(r: IncomingDocument) {
    this.raMode.set(false);
    this.responseNote = '';
    this.api.incoming(r.id).subscribe({
      next: (full) => {
        this.selected.set(full);
        this.matchPo = full.purchaseOrderId || '';
        this.matchGr = full.goodsReceiptId || '';
        if (full.supplierId) {
          this.inventory.getPurchaseOrders().subscribe({ next: (pos: any[]) => this.supplierPos.set(pos.filter((p) => p.supplierId === full.supplierId).map((p) => ({ id: p.id, poNumber: p.poNumber, status: p.status }))), error: () => undefined });
          this.loadReceipts();
        }
      },
      error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error'),
    });
  }

  loadReceipts() {
    const r = this.selected();
    if (!r) return;
    this.docs.goodsReceipts({}).subscribe({ next: (gs) => this.receipts.set(gs.filter((g: any) => (this.matchPo ? g.purchaseOrderId === this.matchPo : g.supplierId === r.supplierId))), error: () => undefined });
  }

  saveMatch(r: IncomingDocument) {
    this.busy.set(true);
    this.api.match(r.id, { purchaseOrderId: this.matchPo || null, goodsReceiptId: this.matchGr || null }).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.selected.set(x);
        this.ui.showToast(this.i18n.t('ebelge.toast.matched'), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  fetch() {
    this.busy.set(true);
    this.api.fetchInbox().subscribe({
      next: (x) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('ebelge.toast.fetched', { n: x.stored }), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  simulate() {
    this.busy.set(true);
    this.api.simulateIncoming(this.simKind).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('ebelge.toast.fetched', { n: x.stored }), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  respond(r: IncomingDocument, code: 'KABUL' | 'RED') {
    this.busy.set(true);
    this.api.respond(r.id, code, this.responseNote.trim() || null).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.selected.set(x);
        this.ui.showToast(this.i18n.t('ebelge.toast.responded', { code: this.i18n.t('ebelge.response.' + code) }), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  startRa(r: IncomingDocument) {
    this.raLines = (r.lines || []).map((l) => ({ lineId: l.id, name: l.name, quantity: Number(l.quantity), unitCode: l.unitCode, accepted: Number(l.quantity), rejected: 0, reason: '' }));
    this.raMode.set(true);
  }

  sendRa(r: IncomingDocument) {
    this.busy.set(true);
    const lines = this.raLines.map((l) => ({ lineId: l.lineId, accepted: Number(l.accepted) || 0, rejected: Number(l.rejected) || 0, reason: l.reason || null }));
    this.api.receiptAdvice(r.id, lines, this.responseNote.trim() || null).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.raMode.set(false);
        this.selected.set(x);
        this.ui.showToast(this.i18n.t('ebelge.toast.receiptAdvice'), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
