import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppDatePipe, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { SocketService } from '../../services/socket.service';
import { EBelgeStatus } from '../../models/ebelge.models';

/**
 * Band above the page content: integrator outage (509 V.7 paper fallback hint), failed sends,
 * MATBUDAN deadlines, incoming documents waiting for an answer, archive integrity breach.
 */
@Component({
  selector: 'app-ebelge-banner',
  standalone: true,
  imports: [RouterModule, TranslatePipe, AppDatePipe],
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
    :host:empty { display: none; margin: 0; }
    .eb-band { --tone: var(--info); --tone-soft: var(--info-soft); --tone-line: var(--info-line); --tone-dot: var(--accent);
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 36px; padding: 8px 12px;
      border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--fg); background: var(--tone-soft);
      box-shadow: inset 0 0 0 1px var(--tone-line), inset 3px 0 0 var(--tone-dot); }
    .eb-band.danger { --tone: var(--danger); --tone-soft: var(--danger-soft); --tone-line: var(--danger-line); --tone-dot: var(--danger-dot); }
    .eb-band.warning { --tone: var(--warning); --tone-soft: var(--warning-soft); --tone-line: var(--warning-line); --tone-dot: var(--warning-dot); }
    .eb-band a { color: var(--accent-text); font-weight: 500; }
  `],
  template: `
    @if (st(); as s) {
      @if (s.outage) {
        <div class="eb-band danger" role="alert">{{ 'ebelge.banner.outage' | t: { since: (s.outage.since | appDate: 'datetime'), message: s.outage.message || '-' } }}</div>
      }
      @if (s.integrityBroken) {
        <div class="eb-band danger" role="alert">{{ 'ebelge.banner.integrity' | t: { n: s.integrityBroken } }} <a routerLink="/settings" [queryParams]="{ tab: 'archive' }">{{ 'ebelge.banner.open' | t }}</a></div>
      }
      @for (m of s.matbudan; track m.ettn) {
        <div class="eb-band" [class.danger]="m.overdue" [class.warning]="!m.overdue">{{ (m.overdue ? 'ebelge.banner.matbudanOverdue' : 'ebelge.banner.matbudan') | t: { no: m.documentNo || '-', date: (m.deadlineAt | appDate: 'datetime') } }}</div>
      }
      @if (s.outbox.failed || s.outbox.dead) {
        <div class="eb-band warning">{{ 'ebelge.banner.outbox' | t: { failed: s.outbox.failed, dead: s.outbox.dead } }}</div>
      }
      @if (s.inbox.dueSoon) {
        <div class="eb-band info">{{ 'ebelge.banner.inbox' | t: { n: s.inbox.dueSoon } }} <a routerLink="/inbox" [queryParams]="{}">{{ 'ebelge.banner.open' | t }}</a></div>
      }
    }
  `,
})
export class EBelgeBannerComponent implements OnInit, OnDestroy {
  private api = inject(EBelgeService);
  private socket = inject(SocketService, { optional: true });
  private sub?: Subscription;
  private timer: ReturnType<typeof setInterval> | null = null;
  st = signal<EBelgeStatus | null>(null);

  ngOnInit() {
    this.load();
    if (this.socket) this.sub = this.socket.ebelge$.subscribe((e) => (e.event === 'ebelge_status' || e.event === 'inbox_updated') && this.load());
    if (typeof window !== 'undefined') this.timer = setInterval(() => this.load(), 5 * 60_000);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.timer) clearInterval(this.timer);
  }

  load() {
    this.api.status().subscribe({ next: (s) => this.st.set(s.mode === 'PROVIDER' || s.outage ? s : null), error: () => this.st.set(null) });
  }
}
