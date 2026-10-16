import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, NumberFormatPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError, nowLocalInput } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { Despatch } from '../../models/documents.models';
import { Order, Product, Warehouse } from '../../models/inventory.models';
import { isValidDriverTckn, isValidTrPlate, transferNeedsDespatch, PAPER_REASONS } from '@stok/tr-compliance';
import { SpecialCategoryWarningComponent } from '../shared/special-category-warning.component';
import { IconComponent } from '../shared/icon.component';

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
  imports: [CommonModule, FormsModule, TranslatePipe, NumberFormatPipe, SpecialCategoryWarningComponent, IconComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`
    .drawer-overlay.stacked { z-index: 1150; }
    .notice > app-icon { color: var(--tone); }
    .drawer-body.fbody { gap: 0; padding-top: 0; }
    .fbody > .fsec:first-child { padding-top: 16px; }
    .fbody > .notice { margin-top: 16px; align-items: flex-start; }
    .fbody > .notice > app-icon { margin-top: 1px; }
    .line-tbl td { padding-top: 6px; padding-bottom: 6px; }
    .line-tbl .field { width: 100%; }
    .line-tbl td.qty-cell { width: 124px; }
    .line-tbl td.qty-cell .field { width: 112px; margin-left: auto; }
    .line-tbl td.x-cell, .line-tbl th.x-cell { width: 40px; padding: 0 4px; text-align: right; }
    .add-line { justify-self: start; }
  `],
  template: `
    <div class="drawer-overlay stacked" (click)="closed.emit()" (document:keydown.escape)="closed.emit()">
      <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="(order ? 'despatches.form.titleOrder' : 'despatches.form.title') | t" (click)="$event.stopPropagation()">
        <div class="drawer-h">
          <div class="t">
            <div class="eyebrow"><app-icon name="truck" size="sm" />{{ 'despatches.title' | t }}@if (order) { <span class="sep">/</span><span class="mono">{{ order.orderNumber }}</span> }</div>
            <h2>{{ (order ? 'despatches.form.titleOrder' : 'despatches.form.title') | t }}</h2>
          </div>
          <div class="tools">
            <button type="button" class="drawer-close" (click)="closed.emit()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
        </div>
        <div class="drawer-body fbody">
          @if (order) {
            <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'despatches.form.orderInfo' | t: { number: order.orderNumber, customer: order.customerName } }}</span></div>
          }

          <section class="fsec">
            <div class="fsec-h"><span class="n">1</span><h3>{{ 'documents.section.general' | t }}</h3></div>
            @if (!order) {
              <div class="fld">
                <label class="fld-label" for="dfPurpose">{{ 'despatches.purposeLabel' | t }}</label>
                <div class="field select"><select id="dfPurpose" [(ngModel)]="purpose" [disabled]="lockPurpose">
                  @for (p of purposes; track p) { <option [value]="p">{{ 'despatches.purpose.' + p | t }}</option> }
                </select></div>
              </div>
            }
            <div class="grid-2">
              <div class="fld">
                <label class="fld-label" for="dfSource">{{ 'despatches.source' | t }}</label>
                <div class="field select"><select id="dfSource" [(ngModel)]="sourceWarehouseId">
                  @for (w of sourceWarehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                </select></div>
              </div>
              @if (!order && needsTarget()) {
                <div class="fld">
                  <label class="fld-label" for="dfTarget">{{ 'despatches.target' | t }}</label>
                  <div class="field select"><select id="dfTarget" [(ngModel)]="targetWarehouseId">
                    <option value="">{{ 'despatches.selectTarget' | t }}</option>
                    @for (w of targetWarehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                  </select></div>
                </div>
              }
              <div class="fld">
                <label class="fld-label" for="dfAt">{{ 'despatches.actualDespatchAt' | t }}</label>
                <div class="field"><input id="dfAt" type="datetime-local" [(ngModel)]="actualDespatchAt" /></div>
              </div>
            </div>
            @if (!order && purpose === 'TRANSFER' && sourceWarehouseId && targetWarehouseId && !sameSite()) {
              <div class="fld-help">{{ 'despatches.form.transferHint' | t }}</div>
            }
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">2</span><h3>{{ 'despatches.lines' | t }}</h3></div>
            <table class="doc-table line-tbl">
              <thead><tr><th>{{ 'despatches.product' | t }}</th>@if (order) {<th class="num">{{ 'despatches.remaining' | t }}</th>}<th class="num">{{ 'despatches.quantity' | t }}</th>@if (!order) {<th class="x-cell"><span class="sr-only">{{ 'common.delete' | t }}</span></th>}</tr></thead>
              <tbody>
                @for (l of lines(); track $index) {
                  <tr>
                    <td>
                      @if (order) { {{ l.name }} } @else {
                        <div class="field field-sm select"><select [(ngModel)]="l.productId" [attr.aria-label]="'despatches.product' | t">
                          <option value="">{{ 'despatches.selectProduct' | t }}</option>
                          @for (p of products; track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.sku }})</option> }
                        </select></div>
                      }
                    </td>
                    @if (order) { <td class="num">{{ l.max | num }}</td> }
                    <td class="num qty-cell"><div class="field field-sm"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.quantity" [attr.aria-label]="'despatches.quantity' | t" /></div></td>
                    @if (!order) { <td class="x-cell"><button type="button" class="btn btn-ghost btn-xs btn-icon" (click)="removeLine($index)" [attr.aria-label]="'common.delete' | t"><app-icon name="x" size="sm" /></button></td> }
                  </tr>
                }
              </tbody>
            </table>
            @if (!order) { <button type="button" class="btn btn-subtle btn-sm add-line" (click)="addLine()"><app-icon name="plus" size="sm" />{{ 'despatches.addLine' | t }}</button> }
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">3</span><h3>{{ 'despatches.transport' | t }}</h3></div>
            <div class="grid-2">
              <div class="fld"><label class="fld-label" for="dfCarrier">{{ 'despatches.carrier' | t }}</label><div class="field"><input id="dfCarrier" [(ngModel)]="carrierName" /></div></div>
              <div class="fld"><label class="fld-label" for="dfCarrierVkn">{{ 'despatches.carrierTaxId' | t }}</label><div class="field"><input id="dfCarrierVkn" class="mono" maxlength="11" inputmode="numeric" [(ngModel)]="carrierTaxId" /></div></div>
              <div class="fld"><label class="fld-label" for="dfDrvFirst">{{ 'despatches.driverFirstName' | t }}</label><div class="field"><input id="dfDrvFirst" [(ngModel)]="driverFirst" /></div></div>
              <div class="fld"><label class="fld-label" for="dfDrvLast">{{ 'despatches.driverLastName' | t }}</label><div class="field"><input id="dfDrvLast" [(ngModel)]="driverLast" /></div></div>
              <div class="fld">
                <label class="fld-label" for="dfTckn">{{ 'despatches.driverTckn' | t }}</label>
                <div class="field"><input id="dfTckn" class="mono" maxlength="11" inputmode="numeric" [(ngModel)]="driverTckn" [attr.aria-invalid]="!!driverTckn && !tcknOk()" aria-describedby="dfTcknErr" /></div>
                @if (driverTckn && !tcknOk()) { <div class="fld-error" id="dfTcknErr"><app-icon name="alert" size="sm" />{{ 'despatches.driverTcknInvalid' | t }}</div> }
              </div>
              <div class="fld">
                <label class="fld-label" for="dfPlate">{{ 'despatches.plate' | t }}</label>
                <div class="field"><input id="dfPlate" class="mono" maxlength="20" [(ngModel)]="plate" placeholder="34 ABC 123" [attr.aria-invalid]="!!plate && !plateOk()" aria-describedby="dfPlateErr" /></div>
                @if (plate && !plateOk()) { <div class="fld-error" id="dfPlateErr"><app-icon name="alert" size="sm" />{{ 'despatches.plateInvalid' | t }}</div> }
              </div>
              <div class="fld"><label class="fld-label" for="dfTrailer">{{ 'despatches.trailerPlate' | t }}</label><div class="field"><input id="dfTrailer" class="mono" maxlength="20" [(ngModel)]="trailer" /></div></div>
            </div>
          </section>

          @if (eDocumentMode === 'PROVIDER') {
            <section class="fsec">
              <div class="fsec-h"><span class="n">4</span><h3>{{ 'documents.section.paper' | t }}</h3></div>
              <label class="check"><input type="checkbox" [(ngModel)]="matbudan" />{{ 'despatches.matbudan' | t }}</label>
              @if (matbudan) {
                <div class="grid-3">
                  <div class="fld"><label class="fld-label" for="dfPaperNo">{{ 'despatches.paperNo' | t }}</label><div class="field"><input id="dfPaperNo" class="mono" [(ngModel)]="paperNo" /></div></div>
                  <div class="fld"><label class="fld-label" for="dfPaperDate">{{ 'despatches.paperDate' | t }}</label><div class="field"><input id="dfPaperDate" type="date" [(ngModel)]="paperDate" /></div></div>
                  <div class="fld"><label class="fld-label" for="dfPaperReason">{{ 'despatches.paperReason' | t }}</label>
                    <div class="field select"><select id="dfPaperReason" [(ngModel)]="paperReason">@for (r of paperReasons; track r) { <option [value]="r">{{ 'despatches.paperReasons.' + r | t }}</option> }</select></div>
                  </div>
                </div>
              }
            </section>
          }

          <section class="fsec">
            <div class="fsec-h"><span class="n">{{ eDocumentMode === 'PROVIDER' ? 5 : 4 }}</span><h3>{{ 'documents.section.note' | t }}</h3></div>
            <div class="fld">
              <label class="fld-label" for="dfNote">{{ 'despatches.note' | t }}</label>
              <div class="field has-area"><textarea id="dfNote" rows="2" [(ngModel)]="note"></textarea></div>
              <app-special-category-warning [text]="note" />
              <div class="fld-help">{{ 'despatches.form.approveHint' | t }}</div>
            </div>
          </section>
          @if (error()) { <div class="notice notice-danger"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }
        </div>
        <div class="drawer-footer">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" (click)="closed.emit()">{{ 'common.cancel' | t }}</button>
          <button type="button" class="btn" (click)="submit(false)" [disabled]="saving()">{{ 'despatches.saveDraft' | t }}</button>
          <button type="button" class="btn btn-primary" [class.is-loading]="saving()" (click)="submit(true)" [disabled]="saving()"><span>{{ 'despatches.saveApprove' | t }}</span><kbd>Ctrl ↵</kbd></button>
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
