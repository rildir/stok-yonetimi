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
  imports: [CommonModule, FormsModule, TranslatePipe, NumberFormatPipe, SpecialCategoryWarningComponent],
  styleUrls: ['../../drawer.css', './documents.css'],
  styles: [`.drawer-overlay.stacked { z-index: 1150; } .diff { font-size: var(--text-xs); font-variant-numeric: tabular-nums; } .diff.neg { color: var(--color-danger-text); } .diff.pos { color: var(--color-warning-text); }`],
  template: `
    <div class="drawer-overlay stacked" (click)="closed.emit()">
      <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div class="cluster"><span class="drawer-title">{{ 'goodsReceipt.formTitle' | t }}</span><span class="mono text-muted">{{ po.poNumber }}</span></div>
          <button type="button" class="drawer-close" (click)="closed.emit()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="drawer-body">
          <div class="doc-grid">
            <div class="doc-field"><label for="grWh">{{ 'goodsReceipt.warehouse' | t }}</label>
              <select id="grWh" class="select" [(ngModel)]="warehouseId">@for (w of warehouses; track w.id) { <option [value]="w.id">{{ w.name }}</option> }</select>
            </div>
            <div class="doc-field"><label for="grAt">{{ 'goodsReceipt.receivedAt' | t }}</label><input id="grAt" type="datetime-local" class="input" [(ngModel)]="receivedAt" /></div>
            <div class="doc-field"><label for="grDn">{{ 'goodsReceipt.supplierDespatchNo' | t }}</label><input id="grDn" class="input mono" [(ngModel)]="supplierDespatchNo" /></div>
            <div class="doc-field"><label for="grDd">{{ 'goodsReceipt.supplierDespatchDate' | t }}</label><input id="grDd" type="date" class="input" [(ngModel)]="supplierDespatchDate" /></div>
            <div class="doc-field"><label for="grIn">{{ 'goodsReceipt.supplierInvoiceNo' | t }}</label><input id="grIn" class="input mono" [(ngModel)]="supplierInvoiceNo" /></div>
            <div class="doc-field"><label for="grId">{{ 'goodsReceipt.supplierInvoiceDate' | t }}</label><input id="grId" type="date" class="input" [(ngModel)]="supplierInvoiceDate" /></div>
          </div>
          <label class="doc-check"><input type="checkbox" [(ngModel)]="buyerCarries" /> {{ 'goodsReceipt.buyerCarries' | t }}</label>

          <div class="doc-section" style="overflow-x: auto">
            <table class="doc-table">
              <thead><tr>
                <th>{{ 'despatches.product' | t }}</th><th class="num hide-xs">{{ 'goodsReceipt.ordered' | t }}</th><th class="num">{{ 'goodsReceipt.despatchQty' | t }}</th>
                <th class="num">{{ 'goodsReceipt.counted' | t }}</th><th class="num">{{ 'goodsReceipt.rejected' | t }}</th><th class="num">{{ 'goodsReceipt.accepted' | t }}</th>
              </tr></thead>
              <tbody>
                @for (l of lines(); track l.purchaseOrderItemId) {
                  <tr>
                    <td>{{ l.name }}<div class="text-xs text-muted">{{ 'goodsReceipt.alreadyReceived' | t: { qty: (l.received | num) } }}</div></td>
                    <td class="num hide-xs">{{ l.ordered | num }}</td>
                    <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.despatchQuantity" /></td>
                    <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.countedQuantity" /></td>
                    <td class="num"><input type="number" min="0" step="any" class="input qty" [(ngModel)]="l.rejectedQuantity" />
                      @if (Number(l.rejectedQuantity) > 0) { <select class="select" style="margin-top: 4px" [(ngModel)]="l.rejectReason">@for (r of rejectReasons; track r) { <option [value]="r">{{ 'goodsReceipt.reject.' + r | t }}</option> }</select> }
                    </td>
                    <td class="num"><strong>{{ split(l).accepted | num }}</strong>
                      @if (split(l).surplus) { <div class="diff pos">{{ 'goodsReceipt.surplus' | t: { qty: (split(l).surplus | num) } }}</div> }
                      @if (split(l).shortage) { <div class="diff neg">{{ 'goodsReceipt.shortage' | t: { qty: (split(l).shortage | num) } }}</div> }
                    </td>
                  </tr>
                  @if (l.tracking === 'lot' && split(l).accepted > 0) {
                    <tr><td colspan="6">
                      <div class="doc-grid">
                        <div class="doc-field"><label>{{ 'documents.lot' | t }}</label><input class="input mono" [(ngModel)]="l.lotNumber" /></div>
                        <div class="doc-field"><label>{{ 'goodsReceipt.expiry' | t }}</label><input type="date" class="input" [(ngModel)]="l.expiryDate" [required]="l.hasExpiry" /></div>
                      </div>
                    </td></tr>
                  }
                  @if (l.tracking === 'serial' && split(l).accepted > 0) {
                    <tr><td colspan="6"><div class="doc-field"><label>{{ 'goodsReceipt.serials' | t }}</label><textarea class="textarea mono" rows="2" [(ngModel)]="l.serials" [placeholder]="'goodsReceipt.serialsHint' | t"></textarea></div></td></tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <div class="doc-field doc-section"><label for="grNote">{{ 'despatches.note' | t }}</label><textarea id="grNote" class="textarea" rows="2" [(ngModel)]="note"></textarea><app-special-category-warning [text]="note" /></div>
          <p class="doc-hint">{{ 'goodsReceipt.formHint' | t }}</p>
          @if (error()) { <div class="doc-alert danger">{{ error() }}</div> }
        </div>
        <div class="drawer-footer">
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">{{ 'common.cancel' | t }}</button>
          <button type="button" class="btn btn-primary" (click)="submit()" [disabled]="saving()">@if (saving()) { <span class="spinner-sm spinner-light"></span> } {{ 'goodsReceipt.complete' | t }}</button>
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
