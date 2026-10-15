import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** WP6 API: costing, fiscal periods, period-end inventory, tax pre-reports, disposal, journal, traceability, prices. */
export interface FiscalPeriod {
  id: string;
  periodType: 'YEAR' | 'QUARTER';
  fiscalYear: number;
  quarter: number;
  label: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string | null;
  closedBy?: string | null;
  snapshotHash?: string | null;
  reopenCount: number;
  lastReopenReason?: string | null;
  pendingReopen?: { id: string } | null;
}
export interface CloseCheck { code: string; count: number; items: { id: string; label: string; date?: string | null }[] }
export interface ValuationRow {
  productId: string; productName: string; sku: string | null; inventoryClass: string; category: string | null; unitCode: string | null;
  warehouseId: string | null; warehouseName: string | null; lotNumber: string | null; expiryDate: string | null;
  quantity: number; unitCost: number; costValue: number; salesValue: number | null; costMissing: boolean;
}
export interface InventoryList {
  asOf: string; method: string; currency: string; breakdown: string; rows: ValuationRow[];
  totals: { quantity: number; costValue: number; salesValue: number };
  bookkeepingType: string | null; costMissing: boolean;
  countPolicy: { policy: string; maxYears: number; lastPhysicalCountDate: string | null; dueBy: string | null; overdue: boolean };
}
export interface VatGroup { rate: number; exemptionCode: string | null; withholdingCode: string | null; withholdingRate: number | null; base: number; tax: number; withheld: number; declared: number; documents: number }
export interface VatDoc { documentId: string; documentNo: string | null; documentDate: string | null; partyTaxId: string | null; partyName: string | null; base: number; tax: number; withheld: number; rates: number[] }
export interface Totals { base: number; tax: number; withheld: number }

@Injectable({ providedIn: 'root' })
export class AccountingService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private p(o: Record<string, unknown>): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    return params;
  }

  // periods
  periods(year?: number) { return this.http.get<{ fiscalYearStartMonth: number; stockLockDate: string | null; periods: FiscalPeriod[] }>(`${this.api}/fiscal-periods`, { params: this.p({ year }) }); }
  periodChecks(id: string) { return this.http.get<CloseCheck[]>(`${this.api}/fiscal-periods/${id}/checks`); }
  closePeriod(id: string) { return this.http.post<any>(`${this.api}/fiscal-periods/${id}/close`, {}); }
  reopenPeriod(id: string, reason: string) { return this.http.post<any>(`${this.api}/fiscal-periods/${id}/reopen`, { reason }); }
  periodSnapshot(id: string) { return this.http.get<any>(`${this.api}/fiscal-periods/${id}/snapshot`); }

  // costing
  costingSettings() { return this.http.get<any>(`${this.api}/costing/settings`); }
  changeMethod(body: { method: string; effectiveFrom: string; reason: string }) { return this.http.put<any>(`${this.api}/costing/method`, body); }
  setFxPolicy(policy: string) { return this.http.put<any>(`${this.api}/costing/fx-policy`, { policy }); }
  productCost(id: string) { return this.http.get<any>(`${this.api}/costing/products/${id}`); }
  landedCosts(goodsReceiptId?: string) { return this.http.get<any[]>(`${this.api}/costing/landed-costs`, { params: this.p({ goodsReceiptId }) }); }
  addLandedCost(body: Record<string, unknown>) { return this.http.post<any>(`${this.api}/costing/landed-costs`, body); }
  importOpeningCosts(csv: string) { return this.http.post<any>(`${this.api}/costing/opening-import`, { csv }); }

  // reports
  inventoryList(asOf: string, breakdown: string, warehouseId?: string) { return this.http.get<InventoryList>(`${this.api}/reports/inventory-list`, { params: this.p({ asOf, breakdown, warehouseId }) }); }
  stockLedger(productId: string, from?: string, to?: string) { return this.http.get<any>(`${this.api}/reports/stock-ledger`, { params: this.p({ productId, from, to }) }); }
  inventorySummary(asOf: string) { return this.http.get<any>(`${this.api}/reports/inventory-summary`, { params: this.p({ asOf }) }); }
  vat(period: string) { return this.http.get<any>(`${this.api}/reports/vat`, { params: this.p({ period }) }); }
  vatWithholding(period: string) { return this.http.get<any>(`${this.api}/reports/vat-withholding`, { params: this.p({ period }) }); }
  vatImpact(period: string) { return this.http.get<any>(`${this.api}/reports/vat-impact-movements`, { params: this.p({ period }) }); }
  wastage(from?: string, to?: string) { return this.http.get<any>(`${this.api}/reports/wastage`, { params: this.p({ from, to }) }); }
  impairmentCandidates(date: string) { return this.http.get<any>(`${this.api}/reports/impairment-candidates`, { params: this.p({ date }) }); }
  postImpairment(valuationDate: string, productIds: string[]) { return this.http.post<any>(`${this.api}/impairment`, { valuationDate, productIds }); }
  traceability(q: { lotNumber?: string; productId?: string; serial?: string; lotId?: string }) { return this.http.get<any>(`${this.api}/reports/traceability`, { params: this.p(q) }); }
  disposalRatio(year?: number) { return this.http.get<any>(`${this.api}/reports/disposal-ratio`, { params: this.p({ year }) }); }

  /** Printable HTML (opens in a new tab with the auth header): inventory list, summary, VAT, count report, disposal, impairment sheet, labels. */
  html(path: string, params: Record<string, unknown> = {}) { return this.http.get(`${this.api}/${path}`, { params: this.p(params), responseType: 'text' }); }
  blob(path: string, params: Record<string, unknown> = {}): Observable<HttpResponse<Blob>> { return this.http.get(`${this.api}/${path}`, { params: this.p(params), responseType: 'blob', observe: 'response' }); }

  // journal
  mappings() { return this.http.get<any>(`${this.api}/accounting/mappings`); }
  saveMapping(body: Record<string, unknown>, id?: string) { return id ? this.http.put<any>(`${this.api}/accounting/mappings/${id}`, body) : this.http.post<any>(`${this.api}/accounting/mappings`, body); }
  deleteMapping(id: string) { return this.http.delete<any>(`${this.api}/accounting/mappings/${id}`); }
  journalBatches() { return this.http.get<any[]>(`${this.api}/accounting/journal-batches`); }
  journalExport(from: string, to: string, exportBatchId?: string) { return this.http.get<any>(`${this.api}/accounting/journal-export`, { params: this.p({ from, to, exportBatchId }) }); }

  // disposals
  disposals(status?: string) { return this.http.get<any[]>(`${this.api}/disposals`, { params: this.p({ status }) }); }
  createDisposal(body: Record<string, unknown>) { return this.http.post<any>(`${this.api}/disposals`, body); }
  transitionDisposal(id: string, body: Record<string, unknown>) { return this.http.post<any>(`${this.api}/disposals/${id}/transition`, body); }

  // lots / food
  quarantineSuggestions() { return this.http.get<any>(`${this.api}/lots/quarantine-suggestions`); }
  recalls() { return this.http.get<any[]>(`${this.api}/lots/recalls`); }
  recall(body: { productId: string; lotNumbers: string[]; reason: string; isMock?: boolean }) { return this.http.post<any>(`${this.api}/lots/recall`, body); }
  updateRecall(id: string, body: Record<string, unknown>) { return this.http.patch<any>(`${this.api}/lots/recalls/${id}`, body); }
  mockRecallStatus() { return this.http.get<any>(`${this.api}/lots/mock-recall-status`); }
  setLotStatus(body: { productId: string; lotNumber: string; status: string; reason?: string }) { return this.http.post<any>(`${this.api}/lots/status`, body); }
  transfer(productId: string, fromWarehouse: string, toWarehouse: string, quantity: number, lotId: string) {
    return this.http.post<any>(`${this.api}/warehouses/transfer`, { productId, fromWarehouse, toWarehouse, quantity, lotId, note: 'Karantina' });
  }

  // gs1 / prices
  parseGs1(code: string) { return this.http.post<any>(`${this.api}/gs1/parse`, { code }); }
  nextGtin() { return this.http.get<any>(`${this.api}/gs1/next-gtin`); }
  priceReference(productId: string) { return this.http.get<any>(`${this.api}/prices/${productId}/reference`); }

  /** Opens server-rendered HTML (with auth) in a new browser tab for printing / saving as PDF. */
  openPrintable(path: string, params: Record<string, unknown> = {}): void {
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    this.html(path, params).subscribe({
      next: (html) => {
        if (!win) return;
        win.document.open();
        win.document.write(html);
        win.document.close();
      },
      error: () => win?.close(),
    });
  }

  /** Downloads a file response (xlsx / csv). */
  download(path: string, params: Record<string, unknown>, fallbackName: string): void {
    this.blob(path, params).subscribe((res) => {
      const cd = res.headers.get('Content-Disposition') || '';
      const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || fallbackName;
      const url = URL.createObjectURL(res.body as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }
}
