import { Component, HostListener, Input, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../i18n';
import { KvkkService } from '../../services/kvkk.service';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { KvkkBannerComponent } from '../kvkk/kvkk-banner.component';
import { ComplianceBannersComponent } from '../shared/compliance-banners.component';

/**
 * Compliance notices (KVKK deadlines, 2FA set-up, fiscal / e-Belge obligations) collapsed into
 * ONE topbar pill ("2 uyum uyarısı") that opens a popover with each notice and its CTA.
 * mode="inline" renders only the list (used inside the bell popover on mobile).
 */
@Component({
  selector: 'app-notice-center',
  standalone: true,
  imports: [TranslatePipe, KvkkBannerComponent, ComplianceBannersComponent],
  template: `
    @if (count() > 0) {
      @if (mode === 'pill') {
        <div class="tb-pop">
          <button type="button" class="notice-pill" [class.is-danger]="hasError()" [attr.aria-expanded]="open()" aria-haspopup="dialog" (click)="toggle($event)">
            <span class="dot" aria-hidden="true"></span>{{ 'layout.notices.pill' | t: { n: count() } }}
          </button>
          @if (open()) {
            <div class="pop notice-pop" role="dialog" [attr.aria-label]="'layout.notices.title' | t" (click)="$event.stopPropagation()">
              <div class="notice-pop-h">{{ 'layout.notices.title' | t }}</div>
              <div class="notice-list" (click)="onListClick($event)">
                <app-kvkk-banner variant="list"></app-kvkk-banner>
                <app-compliance-banners variant="list"></app-compliance-banners>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="notice-pop-h">{{ 'layout.notices.title' | t }}</div>
        <div class="notice-list">
          <app-kvkk-banner variant="list"></app-kvkk-banner>
          <app-compliance-banners variant="list"></app-compliance-banners>
        </div>
      }
    }
  `,
  styles: [`:host { display: contents; }`],
})
export class NoticeCenterComponent implements OnInit {
  @Input() mode: 'pill' | 'inline' = 'pill';
  private kvkk = inject(KvkkService);
  private compliance = inject(ComplianceService);
  private ui = inject(UiStateService);
  open = signal(false);

  private isAdmin = computed(() => this.ui.userProfile()?.role === 'admin');
  private kvkkAlerts = computed(() => (this.isAdmin() ? (this.kvkk.status()?.alerts || []).filter((a) => a.severity !== 'info') : []));
  private complianceAlerts = computed(() => (this.compliance.report()?.alerts || []).filter((a) => a.severity !== 'info'));
  count = computed(() => this.kvkkAlerts().length + this.complianceAlerts().length);
  hasError = computed(() => [...this.kvkkAlerts(), ...this.complianceAlerts()].some((a) => a.severity === 'error'));

  ngOnInit() {
    if (this.mode !== 'pill') return;
    const role = this.ui.userProfile()?.role;
    if (!role || role === 'admin') this.kvkk.loadStatus().subscribe({ error: () => undefined });
    this.compliance.loadCompliance().subscribe({ error: () => undefined });
  }

  toggle(e: Event) {
    e.stopPropagation();
    this.open.update((v) => !v);
  }

  onListClick(e: Event) {
    if ((e.target as HTMLElement).closest('a')) this.open.set(false);
  }

  @HostListener('document:click')
  close() {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  esc() {
    this.open.set(false);
  }
}
