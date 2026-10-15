import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, I18nService } from '../../i18n';
import { AccountingService, InventoryList } from '../../services/accounting.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { apiError } from '../../services/documents.service';
import { Product } from '../../models/inventory.models';

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
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe],
  styleUrls: ['../documents/documents.css'],
  styles: [`
    .lr-tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    .lr-bar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-end; margin-bottom: var(--space-4); }
    .lr-bar .doc-field { min-width: 160px; }
    .lr-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4); }
    .lr-kpi { border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); background: var(--color-surface); }
    .lr-kpi .v { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
    .lr-kpi .l { font-size: var(--text-xs); color: var(--color-text-muted); }
    .lr-kpi.muted .v { color: var(--color-text-muted); font-weight: var(--weight-normal); }
    .lr-note { font-size: var(--text-xs); color: var(--color-text-muted); margin: var(--space-2) 0; }
    .lr-pre { border: 2px solid var(--color-danger, #b00); color: var(--color-danger, #b00); font-weight: var(--weight-semibold); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3); font-size: var(--text-sm); }
    h3.lr-h { font-size: var(--text-md, 15px); margin: var(--space-5) 0 var(--space-2); }
    .lr-cust { display: flex; flex-direction: column; gap: 2px; }
  `],
  template: `
    <nav class="lr-tabs" role="tablist">
      @for (t of tabs; track t) {
        <button type="button" class="btn btn-sm" [class.btn-primary]="tab() === t" [class.btn-secondary]="tab() !== t" role="tab" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ 'accounting.tab.' + t | t }}</button>
      }
    </nav>

    @if (error()) { <div class="doc-alert danger">{{ error() }}</div> }

    <!-- Inventory list (as-of) -->
    @if (tab() === 'inventory') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrAsOf">{{ 'accounting.asOf' | t }}</label><input id="lrAsOf" type="date" class="input" [(ngModel)]="asOf" /></div>
        <div class="doc-field"><label for="lrBd">{{ 'accounting.breakdown' | t }}</label>
          <select id="lrBd" class="select" [(ngModel)]="breakdown"><option value="product">{{ 'accounting.breakdown.product' | t }}</option><option value="warehouse">{{ 'accounting.breakdown.warehouse' | t }}</option><option value="lot">{{ 'accounting.breakdown.lot' | t }}</option></select></div>
        <button class="btn btn-secondary" (click)="loadInventory()">{{ 'reports.apply' | t }}</button>
        <button class="btn btn-primary" (click)="api.openPrintable('reports/inventory-list', { asOf, breakdown: breakdown === 'product' ? 'lot' : breakdown, format: 'html' })">{{ 'accounting.printPdf' | t }}</button>
        <button class="btn btn-secondary" (click)="api.openPrintable('reports/inventory-summary', { asOf, format: 'html' })">{{ 'accounting.summaryPdf' | t }}</button>
        <button class="btn btn-ghost" (click)="api.download('reports/e-envanter', { asOf, format: 'xlsx' }, 'e-envanter.xlsx')">{{ 'accounting.eEnvanterXlsx' | t }}</button>
      </div>
      @if (inv(); as d) {
        <div class="lr-kpis">
          <div class="lr-kpi"><div class="l">{{ 'reports.costValue' | t }}</div><div class="v">{{ d.totals.costValue | money: d.currency }}</div></div>
          <div class="lr-kpi muted"><div class="l">{{ 'reports.salesValue' | t }}</div><div class="v">{{ d.totals.salesValue | money: d.currency }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.method' | t }}</div><div class="v">{{ 'settings.costing.' + d.method | t }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.lastCount' | t }}</div><div class="v">{{ d.countPolicy.lastPhysicalCountDate ? (d.countPolicy.lastPhysicalCountDate | appDate) : '-' }}</div>
            @if (d.countPolicy.overdue) { <span class="badge badge-warning">{{ 'accounting.countOverdue' | t }}</span> }</div>
        </div>
        <p class="lr-note">{{ 'accounting.salesValueNote' | t }}</p>
        @if (d.costMissing) { <div class="doc-alert">{{ 'accounting.costMissing' | t }}</div> }
        <div class="table-card"><div class="table-scroll">
          <table class="table-responsive">
            <thead><tr><th>{{ 'accounting.col.account' | t }}</th><th>{{ 'accounting.col.sku' | t }}</th><th>{{ 'accounting.col.product' | t }}</th>
              @if (breakdown !== 'product') { <th>{{ 'accounting.col.warehouse' | t }}</th> } @if (breakdown === 'lot') { <th>{{ 'accounting.col.lot' | t }}</th> }
              <th class="num">{{ 'accounting.col.qty' | t }}</th><th class="num">{{ 'accounting.col.unitCost' | t }}</th><th class="num">{{ 'reports.costValue' | t }}</th></tr></thead>
            <tbody>
              @for (r of d.rows; track $index) {
                <tr>
                  <td class="mono" [attr.data-label]="'accounting.col.account' | t">{{ account(r.inventoryClass) }}</td>
                  <td class="mono" [attr.data-label]="'accounting.col.sku' | t">{{ r.sku }}</td>
                  <td class="td-primary" [attr.data-label]="'accounting.col.product' | t">{{ r.productName }}</td>
                  @if (breakdown !== 'product') { <td [attr.data-label]="'accounting.col.warehouse' | t">{{ r.warehouseName }}</td> }
                  @if (breakdown === 'lot') { <td [attr.data-label]="'accounting.col.lot' | t">{{ r.lotNumber }} @if (r.expiryDate) { <span class="text-muted">· {{ r.expiryDate | appDate }}</span> }</td> }
                  <td class="num" [attr.data-label]="'accounting.col.qty' | t">{{ r.quantity | num }} {{ r.unitCode }}</td>
                  <td class="num" [attr.data-label]="'accounting.col.unitCost' | t">{{ r.unitCost | money: d.currency }}</td>
                  <td class="num" [attr.data-label]="'reports.costValue' | t"><strong>{{ r.costValue | money: d.currency }}</strong></td>
                </tr>
              }
              @if (!d.rows.length) { <tr><td colspan="8"><div class="empty-state"><p class="empty-state-title">{{ 'common.noData' | t }}</p></div></td></tr> }
            </tbody>
          </table>
        </div></div>
      }
    }

    <!-- Stock card at cost -->
    @if (tab() === 'ledger') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrProd">{{ 'accounting.col.product' | t }}</label>
          <select id="lrProd" class="select" [(ngModel)]="ledgerProduct">@for (p of products(); track p.id) { <option [value]="p.id">{{ p.sku }} · {{ p.name }}</option> }</select></div>
        <div class="doc-field"><label for="lrFrom">{{ 'reports.startDate' | t }}</label><input id="lrFrom" type="date" class="input" [(ngModel)]="from" /></div>
        <div class="doc-field"><label for="lrTo">{{ 'reports.endDate' | t }}</label><input id="lrTo" type="date" class="input" [(ngModel)]="to" /></div>
        <button class="btn btn-secondary" [disabled]="!ledgerProduct" (click)="loadLedger()">{{ 'reports.apply' | t }}</button>
      </div>
      @if (ledger(); as l) {
        <div class="lr-kpis">
          <div class="lr-kpi"><div class="l">{{ 'accounting.opening' | t }}</div><div class="v">{{ l.opening.quantity | num }} · {{ l.opening.costValue | money: l.currency }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.closing' | t }}</div><div class="v">{{ l.closing.quantity | num }} · {{ l.closing.costValue | money: l.currency }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.method' | t }}</div><div class="v">{{ 'settings.costing.' + l.method | t }}</div></div>
        </div>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.reason' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.col.warehouse' | t }}</th><th class="num">{{ 'accounting.col.qty' | t }}</th><th class="num">{{ 'accounting.col.unitCost' | t }}</th><th class="num">{{ 'accounting.col.totalCost' | t }}</th><th class="num">{{ 'accounting.col.balance' | t }}</th></tr></thead>
          <tbody>
            @for (m of l.lines; track m.id) {
              <tr>
                <td [attr.data-label]="'accounting.col.date' | t">{{ m.date | appDate }}</td>
                <td [attr.data-label]="'accounting.col.reason' | t">{{ 'stockMovements.reason.' + m.reasonCode | t }} @if (m.costSource === 'MISSING' || m.costSource === 'FALLBACK' || m.costSource === 'ESTIMATE') { <span class="badge badge-warning">{{ 'accounting.costSource.' + m.costSource | t }}</span> }</td>
                <td class="mono" [attr.data-label]="'accounting.col.document' | t">{{ m.documentNo }}</td>
                <td [attr.data-label]="'accounting.col.warehouse' | t">{{ m.warehouseName }} @if (m.lotNumber) { <span class="text-muted">· {{ m.lotNumber }}</span> }</td>
                <td class="num" [attr.data-label]="'accounting.col.qty' | t">{{ m.quantity | num }}</td>
                <td class="num" [attr.data-label]="'accounting.col.unitCost' | t">{{ m.unitCost === null ? '-' : (m.unitCost | money: l.currency) }}</td>
                <td class="num" [attr.data-label]="'accounting.col.totalCost' | t">{{ m.totalCost === null ? '-' : (m.totalCost | money: l.currency) }}</td>
                <td class="num" [attr.data-label]="'accounting.col.balance' | t">{{ m.balanceQuantity | num }} · {{ m.balanceValue | money: l.currency }}</td>
              </tr>
            }
          </tbody>
        </table></div></div>
      }
    }

    <!-- KDV pre-report -->
    @if (tab() === 'vat') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrPer">{{ 'accounting.period' | t }}</label><input id="lrPer" type="month" class="input" [(ngModel)]="period" /></div>
        <button class="btn btn-secondary" (click)="loadVat()">{{ 'reports.apply' | t }}</button>
        <button class="btn btn-primary" (click)="api.openPrintable('reports/vat', { period, format: 'html' })">{{ 'accounting.printPdf' | t }}</button>
      </div>
      @if (vat(); as v) {
        <div class="lr-pre">{{ 'accounting.preReport' | t }}</div>
        <div class="lr-kpis">
          <div class="lr-kpi"><div class="l">{{ 'accounting.vat.computed' | t }}</div><div class="v">{{ v.summary.computedVat | money: 'TRY' }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.vat.deductible' | t }}</div><div class="v">{{ v.summary.deductibleVat | money: 'TRY' }}</div></div>
          <div class="lr-kpi"><div class="l">{{ (v.summary.payable >= 0 ? 'accounting.vat.payable' : 'accounting.vat.carried') | t }}</div><div class="v">{{ abs(v.summary.payable) | money: 'TRY' }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.vat.due' | t }}</div><div class="v">KDV-1: {{ v.kdv1Due | appDate }} · KDV-2: {{ v.kdv2Due | appDate }}</div></div>
        </div>
        <p class="lr-note">{{ 'accounting.vat.reconciled' | t: { count: v.reconciliation.invoices, base: (v.reconciliation.invoiceSubtotalTry | money: 'TRY'), tax: (v.reconciliation.invoiceTaxTotalTry | money: 'TRY') } }}</p>
        <h3 class="lr-h">{{ 'accounting.vat.sales' | t }}</h3>
        <ng-container *ngTemplateOutlet="groupsTpl; context: { $implicit: v.sales.groups }"></ng-container>
        @if (v.salesReturns.groups.length) { <h3 class="lr-h">{{ 'accounting.vat.salesReturns' | t }}</h3><ng-container *ngTemplateOutlet="groupsTpl; context: { $implicit: v.salesReturns.groups }"></ng-container> }
        @if (v.purchaseReturns.groups.length) { <h3 class="lr-h">{{ 'accounting.vat.purchaseReturns' | t }}</h3><ng-container *ngTemplateOutlet="groupsTpl; context: { $implicit: v.purchaseReturns.groups }"></ng-container> }
        <h3 class="lr-h">{{ 'accounting.vat.deductibleList' | t }}</h3>
        <ng-container *ngTemplateOutlet="docsTpl; context: { $implicit: v.deductible.documents }"></ng-container>
        <h3 class="lr-h">{{ 'accounting.vat.imports' | t }}</h3>
        <ng-container *ngTemplateOutlet="docsTpl; context: { $implicit: v.imports.documents }"></ng-container>
      }
    }

    <!-- KDV-2 -->
    @if (tab() === 'vat2') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrPer2">{{ 'accounting.period' | t }}</label><input id="lrPer2" type="month" class="input" [(ngModel)]="period" /></div>
        <button class="btn btn-secondary" (click)="loadVat2()">{{ 'reports.apply' | t }}</button>
      </div>
      @if (vat2(); as v) {
        <div class="lr-pre">{{ 'accounting.preReport' | t }}</div>
        <div class="lr-kpis">
          <div class="lr-kpi"><div class="l">{{ 'accounting.vat.withheldTotal' | t }}</div><div class="v">{{ v.totals.withheld | money: 'TRY' }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.vat.due' | t }}</div><div class="v">{{ v.kdv2Due | appDate }}</div></div>
        </div>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.col.party' | t }}</th><th>{{ 'accounting.col.code' | t }}</th><th class="num">{{ 'accounting.col.base' | t }}</th><th class="num">{{ 'accounting.col.vat' | t }}</th><th class="num">{{ 'accounting.col.withheld' | t }}</th></tr></thead>
          <tbody>
            @for (r of v.rows; track $index) {
              <tr><td>{{ r.documentDate | appDate }}</td><td class="mono">{{ r.documentNo }}</td><td>{{ r.partyName }} <span class="mono text-muted">{{ r.partyTaxId }}</span></td>
                <td>{{ r.reverseCharge ? ('accounting.vat.reverseCharge' | t) : r.withholdingCode }} {{ r.withholdingRate }}</td><td class="num">{{ r.base | money: 'TRY' }}</td><td class="num">{{ r.tax | money: 'TRY' }}</td><td class="num"><strong>{{ r.withheld | money: 'TRY' }}</strong></td></tr>
            }
            @if (!v.rows.length) { <tr><td colspan="7"><div class="empty-state"><p class="empty-state-title">{{ 'common.noData' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></div>
        <p class="lr-note">{{ 'accounting.vat.kdv2Basis' | t }}</p>
        @for (w of v.warnings || []; track $index) {
          <div class="alert-banner alert-banner--warning" role="status">{{ 'accounting.vat.poWithholdingNotOnInvoice' | t: { po: w.poNumber, doc: w.documentNo, code: w.withholdingCode, amount: (w.expectedWithheld | money: 'TRY') } }}</div>
        }
      }
    }

    <!-- VAT-relevant movements + wastage -->
    @if (tab() === 'impact') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrPer3">{{ 'accounting.period' | t }}</label><input id="lrPer3" type="month" class="input" [(ngModel)]="period" /></div>
        <button class="btn btn-secondary" (click)="loadImpact()">{{ 'reports.apply' | t }}</button>
      </div>
      @if (impact(); as v) {
        <div class="lr-pre">{{ 'accounting.preReport' | t }}</div>
        <h3 class="lr-h">{{ 'accounting.impact.deemed' | t }}</h3>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.reason' | t }}</th><th class="num">{{ 'accounting.col.qty' | t }}</th><th class="num">{{ 'reports.costValue' | t }}</th><th class="num">{{ 'accounting.impact.emsal' | t }}</th><th class="num">{{ 'accounting.col.vat' | t }}</th></tr></thead>
          <tbody>@for (r of v.deemedSupplies; track $index) { <tr><td>{{ r.date | appDate }}</td><td>{{ r.productName }}</td><td>{{ 'stockMovements.reason.' + r.reasonCode | t }}</td><td class="num">{{ r.quantity | num }}</td><td class="num">{{ r.costValue | money: 'TRY' }}</td><td class="num">{{ r.emsalValue | money: 'TRY' }}</td><td class="num">{{ r.vat | money: 'TRY' }}</td></tr> }
            @if (!v.deemedSupplies.length) { <tr><td colspan="7" class="text-muted">{{ 'common.noData' | t }}</td></tr> }</tbody>
        </table></div></div>
        <h3 class="lr-h">{{ 'accounting.impact.corrections' | t }}</h3>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.reason' | t }}</th><th class="num">{{ 'accounting.col.qty' | t }}</th><th class="num">{{ 'reports.costValue' | t }}</th><th class="num">{{ 'accounting.impact.vatToCorrect' | t }}</th></tr></thead>
          <tbody>@for (r of v.vatCorrections; track $index) { <tr><td>{{ r.date | appDate }}</td><td>{{ r.productName }}</td><td>{{ (r.reasonCode === 'WASTAGE_ABNORMAL' ? 'accounting.impact.abnormal' : 'stockMovements.reason.' + r.reasonCode) | t }}</td><td class="num">{{ r.quantity | num }}</td><td class="num">{{ r.costValue | money: 'TRY' }}</td><td class="num"><strong>{{ r.vatToCorrect | money: 'TRY' }}</strong></td></tr> }
            @if (!v.vatCorrections.length) { <tr><td colspan="6" class="text-muted">{{ 'common.noData' | t }}</td></tr> }</tbody>
        </table></div></div>
        @if (v.excluded.length) { <p class="lr-note">{{ 'accounting.impact.excluded' | t: { count: v.excluded.length } }}</p> }
        @if (wastage(); as w) {
          <h3 class="lr-h">{{ 'accounting.wastage.title' | t }}</h3>
          <div class="table-card"><div class="table-scroll"><table class="table-responsive">
            <thead><tr><th>{{ 'accounting.col.product' | t }}</th><th class="num">{{ 'accounting.wastage.throughput' | t }}</th><th class="num">{{ 'accounting.wastage.rate' | t }}</th><th class="num">{{ 'accounting.wastage.actual' | t }}</th><th class="num">{{ 'accounting.wastage.allowed' | t }}</th><th class="num">{{ 'accounting.wastage.abnormal' | t }}</th><th>{{ 'accounting.wastage.source' | t }}</th></tr></thead>
            <tbody>@for (r of w.rows; track r.productId) { <tr><td>{{ r.productName }}</td><td class="num">{{ r.throughput | num }}</td><td class="num">{{ r.normalRatePct === null ? '-' : '%' + (r.normalRatePct | num) }}</td><td class="num">{{ r.wastedQuantity | num }} ({{ r.actualRatePct === null ? '-' : '%' + (r.actualRatePct | num) }})</td><td class="num">{{ r.allowedQuantity | num }}</td><td class="num">@if (r.abnormalQuantity > 0) { <span class="badge badge-warning">{{ r.abnormalQuantity | num }}</span> } @else { 0 }</td><td class="text-muted">{{ r.rateSource }}</td></tr> }
              @if (!w.rows.length) { <tr><td colspan="7" class="text-muted">{{ 'common.noData' | t }}</td></tr> }</tbody>
          </table></div></div>
        }
      }
    }

    <!-- Impairment candidates -->
    @if (tab() === 'impairment') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrImpD">{{ 'accounting.valuationDate' | t }}</label><input id="lrImpD" type="date" class="input" [(ngModel)]="impDate" /></div>
        <button class="btn btn-secondary" (click)="loadImpairment()">{{ 'reports.apply' | t }}</button>
        @if (isAdmin()) { <button class="btn btn-primary" [disabled]="!selectedImp().length" (click)="postImpairment()">{{ 'accounting.impairment.post' | t: { count: selectedImp().length } }}</button> }
        <button class="btn btn-ghost" (click)="api.openPrintable('impairment/sheet', { date: impDate })">{{ 'accounting.impairment.sheet' | t }}</button>
      </div>
      @if (imp(); as d) {
        <p class="lr-note">{{ 'accounting.impairment.rule' | t: { decline: d.thresholds.minDeclinePct, sales: d.thresholds.minMonthlySalesPct } }}</p>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th></th><th>{{ 'accounting.col.product' | t }}</th><th class="num">{{ 'accounting.col.qty' | t }}</th><th class="num">{{ 'accounting.col.unitCost' | t }}</th><th>{{ 'accounting.impairment.basis' | t }}</th><th class="num">{{ 'accounting.impairment.emsal' | t }}</th><th class="num">{{ 'accounting.impairment.decline' | t }}</th><th class="num">{{ 'accounting.impairment.taxValue' | t }}</th><th class="num">{{ 'accounting.impairment.provision' | t }}</th></tr></thead>
          <tbody>
            @for (r of d.rows; track r.productId) {
              <tr>
                <td><input type="checkbox" [disabled]="!r.qualifies && !r.requiresCommission" [checked]="selectedImp().includes(r.productId)" (change)="toggleImp(r.productId)" [attr.aria-label]="r.productName" /></td>
                <td>{{ r.productName }}</td><td class="num">{{ r.quantity | num }}</td><td class="num">{{ r.unitCost | money: d.currency }}</td>
                <td>{{ 'accounting.impairment.basis.' + r.emsalBasis | t }} @if (r.emsalMonth) { <span class="text-muted">({{ r.emsalMonth }})</span> }
                  @if (r.qualifies) { <span class="badge badge-warning">{{ 'accounting.impairment.candidate' | t }}</span> } @if (r.requiresCommission) { <span class="badge badge-neutral">{{ 'accounting.impairment.commission' | t }}</span> @if (r.indication) { <span class="text-muted">{{ 'accounting.impairment.indication.' + r.indication | t }}</span> } }</td>
                <td class="num">{{ r.emsalUnitPrice === null ? '-' : (r.emsalUnitPrice | money: d.currency) }}</td>
                <td class="num">{{ r.declinePct === null ? '-' : '%' + (r.declinePct | num) }}</td>
                <td class="num">{{ r.taxValue | money: d.currency }}</td><td class="num">{{ r.provision | money: d.currency }}</td>
              </tr>
            }
          </tbody>
        </table></div></div>
      }
    }

    <!-- Traceability & recall -->
    @if (tab() === 'trace') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrLot">{{ 'accounting.trace.lotOrSerial' | t }}</label><input id="lrLot" class="input mono" [(ngModel)]="traceQ" (keyup.enter)="loadTrace()" [placeholder]="'accounting.trace.placeholder' | t" /></div>
        <button class="btn btn-secondary" [disabled]="!traceQ.trim()" (click)="loadTrace()">{{ 'accounting.trace.search' | t }}</button>
      </div>
      @if (quarantine()?.items?.length) {
        <div class="doc-alert">
          <strong>{{ 'accounting.quarantine.title' | t: { count: quarantine().items.length } }}</strong>
          @for (q of quarantine().items; track q.lotId) {
            <div class="cluster" style="justify-content: space-between; margin-top: 4px;">
              <span>{{ q.productName }} · <span class="mono">{{ q.lotNumber }}</span> · {{ q.quantity | num }} · {{ q.warehouseName }} · <span class="badge badge-warning">{{ 'accounting.quarantine.reason.' + q.reason | t }}</span></span>
              @if (!ui.isReadonly() && quarantine().quarantineWarehouseId) { <button class="btn btn-sm btn-secondary" (click)="toQuarantine(q)">{{ 'accounting.quarantine.move' | t }}</button> }
            </div>
          }
        </div>
      }
      @if (trace(); as t) {
        <div class="lr-kpis">
          <div class="lr-kpi"><div class="l">{{ 'accounting.col.product' | t }}</div><div class="v">{{ t.product.name }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.trace.inStock' | t }}</div><div class="v">{{ t.inStock | num }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.trace.customers' | t }}</div><div class="v">{{ t.customers.length }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.trace.retainUntil' | t }}</div><div class="v">{{ t.retainUntil ? (t.retainUntil | appDate) : '-' }}</div></div>
        </div>
        @if (t.lots.length) {
          <p class="lr-note">@for (l of t.lots; track l.id) { <span>{{ l.warehouseName }}: {{ l.quantity | num }} · {{ 'accounting.trace.expiry' | t }} {{ l.expiryDate | appDate }}@if (l.productionDate) { · {{ 'accounting.trace.production' | t }} {{ l.productionDate | appDate }} }@if (l.supplierLotNumber) { · {{ 'accounting.trace.supplierLot' | t }} {{ l.supplierLotNumber }} } · <span class="badge" [class.badge-danger]="l.status !== 'active'">{{ 'accounting.lotStatus.' + l.status | t }}</span>; </span> }</p>
        }
        <h3 class="lr-h">{{ 'reports.recall' | t }}: {{ 'accounting.trace.customers' | t }}</h3>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'accounting.col.party' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th class="num">{{ 'accounting.trace.shipped' | t }}</th><th class="num">{{ 'accounting.trace.returned' | t }}</th><th class="num">{{ 'accounting.trace.net' | t }}</th></tr></thead>
          <tbody>
            @for (c of t.customers; track $index) {
              <tr><td class="td-primary">{{ c.partyName }} <span class="mono text-muted">{{ c.partyTaxId }}</span></td>
                <td><div class="lr-cust">@for (d of c.documents; track $index) { <span class="mono">{{ d.documentNo }} · {{ d.documentDate | appDate }} · {{ d.quantity | num }}</span> }</div></td>
                <td class="num">{{ c.shipped | num }}</td><td class="num">{{ c.returned | num }}</td><td class="num"><strong>{{ c.net | num }}</strong></td></tr>
            }
            @if (!t.customers.length) { <tr><td colspan="5" class="text-muted">{{ 'accounting.trace.noCustomers' | t }}</td></tr> }
          </tbody>
        </table></div></div>
        <h3 class="lr-h">{{ 'accounting.trace.suppliers' | t }}</h3>
        @for (s of t.suppliers; track $index) { <p class="lr-note">{{ s.partyName }} <span class="mono">{{ s.partyTaxId }}</span> · {{ s.documentNo }} · {{ s.documentDate | appDate }} · {{ s.quantity | num }}</p> }
        @if (t.lotNumber && !ui.isReadonly()) {
          <div class="doc-section">
            <div class="doc-field"><label for="lrRr">{{ 'accounting.recall.reason' | t }}</label><input id="lrRr" class="input" [(ngModel)]="recallReason" /></div>
            <div class="cluster" style="margin-top: var(--space-2);">
              <button class="btn btn-danger" [disabled]="!recallReason.trim() || busy()" (click)="startRecall(t, false)">{{ 'accounting.recall.start' | t }}</button>
              <button class="btn btn-secondary" [disabled]="!recallReason.trim() || busy()" (click)="startRecall(t, true)">{{ 'accounting.recall.mock' | t }}</button>
            </div>
            <p class="lr-note">{{ 'accounting.recall.hint' | t }}</p>
          </div>
        }
        @if (t.recalls.length) {
          <h3 class="lr-h">{{ 'accounting.recall.records' | t }}</h3>
          @for (r of t.recalls; track r.id) {
            <p class="lr-note"><span class="mono">{{ r.recallNo }}</span> · {{ r.isMock ? ('accounting.recall.mockBadge' | t) : ('accounting.recall.realBadge' | t) }} · {{ 'accounting.recall.status.' + r.status | t }} · {{ r.createdAt | appDate }}
              @if (!r.isMock && r.status === 'OPEN' && !ui.isReadonly()) {
                · <input class="input" style="width: 180px; display: inline-block;" [(ngModel)]="ministryRef" [placeholder]="'accounting.recall.ministryRef' | t" [attr.aria-label]="'accounting.recall.ministryRef' | t" />
                <button class="link-btn" (click)="ministry(r)">{{ 'accounting.recall.ministryNotified' | t }}</button>
              }
              @if (r.ministryNotifiedAt) { · {{ 'accounting.recall.ministryAt' | t }} {{ r.ministryNotifiedAt | appDate }} }</p>
          }
        }
      }
      @if (mock(); as ms) { <p class="lr-note">{{ 'accounting.recall.mockStatus' | t: { last: ms.lastMockRecall ? (ms.lastMockRecall | appDate) : '-', due: ms.dueBy ? (ms.dueBy | appDate) : '-' } }} @if (ms.overdue) { <span class="badge badge-warning">{{ 'accounting.recall.mockOverdue' | t }}</span> }</p> }
    }

    <!-- Journal export -->
    @if (tab() === 'journal') {
      <div class="lr-bar">
        <div class="doc-field"><label for="lrJf">{{ 'reports.startDate' | t }}</label><input id="lrJf" type="date" class="input" [(ngModel)]="jFrom" /></div>
        <div class="doc-field"><label for="lrJt">{{ 'reports.endDate' | t }}</label><input id="lrJt" type="date" class="input" [(ngModel)]="jTo" /></div>
        <div class="doc-field"><label for="lrJb">{{ 'accounting.journal.batchId' | t }}</label><input id="lrJb" class="input mono" [(ngModel)]="jBatch" /></div>
        <button class="btn btn-primary" [disabled]="busy() || ui.isReadonly()" (click)="exportJournal()">{{ 'accounting.journal.export' | t }}</button>
      </div>
      <p class="lr-note">{{ 'accounting.journal.hint' | t }}</p>
      @if (journal(); as j) {
        <div class="lr-kpis">
          <div class="lr-kpi"><div class="l">{{ 'accounting.journal.batchId' | t }}</div><div class="v mono">{{ j.exportBatchId }}</div>@if (j.repeated) { <span class="badge badge-info">{{ 'accounting.journal.repeated' | t }}</span> }</div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.journal.vouchers' | t }}</div><div class="v">{{ j.vouchers.length }}</div></div>
          <div class="lr-kpi"><div class="l">{{ 'accounting.journal.debit' | t }} / {{ 'accounting.journal.credit' | t }}</div><div class="v">{{ j.debitTotal | money: j.currency }} / {{ j.creditTotal | money: j.currency }}</div></div>
        </div>
        <div class="cluster"><button class="btn btn-secondary btn-sm" (click)="api.download('accounting/journal-export', { from: j.from, to: j.to, exportBatchId: j.exportBatchId, format: 'csv' }, 'yevmiye.csv')">CSV</button>
          <button class="btn btn-secondary btn-sm" (click)="api.download('accounting/journal-export', { from: j.from, to: j.to, exportBatchId: j.exportBatchId, format: 'xlsx' }, 'yevmiye.xlsx')">XLSX</button></div>
        <div class="table-card" style="margin-top: var(--space-3);"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'accounting.journal.voucher' | t }}</th><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.journal.account' | t }}</th><th class="num">{{ 'accounting.journal.debit' | t }}</th><th class="num">{{ 'accounting.journal.credit' | t }}</th></tr></thead>
          <tbody>
            @for (v of j.vouchers.slice(0, 50); track v.voucherNo) {
              @for (l of v.lines; track $index) {
                <tr><td class="mono">{{ v.voucherNo }}</td><td>{{ v.date | appDate }}</td><td class="mono">{{ v.documentNo }} <span class="text-muted">({{ v.eDefterDocumentType }})</span></td><td class="mono">{{ l.account }} <span class="text-muted">{{ l.accountName }}</span></td><td class="num">{{ l.debit ? (l.debit | money: j.currency) : '' }}</td><td class="num">{{ l.credit ? (l.credit | money: j.currency) : '' }}</td></tr>
              }
            }
          </tbody>
        </table></div></div>
      }
      @if (batches().length) {
        <h3 class="lr-h">{{ 'accounting.journal.batches' | t }}</h3>
        @for (b of batches(); track b.id) { <p class="lr-note"><span class="mono">{{ b.exportBatchId }}</span> · {{ b.fromDate | appDate }} - {{ b.toDate | appDate }} · {{ b.voucherCount }} · {{ b.debitTotal | money }} · {{ b.createdBy }}</p> }
      }
    }

    <ng-template #groupsTpl let-groups>
      <div class="table-card"><div class="table-scroll"><table class="table-responsive">
        <thead><tr><th class="num">{{ 'accounting.col.rate' | t }}</th><th>{{ 'accounting.col.exemption' | t }}</th><th>{{ 'accounting.col.withholding' | t }}</th><th class="num">{{ 'accounting.col.base' | t }}</th><th class="num">{{ 'accounting.col.vat' | t }}</th><th class="num">{{ 'accounting.col.withheld' | t }}</th><th class="num">{{ 'accounting.col.documents' | t }}</th></tr></thead>
        <tbody>@for (g of groups; track $index) { <tr><td class="num">%{{ g.rate | num }}</td><td>{{ g.exemptionCode }}</td><td>{{ g.withholdingCode }} {{ g.withholdingRate }}</td><td class="num">{{ g.base | money: 'TRY' }}</td><td class="num">{{ g.tax | money: 'TRY' }}</td><td class="num">{{ g.withheld | money: 'TRY' }}</td><td class="num">{{ g.documents }}</td></tr> }
          @if (!groups.length) { <tr><td colspan="7" class="text-muted">{{ 'common.noData' | t }}</td></tr> }</tbody>
      </table></div></div>
    </ng-template>
    <ng-template #docsTpl let-docs>
      <div class="table-card"><div class="table-scroll"><table class="table-responsive">
        <thead><tr><th>{{ 'accounting.col.date' | t }}</th><th>{{ 'accounting.col.document' | t }}</th><th>{{ 'accounting.col.taxId' | t }}</th><th>{{ 'accounting.col.party' | t }}</th><th class="num">{{ 'accounting.col.base' | t }}</th><th class="num">{{ 'accounting.col.vat' | t }}</th></tr></thead>
        <tbody>@for (d of docs; track $index) { <tr><td>{{ d.documentDate | appDate }}</td><td class="mono">{{ d.documentNo }}</td><td class="mono">{{ d.partyTaxId }}</td><td>{{ d.partyName }}</td><td class="num">{{ d.base | money: 'TRY' }}</td><td class="num">{{ d.tax | money: 'TRY' }}</td></tr> }
          @if (!docs.length) { <tr><td colspan="6" class="text-muted">{{ 'common.noData' | t }}</td></tr> }</tbody>
      </table></div></div>
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
