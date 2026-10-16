import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, AppDatePipe, I18nService } from '../../i18n';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { DocumentCounter, DocumentSeries } from '../../models/documents.models';
import { DOCUMENT_KINDS, isValidSeriesFor } from '@stok/tr-compliance';
import { IconComponent } from '../shared/icon.component';

/** Settings > Belge düzeni: stock deduction point, e-Belge mode, müstahsil makbuzu module, document series and counters. */
@Component({
  selector: 'app-document-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, IconComponent],
  styleUrls: ['../documents/documents.css'],
  styles: [`
    :host { display: block; }
    .card-h.sh { padding-block: 12px; min-height: 56px; flex-wrap: wrap; row-gap: 8px; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .form-stack { display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .inline-form { display: flex; flex-direction: column; gap: 14px; box-shadow: inset 0 -1px 0 var(--line); }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 14px; align-items: start; }
    .stack-20 { display: flex; flex-direction: column; gap: 20px; }
    @media (max-width: 1100px) { .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .grid-4 { grid-template-columns: minmax(0, 1fr); } }
    .card-f { justify-content: flex-end; }
    .w-act { white-space: nowrap; }
    .td-actions { gap: 4px; }
    .add-series { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 14px; align-items: end; padding: 16px; box-shadow: inset 0 1px 0 var(--line); background: var(--surface-2); border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
    .add-series .fld-error { position: absolute; }
    .add-series .fld { position: relative; }
    @media (max-width: 900px) { .add-series { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    @media (max-width: 640px) { .add-series { grid-template-columns: minmax(0, 1fr); } .add-series .fld-error { position: static; } }
  `],
  template: `

    <div class="stack-20">
      <section class="card">
        <div class="card-h sh"><div class="hg"><h3>{{ 'docSettings.title' | t }}</h3><p>{{ 'docSettings.subtitle' | t }}</p></div></div>
        <div class="card-b form-stack">
          <div class="grid-2">
            <div class="fld">
              <label class="fld-label" for="dsDeduct">{{ 'docSettings.stockDeductOn' | t }}</label>
              <div class="field select"><select id="dsDeduct" [(ngModel)]="stockDeductOn" [disabled]="!isAdmin()">
                <option value="despatch">{{ 'docSettings.deduct.despatch' | t }}</option>
                <option value="order">{{ 'docSettings.deduct.order' | t }}</option>
              </select></div>
              <span class="fld-help">{{ 'docSettings.stockDeductHint' | t }}</span>
            </div>
            <div class="fld">
              <label class="fld-label" for="dsMode">{{ 'docSettings.eDocumentMode' | t }}</label>
              <div class="field select"><select id="dsMode" [(ngModel)]="eDocumentMode" [disabled]="!isAdmin()">
                <option value="NONE">{{ 'docSettings.mode.NONE' | t }}</option>
                <option value="PROVIDER">{{ 'docSettings.mode.PROVIDER' | t }}</option>
              </select></div>
              <span class="fld-help">{{ 'docSettings.modeHint' | t }}</span>
            </div>
          </div>
          <label class="setting-row"><span class="t"><b>{{ 'docSettings.producerReceipt' | t }}</b><span>{{ 'docSettings.producerReceiptHint' | t }}</span></span><span class="switch"><input type="checkbox" role="switch" [(ngModel)]="producerReceiptEnabled" [disabled]="!isAdmin()" /><span class="track"></span></span></label>
        </div>
        @if (isAdmin()) {
          <div class="card-f"><button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="saveSettings()" [disabled]="busy()"><span>{{ 'common.save' | t }}</span></button></div>
        }
      </section>

      <section class="card">
        <div class="card-h sh"><div class="hg"><h3>{{ 'docSettings.series' | t }}</h3><p>{{ 'docSettings.seriesHint' | t }}</p></div><span class="tag">{{ series().length }}</span></div>
        <div class="table-scroll">
          <table class="tbl table-responsive">
            <thead><tr><th>{{ 'docSettings.kind' | t }}</th><th>{{ 'docSettings.modeCol' | t }}</th><th>{{ 'docSettings.code' | t }}</th><th>{{ 'docSettings.example' | t }}</th><th>{{ 'docSettings.state' | t }}</th><th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (s of series(); track s.id) {
                <tr>
                  <td class="td-primary">{{ 'docSettings.kinds.' + s.kind | t }}</td>
                  <td [attr.data-label]="'docSettings.modeCol' | t">{{ 'documents.mode.' + s.mode | t }}</td>
                  <td [attr.data-label]="'docSettings.code' | t"><span class="tag">{{ s.seriesCode }}</span></td>
                  <td class="mono text-muted" [attr.data-label]="'docSettings.example' | t">{{ example(s.mode, s.seriesCode) }}</td>
                  <td [attr.data-label]="'docSettings.state' | t">
                    @if (s.isDefault) { <span class="badge badge-success"><span class="dot"></span>{{ 'docSettings.default' | t }}</span> }
                    @if (!s.isActive) { <span class="badge badge-neutral"><span class="dot"></span>{{ 'docSettings.inactive' | t }}</span> }
                  </td>
                  <td class="td-actions w-act">
                    @if (isAdmin()) {
                      @if (!s.isDefault) { <button type="button" class="btn btn-xs" (click)="update(s, { isDefault: true })">{{ 'docSettings.makeDefault' | t }}</button> }
                      <button type="button" class="btn btn-xs" (click)="update(s, { isActive: !s.isActive })"><app-icon [name]="s.isActive ? 'eyeoff' : 'eye'" size="xs" />{{ (s.isActive ? 'docSettings.deactivate' : 'docSettings.activate') | t }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (isAdmin()) {
          <div class="add-series">
            <div class="fld"><label class="fld-label" for="nsKind">{{ 'docSettings.kind' | t }}</label>
              <div class="field select"><select id="nsKind" [(ngModel)]="newKind">@for (k of kinds; track k) { <option [value]="k">{{ 'docSettings.kinds.' + k | t }}</option> }</select></div></div>
            <div class="fld"><label class="fld-label" for="nsMode">{{ 'docSettings.modeCol' | t }}</label>
              <div class="field select"><select id="nsMode" [(ngModel)]="newMode"><option value="PAPER">{{ 'documents.mode.PAPER' | t }}</option><option value="EDOCUMENT">{{ 'documents.mode.EDOCUMENT' | t }}</option><option value="INTERNAL">{{ 'documents.mode.INTERNAL' | t }}</option></select></div></div>
            <div class="fld"><label class="fld-label" for="nsCode">{{ 'docSettings.code' | t }}</label>
              <div class="field" [class.is-error]="newCode && !validCode()"><input id="nsCode" class="mono" maxlength="3" [(ngModel)]="newCode" (input)="newCode = newCode.toUpperCase()" placeholder="ABC" /></div>
              @if (newCode && !validCode()) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'docSettings.codeInvalid' | t }}</span> }</div>
            <button type="button" class="btn btn-subtle" (click)="create()" [disabled]="busy() || !validCode()"><app-icon name="plus" />{{ 'docSettings.addSeries' | t }}</button>
          </div>
        }
      </section>

      <section class="card">
        <div class="card-h"><h3>{{ 'docSettings.counters' | t }}</h3><span class="spacer"></span><span class="tag">{{ counters().length }}</span></div>
        @if (!counters().length) {
          <div class="empty-state"><div class="empty-art"><app-icon name="hash" /></div><h3>{{ 'docSettings.noCounters' | t }}</h3></div>
        } @else {
          <div class="table-scroll">
            <table class="tbl table-responsive">
              <thead><tr><th>{{ 'docSettings.kind' | t }}</th><th>{{ 'docSettings.code' | t }}</th><th class="r">{{ 'docSettings.year' | t }}</th><th class="r">{{ 'docSettings.lastNumber' | t }}</th><th class="r">{{ 'docSettings.lastDate' | t }}</th></tr></thead>
              <tbody>
                @for (c of counters(); track c.id) {
                  <tr>
                    <td class="td-primary">{{ 'docSettings.kinds.' + c.kind | t }}</td>
                    <td [attr.data-label]="'docSettings.code' | t"><span class="tag">{{ c.seriesCode }}</span></td>
                    <td class="r" [attr.data-label]="'docSettings.year' | t">{{ c.year || '—' }}</td>
                    <td class="r mono" [attr.data-label]="'docSettings.lastNumber' | t">{{ c.lastNumber }}</td>
                    <td class="r" [attr.data-label]="'docSettings.lastDate' | t">{{ c.lastDate ? (c.lastDate | appDate) : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
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
