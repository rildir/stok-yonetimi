import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDatePipe, I18nService, MoneyPipe, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { EDocument, edocBadge } from '../../models/ebelge.models';
import { IconComponent } from '../shared/icon.component';

/**
 * Settings > Arşiv: working copy of the e-documents (the legal archive is the integrator's), the
 * inspection package (ibraz paketi) for a period, integrity check (SHA-256) and the retention list.
 */
@Component({
  selector: 'app-ebelge-archive-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, MoneyPipe, IconComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
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
    .ar-tools { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
    .ar-tools .card { box-shadow: 0 0 0 1px var(--line); }
    .ar-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
    .ar-row .fld { width: 160px; }
    .ar-res { margin-top: 12px; }
    .t-sub { margin-left: 6px; }
    .ar-tbl td { white-space: nowrap; }
    .ar-tbl th:first-child, .ar-tbl td.td-primary { width: 1%; }
    .ar-cp { display: block; max-width: 144px; overflow: hidden; text-overflow: ellipsis; }
    .ar-no { display: inline-flex; align-items: center; gap: 8px; }
    .ar-dir { display: inline-flex; color: var(--fg-3); }
    .ar-no .mono { max-width: 136px; overflow: hidden; text-overflow: ellipsis; }
    @property --ar-fade { syntax: '<length>'; inherits: false; initial-value: 0px; }
    @supports (animation-timeline: scroll()) {
      .ar-scroll {
        -webkit-mask-image: linear-gradient(to right, black 0, black calc(100% - var(--ar-fade)), transparent 100%);
        mask-image: linear-gradient(to right, black 0, black calc(100% - var(--ar-fade)), transparent 100%);
        animation: ar-scroll-fade linear both; animation-timeline: scroll(self inline);
      }
      @keyframes ar-scroll-fade { 0% { --ar-fade: 40px; } 97% { --ar-fade: 40px; } 100% { --ar-fade: 0px; } }
    }
    .ar-st { display: inline-flex; gap: 4px; flex-wrap: wrap; }
    .ar-st .badge { margin: 0; }
    @media (max-width: 640px) { .ar-tbl td { white-space: normal; } .ar-cp { max-width: none; } }
    @media (max-width: 900px) { .ar-tools { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 640px) { .ar-row .fld { width: calc(50% - 4px); } .ar-row .btn { width: 100%; } }
  `],
  template: `

    <div class="stack-20">
      <div class="notice notice-info"><app-icon name="shield" /><span class="t">{{ 'ebelge.legalArchiveNote' | t }}</span></div>

      <div class="ar-tools">
        <section class="card">
          <div class="card-h sh"><div class="hg"><h3>{{ 'ebelge.archive.package' | t }}</h3><p>{{ 'ebelge.archive.packageHint' | t }}</p></div></div>
          <div class="card-b">
            <div class="ar-row">
              <div class="fld"><label class="fld-label" for="arFrom">{{ 'ebelge.archive.from' | t }}</label><div class="field"><input id="arFrom" type="date" [(ngModel)]="from" /></div></div>
              <div class="fld"><label class="fld-label" for="arTo">{{ 'ebelge.archive.to' | t }}</label><div class="field"><input id="arTo" type="date" [(ngModel)]="to" /></div></div>
              <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="download()" [disabled]="busy() || !from || !to"><app-icon name="download" /><span>{{ 'ebelge.archive.download' | t }}</span></button>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-h sh"><div class="hg"><h3>{{ 'ebelge.archive.integrity' | t }}</h3><p>{{ 'ebelge.archive.integrityHint' | t }}</p></div></div>
          <div class="card-b">
            <button type="button" class="btn" (click)="check()" [disabled]="busy()"><app-icon name="shield" />{{ 'ebelge.archive.runCheck' | t }}</button>
            @if (checkResult(); as r) {
              @if (r.mismatches.length) {
                <div class="notice notice-danger ar-res" role="alert"><app-icon name="alert" /><span class="t">{{ 'ebelge.archive.mismatch' | t: { n: r.mismatches.length, date: (r.noticeDeadline | appDate) } }}</span></div>
              } @else {
                <div class="notice notice-success ar-res"><app-icon name="okc" /><span class="t">{{ 'ebelge.archive.allOk' | t: { n: r.checked } }}</span></div>
              }
            }
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-h sh"><div class="hg"><h3>{{ 'ebelge.archive.title' | t }}</h3><p>{{ 'ebelge.archive.subtitle' | t }}</p></div>@if (docs().length) { <span class="tag">{{ docs().length }}</span> }</div>
        @if (!docs().length) {
          <div class="empty-state"><div class="empty-art"><app-icon name="archive" /></div><h3>{{ 'ebelge.archive.empty' | t }}</h3></div>
        } @else {
          <div class="table-scroll ar-scroll">
            <table class="tbl table-responsive ar-tbl">
              <thead><tr>
                <th>{{ 'ebelge.inbox.col.number' | t }}</th><th>{{ 'ebelge.inbox.col.type' | t }}</th><th>{{ 'ebelge.archive.counterparty' | t }}</th>
                <th>{{ 'documents.issueDate' | t }}</th><th class="r">{{ 'ebelge.inbox.col.amount' | t }}</th><th>{{ 'ebelge.inbox.col.status' | t }}</th><th>{{ 'ebelge.archive.retentionUntil' | t }}</th>
              </tr></thead>
              <tbody>
                @for (d of docs(); track d.id) {
                  <tr>
                    <td class="td-primary"><span class="ar-no"><span class="ar-dir" [class.in]="d.direction === 'IN'" [attr.data-tip]="'ebelge.archive.dir.' + d.direction | t"><app-icon [name]="d.direction === 'IN' ? 'inbox' : 'arrowur'" size="sm" /><span class="sr-only">{{ 'ebelge.archive.dir.' + d.direction | t }}</span></span><span class="mono" [attr.title]="d.documentNo || d.ettn">{{ d.documentNo || d.ettn.slice(0, 8) }}</span></span></td>
                    <td [attr.data-label]="'ebelge.inbox.col.type' | t"><span [attr.data-tip]="d.profileId || null">{{ 'ebelge.docType.' + d.documentType | t }}</span></td>
                    <td [attr.data-label]="'ebelge.archive.counterparty' | t"><span class="ar-cp" [attr.title]="d.counterpartyName">{{ d.counterpartyName }}</span></td>
                    <td [attr.data-label]="'documents.issueDate' | t">{{ d.issueDate | appDate }}</td>
                    <td class="r" [attr.data-label]="'ebelge.inbox.col.amount' | t">{{ d.payableAmount !== null ? (d.payableAmount | money: (d.currency || 'TRY')) : '—' }}</td>
                    <td [attr.data-label]="'ebelge.inbox.col.status' | t"><span class="ar-st"><span class="badge" [ngClass]="badge(d.gibStatus)"><span class="dot"></span>{{ 'ebelge.status.' + (d.gibStatus || 'QUEUED') | t }}</span>@if (!d.integrityOk) { <span class="badge badge-danger"><app-icon name="alert" size="xs" />{{ 'ebelge.archive.integrityBroken' | t }}</span> }</span></td>
                    <td [attr.data-label]="'ebelge.archive.retentionUntil' | t">{{ d.retentionUntil | appDate }}@if (d.legalHold) { <span class="badge badge-warning"><span class="dot"></span>{{ 'ebelge.archive.legalHold' | t }}</span> }</td>
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
