import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { EBelgeSettings } from '../../models/ebelge.models';

interface CredRow {
  key: string;
  value: string;
}

/**
 * Settings > e-Belge sağlayıcısı: integrator, TEST / LIVE environment, credentials (stored
 * AES-256-GCM encrypted, shown masked), sender / receiver aliases, e-Arşiv delivery, flags,
 * "Bağlantıyı test et". Signing and the legal archive are always the integrator's.
 */
@Component({
  selector: 'app-ebelge-provider-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    .ep-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2) var(--space-4); }
    .ep-creds { display: flex; flex-direction: column; gap: var(--space-2); }
    .ep-cred { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr) auto; gap: var(--space-2); align-items: center; }
    .ep-flags { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2) var(--space-4); margin-top: var(--space-3); }
    .ep-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-6); padding-top: var(--space-4); border-top: var(--border-width) solid var(--color-border-subtle); flex-wrap: wrap; }
    .ep-status { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; font-size: var(--text-sm); margin-top: var(--space-3); }
    .ep-logo { max-height: 56px; max-width: 160px; border: var(--border-width) solid var(--color-border); border-radius: var(--radius-sm); background: #fff; padding: 4px; }
    .ep-fixed { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
    .ep-fixed > div { padding: var(--space-3); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-subtle); font-size: var(--text-sm); }
    @media (max-width: 900px) { .ep-grid, .ep-flags, .ep-fixed { grid-template-columns: 1fr; } .ep-cred { grid-template-columns: 1fr 1fr auto; } }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'ebelge.provider.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'ebelge.provider.subtitle' | t }}</p>

      @if (s(); as st) {
        @if (mode() !== 'PROVIDER') { <div class="doc-alert info">{{ 'ebelge.provider.modeHint' | t }}</div> }
        @if (st.outageSince) { <div class="doc-alert danger">{{ 'ebelge.banner.outage' | t: { since: (st.outageSince | appDate: 'datetime'), message: st.lastProviderError || '-' } }}</div> }
        @if (st.credentialsError) { <div class="doc-alert danger">{{ 'ebelge.provider.credentialsError' | t }}</div> }

        @if (isTestOnly(st)) { <div class="doc-alert" [class.info]="environment === 'TEST'" [class.danger]="environment !== 'TEST'">{{ 'ebelge.provider.mockTestOnly' | t }}</div> }
        <div class="ep-grid">
          <div class="doc-field"><label for="epProv">{{ 'ebelge.provider.integrator' | t }}</label>
            <select id="epProv" class="select" [(ngModel)]="provider"><option value="">{{ 'ebelge.provider.none' | t }}</option>@for (p of st.providers; track p.name) { <option [value]="p.name" [disabled]="p.allowed === false && p.name !== provider">{{ p.label }}</option> }</select></div>
          <div class="doc-field"><label for="epEnv">{{ 'ebelge.provider.environment' | t }}</label>
            <select id="epEnv" class="select" [(ngModel)]="environment"><option value="TEST">{{ 'ebelge.provider.env.TEST' | t }}</option><option value="LIVE" [disabled]="isTestOnly(st)">{{ 'ebelge.provider.env.LIVE' | t }}</option></select></div>
          <div class="doc-field"><label for="epSender">{{ 'ebelge.provider.senderAlias' | t }}</label><input id="epSender" class="input mono" maxlength="150" [(ngModel)]="senderAlias" placeholder="urn:mail:defaultgb@..." /></div>
          <div class="doc-field"><label for="epReceiver">{{ 'ebelge.provider.receiverAlias' | t }}</label><input id="epReceiver" class="input mono" maxlength="150" [(ngModel)]="receiverAlias" placeholder="urn:mail:defaultpk@..." /></div>
          <div class="doc-field"><label for="epSeal">{{ 'ebelge.provider.sealDate' | t }}</label><input id="epSeal" type="date" class="input" [(ngModel)]="sealDeclarationDate" /></div>
          <div class="doc-field"><label for="epCh">{{ 'ebelge.provider.earsivChannel' | t }}</label>
            <select id="epCh" class="select" [(ngModel)]="earsivDefaultChannel">@for (c of channels; track c) { <option [value]="c">{{ 'ebelge.channel.' + c | t }}</option> }</select></div>
          <div class="doc-field"><label for="epCache">{{ 'ebelge.provider.cacheHours' | t }}</label><input id="epCache" type="number" min="0" max="168" class="input" [(ngModel)]="registryCacheHours" /></div>
          <div class="doc-field"><label>{{ 'ebelge.provider.logo' | t }}</label>
            <div class="cluster">@if (logoDataUri) { <img class="ep-logo" [src]="logoDataUri" alt="Logo" /> <button class="link-btn" (click)="logoDataUri = null">{{ 'common.delete' | t }}</button> }
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" (change)="onLogo($event)" [attr.aria-label]="'ebelge.provider.logo' | t" /></div></div>
        </div>

        <div class="doc-section">
          <h4 class="doc-section-title">{{ 'ebelge.provider.credentials' | t }} @if (st.credentialsKeyId) { <span class="badge badge-neutral">{{ 'ebelge.provider.keyId' | t: { id: st.credentialsKeyId } }}</span> }</h4>
          <p class="doc-hint">{{ 'ebelge.provider.credentialsHint' | t }}</p>
          <div class="ep-creds">
            @for (c of creds; track $index) {
              <div class="ep-cred">
                <input class="input mono" [(ngModel)]="c.key" [attr.aria-label]="'ebelge.provider.credKey' | t" [placeholder]="'ebelge.provider.credKey' | t" />
                <input class="input mono" [type]="isSecret(c.key) ? 'password' : 'text'" [(ngModel)]="c.value" [attr.aria-label]="'ebelge.provider.credValue' | t" [placeholder]="'ebelge.provider.credValue' | t" autocomplete="off" />
                <button class="icon-btn" (click)="creds.splice($index, 1)" [attr.aria-label]="'common.delete' | t">✕</button>
              </div>
            }
            <div><button class="btn btn-secondary btn-sm" (click)="creds.push({ key: '', value: '' })">{{ 'ebelge.provider.addCred' | t }}</button></div>
          </div>
        </div>

        <div class="ep-flags">
          <label class="doc-check"><input type="checkbox" [(ngModel)]="autoSend" /> {{ 'ebelge.provider.autoSend' | t }}</label>
          <label class="doc-check"><input type="checkbox" [(ngModel)]="exportEnabled" /> {{ 'ebelge.provider.exportEnabled' | t }}</label>
          <label class="doc-check"><input type="checkbox" [(ngModel)]="sectoralItemIdsEnabled" /> {{ 'ebelge.provider.sectoral' | t }}</label>
        </div>
        @if (!autoSend) { <p class="doc-hint">{{ 'ebelge.provider.autoSendHint' | t }}</p> }

        <div class="ep-fixed">
          <div><strong>{{ 'ebelge.provider.signing' | t }}</strong><div class="doc-hint">{{ 'ebelge.provider.signingInfo' | t }}</div></div>
          <div><strong>{{ 'ebelge.provider.legalArchive' | t }}</strong><div class="doc-hint">{{ 'ebelge.legalArchiveNote' | t }}</div></div>
        </div>

        <div class="ep-status">
          @if (st.lastConnectionTestAt) {
            <span class="badge" [class.badge-success]="st.lastConnectionOk" [class.badge-danger]="!st.lastConnectionOk">{{ (st.lastConnectionOk ? 'ebelge.provider.testOk' : 'ebelge.provider.testFail') | t }}</span>
            <span class="doc-hint">{{ st.lastConnectionTestAt | appDate: 'datetime' }}</span>
          }
          @if (testMessage()) { <span class="doc-hint">{{ testMessage() }}</span> }
          <span class="doc-hint">{{ 'ebelge.provider.outbox' | t: { n: st.outboxPending } }}</span>
        </div>

        <div class="ep-actions">
          <button class="btn btn-secondary" (click)="test()" [disabled]="busy() || !st.provider">{{ 'ebelge.provider.test' | t }}</button>
          <button class="btn btn-primary" (click)="save()" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </div>
      }
    </div>
  `,
})
export class EBelgeProviderSettingsComponent implements OnInit {
  private api = inject(EBelgeService);
  private docs = inject(DocumentsService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  s = signal<EBelgeSettings | null>(null);
  mode = signal('NONE');
  busy = signal(false);
  testMessage = signal<string | null>(null);
  channels = ['EMAIL', 'SMS', 'PAPER', 'PORTAL'];

  provider = '';
  environment = 'TEST';
  senderAlias = '';
  receiverAlias = '';
  sealDeclarationDate = '';
  earsivDefaultChannel = 'EMAIL';
  registryCacheHours = 24;
  autoSend = true;

  /** The selected integrator is a simulator (mock): LIVE is not allowed. */
  isTestOnly(st: EBelgeSettings): boolean {
    return !!st.providers.find((p) => p.name === this.provider)?.testOnly;
  }
  exportEnabled = false;
  sectoralItemIdsEnabled = false;
  logoDataUri: string | null = null;
  creds: CredRow[] = [];

  ngOnInit() {
    this.docs.company().subscribe({ next: (c) => this.mode.set(c.eDocumentMode || 'NONE'), error: () => undefined });
    this.load();
  }

  load() {
    this.api.settings().subscribe({ next: (s) => this.apply(s), error: (e) => this.ui.showToast(apiError(e, this.i18n.t('documents.loadError')), 'error') });
  }

  private apply(s: EBelgeSettings) {
    this.s.set(s);
    this.provider = s.provider || '';
    this.environment = s.environment;
    this.senderAlias = s.senderAlias || '';
    this.receiverAlias = s.receiverAlias || '';
    this.sealDeclarationDate = s.sealDeclarationDate || '';
    this.earsivDefaultChannel = s.earsivDefaultChannel;
    this.registryCacheHours = s.registryCacheHours;
    this.autoSend = s.autoSend;
    this.exportEnabled = s.exportEnabled;
    this.sectoralItemIdsEnabled = s.sectoralItemIdsEnabled;
    this.logoDataUri = s.logoDataUri;
    this.creds = Object.entries(s.credentials || {}).map(([key, value]) => ({ key, value }));
    if (!this.creds.length) this.creds = [{ key: 'apiUser', value: '' }, { key: 'apiPassword', value: '' }];
  }

  isSecret(k: string): boolean {
    return /pass|secret|token|key/i.test(k);
  }

  onLogo(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > 200 * 1024) return this.ui.showToast(this.i18n.t('ebelge.provider.logoTooLarge'), 'error');
    const r = new FileReader();
    r.onload = () => (this.logoDataUri = String(r.result));
    r.readAsDataURL(f);
  }

  /** List values (e.g. registeredInvoiceTaxIds of the mock) may be written comma separated or as JSON. */
  private credValue(v: string): unknown {
    const t = v.trim();
    if (/^[[{]/.test(t)) {
      try {
        return JSON.parse(t);
      } catch {
        return v;
      }
    }
    if (/^\d{10,11}(\s*,\s*\d{10,11})+$/.test(t)) return t.split(',').map((x) => x.trim());
    return v;
  }

  save() {
    const credentials: Record<string, unknown> = {};
    for (const c of this.creds) if (c.key.trim()) credentials[c.key.trim()] = this.credValue(c.value);
    this.busy.set(true);
    this.api
      .saveSettings({
        provider: this.provider || null,
        environment: this.environment,
        credentials,
        senderAlias: this.senderAlias || null,
        receiverAlias: this.receiverAlias || null,
        sealDeclarationDate: this.sealDeclarationDate || null,
        earsivDefaultChannel: this.earsivDefaultChannel,
        registryCacheHours: Number(this.registryCacheHours) || 0,
        autoSend: this.autoSend,
        exportEnabled: this.exportEnabled,
        sectoralItemIdsEnabled: this.sectoralItemIdsEnabled,
        logoDataUri: this.logoDataUri,
      })
      .subscribe({
        next: (s) => {
          this.busy.set(false);
          this.apply(s);
          this.ui.showToast(this.i18n.t('ebelge.toast.saved'), 'success');
        },
        error: (e) => {
          this.busy.set(false);
          this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
        },
      });
  }

  test() {
    this.busy.set(true);
    this.testMessage.set(null);
    this.api.testConnection().subscribe({
      next: (r) => {
        this.busy.set(false);
        this.testMessage.set(r.message);
        this.ui.showToast(this.i18n.t(r.ok ? 'ebelge.provider.testOk' : 'ebelge.provider.testFail'), r.ok ? 'success' : 'error');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.ui.showToast(apiError(e, this.i18n.t('documents.actionError')), 'error');
      },
    });
  }
}
