import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { COSTING_METHODS, PHYSICAL_COUNT_POLICIES } from '@stok/tr-compliance';
import { AccountingService, CloseCheck, FiscalPeriod } from '../../services/accounting.service';
import { ComplianceService } from '../../services/compliance.service';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { apiError } from '../../services/documents.service';
import { I18nService, TranslatePipe, AppDatePipe } from '../../i18n';

/**
 * Settings > Inventory accounting (admin, WP6): fiscal periods (close / reopen with a second
 * administrator), costing method (only from the start of an open fiscal year), account mappings
 * for the journal export, normal wastage rates per category, VUK 278/A destruction rate, sale of
 * best-before (TETT) expired lots, GS1 prefix and the physical count policy.
 */
@Component({
  selector: 'app-inventory-accounting-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    .ia-section { margin-top: var(--space-6); padding-top: var(--space-4); border-top: var(--border-width) solid var(--color-border-subtle); }
    .ia-section:first-of-type { margin-top: var(--space-2); border-top: none; padding-top: 0; }
    .ia-row { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
    .ia-row .doc-field { min-width: 180px; flex: 0 1 240px; }
    .ia-periods { width: 100%; border-collapse: collapse; margin-top: var(--space-3); font-size: var(--text-sm); }
    .ia-periods th, .ia-periods td { padding: var(--space-2); border-bottom: var(--border-width) solid var(--color-border-subtle); text-align: left; }
    .ia-periods tr.year td { font-weight: var(--weight-semibold); background: var(--color-surface-2, transparent); }
    .ia-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: var(--space-1) 0 var(--space-2); }
    .ia-check { font-size: var(--text-xs); color: var(--color-warning-text, #8a5300); }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'accounting.settings.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'accounting.settings.subtitle' | t }}</p>
      @if (error()) { <div class="doc-alert danger">{{ error() }}</div> }

      <!-- Fiscal periods -->
      <section class="ia-section">
        <h4 class="card-title">{{ 'settings.periods.title' | t }}</h4>
        <p class="ia-hint">{{ 'settings.periods.hint' | t: { lock: lockDate() ? (lockDate()! | appDate) : '-' } }}</p>
        <div class="ia-row">
          <div class="doc-field"><label for="iaYear">{{ 'settings.periods.year' | t }}</label>
            <select id="iaYear" class="select" [ngModel]="year()" (ngModelChange)="year.set(+$event); loadPeriods()">@for (y of years; track y) { <option [value]="y">{{ y }}</option> }</select></div>
        </div>
        <table class="ia-periods">
          <thead><tr><th>{{ 'settings.periods.period' | t }}</th><th>{{ 'settings.periods.range' | t }}</th><th>{{ 'settings.periods.status' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (p of periods(); track p.id) {
              <tr [class.year]="p.periodType === 'YEAR'">
                <td>{{ p.label }}</td>
                <td>{{ p.startDate | appDate }} – {{ p.endDate | appDate }}</td>
                <td>
                  <span class="badge" [class.badge-success]="p.status === 'OPEN'" [class.badge-neutral]="p.status === 'CLOSED'">{{ 'settings.periods.' + p.status | t }}</span>
                  @if (p.closedAt && p.status === 'CLOSED') { <span class="text-muted"> · {{ p.closedBy }} {{ p.closedAt | appDate }}</span> }
                  @if (p.reopenCount) { <span class="text-muted"> · {{ 'settings.periods.reopened' | t: { count: p.reopenCount } }}</span> }
                  @if (p.pendingReopen) { <span class="badge badge-warning">{{ 'settings.periods.reopenPending' | t }}</span> }
                  @if (checks()[p.id]?.length) { <div class="ia-check">@for (c of checks()[p.id]; track c.code) { <div>{{ 'settings.periods.check.' + c.code | t }}: {{ c.count }} ({{ labels(c) }})</div> }</div> }
                </td>
                <td class="td-actions">
                  @if (p.status === 'OPEN' && p.endDate < today) {
                    <button class="btn btn-sm btn-secondary" (click)="runChecks(p)" [disabled]="busy()">{{ 'settings.periods.checks' | t }}</button>
                    <button class="btn btn-sm btn-primary" (click)="close(p)" [disabled]="busy()">{{ 'settings.periods.close' | t }}</button>
                  }
                  @if (p.status === 'CLOSED' && !p.pendingReopen) {
                    <button class="btn btn-sm btn-ghost" (click)="reopenFor.set(p)">{{ 'settings.periods.reopen' | t }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (reopenFor(); as p) {
          <div class="doc-section">
            <div class="doc-field"><label for="iaReason">{{ 'settings.periods.reopenReason' | t: { period: p.label } }}</label><textarea id="iaReason" class="input" rows="2" maxlength="500" [(ngModel)]="reopenReason"></textarea></div>
            <p class="ia-hint">{{ 'settings.periods.reopenHint' | t }}</p>
            <div class="cluster"><button class="btn btn-secondary btn-sm" (click)="reopenFor.set(null)">{{ 'common.cancel' | t }}</button>
              <button class="btn btn-primary btn-sm" [disabled]="!reopenReason.trim() || busy()" (click)="reopen(p)">{{ 'settings.periods.reopenRequest' | t }}</button></div>
          </div>
        }
      </section>

      <!-- Costing -->
      <section class="ia-section">
        <h4 class="card-title">{{ 'settings.costing.title' | t }}</h4>
        @if (costing(); as c) {
          <p class="ia-hint">{{ 'settings.costing.current' | t: { method: ('settings.costing.' + c.costingMethod | t), from: c.costingMethodEffectiveFrom ? (c.costingMethodEffectiveFrom | appDate) : '-' } }}
            @if (c.pendingCostingMethod) { · {{ 'settings.costing.pending' | t: { method: ('settings.costing.' + c.pendingCostingMethod | t), from: (c.pendingCostingMethodFrom | appDate) } }} }</p>
          <div class="ia-row">
            <div class="doc-field"><label for="iaMethod">{{ 'settings.costing.method' | t }}</label>
              <select id="iaMethod" class="select" [(ngModel)]="method">@for (m of methods; track m) { <option [value]="m">{{ 'settings.costing.' + m | t }}</option> }</select></div>
            <div class="doc-field"><label for="iaFrom">{{ 'settings.costing.effectiveFrom' | t }}</label>
              <select id="iaFrom" class="select" [(ngModel)]="effectiveFrom">@for (y of openYearStarts(); track y) { <option [value]="y">{{ y | appDate }}</option> }</select></div>
            <div class="doc-field" style="flex-basis: 320px;"><label for="iaMr">{{ 'settings.costing.reason' | t }}</label><input id="iaMr" class="input" maxlength="300" [(ngModel)]="methodReason" /></div>
            <button class="btn btn-primary" [disabled]="busy() || !methodReason.trim() || !effectiveFrom" (click)="changeMethod()">{{ 'settings.costing.change' | t }}</button>
          </div>
          <p class="ia-hint">{{ 'settings.costing.hint' | t }}</p>
          <div class="ia-row">
            <div class="doc-field"><label for="iaFx">{{ 'settings.costing.fxPolicy' | t }}</label>
              <select id="iaFx" class="select" [ngModel]="c.postReceiptFxPolicy" (ngModelChange)="setFx($event)"><option value="EXPENSE">{{ 'settings.costing.fx.EXPENSE' | t }}</option><option value="COST">{{ 'settings.costing.fx.COST' | t }}</option></select></div>
          </div>
        }
        <div class="doc-field" style="margin-top: var(--space-3);"><label for="iaCsv">{{ 'settings.costing.openingCsv' | t }}</label>
          <textarea id="iaCsv" class="input mono" rows="3" [(ngModel)]="openingCsv" placeholder="sku;lotNumber;unitCost"></textarea></div>
        <button class="btn btn-secondary btn-sm" [disabled]="!openingCsv.trim() || busy()" (click)="importOpening()">{{ 'settings.costing.import' | t }}</button>
      </section>

      <!-- Account mappings -->
      <section class="ia-section">
        <h4 class="card-title">{{ 'settings.mappings.title' | t }}</h4>
        <p class="ia-hint">{{ (bookkeeping() === 'BILANCO' ? 'settings.mappings.hint' : 'settings.mappings.notBilanco') | t }}</p>
        <table class="ia-periods">
          <thead><tr><th>{{ 'settings.mappings.event' | t }}</th><th>{{ 'settings.mappings.debit' | t }}</th><th>{{ 'settings.mappings.credit' | t }}</th><th>{{ 'settings.mappings.scope' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (r of mappingRows(); track $index) {
              <tr>
                <td>{{ 'accounting.event.' + r.event | t }}</td><td class="mono">{{ r.debitAccount }}</td><td class="mono">{{ r.creditAccount }}</td>
                <td>@if (r.id) { <span class="badge badge-info">{{ 'settings.mappings.company' | t }}</span> } @else { <span class="text-muted">{{ 'settings.mappings.default' | t }}</span> } @if (r.enabled === false) { <span class="badge badge-neutral">{{ 'settings.mappings.disabled' | t }}</span> }</td>
                <td class="td-actions">@if (r.id) { <button class="btn btn-sm btn-ghost" (click)="deleteMapping(r.id)">{{ 'common.delete' | t }}</button> }</td>
              </tr>
            }
          </tbody>
        </table>
        <div class="ia-row" style="margin-top: var(--space-3);">
          <div class="doc-field"><label for="iaEv">{{ 'settings.mappings.event' | t }}</label>
            <select id="iaEv" class="select" [(ngModel)]="mEvent">@for (e of events(); track e) { <option [value]="e">{{ 'accounting.event.' + e | t }}</option> }</select></div>
          <div class="doc-field"><label for="iaDr">{{ 'settings.mappings.debit' | t }}</label><input id="iaDr" class="input mono" [(ngModel)]="mDebit" placeholder="{STOCK} / 760.01" /></div>
          <div class="doc-field"><label for="iaCr">{{ 'settings.mappings.credit' | t }}</label><input id="iaCr" class="input mono" [(ngModel)]="mCredit" placeholder="{STOCK}" /></div>
          <button class="btn btn-secondary" [disabled]="!mEvent || !mDebit || !mCredit || busy()" (click)="addMapping()">{{ 'settings.mappings.add' | t }}</button>
        </div>
      </section>

      <!-- Wastage per category -->
      <section class="ia-section">
        <h4 class="card-title">{{ 'settings.wastage.title' | t }}</h4>
        <p class="ia-hint">{{ 'settings.wastage.hint' | t }}</p>
        <table class="ia-periods">
          <thead><tr><th>{{ 'settings.wastage.category' | t }}</th><th>{{ 'settings.wastage.rate' | t }}</th><th>{{ 'settings.wastage.source' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (c of categories(); track c.id) {
              <tr>
                <td>{{ c.name }}</td>
                <td><input type="number" min="0" max="100" step="0.01" class="input" style="width: 100px" [(ngModel)]="c.normalWastageRatePct" [attr.aria-label]="'settings.wastage.rate' | t" /></td>
                <td><input class="input" maxlength="255" [(ngModel)]="c.normalWastageSource" [attr.aria-label]="'settings.wastage.source' | t" /></td>
                <td><button class="btn btn-sm btn-secondary" [disabled]="busy()" (click)="saveCategory(c)">{{ 'common.save' | t }}</button></td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <!-- Policies -->
      <section class="ia-section">
        <h4 class="card-title">{{ 'settings.policies.title' | t }}</h4>
        <div class="ia-row">
          <div class="doc-field"><label for="iaRate">{{ 'settings.policies.destructionRate' | t }}</label><input id="iaRate" type="number" min="0" max="100" step="0.01" class="input" [(ngModel)]="pol.destructionRatePct" /></div>
          <div class="doc-field"><label for="iaRateTo">{{ 'settings.policies.destructionRateUntil' | t }}</label><input id="iaRateTo" type="date" class="input" [(ngModel)]="pol.destructionRateValidUntil" /></div>
          <div class="doc-field" style="flex-basis: 320px;"><label for="iaRateRef">{{ 'settings.policies.destructionRateRef' | t }}</label><input id="iaRateRef" class="input" maxlength="100" [(ngModel)]="pol.destructionRateRef" /></div>
        </div>
        <p class="ia-hint">{{ 'settings.policies.destructionHint' | t }}</p>
        <div class="ia-row">
          <div class="doc-field"><label for="iaBb">{{ 'settings.policies.bestBefore' | t }}</label>
            <select id="iaBb" class="select" [(ngModel)]="pol.bestBeforeSalePolicy"><option value="BLOCK">{{ 'settings.policies.bestBefore.BLOCK' | t }}</option><option value="ALLOW">{{ 'settings.policies.bestBefore.ALLOW' | t }}</option></select></div>
          <div class="doc-field"><label for="iaCp">{{ 'settings.policies.countPolicy' | t }}</label>
            <select id="iaCp" class="select" [(ngModel)]="pol.physicalCountPolicy">@for (p of countPolicies; track p) { <option [value]="p">{{ 'settings.policies.count.' + p | t }}</option> }</select></div>
          <div class="doc-field"><label for="iaGs1">{{ 'settings.policies.gs1Prefix' | t }}</label><input id="iaGs1" class="input mono" maxlength="11" [(ngModel)]="pol.gs1CompanyPrefix" /></div>
        </div>
        <p class="ia-hint">{{ 'settings.policies.bestBeforeHint' | t }}</p>
        @if (pol.bestBeforeSalePolicy === 'ALLOW' && savedBestBefore !== 'ALLOW') {
          <div class="doc-field"><label for="iaPolR">{{ 'settings.controlChange.reason' | t }}</label><input id="iaPolR" class="input" maxlength="500" [(ngModel)]="policyReason" /></div>
        }
        <button class="btn btn-primary" [disabled]="busy() || (pol.bestBeforeSalePolicy === 'ALLOW' && savedBestBefore !== 'ALLOW' && !policyReason.trim())" (click)="savePolicies()">{{ 'common.save' | t }}</button>
      </section>
    </div>
  `,
})
export class InventoryAccountingSettingsComponent implements OnInit {
  private api = inject(AccountingService);
  private company = inject(ComplianceService);
  private inventory = inject(InventoryService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  readonly today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  readonly years = [Number(this.today.slice(0, 4)) + 1, Number(this.today.slice(0, 4)), Number(this.today.slice(0, 4)) - 1];
  readonly methods = COSTING_METHODS;
  readonly countPolicies = PHYSICAL_COUNT_POLICIES;

  error = signal<string | null>(null);
  busy = signal(false);
  year = signal(Number(this.today.slice(0, 4)));
  periods = signal<FiscalPeriod[]>([]);
  lockDate = signal<string | null>(null);
  checks = signal<Record<string, CloseCheck[]>>({});
  reopenFor = signal<FiscalPeriod | null>(null);
  reopenReason = '';

  costing = signal<any>(null);
  method = 'WAVG_MOVING';
  effectiveFrom = '';
  methodReason = '';
  openingCsv = '';
  allYears = signal<FiscalPeriod[]>([]);
  openYearStarts = computed(() => this.allYears().filter((p) => p.periodType === 'YEAR' && p.status === 'OPEN').map((p) => p.startDate).sort());

  mapping = signal<any>(null);
  bookkeeping = signal<string | null>(null);
  events = computed<string[]>(() => this.mapping()?.events || []);
  mappingRows = computed(() => {
    const m = this.mapping();
    if (!m) return [];
    const own = m.rows as any[];
    const ownEvents = new Set(own.filter((r) => !r.inventoryClass && !r.categoryId && !r.warehouseId).map((r) => r.event));
    return [...own, ...(m.defaults as any[]).filter((d) => !ownEvents.has(d.event))].sort((a, b) => String(a.event).localeCompare(String(b.event)));
  });
  mEvent = '';
  mDebit = '';
  mCredit = '';

  categories = signal<any[]>([]);
  pol: any = {};
  savedBestBefore = 'BLOCK';
  policyReason = '';

  ngOnInit() {
    this.loadPeriods();
    this.api.periods().subscribe({
      next: (r) => {
        this.allYears.set(r.periods);
        const starts = this.openYearStarts();
        this.effectiveFrom = starts[starts.length - 1] || '';
      },
      error: () => undefined,
    });
    this.loadCosting();
    this.loadMappings();
    this.inventory.getCategories().subscribe({ next: (c: any[]) => this.categories.set(c.map((x) => ({ ...x }))), error: () => undefined });
    this.company.getCompany().subscribe({
      next: (c) => {
        this.bookkeeping.set(c.bookkeepingType ?? null);
        this.pol = {
          destructionRatePct: c.destructionRatePct ?? null,
          destructionRateValidUntil: c.destructionRateValidUntil ?? '',
          destructionRateRef: c.destructionRateRef ?? '',
          bestBeforeSalePolicy: c.bestBeforeSalePolicy || 'BLOCK',
          physicalCountPolicy: c.physicalCountPolicy || 'ANNUAL',
          gs1CompanyPrefix: c.gs1CompanyPrefix ?? '',
        };
        this.savedBestBefore = this.pol.bestBeforeSalePolicy;
      },
      error: () => undefined,
    });
  }

  private fail = (e: unknown) => {
    this.busy.set(false);
    this.error.set(apiError(e, this.i18n.t('common.unknownError')));
  };
  private ok(key: string, params?: Record<string, unknown>) {
    this.busy.set(false);
    this.error.set(null);
    this.ui.showToast(this.i18n.t(key, params), 'success');
  }

  labels(c: CloseCheck) {
    return c.items.slice(0, 3).map((i) => i.label).join(', ') + (c.count > 3 ? '…' : '');
  }

  loadPeriods() {
    this.api.periods(this.year()).subscribe({
      next: (r) => {
        this.periods.set(r.periods.sort((a, b) => a.quarter - b.quarter));
        this.lockDate.set(r.stockLockDate);
      },
      error: this.fail,
    });
  }

  runChecks(p: FiscalPeriod) {
    this.api.periodChecks(p.id).subscribe({
      next: (c) => {
        this.checks.set({ ...this.checks(), [p.id]: c });
        if (!c.length) this.ui.showToast(this.i18n.t('settings.periods.checksOk', { period: p.label }), 'success');
      },
      error: this.fail,
    });
  }

  close(p: FiscalPeriod) {
    this.ui.openConfirm({
      title: this.i18n.t('settings.periods.close'),
      message: this.i18n.t('settings.periods.closeConfirm', { period: p.label }),
      confirmText: this.i18n.t('settings.periods.close'),
      onConfirm: () => {
        this.busy.set(true);
        this.api.closePeriod(p.id).subscribe({
          next: (r) => {
            this.ok('settings.periods.closed', { period: p.label, value: this.i18n.formatMoney(r.snapshot.costValue) });
            this.loadPeriods();
          },
          error: (e) => {
            this.fail(e);
            this.runChecks(p);
          },
        });
      },
    });
  }

  reopen(p: FiscalPeriod) {
    this.busy.set(true);
    this.api.reopenPeriod(p.id, this.reopenReason.trim()).subscribe({
      next: () => {
        this.ok('settings.periods.reopenSent');
        this.reopenFor.set(null);
        this.reopenReason = '';
        this.loadPeriods();
      },
      error: this.fail,
    });
  }

  loadCosting() {
    this.api.costingSettings().subscribe({
      next: (c) => {
        this.costing.set(c);
        this.method = c.pendingCostingMethod || c.costingMethod;
      },
      error: () => undefined,
    });
  }

  changeMethod() {
    this.busy.set(true);
    this.api.changeMethod({ method: this.method, effectiveFrom: this.effectiveFrom, reason: this.methodReason.trim() }).subscribe({
      next: (c) => {
        this.costing.set(c);
        this.methodReason = '';
        this.ok('settings.costing.changed');
      },
      error: this.fail,
    });
  }

  setFx(policy: string) {
    this.api.setFxPolicy(policy).subscribe({ next: (c) => { this.costing.set(c); this.ok('settings.toast.saved'); }, error: this.fail });
  }

  importOpening() {
    this.busy.set(true);
    this.api.importOpeningCosts(this.openingCsv).subscribe({
      next: (r) => {
        this.ok('settings.costing.imported', { updated: r.updated, skipped: r.skipped });
        this.openingCsv = '';
      },
      error: this.fail,
    });
  }

  loadMappings() {
    this.api.mappings().subscribe({ next: (m) => this.mapping.set(m), error: () => undefined });
  }

  addMapping() {
    this.busy.set(true);
    this.api.saveMapping({ event: this.mEvent, debitAccount: this.mDebit.trim(), creditAccount: this.mCredit.trim(), enabled: true }).subscribe({
      next: () => {
        this.ok('settings.toast.saved');
        this.mDebit = '';
        this.mCredit = '';
        this.loadMappings();
      },
      error: this.fail,
    });
  }

  deleteMapping(id: string) {
    this.api.deleteMapping(id).subscribe({ next: () => { this.ok('settings.toast.saved'); this.loadMappings(); }, error: this.fail });
  }

  saveCategory(c: any) {
    this.busy.set(true);
    const rate = c.normalWastageRatePct === '' || c.normalWastageRatePct === null || c.normalWastageRatePct === undefined ? null : Number(c.normalWastageRatePct);
    this.inventory.updateCategory(c.id, { normalWastageRatePct: rate, normalWastageSource: c.normalWastageSource || null } as any).subscribe({ next: () => this.ok('settings.toast.saved'), error: this.fail });
  }

  savePolicies() {
    this.busy.set(true);
    const body: any = {
      destructionRatePct: this.pol.destructionRatePct === '' || this.pol.destructionRatePct === null ? null : Number(this.pol.destructionRatePct),
      destructionRateValidUntil: this.pol.destructionRateValidUntil || null,
      destructionRateRef: this.pol.destructionRateRef || null,
      bestBeforeSalePolicy: this.pol.bestBeforeSalePolicy,
      physicalCountPolicy: this.pol.physicalCountPolicy,
      gs1CompanyPrefix: this.pol.gs1CompanyPrefix || null,
    };
    if (this.pol.bestBeforeSalePolicy === 'ALLOW' && this.savedBestBefore !== 'ALLOW') body.controlChangeReason = this.policyReason.trim();
    this.company.updateCompany(body).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.policyReason = '';
        this.savedBestBefore = c.bestBeforeSalePolicy || 'BLOCK';
        this.pol.bestBeforeSalePolicy = this.savedBestBefore;
        this.ui.showToast(this.i18n.t(c.pendingApproval ? 'settings.controlChange.pending' : 'settings.toast.saved'), c.pendingApproval ? 'info' : 'success');
      },
      error: this.fail,
    });
  }
}
