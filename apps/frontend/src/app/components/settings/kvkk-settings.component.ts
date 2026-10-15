import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppDatePipe, I18nService, MoneyPipe, NumberFormatPipe, TranslatePipe } from '../../i18n';
import { UiStateService } from '../../services/ui-state.service';
import { apiError } from '../../services/documents.service';
import { InventoryService } from '../../inventory.service';
import {
  DSR_CHANNELS, DSR_TYPES, DestructionLog, DestructionRun, DsrRequest, KvkkService, KvkkSettings, PrivacyNotice, RetentionPolicy, SecurityIncident, Subprocessor, TRANSFER_BASES,
  TransferRow, VerbisStatus,
} from '../../services/kvkk.service';
import { NoticeTextComponent } from '../kvkk/notice-text.component';
import trKvkkSettings from '../../../i18n/tr/kvkk-settings.json';
import enKvkkSettings from '../../../i18n/en/kvkk-settings.json';

type Sub = 'notices' | 'dsr' | 'destruction' | 'retention' | 'processors' | 'incidents' | 'inventory';
const SUBS: Sub[] = ['notices', 'dsr', 'destruction', 'retention', 'processors', 'incidents', 'inventory'];

/**
 * Settings > KVKK (WP7): privacy notices (versions), data-subject requests with the 30-day
 * countdown, periodic destruction (candidates, approval, records), retention policies,
 * sub-processors and transfers, breaches with the 72-hour clock, the VERBİS inventory, audit-chain
 * verification and the tenant closure. The auditor role sees everything read-only.
 */
@Component({
  selector: 'app-kvkk-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppDatePipe, NumberFormatPipe, MoneyPipe, NoticeTextComponent],
  styleUrls: ['../../drawer.css', '../documents/documents.css'],
  styles: [`
    .kv-tabs { margin: var(--space-4) 0 var(--space-5); }
    .kv-row { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
    .kv-row .doc-field { margin-bottom: 0; min-width: 160px; }
    .kv-row .grow { flex: 1; min-width: 220px; }
    .kv-panel { margin-top: var(--space-4); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
    .kv-panel h4 { margin: 0 0 var(--space-3); font-size: var(--text-md); }
    .kv-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4); }
    .kv-stat { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .kv-stat .v { font-size: var(--text-xl); font-weight: var(--weight-semibold); }
    .kv-stat .l { font-size: var(--text-xs); color: var(--color-text-muted); }
    .kv-notice { max-height: 420px; overflow-y: auto; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    textarea.input { min-height: 260px; width: 100%; font-family: var(--font-mono); font-size: var(--text-xs); }
    .kv-response { white-space: pre-wrap; font-size: var(--text-sm); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-subtle); }
    .kv-danger { border-color: var(--color-danger-border, var(--color-border)); }
    .clickable { cursor: pointer; }
    tr.selected td { background: var(--color-primary-subtle); }
    @media (max-width: 760px) { .kv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `],
  template: `
    <div class="settings-card settings-card-lg">
      <h3 class="card-title">{{ 'settings.kvkk.title' | t }}</h3>
      <p class="card-subtitle settings-card-sub">{{ 'settings.kvkk.subtitle' | t }}</p>
      @if (!canManage()) { <div class="doc-alert info">{{ 'settings.kvkk.readOnly' | t }}</div> }

      @if (status(); as st) {
        <div class="kv-stats">
          <div class="kv-stat"><div class="v">{{ st.dsr.open }}</div><div class="l">{{ 'settings.kvkk.stat.openRequests' | t }}@if (st.dsr.overdue) { · <span class="badge badge-danger">{{ 'kvkk.dsr.overdue' | t }}</span> }</div></div>
          <div class="kv-stat"><div class="v">{{ st.incidents.open }}</div><div class="l">{{ 'settings.kvkk.stat.openIncidents' | t }}@if (st.incidents.nearest; as n) { · {{ 'kvkk.incident.hoursLeft' | t: { h: n.hoursLeft } }} }</div></div>
          <div class="kv-stat"><div class="v">{{ st.destruction.due | appDate }}</div><div class="l">{{ 'settings.kvkk.stat.nextDestruction' | t }}@if (st.destruction.overdue) { · <span class="badge badge-warning">{{ 'kvkk.destruction.overdue' | t }}</span> }</div></div>
          <div class="kv-stat"><div class="v">{{ st.notices.published }}</div><div class="l">{{ 'settings.kvkk.stat.publishedNotices' | t }}</div></div>
        </div>
      }

      <nav class="tabs kv-tabs" role="tablist">
        @for (s of subs; track s) {
          <button type="button" class="tab" role="tab" [class.active]="sub() === s" [attr.aria-selected]="sub() === s" (click)="go(s)">{{ 'settings.kvkk.tab.' + s | t }}</button>
        }
      </nav>

      <!-- ============================================================ notices -->
      @if (sub() === 'notices') {
        <p class="doc-hint">{{ 'settings.kvkk.notices.hint' | t }}</p>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'settings.kvkk.notices.doc' | t }}</th><th>{{ 'settings.kvkk.notices.audience' | t }}</th><th>{{ 'settings.kvkk.notices.language' | t }}</th><th>{{ 'kvkk.notice.version' | t }}</th><th>{{ 'settings.kvkk.status' | t }}</th><th>{{ 'settings.kvkk.notices.published' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (n of notices(); track n.id) {
              <tr [class.selected]="selNotice()?.id === n.id">
                <td class="td-primary">{{ 'kvkk.docType.' + n.docType | t }}@if (!n.companyId) { <span class="badge badge-neutral">{{ 'settings.kvkk.platform' | t }}</span> }</td>
                <td>{{ 'kvkk.audience.' + n.audience | t }}</td>
                <td>{{ n.language | uppercase }}</td>
                <td class="mono">{{ n.version }}</td>
                <td><span class="badge" [class.badge-success]="n.status === 'PUBLISHED'" [class.badge-neutral]="n.status !== 'PUBLISHED'">{{ 'kvkk.noticeStatus.' + n.status | t }}</span></td>
                <td>{{ n.publishedAt ? (n.publishedAt | appDate) : '-' }}</td>
                <td class="td-actions">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openNotice(n)">{{ 'settings.kvkk.view' | t }}</button>
                  @if (canManage() && n.companyId && n.status === 'DRAFT') {
                    <button type="button" class="btn btn-primary btn-sm" (click)="publish(n)">{{ 'settings.kvkk.notices.publish' | t }}</button>
                    <button type="button" class="btn btn-secondary btn-sm" (click)="removeDraft(n)">{{ 'common.delete' | t }}</button>
                  }
                  @if (canManage() && n.companyId && n.status === 'PUBLISHED') { <button type="button" class="btn btn-secondary btn-sm" (click)="retire(n)">{{ 'settings.kvkk.notices.retire' | t }}</button> }
                </td>
              </tr>
            }
          </tbody>
        </table></div></div>

        @if (canManage()) {
          <div class="kv-panel">
            <h4>{{ 'settings.kvkk.notices.new' | t }}</h4>
            <div class="kv-row">
              <div class="doc-field"><label for="nAud">{{ 'settings.kvkk.notices.audience' | t }}</label>
                <select id="nAud" class="input" [(ngModel)]="newNotice.audience">@for (a of ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE']; track a) { <option [value]="a">{{ 'kvkk.audience.' + a | t }}</option> }</select></div>
              <div class="doc-field"><label for="nLang">{{ 'settings.kvkk.notices.language' | t }}</label>
                <select id="nLang" class="input" [(ngModel)]="newNotice.language"><option value="tr">TR</option><option value="en">EN</option></select></div>
              <div class="doc-field"><label for="nVer">{{ 'kvkk.notice.version' | t }}</label><input id="nVer" class="input" [(ngModel)]="newNotice.version" /></div>
              <button type="button" class="btn btn-primary" [disabled]="busy() || !newNotice.version" (click)="createNotice()">{{ 'settings.kvkk.notices.generate' | t }}</button>
            </div>
            <p class="doc-hint">{{ 'settings.kvkk.notices.generateHint' | t }}</p>
          </div>
        }

        @if (selNotice(); as n) {
          <div class="kv-panel">
            <h4>{{ n.title }} · v{{ n.version }}</h4>
            @if (n.contentSha256) { <p class="doc-hint mono">SHA-256 {{ n.contentSha256 }}</p> }
            @if (canManage() && n.companyId && n.status === 'DRAFT') {
              <div class="doc-field"><label for="nTitle">{{ 'settings.kvkk.notices.titleLabel' | t }}</label><input id="nTitle" class="input" [(ngModel)]="draftTitle" /></div>
              <div class="doc-field"><label for="nBody">{{ 'settings.kvkk.notices.body' | t }}</label><textarea id="nBody" class="input" [(ngModel)]="draftBody"></textarea></div>
              <div class="doc-actions"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveDraft(n)">{{ 'common.save' | t }}</button></div>
            } @else {
              <div class="kv-notice"><app-notice-text [text]="n.body"></app-notice-text></div>
            }
          </div>
        }
      }

      <!-- ============================================================ data-subject requests -->
      @if (sub() === 'dsr') {
        <div class="doc-toolbar">
          <p class="doc-hint">{{ 'settings.kvkk.dsr.hint' | t }}</p>
          @if (canManage()) { <button type="button" class="btn btn-primary" (click)="dsrFormOpen.set(!dsrFormOpen())">{{ 'settings.kvkk.dsr.new' | t }}</button> }
        </div>
        @if (dsrFormOpen()) {
          <div class="kv-panel">
            <div class="doc-grid-3">
              <div class="doc-field"><label for="dApp">{{ 'settings.kvkk.dsr.applicant' | t }}</label><input id="dApp" class="input" [(ngModel)]="newDsr.applicantName" /></div>
              <div class="doc-field"><label for="dCon">{{ 'settings.kvkk.dsr.contact' | t }}</label><input id="dCon" class="input" [(ngModel)]="newDsr.applicantContact" /></div>
              <div class="doc-field"><label for="dRec">{{ 'settings.kvkk.dsr.receivedAt' | t }}</label><input id="dRec" type="date" class="input" [(ngModel)]="newDsr.receivedAt" /></div>
              <div class="doc-field"><label for="dType">{{ 'settings.kvkk.dsr.type' | t }}</label>
                <select id="dType" class="input" [(ngModel)]="newDsr.requestType">@for (t of dsrTypes; track t) { <option [value]="t">{{ 'kvkk.dsr.type.' + t | t }}</option> }</select></div>
              <div class="doc-field"><label for="dCh">{{ 'settings.kvkk.dsr.channel' | t }}</label>
                <select id="dCh" class="input" [(ngModel)]="newDsr.channel">@for (c of dsrChannels; track c) { <option [value]="c">{{ 'kvkk.dsrChannel.' + c | t }}</option> }</select></div>
              <div class="doc-field"><label for="dSub">{{ 'settings.kvkk.dsr.subject' | t }}</label>
                <select id="dSub" class="input" [(ngModel)]="newDsr.subjectId"><option value="">{{ 'settings.kvkk.dsr.noSubject' | t }}</option>@for (c of customers(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
            </div>
            <div class="doc-field"><label for="dDesc">{{ 'settings.kvkk.dsr.description' | t }}</label><input id="dDesc" class="input" [(ngModel)]="newDsr.description" /></div>
            <div class="doc-actions"><button type="button" class="btn btn-primary" [disabled]="busy() || !newDsr.applicantName" (click)="createDsr()">{{ 'common.save' | t }}</button></div>
          </div>
        }
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'settings.kvkk.dsr.no' | t }}</th><th>{{ 'settings.kvkk.dsr.applicant' | t }}</th><th>{{ 'settings.kvkk.dsr.type' | t }}</th><th>{{ 'settings.kvkk.dsr.channel' | t }}</th><th>{{ 'settings.kvkk.dsr.receivedAt' | t }}</th><th>{{ 'kvkk.dsr.dueIn' | t }}</th><th>{{ 'settings.kvkk.status' | t }}</th></tr></thead>
          <tbody>
            @for (r of dsr(); track r.id) {
              <tr class="clickable" [class.selected]="selDsr()?.id === r.id" (click)="selDsr.set(r); responseDraft = r.responseText || ''">
                <td class="mono td-primary">{{ r.requestNo }}</td>
                <td>{{ r.applicantName }}</td>
                <td>{{ 'kvkk.dsr.type.' + r.requestType | t }}</td>
                <td>{{ 'kvkk.dsrChannel.' + r.channel | t }}</td>
                <td>{{ r.receivedAt | appDate }}</td>
                <td>@if (r.daysLeft !== null) { <span class="badge" [class.badge-danger]="r.overdue || r.daysLeft <= 3" [class.badge-warning]="!r.overdue && r.daysLeft > 3 && r.daysLeft <= 7" [class.badge-neutral]="r.daysLeft > 7">{{ r.overdue ? ('kvkk.dsr.overdue' | t) : ('kvkk.dsr.daysLeft' | t: { n: r.daysLeft }) }}</span> } @else { - }</td>
                <td><span class="badge" [class.badge-success]="r.status === 'COMPLETED'" [class.badge-warning]="r.status === 'PARTIALLY_COMPLETED'" [class.badge-neutral]="r.status !== 'COMPLETED' && r.status !== 'PARTIALLY_COMPLETED'">{{ 'kvkk.dsr.status.' + r.status | t }}</span></td>
              </tr>
            } @empty { <tr><td colspan="7"><div class="empty-state"><p class="empty-state-title">{{ 'settings.kvkk.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></div>

        @if (selDsr(); as r) {
          <div class="kv-panel">
            <h4>{{ r.requestNo }} · {{ r.applicantName }}</h4>
            <div class="doc-grid">
              <div class="doc-field"><label>{{ 'settings.kvkk.dsr.due' | t }}</label><span>{{ r.dueAt | appDate: 'datetime' }}</span></div>
              <div class="doc-field"><label>{{ 'settings.kvkk.dsr.identity' | t }}</label><span>@if (r.identityVerifiedAt) { {{ 'settings.kvkk.dsr.verifiedBy' | t: { by: r.identityVerifiedBy, date: (r.identityVerifiedAt | appDate: 'datetime') } }} · {{ r.identityVerificationMethod }} } @else { <span class="badge badge-warning">{{ 'settings.kvkk.dsr.notVerified' | t }}</span> }</span></div>
              @if (r.description) { <div class="doc-field"><label>{{ 'settings.kvkk.dsr.description' | t }}</label><span>{{ r.description }}</span></div> }
            </div>
            @if (canManage() && (r.status === 'RECEIVED' || r.status === 'IN_PROGRESS')) {
              @if (!r.identityVerifiedAt) {
                <div class="kv-row">
                  <div class="doc-field grow"><label for="vMeth">{{ 'settings.kvkk.dsr.verifyMethod' | t }}</label><input id="vMeth" class="input" [(ngModel)]="verifyMethod" /></div>
                  <button type="button" class="btn btn-primary" [disabled]="busy() || !verifyMethod" (click)="verify(r)">{{ 'settings.kvkk.dsr.verify' | t }}</button>
                </div>
              } @else {
                <div class="doc-actions">
                  @if (r.subjectId) {
                    <button type="button" class="btn btn-secondary" (click)="exportJson(r)">{{ 'settings.kvkk.dsr.exportJson' | t }}</button>
                    <button type="button" class="btn btn-secondary" (click)="exportHtml(r)">{{ 'settings.kvkk.dsr.exportPdf' | t }}</button>
                  }
                  @if (r.requestType === 'ERASURE' && r.subjectId) { <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="erase(r)">{{ 'settings.kvkk.dsr.erase' | t }}</button> }
                </div>
                @if (lastExportMs() !== null) { <p class="doc-hint">{{ 'settings.kvkk.dsr.exportTime' | t: { ms: lastExportMs() } }}</p> }
                <div class="doc-section">
                  <div class="doc-field"><label for="rText">{{ 'settings.kvkk.dsr.response' | t }}</label><textarea id="rText" class="input" style="min-height: 120px; font-family: inherit; font-size: var(--text-sm)" [(ngModel)]="responseDraft"></textarea></div>
                  <div class="doc-actions">
                    <button type="button" class="btn btn-primary" [disabled]="busy() || !responseDraft" (click)="respond(r, 'COMPLETED')">{{ 'settings.kvkk.dsr.complete' | t }}</button>
                    <button type="button" class="btn btn-secondary" [disabled]="busy() || !responseDraft" (click)="respond(r, 'REJECTED')">{{ 'settings.kvkk.dsr.reject' | t }}</button>
                  </div>
                </div>
              }
            }
            @if (r.responseText) {
              <div class="doc-section">
                <h4 class="doc-section-title">{{ 'settings.kvkk.dsr.answer' | t }} @if (r.status === 'PARTIALLY_COMPLETED') { <span class="badge badge-warning">{{ 'kvkk.erase.restricted' | t }}</span> }</h4>
                <div class="kv-response">{{ r.responseText }}</div>
              </div>
            }
          </div>
        }
      }

      <!-- ============================================================ destruction -->
      @if (sub() === 'destruction') {
        <div class="doc-toolbar">
          <p class="doc-hint">{{ 'settings.kvkk.destruction.hint' | t }}</p>
          @if (canManage()) { <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="createRun()">{{ 'settings.kvkk.destruction.newRun' | t }}</button> }
        </div>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'settings.kvkk.destruction.runNo' | t }}</th><th>{{ 'settings.kvkk.destruction.trigger' | t }}</th><th>{{ 'settings.kvkk.destruction.asOf' | t }}</th><th class="num">{{ 'settings.kvkk.destruction.items' | t }}</th><th>{{ 'settings.kvkk.status' | t }}</th><th>{{ 'settings.kvkk.destruction.decided' | t }}</th></tr></thead>
          <tbody>
            @for (r of runs(); track r.id) {
              <tr class="clickable" [class.selected]="selRun()?.id === r.id" (click)="selRun.set(r)">
                <td class="mono td-primary">{{ r.runNo }}</td>
                <td>{{ 'kvkk.destruction.trigger.' + r.trigger | t }}</td>
                <td>{{ r.asOfDate | appDate }}</td>
                <td class="num">{{ r.candidates.length | num }}</td>
                <td><span class="badge" [class.badge-success]="r.status === 'EXECUTED'" [class.badge-warning]="r.status === 'PENDING_APPROVAL'" [class.badge-neutral]="r.status !== 'EXECUTED' && r.status !== 'PENDING_APPROVAL'">{{ 'kvkk.destruction.status.' + r.status | t }}</span></td>
                <td>@if (r.decidedAt) { {{ r.decidedBy }} · {{ r.decidedAt | appDate: 'datetime' }} } @else { - }</td>
              </tr>
            } @empty { <tr><td colspan="6"><div class="empty-state"><p class="empty-state-title">{{ 'settings.kvkk.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></div>
        @if (selRun(); as r) {
          <div class="kv-panel">
            <h4>{{ r.runNo }}</h4>
            @if (r.summary?.['awaitingApproval']?.length) { <div class="doc-alert">{{ 'settings.kvkk.destruction.awaiting' | t: { list: categoryList(r.summary?.['awaitingApproval']) } }}</div> }
            <table class="doc-table">
              <thead><tr><th>{{ 'settings.kvkk.retention.category' | t }}</th><th>{{ 'settings.kvkk.destruction.record' | t }}</th><th>{{ 'settings.kvkk.destruction.action' | t }}</th><th class="num">{{ 'settings.kvkk.destruction.count' | t }}</th><th>{{ 'settings.kvkk.destruction.reason' | t }}</th></tr></thead>
              <tbody>
                @for (c of r.candidates; track $index) {
                  <tr><td>{{ 'kvkk.category.' + c.dataCategory | t }}</td><td class="mono">{{ c.entityType }} {{ c.label }}</td><td>{{ 'kvkk.action.' + c.action | t }}</td><td class="num">{{ c.count | num }}</td><td class="doc-hint">{{ c.reason }}</td></tr>
                } @empty { <tr><td colspan="5" class="doc-hint">{{ 'settings.kvkk.destruction.noCandidates' | t }}</td></tr> }
              </tbody>
            </table>
            @if (canManage() && r.status === 'PENDING_APPROVAL') {
              <div class="doc-actions" style="margin-top: var(--space-3)">
                <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="approveRun(r)">{{ 'settings.kvkk.destruction.approve' | t }}</button>
                <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="rejectRun(r)">{{ 'settings.kvkk.destruction.reject' | t }}</button>
              </div>
            }
          </div>
        }
        <div class="doc-section">
          <h4 class="doc-section-title">{{ 'settings.kvkk.destruction.logs' | t }}</h4>
          <div class="table-card"><div class="table-scroll"><table class="table-responsive">
            <thead><tr><th>{{ 'settings.kvkk.destruction.performed' | t }}</th><th>{{ 'settings.kvkk.retention.category' | t }}</th><th>{{ 'settings.kvkk.destruction.record' | t }}</th><th>{{ 'settings.kvkk.destruction.method' | t }}</th><th>{{ 'settings.kvkk.destruction.result' | t }}</th><th class="num">{{ 'settings.kvkk.destruction.count' | t }}</th><th>{{ 'settings.kvkk.destruction.retainUntil' | t }}</th></tr></thead>
            <tbody>
              @for (l of logs(); track l.id) {
                <tr [title]="l.reason">
                  <td>{{ l.performedAt | appDate: 'datetime' }} · {{ l.performedBy }}</td>
                  <td>{{ 'kvkk.category.' + l.dataCategory | t }}</td>
                  <td class="mono">{{ l.entityType }}@if (l.entityId) { #{{ l.entityId.slice(0, 8) }} }</td>
                  <td>{{ 'kvkk.method.' + l.method | t }}</td>
                  <td><span class="badge" [class.badge-success]="l.result === 'DONE'" [class.badge-warning]="l.result === 'RESTRICTED'">{{ 'kvkk.result.' + l.result | t }}</span>@if (l.restrictedUntil) { <span class="doc-hint"> → {{ l.restrictedUntil | appDate }}</span> }</td>
                  <td class="num">{{ l.recordCount | num }}</td>
                  <td>{{ l.retainUntil | appDate }}</td>
                </tr>
              } @empty { <tr><td colspan="7"><div class="empty-state"><p class="empty-state-title">{{ 'settings.kvkk.empty' | t }}</p></div></td></tr> }
            </tbody>
          </table></div></div>
        </div>
      }

      <!-- ============================================================ retention -->
      @if (sub() === 'retention') {
        <p class="doc-hint">{{ 'settings.kvkk.retention.hint' | t }}</p>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'settings.kvkk.retention.category' | t }}</th><th>{{ 'settings.kvkk.retention.period' | t }}</th><th>{{ 'settings.kvkk.retention.start' | t }}</th><th>{{ 'settings.kvkk.destruction.action' | t }}</th><th>{{ 'settings.kvkk.retention.source' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (p of policies(); track p.dataCategory) {
              <tr>
                <td class="td-primary">{{ 'kvkk.category.' + p.dataCategory | t }}@if (p.isOverride) { <span class="badge badge-primary">{{ 'settings.kvkk.retention.override' | t }}</span> }</td>
                <td>
                  @if (canManage() && editCat() === p.dataCategory) {
                    <span class="kv-row"><input type="number" min="0" class="input" style="width: 80px" [(ngModel)]="editValue" />
                    <select class="input" [(ngModel)]="editUnit"><option value="DAY">{{ 'kvkk.unit.DAY' | t }}</option><option value="MONTH">{{ 'kvkk.unit.MONTH' | t }}</option><option value="YEAR">{{ 'kvkk.unit.YEAR' | t }}</option></select></span>
                  } @else { {{ p.periodValue }} {{ 'kvkk.unit.' + p.periodUnit | t }} }
                  @if (p.minimumValue) { <div class="doc-hint">{{ 'settings.kvkk.retention.minimum' | t: { n: p.minimumValue, unit: ('kvkk.unit.' + p.periodUnit | t) } }}</div> }
                </td>
                <td>{{ 'kvkk.start.' + p.startEvent | t }}</td>
                <td>{{ 'kvkk.action.' + p.action | t }}</td>
                <td class="doc-hint">{{ p.legalBasis }} · {{ p.sourceRef }}</td>
                <td class="td-actions">
                  @if (p.requiresApproval) {
                    @if (p.approved) { <span class="badge badge-success" [title]="p.approvedBy || ''">{{ 'settings.kvkk.retention.approved' | t }}</span> }
                    @else if (canManage()) { <button type="button" class="btn btn-primary btn-sm" (click)="approvePolicy(p)">{{ 'settings.kvkk.retention.approve' | t }}</button> }
                    @else { <span class="badge badge-warning">{{ 'settings.kvkk.retention.needsApproval' | t }}</span> }
                  }
                  @if (canManage()) {
                    @if (editCat() === p.dataCategory) {
                      <button type="button" class="btn btn-primary btn-sm" (click)="savePolicy(p)">{{ 'common.save' | t }}</button>
                      <button type="button" class="btn btn-secondary btn-sm" (click)="editCat.set(null)">{{ 'common.cancel' | t }}</button>
                    } @else { <button type="button" class="btn btn-secondary btn-sm" (click)="startEdit(p)">{{ 'common.edit' | t }}</button> }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table></div></div>
      }

      <!-- ============================================================ sub-processors -->
      @if (sub() === 'processors') {
        <p class="doc-hint">{{ 'settings.kvkk.processors.hint' | t }}</p>
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'settings.kvkk.processors.name' | t }}</th><th>{{ 'settings.kvkk.processors.service' | t }}</th><th>{{ 'settings.kvkk.processors.country' | t }}</th><th>{{ 'settings.kvkk.processors.basis' | t }}</th><th>{{ 'settings.kvkk.processors.dpa' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (s of processors(); track s.id) {
              <tr>
                <td class="td-primary">{{ s.name }}@if (!s.companyId) { <span class="badge badge-neutral">{{ 'settings.kvkk.platform' | t }}</span> }</td>
                <td>{{ s.service }}</td>
                <td>{{ s.country }}</td>
                <td>{{ 'kvkk.basis.' + s.transferBasis | t }}</td>
                <td>{{ s.dpaSignedAt ? (s.dpaSignedAt | appDate) : '-' }}</td>
                <td class="td-actions">@if (canManage() && s.companyId) { <button type="button" class="btn btn-secondary btn-sm" (click)="deleteProcessor(s)">{{ 'common.delete' | t }}</button> }</td>
              </tr>
            }
          </tbody>
        </table></div></div>
        @if (canManage()) {
          <div class="kv-panel">
            <h4>{{ 'settings.kvkk.processors.add' | t }}</h4>
            <div class="doc-grid-3">
              <div class="doc-field"><label for="pName">{{ 'settings.kvkk.processors.name' | t }}</label><input id="pName" class="input" [(ngModel)]="newProc.name" /></div>
              <div class="doc-field"><label for="pServ">{{ 'settings.kvkk.processors.service' | t }}</label><input id="pServ" class="input" [(ngModel)]="newProc.service" /></div>
              <div class="doc-field"><label for="pCountry">{{ 'settings.kvkk.processors.country' | t }}</label><input id="pCountry" class="input mono" maxlength="2" [(ngModel)]="newProc.country" /></div>
              <div class="doc-field"><label for="pBasis">{{ 'settings.kvkk.processors.basis' | t }}</label>
                <select id="pBasis" class="input" [(ngModel)]="newProc.transferBasis">@for (b of bases; track b) { <option [value]="b">{{ 'kvkk.basis.' + b | t }}</option> }</select></div>
              <div class="doc-field"><label for="pDpa">{{ 'settings.kvkk.processors.dpa' | t }}</label><input id="pDpa" type="date" class="input" [(ngModel)]="newProc.dpaSignedAt" /></div>
              <div class="doc-field"><label for="pScc">{{ 'settings.kvkk.processors.sccNotified' | t }}</label><input id="pScc" type="date" class="input" [(ngModel)]="newProc.sccNotifiedAt" /></div>
            </div>
            <div class="doc-actions"><button type="button" class="btn btn-primary" [disabled]="busy() || !newProc.name || !newProc.service" (click)="addProcessor()">{{ 'common.save' | t }}</button></div>
          </div>
        }
        <div class="doc-section">
          <h4 class="doc-section-title">{{ 'settings.kvkk.processors.transfers' | t }}</h4>
          <div class="table-card"><div class="table-scroll"><table class="table-responsive">
            <thead><tr><th>{{ 'settings.kvkk.processors.host' | t }}</th><th>{{ 'settings.kvkk.processors.country' | t }}</th><th>{{ 'settings.kvkk.processors.basis' | t }}</th><th>{{ 'settings.kvkk.processors.sccNotified' | t }}</th><th>{{ 'settings.kvkk.processors.pii' | t }}</th></tr></thead>
            <tbody>
              @for (t of transfers(); track t.id) {
                <tr>
                  <td class="mono td-primary">{{ t.host }}@if (!t.active) { <span class="badge badge-neutral">{{ 'settings.kvkk.inactive' | t }}</span> }</td>
                  <td>{{ t.destinationCountry }}@if (t.abroad) { <span class="badge badge-warning">{{ 'settings.kvkk.processors.abroad' | t }}</span> }</td>
                  <td>{{ 'kvkk.basis.' + t.transferBasis | t }}</td>
                  <td>{{ t.sccNotifiedAt ? (t.sccNotifiedAt | appDate) : '-' }}@if (t.sccNotice.late) { <span class="badge badge-danger">{{ 'settings.kvkk.processors.late' | t }}</span> }</td>
                  <td>{{ (t.includePersonalData ? 'common.yes' : 'common.no') | t }}</td>
                </tr>
              } @empty { <tr><td colspan="5"><div class="empty-state"><p class="empty-state-title">{{ 'settings.kvkk.processors.noTransfers' | t }}</p></div></td></tr> }
            </tbody>
          </table></div></div>
        </div>
      }

      <!-- ============================================================ incidents -->
      @if (sub() === 'incidents') {
        <div class="doc-toolbar">
          <p class="doc-hint">{{ 'settings.kvkk.incidents.hint' | t }}</p>
          @if (canManage()) { <button type="button" class="btn btn-primary" (click)="incFormOpen.set(!incFormOpen())">{{ 'settings.kvkk.incidents.new' | t }}</button> }
        </div>
        @if (incFormOpen()) {
          <div class="kv-panel">
            <div class="doc-grid">
              <div class="doc-field"><label for="iTitle">{{ 'settings.kvkk.incidents.titleLabel' | t }}</label><input id="iTitle" class="input" [(ngModel)]="newInc.title" /></div>
              <div class="doc-field"><label for="iAware">{{ 'settings.kvkk.incidents.awareAt' | t }}</label><input id="iAware" type="datetime-local" class="input" [(ngModel)]="newInc.awareAt" /></div>
            </div>
            <div class="doc-field"><label for="iDesc">{{ 'settings.kvkk.incidents.description' | t }}</label><input id="iDesc" class="input" [(ngModel)]="newInc.description" /></div>
            <div class="doc-actions"><button type="button" class="btn btn-primary" [disabled]="busy() || !newInc.title" (click)="createIncident()">{{ 'common.save' | t }}</button></div>
          </div>
        }
        <div class="table-card"><div class="table-scroll"><table class="table-responsive">
          <thead><tr><th>{{ 'settings.kvkk.incidents.no' | t }}</th><th>{{ 'settings.kvkk.incidents.titleLabel' | t }}</th><th>{{ 'settings.kvkk.incidents.source' | t }}</th><th>{{ 'settings.kvkk.incidents.detected' | t }}</th><th>{{ 'settings.kvkk.incidents.deadline' | t }}</th><th>{{ 'settings.kvkk.status' | t }}</th></tr></thead>
          <tbody>
            @for (i of incidents(); track i.id) {
              <tr class="clickable" [class.selected]="selInc()?.id === i.id" (click)="selectIncident(i)">
                <td class="mono td-primary">{{ i.incidentNo }}</td>
                <td>{{ i.title }}</td>
                <td>{{ 'kvkk.incident.source.' + i.source | t }}</td>
                <td>{{ i.detectedAt | appDate: 'datetime' }}</td>
                <td>@if (i.deadlineAt) { {{ i.deadlineAt | appDate: 'datetime' }} @if (i.hoursLeft !== null) { <span class="badge" [class.badge-danger]="i.overdue || i.hoursLeft < 24" [class.badge-warning]="!i.overdue && i.hoursLeft >= 24">{{ i.overdue ? ('kvkk.incident.overdue' | t) : ('kvkk.incident.hoursLeft' | t: { h: i.hoursLeft }) }}</span> } } @else { - }</td>
                <td><span class="badge" [class.badge-warning]="i.status === 'SUSPECTED' || i.status === 'CONFIRMED'" [class.badge-success]="i.status === 'CLOSED' || i.status === 'NOTIFIED'" [class.badge-neutral]="i.status === 'DISMISSED'">{{ 'kvkk.incident.status.' + i.status | t }}</span></td>
              </tr>
            } @empty { <tr><td colspan="6"><div class="empty-state"><p class="empty-state-title">{{ 'settings.kvkk.empty' | t }}</p></div></td></tr> }
          </tbody>
        </table></div></div>
        @if (selInc(); as i) {
          <div class="kv-panel">
            <h4>{{ i.incidentNo }} · {{ i.title }}</h4>
            @if (i.description) { <p class="doc-hint">{{ i.description }}</p> }
            @if (i.evidence) { <p class="doc-hint mono">{{ i.evidence | json }}</p> }
            @if (canManage() && i.status === 'SUSPECTED') {
              <div class="kv-row">
                <div class="doc-field"><label for="cAware">{{ 'settings.kvkk.incidents.awareAt' | t }}</label><input id="cAware" type="datetime-local" class="input" [(ngModel)]="confirmAware" /></div>
                <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="confirmIncident(i)">{{ 'settings.kvkk.incidents.confirm' | t }}</button>
                <div class="doc-field grow"><label for="dReason">{{ 'settings.kvkk.incidents.dismissReason' | t }}</label><input id="dReason" class="input" [(ngModel)]="dismissReason" /></div>
                <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="dismissIncident(i)">{{ 'settings.kvkk.incidents.dismiss' | t }}</button>
              </div>
            }
            @if (canManage() && (i.status === 'CONFIRMED' || i.status === 'NOTIFIED')) {
              <div class="doc-grid-3">
                <div class="doc-field"><label for="bNot">{{ 'settings.kvkk.incidents.boardNotifiedAt' | t }}</label><input id="bNot" type="datetime-local" class="input" [(ngModel)]="incEdit.boardNotifiedAt" /></div>
                <div class="doc-field"><label for="bRef">{{ 'settings.kvkk.incidents.boardRef' | t }}</label><input id="bRef" class="input" [(ngModel)]="incEdit.boardNotificationRef" /></div>
                <div class="doc-field"><label for="sNot">{{ 'settings.kvkk.incidents.subjectsNotifiedAt' | t }}</label><input id="sNot" type="datetime-local" class="input" [(ngModel)]="incEdit.subjectsNotifiedAt" /></div>
                <div class="doc-field"><label for="aCnt">{{ 'settings.kvkk.incidents.affectedCount' | t }}</label><input id="aCnt" type="number" min="0" class="input" [(ngModel)]="incEdit.affectedCount" /></div>
              </div>
              <div class="doc-field"><label for="iMeas">{{ 'settings.kvkk.incidents.measures' | t }}</label><input id="iMeas" class="input" [(ngModel)]="incEdit.measures" /></div>
              <div class="doc-actions">
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveIncident(i)">{{ 'common.save' | t }}</button>
                <button type="button" class="btn btn-secondary" [disabled]="busy() || !i.boardNotifiedAt" (click)="closeIncident(i)">{{ 'settings.kvkk.incidents.close' | t }}</button>
              </div>
            }
            @if (i.boardNotifiedAt) { <p class="doc-hint">{{ 'settings.kvkk.incidents.notifiedNote' | t: { date: (i.boardNotifiedAt | appDate: 'datetime'), ref: i.boardNotificationRef || '-' } }}</p> }
            <div class="doc-section">
              <button type="button" class="btn btn-secondary btn-sm" (click)="loadAffected(i)">{{ 'settings.kvkk.incidents.affected' | t }}</button>
              @if (affected(); as a) {
                <p class="doc-hint">{{ 'settings.kvkk.incidents.affectedTotal' | t: { n: a.total, date: (a.until | appDate: 'datetime') } }}</p>
                @for (k of affectedKeys(a); track k) { <div class="doc-hint">{{ 'kvkk.subject.' + k | t }}: {{ a.bySubjectType[k].count }} · {{ sampleNames(a.bySubjectType[k].sample) }}</div> }
              }
            </div>
          </div>
        }
      }

      <!-- ============================================================ inventory, settings, chain, closure -->
      @if (sub() === 'inventory') {
        @if (verbis(); as v) {
          <div class="doc-alert" [class.info]="!v.warning" [class.danger]="v.warning">
            @if (v.required) { {{ 'settings.kvkk.verbis.required' | t: { reasons: reasonList(v.reasons) } }} } @else { {{ 'settings.kvkk.verbis.notRequired' | t }} }
            @if (v.inputsMissing) { {{ (v.balanceSheetApplies ? 'settings.kvkk.verbis.inputsMissing' : 'settings.kvkk.verbis.inputsMissingEmployees') | t }} }
            @if (v.thresholds.balanceSheet; as b) { <div class="doc-hint">{{ 'settings.kvkk.verbis.thresholds' | t: { emp: v.thresholds.employees?.value, bal: (b.value | money: 'TRY'), src: b.sourceRef } }}@if (b.confidence === 'low') { · <strong>{{ 'settings.kvkk.verbis.lowConfidence' | t }}</strong> }</div> }
            @else if (!v.balanceSheetApplies && v.thresholds.nonBalanceSheetEmployeesOnly; as nb) { <div class="doc-hint">{{ 'settings.kvkk.verbis.employeesOnly' | t: { emp: v.thresholds.employees?.value, src: nb.sourceRef } }}@if (nb.confidence === 'low') { · <strong>{{ 'settings.kvkk.verbis.lowConfidence' | t }}</strong> }</div> }
          </div>
        }
        @if (settings(); as s) {
          <div class="kv-panel">
            <h4>{{ 'settings.kvkk.verbis.settings' | t }}</h4>
            <div class="doc-grid-3">
              <div class="doc-field"><label for="kMail">{{ 'settings.kvkk.verbis.contactEmail' | t }}</label><input id="kMail" type="email" class="input" [disabled]="!canManage()" [(ngModel)]="s.kvkkContactEmail" /></div>
              <div class="doc-field"><label for="kEmp">{{ 'settings.kvkk.verbis.employees' | t }}</label><input id="kEmp" type="number" min="0" class="input" [disabled]="!canManage()" [(ngModel)]="s.verbisEmployeeCount" /></div>
              <div class="doc-field"><label for="kBal">{{ 'settings.kvkk.verbis.balance' | t }}</label><input id="kBal" type="number" min="0" class="input" [disabled]="!canManage()" [(ngModel)]="s.verbisBalanceSheetTotal" /></div>
              <div class="doc-field"><label for="kReg">{{ 'settings.kvkk.verbis.registrationNo' | t }}</label><input id="kReg" class="input" [disabled]="!canManage()" [(ngModel)]="s.verbisRegistrationNo" /></div>
            </div>
            <label class="doc-check"><input type="checkbox" [disabled]="!canManage()" [(ngModel)]="s.verbisRegistered" /> {{ 'settings.kvkk.verbis.registered' | t }}</label>
            <label class="doc-check"><input type="checkbox" [disabled]="!canManage()" [(ngModel)]="s.verbisMainActivitySpecial" /> {{ 'settings.kvkk.verbis.special' | t }}</label>
            @if (canManage()) { <div class="doc-actions" style="margin-top: var(--space-3)"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveSettings(s)">{{ 'common.save' | t }}</button></div> }
          </div>
        }
        <div class="doc-section">
          <div class="doc-toolbar">
            <h4 class="doc-section-title">{{ 'settings.kvkk.inventory.title' | t }}</h4>
            <div class="doc-actions">
              <button type="button" class="btn btn-secondary" (click)="downloadInventory()">{{ 'settings.kvkk.inventory.csv' | t }}</button>
              <button type="button" class="btn btn-secondary" (click)="printInventory()">{{ 'settings.kvkk.inventory.pdf' | t }}</button>
            </div>
          </div>
          <div class="table-card"><div class="table-scroll"><table class="table-responsive">
            <thead><tr><th>{{ 'settings.kvkk.inventory.category' | t }}</th><th>{{ 'settings.kvkk.inventory.group' | t }}</th><th>{{ 'settings.kvkk.inventory.purposes' | t }}</th><th>{{ 'settings.kvkk.inventory.basis' | t }}</th><th>{{ 'settings.kvkk.inventory.retention' | t }}</th></tr></thead>
            <tbody>
              @for (r of inventory(); track $index) {
                <tr><td class="td-primary">{{ r['veriKategorisi'] }}</td><td>{{ r['veriKonusuKisiGrubu'] }}</td><td class="doc-hint">{{ r['islemeAmaclari'] }}</td><td class="doc-hint">{{ r['hukukiSebep'] }}</td><td>{{ r['saklamaSuresi'] }}</td></tr>
              }
            </tbody>
          </table></div></div>
        </div>
        <div class="kv-panel">
          <h4>{{ 'settings.kvkk.chain.title' | t }}</h4>
          <p class="doc-hint">{{ 'settings.kvkk.chain.hint' | t }}</p>
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="verifyChain()">{{ 'settings.kvkk.chain.verify' | t }}</button>
          @if (chain(); as c) {
            <div class="doc-alert" [class.info]="c.ok" [class.danger]="!c.ok" style="margin-top: var(--space-3)">{{ (c.ok ? 'settings.kvkk.chain.ok' : 'settings.kvkk.chain.broken') | t: { n: c.checked, masked: c.maskedRows, tampered: c.tampered.length } }}</div>
          }
        </div>
        @if (canManage()) {
          <div class="kv-panel kv-danger">
            <h4>{{ 'settings.kvkk.closure.title' | t }}</h4>
            <p class="doc-hint">{{ 'settings.kvkk.closure.hint' | t }}</p>
            <div class="kv-row">
              <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="exportAll()">{{ 'settings.kvkk.closure.export' | t }}</button>
              @if (settings()?.lastFullExportAt) { <span class="doc-hint">{{ 'settings.kvkk.closure.lastExport' | t: { date: (settings()?.lastFullExportAt | appDate: 'datetime') } }}</span> }
            </div>
            <div class="kv-row" style="margin-top: var(--space-3)">
              <div class="doc-field"><label for="cSlug">{{ 'settings.kvkk.closure.slug' | t: { slug: companySlug() } }}</label><input id="cSlug" class="input" [(ngModel)]="closeSlug" /></div>
              <div class="doc-field"><label for="cPw">{{ 'auth.totp.password' | t }}</label><input id="cPw" type="password" class="input" [(ngModel)]="closePassword" /></div>
              <button type="button" class="btn btn-danger" [disabled]="busy() || closeSlug !== companySlug() || !closePassword" (click)="closeTenant()">{{ 'settings.kvkk.closure.close' | t }}</button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class KvkkSettingsComponent implements OnInit {
  private api = inject(KvkkService);
  private ui = inject(UiStateService);
  private i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private inventoryApi = inject(InventoryService);

  constructor() {
    // Settings > KVKK texts live in a lazy chunk (initial bundle budget).
    this.i18n.extend({ tr: trKvkkSettings, en: enKvkkSettings });
  }

  readonly subs = SUBS;
  readonly dsrTypes = DSR_TYPES;
  readonly dsrChannels = DSR_CHANNELS;
  readonly bases = TRANSFER_BASES;
  sub = signal<Sub>('notices');
  busy = signal(false);
  canManage = computed(() => this.ui.userProfile()?.role === 'admin' && !!this.ui.userProfile()?.permissions?.includes('kvkk.manage'));
  companySlug = computed(() => this.ui.userProfile()?.company?.slug || '');
  status = this.api.status;

  notices = signal<PrivacyNotice[]>([]);
  selNotice = signal<PrivacyNotice | null>(null);
  newNotice = { audience: 'CUSTOMER', language: 'tr', version: '1.1' };
  draftTitle = '';
  draftBody = '';

  dsr = signal<DsrRequest[]>([]);
  selDsr = signal<DsrRequest | null>(null);
  dsrFormOpen = signal(false);
  customers = signal<{ id: string; name: string }[]>([]);
  newDsr = { applicantName: '', applicantContact: '', requestType: 'ACCESS', channel: 'WRITTEN', subjectId: '', description: '', receivedAt: '' };
  verifyMethod = '';
  responseDraft = '';
  lastExportMs = signal<number | null>(null);

  runs = signal<DestructionRun[]>([]);
  selRun = signal<DestructionRun | null>(null);
  logs = signal<DestructionLog[]>([]);

  policies = signal<RetentionPolicy[]>([]);
  editCat = signal<string | null>(null);
  editValue = 0;
  editUnit = 'YEAR';

  processors = signal<Subprocessor[]>([]);
  transfers = signal<TransferRow[]>([]);
  newProc = { name: '', service: '', country: 'TR', transferBasis: 'DOMESTIC', dpaSignedAt: '', sccNotifiedAt: '' };

  incidents = signal<SecurityIncident[]>([]);
  selInc = signal<SecurityIncident | null>(null);
  incFormOpen = signal(false);
  newInc = { title: '', description: '', awareAt: '' };
  incEdit: { boardNotifiedAt: string; boardNotificationRef: string; subjectsNotifiedAt: string; affectedCount: number | string | null; measures: string } = { boardNotifiedAt: '', boardNotificationRef: '', subjectsNotifiedAt: '', affectedCount: null, measures: '' };
  confirmAware = '';
  dismissReason = '';
  affected = signal<{ total: number; until: string; bySubjectType: Record<string, { count: number; sample: { id: string; name: string; email: string | null }[] }> } | null>(null);

  verbis = signal<VerbisStatus | null>(null);
  settings = signal<KvkkSettings | null>(null);
  inventory = signal<Record<string, string>[]>([]);
  chain = signal<{ ok: boolean; checked: number; maskedRows: number; tampered: string[] } | null>(null);
  closeSlug = '';
  closePassword = '';

  ngOnInit() {
    this.api.loadStatus().subscribe({ error: () => undefined });
    this.route.queryParams.subscribe((q) => {
      const s = (SUBS as string[]).includes(q['kvkk']) ? (q['kvkk'] as Sub) : 'notices';
      this.sub.set(s);
      this.load(s);
    });
  }

  go(s: Sub) {
    this.router.navigate(['/settings'], { queryParams: { tab: 'kvkk', kvkk: s } });
  }

  private err = (e: unknown) => {
    this.busy.set(false);
    this.ui.showToast(apiError(e, this.i18n.t('kvkk.error')), 'error');
  };
  private ok(key: string) {
    this.busy.set(false);
    this.ui.showToast(this.i18n.t(key), 'success');
    this.api.loadStatus().subscribe({ error: () => undefined });
  }

  load(s: Sub) {
    switch (s) {
      case 'notices':
        this.api.notices().subscribe({ next: (n) => this.notices.set(n), error: this.err });
        break;
      case 'dsr':
        this.api.dsrList().subscribe({ next: (d) => { this.dsr.set(d); const sel = this.selDsr(); if (sel) this.selDsr.set(d.find((x) => x.id === sel.id) || null); }, error: this.err });
        if (!this.customers().length) this.inventoryApi.getCustomers().subscribe({ next: (c) => this.customers.set(c.map((x) => ({ id: x.id, name: x.name }))), error: () => undefined });
        break;
      case 'destruction':
        this.api.runs().subscribe({ next: (r) => { this.runs.set(r); const sel = this.selRun(); this.selRun.set(sel ? r.find((x) => x.id === sel.id) || null : r[0] || null); }, error: this.err });
        this.api.destructionLogs().subscribe({ next: (l) => this.logs.set(l), error: this.err });
        break;
      case 'retention':
        this.api.policies().subscribe({ next: (p) => this.policies.set(p), error: this.err });
        break;
      case 'processors':
        this.api.subprocessors().subscribe({ next: (r) => { this.processors.set([...r.platform, ...r.tenant]); this.transfers.set(r.transfers); }, error: this.err });
        break;
      case 'incidents':
        this.api.incidents().subscribe({ next: (i) => { this.incidents.set(i); const sel = this.selInc(); if (sel) this.selectIncident(i.find((x) => x.id === sel.id) || i[0]); }, error: this.err });
        break;
      case 'inventory':
        this.api.verbisStatus().subscribe({ next: (v) => this.verbis.set(v), error: this.err });
        this.api.settings().subscribe({ next: (v) => this.settings.set(v), error: this.err });
        this.api.inventory().subscribe({ next: (v) => this.inventory.set(v.rows), error: this.err });
        break;
    }
  }

  // notices
  openNotice(n: PrivacyNotice) {
    this.selNotice.set(n);
    this.draftTitle = n.title;
    this.draftBody = n.body;
  }
  createNotice() {
    this.busy.set(true);
    this.api.createNotice({ ...this.newNotice }).subscribe({ next: (n) => { this.ok('settings.kvkk.notices.created'); this.openNotice(n); this.load('notices'); }, error: this.err });
  }
  saveDraft(n: PrivacyNotice) {
    this.busy.set(true);
    this.api.updateNotice(n.id, { title: this.draftTitle, body: this.draftBody }).subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.openNotice(x); this.load('notices'); }, error: this.err });
  }
  publish(n: PrivacyNotice) {
    this.busy.set(true);
    this.api.publishNotice(n.id).subscribe({ next: (x) => { this.ok('settings.kvkk.notices.publishedToast'); this.openNotice(x); this.load('notices'); }, error: this.err });
  }
  retire(n: PrivacyNotice) {
    this.busy.set(true);
    this.api.retireNotice(n.id).subscribe({ next: () => { this.ok('settings.kvkk.saved'); this.load('notices'); }, error: this.err });
  }
  removeDraft(n: PrivacyNotice) {
    this.busy.set(true);
    this.api.deleteNotice(n.id).subscribe({ next: () => { this.ok('settings.kvkk.saved'); this.selNotice.set(null); this.load('notices'); }, error: this.err });
  }

  // requests
  createDsr() {
    this.busy.set(true);
    const body: Record<string, unknown> = { ...this.newDsr, subjectType: this.newDsr.subjectId ? 'CUSTOMER' : 'OTHER' };
    if (!body['subjectId']) delete body['subjectId'];
    if (!body['receivedAt']) delete body['receivedAt'];
    this.api.createDsr(body as any).subscribe({
      next: (r) => { this.ok('settings.kvkk.dsr.created'); this.dsrFormOpen.set(false); this.selDsr.set(r); this.load('dsr'); },
      error: this.err,
    });
  }
  verify(r: DsrRequest) {
    this.busy.set(true);
    this.api.verifyIdentity(r.id, this.verifyMethod).subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.selDsr.set(x); this.verifyMethod = ''; this.load('dsr'); }, error: this.err });
  }
  exportJson(r: DsrRequest) {
    const t0 = Date.now();
    this.api.dsrExport(r.id).subscribe({
      next: (data) => {
        this.lastExportMs.set(Date.now() - t0);
        this.api.saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${r.requestNo}-veri-raporu.json`);
      },
      error: this.err,
    });
  }
  exportHtml(r: DsrRequest) {
    this.api.dsrExportHtml(r.id).subscribe({ next: (html) => this.api.openHtml(html), error: this.err });
  }
  erase(r: DsrRequest) {
    this.ui.openConfirm({
      title: this.i18n.t('settings.kvkk.dsr.eraseConfirmTitle'),
      message: this.i18n.t('settings.kvkk.dsr.eraseConfirm'),
      confirmText: this.i18n.t('settings.kvkk.dsr.erase'),
      isDelete: true,
      onConfirm: () => {
        this.busy.set(true);
        this.api.erase(r.id).subscribe({
          next: (out) => { this.ok(out.result.mode === 'FULL' ? 'settings.kvkk.dsr.erasedFull' : 'settings.kvkk.dsr.erasedPartial'); this.selDsr.set(out.request); this.responseDraft = out.responseText; this.load('dsr'); },
          error: this.err,
        });
      },
    });
  }
  respond(r: DsrRequest, status: string) {
    this.busy.set(true);
    this.api.respond(r.id, status, this.responseDraft).subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.selDsr.set(x); this.load('dsr'); }, error: this.err });
  }

  // destruction
  createRun() {
    this.busy.set(true);
    this.api.createRun().subscribe({ next: (r) => { this.ok('settings.kvkk.destruction.created'); this.selRun.set(r); this.load('destruction'); }, error: this.err });
  }
  approveRun(r: DestructionRun) {
    this.ui.openConfirm({
      title: this.i18n.t('settings.kvkk.destruction.approve'),
      message: this.i18n.t('settings.kvkk.destruction.approveConfirm', { n: r.candidates.filter((c) => c.action !== 'REVIEW').length }),
      confirmText: this.i18n.t('settings.kvkk.destruction.approve'),
      isDelete: true,
      onConfirm: () => {
        this.busy.set(true);
        this.api.approveRun(r.id).subscribe({ next: (x) => { this.ok('settings.kvkk.destruction.executed'); this.selRun.set(x); this.load('destruction'); }, error: this.err });
      },
    });
  }
  rejectRun(r: DestructionRun) {
    this.busy.set(true);
    this.api.rejectRun(r.id, '').subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.selRun.set(x); this.load('destruction'); }, error: this.err });
  }
  categoryList(list: unknown): string {
    return ((list as string[]) || []).map((c) => this.i18n.t('kvkk.category.' + c)).join(', ');
  }

  // retention
  startEdit(p: RetentionPolicy) {
    this.editCat.set(p.dataCategory);
    this.editValue = p.periodValue;
    this.editUnit = p.periodUnit;
  }
  savePolicy(p: RetentionPolicy) {
    this.busy.set(true);
    this.api.setPolicy(p.dataCategory, { periodValue: Number(this.editValue), periodUnit: this.editUnit }).subscribe({ next: () => { this.ok('settings.kvkk.saved'); this.editCat.set(null); this.load('retention'); }, error: this.err });
  }
  approvePolicy(p: RetentionPolicy) {
    this.busy.set(true);
    this.api.approvePolicy(p.dataCategory).subscribe({ next: () => { this.ok('settings.kvkk.saved'); this.load('retention'); }, error: this.err });
  }

  // processors
  addProcessor() {
    this.busy.set(true);
    const body: Record<string, unknown> = { ...this.newProc };
    for (const k of ['dpaSignedAt', 'sccNotifiedAt']) if (!body[k]) delete body[k];
    this.api.createSubprocessor(body as any).subscribe({
      next: () => { this.ok('settings.kvkk.saved'); this.newProc = { name: '', service: '', country: 'TR', transferBasis: 'DOMESTIC', dpaSignedAt: '', sccNotifiedAt: '' }; this.load('processors'); },
      error: this.err,
    });
  }
  deleteProcessor(s: Subprocessor) {
    this.busy.set(true);
    this.api.deleteSubprocessor(s.id).subscribe({ next: () => { this.ok('settings.kvkk.saved'); this.load('processors'); }, error: this.err });
  }

  // incidents
  private iso(local: string | null | undefined): string | null {
    return local ? new Date(local).toISOString() : null;
  }
  private local(v: string | null | undefined): string {
    if (!v) return '';
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  selectIncident(i: SecurityIncident | undefined) {
    if (!i) return;
    this.selInc.set(i);
    this.affected.set(null);
    this.incEdit = { boardNotifiedAt: this.local(i.boardNotifiedAt), boardNotificationRef: i.boardNotificationRef || '', subjectsNotifiedAt: this.local(i.subjectsNotifiedAt), affectedCount: i.affectedCount ?? null, measures: i.measures || '' };
  }
  createIncident() {
    this.busy.set(true);
    this.api.createIncident({ title: this.newInc.title, description: this.newInc.description || null, awareAt: this.iso(this.newInc.awareAt) }).subscribe({
      next: (i) => { this.ok('settings.kvkk.saved'); this.incFormOpen.set(false); this.selectIncident(i); this.load('incidents'); },
      error: this.err,
    });
  }
  confirmIncident(i: SecurityIncident) {
    this.busy.set(true);
    this.api.confirmIncident(i.id, this.iso(this.confirmAware)).subscribe({ next: (x) => { this.ok('settings.kvkk.incidents.confirmed'); this.selectIncident(x); this.load('incidents'); }, error: this.err });
  }
  dismissIncident(i: SecurityIncident) {
    this.busy.set(true);
    this.api.dismissIncident(i.id, this.dismissReason).subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.selectIncident(x); this.load('incidents'); }, error: this.err });
  }
  saveIncident(i: SecurityIncident) {
    this.busy.set(true);
    const body = { ...this.incEdit, boardNotifiedAt: this.iso(this.incEdit.boardNotifiedAt), subjectsNotifiedAt: this.iso(this.incEdit.subjectsNotifiedAt), affectedCount: this.incEdit.affectedCount === '' || this.incEdit.affectedCount === null ? null : Number(this.incEdit.affectedCount) };
    this.api.updateIncident(i.id, body).subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.selectIncident(x); this.load('incidents'); }, error: this.err });
  }
  closeIncident(i: SecurityIncident) {
    this.busy.set(true);
    this.api.closeIncident(i.id).subscribe({ next: (x) => { this.ok('settings.kvkk.saved'); this.selectIncident(x); this.load('incidents'); }, error: this.err });
  }
  loadAffected(i: SecurityIncident) {
    this.api.affected(i.id).subscribe({ next: (a) => this.affected.set(a), error: this.err });
  }
  affectedKeys(a: { bySubjectType: Record<string, unknown> }): string[] {
    return Object.keys(a.bySubjectType);
  }
  sampleNames(list: { name: string }[]): string {
    return list.slice(0, 6).map((x) => x.name).join(', ') + (list.length > 6 ? ' ...' : '');
  }

  // inventory / settings / chain / closure
  reasonList(reasons: string[]): string {
    return reasons.map((r) => this.i18n.t('settings.kvkk.verbis.reason.' + r)).join(', ');
  }
  saveSettings(s: KvkkSettings) {
    this.busy.set(true);
    const body = {
      kvkkContactEmail: s.kvkkContactEmail || null,
      verbisEmployeeCount: s.verbisEmployeeCount === null || (s.verbisEmployeeCount as unknown) === '' ? null : Number(s.verbisEmployeeCount),
      verbisBalanceSheetTotal: s.verbisBalanceSheetTotal === null || (s.verbisBalanceSheetTotal as unknown) === '' ? null : Number(s.verbisBalanceSheetTotal),
      verbisMainActivitySpecial: !!s.verbisMainActivitySpecial,
      verbisRegistered: !!s.verbisRegistered,
      verbisRegistrationNo: s.verbisRegistrationNo || null,
    };
    this.api.saveSettings(body).subscribe({ next: (x) => { this.settings.set(x); this.ok('settings.kvkk.saved'); this.load('inventory'); }, error: this.err });
  }
  downloadInventory() {
    this.api.inventoryCsv().subscribe({ next: (b) => this.api.saveBlob(b, 'kisisel-veri-envanteri.csv'), error: this.err });
  }
  printInventory() {
    this.api.inventoryHtml().subscribe({ next: (h) => this.api.openHtml(h), error: this.err });
  }
  verifyChain() {
    this.busy.set(true);
    this.api.verifyChain().subscribe({ next: (c) => { this.busy.set(false); this.chain.set(c); }, error: this.err });
  }
  exportAll() {
    this.busy.set(true);
    this.api.tenantExport().subscribe({
      next: (b) => { this.busy.set(false); this.api.saveBlob(b, 'tam-disa-aktarim.zip'); this.api.settings().subscribe({ next: (v) => this.settings.set(v) }); },
      error: this.err,
    });
  }
  closeTenant() {
    this.ui.openConfirm({
      title: this.i18n.t('settings.kvkk.closure.close'),
      message: this.i18n.t('settings.kvkk.closure.confirm'),
      confirmText: this.i18n.t('settings.kvkk.closure.close'),
      isDelete: true,
      onConfirm: () => {
        this.busy.set(true);
        this.api.closeTenant(this.closeSlug, this.closePassword).subscribe({ next: () => { this.ok('settings.kvkk.closure.closed'); this.closePassword = ''; this.load('inventory'); }, error: this.err });
      },
    });
  }
}
