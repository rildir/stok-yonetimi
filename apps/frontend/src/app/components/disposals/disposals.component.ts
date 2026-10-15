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

interface LineForm { productId: string; lotId: string; warehouseId: string; quantity: number | null; lots: StockLot[] }

/**
 * İmha / zayi dosyaları (VUK 278, 278/A; KDVK 30/c): talep -> başvuru -> karar -> imha edildi,
 * printable tutanak and the yearly VUK 278/A destruction-rate check.
 */
@Component({
  selector: 'app-disposals',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  template: `
    <header class="page-header">
      <div><h1>{{ 'accounting.disposal.title' | t }}</h1><p>{{ 'accounting.disposal.subtitle' | t }}</p></div>
      <div class="page-actions">@if (!ui.isReadonly()) { <button class="btn btn-primary" (click)="openForm()">{{ 'accounting.disposal.new' | t }}</button> }</div>
    </header>

    @if (ratio(); as r) {
      <div class="doc-alert" [class.danger]="r.exceeded" [class.info]="!r.exceeded">
        {{ 'accounting.disposal.ratio' | t: { year: r.year, ratio: (r.overallRatioPct | num), rate: r.assignedRatePct === null ? '-' : (r.assignedRatePct | num) } }}
        @if (r.rateRef) { <span class="text-muted"> · {{ r.rateRef }}</span> }
        @if (r.rateExpired) { <span class="badge badge-warning">{{ 'accounting.disposal.rateExpired' | t }}</span> }
      </div>
    }
    @if (error()) { <div class="doc-alert danger">{{ error() }}</div> }

    <div class="table-card">
      <div class="table-scroll">
        <table class="table-responsive">
          <thead><tr><th>{{ 'accounting.disposal.no' | t }}</th><th>{{ 'accounting.disposal.basis' | t }}</th><th>{{ 'accounting.disposal.reason' | t }}</th><th class="num">{{ 'reports.costValue' | t }}</th><th>{{ 'accounting.disposal.status' | t }}</th><th class="th-actions">{{ 'common.actions' | t }}</th></tr></thead>
          <tbody>
            @for (b of rows(); track b.id) {
              <tr class="clickable-row" (click)="selected.set(b)">
                <td class="mono td-primary"><strong>{{ b.batchNo }}</strong></td>
                <td [attr.data-label]="'accounting.disposal.basis' | t">{{ 'accounting.disposal.basis.' + b.basis | t }}@if (b.disaster) { <span class="badge badge-info">{{ 'accounting.disposal.disaster' | t }}</span> }</td>
                <td [attr.data-label]="'accounting.disposal.reason' | t">{{ b.reason }}</td>
                <td class="num" [attr.data-label]="'reports.costValue' | t">{{ b.totalCost | money }}</td>
                <td [attr.data-label]="'accounting.disposal.status' | t"><span class="badge" [class.badge-success]="b.status === 'DESTROYED'" [class.badge-warning]="b.status === 'REQUESTED' || b.status === 'APPLIED'" [class.badge-info]="b.status === 'DECIDED'">{{ 'accounting.disposal.status.' + b.status | t }}</span></td>
                <td class="td-actions" (click)="$event.stopPropagation()"><button class="btn btn-secondary btn-sm" (click)="api.openPrintable('disposals/' + b.id + '/tutanak')">{{ 'accounting.disposal.tutanak' | t }}</button></td>
              </tr>
            }
            @if (!rows().length) { <tr><td colspan="6"><div class="empty-state"><p class="empty-state-title">{{ 'accounting.disposal.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as b) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="cluster"><span class="drawer-title">{{ 'accounting.disposal.title' | t }}</span><span class="mono text-muted">{{ b.batchNo }}</span></div>
            <button class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'accounting.disposal.basis' | t }}</label><span>{{ 'accounting.disposal.basis.' + b.basis | t }}</span></div>
              <div class="doc-field"><label>{{ 'accounting.disposal.status' | t }}</label><span>{{ 'accounting.disposal.status.' + b.status | t }}</span></div>
              <div class="doc-field"><label>{{ 'accounting.disposal.application' | t }}</label><span>{{ b.applicationDate ? (b.applicationDate | appDate) : '-' }} {{ b.applicationRef }}</span></div>
              <div class="doc-field"><label>{{ 'accounting.disposal.decision' | t }}</label><span>{{ b.decisionDate ? (b.decisionDate | appDate) : '-' }} {{ b.decisionRef }}</span></div>
              @if (b.destroyedAt) { <div class="doc-field"><label>{{ 'accounting.disposal.destroyedAt' | t }}</label><span>{{ b.destroyedAt | appDate: 'datetime' }} · {{ b.destructionPlace }}</span></div> }
            </div>
            <table class="doc-table">
              <thead><tr><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.lot' | t }}</th><th class="num">{{ 'accounting.col.qty' | t }}</th><th class="num">{{ 'reports.costValue' | t }}</th></tr></thead>
              <tbody>@for (l of b.lines; track $index) { <tr><td>{{ l.productName }}</td><td class="mono">{{ l.lotNumber }} @if (l.expiryDate) { · {{ l.expiryDate | appDate }} }</td><td class="num">{{ l.quantity | num }}</td><td class="num">{{ l.totalCost | money }}</td></tr> }</tbody>
            </table>
            @if (!ui.isReadonly() && next(b).length) {
              <div class="doc-section">
                <div class="doc-section-title">{{ 'accounting.disposal.nextStep' | t }}</div>
                <div class="doc-grid">
                  <div class="doc-field"><label for="dsTo">{{ 'accounting.disposal.status' | t }}</label>
                    <select id="dsTo" class="select" [(ngModel)]="toStatus">@for (s of next(b); track s) { <option [value]="s">{{ 'accounting.disposal.status.' + s | t }}</option> }</select></div>
                  @if (toStatus === 'APPLIED') { <div class="doc-field"><label for="dsAr">{{ 'accounting.disposal.applicationRef' | t }}</label><input id="dsAr" class="input" [(ngModel)]="ref" /></div> }
                  @if (toStatus === 'DECIDED') {
                    <div class="doc-field"><label for="dsDr">{{ 'accounting.disposal.decisionRef' | t }}</label><input id="dsDr" class="input" [(ngModel)]="ref" /></div>
                    <div class="doc-field"><label for="dsDv">{{ 'accounting.disposal.decisionValue' | t }}</label><input id="dsDv" type="number" min="0" step="0.01" class="input" [(ngModel)]="decisionValue" /></div>
                  }
                  @if (toStatus === 'DESTROYED') {
                    <div class="doc-field"><label for="dsPl">{{ 'accounting.disposal.place' | t }}</label><input id="dsPl" class="input" [(ngModel)]="place" /></div>
                    <div class="doc-field"><label for="dsW">{{ 'accounting.disposal.witnesses' | t }}</label><input id="dsW" class="input" [(ngModel)]="witnesses" [placeholder]="'accounting.disposal.witnessesHint' | t" /></div>
                  }
                </div>
                @if (toStatus === 'DESTROYED') { <p class="doc-hint">{{ 'accounting.disposal.destroyHint' | t }}</p> }
                <button class="btn btn-primary btn-sm" [disabled]="busy() || !toStatus" (click)="transition(b)">{{ 'common.save' | t }}</button>
              </div>
            }
          </div>
          <div class="drawer-footer"><button class="btn btn-secondary" (click)="api.openPrintable('disposals/' + b.id + '/tutanak')">{{ 'accounting.disposal.tutanak' | t }}</button></div>
        </div>
      </div>
    }

    @if (formOpen()) {
      <div class="drawer-overlay" (click)="formOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="drawer-header"><span class="drawer-title">{{ 'accounting.disposal.new' | t }}</span>
            <button class="drawer-close" (click)="formOpen.set(false)" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
          <div class="drawer-body">
            <div class="doc-grid">
              <div class="doc-field"><label for="dnB">{{ 'accounting.disposal.basis' | t }}</label>
                <select id="dnB" class="select" [(ngModel)]="basis">@for (b of bases; track b) { <option [value]="b">{{ 'accounting.disposal.basis.' + b | t }}</option> }</select></div>
              <div class="doc-field"><label class="doc-check"><input type="checkbox" [(ngModel)]="disaster" /> {{ 'accounting.disposal.disasterLabel' | t }}</label></div>
            </div>
            <div class="doc-field"><label for="dnR">{{ 'accounting.disposal.reason' | t }}</label><input id="dnR" class="input" maxlength="500" [(ngModel)]="reason" /></div>
            <table class="doc-table">
              <thead><tr><th>{{ 'accounting.col.product' | t }}</th><th>{{ 'accounting.col.lot' | t }} / {{ 'accounting.col.warehouse' | t }}</th><th class="num">{{ 'accounting.col.qty' | t }}</th><th></th></tr></thead>
              <tbody>
                @for (l of lines(); track $index) {
                  <tr>
                    <td><select class="select" [(ngModel)]="l.productId" (ngModelChange)="pickProduct(l)" [attr.aria-label]="'accounting.col.product' | t"><option value="">-</option>@for (p of products(); track p.id) { <option [value]="p.id">{{ p.sku }} · {{ p.name }}</option> }</select></td>
                    <td>
                      @if (isLot(l.productId)) {
                        <select class="select" [(ngModel)]="l.lotId" [attr.aria-label]="'accounting.col.lot' | t"><option value="">-</option>@for (lot of l.lots; track lot.id) { <option [value]="lot.id">{{ lot.lotNumber }} · {{ lot.quantity | num }}@if (lot.expiryDate) { · {{ lot.expiryDate | appDate }} }</option> }</select>
                      } @else {
                        <select class="select" [(ngModel)]="l.warehouseId" [attr.aria-label]="'accounting.col.warehouse' | t">@for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }</select>
                      }
                    </td>
                    <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.quantity" [attr.aria-label]="'accounting.col.qty' | t" /></td>
                    <td><button class="btn btn-ghost btn-sm" (click)="removeLine($index)">×</button></td>
                  </tr>
                }
              </tbody>
            </table>
            <button class="btn btn-secondary btn-sm" (click)="addLine()">{{ 'accounting.disposal.addLine' | t }}</button>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" [disabled]="busy() || !reason.trim() || !validLines()" (click)="create()">{{ 'accounting.disposal.create' | t }}</button>
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
