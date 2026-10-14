import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ApiKey,
  AuditLog,
  AuditLogMeta,
  AuditLogQuery,
  CreateApiKeyPayload,
  ExportResource,
  ImportReport,
  ImportResource,
  Paged,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookPayload,
} from '../models/inventory.models';

/** Admin-only endpoints: audit log, API keys, webhooks, CSV import/export. */
@Injectable({ providedIn: 'root' })
export class IntegrationsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Backend origin + API base, used for usage hints and the docs link. */
  readonly apiBase = environment.apiUrl.replace(/\/$/, '');
  readonly docsUrl = `${this.apiBase}/docs`;

  private params(obj: Record<string, unknown>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return p;
  }

  // Audit log
  getAuditLogs(q: AuditLogQuery): Observable<Paged<AuditLog>> {
    return this.http.get<Paged<AuditLog>>(`${this.apiUrl}/audit-logs`, { params: this.params({ ...q }) });
  }

  getAuditLogMeta(): Observable<AuditLogMeta> {
    return this.http.get<AuditLogMeta>(`${this.apiUrl}/audit-logs/meta`);
  }

  // API keys
  getApiKeyResources(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/api-keys/resources`);
  }

  getApiKeys(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${this.apiUrl}/api-keys`);
  }

  createApiKey(payload: CreateApiKeyPayload): Observable<ApiKey> {
    return this.http.post<ApiKey>(`${this.apiUrl}/api-keys`, payload);
  }

  revokeApiKey(id: string): Observable<ApiKey> {
    return this.http.post<ApiKey>(`${this.apiUrl}/api-keys/${id}/revoke`, {});
  }

  // Webhooks
  getWebhookEvents(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/webhooks/events`);
  }

  getWebhooks(): Observable<WebhookEndpoint[]> {
    return this.http.get<WebhookEndpoint[]>(`${this.apiUrl}/webhooks`);
  }

  createWebhook(payload: WebhookPayload): Observable<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>(`${this.apiUrl}/webhooks`, payload);
  }

  updateWebhook(id: string, payload: WebhookPayload): Observable<WebhookEndpoint> {
    return this.http.put<WebhookEndpoint>(`${this.apiUrl}/webhooks/${id}`, payload);
  }

  deleteWebhook(id: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/webhooks/${id}`);
  }

  rotateWebhookSecret(id: string): Observable<{ secret: string }> {
    return this.http.post<{ secret: string }>(`${this.apiUrl}/webhooks/${id}/rotate-secret`, {});
  }

  testWebhook(id: string): Observable<WebhookDelivery> {
    return this.http.post<WebhookDelivery>(`${this.apiUrl}/webhooks/${id}/test`, {});
  }

  getWebhookDeliveries(q: { endpointId?: string; status?: string; page?: number; pageSize?: number }): Observable<Paged<WebhookDelivery>> {
    return this.http.get<Paged<WebhookDelivery>>(`${this.apiUrl}/webhooks/deliveries`, { params: this.params({ ...q }) });
  }

  resendDelivery(id: string): Observable<WebhookDelivery> {
    return this.http.post<WebhookDelivery>(`${this.apiUrl}/webhooks/deliveries/${id}/resend`, {});
  }

  // Import / export
  exportCsv(resource: ExportResource): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export/${resource}.csv`, { responseType: 'blob' });
  }

  importCsv(resource: ImportResource, csv: string, dryRun: boolean): Observable<ImportReport> {
    return this.http.post<ImportReport>(`${this.apiUrl}/import/${resource}`, { csv }, { params: this.params({ dryRun }) });
  }
}
