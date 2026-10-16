import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, I18nService } from '../../i18n';
import { AccountingService, InventoryList } from '../../services/accounting.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { apiError } from '../../services/documents.service';
import { Product } from '../../models/inventory.models';
import { IconComponent } from '../shared/icon.component';

type LegalTab = 'inventory' | 'ledger' | 'vat' | 'vat2' | 'impact' | 'impairment' | 'trace' | 'journal';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);

/**
 * WP6 legal outputs (VUK 274, 185-190; KDVK; Tebliğ 2026/11): inventory list at cost (as-of,
 * printable), stock card at cost, KDV / KDV-2 pre-reports, VAT-relevant movements with wastage,
 * impairment candidates, traceability & recall, journal export.
 */
@Component({
  selector: 'app-legal-reports',
  standalone: true,
  host: { '(document:click)': 'invMore.set(false)', '(document:keydown.escape)': 'invMore.set(false)' },
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, UnitLabelPipe, IconComponent],
  styleUrls: ['../documents/documents.css'],
  styles: [`
    :host { display: flex; flex-direction: column; gap: 12px; }
    .lr-tabs { align-self: flex-start; }
    .lr-tabs button { flex: none; }
    .lr-bar { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 12px 16px; }
    .lr-bar .fld { width: 176px; }
    .lr-bar .fld.wide { width: 320px; max-width: 100%; }
    .lr-bar .acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .lr-bar .spacer { flex: 1; }
    .lr-more { position: relative; display: none; }
    .lr-more-pop { top: calc(100% + 4px); left: 0; min-width: 240px; }
    .lr-kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .lr-kpis .kpi { gap: 6px; }
    .kpi-val.txt b { font-size: var(--text-md); letter-spacing: -0.006em; line-height: 1.35; white-space: normal; }
    .kpi-val.muted b { color: var(--fg-3); }
    .kpi-val b.mono { font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 500; overflow-wrap: anywhere; }
    .lr-note { font-size: var(--text-xs); color: var(--fg-3); line-height: 1.5; }
    .ch2 { min-height: 48px; flex-wrap: wrap; row-gap: 4px; padding-block: 8px; }
    .lr-list { list-style: none; margin: 0; padding: 0; }
    .lr-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 10px 16px; font-size: var(--text-sm); color: var(--fg-2); box-shadow: inset 0 -1px 0 var(--line); }
    .lr-list li:last-child { box-shadow: none; }
    .lr-list .mono { font-size: var(--text-xs); color: var(--fg); }
    .lr-list .sep { color: var(--fg-3); }
    .lr-list .spacer { flex: 1; }
    .lr-cust { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
    .lr-cust .mono { font-size: var(--text-xs); }
    .notice .t b { font-weight: 600; }
    .notice > app-icon { display: inline-flex; flex: none; color: var(--tone); }
    .notice.top { align-items: flex-start; }
    .notice.top > app-icon { margin-top: 2px; }
    .card.flush { padding: 0; gap: 0; }
    .q-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
    .q-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    .q-row .spacer { flex: 1; }
    .recall-f { display: flex; flex-direction: column; gap: 10px; }
    .recall-f .fld { max-width: 480px; }
    .ministry { display: inline-flex; align-items: center; gap: 8px; }
    .ministry .field { width: 200px; }
    .tbl td.wrap { white-space: normal; }
    td .sec { color: var(--fg-3); margin-left: 6px; }
    td.w-check { width: 40px; }
    .empty-row td { padding: 0 !important; height: auto; }
    .empty-row td::before { display: none !important; }
    .empty-row:hover td { background: transparent; }
    .empty-row .empty-state { padding: 28px 16px; }
    @media (max-width: 640px) {
      .table-responsive td { justify-content: flex-end; gap: 6px; }
      .table-responsive td[data-label]::before { margin-right: auto; }
      .table-responsive .empty-row td { display: block; text-align: center; }
      .lr-tabs { align-self: stretch; }
      .lr-bar { padding: 12px; }
      .lr-bar .fld, .lr-bar .fld.wide { width: 100%; }
      .lr-bar .spacer { display: none; }
      /* Inventory list: Apply · "…" (XLSX, summary) · full-width primary on one row. */
      .lr-inv .lr-wide { display: none; }
      .lr-inv .lr-more { display: inline-flex; }
      .lr-inv .acts { flex: 1 1 0; min-width: 0; flex-wrap: nowrap; }
      .lr-inv .acts > .btn-primary { flex: 1 1 auto; min-width: 0; }
      .lr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .lr-kpis > .kpi:last-child:nth-child(odd) { grid-column: 1 / -1; }
      .ministry { flex-wrap: wrap; }
      .lr-cust { align-items: flex-end; }
    }
  `],
  template: `
    <div class="seg lr-tabs" role="tablist">
      @for (t of tabs; track t) {
        <button type="button" role="tab" [attr.aria-pressed]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ 'accounting.tab.' + t | t }}</button>
      }
    </div>

    @if (error()) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }

    <!-- Inventory list (as-of) -->
    @if (tab() === 'inventory') {
      <div class="card lr-bar lr-inv">
        <div class="fld"><label class="fld-label" for="lrAsOf">{{ 'accounting.asOf' | t }}</label>
          <div class="field"><input id="lrAsOf" type="date" [(ngModel)]="asOf" /></div></div>
        <div class="fld"><label class="fld-label" for="lrBd">{{ 'accounting.breakdown' | t }}</label>
          <div class="field select"><select id="lrBd" [(ngModel)]="breakdown"><option value="product">{{ 'accounting.breakdown.product' | t }}</option><option value="warehouse">{{ 'accounting.breakdown.warehouse' | t }}</option><option value="lot">{{ 'accounting.breakdown.lot' | t }}</option></select></div></div>
        <button type="button" class="btn" (click)="loadInventory()">{{ 'reports.apply' | t }}</button>
        <span class="spacer"></span>
        <div class="acts">
          <button type="button" class="btn btn-ghost lr-wide" (click)="api.download('reports/e-envanter', { asOf, format: 'xlsx' }, 'e-envanter.xlsx')"><app-icon name="download" />{{ 'accounting.eEnvanterXlsx' | t }}</button>
          <button type="button" class="btn lr-wide" (click)="api.openPrintable('reports/inventory-summary', { asOf, format: 'html' })"><app-icon name="file" />{{ 'accounting.summaryPdf' | t }}</button>
          <span class="lr-more">
            <button type="button" class="btn btn-icon" [class.is-active]="invMore()" aria-haspopup="menu" [attr.aria-expanded]="invMore()" [attr.aria-label]="'reports.moreActions' | t" (click)="invMore.set(!invMore()); $event.stopPropagation()"><app-icon name="more" /></button>
            @if (invMore()) {
              <div class="pop lr-more-pop" role="menu">
                <button type="button" class="menu-i" role="menuitem" (click)="invMore.set(false); api.download('reports/e-envanter', { asOf, format: 'xlsx' }, 'e-envanter.xlsx')"><app-icon name="download" />{{ 'accounting.eEnvanterXlsx' | t }}</button>
                <button type="button" class="menu-i" role="menuitem" (click)="invMore.set(false); api.openPrintable('reports/inventory-summary', { asOf, format: 'html' })"><app-icon name="file" />{{ 'accounting.summaryPdf' | t }}</button>
              </div>
            }
          </span>
          <button type="button" class="btn btn-primary" (click)="api.openPrintable('reports/inventory-list', { asOf, breakdown: breakdown === 'product' ? 'lot' : breakdown, format: 'html' })"><app-icon name="printer" />{{ 'accounting.printPdf' | t }}</button>
        </div>
      </div>
      @if (inv(); as d) {
        <div class="kpi-grid lr-kpis">
          <div class="kpi"><div class="kpi-top">{{ 'reports.costValue' | t }}</div><div class="kpi-val"><b>{{ d.totals.costValue | money: d.currency }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'reports.salesValue' | t }}</div><div class="kpi-val muted"><b>{{ d.totals.salesValue | money: d.currency }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.method' | t }}</div><div class="kpi-val txt"><b>{{ 'settings.costing.' + d.method | t }}</b></div></div>
          <div class="kpi" [class.is-alert]="d.countPolicy.overdue"><div class="kpi-top">@if (d.countPolicy.overdue) { <app-icon name="warn" size="sm" /> }{{ 'accounting.lastCount' | t }}</div><div class="kpi-val txt"><b>{{ d.countPolicy.lastPhysicalCountDate ? (d.countPolicy.lastPhysicalCountDate | appDate) : '-' }}</b></div>
            @if (d.countPolicy.overdue) { <div class="kpi-foot"><span class="badge badge-warning"><span class="dot"></span>{{ 'accounting.countOverdue' | t }}</span></div> }</div>
        </div>
        <p class="lr-note">{{ 'accounting.salesValueNote' | t }}</p>
        @if (d.costMissing) { <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'accounting.costMissing' | t }}</span></div> }
        <section class="card"><div class="table-scroll">
          <table class="tbl table-responsive">
            <thead><tr><th>{{ 'accounting.col.account' | t }}</th><th>{{ 'accounting.col.product' | t }}</th>
              @if (breakdown !== 'product') { <th>{{ 'accounting.col.warehouse' | t }}</th> } @if (breakdown === 'lot') { <th>{{ 'accounting.col.lot' | t }}</th> }
              <th class="r">{{ 'accounting.col.qty' | t }}</th><th class="r">{{ 'accounting.col.unitCost' | t }}</th><th class="r">{{ 'reports.costValue' | t }}</th></tr></thead>
            <tbody>
              @for (r of d.rows; track $index) {
                <tr>
                  <td class="mono" [attr.data-label]="'accounting.col.account' | t"><span class="tag">{{ account(r.inventoryClass) }}</span></td>
                  <td class="td-primary"><div class="cell-prod"><b>{{ r.productName }}</b><span class="cell-code">{{ r.sku }}</span></div></td>
                  @if (breakdown !== 'product') { <td [attr.data-label]="'accounting.col.warehouse' | t">{{ r.warehouseName }}</td> }
                  @if (breakdown === 'lot') { <td [attr.data-label]="'accounting.col.lot' | t"><span class="mono">{{ r.lotNumber }}</span>@if (r.expiryDate) { <span class="sec">{{ r.expiryDate | appDate }}</span> }</td> }
                  <td class="r" [attr.data-label]="'accounting.col.qty' | t">{{ r.quantity | num }} <span class="sec">{{ r.unitCode | unitLabel }}</span></td>
                  <td class="r" [attr.data-label]="'accounting.col.unitCost' | t">{{ r.unitCost | money: d.currency }}</td>
                  <td class="r" [attr.data-label]="'reports.costValue' | t"><strong>{{ r.costValue | money: d.currency }}</strong></td>
                </tr>
              }
              @if (!d.rows.length) { <tr class="empty-row"><td colspan="7"><div class="empty-state"><div class="empty-art"><app-icon name="box" /></div><p>{{ 'common.noData' | t }}</p></div></td></tr> }
            </tbody>
          </table>
        </div></section>
      }
    }

    <!-- Stock card at cost -->
    @if (tab() === 'ledger') {
      <div class="card lr-bar">
        <div class="fld wide"><label class="fld-label" for="lrProd">{{ 'accounting.col.product' | t }}</label>
          <div class="field select"><select id="lrProd" [(ngModel)]="ledgerProduct"><option value="" disabled>{{ 'accounting.col.product' | t }}</option>@for (p of products(); track p.id) { <option [value]="p.id">{{ p.sku }} · {{ p.name }}</option> }</select></div></div>
        <div class="fld"><label class="fld-label" for="lrFrom">{{ 'reports.startDate' | t }}</label><div class="field"><input id="lrFrom" type="date" [(ngModel)]="from" /></div></div>
        <div class="fld"><label class="fld-label" for="lrTo">{{ 'reports.endDate' | t }}</label><div class="field"><input id="lrTo" type="date" [(ngModel)]="to" /></div></div>
        <button type="button" class="btn btn-primary" [disabled]="!ledgerProduct" (click)="loadLedger()">{{ 'reports.apply' | t }}</button>
      </div>
      @if (ledger(); as l) {
        <div class="kpi-grid lr-kpis">
          <div class="kpi"><div class="kpi-top">{{ 'accounting.opening' | t }}</div><div class="kpi-val"><b>{{ l.opening.costValue | money: l.currency }}</b></div><div class="kpi-foot"><span>{{ 'accounting.col.qty' | t }} {{ l.opening.quantity | num }}</span></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.closing' | t }}</div><div class="kpi-val"><b>{{ l.closing.costValue | money: l.currency }}</b></div><div class="kpi-foot"><span>{{ 'accounting.col.qty' | t }} {{ l.closing.quantity | num }}</span></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.method' | t }}</div><div class="kpi-val txt"><b>{{ 'settings.costing.' + l.method | t }}</b></div></div>
        </div>
        <section class="card"><div class="table-scroll"><table class="tbl table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.reason' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.col.warehouse' | t }}</th><th class="r">{{ 'accounting.col.qty' | t }}</th><th class="r">{{ 'accounting.col.unitCost' | t }}</th><th class="r">{{ 'accounting.col.totalCost' | t }}</th><th class="r">{{ 'accounting.col.balance' | t }}</th></tr></thead>
          <tbody>
            @for (m of l.lines; track m.id) {
              <tr>
                <td [attr.data-label]="'accounting.col.date' | t">{{ m.date | appDate }}</td>
                <td [attr.data-label]="'accounting.col.reason' | t">{{ 'stockMovements.reason.' + m.reasonCode | t }} @if (m.costSource === 'MISSING' || m.costSource === 'FALLBACK' || m.costSource === 'ESTIMATE') { <span class="badge badge-warning"><span class="dot"></span>{{ 'accounting.costSource.' + m.costSource | t }}</span> }</td>
                <td class="mono" [attr.data-label]="'accounting.col.document' | t">{{ m.documentNo }}</td>
                <td [attr.data-label]="'accounting.col.warehouse' | t">{{ m.warehouseName }} @if (m.lotNumber) { <span class="sec mono">{{ m.lotNumber }}</span> }</td>
                <td class="r" [attr.data-label]="'accounting.col.qty' | t">{{ m.quantity | num }}</td>
                <td class="r" [attr.data-label]="'accounting.col.unitCost' | t">{{ m.unitCost === null ? '-' : (m.unitCost | money: l.currency) }}</td>
                <td class="r" [attr.data-label]="'accounting.col.totalCost' | t">{{ m.totalCost === null ? '-' : (m.totalCost | money: l.currency) }}</td>
                <td class="r" [attr.data-label]="'accounting.col.balance' | t">{{ m.balanceQuantity | num }} <span class="sec">{{ m.balanceValue | money: l.currency }}</span></td>
              </tr>
            }
            @if (!l.lines.length) { <tr class="empty-row"><td colspan="8"><div class="empty-state"><div class="empty-art"><app-icon name="rows" /></div><p>{{ 'common.noData' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></section>
      }
    }

    <!-- KDV pre-report -->
    @if (tab() === 'vat') {
      <div class="card lr-bar">
        <div class="fld"><label class="fld-label" for="lrPer">{{ 'accounting.period' | t }}</label><div class="field"><input id="lrPer" type="month" [(ngModel)]="period" /></div></div>
        <button type="button" class="btn" (click)="loadVat()">{{ 'reports.apply' | t }}</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-primary" (click)="api.openPrintable('reports/vat', { period, format: 'html' })"><app-icon name="printer" />{{ 'accounting.printPdf' | t }}</button>
      </div>
      @if (vat(); as v) {
        <div class="notice notice-danger"><app-icon name="alert" /><span class="t"><b>{{ 'accounting.preReport' | t }}</b></span></div>
        <div class="kpi-grid lr-kpis">
          <div class="kpi"><div class="kpi-top">{{ 'accounting.vat.computed' | t }}</div><div class="kpi-val"><b>{{ v.summary.computedVat | money: 'TRY' }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.vat.deductible' | t }}</div><div class="kpi-val"><b>{{ v.summary.deductibleVat | money: 'TRY' }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ (v.summary.payable >= 0 ? 'accounting.vat.payable' : 'accounting.vat.carried') | t }}</div><div class="kpi-val"><b>{{ abs(v.summary.payable) | money: 'TRY' }}</b></div></div>
          <div class="kpi"><div class="kpi-top"><app-icon name="calendar" size="sm" />{{ 'accounting.vat.due' | t }}</div><div class="kpi-val txt"><b>KDV-1 · {{ v.kdv1Due | appDate }}</b></div><div class="kpi-foot"><span>KDV-2 · {{ v.kdv2Due | appDate }}</span></div></div>
        </div>
        <p class="lr-note">{{ 'accounting.vat.reconciled' | t: { count: v.reconciliation.invoices, base: (v.reconciliation.invoiceSubtotalTry | money: 'TRY'), tax: (v.reconciliation.invoiceTaxTotalTry | money: 'TRY') } }}</p>
        <section class="card"><div class="card-h"><h3>{{ 'accounting.vat.sales' | t }}</h3></div>
          <ng-container *ngTemplateOutlet="groupsTpl; context: { $implicit: v.sales.groups }"></ng-container></section>
        @if (v.salesReturns.groups.length) { <section class="card"><div class="card-h"><h3>{{ 'accounting.vat.salesReturns' | t }}</h3></div><ng-container *ngTemplateOutlet="groupsTpl; context: { $implicit: v.salesReturns.groups }"></ng-container></section> }
        @if (v.purchaseReturns.groups.length) { <section class="card"><div class="card-h"><h3>{{ 'accounting.vat.purchaseReturns' | t }}</h3></div><ng-container *ngTemplateOutlet="groupsTpl; context: { $implicit: v.purchaseReturns.groups }"></ng-container></section> }
        <section class="card"><div class="card-h"><h3>{{ 'accounting.vat.deductibleList' | t }}</h3></div>
          <ng-container *ngTemplateOutlet="docsTpl; context: { $implicit: v.deductible.documents }"></ng-container></section>
        <section class="card"><div class="card-h"><h3>{{ 'accounting.vat.imports' | t }}</h3></div>
          <ng-container *ngTemplateOutlet="docsTpl; context: { $implicit: v.imports.documents }"></ng-container></section>
      }
    }

    <!-- KDV-2 -->
    @if (tab() === 'vat2') {
      <div class="card lr-bar">
        <div class="fld"><label class="fld-label" for="lrPer2">{{ 'accounting.period' | t }}</label><div class="field"><input id="lrPer2" type="month" [(ngModel)]="period" /></div></div>
        <button type="button" class="btn btn-primary" (click)="loadVat2()">{{ 'reports.apply' | t }}</button>
      </div>
      @if (vat2(); as v) {
        <div class="notice notice-danger"><app-icon name="alert" /><span class="t"><b>{{ 'accounting.preReport' | t }}</b></span></div>
        <div class="kpi-grid lr-kpis">
          <div class="kpi"><div class="kpi-top">{{ 'accounting.vat.withheldTotal' | t }}</div><div class="kpi-val"><b>{{ v.totals.withheld | money: 'TRY' }}</b></div></div>
          <div class="kpi"><div class="kpi-top"><app-icon name="calendar" size="sm" />{{ 'accounting.vat.due' | t }}</div><div class="kpi-val txt"><b>{{ v.kdv2Due | appDate }}</b></div></div>
        </div>
        <section class="card"><div class="table-scroll"><table class="tbl table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.col.party' | t }}</th><th>{{ 'accounting.col.code' | t }}</th><th class="r">{{ 'accounting.col.base' | t }}</th><th class="r">{{ 'accounting.col.vat' | t }}</th><th class="r">{{ 'accounting.col.withheld' | t }}</th></tr></thead>
          <tbody>
            @for (r of v.rows; track $index) {
              <tr><td [attr.data-label]="'accounting.col.date' | t">{{ r.documentDate | appDate }}</td><td class="mono" [attr.data-label]="'accounting.col.document' | t">{{ r.documentNo }}</td><td [attr.data-label]="'accounting.col.party' | t">{{ r.partyName }} <span class="sec mono">{{ r.partyTaxId }}</span></td>
                <td [attr.data-label]="'accounting.col.code' | t">{{ r.reverseCharge ? ('accounting.vat.reverseCharge' | t) : r.withholdingCode }} {{ r.withholdingRate }}</td><td class="r" [attr.data-label]="'accounting.col.base' | t">{{ r.base | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.vat' | t">{{ r.tax | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.withheld' | t"><strong>{{ r.withheld | money: 'TRY' }}</strong></td></tr>
            }
            @if (!v.rows.length) { <tr class="empty-row"><td colspan="7"><div class="empty-state"><div class="empty-art"><app-icon name="receipt" /></div><p>{{ 'common.noData' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></section>
        <p class="lr-note">{{ 'accounting.vat.kdv2Basis' | t }}</p>
        @for (w of v.warnings || []; track $index) {
          <div class="notice notice-warning" role="status"><app-icon name="warn" /><span class="t">{{ 'accounting.vat.poWithholdingNotOnInvoice' | t: { po: w.poNumber, doc: w.documentNo, code: w.withholdingCode, amount: (w.expectedWithheld | money: 'TRY') } }}</span></div>
        }
      }
    }

    <!-- VAT-relevant movements + wastage -->
    @if (tab() === 'impact') {
      <div class="card lr-bar">
        <div class="fld"><label class="fld-label" for="lrPer3">{{ 'accounting.period' | t }}</label><div class="field"><input id="lrPer3" type="month" [(ngModel)]="period" /></div></div>
        <button type="button" class="btn btn-primary" (click)="loadImpact()">{{ 'reports.apply' | t }}</button>
      </div>
      @if (impact(); as v) {
        <div class="notice notice-danger"><app-icon name="alert" /><span class="t"><b>{{ 'accounting.preReport' | t }}</b></span></div>
        <section class="card"><div class="card-h"><h3>{{ 'accounting.impact.deemed' | t }}</h3></div><div class="table-scroll"><table class="tbl table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.reason' | t }}</th><th class="r">{{ 'accounting.col.qty' | t }}</th><th class="r">{{ 'reports.costValue' | t }}</th><th class="r">{{ 'accounting.impact.emsal' | t }}</th><th class="r">{{ 'accounting.col.vat' | t }}</th></tr></thead>
          <tbody>@for (r of v.deemedSupplies; track $index) { <tr><td [attr.data-label]="'accounting.col.date' | t">{{ r.date | appDate }}</td><td class="td-primary">{{ r.productName }}</td><td [attr.data-label]="'accounting.col.reason' | t">{{ 'stockMovements.reason.' + r.reasonCode | t }}</td><td class="r" [attr.data-label]="'accounting.col.qty' | t">{{ r.quantity | num }}</td><td class="r" [attr.data-label]="'reports.costValue' | t">{{ r.costValue | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.impact.emsal' | t">{{ r.emsalValue | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.vat' | t">{{ r.vat | money: 'TRY' }}</td></tr> }
            @if (!v.deemedSupplies.length) { <tr class="empty-row"><td colspan="7"><div class="empty-state"><p>{{ 'common.noData' | t }}</p></div></td></tr> }</tbody>
        </table></div></section>
        <section class="card"><div class="card-h"><h3>{{ 'accounting.impact.corrections' | t }}</h3></div><div class="table-scroll"><table class="tbl table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.reason' | t }}</th><th class="r">{{ 'accounting.col.qty' | t }}</th><th class="r">{{ 'reports.costValue' | t }}</th><th class="r">{{ 'accounting.impact.vatToCorrect' | t }}</th></tr></thead>
          <tbody>@for (r of v.vatCorrections; track $index) { <tr><td [attr.data-label]="'accounting.col.date' | t">{{ r.date | appDate }}</td><td class="td-primary">{{ r.productName }}</td><td [attr.data-label]="'accounting.col.reason' | t">{{ (r.reasonCode === 'WASTAGE_ABNORMAL' ? 'accounting.impact.abnormal' : 'stockMovements.reason.' + r.reasonCode) | t }}</td><td class="r" [attr.data-label]="'accounting.col.qty' | t">{{ r.quantity | num }}</td><td class="r" [attr.data-label]="'reports.costValue' | t">{{ r.costValue | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.impact.vatToCorrect' | t"><strong>{{ r.vatToCorrect | money: 'TRY' }}</strong></td></tr> }
            @if (!v.vatCorrections.length) { <tr class="empty-row"><td colspan="6"><div class="empty-state"><p>{{ 'common.noData' | t }}</p></div></td></tr> }</tbody>
        </table></div></section>
        @if (v.excluded.length) { <p class="lr-note">{{ 'accounting.impact.excluded' | t: { count: v.excluded.length } }}</p> }
        @if (wastage(); as w) {
          <section class="card"><div class="card-h"><h3>{{ 'accounting.wastage.title' | t }}</h3></div><div class="table-scroll"><table class="tbl table-responsive">
            <thead><tr><th>{{ 'accounting.col.product' | t }}</th><th class="r">{{ 'accounting.wastage.throughput' | t }}</th><th class="r">{{ 'accounting.wastage.rate' | t }}</th><th class="r">{{ 'accounting.wastage.actual' | t }}</th><th class="r">{{ 'accounting.wastage.allowed' | t }}</th><th class="r">{{ 'accounting.wastage.abnormal' | t }}</th><th>{{ 'accounting.wastage.source' | t }}</th></tr></thead>
            <tbody>@for (r of w.rows; track r.productId) { <tr><td class="td-primary">{{ r.productName }}</td><td class="r" [attr.data-label]="'accounting.wastage.throughput' | t">{{ r.throughput | num }}</td><td class="r" [attr.data-label]="'accounting.wastage.rate' | t">{{ r.normalRatePct === null ? '-' : '%' + (r.normalRatePct | num) }}</td><td class="r" [attr.data-label]="'accounting.wastage.actual' | t">{{ r.wastedQuantity | num }} <span class="sec">({{ r.actualRatePct === null ? '-' : '%' + (r.actualRatePct | num) }})</span></td><td class="r" [attr.data-label]="'accounting.wastage.allowed' | t">{{ r.allowedQuantity | num }}</td><td class="r" [attr.data-label]="'accounting.wastage.abnormal' | t">@if (r.abnormalQuantity > 0) { <span class="badge badge-warning"><span class="dot"></span>{{ r.abnormalQuantity | num }}</span> } @else { 0 }</td><td class="sec" [attr.data-label]="'accounting.wastage.source' | t">{{ r.rateSource }}</td></tr> }
              @if (!w.rows.length) { <tr class="empty-row"><td colspan="7"><div class="empty-state"><p>{{ 'common.noData' | t }}</p></div></td></tr> }</tbody>
          </table></div></section>
        }
      }
    }

    <!-- Impairment candidates -->
    @if (tab() === 'impairment') {
      <div class="card lr-bar">
        <div class="fld"><label class="fld-label" for="lrImpD">{{ 'accounting.valuationDate' | t }}</label><div class="field"><input id="lrImpD" type="date" [(ngModel)]="impDate" /></div></div>
        <button type="button" class="btn" (click)="loadImpairment()">{{ 'reports.apply' | t }}</button>
        <span class="spacer"></span>
        <div class="acts">
          <button type="button" class="btn btn-ghost" (click)="api.openPrintable('impairment/sheet', { date: impDate })"><app-icon name="printer" />{{ 'accounting.impairment.sheet' | t }}</button>
          @if (isAdmin()) { <button type="button" class="btn btn-primary" [disabled]="!selectedImp().length" (click)="postImpairment()">{{ 'accounting.impairment.post' | t: { count: selectedImp().length } }}</button> }
        </div>
      </div>
      @if (imp(); as d) {
        <p class="lr-note">{{ 'accounting.impairment.rule' | t: { decline: d.thresholds.minDeclinePct, sales: d.thresholds.minMonthlySalesPct } }}</p>
        <section class="card"><div class="table-scroll"><table class="tbl table-responsive">
          <thead><tr><th class="w-check"></th><th>{{ 'accounting.col.product' | t }}</th><th class="r">{{ 'accounting.col.qty' | t }}</th><th class="r">{{ 'accounting.col.unitCost' | t }}</th><th>{{ 'accounting.impairment.basis' | t }}</th><th class="r">{{ 'accounting.impairment.emsal' | t }}</th><th class="r">{{ 'accounting.impairment.decline' | t }}</th><th class="r">{{ 'accounting.impairment.taxValue' | t }}</th><th class="r">{{ 'accounting.impairment.provision' | t }}</th></tr></thead>
          <tbody>
            @for (r of d.rows; track r.productId) {
              <tr [class.is-selected]="selectedImp().includes(r.productId)">
                <td class="w-check"><input type="checkbox" [disabled]="!r.qualifies && !r.requiresCommission" [checked]="selectedImp().includes(r.productId)" (change)="toggleImp(r.productId)" [attr.aria-label]="r.productName" /></td>
                <td class="td-primary">{{ r.productName }}</td><td class="r" [attr.data-label]="'accounting.col.qty' | t">{{ r.quantity | num }}</td><td class="r" [attr.data-label]="'accounting.col.unitCost' | t">{{ r.unitCost | money: d.currency }}</td>
                <td class="wrap" [attr.data-label]="'accounting.impairment.basis' | t">{{ 'accounting.impairment.basis.' + r.emsalBasis | t }} @if (r.emsalMonth) { <span class="sec">({{ r.emsalMonth }})</span> }
                  @if (r.qualifies) { <span class="badge badge-warning"><span class="dot"></span>{{ 'accounting.impairment.candidate' | t }}</span> } @if (r.requiresCommission) { <span class="badge badge-neutral"><span class="dot"></span>{{ 'accounting.impairment.commission' | t }}</span> @if (r.indication) { <span class="sec">{{ 'accounting.impairment.indication.' + r.indication | t }}</span> } }</td>
                <td class="r" [attr.data-label]="'accounting.impairment.emsal' | t">{{ r.emsalUnitPrice === null ? '-' : (r.emsalUnitPrice | money: d.currency) }}</td>
                <td class="r" [attr.data-label]="'accounting.impairment.decline' | t">{{ r.declinePct === null ? '-' : '%' + (r.declinePct | num) }}</td>
                <td class="r" [attr.data-label]="'accounting.impairment.taxValue' | t">{{ r.taxValue | money: d.currency }}</td><td class="r" [attr.data-label]="'accounting.impairment.provision' | t"><strong>{{ r.provision | money: d.currency }}</strong></td>
              </tr>
            }
            @if (!d.rows.length) { <tr class="empty-row"><td colspan="9"><div class="empty-state"><div class="empty-art"><app-icon name="down" /></div><p>{{ 'common.noData' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></section>
      }
    }

    <!-- Traceability & recall -->
    @if (tab() === 'trace') {
      <div class="card lr-bar">
        <div class="fld wide"><label class="fld-label" for="lrLot">{{ 'accounting.trace.lotOrSerial' | t }}</label>
          <div class="field"><span class="lead"><app-icon name="search" size="sm" /></span><input id="lrLot" class="mono" [(ngModel)]="traceQ" (keyup.enter)="loadTrace()" [placeholder]="'accounting.trace.placeholder' | t" /></div></div>
        <button type="button" class="btn btn-primary" [disabled]="!traceQ.trim()" (click)="loadTrace()">{{ 'accounting.trace.search' | t }}</button>
      </div>
      @if (quarantine()?.items?.length) {
        <div class="notice notice-warning top">
          <app-icon name="warn" />
          <div class="t">
            <b>{{ 'accounting.quarantine.title' | t: { count: quarantine().items.length } }}</b>
            <div class="q-list">
              @for (q of quarantine().items; track q.lotId) {
                <div class="q-row">
                  <span>{{ q.productName }}</span><span class="mono">{{ q.lotNumber }}</span><span>{{ q.quantity | num }}</span><span class="sec">{{ q.warehouseName }}</span>
                  <span class="badge badge-warning"><span class="dot"></span>{{ 'accounting.quarantine.reason.' + q.reason | t }}</span>
                  <span class="spacer"></span>
                  @if (!ui.isReadonly() && quarantine().quarantineWarehouseId) { <button type="button" class="btn btn-sm" (click)="toQuarantine(q)">{{ 'accounting.quarantine.move' | t }}</button> }
                </div>
              }
            </div>
          </div>
        </div>
      }
      @if (trace(); as t) {
        <div class="kpi-grid lr-kpis">
          <div class="kpi"><div class="kpi-top">{{ 'accounting.col.product' | t }}</div><div class="kpi-val txt"><b>{{ t.product.name }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.trace.inStock' | t }}</div><div class="kpi-val"><b>{{ t.inStock | num }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.trace.customers' | t }}</div><div class="kpi-val"><b>{{ t.customers.length | num }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.trace.retainUntil' | t }}</div><div class="kpi-val txt"><b>{{ t.retainUntil ? (t.retainUntil | appDate) : '-' }}</b></div></div>
        </div>
        @if (t.lots.length) {
          <section class="card flush"><ul class="lr-list">
            @for (l of t.lots; track l.id) {
              <li><b>{{ l.warehouseName }}</b><span>{{ l.quantity | num }}</span><span class="sep">·</span><span>{{ 'accounting.trace.expiry' | t }} {{ l.expiryDate | appDate }}</span>@if (l.productionDate) { <span class="sep">·</span><span>{{ 'accounting.trace.production' | t }} {{ l.productionDate | appDate }}</span> }@if (l.supplierLotNumber) { <span class="sep">·</span><span>{{ 'accounting.trace.supplierLot' | t }} <span class="mono">{{ l.supplierLotNumber }}</span></span> }
                <span class="spacer"></span><span class="badge" [class.badge-success]="l.status === 'active'" [class.badge-danger]="l.status !== 'active'"><span class="dot"></span>{{ 'accounting.lotStatus.' + l.status | t }}</span></li>
            }
          </ul></section>
        }
        <section class="card"><div class="card-h"><h3>{{ 'reports.recall' | t }}: {{ 'accounting.trace.customers' | t }}</h3></div><div class="table-scroll"><table class="tbl table-responsive">
          <thead><tr><th>{{ 'accounting.col.party' | t }}</th><th class="r">{{ 'accounting.col.document' | t }}</th><th class="r">{{ 'accounting.trace.shipped' | t }}</th><th class="r">{{ 'accounting.trace.returned' | t }}</th><th class="r">{{ 'accounting.trace.net' | t }}</th></tr></thead>
          <tbody>
            @for (c of t.customers; track $index) {
              <tr><td class="td-primary">{{ c.partyName }} <span class="sec mono">{{ c.partyTaxId }}</span></td>
                <td class="r" [attr.data-label]="'accounting.col.document' | t"><div class="lr-cust">@for (d of c.documents; track $index) { <span><span class="mono">{{ d.documentNo }}</span> <span class="sec">{{ d.documentDate | appDate }} · {{ d.quantity | num }}</span></span> }</div></td>
                <td class="r" [attr.data-label]="'accounting.trace.shipped' | t">{{ c.shipped | num }}</td><td class="r" [attr.data-label]="'accounting.trace.returned' | t">{{ c.returned | num }}</td><td class="r" [attr.data-label]="'accounting.trace.net' | t"><strong>{{ c.net | num }}</strong></td></tr>
            }
            @if (!t.customers.length) { <tr class="empty-row"><td colspan="5"><div class="empty-state"><div class="empty-art"><app-icon name="users" /></div><p>{{ 'accounting.trace.noCustomers' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></section>
        <section class="card"><div class="card-h"><h3>{{ 'accounting.trace.suppliers' | t }}</h3></div>
          @if (t.suppliers.length) {
            <ul class="lr-list">@for (s of t.suppliers; track $index) { <li><b>{{ s.partyName }}</b><span class="mono">{{ s.partyTaxId }}</span><span class="spacer"></span><span class="mono">{{ s.documentNo }}</span><span class="sep">·</span><span>{{ s.documentDate | appDate }}</span><span class="sep">·</span><span>{{ s.quantity | num }}</span></li> }</ul>
          } @else { <div class="empty-state"><p>{{ 'common.noData' | t }}</p></div> }
        </section>
        @if (t.lotNumber && !ui.isReadonly()) {
          <section class="card">
            <div class="card-h"><h3>{{ 'reports.recall' | t }}</h3></div>
            <div class="card-b recall-f">
              <div class="fld"><label class="fld-label" for="lrRr">{{ 'accounting.recall.reason' | t }}</label><div class="field"><input id="lrRr" [(ngModel)]="recallReason" /></div><div class="fld-help">{{ 'accounting.recall.hint' | t }}</div></div>
              <div class="cluster">
                <button type="button" class="btn btn-danger-outline" [disabled]="!recallReason.trim() || busy()" (click)="startRecall(t, false)">{{ 'accounting.recall.start' | t }}</button>
                <button type="button" class="btn" [disabled]="!recallReason.trim() || busy()" (click)="startRecall(t, true)">{{ 'accounting.recall.mock' | t }}</button>
              </div>
            </div>
          </section>
        }
        @if (t.recalls.length) {
          <section class="card"><div class="card-h"><h3>{{ 'accounting.recall.records' | t }}</h3></div>
            <ul class="lr-list">
              @for (r of t.recalls; track r.id) {
                <li><span class="mono">{{ r.recallNo }}</span>
                  <span class="badge" [class.badge-neutral]="r.isMock" [class.badge-danger]="!r.isMock"><span class="dot"></span>{{ r.isMock ? ('accounting.recall.mockBadge' | t) : ('accounting.recall.realBadge' | t) }}</span>
                  <span>{{ 'accounting.recall.status.' + r.status | t }}</span><span class="sep">·</span><span>{{ r.createdAt | appDate }}</span>
                  @if (r.ministryNotifiedAt) { <span class="sep">·</span><span>{{ 'accounting.recall.ministryAt' | t }} {{ r.ministryNotifiedAt | appDate }}</span> }
                  @if (!r.isMock && r.status === 'OPEN' && !ui.isReadonly()) {
                    <span class="spacer"></span>
                    <span class="ministry">
                      <span class="field field-sm"><input [(ngModel)]="ministryRef" [placeholder]="'accounting.recall.ministryRef' | t" [attr.aria-label]="'accounting.recall.ministryRef' | t" /></span>
                      <button type="button" class="btn btn-sm" (click)="ministry(r)">{{ 'accounting.recall.ministryNotified' | t }}</button>
                    </span>
                  }
                </li>
              }
            </ul>
          </section>
        }
      }
      @if (mock(); as ms) { <p class="lr-note">{{ 'accounting.recall.mockStatus' | t: { last: ms.lastMockRecall ? (ms.lastMockRecall | appDate) : '-', due: ms.dueBy ? (ms.dueBy | appDate) : '-' } }} @if (ms.overdue) { <span class="badge badge-warning"><span class="dot"></span>{{ 'accounting.recall.mockOverdue' | t }}</span> }</p> }
    }

    <!-- Journal export -->
    @if (tab() === 'journal') {
      <div class="card lr-bar">
        <div class="fld"><label class="fld-label" for="lrJf">{{ 'reports.startDate' | t }}</label><div class="field"><input id="lrJf" type="date" [(ngModel)]="jFrom" /></div></div>
        <div class="fld"><label class="fld-label" for="lrJt">{{ 'reports.endDate' | t }}</label><div class="field"><input id="lrJt" type="date" [(ngModel)]="jTo" /></div></div>
        <div class="fld"><label class="fld-label" for="lrJb">{{ 'accounting.journal.batchId' | t }}</label><div class="field"><span class="lead"><app-icon name="hash" size="sm" /></span><input id="lrJb" class="mono" [(ngModel)]="jBatch" /></div></div>
        <button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="busy() || ui.isReadonly()" (click)="exportJournal()"><span>{{ 'accounting.journal.export' | t }}</span></button>
      </div>
      <p class="lr-note">{{ 'accounting.journal.hint' | t }}</p>
      @if (journal(); as j) {
        <div class="kpi-grid lr-kpis">
          <div class="kpi"><div class="kpi-top">{{ 'accounting.journal.batchId' | t }}@if (j.repeated) { <span class="badge badge-info"><span class="dot"></span>{{ 'accounting.journal.repeated' | t }}</span> }</div><div class="kpi-val"><b class="mono">{{ j.exportBatchId }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.journal.vouchers' | t }}</div><div class="kpi-val"><b>{{ j.vouchers.length | num }}</b></div></div>
          <div class="kpi"><div class="kpi-top">{{ 'accounting.journal.debit' | t }} / {{ 'accounting.journal.credit' | t }}</div><div class="kpi-val"><b>{{ j.debitTotal | money: j.currency }}</b></div><div class="kpi-foot"><span>{{ 'accounting.journal.credit' | t }} {{ j.creditTotal | money: j.currency }}</span></div></div>
        </div>
        <section class="card">
          <div class="card-h"><h3>{{ 'accounting.journal.vouchers' | t }}</h3><span class="spacer"></span>
            <button type="button" class="btn btn-sm" (click)="api.download('accounting/journal-export', { from: j.from, to: j.to, exportBatchId: j.exportBatchId, format: 'csv' }, 'yevmiye.csv')"><app-icon name="download" size="sm" />CSV</button>
            <button type="button" class="btn btn-sm" (click)="api.download('accounting/journal-export', { from: j.from, to: j.to, exportBatchId: j.exportBatchId, format: 'xlsx' }, 'yevmiye.xlsx')"><app-icon name="download" size="sm" />XLSX</button>
          </div>
          <div class="table-scroll"><table class="tbl table-responsive">
            <thead><tr><th>{{ 'accounting.journal.voucher' | t }}</th><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.journal.account' | t }}</th><th class="r">{{ 'accounting.journal.debit' | t }}</th><th class="r">{{ 'accounting.journal.credit' | t }}</th></tr></thead>
            <tbody>
              @for (v of j.vouchers.slice(0, 50); track v.voucherNo) {
                @for (l of v.lines; track $index) {
                  <tr><td class="mono" [attr.data-label]="'accounting.journal.voucher' | t">{{ v.voucherNo }}</td><td [attr.data-label]="'accounting.col.date' | t">{{ v.date | appDate }}</td><td [attr.data-label]="'accounting.col.document' | t"><span class="mono">{{ v.documentNo }}</span> <span class="sec">({{ v.eDefterDocumentType }})</span></td><td [attr.data-label]="'accounting.journal.account' | t"><span class="mono">{{ l.account }}</span> <span class="sec">{{ l.accountName }}</span></td><td class="r" [attr.data-label]="'accounting.journal.debit' | t">{{ l.debit ? (l.debit | money: j.currency) : '' }}</td><td class="r" [attr.data-label]="'accounting.journal.credit' | t">{{ l.credit ? (l.credit | money: j.currency) : '' }}</td></tr>
                }
              }
            </tbody>
          </table></div>
        </section>
      }
      @if (batches().length) {
        <section class="card"><div class="card-h"><h3>{{ 'accounting.journal.batches' | t }}</h3></div>
          <ul class="lr-list">@for (b of batches(); track b.id) { <li><span class="mono">{{ b.exportBatchId }}</span><span class="sep">·</span><span>{{ b.fromDate | appDate }} – {{ b.toDate | appDate }}</span><span class="spacer"></span><span>{{ b.voucherCount | num }}</span><span class="sep">·</span><b>{{ b.debitTotal | money }}</b><span class="sep">·</span><span class="sec">{{ b.createdBy }}</span></li> }</ul>
        </section>
      }
    }

    <ng-template #groupsTpl let-groups>
      <div class="table-scroll"><table class="tbl table-responsive">
        <thead><tr><th class="r">{{ 'accounting.col.rate' | t }}</th><th>{{ 'accounting.col.exemption' | t }}</th><th>{{ 'accounting.col.withholding' | t }}</th><th class="r">{{ 'accounting.col.base' | t }}</th><th class="r">{{ 'accounting.col.vat' | t }}</th><th class="r">{{ 'accounting.col.withheld' | t }}</th><th class="r">{{ 'accounting.col.documents' | t }}</th></tr></thead>
        <tbody>@for (g of groups; track $index) { <tr><td class="r" [attr.data-label]="'accounting.col.rate' | t">%{{ g.rate | num }}</td><td [attr.data-label]="'accounting.col.exemption' | t">{{ g.exemptionCode }}</td><td [attr.data-label]="'accounting.col.withholding' | t">{{ g.withholdingCode }} {{ g.withholdingRate }}</td><td class="r" [attr.data-label]="'accounting.col.base' | t">{{ g.base | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.vat' | t">{{ g.tax | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.withheld' | t">{{ g.withheld | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.documents' | t">{{ g.documents | num }}</td></tr> }
          @if (!groups.length) { <tr class="empty-row"><td colspan="7"><div class="empty-state"><p>{{ 'common.noData' | t }}</p></div></td></tr> }</tbody>
      </table></div>
    </ng-template>
    <ng-template #docsTpl let-docs>
      <div class="table-scroll"><table class="tbl table-responsive">
        <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.col.taxId' | t }}</th><th>{{ 'accounting.col.party' | t }}</th><th class="r">{{ 'accounting.col.base' | t }}</th><th class="r">{{ 'accounting.col.vat' | t }}</th></tr></thead>
        <tbody>@for (d of docs; track $index) { <tr><td [attr.data-label]="'accounting.col.date' | t">{{ d.documentDate | appDate }}</td><td class="mono" [attr.data-label]="'accounting.col.document' | t">{{ d.documentNo }}</td><td class="mono" [attr.data-label]="'accounting.col.taxId' | t">{{ d.partyTaxId }}</td><td [attr.data-label]="'accounting.col.party' | t">{{ d.partyName }}</td><td class="r" [attr.data-label]="'accounting.col.base' | t">{{ d.base | money: 'TRY' }}</td><td class="r" [attr.data-label]="'accounting.col.vat' | t">{{ d.tax | money: 'TRY' }}</td></tr> }
          @if (!docs.length) { <tr class="empty-row"><td colspan="6"><div class="empty-state"><p>{{ 'common.noData' | t }}</p></div></td></tr> }</tbody>
      </table></div>
    </ng-template>
  `,
})
export class LegalReportsComponent implements OnInit {
  readonly api = inject(AccountingService);
  readonly ui = inject(UiStateService);
  private i18n = inject(I18nService);
  private inventory = inject(InventoryService);

  readonly tabs: LegalTab[] = ['inventory', 'ledger', 'vat', 'vat2', 'impact', 'impairment', 'trace', 'journal'];
  tab = signal<LegalTab>('inventory');
  error = signal<string | null>(null);
  busy = signal(false);
  /** Mobile overflow menu of the inventory-list toolbar. */
  invMore = signal(false);

  asOf = today();
  breakdown: 'product' | 'warehouse' | 'lot' = 'product';
  inv = signal<InventoryList | null>(null);

  products = signal<Product[]>([]);
  ledgerProduct = '';
  from = `${today().slice(0, 4)}-01-01`;
  to = today();
  ledger = signal<any>(null);

  period = thisMonth();
  vat = signal<any>(null);
  vat2 = signal<any>(null);
  impact = signal<any>(null);
  wastage = signal<any>(null);

  impDate = today();
  imp = signal<any>(null);
  selectedImp = signal<string[]>([]);

  traceQ = '';
  trace = signal<any>(null);
  quarantine = signal<any>(null);
  mock = signal<any>(null);
  recallReason = '';
  ministryRef = '';

  jFrom = `${thisMonth()}-01`;
  jTo = today();
  jBatch = '';
  journal = signal<any>(null);
  batches = signal<any[]>([]);

  isAdmin = computed(() => this.ui.userProfile()?.role === 'admin');

  ngOnInit() {
    this.loadInventory();
    this.inventory.getProducts().subscribe({ next: (p) => this.products.set(p), error: () => undefined });
    this.api.quarantineSuggestions().subscribe({ next: (q) => this.quarantine.set(q), error: () => undefined });
    this.api.mockRecallStatus().subscribe({ next: (m) => this.mock.set(m), error: () => undefined });
    this.api.journalBatches().subscribe({ next: (b) => this.batches.set(b), error: () => undefined });
  }

  abs(n: number) {
    return Math.abs(n);
  }

  account(cls: string) {
    return ({ ILK_MADDE_150: '150', YARI_MAMUL_151: '151', MAMUL_152: '152', TICARI_MAL_153: '153', DIGER_157: '157' } as Record<string, string>)[cls] || '153';
  }

  private fail = (e: unknown) => {
    this.busy.set(false);
    this.error.set(apiError(e, this.i18n.t('common.unknownError')));
  };

  private run<T>(obs: import('rxjs').Observable<T>, set: (v: T) => void) {
    this.error.set(null);
    obs.subscribe({ next: (v) => set(v), error: this.fail });
  }

  loadInventory() { this.run(this.api.inventoryList(this.asOf, this.breakdown), (v) => this.inv.set(v)); }
  loadLedger() { this.run(this.api.stockLedger(this.ledgerProduct, this.from, this.to), (v) => this.ledger.set(v)); }
  loadVat() { this.run(this.api.vat(this.period), (v) => this.vat.set(v)); }
  loadVat2() { this.run(this.api.vatWithholding(this.period), (v) => this.vat2.set(v)); }
  loadImpact() {
    this.run(this.api.vatImpact(this.period), (v) => this.impact.set(v));
    this.run(this.api.wastage(`${this.period}-01`, this.monthEnd(this.period)), (v) => this.wastage.set(v));
  }
  loadImpairment() {
    this.selectedImp.set([]);
    this.run(this.api.impairmentCandidates(this.impDate), (v) => this.imp.set(v));
  }

  private monthEnd(p: string) {
    const [y, m] = p.split('-').map(Number);
    const d = new Date(Date.UTC(y, m, 0));
    return d.toISOString().slice(0, 10);
  }

  toggleImp(id: string) {
    const cur = this.selectedImp();
    this.selectedImp.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  postImpairment() {
    this.busy.set(true);
    this.api.postImpairment(this.impDate, this.selectedImp()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('accounting.impairment.posted', { count: r.saved }), 'success');
      },
      error: this.fail,
    });
  }

  loadTrace() {
    const q = this.traceQ.trim();
    if (!q) return;
    this.error.set(null);
    this.api.traceability({ lotNumber: q }).subscribe({
      next: (v) => this.trace.set(v),
      error: () => this.run(this.api.traceability({ serial: q }), (v) => this.trace.set(v)),
    });
  }

  startRecall(t: any, isMock: boolean) {
    if (isMock) return this.doRecall(t, true);
    this.ui.openConfirm({
      title: this.i18n.t('reports.recall'),
      message: this.i18n.t('accounting.recall.confirm', { lot: t.lotNumber }),
      confirmText: this.i18n.t('accounting.recall.start'),
      isDelete: true,
      onConfirm: () => this.doRecall(t, false),
    });
  }

  private doRecall(t: any, isMock: boolean) {
    this.busy.set(true);
    this.api.recall({ productId: t.product.id, lotNumbers: [t.lotNumber], reason: this.recallReason.trim(), isMock }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.recallReason = '';
        this.ui.showToast(this.i18n.t(isMock ? 'accounting.recall.mockDone' : 'accounting.recall.done', { no: r.recallNo, count: (r.affectedCustomers || []).length }), 'success');
        this.loadTrace();
        this.api.quarantineSuggestions().subscribe({ next: (q) => this.quarantine.set(q) });
        this.api.mockRecallStatus().subscribe({ next: (m) => this.mock.set(m) });
      },
      error: this.fail,
    });
  }

  ministry(r: any) {
    this.api.updateRecall(r.id, { ministryNotifiedAt: new Date().toISOString(), ministryNotificationRef: this.ministryRef.trim() || null }).subscribe({ next: () => this.loadTrace(), error: this.fail });
  }

  toQuarantine(q: any) {
    const target = this.quarantine()?.quarantineWarehouseId;
    if (!target) return;
    this.busy.set(true);
    this.api.transfer(q.productId, q.warehouseId, target, q.quantity, q.lotId).subscribe({
      next: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('accounting.quarantine.moved', { lot: q.lotNumber }), 'success');
        this.api.quarantineSuggestions().subscribe({ next: (v) => this.quarantine.set(v) });
      },
      error: this.fail,
    });
  }

  exportJournal() {
    this.busy.set(true);
    this.error.set(null);
    this.api.journalExport(this.jFrom, this.jTo, this.jBatch.trim() || undefined).subscribe({
      next: (j) => {
        this.busy.set(false);
        this.journal.set(j);
        this.jBatch = j.exportBatchId;
        this.api.journalBatches().subscribe({ next: (b) => this.batches.set(b) });
      },
      error: this.fail,
    });
  }
}
