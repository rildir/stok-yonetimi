import { Component, inject, ViewChild, signal, computed, OnInit, effect, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastComponent } from '../shared/toast/toast.component';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { I18nService, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe } from '../../i18n';
import { TaxRate, ExchangeRate, Unit } from '../../models/inventory.models';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { isStrongPassword, maxDecimalsForUnece, UNECE_UNIT_CODES } from '@stok/tr-compliance';
import { FiscalSettingsComponent } from './fiscal-settings.component';
import { TaxSettingsComponent, TcmbPanelComponent } from './tax-settings.component';
import { InventoryComplianceSettingsComponent } from './inventory-compliance-settings.component';
import { EBelgeSettingsComponent } from './ebelge-settings.component';
import { DocumentSettingsComponent } from './document-settings.component';
import { LegalParametersComponent } from './legal-parameters.component';

/** Empty passes (optional field); otherwise the KVKK-guide password policy. */
const strongPasswordValidator = (c: AbstractControl): ValidationErrors | null => (c.value && !isStrongPassword(c.value) ? { weakPassword: true } : null);

type SettingsTab = 'profile' | 'categories' | 'users' | 'company' | 'fiscal' | 'ebelge' | 'documents' | 'compliance' | 'legalParams' | 'taxRates' | 'exchangeRates' | 'units' | 'dashboard';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, FiscalSettingsComponent, EBelgeSettingsComponent, LegalParametersComponent, InventoryComplianceSettingsComponent, TaxSettingsComponent, TcmbPanelComponent, DocumentSettingsComponent],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'settings.account' | t }}</h1>
        <p>{{ 'settings.accountDesc' | t }}</p>
      </div>
    </header>

    <nav class="tabs settings-tabs" role="tablist" [attr.aria-label]="'settings.account' | t">
      <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'dashboard'" [attr.aria-selected]="activeTab() === 'dashboard'" (click)="changeTab('dashboard')">{{ 'settings.overview' | t }}</button>
      <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'profile'" [attr.aria-selected]="activeTab() === 'profile'" (click)="changeTab('profile')">{{ 'settings.tab.profile' | t }}</button>
      <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'categories'" [attr.aria-selected]="activeTab() === 'categories'" (click)="changeTab('categories')">{{ 'settings.tab.categories' | t }}</button>
      <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'units'" [attr.aria-selected]="activeTab() === 'units'" (click)="changeTab('units')">{{ 'settings.tab.units' | t }}</button>
      @if (ui.userProfile()?.role === 'admin') {
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'users'" [attr.aria-selected]="activeTab() === 'users'" (click)="changeTab('users')">{{ 'settings.tab.users' | t }}</button>
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'company'" [attr.aria-selected]="activeTab() === 'company'" (click)="changeTab('company')">{{ 'settings.tab.company' | t }}</button>
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'fiscal'" [attr.aria-selected]="activeTab() === 'fiscal'" (click)="changeTab('fiscal')">{{ 'settings.tab.fiscal' | t }}</button>
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'ebelge'" [attr.aria-selected]="activeTab() === 'ebelge'" (click)="changeTab('ebelge')">{{ 'settings.tab.ebelge' | t }}</button>
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'documents'" [attr.aria-selected]="activeTab() === 'documents'" (click)="changeTab('documents')">{{ 'settings.tab.documents' | t }}</button>
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'compliance'" [attr.aria-selected]="activeTab() === 'compliance'" (click)="changeTab('compliance')">{{ 'settings.tab.compliance' | t }}</button>
        @if (ui.userProfile()?.isSuperAdmin) {
          <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'legalParams'" [attr.aria-selected]="activeTab() === 'legalParams'" (click)="changeTab('legalParams')">{{ 'settings.tab.legalParams' | t }}</button>
        }
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'taxRates'" [attr.aria-selected]="activeTab() === 'taxRates'" (click)="changeTab('taxRates')">{{ 'settings.tab.taxRates' | t }}</button>
        <button type="button" class="tab" role="tab" [class.active]="activeTab() === 'exchangeRates'" [attr.aria-selected]="activeTab() === 'exchangeRates'" (click)="changeTab('exchangeRates')">{{ 'settings.tab.exchangeRates' | t }}</button>
      }
    </nav>

    <div class="settings-layout">
      @if (activeTab() === 'dashboard') {
        <div class="settings-hub">
          <button type="button" class="settings-hub-card" (click)="changeTab('profile')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.profile' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.profileDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('categories')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.categories' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.categoriesDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('units')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.units' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.unitsDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          @if (ui.userProfile()?.role === 'admin') {
          <button type="button" class="settings-hub-card" (click)="changeTab('users')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.users' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.usersDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('company')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.company' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.companyDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('fiscal')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.fiscal' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.fiscalDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('ebelge')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.ebelge' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.ebelgeDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('compliance')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v4l4 9a2 2 0 0 1-1.8 3H6.8A2 2 0 0 1 5 16l4-9Z"/><path d="M7 12h10"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.compliance' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.complianceDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          @if (ui.userProfile()?.isSuperAdmin) {
          <button type="button" class="settings-hub-card" (click)="changeTab('legalParams')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.legalParams' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.legalParamsDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          }
          <button type="button" class="settings-hub-card" (click)="changeTab('taxRates')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.taxRates' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.taxRatesDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <button type="button" class="settings-hub-card" (click)="changeTab('exchangeRates')">
            <span class="settings-hub-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg></span>
            <span class="settings-hub-text">
              <span class="settings-hub-title">{{ 'settings.tab.exchangeRates' | t }}</span>
              <span class="settings-hub-desc">{{ 'settings.card.exchangeRatesDesc' | t }}</span>
            </span>
            <svg class="settings-hub-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          }
        </div>
      }

      <div class="settings-content">

        <!-- COMPANY SETTINGS TAB (Admin) -->
        @if (activeTab() === 'company') {
          <div class="settings-card settings-card-md">
            <h3 class="card-title">{{ 'settings.company.title' | t }}</h3>
            <p class="card-subtitle settings-card-sub">{{ 'settings.company.subtitle' | t }}</p>
            <form [formGroup]="companyForm" (ngSubmit)="saveCompany()">
              <div class="form-group" [class.has-error]="companyForm.get('name')?.invalid && companyForm.get('name')?.touched">
                <label for="">{{ 'settings.company.name' | t }}</label>
                <input type="text" formControlName="name" />
              </div>
              <div class="settings-form-grid">
                <div class="form-group">
                  <label for="">{{ 'settings.company.country' | t }}</label>
                  <select formControlName="country">
                    @for (c of countries; track c.code) { <option [value]="c.code">{{ 'settings.country.' + c.code | t }} ({{ c.code }})</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="">{{ 'settings.company.defaultLanguage' | t }}</label>
                  <select formControlName="defaultLanguage">
                    @for (l of languages; track l) { <option [value]="l">{{ 'settings.lang.' + l | t }}</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="">{{ 'settings.company.baseCurrency' | t }}</label>
                  <select formControlName="baseCurrency">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="">{{ 'settings.company.timezone' | t }}</label>
                  <select formControlName="timezone">
                    @for (tz of timezones; track tz) { <option [value]="tz">{{ 'settings.tz.' + tz | t }} ({{ tz }})</option> }
                  </select>
                </div>
              </div>
              <div class="form-group settings-check">
                <input id="pricesIncludeTax" type="checkbox" formControlName="pricesIncludeTax" />
                <label for="pricesIncludeTax">{{ 'settings.company.pricesIncludeTax' | t }}</label>
              </div>
              <p class="field-hint settings-check-hint">{{ 'settings.company.pricesIncludeTaxHint' | t }}</p>
              <div class="form-group settings-narrow" [class.has-error]="companyForm.get('expiryAlertDays')?.invalid && companyForm.get('expiryAlertDays')?.touched">
                <label for="expiryAlertDays">{{ 'settings.company.expiryAlertDays' | t }}</label>
                <input id="expiryAlertDays" type="number" min="0" max="3650" step="1" formControlName="expiryAlertDays" />
                <span class="field-hint">{{ 'settings.company.expiryAlertDaysHint' | t }}</span>
              </div>
              <div class="settings-divider">
                <button type="submit" class="btn btn-primary" [disabled]="companyForm.invalid || companyForm.pristine || isSavingCompany()">
                  @if (isSavingCompany()) { {{ 'settings.saving' | t }} } @else { {{ 'settings.company.save' | t }} }
                </button>
              </div>
            </form>
          </div>
        }

        <!-- FISCAL / E-BELGE / LEGAL PARAMETERS (WP1) -->
        @if (activeTab() === 'fiscal' && isAdmin()) { <app-fiscal-settings></app-fiscal-settings> }
        @if (activeTab() === 'ebelge' && isAdmin()) { <app-ebelge-settings></app-ebelge-settings> }
        @if (activeTab() === 'documents' && isAdmin()) { <app-document-settings></app-document-settings> }
        @if (activeTab() === 'compliance' && isAdmin()) { <app-inventory-compliance-settings></app-inventory-compliance-settings> }
        @if (activeTab() === 'legalParams' && ui.userProfile()?.isSuperAdmin) { <app-legal-parameters></app-legal-parameters> }

        <!-- TAX RATES TAB (Admin) -->
        @if (activeTab() === 'taxRates' && isAdmin() && isTrCompany()) {
          <app-tax-settings [importerInitial]="!!ui.userProfile()?.company?.isImporterOrOreProducer" [designatedInitial]="!!ui.userProfile()?.company?.isDesignatedBuyer"></app-tax-settings>
        }
        @if (activeTab() === 'taxRates' && isAdmin() && !isTrCompany()) {
          <div class="settings-card settings-card-lg">
            <h3 class="card-title">{{ 'settings.taxRates.title' | t }}</h3>
            <p class="card-subtitle settings-card-sub">{{ 'settings.taxRates.subtitle' | t }}</p>
            <form [formGroup]="taxForm" (ngSubmit)="saveTaxRate()">
              <div class="settings-form-grid">
                <div class="form-group" [class.has-error]="taxForm.get('name')?.invalid && taxForm.get('name')?.touched">
                  <label for="taxName">{{ 'settings.taxRates.name' | t }}</label>
                  <input id="taxName" type="text" formControlName="name" [placeholder]="'settings.taxRates.namePh' | t" />
                </div>
                <div class="form-group" [class.has-error]="taxForm.get('rate')?.invalid && taxForm.get('rate')?.touched">
                  <label for="taxRate">{{ 'finance.taxRate' | t }} (%)</label>
                  <input id="taxRate" type="number" min="0" max="100" step="0.01" formControlName="rate" />
                  @if (taxForm.get('rate')?.invalid && taxForm.get('rate')?.touched) { <span class="error-msg">{{ 'settings.taxRates.rateErr' | t }}</span> }
                </div>
                <div class="form-group">
                  <label for="taxCountry">{{ 'settings.company.country' | t }}</label>
                  <select id="taxCountry" formControlName="country">
                    <option value="">{{ 'settings.taxRates.anyCountry' | t }}</option>
                    @for (c of countries; track c.code) { <option [value]="c.code">{{ 'settings.country.' + c.code | t }} ({{ c.code }})</option> }
                  </select>
                </div>
                <div class="form-group settings-check settings-check-pad">
                  <input id="taxDefault" type="checkbox" formControlName="isDefault" />
                  <label for="taxDefault">{{ 'finance.defaultTax' | t }}</label>
                </div>
              </div>
              <div class="settings-form-actions">
                <button type="submit" class="btn btn-primary" [disabled]="taxForm.invalid || isSavingTax()">
                  @if (isSavingTax()) { {{ 'settings.saving' | t }} } @else { {{ (editTaxId() ? 'common.save' : 'settings.taxRates.add') | t }} }
                </button>
                @if (editTaxId()) { <button type="button" class="btn btn-secondary" (click)="resetTaxForm()">{{ 'common.cancel' | t }}</button> }
              </div>
            </form>
            <div class="table-scroll settings-table">
              @if (isLoadingTax()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (taxRates().length === 0) {
                <div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg></div><p class="empty-state-title">{{ 'settings.taxRates.empty' | t }}</p></div>
              } @else {
                <table class="table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.taxRates.name' | t }}</th>
                      <th class="num">{{ 'finance.taxRate' | t }}</th>
                      <th>{{ 'settings.company.country' | t }}</th>
                      <th>{{ 'finance.defaultTax' | t }}</th>
                      <th class="th-actions">{{ 'common.actions' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (tr of taxRates(); track tr.id) {
                      <tr>
                        <td [attr.data-label]="'settings.taxRates.name' | t"><strong>{{ tr.name }}</strong></td>
                        <td class="num" [attr.data-label]="'finance.taxRate' | t">%{{ tr.rate | num }}</td>
                        <td [attr.data-label]="'settings.company.country' | t">{{ tr.country || '-' }}</td>
                        <td [attr.data-label]="'finance.defaultTax' | t">
                          @if (tr.isDefault) { <span class="badge badge-instock">{{ 'finance.defaultTax' | t }}</span> }
                          @else { <button type="button" class="btn btn-secondary btn-sm" (click)="setDefaultTax(tr)">{{ 'settings.taxRates.setDefault' | t }}</button> }
                        </td>
                        <td class="td-actions">
                          <button class="edit-btn" [title]="'common.edit' | t" (click)="editTax(tr)"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                          <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteTax(tr)"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        }

        <!-- UNITS TAB -->
        @if (activeTab() === 'units') {
          <div class="settings-card settings-card-lg">
            <h3 class="card-title">{{ 'settings.units.title' | t }}</h3>
            <p class="card-subtitle settings-card-sub">{{ 'settings.units.subtitle' | t }}</p>
            @if (canManageUnits()) {
              <form [formGroup]="unitForm" (ngSubmit)="saveUnit()">
                <div class="settings-form-grid">
                  <div class="form-group" [class.has-error]="unitForm.get('code')?.invalid && unitForm.get('code')?.touched">
                    <label for="unitCode">{{ 'settings.units.code' | t }}</label>
                    <input id="unitCode" type="text" formControlName="code" [placeholder]="'settings.units.codePh' | t" [readonly]="editUnitStandard()" />
                    @if (editUnitStandard()) { <span class="field-hint">{{ 'settings.units.codeLocked' | t }}</span> }
                  </div>
                  <div class="form-group" [class.has-error]="unitForm.get('name')?.invalid && unitForm.get('name')?.touched">
                    <label for="unitName">{{ 'settings.units.name' | t }}</label>
                    <input id="unitName" type="text" formControlName="name" [placeholder]="'settings.units.namePh' | t" />
                  </div>
                  <div class="form-group">
                    <label for="unitUnece">{{ 'units.uneceCode' | t }}</label>
                    <select id="unitUnece" formControlName="uneceCode" (change)="onUneceChange()">
                      <option value="">—</option>
                      @for (g of uneceGroups; track g.group) {
                        <optgroup [label]="('units.uneceGroup.' + g.group) | t">
                          @for (c of g.codes; track c.code) {
                            <option [value]="c.code">{{ c.code }} · {{ ('units.unece.' + c.code) | t }}</option>
                          }
                        </optgroup>
                      }
                    </select>
                    <span class="field-hint">{{ 'units.uneceHint' | t }}</span>
                  </div>
                  <div class="form-group">
                    <label for="unitDecimals">{{ 'units.decimals' | t }}</label>
                    <select id="unitDecimals" formControlName="decimals">
                      @for (d of [0, 1, 2, 3]; track d) { <option [ngValue]="d" [disabled]="d > maxUnitDecimals()">{{ ('units.decimalsOption.' + d) | t }}</option> }
                    </select>
                    <span class="field-hint">{{ (maxUnitDecimals() === 0 ? 'units.decimalsCountHint' : 'units.decimalsHint') | t }}</span>
                  </div>
                </div>
                <div class="settings-form-actions">
                  <button type="submit" class="btn btn-primary" [disabled]="unitForm.invalid || isSavingUnit()">
                    @if (isSavingUnit()) { {{ 'settings.saving' | t }} } @else { {{ (editUnitId() ? 'common.save' : 'settings.units.add') | t }} }
                  </button>
                  @if (editUnitId()) { <button type="button" class="btn btn-secondary" (click)="resetUnitForm()">{{ 'common.cancel' | t }}</button> }
                </div>
              </form>
            }
            <div class="table-scroll settings-table">
              @if (isLoadingUnits()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (units().length === 0) {
                <div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg></div><p class="empty-state-title">{{ 'settings.units.empty' | t }}</p></div>
              } @else {
                <table class="table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.units.code' | t }}</th>
                      <th>{{ 'settings.units.name' | t }}</th>
                      <th>{{ 'units.uneceCode' | t }}</th>
                      <th class="num">{{ 'units.decimals' | t }}</th>
                      <th>{{ 'settings.units.type' | t }}</th>
                      @if (canManageUnits()) { <th class="th-actions">{{ 'common.actions' | t }}</th> }
                    </tr>
                  </thead>
                  <tbody>
                    @for (u of units(); track u.id) {
                      <tr>
                        <td class="mono" [attr.data-label]="'settings.units.code' | t">{{ u.code }}</td>
                        <td [attr.data-label]="'settings.units.name' | t"><strong>{{ u | unitLabel }}</strong></td>
                        <td class="mono" [attr.data-label]="'units.uneceCode' | t">
                          @if (u.uneceCode) { {{ u.uneceCode }} } @else { <span class="badge badge-warning" [title]="'units.uneceMissingHint' | t">{{ 'units.uneceMissing' | t }}</span> }
                        </td>
                        <td class="num" [attr.data-label]="'units.decimals' | t">{{ u.decimals ?? 0 }}</td>
                        <td [attr.data-label]="'settings.units.type' | t">
                          @if (u.isStandard) { <span class="badge badge-instock">{{ 'settings.units.standard' | t }}</span> }
                          @else { <span class="badge badge-neutral">{{ 'settings.units.custom' | t }}</span> }
                          @if (u.deprecated) { <span class="badge badge-warning" [title]="'units.deprecatedHint' | t">{{ 'units.deprecated' | t }}</span> }
                        </td>
                        @if (canManageUnits()) {
                          <td class="td-actions">
                            <button class="edit-btn" [title]="'common.edit' | t" (click)="editUnit(u)"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                            <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteUnit(u)"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        }

        <!-- EXCHANGE RATES TAB (Admin) -->
        @if (activeTab() === 'exchangeRates' && isAdmin()) {
          <div class="settings-card settings-card-lg">
            <h3 class="card-title">{{ 'settings.exchangeRates.title' | t }}</h3>
            <p class="card-subtitle settings-card-sub">{{ 'settings.exchangeRates.subtitle' | t }}</p>
            @if (isTrCompany()) {
              <app-tcmb-panel [autoInitial]="!!ui.userProfile()?.company?.fxAutoFetch" (fetched)="loadExchangeRates()"></app-tcmb-panel>
            }
            <form [formGroup]="fxForm" (ngSubmit)="saveExchangeRate()">
              <div class="settings-form-grid">
                <div class="form-group">
                  <label for="fxBase">{{ 'settings.exchangeRates.base' | t }}</label>
                  <select id="fxBase" formControlName="baseCurrency">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="fxQuote">{{ 'settings.exchangeRates.quote' | t }}</label>
                  <select id="fxQuote" formControlName="quoteCurrency">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                </div>
                <div class="form-group" [class.has-error]="fxForm.get('rate')?.invalid && fxForm.get('rate')?.touched">
                  <label for="fxRate">{{ 'settings.exchangeRates.rate' | t }}</label>
                  <input id="fxRate" type="number" min="0" step="any" formControlName="rate" />
                  @if (fxForm.get('rate')?.invalid && fxForm.get('rate')?.touched) { <span class="error-msg">{{ 'settings.exchangeRates.rateErr' | t }}</span> }
                </div>
                <div class="form-group">
                  <label for="fxDate">{{ 'settings.exchangeRates.date' | t }}</label>
                  <input id="fxDate" type="date" formControlName="date" />
                </div>
              </div>
              @if (fxForm.getRawValue().rate > 0) {
                <p class="field-hint">{{ 'settings.exchangeRates.preview' | t: { base: fxForm.getRawValue().baseCurrency, rate: (fxForm.getRawValue().rate | num: 4), quote: fxForm.getRawValue().quoteCurrency } }}</p>
              }
              @if (fxSameCurrency()) { <p class="error-msg">{{ 'settings.exchangeRates.sameErr' | t }}</p> }
              <div class="settings-form-actions">
                <button type="submit" class="btn btn-primary" [disabled]="fxForm.invalid || fxSameCurrency() || isSavingFx()">
                  @if (isSavingFx()) { {{ 'settings.saving' | t }} } @else { {{ (editFxId() ? 'common.save' : 'settings.exchangeRates.add') | t }} }
                </button>
                @if (editFxId()) { <button type="button" class="btn btn-secondary" (click)="resetFxForm()">{{ 'common.cancel' | t }}</button> }
              </div>
            </form>
            <div class="table-scroll settings-table">
              @if (isLoadingFx()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (sortedExchangeRates().length === 0) {
                <div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg></div><p class="empty-state-title">{{ 'settings.exchangeRates.empty' | t }}</p></div>
              } @else {
                <table class="table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.exchangeRates.date' | t }}</th>
                      <th>{{ 'settings.exchangeRates.pair' | t }}</th>
                      <th class="num">{{ 'settings.exchangeRates.rate' | t }}</th>
                      <th>{{ 'settings.exchangeRates.source' | t }}</th>
                      <th class="th-actions">{{ 'common.actions' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (fx of sortedExchangeRates(); track fx.id) {
                      <tr>
                        <td [attr.data-label]="'settings.exchangeRates.date' | t">{{ fx.date | appDate }}</td>
                        <td class="mono" [attr.data-label]="'settings.exchangeRates.pair' | t">{{ fx.baseCurrency }}/{{ fx.quoteCurrency }}</td>
                        <td class="num" [attr.data-label]="'settings.exchangeRates.rate' | t">{{ 'settings.exchangeRates.preview' | t: { base: fx.baseCurrency, rate: (fx.rate | num: 4), quote: fx.quoteCurrency } }}</td>
                        <td [attr.data-label]="'settings.exchangeRates.source' | t">
                          <span class="badge" [class.badge-info]="fx.source === 'TCMB'" [class.badge-warning]="fx.source !== 'TCMB'">{{ 'finance.fxSource.' + (fx.source || 'MANUAL') | t }}</span>
                          <span class="text-muted"> {{ 'finance.rateType.' + (fx.rateType || 'FOREX_BUYING') | t }}@if (fx.bulletinNo) { · {{ fx.bulletinNo }} }</span>
                        </td>
                        <td class="td-actions">
                          <button class="edit-btn" [title]="'common.edit' | t" (click)="editFx(fx)"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                          <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteFx(fx)"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        }

        <!-- PROFILE & SECURITY TAB -->
        <ng-container *ngIf="activeTab() === 'profile'">
          <div class="settings-container">
            <div class="settings-left-col">
              <div class="settings-card" >
                <h3 class="card-title">{{ 'settings.profile.title' | t }}</h3>
                <p class="card-subtitle settings-card-sub">{{ 'settings.profile.subtitle' | t }}</p>
                
                <div class="settings-avatar-section">
                  <div class="settings-avatar">
                    @if (ui.userProfile()?.avatar) {
                      <img [src]="ui.userProfile().avatar" class="settings-avatar-img" alt="" />
                    } @else {
                      {{ getAvatarInitials() }}
                    }
                  </div>
                  <div class="settings-avatar-actions">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="fileInput.click()">{{ 'settings.profile.uploadPhoto' | t }}</button>
                    <input #fileInput type="file" hidden (change)="onFileSelected($event)" accept="image/*" />
                    <a class="link-remove" (click)="removeAvatar()">{{ 'settings.profile.removePhoto' | t }}</a>
                  </div>
                </div>

                <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
                  <div class="settings-form-grid">
                    <div class="form-group" [class.has-error]="isProfileFieldInvalid('fullName')">
                      <label for="">{{ 'settings.profile.fullName' | t }}</label>
                      <input type="text" formControlName="fullName" [placeholder]="'settings.profile.fullNamePh' | t" />
                      @if (isProfileFieldInvalid('fullName')) { <span class="error-msg">{{ 'settings.profile.fullNameErr' | t }}</span> }
                    </div>
                    <div class="form-group" [class.has-error]="isProfileFieldInvalid('email')">
                      <label for="">{{ 'settings.profile.email' | t }}</label>
                      <input type="email" formControlName="email" [placeholder]="'settings.profile.emailPh' | t" />
                      @if (isProfileFieldInvalid('email')) { <span class="error-msg">{{ 'settings.profile.emailErr' | t }}</span> }
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="">{{ 'settings.profile.department' | t }}</label>
                    <input type="text" formControlName="department" [placeholder]="'settings.profile.departmentPh' | t" />
                  </div>
                  <div class="settings-form-grid">
                    <div class="form-group">
                      <label for="">{{ 'settings.profile.language' | t }}</label>
                      <select formControlName="language">
                        <option value="">{{ 'settings.profile.companyDefault' | t: { value: ui.userProfile()?.company?.defaultLanguage } }}</option>
                        @for (l of languages; track l) { <option [value]="l">{{ 'settings.lang.' + l | t }}</option> }
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="">{{ 'settings.profile.timezone' | t }}</label>
                      <select formControlName="timezone">
                        <option value="">{{ 'settings.profile.companyDefault' | t: { value: ui.userProfile()?.company?.timezone } }}</option>
                        @for (tz of timezones; track tz) { <option [value]="tz">{{ 'settings.tz.' + tz | t }} ({{ tz }})</option> }
                      </select>
                    </div>
                  </div>
                  
                  <div class="settings-divider">
                    <button type="submit" class="btn btn-primary" [disabled]="profileForm.invalid || profileForm.pristine || isSavingProfile">
                      @if (isSavingProfile) { <span class="spinner-sm spinner-light"></span> {{ 'settings.saving' | t }} } @else { {{ 'settings.profile.save' | t }} }
                    </button>
                  </div>
                </form>
              </div>

              <div class="settings-card" >
                <h3 class="card-title">{{ 'settings.password.title' | t }}</h3>
                <p class="card-subtitle settings-card-sub">{{ 'settings.password.subtitle' | t }}</p>
                
                <form [formGroup]="passwordForm" (ngSubmit)="updatePassword()">
                  <div class="form-group" [class.has-error]="isPasswordFieldInvalid('currentPassword')">
                    <label for="">{{ 'settings.password.current' | t }}</label>
                    <div class="password-input-wrapper">
                      <input [type]="showCurrent() ? 'text' : 'password'" formControlName="currentPassword" placeholder="••••••••" />
                      <button type="button" class="password-toggle-btn" (click)="showCurrent.set(!showCurrent())">
                        @if (showCurrent()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                        @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                      </button>
                    </div>
                    @if (isPasswordFieldInvalid('currentPassword')) { <span class="error-msg">{{ 'settings.password.currentErr' | t }}</span> }
                  </div>
                  
                  <div class="settings-form-grid">
                    <div class="form-group" [class.has-error]="isPasswordFieldInvalid('newPassword')">
                      <label for="">{{ 'settings.password.new' | t }}</label>
                      <div class="password-input-wrapper">
                        <input [type]="showNew() ? 'text' : 'password'" formControlName="newPassword" [placeholder]="'settings.password.newPh' | t" (input)="evaluatePasswordStrength()"/>
                        <button type="button" class="password-toggle-btn" (click)="showNew.set(!showNew())">
                          @if (showNew()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                          @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                        </button>
                      </div>
                      <div class="password-strength-container" *ngIf="passwordForm.get('newPassword')?.value">
                        <div class="password-strength-bars">
                          <div [style.background]="pwdStrength() >= 1 ? strengthColors[pwdStrength()-1] : 'var(--color-border)'"></div>
                          <div [style.background]="pwdStrength() >= 2 ? strengthColors[pwdStrength()-1] : 'var(--color-border)'"></div>
                          <div [style.background]="pwdStrength() >= 3 ? strengthColors[pwdStrength()-1] : 'var(--color-border)'"></div>
                          <div [style.background]="pwdStrength() >= 4 ? strengthColors[pwdStrength()-1] : 'var(--color-border)'"></div>
                        </div>
                        <div class="strength-label" [style.color]="pwdStrength() > 0 ? strengthColors[pwdStrength()-1] : 'inherit'">{{ strengthLabels[pwdStrength()] ? (strengthLabels[pwdStrength()] | t) : '' }}</div>
                      </div>
                      @if (isPasswordFieldInvalid('newPassword')) { <span class="error-msg">{{ 'settings.password.newErr' | t }}</span> }
                    </div>
                    
                    <div class="form-group" [class.has-error]="passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)">
                      <label for="">{{ 'settings.password.confirm' | t }}</label>
                      <div class="password-input-wrapper">
                        <input [type]="showConfirm() ? 'text' : 'password'" formControlName="confirmPassword" [placeholder]="'settings.password.confirmPh' | t" />
                        <button type="button" class="password-toggle-btn" (click)="showConfirm.set(!showConfirm())">
                          @if (showConfirm()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                          @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                        </button>
                      </div>
                      @if (passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)) { 
                        <span class="error-msg">{{ 'settings.password.mismatch' | t }}</span> 
                      } @else if (!passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.value) {
                        <span class="error-msg settings-ok-msg">
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                          {{ 'settings.password.match' | t }}
                        </span>
                      }
                    </div>
                  </div>
                  
                  <div class="settings-divider">
                    <button type="submit" class="btn btn-primary" [disabled]="passwordForm.invalid || !passwordForm.get('currentPassword')?.value || isSavingPassword">
                      @if (isSavingPassword) { <span class="spinner-sm spinner-light"></span> {{ 'settings.updating' | t }} } @else { {{ 'settings.password.update' | t }} }
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div class="settings-right-col">
              <div class="settings-card" >
                <div class="side-card-title">{{ 'settings.summary.title' | t }}</div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.accountType' | t }}</span>
                  <span class="summary-value">{{ roleLabel(ui.userProfile()?.role) | t }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.memberSince' | t }}</span>
                  <span class="summary-value">{{ (ui.userProfile()?.createdAt | appDate) || (defaultMemberSince | appDate) }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.lastLogin' | t }}</span>
                  <span class="summary-value">{{ demoLastLogin | appDate: 'datetime' }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.status' | t }}</span>
                  <span class="badge badge-instock">{{ 'settings.summary.active' | t }}</span>
                </div>
              </div>

              <div class="settings-card" >
                <div class="side-card-title">{{ 'settings.security.title' | t }}</div>
                <div class="security-row">
                  <div class="security-icon-text"><span class="security-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> {{ 'settings.security.passwordUpdate' | t }}</div>
                  <span class="field-hint">{{ 'settings.security.daysAgo' | t: { n: 30 } }}</span>
                </div>
                <div class="security-row">
                  <div class="security-icon-text"><span class="security-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/></svg></span> {{ 'settings.security.activeSession' | t }}</div>
                  <span class="badge badge-lowstock">{{ 'settings.security.sessions' | t: { n: 1 } }}</span>
                </div>
                <div class="security-row">
                  <div class="security-icon-text"><span class="security-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span> {{ 'settings.security.emailVerification' | t }}</div>
                  <span class="badge badge-instock">{{ 'settings.security.verified' | t }}</span>
                </div>
                <button type="button" class="btn-terminate" (click)="terminateAllSessions()">{{ 'settings.security.terminateAll' | t }}</button>
              </div>

              <div class="settings-card tips-card" >
                <div class="side-card-title">{{ 'settings.tips.title' | t }}</div>
                <ul class="tips-list">
                  <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> {{ 'settings.tips.strong' | t }}</li>
                  <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> {{ 'settings.tips.rotate' | t }}</li>
                  <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> {{ 'settings.tips.keepUpdated' | t }}</li>
                </ul>
              </div>
            </div>
          </div>
        </ng-container>

        <!-- CATEGORY MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'categories'">
          <div class="settings-section">
            
            <div class="settings-section-head">
              <div>
                <h2 class="settings-section-title">{{ 'settings.categories.title' | t }}</h2>
                <p class="settings-section-sub">{{ 'settings.categories.subtitle' | t }}</p>
              </div>
              <button class="btn btn-primary" (click)="openCategoryDrawer()">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                {{ 'settings.categories.add' | t }}
              </button>
            </div>

            <div class="table-card">
              @if (isLoadingCategories()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (categories().length === 0) {
                <div class="empty-state">
                  <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg></div>
                  <p class="empty-state-title">{{ 'settings.categories.empty' | t }}</p>
                  <button class="btn btn-secondary" (click)="openCategoryDrawer()">{{ 'settings.categories.addFirst' | t }}</button>
                </div>
              } @else {
                <div class="table-scroll">
                  <table class="table-responsive">
                    <thead>
                      <tr>
                        <th>{{ 'settings.categories.name' | t }}</th>
                        <th>{{ 'settings.categories.slug' | t }}</th>
                        <th class="th-actions">{{ 'common.actions' | t }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (cat of categories(); track cat.id) {
                        <tr>
                          <td [attr.data-label]="'settings.categories.name' | t"><strong>{{ cat.name }}</strong></td>
                          <td class="mono text-muted" [attr.data-label]="'settings.categories.slug' | t">{{ cat.slug }}</td>
                          <td class="td-actions">
                            <button class="edit-btn" [title]="'common.edit' | t" (click)="openCategoryDrawer(cat)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button class="delete-btn" [title]="'common.delete' | t" (click)="promptDeleteCategory(cat)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        </ng-container>

        <!-- USER MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'users'">
          <div class="settings-section">
            
            <div class="settings-section-head">
              <div>
                <h2 class="settings-section-title">{{ 'settings.tab.users' | t }}</h2>
                <p class="settings-section-sub">{{ 'settings.users.subtitle' | t }}</p>
              </div>
              
              <div class="page-actions">
                <button class="btn btn-primary" (click)="openUserDrawer()">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  {{ 'settings.users.add' | t }}
                </button>
              </div>
            </div>

            @if (inviteLink(); as link) {
              <div class="alert-banner alert-banner--info settings-invite" role="status">
                <span class="settings-invite-text">{{ 'settings.users.inviteCreated' | t: { name: link.name } }} <code class="mono">{{ link.url }}</code></span>
                <button type="button" class="btn btn-secondary btn-sm" (click)="copyInvite(link.url)">{{ 'settings.users.copyLink' | t }}</button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="inviteLink.set(null)" [attr.aria-label]="'common.close' | t">×</button>
              </div>
            }
            <div class="table-card">
              @if (isLoadingUsers()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (users().length === 0) {
                <div class="empty-state">
                  <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg></div>
                  <p class="empty-state-title">{{ 'settings.users.empty' | t }}</p>
                  <button class="btn btn-secondary" (click)="openUserDrawer()">{{ 'settings.users.addFirst' | t }}</button>
                </div>
              } @else {
                <div class="table-scroll">
                  <table class="table-responsive">
                    <thead>
                      <tr>
                        <th>{{ 'settings.users.fullName' | t }}</th>
                        <th>{{ 'settings.users.username' | t }}</th>
                        <th>{{ 'settings.users.role' | t }}</th>
                        <th>{{ 'settings.users.department' | t }}</th>
                        <th>{{ 'settings.users.email' | t }}</th>
                        <th>{{ 'settings.users.status' | t }}</th>
                        <th class="th-actions">{{ 'common.actions' | t }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (user of users(); track user.id) {
                        <tr>
                          <td [attr.data-label]="'settings.users.fullName' | t">
                            <div class="settings-user-cell">
                              <div class="user-avatar-sm">
                                @if (user.avatar) {
                                  <img [src]="user.avatar" alt="" />
                                } @else {
                                  {{ getInitials(user.fullName) }}
                                }
                              </div>
                              <strong>{{ user.fullName }}</strong>
                            </div>
                          </td>
                          <td class="mono text-muted" [attr.data-label]="'settings.users.username' | t">{{ user.username }}</td>
                          <td [attr.data-label]="'settings.users.role' | t">
                            <span class="badge" [class.badge-instock]="user.role === 'admin'" [class.badge-lowstock]="user.role === 'manager'" [class.badge-outstock]="user.role === 'viewer'">
                              {{ roleLabel(user.role) | t }}
                            </span>
                          </td>
                          <td [attr.data-label]="'settings.users.department' | t">{{ user.department || '-' }}</td>
                          <td [attr.data-label]="'settings.users.email' | t">{{ user.email }}</td>
                          <td [attr.data-label]="'settings.users.status' | t">
                            @if (user.locked) { <span class="badge badge-danger">{{ 'settings.users.statusLocked' | t }}</span> }
                            @else if (user.invitePending) { <span class="badge badge-info">{{ 'settings.users.statusInvited' | t }}</span> }
                            @else if (user.mustChangePassword) { <span class="badge badge-warning">{{ 'settings.users.statusMustChange' | t }}</span> }
                            @else { <span class="badge badge-success">{{ 'settings.users.statusActive' | t }}</span> }
                          </td>
                          <td class="td-actions">
                            @if (user.locked) {
                              <button class="edit-btn" [title]="'settings.users.unlock' | t" (click)="unlockUser(user)">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                              </button>
                            }
                            <button class="edit-btn" [title]="'settings.users.reinvite' | t" (click)="reinviteUser(user)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            </button>
                            <button class="edit-btn" [title]="'common.edit' | t" (click)="openUserDrawer(user)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button class="delete-btn" [title]="'common.delete' | t" [disabled]="user.role === 'admin'" (click)="promptDeleteUser(user)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Category Drawer -->
    @if (isCategoryDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeCategoryDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editCategoryId() ? 'settings.categories.edit' : 'settings.categories.add') | t }}</span>
            <button type="button" class="drawer-close" (click)="closeCategoryDrawer()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" class="drawer-form">
            <div class="drawer-body">
              <div class="form-field">
                <input id="catName" type="text" formControlName="name" class="form-input" [class.has-value]="hasCategoryValue('name')" [disabled]="isSavingCategory()" />
                <label for="catName" class="form-label">{{ 'settings.categories.nameLabel' | t }}</label>
                @if (isCategoryFieldInvalid('name')) { <div class="form-error">{{ 'settings.categories.nameErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="catSlug" type="text" formControlName="slug" class="form-input" [class.has-value]="hasCategoryValue('slug')" [disabled]="isSavingCategory()" [placeholder]="'settings.categories.slugPh' | t" />
                <label for="catSlug" class="form-label">{{ 'settings.categories.slugLabel' | t }}</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeCategoryDrawer()" [disabled]="isSavingCategory()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="categoryForm.invalid || isSavingCategory()">
                @if (isSavingCategory()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Category Delete Confirmation Modal -->
    @if (showCategoryDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">{{ 'settings.categories.deleteTitle' | t }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ categoryToDelete()?.name }}</strong> {{ 'settings.categories.deleteConfirm' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-danger" (click)="confirmDeleteCategory()" [disabled]="isSavingCategory()">
              @if (isSavingCategory()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.deleting' | t }} } @else { {{ 'common.delete' | t }} }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- User Drawer -->
    @if (isUserDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeUserDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editUserId() ? 'settings.users.edit' : 'settings.users.add') | t }}</span>
            <button type="button" class="drawer-close" (click)="closeUserDrawer()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="userForm" (ngSubmit)="saveUser()" class="drawer-form">
            <div class="drawer-body">
              <div class="form-field">
                <input id="userFullName" type="text" formControlName="fullName" class="form-input" [class.has-value]="hasUserValue('fullName')" [disabled]="isSavingUser()" />
                <label for="userFullName" class="form-label">{{ 'settings.users.fullNameLabel' | t }}</label>
                @if (isUserFieldInvalid('fullName')) { <div class="form-error">{{ 'settings.users.fullNameErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasUserValue('email')" [disabled]="isSavingUser()" />
                <label for="userEmail" class="form-label">{{ 'settings.users.emailLabel' | t }}</label>
                @if (isUserFieldInvalid('email')) { <div class="form-error">{{ 'settings.profile.emailErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userUsername" type="text" formControlName="username" class="form-input" [class.has-value]="hasUserValue('username')" [disabled]="isSavingUser() || !!editUserId()" />
                <label for="userUsername" class="form-label">{{ 'settings.users.usernameLabel' | t }}</label>
                @if (isUserFieldInvalid('username')) { <div class="form-error">{{ 'settings.users.usernameErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userPassword" type="password" formControlName="password" class="form-input" [class.has-value]="hasUserValue('password')" [disabled]="isSavingUser()" />
                <label for="userPassword" class="form-label">{{ (editUserId() ? 'settings.users.passwordEdit' : 'settings.users.passwordNew') | t }}</label>
                @if (isUserFieldInvalid('password')) { <div class="form-error">{{ 'settings.users.passwordErr' | t }}</div> }
                <span class="field-hint" style="order: 3">{{ (editUserId() ? 'settings.users.passwordEditHint' : 'settings.users.passwordNewHint') | t }}</span>
              </div>

              <div class="form-field">
                <input id="userDepartment" type="text" formControlName="department" class="form-input" [class.has-value]="hasUserValue('department')" [disabled]="isSavingUser()" />
                <label for="userDepartment" class="form-label">{{ 'settings.users.department' | t }}</label>
              </div>

              <div class="form-field select-field">
                <label for="userRole" class="form-label">{{ 'settings.users.role' | t }}</label>
                <select id="userRole" formControlName="role" class="form-select has-value" [disabled]="isSavingUser()">
                  <option value="manager">{{ 'settings.users.roleManagerOpt' | t }}</option>
                  <option value="viewer">{{ 'settings.users.roleViewerOpt' | t }}</option>
                </select>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeUserDrawer()" [disabled]="isSavingUser()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="userForm.invalid || isSavingUser()">
                @if (isSavingUser()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- User Delete Confirmation Modal -->
    @if (showUserDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteUser()" [disabled]="isSavingUser()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">{{ 'settings.users.deleteTitle' | t }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ userToDelete()?.fullName }}</strong> {{ 'settings.users.deleteConfirm' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteUser()" [disabled]="isSavingUser()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-danger" (click)="confirmDeleteUser()" [disabled]="isSavingUser()">
              @if (isSavingUser()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.deleting' | t }} } @else { {{ 'common.delete' | t }} }
            </button>
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styleUrls: ['../../drawer.css'],
  styles: [`
    .settings-invite { margin-bottom: var(--space-4); flex-wrap: wrap; }
    .settings-invite-text { flex: 1; min-width: 0; word-break: break-all; }
    :host { display: block; }
    .settings-tabs { margin-bottom: var(--space-6); }
    .settings-layout, .settings-content { display: flex; flex-direction: column; gap: var(--space-6); width: 100%; min-width: 0; }
    .settings-hub { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-4); }
    .settings-hub-card {
      display: flex; align-items: center; gap: var(--space-4); width: 100%; text-align: left;
      padding: var(--space-4) var(--space-5); background: var(--color-surface);
      border: 1px solid var(--color-border); border-radius: var(--radius-lg); cursor: pointer; font: inherit; color: inherit;
      transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
    }
    .settings-hub-card:hover { border-color: var(--color-primary-border); box-shadow: var(--shadow-sm); }
    .settings-hub-card:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .settings-hub-icon { flex-shrink: 0; width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--color-primary-subtle); color: var(--color-primary-text); }
    .settings-hub-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .settings-hub-title { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--color-text); }
    .settings-hub-desc { font-size: var(--text-sm); color: var(--color-text-muted); line-height: 1.45; }
    .settings-hub-chevron { flex-shrink: 0; color: var(--color-text-subtle); }
    .settings-hub-card:hover .settings-hub-chevron { color: var(--color-primary-text); }
    .settings-card-md { max-width: 760px; }
    .settings-card-lg { max-width: 960px; }
    .settings-card-sub { margin: var(--space-1) 0 var(--space-6); }
    .settings-check { display: flex; flex-direction: row; align-items: center; gap: var(--space-2); }
    .settings-check input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--color-primary); }
    .settings-check label { margin: 0; }
    .settings-check-pad { padding-top: var(--space-6); }
    .settings-check-hint { margin: calc(-1 * var(--space-2)) 0 var(--space-4); }
    .settings-narrow { max-width: 260px; }
    .settings-card form > .form-group, .settings-card .settings-form-grid { margin-bottom: var(--space-4); }
    .settings-card .settings-form-grid > .form-group { margin-bottom: 0; }
    .settings-form-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
    .settings-table { margin-top: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
    .settings-skel { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); }
    .settings-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .settings-avatar { overflow: hidden; background: var(--color-primary) !important; color: var(--color-on-primary) !important; }
    .settings-ok-msg { color: var(--color-success-text) !important; display: inline-flex; align-items: center; gap: 4px; }
    .security-icon { display: inline-flex; color: var(--color-text-muted); }
    .tips-list li { display: flex; align-items: flex-start; gap: var(--space-2); }
    .tips-list li svg { flex-shrink: 0; margin-top: 2px; color: var(--color-success); }
    .settings-section { display: flex; flex-direction: column; gap: var(--space-4); width: 100%; }
    .settings-section-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
    .settings-section-title { font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0; }
    .settings-section-sub { margin: var(--space-1) 0 0; font-size: var(--text-md); color: var(--color-text-muted); }
    .settings-user-cell { display: flex; align-items: center; gap: var(--space-2); }
    .user-avatar-sm { width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--color-primary-subtle); color: var(--color-primary-text); font-size: var(--text-xs); font-weight: var(--weight-semibold); }
    .user-avatar-sm img { width: 100%; height: 100%; object-fit: cover; }
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .drawer-body { display: flex; flex-direction: column; gap: var(--space-5); }
    @media (max-width: 640px) {
      .settings-hub, .settings-form-grid { grid-template-columns: 1fr; gap: var(--space-4); }
      .settings-tabs { margin-left: calc(-1 * var(--space-4)); margin-right: calc(-1 * var(--space-4)); padding: 0 var(--space-4); }
      .settings-tabs .tab { flex-shrink: 0; }
      .settings-card { padding: var(--space-4) !important; }
      .settings-section-head .page-actions, .settings-section-head .btn { width: 100%; }
      .settings-check-pad { padding-top: 0; }
      .settings-narrow { max-width: none; }
      .settings-avatar-section { flex-wrap: wrap; }
      .settings-table { border: 0; }
      td.mono::before { font-family: var(--font-sans); }
    }
  `]
})
export class SettingsComponent implements OnInit {
  fb = inject(FormBuilder);
  http = inject(HttpClient);
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);
  socketService = inject(SocketService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  i18n = inject(I18nService);

  // Placeholder values shown in the account summary card (demo data)
  readonly defaultMemberSince = '2025-01-01T00:00:00';
  readonly demoLastLogin = '2026-06-20T11:00:00';

  roleLabel(role: string | null | undefined): string {
    return role === 'admin' ? 'settings.role.admin' : role === 'manager' ? 'settings.role.manager' : 'settings.role.viewer';
  }
  
  @ViewChild(ToastComponent) toast!: ToastComponent;

  activeTab = signal<SettingsTab>('dashboard');

  private host = inject(ElementRef<HTMLElement>);
  /** On narrow screens the tab bar scrolls horizontally: keep the active tab visible (e.g. opened via ?tab= link). */
  private scrollActiveTab = effect(() => {
    this.activeTab();
    this.isAdmin(); // admin-only tabs render once the profile has loaded
    setTimeout(() => {
      const el = (this.host.nativeElement as HTMLElement).querySelector('.settings-tabs .tab.active') as HTMLElement | null;
      const bar = el?.parentElement?.closest('.settings-tabs') as HTMLElement | null;
      if (!el || !bar || bar.scrollWidth <= bar.clientWidth) return;
      const delta = el.getBoundingClientRect().left - bar.getBoundingClientRect().left;
      bar.scrollTo({ left: bar.scrollLeft + delta - (bar.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
    });
  });

  // Locale option lists (shared by profile overrides and company settings)
  // Labels are translated in the template via settings.lang.<code> / settings.country.<code> / settings.tz.<tz>
  readonly languages = ['tr', 'en'];
  readonly countries = [
    { code: 'TR' }, { code: 'US' }, { code: 'GB' }, { code: 'DE' },
    { code: 'FR' }, { code: 'NL' }, { code: 'AE' }, { code: 'AZ' },
  ];
  readonly currencies = ['TRY', 'USD', 'EUR', 'GBP', 'AED', 'AZN'];
  readonly timezones = [
    'Europe/Istanbul', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Baku',
  ];

  // Company settings (admin)
  isSavingCompany = signal(false);
  companyForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    country: ['TR', Validators.required],
    defaultLanguage: ['tr', Validators.required],
    baseCurrency: ['TRY', Validators.required],
    timezone: ['Europe/Istanbul', Validators.required],
    pricesIncludeTax: [false],
    expiryAlertDays: [30, [Validators.required, Validators.min(0), Validators.max(3650)]],
  });

  isAdmin(): boolean { return this.ui.userProfile()?.role === 'admin'; }
  /** Company base currency (falls back to the effective locale currency). */
  companyBaseCurrency(): string { return this.ui.userProfile()?.company?.baseCurrency || this.i18n.currency(); }
  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  private errMsg(err: any, fallbackKey: string): string {
    const msg = err?.error?.message;
    return this.i18n.t('settings.error', { msg: (Array.isArray(msg) ? msg[0] : msg) || this.i18n.t(fallbackKey) });
  }

  /** TR: tax rates come from the locked legal catalog; TCMB rates available */
  isTrCompany(): boolean {
    return (this.ui.userProfile()?.company?.country || '').toUpperCase() === 'TR';
  }

  // Tax rates (admin)
  taxRates = signal<TaxRate[]>([]);
  isLoadingTax = signal(false);
  isSavingTax = signal(false);
  editTaxId = signal<string | null>(null);
  taxForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    rate: [20, [Validators.required, Validators.min(0), Validators.max(100)]],
    country: [''],
    isDefault: [false],
  });

  loadTaxRates() {
    this.isLoadingTax.set(true);
    this.inventoryService.getTaxRates().subscribe({
      next: (list) => { this.taxRates.set(list); this.isLoadingTax.set(false); },
      error: (err) => { this.isLoadingTax.set(false); this.toast.show(this.errMsg(err, 'settings.taxRates.loadFailed'), 'error'); },
    });
  }

  resetTaxForm() {
    this.editTaxId.set(null);
    this.taxForm.reset({ name: '', rate: 20, country: this.ui.userProfile()?.company?.country || '', isDefault: false });
  }

  editTax(tr: TaxRate) {
    this.editTaxId.set(tr.id);
    this.taxForm.reset({ name: tr.name, rate: tr.rate, country: tr.country || '', isDefault: tr.isDefault });
  }

  saveTaxRate() {
    if (this.taxForm.invalid) { this.taxForm.markAllAsTouched(); return; }
    const v = this.taxForm.value;
    const payload: Partial<TaxRate> = { name: String(v.name).trim(), rate: Number(v.rate), country: v.country || null, isDefault: !!v.isDefault };
    const id = this.editTaxId();
    this.isSavingTax.set(true);
    (id ? this.inventoryService.updateTaxRate(id, payload) : this.inventoryService.createTaxRate(payload)).subscribe({
      next: () => {
        this.isSavingTax.set(false);
        this.toast.show('✓ ' + this.i18n.t('settings.taxRates.saved'), 'success');
        this.resetTaxForm();
        this.loadTaxRates();
      },
      error: (err) => { this.isSavingTax.set(false); this.toast.show(this.errMsg(err, 'settings.toast.saveFailed'), 'error'); },
    });
  }

  setDefaultTax(tr: TaxRate) {
    this.inventoryService.updateTaxRate(tr.id, { isDefault: true }).subscribe({
      next: () => { this.toast.show('✓ ' + this.i18n.t('settings.taxRates.defaultSet'), 'success'); this.loadTaxRates(); },
      error: (err) => this.toast.show(this.errMsg(err, 'settings.toast.saveFailed'), 'error'),
    });
  }

  deleteTax(tr: TaxRate) {
    this.ui.openConfirm({
      title: this.i18n.t('settings.taxRates.deleteTitle'),
      message: this.i18n.t('settings.taxRates.deleteConfirm', { name: tr.name }),
      confirmText: this.i18n.t('common.delete'),
      cancelText: this.i18n.t('common.cancel'),
      onConfirm: () => {
        this.inventoryService.deleteTaxRate(tr.id).subscribe({
          next: () => {
            this.toast.show('✓ ' + this.i18n.t('settings.taxRates.deleted'), 'success');
            if (this.editTaxId() === tr.id) this.resetTaxForm();
            this.loadTaxRates();
          },
          error: (err) => this.toast.show(this.errMsg(err, 'settings.taxRates.deleteFailed'), 'error'),
        });
      },
    });
  }

  // Units of measure
  units = signal<Unit[]>([]);
  isLoadingUnits = signal(false);
  isSavingUnit = signal(false);
  editUnitId = signal<string | null>(null);
  editUnitStandard = signal(false);
  unitForm: FormGroup = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(60)]],
    uneceCode: [''],
    decimals: [0],
  });
  /** UN/ECE Rec. 20 codes grouped for the unit form */
  readonly uneceGroups = Array.from(new Set(UNECE_UNIT_CODES.map((u) => u.group))).map((group) => ({ group, codes: UNECE_UNIT_CODES.filter((u) => u.group === group) }));

  /** Largest precision for the selected UN/ECE code (count / package codes are whole units). */
  maxUnitDecimals = signal(3);

  /** Picking a UN/ECE code proposes its usual precision (kg: 3, pcs: 0). */
  onUneceChange() {
    const code = this.unitForm.get('uneceCode')?.value;
    const hit = UNECE_UNIT_CODES.find((u) => u.code === code);
    this.maxUnitDecimals.set(maxDecimalsForUnece(code));
    if (hit && !this.editUnitId()) this.unitForm.patchValue({ decimals: hit.decimals });
    if (Number(this.unitForm.get('decimals')?.value) > this.maxUnitDecimals()) this.unitForm.patchValue({ decimals: this.maxUnitDecimals() });
  }

  canManageUnits(): boolean {
    const role = this.ui.userProfile()?.role;
    return role === 'admin' || role === 'manager';
  }

  loadUnits() {
    this.isLoadingUnits.set(true);
    this.inventoryService.getUnits().subscribe({
      next: (list) => { this.units.set(list); this.isLoadingUnits.set(false); },
      error: (err) => { this.isLoadingUnits.set(false); this.toast.show(this.errMsg(err, 'settings.units.loadFailed'), 'error'); },
    });
  }

  resetUnitForm() {
    this.editUnitId.set(null);
    this.editUnitStandard.set(false);
    this.unitForm.reset({ code: '', name: '', uneceCode: '', decimals: 0 });
    this.maxUnitDecimals.set(3);
  }

  editUnit(u: Unit) {
    this.editUnitId.set(u.id);
    this.editUnitStandard.set(!!u.isStandard);
    this.unitForm.reset({ code: u.code, name: u.name, uneceCode: u.uneceCode || '', decimals: u.decimals ?? 0 });
    this.maxUnitDecimals.set(maxDecimalsForUnece(u.uneceCode));
  }

  saveUnit() {
    if (this.unitForm.invalid) { this.unitForm.markAllAsTouched(); return; }
    const v = this.unitForm.value;
    const id = this.editUnitId();
    const payload: Partial<Unit> = { name: String(v.name).trim(), uneceCode: v.uneceCode || null, decimals: Number(v.decimals) || 0 };
    if (!this.editUnitStandard()) payload.code = String(v.code).trim();
    this.isSavingUnit.set(true);
    (id ? this.inventoryService.updateUnit(id, payload) : this.inventoryService.createUnit(payload)).subscribe({
      next: () => {
        this.isSavingUnit.set(false);
        this.toast.show('✓ ' + this.i18n.t('settings.units.saved'), 'success');
        this.resetUnitForm();
        this.loadUnits();
      },
      error: (err) => { this.isSavingUnit.set(false); this.toast.show(this.errMsg(err, 'settings.toast.saveFailed'), 'error'); },
    });
  }

  deleteUnit(u: Unit) {
    this.ui.openConfirm({
      title: this.i18n.t('settings.units.deleteTitle'),
      message: this.i18n.t('settings.units.deleteConfirm', { name: u.name || u.code }),
      confirmText: this.i18n.t('common.delete'),
      cancelText: this.i18n.t('common.cancel'),
      onConfirm: () => {
        this.inventoryService.deleteUnit(u.id).subscribe({
          next: () => {
            this.toast.show('✓ ' + this.i18n.t('settings.units.deleted'), 'success');
            if (this.editUnitId() === u.id) this.resetUnitForm();
            this.loadUnits();
          },
          error: (err) => {
            const code = err?.error?.code || err?.error?.error;
            this.toast.show(code === 'UNIT_IN_USE' ? this.i18n.t('settings.units.inUse') : this.errMsg(err, 'settings.units.deleteFailed'), 'error');
          },
        });
      },
    });
  }

  // Exchange rates (admin)
  exchangeRates = signal<ExchangeRate[]>([]);
  sortedExchangeRates = computed(() =>
    [...this.exchangeRates()].sort((a, b) => b.date.localeCompare(a.date) || a.quoteCurrency.localeCompare(b.quoteCurrency))
  );
  isLoadingFx = signal(false);
  isSavingFx = signal(false);
  editFxId = signal<string | null>(null);
  fxForm: FormGroup = this.fb.group({
    baseCurrency: ['TRY', Validators.required],
    quoteCurrency: ['USD', Validators.required],
    rate: [null as number | null, [Validators.required, Validators.min(0.000001)]],
    date: [this.today(), Validators.required],
  });

  fxSameCurrency(): boolean {
    const v = this.fxForm.getRawValue();
    return !!v.baseCurrency && v.baseCurrency === v.quoteCurrency;
  }

  loadExchangeRates() {
    this.isLoadingFx.set(true);
    this.inventoryService.getExchangeRates().subscribe({
      next: (list) => { this.exchangeRates.set(list); this.isLoadingFx.set(false); },
      error: (err) => { this.isLoadingFx.set(false); this.toast.show(this.errMsg(err, 'settings.exchangeRates.loadFailed'), 'error'); },
    });
  }

  resetFxForm() {
    this.editFxId.set(null);
    const base = this.companyBaseCurrency();
    this.fxForm.get('baseCurrency')?.enable();
    this.fxForm.get('quoteCurrency')?.enable();
    this.fxForm.reset({ baseCurrency: base, quoteCurrency: base === 'USD' ? 'EUR' : 'USD', rate: null, date: this.today() });
  }

  editFx(fx: ExchangeRate) {
    this.editFxId.set(fx.id);
    this.fxForm.reset({ baseCurrency: fx.baseCurrency, quoteCurrency: fx.quoteCurrency, rate: fx.rate, date: fx.date?.slice(0, 10) });
    // Only rate/date are editable for an existing row
    this.fxForm.get('baseCurrency')?.disable();
    this.fxForm.get('quoteCurrency')?.disable();
  }

  saveExchangeRate() {
    if (this.fxForm.invalid || this.fxSameCurrency()) { this.fxForm.markAllAsTouched(); return; }
    const v = this.fxForm.getRawValue();
    const id = this.editFxId();
    const req = id
      ? this.inventoryService.updateExchangeRate(id, { rate: Number(v.rate), date: v.date })
      : this.inventoryService.createExchangeRate({ baseCurrency: v.baseCurrency, quoteCurrency: v.quoteCurrency, rate: Number(v.rate), date: v.date });
    this.isSavingFx.set(true);
    req.subscribe({
      next: () => {
        this.isSavingFx.set(false);
        this.toast.show('✓ ' + this.i18n.t('settings.exchangeRates.saved'), 'success');
        this.resetFxForm();
        this.loadExchangeRates();
      },
      error: (err) => { this.isSavingFx.set(false); this.toast.show(this.errMsg(err, 'settings.toast.saveFailed'), 'error'); },
    });
  }

  deleteFx(fx: ExchangeRate) {
    this.ui.openConfirm({
      title: this.i18n.t('settings.exchangeRates.deleteTitle'),
      message: this.i18n.t('settings.exchangeRates.deleteConfirm', { pair: `${fx.baseCurrency}/${fx.quoteCurrency}`, date: fx.date }),
      confirmText: this.i18n.t('common.delete'),
      cancelText: this.i18n.t('common.cancel'),
      onConfirm: () => {
        this.inventoryService.deleteExchangeRate(fx.id).subscribe({
          next: () => {
            this.toast.show('✓ ' + this.i18n.t('settings.exchangeRates.deleted'), 'success');
            if (this.editFxId() === fx.id) this.resetFxForm();
            this.loadExchangeRates();
          },
          error: (err) => this.toast.show(this.errMsg(err, 'settings.exchangeRates.deleteFailed'), 'error'),
        });
      },
    });
  }

  getTabTitle(): string {
    switch (this.activeTab()) {
      case 'profile': return this.i18n.t('settings.tab.profile');
      case 'categories': return this.i18n.t('settings.tab.categories');
      case 'users': return this.i18n.t('settings.tab.users');
      case 'company': return this.i18n.t('settings.tab.company');
      case 'taxRates': return this.i18n.t('settings.tab.taxRates');
      case 'exchangeRates': return this.i18n.t('settings.tab.exchangeRates');
      case 'units': return this.i18n.t('settings.tab.units');
      case 'compliance': return this.i18n.t('settings.tab.compliance');
      default: return this.i18n.t('settings.account');
    }
  }

  // Profile fields
  isSavingProfile = false;
  profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    department: [''],
    language: [''],
    timezone: ['']
  });

  // Password fields
  isSavingPassword = false;
  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  pwdStrength = signal(0);
  strengthColors = ['var(--color-danger)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)'];
  strengthLabels = ['', 'settings.strength.weak', 'settings.strength.medium', 'settings.strength.good', 'settings.strength.strong'];

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, strongPasswordValidator]],
    confirmPassword: ['', Validators.required]
  }, { validators: this.passwordMatchValidator });

  // Categories fields
  categories = signal<any[]>([]);
  isLoadingCategories = signal(false);
  isCategoryDrawerOpen = signal(false);
  isSavingCategory = signal(false);
  editCategoryId = signal<string | null>(null);
  showCategoryDeleteModal = signal(false);
  categoryToDelete = signal<any>(null);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['']
  });

  // User Management fields
  users = signal<any[]>([]);
  isLoadingUsers = signal(false);
  isUserDrawerOpen = signal(false);
  isSavingUser = signal(false);
  editUserId = signal<string | null>(null);
  showUserDeleteModal = signal(false);
  userToDelete = signal<any>(null);

  userForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    username: ['', Validators.required],
    password: ['', [strongPasswordValidator]],
    department: [''],
    role: ['viewer', Validators.required]
  });

  ngOnInit() {
    this.loadCategories();
    this.loadProfile();
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (['profile', 'categories', 'users', 'company', 'fiscal', 'ebelge', 'documents', 'compliance', 'legalParams', 'taxRates', 'exchangeRates', 'units'].includes(tab)) {
        this.activeTab.set(tab);
        if (tab === 'units') this.loadUnits();
      } else {
        this.activeTab.set('dashboard');
      }
    });
  }

  changeTab(tab: SettingsTab) {
    if (tab === 'dashboard') {
      this.router.navigate(['/settings']);
    } else {
      this.router.navigate(['/settings'], { queryParams: { tab } });
    }
  }

  loadProfile() {
    this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
      next: (profile: any) => {
        this.ui.userProfile.set(profile);
        this.i18n.applyLocale(profile?.locale);
        this.profileForm.patchValue({
          fullName: profile.fullName,
          email: profile.email,
          department: profile.department,
          language: profile.language || '',
          timezone: profile.timezone || ''
        });
        if (profile.company) {
          this.companyForm.patchValue({ ...profile.company, pricesIncludeTax: !!profile.company.pricesIncludeTax, expiryAlertDays: profile.company.expiryAlertDays ?? 30 });
          this.companyForm.markAsPristine();
        }
        if (profile.role === 'admin') {
          this.loadUsers();
          this.loadTaxRates();
          this.loadExchangeRates();
          if (!this.editTaxId() && !this.taxForm.dirty) this.resetTaxForm();
          if (!this.editFxId() && !this.fxForm.dirty) this.resetFxForm();
        }
      },
      error: () => {
        this.toast.show(this.i18n.t('settings.toast.profileLoadFailed'), 'error');
      }
    });
  }

  getAvatarInitials(): string {
    const name = this.ui.userProfile()?.fullName || 'AU';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.toast.show(this.i18n.t('settings.error', { msg: this.i18n.t('settings.toast.photoTooLarge') }), 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      this.http.put(`${environment.apiUrl}/user/profile`, { avatar: base64String }).subscribe({
        next: (res: any) => {
          this.ui.userProfile.set(res.data);
          this.toast.show('✓ ' + this.i18n.t('settings.toast.photoUpdated'), 'success');
        },
        error: (err) => {
          this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.photoUploadFailed') }), 'error');
        }
      });
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.http.put(`${environment.apiUrl}/user/profile`, { avatar: null }).subscribe({
      next: (res: any) => {
        this.ui.userProfile.set(res.data);
        this.toast.show('✓ ' + this.i18n.t('settings.toast.photoRemoved'), 'success');
      },
      error: (err) => {
        this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.photoRemoveFailed') }), 'error');
      }
    });
  }

  terminateAllSessions() {
    this.ui.openConfirm({
      title: this.i18n.t('settings.security.terminateAll'),
      message: this.i18n.t('settings.terminate.message'),
      confirmText: this.i18n.t('settings.terminate.confirm'),
      cancelText: this.i18n.t('common.cancel'),
      onConfirm: () => {
        this.http.post(`${environment.apiUrl}/user/sessions/terminate`, {}).subscribe({
          next: () => {
            this.toast.show('✓ ' + this.i18n.t('settings.toast.sessionsTerminated'), 'info');
            setTimeout(() => {
              this.doLogout();
            }, 1500);
          },
          error: (err) => {
            this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.sessionsTerminateFailed') }), 'error');
          }
        });
      }
    });
  }

  doLogout() {
    localStorage.removeItem('smart_inventory_token');
    this.socketService.disconnect();
    this.ui.userProfile.set(null);
    this.router.navigate(['/login']);
  }

  loadCategories() {
    this.isLoadingCategories.set(true);
    this.inventoryService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
        this.isLoadingCategories.set(false);
      },
      error: () => {
        this.isLoadingCategories.set(false);
        this.toast.show(this.i18n.t('settings.toast.categoriesLoadFailed'), 'error');
      }
    });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  isProfileFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  isPasswordFieldInvalid(fieldName: string): boolean {
    const field = this.passwordForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  isCategoryFieldInvalid(fieldName: string): boolean {
    const field = this.categoryForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasCategoryValue(fieldName: string): boolean {
    const val = this.categoryForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  evaluatePasswordStrength() {
    const val = this.passwordForm.get('newPassword')?.value || '';
    let score = 0;
    if (!val) { this.pwdStrength.set(0); return; }
    
    if (val.length >= 8) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;
    
    if (val.length >= 6 && score === 0) score = 1;
    else if (val.length < 6) score = 0;

    this.pwdStrength.set(score);
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    
    this.isSavingProfile = true;
    const payload = {
      ...this.profileForm.value,
      language: this.profileForm.value.language || null,
      timezone: this.profileForm.value.timezone || null,
    };
    this.http.put(`${environment.apiUrl}/user/profile`, payload).subscribe({
      next: (res: any) => {
        this.isSavingProfile = false;
        this.ui.userProfile.set(res.data);
        this.toast.show('✓ ' + this.i18n.t('settings.toast.changesSaved'), 'success');
        this.profileForm.markAsPristine();
        this.refreshEffectiveLocale();
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.saveFailed') }), 'error');
      }
    });
  }

  /** Re-fetch the profile after a save and apply the effective locale (language/timezone/currency). */
  private refreshEffectiveLocale() {
    this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
      next: (profile: any) => {
        this.ui.userProfile.set(profile);
        this.i18n.applyLocale(profile?.locale);
      },
      error: () => { /* keep current locale */ },
    });
  }

  saveCompany() {
    if (this.companyForm.invalid) {
      this.companyForm.markAllAsTouched();
      return;
    }
    this.isSavingCompany.set(true);
    this.http.put(`${environment.apiUrl}/company`, { ...this.companyForm.value, expiryAlertDays: Number(this.companyForm.value.expiryAlertDays) }).subscribe({
      next: () => {
        this.isSavingCompany.set(false);
        this.companyForm.markAsPristine();
        this.toast.show('✓ ' + this.i18n.t('settings.toast.companySaved'), 'success');
        this.loadProfile(); // re-fetches /user/profile, sets ui.userProfile and applies the effective locale
      },
      error: (err) => {
        this.isSavingCompany.set(false);
        const msg = err.error?.message;
        this.toast.show(this.i18n.t('settings.error', { msg: (Array.isArray(msg) ? msg[0] : msg) || this.i18n.t('settings.toast.saveFailed') }), 'error');
      }
    });
  }

  updatePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    
    this.isSavingPassword = true;
    this.http.put(`${environment.apiUrl}/user/password`, {
      currentPassword: this.passwordForm.get('currentPassword')?.value,
      newPassword: this.passwordForm.get('newPassword')?.value
    }).subscribe({
      next: () => {
        this.isSavingPassword = false;
        this.toast.show('✓ ' + this.i18n.t('settings.toast.passwordUpdated'), 'success');
        this.passwordForm.reset();
        this.pwdStrength.set(0);
        setTimeout(() => {
          this.doLogout();
        }, 1500);
      },
      error: (err) => {
        this.isSavingPassword = false;
        this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.passwordUpdateFailed') }), 'error');
      }
    });
  }

  // Categories Operations
  openCategoryDrawer(category?: any) {
    if (category) {
      this.editCategoryId.set(category.id);
      this.categoryForm.patchValue({
        name: category.name,
        slug: category.slug
      });
    } else {
      this.editCategoryId.set(null);
      this.categoryForm.reset({
        name: '',
        slug: ''
      });
    }
    this.isCategoryDrawerOpen.set(true);
  }

  closeCategoryDrawer() {
    this.isCategoryDrawerOpen.set(false);
    this.categoryForm.reset();
    this.editCategoryId.set(null);
  }

  saveCategory() {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSavingCategory.set(true);
    const data = this.categoryForm.value;
    const catId = this.editCategoryId();

    const obs = catId
      ? this.inventoryService.updateCategory(catId, data)
      : this.inventoryService.createCategory(data);

    obs.subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.closeCategoryDrawer();
        this.loadCategories();
        this.toast.show('✓ ' + this.i18n.t(catId ? 'settings.toast.categoryUpdated' : 'settings.toast.categoryCreated'), 'success');
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.categorySaveFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }

  promptDeleteCategory(category: any) {
    this.categoryToDelete.set(category);
    this.showCategoryDeleteModal.set(true);
  }

  cancelDeleteCategory() {
    this.showCategoryDeleteModal.set(false);
    this.categoryToDelete.set(null);
  }

  confirmDeleteCategory() {
    const cat = this.categoryToDelete();
    if (!cat) return;

    this.isSavingCategory.set(true);
    this.inventoryService.deleteCategory(cat.id).subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.cancelDeleteCategory();
        this.loadCategories();
        this.toast.show('✓ ' + this.i18n.t('settings.toast.categoryDeleted'), 'success');
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        this.cancelDeleteCategory();
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.categoryDeleteFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }

  // Users Operations and Limits Helpers
  loadUsers() {
    if (this.ui.userProfile()?.role !== 'admin') return;
    this.isLoadingUsers.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/user/users`).subscribe({
      next: (data) => {
        this.users.set(data);
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.isLoadingUsers.set(false);
        this.toast.show(this.i18n.t('settings.toast.usersLoadFailed'), 'error');
      }
    });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  isUserFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasUserValue(fieldName: string): boolean {
    const val = this.userForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  openUserDrawer(user?: any) {
    if (user) {
      this.editUserId.set(user.id);
      this.userForm.patchValue({
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        password: '',
        department: user.department,
        role: user.role || 'viewer'
      });
      this.userForm.get('username')?.disable();
    } else {
      this.editUserId.set(null);
      this.userForm.reset({
        fullName: '',
        email: '',
        username: '',
        password: '',
        department: '',
        role: 'viewer'
      });
      this.userForm.get('username')?.enable();
    }
    this.isUserDrawerOpen.set(true);
  }

  closeUserDrawer() {
    this.isUserDrawerOpen.set(false);
    this.userForm.reset();
    this.editUserId.set(null);
  }

  saveUser() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSavingUser.set(true);
    const data = this.userForm.getRawValue();
    const userId = this.editUserId();

    const obs = userId
      ? this.http.put(`${environment.apiUrl}/user/users/${userId}`, data)
      : this.http.post(`${environment.apiUrl}/user/users`, data);

    if (!data.password) delete data.password;
    obs.subscribe({
      next: (res: any) => {
        this.isSavingUser.set(false);
        if (res?.invite?.url) this.inviteLink.set({ name: res.fullName || res.username, url: res.invite.url });
        this.closeUserDrawer();
        this.loadUsers();
        this.toast.show('✓ ' + this.i18n.t(userId ? 'settings.toast.userUpdated' : 'settings.toast.userCreated'), 'success');
      },
      error: (err) => {
        this.isSavingUser.set(false);
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.userSaveFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }

  inviteLink = signal<{ name: string; url: string } | null>(null);

  reinviteUser(user: any) {
    this.http.post<{ url: string }>(`${environment.apiUrl}/user/users/${user.id}/invite`, {}).subscribe({
      next: (res) => {
        this.inviteLink.set({ name: user.fullName || user.username, url: res.url });
        this.loadUsers();
      },
      error: (err) => this.toast.show(this.i18n.t('settings.error', { msg: err?.error?.message || this.i18n.t('settings.toast.userSaveFailed') }), 'error'),
    });
  }

  unlockUser(user: any) {
    this.http.post(`${environment.apiUrl}/user/users/${user.id}/unlock`, {}).subscribe({
      next: () => {
        this.loadUsers();
        this.toast.show('✓ ' + this.i18n.t('settings.users.unlocked'), 'success');
      },
      error: (err) => this.toast.show(this.i18n.t('settings.error', { msg: err?.error?.message || this.i18n.t('settings.toast.userSaveFailed') }), 'error'),
    });
  }

  copyInvite(url: string) {
    navigator.clipboard?.writeText(url).then(
      () => this.toast.show('✓ ' + this.i18n.t('settings.users.linkCopied'), 'success'),
      () => undefined,
    );
  }

  promptDeleteUser(user: any) {
    if (user.role === 'admin') {
      this.toast.show(this.i18n.t('settings.error', { msg: this.i18n.t('settings.toast.adminCannotDelete') }), 'error');
      return;
    }
    this.userToDelete.set(user);
    this.showUserDeleteModal.set(true);
  }

  cancelDeleteUser() {
    this.showUserDeleteModal.set(false);
    this.userToDelete.set(null);
  }

  confirmDeleteUser() {
    const user = this.userToDelete();
    if (!user) return;

    this.isSavingUser.set(true);
    this.http.delete(`${environment.apiUrl}/user/users/${user.id}`).subscribe({
      next: () => {
        this.isSavingUser.set(false);
        this.cancelDeleteUser();
        this.loadUsers();
        this.toast.show('✓ ' + this.i18n.t('settings.toast.userDeleted'), 'success');
      },
      error: (err) => {
        this.isSavingUser.set(false);
        this.cancelDeleteUser();
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.userDeleteFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }
}
