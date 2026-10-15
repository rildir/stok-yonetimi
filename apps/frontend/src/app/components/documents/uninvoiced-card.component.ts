import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe } from '../../i18n';
import { DocumentsService } from '../../services/documents.service';
import { UninvoicedRow } from '../../models/documents.models';

/** Dashboard card: deliveries not invoiced yet with the days left of the 7-day period (VUK 231/5); overdue in red. */
@Component({
  selector: 'app-uninvoiced-card',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, AppDatePipe],
  styleUrls: ['./documents.css'],
  styles: [`
    .uc-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3); }
    .uc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
    .uc-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); }
    .uc-row.critical { border-color: var(--color-danger-border); background: var(--color-danger-subtle); }
    .uc-row.warning { border-color: var(--color-warning-border); background: var(--color-warning-subtle); }
    .uc-main { min-width: 0; display: flex; flex-direction: column; }
    .uc-main .name { font-size: var(--text-sm); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .uc-main .sub { font-size: var(--text-xs); color: var(--color-text-muted); }
  `],
  template: `
    <div class="card" style="padding: var(--space-5)">
      <div class="uc-head">
        <div>
          <h3 class="card-title" style="margin: 0">{{ 'compliance.uninvoiced' | t }}</h3>
          <span class="doc-hint">{{ 'compliance.uninvoicedHint' | t: { days: limit() } }}</span>
        </div>
        <div class="doc-chips">
          @if (critical()) { <span class="badge badge-danger">{{ 'compliance.criticalCount' | t: { count: critical() } }}</span> }
          @if (warning()) { <span class="badge badge-warning">{{ 'compliance.warningCount' | t: { count: warning() } }}</span> }
        </div>
      </div>
      @if (rows().length) {
        <ul class="uc-list">
          @for (r of rows().slice(0, 6); track r.id) {
            <li class="uc-row" [ngClass]="r.level">
              <div class="uc-main">
                <a class="name link" [routerLink]="r.source === 'DESPATCH' ? '/despatches' : '/orders'" [queryParams]="{ id: r.source === 'DESPATCH' ? r.id : r.orderId }">{{ r.customerName }}</a>
                <span class="sub mono">{{ r.documentNo || r.orderNumber }} · {{ 'compliance.deliveredOn' | t: { date: (r.deliveryDate | appDate) } }}</span>
              </div>
              <span class="days-left" [ngClass]="r.level">{{ r.daysLeft < 0 ? ('compliance.overdueDays' | t: { days: -r.daysLeft }) : ('compliance.daysLeft' | t: { days: r.daysLeft }) }}</span>
            </li>
          }
        </ul>
        @if (rows().length > 6) { <a class="link text-xs" routerLink="/despatches" [queryParams]="{ filter: 'uninvoiced' }">{{ 'compliance.showAll' | t: { count: rows().length } }}</a> }
      } @else {
        <p class="doc-hint">{{ 'compliance.allInvoiced' | t }}</p>
      }
    </div>
  `,
})
export class UninvoicedCardComponent implements OnInit {
  private docs = inject(DocumentsService);
  rows = signal<UninvoicedRow[]>([]);
  limit = signal(7);
  critical = computed(() => this.rows().filter((r) => r.level === 'critical').length);
  warning = computed(() => this.rows().filter((r) => r.level === 'warning').length);

  ngOnInit() {
    this.docs.uninvoiced().subscribe({
      next: (d) => {
        this.rows.set(d.rows);
        this.limit.set(d.limitDays);
      },
      error: () => undefined,
    });
  }
}
