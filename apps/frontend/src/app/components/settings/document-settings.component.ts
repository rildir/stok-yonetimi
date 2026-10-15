import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, AppDatePipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { DocumentCounter, DocumentSeries } from '../../models/documents.models';
import { DOCUMENT_KINDS, isValidSeriesFor } from '@stok/tr-compliance';

/** Settings > Belge düzeni: stock deduction point, e-Belge mode, müstahsil makbuzu module, document series and counters. */
@Component({
  selector: 'app-document-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe],
  styleUrls: ['../documents/documents.css'],
  template: `
    <div class="settings-card card" style="padding: var(--space-6)">
      <h3 class="section-title">{{ 'docSettings.title' | t }}</h3>
      <p class="section-subtitle">{{ 'docSettings.subtitle' | t }}</p>

      <div class="doc-grid doc-section">
        <div class="doc-field">
          <label for="dsDeduct">{{ 'docSettings.stockDeductOn' | t }}</label>
          <select id="dsDeduct" class="select" [(ngModel)]="stockDeductOn" [disabled]="!isAdmin()">
            <option value="despatch">{{ 'docSettings.deduct.despatch' | t }}</option>
            <option value="order">{{ 'docSettings.deduct.order' | t }}</option>
          </select>
          <span class="doc-hint">{{ 'docSettings.stockDeductHint' | t }}</span>
        </div>
        <div class="doc-field">
          <label for="dsMode">{{ 'docSettings.eDocumentMode' | t }}</label>
          <select id="dsMode" class="select" [(ngModel)]="eDocumentMode" [disabled]="!isAdmin()">
            <option value="NONE">{{ 'docSettings.mode.NONE' | t }}</option>
            <option value="PROVIDER">{{ 'docSettings.mode.PROVIDER' | t }}</option>
          </select>
          <span class="doc-hint">{{ 'docSettings.modeHint' | t }}</span>
        </div>
      </div>
      <label class="doc-check"><input type="checkbox" [(ngModel)]="producerReceiptEnabled" [disabled]="!isAdmin()" /> {{ 'docSettings.producerReceipt' | t }}</label>
      @if (isAdmin()) { <button class="btn btn-primary btn-sm" style="margin-top: var(--space-3); width: auto; display: block" (click)="saveSettings()" [disabled]="busy()">{{ 'common.save' | t }}</button> }
    </div>

    <div class="settings-card card" style="padding: var(--space-6); margin-top: var(--space-5)">
      <h3 class="section-title">{{ 'docSettings.series' | t }}</h3>
      <p class="section-subtitle">{{ 'docSettings.seriesHint' | t }}</p>
      <div style="overflow-x: auto">
        <table class="doc-table doc-section">
          <thead><tr><th>{{ 'docSettings.kind' | t }}</th><th>{{ 'docSettings.modeCol' | t }}</th><th>{{ 'docSettings.code' | t }}</th><th>{{ 'docSettings.example' | t }}</th><th>{{ 'docSettings.state' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (s of series(); track s.id) {
              <tr>
                <td>{{ 'docSettings.kinds.' + s.kind | t }}</td>
                <td>{{ 'documents.mode.' + s.mode | t }}</td>
                <td class="mono"><strong>{{ s.seriesCode }}</strong></td>
                <td class="mono text-xs">{{ example(s.mode, s.seriesCode) }}</td>
                <td>
                  @if (s.isDefault) { <span class="badge badge-success">{{ 'docSettings.default' | t }}</span> }
                  @if (!s.isActive) { <span class="badge badge-neutral">{{ 'docSettings.inactive' | t }}</span> }
                </td>
                <td class="td-actions">
                  @if (isAdmin()) {
                    @if (!s.isDefault) { <button class="btn btn-ghost btn-sm" (click)="update(s, { isDefault: true })">{{ 'docSettings.makeDefault' | t }}</button> }
                    <button class="btn btn-ghost btn-sm" (click)="update(s, { isActive: !s.isActive })">{{ (s.isActive ? 'docSettings.deactivate' : 'docSettings.activate') | t }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (isAdmin()) {
        <div class="doc-grid-3 doc-section">
          <div class="doc-field"><label for="nsKind">{{ 'docSettings.kind' | t }}</label>
            <select id="nsKind" class="select" [(ngModel)]="newKind">@for (k of kinds; track k) { <option [value]="k">{{ 'docSettings.kinds.' + k | t }}</option> }</select></div>
          <div class="doc-field"><label for="nsMode">{{ 'docSettings.modeCol' | t }}</label>
            <select id="nsMode" class="select" [(ngModel)]="newMode"><option value="PAPER">{{ 'documents.mode.PAPER' | t }}</option><option value="EDOCUMENT">{{ 'documents.mode.EDOCUMENT' | t }}</option><option value="INTERNAL">{{ 'documents.mode.INTERNAL' | t }}</option></select></div>
          <div class="doc-field"><label for="nsCode">{{ 'docSettings.code' | t }}</label>
            <input id="nsCode" class="input mono" maxlength="3" [(ngModel)]="newCode" (input)="newCode = newCode.toUpperCase()" />
            @if (newCode && !validCode()) { <span class="form-error">{{ 'docSettings.codeInvalid' | t }}</span> }</div>
        </div>
        <button class="btn btn-secondary btn-sm" (click)="create()" [disabled]="busy() || !validCode()">{{ 'docSettings.addSeries' | t }}</button>
      }
    </div>

    <div class="settings-card card" style="padding: var(--space-6); margin-top: var(--space-5)">
      <h3 class="section-title">{{ 'docSettings.counters' | t }}</h3>
      <div style="overflow-x: auto">
        <table class="doc-table doc-section">
          <thead><tr><th>{{ 'docSettings.kind' | t }}</th><th>{{ 'docSettings.code' | t }}</th><th>{{ 'docSettings.year' | t }}</th><th class="num">{{ 'docSettings.lastNumber' | t }}</th><th>{{ 'docSettings.lastDate' | t }}</th></tr></thead>
          <tbody>
            @for (c of counters(); track c.id) {
              <tr><td>{{ 'docSettings.kinds.' + c.kind | t }}</td><td class="mono">{{ c.seriesCode }}</td><td>{{ c.year || '-' }}</td><td class="num">{{ c.lastNumber }}</td><td>{{ c.lastDate ? (c.lastDate | appDate) : '-' }}</td></tr>
            } @empty { <tr><td colspan="5" class="text-muted">{{ 'docSettings.noCounters' | t }}</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class DocumentSettingsComponent implements OnInit {
  docs = inject(DocumentsService);
  ui = inject(UiStateService);
  i18n = inject(I18nService);

  series = signal<DocumentSeries[]>([]);
  counters = signal<DocumentCounter[]>([]);
  busy = signal(false);
  kinds = DOCUMENT_KINDS as readonly string[];
  stockDeductOn = 'despatch';
  eDocumentMode = 'NONE';
  producerReceiptEnabled = false;
  newKind = 'INVOICE';
  newMode = 'PAPER';
  newCode = '';

  isAdmin = () => this.ui.userProfile()?.role === 'admin';
  validCode = () => isValidSeriesFor(this.newMode, this.newCode);

  ngOnInit() {
    this.docs.company().subscribe({
      next: (c) => {
        this.stockDeductOn = c.stockDeductOn || 'order';
        this.eDocumentMode = c.eDocumentMode || 'NONE';
        this.producerReceiptEnabled = !!c.producerReceiptEnabled;
      },
      error: () => undefined,
    });
    this.load();
  }

  load() {
    this.docs.series().subscribe({ next: (s) => this.series.set(s), error: () => undefined });
    this.docs.counters().subscribe({ next: (c) => this.counters.set(c), error: () => undefined });
  }

  example(mode: string, code: string): string {
    const y = new Date().getFullYear();
    if (mode === 'EDOCUMENT') return `${code}${y}000000001`;
    if (mode === 'PAPER') return `${code}-000001`;
    return `${code}-${y}-000001`;
  }

  saveSettings() {
    this.busy.set(true);
    this.docs.updateCompany({ stockDeductOn: this.stockDeductOn, eDocumentMode: this.eDocumentMode, producerReceiptEnabled: this.producerReceiptEnabled }).subscribe({
      next: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('docSettings.saved'), 'success');
      },
      error: (e) => this.fail(e),
    });
  }

  create() {
    this.busy.set(true);
    this.docs.createSeries({ kind: this.newKind, mode: this.newMode, seriesCode: this.newCode }).subscribe({
      next: () => {
        this.busy.set(false);
        this.newCode = '';
        this.load();
      },
      error: (e) => this.fail(e),
    });
  }

  update(s: DocumentSeries, body: Record<string, unknown>) {
    this.docs.updateSeries(s.id, body).subscribe({ next: () => this.load(), error: (e) => this.fail(e) });
  }

  private fail(e: unknown) {
    this.busy.set(false);
    this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
  }
}
