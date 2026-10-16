import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CORPORATE_EVENT_TYPES, SectorRule } from '@stok/tr-compliance';
import { ComplianceService } from '../../services/compliance.service';
import { UiStateService } from '../../services/ui-state.service';
import { CorporateEvent, EBelgeProfile, GrossSales, ObligationReport, ObligationResult, SectorFlag } from '../../models/inventory.models';
import { AppDatePipe, I18nService, MoneyPipe, TranslatePipe } from '../../i18n';
import { ComplianceBannersComponent } from '../shared/compliance-banners.component';
import { IconComponent } from '../shared/icon.component';

/** Settings > e-Belge compliance: turnover declaration, sector flags, computed start dates and countdown. */
@Component({
  selector: 'app-ebelge-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe, AppDatePipe, MoneyPipe, ComplianceBannersComponent, IconComponent],
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
    app-compliance-banners { display: block; }
    .eb-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .eb-kpis .kpi { box-shadow: 0 0 0 1px var(--line); }
    .eb-kpis .kpi { display: flex; flex-direction: column; }
    .kpi-top b { font-weight: 500; color: var(--fg); min-width: 0; }
    .eb-meta { display: block; font-size: var(--text-xs); color: var(--fg-3); line-height: 18px; }
    .eb-status { margin-top: auto; padding-top: 10px; }
    .eb-status .badge { margin-left: 0; }
    .eb-paper { margin-top: 12px; }
    .card-b { padding-top: 0; padding-bottom: 0; }
    .fsec:first-child { padding-top: 16px; }
    .eb-rows { display: flex; flex-direction: column; gap: 8px; }
    .eb-row { display: grid; grid-template-columns: minmax(0, 320px) auto; justify-content: start; gap: 4px; align-items: center; }
    /* one control per year: year | ₺ | amount */
    .eb-sale input.eb-year { flex: none; width: 64px; text-align: center; }
    .eb-sale .affix.pre { box-shadow: inset 1px 0 0 var(--line), inset -1px 0 0 var(--line); }
    .eb-row-event { display: grid; grid-template-columns: 180px 160px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; }
    .eb-flags { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; }
    .eb-flag { display: flex; align-items: center; gap: 10px; min-height: 32px; font-size: var(--text-sm); cursor: pointer; }
    .eb-flag > span { flex: 1; min-width: 0; }
    .eb-flag .field { width: 160px; flex: none; }
    .eb-sub { margin: 4px 0 0; padding-top: 14px; font-size: var(--text-sm); font-weight: 500; color: var(--fg); box-shadow: inset 0 1px 0 var(--line); }
    .eb-sub + .eb-flags { margin-top: -4px; }
    .eb-empty { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--fg-3); }
    .eb-sources { font-size: var(--text-xs); color: var(--fg-3); padding: 12px 16px; box-shadow: inset 0 1px 0 var(--line); }
    .eb-sources summary { cursor: pointer; color: var(--fg-2); font-weight: 500; }
    .eb-sources ul { margin: 8px 0 0; padding-left: 16px; }
    .eb-sources li { margin: 2px 0; }
    @media (max-width: 900px) {
      .eb-kpis, .eb-flags { grid-template-columns: minmax(0, 1fr); }
      .eb-row-event { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .eb-row-event .ev-note { grid-column: 1 / -1; }
    }
    @media (max-width: 640px) {
      .eb-row { grid-template-columns: minmax(0, 1fr) auto; }
      .eb-flag { flex-wrap: wrap; }
      .eb-flag .field { width: 100%; margin-left: 26px; }
    }
  `],
  template: `

    <section class="card">
      <div class="card-h sh">
        <div class="hg"><h3>{{ 'settings.ebelge.title' | t }}</h3><p>{{ 'settings.ebelge.subtitle' | t }}</p></div>
      </div>

      <div class="card-b">
        <div class="fsec">
          <app-compliance-banners [showAll]="true"></app-compliance-banners>

          @if (report(); as r) {
            <div class="eb-kpis">
              @for (o of [r.eFatura, r.eArsiv, r.eIrsaliye]; track o.kind) {
                <div class="kpi">
                  <div class="kpi-top"><app-icon name="file" size="sm" /><b>{{ 'settings.ebelge.kind.' + o.kind | t }}</b></div>
                  <div class="kpi-val"><b>{{ o.mandatoryFrom ? (o.mandatoryFrom | appDate) : '—' }}</b></div>
                  <div>
                    <span class="eb-meta">{{ 'settings.ebelge.obligationStart' | t }}@if (o.mandatoryFrom && o.daysLeft !== null && o.daysLeft > 0) { · {{ 'settings.ebelge.daysLeft' | t: { n: o.daysLeft } }} }</span>
                    @if (o.reason) { <span class="eb-meta">{{ reasonLabel(o.reason) }}</span> }
                    @if (o.activeSince) { <span class="eb-meta">{{ 'settings.ebelge.activeSince' | t }}: {{ o.activeSince | appDate }}</span> }
                    @if (o.toleranceUntil && o.status !== 'active') { <span class="eb-meta">{{ 'settings.ebelge.tolerance' | t }}: {{ o.toleranceUntil | appDate }}</span> }
                  </div>
                  <div class="eb-status"><span [class]="badgeClass(o)"><span class="dot"></span>{{ 'settings.ebelge.status.' + o.status | t }}</span></div>
                </div>
              }
            </div>
            <div class="notice eb-paper" [class.notice-info]="r.paperInvoice.allowed" [class.notice-warning]="!r.paperInvoice.allowed">
              <app-icon [name]="r.paperInvoice.allowed ? 'info' : 'warn'" />
              <span class="t">
                @if (r.paperInvoice.allowed) {
                  @if (r.paperInvoice.until) { {{ 'settings.ebelge.paperAllowed' | t: { date: (r.paperInvoice.until | appDate) } }} }
                  @else { {{ 'settings.ebelge.paperAllowedOpen' | t }} }
                  @if (r.paperInvoice.limit) { {{ 'settings.ebelge.paperLimit' | t: { amount: (r.paperInvoice.limit | money: 'TRY') } }} }
                } @else {
                  {{ 'settings.ebelge.paperNotAllowed' | t }}
                }
              </span>
            </div>
          }
        </div>

        <section class="fsec">
          <div class="fsec-h"><span class="n">1</span><h3>{{ 'settings.ebelge.grossSales' | t }}</h3><p>{{ 'settings.ebelge.grossSalesHint' | t }}</p></div>
          <div class="eb-rows">
            @for (row of sales(); track $index; let i = $index) {
              <div class="eb-row">
                <div class="field eb-sale">
                  <input type="text" inputmode="numeric" maxlength="4" class="eb-year mono" [value]="row.year || ''" (change)="updateSale(i, 'year', digits($any($event.target).value))" [attr.aria-label]="'settings.ebelge.year' | t" />
                  <span class="affix pre">₺</span>
                  <input type="text" inputmode="numeric" class="num" [value]="fmtAmount(row.amount)" (input)="onAmountInput(i, $event)" (blur)="$any($event.target).value = fmtAmount(sales()[i]?.amount)" [attr.aria-label]="'settings.ebelge.amount' | t" />
                </div>
                <button type="button" class="btn btn-ghost btn-icon" (click)="removeSale(i)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" size="sm" /></button>
              </div>
            }
            <div><button type="button" class="btn btn-subtle btn-sm" (click)="addSale()"><app-icon name="plus" size="sm" />{{ 'settings.ebelge.addYear' | t }}</button></div>
          </div>
        </section>

        <section class="fsec">
          <div class="fsec-h"><span class="n">2</span><h3>{{ 'settings.ebelge.sectorEFatura' | t }}</h3></div>
          @if (!eFaturaFlags().length && !eIrsaliyeFlags().length) {
            <p class="eb-empty"><app-icon name="info" size="sm" />{{ 'settings.ebelge.noSectorRules' | t }}</p>
          } @else {
          <div class="eb-flags">
            @for (rule of eFaturaFlags(); track rule.code) {
              <label class="eb-flag" [attr.title]="rule.ref || null">
                <input type="checkbox" [checked]="hasFlag('e', rule.code)" (change)="toggleFlag('e', rule.code, $any($event.target).checked)" />
                <span>{{ sectorLabel(rule.code) }}@if (rule.thresholds?.length) { <span class="text-muted"> · {{ 'settings.ebelge.sectorThreshold' | t }}</span> }</span>
                @if (hasFlag('e', rule.code)) { <span class="field field-sm"><input type="date" [ngModel]="flagSince('e', rule.code)" (ngModelChange)="setFlagSince('e', rule.code, $event)" /></span> }
              </label>
            }
          </div>
          @if (eIrsaliyeFlags().length) { <h4 class="eb-sub">{{ 'settings.ebelge.sectorEIrsaliye' | t }}</h4> }
          <div class="eb-flags">
            @for (rule of eIrsaliyeFlags(); track rule.code) {
              <label class="eb-flag" [attr.title]="rule.ref || null">
                <input type="checkbox" [checked]="hasFlag('i', rule.code)" (change)="toggleFlag('i', rule.code, $any($event.target).checked)" />
                <span>{{ sectorLabel(rule.code) }}@if (rule.thresholds?.length) { <span class="text-muted"> · {{ 'settings.ebelge.sectorThreshold' | t }}</span> }</span>
                @if (hasFlag('i', rule.code)) { <span class="field field-sm"><input type="date" [ngModel]="flagSince('i', rule.code)" (ngModelChange)="setFlagSince('i', rule.code, $event)" /></span> }
              </label>
            }
          </div>
          }
        </section>

        <section class="fsec">
          <div class="fsec-h"><span class="n">3</span><h3>{{ 'settings.ebelge.actualUse' | t }}</h3></div>
          <div class="grid-3">
            <div class="fld">
              <label class="fld-label" for="ebEf">{{ 'settings.ebelge.since.eFatura' | t }}</label>
              <div class="field"><input id="ebEf" type="date" [(ngModel)]="profile.eFaturaSince" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="ebEa">{{ 'settings.ebelge.since.eArsiv' | t }}</label>
              <div class="field"><input id="ebEa" type="date" [(ngModel)]="profile.eArsivSince" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="ebEi">{{ 'settings.ebelge.since.eIrsaliye' | t }}</label>
              <div class="field"><input id="ebEi" type="date" [(ngModel)]="profile.eIrsaliyeSince" /></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="ebMv">{{ 'settings.ebelge.mandatoryVsVoluntary' | t }}</label>
              <div class="field select"><select id="ebMv" [(ngModel)]="profile.mandatoryVsVoluntary" [class.is-placeholder]="!profile.mandatoryVsVoluntary">
                <option [ngValue]="null">{{ 'settings.ebelge.mandatoryVsVoluntaryPh' | t }}</option>
                <option value="MANDATORY">{{ 'settings.ebelge.mandatory' | t }}</option>
                <option value="VOLUNTARY">{{ 'settings.ebelge.voluntary' | t }}</option>
              </select></div>
            </div>
            <div class="fld">
              <label class="fld-label" for="ebGib">{{ 'settings.ebelge.gibNotice' | t }}</label>
              <div class="field"><input id="ebGib" type="date" [(ngModel)]="profile.gibWrittenNoticeDate" /></div>
            </div>
          </div>
        </section>

        <section class="fsec">
          <div class="fsec-h"><span class="n">4</span><h3>{{ 'settings.ebelge.events' | t }}</h3><p>{{ 'settings.ebelge.eventsHint' | t }}</p></div>
          <div class="eb-rows">
            @for (ev of events(); track $index; let i = $index) {
              <div class="eb-row-event">
                <div class="field select"><select [ngModel]="ev.type" (ngModelChange)="updateEvent(i, 'type', $event)">
                  @for (t of eventTypes; track t) { <option [value]="t">{{ 'settings.ebelge.event.' + t | t }}</option> }
                </select></div>
                <div class="field"><input type="date" [ngModel]="ev.date" (ngModelChange)="updateEvent(i, 'date', $event)" /></div>
                <div class="field ev-note"><input type="text" [ngModel]="ev.note" (ngModelChange)="updateEvent(i, 'note', $event)" [placeholder]="'settings.ebelge.eventNote' | t" /></div>
                <label class="check"><input type="checkbox" [ngModel]="ev.counterpartyMandatory" (ngModelChange)="updateEvent(i, 'counterpartyMandatory', $event)" />{{ 'settings.ebelge.counterpartyMandatory' | t }}</label>
                <button type="button" class="btn btn-ghost btn-icon" (click)="removeEvent(i)" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t"><app-icon name="trash" size="sm" /></button>
              </div>
            }
            <div><button type="button" class="btn btn-subtle btn-sm" (click)="addEvent()"><app-icon name="plus" size="sm" />{{ 'settings.ebelge.addEvent' | t }}</button></div>
          </div>
        </section>
      </div>

      @if (sourceList().length) {
        <details class="eb-sources">
          <summary>{{ 'settings.ebelge.sources' | t }}</summary>
          <ul>@for (s of sourceList(); track s[0]) { <li><span class="mono">{{ s[0] }}</span>: {{ s[1] }}</li> }</ul>
        </details>
      }

      <div class="card-f">
        <span class="spacer"></span>
        <button type="button" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()" (click)="save()"><span>{{ 'common.save' | t }}</span></button>
      </div>
    </section>
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
  /** Amounts are shown with thousands separators; the model keeps plain integers. */
  fmtAmount(v: number | null | undefined): string {
    return v || v === 0 ? this.i18n.formatNumber(v, { maximumFractionDigits: 0 }) : '';
  }
  digits(v: string): number {
    const d = String(v ?? '').replace(/\D/g, '');
    return d ? Number(d) : 0;
  }
  onAmountInput(i: number, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const caret = el.selectionStart ?? el.value.length;
    const digitsBefore = el.value.slice(0, caret).replace(/\D/g, '').length;
    const n = this.digits(el.value);
    this.updateSale(i, 'amount', n);
    const shown = el.value.replace(/\D/g, '') ? this.fmtAmount(n) : '';
    el.value = shown;
    // keep the caret after the same number of digits
    let pos = 0, seen = 0;
    while (pos < shown.length && seen < digitsBefore) { if (/\d/.test(shown[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos);
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
