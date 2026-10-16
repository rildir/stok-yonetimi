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
import { IconComponent } from '../shared/icon.component';

/** Faturalar: drafts from orders / despatches, issue (numbering, freeze, 7-day rule), cancel, print. */
@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, EdocPanelComponent, IconComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`
    :host { display: block; }
    .notice > app-icon { color: var(--tone); }
    .page-notice { margin-bottom: 16px; }
    .list-bar { margin-bottom: 12px; }
    .list-bar .seg { max-width: 100%; }
    .list-bar .seg button { flex: none; }
    .list-bar .summary-strip { margin-left: auto; }
    .list-bar .l-search { flex: 0 1 280px; min-width: 180px; }
    .page-notice .t { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
    .m-list { display: none; }
    .mrow.doc { grid-template-columns: minmax(0, 1fr) auto; cursor: pointer; }
    .mrow.doc:hover { background: var(--row-hover); }
    .mrow.doc:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .mrow.doc b { font-family: var(--font-mono); }
    .mrow.doc b.is-draft { font-family: var(--font-sans); font-weight: 400; color: var(--fg-3); }
    .mrow.doc .s.r { overflow: visible; }
    .no-match { padding: 24px 16px; text-align: center; color: var(--fg-3); font-size: var(--text-sm); }
    .doc-no { font-family: var(--font-mono); font-weight: 500; }
    .cv { min-width: 0; }
    .cell-sub { margin-left: 8px; font-size: var(--text-xs); color: var(--fg-3); }
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
    .ref-list { display: flex; flex-wrap: wrap; gap: 4px 12px; }
    .ref-list .sec { color: var(--fg-3); }
    .ref-list > span { display: inline-flex; align-items: baseline; gap: 6px; }
    .line-sub { display: block; font-size: var(--text-xs); color: var(--fg-3); margin-top: 2px; }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .radio-stack { display: flex; flex-direction: column; gap: 8px; }
    .modal-b .notice { align-items: flex-start; }
    @media (max-width: 640px) {
      .list-bar .summary-strip { display: none; }
      .list-bar .l-search { flex: 1 1 100%; }
      .list-bar .l-search .trail { display: none; }
      .table-card.has-m { display: none; }
      .m-list { display: block; }
      .page-actions .btn .lbl-m { display: none; }
      .table-responsive td.w-act { display: none; }
      .table-responsive td.empty-cell { display: block; }
      .tbl.table-responsive td { max-width: none; }
      .table-responsive td .cv { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .drawer-footer .lbl-m { display: none; }
    }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'invoices.title' | t }}</h1>
        <p>{{ 'invoices.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <a class="btn" routerLink="/despatches" [attr.aria-label]="'invoices.fromDespatches' | t"><app-icon name="truck" /><span class="lbl-m">{{ 'invoices.fromDespatches' | t }}</span></a>
      </div>
    </header>

    @if (eDocumentMode() && eDocumentMode() !== 'PROVIDER') {
      <div class="notice notice-info page-notice"><app-icon name="info" />
        <span class="t"><span>{{ (noticeOpen() ? 'invoices.noneModeInfo' : 'invoices.noneModeShort') | t }}</span>
          <button type="button" class="link-btn" [attr.aria-expanded]="noticeOpen()" (click)="noticeOpen.set(!noticeOpen())">{{ (noticeOpen() ? 'invoices.noneModeLess' : 'invoices.noneModeMore') | t }}</button>
        </span>
      </div>
    }

    <div class="toolbar list-bar">
      <div class="seg" role="group" [attr.aria-label]="'documents.statusFilter' | t">
        @for (f of filters; track f) {
          <button type="button" [attr.aria-pressed]="filter() === f" (click)="filter.set(f)">{{ 'invoices.filter.' + f | t }}</button>
        }
      </div>
      <div class="field l-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [placeholder]="'invoices.searchPlaceholder' | t" [attr.aria-label]="'invoices.searchPlaceholder' | t" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        <span class="trail"><kbd>/</kbd></span>
      </div>
      <div class="summary-strip"><span><b>{{ visible().length | num }}</b>{{ 'documents.countLabel' | t }}</span></div>
    </div>

    @if (visible().length) {
      <div class="mlist m-list" role="list">
        @for (inv of visible(); track inv.id) {
          <div class="mrow doc" role="listitem" tabindex="0" [class.is-selected]="selected()?.id === inv.id" (click)="selected.set(inv)" (keydown.enter)="selected.set(inv)">
            <b [class.is-draft]="!inv.documentNo">{{ inv.documentNo || ('invoices.draftNo' | t) }}</b>
            <span class="v">{{ inv.grandTotal | money: inv.currency }}</span>
            <span class="s">{{ inv.issueDate ? (inv.issueDate | appDate) : '-' }} · {{ inv.buyerSnapshot?.name }}</span>
            <span class="s r">
              <span class="badge" [ngClass]="badge(inv.status)"><span class="dot"></span>{{ 'invoices.status.' + inv.status | t }}</span>
              @if (inv.lateIssueConfirmed) { <span class="badge badge-warning"><span class="dot"></span>{{ 'invoices.late' | t }}</span> }
            </span>
          </div>
        }
      </div>
    }

    <div class="table-card" [class.has-m]="visible().length > 0">
      <div class="table-scroll">
        <table class="tbl table-responsive">
          <thead>
            <tr>
              <th>{{ 'invoices.col.number' | t }}</th>
              <th>{{ 'invoices.col.type' | t }}</th>
              <th>{{ 'documents.buyer' | t }}</th>
              <th>{{ 'documents.issueDate' | t }}</th>
              <th>{{ 'invoices.deliveryDate' | t }}</th>
              <th class="r">{{ 'invoices.grandTotal' | t }}</th>
              <th>{{ 'invoices.col.status' | t }}</th>
              <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
            </tr>
          </thead>
          <tbody>
            @if (loading() && rows().length === 0) {
              @for (i of [1, 2, 3, 4, 5]; track i) { <tr class="sk"><td colspan="8"><div class="skeleton-row"></div></td></tr> }
            }
            @for (inv of visible(); track inv.id) {
              <tr class="clickable-row" [class.is-selected]="selected()?.id === inv.id" (click)="selected.set(inv)">
                <td class="td-primary"><span class="doc-no" [class.is-draft]="!inv.documentNo">{{ inv.documentNo || ('invoices.draftNo' | t) }}</span></td>
                <td [attr.data-label]="'invoices.col.type' | t"><span class="cv">{{ gib(inv.typeCode) }}<span class="cell-sub">{{ gib(inv.profileId) }}</span></span></td>
                <td [attr.data-label]="'documents.buyer' | t">{{ inv.buyerSnapshot?.name }}</td>
                <td [attr.data-label]="'documents.issueDate' | t">{{ inv.issueDate ? (inv.issueDate | appDate) : '-' }}</td>
                <td [attr.data-label]="'invoices.deliveryDate' | t"><span [class.cell-sec]="!inv.deliveryDate">{{ inv.deliveryDate ? (inv.deliveryDate | appDate) : '-' }}</span></td>
                <td class="r" [attr.data-label]="'invoices.grandTotal' | t">{{ inv.grandTotal | money: inv.currency }}</td>
                <td [attr.data-label]="'invoices.col.status' | t">
                  <span class="badge" [ngClass]="badge(inv.status)"><span class="dot"></span>{{ 'invoices.status.' + inv.status | t }}</span>
                  @if (inv.lateIssueConfirmed) { <span class="badge badge-warning"><span class="dot"></span>{{ 'invoices.late' | t }}</span> }
                </td>
                <td class="w-act" (click)="$event.stopPropagation()">
                  <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" (click)="print(inv)" [attr.aria-label]="'documents.print' | t" [title]="'documents.print' | t"><app-icon name="printer" size="sm" /></button>
                </td>
              </tr>
            }
            @if (!loading() && visible().length === 0 && rows().length > 0) {
              <tr><td colspan="8" class="empty-cell"><div class="no-match">{{ 'documents.noMatch' | t }}</div></td></tr>
            }
            @if (!loading() && rows().length === 0) {
              <tr><td colspan="8" class="empty-cell">
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="receipt" /></div>
                  <h3>{{ 'invoices.empty' | t }}</h3>
                  <p>{{ 'invoices.emptyHint' | t }}</p>
                  <div class="actions cluster"><a class="btn btn-sm" routerLink="/despatches"><app-icon name="truck" size="sm" />{{ 'invoices.fromDespatches' | t }}</a></div>
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as inv) {
      <div class="drawer-overlay" (click)="selected.set(null)" (document:keydown.escape)="closeOnEsc()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="(inv.kind === 'RETURN' ? 'invoices.returnInvoice' : 'invoices.detail') | t" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="receipt" size="sm" />{{ (inv.kind === 'RETURN' ? 'invoices.returnInvoice' : 'invoices.detail') | t }}<span class="sep">/</span>{{ gib(inv.typeCode) }} · {{ gib(inv.profileId) }}</div>
              <h2 [class.dh-no]="!!inv.documentNo">{{ inv.documentNo || ('invoices.draftNo' | t) }}</h2>
            </div>
            <div class="tools">
              <span class="badge" [ngClass]="badge(inv.status)"><span class="dot"></span>{{ 'invoices.status.' + inv.status | t }}</span>
              <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            </div>
          </div>
          <div class="drawer-body">
            @if (inv.status === 'DRAFT') { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'invoices.draftInfo' | t }}</span></div> }
            @if (inv.status === 'CANCELLED') { <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ 'invoices.cancelledInfo' | t: { reason: inv.cancelReason } }}</span></div> }
            @for (dd of inv.disputedDespatches || []; track dd.id) { <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'invoices.disputedDespatch' | t: { no: dd.documentNo, status: ('despatches.status.' + dd.status | t) } }}</span></div> }
            @if (inv.status === 'QUEUED') { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'invoices.cancelAfterSend' | t }}</span></div> }
            <div>
              <div class="doc-grid">
                <div class="doc-field"><label>{{ 'documents.issueDate' | t }}</label><span>{{ inv.issueDate ? (inv.issueDate | appDate) : '-' }} {{ inv.issueTime?.slice(0, 5) }}</span></div>
                <div class="doc-field"><label>{{ 'invoices.deliveryDate' | t }}</label><span>{{ inv.deliveryDate ? (inv.deliveryDate | appDate) : ('invoices.notDelivered' | t) }}</span></div>
                <div class="doc-field"><label>{{ 'documents.seller' | t }}</label><span>{{ inv.sellerSnapshot?.name }} <span class="mono cell-sec">{{ inv.sellerSnapshot?.taxId }}</span></span></div>
                <div class="doc-field"><label>{{ 'documents.buyer' | t }}</label><span>{{ inv.buyerSnapshot?.name }} <span class="mono cell-sec">{{ inv.buyerSnapshot?.taxId }}</span></span></div>
                <div class="doc-field"><label>{{ 'documents.numberMode' | t }}</label><span>{{ inv.numberMode ? ('documents.mode.' + inv.numberMode | t) : '-' }}</span></div>
                <div class="doc-field"><label>ETTN</label><span class="mono text-xs">{{ inv.ettn }}</span></div>
                <div class="doc-field"><label>{{ 'invoices.despatchRefs' | t }}</label>
                  <span class="ref-list">@for (r of inv.despatchRefs || []; track $index) { <span><a class="link mono" routerLink="/despatches" [queryParams]="{ id: r.id }">{{ r.documentNo }}</a> <span class="sec">{{ r.issueDate | appDate }}</span></span> } @empty { - }</span>
                </div>
                @if (inv.billingReferences?.length) {
                  <div class="doc-field"><label>{{ 'invoices.billingRefs' | t }}</label><span class="ref-list">@for (r of inv.billingReferences!; track $index) { <span><span class="mono">{{ r.documentNo }}</span> <span class="sec">{{ r.issueDate | appDate }}</span></span> }</span></div>
                }
              </div>
              @if (inv.status !== 'DRAFT' && inv.issuedBeforeDelivery) { <div class="doc-hint">{{ 'invoices.beforeDeliveryInfo' | t }}</div> }
            </div>
            @if (inv.replacesDespatch) { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'invoices.replacesDespatch' | t }}</span></div> }

            <div class="doc-section">
              <h4 class="doc-section-title">{{ 'invoices.lines' | t }}</h4>
              <table class="doc-table">
                <thead><tr><th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'despatches.quantity' | t }}</th><th class="num hide-xs">{{ 'invoices.unitPrice' | t }}</th><th class="num">{{ 'invoices.vat' | t }}</th><th class="num">{{ 'invoices.net' | t }}</th></tr></thead>
                <tbody>
                  @for (l of inv.lines; track l.id) {
                    <tr>
                      <td>{{ l.productName }}@if (l.withholdingCode) { <span class="line-sub">{{ 'invoices.withholding' | t }} {{ l.withholdingCode }}</span> }@if (l.returnedQuantity) { <span class="line-sub">{{ 'invoices.returnedQty' | t: { qty: (l.returnedQuantity | num) } }}</span> }</td>
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
            @if (!ui.isReadonly()) {
              @if (inv.status === 'DRAFT') {
                <button type="button" class="btn btn-danger-ghost" (click)="remove(inv)" [disabled]="busy()"><app-icon name="trash" /><span class="lbl-m">{{ 'invoices.deleteDraft' | t }}</span></button>
              } @else if (inv.status !== 'CANCELLED' && inv.status !== 'REJECTED' && inv.status !== 'QUEUED') {
                <button type="button" class="btn btn-danger-ghost" (click)="openCancel(inv)" [disabled]="busy()">{{ 'invoices.cancel' | t }}</button>
              }
            }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="print(inv)" [attr.aria-label]="'documents.print' | t"><app-icon name="printer" /><span class="lbl-m">{{ 'documents.print' | t }}</span></button>
            @if (!ui.isReadonly()) {
              @if (inv.status === 'DRAFT') {
                <button type="button" class="btn btn-primary" (click)="openIssue(inv)" [disabled]="busy()">{{ 'invoices.issue' | t }}<kbd>Ctrl ↵</kbd></button>
              } @else if (inv.status !== 'CANCELLED' && inv.status !== 'REJECTED') {
                @if (inv.kind === 'SALES') { <a class="btn" routerLink="/returns" [queryParams]="{ invoiceId: inv.id }"><app-icon name="return" />{{ 'invoices.createReturn' | t }}</a> }
              }
            }
          </div>
        </div>
      </div>
    }

    @if (issueFor(); as inv) {
      <div class="modal-backdrop" (document:keydown.escape)="busy() ? null : issueFor.set(null)">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="ivIssueTitle">
          <div class="modal-header"><h3 id="ivIssueTitle">{{ 'invoices.issueTitle' | t }}</h3></div>
          <div class="modal-b form-stack">
            @if (eDocumentMode() === 'PROVIDER') {
              <p>{{ 'invoices.issueProviderInfo' | t }}</p>
              <label class="check"><input type="checkbox" [(ngModel)]="paperFallback" />{{ 'invoices.paperFallback' | t }}</label>
              @if (paperFallback) {
                <div class="fld"><label class="fld-label" for="ivReason">{{ 'despatches.paperReason' | t }}</label>
                  <div class="field select"><select id="ivReason" [(ngModel)]="paperReason"><option value="" disabled>{{ 'despatches.selectPaperReason' | t }}</option>@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div></div>
              }
            } @else {
              <div class="fld" role="radiogroup" aria-labelledby="ivSrcLbl">
                <span class="fld-label" id="ivSrcLbl">{{ 'invoices.numberSource' | t }}</span>
                <div class="radio-stack">
                  <label class="radio"><input type="radio" name="src" value="paper" [(ngModel)]="numberSource" />{{ 'invoices.numberPaper' | t }}</label>
                  <label class="radio"><input type="radio" name="src" value="external" [(ngModel)]="numberSource" />{{ 'invoices.numberExternal' | t }}</label>
                </div>
              </div>
              @if (numberSource === 'external') {
                <div class="grid-2">
                  <div class="fld"><label class="fld-label" for="ivExt">{{ 'invoices.externalDocNo' | t }}</label><div class="field"><input id="ivExt" class="mono" maxlength="50" [(ngModel)]="externalDocNo" placeholder="GIB2026000000123" /></div></div>
                  <div class="fld"><label class="fld-label" for="ivExtDate">{{ 'invoices.externalDocDate' | t }}</label><div class="field"><input id="ivExtDate" type="date" [(ngModel)]="issueDate" /></div></div>
                </div>
              } @else {
                <div class="grid-2">
                  <div class="fld"><label class="fld-label" for="ivDate">{{ 'documents.issueDate' | t }}</label><div class="field"><input id="ivDate" type="date" [(ngModel)]="issueDate" /></div></div>
                  <div class="fld"><label class="fld-label" for="ivTime">{{ 'invoices.issueTime' | t }}</label><div class="field"><input id="ivTime" type="time" [(ngModel)]="issueTime" /></div></div>
                </div>
                <div class="fld"><label class="fld-label" for="ivPaperReason">{{ 'documents.paperReasonIfMandatory' | t }}</label>
                  <div class="field select"><select id="ivPaperReason" [(ngModel)]="paperReason"><option value="">{{ 'documents.paperReasonNone' | t }}</option>@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div>
                  <div class="fld-help">{{ 'documents.paperSeriesHint' | t }}</div>
                </div>
              }
            }
            @if (lateInfo()) {
              <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ lateInfo() }}</span></div>
              <label class="check"><input type="checkbox" [(ngModel)]="lateConfirm" />{{ 'invoices.lateConfirm' | t }}</label>
            }
            <p class="doc-hint">{{ 'invoices.issueWarning' | t }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" (click)="issueFor.set(null)" [disabled]="busy()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="issue(inv)" [disabled]="busy() || (!!lateInfo() && !lateConfirm)"><span>{{ 'invoices.issue' | t }}</span></button>
          </div>
        </div>
      </div>
    }

    @if (cancelFor(); as inv) {
      <div class="modal-backdrop" (document:keydown.escape)="busy() ? null : cancelFor.set(null)">
        <div class="modal-panel modal-panel-sm" role="dialog" aria-modal="true" aria-labelledby="ivCancelTitle">
          <div class="modal-header"><h3 id="ivCancelTitle">{{ 'invoices.cancelTitle' | t }}</h3></div>
          <div class="modal-b form-stack">
            <p>{{ 'invoices.cancelInfo' | t }}</p>
            @if (needsNotice(inv)) {
              <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'ebelge.cancel.noticeInfo' | t }}</span></div>
              <div class="grid-2">
                <div class="fld"><label class="fld-label" for="ivNch">{{ 'ebelge.cancel.channel' | t }}</label>
                  <div class="field select"><select id="ivNch" [(ngModel)]="noticeChannel">@for (c of noticeChannels; track c) { <option [value]="c">{{ 'ebelge.noticeChannel.' + c | t }}</option> }</select></div></div>
                <div class="fld"><label class="fld-label" for="ivNdate">{{ 'ebelge.cancel.date' | t }}</label><div class="field"><input id="ivNdate" type="date" [(ngModel)]="noticeDate" /></div></div>
              </div>
              <div class="fld"><label class="fld-label" for="ivNref">{{ 'ebelge.cancel.reference' | t }}</label><div class="field"><input id="ivNref" maxlength="100" [(ngModel)]="noticeRef" /></div></div>
            } @else if (inv.profileId === 'EARSIVFATURA' && inv.numberMode === 'EDOCUMENT') {
              <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'ebelge.cancel.earsivInfo' | t }}</span></div>
            }
            <div class="fld"><label class="fld-label" for="ivCancel">{{ 'documents.cancelReason' | t }} <span class="req">*</span></label><div class="field has-area"><textarea id="ivCancel" rows="3" [(ngModel)]="cancelReason"></textarea></div></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" (click)="cancelFor.set(null)">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-danger" [class.is-loading]="busy()" (click)="cancel(inv)" [disabled]="busy() || !cancelReason.trim() || (needsNotice(inv) && (!noticeChannel || !noticeDate))"><span>{{ 'invoices.cancel' | t }}</span></button>
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
  /** Human label for a GİB profile / type code (TEMELFATURA → "Temel e-Fatura"); unknown codes fall back to the raw code. */
  gib(code: string | null | undefined): string {
    if (!code) return '';
    const key = 'ebelge.gib.' + code;
    return this.i18n.has(key) ? this.i18n.t(key) : code;
  }

  route = inject(ActivatedRoute);
  router = inject(Router);

  filters = ['all', 'DRAFT', 'ISSUED', 'CANCELLED'];
  filter = signal('all');
  q = signal('');
  noticeOpen = signal(false);
  rows = signal<Invoice[]>([]);
  loading = signal(true);
  busy = signal(false);
  selected = signal<Invoice | null>(null);
  /** null until the company profile arrives, so the e-Belge-off notice never flashes for PROVIDER tenants. */
  eDocumentMode = signal<string | null>(null);
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
    const q = this.q().trim().toLocaleLowerCase();
    return this.rows().filter((i) => (f === 'all' || (f === 'ISSUED' ? !['DRAFT', 'CANCELLED'].includes(i.status) : i.status === f))
      && (!q || [i.documentNo, i.buyerSnapshot?.name, i.buyerSnapshot?.taxId].some((v) => (v || '').toLocaleLowerCase().includes(q))));
  });

  /** Esc closes the drawer unless a modal is stacked on top of it (the modal handles its own Esc). */
  closeOnEsc() {
    if (!this.issueFor() && !this.cancelFor()) this.selected.set(null);
  }

  ngOnInit() {
    this.docs.company().subscribe({ next: (c) => this.eDocumentMode.set(c.eDocumentMode || 'NONE'), error: () => this.eDocumentMode.set('NONE') });
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
