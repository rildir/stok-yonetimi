import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { apiError } from '../../services/documents.service';
import { EDocumentDetail, edocBadge } from '../../models/ebelge.models';

/**
 * e-Belge panel of a document (invoice / despatch advice / incoming): GİB status timeline, e-Arşiv
 * cancellation window, outbox state with "Yeniden dene", XML download, HTML / PDF preview, legal hold.
 */
@Component({
  selector: 'app-edoc-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe],
  styleUrls: ['../documents/documents.css'],
  styles: [`
    :host { display: block; }
    .edoc-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .edoc-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1) var(--space-4); font-size: var(--text-xs); color: var(--color-text-muted); margin: var(--space-2) 0 var(--space-3); }
    .edoc-meta .mono { overflow-wrap: anywhere; }
    .edoc-preview { width: 100%; height: min(78vh, 900px); border: 0; background: #fff; }
    .edoc-window { display: flex; align-items: center; gap: var(--space-2); }
    @media (max-width: 640px) { .edoc-meta { grid-template-columns: 1fr; } }
  `],
  template: `
    @if (loading()) {
      <div class="doc-hint">{{ 'ebelge.loading' | t }}</div>
    } @else if (doc(); as d) {
      <div class="doc-section">
        <div class="edoc-head">
          <h4 class="doc-section-title">
            {{ 'ebelge.panel.title' | t }}
            <span class="badge" [ngClass]="badge(d.gibStatus)">{{ 'ebelge.status.' + (d.gibStatus || 'QUEUED') | t }}</span>
            <span class="badge badge-neutral">{{ 'ebelge.docType.' + d.documentType | t }}</span>
          </h4>
          <div class="doc-actions">
            <button class="btn btn-secondary btn-sm" (click)="preview(d)">{{ 'ebelge.panel.preview' | t }}</button>
            <button class="btn btn-secondary btn-sm" (click)="downloadPdf(d)" [disabled]="busy()">PDF</button>
            <button class="btn btn-secondary btn-sm" (click)="downloadXml(d)">XML</button>
            @if (canRetry(d) && !ui.isReadonly()) { <button class="btn btn-primary btn-sm" (click)="retry(d)" [disabled]="busy()">{{ (isPending(d) ? 'ebelge.panel.sendNow' : 'ebelge.panel.retry') | t }}</button> }
          </div>
        </div>
        <div class="edoc-meta">
          <span>ETTN: <span class="mono">{{ d.ettn }}</span></span>
          <span>{{ 'ebelge.panel.scenario' | t }}: {{ d.profileId }} / {{ d.typeCode }}</span>
          <span>SHA-256: <span class="mono">{{ d.sha256.slice(0, 16) }}…</span> @if (!d.integrityOk) { <span class="badge badge-danger">{{ 'ebelge.archive.integrityBroken' | t }}</span> }</span>
          <span>{{ 'ebelge.archive.retentionUntil' | t }}: {{ d.retentionUntil | appDate }} @if (d.legalHold) { · <span class="badge badge-warning">{{ 'ebelge.archive.legalHold' | t }}</span> }</span>
        </div>

        @if (d.cancelWindow; as w) {
          <div class="doc-alert" [class.info]="w.open" [class.danger]="!w.open">
            <div class="edoc-window">
              <strong>{{ 'ebelge.cancelWindow' | t }}:</strong>
              @if (w.open) {
                <span class="days-left" [class.warning]="w.daysLeft <= 2">{{ 'ebelge.panel.daysLeft' | t: { n: w.daysLeft } }}</span>
                <span>({{ 'ebelge.panel.until' | t: { date: (w.lastDay | appDate) } }})</span>
              } @else {
                <span>{{ 'ebelge.panel.windowClosed' | t: { date: (w.lastDay | appDate) } }}</span>
              }
            </div>
          </div>
        }

        @if (d.noticeWindow; as nw) {
          <div class="doc-alert" [class.info]="nw.open">
            <div class="edoc-window">
              <strong>{{ 'ebelge.noticeWindow.title' | t }}:</strong>
              @if (nw.open) {
                <span>{{ 'ebelge.noticeWindow.open' | t: { days: nw.days, date: (nw.lastDay | appDate) } }}</span>
              } @else {
                <span>{{ 'ebelge.noticeWindow.closed' | t: { days: nw.days, date: (nw.lastDay | appDate) } }}</span>
              }
            </div>
          </div>
        }

        @for (o of d.outbox; track o.id) {
          @if (o.status !== 'DONE') {
            <div class="doc-alert" [class.danger]="o.status === 'DEAD'">
              {{ 'ebelge.outbox.' + o.status | t }} · {{ 'ebelge.outbox.attempts' | t: { n: o.attempt, max: o.maxAttempts } }}
              @if (o.lastError) { <div class="doc-hint">{{ o.lastErrorCode }}: {{ o.lastError }}</div> }
              @if (o.deadlineAt) { <div class="doc-hint">{{ 'ebelge.outbox.matbudanDeadline' | t: { date: (o.deadlineAt | appDate: 'datetime') } }}</div> }
            </div>
          }
        }

        <ul class="doc-timeline">
          @for (e of d.events; track e.id) {
            <li [class.muted]="e.source === 'SYSTEM'">
              <div class="tl-head"><span class="badge" [ngClass]="badge(e.status)">{{ 'ebelge.status.' + e.status | t }}</span><span>{{ e.at | appDate: 'datetime' }}</span></div>
              <div class="tl-sub">{{ 'ebelge.source.' + e.source | t }}@if (e.code && e.code !== 'CHANNEL') { · {{ eventCode(e.code) }} }@if (e.message) { · {{ eventMessage(e) }} }@if (e.actor) { · {{ e.actor }} }</div>
            </li>
          }
        </ul>

        @if (d.deliveries.length) {
          <div class="doc-hint" style="margin-top: var(--space-3)">
            @for (dl of d.deliveries; track dl.id) { {{ 'ebelge.panel.delivered' | t: { channel: ('ebelge.channel.' + dl.channel | t), date: (dl.deliveredAt | appDate: 'datetime') } }} @if (dl.recipient) { ({{ dl.recipient }}) } }
          </div>
        }
        @if (d.notices.length) {
          <div class="doc-hint">
            @for (n of d.notices; track n.id) { {{ 'ebelge.notice.' + n.kind | t }}: {{ 'ebelge.noticeChannel.' + n.channel | t }} · {{ n.noticeDate | appDate }} @if (n.reference) { · {{ n.reference }} } @if (n.reportedToProvider) { · {{ 'ebelge.notice.reported' | t }} } }
          </div>
        }
        <p class="doc-hint" style="margin-top: var(--space-2)">{{ 'ebelge.legalArchiveNote' | t }}</p>
        @if (isAdmin() && !ui.isReadonly()) {
          <button class="link-btn" (click)="toggleHold(d)">{{ (d.legalHold ? 'ebelge.archive.releaseHold' : 'ebelge.archive.setHold') | t }}</button>
        }
      </div>
    } @else if (expected) {
      <div class="doc-hint">{{ 'ebelge.panel.none' | t }}</div>
    }

    @if (previewHtml(); as html) {
      <div class="modal-backdrop z-top" (click)="previewHtml.set(null)">
        <div class="modal-panel modal-panel-lg" (click)="$event.stopPropagation()" style="max-width: 900px; width: 96vw">
          <div class="modal-header"><h3>{{ 'ebelge.panel.preview' | t }}</h3></div>
          <iframe class="edoc-preview" [srcdoc]="html" title="e-Belge"></iframe>
          <div class="modal-footer"><button class="btn btn-secondary" (click)="previewHtml.set(null)">{{ 'common.close' | t }}</button></div>
        </div>
      </div>
    }
  `,
})
export class EdocPanelComponent implements OnChanges, OnDestroy {
  @Input() sourceType = 'invoice';
  @Input() sourceId: string | null = null;
  /** Show "not an e-document" when nothing is found */
  @Input() expected = false;

  private api = inject(EBelgeService);
  ui = inject(UiStateService);
  isAdmin = () => this.ui.userProfile()?.role === 'admin';
  private i18n = inject(I18nService);
  private sanitizer = inject(DomSanitizer);
  private socket = inject(SocketService, { optional: true });
  private sub?: Subscription;

  doc = signal<EDocumentDetail | null>(null);
  loading = signal(false);
  busy = signal(false);
  previewHtml = signal<SafeHtml | null>(null);
  badge = edocBadge;

  ngOnChanges() {
    this.load();
    if (!this.sub && this.socket) this.sub = this.socket.ebelge$.subscribe((e) => e.event === 'edocument_status' && this.load(true));
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  load(silent = false) {
    if (!this.sourceId) return;
    if (!silent) this.loading.set(true);
    this.api.bySource(this.sourceType, this.sourceId).subscribe({
      next: (d) => {
        this.doc.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.doc.set(null);
        this.loading.set(false);
      },
    });
  }

  canRetry(d: EDocumentDetail): boolean {
    return d.direction === 'OUT' && d.outbox.some((o) => o.status === 'PENDING' || o.status === 'FAILED' || o.status === 'DEAD') && !['REJECTED', 'CANCELLED'].includes(String(d.gibStatus));
  }

  /** Still waiting in the queue (e.g. automatic sending is off): "Send now" instead of "Retry". */
  isPending(d: EDocumentDetail): boolean {
    return d.outbox.some((o) => o.status === 'PENDING') && !d.outbox.some((o) => o.status === 'FAILED' || o.status === 'DEAD');
  }

  eventCode(code: string): string {
    if (code.startsWith('NOTICE_') && this.i18n.has('ebelge.noticeChannel.' + code.slice(7))) return this.i18n.t('ebelge.noticeChannel.' + code.slice(7));
    const key = 'ebelge.eventCode.' + code;
    return this.i18n.has(key) ? this.i18n.t(key) : code;
  }

  /**
   * Timeline text in the user's language: CHANNEL carries a channel value, known codes carry JSON
   * parameters for ebelge.event.<code>; anything else (integrator text, user notes) is shown as is.
   */
  eventMessage(e: { code: string | null; message: string | null }): string {
    if (!e.message) return '';
    if (e.code === 'CHANNEL') return this.i18n.has('ebelge.channel.' + e.message) ? this.i18n.t('ebelge.channel.' + e.message) : e.message;
    const key = 'ebelge.event.' + e.code;
    if (e.code && this.i18n.has(key) && e.message.startsWith('{')) {
      try {
        return this.i18n.t(key, JSON.parse(e.message));
      } catch {
        return e.message;
      }
    }
    // Rows written before the messages became language-neutral (the timeline is append-only).
    const legacyChannel = /^e-(?:Arşiv|İrsaliye) \(([A-Z]+)\)$/.exec(e.message);
    if (legacyChannel && this.i18n.has('ebelge.channel.' + legacyChannel[1])) return this.i18n.t('ebelge.channel.' + legacyChannel[1]);
    const legacyFull = /^İrsaliye yanıtı (\S+): tamamı kabul edildi\.$/.exec(e.message);
    if (legacyFull) return this.i18n.t('ebelge.event.RECEIPT_ACCEPTED', { no: legacyFull[1] });
    const legacyPartial = /^İrsaliye yanıtı (\S+): (\S+) kabul, (\S+) kabul edilmeyen \/ eksik\.$/.exec(e.message);
    if (legacyPartial) return this.i18n.t('ebelge.event.RECEIPT_ADVICE', { no: legacyPartial[1], received: legacyPartial[2], rejected: legacyPartial[3] });
    return e.message;
  }

  preview(d: EDocumentDetail) {
    this.api.html(d.id).subscribe({
      next: (html) => this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(html) as SafeHtml),
      error: (e) => this.ui.showToast(apiError(e, this.i18n.t('ebelge.error.preview')), 'error'),
    });
  }

  downloadXml(d: EDocumentDetail) {
    this.api.xml(d.id).subscribe({ next: (b) => this.api.saveBlob(b, `${d.documentNo || d.ettn}.xml`), error: () => this.ui.showToast(this.i18n.t('ebelge.error.download'), 'error') });
  }

  downloadPdf(d: EDocumentDetail) {
    this.busy.set(true);
    this.api.pdf(d.id).subscribe({
      next: (b) => {
        this.busy.set(false);
        this.api.openBlob(b);
      },
      error: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('ebelge.error.pdf'), 'error');
      },
    });
  }

  retry(d: EDocumentDetail) {
    this.busy.set(true);
    this.api.retry(d.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('ebelge.toast.retried'), 'success');
        this.load(true);
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }

  toggleHold(d: EDocumentDetail) {
    const hold = !d.legalHold;
    const reason = hold ? (typeof window !== 'undefined' ? window.prompt(this.i18n.t('ebelge.archive.holdReason')) : '') : null;
    if (hold && !reason) return;
    this.api.legalHold(d.id, hold, reason).subscribe({ next: (x) => this.doc.set(x), error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error') });
  }
}
