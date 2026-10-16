import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { DocumentsService, apiError } from '../../services/documents.service';
import { UiStateService } from '../../services/ui-state.service';
import { EBelgeSettings } from '../../models/ebelge.models';
import { IconComponent } from '../shared/icon.component';

interface CredRow {
  key: string;
  value: string;
  /** list value (JSON array on the server), edited as a comma separated list */
  list?: boolean;
  /** added in this session: the field name is editable */
  custom?: boolean;
}

/**
 * Settings > e-Belge sağlayıcısı: integrator, TEST / LIVE environment, credentials (stored
 * AES-256-GCM encrypted, shown masked), sender / receiver aliases, e-Arşiv delivery, flags,
 * "Bağlantıyı test et". Signing and the legal archive are always the integrator's.
 */
@Component({
  selector: 'app-ebelge-provider-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, IconComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    :host { display: block; }
    .card-h.sh { padding-block: 12px; min-height: 56px; flex-wrap: wrap; row-gap: 8px; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .form-stack { display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .inline-form { display: flex; flex-direction: column; gap: 14px; box-shadow: inset 0 -1px 0 var(--line); }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 14px; align-items: start; }
    .stack-20 { display: flex; flex-direction: column; gap: 20px; }
    @media (max-width: 1100px) { .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .grid-4 { grid-template-columns: minmax(0, 1fr); } }
    .card-b { padding-top: 0; padding-bottom: 0; }
    .fsec:first-child { padding-top: 16px; }
    .notices { display: flex; flex-direction: column; gap: 8px; }
    .ep-creds { align-items: start; }
    .ep-cred { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 8px; align-items: center; }
    .ep-creds textarea { min-height: 56px; resize: vertical; }
    .ep-cred-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .ep-cred-foot .fld-help { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }
    .ep-logo-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 32px; }
    .ep-logo { max-height: 40px; max-width: 140px; padding: 4px; border-radius: var(--radius-sm); background: var(--white); box-shadow: 0 0 0 1px var(--ring); }
    .ep-file { font-size: var(--text-xs); color: var(--fg-3); max-width: 100%; }
    .ep-fixed { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .ep-fixed > div { display: flex; gap: 10px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .ep-fixed app-icon { color: var(--fg-3); flex: none; margin-top: 1px; }
    .ep-fixed b { display: block; font-weight: 500; }
    .ep-fixed span { font-size: var(--text-xs); color: var(--fg-3); }
    .ep-status { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; font-size: var(--text-xs); color: var(--fg-3); }
    .card-f { flex-wrap: wrap; padding-block: 6px; }
    @media (max-width: 900px) { .ep-fixed { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 640px) { .ep-cred { grid-template-columns: minmax(0, 1fr); } .ep-cred-foot .fld-help { margin-left: 0; } }
  `],
  template: `

    <section class="card">
      <div class="card-h sh">
        <div class="hg"><h3>{{ 'ebelge.provider.title' | t }}</h3><p>{{ 'ebelge.provider.subtitle' | t }}</p></div>
        @if (s(); as st) {
          @if (st.lastConnectionTestAt) {
            <span class="badge" [class.badge-success]="st.lastConnectionOk" [class.badge-danger]="!st.lastConnectionOk"><span class="dot"></span>{{ (st.lastConnectionOk ? 'ebelge.provider.testOk' : 'ebelge.provider.testFail') | t }}</span>
          }
        }
      </div>

      @if (s(); as st) {
        <div class="card-b">
          @if (mode() !== 'PROVIDER' || st.outageSince || st.credentialsError || isTestOnly(st)) {
            <div class="fsec notices">
              @if (mode() !== 'PROVIDER') { <div class="notice notice-info"><app-icon name="info" /><span class="t">{{ 'ebelge.provider.modeHint' | t }}</span></div> }
              @if (st.outageSince) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ 'ebelge.banner.outage' | t: { since: (st.outageSince | appDate: 'datetime'), message: st.lastProviderError || '-' } }}</span></div> }
              @if (st.credentialsError) { <div class="notice notice-danger" role="alert"><app-icon name="alert" /><span class="t">{{ 'ebelge.provider.credentialsError' | t }}</span></div> }
              @if (isTestOnly(st)) { <div class="notice" [class.notice-info]="environment === 'TEST'" [class.notice-danger]="environment !== 'TEST'"><app-icon [name]="environment === 'TEST' ? 'info' : 'alert'" /><span class="t">{{ 'ebelge.provider.mockTestOnly' | t }}</span></div> }
            </div>
          }

          <section class="fsec">
            <div class="fsec-h"><span class="n">1</span><h3>{{ 'ebelge.provider.integrator' | t }}</h3></div>
            <div class="grid-2">
              <div class="fld"><label class="fld-label" for="epProv">{{ 'ebelge.provider.integrator' | t }}</label>
                <div class="field select"><select id="epProv" [(ngModel)]="provider"><option value="">{{ 'ebelge.provider.none' | t }}</option>@for (p of st.providers; track p.name) { <option [value]="p.name" [disabled]="p.allowed === false && p.name !== provider">{{ p.label }}</option> }</select></div></div>
              <div class="fld"><label class="fld-label" for="epEnv">{{ 'ebelge.provider.environment' | t }}</label>
                <div class="field select"><select id="epEnv" [(ngModel)]="environment"><option value="TEST">{{ 'ebelge.provider.env.TEST' | t }}</option><option value="LIVE" [disabled]="isTestOnly(st)">{{ 'ebelge.provider.env.LIVE' | t }}</option></select></div></div>
              <div class="fld"><label class="fld-label" for="epSender">{{ 'ebelge.provider.senderAlias' | t }}</label><div class="field"><input id="epSender" class="mono" maxlength="150" [(ngModel)]="senderAlias" placeholder="urn:mail:defaultgb@..." /></div></div>
              <div class="fld"><label class="fld-label" for="epReceiver">{{ 'ebelge.provider.receiverAlias' | t }}</label><div class="field"><input id="epReceiver" class="mono" maxlength="150" [(ngModel)]="receiverAlias" placeholder="urn:mail:defaultpk@..." /></div></div>
              <div class="fld"><label class="fld-label" for="epSeal">{{ 'ebelge.provider.sealDate' | t }}</label><div class="field"><input id="epSeal" type="date" [(ngModel)]="sealDeclarationDate" /></div></div>
              <div class="fld"><label class="fld-label" for="epCh">{{ 'ebelge.provider.earsivChannel' | t }}</label>
                <div class="field select"><select id="epCh" [(ngModel)]="earsivDefaultChannel">@for (c of channels; track c) { <option [value]="c">{{ 'ebelge.channel.' + c | t }}</option> }</select></div></div>
              <div class="fld"><label class="fld-label" for="epCache">{{ 'ebelge.provider.cacheHours' | t }}</label><div class="field"><input id="epCache" type="number" min="0" max="168" class="num" [(ngModel)]="registryCacheHours" /><span class="affix suf">h</span></div></div>
              <div class="fld"><span class="fld-label">{{ 'ebelge.provider.logo' | t }}</span>
                <div class="ep-logo-row">@if (logoDataUri) { <img class="ep-logo" [src]="logoDataUri" alt="Logo" /> <button type="button" class="btn btn-ghost btn-sm" (click)="logoDataUri = null">{{ 'common.delete' | t }}</button> }
                  <input id="epLogo" class="sr-only" type="file" accept="image/png,image/jpeg,image/svg+xml" (change)="onLogo($event)" /><label class="btn btn-sm" for="epLogo"><app-icon name="upload" size="sm" />{{ 'ebelge.provider.uploadLogo' | t }}</label></div></div>
            </div>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">2</span><h3>{{ 'ebelge.provider.credentials' | t }}</h3><p>{{ 'ebelge.provider.credentialsHintShort' | t }}</p></div>
            <div class="grid-2 ep-creds">
              @for (c of creds; track $index) {
                @if (c.custom) {
                  <div class="fld span-all">
                    <div class="fld-label"><span>{{ 'ebelge.provider.customCred' | t }}</span><button type="button" class="btn btn-link btn-xs" (click)="creds.splice($index, 1)">{{ 'common.delete' | t }}</button></div>
                    <div class="ep-cred">
                      <div class="field"><input [(ngModel)]="c.key" [attr.aria-label]="'ebelge.provider.credKey' | t" [placeholder]="'ebelge.provider.credKeyPh' | t" /></div>
                      <div class="field">@if (isSecret(c.key)) { <span class="lead"><app-icon name="lock" size="sm" /></span> }<input [type]="isSecret(c.key) ? 'password' : 'text'" [(ngModel)]="c.value" [attr.aria-label]="'ebelge.provider.credValue' | t" [placeholder]="'ebelge.provider.credValue' | t" autocomplete="off" /></div>
                    </div>
                  </div>
                } @else {
                  <div class="fld" [class.span-all]="c.list">
                    <div class="fld-label"><label [for]="'epCred' + $index">{{ credLabel(c.key) }}</label><button type="button" class="btn btn-link btn-xs" (click)="creds.splice($index, 1)" [attr.aria-label]="('common.delete' | t) + ': ' + credLabel(c.key)">{{ 'common.delete' | t }}</button></div>
                    @if (c.list) {
                      <div class="field has-area"><textarea [id]="'epCred' + $index" rows="2" [(ngModel)]="c.value" autocomplete="off" [placeholder]="'ebelge.provider.listPh' | t"></textarea></div>
                      <div class="fld-help">{{ 'ebelge.provider.listHelp' | t: { n: listCount(c.value) } }}</div>
                    } @else {
                      <div class="field">@if (isSecret(c.key)) { <span class="lead"><app-icon name="lock" size="sm" /></span> }<input [id]="'epCred' + $index" [type]="isSecret(c.key) ? 'password' : 'text'" [(ngModel)]="c.value" autocomplete="off" /></div>
                      @if (isSecret(c.key)) { <div class="fld-help">{{ 'ebelge.provider.secretHelp' | t }}</div> }
                    }
                  </div>
                }
              }
            </div>
            <div class="ep-cred-foot">
              <button type="button" class="btn btn-subtle btn-sm" (click)="creds.push({ key: '', value: '', custom: true })"><app-icon name="plus" size="sm" />{{ 'ebelge.provider.addCred' | t }}</button>
              @if (st.credentialsKeyId) { <span class="fld-help"><app-icon name="lock" size="xs" />{{ 'ebelge.provider.keyIdLabel' | t: { id: st.credentialsKeyId } }}</span> }
            </div>
          </section>

          <section class="fsec">
            <div class="fsec-h"><span class="n">3</span><h3>{{ 'ebelge.provider.sendingSection' | t }}</h3></div>
            <div>
              <label class="setting-row"><span class="t"><b>{{ 'ebelge.provider.autoSend' | t }}</b>@if (!autoSend) { <span>{{ 'ebelge.provider.autoSendHint' | t }}</span> }</span><span class="switch"><input type="checkbox" role="switch" [(ngModel)]="autoSend" /><span class="track"></span></span></label>
              <label class="setting-row"><span class="t"><b>{{ 'ebelge.provider.exportEnabled' | t }}</b></span><span class="switch"><input type="checkbox" role="switch" [(ngModel)]="exportEnabled" /><span class="track"></span></span></label>
              <label class="setting-row"><span class="t"><b>{{ 'ebelge.provider.sectoral' | t }}</b></span><span class="switch"><input type="checkbox" role="switch" [(ngModel)]="sectoralItemIdsEnabled" /><span class="track"></span></span></label>
            </div>
            <div class="ep-fixed">
              <div><app-icon name="shield" size="sm" /><div><b>{{ 'ebelge.provider.signing' | t }}</b><span>{{ 'ebelge.provider.signingInfo' | t }}</span></div></div>
              <div><app-icon name="archive" size="sm" /><div><b>{{ 'ebelge.provider.legalArchive' | t }}</b><span>{{ 'ebelge.legalArchiveNote' | t }}</span></div></div>
            </div>
          </section>
        </div>

        <div class="card-f">
          <div class="ep-status">
            @if (st.lastConnectionTestAt) { <span>{{ st.lastConnectionTestAt | appDate: 'datetime' }}</span><span>·</span> }
            @if (testMessage()) { <span>{{ testMessage() }}</span><span>·</span> }
            <span>{{ 'ebelge.provider.outbox' | t: { n: st.outboxPending } }}</span>
          </div>
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="test()" [disabled]="busy() || !st.provider"><app-icon name="zap" />{{ 'ebelge.provider.test' | t }}</button>
          <button type="button" class="btn btn-primary" [class.is-loading]="busy()" (click)="save()" [disabled]="busy()"><span>{{ 'common.save' | t }}</span></button>
        </div>
      } @else {
        <div class="card-b"><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
      }
    </section>
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
    this.creds = Object.entries(s.credentials || {}).map(([key, value]) => this.toRow(key, value));
    if (!this.creds.length) this.creds = [{ key: 'apiUser', value: '' }, { key: 'apiPassword', value: '' }];
  }

  /** Server values are strings; JSON lists of plain values are edited as "a, b, c". */
  private toRow(key: string, value: unknown): CredRow {
    const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    let v: unknown = Array.isArray(value) ? value : null;
    if (v === null && /^\s*\[/.test(raw)) {
      try {
        v = JSON.parse(raw);
      } catch {
        v = null;
      }
    }
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) return { key, value: v.join(', '), list: true };
    return { key, value: raw };
  }

  credLabel(key: string): string {
    const k = 'ebelge.provider.cred.' + key;
    if (this.i18n.has(k)) return this.i18n.t(k);
    const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  listCount(v: string): number {
    return v.split(/[\s,;]+/).filter(Boolean).length;
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
    for (const c of this.creds) if (c.key.trim()) credentials[c.key.trim()] = c.list ? c.value.split(/[\s,;]+/).filter(Boolean) : this.credValue(c.value);
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
