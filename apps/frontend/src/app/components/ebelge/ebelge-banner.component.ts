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
    .eb-band { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-3); font-size: var(--text-sm); border: var(--border-width) solid var(--color-border); }
    .eb-band.danger { background: var(--color-danger-subtle); color: var(--color-danger-text); }
    .eb-band.warning { background: var(--color-warning-subtle); color: var(--color-warning-text); }
    .eb-band.info { background: var(--color-primary-subtle); color: var(--color-primary-text); }
    .eb-band a { color: inherit; font-weight: var(--weight-semibold); }
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
