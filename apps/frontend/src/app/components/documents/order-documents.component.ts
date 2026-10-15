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

interface ChainItem {
  kind: 'despatch' | 'invoice' | 'return';
  id: string;
  number: string;
  status: string;
  date: string | null;
  sub: string;
  link: string;
}

/**
 * Order detail: document actions (Sevk et / Faturalandır / İade oluştur / toplama listesi), the VUK 232
 * invoice requirement with the ÖKC receipt field, and the document chain (timeline).
 */
@Component({
  selector: 'app-order-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, AppDatePipe, MoneyPipe, DespatchFormComponent],
  styleUrls: ['./documents.css'],
  template: `
    <div class="doc-section">
      <h4 class="doc-section-title">{{ 'orderDocs.title' | t }}
        @if (order.invoiceRequirement === 'REQUIRED') { <span class="badge badge-warning">{{ 'orderDocs.invoiceRequired' | t }}</span> }
        @if (order.invoiceRequirement === 'OPTIONAL') { <span class="badge badge-neutral">{{ 'orderDocs.invoiceOptional' | t: { limit: (order.invoiceLimit | money: 'TRY') } }}</span> }
      </h4>
      @if (order.stockMode === 'despatch' && order.status === 'Pending') { <p class="doc-hint">{{ 'orderDocs.despatchModeInfo' | t }}</p> }
      @if (order.documentsLegacy) { <p class="doc-hint">{{ 'orderDocs.legacyInfo' | t }}</p> }

      @if (!ui.isReadonly() && order.status !== 'Cancelled') {
        <div class="doc-actions" style="margin-bottom: var(--space-3)">
          @if (hasOpenDespatch()) { <button type="button" class="btn btn-primary btn-sm" (click)="formOpen.set(true)">{{ 'orderDocs.despatch' | t }}</button> }
          @if (hasOpenInvoice()) { <button type="button" class="btn btn-secondary btn-sm" (click)="invoice()" [disabled]="busy()">{{ 'orderDocs.invoice' | t }}</button> }
          @if (issuedInvoice(); as invId) { <a class="btn btn-secondary btn-sm" routerLink="/returns" [queryParams]="{ invoiceId: invId }">{{ 'orderDocs.return' | t }}</a> }
          <button type="button" class="btn btn-ghost btn-sm" (click)="docs.print('orders/' + order.id + '/picking-list')">{{ 'orderDocs.pickingList' | t }}</button>
        </div>
      }

      @if (order.invoiceRequirement === 'OPTIONAL' && !ui.isReadonly() && !issuedInvoice()) {
        <div class="doc-grid">
          <div class="doc-field"><label for="okcNo">{{ 'orderDocs.okcReceiptNo' | t }}</label><input id="okcNo" class="input mono" maxlength="50" [(ngModel)]="okcNo" /></div>
          <div class="doc-field"><label for="okcDate">{{ 'orderDocs.okcReceiptDate' | t }}</label><input id="okcDate" type="date" class="input" [(ngModel)]="okcDate" /></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="saveOkc()" [disabled]="busy()">{{ 'orderDocs.saveOkc' | t }}</button>
      }

      @if (chain().length) {
        <ul class="doc-timeline" style="margin-top: var(--space-3)">
          @for (c of chain(); track c.id) {
            <li [class.muted]="c.status === 'DRAFT' || c.status === 'CANCELLED'">
              <div class="tl-head">
                <strong>{{ 'orderDocs.kind.' + c.kind | t }}</strong>
                <a class="link mono" [routerLink]="c.link" [queryParams]="{ id: c.id }">{{ c.number }}</a>
                <span class="badge" [ngClass]="badge(c.status)">{{ ('documents.status.' + c.status) | t }}</span>
              </div>
              <div class="tl-sub">{{ c.date ? (c.date | appDate) : '-' }} · {{ c.sub }}</div>
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
          ...d.invoices.map((x) => ({ kind: 'invoice' as const, id: x.id, number: x.documentNo || this.i18n.t('invoices.draftNo'), status: x.status, date: x.issueDate || x.createdAt, sub: `${x.typeCode} · ${x.grandTotal} ${x.currency}`, link: '/invoices' })),
          ...d.returns.map((x) => ({ kind: 'return' as const, id: x.id, number: x.returnNo, status: x.status, date: x.createdAt, sub: this.i18n.t('returns.type.' + x.type), link: '/returns' })),
        ];
        items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        this.chain.set(items);
      },
      error: () => undefined,
    });
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
