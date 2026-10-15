import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';
import { ExemptionCode, OtvCode, TaxCatalog, TaxQuote, WithholdingCode } from '../models/tax.models';
import { Order, PurchaseOrder } from '../models/inventory.models';

/** WP3 tax engine API: rate catalog, UBL-TR code lists (cached), quotes, tax point, TCMB rates. */
@Injectable({ providedIn: 'root' })
export class TaxService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;
  private exemptions$?: Observable<ExemptionCode[]>;
  private withholdings$?: Observable<WithholdingCode[]>;
  private otv$?: Observable<OtvCode[]>;

  catalog(date?: string): Observable<TaxCatalog> {
    return this.http.get<TaxCatalog>(`${this.api}/tax-rates/catalog`, { params: date ? new HttpParams().set('date', date) : undefined });
  }

  exemptions(): Observable<ExemptionCode[]> {
    return (this.exemptions$ ??= this.http.get<ExemptionCode[]>(`${this.api}/tax-codes/exemptions`).pipe(shareReplay(1)));
  }

  withholdings(): Observable<WithholdingCode[]> {
    return (this.withholdings$ ??= this.http.get<WithholdingCode[]>(`${this.api}/tax-codes/withholdings`).pipe(shareReplay(1)));
  }

  otvCodes(): Observable<OtvCode[]> {
    return (this.otv$ ??= this.http.get<OtvCode[]>(`${this.api}/tax-codes/otv`).pipe(shareReplay(1)));
  }

  quoteOrder(payload: unknown): Observable<TaxQuote> {
    return this.http.post<TaxQuote>(`${this.api}/orders/quote`, payload);
  }

  quotePurchaseOrder(payload: unknown): Observable<TaxQuote> {
    return this.http.post<TaxQuote>(`${this.api}/purchase-orders/quote`, payload);
  }

  setOrderTaxPoint(id: string, body: { taxPointDate?: string; shippedAt?: string }): Observable<Order> {
    return this.http.put<Order>(`${this.api}/orders/${id}/tax-point`, body);
  }

  fetchTcmb(date?: string): Observable<{ date: string; bulletinNo: string | null; count: number }> {
    return this.http.post<{ date: string; bulletinNo: string | null; count: number }>(`${this.api}/exchange-rates/tcmb/fetch`, date ? { date } : {});
  }

  updateCompanyTaxSettings(body: { isImporterOrOreProducer?: boolean; fxAutoFetch?: boolean }): Observable<unknown> {
    return this.http.put(`${this.api}/company`, body);
  }

  updatePurchaseOrderCustoms(id: string, body: Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.api}/purchase-orders/${id}`, body);
  }
}
