import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { CONSENT_CHANNELS, CONSENT_PURPOSES, ConsentRecord, KvkkService } from '../../services/kvkk.service';
import { UiStateService } from '../../services/ui-state.service';
import { apiError } from '../../services/documents.service';

/**
 * Customer drawer > Rıza (KVKK md. 5/1): explicit-consent records with channel, text version and
 * evidence. Nothing is pre-ticked: the "consent obtained" box must be ticked for every new record.
 * Invoicing / despatch are not consent-based (the backend refuses them with CONSENT_NOT_REQUIRED).
 */
@Component({
  selector: 'app-customer-consents',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe],
  styles: [`
    .cs-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
    .cs-item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .cs-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .cs-sub { font-size: var(--text-xs); color: var(--color-text-muted); }
    .cs-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-3); border: 1px dashed var(--color-border); border-radius: var(--radius-md); }
    .cs-form .full { grid-column: 1 / -1; }
    .cs-note { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0 0 var(--space-2); }
    @media (max-width: 640px) { .cs-form { grid-template-columns: 1fr; } }
  `],
  template: `
    <p class="cs-note">{{ 'kvkk.consent.legalNote' | t }}</p>
    <div class="cs-list">
      @for (c of items(); track c.id) {
        <div class="cs-item">
          <div class="cs-main">
            <strong>{{ 'kvkk.consent.purpose.' + c.purposeCode | t }}</strong>
            <span class="cs-sub">{{ 'kvkk.consent.givenVia' | t: { date: (c.givenAt | appDate: 'datetime'), channel: ('kvkk.channel.' + c.channel | t) } }}@if (c.textVersion) { · v{{ c.textVersion }} }</span>
            @if (c.withdrawnAt) { <span class="cs-sub">{{ 'kvkk.consent.withdrawnAt' | t: { date: (c.withdrawnAt | appDate: 'datetime') } }}</span> }
          </div>
          @if (c.withdrawnAt) { <span class="badge badge-neutral">{{ 'kvkk.consent.withdrawn' | t }}</span> }
          @else {
            <span class="badge badge-success">{{ 'kvkk.consent.active' | t }}</span>
            @if (canEdit) { <button type="button" class="btn btn-secondary btn-sm" (click)="withdraw(c)" [disabled]="busy()">{{ 'kvkk.consent.withdraw' | t }}</button> }
          }
        </div>
      } @empty {
        <p class="cs-sub">{{ 'kvkk.consent.none' | t }}</p>
      }
    </div>
    @if (canEdit) {
      @if (adding()) {
        <div class="cs-form">
          <div class="form-field">
            <select id="csPurpose" class="form-input has-value" [(ngModel)]="purpose">
              @for (p of purposes; track p) { <option [value]="p">{{ 'kvkk.consent.purpose.' + p | t }}</option> }
            </select>
            <label for="csPurpose" class="form-label">{{ 'kvkk.consent.purposeLabel' | t }}</label>
          </div>
          <div class="form-field">
            <select id="csChannel" class="form-input has-value" [(ngModel)]="channel">
              @for (ch of channels; track ch) { <option [value]="ch">{{ 'kvkk.channel.' + ch | t }}</option> }
            </select>
            <label for="csChannel" class="form-label">{{ 'kvkk.consent.channel' | t }}</label>
          </div>
          <div class="form-field">
            <input id="csVersion" class="form-input has-value" [(ngModel)]="textVersion" />
            <label for="csVersion" class="form-label">{{ 'kvkk.consent.textVersion' | t }}</label>
          </div>
          <div class="form-field">
            <input id="csEvidence" class="form-input" [class.has-value]="!!evidence" [(ngModel)]="evidence" />
            <label for="csEvidence" class="form-label">{{ 'kvkk.consent.evidence' | t }}</label>
          </div>
          <label class="full check-row"><input type="checkbox" [(ngModel)]="confirmed" /> {{ 'kvkk.consent.confirm' | t }}</label>
          <div class="full" style="display:flex; gap: var(--space-2); justify-content: flex-end">
            <button type="button" class="btn btn-secondary btn-sm" (click)="adding.set(false)">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-primary btn-sm" [disabled]="!confirmed || busy()" (click)="give()">{{ 'kvkk.consent.record' | t }}</button>
          </div>
        </div>
      } @else {
        <button type="button" class="btn btn-secondary btn-sm" (click)="startAdd()">{{ 'kvkk.consent.add' | t }}</button>
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
