import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { LegalParameter } from '../../models/inventory.models';
import { AppDatePipe, I18nService, TranslatePipe } from '../../i18n';

/** Settings > Legal parameters (platform super admin): versioned thresholds with legal source. */
@Component({
  selector: 'app-legal-parameters',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, AppDatePipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .lp-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5); }
    .lp-wide { grid-column: span 3; }
    .lp-actions { grid-column: span 3; display: flex; justify-content: flex-end; }
    .lp-value { font-family: var(--font-mono); font-size: var(--text-xs); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lp-source { font-size: var(--text-xs); color: var(--color-text-muted); max-width: 320px; }
    .lp-filter { max-width: 280px; margin-bottom: var(--space-3); }
    @media (max-width: 900px) { .lp-form { grid-template-columns: 1fr; } .lp-wide, .lp-actions { grid-column: auto; } }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'settings.legalParams.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'settings.legalParams.subtitle' | t }}</p>

      <form class="lp-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="form-field">
          <input id="lpKey" type="text" list="lpKeys" formControlName="key" class="form-input mono" />
          <datalist id="lpKeys">@for (k of keys(); track k) { <option [value]="k"></option> }</datalist>
          <label for="lpKey" class="form-label">{{ 'settings.legalParams.key' | t }}</label>
        </div>
        <div class="form-field">
          <input id="lpFrom" type="date" formControlName="validFrom" class="form-input" />
          <label for="lpFrom" class="form-label">{{ 'settings.legalParams.validFrom' | t }}</label>
        </div>
        <div class="form-field">
          <input id="lpTo" type="date" formControlName="validTo" class="form-input" />
          <label for="lpTo" class="form-label">{{ 'settings.legalParams.validTo' | t }}</label>
        </div>
        <div class="form-field">
          <input id="lpValue" type="text" formControlName="value" class="form-input mono" placeholder="15000" />
          <label for="lpValue" class="form-label">{{ 'settings.legalParams.value' | t }}</label>
          @if (valueError()) { <div class="form-error">{{ 'settings.legalParams.valueInvalid' | t }}</div> }
        </div>
        <div class="form-field">
          <select id="lpConf" formControlName="confidence" class="form-input has-value">
            @for (c of ['high', 'medium', 'low']; track c) { <option [value]="c">{{ 'settings.legalParams.confidence.' + c | t }}</option> }
          </select>
          <label for="lpConf" class="form-label">{{ 'settings.legalParams.confidenceLabel' | t }}</label>
        </div>
        <div class="form-field">
          <input id="lpNote" type="text" formControlName="note" class="form-input" maxlength="500" />
          <label for="lpNote" class="form-label">{{ 'settings.legalParams.note' | t }}</label>
        </div>
        <div class="form-field lp-wide">
          <input id="lpSource" type="text" formControlName="sourceRef" class="form-input" maxlength="255" [placeholder]="'settings.legalParams.sourcePh' | t" />
          <label for="lpSource" class="form-label">{{ 'settings.legalParams.sourceRef' | t }}</label>
        </div>
        <div class="lp-actions">
          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving()">{{ 'settings.legalParams.add' | t }}</button>
        </div>
      </form>

      <input type="search" class="form-input lp-filter" [placeholder]="'common.search' | t" [value]="filter()" (input)="filter.set($any($event.target).value)" />
      <div class="table-scroll settings-table">
        <table class="table-responsive">
          <thead>
            <tr>
              <th>{{ 'settings.legalParams.key' | t }}</th>
              <th>{{ 'settings.legalParams.validFrom' | t }}</th>
              <th>{{ 'settings.legalParams.validTo' | t }}</th>
              <th>{{ 'settings.legalParams.value' | t }}</th>
              <th>{{ 'settings.legalParams.sourceRef' | t }}</th>
              <th>{{ 'settings.legalParams.confidenceLabel' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr>
                <td class="mono" [attr.data-label]="'settings.legalParams.key' | t">{{ p.key }}</td>
                <td [attr.data-label]="'settings.legalParams.validFrom' | t">{{ p.validFrom | appDate }}</td>
                <td [attr.data-label]="'settings.legalParams.validTo' | t">{{ p.validTo ? (p.validTo | appDate) : ('settings.legalParams.openEnded' | t) }}</td>
                <td [attr.data-label]="'settings.legalParams.value' | t"><div class="lp-value" [title]="json(p.value)">{{ json(p.value) }}</div></td>
                <td [attr.data-label]="'settings.legalParams.sourceRef' | t"><div class="lp-source">{{ p.sourceRef }}@if (p.note) { <br />{{ p.note }} }</div></td>
                <td [attr.data-label]="'settings.legalParams.confidenceLabel' | t">
                  <span class="badge" [class.badge-success]="p.confidence === 'high'" [class.badge-warning]="p.confidence === 'medium'" [class.badge-danger]="p.confidence === 'low'">{{ 'settings.legalParams.confidence.' + p.confidence | t }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
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
