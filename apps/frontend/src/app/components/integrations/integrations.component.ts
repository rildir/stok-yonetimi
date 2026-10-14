import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { IntegrationsService } from '../../services/integrations.service';
import {
  ApiKey,
  ApiKeyAccess,
  ExportResource,
  ImportReport,
  ImportResource,
  WebhookDelivery,
  WebhookEndpoint,
} from '../../models/inventory.models';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { I18nService, TranslatePipe, NumberFormatPipe, AppDatePipe } from '../../i18n';

type Tab = 'apiKeys' | 'webhooks' | 'data';
type ScopeChoice = '' | ApiKeyAccess;

const CSV_TEMPLATES: Record<ImportResource, string> = {
  products: 'sku,name,category,price,quantity,minQuantity,unit,barcode,barcodeType,supplierId',
  customers: 'name,type,email,phone,taxNumber,country,address,city,postalCode,currency,notes',
};

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
    :host { display: block; min-width: 0; }
    .tabs { margin-bottom: var(--space-5); overflow-x: auto; }
    .tab { white-space: nowrap; }
    td { min-width: 0; }
    td.mono::before { font-family: var(--font-sans); }
    @media (min-width: 641px) { td.td-actions { display: table-cell; text-align: right; vertical-align: middle; } }
    td > .mono, td > span.ep-cell { min-width: 0; }
    .section-card { margin-bottom: var(--space-4); }
    .section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); flex-wrap: wrap; }
    .section-head > div { min-width: 0; flex: 1 1 260px; }
    .hint { margin: var(--space-1) 0 var(--space-3); font-size: var(--text-sm); color: var(--color-text-muted); }
    .code { font-family: var(--font-mono, monospace); background: var(--color-surface-muted); color: var(--color-text); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); font-size: var(--text-xs); line-height: 1.6; word-break: break-all; white-space: pre-wrap; max-width: 100%; overflow-wrap: anywhere; }
    .code-scroll { max-height: 320px; overflow: auto; }
    .code-danger { color: var(--color-danger-text); background: var(--color-danger-subtle); border-color: var(--color-danger-border); }
    .sub { font-size: var(--text-2xs); color: var(--color-text-muted); }
    .url-cell { max-width: 320px; min-width: 0; }
    .url-cell .mono, .ep-cell { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ep-cell { max-width: 240px; }
    .scope-cell { font-size: var(--text-xs); color: var(--color-text-secondary); max-width: 260px; }
    .scope-grid { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: var(--space-2) var(--space-3); align-items: center; font-size: var(--text-sm); }
    .event-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-2); font-size: var(--text-sm); }
    .event-grid label, .inline-check { display: flex; gap: var(--space-2); align-items: center; cursor: pointer; min-width: 0; }
    .event-grid label { padding: var(--space-2); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); }
    .event-grid .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-xs); }
    .group-label { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text); margin: var(--space-4) 0 var(--space-2); }
    .row-actions { display: flex; gap: var(--space-1); flex-wrap: wrap; justify-content: flex-end; }
    .filters { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; margin: var(--space-3) 0; }
    .filters .select { min-width: 180px; max-width: 100%; flex: 0 1 260px; }
    .filters input[type=file] { max-width: 100%; font-size: var(--text-sm); color: var(--color-text-secondary); }
    .modal-wrap { position: fixed; inset: 0; background: rgba(8, 10, 15, 0.55); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: var(--space-4); }
    .modal-box { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-lg); width: 100%; max-width: 560px; max-height: 90vh; overflow: auto; padding: var(--space-6); box-shadow: var(--shadow-xl); min-width: 0; }
    .modal-box h3 { margin: 0 0 var(--space-3); font-size: var(--text-lg); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
    .warn { display: flex; gap: var(--space-2); align-items: flex-start; background: var(--color-warning-subtle); border: 1px solid var(--color-warning-border); color: var(--color-warning-text); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); margin-bottom: var(--space-3); }
    .warn svg { flex-shrink: 0; margin-top: 2px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-5); flex-wrap: wrap; }
    .secret-box { font-size: var(--text-sm); padding: var(--space-3); }
    .export-grid { display: flex; gap: var(--space-2); flex-wrap: wrap; }
    .report-kpis { margin: var(--space-4) 0 var(--space-2); grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    @media (max-width: 640px) {
      .row-actions { justify-content: flex-start; }
      .url-cell, .ep-cell, .scope-cell { max-width: none; }
      .scope-grid { grid-template-columns: minmax(0, 1fr) 130px; }
      .modal-box { padding: var(--space-4); }
      .modal-actions .btn { flex: 1 1 auto; }
      .filters .select { flex: 1 1 100%; }
    }
  `],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'integrations.title' | t }}</h1>
        <p>{{ 'integrations.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary" [href]="api.docsUrl" target="_blank" rel="noopener">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
          {{ 'integrations.apiDocs' | t }}
        </a>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" [class.active]="tab() === 'apiKeys'" (click)="setTab('apiKeys')">{{ 'integrations.tab.apiKeys' | t }}</button>
      <button class="tab" role="tab" [class.active]="tab() === 'webhooks'" (click)="setTab('webhooks')">{{ 'integrations.tab.webhooks' | t }}</button>
      <button class="tab" role="tab" [class.active]="tab() === 'data'" (click)="setTab('data')">{{ 'integrations.tab.data' | t }}</button>
    </div>

    <!-- ─── API KEYS ─── -->
    @if (tab() === 'apiKeys') {
      <div class="card section-card">
        <div class="section-head">
          <div>
            <div class="card-title">{{ 'integrations.keys.title' | t }}</div>
            <p class="hint">{{ 'integrations.keys.hint' | t }}</p>
          </div>
          <button class="btn btn-primary" (click)="openKeyForm()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'integrations.keys.new' | t }}
          </button>
        </div>
        <div class="code">curl -H "X-API-Key: sk_..." {{ api.apiBase }}/products</div>
      </div>

      <div class="table-card">
        @if (keysLoading()) {
          <div class="stack" style="padding: var(--space-4);">
            @for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 36px;"></div> }
          </div>
        } @else if (keys().length === 0) {
          <div class="empty-state">
            <div class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></svg></div>
            <div class="empty-state-title">{{ 'integrations.keys.empty' | t }}</div>
          </div>
        } @else {
          <div class="table-scroll">
            <table class="table-responsive">
              <thead>
                <tr>
                  <th>{{ 'integrations.keys.col.name' | t }}</th>
                  <th>{{ 'integrations.keys.col.prefix' | t }}</th>
                  <th>{{ 'integrations.keys.col.scopes' | t }}</th>
                  <th>{{ 'integrations.keys.col.status' | t }}</th>
                  <th>{{ 'integrations.keys.col.lastUsed' | t }}</th>
                  <th>{{ 'integrations.keys.col.expires' | t }}</th>
                  <th>{{ 'integrations.keys.col.created' | t }}</th>
                  <th class="th-actions">{{ 'common.actions' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (k of keys(); track k.id) {
                  <tr>
                    <td [attr.data-label]="'integrations.keys.col.name' | t"><strong>{{ k.name }}</strong></td>
                    <td [attr.data-label]="'integrations.keys.col.prefix' | t" class="mono">{{ k.prefix }}…</td>
                    <td [attr.data-label]="'integrations.keys.col.scopes' | t" class="scope-cell">{{ scopeSummary(k) }}</td>
                    <td [attr.data-label]="'integrations.keys.col.status' | t"><span class="badge" [ngClass]="statusBadge(keyStatus(k))">{{ ('integrations.keys.status.' + keyStatus(k)) | t }}</span></td>
                    <td [attr.data-label]="'integrations.keys.col.lastUsed' | t">{{ k.lastUsedAt ? (k.lastUsedAt | appDate: 'datetime') : '-' }}</td>
                    <td [attr.data-label]="'integrations.keys.col.expires' | t">{{ k.expiresAt ? (k.expiresAt | appDate) : ('integrations.keys.never' | t) }}</td>
                    <td [attr.data-label]="'integrations.keys.col.created' | t">{{ k.createdAt | appDate }} @if (k.createdBy) { <div class="sub">{{ k.createdBy }}</div> }</td>
                    <td class="td-actions">
                      @if (keyStatus(k) === 'active') {
                        <button class="btn btn-outline-danger btn-sm" (click)="revokeKey(k)">{{ 'integrations.keys.revoke' | t }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- ─── WEBHOOKS ─── -->
    @if (tab() === 'webhooks') {
      <div class="card section-card">
        <div class="section-head">
          <div>
            <div class="card-title">{{ 'integrations.hooks.title' | t }}</div>
            <p class="hint" style="margin-bottom: 0;">{{ 'integrations.hooks.hint' | t }}</p>
          </div>
          <button class="btn btn-primary" (click)="openHookForm()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'integrations.hooks.new' | t }}
          </button>
        </div>
      </div>

      <div class="table-card section-card">
        @if (hooksLoading()) {
          <div class="stack" style="padding: var(--space-4);">
            @for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 36px;"></div> }
          </div>
        } @else if (hooks().length === 0) {
          <div class="empty-state">
            <div class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
            <div class="empty-state-title">{{ 'integrations.hooks.empty' | t }}</div>
          </div>
        } @else {
          <div class="table-scroll">
            <table class="table-responsive">
              <thead>
                <tr>
                  <th>{{ 'integrations.hooks.col.url' | t }}</th>
                  <th>{{ 'integrations.hooks.col.events' | t }}</th>
                  <th>{{ 'integrations.hooks.col.active' | t }}</th>
                  <th>{{ 'integrations.hooks.col.updated' | t }}</th>
                  <th class="th-actions">{{ 'common.actions' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (h of hooks(); track h.id) {
                  <tr>
                    <td [attr.data-label]="'integrations.hooks.col.url' | t" class="url-cell">
                      <span class="mono" [title]="h.url">{{ h.url }}</span>
                      @if (h.description) { <div class="sub">{{ h.description }}</div> }
                    </td>
                    <td [attr.data-label]="'integrations.hooks.col.events' | t" class="scope-cell">{{ h.events.join(', ') }}</td>
                    <td [attr.data-label]="'integrations.hooks.col.active' | t">
                      <label class="inline-check">
                        <input type="checkbox" [checked]="h.active" (change)="toggleActive(h, $event)" />
                        <span class="badge" [ngClass]="h.active ? 'badge-success' : 'badge-warning'">{{ (h.active ? 'integrations.hooks.active' : 'integrations.hooks.inactive') | t }}</span>
                      </label>
                    </td>
                    <td [attr.data-label]="'integrations.hooks.col.updated' | t">{{ h.updatedAt | appDate: 'datetime' }}</td>
                    <td class="td-actions">
                      <div class="row-actions">
                        <button class="btn btn-ghost btn-sm" (click)="testHook(h)">{{ 'integrations.hooks.test' | t }}</button>
                        <button class="btn btn-ghost btn-sm" (click)="openHookForm(h)">{{ 'common.edit' | t }}</button>
                        <button class="btn btn-ghost btn-sm" (click)="rotateSecret(h)">{{ 'integrations.hooks.rotate' | t }}</button>
                        <button class="btn btn-ghost btn-sm" (click)="showDeliveriesFor(h)">{{ 'integrations.hooks.deliveries' | t }}</button>
                        <button class="btn btn-outline-danger btn-sm" (click)="deleteHook(h)">{{ 'common.delete' | t }}</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="card section-card">
        <div class="card-title">{{ 'integrations.deliveries.title' | t }}</div>
        <div class="filters">
          <select class="select" [ngModel]="deliveryEndpoint()" (ngModelChange)="deliveryEndpoint.set($event); loadDeliveries(1)">
            <option value="">{{ 'integrations.deliveries.allEndpoints' | t }}</option>
            @for (h of hooks(); track h.id) { <option [value]="h.id">{{ h.url }}</option> }
          </select>
          <select class="select" [ngModel]="deliveryStatus()" (ngModelChange)="deliveryStatus.set($event); loadDeliveries(1)">
            <option value="">{{ 'integrations.deliveries.allStatuses' | t }}</option>
            <option value="pending">{{ 'integrations.deliveries.status.pending' | t }}</option>
            <option value="success">{{ 'integrations.deliveries.status.success' | t }}</option>
            <option value="failed">{{ 'integrations.deliveries.status.failed' | t }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" (click)="loadDeliveries(deliveryPage())">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
            {{ 'integrations.deliveries.refresh' | t }}
          </button>
        </div>
        @if (deliveriesLoading()) {
          <div class="stack">
            @for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 36px;"></div> }
          </div>
        } @else if (deliveries().length === 0) {
          <div class="empty-state">
            <div class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg></div>
            <div class="empty-state-title">{{ 'integrations.deliveries.empty' | t }}</div>
          </div>
        } @else {
          <div class="table-scroll">
            <table class="table-responsive">
              <thead>
                <tr>
                  <th>{{ 'integrations.deliveries.col.date' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.event' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.endpoint' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.status' | t }}</th>
                  <th class="num">{{ 'integrations.deliveries.col.attempts' | t }}</th>
                  <th class="num">{{ 'integrations.deliveries.col.response' | t }}</th>
                  <th class="th-actions">{{ 'common.actions' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (d of deliveries(); track d.id) {
                  <tr>
                    <td [attr.data-label]="'integrations.deliveries.col.date' | t">{{ d.createdAt | appDate: 'datetime' }}</td>
                    <td [attr.data-label]="'integrations.deliveries.col.event' | t" class="mono">{{ d.event }}</td>
                    <td [attr.data-label]="'integrations.deliveries.col.endpoint' | t"><span class="mono ep-cell" [title]="endpointUrl(d.endpointId)">{{ endpointUrl(d.endpointId) }}</span></td>
                    <td [attr.data-label]="'integrations.deliveries.col.status' | t"><span class="badge" [ngClass]="statusBadge(d.status)">{{ ('integrations.deliveries.status.' + d.status) | t }}</span></td>
                    <td [attr.data-label]="'integrations.deliveries.col.attempts' | t" class="num">{{ d.attempts | num }}</td>
                    <td [attr.data-label]="'integrations.deliveries.col.response' | t" class="num mono">{{ d.responseCode ?? '-' }}</td>
                    <td class="td-actions">
                      <div class="row-actions">
                        <button class="btn btn-ghost btn-sm" (click)="viewDelivery.set(d)">{{ 'integrations.deliveries.view' | t }}</button>
                        <button class="btn btn-ghost btn-sm" (click)="resend(d)">{{ 'integrations.deliveries.resend' | t }}</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="pagination-bar">
            <div class="pagination-info">{{ 'integrations.pagination' | t: { total: deliveryTotal(), page: deliveryPage(), pages: deliveryPages() } }}</div>
            <div class="pagination-actions">
              <button class="page-btn" [disabled]="deliveryPage() === 1" (click)="loadDeliveries(deliveryPage() - 1)">{{ 'integrations.prev' | t }}</button>
              <button class="page-btn" [disabled]="deliveryPage() >= deliveryPages()" (click)="loadDeliveries(deliveryPage() + 1)">{{ 'integrations.next' | t }}</button>
            </div>
          </div>
        }
      </div>
    }

    <!-- ─── IMPORT / EXPORT ─── -->
    @if (tab() === 'data') {
      <div class="card section-card">
        <div class="card-title">{{ 'integrations.export.title' | t }}</div>
        <p class="hint">{{ 'integrations.export.hint' | t }}</p>
        <div class="export-grid">
          @for (r of exportResources; track r) {
            <button class="btn btn-secondary" [class.is-loading]="exporting() === r" [disabled]="exporting() === r" (click)="exportCsv(r)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              {{ ('integrations.resource.' + r) | t }} (.csv)
            </button>
          }
        </div>
      </div>

      <div class="card section-card">
        <div class="card-title">{{ 'integrations.import.title' | t }}</div>
        <p class="hint">{{ 'integrations.import.hint' | t }}</p>
        <div class="filters">
          <select class="select" [ngModel]="importResource()" (ngModelChange)="importResource.set($event); resetImport()">
            <option value="products">{{ 'integrations.resource.products' | t }}</option>
            <option value="customers">{{ 'integrations.resource.customers' | t }}</option>
          </select>
          <button class="btn btn-ghost btn-sm" (click)="downloadTemplate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            {{ 'integrations.import.template' | t }}
          </button>
        </div>
        <div class="code" style="margin-bottom: var(--space-3);">{{ template() }}</div>
        <div class="filters">
          <input #fileInput type="file" accept=".csv,text/csv" (change)="onFile($event)" />
          <button class="btn btn-secondary" [disabled]="!csvText() || importing()" (click)="runImport(true)">{{ 'integrations.import.validate' | t }}</button>
          <button class="btn btn-primary" [disabled]="!report()?.dryRun || !report()?.valid || importing()" (click)="runImport(false)">{{ 'integrations.import.run' | t }}</button>
          @if (importing()) { <span class="spinner-sm"></span> }
        </div>

        @if (report(); as r) {
          <div class="kpi-grid report-kpis">
            <div class="stat-card"><div class="kpi-label">{{ 'integrations.import.total' | t }}</div><div class="kpi-value">{{ r.total | num }}</div></div>
            <div class="stat-card"><div class="kpi-label">{{ 'integrations.import.valid' | t }}</div><div class="kpi-value">{{ r.valid | num }}</div></div>
            <div class="stat-card"><div class="kpi-label">{{ 'integrations.import.invalid' | t }}</div><div class="kpi-value">{{ r.invalid | num }}</div></div>
            @if (!r.dryRun) {
              <div class="stat-card"><div class="kpi-label">{{ 'integrations.import.created' | t }}</div><div class="kpi-value">{{ r.created | num }}</div></div>
              <div class="stat-card"><div class="kpi-label">{{ 'integrations.import.updated' | t }}</div><div class="kpi-value">{{ r.updated | num }}</div></div>
            }
          </div>
          <p class="hint">{{ (r.dryRun ? 'integrations.import.dryRunDone' : 'integrations.import.done') | t }}</p>
          @if (r.errors.length) {
            <div class="table-card">
              <div class="table-scroll">
                <table class="table-responsive">
                  <thead>
                    <tr>
                      <th class="num">{{ 'integrations.import.col.row' | t }}</th>
                      <th>{{ 'integrations.import.col.field' | t }}</th>
                      <th>{{ 'integrations.import.col.code' | t }}</th>
                      <th>{{ 'integrations.import.col.message' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (e of r.errors; track $index) {
                      <tr>
                        <td [attr.data-label]="'integrations.import.col.row' | t" class="num">{{ e.row }}</td>
                        <td [attr.data-label]="'integrations.import.col.field' | t">{{ e.field || '-' }}</td>
                        <td [attr.data-label]="'integrations.import.col.code' | t" class="mono">{{ e.code }}</td>
                        <td [attr.data-label]="'integrations.import.col.message' | t">{{ e.message }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }
      </div>
    }

    <!-- ─── API key form drawer ─── -->
    @if (keyFormOpen()) {
      <div class="drawer-overlay" (click)="keyFormOpen.set(false)">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'integrations.keys.new' | t }}</span>
            <button class="drawer-close" (click)="keyFormOpen.set(false)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            <div class="form-field">
              <input id="keyName" type="text" class="form-input" [class.has-value]="!!keyName()" [ngModel]="keyName()" (ngModelChange)="keyName.set($event)" />
              <label for="keyName" class="form-label">{{ 'integrations.keys.form.name' | t }}</label>
            </div>
            <div class="form-field">
              <input id="keyExpires" type="date" class="form-input has-value" [ngModel]="keyExpires()" (ngModelChange)="keyExpires.set($event)" />
              <label for="keyExpires" class="form-label">{{ 'integrations.keys.form.expires' | t }}</label>
            </div>
            <div class="group-label">{{ 'integrations.keys.form.scopes' | t }}</div>
            <div class="scope-grid">
              @for (r of resources(); track r) {
                <span>{{ resourceLabel(r) }}</span>
                <select class="select" [ngModel]="scopeChoices()[r] || ''" (ngModelChange)="setScope(r, $event)">
                  <option value="">{{ 'integrations.keys.scope.none' | t }}</option>
                  <option value="read">{{ 'integrations.keys.scope.read' | t }}</option>
                  <option value="write">{{ 'integrations.keys.scope.write' | t }}</option>
                </select>
              }
            </div>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="keyFormOpen.set(false)" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" [class.is-loading]="saving()" (click)="createKey()" [disabled]="!keyName().trim() || saving()">{{ 'integrations.keys.create' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Webhook form drawer ─── -->
    @if (hookFormOpen()) {
      <div class="drawer-overlay" (click)="hookFormOpen.set(false)">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (hookEditId() ? 'integrations.hooks.editTitle' : 'integrations.hooks.new') | t }}</span>
            <button class="drawer-close" (click)="hookFormOpen.set(false)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="drawer-body">
            <div class="form-field">
              <input id="hookUrl" type="url" class="form-input mono" [class.has-value]="!!hookUrl()" [ngModel]="hookUrl()" (ngModelChange)="hookUrl.set($event)" placeholder="https://" />
              <label for="hookUrl" class="form-label">{{ 'integrations.hooks.form.url' | t }}</label>
            </div>
            <div class="form-field">
              <input id="hookDesc" type="text" class="form-input" [class.has-value]="!!hookDesc()" [ngModel]="hookDesc()" (ngModelChange)="hookDesc.set($event)" />
              <label for="hookDesc" class="form-label">{{ 'integrations.hooks.form.description' | t }}</label>
            </div>
            <label class="inline-check" style="font-size: var(--text-sm);">
              <input type="checkbox" [ngModel]="hookActive()" (ngModelChange)="hookActive.set($event)" /> {{ 'integrations.hooks.form.active' | t }}
            </label>
            <div class="group-label">{{ 'integrations.hooks.form.events' | t }}</div>
            <div class="event-grid">
              @for (e of events(); track e) {
                <label [title]="e"><input type="checkbox" [checked]="hookEvents().includes(e)" (change)="toggleEvent(e)" /> <span class="mono">{{ e }}</span></label>
              }
            </div>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="hookFormOpen.set(false)" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" [class.is-loading]="saving()" (click)="saveHook()" [disabled]="!hookUrl().trim() || hookEvents().length === 0 || saving()">{{ 'common.save' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ─── One-time secret modal ─── -->
    @if (secret(); as s) {
      <div class="modal-wrap">
        <div class="modal-box" role="dialog" aria-modal="true">
          <h3>{{ s.title }}</h3>
          <div class="warn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/></svg>
            <span>{{ 'integrations.secret.warning' | t }}</span>
          </div>
          <div class="code secret-box">{{ s.value }}</div>
          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="copy(s.value)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              {{ 'integrations.secret.copy' | t }}
            </button>
            <button class="btn btn-primary" (click)="secret.set(null)">{{ 'integrations.secret.done' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Delivery payload modal ─── -->
    @if (viewDelivery(); as d) {
      <div class="modal-wrap" (click)="viewDelivery.set(null)">
        <div class="modal-box" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h3 class="mono">{{ d.event }}</h3>
          <p class="hint">
            <span class="badge" [ngClass]="statusBadge(d.status)">{{ ('integrations.deliveries.status.' + d.status) | t }}</span>
            · {{ 'integrations.deliveries.col.attempts' | t }}: {{ d.attempts }}
            @if (d.deliveredAt) { · {{ d.deliveredAt | appDate: 'datetime' }} }
            @if (d.nextRetryAt) { · {{ 'integrations.deliveries.nextRetry' | t }}: {{ d.nextRetryAt | appDate: 'datetime' }} }
          </p>
          <div class="group-label">{{ 'integrations.deliveries.payload' | t }}</div>
          <div class="code code-scroll">{{ pretty(d.payload) }}</div>
          @if (d.error) {
            <div class="group-label">{{ 'integrations.deliveries.error' | t }}</div>
            <div class="code code-danger">{{ d.error }}</div>
          }
          @if (d.responseBody) {
            <div class="group-label">{{ 'integrations.deliveries.responseBody' | t }} ({{ d.responseCode ?? '-' }})</div>
            <div class="code code-scroll">{{ d.responseBody }}</div>
          }
          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="resend(d)">{{ 'integrations.deliveries.resend' | t }}</button>
            <button class="btn btn-primary" (click)="viewDelivery.set(null)">{{ 'common.close' | t }}</button>
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class IntegrationsComponent implements OnInit {
  api = inject(IntegrationsService);
  ui = inject(UiStateService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  tab = signal<Tab>('apiKeys');
  saving = signal(false);
  secret = signal<{ title: string; value: string } | null>(null);

  // API keys
  resources = signal<string[]>([]);
  keys = signal<ApiKey[]>([]);
  keysLoading = signal(false);
  keyFormOpen = signal(false);
  keyName = signal('');
  keyExpires = signal('');
  scopeChoices = signal<Record<string, ScopeChoice>>({});

  // Webhooks
  events = signal<string[]>([]);
  hooks = signal<WebhookEndpoint[]>([]);
  hooksLoading = signal(false);
  hookFormOpen = signal(false);
  hookEditId = signal<string | null>(null);
  hookUrl = signal('');
  hookDesc = signal('');
  hookActive = signal(true);
  hookEvents = signal<string[]>([]);

  deliveries = signal<WebhookDelivery[]>([]);
  deliveriesLoading = signal(false);
  deliveryEndpoint = signal('');
  deliveryStatus = signal('');
  deliveryPage = signal(1);
  deliveryTotal = signal(0);
  readonly deliveryPageSize = 20;
  deliveryPages = computed(() => Math.max(1, Math.ceil(this.deliveryTotal() / this.deliveryPageSize)));
  viewDelivery = signal<WebhookDelivery | null>(null);

  // Import / export
  readonly exportResources: ExportResource[] = ['products', 'customers', 'orders', 'stock'];
  exporting = signal<ExportResource | null>(null);
  importResource = signal<ImportResource>('products');
  csvText = signal('');
  importing = signal(false);
  report = signal<ImportReport | null>(null);
  template = computed(() => CSV_TEMPLATES[this.importResource()]);

  private loaded = new Set<Tab>();

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const t = params['tab'] as Tab;
      const res = params['resource'];
      if (res === 'products' || res === 'customers') this.importResource.set(res);
      this.activate(t === 'webhooks' || t === 'data' ? t : 'apiKeys');
    });
  }

  setTab(t: Tab) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t }, replaceUrl: true });
  }

  private activate(t: Tab) {
    this.tab.set(t);
    if (this.loaded.has(t)) return;
    this.loaded.add(t);
    if (t === 'apiKeys') {
      this.api.getApiKeyResources().subscribe({ next: r => this.resources.set(r || []), error: err => this.fail(err) });
      this.loadKeys();
    } else if (t === 'webhooks') {
      this.api.getWebhookEvents().subscribe({ next: e => this.events.set(e || []), error: err => this.fail(err) });
      this.loadHooks();
      this.loadDeliveries(1);
    }
  }

  private fail(err: any) {
    this.ui.showToast(err?.error?.message || this.i18n.t('integrations.actionFailed'), 'error');
  }

  private confirmAction(titleKey: string, messageKey: string, params: Record<string, unknown>, isDelete: boolean, action: () => Observable<unknown>) {
    this.ui.openConfirm({
      title: this.i18n.t(titleKey),
      message: this.i18n.t(messageKey, params),
      isDelete,
      onConfirm: () => action(),
    });
  }

  copy(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => this.ui.showToast(this.i18n.t('integrations.secret.copied'), 'success'),
        () => this.ui.showToast(this.i18n.t('integrations.secret.copyFailed'), 'error'),
      );
    }
  }

  statusBadge(st: string): string {
    if (st === 'active' || st === 'success') return 'badge-success';
    if (st === 'revoked' || st === 'failed') return 'badge-danger';
    return 'badge-warning';
  }

  pretty(v: unknown): string {
    return JSON.stringify(v, null, 2);
  }

  // ─── API keys ───
  loadKeys() {
    this.keysLoading.set(true);
    this.api.getApiKeys().subscribe({
      next: k => { this.keys.set(k || []); this.keysLoading.set(false); },
      error: err => { this.keysLoading.set(false); this.fail(err); }
    });
  }

  keyStatus(k: ApiKey): 'active' | 'revoked' | 'expired' {
    if (k.revoked) return 'revoked';
    if (k.expiresAt && new Date(k.expiresAt).getTime() < Date.now()) return 'expired';
    return 'active';
  }

  resourceLabel(r: string): string {
    const key = `integrations.resource.${r}`;
    const v = this.i18n.t(key);
    return v !== key ? v : r;
  }

  scopeSummary(k: ApiKey): string {
    const entries = Object.entries(k.scopes || {});
    if (!entries.length) return '-';
    return entries.map(([r, a]) => `${this.resourceLabel(r)}: ${this.i18n.t('integrations.keys.scope.' + a)}`).join(', ');
  }

  openKeyForm() {
    this.keyName.set('');
    this.keyExpires.set('');
    this.scopeChoices.set({});
    this.keyFormOpen.set(true);
  }

  setScope(r: string, v: ScopeChoice) {
    this.scopeChoices.update(s => ({ ...s, [r]: v }));
  }

  createKey() {
    const scopes: Record<string, ApiKeyAccess> = {};
    Object.entries(this.scopeChoices()).forEach(([r, v]) => { if (v) scopes[r] = v; });
    const exp = this.keyExpires();
    this.saving.set(true);
    this.api.createApiKey({
      name: this.keyName().trim(),
      scopes,
      expiresAt: exp ? new Date(`${exp}T23:59:59`).toISOString() : null,
    }).subscribe({
      next: k => {
        this.saving.set(false);
        this.keyFormOpen.set(false);
        this.loadKeys();
        if (k.secret) this.secret.set({ title: this.i18n.t('integrations.secret.keyTitle'), value: k.secret });
      },
      error: err => { this.saving.set(false); this.fail(err); }
    });
  }

  revokeKey(k: ApiKey) {
    this.confirmAction('integrations.keys.revokeTitle', 'integrations.keys.revokeMessage', { name: k.name }, true, () =>
      this.api.revokeApiKey(k.id).pipe(tap({
        next: () => { this.loadKeys(); this.ui.showToast(this.i18n.t('integrations.keys.revoked'), 'success'); },
        error: err => this.fail(err)
      }))
    );
  }

  // ─── Webhooks ───
  loadHooks() {
    this.hooksLoading.set(true);
    this.api.getWebhooks().subscribe({
      next: h => { this.hooks.set(h || []); this.hooksLoading.set(false); },
      error: err => { this.hooksLoading.set(false); this.fail(err); }
    });
  }

  endpointUrl(id: string): string {
    return this.hooks().find(h => h.id === id)?.url || id;
  }

  openHookForm(h?: WebhookEndpoint) {
    this.hookEditId.set(h?.id || null);
    this.hookUrl.set(h?.url || '');
    this.hookDesc.set(h?.description || '');
    this.hookActive.set(h ? h.active : true);
    this.hookEvents.set(h ? [...h.events] : []);
    this.hookFormOpen.set(true);
  }

  toggleEvent(e: string) {
    this.hookEvents.update(list => (list.includes(e) ? list.filter(x => x !== e) : [...list, e]));
  }

  saveHook() {
    const payload = {
      url: this.hookUrl().trim(),
      description: this.hookDesc().trim() || null,
      events: this.hookEvents(),
      active: this.hookActive(),
    };
    const id = this.hookEditId();
    this.saving.set(true);
    const req = id ? this.api.updateWebhook(id, payload) : this.api.createWebhook(payload);
    req.subscribe({
      next: h => {
        this.saving.set(false);
        this.hookFormOpen.set(false);
        this.loadHooks();
        if (!id && h.secret) {
          this.secret.set({ title: this.i18n.t('integrations.secret.hookTitle'), value: h.secret });
        } else {
          this.ui.showToast(this.i18n.t('integrations.hooks.saved'), 'success');
        }
      },
      error: err => { this.saving.set(false); this.fail(err); }
    });
  }

  toggleActive(h: WebhookEndpoint, event: Event) {
    const active = (event.target as HTMLInputElement).checked;
    this.api.updateWebhook(h.id, { active }).subscribe({
      next: () => this.hooks.update(list => list.map(x => (x.id === h.id ? { ...x, active } : x))),
      error: err => { (event.target as HTMLInputElement).checked = !active; this.fail(err); }
    });
  }

  testHook(h: WebhookEndpoint) {
    this.api.testWebhook(h.id).subscribe({
      next: d => {
        this.ui.showToast(this.i18n.t('integrations.hooks.testSent', { status: this.i18n.t('integrations.deliveries.status.' + d.status) }), d.status === 'failed' ? 'error' : 'success');
        this.loadDeliveries(1);
      },
      error: err => this.fail(err)
    });
  }

  rotateSecret(h: WebhookEndpoint) {
    this.confirmAction('integrations.hooks.rotateTitle', 'integrations.hooks.rotateMessage', { url: h.url }, false, () =>
      this.api.rotateWebhookSecret(h.id).pipe(tap({
        next: r => this.secret.set({ title: this.i18n.t('integrations.secret.hookTitle'), value: r.secret }),
        error: err => this.fail(err)
      }))
    );
  }

  deleteHook(h: WebhookEndpoint) {
    this.confirmAction('integrations.hooks.deleteTitle', 'integrations.hooks.deleteMessage', { url: h.url }, true, () =>
      this.api.deleteWebhook(h.id).pipe(tap({
        next: () => { this.loadHooks(); this.ui.showToast(this.i18n.t('integrations.hooks.deleted'), 'success'); },
        error: err => this.fail(err)
      }))
    );
  }

  showDeliveriesFor(h: WebhookEndpoint) {
    this.deliveryEndpoint.set(h.id);
    this.loadDeliveries(1);
  }

  loadDeliveries(page: number) {
    this.deliveriesLoading.set(true);
    this.api.getWebhookDeliveries({
      endpointId: this.deliveryEndpoint(),
      status: this.deliveryStatus(),
      page,
      pageSize: this.deliveryPageSize,
    }).subscribe({
      next: res => {
        this.deliveries.set(res.items || []);
        this.deliveryTotal.set(res.total || 0);
        this.deliveryPage.set(res.page || page);
        this.deliveriesLoading.set(false);
      },
      error: err => { this.deliveriesLoading.set(false); this.fail(err); }
    });
  }

  resend(d: WebhookDelivery) {
    this.api.resendDelivery(d.id).subscribe({
      next: nd => {
        this.ui.showToast(this.i18n.t('integrations.deliveries.resent'), 'success');
        if (this.viewDelivery()?.id === d.id) this.viewDelivery.set(nd);
        this.loadDeliveries(this.deliveryPage());
      },
      error: err => this.fail(err)
    });
  }

  // ─── Import / export ───
  private saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  exportCsv(r: ExportResource) {
    this.exporting.set(r);
    this.api.exportCsv(r).subscribe({
      next: blob => {
        this.exporting.set(null);
        this.saveBlob(blob, `${r}-${new Date().toISOString().slice(0, 10)}.csv`);
      },
      error: err => {
        this.exporting.set(null);
        // Blob error bodies: try to surface the backend message.
        if (err?.error instanceof Blob) {
          err.error.text().then((t: string) => {
            let msg = '';
            try { msg = JSON.parse(t)?.message || ''; } catch { /* not JSON */ }
            this.ui.showToast(msg || this.i18n.t('integrations.export.failed'), 'error');
          });
        } else {
          this.ui.showToast(err?.error?.message || this.i18n.t('integrations.export.failed'), 'error');
        }
      }
    });
  }

  downloadTemplate() {
    this.saveBlob(new Blob([this.template() + '\n'], { type: 'text/csv;charset=utf-8' }), `${this.importResource()}-template.csv`);
  }

  resetImport() {
    this.report.set(null);
  }

  onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.report.set(null);
    this.csvText.set('');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.csvText.set(String(reader.result || ''));
    reader.onerror = () => this.ui.showToast(this.i18n.t('integrations.import.readFailed'), 'error');
    reader.readAsText(file);
  }

  runImport(dryRun: boolean) {
    if (!this.csvText()) return;
    this.importing.set(true);
    this.api.importCsv(this.importResource(), this.csvText(), dryRun).subscribe({
      next: r => {
        this.importing.set(false);
        this.report.set({ ...r, errors: r.errors || [] });
        if (!dryRun) this.ui.showToast(this.i18n.t('integrations.import.success', { created: r.created, updated: r.updated }), 'success');
      },
      error: err => { this.importing.set(false); this.fail(err); }
    });
  }
}
