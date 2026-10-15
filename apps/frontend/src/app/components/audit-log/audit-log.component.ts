import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IntegrationsService } from '../../services/integrations.service';
import { InventoryService } from '../../inventory.service';
import { ChainVerification } from '../../models/inventory.models';
import { AuditLog, AuditLogMeta } from '../../models/inventory.models';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { I18nService, TranslatePipe, NumberFormatPipe, AppDatePipe } from '../../i18n';

interface DiffRow {
  field: string;
  before: string;
  after: string;
  changed: boolean;
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .audit-filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-3); align-items: end; width: 100%; }
    .audit-filters .form-group { margin: 0; min-width: 0; }
    .audit-filters .input, .audit-filters .select { width: 100%; min-width: 0; }
    .audit-row { cursor: pointer; }
    .integrity-result { margin-bottom: var(--space-4); align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
    .integrity-body { display: grid; gap: var(--space-1); min-width: 0; font-size: var(--text-sm); }
    .integrity-issues { margin: var(--space-1) 0 0; padding-left: var(--space-5); font-size: var(--text-xs); }
    .sub { font-size: var(--text-2xs); color: var(--color-text-muted); }
    .id-cell { max-width: 220px; }
    .id-cell > .truncate { min-width: 0; }
    td.mono::before { font-family: var(--font-sans); }
    .page-count { padding: 0 var(--space-2); font-size: var(--text-sm); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
    .meta-card { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-subtle); font-size: var(--text-xs); color: var(--color-text-secondary); min-width: 0; }
    .meta-card .head { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; color: var(--color-text); font-size: var(--text-sm); min-width: 0; }
    .meta-card .ua { word-break: break-all; color: var(--color-text-muted); }
    .diff-wrap { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
    .diff-table { width: 100%; border-collapse: collapse; font-size: var(--text-xs); table-layout: fixed; }
    .diff-table th { text-align: left; padding: var(--space-2) var(--space-3); background: var(--color-surface-subtle); color: var(--color-text-muted); font-weight: var(--weight-semibold); font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--color-border); }
    .diff-table td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border-subtle); vertical-align: top; word-break: break-word; color: var(--color-text); }
    .diff-table tr:last-child td { border-bottom: 0; }
    .diff-table th:first-child { width: 28%; }
    .diff-table td.val { font-family: var(--font-mono, monospace); white-space: pre-wrap; }
    .diff-changed .before-val { background: var(--color-danger-subtle); color: var(--color-danger-text); }
    .diff-changed .after-val { background: var(--color-success-subtle); color: var(--color-success-text); }
    @media (max-width: 640px) {
      .audit-filters { grid-template-columns: 1fr 1fr; }
      .id-cell { max-width: none; }
    }
  `],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'auditLog.title' | t }}</h1>
        <p>{{ 'auditLog.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-secondary" (click)="verifyIntegrity()" [disabled]="verifying()">
          @if (verifying()) { <span class="spinner-sm"></span> } @else {
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
          }
          {{ 'auditLog.integrity.verify' | t }}
        </button>
      </div>
    </div>

    @if (integrity(); as r) {
      <div class="alert-banner integrity-result" [class.alert-banner--info]="r.ok" [class.alert-banner--danger]="!r.ok" role="status">
        <div class="integrity-body">
          <strong>{{ (r.ok ? 'auditLog.integrity.ok' : 'auditLog.integrity.broken') | t }}</strong>
          <span>{{ 'auditLog.integrity.summary' | t: { count: (r.checked | num), seq: r.lastSequenceNo, at: (r.verifiedAt | appDate: 'datetime') } }}</span>
          @if (r.attachmentsChecked !== undefined) { <span>{{ 'auditLog.integrity.attachments' | t: { count: (r.attachmentsChecked | num) } }}</span> }
          <span class="mono text-2xs truncate" [title]="r.lastHash">{{ 'auditLog.integrity.head' | t }}: {{ r.lastHash }}</span>
          @if (!r.ok) {
            <ul class="integrity-issues">
              @for (i of r.issues.slice(0, 5); track $index) {
                <li>#{{ i.sequenceNo ?? '-' }} · {{ 'auditLog.integrity.problem.' + i.problem | t }}</li>
              }
            </ul>
          }
          <span class="text-2xs">{{ 'auditLog.integrity.legal' | t }}</span>
        </div>
        <button type="button" class="btn btn-sm btn-ghost" (click)="integrity.set(null)" [attr.aria-label]="'common.close' | t">✕</button>
      </div>
    }

    <div class="filter-bar">
      <div class="audit-filters">
        <div class="form-group"><label>{{ 'auditLog.filter.user' | t }}</label>
          <select class="select" [ngModel]="username()" (ngModelChange)="username.set($event); search()">
            <option value="">{{ 'auditLog.filter.all' | t }}</option>
            @for (u of meta().usernames; track u) { <option [value]="u">{{ u }}</option> }
          </select>
        </div>
        <div class="form-group"><label>{{ 'auditLog.filter.entityType' | t }}</label>
          <select class="select" [ngModel]="entityType()" (ngModelChange)="entityType.set($event); search()">
            <option value="">{{ 'auditLog.filter.all' | t }}</option>
            @for (e of meta().entityTypes; track e) { <option [value]="e">{{ entityLabel(e) }}</option> }
          </select>
        </div>
        <div class="form-group"><label>{{ 'auditLog.filter.action' | t }}</label>
          <select class="select" [ngModel]="action()" (ngModelChange)="action.set($event); search()">
            <option value="">{{ 'auditLog.filter.all' | t }}</option>
            @for (a of meta().actions; track a) { <option [value]="a">{{ actionLabel(a) }}</option> }
          </select>
        </div>
        <div class="form-group"><label>{{ 'auditLog.filter.from' | t }}</label>
          <input type="date" class="input" [ngModel]="from()" (ngModelChange)="from.set($event); search()" />
        </div>
        <div class="form-group"><label>{{ 'auditLog.filter.to' | t }}</label>
          <input type="date" class="input" [ngModel]="to()" (ngModelChange)="to.set($event); search()" />
        </div>
        <div class="form-group"><label>{{ 'auditLog.filter.entityId' | t }}</label>
          <input type="text" class="input mono" [ngModel]="entityId()" (ngModelChange)="entityId.set($event)" (keyup.enter)="search()" (blur)="search()" />
        </div>
        <button class="btn btn-ghost" (click)="clearFilters()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          {{ 'auditLog.filter.clear' | t }}
        </button>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="stack" style="padding: var(--space-4);">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton" style="height: 36px;"></div> }
        </div>
      } @else if (logs().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg></div>
          <div class="empty-state-title">{{ 'auditLog.empty' | t }}</div>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'auditLog.col.date' | t }}</th>
                <th>{{ 'auditLog.col.user' | t }}</th>
                <th>{{ 'auditLog.col.action' | t }}</th>
                <th>{{ 'auditLog.col.entityType' | t }}</th>
                <th>{{ 'auditLog.col.entityId' | t }}</th>
                <th>{{ 'auditLog.col.ip' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (l of logs(); track l.id) {
                <tr class="audit-row" (click)="openDiff(l)">
                  <td [attr.data-label]="'auditLog.col.date' | t">{{ l.createdAt | appDate: 'datetime' }}</td>
                  <td [attr.data-label]="'auditLog.col.user' | t">
                    {{ l.username || '-' }}
                    @if (l.apiKeyId) { <div class="sub">{{ 'auditLog.viaApiKey' | t }}</div> }
                  </td>
                  <td [attr.data-label]="'auditLog.col.action' | t"><span class="badge" [ngClass]="actionBadge(l.action)">{{ actionLabel(l.action) }}</span></td>
                  <td [attr.data-label]="'auditLog.col.entityType' | t">{{ entityLabel(l.entityType) }}</td>
                  <td [attr.data-label]="'auditLog.col.entityId' | t" class="mono id-cell"><span class="truncate" style="display: block;" [title]="l.entityId || ''">{{ l.entityId || '-' }}</span></td>
                  <td [attr.data-label]="'auditLog.col.ip' | t" class="mono">{{ l.ip || '-' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination-bar">
          <div class="pagination-info">
            {{ 'auditLog.pagination' | t: { total: total(), start: startCount(), end: endCount() } }}
          </div>
          <div class="pagination-actions">
            <button class="page-btn" [disabled]="page() === 1" (click)="load(page() - 1)">{{ 'auditLog.prev' | t }}</button>
            <span class="page-count">{{ page() | num }} / {{ totalPages() | num }}</span>
            <button class="page-btn" [disabled]="page() >= totalPages()" (click)="load(page() + 1)">{{ 'auditLog.next' | t }}</button>
          </div>
        </div>
      }
    </div>

    @if (selected(); as s) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'auditLog.diff.title' | t }}</span>
            <button class="drawer-close" (click)="selected.set(null)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            <div class="meta-card">
              <div class="head"><span class="badge" [ngClass]="actionBadge(s.action)">{{ actionLabel(s.action) }}</span> <strong>{{ entityLabel(s.entityType) }}</strong> <span class="mono truncate" style="min-width: 0;">{{ s.entityId || '-' }}</span></div>
              <div>{{ s.createdAt | appDate: 'datetime' }} · {{ s.username || '-' }} · <span class="mono">{{ s.ip || '-' }}</span></div>
              @if (s.userAgent) { <div class="ua">{{ s.userAgent }}</div> }
            </div>
            @if (diffRows().length === 0) {
              <div class="empty-state"><div class="empty-state-title">{{ 'auditLog.diff.noChanges' | t }}</div></div>
            } @else {
              <div class="diff-wrap">
                <table class="diff-table">
                  <thead>
                    <tr>
                      <th>{{ 'auditLog.diff.field' | t }}</th>
                      <th>{{ 'auditLog.diff.before' | t }}</th>
                      <th>{{ 'auditLog.diff.after' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of diffRows(); track r.field) {
                      <tr [class.diff-changed]="r.changed">
                        <td><strong>{{ r.field }}</strong></td>
                        <td class="val before-val">{{ r.before }}</td>
                        <td class="val after-val">{{ r.after }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="selected.set(null)">{{ 'common.close' | t }}</button>
            @if (s.entityId && s.entityType !== 'auth') {
              <button class="btn btn-primary" (click)="filterEntity(s)">{{ 'auditLog.diff.entityHistory' | t }}</button>
            }
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class AuditLogComponent implements OnInit {
  private inventory = inject(InventoryService);
  verifying = signal(false);
  integrity = signal<ChainVerification | null>(null);

  /** Recomputes the stock movement hash chain (TTK 65/3, VUK 217) on the server. */
  verifyIntegrity() {
    this.verifying.set(true);
    this.inventory.verifyMovementIntegrity().subscribe({
      next: (r) => { this.verifying.set(false); this.integrity.set(r); },
      error: (err) => { this.verifying.set(false); this.ui.showToast(err?.error?.message || this.i18n.t('auditLog.integrity.failed'), 'error'); },
    });
  }

  api = inject(IntegrationsService);
  ui = inject(UiStateService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  readonly pageSize = 25;

  meta = signal<AuditLogMeta>({ entityTypes: [], actions: [], usernames: [] });
  logs = signal<AuditLog[]>([]);
  total = signal(0);
  page = signal(1);
  isLoading = signal(true);
  selected = signal<AuditLog | null>(null);

  username = signal('');
  entityType = signal('');
  entityId = signal('');
  action = signal('');
  from = signal('');
  to = signal('');

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  startCount = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize + 1));
  endCount = computed(() => Math.min(this.total(), this.page() * this.pageSize));

  diffRows = computed<DiffRow[]>(() => {
    const s = this.selected();
    if (!s) return [];
    const before = s.before || {};
    const after = s.after || {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return keys.map(field => {
      const b = this.fmt(before[field], s.before ? field in before : false);
      const a = this.fmt(after[field], s.after ? field in after : false);
      return { field, before: b, after: a, changed: b !== a };
    });
  });

  ngOnInit() {
    this.api.getAuditLogMeta().subscribe({
      next: m => this.meta.set({ entityTypes: m.entityTypes || [], actions: m.actions || [], usernames: m.usernames || [] }),
      error: () => { /* filters still usable without meta */ }
    });
    this.route.queryParams.subscribe(params => {
      this.entityType.set(params['entityType'] || '');
      this.entityId.set(params['entityId'] || '');
      this.load(1);
    });
  }

  load(page = 1) {
    this.isLoading.set(true);
    this.api.getAuditLogs({
      username: this.username(),
      entityType: this.entityType(),
      entityId: this.entityId().trim(),
      action: this.action(),
      from: this.from(),
      to: this.to(),
      page,
      pageSize: this.pageSize,
    }).subscribe({
      next: res => {
        this.logs.set(res.items || []);
        this.total.set(res.total || 0);
        this.page.set(res.page || page);
        this.isLoading.set(false);
      },
      error: err => {
        this.isLoading.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('auditLog.loadError'), 'error');
      }
    });
  }

  search() {
    this.load(1);
  }

  clearFilters() {
    this.username.set('');
    this.entityType.set('');
    this.entityId.set('');
    this.action.set('');
    this.from.set('');
    this.to.set('');
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    this.load(1);
  }

  openDiff(l: AuditLog) {
    this.selected.set(l);
  }

  filterEntity(l: AuditLog) {
    this.selected.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: { entityType: l.entityType, entityId: l.entityId } });
  }

  actionBadge(a: string): string {
    if (a === 'create') return 'badge-success';
    if (a === 'update') return 'badge-primary';
    if (a === 'delete' || a === 'login_failed') return 'badge-danger';
    if (a === 'login') return 'badge-info';
    return 'badge-neutral';
  }

  actionLabel(a: string): string {
    return this.label(`auditLog.action.${a}`, a);
  }

  entityLabel(e: string): string {
    return this.label(`auditLog.entity.${e}`, e);
  }

  private label(key: string, fallback: string): string {
    const v = this.i18n.t(key);
    return v && v !== key ? v : fallback;
  }

  private fmt(v: unknown, present: boolean): string {
    if (!present || v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  }
}
