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
    .int-tabs { display: flex; gap: 4px; border-bottom: 1px solid #E2E8F0; margin-bottom: 16px; }
    .int-tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 10px 16px; font-size: 14px; color: var(--text-muted); cursor: pointer; }
    .int-tab.active { color: #0F172A; border-bottom-color: #0F172A; font-weight: 600; }
    .card { border: 1px solid #D5D9D9; border-radius: 8px; background: #FFF; padding: 16px; margin-bottom: 16px; }
    .card h3 { margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #0F1111; }
    .card p.hint { margin: 0 0 12px 0; font-size: 13px; color: var(--text-muted); }
    .code { font-family: var(--font-mono, monospace); background: #F1F5F9; border-radius: 6px; padding: 8px 10px; font-size: 12px; word-break: break-all; white-space: pre-wrap; }
    .status-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
    .st-active, .st-success { background: #ECFDF5; color: #047857; }
    .st-revoked, .st-failed { background: #FEF2F2; color: #B91C1C; }
    .st-expired, .st-pending, .st-inactive { background: #FFFBEB; color: #B45309; }
    .scope-grid { display: grid; grid-template-columns: 1fr 140px; gap: 8px 12px; align-items: center; font-size: 13px; }
    .event-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 13px; }
    .event-grid label, .inline-check { display: flex; gap: 6px; align-items: center; cursor: pointer; }
    .row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .row-actions .btn { padding: 4px 10px; font-size: 12px; }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .filters .form-select { min-width: 180px; height: 36px; }
    .modal-wrap { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: 16px; }
    .modal-box { background: #FFF; border-radius: 10px; width: 100%; max-width: 560px; max-height: 90vh; overflow: auto; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
    .modal-box h3 { margin: 0 0 12px 0; font-size: 17px; }
    .warn { background: #FFFBEB; border: 1px solid #FDE68A; color: #92400E; border-radius: 6px; padding: 8px 10px; font-size: 13px; margin-bottom: 12px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .stats { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; margin: 12px 0; }
    .stats strong { font-size: 16px; display: block; }
    .export-grid { display: flex; gap: 8px; flex-wrap: wrap; }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'integrations.title' | t }}</h1>
        <p>{{ 'integrations.subtitle' | t }}</p>
      </div>
      <div class="header-actions">
        <a class="btn btn-outline" [href]="api.docsUrl" target="_blank" rel="noopener">{{ 'integrations.apiDocs' | t }}</a>
      </div>
    </header>

    <div class="int-tabs">
      <button class="int-tab" [class.active]="tab() === 'apiKeys'" (click)="setTab('apiKeys')">{{ 'integrations.tab.apiKeys' | t }}</button>
      <button class="int-tab" [class.active]="tab() === 'webhooks'" (click)="setTab('webhooks')">{{ 'integrations.tab.webhooks' | t }}</button>
      <button class="int-tab" [class.active]="tab() === 'data'" (click)="setTab('data')">{{ 'integrations.tab.data' | t }}</button>
    </div>

    <!-- ─── API KEYS ─── -->
    @if (tab() === 'apiKeys') {
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div>
            <h3>{{ 'integrations.keys.title' | t }}</h3>
            <p class="hint">{{ 'integrations.keys.hint' | t }}</p>
          </div>
          <button class="btn btn-primary" (click)="openKeyForm()">{{ 'integrations.keys.new' | t }}</button>
        </div>
        <div class="code">curl -H "X-API-Key: sk_..." {{ api.apiBase }}/products</div>
      </div>

      <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
        @if (keysLoading()) {
          <div class="loading-state">{{ 'common.loading' | t }}</div>
        } @else if (keys().length === 0) {
          <div class="empty-state"><p>{{ 'integrations.keys.empty' | t }}</p></div>
        } @else {
          <div class="table-scroll">
            <table>
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
                    <td><strong>{{ k.name }}</strong></td>
                    <td class="mono">{{ k.prefix }}…</td>
                    <td style="font-size: 12px;">{{ scopeSummary(k) }}</td>
                    <td><span class="status-badge" [ngClass]="'st-' + keyStatus(k)">{{ ('integrations.keys.status.' + keyStatus(k)) | t }}</span></td>
                    <td>{{ k.lastUsedAt ? (k.lastUsedAt | appDate: 'datetime') : '-' }}</td>
                    <td>{{ k.expiresAt ? (k.expiresAt | appDate) : ('integrations.keys.never' | t) }}</td>
                    <td>{{ k.createdAt | appDate }} @if (k.createdBy) { <div style="font-size: 11px; color: var(--text-muted);">{{ k.createdBy }}</div> }</td>
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
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div>
            <h3>{{ 'integrations.hooks.title' | t }}</h3>
            <p class="hint">{{ 'integrations.hooks.hint' | t }}</p>
          </div>
          <button class="btn btn-primary" (click)="openHookForm()">{{ 'integrations.hooks.new' | t }}</button>
        </div>
      </div>

      <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF; margin-bottom: 16px;">
        @if (hooksLoading()) {
          <div class="loading-state">{{ 'common.loading' | t }}</div>
        } @else if (hooks().length === 0) {
          <div class="empty-state"><p>{{ 'integrations.hooks.empty' | t }}</p></div>
        } @else {
          <div class="table-scroll">
            <table>
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
                    <td>
                      <span class="mono" style="font-size: 12px; word-break: break-all;">{{ h.url }}</span>
                      @if (h.description) { <div style="font-size: 11px; color: var(--text-muted);">{{ h.description }}</div> }
                    </td>
                    <td style="font-size: 12px;">{{ h.events.join(', ') }}</td>
                    <td>
                      <label class="inline-check">
                        <input type="checkbox" [checked]="h.active" (change)="toggleActive(h, $event)" />
                        <span class="status-badge" [ngClass]="h.active ? 'st-active' : 'st-inactive'">{{ (h.active ? 'integrations.hooks.active' : 'integrations.hooks.inactive') | t }}</span>
                      </label>
                    </td>
                    <td>{{ h.updatedAt | appDate: 'datetime' }}</td>
                    <td>
                      <div class="row-actions">
                        <button class="btn btn-outline" (click)="testHook(h)">{{ 'integrations.hooks.test' | t }}</button>
                        <button class="btn btn-outline" (click)="openHookForm(h)">{{ 'common.edit' | t }}</button>
                        <button class="btn btn-outline" (click)="rotateSecret(h)">{{ 'integrations.hooks.rotate' | t }}</button>
                        <button class="btn btn-outline" (click)="showDeliveriesFor(h)">{{ 'integrations.hooks.deliveries' | t }}</button>
                        <button class="btn btn-outline-danger" (click)="deleteHook(h)">{{ 'common.delete' | t }}</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="card">
        <h3>{{ 'integrations.deliveries.title' | t }}</h3>
        <div class="filters" style="margin-top: 8px;">
          <select class="form-select" [ngModel]="deliveryEndpoint()" (ngModelChange)="deliveryEndpoint.set($event); loadDeliveries(1)">
            <option value="">{{ 'integrations.deliveries.allEndpoints' | t }}</option>
            @for (h of hooks(); track h.id) { <option [value]="h.id">{{ h.url }}</option> }
          </select>
          <select class="form-select" [ngModel]="deliveryStatus()" (ngModelChange)="deliveryStatus.set($event); loadDeliveries(1)">
            <option value="">{{ 'integrations.deliveries.allStatuses' | t }}</option>
            <option value="pending">{{ 'integrations.deliveries.status.pending' | t }}</option>
            <option value="success">{{ 'integrations.deliveries.status.success' | t }}</option>
            <option value="failed">{{ 'integrations.deliveries.status.failed' | t }}</option>
          </select>
          <button class="btn btn-outline btn-sm" (click)="loadDeliveries(deliveryPage())">{{ 'integrations.deliveries.refresh' | t }}</button>
        </div>
        @if (deliveriesLoading()) {
          <div class="loading-state">{{ 'common.loading' | t }}</div>
        } @else if (deliveries().length === 0) {
          <div class="empty-state"><p>{{ 'integrations.deliveries.empty' | t }}</p></div>
        } @else {
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{{ 'integrations.deliveries.col.date' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.event' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.endpoint' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.status' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.attempts' | t }}</th>
                  <th>{{ 'integrations.deliveries.col.response' | t }}</th>
                  <th class="th-actions">{{ 'common.actions' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (d of deliveries(); track d.id) {
                  <tr>
                    <td>{{ d.createdAt | appDate: 'datetime' }}</td>
                    <td class="mono" style="font-size: 12px;">{{ d.event }}</td>
                    <td style="font-size: 12px; word-break: break-all;">{{ endpointUrl(d.endpointId) }}</td>
                    <td><span class="status-badge" [ngClass]="'st-' + d.status">{{ ('integrations.deliveries.status.' + d.status) | t }}</span></td>
                    <td class="mono">{{ d.attempts | num }}</td>
                    <td class="mono" style="font-size: 12px;">{{ d.responseCode ?? '-' }}</td>
                    <td>
                      <div class="row-actions">
                        <button class="btn btn-outline" (click)="viewDelivery.set(d)">{{ 'integrations.deliveries.view' | t }}</button>
                        <button class="btn btn-outline" (click)="resend(d)">{{ 'integrations.deliveries.resend' | t }}</button>
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
      <div class="card">
        <h3>{{ 'integrations.export.title' | t }}</h3>
        <p class="hint">{{ 'integrations.export.hint' | t }}</p>
        <div class="export-grid">
          @for (r of exportResources; track r) {
            <button class="btn btn-outline" [disabled]="exporting() === r" (click)="exportCsv(r)">
              {{ ('integrations.resource.' + r) | t }} (.csv)
            </button>
          }
        </div>
      </div>

      <div class="card">
        <h3>{{ 'integrations.import.title' | t }}</h3>
        <p class="hint">{{ 'integrations.import.hint' | t }}</p>
        <div class="filters">
          <select class="form-select" [ngModel]="importResource()" (ngModelChange)="importResource.set($event); resetImport()">
            <option value="products">{{ 'integrations.resource.products' | t }}</option>
            <option value="customers">{{ 'integrations.resource.customers' | t }}</option>
          </select>
          <button class="btn btn-outline btn-sm" (click)="downloadTemplate()">{{ 'integrations.import.template' | t }}</button>
        </div>
        <div class="code" style="margin-bottom: 12px;">{{ template() }}</div>
        <div class="filters">
          <input #fileInput type="file" accept=".csv,text/csv" (change)="onFile($event)" />
          <button class="btn btn-outline" [disabled]="!csvText() || importing()" (click)="runImport(true)">{{ 'integrations.import.validate' | t }}</button>
          <button class="btn btn-primary" [disabled]="!report()?.dryRun || !report()?.valid || importing()" (click)="runImport(false)">{{ 'integrations.import.run' | t }}</button>
          @if (importing()) { <span class="spinner-sm"></span> }
        </div>

        @if (report(); as r) {
          <div class="stats">
            <div><strong>{{ r.total | num }}</strong>{{ 'integrations.import.total' | t }}</div>
            <div><strong>{{ r.valid | num }}</strong>{{ 'integrations.import.valid' | t }}</div>
            <div><strong>{{ r.invalid | num }}</strong>{{ 'integrations.import.invalid' | t }}</div>
            @if (!r.dryRun) {
              <div><strong>{{ r.created | num }}</strong>{{ 'integrations.import.created' | t }}</div>
              <div><strong>{{ r.updated | num }}</strong>{{ 'integrations.import.updated' | t }}</div>
            }
          </div>
          <p class="hint">{{ (r.dryRun ? 'integrations.import.dryRunDone' : 'integrations.import.done') | t }}</p>
          @if (r.errors.length) {
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{{ 'integrations.import.col.row' | t }}</th>
                    <th>{{ 'integrations.import.col.field' | t }}</th>
                    <th>{{ 'integrations.import.col.code' | t }}</th>
                    <th>{{ 'integrations.import.col.message' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of r.errors; track $index) {
                    <tr>
                      <td class="mono">{{ e.row }}</td>
                      <td>{{ e.field || '-' }}</td>
                      <td class="mono" style="font-size: 12px;">{{ e.code }}</td>
                      <td>{{ e.message }}</td>
                    </tr>
                  }
                </tbody>
              </table>
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
            <button class="drawer-close" (click)="keyFormOpen.set(false)">×</button>
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
            <p style="font-size: 13px; font-weight: 600; margin: 8px 0;">{{ 'integrations.keys.form.scopes' | t }}</p>
            <div class="scope-grid">
              @for (r of resources(); track r) {
                <span>{{ resourceLabel(r) }}</span>
                <select class="form-select" [ngModel]="scopeChoices()[r] || ''" (ngModelChange)="setScope(r, $event)">
                  <option value="">{{ 'integrations.keys.scope.none' | t }}</option>
                  <option value="read">{{ 'integrations.keys.scope.read' | t }}</option>
                  <option value="write">{{ 'integrations.keys.scope.write' | t }}</option>
                </select>
              }
            </div>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="keyFormOpen.set(false)" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="createKey()" [disabled]="!keyName().trim() || saving()">{{ 'integrations.keys.create' | t }}</button>
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
            <button class="drawer-close" (click)="hookFormOpen.set(false)">×</button>
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
            <label class="inline-check" style="margin-bottom: 12px; font-size: 13px;">
              <input type="checkbox" [ngModel]="hookActive()" (ngModelChange)="hookActive.set($event)" /> {{ 'integrations.hooks.form.active' | t }}
            </label>
            <p style="font-size: 13px; font-weight: 600; margin: 8px 0;">{{ 'integrations.hooks.form.events' | t }}</p>
            <div class="event-grid">
              @for (e of events(); track e) {
                <label><input type="checkbox" [checked]="hookEvents().includes(e)" (change)="toggleEvent(e)" /> <span class="mono">{{ e }}</span></label>
              }
            </div>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" (click)="hookFormOpen.set(false)" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-primary" (click)="saveHook()" [disabled]="!hookUrl().trim() || hookEvents().length === 0 || saving()">{{ 'common.save' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ─── One-time secret modal ─── -->
    @if (secret(); as s) {
      <div class="modal-wrap">
        <div class="modal-box">
          <h3>{{ s.title }}</h3>
          <div class="warn">{{ 'integrations.secret.warning' | t }}</div>
          <div class="code">{{ s.value }}</div>
          <div class="modal-actions">
            <button class="btn btn-outline" (click)="copy(s.value)">{{ 'integrations.secret.copy' | t }}</button>
            <button class="btn btn-primary" (click)="secret.set(null)">{{ 'integrations.secret.done' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Delivery payload modal ─── -->
    @if (viewDelivery(); as d) {
      <div class="modal-wrap" (click)="viewDelivery.set(null)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3>{{ d.event }}</h3>
          <p class="hint" style="font-size: 12px; color: var(--text-muted);">
            {{ ('integrations.deliveries.status.' + d.status) | t }} · {{ 'integrations.deliveries.col.attempts' | t }}: {{ d.attempts }}
            @if (d.deliveredAt) { · {{ d.deliveredAt | appDate: 'datetime' }} }
            @if (d.nextRetryAt) { · {{ 'integrations.deliveries.nextRetry' | t }}: {{ d.nextRetryAt | appDate: 'datetime' }} }
          </p>
          <p style="font-size: 13px; font-weight: 600; margin: 8px 0 4px;">{{ 'integrations.deliveries.payload' | t }}</p>
          <div class="code">{{ pretty(d.payload) }}</div>
          @if (d.error) {
            <p style="font-size: 13px; font-weight: 600; margin: 8px 0 4px;">{{ 'integrations.deliveries.error' | t }}</p>
            <div class="code" style="color: #B91C1C;">{{ d.error }}</div>
          }
          @if (d.responseBody) {
            <p style="font-size: 13px; font-weight: 600; margin: 8px 0 4px;">{{ 'integrations.deliveries.responseBody' | t }} ({{ d.responseCode ?? '-' }})</p>
            <div class="code">{{ d.responseBody }}</div>
          }
          <div class="modal-actions">
            <button class="btn btn-outline" (click)="resend(d)">{{ 'integrations.deliveries.resend' | t }}</button>
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
