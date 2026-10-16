import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, NumberFormatPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError, nowLocalInput } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { GoodsReceipt } from '../../models/documents.models';
import { Product, PurchaseOrder, Warehouse } from '../../models/inventory.models';
import { receiptSplit, REJECT_REASONS } from '@stok/tr-compliance';
import { SpecialCategoryWarningComponent } from '../shared/special-category-warning.component';
import { IconComponent } from '../shared/icon.component';

interface ReceiptLine {
  purchaseOrderItemId: string;
  name: string;
  tracking: string;
  hasExpiry: boolean;
  ordered: number;
  received: number;
  despatchQuantity: number | null;
  countedQuantity: number | null;
  rejectedQuantity: number | null;
  rejectReason: string;
  lotNumber: string;
  expiryDate: string;
  serials: string;
}

/**
 * Mal kabul (R11): per line the quantity on the supplier's despatch, the counted and rejected
 * quantities; only the accepted quantity enters stock, differences are shown as tesellüm fazlası /
 * noksanı. Supplier despatch / invoice numbers for the three-way match.
 */
@Component({
  selector: 'app-goods-receipt-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, NumberFormatPipe, SpecialCategoryWarningComponent, IconComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`
    .drawer-h .eyebrow .mono { flex: none; white-space: nowrap; }
    .drawer-h .eyebrow .truncate { min-width: 0; }
    .drawer-overlay.stacked { z-index: 1150; }
    .drawer-overlay.stacked .drawer-panel { z-index: 1151; }
    .grf-scroll { overflow-x: auto; border-radius: var(--radius-md); }
    .grf-table td { vertical-align: top; padding-top: 8px; padding-bottom: 8px; }
    .grf-table td.num { white-space: nowrap; }
    .grf-pname { font-weight: 500; }
    .grf-sub { margin-top: 2px; font-size: var(--text-xs); color: var(--fg-3); }
    .grf-ord { color: var(--fg-2); padding-top: 14px !important; }
    .grf-in .field { width: 104px; margin-left: auto; }
    .grf-reason { margin-top: 6px; width: 104px; margin-left: auto; }
    .grf-acc { padding-top: 14px !important; }
    .grf-acc b { font-weight: 600; font-size: var(--text-sm); }
    .diff { margin-top: 6px; }
    .grf-track td { background: var(--surface-2); }
    .grf-track-in { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; padding: 2px 0 4px; }
    .grf-track-in .fld { flex: 0 1 220px; min-width: 0; }
    .grf-track-in .grf-serials { flex: 1 1 320px; }
    @media (max-width: 640px) {
      .grf-scroll { overflow: visible; }
      .grf-table thead { display: none; }
      .grf-table, .grf-table tbody { display: block; }
      .grf-table tr.grf-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 10px; padding: 12px; box-shadow: inset 0 -1px 0 var(--line); }
      .grf-table tr.grf-row td { display: block; height: auto; padding: 0 !important; box-shadow: none; text-align: left; }
      .grf-table td.grf-prod { grid-column: 1 / -1; }
      .grf-table td.grf-in::before { content: attr(data-label); display: block; margin-bottom: 4px; font: 500 var(--text-xs)/1.3 var(--font-sans); color: var(--fg-3); white-space: normal; }
      .grf-table tr.grf-row td.grf-ord, .grf-table tr.grf-row td.grf-acc { grid-column: 1 / -1; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 8px; }
      .grf-table td.grf-ord::before, .grf-table td.grf-acc::before { content: attr(data-label); font: 500 var(--text-xs)/1.3 var(--font-sans); color: var(--fg-3); }
      .grf-table tr.grf-row td.grf-acc { padding-top: 8px !important; box-shadow: inset 0 1px 0 var(--line); }
      .grf-table td.grf-acc .diff { flex-basis: 100%; text-align: right; margin-top: 0; }
      .grf-in .field, .grf-reason { width: 100%; }
      .grf-table tr.grf-track { display: block; }
      .grf-table tr.grf-track td { display: block; height: auto; padding: 10px 12px; }
      .grf-track-in .fld { flex: 1 1 100%; }
    }
  `],
  template: `
    <div class="drawer-overlay stacked" (click)="closed.emit()" (document:keydown.escape)="closed.emit()">
      <div class="drawer-panel drawer-panel-xl" role="dialog" aria-modal="true" [attr.aria-label]="'goodsReceipt.formTitle' | t" (click)="$event.stopPropagation()">
        <header class="drawer-h">
          <div class="t">
            <div class="eyebrow"><app-icon name="box-in" size="sm" /><span class="mono">{{ po.poNumber }}</span><span class="sep">/</span><span class="truncate">{{ po.supplierName }}</span></div>
            <h2>{{ 'goodsReceipt.formTitle' | t }}</h2>
          </div>
          <div class="tools">
            <button type="button" class="drawer-close" (click)="closed.emit()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
        </header>
        <div class="drawer-body drawer-b">
          <section class="fsec">
            <div class="fsec-h"><span class="n">1</span><h3>{{ 'goodsReceipt.section.docs' | t }}</h3><p>{{ 'goodsReceipt.section.docsSub' | t }}</p></div>
            <div class="grid-3">
              <div class="fld">
                <label class="fld-label" for="grWh">{{ 'goodsReceipt.warehouse' | t }}</label>
                <div class="field select"><span class="lead"><app-icon name="warehouse" size="sm" /></span>
                  <select id="grWh" [(ngModel)]="warehouseId">@for (w of warehouses; track w.id) { <option [value]="w.id">{{ w.name }}</option> }</select>
                </div>
              </div>
              <div class="fld">
                <label class="fld-label" for="grAt">{{ 'goodsReceipt.receivedAt' | t }}</label>
                <div class="field"><input id="grAt" type="datetime-local" [(ngModel)]="receivedAt" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="grDn">{{ 'goodsReceipt.supplierDespatchNo' | t }}</label>
                <div class="field"><input id="grDn" class="mono" [(ngModel)]="supplierDespatchNo" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="grDd">{{ 'goodsReceipt.supplierDespatchDate' | t }}</label>
                <div class="field"><input id="grDd" type="date" [(ngModel)]="supplierDespatchDate" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="grIn">{{ 'goodsReceipt.supplierInvoiceNo' | t }}<span class="opt">{{ 'goodsReceipt.optional' | t }}</span></label>
                <div class="field"><input id="grIn" class="mono" [(ngModel)]="supplierInvoiceNo" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="grId">{{ 'goodsReceipt.supplierInvoiceDate' | t }}<span class="opt">{{ 'goodsReceipt.optional' | t }}</span></label>
                <div class="field"><input id="grId" type="date" [(ngModel)]="supplierInvoiceDate" /></div>
              </div>
            </div>
            <label class="check"><input type="checkbox" [(ngModel)]="buyerCarries" />{{ 'goodsReceipt.buyerCarries' | t }}</label>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">2</span><h3>{{ 'purchaseOrders.items' | t }}</h3><p>{{ 'goodsReceipt.formHint' | t }}</p></div>
            <div class="grf-scroll">
              <table class="doc-table grf-table">
                <thead><tr>
                  <th>{{ 'despatches.product' | t }}</th><th class="num">{{ 'goodsReceipt.ordered' | t }}</th><th class="num">{{ 'goodsReceipt.despatchQty' | t }}</th>
                  <th class="num">{{ 'goodsReceipt.counted' | t }}</th><th class="num">{{ 'goodsReceipt.rejected' | t }}</th><th class="num">{{ 'goodsReceipt.accepted' | t }}</th>
                </tr></thead>
                <tbody>
                  @for (l of lines(); track l.purchaseOrderItemId) {
                    <tr class="grf-row">
                      <td class="grf-prod"><div class="grf-pname">{{ l.name }}</div><div class="grf-sub">{{ 'goodsReceipt.alreadyReceived' | t: { qty: (l.received | num) } }}</div></td>
                      <td class="num grf-ord" [attr.data-label]="'goodsReceipt.ordered' | t">{{ l.ordered | num }}</td>
                      <td class="num grf-in" [attr.data-label]="'goodsReceipt.despatchQty' | t"><div class="field field-sm"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.despatchQuantity" [attr.aria-label]="('goodsReceipt.despatchQty' | t) + ' · ' + l.name" /></div></td>
                      <td class="num grf-in" [attr.data-label]="'goodsReceipt.counted' | t"><div class="field field-sm"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.countedQuantity" [attr.aria-label]="('goodsReceipt.counted' | t) + ' · ' + l.name" /></div></td>
                      <td class="num grf-in" [attr.data-label]="'goodsReceipt.rejected' | t">
                        <div class="field field-sm"><input type="number" min="0" step="any" class="num" [(ngModel)]="l.rejectedQuantity" [attr.aria-label]="('goodsReceipt.rejected' | t) + ' · ' + l.name" /></div>
                        @if (Number(l.rejectedQuantity) > 0) {
                          <div class="field field-sm select grf-reason"><select [(ngModel)]="l.rejectReason" [attr.aria-label]="'goodsReceipt.rejected' | t">@for (r of rejectReasons; track r) { <option [value]="r">{{ 'goodsReceipt.reject.' + r | t }}</option> }</select></div>
                        }
                      </td>
                      <td class="num grf-acc" [attr.data-label]="'goodsReceipt.accepted' | t">
                        <b>{{ split(l).accepted | num }}</b>
                        @if (split(l).surplus) { <div class="diff"><span class="badge badge-warning"><span class="dot"></span>{{ 'goodsReceipt.surplus' | t: { qty: (split(l).surplus | num) } }}</span></div> }
                        @if (split(l).shortage) { <div class="diff"><span class="badge badge-danger"><span class="dot"></span>{{ 'goodsReceipt.shortage' | t: { qty: (split(l).shortage | num) } }}</span></div> }
                      </td>
                    </tr>
                    @if (l.tracking === 'lot' && split(l).accepted > 0) {
                      <tr class="grf-track"><td colspan="6">
                        <div class="grf-track-in">
                          <div class="fld">
                            <label class="fld-label" [for]="'grLot' + $index">{{ 'documents.lot' | t }}</label>
                            <div class="field field-sm"><input [id]="'grLot' + $index" class="mono" [(ngModel)]="l.lotNumber" /></div>
                          </div>
                          <div class="fld">
                            <label class="fld-label" [for]="'grExp' + $index">{{ 'goodsReceipt.expiry' | t }} @if (l.hasExpiry) { <span class="req">*</span> }</label>
                            <div class="field field-sm"><input [id]="'grExp' + $index" type="date" [(ngModel)]="l.expiryDate" [required]="l.hasExpiry" /></div>
                          </div>
                        </div>
                      </td></tr>
                    }
                    @if (l.tracking === 'serial' && split(l).accepted > 0) {
                      <tr class="grf-track"><td colspan="6">
                        <div class="grf-track-in">
                          <div class="fld grf-serials">
                            <label class="fld-label" [for]="'grSer' + $index">{{ 'goodsReceipt.serials' | t }}</label>
                            <div class="field has-area"><textarea [id]="'grSer' + $index" class="mono" rows="2" [(ngModel)]="l.serials" [placeholder]="'goodsReceipt.serialsHint' | t"></textarea></div>
                          </div>
                        </div>
                      </td></tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">3</span><h3>{{ 'despatches.note' | t }}</h3></div>
            <div class="fld">
              <div class="field has-area"><textarea id="grNote" rows="2" [(ngModel)]="note" [attr.aria-label]="'despatches.note' | t"></textarea></div>
              <app-special-category-warning [text]="note" />
            </div>
            @if (error()) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ error() }}</span></div> }
          </section>
        </div>
        <div class="drawer-footer">
          <span class="hint"><kbd>Ctrl</kbd><kbd>↵</kbd></span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" (click)="closed.emit()">{{ 'common.cancel' | t }}</button>
          <button type="button" class="btn btn-primary" (click)="submit()" [disabled]="saving()" [class.is-loading]="saving()"><app-icon name="box-in" /><span>{{ 'goodsReceipt.complete' | t }}</span></button>
        </div>
      </div>
    </div>
  `,
})
export class GoodsReceiptFormComponent implements OnInit {
  private docs = inject(DocumentsService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);
  Number = Number;

  @Input({ required: true }) po!: PurchaseOrder;
  @Input() warehouses: Warehouse[] = [];
  @Input() products: Product[] = [];
  @Output() done = new EventEmitter<GoodsReceipt>();
  @Output() closed = new EventEmitter<void>();

  rejectReasons = REJECT_REASONS as readonly string[];
  lines = signal<ReceiptLine[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);
  warehouseId = '';
  receivedAt = nowLocalInput();
  supplierDespatchNo = '';
  supplierDespatchDate = '';
  supplierInvoiceNo = '';
  supplierInvoiceDate = '';
  buyerCarries = false;
  note = '';

  ngOnInit() {
    this.warehouseId = (this.po as any).warehouseId || this.warehouses.find((w) => w.isDefault)?.id || this.warehouses[0]?.id || '';
    this.lines.set(
      (this.po.items || []).map((i) => {
        const p = this.products.find((x) => x.id === i.productId);
        const open = Math.max(0, Number(i.quantity) - Number(i.receivedQuantity || 0));
        return {
          purchaseOrderItemId: i.id as string,
          name: i.productName,
          tracking: (p as any)?.trackingType || 'none',
          hasExpiry: !!(p as any)?.hasExpiry,
          ordered: Number(i.quantity),
          received: Number(i.receivedQuantity || 0),
          despatchQuantity: open,
          countedQuantity: open,
          rejectedQuantity: 0,
          rejectReason: 'DAMAGED',
          lotNumber: '',
          expiryDate: '',
          serials: '',
        };
      }),
    );
  }

  split(l: ReceiptLine) {
    return receiptSplit(Number(l.despatchQuantity) || 0, Number(l.countedQuantity) || 0, Number(l.rejectedQuantity) || 0);
  }

  submit() {
    this.error.set(null);
    const lines = this.lines()
      .filter((l) => Number(l.countedQuantity) > 0 || Number(l.despatchQuantity) > 0)
      .map((l) => {
        const accepted = this.split(l).accepted;
        const out: Record<string, unknown> = {
          purchaseOrderItemId: l.purchaseOrderItemId,
          despatchQuantity: Number(l.despatchQuantity) || 0,
          countedQuantity: Number(l.countedQuantity) || 0,
          rejectedQuantity: Number(l.rejectedQuantity) || 0,
          rejectReason: Number(l.rejectedQuantity) > 0 ? l.rejectReason : undefined,
        };
        if (l.tracking === 'lot' && accepted > 0) out['lots'] = [{ lotNumber: l.lotNumber.trim(), expiryDate: l.expiryDate || null, quantity: accepted }];
        if (l.tracking === 'serial' && accepted > 0) out['serials'] = l.serials.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
        return out;
      });
    if (!lines.length) return this.error.set(this.i18n.t('goodsReceipt.linesRequired'));
    this.saving.set(true);
    this.docs
      .createGoodsReceipt(this.po.id, {
        warehouseId: this.warehouseId || null,
        receivedAt: this.receivedAt || null,
        supplierDespatchNo: this.supplierDespatchNo || null,
        supplierDespatchDate: this.supplierDespatchDate || null,
        supplierInvoiceNo: this.supplierInvoiceNo || null,
        supplierInvoiceDate: this.supplierInvoiceDate || null,
        buyerCarries: this.buyerCarries,
        note: this.note || null,
        lines,
        complete: true,
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.ui.showToast(this.i18n.t('goodsReceipt.toast.completed', { number: r.receiptNo }), 'success');
          this.done.emit(r);
        },
        error: (e) => {
          this.saving.set(false);
          this.error.set(apiError(e, this.i18n.t('documents.actionError')));
        },
      });
  }
}
