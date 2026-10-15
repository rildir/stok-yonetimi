import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AppDatePipe, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { EDocumentDetail } from '../../models/ebelge.models';

/**
 * e-İrsaliye for the vehicle (mobile): full-screen display with the karekod, so the driver can show
 * the electronic despatch advice at a roadside inspection.
 */
@Component({
  selector: 'app-despatch-view',
  standalone: true,
  imports: [RouterModule, TranslatePipe, AppDatePipe],
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--color-bg, #f5f5f5); }
    .dv-bar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); background: var(--color-surface); border-bottom: var(--border-width) solid var(--color-border); z-index: 2; }
    .dv-title { font-weight: var(--weight-semibold); color: var(--color-text); font-size: var(--text-sm); }
    .dv-sub { font-size: var(--text-xs); color: var(--color-text-muted); }
    .dv-frame { width: 100%; height: calc(100vh - 56px); border: 0; background: #fff; display: block; }
    .dv-empty { padding: var(--space-6) var(--space-4); text-align: center; color: var(--color-text-muted); }
  `],
  template: `
    <div class="dv-bar">
      <div>
        <div class="dv-title">{{ 'ebelge.vehicle.title' | t }} {{ doc()?.documentNo }}</div>
        @if (doc(); as d) { <div class="dv-sub">{{ 'ebelge.status.' + (d.gibStatus || 'QUEUED') | t }} · {{ d.issueDate | appDate }}</div> }
      </div>
      <a class="btn btn-secondary btn-sm" routerLink="/despatches" [queryParams]="{ id: id }">{{ 'common.close' | t }}</a>
    </div>
    @if (html(); as h) {
      <iframe class="dv-frame" [srcdoc]="h" title="e-İrsaliye"></iframe>
    } @else {
      <div class="dv-empty">{{ (missing() ? 'ebelge.vehicle.none' : 'ebelge.loading') | t }}</div>
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
