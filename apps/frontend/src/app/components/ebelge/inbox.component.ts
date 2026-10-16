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
import { IconComponent } from '../shared/icon.component';

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
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, MoneyPipe, NumberFormatPipe, UnitLabelPipe, EdocPanelComponent, IconComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    :host { display: block; }
    .notice > app-icon { color: var(--tone); }
    .inbox-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 20px; }
    .kpi-val b.is-danger { color: var(--danger); }
    .list-bar { margin-bottom: 12px; }
    .list-bar .seg { max-width: 100%; }
    .list-bar .seg button { flex: none; }
    .list-bar .sim { display: flex; align-items: center; gap: 8px; }
    .list-bar .sim .field { width: 200px; }
    .doc-no { font-family: var(--font-mono); font-weight: 500; }
    .cv { min-width: 0; }
    .cell-sub { margin-left: 8px; font-size: var(--text-xs); color: var(--fg-3); }
    .tbl td.c-type { max-width: 180px; }
    .tbl td.c-dl { max-width: 130px; }
    .tbl td.c-snd { max-width: 200px; }
    .countdown { white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
    .tbl td.empty-cell { white-space: normal; max-width: none; padding: 0; height: auto; }
    .tbl tr.sk td { height: var(--row-h); }
    .tbl tr.sk .skeleton-row { height: 12px; }
    .drawer-h .t h2.dh-no { font-family: var(--font-mono); font-size: var(--text-lg); font-weight: 600; letter-spacing: -0.01em; }
    .drawer-h .tools { gap: 8px; }
    .drawer-body .doc-grid { margin-bottom: 0; }
    .drawer-body > .doc-section, .drawer-body > div > .doc-section { margin-top: 0; }
    .drawer-body .notice { align-items: flex-start; }
    .drawer-body .notice > app-icon { margin-top: 1px; }
    .ref-list { display: flex; flex-wrap: wrap; gap: 4px 12px; }
    .ref-list .sec { color: var(--fg-3); }
    .ref-list > span { display: inline-flex; align-items: baseline; gap: 6px; }
    .line-sub { display: block; font-size: var(--text-xs); color: var(--fg-3); margin-top: 2px; }
    .match-form { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
    .match-form .btn { align-self: flex-start; }
    .respond-box { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--radius-lg); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .respond-box .doc-section-title { margin: 0; }
    .respond-box .doc-hint { margin: 0; }
    .respond-box .doc-actions { justify-content: flex-end; }
    .ra-tbl td { padding-top: 6px; padding-bottom: 6px; }
    .ra-tbl .field { width: 96px; margin-left: auto; }
    .ra-tbl .field.ra-reason { width: auto; min-width: 140px; margin-left: 0; }
    @media (max-width: 900px) { .inbox-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) {
      .inbox-kpis { gap: 8px; }
      .inbox-kpis .kpi { padding: 12px; gap: 6px; }
      .inbox-kpis .kpi-val b { font-size: var(--text-xl); }
      .list-bar .sim { width: 100%; }
      .list-bar .sim .field { flex: 1; width: auto; }
      .table-responsive td.empty-cell { display: block; }
      .tbl.table-responsive td { max-width: none; }
      .table-responsive td .cv { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'ebelge.inbox.title' | t }}</h1>
        <p>{{ 'ebelge.inbox.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        @if (!ui.isReadonly()) {
          <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="fetch()" [disabled]="busy()"><app-icon name="refresh" /><span>{{ 'ebelge.inbox.fetch' | t }}</span></button>
        }
      </div>
    </header>

    <div class="kpi-grid inbox-kpis">
      <div class="kpi">
        <div class="kpi-top"><app-icon name="inbox" size="sm" />{{ 'ebelge.inbox.kpi.total' | t }}</div>
        <div class="kpi-val"><b>{{ rows().length | num }}</b></div>
      </div>
      <div class="kpi">
        <div class="kpi-top"><app-icon name="bell" size="sm" />{{ 'ebelge.inbox.kpi.awaiting' | t }}</div>
        <div class="kpi-val"><b>{{ awaiting().length | num }}</b></div>
      </div>
      <div class="kpi" [class.is-alert]="dueSoon() > 0">
        <div class="kpi-top"><app-icon [name]="dueSoon() > 0 ? 'warn' : 'calendar'" size="sm" />{{ 'ebelge.inbox.kpi.dueSoon' | t }}</div>
        <div class="kpi-val"><b [class.is-danger]="dueSoon() > 0">{{ dueSoon() | num }}</b></div>
      </div>
      <div class="kpi">
        <div class="kpi-top"><app-icon name="link" size="sm" />{{ 'ebelge.inbox.kpi.unmatched' | t }}</div>
        <div class="kpi-val"><b>{{ unmatched() | num }}</b></div>
      </div>
    </div>

    <div class="toolbar list-bar">
      <div class="seg" role="group" [attr.aria-label]="'documents.statusFilter' | t">
        @for (f of filters; track f) {
          <button type="button" [attr.aria-pressed]="filter() === f" (click)="filter.set(f)">{{ 'ebelge.inbox.filter.' + f | t }}</button>
        }
      </div>
      @if (!ui.isReadonly() && isAdmin() && provider() === 'MOCK') {
        <span class="spacer"></span>
        <div class="sim">
          <div class="field field-sm select"><select [(ngModel)]="simKind" [attr.aria-label]="'ebelge.inbox.simulate' | t">
            @for (k of simKinds; track k) { <option [value]="k">{{ 'ebelge.inbox.sim.' + k | t }}</option> }
          </select></div>
          <button type="button" class="btn btn-sm" (click)="simulate()" [disabled]="busy()"><app-icon name="sparkle" size="sm" />{{ 'ebelge.inbox.simulate' | t }}</button>
        </div>
      }
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="tbl table-responsive">
          <thead>
            <tr>
              <th>{{ 'ebelge.inbox.col.number' | t }}</th>
              <th>{{ 'ebelge.inbox.col.type' | t }}</th>
              <th>{{ 'ebelge.inbox.col.sender' | t }}</th>
              <th>{{ 'documents.issueDate' | t }}</th>
              <th class="r">{{ 'ebelge.inbox.col.amount' | t }}</th>
              <th>{{ 'ebelge.inbox.col.match' | t }}</th>
              <th>{{ 'ebelge.inbox.col.status' | t }}</th>
              <th>{{ 'ebelge.inbox.col.deadline' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @if (loading() && rows().length === 0) {
              @for (i of [1, 2, 3, 4, 5]; track i) { <tr class="sk"><td colspan="8"><div class="skeleton-row"></div></td></tr> }
            }
            @for (r of visible(); track r.id) {
              <tr class="clickable-row" [class.is-selected]="selected()?.id === r.id" (click)="open(r)">
                <td class="td-primary"><span class="doc-no">{{ r.documentNo || '-' }}</span></td>
                <td class="c-type" [attr.data-label]="'ebelge.inbox.col.type' | t"><span class="cv" [title]="gib(r.profileId) + ' · ' + gib(r.typeCode)">{{ 'ebelge.docType.' + r.documentType | t }}@if (r.typeCode) { <span class="cell-sub">{{ gib(r.typeCode) }}</span> }</span></td>
                <td class="c-snd" [attr.data-label]="'ebelge.inbox.col.sender' | t"><span class="cv">{{ r.senderName }}<span class="cell-code">{{ r.senderTaxId }}</span></span></td>
                <td [attr.data-label]="'documents.issueDate' | t">{{ r.issueDate ? (r.issueDate | appDate) : '-' }}</td>
                <td class="r" [attr.data-label]="'ebelge.inbox.col.amount' | t">{{ r.payableAmount !== null ? (r.payableAmount | money: (r.currency || 'TRY')) : '-' }}</td>
                <td [attr.data-label]="'ebelge.inbox.col.match' | t">@if (r.status === 'INFO') { <span class="cell-sec">-</span> } @else { <span class="badge" [class.badge-success]="r.matchStatus === 'RECEIPT' || r.matchStatus === 'INVOICE'" [class.badge-warning]="r.matchStatus === 'ORDER' || r.matchStatus === 'SUPPLIER'" [class.badge-neutral]="r.matchStatus === 'UNMATCHED'"><span class="dot"></span>{{ 'ebelge.inbox.match.' + r.matchStatus | t }}</span> }</td>
                <td [attr.data-label]="'ebelge.inbox.col.status' | t"><span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'ebelge.inbox.status.' + r.status | t }}</span></td>
                <td class="c-dl" [attr.data-label]="'ebelge.inbox.col.deadline' | t">
                  @if (r.responseRequired && r.responseDueAt) {
                    <span class="countdown days-left" [class.critical]="(r.hoursLeft ?? 0) < 24" [class.warning]="(r.hoursLeft ?? 0) < 72">@if ((r.hoursLeft ?? 0) < 72) { <app-icon name="warn" size="xs" /> }{{ countdown(r) }}</span>
                  } @else { <span class="cell-sec">{{ 'ebelge.inbox.noResponse' | t }}</span> }
                </td>
              </tr>
            }
            @if (!loading() && visible().length === 0) {
              <tr><td colspan="8" class="empty-cell">
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="inbox" /></div>
                  <h3>{{ 'ebelge.inbox.empty' | t }}</h3>
                  <p>{{ 'ebelge.inbox.emptyHint' | t }}</p>
                  @if (!ui.isReadonly()) { <div class="actions cluster"><button type="button" class="btn btn-sm" (click)="fetch()" [disabled]="busy()"><app-icon name="refresh" size="sm" />{{ 'ebelge.inbox.fetch' | t }}</button></div> }
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      <div class="drawer-overlay" (click)="selected.set(null)" (document:keydown.escape)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'ebelge.docType.' + r.documentType | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="inbox" size="sm" />{{ 'ebelge.docType.' + r.documentType | t }}<span class="sep">/</span>{{ gib(r.profileId) }}@if (r.typeCode) { · {{ gib(r.typeCode) }} }</div>
              <h2 class="dh-no">{{ r.documentNo }}</h2>
            </div>
            <div class="tools">
              <span class="badge" [ngClass]="badge(r.status)"><span class="dot"></span>{{ 'ebelge.inbox.status.' + r.status | t }}</span>
              <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            </div>
          </div>
          <div class="drawer-body">
            @if (r.responseRequired && r.responseDueAt) {
              <div class="notice" [class.notice-danger]="(r.hoursLeft ?? 0) < 24" [class.notice-warning]="(r.hoursLeft ?? 0) >= 24">
                <app-icon [name]="(r.hoursLeft ?? 0) < 24 ? 'alert' : 'warn'" />
                <span class="t">{{ (r.documentType === 'DESPATCH' ? 'ebelge.inbox.despatchDeadline' : 'ebelge.inbox.ticariDeadline') | t: { date: (r.responseDueAt | appDate: 'datetime'), left: countdown(r) } }}</span>
              </div>
            }
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'ebelge.inbox.col.sender' | t }}</label><span>{{ r.senderName }} <span class="mono cell-sec">{{ r.senderTaxId }}</span></span></div>
              @if (r.payableAmount !== null) { <div class="doc-field"><label>{{ 'ebelge.inbox.col.amount' | t }}</label><span>{{ r.payableAmount | money: (r.currency || 'TRY') }}</span></div> }
              <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ r.issueDate | appDate }}</span></div>
              <div class="doc-field"><label>{{ 'ebelge.inbox.receivedAt' | t }}</label><span>{{ r.receivedAt | appDate: 'datetime' }}</span></div>
              @if (r.actualDespatchAt) { <div class="doc-field"><label>{{ 'ebelge.inbox.actualDespatch' | t }}</label><span>{{ r.actualDespatchAt | appDate: 'datetime' }}</span></div> }
              <div class="doc-field"><label>ETTN</label><span class="mono text-xs">{{ r.ettn }}</span></div>
              @if (r.respondedBy) { <div class="doc-field"><label>{{ 'ebelge.inbox.col.status' | t }}</label><span>{{ r.respondedBy }} <span class="cell-sec">· {{ r.respondedAt | appDate: 'datetime' }}</span></span></div> }
            </div>
            @if (r.refs?.orderRef || r.refs?.despatchRefs?.length || r.refs?.billingRefs?.length) {
              <div class="doc-field"><label>{{ 'ebelge.inbox.refs' | t }}</label>
                <span class="ref-list">
                  @if (r.refs?.orderRef; as o) { <span><span class="sec">{{ 'ebelge.inbox.orderRef' | t }}</span> <span class="mono">{{ o.id }}</span></span> }
                  @for (d of r.refs?.despatchRefs || []; track d.id) { <span><span class="sec">{{ 'ebelge.inbox.despatchRef' | t }}</span> <span class="mono">{{ d.id }}</span></span> }
                  @for (b of r.refs?.billingRefs || []; track b.id) { <span><span class="sec">{{ 'ebelge.inbox.billingRef' | t }}</span> <span class="mono">{{ b.id }}</span></span> }
                </span>
              </div>
            }

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'ebelge.inbox.matching' | t }} <span class="badge" [class.badge-success]="r.matchStatus === 'RECEIPT' || r.matchStatus === 'INVOICE'" [class.badge-warning]="r.matchStatus === 'ORDER' || r.matchStatus === 'SUPPLIER'" [class.badge-neutral]="r.matchStatus === 'UNMATCHED'"><span class="dot"></span>{{ 'ebelge.inbox.match.' + r.matchStatus | t }}</span></h4>
              <div class="doc-grid">
                <div class="doc-field"><label>{{ 'ebelge.inbox.supplier' | t }}</label><span>@if (r.supplier) { <a class="link" routerLink="/suppliers">{{ r.supplier.name }}</a> } @else { <span class="cell-sec">-</span> }</span></div>
                <div class="doc-field"><label>{{ 'ebelge.inbox.purchaseOrder' | t }}</label><span>@if (r.purchaseOrder) { <a class="link mono" routerLink="/purchase-orders">{{ r.purchaseOrder.poNumber }}</a> } @else { <span class="cell-sec">-</span> }</span></div>
                <div class="doc-field"><label>{{ 'ebelge.inbox.goodsReceipt' | t }}</label><span>@if (r.goodsReceipt) { <a class="link mono" routerLink="/goods-receipts" [queryParams]="{ id: r.goodsReceipt.id }">{{ r.goodsReceipt.receiptNo }}</a> } @else { <span class="cell-sec">-</span> }</span></div>
                @if (r.originalInvoice) { <div class="doc-field"><label>{{ 'ebelge.inbox.originalInvoice' | t }}</label><span><a class="link mono" routerLink="/invoices" [queryParams]="{ id: r.originalInvoice.id }">{{ r.originalInvoice.documentNo }}</a></span></div> }
              </div>
              @if (!ui.isReadonly() && (r.documentType === 'INVOICE' || r.documentType === 'DESPATCH') && r.supplierId && !r.originalInvoiceId) {
                <div class="match-form">
                  <div class="grid-2">
                    <div class="fld"><label class="fld-label" for="mPo">{{ 'ebelge.inbox.purchaseOrder' | t }}</label>
                      <div class="field select"><select id="mPo" [(ngModel)]="matchPo" (ngModelChange)="loadReceipts()"><option value="">-</option>@for (p of supplierPos(); track p.id) { <option [value]="p.id">{{ p.poNumber }} · {{ p.status }}</option> }</select></div></div>
                    <div class="fld"><label class="fld-label" for="mGr">{{ 'ebelge.inbox.goodsReceipt' | t }}</label>
                      <div class="field select"><select id="mGr" [(ngModel)]="matchGr"><option value="">-</option>@for (g of receipts(); track g.id) { <option [value]="g.id">{{ g.receiptNo }}@if (g.supplierDespatchNo) { · {{ g.supplierDespatchNo }} }</option> }</select></div></div>
                  </div>
                  <button type="button" class="btn btn-sm" [class.is-loading]="busy()" (click)="saveMatch(r)" [disabled]="busy()"><app-icon name="link" size="sm" /><span>{{ 'ebelge.inbox.saveMatch' | t }}</span></button>
                </div>
              }
            </div>

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'ebelge.inbox.lines' | t }}</h4>
              <div class="table-scroll">
              <table class="doc-table" [class.ra-tbl]="raMode()">
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
                        <td class="num"><div class="field field-sm"><input class="num" type="number" min="0" [max]="l.quantity" step="any" [(ngModel)]="l.accepted" [attr.aria-label]="'ebelge.receiptAdvice.accepted' | t" /></div></td>
                        <td class="num"><div class="field field-sm"><input class="num" type="number" min="0" [max]="l.quantity" step="any" [(ngModel)]="l.rejected" [attr.aria-label]="'ebelge.receiptAdvice.rejectedQty' | t" /></div></td>
                        <td><div class="field field-sm ra-reason"><input maxlength="200" [(ngModel)]="l.reason" [disabled]="!l.rejected" [attr.aria-label]="'ebelge.receiptAdvice.reason' | t" /></div></td>
                      </tr>
                    }
                  } @else {
                    @for (l of r.lines || []; track l.id) {
                      <tr>
                        <td>{{ l.name }}@if (l.sellersItemId) { <span class="cell-code">{{ l.sellersItemId }}</span> }</td>
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
                <div class="respond-box">
                  <h4 class="doc-section-title">{{ 'ebelge.response.title' | t }}</h4>
                  <div class="fld"><label class="fld-label" for="respNote">{{ 'ebelge.response.note' | t }}</label><div class="field has-area"><textarea id="respNote" rows="2" maxlength="500" [(ngModel)]="responseNote"></textarea></div><div class="fld-help">{{ 'ebelge.response.hint' | t }}</div></div>
                  <div class="doc-actions">
                    <button type="button" class="btn btn-danger-outline" (click)="respond(r, 'RED')" [disabled]="busy() || !responseNote.trim()">{{ 'ebelge.response.RED' | t }}</button>
                    <button type="button" class="btn btn-primary" (click)="respond(r, 'KABUL')" [disabled]="busy()"><app-icon name="check" />{{ 'ebelge.response.KABUL' | t }}</button>
                  </div>
                </div>
              }
              @if (r.documentType === 'DESPATCH') {
                <div class="respond-box">
                  <h4 class="doc-section-title">{{ 'ebelge.receiptAdvice.title' | t }}</h4>
                  <p class="doc-hint">{{ 'ebelge.receiptAdvice.hint' | t }}</p>
                  @if (!raMode()) {
                    <div class="doc-actions">
                      <button type="button" class="btn" (click)="startRa(r)">{{ 'ebelge.receiptAdvice.partial' | t }}</button>
                      <button type="button" class="btn btn-primary" (click)="startRa(r); sendRa(r)" [disabled]="busy()"><app-icon name="check" />{{ 'ebelge.receiptAdvice.acceptAll' | t }}</button>
                    </div>
                  } @else {
                    <div class="fld"><label class="fld-label" for="raNote">{{ 'ebelge.response.note' | t }}</label><div class="field"><input id="raNote" maxlength="500" [(ngModel)]="responseNote" /></div></div>
                    <div class="doc-actions">
                      <button type="button" class="btn btn-ghost" (click)="raMode.set(false)">{{ 'common.cancel' | t }}</button>
                      <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="sendRa(r)" [disabled]="busy()"><span>{{ 'ebelge.receiptAdvice.send' | t }}</span></button>
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
  /** Human label for a GİB profile / type code (TEMELFATURA → "Temel e-Fatura"); unknown codes fall back to the raw code. */
  gib(code: string | null | undefined): string {
    if (!code) return '';
    const key = 'ebelge.gib.' + code;
    return this.i18n.has(key) ? this.i18n.t(key) : code;
  }

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
