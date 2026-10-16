import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { TRANSFER_BASES } from '../../services/kvkk.service';
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
import { IconComponent } from '../shared/icon.component';

type Tab = 'apiKeys' | 'webhooks' | 'data';
type ScopeChoice = '' | ApiKeyAccess;

const CSV_TEMPLATES: Record<ImportResource, string> = {
  products: 'sku,name,category,price,quantity,minQuantity,unit,barcode,barcodeType,supplierId',
  customers: 'name,type,identityType,identityNumber,taxOfficeCode,taxOfficeName,isVatTaxpayer,isDesignatedBuyer,email,phone,addressLine1,addressLine2,provinceCode,district,postalCode,country,currency,notes',
  suppliers: 'name,type,identityType,identityNumber,taxOfficeCode,taxOfficeName,isTaxpayer,isVatTaxpayer,isForeign,isRealTaxationFarmer,contactPerson,email,phone,addressLine1,addressLine2,provinceCode,district,postalCode,country,rating,leadTimeDays,notes',
};

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe, IconComponent],
  styleUrls: ['../../drawer.css'],
  host: { '(document:keydown.escape)': 'onEscape()' },
  styles: [`
    :host { display: block; min-width: 0; }
    .sec { color: var(--fg-3); }
    .in-tabs { margin-bottom: 20px; }
    .in-stack { display: flex; flex-direction: column; gap: 12px; }
    .in-card { overflow: hidden; }
    .in-card .card-h { flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; }
    .in-card .card-h > app-icon { color: var(--fg-3); }
    .in-hint { margin: 0; font-size: var(--text-sm); color: var(--fg-2); max-width: 80ch; }
    /* card intros span the card, like the code sample below them */
    .in-intro .in-hint { max-width: none; }
    .in-intro { display: flex; flex-direction: column; gap: 10px; box-shadow: inset 0 -1px 0 var(--line); }
    .code { margin: 0; font: 400 var(--text-xs)/1.6 var(--font-mono); color: var(--fg); background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--line); border-radius: var(--radius-md); padding: 8px 12px; white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; }
    .code-scroll { max-height: 320px; overflow: auto; }
    .code-danger { color: var(--danger); background: var(--danger-soft); box-shadow: inset 0 0 0 1px var(--danger-line); }
    .in-table .badge { margin-left: 0; }
    .in-table .cell-code { margin-left: 0; }
    .in-scope { max-width: 280px; color: var(--fg-2); font-size: var(--text-xs); }
    .in-url { max-width: 340px; }
    .in-url .mono { font-size: var(--text-xs); }
    .in-url .s { margin-left: 8px; color: var(--fg-3); font-size: var(--text-xs); }
    .in-acts { width: 1%; white-space: nowrap; }
    .in-filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .in-filters .field { width: 220px; }
    .in-skel { display: grid; gap: 14px; }
    .in-pages { display: flex; align-items: center; gap: 4px; }
    .in-export { display: flex; gap: 8px; flex-wrap: wrap; }
    .in-import { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .in-import .field { width: 220px; }
    .in-file { max-width: 100%; font-size: var(--text-sm); color: var(--fg-2); }
    .in-file::file-selector-button { height: var(--h-sm); margin-right: 10px; padding: 0 10px; border: 0; border-radius: var(--radius-sm); background: var(--btn-bg); color: var(--fg); box-shadow: var(--shadow-control), inset 0 1px 0 var(--highlight); font: 500 var(--text-sm)/1 var(--font-sans); cursor: pointer; }
    .in-run { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 4px; }
    .in-run .spacer { flex: 1; }
    .in-report { display: flex; flex-direction: column; gap: 12px; }
    .in-report .kpi-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    .in-report .kpi { box-shadow: inset 0 0 0 1px var(--line); background: var(--surface-2); }

    /* drawers */
    .drawer-body > * { flex-shrink: 0; }
    .drawer-body { gap: 0; }
    .scope-list { display: flex; flex-direction: column; }
    .scope-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; box-shadow: inset 0 -1px 0 var(--line); }
    .scope-row:last-child { box-shadow: none; }
    .scope-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .event-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
    .event-grid .check { align-items: center; min-width: 0; padding: 7px 10px; border-radius: var(--radius-sm); box-shadow: 0 0 0 1px var(--line); }
    .event-grid .check:has(input:checked) { background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent-line); }
    .event-grid .mono { font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

    /* modals */
    .modal-b { display: flex; flex-direction: column; gap: 12px; }
    .modal-h h2.mono { font-family: var(--font-mono); font-size: var(--text-md); }
    .dl-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--text-xs); color: var(--fg-3); }
    .dl-meta .badge { margin-left: 0; }
    .grp { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); margin-bottom: -6px; }
    .secret { font-size: var(--text-sm); padding: 10px 12px; }
    @media (max-width: 640px) {
      .in-table td { max-width: none; white-space: normal; }
      .in-url, .in-scope { max-width: none; text-align: right; overflow-wrap: anywhere; }
      .in-acts { width: 100%; }
      .in-filters, .in-filters .field, .in-import .field { width: 100%; }
      .in-run .btn { flex: 1 1 auto; }
      .modal-f .btn { flex: 1 1 auto; }
    }
  `],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'integrations.title' | t }}</h1>
        <p>{{ 'integrations.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <a class="btn" [href]="api.docsUrl" target="_blank" rel="noopener"><app-icon name="code" />{{ 'integrations.apiDocs' | t }}<app-icon name="arrowur" size="sm" /></a>
      </div>
    </div>

    <div class="tabs in-tabs" role="tablist">
      <button type="button" class="tab" role="tab" data-tab="apiKeys" [class.active]="tab() === 'apiKeys'" [attr.aria-selected]="tab() === 'apiKeys'" (click)="setTab('apiKeys')"><span>{{ 'integrations.tab.apiKeys' | t }}</span>@if (keys().length) { <span class="count">{{ keys().length | num }}</span> }</button>
      <button type="button" class="tab" role="tab" data-tab="webhooks" [class.active]="tab() === 'webhooks'" [attr.aria-selected]="tab() === 'webhooks'" (click)="setTab('webhooks')"><span>{{ 'integrations.tab.webhooks' | t }}</span>@if (hooks().length) { <span class="count">{{ hooks().length | num }}</span> }</button>
      <button type="button" class="tab" role="tab" data-tab="data" [class.active]="tab() === 'data'" [attr.aria-selected]="tab() === 'data'" (click)="setTab('data')"><span>{{ 'integrations.tab.data' | t }}</span></button>
    </div>

    <!-- ─── API KEYS ─── -->
    @if (tab() === 'apiKeys') {
      <section class="card in-card">
        <div class="card-h">
          <app-icon name="lock" size="sm" />
          <h3>{{ 'integrations.keys.title' | t }}</h3>
          <span class="spacer"></span>
          <button type="button" class="btn btn-primary btn-sm" data-act="newkey" (click)="openKeyForm()"><app-icon name="plus" size="sm" />{{ 'integrations.keys.new' | t }}</button>
        </div>
        <div class="card-b in-intro">
          <p class="in-hint">{{ 'integrations.keys.hint' | t }}</p>
          <pre class="code">curl -H "X-API-Key: sk_..." {{ api.apiBase }}/products</pre>
        </div>
        @if (keysLoading()) {
          <div class="card-b in-skel">@for (i of [1, 2, 3]; track i) { <div class="skeleton-row"></div> }</div>
        } @else if (keys().length === 0) {
          <div class="empty-state">
            <div class="empty-art"><app-icon name="lock" /></div>
            <h3>{{ 'integrations.keys.empty' | t }}</h3>
            <div class="actions"><button type="button" class="btn btn-sm" (click)="openKeyForm()"><app-icon name="plus" size="sm" />{{ 'integrations.keys.new' | t }}</button></div>
          </div>
        } @else {
          <div class="table-scroll">
            <table class="tbl table-responsive in-table">
              <thead>
                <tr>
                  <th>{{ 'integrations.keys.col.name' | t }}</th>
                  <th>{{ 'integrations.keys.col.prefix' | t }}</th>
                  <th>{{ 'integrations.keys.col.scopes' | t }}</th>
                  <th>{{ 'integrations.keys.col.status' | t }}</th>
                  <th>{{ 'integrations.keys.col.lastUsed' | t }}</th>
                  <th>{{ 'integrations.keys.col.expires' | t }}</th>
                  <th>{{ 'integrations.keys.col.created' | t }}</th>
                  <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (k of keys(); track k.id) {
                  <tr>
                    <td class="td-primary"><b>{{ k.name }}</b></td>
                    <td [attr.data-label]="'integrations.keys.col.prefix' | t" class="mono">{{ k.prefix }}…</td>
                    <td [attr.data-label]="'integrations.keys.col.scopes' | t" class="in-scope" [title]="scopeSummary(k)">{{ scopeSummary(k) }}</td>
                    <td [attr.data-label]="'integrations.keys.col.status' | t"><span class="badge" [ngClass]="statusBadge(keyStatus(k))"><span class="dot"></span>{{ ('integrations.keys.statusLabel.' + keyStatus(k)) | t }}</span></td>
                    <td [attr.data-label]="'integrations.keys.col.lastUsed' | t">{{ k.lastUsedAt ? (k.lastUsedAt | appDate: 'datetime') : '—' }}</td>
                    <td [attr.data-label]="'integrations.keys.col.expires' | t">{{ k.expiresAt ? (k.expiresAt | appDate) : ('integrations.keys.never' | t) }}</td>
                    <td [attr.data-label]="'integrations.keys.col.created' | t"><span>{{ k.createdAt | appDate }}@if (k.createdBy) { <span class="sec"> · {{ k.createdBy }}</span> }</span></td>
                    <td class="td-actions in-acts">
                      @if (keyStatus(k) === 'active') {
                        <button type="button" class="btn btn-danger-ghost btn-sm" (click)="revokeKey(k)">{{ 'integrations.keys.revoke' | t }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    }

    <!-- ─── WEBHOOKS ─── -->
    @if (tab() === 'webhooks') {
      <div class="in-stack">
        <section class="card in-card">
          <div class="card-h">
            <app-icon name="zap" size="sm" />
            <h3>{{ 'integrations.hooks.title' | t }}</h3>
            <span class="spacer"></span>
            <button type="button" class="btn btn-primary btn-sm" data-act="newhook" (click)="openHookForm()"><app-icon name="plus" size="sm" />{{ 'integrations.hooks.new' | t }}</button>
          </div>
          <div class="card-b in-intro"><p class="in-hint">{{ 'integrations.hooks.hint' | t }}</p></div>
          @if (hooksLoading()) {
            <div class="card-b in-skel">@for (i of [1, 2, 3]; track i) { <div class="skeleton-row"></div> }</div>
          } @else if (hooks().length === 0) {
            <div class="empty-state">
              <div class="empty-art"><app-icon name="link" /></div>
              <h3>{{ 'integrations.hooks.empty' | t }}</h3>
              <div class="actions"><button type="button" class="btn btn-sm" (click)="openHookForm()"><app-icon name="plus" size="sm" />{{ 'integrations.hooks.new' | t }}</button></div>
            </div>
          } @else {
            <div class="table-scroll">
              <table class="tbl table-responsive in-table">
                <thead>
                  <tr>
                    <th>{{ 'integrations.hooks.col.url' | t }}</th>
                    <th>{{ 'integrations.hooks.col.events' | t }}</th>
                    <th>{{ 'integrations.hooks.col.active' | t }}</th>
                    <th>{{ 'integrations.hooks.col.updated' | t }}</th>
                    <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of hooks(); track h.id) {
                    <tr>
                      <td [attr.data-label]="'integrations.hooks.col.url' | t" class="in-url" [title]="h.url">
                        <span class="mono">{{ h.url }}</span>
                        @if (h.description) { <span class="s">{{ h.description }}</span> }
                        @if (h.abroad) { <span class="badge badge-warning" [title]="'integrations.hooks.abroad' | t: { country: h.destinationCountry, basis: ('kvkk.basis.' + h.transferBasis | t) }"><span class="dot"></span>{{ h.destinationCountry }}</span> }
                      </td>
                      <td [attr.data-label]="'integrations.hooks.col.events' | t" class="in-scope" [title]="h.events.join(', ')">{{ h.events.join(', ') }}</td>
                      <td [attr.data-label]="'integrations.hooks.col.active' | t">
                        <label class="switch">
                          <input type="checkbox" role="switch" [checked]="h.active" (change)="toggleActive(h, $event)" />
                          <span class="track"></span>{{ (h.active ? 'integrations.hooks.active' : 'integrations.hooks.inactive') | t }}
                        </label>
                      </td>
                      <td [attr.data-label]="'integrations.hooks.col.updated' | t">{{ h.updatedAt | appDate: 'datetime' }}</td>
                      <td class="td-actions in-acts">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="testHook(h)"><app-icon name="zap" size="sm" />{{ 'integrations.hooks.test' | t }}</button>
                        <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="openHookForm(h)" [title]="'common.edit' | t" [attr.aria-label]="'common.edit' | t"><app-icon name="edit" /></button>
                        <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="showDeliveriesFor(h)" [title]="'integrations.hooks.deliveries' | t" [attr.aria-label]="'integrations.hooks.deliveries' | t"><app-icon name="inbox" /></button>
                        <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="rotateSecret(h)" [title]="'integrations.hooks.rotate' | t" [attr.aria-label]="'integrations.hooks.rotate' | t"><app-icon name="refresh" /></button>
                        <button type="button" class="btn btn-danger-ghost btn-sm btn-icon" (click)="deleteHook(h)" [title]="'common.delete' | t" [attr.aria-label]="'common.delete' | t"><app-icon name="trash" /></button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <section class="card in-card">
          <div class="card-h">
            <app-icon name="inbox" size="sm" />
            <h3>{{ 'integrations.deliveries.title' | t }}</h3>
            <span class="spacer"></span>
            <div class="in-filters">
              <div class="field field-sm select">
                <select [ngModel]="deliveryEndpoint()" (ngModelChange)="deliveryEndpoint.set($event); loadDeliveries(1)" [attr.aria-label]="'integrations.deliveries.col.endpoint' | t">
                  <option value="">{{ 'integrations.deliveries.allEndpoints' | t }}</option>
                  @for (h of hooks(); track h.id) { <option [value]="h.id">{{ h.url }}</option> }
                </select>
              </div>
              <div class="field field-sm select">
                <select [ngModel]="deliveryStatus()" (ngModelChange)="deliveryStatus.set($event); loadDeliveries(1)" [attr.aria-label]="'integrations.deliveries.col.status' | t">
                  <option value="">{{ 'integrations.deliveries.allStatuses' | t }}</option>
                  <option value="pending">{{ 'integrations.deliveries.status.pending' | t }}</option>
                  <option value="success">{{ 'integrations.deliveries.status.success' | t }}</option>
                  <option value="failed">{{ 'integrations.deliveries.status.failed' | t }}</option>
                </select>
              </div>
              <button type="button" class="btn btn-sm btn-icon" (click)="loadDeliveries(deliveryPage())" [title]="'integrations.deliveries.refresh' | t" [attr.aria-label]="'integrations.deliveries.refresh' | t"><app-icon name="refresh" size="sm" /></button>
            </div>
          </div>
          @if (deliveriesLoading()) {
            <div class="card-b in-skel">@for (i of [1, 2, 3]; track i) { <div class="skeleton-row"></div> }</div>
          } @else if (deliveries().length === 0) {
            <div class="empty-state">
              <div class="empty-art"><app-icon name="inbox" /></div>
              <h3>{{ 'integrations.deliveries.empty' | t }}</h3>
            </div>
          } @else {
            <div class="table-scroll">
              <table class="tbl table-responsive in-table">
                <thead>
                  <tr>
                    <th>{{ 'integrations.deliveries.col.date' | t }}</th>
                    <th>{{ 'integrations.deliveries.col.event' | t }}</th>
                    <th>{{ 'integrations.deliveries.col.endpoint' | t }}</th>
                    <th>{{ 'integrations.deliveries.col.status' | t }}</th>
                    <th class="r">{{ 'integrations.deliveries.col.attempts' | t }}</th>
                    <th class="r">{{ 'integrations.deliveries.col.response' | t }}</th>
                    <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of deliveries(); track d.id) {
                    <tr>
                      <td [attr.data-label]="'integrations.deliveries.col.date' | t">{{ d.createdAt | appDate: 'datetime' }}</td>
                      <td [attr.data-label]="'integrations.deliveries.col.event' | t" class="mono">{{ d.event }}</td>
                      <td [attr.data-label]="'integrations.deliveries.col.endpoint' | t" class="in-url mono" [title]="endpointUrl(d.endpointId)">{{ endpointUrl(d.endpointId) }}</td>
                      <td [attr.data-label]="'integrations.deliveries.col.status' | t"><span class="badge" [ngClass]="statusBadge(d.status)"><span class="dot"></span>{{ ('integrations.deliveries.status.' + d.status) | t }}</span></td>
                      <td [attr.data-label]="'integrations.deliveries.col.attempts' | t" class="r">{{ d.attempts | num }}</td>
                      <td [attr.data-label]="'integrations.deliveries.col.response' | t" class="r mono">{{ d.responseCode ?? '—' }}</td>
                      <td class="td-actions in-acts">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="viewDelivery.set(d)"><app-icon name="eye" size="sm" />{{ 'integrations.deliveries.view' | t }}</button>
                        <button type="button" class="btn btn-ghost btn-sm" (click)="resend(d)"><app-icon name="refresh" size="sm" />{{ 'integrations.deliveries.resend' | t }}</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="tbl-foot">
              <span>{{ 'integrations.pagination' | t: { total: (deliveryTotal() | num), page: deliveryPage(), pages: deliveryPages() } }}</span>
              <span class="spacer"></span>
              <div class="in-pages">
                <button type="button" class="btn btn-sm btn-icon" [disabled]="deliveryPage() === 1" (click)="loadDeliveries(deliveryPage() - 1)" [attr.aria-label]="'integrations.prev' | t"><app-icon name="chevl" size="sm" /></button>
                <button type="button" class="btn btn-sm btn-icon" [disabled]="deliveryPage() >= deliveryPages()" (click)="loadDeliveries(deliveryPage() + 1)" [attr.aria-label]="'integrations.next' | t"><app-icon name="chevr" size="sm" /></button>
              </div>
            </div>
          }
        </section>
      </div>
    }

    <!-- ─── IMPORT / EXPORT ─── -->
    @if (tab() === 'data') {
      <div class="in-stack">
        <section class="card in-card">
          <div class="card-h"><app-icon name="download" size="sm" /><h3>{{ 'integrations.export.title' | t }}</h3></div>
          <div class="card-b in-stack">
            <p class="in-hint">{{ 'integrations.export.hint' | t }}</p>
            <div class="in-export">
              @for (r of exportResources; track r) {
                <button type="button" class="btn" [class.is-loading]="exporting() === r" [disabled]="exporting() === r" (click)="exportCsv(r)">
                  <span class="cluster"><app-icon name="download" />{{ ('integrations.resource.' + r) | t }} <span class="sec">.csv</span></span>
                </button>
              }
            </div>
          </div>
        </section>

        <section class="card in-card">
          <div class="card-h"><app-icon name="upload" size="sm" /><h3>{{ 'integrations.import.title' | t }}</h3></div>
          <div class="card-b in-stack">
            <p class="in-hint">{{ 'integrations.import.hint' | t }}</p>
            <div class="in-import">
              <div class="field select">
                <select [ngModel]="importResource()" (ngModelChange)="importResource.set($event); resetImport()" [attr.aria-label]="'integrations.import.title' | t">
                  <option value="products">{{ 'integrations.resource.products' | t }}</option>
                  <option value="customers">{{ 'integrations.resource.customers' | t }}</option>
                  <option value="suppliers">{{ 'integrations.resource.suppliers' | t }}</option>
                </select>
              </div>
              <button type="button" class="btn btn-ghost" (click)="downloadTemplate()"><app-icon name="download" />{{ 'integrations.import.template' | t }}</button>
            </div>
            <pre class="code">{{ template() }}</pre>
            <div class="in-run">
              <input #fileInput type="file" class="in-file" accept=".csv,text/csv" (change)="onFile($event)" />
              <span class="spacer"></span>
              @if (importing()) { <span class="spinner-sm"></span> }
              <button type="button" class="btn" [disabled]="!csvText() || importing()" (click)="runImport(true)"><app-icon name="check" />{{ 'integrations.import.validate' | t }}</button>
              <button type="button" class="btn btn-primary" [disabled]="!report()?.dryRun || !report()?.valid || importing()" (click)="runImport(false)"><app-icon name="upload" />{{ 'integrations.import.run' | t }}</button>
            </div>

            @if (report(); as r) {
              <div class="in-report">
                <div class="kpi-grid">
                  <div class="kpi"><div class="kpi-top">{{ 'integrations.import.total' | t }}</div><div class="kpi-val"><b>{{ r.total | num }}</b></div></div>
                  <div class="kpi"><div class="kpi-top"><app-icon name="okc" size="sm" />{{ 'integrations.import.valid' | t }}</div><div class="kpi-val"><b>{{ r.valid | num }}</b></div></div>
                  <div class="kpi" [class.is-alert]="r.invalid > 0"><div class="kpi-top">@if (r.invalid > 0) { <app-icon name="warn" size="sm" /> }{{ 'integrations.import.invalid' | t }}</div><div class="kpi-val"><b>{{ r.invalid | num }}</b></div></div>
                  @if (!r.dryRun) {
                    <div class="kpi"><div class="kpi-top">{{ 'integrations.import.created' | t }}</div><div class="kpi-val"><b>{{ r.created | num }}</b></div></div>
                    <div class="kpi"><div class="kpi-top">{{ 'integrations.import.updated' | t }}</div><div class="kpi-val"><b>{{ r.updated | num }}</b></div></div>
                  }
                </div>
                <div class="notice" [class.notice-success]="!r.invalid" [class.notice-warning]="r.invalid > 0"><app-icon [name]="r.invalid > 0 ? 'warn' : 'okc'" /><span class="t">{{ (r.dryRun ? 'integrations.import.dryRunDone' : 'integrations.import.done') | t }}</span></div>
                @if (r.errors.length) {
                  <div class="card">
                    <div class="table-scroll">
                      <table class="tbl table-responsive in-table">
                        <thead>
                          <tr>
                            <th class="r">{{ 'integrations.import.col.row' | t }}</th>
                            <th>{{ 'integrations.import.col.field' | t }}</th>
                            <th>{{ 'integrations.import.col.code' | t }}</th>
                            <th>{{ 'integrations.import.col.message' | t }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (e of r.errors; track $index) {
                            <tr>
                              <td [attr.data-label]="'integrations.import.col.row' | t" class="r">{{ e.row }}</td>
                              <td [attr.data-label]="'integrations.import.col.field' | t">{{ e.field || '—' }}</td>
                              <td [attr.data-label]="'integrations.import.col.code' | t"><span class="tag">{{ e.code }}</span></td>
                              <td [attr.data-label]="'integrations.import.col.message' | t" [title]="e.message">{{ e.message }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </section>
      </div>
    }

    <!-- ─── API key form drawer ─── -->
    @if (keyFormOpen()) {
      <div class="drawer-overlay" (click)="keyFormOpen.set(false)">
        <div class="drawer-panel" role="dialog" aria-modal="true" [attr.aria-label]="'integrations.keys.new' | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ 'integrations.keys.new' | t }}</span>
            <button type="button" class="drawer-close" (click)="keyFormOpen.set(false)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            <section class="fsec">
              <div class="fld">
                <label class="fld-label" for="keyName">{{ 'integrations.keys.form.name' | t }} <span class="req">*</span></label>
                <div class="field"><input id="keyName" type="text" [ngModel]="keyName()" (ngModelChange)="keyName.set($event)" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="keyExpires">{{ 'integrations.keys.form.expires' | t }}</label>
                <div class="field"><input id="keyExpires" type="date" [ngModel]="keyExpires()" (ngModelChange)="keyExpires.set($event)" /></div>
              </div>
            </section>
            <section class="fsec">
              <div class="fsec-h"><h3>{{ 'integrations.keys.form.scopes' | t }}</h3></div>
              <div class="scope-list">
                @for (r of resources(); track r) {
                  <div class="scope-row">
                    <span [title]="resourceLabel(r)">{{ resourceLabel(r) }}</span>
                    <div class="seg seg-sm" role="group" [attr.aria-label]="resourceLabel(r)">
                      <button type="button" [attr.aria-pressed]="!(scopeChoices()[r] || '')" (click)="setScope(r, '')">{{ 'integrations.keys.scope.none' | t }}</button>
                      <button type="button" [attr.aria-pressed]="scopeChoices()[r] === 'read'" (click)="setScope(r, 'read')">{{ 'integrations.keys.scope.read' | t }}</button>
                      <button type="button" [attr.aria-pressed]="scopeChoices()[r] === 'write'" (click)="setScope(r, 'write')">{{ 'integrations.keys.scope.write' | t }}</button>
                    </div>
                  </div>
                }
              </div>
            </section>
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="keyFormOpen.set(false)" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="saving()" (click)="createKey()" [disabled]="!keyName().trim() || saving()"><span>{{ 'integrations.keys.create' | t }}</span><kbd>Ctrl ↵</kbd></button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Webhook form drawer ─── -->
    @if (hookFormOpen()) {
      <div class="drawer-overlay" (click)="hookFormOpen.set(false)">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="(hookEditId() ? 'integrations.hooks.editTitle' : 'integrations.hooks.new') | t" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (hookEditId() ? 'integrations.hooks.editTitle' : 'integrations.hooks.new') | t }}</span>
            <button type="button" class="drawer-close" (click)="hookFormOpen.set(false)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
          </div>
          <div class="drawer-body">
            <section class="fsec">
              <div class="fsec-h"><span class="n">1</span><h3>{{ 'integrations.hooks.form.url' | t }}</h3></div>
              <div class="fld">
                <label class="fld-label" for="hookUrl">{{ 'integrations.hooks.form.url' | t }} <span class="req">*</span></label>
                <div class="field"><span class="lead"><app-icon name="link" size="sm" /></span><input id="hookUrl" type="url" class="mono" [ngModel]="hookUrl()" (ngModelChange)="hookUrl.set($event)" placeholder="https://" /></div>
              </div>
              <div class="fld">
                <label class="fld-label" for="hookDesc">{{ 'integrations.hooks.form.description' | t }}</label>
                <div class="field"><input id="hookDesc" type="text" [ngModel]="hookDesc()" (ngModelChange)="hookDesc.set($event)" /></div>
              </div>
              <label class="check"><input type="checkbox" [ngModel]="hookActive()" (ngModelChange)="hookActive.set($event)" /><span>{{ 'integrations.hooks.form.active' | t }}</span></label>
            </section>
            <section class="fsec">
              <div class="fsec-h"><span class="n">2</span><h3>{{ 'integrations.hooks.form.transfer' | t }}</h3></div>
              <div class="grid-2">
                <div class="fld">
                  <label class="fld-label" for="hookCountry">{{ 'integrations.hooks.form.country' | t }}</label>
                  <div class="field"><span class="lead"><app-icon name="globe" size="sm" /></span><input id="hookCountry" type="text" maxlength="2" class="mono" [ngModel]="hookCountry()" (ngModelChange)="hookCountry.set(($event || '').toUpperCase())" /></div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="hookBasis">{{ 'integrations.hooks.form.basis' | t }}</label>
                  <div class="field select">
                    <select id="hookBasis" [ngModel]="hookBasis()" (ngModelChange)="hookBasis.set($event)">
                      @for (b of transferBases; track b) { <option [value]="b">{{ 'kvkk.basis.' + b | t }}</option> }
                    </select>
                  </div>
                </div>
                @if (hookCountry() !== 'TR' && hookBasis() === 'SCC') {
                  <div class="fld">
                    <label class="fld-label" for="hookSccSigned">{{ 'integrations.hooks.form.sccSigned' | t }}</label>
                    <div class="field"><input id="hookSccSigned" type="date" [ngModel]="hookSccSigned()" (ngModelChange)="hookSccSigned.set($event)" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="hookSccNotified">{{ 'integrations.hooks.form.sccNotified' | t }}</label>
                    <div class="field"><input id="hookSccNotified" type="date" [ngModel]="hookSccNotified()" (ngModelChange)="hookSccNotified.set($event)" /></div>
                  </div>
                }
              </div>
              @if (hookCountry() !== 'TR') { <div class="notice notice-warning"><app-icon name="globe" /><span class="t">{{ 'integrations.hooks.form.abroadHint' | t }}</span></div> }
              <label class="check"><input type="checkbox" [ngModel]="hookPii()" (ngModelChange)="hookPii.set($event)" /><span>{{ 'integrations.hooks.form.includePersonalData' | t }}<span class="sub">{{ 'integrations.hooks.form.piiHint' | t }}</span></span></label>
            </section>
            <section class="fsec">
              <div class="fsec-h"><span class="n">3</span><h3>{{ 'integrations.hooks.form.events' | t }} <span class="req">*</span></h3><span class="aside">{{ hookEvents().length | num }} / {{ events().length | num }}</span></div>
              <div class="event-grid">
                @for (e of events(); track e) {
                  <label class="check" [title]="e"><input type="checkbox" [checked]="hookEvents().includes(e)" (change)="toggleEvent(e)" /><span class="mono">{{ e }}</span></label>
                }
              </div>
            </section>
          </div>
          <div class="drawer-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" (click)="hookFormOpen.set(false)" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary" [class.is-loading]="saving()" (click)="saveHook()" [disabled]="!hookUrl().trim() || hookEvents().length === 0 || saving()"><span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd></button>
          </div>
        </div>
      </div>
    }

    <!-- ─── One-time secret modal ─── -->
    @if (secret(); as s) {
      <div class="scrim">
        <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="s.title">
          <div class="modal-h"><h2>{{ s.title }}</h2></div>
          <div class="modal-b">
            <div class="notice notice-warning"><app-icon name="warn" /><span class="t">{{ 'integrations.secret.warning' | t }}</span></div>
            <pre class="code secret">{{ s.value }}</pre>
          </div>
          <div class="modal-f">
            <button type="button" class="btn" (click)="copy(s.value)"><app-icon name="copy" />{{ 'integrations.secret.copy' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="secret.set(null)">{{ 'integrations.secret.done' | t }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ─── Delivery payload modal ─── -->
    @if (viewDelivery(); as d) {
      <div class="scrim" (click)="viewDelivery.set(null)">
        <div class="modal w-lg" role="dialog" aria-modal="true" [attr.aria-label]="d.event" (click)="$event.stopPropagation()">
          <div class="modal-h">
            <h2 class="mono">{{ d.event }}</h2>
            <button type="button" class="modal-close" (click)="viewDelivery.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
          </div>
          <div class="modal-b">
            <div class="dl-meta">
              <span class="badge" [ngClass]="statusBadge(d.status)"><span class="dot"></span>{{ ('integrations.deliveries.status.' + d.status) | t }}</span>
              <span>{{ 'integrations.deliveries.col.attempts' | t }}: {{ d.attempts | num }}</span>
              @if (d.deliveredAt) { <span>· {{ d.deliveredAt | appDate: 'datetime' }}</span> }
              @if (d.nextRetryAt) { <span>· {{ 'integrations.deliveries.nextRetry' | t }}: {{ d.nextRetryAt | appDate: 'datetime' }}</span> }
            </div>
            <div class="grp">{{ 'integrations.deliveries.payload' | t }}</div>
            <pre class="code code-scroll">{{ pretty(d.payload) }}</pre>
            @if (d.error) {
              <div class="grp">{{ 'integrations.deliveries.error' | t }}</div>
              <pre class="code code-danger">{{ d.error }}</pre>
            }
            @if (d.responseBody) {
              <div class="grp">{{ 'integrations.deliveries.responseBody' | t }} ({{ d.responseCode ?? '-' }})</div>
              <pre class="code code-scroll">{{ d.responseBody }}</pre>
            }
          </div>
          <div class="modal-f">
            <button type="button" class="btn" (click)="resend(d)"><app-icon name="refresh" />{{ 'integrations.deliveries.resend' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="viewDelivery.set(null)">{{ 'common.close' | t }}</button>
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
  // WP7: KVKK md. 9 transfer fields
  // A webhook is a regular transfer: incidental consent (KVKK md. 9/6) is not a valid basis for it.
  readonly transferBases = TRANSFER_BASES.filter((b) => b !== 'INCIDENTAL_CONSENT');
  hookCountry = signal('TR');
  hookBasis = signal('DOMESTIC');
  hookSccSigned = signal('');
  hookSccNotified = signal('');
  hookPii = signal(false);
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
  readonly exportResources: ExportResource[] = ['products', 'customers', 'suppliers', 'orders', 'stock'];
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
      if (res === 'products' || res === 'customers' || res === 'suppliers') this.importResource.set(res);
      this.activate(t === 'webhooks' || t === 'data' ? t : 'apiKeys');
    });
  }

  /** Esc closes the topmost overlay (the one-time secret stays until confirmed). */
  onEscape() {
    if (this.viewDelivery()) this.viewDelivery.set(null);
    else if (this.hookFormOpen()) this.hookFormOpen.set(false);
    else if (this.keyFormOpen()) this.keyFormOpen.set(false);
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
    this.hookCountry.set(h?.destinationCountry || 'TR');
    this.hookBasis.set(h?.transferBasis || 'DOMESTIC');
    this.hookSccSigned.set(h?.sccSignedAt || '');
    this.hookSccNotified.set(h?.sccNotifiedAt || '');
    this.hookPii.set(!!h?.includePersonalData);
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
      destinationCountry: this.hookCountry() || 'TR',
      transferBasis: this.hookCountry() === 'TR' ? 'DOMESTIC' : this.hookBasis() === 'DOMESTIC' ? null : this.hookBasis(),
      sccSignedAt: this.hookSccSigned() || null,
      sccNotifiedAt: this.hookSccNotified() || null,
      includePersonalData: this.hookPii(),
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
