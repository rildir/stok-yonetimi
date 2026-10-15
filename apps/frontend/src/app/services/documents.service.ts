import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Despatch,
  DocumentCounter,
  DocumentSeries,
  DocumentSummary,
  ExpenseVoucher,
  GoodsReceipt,
  Invoice,
  OrderDocuments,
  ReturnDoc,
  UninvoicedRow,
} from '../models/documents.models';

/** WP4 document endpoints (despatches, invoices, returns, goods receipts, expense vouchers, series). */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private params(filter: Record<string, string | null | undefined> = {}): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(filter)) if (v) p = p.set(k, v);
    return p;
  }

  // despatches
  despatches(filter: Record<string, string | null | undefined> = {}): Observable<Despatch[]> {
    return this.http.get<Despatch[]>(`${this.api}/despatches`, { params: this.params(filter) });
  }
  despatch(id: string): Observable<Despatch> {
    return this.http.get<Despatch>(`${this.api}/despatches/${id}`);
  }
  createDespatch(body: Record<string, unknown>): Observable<Despatch> {
    return this.http.post<Despatch>(`${this.api}/despatches`, body);
  }
  despatchFromOrder(orderId: string, body: Record<string, unknown>): Observable<Despatch> {
    return this.http.post<Despatch>(`${this.api}/orders/${orderId}/despatch`, body);
  }
  updateDespatch(id: string, body: Record<string, unknown>): Observable<Despatch> {
    return this.http.put<Despatch>(`${this.api}/despatches/${id}`, body);
  }
  deleteDespatch(id: string): Observable<unknown> {
    return this.http.delete(`${this.api}/despatches/${id}`);
  }
  approveDespatch(id: string, body: Record<string, unknown> = {}): Observable<Despatch> {
    return this.http.post<Despatch>(`${this.api}/despatches/${id}/approve`, body);
  }
  receiveDespatch(id: string, body: Record<string, unknown> = {}): Observable<Despatch> {
    return this.http.post<Despatch>(`${this.api}/despatches/${id}/receive`, body);
  }

  // invoices
  invoices(filter: Record<string, string | null | undefined> = {}): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(`${this.api}/invoices`, { params: this.params(filter) });
  }
  invoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.api}/invoices/${id}`);
  }
  invoiceFromOrder(orderId: string, body: Record<string, unknown> = {}): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.api}/orders/${orderId}/invoice`, body);
  }
  invoiceFromDespatches(despatchIds: string[], body: Record<string, unknown> = {}): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.api}/invoices/from-despatches`, { ...body, despatchIds });
  }
  updateInvoice(id: string, body: Record<string, unknown>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.api}/invoices/${id}`, body);
  }
  deleteInvoice(id: string): Observable<unknown> {
    return this.http.delete(`${this.api}/invoices/${id}`);
  }
  issueInvoice(id: string, body: Record<string, unknown>): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.api}/invoices/${id}/issue`, body);
  }
  cancelInvoice(id: string, reason: string, notice: { noticeChannel?: string | null; noticeDate?: string | null; noticeRef?: string | null } = {}): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.api}/invoices/${id}/cancel`, { reason, ...notice });
  }

  // returns
  returns(filter: Record<string, string | null | undefined> = {}): Observable<ReturnDoc[]> {
    return this.http.get<ReturnDoc[]>(`${this.api}/returns`, { params: this.params(filter) });
  }
  createReturn(body: Record<string, unknown>): Observable<ReturnDoc> {
    return this.http.post<ReturnDoc>(`${this.api}/returns`, body);
  }
  completeReturn(id: string, body: Record<string, unknown> = {}): Observable<ReturnDoc> {
    return this.http.post<ReturnDoc>(`${this.api}/returns/${id}/complete`, body);
  }
  updateRefund(id: string, body: Record<string, unknown>): Observable<ReturnDoc> {
    return this.http.put<ReturnDoc>(`${this.api}/returns/${id}/refund`, body);
  }
  deleteReturn(id: string): Observable<unknown> {
    return this.http.delete(`${this.api}/returns/${id}`);
  }

  // goods receipts
  goodsReceipts(filter: Record<string, string | null | undefined> = {}): Observable<GoodsReceipt[]> {
    return this.http.get<GoodsReceipt[]>(`${this.api}/goods-receipts`, { params: this.params(filter) });
  }
  createGoodsReceipt(purchaseOrderId: string, body: Record<string, unknown>): Observable<GoodsReceipt> {
    return this.http.post<GoodsReceipt>(`${this.api}/purchase-orders/${purchaseOrderId}/goods-receipts`, body);
  }
  completeGoodsReceipt(id: string): Observable<GoodsReceipt> {
    return this.http.post<GoodsReceipt>(`${this.api}/goods-receipts/${id}/complete`, {});
  }
  setSupplierInvoice(id: string, body: Record<string, unknown>): Observable<GoodsReceipt> {
    return this.http.put<GoodsReceipt>(`${this.api}/goods-receipts/${id}/supplier-invoice`, body);
  }
  ownDespatch(id: string, body: Record<string, unknown>): Observable<Despatch> {
    return this.http.post<Despatch>(`${this.api}/goods-receipts/${id}/own-despatch`, body);
  }
  deleteGoodsReceipt(id: string): Observable<unknown> {
    return this.http.delete(`${this.api}/goods-receipts/${id}`);
  }

  // expense vouchers
  vouchers(filter: Record<string, string | null | undefined> = {}): Observable<ExpenseVoucher[]> {
    return this.http.get<ExpenseVoucher[]>(`${this.api}/expense-vouchers`, { params: this.params(filter) });
  }
  createVoucher(body: Record<string, unknown>): Observable<ExpenseVoucher> {
    return this.http.post<ExpenseVoucher>(`${this.api}/expense-vouchers`, body);
  }
  updateVoucher(id: string, body: Record<string, unknown>): Observable<ExpenseVoucher> {
    return this.http.put<ExpenseVoucher>(`${this.api}/expense-vouchers/${id}`, body);
  }
  deleteVoucher(id: string): Observable<unknown> {
    return this.http.delete(`${this.api}/expense-vouchers/${id}`);
  }
  issueVoucher(id: string, body: Record<string, unknown>): Observable<ExpenseVoucher> {
    return this.http.post<ExpenseVoucher>(`${this.api}/expense-vouchers/${id}/issue`, body);
  }
  cancelVoucher(id: string, reason: string): Observable<ExpenseVoucher> {
    return this.http.post<ExpenseVoucher>(`${this.api}/expense-vouchers/${id}/cancel`, { reason });
  }
  signedCopy(id: string, received: boolean): Observable<ExpenseVoucher> {
    return this.http.put<ExpenseVoucher>(`${this.api}/expense-vouchers/${id}/signed-copy`, { received });
  }

  // orders
  orderDocuments(orderId: string): Observable<OrderDocuments> {
    return this.http.get<OrderDocuments>(`${this.api}/orders/${orderId}/documents`);
  }
  setOkcReceipt(orderId: string, body: { okcReceiptNo?: string | null; okcReceiptDate?: string | null }): Observable<unknown> {
    return this.http.put(`${this.api}/orders/${orderId}/okc-receipt`, body);
  }

  /** Company settings relevant to documents (stockDeductOn, eDocumentMode, producerReceiptEnabled). */
  company(): Observable<{ stockDeductOn?: string; eDocumentMode?: string; producerReceiptEnabled?: boolean; country?: string }> {
    return this.http.get<{ stockDeductOn?: string; eDocumentMode?: string; producerReceiptEnabled?: boolean; country?: string }>(`${this.api}/company`);
  }

  updateCompany(body: Record<string, unknown>): Observable<unknown> {
    return this.http.put(`${this.api}/company`, body);
  }

  // series / compliance
  series(): Observable<DocumentSeries[]> {
    return this.http.get<DocumentSeries[]>(`${this.api}/document-series`);
  }
  counters(): Observable<DocumentCounter[]> {
    return this.http.get<DocumentCounter[]>(`${this.api}/document-series/counters`);
  }
  createSeries(body: Record<string, unknown>): Observable<DocumentSeries> {
    return this.http.post<DocumentSeries>(`${this.api}/document-series`, body);
  }
  updateSeries(id: string, body: Record<string, unknown>): Observable<DocumentSeries> {
    return this.http.put<DocumentSeries>(`${this.api}/document-series/${id}`, body);
  }
  uninvoiced(): Observable<{ limitDays: number; warnDays: number; today: string; rows: UninvoicedRow[] }> {
    return this.http.get<{ limitDays: number; warnDays: number; today: string; rows: UninvoicedRow[] }>(`${this.api}/compliance/uninvoiced-deliveries`);
  }
  receiptsWithoutInvoice(): Observable<any[]> {
    return this.http.get<any[]>(`${this.api}/compliance/receipts-without-invoice`);
  }
  pendingVouchers(): Observable<{ drafts: any[]; receiptsMissingVoucher: any[] }> {
    return this.http.get<{ drafts: any[]; receiptsMissingVoucher: any[] }>(`${this.api}/compliance/pending-expense-vouchers`);
  }
  summary(): Observable<DocumentSummary> {
    return this.http.get<DocumentSummary>(`${this.api}/compliance/document-summary`);
  }

  /**
   * Opens the printable (always Turkish) HTML of a document in a new window and starts the browser's
   * print dialog ("Save as PDF"). `path` e.g. `despatches/<id>/print`.
   */
  print(path: string): void {
    if (typeof window === 'undefined') return;
    const w = window.open('', '_blank');
    this.http.get(`${this.api}/${path}`, { responseType: 'text' }).subscribe({
      next: (html) => {
        if (!w) return;
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 300);
      },
      error: () => w?.close(),
    });
  }
}

/** Server error message (already localized by the API) or a fallback. */
export function apiError(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string | string[] } };
  const m = e?.error?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
}

/** 'YYYY-MM-DDTHH:mm' of now in the browser (for datetime-local inputs). */
export function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
