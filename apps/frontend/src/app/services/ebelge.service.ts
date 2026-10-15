import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EBelgeSettings, EBelgeStatus, EDocument, EDocumentDetail, IncomingDocument, ProviderInfo, RegistryAnswer } from '../models/ebelge.models';

/** WP5 e-Belge endpoints: integrator settings, archive, inbox, registry. */
@Injectable({ providedIn: 'root' })
export class EBelgeService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private params(filter: Record<string, string | null | undefined> = {}): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(filter)) if (v) p = p.set(k, v);
    return p;
  }

  // settings / status
  settings(): Observable<EBelgeSettings> {
    return this.http.get<EBelgeSettings>(`${this.api}/ebelge/settings`);
  }
  saveSettings(body: Record<string, unknown>): Observable<EBelgeSettings> {
    return this.http.put<EBelgeSettings>(`${this.api}/ebelge/settings`, body);
  }
  testConnection(): Observable<{ ok: boolean; message: string | null; provider: string; environment: string }> {
    return this.http.post<{ ok: boolean; message: string | null; provider: string; environment: string }>(`${this.api}/ebelge/settings/test`, {});
  }
  providers(): Observable<ProviderInfo[]> {
    return this.http.get<ProviderInfo[]>(`${this.api}/ebelge/providers`);
  }
  status(): Observable<EBelgeStatus> {
    return this.http.get<EBelgeStatus>(`${this.api}/ebelge/status`);
  }
  processOutbox(): Observable<{ processed: number; sent: number; failed: number }> {
    return this.http.post<{ processed: number; sent: number; failed: number }>(`${this.api}/ebelge/outbox/process`, {});
  }

  // registry
  checkCustomer(customerId: string): Observable<{ customerId: string; taxId: string | null; eInvoice: RegistryAnswer | null; eDespatch: RegistryAnswer | null; reason?: string }> {
    return this.http.post<{ customerId: string; taxId: string | null; eInvoice: RegistryAnswer | null; eDespatch: RegistryAnswer | null; reason?: string }>(`${this.api}/ebelge/customers/${customerId}/registry-check`, {});
  }

  // archive
  documents(filter: Record<string, string | null | undefined> = {}): Observable<EDocument[]> {
    return this.http.get<EDocument[]>(`${this.api}/e-documents`, { params: this.params(filter) });
  }
  detail(id: string): Observable<EDocumentDetail> {
    return this.http.get<EDocumentDetail>(`${this.api}/e-documents/${id}`);
  }
  bySource(type: string, id: string): Observable<EDocumentDetail | null> {
    return this.http.get<EDocumentDetail | null>(`${this.api}/e-documents/by-source/${type}/${id}`);
  }
  html(id: string): Observable<string> {
    return this.http.get(`${this.api}/e-documents/${id}/html`, { responseType: 'text' });
  }
  xml(id: string): Observable<Blob> {
    return this.http.get(`${this.api}/e-documents/${id}/xml`, { responseType: 'blob' });
  }
  pdf(id: string): Observable<Blob> {
    return this.http.get(`${this.api}/e-documents/${id}/pdf`, { responseType: 'blob' });
  }
  retry(id: string): Observable<unknown> {
    return this.http.post(`${this.api}/e-documents/${id}/retry`, {});
  }
  legalHold(id: string, hold: boolean, reason?: string | null): Observable<EDocumentDetail> {
    return this.http.put<EDocumentDetail>(`${this.api}/e-documents/${id}/legal-hold`, { hold, reason });
  }
  integrityCheck(): Observable<{ checked: number; mismatches: { id: string; ettn: string; documentNo: string | null }[]; noticeDeadline: string | null }> {
    return this.http.post<{ checked: number; mismatches: { id: string; ettn: string; documentNo: string | null }[]; noticeDeadline: string | null }>(`${this.api}/e-documents/integrity-check`, {});
  }
  archivePackage(from: string, to: string): Observable<Blob> {
    return this.http.get(`${this.api}/e-documents/archive-package`, { params: this.params({ from, to }), responseType: 'blob' });
  }

  // inbox
  inbox(filter: Record<string, string | null | undefined> = {}): Observable<IncomingDocument[]> {
    return this.http.get<IncomingDocument[]>(`${this.api}/ebelge/inbox`, { params: this.params(filter) });
  }
  incoming(id: string): Observable<IncomingDocument> {
    return this.http.get<IncomingDocument>(`${this.api}/ebelge/inbox/${id}`);
  }
  fetchInbox(): Observable<{ fetched: number; stored: number }> {
    return this.http.post<{ fetched: number; stored: number }>(`${this.api}/ebelge/inbox/fetch`, {});
  }
  match(id: string, body: { supplierId?: string | null; purchaseOrderId?: string | null; goodsReceiptId?: string | null }): Observable<IncomingDocument> {
    return this.http.put<IncomingDocument>(`${this.api}/ebelge/inbox/${id}/match`, body);
  }
  respond(id: string, response: 'KABUL' | 'RED', note?: string | null): Observable<IncomingDocument> {
    return this.http.post<IncomingDocument>(`${this.api}/ebelge/inbox/${id}/respond`, { response, note });
  }
  receiptAdvice(id: string, lines: { lineId: string; accepted: number; rejected?: number; reason?: string | null }[], note?: string | null): Observable<IncomingDocument> {
    return this.http.post<IncomingDocument>(`${this.api}/ebelge/inbox/${id}/receipt-advice`, { lines, note });
  }
  simulateIncoming(kind: string): Observable<{ fetched: number; stored: number }> {
    return this.http.post<{ fetched: number; stored: number }>(`${this.api}/ebelge/mock/incoming`, { kind });
  }

  /** Saves a blob with a file name (browser download). */
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

  /** Opens a blob (PDF) in a new tab. */
  openBlob(blob: Blob): void {
    if (typeof window === 'undefined') return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
