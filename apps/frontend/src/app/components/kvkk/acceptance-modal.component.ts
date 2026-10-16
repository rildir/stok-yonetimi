import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService, TranslatePipe, AppDatePipe } from '../../i18n';
import { KvkkService, PrivacyNotice } from '../../services/kvkk.service';
import { UiStateService } from '../../services/ui-state.service';
import { NoticeTextComponent } from './notice-text.component';
import { IconComponent } from '../shared/icon.component';
import { DemoNoticeComponent } from '../shared/demo-notice.component';

/**
 * First sign-in (R57): the employees' privacy notice and, for administrators, the terms of service
 * and the data processing agreement. Each text has its own, unticked box; the acceptance is stored
 * with version, IP and time (legal_acceptances).
 */
@Component({
  selector: 'app-acceptance-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NoticeTextComponent, IconComponent, DemoNoticeComponent],
  styles: [`
    .acc-modal { width: 720px; }
    .acc-h { justify-content: flex-start; align-items: center; gap: 12px; padding: 20px 20px 14px; box-shadow: inset 0 -1px 0 var(--line); }
    .acc-h > div { min-width: 0; }
    .acc-h h2 { margin: 0; }
    .acc-h p { margin: 2px 0 0; font-size: var(--text-sm); line-height: 18px; color: var(--fg-3); max-width: 64ch; }
    .acc-ic { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--accent-soft); color: var(--accent); }
    .acc-b { display: flex; flex-direction: column; gap: 8px; padding: 16px 20px 20px; background: var(--surface-2); }
    .acc-doc { border-radius: var(--radius-lg); background: var(--surface); box-shadow: 0 0 0 1px var(--ring); transition: box-shadow var(--dur-1) var(--ease-out); }
    .acc-doc:hover { box-shadow: 0 0 0 1px var(--ring-strong); }
    .acc-doc.is-done { box-shadow: 0 0 0 1px var(--ring), inset 3px 0 0 var(--success-dot); }
    .acc-doc > summary { list-style: none; display: flex; align-items: center; gap: 10px; min-height: var(--h-xl); padding: 8px 12px; cursor: pointer; border-radius: var(--radius-lg); color: var(--fg); }
    .acc-doc > summary::-webkit-details-marker { display: none; }
    .acc-doc > summary:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .acc-doc[open] > summary { box-shadow: inset 0 -1px 0 var(--line); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    .acc-step { flex: none; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; font: 500 11px/1 var(--font-mono); color: var(--fg-3); box-shadow: inset 0 0 0 1px var(--ring-strong); }
    .acc-doc.is-done .acc-step { background: var(--success-dot); color: var(--surface); box-shadow: none; }
    .acc-t { flex: 1; min-width: 0; font-weight: 500; line-height: 18px; }
    .acc-meta { flex: none; font-size: var(--text-xs); color: var(--fg-3); white-space: nowrap; }
    .acc-chev { flex: none; color: var(--fg-3); transition: transform var(--dur-2) var(--ease-out); }
    .acc-doc[open] .acc-chev { transform: rotate(90deg); }
    .acc-text { max-height: 300px; overflow-y: auto; padding: 4px 16px 4px 44px; color: var(--fg-2); }
    .acc-check { display: flex; margin: 0; padding: 12px 16px 12px 44px; box-shadow: inset 0 1px 0 var(--line); border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
    .acc-doc.is-done .acc-check { background: var(--success-soft); }
    .acc-f { gap: 12px; }
    .acc-progress { display: inline-flex; align-items: center; gap: 8px; font-size: var(--text-xs); color: var(--fg-3); }
    .acc-progress .meter { width: 80px; }
    @media (max-width: 640px) {
      .acc-h { align-items: flex-start; padding: 16px; }
      .acc-b { padding: 12px 16px 16px; }
      .acc-doc > summary { flex-wrap: wrap; row-gap: 2px; }
      .acc-meta { order: 4; flex-basis: 100%; padding-left: 32px; }
      .acc-text { padding: 4px 16px 4px; max-height: 240px; }
      .acc-check { padding: 12px 16px; }
      .acc-f .btn { flex: 1; }
      .acc-progress { flex-basis: 100%; }
      .acc-f .spacer { display: none; }
    }
  `],
  template: `
    @if (docs().length) {
      <div class="scrim" role="dialog" aria-modal="true" aria-labelledby="accTitle" aria-describedby="accSub">
        <div class="modal acc-modal">
          <div class="modal-h acc-h">
            <span class="acc-ic" aria-hidden="true"><app-icon name="shield" /></span>
            <div>
              <h2 id="accTitle">{{ 'kvkk.accept.title' | t }}</h2>
              <p id="accSub">{{ 'kvkk.accept.subtitle' | t }}</p>
            </div>
          </div>
          <div class="modal-b acc-b">
            <app-demo-notice />
            @for (d of docs(); track d.id; let i = $index) {
              <details class="acc-doc" [class.is-done]="checked().has(d.id)" [open]="i === 0">
                <summary>
                  <span class="acc-step" aria-hidden="true">@if (checked().has(d.id)) { <app-icon name="check" size="xs" /> } @else { {{ i + 1 }} }</span>
                  <span class="acc-t">{{ d.title }}</span>
                  <span class="acc-meta">{{ 'kvkk.notice.version' | t }} {{ d.version }} · {{ d.publishedAt | appDate }}</span>
                  <app-icon class="acc-chev" name="chevr" size="sm" />
                </summary>
                <div class="acc-text"><app-notice-text [text]="d.body" [demo]="false"></app-notice-text></div>
                <label class="check acc-check">
                  <input type="checkbox" [checked]="checked().has(d.id)" (change)="toggle(d.id)" />
                  <span>{{ ('kvkk.accept.check.' + d.docType) | t }}</span>
                </label>
              </details>
            }
          </div>
          <div class="modal-f acc-f">
            <span class="acc-progress" aria-live="polite">
              <span class="meter ok" aria-hidden="true"><i [style.width.%]="(checked().size / docs().length) * 100"></i></span>
              {{ 'kvkk.accept.progress' | t: { n: checked().size, total: docs().length } }}
            </span>
            <span class="spacer"></span>
            <button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="!allChecked() || busy()" (click)="accept()"><span>{{ 'kvkk.accept.submit' | t }}</span><app-icon name="arrowr" size="sm" /></button>
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
