import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { SectorRule } from '@stok/tr-compliance';
import { Observable, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CompanyInfo,
  ComplianceReport,
  CustomerAddress,
  District,
  EBelgeProfile,
  LegalParameter,
  ObligationReport,
  Province,
  TaxOffice,
} from '../models/inventory.models';

/**
 * Turkish reference data (cached), company fiscal identity, e-Belge profile,
 * compliance panel and (super admin) legal parameters.
 */
export interface ObligationsResponse {
  profile: EBelgeProfile;
  report: ObligationReport;
  sources: Record<string, string>;
  sectorRules: SectorRule[];
}

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private provinces$?: Observable<Province[]>;
  private districts = new Map<string, Observable<District[]>>();
  private offices = new Map<string, Observable<TaxOffice[]>>();

  /** Last compliance report (dashboard banners, settings card). */
  readonly report = signal<ComplianceReport | null>(null);

  // ---------------------------------------------------------------- reference data
  getProvinces(): Observable<Province[]> {
    return (this.provinces$ ??= this.http.get<Province[]>(`${this.api}/refdata/provinces`).pipe(shareReplay(1)));
  }

  getDistricts(provinceCode: string | null | undefined): Observable<District[]> {
    if (!provinceCode) return of([]);
    let obs = this.districts.get(provinceCode);
    if (!obs) {
      obs = this.http.get<District[]>(`${this.api}/refdata/districts`, { params: { provinceCode } }).pipe(shareReplay(1));
      this.districts.set(provinceCode, obs);
    }
    return obs;
  }

  getTaxOffices(provinceCode: string | null | undefined): Observable<TaxOffice[]> {
    if (!provinceCode) return of([]);
    let obs = this.offices.get(provinceCode);
    if (!obs) {
      obs = this.http.get<TaxOffice[]>(`${this.api}/refdata/tax-offices`, { params: { provinceCode } }).pipe(shareReplay(1));
      this.offices.set(provinceCode, obs);
    }
    return obs;
  }

  // ---------------------------------------------------------------- company
  getCompany(): Observable<CompanyInfo> {
    return this.http.get<CompanyInfo>(`${this.api}/company`);
  }

  updateFiscal(data: Partial<CompanyInfo>): Observable<CompanyInfo> {
    return this.http.patch<CompanyInfo>(`${this.api}/company/fiscal`, data);
  }

  getProfile(): Observable<EBelgeProfile> {
    return this.http.get<EBelgeProfile>(`${this.api}/company/ebelge/profile`);
  }

  saveProfile(data: EBelgeProfile): Observable<EBelgeProfile> {
    return this.http.put<EBelgeProfile>(`${this.api}/company/ebelge/profile`, data);
  }

  getObligations(): Observable<ObligationsResponse> {
    return this.http.get<ObligationsResponse>(`${this.api}/company/ebelge/obligations`);
  }

  loadCompliance(asOf?: string): Observable<ComplianceReport> {
    const params = asOf ? new HttpParams().set('asOf', asOf) : undefined;
    return this.http.get<ComplianceReport>(`${this.api}/company/compliance`, { params }).pipe(tap((r) => this.report.set(r)));
  }

  // ---------------------------------------------------------------- customer addresses
  listCustomerAddresses(customerId: string): Observable<CustomerAddress[]> {
    return this.http.get<CustomerAddress[]>(`${this.api}/customers/${customerId}/addresses`);
  }

  addCustomerAddress(customerId: string, data: CustomerAddress): Observable<CustomerAddress> {
    return this.http.post<CustomerAddress>(`${this.api}/customers/${customerId}/addresses`, data);
  }

  updateCustomerAddress(customerId: string, id: string, data: CustomerAddress): Observable<CustomerAddress> {
    return this.http.put<CustomerAddress>(`${this.api}/customers/${customerId}/addresses/${id}`, data);
  }

  deleteCustomerAddress(customerId: string, id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.api}/customers/${customerId}/addresses/${id}`);
  }

  // ---------------------------------------------------------------- legal parameters (super admin)
  listLegalParameters(key?: string): Observable<LegalParameter[]> {
    const params = key ? new HttpParams().set('key', key) : undefined;
    return this.http.get<LegalParameter[]>(`${this.api}/admin/legal-parameters`, { params });
  }

  createLegalParameter(data: Partial<LegalParameter>): Observable<LegalParameter> {
    return this.http.post<LegalParameter>(`${this.api}/admin/legal-parameters`, data);
  }
}
