import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CORPORATE_EVENT_TYPES, SectorRule } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { CorporateEvent, EBelgeProfile, GrossSales, ObligationReport, ObligationResult, SectorFlag } from '../../models/inventory.models';
import { AppDatePipe, I18nService, MoneyPipe, TranslatePipe } from '../../i18n';
import { ComplianceBannersComponent } from '../shared/compliance-banners.component';

/** Settings > e-Belge compliance: turnover declaration, sector flags, computed start dates and countdown. */
@Component({
  selector: 'app-ebelge-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe, AppDatePipe, MoneyPipe, ComplianceBannersComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    app-compliance-banners { margin-top: var(--space-4); }
    .eb-row > *, .eb-row-event > *, .eb-flag > * { order: 0; }
    .eb-grid { margin-top: var(--space-4); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
    .eb-tile { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-4); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
    .eb-tile-title { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text); display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
    .eb-date { font-size: var(--text-lg); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; color: var(--color-text); }
    .eb-meta { font-size: var(--text-xs); color: var(--color-text-muted); }
    .eb-paper { margin-top: var(--space-3); font-size: var(--text-sm); color: var(--color-text-secondary); }
    .eb-section { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-6); }
    .eb-rows { display: flex; flex-direction: column; gap: var(--space-2); }
    .eb-row { display: grid; grid-template-columns: 120px minmax(0, 260px) auto; justify-content: start; gap: var(--space-2); align-items: center; }
    .eb-row-wide { display: grid; grid-template-columns: minmax(0, 1fr) 160px auto; gap: var(--space-2); align-items: center; }
    .eb-row-event { display: grid; grid-template-columns: 160px 160px minmax(0, 1fr) auto auto; gap: var(--space-2); align-items: center; }
    .eb-flags { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2) var(--space-4); }
    .eb-flag { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
    .eb-flag input[type='date'] { margin-left: auto; width: 150px; height: 30px; }
    .eb-dates { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
    .eb-actions { display: flex; justify-content: flex-end; margin-top: var(--space-6); padding-top: var(--space-4); border-top: var(--border-width) solid var(--color-border-subtle); }
    .eb-sources { margin-top: var(--space-4); font-size: var(--text-xs); color: var(--color-text-muted); }
    .eb-sources summary { cursor: pointer; }
    .eb-sources li { margin: 2px 0; }
    .eb-inline { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); white-space: nowrap; }
    @media (max-width: 900px) { .eb-grid, .eb-dates, .eb-flags { grid-template-columns: 1fr; } .eb-row-event { grid-template-columns: 1fr 1fr; } }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'settings.ebelge.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'settings.ebelge.subtitle' | t }}</p>

      <app-compliance-banners [showAll]="true"></app-compliance-banners>

      @if (report(); as r) {
        <div class="eb-grid">
          @for (o of [r.eFatura, r.eArsiv, r.eIrsaliye]; track o.kind) {
            <div class="eb-tile">
              <div class="eb-tile-title">
                {{ 'settings.ebelge.kind.' + o.kind | t }}
                <span class="badge" [class]="badgeClass(o)">{{ 'settings.ebelge.status.' + o.status | t }}</span>
              </div>
              <span class="eb-meta">{{ 'settings.ebelge.obligationStart' | t }}</span>
              <span class="eb-date">{{ o.mandatoryFrom ? (o.mandatoryFrom | appDate) : '—' }}</span>
              @if (o.mandatoryFrom && o.daysLeft !== null && o.daysLeft > 0) { <span class="eb-meta">{{ 'settings.ebelge.daysLeft' | t: { n: o.daysLeft } }}</span> }
              @if (o.reason) { <span class="eb-meta">{{ reasonLabel(o.reason) }}</span> }
              @if (o.activeSince) { <span class="eb-meta">{{ 'settings.ebelge.activeSince' | t }}: {{ o.activeSince | appDate }}</span> }
              @if (o.toleranceUntil && o.status !== 'active') { <span class="eb-meta">{{ 'settings.ebelge.tolerance' | t }}: {{ o.toleranceUntil | appDate }}</span> }
            </div>
          }
        </div>
        <p class="eb-paper">
          @if (r.paperInvoice.allowed) {
            {{ 'settings.ebelge.paperAllowed' | t: { date: r.paperInvoice.until ? (r.paperInvoice.until | appDate) : '—' } }}
            @if (r.paperInvoice.limit) { {{ 'settings.ebelge.paperLimit' | t: { amount: (r.paperInvoice.limit | money: 'TRY') } }} }
          } @else {
            {{ 'settings.ebelge.paperNotAllowed' | t }}
          }
        </p>
      }

      <div class="eb-section">
        <div class="form-section-title">{{ 'settings.ebelge.grossSales' | t }}</div>
        <p class="field-hint">{{ 'settings.ebelge.grossSalesHint' | t }}</p>
        <div class="eb-rows">
          @for (row of sales(); track $index; let i = $index) {
            <div class="eb-row">
              <input type="number" class="form-input" min="2000" max="2100" [ngModel]="row.year" (ngModelChange)="updateSale(i, 'year', $event)" [attr.aria-label]="'settings.ebelge.year' | t" />
              <input type="number" class="form-input" min="0" step="1000" [ngModel]="row.amount" (ngModelChange)="updateSale(i, 'amount', $event)" [attr.aria-label]="'settings.ebelge.amount' | t" />
              <button type="button" class="btn btn-ghost btn-sm" (click)="removeSale(i)">{{ 'common.delete' | t }}</button>
            </div>
          }
          <div><button type="button" class="btn btn-secondary btn-sm" (click)="addSale()">{{ 'settings.ebelge.addYear' | t }}</button></div>
        </div>
      </div>

      <div class="eb-section">
        <div class="form-section-title">{{ 'settings.ebelge.sectorEFatura' | t }}</div>
        <div class="eb-flags">
          @for (rule of eFaturaFlags(); track rule.code) {
            <label class="eb-flag" [title]="rule.ref || ''">
              <input type="checkbox" [checked]="hasFlag('e', rule.code)" (change)="toggleFlag('e', rule.code, $any($event.target).checked)" />
              <span>{{ sectorLabel(rule.code) }}@if (rule.thresholds?.length) { <span class="eb-meta"> · {{ 'settings.ebelge.sectorThreshold' | t }}</span> }</span>
              @if (hasFlag('e', rule.code)) { <input type="date" class="form-input" [ngModel]="flagSince('e', rule.code)" (ngModelChange)="setFlagSince('e', rule.code, $event)" /> }
            </label>
          }
        </div>
        <div class="form-section-title">{{ 'settings.ebelge.sectorEIrsaliye' | t }}</div>
        <div class="eb-flags">
          @for (rule of eIrsaliyeFlags(); track rule.code) {
            <label class="eb-flag" [title]="rule.ref || ''">
              <input type="checkbox" [checked]="hasFlag('i', rule.code)" (change)="toggleFlag('i', rule.code, $any($event.target).checked)" />
              <span>{{ sectorLabel(rule.code) }}@if (rule.thresholds?.length) { <span class="eb-meta"> · {{ 'settings.ebelge.sectorThreshold' | t }}</span> }</span>
              @if (hasFlag('i', rule.code)) { <input type="date" class="form-input" [ngModel]="flagSince('i', rule.code)" (ngModelChange)="setFlagSince('i', rule.code, $event)" /> }
            </label>
          }
        </div>
      </div>

      <div class="eb-section">
        <div class="form-section-title">{{ 'settings.ebelge.actualUse' | t }}</div>
        <div class="eb-dates">
          <div class="form-field">
            <input id="ebEf" type="date" class="form-input" [(ngModel)]="profile.eFaturaSince" />
            <label for="ebEf" class="form-label">{{ 'settings.ebelge.since.eFatura' | t }}</label>
          </div>
          <div class="form-field">
            <input id="ebEa" type="date" class="form-input" [(ngModel)]="profile.eArsivSince" />
            <label for="ebEa" class="form-label">{{ 'settings.ebelge.since.eArsiv' | t }}</label>
          </div>
          <div class="form-field">
            <input id="ebEi" type="date" class="form-input" [(ngModel)]="profile.eIrsaliyeSince" />
            <label for="ebEi" class="form-label">{{ 'settings.ebelge.since.eIrsaliye' | t }}</label>
          </div>
        </div>
        <div class="eb-dates">
          <div class="form-field">
            <select id="ebMv" class="form-input has-value" [(ngModel)]="profile.mandatoryVsVoluntary">
              <option [ngValue]="null">—</option>
              <option value="MANDATORY">{{ 'settings.ebelge.mandatory' | t }}</option>
              <option value="VOLUNTARY">{{ 'settings.ebelge.voluntary' | t }}</option>
            </select>
            <label for="ebMv" class="form-label">{{ 'settings.ebelge.mandatoryVsVoluntary' | t }}</label>
          </div>
          <div class="form-field">
            <input id="ebGib" type="date" class="form-input" [(ngModel)]="profile.gibWrittenNoticeDate" />
            <label for="ebGib" class="form-label">{{ 'settings.ebelge.gibNotice' | t }}</label>
          </div>
        </div>
      </div>

      <div class="eb-section">
        <div class="form-section-title">{{ 'settings.ebelge.events' | t }}</div>
        <p class="field-hint">{{ 'settings.ebelge.eventsHint' | t }}</p>
        <div class="eb-rows">
          @for (ev of events(); track $index; let i = $index) {
            <div class="eb-row-event">
              <select class="form-input has-value" [ngModel]="ev.type" (ngModelChange)="updateEvent(i, 'type', $event)">
                @for (t of eventTypes; track t) { <option [value]="t">{{ 'settings.ebelge.event.' + t | t }}</option> }
              </select>
              <input type="date" class="form-input" [ngModel]="ev.date" (ngModelChange)="updateEvent(i, 'date', $event)" />
              <input type="text" class="form-input" [ngModel]="ev.note" (ngModelChange)="updateEvent(i, 'note', $event)" [placeholder]="'settings.ebelge.eventNote' | t" />
              <label class="eb-inline"><input type="checkbox" [ngModel]="ev.counterpartyMandatory" (ngModelChange)="updateEvent(i, 'counterpartyMandatory', $event)" /> {{ 'settings.ebelge.counterpartyMandatory' | t }}</label>
              <button type="button" class="btn btn-ghost btn-sm" (click)="removeEvent(i)">{{ 'common.delete' | t }}</button>
            </div>
          }
          <div><button type="button" class="btn btn-secondary btn-sm" (click)="addEvent()">{{ 'settings.ebelge.addEvent' | t }}</button></div>
        </div>
      </div>

      <div class="eb-actions">
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
          @if (saving()) { {{ 'settings.saving' | t }} } @else { {{ 'common.save' | t }} }
        </button>
      </div>

      @if (sourceList().length) {
        <details class="eb-sources">
          <summary>{{ 'settings.ebelge.sources' | t }}</summary>
          <ul>@for (s of sourceList(); track s[0]) { <li><span class="mono">{{ s[0] }}</span>: {{ s[1] }}</li> }</ul>
        </details>
      }
    </div>
  `,
})
export class EBelgeSettingsComponent implements OnInit {
  private api = inject(ComplianceService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);

  /** Sector items come from the EBELGE_SECTOR_RULES legal parameter (served with the obligations). */
  private rules = signal<SectorRule[]>([]);
  readonly eFaturaFlags = computed(() => this.rules().filter((r) => r.doc === 'EFATURA'));
  readonly eIrsaliyeFlags = computed(() => this.rules().filter((r) => r.doc === 'EIRSALIYE'));
  readonly eventTypes = [...CORPORATE_EVENT_TYPES];

  profile: EBelgeProfile = {};
  sales = signal<GrossSales[]>([]);
  flagsE = signal<SectorFlag[]>([]);
  flagsI = signal<SectorFlag[]>([]);
  events = signal<CorporateEvent[]>([]);
  report = signal<ObligationReport | null>(null);
  sourceList = signal<[string, string][]>([]);
  saving = signal(false);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.api.getObligations().subscribe({
      next: (r) => {
        const p = r.profile || {};
        this.profile = {
          eFaturaSince: p.eFaturaSince || null,
          eArsivSince: p.eArsivSince || null,
          eIrsaliyeSince: p.eIrsaliyeSince || null,
          mandatoryVsVoluntary: p.mandatoryVsVoluntary || null,
          gibWrittenNoticeDate: p.gibWrittenNoticeDate || null,
        };
        this.sales.set([...(p.annualGrossSales || [])]);
        this.flagsE.set([...(p.sectorFlagsEFatura || [])]);
        this.flagsI.set([...(p.sectorFlagsEIrsaliye || [])]);
        this.events.set([...(p.corporateEvents || [])]);
        this.rules.set(r.sectorRules || []);
        this.report.set(r.report);
        this.sourceList.set(Object.entries(r.sources || {}));
      },
      error: () => undefined,
    });
  }

  badgeClass(o: ObligationResult): string {
    const map: Record<string, string> = { overdue: 'badge-danger', upcoming: 'badge-warning', mandatory: 'badge-info', active: 'badge-success', voluntary: 'badge-success', not_required: 'badge-neutral' };
    return 'badge ' + (map[o.status] || 'badge-neutral');
  }

  /** Label of a sector code; codes added later to the legal parameter fall back to the code itself. */
  sectorLabel(code: string): string {
    const key = 'settings.ebelge.sector.' + code;
    const label = this.i18n.t(key);
    return label === key ? code : label;
  }

  reasonLabel(reason: string): string {
    const [kind, arg, year] = reason.split(':');
    if (kind === 'SECTOR' && year) return this.i18n.t('settings.ebelge.reason.SECTOR_YEAR', { sector: this.sectorLabel(arg), year });
    if (kind === 'SECTOR') return this.i18n.t('settings.ebelge.reason.SECTOR', { sector: this.sectorLabel(arg) });
    if (kind === 'EVENT') return this.i18n.t('settings.ebelge.reason.EVENT', { event: this.i18n.t('settings.ebelge.event.' + arg) });
    if (kind === 'BOOKKEEPING') return this.i18n.t('settings.ebelge.reason.BOOKKEEPING', { type: this.i18n.t('settings.fiscal.bookkeeping.' + arg) });
    return this.i18n.t('settings.ebelge.reason.' + kind, { year: arg ?? '' });
  }

  // gross sales
  addSale() {
    const years = this.sales().map((s) => s.year);
    const next = years.length ? Math.max(...years) + 1 : new Date().getFullYear() - 1;
    this.sales.update((l) => [...l, { year: next, amount: 0 }]);
  }
  removeSale(i: number) {
    this.sales.update((l) => l.filter((_, j) => j !== i));
  }
  updateSale(i: number, k: 'year' | 'amount', v: number) {
    this.sales.update((l) => l.map((r, j) => (j === i ? { ...r, [k]: Number(v) } : r)));
  }

  // sector flags
  private flags(kind: 'e' | 'i') {
    return kind === 'e' ? this.flagsE : this.flagsI;
  }
  hasFlag(kind: 'e' | 'i', code: string) {
    return this.flags(kind)().some((f) => f.code === code);
  }
  flagSince(kind: 'e' | 'i', code: string) {
    return this.flags(kind)().find((f) => f.code === code)?.since || '';
  }
  toggleFlag(kind: 'e' | 'i', code: string, on: boolean) {
    const today = new Date().toISOString().slice(0, 10);
    this.flags(kind).update((l) => (on ? [...l.filter((f) => f.code !== code), { code, since: today }] : l.filter((f) => f.code !== code)));
  }
  setFlagSince(kind: 'e' | 'i', code: string, since: string) {
    this.flags(kind).update((l) => l.map((f) => (f.code === code ? { ...f, since } : f)));
  }

  // corporate events
  addEvent() {
    this.events.update((l) => [...l, { type: 'MERGER', date: new Date().toISOString().slice(0, 10), counterpartyMandatory: true, note: '' }]);
  }
  removeEvent(i: number) {
    this.events.update((l) => l.filter((_, j) => j !== i));
  }
  updateEvent(i: number, k: keyof CorporateEvent, v: unknown) {
    this.events.update((l) => l.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  }

  save() {
    const d = (x: string | null | undefined) => (x ? x : null);
    const payload: EBelgeProfile = {
      annualGrossSales: this.sales().filter((s) => s.year && s.amount >= 0),
      sectorFlagsEFatura: this.flagsE().filter((f) => f.since),
      sectorFlagsEIrsaliye: this.flagsI().filter((f) => f.since),
      eFaturaSince: d(this.profile.eFaturaSince),
      eArsivSince: d(this.profile.eArsivSince),
      eIrsaliyeSince: d(this.profile.eIrsaliyeSince),
      mandatoryVsVoluntary: d(this.profile.mandatoryVsVoluntary),
      gibWrittenNoticeDate: d(this.profile.gibWrittenNoticeDate),
      corporateEvents: this.events().filter((e) => e.date).map((e) => ({ ...e, note: e.note || null, counterpartyMandatory: !!e.counterpartyMandatory })),
    };
    this.saving.set(true);
    this.api.saveProfile(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
        this.api.loadCompliance().subscribe({ error: () => undefined });
        this.ui.showToast(this.i18n.t('settings.ebelge.saved'), 'success');
      },
      error: (err) => {
        this.saving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('common.unknownError'), 'error');
      },
    });
  }
}
