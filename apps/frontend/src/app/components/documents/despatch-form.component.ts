import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, NumberFormatPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError, nowLocalInput } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { Despatch } from '../../models/documents.models';
import { Order, Product, Warehouse } from '../../models/inventory.models';
import { isValidDriverTckn, isValidTrPlate, transferNeedsDespatch, PAPER_REASONS } from '@stok/tr-compliance';

interface FormLine {
  orderItemId?: string;
  productId?: string;
  name: string;
  max?: number;
  quantity: number | null;
}

/**
 * Sevk irsaliyesi form (VUK 230/5; 509 V.5.3): lines, actual despatch time, carrier, driver (real
 * TCKN) and plate. Used from an order (sales despatch) and for transfers / consignment / repair /
 * sample / subcontract / return despatches. "Approve" numbers the despatch and moves the stock.
 */
@Component({
  selector: 'app-despatch-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, NumberFormatPipe],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`.drawer-overlay.stacked { z-index: 1150; }`],
  template: `
    <div class="drawer-overlay stacked" (click)="closed.emit()">
      <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <span class="drawer-title">{{ (order ? 'despatches.form.titleOrder' : 'despatches.form.title') | t }}</span>
          <button type="button" class="drawer-close" (click)="closed.emit()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="drawer-body">
          @if (order) {
            <div class="doc-alert info">{{ 'despatches.form.orderInfo' | t: { number: order.orderNumber, customer: order.customerName } }}</div>
          } @else {
            <div class="doc-field">
              <label for="dfPurpose">{{ 'despatches.purposeLabel' | t }}</label>
              <select id="dfPurpose" class="select" [(ngModel)]="purpose" [disabled]="lockPurpose">
                @for (p of purposes; track p) { <option [value]="p">{{ 'despatches.purpose.' + p | t }}</option> }
              </select>
            </div>
          }
          <div class="doc-grid">
            <div class="doc-field">
              <label for="dfSource">{{ 'despatches.source' | t }}</label>
              <select id="dfSource" class="select" [(ngModel)]="sourceWarehouseId">
                @for (w of sourceWarehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
              </select>
            </div>
            @if (!order && needsTarget()) {
              <div class="doc-field">
                <label for="dfTarget">{{ 'despatches.target' | t }}</label>
                <select id="dfTarget" class="select" [(ngModel)]="targetWarehouseId">
                  <option value="">{{ 'despatches.selectTarget' | t }}</option>
                  @for (w of targetWarehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                </select>
              </div>
            }
            <div class="doc-field">
              <label for="dfAt">{{ 'despatches.actualDespatchAt' | t }}</label>
              <input id="dfAt" type="datetime-local" class="input" [(ngModel)]="actualDespatchAt" />
            </div>
          </div>
          @if (!order && purpose === 'TRANSFER' && sourceWarehouseId && targetWarehouseId && !sameSite()) {
            <div class="doc-hint">{{ 'despatches.form.transferHint' | t }}</div>
          }

          <div class="doc-section">
            <h4 class="doc-section-title">{{ 'despatches.lines' | t }}</h4>
            <table class="doc-table">
              <thead><tr><th>{{ 'despatches.product' | t }}</th>@if (order) {<th class="num">{{ 'despatches.remaining' | t }}</th>}<th class="num">{{ 'despatches.quantity' | t }}</th>@if (!order) {<th></th>}</tr></thead>
              <tbody>
                @for (l of lines(); track $index) {
                  <tr>
                    <td>
                      @if (order) { {{ l.name }} } @else {
                        <select class="select" [(ngModel)]="l.productId" [attr.aria-label]="'despatches.product' | t">
                          <option value="">{{ 'despatches.selectProduct' | t }}</option>
                          @for (p of products; track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.sku }})</option> }
                        </select>
                      }
                    </td>
                    @if (order) { <td class="num">{{ l.max | num }}</td> }
                    <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.quantity" [attr.aria-label]="'despatches.quantity' | t" /></td>
                    @if (!order) { <td><button type="button" class="btn btn-ghost btn-sm" (click)="removeLine($index)" [attr.aria-label]="'common.delete' | t">✕</button></td> }
                  </tr>
                }
              </tbody>
            </table>
            @if (!order) { <button type="button" class="btn btn-secondary btn-sm" style="margin-top: var(--space-2)" (click)="addLine()">{{ 'despatches.addLine' | t }}</button> }
          </div>

          <div class="doc-section">
            <h4 class="doc-section-title">{{ 'despatches.transport' | t }}</h4>
            <div class="doc-grid">
              <div class="doc-field"><label for="dfCarrier">{{ 'despatches.carrier' | t }}</label><input id="dfCarrier" class="input" [(ngModel)]="carrierName" /></div>
              <div class="doc-field"><label for="dfCarrierVkn">{{ 'despatches.carrierTaxId' | t }}</label><input id="dfCarrierVkn" class="input mono" maxlength="11" [(ngModel)]="carrierTaxId" /></div>
              <div class="doc-field"><label for="dfDrvFirst">{{ 'despatches.driverFirstName' | t }}</label><input id="dfDrvFirst" class="input" [(ngModel)]="driverFirst" /></div>
              <div class="doc-field"><label for="dfDrvLast">{{ 'despatches.driverLastName' | t }}</label><input id="dfDrvLast" class="input" [(ngModel)]="driverLast" /></div>
              <div class="doc-field">
                <label for="dfTckn">{{ 'despatches.driverTckn' | t }}</label>
                <input id="dfTckn" class="input mono" maxlength="11" inputmode="numeric" [(ngModel)]="driverTckn" />
                @if (driverTckn && !tcknOk()) { <span class="form-error">{{ 'despatches.driverTcknInvalid' | t }}</span> }
              </div>
              <div class="doc-field">
                <label for="dfPlate">{{ 'despatches.plate' | t }}</label>
                <input id="dfPlate" class="input mono" maxlength="20" [(ngModel)]="plate" placeholder="34 ABC 123" />
                @if (plate && !plateOk()) { <span class="form-error">{{ 'despatches.plateInvalid' | t }}</span> }
              </div>
              <div class="doc-field"><label for="dfTrailer">{{ 'despatches.trailerPlate' | t }}</label><input id="dfTrailer" class="input mono" maxlength="20" [(ngModel)]="trailer" /></div>
            </div>
          </div>

          @if (eDocumentMode === 'PROVIDER') {
            <div class="doc-section">
              <label class="doc-check"><input type="checkbox" [(ngModel)]="matbudan" /> {{ 'despatches.matbudan' | t }}</label>
              @if (matbudan) {
                <div class="doc-grid-3" style="margin-top: var(--space-2)">
                  <div class="doc-field"><label for="dfPaperNo">{{ 'despatches.paperNo' | t }}</label><input id="dfPaperNo" class="input mono" [(ngModel)]="paperNo" /></div>
                  <div class="doc-field"><label for="dfPaperDate">{{ 'despatches.paperDate' | t }}</label><input id="dfPaperDate" type="date" class="input" [(ngModel)]="paperDate" /></div>
                  <div class="doc-field"><label for="dfPaperReason">{{ 'despatches.paperReason' | t }}</label>
                    <select id="dfPaperReason" class="select" [(ngModel)]="paperReason">@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select>
                  </div>
                </div>
              }
            </div>
          }

          <div class="doc-field doc-section"><label for="dfNote">{{ 'despatches.note' | t }}</label><textarea id="dfNote" class="textarea" rows="2" [(ngModel)]="note"></textarea></div>
          <div class="doc-hint">{{ 'despatches.form.approveHint' | t }}</div>
          @if (error()) { <div class="doc-alert danger" style="margin-top: var(--space-3)">{{ error() }}</div> }
        </div>
        <div class="drawer-footer">
          <button type="button" class="btn btn-secondary" (click)="submit(false)" [disabled]="saving()">{{ 'despatches.saveDraft' | t }}</button>
          <button type="button" class="btn btn-primary" (click)="submit(true)" [disabled]="saving()">
            @if (saving()) { <span class="spinner-sm spinner-light"></span> } {{ 'despatches.saveApprove' | t }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DespatchFormComponent implements OnInit {
  private docs = inject(DocumentsService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  @Input() order: Order | null = null;
  @Input() warehouses: Warehouse[] = [];
  @Input() products: Product[] = [];
  @Input() preset: { purpose?: string; sourceWarehouseId?: string; targetWarehouseId?: string; lines?: { productId: string; quantity: number }[] } | null = null;
  @Input() lockPurpose = false;
  @Input() eDocumentMode = 'NONE';
  @Output() done = new EventEmitter<Despatch>();
  @Output() closed = new EventEmitter<void>();

  purposes = ['TRANSFER', 'CONSIGNMENT', 'REPAIR', 'SAMPLE', 'SUBCONTRACT', 'RETURN'];
  paperReasons = PAPER_REASONS as readonly string[];
  purpose = 'TRANSFER';
  sourceWarehouseId = '';
  targetWarehouseId = '';
  actualDespatchAt = nowLocalInput();
  carrierName = '';
  carrierTaxId = '';
  driverFirst = '';
  driverLast = '';
  driverTckn = '';
  plate = '';
  trailer = '';
  note = '';
  matbudan = false;
  paperNo = '';
  paperDate = '';
  paperReason = 'A';
  lines = signal<FormLine[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    const active = this.warehouses.filter((w) => w.type !== 'IN_TRANSIT');
    this.sourceWarehouseId = this.preset?.sourceWarehouseId || active.find((w) => w.isDefault)?.id || active[0]?.id || '';
    if (this.preset?.purpose) this.purpose = this.preset.purpose;
    if (this.preset?.targetWarehouseId) this.targetWarehouseId = this.preset.targetWarehouseId;
    if (this.order) {
      this.carrierName = this.order.carrier || '';
      this.lines.set(
        (this.order.items || [])
          .map((i) => {
            const max = Math.max(0, Number(i.quantity) - Number((i as any).despatchedQuantity || 0));
            return { orderItemId: i.id as string, name: i.productName, max, quantity: max };
          })
          .filter((l) => l.max > 0),
      );
    } else {
      this.lines.set((this.preset?.lines || []).map((l) => ({ productId: l.productId, name: '', quantity: l.quantity })));
      if (!this.lines().length) this.addLine();
    }
  }

  sourceWarehouses = () => this.warehouses.filter((w) => w.type !== 'IN_TRANSIT');
  targetWarehouses = () => this.warehouses.filter((w) => w.id !== this.sourceWarehouseId && w.type !== 'IN_TRANSIT');
  needsTarget = () => ['TRANSFER', 'CONSIGNMENT', 'REPAIR', 'SUBCONTRACT'].includes(this.purpose);
  sameSite = () => {
    const a = this.warehouses.find((w) => w.id === this.sourceWarehouseId);
    const b = this.warehouses.find((w) => w.id === this.targetWarehouseId);
    return !!a && !!b && !transferNeedsDespatch(a as any, b as any);
  };
  tcknOk = () => isValidDriverTckn(this.driverTckn.trim());
  plateOk = () => isValidTrPlate(this.plate);

  addLine() {
    this.lines.update((l) => [...l, { productId: '', name: '', quantity: 1 }]);
  }
  removeLine(i: number) {
    this.lines.update((l) => l.filter((_, idx) => idx !== i));
  }

  submit(approve: boolean) {
    this.error.set(null);
    if (this.driverTckn && !this.tcknOk()) return this.error.set(this.i18n.t('despatches.driverTcknInvalid'));
    if (this.plate && !this.plateOk()) return this.error.set(this.i18n.t('despatches.plateInvalid'));
    const lines = this.lines()
      .filter((l) => Number(l.quantity) > 0 && (this.order || l.productId))
      .map((l) => (this.order ? { orderItemId: l.orderItemId, quantity: Number(l.quantity) } : { productId: l.productId, quantity: Number(l.quantity) }));
    if (!lines.length) return this.error.set(this.i18n.t('despatches.linesRequired'));
    const body: Record<string, unknown> = {
      sourceWarehouseId: this.sourceWarehouseId || null,
      actualDespatchAt: this.actualDespatchAt || null,
      carrierParty: this.carrierName ? { name: this.carrierName, taxId: this.carrierTaxId || null } : null,
      drivers: this.driverTckn ? [{ firstName: this.driverFirst.trim(), lastName: this.driverLast.trim(), tckn: this.driverTckn.trim() }] : [],
      plates: [this.plate, this.trailer].filter((p) => p && p.trim()).map((p, i) => ({ plate: p.trim(), type: i === 0 ? 'TRUCK' : 'TRAILER' })),
      note: this.note || null,
      lines,
    };
    if (this.matbudan) Object.assign(body, { typeCode: 'MATBUDAN', paperNo: this.paperNo, paperDate: this.paperDate || null, paperReason: this.paperReason });
    if (!this.order) Object.assign(body, { purpose: this.purpose, targetWarehouseId: this.needsTarget() ? this.targetWarehouseId || null : null });
    this.saving.set(true);
    const create$ = this.order ? this.docs.despatchFromOrder(this.order.id, body) : this.docs.createDespatch(body);
    create$.subscribe({
      next: (d) => {
        if (!approve) {
          this.saving.set(false);
          this.ui.showToast(this.i18n.t('despatches.toast.draftSaved'), 'success');
          return this.done.emit(d);
        }
        this.docs.approveDespatch(d.id, {}).subscribe({
          next: (a) => {
            this.saving.set(false);
            this.ui.showToast(this.i18n.t('despatches.toast.approved', { number: a.documentNo }), 'success');
            this.done.emit(a);
          },
          error: (e) => {
            this.saving.set(false);
            // The draft exists: report the approval error and hand the draft back.
            this.ui.showToast(apiError(e, this.i18n.t('despatches.toast.approveError')), 'error');
            this.done.emit(d);
          },
        });
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(apiError(e, this.i18n.t('despatches.toast.saveError')));
      },
    });
  }
}
