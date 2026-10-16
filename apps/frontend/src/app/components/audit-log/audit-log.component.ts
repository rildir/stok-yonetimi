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
import { IconComponent } from '../shared/icon.component';

interface DiffRow {
  field: string;
  before: string;
  after: string;
  changed: boolean;
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe, IconComponent],
  styleUrls: ['../../drawer.css'],
  host: { '(document:keydown.escape)': 'selected.set(null)' },
  styles: [`
    .sec { color: var(--fg-3); }
    .al-integrity { align-items: flex-start; margin-bottom: 12px; }
    .al-integrity > app-icon { margin-top: 1px; color: var(--tone); }
    .al-int-body { display: grid; gap: 2px; min-width: 0; flex: 1; }
    .al-int-body b { font-weight: 600; }
    .al-int-body .s { font-size: var(--text-xs); color: var(--fg-2); }
    .al-int-body .h { font-size: var(--text-xs); color: var(--fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .al-int-body .legal { font-size: var(--text-xs); color: var(--fg-3); margin-top: 4px; }
    .al-issues { margin: 4px 0 0; padding-left: 18px; font-size: var(--text-xs); color: var(--fg-2); }

    .al-tools { margin-bottom: 12px; }
    .al-tools .field .affix.pre { font-size: var(--text-xs); }
    /* bases sum to one row at ≥1366px so the record-ID search never wraps on its own */
    .al-sel { flex: 1 1 180px; min-width: 140px; max-width: 220px; }
    .al-date { flex: none; }
    .al-date input { flex: none; width: 124px; }
    .al-id { flex: 1 1 140px; min-width: 120px; max-width: 260px; }

    .al-skel { display: grid; gap: 14px; }
    .al-table tbody tr { cursor: pointer; }
    .al-table .badge { margin-left: 0; }
    .al-api { margin-left: 8px; }
    .al-id-cell { max-width: 240px; }
    .al-id-cell, .al-ip { font-size: var(--text-xs); color: var(--fg-3); }
    .al-pages { display: flex; align-items: center; gap: 4px; }
    .al-pages .cnt { padding: 0 8px; font-variant-numeric: tabular-nums; color: var(--fg-2); }

    /* diff drawer */
    .drawer-body > * { flex-shrink: 0; }
    .kv { display: grid; grid-template-columns: minmax(96px, auto) minmax(0, 1fr); gap: 10px 20px; margin: 0; font-size: var(--text-sm); }
    .kv dt { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); padding-top: 1px; }
    .kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--fg); }
    .kv dd .badge { margin-left: 0; }
    .kv .ua { font-size: var(--text-xs); color: var(--fg-3); }
    .diff { border-radius: var(--radius-md); box-shadow: 0 0 0 1px var(--line); overflow: hidden; }
    .diff table { table-layout: fixed; }
    .diff th:first-child { width: 28%; }
    .diff td { height: auto; padding: 8px 12px; vertical-align: top; font-size: var(--text-xs); overflow-wrap: anywhere; }
    .diff td.k { font-weight: 500; color: var(--fg); font-family: var(--font-mono); }
    .diff td.v { font-family: var(--font-mono); white-space: pre-wrap; color: var(--fg-2); }
    .diff tr.is-changed td.b { background: var(--danger-soft); color: var(--danger); }
    .diff tr.is-changed td.a { background: var(--success-soft); color: var(--success); }
    .diff tbody tr:hover td { background: inherit; }
    .diff tr.is-changed td.k { box-shadow: inset 2px 0 0 var(--warning-dot), inset 0 -1px 0 var(--line); }
    @media (max-width: 640px) {
      .page-header { flex-wrap: nowrap; }
      .page-header > :first-child { flex: 1 1 auto; }
      .page-actions { flex: none; }
      .al-date input { flex: 1 1 auto; width: auto; min-width: 0; }
      /* phones open the native picker on tap; the glyph only steals room from the date */
      .al-date input::-webkit-calendar-picker-indicator { display: none; }
      .al-tools { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .al-sel, .al-date, .al-id { max-width: none; min-width: 0; }
      .al-sel:nth-child(2), .al-id, .al-tools > .btn { grid-column: 1 / -1; }
      .al-sel:nth-child(2) { order: 1; }
      .al-date { order: 2; }
      .al-id { order: 3; }
      .al-tools > .btn { order: 4; justify-self: start; }
      .al-tools .field .affix.pre { padding: 0 8px; }
      .al-tools .al-date.field .affix.pre { padding: 0 6px; }
      .al-tools .al-date.field input { padding-left: 6px; padding-right: 2px; }
      .al-table td { max-width: none; white-space: normal; }
      .al-id-cell { overflow-wrap: anywhere; text-align: right; }
      .kv { grid-template-columns: minmax(0, 1fr); gap: 2px; }
      .kv dd + dt { margin-top: 10px; }
      .diff th:first-child { width: 32%; }
    }
  `],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'auditLog.title' | t }}</h1>
        <p>{{ 'auditLog.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn" [class.is-loading]="verifying()" (click)="verifyIntegrity()" [disabled]="verifying()">
          <span class="cluster"><app-icon name="shield" />{{ 'auditLog.integrity.verify' | t }}</span>
        </button>
      </div>
    </div>

    @if (integrity(); as r) {
      <div class="notice al-integrity" [class.notice-success]="r.ok" [class.notice-danger]="!r.ok" role="status">
        <app-icon [name]="r.ok ? 'okc' : 'alert'" />
        <div class="al-int-body">
          <b>{{ (r.ok ? 'auditLog.integrity.ok' : 'auditLog.integrity.broken') | t }}</b>
          <span class="s">{{ 'auditLog.integrity.summary' | t: { count: (r.checked | num), seq: r.lastSequenceNo, at: (r.verifiedAt | appDate: 'datetime') } }}</span>
          @if (r.attachmentsChecked !== undefined) { <span class="s">{{ 'auditLog.integrity.attachments' | t: { count: (r.attachmentsChecked | num) } }}</span> }
          <span class="h mono" [title]="r.lastHash">{{ 'auditLog.integrity.head' | t }}: {{ r.lastHash }}</span>
          @if (!r.ok) {
            <ul class="al-issues">
              @for (i of r.issues.slice(0, 5); track $index) {
                <li>#{{ i.sequenceNo ?? '-' }} · {{ 'auditLog.integrity.problem.' + i.problem | t }}</li>
              }
            </ul>
          }
          <span class="legal">{{ 'auditLog.integrity.legal' | t }}</span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="integrity.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" size="sm" /></button>
      </div>
    }

    <div class="toolbar al-tools">
      <div class="field field-sm select al-sel">
        <span class="affix pre">{{ 'auditLog.filter.user' | t }}</span>
        <select [ngModel]="username()" (ngModelChange)="username.set($event); search()" [attr.aria-label]="'auditLog.filter.user' | t">
          <option value="">{{ 'auditLog.filter.all' | t }}</option>
          @for (u of meta().usernames; track u) { <option [value]="u">{{ u }}</option> }
        </select>
      </div>
      <div class="field field-sm select al-sel">
        <span class="affix pre">{{ 'auditLog.filter.entityType' | t }}</span>
        <select [ngModel]="entityType()" (ngModelChange)="entityType.set($event); search()" [attr.aria-label]="'auditLog.filter.entityType' | t">
          <option value="">{{ 'auditLog.filter.all' | t }}</option>
          @for (e of meta().entityTypes; track e) { <option [value]="e">{{ entityLabel(e) }}</option> }
        </select>
      </div>
      <div class="field field-sm select al-sel">
        <span class="affix pre">{{ 'auditLog.filter.action' | t }}</span>
        <select [ngModel]="action()" (ngModelChange)="action.set($event); search()" [attr.aria-label]="'auditLog.filter.action' | t">
          <option value="">{{ 'auditLog.filter.all' | t }}</option>
          @for (a of meta().actions; track a) { <option [value]="a">{{ actionLabel(a) }}</option> }
        </select>
      </div>
      <div class="field field-sm al-date">
        <span class="affix pre">{{ 'auditLog.filter.from' | t }}</span>
        <input type="date" [ngModel]="from()" (ngModelChange)="from.set($event); search()" [attr.aria-label]="'auditLog.filter.from' | t" />
      </div>
      <div class="field field-sm al-date">
        <span class="affix pre">{{ 'auditLog.filter.to' | t }}</span>
        <input type="date" [ngModel]="to()" (ngModelChange)="to.set($event); search()" [attr.aria-label]="'auditLog.filter.to' | t" />
      </div>
      <div class="field field-sm al-id">
        <span class="lead"><app-icon name="hash" size="sm" /></span>
        <input type="text" class="mono" data-page-search [placeholder]="'auditLog.filter.entityId' | t" [attr.aria-label]="'auditLog.filter.entityId' | t" [ngModel]="entityId()" (ngModelChange)="entityId.set($event)" (keyup.enter)="search()" (blur)="search()" />
      </div>
      @if (username() || entityType() || action() || from() || to() || entityId()) {
        <button type="button" class="btn btn-sm btn-ghost" (click)="clearFilters()"><app-icon name="x" size="sm" />{{ 'auditLog.filter.clear' | t }}</button>
      }
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="card-b al-skel">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton-row"></div> }</div>
      } @else if (logs().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="audit" /></div>
          <h3>{{ 'auditLog.empty' | t }}</h3>
          @if (username() || entityType() || action() || from() || to() || entityId()) {
            <div class="actions"><button type="button" class="btn btn-sm" (click)="clearFilters()"><app-icon name="x" size="sm" />{{ 'auditLog.filter.clear' | t }}</button></div>
          }
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive al-table">
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
                <tr (click)="openDiff(l)" tabindex="0" (keydown.enter)="openDiff(l)">
                  <td [attr.data-label]="'auditLog.col.date' | t">{{ l.createdAt | appDate: 'datetime' }}</td>
                  <td [attr.data-label]="'auditLog.col.user' | t">
                    <span>{{ l.username || '—' }}@if (l.apiKeyId) { <span class="badge badge-neutral al-api">{{ 'auditLog.viaApiKey' | t }}</span> }</span>
                  </td>
                  <td [attr.data-label]="'auditLog.col.action' | t"><span class="badge" [ngClass]="actionBadge(l.action)"><span class="dot"></span>{{ actionLabel(l.action) }}</span></td>
                  <td [attr.data-label]="'auditLog.col.entityType' | t">{{ entityLabel(l.entityType) }}</td>
                  <td [attr.data-label]="'auditLog.col.entityId' | t" class="mono al-id-cell" [title]="l.entityId || ''">{{ l.entityId || '—' }}</td>
                  <td [attr.data-label]="'auditLog.col.ip' | t" class="mono al-ip">{{ l.ip || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="tbl-foot">
          <span>{{ 'auditLog.pagination' | t: { total: (total() | num), start: (startCount() | num), end: (endCount() | num) } }}</span>
          <span class="spacer"></span>
          <div class="al-pages">
            <button type="button" class="btn btn-sm btn-icon" [disabled]="page() === 1" (click)="load(page() - 1)" [attr.aria-label]="'auditLog.prev' | t"><app-icon name="chevl" size="sm" /></button>
            <span class="cnt">{{ page() | num }} / {{ totalPages() | num }}</span>
            <button type="button" class="btn btn-sm btn-icon" [disabled]="page() >= totalPages()" (click)="load(page() + 1)" [attr.aria-label]="'auditLog.next' | t"><app-icon name="chevr" size="sm" /></button>
          </div>
        </div>
      }
    </div>

    @if (selected(); as s) {
      <div class="drawer-overlay" (click)="selected.set(null)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="'auditLog.diff.title' | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'auditLog.diff.title' | t }}</span>
            <button type="button" class="drawer-close" (click)="selected.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            <dl class="kv">
              <dt>{{ 'auditLog.col.action' | t }}</dt>
              <dd><span class="badge" [ngClass]="actionBadge(s.action)"><span class="dot"></span>{{ actionLabel(s.action) }}</span></dd>
              <dt>{{ 'auditLog.col.entityType' | t }}</dt>
              <dd>{{ entityLabel(s.entityType) }}</dd>
              <dt>{{ 'auditLog.col.entityId' | t }}</dt>
              <dd class="mono">{{ s.entityId || '—' }}</dd>
              <dt>{{ 'auditLog.col.date' | t }}</dt>
              <dd>{{ s.createdAt | appDate: 'datetime' }}</dd>
              <dt>{{ 'auditLog.col.user' | t }}</dt>
              <dd>{{ s.username || '—' }}@if (s.apiKeyId) { <span class="sec"> · {{ 'auditLog.viaApiKey' | t }}</span> }</dd>
              <dt>{{ 'auditLog.col.ip' | t }}</dt>
              <dd><span class="mono">{{ s.ip || '—' }}</span>@if (s.userAgent) { <div class="ua">{{ s.userAgent }}</div> }</dd>
            </dl>
            @if (diffRows().length === 0) {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="file" /></div>
                <h3>{{ 'auditLog.diff.noChanges' | t }}</h3>
              </div>
            } @else {
              <div class="diff">
                <table>
                  <thead>
                    <tr>
                      <th>{{ 'auditLog.diff.field' | t }}</th>
                      <th>{{ 'auditLog.diff.before' | t }}</th>
                      <th>{{ 'auditLog.diff.after' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of diffRows(); track r.field) {
                      <tr [class.is-changed]="r.changed">
                        <td class="k">{{ r.field }}</td>
                        <td class="v b">{{ r.before }}</td>
                        <td class="v a">{{ r.after }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="selected.set(null)">{{ 'common.close' | t }}</button>
            @if (s.entityId && s.entityType !== 'auth') {
              <button type="button" class="btn btn-primary" (click)="filterEntity(s)"><app-icon name="audit" />{{ 'auditLog.diff.entityHistory' | t }}</button>
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

  /** Sentence-case name first, then the legacy label, then a humanized table name — never raw snake_case. */
  entityLabel(e: string): string {
    if (!e) return '—';
    const humanized = e.charAt(0).toUpperCase() + e.slice(1).replace(/_/g, ' ');
    return this.label(`auditLog.entityName.${e}`, this.label(`auditLog.entity.${e}`, humanized));
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
