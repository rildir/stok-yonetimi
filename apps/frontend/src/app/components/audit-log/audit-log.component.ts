import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IntegrationsService } from '../../services/integrations.service';
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
    .audit-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .audit-filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .audit-filters .form-select, .audit-filters input { min-width: 150px; height: 36px; }
    .audit-row { cursor: pointer; }
    .audit-row:hover td { background: #F8FAFC; }
    .action-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: #F1F5F9; color: #334155; }
    .action-create { background: #ECFDF5; color: #047857; }
    .action-update { background: #EFF6FF; color: #1D4ED8; }
    .action-delete, .action-login_failed { background: #FEF2F2; color: #B91C1C; }
    .diff-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .diff-table th, .diff-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; word-break: break-word; }
    .diff-table td.val { font-family: var(--font-mono, monospace); white-space: pre-wrap; }
    .diff-changed .before-val { background: #FEF2F2; color: #991B1B; }
    .diff-changed .after-val { background: #ECFDF5; color: #065F46; }
    .meta-line { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; display: grid; gap: 4px; }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'auditLog.title' | t }}</h1>
        <p>{{ 'auditLog.subtitle' | t }}</p>
      </div>
    </header>

    <div class="filter-bar">
      <div class="audit-filters">
        <label>{{ 'auditLog.filter.user' | t }}
          <select class="form-select" [ngModel]="username()" (ngModelChange)="username.set($event); search()">
            <option value="">{{ 'auditLog.filter.all' | t }}</option>
            @for (u of meta().usernames; track u) { <option [value]="u">{{ u }}</option> }
          </select>
        </label>
        <label>{{ 'auditLog.filter.entityType' | t }}
          <select class="form-select" [ngModel]="entityType()" (ngModelChange)="entityType.set($event); search()">
            <option value="">{{ 'auditLog.filter.all' | t }}</option>
            @for (e of meta().entityTypes; track e) { <option [value]="e">{{ entityLabel(e) }}</option> }
          </select>
        </label>
        <label>{{ 'auditLog.filter.action' | t }}
          <select class="form-select" [ngModel]="action()" (ngModelChange)="action.set($event); search()">
            <option value="">{{ 'auditLog.filter.all' | t }}</option>
            @for (a of meta().actions; track a) { <option [value]="a">{{ actionLabel(a) }}</option> }
          </select>
        </label>
        <label>{{ 'auditLog.filter.from' | t }}
          <input type="date" class="form-select" [ngModel]="from()" (ngModelChange)="from.set($event); search()" />
        </label>
        <label>{{ 'auditLog.filter.to' | t }}
          <input type="date" class="form-select" [ngModel]="to()" (ngModelChange)="to.set($event); search()" />
        </label>
        <label>{{ 'auditLog.filter.entityId' | t }}
          <input type="text" class="form-select mono" [ngModel]="entityId()" (ngModelChange)="entityId.set($event)" (keyup.enter)="search()" (blur)="search()" />
        </label>
        <button class="btn btn-outline btn-sm" (click)="clearFilters()">{{ 'auditLog.filter.clear' | t }}</button>
      </div>
    </div>

    <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
      @if (isLoading()) {
        <div class="loading-state">{{ 'common.loading' | t }}</div>
      } @else if (logs().length === 0) {
        <div class="empty-state"><p>{{ 'auditLog.empty' | t }}</p></div>
      } @else {
        <div class="table-scroll">
          <table>
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
                  <td>{{ l.createdAt | appDate: 'datetime' }}</td>
                  <td>
                    {{ l.username || '-' }}
                    @if (l.apiKeyId) { <div style="font-size: 11px; color: var(--text-muted);">{{ 'auditLog.viaApiKey' | t }}</div> }
                  </td>
                  <td><span class="action-badge" [ngClass]="'action-' + l.action">{{ actionLabel(l.action) }}</span></td>
                  <td>{{ entityLabel(l.entityType) }}</td>
                  <td class="mono" style="font-size: 11px;">{{ l.entityId || '-' }}</td>
                  <td class="mono" style="font-size: 11px;">{{ l.ip || '-' }}</td>
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
            <span style="padding: 0 8px;">{{ page() | num }} / {{ totalPages() | num }}</span>
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
            <button class="drawer-close" (click)="selected.set(null)">×</button>
          </div>
          <div class="drawer-body">
            <div class="meta-line">
              <div><strong>{{ actionLabel(s.action) }}</strong> · {{ entityLabel(s.entityType) }} · <span class="mono">{{ s.entityId || '-' }}</span></div>
              <div>{{ s.createdAt | appDate: 'datetime' }} · {{ s.username || '-' }} · {{ s.ip || '-' }}</div>
              @if (s.userAgent) { <div style="word-break: break-all;">{{ s.userAgent }}</div> }
            </div>
            @if (diffRows().length === 0) {
              <div class="empty-state"><p>{{ 'auditLog.diff.noChanges' | t }}</p></div>
            } @else {
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
            }
          </div>
          <div class="drawer-footer single-action">
            @if (s.entityId && s.entityType !== 'auth') {
              <button class="btn btn-outline" (click)="filterEntity(s)">{{ 'auditLog.diff.entityHistory' | t }}</button>
            }
            <button class="btn btn-secondary" (click)="selected.set(null)">{{ 'common.close' | t }}</button>
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class AuditLogComponent implements OnInit {
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
