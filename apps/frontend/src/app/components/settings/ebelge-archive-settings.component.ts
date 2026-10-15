import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDatePipe, I18nService, MoneyPipe, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { EDocument, edocBadge } from '../../models/ebelge.models';

/**
 * Settings > Arşiv: working copy of the e-documents (the legal archive is the integrator's), the
 * inspection package (ibraz paketi) for a period, integrity check (SHA-256) and the retention list.
 */
@Component({
  selector: 'app-ebelge-archive-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, MoneyPipe],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    .ar-row { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
    .ar-row .doc-field { margin-bottom: 0; }
    .ar-table { margin-top: var(--space-4); }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'ebelge.archive.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'ebelge.archive.subtitle' | t }}</p>
      <div class="doc-alert info">{{ 'ebelge.legalArchiveNote' | t }}</div>

      <div class="doc-section">
        <h4 class="doc-section-title">{{ 'ebelge.archive.package' | t }}</h4>
        <p class="doc-hint">{{ 'ebelge.archive.packageHint' | t }}</p>
        <div class="ar-row">
          <div class="doc-field"><label for="arFrom">{{ 'ebelge.archive.from' | t }}</label><input id="arFrom" type="date" class="input" [(ngModel)]="from" /></div>
          <div class="doc-field"><label for="arTo">{{ 'ebelge.archive.to' | t }}</label><input id="arTo" type="date" class="input" [(ngModel)]="to" /></div>
          <button class="btn btn-primary" (click)="download()" [disabled]="busy() || !from || !to">{{ 'ebelge.archive.download' | t }}</button>
        </div>
      </div>

      <div class="doc-section">
        <h4 class="doc-section-title">{{ 'ebelge.archive.integrity' | t }}</h4>
        <p class="doc-hint">{{ 'ebelge.archive.integrityHint' | t }}</p>
        <button class="btn btn-secondary" (click)="check()" [disabled]="busy()">{{ 'ebelge.archive.runCheck' | t }}</button>
        @if (checkResult(); as r) {
          @if (r.mismatches.length) {
            <div class="doc-alert danger" style="margin-top: var(--space-3)">{{ 'ebelge.archive.mismatch' | t: { n: r.mismatches.length, date: (r.noticeDeadline | appDate) } }}</div>
          } @else {
            <div class="doc-alert info" style="margin-top: var(--space-3)">{{ 'ebelge.archive.allOk' | t: { n: r.checked } }}</div>
          }
        }
      </div>

      <div class="table-card ar-table">
        <div class="table-scroll">
          <table class="table-responsive">
            <thead><tr>
              <th>{{ 'ebelge.inbox.col.number' | t }}</th><th>{{ 'ebelge.inbox.col.type' | t }}</th><th>{{ 'ebelge.archive.direction' | t }}</th><th>{{ 'ebelge.archive.counterparty' | t }}</th>
              <th>{{ 'documents.issueDate' | t }}</th><th class="num">{{ 'ebelge.inbox.col.amount' | t }}</th><th>{{ 'ebelge.inbox.col.status' | t }}</th><th>{{ 'ebelge.archive.retentionUntil' | t }}</th>
            </tr></thead>
            <tbody>
              @for (d of docs(); track d.id) {
                <tr>
                  <td class="mono td-primary">{{ d.documentNo || d.ettn.slice(0, 8) }}</td>
                  <td [attr.data-label]="'ebelge.inbox.col.type' | t">{{ 'ebelge.docType.' + d.documentType | t }} <span class="text-xs text-muted">{{ d.profileId }}</span></td>
                  <td [attr.data-label]="'ebelge.archive.direction' | t">{{ 'ebelge.archive.dir.' + d.direction | t }}</td>
                  <td [attr.data-label]="'ebelge.archive.counterparty' | t">{{ d.counterpartyName }}</td>
                  <td [attr.data-label]="'documents.issueDate' | t">{{ d.issueDate | appDate }}</td>
                  <td class="num" [attr.data-label]="'ebelge.inbox.col.amount' | t">{{ d.payableAmount !== null ? (d.payableAmount | money: (d.currency || 'TRY')) : '-' }}</td>
                  <td [attr.data-label]="'ebelge.inbox.col.status' | t"><span class="badge" [ngClass]="badge(d.gibStatus)">{{ 'ebelge.status.' + (d.gibStatus || 'QUEUED') | t }}</span>@if (!d.integrityOk) { <span class="badge badge-danger">{{ 'ebelge.archive.integrityBroken' | t }}</span> }</td>
                  <td [attr.data-label]="'ebelge.archive.retentionUntil' | t">{{ d.retentionUntil | appDate }}@if (d.legalHold) { <span class="badge badge-warning">{{ 'ebelge.archive.legalHold' | t }}</span> }</td>
                </tr>
              }
              @if (!docs().length) { <tr><td colspan="8"><div class="empty-state"><p class="empty-state-title">{{ 'ebelge.archive.empty' | t }}</p></div></td></tr> }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class EBelgeArchiveSettingsComponent implements OnInit {
  private api = inject(EBelgeService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  docs = signal<EDocument[]>([]);
  busy = signal(false);
  checkResult = signal<{ checked: number; mismatches: unknown[]; noticeDeadline: string | null } | null>(null);
  badge = edocBadge;
  from = '';
  to = '';

  ngOnInit() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    this.to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    this.api.documents().subscribe({ next: (d) => this.docs.set(d), error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error') });
  }

  download() {
    this.busy.set(true);
    this.api.archivePackage(this.from, this.to).subscribe({
      next: (b) => {
        this.busy.set(false);
        this.api.saveBlob(b, `ibraz-paketi_${this.from}_${this.to}.zip`);
      },
      error: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('ebelge.error.package'), 'error');
      },
    });
  }

  check() {
    this.busy.set(true);
    this.api.integrityCheck().subscribe({
      next: (r) => {
        this.busy.set(false);
        this.checkResult.set(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
