import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService, TranslatePipe, AppDatePipe } from '../../i18n';
import { KvkkService, PrivacyNotice } from '../../services/kvkk.service';
import { UiStateService } from '../../services/ui-state.service';
import { NoticeTextComponent } from './notice-text.component';

/**
 * First sign-in (R57): the employees' privacy notice and, for administrators, the terms of service
 * and the data processing agreement. Each text has its own, unticked box; the acceptance is stored
 * with version, IP and time (legal_acceptances).
 */
@Component({
  selector: 'app-acceptance-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NoticeTextComponent],
  styles: [`
    .acc-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: var(--space-4); background: var(--color-overlay); backdrop-filter: blur(4px); }
    .acc-panel { width: 100%; max-width: 760px; max-height: calc(100vh - 2 * var(--space-4)); display: flex; flex-direction: column; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
    .acc-head { padding: var(--space-5) var(--space-5) var(--space-3); border-bottom: 1px solid var(--color-border); }
    .acc-head h2 { margin: 0 0 var(--space-1); font-size: var(--text-lg); }
    .acc-head p { margin: 0; color: var(--color-text-muted); font-size: var(--text-sm); }
    .acc-body { padding: var(--space-4) var(--space-5); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3); }
    .acc-doc { border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .acc-doc summary { cursor: pointer; padding: var(--space-3); font-weight: var(--weight-semibold); display: flex; justify-content: space-between; gap: var(--space-3); }
    .acc-doc .acc-text { padding: 0 var(--space-3) var(--space-3); max-height: 280px; overflow-y: auto; }
    .acc-check { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-3); border-top: 1px solid var(--color-border); font-size: var(--text-sm); }
    .acc-foot { padding: var(--space-3) var(--space-5) var(--space-5); display: flex; justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); }
    .acc-meta { font-weight: normal; color: var(--color-text-muted); font-size: var(--text-xs); white-space: nowrap; }
  `],
  template: `
    @if (docs().length) {
      <div class="acc-overlay" role="dialog" aria-modal="true" [attr.aria-label]="'kvkk.accept.title' | t">
        <div class="acc-panel">
          <div class="acc-head">
            <h2>{{ 'kvkk.accept.title' | t }}</h2>
            <p>{{ 'kvkk.accept.subtitle' | t }}</p>
          </div>
          <div class="acc-body">
            @for (d of docs(); track d.id; let i = $index) {
              <details class="acc-doc" [open]="i === 0">
                <summary>{{ d.title }} <span class="acc-meta">{{ 'kvkk.notice.version' | t }} {{ d.version }} · {{ d.publishedAt | appDate }}</span></summary>
                <div class="acc-text"><app-notice-text [text]="d.body"></app-notice-text></div>
                <label class="acc-check">
                  <input type="checkbox" [checked]="checked().has(d.id)" (change)="toggle(d.id)" />
                  <span>{{ ('kvkk.accept.check.' + d.docType) | t }}</span>
                </label>
              </details>
            }
          </div>
          <div class="acc-foot">
            <button type="button" class="btn btn-primary" [disabled]="!allChecked() || busy()" (click)="accept()">{{ 'kvkk.accept.submit' | t }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AcceptanceModalComponent implements OnInit {
  private api = inject(KvkkService);
  private i18n = inject(I18nService);
  private ui = inject(UiStateService);
  docs = signal<PrivacyNotice[]>([]);
  checked = signal<Set<string>>(new Set());
  busy = signal(false);
  allChecked = computed(() => this.docs().every((d) => this.checked().has(d.id)));

  ngOnInit() {
    this.api.pendingAcceptances(this.i18n.lang()).subscribe({ next: (d) => this.docs.set(d || []), error: () => undefined });
  }

  toggle(id: string) {
    const s = new Set(this.checked());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.checked.set(s);
  }

  accept() {
    this.busy.set(true);
    this.api.accept(this.docs().map((d) => d.id)).subscribe({
      next: () => {
        this.busy.set(false);
        this.docs.set([]);
        this.ui.showToast(this.i18n.t('kvkk.accept.done'), 'success');
      },
      error: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('kvkk.error'), 'error');
      },
    });
  }
}
