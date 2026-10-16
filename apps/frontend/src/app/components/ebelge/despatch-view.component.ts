import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AppDatePipe, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { EDocumentDetail, edocBadge } from '../../models/ebelge.models';
import { IconComponent } from '../shared/icon.component';

/**
 * e-İrsaliye for the vehicle (mobile): full-screen display with the karekod, so the driver can show
 * the electronic despatch advice at a roadside inspection.
 */
@Component({
  selector: 'app-despatch-view',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, AppDatePipe, IconComponent],
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; background: var(--canvas); }
    .dv-bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px 8px 16px; background: var(--surface); box-shadow: inset 0 -1px 0 var(--line); }
    .dv-mark { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--line); color: var(--fg-2); }
    .dv-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .dv-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: var(--text-sm); font-weight: 600; color: var(--fg); }
    .dv-title .mono { font-family: var(--font-mono); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dv-sub { display: flex; align-items: center; gap: 8px; font-size: var(--text-xs); color: var(--fg-3); }
    .dv-sub .badge { margin-left: 0; }
    .dv-canvas { flex: 1; display: flex; justify-content: center; padding: 24px 16px 32px; background: var(--surface-sunken); }
    .dv-paper { width: 100%; max-width: 880px; display: flex; border-radius: var(--radius-md); overflow: hidden; background: var(--white); box-shadow: var(--shadow-pop); }
    .dv-frame { flex: 1; width: 100%; height: calc(100vh - 56px - 56px); height: calc(100dvh - 56px - 56px); min-height: 480px; border: 0; display: block; background: var(--white); }
    @media (max-width: 640px) {
      .dv-canvas { padding: 8px; }
      .dv-paper { border-radius: var(--radius-sm); }
      .dv-frame { height: calc(100dvh - 56px - 16px); }
    }
    .dv-empty { flex: 1; }
  `],
  template: `
    <div class="dv-bar">
      <span class="dv-mark"><app-icon name="truck" /></span>
      <div class="dv-t">
        <div class="dv-title"><span>{{ 'ebelge.vehicle.title' | t }}</span>@if (doc()?.documentNo) { <span class="mono">{{ doc()?.documentNo }}</span> }</div>
        @if (doc(); as d) { <div class="dv-sub"><span class="badge" [ngClass]="badge(d.gibStatus)"><span class="dot"></span>{{ 'ebelge.status.' + (d.gibStatus || 'QUEUED') | t }}</span><span>{{ d.issueDate | appDate }}</span></div> }
      </div>
      <a class="btn btn-sm" routerLink="/despatches" [queryParams]="{ id: id }"><app-icon name="x" size="sm" />{{ 'common.close' | t }}</a>
    </div>
    @if (html(); as h) {
      <div class="dv-canvas"><div class="dv-paper"><iframe class="dv-frame" [srcdoc]="h" title="e-İrsaliye"></iframe></div></div>
    } @else {
      <div class="empty-state dv-empty">
        @if (missing()) {
          <div class="empty-art"><app-icon name="file" /></div>
          <h3>{{ 'ebelge.vehicle.none' | t }}</h3>
          <div class="actions cluster"><a class="btn btn-sm" routerLink="/despatches" [queryParams]="{ id: id }"><app-icon name="chevl" size="sm" />{{ 'despatches.title' | t }}</a></div>
        } @else {
          <span class="spinner-sm" role="status" [attr.aria-label]="'ebelge.loading' | t"></span>
          <p>{{ 'ebelge.loading' | t }}</p>
        }
      </div>
    }
  `,
})
export class DespatchViewComponent implements OnInit {
  private api = inject(EBelgeService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  id = '';
  doc = signal<EDocumentDetail | null>(null);
  html = signal<SafeHtml | null>(null);
  missing = signal(false);
  badge = edocBadge;

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.api.bySource('despatch', this.id).subscribe({
      next: (d) => {
        if (!d) return this.missing.set(true);
        this.doc.set(d);
        this.api.html(d.id).subscribe({
          next: (h) => this.html.set(this.sanitizer.bypassSecurityTrustHtml(h.replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1">'))),
          error: () => this.missing.set(true),
        });
      },
      error: () => this.missing.set(true),
    });
  }
}
