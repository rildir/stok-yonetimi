import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe, MoneyPipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { InventoryService } from '../../inventory.service';
import { OrderDocuments, statusBadge } from '../../models/documents.models';
import { Order, Warehouse } from '../../models/inventory.models';
import { DespatchFormComponent } from './despatch-form.component';
import { IconComponent } from '../shared/icon.component';

interface ChainItem {
  kind: 'despatch' | 'invoice' | 'return';
  id: string;
  number: string;
  status: string;
  date: string | null;
  sub: string;
  link: string;
  /** Invoice only: UBL-TR type code and total, formatted in the template. */
  typeCode?: string;
  amount?: number | string;
  currency?: string;
}

/**
 * Order detail: document actions (Sevk et / Faturalandır / İade oluştur / toplama listesi), the VUK 232
 * invoice requirement with the ÖKC receipt field, and the document chain (timeline).
 */
@Component({
  selector: 'app-order-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, MoneyPipe, DespatchFormComponent, IconComponent],
  styleUrls: ['./documents.css'],
  styles: [`
    .od-actions { margin-bottom: 12px; }
    .od-okc { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 12px; align-items: end; margin-bottom: 12px; }
    .od-timeline { margin-top: 12px; }
    .doc-section-title .badge { margin-left: 0; }
    @media (max-width: 640px) { .od-okc { grid-template-columns: minmax(0, 1fr); } .od-okc .btn { justify-self: start; } }
  `],
  template: `
    <div class="doc-section">
      <h3 class="doc-section-title">{{ 'orderDocs.title' | t }}
        @if (order.invoiceRequirement === 'REQUIRED') { <span class="badge badge-warning"><span class="dot"></span>{{ 'orderDocs.invoiceRequired' | t }}</span> }
        @if (order.invoiceRequirement === 'OPTIONAL') { <span class="badge badge-neutral">{{ 'orderDocs.invoiceOptional' | t: { limit: (order.invoiceLimit | money: 'TRY') } }}</span> }
      </h3>
      @if (order.stockMode === 'despatch' && order.status === 'Pending') { <div class="notice notice-info od-actions"><app-icon name="info" /><span class="t">{{ 'orderDocs.despatchModeInfo' | t }}</span></div> }
      @if (order.documentsLegacy) { <p class="doc-hint">{{ 'orderDocs.legacyInfo' | t }}</p> }

      @if (!ui.isReadonly() && order.status !== 'Cancelled') {
        <div class="doc-actions od-actions">
          @if (hasOpenDespatch()) { <button type="button" class="btn btn-primary btn-sm" (click)="formOpen.set(true)"><app-icon name="truck" />{{ 'orderDocs.despatch' | t }}</button> }
          @if (hasOpenInvoice()) { <button type="button" class="btn btn-sm" [class.is-loading]="busy()" (click)="invoice()" [disabled]="busy()"><app-icon name="receipt" />{{ 'orderDocs.invoice' | t }}</button> }
          @if (issuedInvoice(); as invId) { <a class="btn btn-sm" routerLink="/returns" [queryParams]="{ invoiceId: invId }"><app-icon name="return" />{{ 'orderDocs.return' | t }}</a> }
          <button type="button" class="btn btn-ghost btn-sm" (click)="docs.print('orders/' + order.id + '/picking-list')"><app-icon name="printer" />{{ 'orderDocs.pickingList' | t }}</button>
        </div>
      }

      @if (order.invoiceRequirement === 'OPTIONAL' && !ui.isReadonly() && !issuedInvoice()) {
        <div class="od-okc">
          <div class="fld">
            <label class="fld-label" for="okcNo">{{ 'orderDocs.okcReceiptNo' | t }}</label>
            <div class="field field-sm"><input id="okcNo" class="mono" maxlength="50" [(ngModel)]="okcNo" /></div>
          </div>
          <div class="fld">
            <label class="fld-label" for="okcDate">{{ 'orderDocs.okcReceiptDate' | t }}</label>
            <div class="field field-sm"><input id="okcDate" type="date" [(ngModel)]="okcDate" /></div>
          </div>
          <button type="button" class="btn btn-sm" (click)="saveOkc()" [disabled]="busy()">{{ 'orderDocs.saveOkc' | t }}</button>
        </div>
      }

      @if (chain().length) {
        <ul class="doc-timeline od-timeline">
          @for (c of chain(); track c.id) {
            <li [class.muted]="c.status === 'DRAFT' || c.status === 'CANCELLED'">
              <div class="tl-head">
                <strong>{{ 'orderDocs.kind.' + c.kind | t }}</strong>
                <a class="link-btn mono" [routerLink]="c.link" [queryParams]="{ id: c.id }">{{ c.number }}</a>
                <span class="badge" [ngClass]="badge(c.status)"><span class="dot"></span>{{ ('documents.status.' + c.status) | t }}</span>
              </div>
              <div class="tl-sub">{{ c.date ? (c.date | appDate) : '-' }} · {{ c.kind === 'invoice' ? typeLabel(c.typeCode) + ' · ' + (c.amount | money: c.currency) : c.sub }}</div>
            </li>
          }
        </ul>
      } @else {
        <p class="doc-hint">{{ 'orderDocs.empty' | t }}</p>
      }
    </div>

    @if (formOpen()) {
      <app-despatch-form [order]="order" [warehouses]="warehouses()" (done)="onDespatched()" (closed)="formOpen.set(false)"></app-despatch-form>
    }
  `,
})
export class OrderDocumentsComponent implements OnChanges {
  docs = inject(DocumentsService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);
  inventory = inject(InventoryService);
  router = inject(Router);

  @Input({ required: true }) order!: Order;
  @Output() changed = new EventEmitter<void>();

  data = signal<OrderDocuments>({ despatches: [], invoices: [], returns: [] });
  chain = signal<ChainItem[]>([]);
  warehouses = signal<Warehouse[]>([]);
  formOpen = signal(false);
  busy = signal(false);
  okcNo = '';
  okcDate = '';
  badge = statusBadge;

  ngOnChanges() {
    this.okcNo = this.order.okcReceiptNo || '';
    this.okcDate = this.order.okcReceiptDate || '';
    this.load();
    if (!this.warehouses().length) this.inventory.getWarehouses().subscribe({ next: (w) => this.warehouses.set(w || []), error: () => undefined });
  }

  load() {
    this.docs.orderDocuments(this.order.id).subscribe({
      next: (d) => {
        this.data.set(d);
        const items: ChainItem[] = [
          ...d.despatches.map((x) => ({ kind: 'despatch' as const, id: x.id, number: x.documentNo || this.i18n.t('despatches.draftNo'), status: x.status, date: x.issueDate || x.createdAt, sub: x.lines.map((l) => `${l.productName} × ${l.quantity}`).join(', '), link: '/despatches' })),
          ...d.invoices.map((x) => ({ kind: 'invoice' as const, id: x.id, number: x.documentNo || this.i18n.t('invoices.draftNo'), status: x.status, date: x.issueDate || x.createdAt, sub: '', typeCode: x.typeCode, amount: x.grandTotal, currency: x.currency, link: '/invoices' })),
          ...d.returns.map((x) => ({ kind: 'return' as const, id: x.id, number: x.returnNo, status: x.status, date: x.createdAt, sub: this.i18n.t('returns.type.' + x.type), link: '/returns' })),
        ];
        items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        this.chain.set(items);
      },
      error: () => undefined,
    });
  }

  /** Sentence-case label of a UBL-TR invoice type code; unknown codes stay as the code. */
  typeLabel(code?: string): string {
    if (!code) return '';
    const key = 'orderDocs.invoiceType.' + code;
    const label = this.i18n.t(key);
    return label === key ? code : label;
  }

  hasOpenDespatch(): boolean {
    return (this.order.items || []).some((i) => Number(i.quantity) > Number(i.despatchedQuantity || 0)) && !this.order.documentsLegacy;
  }
  hasOpenInvoice(): boolean {
    return (this.order.items || []).some((i) => Number(i.quantity) > Number(i.invoicedQuantity || 0));
  }
  issuedInvoice(): string | null {
    return this.data().invoices.find((i) => !['DRAFT', 'CANCELLED'].includes(i.status))?.id || null;
  }

  onDespatched() {
    this.formOpen.set(false);
    this.load();
    this.changed.emit();
  }

  invoice() {
    this.busy.set(true);
    this.docs.invoiceFromOrder(this.order.id).subscribe({
      next: (inv) => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('invoices.toast.draftCreated'), 'success');
        this.router.navigate(['/invoices'], { queryParams: { id: inv.id } });
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  saveOkc() {
    this.busy.set(true);
    this.docs.setOkcReceipt(this.order.id, { okcReceiptNo: this.okcNo || null, okcReceiptDate: this.okcDate || null }).subscribe({
      next: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('orderDocs.okcSaved'), 'success');
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
