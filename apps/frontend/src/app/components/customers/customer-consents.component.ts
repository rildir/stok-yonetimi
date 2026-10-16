import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { CONSENT_CHANNELS, CONSENT_PURPOSES, ConsentRecord, KvkkService } from '../../services/kvkk.service';
import { UiStateService } from '../../services/ui-state.service';
import { apiError } from '../../services/documents.service';
import { DemoNoticeComponent } from '../shared/demo-notice.component';
import { IconComponent } from '../shared/icon.component';

/**
 * Customer drawer > Rıza (KVKK md. 5/1): explicit-consent records with channel, text version and
 * evidence. Nothing is pre-ticked: the "consent obtained" box must be ticked for every new record.
 * Invoicing / despatch are not consent-based (the backend refuses them with CONSENT_NOT_REQUIRED).
 */
@Component({
  selector: 'app-customer-consents',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, IconComponent, DemoNoticeComponent],
  styles: [`
    :host { display: flex; flex-direction: column; gap: 12px; }
    .cs-note { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); margin: 0; }
    .cs-list { display: flex; flex-direction: column; border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
    .cs-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; box-shadow: inset 0 -1px 0 var(--line); }
    .cs-item:last-child { box-shadow: none; }
    .cs-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .cs-main b { font-weight: 500; font-size: var(--text-sm); color: var(--fg); }
    .cs-sub { font-size: var(--text-xs); color: var(--fg-3); }
    .cs-item .badge { margin-left: 0; flex: none; }
    .cs-empty { padding: 10px 12px; font-size: var(--text-xs); color: var(--fg-3); }
    .cs-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 14px; padding: 14px; border-radius: var(--radius-md);
      background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .cs-form .full { grid-column: 1 / -1; }
    .cs-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .cs-add { align-self: flex-start; }
    @media (max-width: 640px) {
      .cs-form { grid-template-columns: minmax(0, 1fr); }
      .cs-item { flex-wrap: wrap; }
    }
  `],
  template: `
    <app-demo-notice />
    <p class="cs-note">{{ 'kvkk.consent.legalNote' | t }}</p>
    <div class="cs-list">
      @for (c of items(); track c.id) {
        <div class="cs-item">
          <div class="cs-main">
            <b>{{ 'kvkk.consent.purpose.' + c.purposeCode | t }}</b>
            <span class="cs-sub">{{ 'kvkk.consent.givenVia' | t: { date: (c.givenAt | appDate: 'datetime'), channel: ('kvkk.channel.' + c.channel | t) } }}@if (c.textVersion) { · <span class="mono">v{{ c.textVersion }}</span> }</span>
            @if (c.withdrawnAt) { <span class="cs-sub">{{ 'kvkk.consent.withdrawnAt' | t: { date: (c.withdrawnAt | appDate: 'datetime') } }}</span> }
          </div>
          @if (c.withdrawnAt) { <span class="badge badge-neutral"><span class="dot"></span>{{ 'kvkk.consent.withdrawn' | t }}</span> }
          @else {
            <span class="badge badge-success"><span class="dot"></span>{{ 'kvkk.consent.active' | t }}</span>
            @if (canEdit) { <button type="button" class="btn btn-danger-outline btn-sm" (click)="withdraw(c)" [disabled]="busy()">{{ 'kvkk.consent.withdraw' | t }}</button> }
          }
        </div>
      } @empty {
        <div class="cs-empty">{{ 'kvkk.consent.none' | t }}</div>
      }
    </div>
    @if (canEdit) {
      @if (adding()) {
        <div class="cs-form">
          <div class="fld">
            <label class="fld-label" for="csPurpose">{{ 'kvkk.consent.purposeLabel' | t }}</label>
            <div class="field select">
              <select id="csPurpose" [(ngModel)]="purpose">
                @for (p of purposes; track p) { <option [value]="p">{{ 'kvkk.consent.purpose.' + p | t }}</option> }
              </select>
            </div>
          </div>
          <div class="fld">
            <label class="fld-label" for="csChannel">{{ 'kvkk.consent.channel' | t }}</label>
            <div class="field select">
              <select id="csChannel" [(ngModel)]="channel">
                @for (ch of channels; track ch) { <option [value]="ch">{{ 'kvkk.channel.' + ch | t }}</option> }
              </select>
            </div>
          </div>
          <div class="fld">
            <label class="fld-label" for="csVersion">{{ 'kvkk.consent.textVersion' | t }}</label>
            <div class="field"><input id="csVersion" class="mono" [(ngModel)]="textVersion" /></div>
          </div>
          <div class="fld">
            <label class="fld-label" for="csEvidence">{{ 'kvkk.consent.evidence' | t }}</label>
            <div class="field"><input id="csEvidence" [(ngModel)]="evidence" /></div>
          </div>
          <label class="check full"><input type="checkbox" [(ngModel)]="confirmed" />{{ 'kvkk.consent.confirm' | t }}</label>
          <div class="full cs-actions">
            <button type="button" class="btn btn-ghost btn-sm" (click)="adding.set(false)">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary btn-sm" [class.is-loading]="busy()" [disabled]="!confirmed || busy()" (click)="give()">{{ 'kvkk.consent.record' | t }}</button>
          </div>
        </div>
      } @else {
        <button type="button" class="btn btn-subtle btn-sm cs-add" (click)="startAdd()"><app-icon name="plus" />{{ 'kvkk.consent.add' | t }}</button>
      }
    }
  `,
})
export class CustomerConsentsComponent implements OnChanges {
  @Input({ required: true }) customerId!: string;
  @Input() canEdit = false;
  private api = inject(KvkkService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  items = signal<ConsentRecord[]>([]);
  busy = signal(false);
  adding = signal(false);
  purposes = CONSENT_PURPOSES;
  channels = CONSENT_CHANNELS;
  purpose = 'MARKETING_EMAIL';
  channel = 'WEB';
  textVersion = '1.0';
  evidence = '';
  confirmed = false;

  ngOnChanges() {
    this.load();
  }

  load() {
    if (!this.customerId) return;
    this.api.consents('CUSTOMER', this.customerId).subscribe({ next: (l) => this.items.set(l), error: () => this.items.set([]) });
  }

  startAdd() {
    this.confirmed = false; // never pre-ticked
    this.evidence = '';
    this.adding.set(true);
  }

  give() {
    this.busy.set(true);
    this.api.giveConsent({ subjectType: 'CUSTOMER', subjectId: this.customerId, purposeCode: this.purpose, channel: this.channel, textVersion: this.textVersion || undefined, evidence: this.evidence || undefined }).subscribe({
      next: () => {
        this.busy.set(false);
        this.adding.set(false);
        this.ui.showToast(this.i18n.t('kvkk.consent.recorded'), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('kvkk.error')), 'error');
      },
    });
  }

  withdraw(c: ConsentRecord) {
    this.busy.set(true);
    this.api.withdrawConsent(c.id, 'WEB').subscribe({
      next: () => {
        this.busy.set(false);
        this.ui.showToast(this.i18n.t('kvkk.consent.withdrawnToast'), 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('kvkk.error')), 'error');
      },
    });
  }
}
