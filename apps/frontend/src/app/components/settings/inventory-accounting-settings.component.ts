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
import { IconComponent } from '../shared/icon.component';

/**
 * Settings > Inventory accounting (admin, WP6): fiscal periods (close / reopen with a second
 * administrator), costing method (only from the start of an open fiscal year), account mappings
 * for the journal export, normal wastage rates per category, VUK 278/A destruction rate, sale of
 * best-before (TETT) expired lots, GS1 prefix and the physical count policy.
 */
@Component({
  selector: 'app-inventory-accounting-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, IconComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    :host { display: block; }
    .card-h.sh { padding-block: 12px; min-height: 56px; flex-wrap: wrap; row-gap: 8px; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .form-stack { display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .inline-form { display: flex; flex-direction: column; gap: 14px; box-shadow: inset 0 -1px 0 var(--line); }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 14px; align-items: start; }
    .stack-20 { display: flex; flex-direction: column; gap: 20px; }
    @media (max-width: 1100px) { .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .grid-4 { grid-template-columns: minmax(0, 1fr); } }
    .ia-row { display: flex; gap: 12px 14px; align-items: flex-end; flex-wrap: wrap; }
    .ia-row .fld { flex: 0 1 220px; min-width: 160px; }
    .ia-row .fld.wide { flex: 1 1 300px; }
    .tbl td { white-space: normal; max-width: none; }
    .tbl tr.year td { font-weight: 600; background: var(--surface-2); }
    .ia-check { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; font-size: var(--text-xs); color: var(--warning); }
    .ia-check div { display: flex; align-items: center; gap: 4px; }
    .st-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .reopen { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--surface-2); box-shadow: inset 0 1px 0 var(--line); }
    .card-f { justify-content: flex-end; flex-wrap: wrap; padding-block: 6px; }
    .card-f .fld-help { margin-right: auto; }
    .card-h .field { width: 110px; flex: none; }
    .w-num { width: 120px; }
    .w-num .field { width: 110px; margin-left: auto; }
    .muted-row { color: var(--fg-3); }
    .sec-intro h2 { font-size: var(--text-md); font-weight: 600; letter-spacing: -0.01em; }
    .sec-intro p { margin-top: 2px; font-size: var(--text-xs); color: var(--fg-3); }
    .sub-h { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); }
    @media (max-width: 640px) { .ia-row .fld, .ia-row .fld.wide { flex: 1 1 100%; } .ia-row .btn { width: 100%; } .w-num .field { width: 100%; } }
  `],
  template: `

    <div class="stack-20">
      <div class="sec-intro"><h2>{{ 'accounting.settings.title' | t }}</h2><p>{{ 'accounting.settings.subtitle' | t }}</p></div>
      @if (error()) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }

      <!-- Fiscal periods -->
      <section class="card">
        <div class="card-h sh">
          <div class="hg"><h3>{{ 'settings.periods.title' | t }}</h3><p>{{ 'settings.periods.hint' | t: { lock: lockDate() ? (lockDate()! | appDate) : '-' } }}</p></div>
          <div class="field select field-sm"><select id="iaYear" [attr.aria-label]="'settings.periods.year' | t" [ngModel]="year()" (ngModelChange)="year.set(+$event); loadPeriods()">@for (y of years; track y) { <option [value]="y">{{ y }}</option> }</select></div>
        </div>
        <div class="table-scroll">
          <table class="tbl table-responsive">
            <thead><tr><th>{{ 'settings.periods.period' | t }}</th><th>{{ 'settings.periods.range' | t }}</th><th>{{ 'settings.periods.status' | t }}</th><th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (p of periods(); track p.id) {
                <tr [class.year]="p.periodType === 'YEAR'">
                  <td class="td-primary">{{ p.label }}</td>
                  <td [attr.data-label]="'settings.periods.range' | t">{{ p.startDate | appDate }} – {{ p.endDate | appDate }}</td>
                  <td [attr.data-label]="'settings.periods.status' | t">
                    <div>
                      <span class="st-cell">
                        <span class="badge" [class.badge-success]="p.status === 'OPEN'" [class.badge-neutral]="p.status === 'CLOSED'"><span class="dot"></span>{{ 'settings.periods.' + p.status | t }}</span>
                        @if (p.closedAt && p.status === 'CLOSED') { <span class="text-muted">{{ p.closedBy }} · {{ p.closedAt | appDate }}</span> }
                        @if (p.reopenCount) { <span class="text-muted">· {{ 'settings.periods.reopened' | t: { count: p.reopenCount } }}</span> }
                        @if (p.pendingReopen) { <span class="badge badge-warning"><span class="dot"></span>{{ 'settings.periods.reopenPending' | t }}</span> }
                      </span>
                      @if (checks()[p.id]?.length) { <div class="ia-check">@for (c of checks()[p.id]; track c.code) { <div><app-icon name="warn" size="xs" />{{ 'settings.periods.check.' + c.code | t }}: {{ c.count }} ({{ labels(c) }})</div> }</div> }
                    </div>
                  </td>
                  <td class="td-actions">
                    @if (p.status === 'OPEN' && p.endDate < today) {
                      <button type="button" class="btn btn-xs" (click)="runChecks(p)" [disabled]="busy()"><app-icon name="check" size="xs" />{{ 'settings.periods.checks' | t }}</button>
                      <button type="button" class="btn btn-xs" (click)="close(p)" [disabled]="busy()"><app-icon name="lock" size="xs" />{{ 'settings.periods.close' | t }}</button>
                    }
                    @if (p.status === 'CLOSED' && !p.pendingReopen) {
                      <button type="button" class="btn btn-xs" (click)="reopenFor.set(p)"><app-icon name="refresh" size="xs" />{{ 'settings.periods.reopen' | t }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (reopenFor(); as p) {
          <div class="reopen">
            <div class="fld"><label class="fld-label" for="iaReason">{{ 'settings.periods.reopenReason' | t: { period: p.label } }}</label><div class="field has-area"><textarea id="iaReason" rows="2" maxlength="500" [(ngModel)]="reopenReason"></textarea></div></div>
            <p class="fld-help">{{ 'settings.periods.reopenHint' | t }}</p>
            <div class="form-actions"><button type="button" class="btn btn-ghost" (click)="reopenFor.set(null)">{{ 'common.cancel' | t }}</button>
              <button type="button" class="btn btn-primary" [disabled]="!reopenReason.trim() || busy()" (click)="reopen(p)">{{ 'settings.periods.reopenRequest' | t }}</button></div>
          </div>
        }
      </section>

      <!-- Costing -->
      <section class="card">
        <div class="card-h sh">
          <div class="hg"><h3>{{ 'settings.costing.title' | t }}</h3>
            @if (costing(); as c) {
              <p>{{ 'settings.costing.current' | t: { method: ('settings.costing.' + c.costingMethod | t), from: c.costingMethodEffectiveFrom ? (c.costingMethodEffectiveFrom | appDate) : '-' } }}
                @if (c.pendingCostingMethod) { · {{ 'settings.costing.pending' | t: { method: ('settings.costing.' + c.pendingCostingMethod | t), from: (c.pendingCostingMethodFrom | appDate) } }} }</p>
            }
          </div>
        </div>
        <div class="card-b form-stack">
          @if (costing(); as c) {
            <div class="ia-row">
              <div class="fld"><label class="fld-label" for="iaMethod">{{ 'settings.costing.method' | t }}</label>
                <div class="field select"><select id="iaMethod" [(ngModel)]="method">@for (m of methods; track m) { <option [value]="m">{{ 'settings.costing.' + m | t }}</option> }</select></div></div>
              <div class="fld"><label class="fld-label" for="iaFrom">{{ 'settings.costing.effectiveFrom' | t }}</label>
                <div class="field select"><select id="iaFrom" [(ngModel)]="effectiveFrom">@for (y of openYearStarts(); track y) { <option [value]="y">{{ y | appDate }}</option> }</select></div></div>
              <div class="fld wide"><label class="fld-label" for="iaMr">{{ 'settings.costing.reason' | t }}</label><div class="field"><input id="iaMr" maxlength="300" [(ngModel)]="methodReason" /></div></div>
              <button type="button" class="btn" [disabled]="busy() || !methodReason.trim() || !effectiveFrom" (click)="changeMethod()">{{ 'settings.costing.change' | t }}</button>
            </div>
            <p class="fld-help">{{ 'settings.costing.hint' | t }}</p>
            <div class="ia-row">
              <div class="fld wide"><label class="fld-label" for="iaFx">{{ 'settings.costing.fxPolicy' | t }}</label>
                <div class="field select"><select id="iaFx" [ngModel]="c.postReceiptFxPolicy" (ngModelChange)="setFx($event)"><option value="EXPENSE">{{ 'settings.costing.fx.EXPENSE' | t }}</option><option value="COST">{{ 'settings.costing.fx.COST' | t }}</option></select></div></div>
            </div>
          }
          <div class="fld"><label class="fld-label" for="iaCsv">{{ 'settings.costing.openingCsv' | t }}</label>
            <div class="field has-area"><textarea id="iaCsv" class="mono" rows="3" [(ngModel)]="openingCsv" placeholder="sku;lotNumber;unitCost"></textarea></div></div>
          <div class="form-actions"><button type="button" class="btn" [disabled]="!openingCsv.trim() || busy()" (click)="importOpening()"><app-icon name="upload" />{{ 'settings.costing.import' | t }}</button></div>
        </div>
      </section>

      <!-- Account mappings -->
      <section class="card">
        <div class="card-h sh"><div class="hg"><h3>{{ 'settings.mappings.title' | t }}</h3><p>{{ (bookkeeping() === 'BILANCO' ? 'settings.mappings.hint' : 'settings.mappings.notBilanco') | t }}</p></div></div>
        <div class="table-scroll">
          <table class="tbl table-responsive">
            <thead><tr><th>{{ 'settings.mappings.event' | t }}</th><th>{{ 'settings.mappings.debit' | t }}</th><th>{{ 'settings.mappings.credit' | t }}</th><th>{{ 'settings.mappings.scope' | t }}</th><th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (r of mappingRows(); track $index) {
                <tr>
                  <td class="td-primary">{{ 'accounting.event.' + r.event | t }}</td>
                  <td class="mono" [attr.data-label]="'settings.mappings.debit' | t">{{ r.debitAccount }}</td>
                  <td class="mono" [attr.data-label]="'settings.mappings.credit' | t">{{ r.creditAccount }}</td>
                  <td [attr.data-label]="'settings.mappings.scope' | t">@if (r.id) { <span class="badge badge-info"><span class="dot"></span>{{ 'settings.mappings.company' | t }}</span> } @else { <span class="text-muted">{{ 'settings.mappings.default' | t }}</span> } @if (r.enabled === false) { <span class="badge badge-neutral"><span class="dot"></span>{{ 'settings.mappings.disabled' | t }}</span> }</td>
                  <td class="td-actions">@if (r.id) { <button type="button" class="btn btn-ghost btn-xs btn-icon" (click)="deleteMapping(r.id)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" size="sm" /></button> }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="card-b reopen">
          <div class="ia-row">
            <div class="fld"><label class="fld-label" for="iaEv">{{ 'settings.mappings.event' | t }}</label>
              <div class="field select"><select id="iaEv" [(ngModel)]="mEvent">@for (e of events(); track e) { <option [value]="e">{{ 'accounting.event.' + e | t }}</option> }</select></div></div>
            <div class="fld"><label class="fld-label" for="iaDr">{{ 'settings.mappings.debit' | t }}</label><div class="field"><input id="iaDr" class="mono" [(ngModel)]="mDebit" placeholder="{STOCK} / 760.01" /></div></div>
            <div class="fld"><label class="fld-label" for="iaCr">{{ 'settings.mappings.credit' | t }}</label><div class="field"><input id="iaCr" class="mono" [(ngModel)]="mCredit" placeholder="{STOCK}" /></div></div>
            <button type="button" class="btn btn-subtle" [disabled]="!mEvent || !mDebit || !mCredit || busy()" (click)="addMapping()"><app-icon name="plus" />{{ 'settings.mappings.add' | t }}</button>
          </div>
        </div>
      </section>

      <!-- Wastage per category -->
      <section class="card">
        <div class="card-h sh"><div class="hg"><h3>{{ 'settings.wastage.title' | t }}</h3><p>{{ 'settings.wastage.hint' | t }}</p></div></div>
        <div class="table-scroll">
          <table class="tbl table-responsive">
            <thead><tr><th>{{ 'settings.wastage.category' | t }}</th><th class="r">{{ 'settings.wastage.rate' | t }}</th><th>{{ 'settings.wastage.source' | t }}</th><th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (c of categories(); track c.id) {
                <tr>
                  <td class="td-primary">{{ c.name }}</td>
                  <td class="w-num" [attr.data-label]="'settings.wastage.rate' | t"><div class="field field-sm"><input type="number" min="0" max="100" step="0.01" class="num" [(ngModel)]="c.normalWastageRatePct" [attr.aria-label]="'settings.wastage.rate' | t" /><span class="affix inline-suf">%</span></div></td>
                  <td [attr.data-label]="'settings.wastage.source' | t"><div class="field field-sm"><input maxlength="255" [(ngModel)]="c.normalWastageSource" [attr.aria-label]="'settings.wastage.source' | t" /></div></td>
                  <td class="td-actions"><button type="button" class="btn btn-xs" [disabled]="busy()" (click)="saveCategory(c)">{{ 'common.save' | t }}</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- Policies -->
      <section class="card">
        <div class="card-h"><h3>{{ 'settings.policies.title' | t }}</h3></div>
        <div class="card-b form-stack">
          <div class="ia-row">
            <div class="fld"><label class="fld-label" for="iaRate">{{ 'settings.policies.destructionRate' | t }}</label><div class="field"><input id="iaRate" type="number" min="0" max="100" step="0.01" class="num" [(ngModel)]="pol.destructionRatePct" /><span class="affix suf">%</span></div></div>
            <div class="fld"><label class="fld-label" for="iaRateTo">{{ 'settings.policies.destructionRateUntil' | t }}</label><div class="field"><input id="iaRateTo" type="date" [(ngModel)]="pol.destructionRateValidUntil" /></div></div>
            <div class="fld wide"><label class="fld-label" for="iaRateRef">{{ 'settings.policies.destructionRateRef' | t }}</label><div class="field"><input id="iaRateRef" maxlength="100" [(ngModel)]="pol.destructionRateRef" /></div></div>
          </div>
          <p class="fld-help">{{ 'settings.policies.destructionHint' | t }}</p>
          <div class="ia-row">
            <div class="fld"><label class="fld-label" for="iaBb">{{ 'settings.policies.bestBefore' | t }}</label>
              <div class="field select"><select id="iaBb" [(ngModel)]="pol.bestBeforeSalePolicy"><option value="BLOCK">{{ 'settings.policies.bestBefore.BLOCK' | t }}</option><option value="ALLOW">{{ 'settings.policies.bestBefore.ALLOW' | t }}</option></select></div></div>
            <div class="fld wide"><label class="fld-label" for="iaCp">{{ 'settings.policies.countPolicy' | t }}</label>
              <div class="field select"><select id="iaCp" [(ngModel)]="pol.physicalCountPolicy">@for (p of countPolicies; track p) { <option [value]="p">{{ 'settings.policies.count.' + p | t }}</option> }</select></div></div>
            <div class="fld"><label class="fld-label" for="iaGs1">{{ 'settings.policies.gs1Prefix' | t }}</label><div class="field"><input id="iaGs1" class="mono" maxlength="11" [(ngModel)]="pol.gs1CompanyPrefix" /></div></div>
          </div>
          <p class="fld-help">{{ 'settings.policies.bestBeforeHint' | t }}</p>
          @if (pol.bestBeforeSalePolicy === 'ALLOW' && savedBestBefore !== 'ALLOW') {
            <div class="fld"><label class="fld-label" for="iaPolR">{{ 'settings.controlChange.reason' | t }} <span class="req">*</span></label><div class="field"><input id="iaPolR" maxlength="500" [(ngModel)]="policyReason" /></div></div>
          }
        </div>
        <div class="card-f">
          <button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="busy() || (pol.bestBeforeSalePolicy === 'ALLOW' && savedBestBefore !== 'ALLOW' && !policyReason.trim())" (click)="savePolicies()"><span>{{ 'common.save' | t }}</span></button>
        </div>
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
