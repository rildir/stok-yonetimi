import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DISPOSAL_BASES, DISPOSAL_TRANSITIONS } from '@stok/tr-compliance';
import { TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, I18nService } from '../../i18n';
import { AccountingService } from '../../services/accounting.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { apiError } from '../../services/documents.service';
import { Product, StockLot, Warehouse } from '../../models/inventory.models';
import { IconComponent } from '../shared/icon.component';

interface LineForm { productId: string; lotId: string; warehouseId: string; quantity: number | null; lots: StockLot[] }

/**
 * İmha / zayi dosyaları (VUK 278, 278/A; KDVK 30/c): talep -> başvuru -> karar -> imha edildi,
 * printable tutanak and the yearly VUK 278/A destruction-rate check.
 */
@Component({
  selector: 'app-disposals',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, IconComponent],
  styleUrls: ['../../drawer.css'],
  host: { '(document:keydown.escape)': 'onEscape()' },
  styles: [`
    .sec { color: var(--fg-3); }
    .ds-notices { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .ds-notices .badge { margin-left: 8px; }
    .ds-table tbody tr { cursor: pointer; }
    .ds-reason { max-width: 360px; color: var(--fg-2); }
    .ds-acts { width: 1%; }
    /* subtitle runs the full header width so the primary lines up with other page headers */
    .page-header p { max-width: none; }

    /* detail drawer */
    .drawer-body > * { flex-shrink: 0; }
    .ds-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .ds-head .mono { font-size: var(--text-sm); color: var(--fg-3); }
    .kv { display: grid; grid-template-columns: minmax(120px, auto) minmax(0, 1fr); gap: 10px 20px; margin: 0; font-size: var(--text-sm); }
    .kv dt { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); padding-top: 1px; }
    .kv dd { margin: 0; color: var(--fg); min-width: 0; overflow-wrap: anywhere; }
    .kv dd .badge { margin-left: 0; }
    .ds-lines { border-radius: var(--radius-md); box-shadow: 0 0 0 1px var(--line); overflow-x: auto; }
    .ds-lines .mono { font-size: var(--text-xs); }
    .ds-lines td.ds-lp { max-width: 150px; }
    .ds-lines td.ds-ll { max-width: 130px; }

    /* new disposal drawer: line editor */
    .drawer-body { gap: 0; }
    .ln-head, .ln { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.6fr) 104px 32px; gap: 8px; align-items: center; }
    .ln-head { font-size: var(--text-xs); font-weight: 500; color: var(--fg-3); padding: 0 2px; }
    .ln-head .r { text-align: right; }
    .ln-list { display: flex; flex-direction: column; gap: 8px; }
    .ln-add { justify-self: start; }
    @media (max-width: 640px) {
      .ds-table td { max-width: none; white-space: normal; }
      .ds-reason { text-align: right; }
      .ds-acts { width: 100%; }
      .kv { grid-template-columns: minmax(0, 1fr); gap: 2px; }
      .kv dd + dt { margin-top: 10px; }
      .ln-head { display: none; }
      .ds-exp { display: none; }
      .ds-lines td.ds-lp { max-width: 120px; }
      .ln { grid-template-columns: minmax(0, 1fr) 96px 32px; padding: 10px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
      .ln > .ln-prod { grid-column: 1 / -1; }
    }
  `],
  template: `
    <header class="page-header">
      <div><h1>{{ 'accounting.disposal.title' | t }}</h1><p>{{ 'accounting.disposal.subtitle' | t }}</p></div>
      <div class="page-actions">
        @if (!ui.isReadonly()) { <button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" />{{ 'accounting.disposal.new' | t }}</button> }
      </div>
    </header>

    @if (ratio() || error()) {
      <div class="ds-notices">
        @if (ratio(); as r) {
          <div class="notice" [class.notice-danger]="r.exceeded" [class.notice-info]="!r.exceeded" role="status">
            <app-icon [name]="r.exceeded ? 'alert' : 'info'" />
            <span class="t">
              {{ 'accounting.disposal.ratio' | t: { year: r.year, ratio: (r.overallRatioPct | num), rate: r.assignedRatePct === null ? '-' : (r.assignedRatePct | num) } }}
              @if (r.rateRef) { <span class="sec"> · {{ r.rateRef }}</span> }
              @if (r.rateExpired) { <span class="badge badge-warning"><span class="dot"></span>{{ 'accounting.disposal.rateExpired' | t }}</span> }
            </span>
          </div>
        }
        @if (error()) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }
      </div>
    }

    <div class="table-card">
      @if (!rows().length) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="trash" /></div>
          <h3>{{ 'accounting.disposal.empty' | t }}</h3>
          <p>{{ 'accounting.disposal.subtitle' | t }}</p>
          @if (!ui.isReadonly()) { <div class="actions"><button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" />{{ 'accounting.disposal.new' | t }}</button></div> }
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive ds-table">
            <thead><tr>
              <th>{{ 'accounting.disposal.no' | t }}</th>
              <th>{{ 'accounting.disposal.basis' | t }}</th>
              <th>{{ 'accounting.disposal.reason' | t }}</th>
              <th class="r">{{ 'reports.costValue' | t }}</th>
              <th>{{ 'accounting.disposal.status' | t }}</th>
              <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
            </tr></thead>
            <tbody>
              @for (b of rows(); track b.id) {
                <tr (click)="selected.set(b)">
                  <td class="td-primary mono">{{ b.batchNo }}</td>
                  <td [attr.data-label]="'accounting.disposal.basis' | t">{{ 'accounting.disposal.basis.' + b.basis | t }}@if (b.disaster) { <span class="badge badge-info">{{ 'accounting.disposal.disaster' | t }}</span> }</td>
                  <td class="ds-reason" [attr.data-label]="'accounting.disposal.reason' | t" [title]="b.reason">{{ b.reason }}</td>
                  <td class="r" [attr.data-label]="'reports.costValue' | t"><b>{{ b.totalCost | money }}</b></td>
                  <td [attr.data-label]="'accounting.disposal.status' | t"><span class="badge" [class.badge-success]="b.status === 'DESTROYED'" [class.badge-warning]="b.status === 'REQUESTED' || b.status === 'APPLIED'" [class.badge-info]="b.status === 'DECIDED'"><span class="dot"></span>{{ 'accounting.disposal.status.' + b.status | t }}</span></td>
                  <td class="td-actions ds-acts" (click)="$event.stopPropagation()"><button type="button" class="btn btn-ghost btn-sm" (click)="api.openPrintable('disposals/' + b.id + '/tutanak')"><app-icon name="printer" size="sm" />{{ 'accounting.disposal.tutanak' | t }}</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (selected(); as b) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel" role="dialog" aria-modal="true" [attr.aria-label]="'accounting.disposal.title' | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="ds-head">
              <span class="drawer-title">{{ 'accounting.disposal.title' | t }}</span>
              <span class="mono">{{ b.batchNo }}</span>
            </div>
            <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            <section class="fsec">
              <dl class="kv">
                <dt>{{ 'accounting.disposal.status' | t }}</dt>
                <dd><span class="badge" [class.badge-success]="b.status === 'DESTROYED'" [class.badge-warning]="b.status === 'REQUESTED' || b.status === 'APPLIED'" [class.badge-info]="b.status === 'DECIDED'"><span class="dot"></span>{{ 'accounting.disposal.status.' + b.status | t }}</span></dd>
                <dt>{{ 'accounting.disposal.basis' | t }}</dt>
                <dd>{{ 'accounting.disposal.basis.' + b.basis | t }}@if (b.disaster) { <span class="badge badge-info">{{ 'accounting.disposal.disaster' | t }}</span> }</dd>
                <dt>{{ 'accounting.disposal.reason' | t }}</dt>
                <dd>{{ b.reason }}</dd>
                <dt>{{ 'accounting.disposal.application' | t }}</dt>
                <dd>{{ b.applicationDate ? (b.applicationDate | appDate) : '—' }} @if (b.applicationRef) { <span class="sec">· {{ b.applicationRef }}</span> }</dd>
                <dt>{{ 'accounting.disposal.decision' | t }}</dt>
                <dd>{{ b.decisionDate ? (b.decisionDate | appDate) : '—' }} @if (b.decisionRef) { <span class="sec">· {{ b.decisionRef }}</span> }</dd>
                @if (b.destroyedAt) {
                  <dt>{{ 'accounting.disposal.destroyedAt' | t }}</dt>
                  <dd>{{ b.destroyedAt | appDate: 'datetime' }} · {{ b.destructionPlace }}</dd>
                }
                <dt>{{ 'reports.costValue' | t }}</dt>
                <dd><b>{{ b.totalCost | money }}</b></dd>
              </dl>
            </section>
            <section class="fsec">
              <div class="fsec-h"><h3>{{ 'invoices.lines' | t }}</h3><span class="aside">{{ ((b.lines?.length || 0) === 1 ? 'accounting.disposal.lineCountOne' : 'accounting.disposal.lineCount') | t: { n: (b.lines?.length || 0 | num) } }}</span></div>
              <div class="ds-lines">
                <table class="tbl">
                  <thead><tr><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.lot' | t }}</th><th class="r">{{ 'accounting.col.qty' | t }}</th><th class="r">{{ 'reports.costValue' | t }}</th></tr></thead>
                  <tbody>@for (l of b.lines; track $index) { <tr><td class="ds-lp" [title]="l.productName">{{ l.productName }}</td><td class="ds-ll"><span class="mono">{{ l.lotNumber || '—' }}</span>@if (l.expiryDate) { <span class="ds-exp sec"> · {{ l.expiryDate | appDate }}</span> }</td><td class="r">{{ l.quantity | num }}</td><td class="r">{{ l.totalCost | money }}</td></tr> }</tbody>
                </table>
              </div>
            </section>
            @if (!ui.isReadonly() && next(b).length) {
              <section class="fsec">
                <div class="fsec-h"><h3>{{ 'accounting.disposal.nextStep' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld" [class.span-2]="toStatus !== 'DECIDED' && toStatus !== 'DESTROYED' && toStatus !== 'APPLIED'">
                    <label class="fld-label" for="dsTo">{{ 'accounting.disposal.status' | t }}</label>
                    <div class="field select">
                      <select id="dsTo" [(ngModel)]="toStatus"><option value="" disabled>{{ 'accounting.disposal.nextStep' | t }}</option>@for (s of next(b); track s) { <option [value]="s">{{ 'accounting.disposal.status.' + s | t }}</option> }</select>
                    </div>
                  </div>
                  @if (toStatus === 'APPLIED') {
                    <div class="fld"><label class="fld-label" for="dsAr">{{ 'accounting.disposal.applicationRef' | t }}</label><div class="field"><input id="dsAr" [(ngModel)]="ref" /></div></div>
                  }
                  @if (toStatus === 'DECIDED') {
                    <div class="fld"><label class="fld-label" for="dsDr">{{ 'accounting.disposal.decisionRef' | t }}</label><div class="field"><input id="dsDr" [(ngModel)]="ref" /></div></div>
                    <div class="fld"><label class="fld-label" for="dsDv">{{ 'accounting.disposal.decisionValue' | t }}</label><div class="field"><input id="dsDv" type="number" min="0" step="0.01" class="num" [(ngModel)]="decisionValue" /></div></div>
                  }
                  @if (toStatus === 'DESTROYED') {
                    <div class="fld"><label class="fld-label" for="dsPl">{{ 'accounting.disposal.place' | t }}</label><div class="field"><input id="dsPl" [(ngModel)]="place" /></div></div>
                    <div class="fld span-2"><label class="fld-label" for="dsW">{{ 'accounting.disposal.witnesses' | t }}</label><div class="field"><input id="dsW" [(ngModel)]="witnesses" [placeholder]="'accounting.disposal.witnessesHint' | t" /></div><div class="fld-help">{{ 'accounting.disposal.witnessesHint' | t }}</div></div>
                  }
                </div>
                @if (toStatus === 'DESTROYED') { <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'accounting.disposal.destroyHint' | t }}</span></div> }
              </section>
            }
          </div>
          <div class="drawer-footer">
            <button type="button" class="btn btn-ghost" (click)="api.openPrintable('disposals/' + b.id + '/tutanak')"><app-icon name="printer" />{{ 'accounting.disposal.tutanak' | t }}</button>
            <span class="spacer"></span>
            @if (!ui.isReadonly() && next(b).length) {
              <button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="busy() || !toStatus" (click)="transition(b)"><span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd></button>
            } @else {
              <button type="button" class="btn" (click)="selected.set(null)">{{ 'common.close' | t }}</button>
            }
          </div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <div class="drawer-overlay" (click)="formOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'accounting.disposal.new' | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'accounting.disposal.new' | t }}</span>
            <button type="button" class="drawer-close" (click)="formOpen.set(false)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            <section class="fsec">
              <div class="fsec-h"><span class="n">1</span><h3>{{ 'documents.section.general' | t }}</h3></div>
              <div class="fld">
                <label class="fld-label" for="dnB">{{ 'accounting.disposal.basis' | t }}</label>
                <div class="field select">
                  <select id="dnB" [(ngModel)]="basis">@for (b of bases; track b) { <option [value]="b">{{ 'accounting.disposal.basis.' + b | t }}</option> }</select>
                </div>
              </div>
              <label class="check"><input type="checkbox" [(ngModel)]="disaster" /><span>{{ 'accounting.disposal.disasterLabel' | t }}</span></label>
              <div class="fld">
                <label class="fld-label" for="dnR">{{ 'accounting.disposal.reason' | t }} <span class="req">*</span></label>
                <div class="field has-area">
                  <textarea id="dnR" maxlength="500" rows="2" [(ngModel)]="reason"></textarea>
                  <span class="counter">{{ reason.length }} / 500</span>
                </div>
              </div>
            </section>
            <section class="fsec">
              <div class="fsec-h"><span class="n">2</span><h3>{{ 'invoices.lines' | t }}</h3><span class="aside">{{ (lines().length === 1 ? 'accounting.disposal.lineCountOne' : 'accounting.disposal.lineCount') | t: { n: (lines().length | num) } }}</span></div>
              @if (lines().length) {
                <div class="ln-head" aria-hidden="true"><span>{{ 'accounting.col.product' | t }}</span><span>{{ 'accounting.col.lot' | t }} / {{ 'accounting.col.warehouse' | t }}</span><span class="r">{{ 'accounting.col.qty' | t }}</span><span></span></div>
              }
              <div class="ln-list">
                @for (l of lines(); track $index) {
                  <div class="ln">
                    <div class="field select ln-prod">
                      <select [(ngModel)]="l.productId" (ngModelChange)="pickProduct(l)" [attr.aria-label]="'accounting.col.product' | t"><option value="" disabled>{{ 'accounting.disposal.pickProduct' | t }}</option>@for (p of products(); track p.id) { <option [value]="p.id">{{ p.sku }} · {{ p.name }}</option> }</select>
                    </div>
                    @if (isLot(l.productId)) {
                      <div class="field select">
                        <select [(ngModel)]="l.lotId" [attr.aria-label]="'accounting.col.lot' | t"><option value="" disabled>{{ 'accounting.disposal.pickLot' | t }}</option>@for (lot of l.lots; track lot.id) { <option [value]="lot.id">{{ lot.lotNumber }} · {{ lot.quantity | num }}@if (lot.expiryDate) { · {{ lot.expiryDate | appDate }} }</option> }</select>
                      </div>
                    } @else {
                      <div class="field select">
                        <select [(ngModel)]="l.warehouseId" [attr.aria-label]="'accounting.col.warehouse' | t"><option value="" disabled>{{ 'accounting.disposal.pickWarehouse' | t }}</option>@for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }</select>
                      </div>
                    }
                    <div class="field"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.quantity" [attr.aria-label]="'accounting.col.qty' | t" placeholder="0" /></div>
                    <button type="button" class="btn btn-ghost btn-icon" (click)="removeLine($index)" [attr.aria-label]="'common.delete' | t"><app-icon name="trash" /></button>
                  </div>
                }
              </div>
              <button type="button" class="btn btn-subtle btn-sm ln-add" (click)="addLine()"><app-icon name="plus" size="sm" />{{ 'accounting.disposal.addLine' | t }}</button>
            </section>
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="busy() || !reason.trim() || !validLines()" (click)="create()"><span>{{ 'accounting.disposal.create' | t }}</span><kbd>Ctrl ↵</kbd></button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DisposalsComponent implements OnInit {
  readonly api = inject(AccountingService);
  readonly ui = inject(UiStateService);
  private i18n = inject(I18nService);
  private inventory = inject(InventoryService);

  readonly bases = DISPOSAL_BASES;
  rows = signal<any[]>([]);
  ratio = signal<any>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  selected = signal<any>(null);
  formOpen = signal(false);
  products = signal<Product[]>([]);
  warehouses = signal<Warehouse[]>([]);
  lines = signal<LineForm[]>([]);
  basis = 'RESMI_KURUM';
  disaster = false;
  reason = '';
  toStatus = '';
  ref = '';
  decisionValue: number | null = null;
  place = '';
  witnesses = '';

  validLines = computed(() => this.lines().length > 0 && this.lines().every((l) => l.productId && Number(l.quantity) > 0 && (this.isLot(l.productId) ? !!l.lotId : !!l.warehouseId)));

  /** Esc closes the open drawer. */
  onEscape() {
    if (this.formOpen()) this.formOpen.set(false);
    else if (this.selected()) this.selected.set(null);
  }

  ngOnInit() {
    this.load();
    this.inventory.getProducts().subscribe({ next: (p) => this.products.set(p), error: () => undefined });
    this.inventory.getWarehouses().subscribe({ next: (w) => this.warehouses.set(w), error: () => undefined });
  }

  load() {
    this.api.disposals().subscribe({ next: (r) => this.rows.set(r), error: (e) => this.error.set(apiError(e, this.i18n.t('common.unknownError'))) });
    this.api.disposalRatio().subscribe({ next: (r) => this.ratio.set(r), error: () => undefined });
  }

  next(b: any): string[] {
    return DISPOSAL_TRANSITIONS[b.status] || [];
  }

  isLot(productId: string) {
    return this.products().find((p) => p.id === productId)?.trackingType === 'lot';
  }

  openForm() {
    this.reason = '';
    this.disaster = false;
    this.lines.set([]);
    this.addLine();
    this.formOpen.set(true);
  }

  addLine() {
    this.lines.set([...this.lines(), { productId: '', lotId: '', warehouseId: this.warehouses()[0]?.id || '', quantity: null, lots: [] }]);
  }

  removeLine(i: number) {
    this.lines.set(this.lines().filter((_, idx) => idx !== i));
  }

  pickProduct(l: LineForm) {
    l.lotId = '';
    l.lots = [];
    if (l.productId && this.isLot(l.productId)) this.inventory.getProductLots(l.productId).subscribe({ next: (lots) => (l.lots = lots.filter((x) => Number(x.quantity) > 0)) });
  }

  create() {
    this.busy.set(true);
    this.api
      .createDisposal({
        basis: this.basis,
        reason: this.reason.trim(),
        disaster: this.disaster,
        lines: this.lines().map((l) => ({ productId: l.productId, lotId: l.lotId || null, warehouseId: this.isLot(l.productId) ? null : l.warehouseId, quantity: Number(l.quantity) })),
      })
      .subscribe({
        next: (b) => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.ui.showToast(this.i18n.t('accounting.disposal.created', { no: b.batchNo }), 'success');
          this.load();
        },
        error: (e) => {
          this.busy.set(false);
          this.ui.showToast(apiError(e, this.i18n.t('common.unknownError')), 'error');
        },
      });
  }

  transition(b: any) {
    this.busy.set(true);
    const body: Record<string, unknown> = { status: this.toStatus };
    if (this.toStatus === 'APPLIED') body['applicationRef'] = this.ref;
    if (this.toStatus === 'DECIDED') Object.assign(body, { decisionRef: this.ref, decisionValue: this.decisionValue });
    if (this.toStatus === 'DESTROYED') Object.assign(body, { destructionPlace: this.place, witnesses: this.witnesses.split(',').map((n) => ({ name: n.trim() })).filter((w) => w.name) });
    this.api.transitionDisposal(b.id, body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.selected.set(r);
        this.toStatus = '';
        this.ref = '';
        this.ui.showToast(this.i18n.t('accounting.disposal.updated'), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('common.unknownError')), 'error');
      },
    });
  }
}
