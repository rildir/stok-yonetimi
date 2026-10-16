import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslatePipe, AppDatePipe } from '../../i18n';
import { DocumentsService } from '../../services/documents.service';
import { UninvoicedRow } from '../../models/documents.models';
import { IconComponent } from '../shared/icon.component';

/** Dashboard card: deliveries not invoiced yet with the days left of the 7-day period (VUK 231/5); overdue in red. */
@Component({
  selector: 'app-uninvoiced-card',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, AppDatePipe, IconComponent],
  styleUrls: ['./documents.css'],
  styles: [`
    :host { display: block; min-width: 0; }
    :host > .card { height: 100%; }
    .uc-h { min-height: 56px; padding-block: 8px; }
    .uc-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .uc-t .sub { white-space: normal; }
    .uc-list { list-style: none; margin: 0; padding: 0; flex: 1; }
    .uc-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 12px; padding: 10px 16px; box-shadow: inset 0 -1px 0 var(--line); transition: background-color var(--dur-1) var(--ease-out); }
    .uc-row:last-child { box-shadow: none; }
    .uc-row:hover { background: var(--row-hover); }
    .uc-row .ic { grid-row: span 2; width: 28px; height: 28px; border-radius: var(--radius-7); display: grid; place-items: center; background: var(--surface-sunken); color: var(--fg-3); box-shadow: inset 0 0 0 1px var(--line); }
    .uc-row.critical .ic { background: var(--danger-soft); color: var(--danger); box-shadow: inset 0 0 0 1px var(--danger-line); }
    .uc-row.warning .ic { background: var(--warning-soft); color: var(--warning); box-shadow: inset 0 0 0 1px var(--warning-line); }
    .uc-row .name { font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; text-decoration: none; }
    .uc-row .name:hover { color: var(--accent-text); text-decoration: underline; text-underline-offset: 3px; }
    .uc-row .sub { grid-column: 2; font-size: var(--text-xs); color: var(--fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .uc-row .sub .mono { font-size: var(--text-xs); }
    .uc-row .badge { grid-row: span 2; grid-column: 3; justify-self: end; }
    .uc-empty { flex: 1; padding: 32px 24px; }
    .uc-empty .empty-art { background: var(--success-soft); color: var(--success); box-shadow: inset 0 0 0 1px var(--success-line); }
    .card-f .link { font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
    .card-f .spacer { flex: 1; }
    @media (max-width: 640px) {
      .uc-h { flex-wrap: wrap; }
    }
  `],
  template: `
    <section class="card">
      <div class="card-h uc-h">
        <div class="uc-t">
          <h3>{{ 'compliance.uninvoiced' | t }}</h3>
          <span class="sub">{{ 'compliance.uninvoicedHint' | t: { days: limit() } }}</span>
        </div>
        <span class="spacer"></span>
        <div class="doc-chips">
          @if (critical()) { <span class="badge badge-danger"><span class="dot"></span>{{ 'compliance.criticalCount' | t: { count: critical() } }}</span> }
          @if (warning()) { <span class="badge badge-warning"><span class="dot"></span>{{ 'compliance.warningCount' | t: { count: warning() } }}</span> }
        </div>
      </div>
      @if (rows().length) {
        <ul class="uc-list">
          @for (r of rows().slice(0, 6); track r.id) {
            <li class="uc-row" [ngClass]="r.level">
              <span class="ic"><app-icon [name]="r.level === 'critical' ? 'alert' : r.level === 'warning' ? 'warn' : 'file'" size="sm" /></span>
              <a class="name" [routerLink]="r.source === 'DESPATCH' ? '/despatches' : '/orders'" [queryParams]="{ id: r.source === 'DESPATCH' ? r.id : r.orderId }">{{ r.customerName }}</a>
              <span class="badge" [class.badge-danger]="r.level === 'critical'" [class.badge-warning]="r.level === 'warning'" [class.badge-neutral]="r.level !== 'critical' && r.level !== 'warning'"><span class="dot"></span>{{ r.daysLeft < 0 ? ('compliance.overdueDays' | t: { days: -r.daysLeft }) : ('compliance.daysLeft' | t: { days: r.daysLeft }) }}</span>
              <span class="sub"><span class="mono">{{ r.documentNo || r.orderNumber }}</span> · {{ 'compliance.deliveredOn' | t: { date: (r.deliveryDate | appDate) } }}</span>
            </li>
          }
        </ul>
        @if (rows().length > 6) {
          <div class="card-f"><span class="spacer"></span><a class="link" routerLink="/despatches" [queryParams]="{ filter: 'uninvoiced' }">{{ 'compliance.showAll' | t: { count: rows().length } }}<app-icon name="chevr" size="sm" /></a></div>
        }
      } @else {
        <div class="empty-state uc-empty">
          <div class="empty-art"><app-icon name="okc" /></div>
          <p>{{ 'compliance.allInvoiced' | t }}</p>
        </div>
      }
    </section>
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
