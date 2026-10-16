import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { LegalParameter } from '../../models/inventory.models';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';
import { IconComponent } from '../shared/icon.component';

/** Settings > Legal parameters (platform super admin): versioned thresholds with legal source. */
@Component({
  selector: 'app-legal-parameters',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, AppDatePipe, IconComponent],
  styleUrls: ['../../drawer.css'],
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
    .lp-wide { grid-column: span 2; }
    .lp-tbl td { vertical-align: top; padding-top: 9px; padding-bottom: 9px; height: auto; line-height: 18px; }
    .lp-p { min-width: 0; white-space: normal; }
    .lp-p b { font-weight: 500; }
    .lp-p .cell-code { margin-left: 6px; white-space: nowrap; }
    .lp-src { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin-top: 2px; font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .lp-value { display: block; max-width: 220px; white-space: normal; overflow-wrap: anywhere; }
    .lp-nw { white-space: nowrap; }
    .w-val { width: 200px; }
    .w-valid { width: 1%; }
    .w-conf { width: 1%; }
    .toolbar { padding: 10px 16px; box-shadow: inset 0 -1px 0 var(--line); }
    .toolbar .field { width: 280px; max-width: 100%; }
    @media (max-width: 640px) { .lp-wide { grid-column: auto; } .toolbar .field { width: 100%; flex: 1; } }
  `],
  template: `

    <section class="card">
      <div class="card-h sh">
        <div class="hg"><h3>{{ 'settings.legalParams.title' | t }}</h3><p>{{ 'settings.legalParams.subtitle' | t }}</p></div>
      </div>

      <form class="card-b inline-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="grid-4">
          <div class="fld">
            <label class="fld-label" for="lpKey">{{ 'settings.legalParams.key' | t }}</label>
            <div class="field"><input id="lpKey" type="text" list="lpKeys" formControlName="key" class="mono" /></div>
            <datalist id="lpKeys">@for (k of keys(); track k) { <option [value]="k"></option> }</datalist>
          </div>
          <div class="fld">
            <label class="fld-label" for="lpFrom">{{ 'settings.legalParams.validFrom' | t }}</label>
            <div class="field"><input id="lpFrom" type="date" formControlName="validFrom" /></div>
          </div>
          <div class="fld">
            <label class="fld-label" for="lpTo">{{ 'settings.legalParams.validTo' | t }}</label>
            <div class="field"><input id="lpTo" type="date" formControlName="validTo" /></div>
          </div>
          <div class="fld">
            <label class="fld-label" for="lpValue">{{ 'settings.legalParams.value' | t }}</label>
            <div class="field" [class.is-error]="valueError()"><input id="lpValue" type="text" formControlName="value" class="mono" placeholder="15000" /></div>
            @if (valueError()) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.legalParams.valueInvalid' | t }}</div> }
          </div>
          <div class="fld">
            <label class="fld-label" for="lpConf">{{ 'settings.legalParams.confidenceLabel' | t }}</label>
            <div class="field select"><select id="lpConf" formControlName="confidence">
              @for (c of ['high', 'medium', 'low']; track c) { <option [value]="c">{{ 'settings.legalParams.confidence.' + c | t }}</option> }
            </select></div>
          </div>
          <div class="fld">
            <label class="fld-label" for="lpNote">{{ 'settings.legalParams.note' | t }}</label>
            <div class="field"><input id="lpNote" type="text" formControlName="note" maxlength="500" /></div>
          </div>
          <div class="fld lp-wide">
            <label class="fld-label" for="lpSource">{{ 'settings.legalParams.sourceRef' | t }}</label>
            <div class="field"><input id="lpSource" type="text" formControlName="sourceRef" maxlength="255" [placeholder]="'settings.legalParams.sourcePh' | t" /></div>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="form.invalid || saving()"><app-icon name="plus" /><span>{{ 'settings.legalParams.add' | t }}</span></button>
        </div>
      </form>

      <div class="toolbar">
        <div class="field field-sm">
          <span class="lead"><app-icon name="search" size="sm" /></span>
          <input type="search" data-page-search [placeholder]="'common.search' | t" [value]="filter()" (input)="filter.set($any($event.target).value)" />
          <span class="trail"><kbd>/</kbd></span>
        </div>
        <span class="spacer"></span>
        <span class="tag">{{ filtered().length }}</span>
      </div>
      <div class="table-scroll">
        <table class="tbl table-responsive lp-tbl">
          <thead>
            <tr>
              <th>{{ 'settings.legalParams.parameter' | t }}</th>
              <th class="w-val">{{ 'settings.legalParams.value' | t }}</th>
              <th class="w-valid">{{ 'settings.legalParams.validity' | t }}</th>
              <th class="w-conf">{{ 'settings.legalParams.confidenceLabel' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr>
                <td class="td-primary lp-p">
                  <b>{{ label(p.key) }}</b><span class="cell-code">{{ p.key }}</span>
                  <span class="lp-src" [attr.title]="p.sourceRef + (p.note ? ' · ' + p.note : '')">{{ p.sourceRef }}@if (p.note) { · {{ p.note }} }</span>
                </td>
                <td [attr.data-label]="'settings.legalParams.value' | t"><span class="lp-value" [attr.title]="json(p.value)">{{ display(p.value) }}</span></td>
                <td class="lp-nw" [attr.data-label]="'settings.legalParams.validity' | t">{{ p.validFrom | appDate }} – @if (p.validTo) { {{ p.validTo | appDate }} } @else { <span class="text-muted">{{ 'settings.legalParams.openEnded' | t }}</span> }</td>
                <td class="lp-nw" [attr.data-label]="'settings.legalParams.confidenceLabel' | t">
                  <span class="badge" [class.badge-success]="p.confidence === 'high'" [class.badge-warning]="p.confidence === 'medium'" [class.badge-danger]="p.confidence === 'low'"><span class="dot"></span>{{ 'settings.legalParams.confidence.' + p.confidence | t }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class LegalParametersComponent implements OnInit {
  private api = inject(ComplianceService);
  private fb = inject(FormBuilder);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  params = signal<LegalParameter[]>([]);
  filter = signal('');
  saving = signal(false);
  valueError = signal(false);
  keys = computed(() => [...new Set(this.params().map((p) => p.key))].sort());
  filtered = computed(() => {
    const q = this.filter().trim().toUpperCase();
    return q ? this.params().filter((p) => p.key.includes(q) || p.sourceRef.toUpperCase().includes(q)) : this.params();
  });

  form: FormGroup = this.fb.group({
    key: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_]{2,64}$/)]],
    validFrom: ['', Validators.required],
    validTo: [''],
    value: ['', Validators.required],
    sourceRef: ['', [Validators.required, Validators.maxLength(255)]],
    confidence: ['high'],
    note: [''],
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.listLegalParameters().subscribe({ next: (l) => this.params.set(l), error: (err) => this.ui.showToast(err.error?.message || this.i18n.t('common.unknownError'), 'error') });
  }

  json(v: unknown): string {
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  /** Readable name for a parameter key (dictionary label, else the key in sentence case). */
  label(key: string): string {
    const k = 'settings.legalParams.label.' + key;
    if (this.i18n.has(k)) return this.i18n.t(k);
    const s = key.toLowerCase().replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Human-readable value: numbers / dates localised, small objects as "a: 1 · b: 2", lists joined or counted. */
  display(v: unknown): string {
    const scalar = (x: unknown): string | null => {
      if (x === null || x === undefined) return '—';
      if (typeof x === 'number') return this.i18n.formatNumber(x);
      if (typeof x === 'boolean') return this.i18n.t(x ? 'common.yes' : 'common.no');
      if (typeof x === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(x) ? this.i18n.formatDate(x) : x;
      return null;
    };
    const s = scalar(v);
    if (s !== null) return s;
    if (Array.isArray(v)) {
      if (!v.length) return this.i18n.t('settings.legalParams.emptyList');
      const parts = v.map(scalar);
      return parts.every((x) => x !== null) && v.length <= 6 ? parts.join(', ') : this.i18n.t('settings.legalParams.items', { n: v.length });
    }
    const entries = Object.entries(v as Record<string, unknown>);
    const parts = entries.map(([k, x]) => [k, scalar(x)] as const);
    return parts.every(([, x]) => x !== null) && entries.length <= 4 ? parts.map(([k, x]) => `${k}: ${x}`).join(' · ') : this.i18n.t('settings.legalParams.items', { n: entries.length });
  }

  /** Numbers / JSON are parsed; anything else is stored as a string. */
  private parseValue(raw: string): unknown {
    const t = raw.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^[[{"]/.test(t)) return JSON.parse(t);
    return t;
  }

  save() {
    const v = this.form.value;
    let value: unknown;
    try {
      value = this.parseValue(String(v.value));
      this.valueError.set(false);
    } catch {
      this.valueError.set(true);
      return;
    }
    this.saving.set(true);
    this.api
      .createLegalParameter({ key: String(v.key).toUpperCase(), validFrom: v.validFrom, validTo: v.validTo || null, value, sourceRef: v.sourceRef, confidence: v.confidence, note: v.note || null })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset({ key: '', validFrom: '', validTo: '', value: '', sourceRef: '', confidence: 'high', note: '' });
          this.load();
          this.api.loadCompliance().subscribe({ error: () => undefined });
          this.ui.showToast(this.i18n.t('settings.legalParams.saved'), 'success');
        },
        error: (err) => {
          this.saving.set(false);
          this.ui.showToast(err.error?.message || this.i18n.t('common.unknownError'), 'error');
        },
      });
  }
}
