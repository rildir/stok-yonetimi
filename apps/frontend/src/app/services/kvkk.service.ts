import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

/** WP7 - KVKK API (notices, requests, consents, retention / destruction, incidents, sub-processors, inventory). */
export interface PrivacyNotice {
  id: string;
  companyId: string | null;
  docType: 'PRIVACY' | 'TOS' | 'DPA' | string;
  audience: string;
  language: string;
  version: string;
  title: string;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | string;
  contentSha256?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  createdAt: string;
}

export interface DsrRequest {
  id: string;
  requestNo: string;
  subjectType: string;
  subjectId?: string | null;
  applicantName: string;
  applicantContact?: string | null;
  requestType: string;
  channel: string;
  description?: string | null;
  receivedAt: string;
  dueAt: string;
  status: string;
  identityVerifiedAt?: string | null;
  identityVerifiedBy?: string | null;
  identityVerificationMethod?: string | null;
  outcome?: Record<string, any> | null;
  responseText?: string | null;
  respondedAt?: string | null;
  daysLeft: number | null;
  overdue: boolean;
}

export interface ConsentRecord {
  id: string;
  subjectType: string;
  subjectId: string;
  purposeCode: string;
  channel: string;
  textVersion?: string | null;
  givenAt: string;
  withdrawnAt?: string | null;
  withdrawnChannel?: string | null;
  evidence?: string | null;
  recordedBy?: string | null;
}

export interface RetentionPolicy {
  id: string;
  companyId: string | null;
  dataCategory: string;
  periodValue: number;
  periodUnit: string;
  startEvent: string;
  action: string;
  minimumValue: number;
  legalBasis: string;
  sourceRef: string;
  requiresApproval: boolean;
  approvedAt?: string | null;
  approvedBy?: string | null;
  enabled: boolean;
  isOverride: boolean;
  defaultPeriodValue: number;
  defaultPeriodUnit: string;
  approved: boolean;
}

export interface DestructionCandidate {
  dataCategory: string;
  entityType: string;
  entityId: string | null;
  label: string;
  action: string;
  count: number;
  retentionUntil: string | null;
  reason: string;
}

export interface DestructionRun {
  id: string;
  runNo: string;
  trigger: string;
  status: string;
  asOfDate: string;
  candidates: DestructionCandidate[];
  summary?: Record<string, any> | null;
  createdBy?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
}

export interface DestructionLog {
  id: string;
  runId?: string | null;
  dsrId?: string | null;
  dataCategory: string;
  entityType: string;
  entityId?: string | null;
  recordCount: number;
  method: string;
  result: string;
  reason: string;
  restrictedUntil?: string | null;
  performedBy?: string | null;
  performedAt: string;
  retainUntil: string;
}

export interface SecurityIncident {
  id: string;
  incidentNo: string;
  title: string;
  description?: string | null;
  source: string;
  severity: string;
  status: string;
  detectedAt: string;
  awareAt?: string | null;
  deadlineAt?: string | null;
  dataCategories?: string[] | null;
  affectedSubjectTypes?: string[] | null;
  affectedCount?: number | null;
  boardNotifiedAt?: string | null;
  boardNotificationRef?: string | null;
  subjectsNotifiedAt?: string | null;
  measures?: string | null;
  evidence?: Record<string, unknown> | null;
  hoursLeft: number | null;
  overdue: boolean;
}

export interface Subprocessor {
  id: string;
  companyId: string | null;
  name: string;
  service: string;
  country: string;
  transferBasis: string;
  dataCategories?: string[] | null;
  dpaSignedAt?: string | null;
  sccNotifiedAt?: string | null;
  website?: string | null;
  active: boolean;
}

export interface TransferRow {
  id: string;
  host: string;
  destinationCountry: string;
  abroad: boolean;
  transferBasis: string;
  sccSignedAt?: string | null;
  sccNotifiedAt?: string | null;
  sccNotice: { deadline: string | null; late: boolean };
  includePersonalData: boolean;
  active: boolean;
}

export interface KvkkStatus {
  dsr: { open: number; dueSoon: number; overdue: number; nearestDueAt: string | null };
  incidents: { open: number; suspected: number; awaitingNotice: number; nearest: { incidentNo: string; deadlineAt: string; hoursLeft: number } | null };
  destruction: { lastExecutedAt: string | null; lastRunNo: string | null; maxMonths: number; pendingRuns: number; due: string; overdue: boolean };
  verbis: { required: boolean; registered: boolean; warning: boolean };
  totp: { required: boolean; pending: boolean; graceUntil: string | null };
  notices: { published: number };
  company: { status: string; retentionUntil: string | null };
  alerts: { code: string; severity: 'error' | 'warning' | 'info'; params?: Record<string, unknown> }[];
}

export interface VerbisStatus {
  required: boolean;
  reasons: string[];
  inputsMissing: boolean;
  registered: boolean;
  registrationNo: string | null;
  warning: boolean;
  bookkeepingType: string | null;
  employeeCount: number | null;
  balanceSheetTotal: number | null;
  thresholds: {
    employees: { value: number; sourceRef: string; confidence: string } | null;
    balanceSheet: { value: number; sourceRef: string; confidence: string; note: string | null } | null;
  };
}

export interface KvkkSettings {
  kvkkContactEmail: string | null;
  verbisEmployeeCount: number | null;
  verbisBalanceSheetTotal: number | null;
  verbisMainActivitySpecial: boolean;
  verbisRegistered: boolean;
  verbisRegistrationNo: string | null;
  adminTotpRequired: boolean;
  adminTotpGraceUntil: string | null;
  status: string;
  closedAt: string | null;
  retentionUntil: string | null;
  lastFullExportAt: string | null;
}

export const DSR_TYPES = ['ACCESS', 'INFO', 'PURPOSE', 'TRANSFER_INFO', 'RECTIFICATION', 'ERASURE', 'OBJECTION', 'COMPENSATION'];
export const DSR_CHANNELS = ['WRITTEN', 'KEP', 'E_SIGNATURE', 'MOBILE_SIGNATURE', 'REGISTERED_EMAIL', 'APPLICATION', 'IN_PERSON'];
export const TRANSFER_BASES = ['DOMESTIC', 'ADEQUACY', 'SCC', 'BCR', 'INCIDENTAL_CONSENT'];
export const CONSENT_PURPOSES = ['MARKETING_EMAIL', 'MARKETING_SMS', 'MARKETING_CALL', 'PROFILING', 'CROSS_BORDER_TRANSFER', 'SPECIAL_CATEGORY'];
export const CONSENT_CHANNELS = ['WEB', 'PAPER', 'EMAIL', 'SMS', 'PHONE', 'IN_PERSON', 'KEP'];
export const NOTICE_CHANNELS = ['WEB', 'PAPER', 'EMAIL', 'SMS', 'PHONE', 'IN_PERSON', 'KEP'];

@Injectable({ providedIn: 'root' })
export class KvkkService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/kvkk`;

  /** Last status (banner). */
  readonly status = signal<KvkkStatus | null>(null);

  loadStatus(): Observable<KvkkStatus> {
    return this.http.get<KvkkStatus>(`${this.api}/status`).pipe(tap((s) => this.status.set(s)));
  }

  // notices / acceptances
  publicNotice(docType = 'PRIVACY', lang = 'tr') {
    return this.http.get<PrivacyNotice | null>(`${this.api}/public/notices/current`, { params: { docType, lang } });
  }
  currentNotice(audience = 'EMPLOYEE', lang = 'tr') {
    return this.http.get<PrivacyNotice | null>(`${this.api}/notices/current`, { params: { audience, lang } });
  }
  pendingAcceptances(lang: string) {
    return this.http.get<PrivacyNotice[]>(`${this.api}/acceptances/pending`, { params: { lang } });
  }
  accept(noticeIds: string[]) {
    return this.http.post<{ accepted: number }>(`${this.api}/acceptances`, { noticeIds });
  }
  notices() {
    return this.http.get<PrivacyNotice[]>(`${this.api}/notices`);
  }
  createNotice(body: { audience: string; language: string; version: string; title?: string; body?: string }) {
    return this.http.post<PrivacyNotice>(`${this.api}/notices`, body);
  }
  updateNotice(id: string, body: { version?: string; title?: string; body?: string }) {
    return this.http.put<PrivacyNotice>(`${this.api}/notices/${id}`, body);
  }
  publishNotice(id: string) {
    return this.http.post<PrivacyNotice>(`${this.api}/notices/${id}/publish`, {});
  }
  retireNotice(id: string) {
    return this.http.post<PrivacyNotice>(`${this.api}/notices/${id}/retire`, {});
  }
  deleteNotice(id: string) {
    return this.http.delete<{ success: boolean }>(`${this.api}/notices/${id}`);
  }

  // data-subject requests
  dsrList(status?: string) {
    return this.http.get<DsrRequest[]>(`${this.api}/dsr`, status ? { params: { status } } : {});
  }
  createDsr(body: Partial<DsrRequest>) {
    return this.http.post<DsrRequest>(`${this.api}/dsr`, body);
  }
  verifyIdentity(id: string, method: string) {
    return this.http.post<DsrRequest>(`${this.api}/dsr/${id}/verify-identity`, { method });
  }
  erase(id: string) {
    return this.http.post<{ request: DsrRequest; result: any; responseText: string }>(`${this.api}/dsr/${id}/erase`, {});
  }
  respond(id: string, status: string, responseText: string) {
    return this.http.post<DsrRequest>(`${this.api}/dsr/${id}/respond`, { status, responseText });
  }
  dsrExport(id: string) {
    return this.http.get<Record<string, any>>(`${this.api}/dsr/${id}/export`);
  }
  dsrExportHtml(id: string) {
    return this.http.get(`${this.api}/dsr/${id}/export`, { params: { format: 'html' }, responseType: 'text' });
  }

  // consents
  consents(subjectType: string, subjectId: string) {
    return this.http.get<ConsentRecord[]>(`${this.api}/consents`, { params: { subjectType, subjectId } });
  }
  giveConsent(body: { subjectType: string; subjectId: string; purposeCode: string; channel: string; textVersion?: string; evidence?: string }) {
    return this.http.post<ConsentRecord>(`${this.api}/consents`, body);
  }
  withdrawConsent(id: string, channel: string) {
    return this.http.post<ConsentRecord>(`${this.api}/consents/${id}/withdraw`, { channel });
  }

  // retention / destruction
  policies() {
    return this.http.get<RetentionPolicy[]>(`${this.api}/retention-policies`);
  }
  setPolicy(category: string, body: { periodValue?: number; periodUnit?: string; enabled?: boolean }) {
    return this.http.put<RetentionPolicy>(`${this.api}/retention-policies/${category}`, body);
  }
  approvePolicy(category: string) {
    return this.http.post<RetentionPolicy>(`${this.api}/retention-policies/${category}/approve`, {});
  }
  schedule() {
    return this.http.get<KvkkStatus['destruction']>(`${this.api}/destruction/schedule`);
  }
  runs() {
    return this.http.get<DestructionRun[]>(`${this.api}/destruction/runs`);
  }
  createRun() {
    return this.http.post<DestructionRun>(`${this.api}/destruction/runs`, {});
  }
  approveRun(id: string) {
    return this.http.post<DestructionRun>(`${this.api}/destruction/runs/${id}/approve`, {});
  }
  rejectRun(id: string, reason: string) {
    return this.http.post<DestructionRun>(`${this.api}/destruction/runs/${id}/reject`, { reason });
  }
  destructionLogs() {
    return this.http.get<DestructionLog[]>(`${this.api}/destruction/logs`);
  }

  // incidents
  incidents() {
    return this.http.get<SecurityIncident[]>(`${this.api}/incidents`);
  }
  createIncident(body: Record<string, unknown>) {
    return this.http.post<SecurityIncident>(`${this.api}/incidents`, body);
  }
  updateIncident(id: string, body: Record<string, unknown>) {
    return this.http.put<SecurityIncident>(`${this.api}/incidents/${id}`, body);
  }
  confirmIncident(id: string, awareAt?: string | null) {
    return this.http.post<SecurityIncident>(`${this.api}/incidents/${id}/confirm`, { awareAt: awareAt || null });
  }
  dismissIncident(id: string, reason: string) {
    return this.http.post<SecurityIncident>(`${this.api}/incidents/${id}/dismiss`, { reason });
  }
  closeIncident(id: string) {
    return this.http.post<SecurityIncident>(`${this.api}/incidents/${id}/close`, {});
  }
  affected(id: string) {
    return this.http.get<{ total: number; until: string; bySubjectType: Record<string, { count: number; sample: { id: string; name: string; email: string | null }[] }> }>(`${this.api}/incidents/${id}/affected`);
  }

  // sub-processors, inventory, settings
  subprocessors() {
    return this.http.get<{ platform: Subprocessor[]; tenant: Subprocessor[]; transfers: TransferRow[] }>(`${this.api}/subprocessors`);
  }
  createSubprocessor(body: Partial<Subprocessor>) {
    return this.http.post<Subprocessor>(`${this.api}/subprocessors`, body);
  }
  updateSubprocessor(id: string, body: Partial<Subprocessor>) {
    return this.http.put<Subprocessor>(`${this.api}/subprocessors/${id}`, body);
  }
  deleteSubprocessor(id: string) {
    return this.http.delete<{ success: boolean }>(`${this.api}/subprocessors/${id}`);
  }
  verbisStatus() {
    return this.http.get<VerbisStatus>(`${this.api}/verbis/status`);
  }
  inventory() {
    return this.http.get<{ rows: Record<string, string>[]; measures: string[] }>(`${this.api}/verbis/inventory`);
  }
  inventoryCsv() {
    return this.http.get(`${this.api}/verbis/inventory.csv`, { responseType: 'blob' });
  }
  inventoryHtml() {
    return this.http.get(`${this.api}/verbis/inventory/print`, { responseType: 'text' });
  }
  settings() {
    return this.http.get<KvkkSettings>(`${this.api}/settings`);
  }
  saveSettings(body: Partial<KvkkSettings>) {
    return this.http.put<KvkkSettings>(`${this.api}/settings`, body);
  }
  verifyChain() {
    return this.http.get<{ ok: boolean; checked: number; unsealed: number; maskedRows: number; tampered: string[]; brokenAt: unknown; verifiedAt: string }>(`${this.api}/audit-chain/verify`);
  }
  tenantExport() {
    return this.http.get(`${this.api}/tenant/export`, { responseType: 'blob' });
  }
  closeTenant(confirmSlug: string, password: string) {
    return this.http.post<Record<string, unknown>>(`${this.api}/tenant/close`, { confirmSlug, password });
  }

  /** Opens printable HTML (save as PDF) in a new window. */
  openHtml(html: string): void {
    if (typeof window === 'undefined') return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  saveBlob(blob: Blob, fileName: string): void {
    if (typeof window === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
