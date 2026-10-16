import { Component, inject, ViewChild, signal, computed, OnInit, effect, ElementRef, untracked } from '@angular/core';
import { retry, timeout, timer, TimeoutError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
import { InventoryAccountingSettingsComponent } from './inventory-accounting-settings.component';
import { EBelgeSettingsComponent } from './ebelge-settings.component';
import { DocumentSettingsComponent } from './document-settings.component';
import { EBelgeProviderSettingsComponent } from './ebelge-provider-settings.component';
import { EBelgeArchiveSettingsComponent } from './ebelge-archive-settings.component';
import { LegalParametersComponent } from './legal-parameters.component';
import { KvkkSettingsComponent } from './kvkk-settings.component';
import { TotpSettingsComponent } from './totp-settings.component';
import { SessionService } from '../../services/session.service';
import { IconComponent } from '../shared/icon.component';

/** Empty passes (optional field); otherwise the KVKK-guide password policy. */
const strongPasswordValidator = (c: AbstractControl): ValidationErrors | null => (c.value && !isStrongPassword(c.value) ? { weakPassword: true } : null);

type NavVis = 'all' | 'kvkk' | 'admin' | 'super';
type SettingsTab = 'kvkk' | 'inventoryAccounting' | 'profile' | 'categories' | 'users' | 'company' | 'fiscal' | 'ebelge' | 'ebelgeProvider' | 'archive' | 'documents' | 'compliance' | 'legalParams' | 'taxRates' | 'exchangeRates' | 'units' | 'dashboard';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, AppDatePipe, NumberFormatPipe, UnitLabelPipe, FiscalSettingsComponent, EBelgeSettingsComponent, LegalParametersComponent, InventoryComplianceSettingsComponent, InventoryAccountingSettingsComponent, TaxSettingsComponent, TcmbPanelComponent, DocumentSettingsComponent, EBelgeProviderSettingsComponent, EBelgeArchiveSettingsComponent, KvkkSettingsComponent, TotpSettingsComponent, IconComponent],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'settings.title' | t }}</h1>
        <p>{{ 'settings.pageDesc' | t }}</p>
      </div>
    </header>

    <!-- narrow screens: one scrolling tab strip -->
    <nav class="tabs fade-edges settings-tabs" role="tablist" [attr.aria-label]="'settings.title' | t">
      @for (g of navGroups; track g.key) {
        @for (n of g.items; track n.tab) {
          @if (canSee(n.vis)) {
            <button type="button" class="tab" role="tab" [class.active]="activeTab() === n.tab" [attr.aria-selected]="activeTab() === n.tab" (click)="changeTab(n.tab)"><span>{{ n.label | t }}</span></button>
          }
        }
      }
      @if (profilePending()) { <span class="tab-skel skeleton-text" aria-hidden="true"></span><span class="tab-skel skeleton-text" aria-hidden="true"></span> }
    </nav>

    <div class="settings-shell">
      <!-- ≥1024px: grouped left sub-navigation -->
      <nav class="subnav settings-subnav" [attr.aria-label]="'settings.title' | t">
        @for (g of navGroups; track g.key) {
          @if (groupVisible(g)) {
            @if (g.label) { <div class="subnav-label">{{ g.label | t }}</div> }
            @for (n of g.items; track n.tab) {
              @if (canSee(n.vis)) {
                <button type="button" [class.active]="activeTab() === n.tab" [attr.aria-current]="activeTab() === n.tab ? 'page' : null" (click)="changeTab(n.tab)">
                  <app-icon [name]="n.icon" size="sm" /><span class="lbl">{{ n.label | t }}</span>
                </button>
              }
            }
          }
        }
        @if (profilePending()) {
          <div class="subnav-skel" aria-hidden="true">
            <span class="skeleton-text short"></span><span class="skeleton-text"></span><span class="skeleton-text"></span><span class="skeleton-text"></span>
            <span class="skeleton-text short"></span><span class="skeleton-text"></span><span class="skeleton-text"></span>
          </div>
        }
      </nav>

    <div class="settings-layout">
      @if (profileGate() === 'error') {
        <section class="card" role="alert">
          <div class="empty-state">
            <div class="empty-art"><app-icon name="alert" /></div>
            <h3>{{ 'layout.profileError.title' | t }}</h3>
            <p>{{ 'settings.profileError.desc' | t }}</p>
            <div class="actions cluster"><button type="button" class="btn btn-primary" (click)="loadProfile()"><app-icon name="refresh" />{{ 'layout.profileError.retry' | t }}</button></div>
          </div>
        </section>
      } @else if (profileGate() === 'pending') {
        <section class="card" aria-busy="true" [attr.aria-label]="'common.loading' | t">
          <div class="settings-skel"><div class="skeleton-title"></div><div class="skeleton-text short"></div><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
        </section>
      } @else {
      @if (activeTab() === 'dashboard') {
        @for (g of navGroups; track g.key) {
          @if (g.label && groupVisible(g)) {
            <section class="hub-group">
              <h2 class="hub-h">{{ g.label | t }}</h2>
              <div class="settings-hub">
                @for (n of g.items; track n.tab) {
                  @if (canSee(n.vis)) {
                    <button type="button" class="hub-card" (click)="changeTab(n.tab)">
                      <span class="hub-ic"><app-icon [name]="n.icon" /></span>
                      <span class="hub-t">
                        <b>{{ n.label | t }}</b>
                        <span>{{ n.desc | t }}</span>
                      </span>
                      <app-icon class="hub-go" name="chevr" size="sm" />
                    </button>
                  }
                }
              </div>
            </section>
          }
        }
      }

      <div class="settings-content">

        <!-- COMPANY SETTINGS TAB (Admin) -->
        @if (activeTab() === 'company') {
          <section class="card settings-narrow-card">
            <div class="card-h sh">
              <div class="hg"><h3>{{ 'settings.company.title' | t }}</h3><p>{{ 'settings.company.subtitle' | t }}</p></div>
            </div>
            <form [formGroup]="companyForm" (ngSubmit)="saveCompany()">
              <div class="card-b form-stack">
                <div class="fld">
                  <label class="fld-label" for="coName">{{ 'settings.company.name' | t }}</label>
                  <div class="field" [class.is-error]="companyForm.get('name')?.invalid && companyForm.get('name')?.touched"><input id="coName" type="text" formControlName="name" /></div>
                </div>
                <div class="grid-2">
                  <div class="fld">
                    <label class="fld-label" for="coCountry">{{ 'settings.company.country' | t }}</label>
                    <div class="field select"><select id="coCountry" formControlName="country">
                      @for (c of countries; track c.code) { <option [value]="c.code">{{ 'settings.country.' + c.code | t }} ({{ c.code }})</option> }
                    </select></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="coLang">{{ 'settings.company.defaultLanguage' | t }}</label>
                    <div class="field select"><select id="coLang" formControlName="defaultLanguage">
                      @for (l of languages; track l) { <option [value]="l">{{ 'settings.lang.' + l | t }}</option> }
                    </select></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="coCur">{{ 'settings.company.baseCurrency' | t }}</label>
                    <div class="field select"><select id="coCur" formControlName="baseCurrency">
                      @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                    </select></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="coTz">{{ 'settings.company.timezone' | t }}</label>
                    <div class="field select"><select id="coTz" formControlName="timezone">
                      @for (tz of timezones; track tz) { <option [value]="tz">{{ 'settings.tz.' + tz | t }} ({{ tz }})</option> }
                    </select></div>
                  </div>
                </div>
                <div class="setting-row">
                  <span class="t"><b id="pitLbl">{{ 'settings.company.pricesIncludeTax' | t }}</b><span id="pitHint">{{ 'settings.company.pricesIncludeTaxHint' | t }}</span></span>
                  <label class="switch"><input id="pricesIncludeTax" type="checkbox" role="switch" formControlName="pricesIncludeTax" aria-labelledby="pitLbl" aria-describedby="pitHint" /><span class="track"></span></label>
                </div>
                <div class="fld settings-narrow">
                  <label class="fld-label" for="expiryAlertDays">{{ 'settings.company.expiryAlertDays' | t }}</label>
                  <div class="field" [class.is-error]="companyForm.get('expiryAlertDays')?.invalid && companyForm.get('expiryAlertDays')?.touched">
                    <input id="expiryAlertDays" class="num" type="number" min="0" max="3650" step="1" formControlName="expiryAlertDays" />
                    <span class="affix suf">{{ 'settings.unit.days' | t }}</span>
                  </div>
                  <span class="fld-help">{{ 'settings.company.expiryAlertDaysHint' | t }}</span>
                </div>
              </div>
              <div class="card-f">
                <span class="spacer"></span>
                <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingCompany()" [disabled]="companyForm.invalid || companyForm.pristine || isSavingCompany()">
                  <span>{{ 'settings.company.save' | t }}</span>
                </button>
              </div>
            </form>
          </section>
        }

        <!-- FISCAL / E-BELGE / LEGAL PARAMETERS (WP1) -->
        @if (activeTab() === 'kvkk' && (isAdmin() || ui.isAuditor())) { <app-kvkk-settings></app-kvkk-settings> }
        @if (activeTab() === 'fiscal' && isAdmin()) { <app-fiscal-settings></app-fiscal-settings> }
        @if (activeTab() === 'ebelge' && isAdmin()) { <app-ebelge-settings></app-ebelge-settings> }
        @if (activeTab() === 'documents' && isAdmin()) { <app-document-settings></app-document-settings> }
        @if (activeTab() === 'ebelgeProvider' && isAdmin()) { <app-ebelge-provider-settings></app-ebelge-provider-settings> }
        @if (activeTab() === 'archive' && isAdmin()) { <app-ebelge-archive-settings></app-ebelge-archive-settings> }
        @if (activeTab() === 'compliance' && isAdmin()) { <app-inventory-compliance-settings></app-inventory-compliance-settings> }
        @if (activeTab() === 'inventoryAccounting' && isAdmin()) { <app-inventory-accounting-settings></app-inventory-accounting-settings> }
        @if (activeTab() === 'legalParams' && ui.userProfile()?.isSuperAdmin) { <app-legal-parameters></app-legal-parameters> }

        <!-- TAX RATES TAB (Admin) -->
        @if (activeTab() === 'taxRates' && isAdmin() && isTrCompany()) {
          <app-tax-settings [importerInitial]="!!ui.userProfile()?.company?.isImporterOrOreProducer" [designatedInitial]="!!ui.userProfile()?.company?.isDesignatedBuyer"></app-tax-settings>
        }
        @if (activeTab() === 'taxRates' && isAdmin() && !isTrCompany()) {
          <section class="card">
            <div class="card-h sh">
              <div class="hg"><h3>{{ 'settings.taxRates.title' | t }}</h3><p>{{ 'settings.taxRates.subtitle' | t }}</p></div>
            </div>
            <form class="card-b inline-form" [formGroup]="taxForm" (ngSubmit)="saveTaxRate()">
              <div class="grid-4">
                <div class="fld">
                  <label class="fld-label" for="taxName">{{ 'settings.taxRates.name' | t }}</label>
                  <div class="field" [class.is-error]="taxForm.get('name')?.invalid && taxForm.get('name')?.touched"><input id="taxName" type="text" formControlName="name" [placeholder]="'settings.taxRates.namePh' | t" /></div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="taxRate">{{ 'finance.taxRate' | t }}</label>
                  <div class="field" [class.is-error]="taxForm.get('rate')?.invalid && taxForm.get('rate')?.touched">
                    <input id="taxRate" class="num" type="number" min="0" max="100" step="0.01" formControlName="rate" />
                    <span class="affix suf">%</span>
                  </div>
                  @if (taxForm.get('rate')?.invalid && taxForm.get('rate')?.touched) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.taxRates.rateErr' | t }}</span> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="taxCountry">{{ 'settings.company.country' | t }}</label>
                  <div class="field select"><select id="taxCountry" formControlName="country">
                    <option value="">{{ 'settings.taxRates.anyCountry' | t }}</option>
                    @for (c of countries; track c.code) { <option [value]="c.code">{{ 'settings.country.' + c.code | t }} ({{ c.code }})</option> }
                  </select></div>
                </div>
                <div class="fld fld-check">
                  <label class="check"><input id="taxDefault" type="checkbox" formControlName="isDefault" />{{ 'finance.defaultTax' | t }}</label>
                </div>
              </div>
              <div class="form-actions">
                @if (editTaxId()) { <button type="button" class="btn btn-ghost" (click)="resetTaxForm()">{{ 'common.cancel' | t }}</button> }
                <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingTax()" [disabled]="taxForm.invalid || isSavingTax()">
                  @if (!editTaxId()) { <app-icon name="plus" /> }<span>{{ (editTaxId() ? 'common.save' : 'settings.taxRates.add') | t }}</span>
                </button>
              </div>
            </form>
            <div class="table-scroll">
              @if (isLoadingTax()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (taxRates().length === 0) {
                <div class="empty-state"><div class="empty-art"><app-icon name="receipt" /></div><h3>{{ 'settings.taxRates.empty' | t }}</h3></div>
              } @else {
                <table class="tbl table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.taxRates.name' | t }}</th>
                      <th class="r">{{ 'finance.taxRate' | t }}</th>
                      <th>{{ 'settings.company.country' | t }}</th>
                      <th>{{ 'finance.defaultTax' | t }}</th>
                      <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (tr of taxRates(); track tr.id) {
                      <tr>
                        <td [attr.data-label]="'settings.taxRates.name' | t"><strong>{{ tr.name }}</strong></td>
                        <td class="r" [attr.data-label]="'finance.taxRate' | t">%{{ tr.rate | num }}</td>
                        <td [attr.data-label]="'settings.company.country' | t">@if (tr.country) { <span class="tag">{{ tr.country }}</span> } @else { <span class="text-muted">—</span> }</td>
                        <td [attr.data-label]="'finance.defaultTax' | t">
                          @if (tr.isDefault) { <span class="badge badge-success"><span class="dot"></span>{{ 'finance.defaultTax' | t }}</span> }
                          @else { <button type="button" class="btn btn-xs" (click)="setDefaultTax(tr)">{{ 'settings.taxRates.setDefault' | t }}</button> }
                        </td>
                        <td class="td-actions w-act2">
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="editTax(tr)"><app-icon name="edit" size="sm" /></button>
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act danger-ic" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="deleteTax(tr)"><app-icon name="trash" size="sm" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </section>
        }

        <!-- UNITS TAB -->
        @if (activeTab() === 'units') {
          <section class="card">
            <div class="card-h sh">
              <div class="hg"><h3>{{ 'settings.units.title' | t }}</h3><p>{{ 'settings.units.subtitle' | t }}</p></div>
              @if (!isLoadingUnits() && units().length) { <span class="tag">{{ units().length | num }}</span> }
            </div>
            @if (canManageUnits()) {
              <form class="card-b inline-form" [formGroup]="unitForm" (ngSubmit)="saveUnit()">
                <div class="grid-4">
                  <div class="fld">
                    <label class="fld-label" for="unitCode">{{ 'settings.units.code' | t }}</label>
                    <div class="field" [class.is-error]="unitForm.get('code')?.invalid && unitForm.get('code')?.touched"><input id="unitCode" class="mono" type="text" formControlName="code" [placeholder]="'settings.units.codePlaceholder' | t" [readonly]="editUnitStandard()" /></div>
                    @if (editUnitStandard()) { <span class="fld-help">{{ 'settings.units.codeLocked' | t }}</span> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="unitName">{{ 'settings.units.name' | t }}</label>
                    <div class="field" [class.is-error]="unitForm.get('name')?.invalid && unitForm.get('name')?.touched"><input id="unitName" type="text" formControlName="name" [placeholder]="'settings.units.namePlaceholder' | t" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="unitUnece">{{ 'units.uneceCode' | t }}</label>
                    <div class="field select"><select id="unitUnece" formControlName="uneceCode" (change)="onUneceChange()">
                      <option value="">—</option>
                      @for (g of uneceGroups; track g.group) {
                        <optgroup [label]="('units.uneceGroup.' + g.group) | t">
                          @for (c of g.codes; track c.code) {
                            <option [value]="c.code">{{ c.code }} · {{ ('units.unece.' + c.code) | t }}</option>
                          }
                        </optgroup>
                      }
                    </select></div>
                    <span class="fld-help">{{ 'units.uneceHint' | t }}</span>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="unitDecimals">{{ 'units.decimals' | t }}</label>
                    <div class="field select"><select id="unitDecimals" formControlName="decimals">
                      @for (d of [0, 1, 2, 3]; track d) { <option [ngValue]="d" [disabled]="d > maxUnitDecimals()">{{ ('units.decimalsOption.' + d) | t }}</option> }
                    </select></div>
                    <span class="fld-help">{{ (maxUnitDecimals() === 0 ? 'units.decimalsCountHint' : 'units.decimalsHint') | t }}</span>
                  </div>
                </div>
                <div class="form-actions">
                  @if (editUnitId()) { <button type="button" class="btn btn-ghost" (click)="resetUnitForm()">{{ 'common.cancel' | t }}</button> }
                  <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingUnit()" [disabled]="unitForm.invalid || isSavingUnit()">
                    @if (!editUnitId()) { <app-icon name="plus" /> }<span>{{ (editUnitId() ? 'common.save' : 'settings.units.add') | t }}</span>
                  </button>
                </div>
              </form>
            }
            <div class="table-scroll">
              @if (isLoadingUnits()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (unitsError()) {
                <div class="empty-state" role="alert">
                  <div class="empty-art"><app-icon name="alert" /></div>
                  <h3>{{ 'settings.units.loadErrorTitle' | t }}</h3>
                  <p>{{ 'settings.units.loadErrorDesc' | t }}</p>
                  <div class="actions"><button type="button" class="btn" (click)="loadUnits()"><app-icon name="refresh" />{{ 'settings.units.retry' | t }}</button></div>
                </div>
              } @else if (units().length === 0) {
                <div class="empty-state">
                  <div class="empty-art"><app-icon name="hash" /></div>
                  <h3>{{ 'settings.units.empty' | t }}</h3>
                  <p>{{ 'settings.units.emptyDesc' | t }}</p>
                  @if (canManageUnits()) { <div class="actions"><button type="button" class="btn btn-primary" (click)="focusUnitForm()"><app-icon name="plus" />{{ 'settings.units.add' | t }}</button></div> }
                </div>
              } @else {
                <table class="tbl table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.units.code' | t }}</th>
                      <th>{{ 'settings.units.name' | t }}</th>
                      <th>{{ 'units.uneceCode' | t }}</th>
                      <th class="r">{{ 'units.decimals' | t }}</th>
                      <th>{{ 'settings.units.type' | t }}</th>
                      @if (canManageUnits()) { <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th> }
                    </tr>
                  </thead>
                  <tbody>
                    @for (u of units(); track u.id) {
                      <tr>
                        <td class="mono" [attr.data-label]="'settings.units.code' | t">{{ u.code }}</td>
                        <td [attr.data-label]="'settings.units.name' | t"><strong>{{ u | unitLabel }}</strong></td>
                        <td [attr.data-label]="'units.uneceCode' | t">
                          @if (u.uneceCode) { <span class="tag">{{ u.uneceCode }}</span> } @else { <span class="badge badge-warning" [attr.data-tip]="'units.uneceMissingHint' | t"><span class="dot"></span>{{ 'units.uneceMissing' | t }}</span> }
                        </td>
                        <td class="r" [attr.data-label]="'units.decimals' | t">{{ u.decimals ?? 0 }}</td>
                        <td [attr.data-label]="'settings.units.type' | t">
                          @if (u.isStandard) { <span class="badge badge-info"><span class="dot"></span>{{ 'settings.units.standard' | t }}</span> }
                          @else { <span class="badge badge-neutral"><span class="dot"></span>{{ 'settings.units.custom' | t }}</span> }
                          @if (u.deprecated) { <span class="badge badge-warning" [attr.data-tip]="'units.deprecatedHint' | t"><span class="dot"></span>{{ 'units.deprecated' | t }}</span> }
                        </td>
                        @if (canManageUnits()) {
                          <td class="td-actions w-act2">
                            <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="editUnit(u)"><app-icon name="edit" size="sm" /></button>
                            <button type="button" class="btn btn-ghost btn-xs btn-icon row-act danger-ic" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="deleteUnit(u)"><app-icon name="trash" size="sm" /></button>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </section>
        }

        <!-- EXCHANGE RATES TAB (Admin) -->
        @if (activeTab() === 'exchangeRates' && isAdmin()) {
          @if (isTrCompany()) {
            <app-tcmb-panel [autoInitial]="!!ui.userProfile()?.company?.fxAutoFetch" (fetched)="loadExchangeRates()"></app-tcmb-panel>
          }
          <section class="card">
            <div class="card-h sh">
              <div class="hg"><h3>{{ 'settings.exchangeRates.title' | t }}</h3><p>{{ 'settings.exchangeRates.subtitle' | t }}</p></div>
            </div>
            <form class="card-b inline-form" [formGroup]="fxForm" (ngSubmit)="saveExchangeRate()">
              <div class="grid-4">
                <div class="fld">
                  <label class="fld-label" for="fxBase">{{ 'settings.exchangeRates.base' | t }}</label>
                  <div class="field select"><select id="fxBase" formControlName="baseCurrency">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select></div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="fxQuote">{{ 'settings.exchangeRates.quote' | t }}</label>
                  <div class="field select" [class.is-error]="fxSameCurrency()"><select id="fxQuote" formControlName="quoteCurrency">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select></div>
                </div>
                <div class="fld">
                  <label class="fld-label" for="fxRate">{{ 'settings.exchangeRates.rate' | t }}</label>
                  <div class="field" [class.is-error]="fxForm.get('rate')?.invalid && fxForm.get('rate')?.touched"><input id="fxRate" class="num" type="number" min="0" step="any" formControlName="rate" /></div>
                  @if (fxForm.get('rate')?.invalid && fxForm.get('rate')?.touched) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.exchangeRates.rateErr' | t }}</span> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="fxDate">{{ 'settings.exchangeRates.date' | t }}</label>
                  <div class="field"><input id="fxDate" type="date" formControlName="date" /></div>
                </div>
              </div>
              <div class="form-actions">
                <span class="form-actions-note">
                  @if (fxSameCurrency()) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.exchangeRates.sameErr' | t }}</span> }
                  @else if (fxForm.getRawValue().rate > 0) { <span class="fld-help">{{ 'settings.exchangeRates.preview' | t: { base: fxForm.getRawValue().baseCurrency, rate: (fxForm.getRawValue().rate | num: 4), quote: fxForm.getRawValue().quoteCurrency } }}</span> }
                </span>
                @if (editFxId()) { <button type="button" class="btn btn-ghost" (click)="resetFxForm()">{{ 'common.cancel' | t }}</button> }
                <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingFx()" [disabled]="fxForm.invalid || fxSameCurrency() || isSavingFx()">
                  @if (!editFxId()) { <app-icon name="plus" /> }<span>{{ (editFxId() ? 'common.save' : 'settings.exchangeRates.add') | t }}</span>
                </button>
              </div>
            </form>
            <div class="table-scroll">
              @if (isLoadingFx()) {
                <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
              } @else if (sortedExchangeRates().length === 0) {
                <div class="empty-state"><div class="empty-art"><app-icon name="swap" /></div><h3>{{ 'settings.exchangeRates.empty' | t }}</h3></div>
              } @else {
                <table class="tbl table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.exchangeRates.date' | t }}</th>
                      <th>{{ 'settings.exchangeRates.pair' | t }}</th>
                      <th class="r">{{ 'settings.exchangeRates.rate' | t }}</th>
                      <th>{{ 'settings.exchangeRates.source' | t }}</th>
                      <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (fx of sortedExchangeRates(); track fx.id) {
                      <tr>
                        <td [attr.data-label]="'settings.exchangeRates.date' | t">{{ fx.date | appDate }}</td>
                        <td class="mono" [attr.data-label]="'settings.exchangeRates.pair' | t">{{ fx.baseCurrency }}/{{ fx.quoteCurrency }}</td>
                        <td class="r" [attr.data-label]="'settings.exchangeRates.rate' | t">{{ 'settings.exchangeRates.preview' | t: { base: fx.baseCurrency, rate: (fx.rate | num: 4), quote: fx.quoteCurrency } }}</td>
                        <td [attr.data-label]="'settings.exchangeRates.source' | t">
                          <span class="src-cell">
                            <span class="badge" [class.badge-info]="fx.source === 'TCMB'" [class.badge-neutral]="fx.source !== 'TCMB'"><span class="dot"></span>{{ 'finance.fxSource.' + (fx.source || 'MANUAL') | t }}</span>
                            <span class="text-muted">{{ 'finance.rateType.' + (fx.rateType || 'FOREX_BUYING') | t }}@if (fx.bulletinNo) { · <span class="mono">{{ fx.bulletinNo }}</span> }</span>
                          </span>
                        </td>
                        <td class="td-actions w-act2">
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="editFx(fx)"><app-icon name="edit" size="sm" /></button>
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act danger-ic" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="deleteFx(fx)"><app-icon name="trash" size="sm" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </section>
        }

        <!-- PROFILE & SECURITY TAB -->
        <ng-container *ngIf="activeTab() === 'profile'">
          <div class="settings-container">
            <div class="settings-left-col">
              <app-totp-settings></app-totp-settings>
              <section class="card">
                <div class="card-h sh">
                  <div class="hg"><h3>{{ 'settings.profile.title' | t }}</h3><p>{{ 'settings.profile.subtitle' | t }}</p></div>
                </div>
                <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
                  <div class="card-b form-stack">
                    <div class="settings-avatar-section">
                      <div class="settings-avatar">
                        @if (ui.userProfile()?.avatar) {
                          <img [src]="ui.userProfile().avatar" class="settings-avatar-img" alt="" />
                        } @else {
                          {{ getAvatarInitials() }}
                        }
                      </div>
                      <div class="settings-avatar-actions">
                        <button type="button" class="btn btn-sm" (click)="fileInput.click()"><app-icon name="upload" size="sm" />{{ 'settings.profile.uploadPhoto' | t }}</button>
                        <input #fileInput type="file" hidden (change)="onFileSelected($event)" accept="image/*" />
                        <button type="button" class="btn btn-ghost btn-sm" (click)="removeAvatar()">{{ 'settings.profile.removePhoto' | t }}</button>
                      </div>
                    </div>
                    <div class="grid-2">
                      <div class="fld">
                        <label class="fld-label" for="pfName">{{ 'settings.profile.fullName' | t }}</label>
                        <div class="field" [class.is-error]="isProfileFieldInvalid('fullName')"><input id="pfName" type="text" formControlName="fullName" [placeholder]="'settings.profile.fullNamePh' | t" /></div>
                        @if (isProfileFieldInvalid('fullName')) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.profile.fullNameErr' | t }}</span> }
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="pfEmail">{{ 'settings.profile.email' | t }}</label>
                        <div class="field" [class.is-error]="isProfileFieldInvalid('email')"><input id="pfEmail" type="email" formControlName="email" [placeholder]="'settings.profile.emailPh' | t" /></div>
                        @if (isProfileFieldInvalid('email')) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.profile.emailErr' | t }}</span> }
                      </div>
                      <div class="fld span-all">
                        <label class="fld-label" for="pfDept">{{ 'settings.profile.department' | t }}</label>
                        <div class="field"><input id="pfDept" type="text" formControlName="department" [placeholder]="'settings.profile.departmentPh' | t" /></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="pfLang">{{ 'settings.profile.language' | t }}</label>
                        <div class="field select"><select id="pfLang" formControlName="language">
                          <option value="">{{ 'settings.profile.companyDefault' | t: { value: ui.userProfile()?.company?.defaultLanguage } }}</option>
                          @for (l of languages; track l) { <option [value]="l">{{ 'settings.lang.' + l | t }}</option> }
                        </select></div>
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="pfTz">{{ 'settings.profile.timezone' | t }}</label>
                        <div class="field select"><select id="pfTz" formControlName="timezone">
                          <option value="">{{ 'settings.profile.companyDefault' | t: { value: ui.userProfile()?.company?.timezone ? ('settings.tz.' + ui.userProfile()?.company?.timezone | t) : '—' } }}</option>
                          @for (tz of timezones; track tz) { <option [value]="tz">{{ 'settings.tz.' + tz | t }} ({{ tz }})</option> }
                        </select></div>
                      </div>
                    </div>
                  </div>
                  <div class="card-f">
                    <span class="spacer"></span>
                    <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingProfile" [disabled]="profileForm.invalid || profileForm.pristine || isSavingProfile">
                      <span>{{ 'settings.profile.save' | t }}</span>
                    </button>
                  </div>
                </form>
              </section>

              <section class="card">
                <div class="card-h sh">
                  <div class="hg"><h3>{{ 'settings.password.title' | t }}</h3><p>{{ 'settings.password.subtitle' | t }}</p></div>
                </div>
                <form [formGroup]="passwordForm" (ngSubmit)="updatePassword()">
                  <div class="card-b form-stack">
                    <div class="fld">
                      <label class="fld-label" for="pwCur">{{ 'settings.password.current' | t }}</label>
                      <div class="field" [class.is-error]="isPasswordFieldInvalid('currentPassword')">
                        <span class="lead"><app-icon name="lock" size="sm" /></span>
                        <input id="pwCur" [type]="showCurrent() ? 'text' : 'password'" formControlName="currentPassword" placeholder="••••••••" autocomplete="current-password" />
                        <span class="trail"><button type="button" class="eye-btn" (click)="showCurrent.set(!showCurrent())" [attr.aria-label]="(showCurrent() ? 'login.hidePassword' : 'login.showPassword') | t"><app-icon [name]="showCurrent() ? 'eyeoff' : 'eye'" size="sm" /></button></span>
                      </div>
                      @if (isPasswordFieldInvalid('currentPassword')) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.password.currentErr' | t }}</span> }
                    </div>
                    <div class="grid-2">
                      <div class="fld">
                        <label class="fld-label" for="pwNew">{{ 'settings.password.new' | t }}</label>
                        <div class="field" [class.is-error]="isPasswordFieldInvalid('newPassword')">
                          <input id="pwNew" [type]="showNew() ? 'text' : 'password'" formControlName="newPassword" [placeholder]="'settings.password.newPh' | t" (input)="evaluatePasswordStrength()" autocomplete="new-password" />
                          <span class="trail"><button type="button" class="eye-btn" (click)="showNew.set(!showNew())" [attr.aria-label]="(showNew() ? 'login.hidePassword' : 'login.showPassword') | t"><app-icon [name]="showNew() ? 'eyeoff' : 'eye'" size="sm" /></button></span>
                        </div>
                        <div class="password-strength-container" *ngIf="passwordForm.get('newPassword')?.value">
                          <div class="password-strength-bars">
                            <div [style.background]="pwdStrength() >= 1 ? strengthColors[pwdStrength()-1] : null"></div>
                            <div [style.background]="pwdStrength() >= 2 ? strengthColors[pwdStrength()-1] : null"></div>
                            <div [style.background]="pwdStrength() >= 3 ? strengthColors[pwdStrength()-1] : null"></div>
                            <div [style.background]="pwdStrength() >= 4 ? strengthColors[pwdStrength()-1] : null"></div>
                          </div>
                          <div class="strength-label" [style.color]="pwdStrength() > 0 ? strengthColors[pwdStrength()-1] : 'inherit'">{{ strengthLabels[pwdStrength()] ? (strengthLabels[pwdStrength()] | t) : '' }}</div>
                        </div>
                        @if (isPasswordFieldInvalid('newPassword')) { <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.password.newErr' | t }}</span> }
                      </div>
                      <div class="fld">
                        <label class="fld-label" for="pwConf">{{ 'settings.password.confirm' | t }}</label>
                        <div class="field" [class.is-error]="passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)">
                          <input id="pwConf" [type]="showConfirm() ? 'text' : 'password'" formControlName="confirmPassword" [placeholder]="'settings.password.confirmPh' | t" autocomplete="new-password" />
                          <span class="trail"><button type="button" class="eye-btn" (click)="showConfirm.set(!showConfirm())" [attr.aria-label]="(showConfirm() ? 'login.hidePassword' : 'login.showPassword') | t"><app-icon [name]="showConfirm() ? 'eyeoff' : 'eye'" size="sm" /></button></span>
                        </div>
                        @if (passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)) {
                          <span class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.password.mismatch' | t }}</span>
                        } @else if (!passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.value) {
                          <span class="fld-ok"><app-icon name="check" size="sm" />{{ 'settings.password.match' | t }}</span>
                        }
                      </div>
                    </div>
                  </div>
                  <div class="card-f">
                    <span class="spacer"></span>
                    <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingPassword" [disabled]="passwordForm.invalid || !passwordForm.get('currentPassword')?.value || isSavingPassword">
                      <span>{{ 'settings.password.update' | t }}</span>
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <div class="settings-right-col">
              <section class="card">
                <div class="card-h"><h3>{{ 'settings.summary.title' | t }}</h3></div>
                <dl class="kv card-b">
                  <div><dt>{{ 'settings.summary.accountType' | t }}</dt><dd>{{ roleLabel(ui.userProfile()?.role) | t }}</dd></div>
                  <div><dt>{{ 'settings.summary.memberSince' | t }}</dt><dd>{{ (ui.userProfile()?.createdAt | appDate) || (defaultMemberSince | appDate) }}</dd></div>
                  <div><dt>{{ 'settings.summary.lastLogin' | t }}</dt><dd>{{ demoLastLogin | appDate: 'datetime' }}</dd></div>
                  <div><dt>{{ 'settings.summary.status' | t }}</dt><dd><span class="badge badge-success"><span class="dot"></span>{{ 'settings.summary.active' | t }}</span></dd></div>
                </dl>
              </section>

              <section class="card">
                <div class="card-h"><h3>{{ 'settings.security.title' | t }}</h3></div>
                <div class="card-b">
                  <div class="kv-row"><span class="kv-ic"><app-icon name="lock" size="sm" /></span><span class="kv-t">{{ 'settings.security.passwordUpdate' | t }}</span><span class="kv-v text-muted">{{ 'settings.security.daysAgo' | t: { n: 30 } }}</span></div>
                  <div class="kv-row"><span class="kv-ic"><app-icon name="globe" size="sm" /></span><span class="kv-t">{{ 'settings.security.activeSession' | t }}</span><span class="badge badge-info"><span class="dot"></span>{{ 'settings.security.sessions' | t: { n: 1 } }}</span></div>
                  <div class="kv-row"><span class="kv-ic"><app-icon name="okc" size="sm" /></span><span class="kv-t">{{ 'settings.security.emailVerification' | t }}</span><span class="badge badge-success"><span class="dot"></span>{{ 'settings.security.verified' | t }}</span></div>
                </div>
                <div class="card-f"><button type="button" class="btn btn-danger-outline btn-block" (click)="terminateAllSessions()"><app-icon name="logout" size="sm" />{{ 'settings.security.terminateAll' | t }}</button></div>
              </section>

              <section class="card tips">
                <div class="card-h"><h3>{{ 'settings.tips.title' | t }}</h3></div>
                <div class="card-b"><ul class="tips-list">
                  <li><app-icon name="check" size="sm" />{{ 'settings.tips.strong' | t }}</li>
                  <li><app-icon name="check" size="sm" />{{ 'settings.tips.rotate' | t }}</li>
                  <li><app-icon name="check" size="sm" />{{ 'settings.tips.keepUpdated' | t }}</li>
                </ul></div>
              </section>
            </div>
          </div>
        </ng-container>

        <!-- CATEGORY MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'categories'">
          <section class="card">
            <div class="card-h sh">
              <div class="hg"><h3>{{ 'settings.categories.title' | t }}</h3><p>{{ 'settings.categories.subtitle' | t }}</p></div>
              <button type="button" class="btn btn-primary" (click)="openCategoryDrawer()"><app-icon name="plus" /><span>{{ 'settings.categories.add' | t }}</span></button>
            </div>
            @if (isLoadingCategories()) {
              <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
            } @else if (categories().length === 0) {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="tag" /></div>
                <h3>{{ 'settings.categories.empty' | t }}</h3>
                <div class="actions cluster"><button type="button" class="btn btn-primary" (click)="openCategoryDrawer()"><app-icon name="plus" />{{ 'settings.categories.addFirst' | t }}</button></div>
              </div>
            } @else {
              <div class="table-scroll">
                <table class="tbl table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.categories.name' | t }}</th>
                      <th>{{ 'settings.categories.slug' | t }}</th>
                      <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (cat of categories(); track cat.id) {
                      <tr>
                        <td [attr.data-label]="'settings.categories.name' | t"><div class="cell-prod"><span class="thumb">{{ (cat.name || '?').charAt(0) }}</span><b>{{ cat.name }}</b></div></td>
                        <td class="mono text-muted" [attr.data-label]="'settings.categories.slug' | t">{{ cat.slug }}</td>
                        <td class="td-actions w-act2">
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="openCategoryDrawer(cat)"><app-icon name="edit" size="sm" /></button>
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act danger-ic" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="promptDeleteCategory(cat)"><app-icon name="trash" size="sm" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="tbl-foot"><span><strong class="mono">{{ categories().length | num }}</strong> {{ (categories().length === 1 ? 'settings.categories.countOne' : 'settings.categories.countMany') | t }}</span></div>
            }
          </section>
        </ng-container>

        <!-- USER MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'users'">
          @if (inviteLink(); as link) {
            <div class="notice notice-info settings-invite" role="status">
              <app-icon name="link" />
              <span class="t">{{ 'settings.users.inviteCreated' | t: { name: link.name } }} <code class="mono invite-url">{{ link.url }}</code></span>
              <button type="button" class="btn btn-sm" (click)="copyInvite(link.url)"><app-icon name="copy" size="sm" />{{ 'settings.users.copyLink' | t }}</button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="inviteLink.set(null)" [attr.aria-label]="'common.close' | t"><app-icon name="x" size="sm" /></button>
            </div>
          }
          <section class="card">
            <div class="card-h sh">
              <div class="hg"><h3>{{ 'settings.tab.users' | t }}</h3><p>{{ 'settings.users.subtitle' | t }}</p></div>
              <button type="button" class="btn btn-primary" (click)="openUserDrawer()"><app-icon name="plus" /><span>{{ 'settings.users.add' | t }}</span></button>
            </div>
            @if (usersError() && !isLoadingUsers()) {
              <div class="empty-state" role="alert">
                <div class="empty-art"><app-icon name="alert" /></div>
                <h3>{{ 'settings.toast.usersLoadFailed' | t }}</h3>
                <div class="actions cluster"><button type="button" class="btn" (click)="loadUsers()"><app-icon name="refresh" />{{ 'layout.profileError.retry' | t }}</button></div>
              </div>
            } @else if (isLoadingUsers() || (isAdmin() && !usersLoaded())) {
              <div class="settings-skel" [attr.aria-label]="'common.loading' | t"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
            } @else if (users().length === 0) {
              <div class="empty-state">
                <div class="empty-art"><app-icon name="users" /></div>
                <h3>{{ 'settings.users.empty' | t }}</h3>
                <div class="actions cluster"><button type="button" class="btn btn-primary" (click)="openUserDrawer()"><app-icon name="plus" />{{ 'settings.users.addFirst' | t }}</button></div>
              </div>
            } @else {
              <div class="table-scroll">
                <table class="tbl table-responsive">
                  <thead>
                    <tr>
                      <th>{{ 'settings.users.fullName' | t }}</th>
                      <th>{{ 'settings.users.role' | t }}</th>
                      <th>{{ 'settings.users.department' | t }}</th>
                      <th>{{ 'settings.users.email' | t }}</th>
                      <th>{{ 'settings.users.status' | t }}</th>
                      <th class="w-act"><span class="sr-only">{{ 'common.actions' | t }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (user of users(); track user.id) {
                      <tr>
                        <td class="td-primary" [attr.data-label]="'settings.users.fullName' | t">
                          <div class="cell-prod">
                            <span class="thumb av">
                              @if (user.avatar) { <img [src]="user.avatar" alt="" /> } @else { {{ getInitials(user.fullName) }} }
                            </span>
                            <b>{{ user.fullName }}</b><span class="cell-code">{{ user.username }}</span>
                          </div>
                        </td>
                        <td [attr.data-label]="'settings.users.role' | t">
                          <span class="badge" [class.badge-info]="user.role === 'admin'" [class.badge-neutral]="user.role !== 'admin'"><span class="dot"></span>{{ roleLabel(user.role) | t }}</span>
                        </td>
                        <td [attr.data-label]="'settings.users.department' | t">@if (user.department) { {{ user.department }} } @else { <span class="text-muted">—</span> }</td>
                        <td class="text-muted" [attr.data-label]="'settings.users.email' | t">{{ user.email }}</td>
                        <td [attr.data-label]="'settings.users.status' | t">
                          @if (user.locked) { <span class="badge badge-danger"><span class="dot"></span>{{ 'settings.users.statusLocked' | t }}</span> }
                          @else if (user.invitePending) { <span class="badge badge-info"><span class="dot"></span>{{ 'settings.users.statusInvited' | t }}</span> }
                          @else if (user.mustChangePassword) { <span class="badge badge-warning"><span class="dot"></span>{{ 'settings.users.statusMustChange' | t }}</span> }
                          @else { <span class="badge badge-success"><span class="dot"></span>{{ 'settings.users.statusActive' | t }}</span> }
                        </td>
                        <td class="td-actions w-act4">
                          @if (user.locked) {
                            <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'settings.users.unlock' | t" [attr.data-tip]="'settings.users.unlock' | t" (click)="unlockUser(user)"><app-icon name="lock" size="sm" /></button>
                          }
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'settings.users.reinvite' | t" [attr.data-tip]="'settings.users.reinvite' | t" (click)="reinviteUser(user)"><app-icon name="link" size="sm" /></button>
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="openUserDrawer(user)"><app-icon name="edit" size="sm" /></button>
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act danger-ic" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" [disabled]="user.role === 'admin'" (click)="promptDeleteUser(user)"><app-icon name="trash" size="sm" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="tbl-foot"><span><strong class="mono">{{ users().length | num }}</strong> {{ (users().length === 1 ? 'settings.users.countOne' : 'settings.users.countMany') | t }}</span></div>
            }
          </section>
        </ng-container>
      </div>
      }
    </div>
    </div>

    <!-- Category Drawer -->
    @if (isCategoryDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeCategoryDrawer()">
        <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="catDrawerTitle" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title" id="catDrawerTitle">{{ (editCategoryId() ? 'settings.categories.edit' : 'settings.categories.add') | t }}</span>
            <button type="button" class="drawer-close" (click)="closeCategoryDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
          </div>

          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" class="drawer-form">
            <div class="drawer-body">
              <div class="fld">
                <label class="fld-label" for="catName">{{ 'settings.categories.nameLabel' | t }} <span class="req">*</span></label>
                <div class="field" [class.is-error]="isCategoryFieldInvalid('name')"><input id="catName" type="text" formControlName="name" [disabled]="isSavingCategory()" /></div>
                @if (isCategoryFieldInvalid('name')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.categories.nameErr' | t }}</div> }
              </div>
              <div class="fld">
                <label class="fld-label" for="catSlug">{{ 'settings.categories.slugLabel' | t }}</label>
                <div class="field"><span class="affix pre mono">/</span><input id="catSlug" class="mono" type="text" formControlName="slug" [disabled]="isSavingCategory()" [placeholder]="'settings.categories.slugPh' | t" /></div>
              </div>
            </div>

            <div class="drawer-footer">
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeCategoryDrawer()" [disabled]="isSavingCategory()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingCategory()" [disabled]="categoryForm.invalid || isSavingCategory()">
                <span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Category Delete Confirmation Modal -->
    @if (showCategoryDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm" role="alertdialog" aria-modal="true" aria-labelledby="catDelTitle">
          <div class="delete-modal-content">
            <button type="button" class="delete-modal-close" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            <div class="delete-icon"><app-icon name="trash" /></div>
            <h3 class="delete-modal-title" id="catDelTitle">{{ 'settings.categories.deleteTitle' | t }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ categoryToDelete()?.name }}</strong> {{ 'settings.categories.deleteConfirm' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button type="button" class="btn btn-ghost" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-danger" [class.is-loading]="isSavingCategory()" (click)="confirmDeleteCategory()" [disabled]="isSavingCategory()">
              <span>{{ 'common.delete' | t }}</span>
            </button>
          </div>
        </div>
      </div>
    }

    <!-- User Drawer -->
    @if (isUserDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeUserDrawer()">
        <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="userDrawerTitle" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title" id="userDrawerTitle">{{ (editUserId() ? 'settings.users.edit' : 'settings.users.add') | t }}</span>
            <button type="button" class="drawer-close" (click)="closeUserDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
          </div>

          <form [formGroup]="userForm" (ngSubmit)="saveUser()" class="drawer-form">
            <div class="drawer-body">
              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'settings.profile.title' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="userFullName">{{ 'settings.users.fullNameLabel' | t }} <span class="req">*</span></label>
                  <div class="field" [class.is-error]="isUserFieldInvalid('fullName')"><input id="userFullName" type="text" formControlName="fullName" [disabled]="isSavingUser()" /></div>
                  @if (isUserFieldInvalid('fullName')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.users.fullNameErr' | t }}</div> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="userEmail">{{ 'settings.users.emailLabel' | t }}</label>
                  <div class="field" [class.is-error]="isUserFieldInvalid('email')"><input id="userEmail" type="email" formControlName="email" [disabled]="isSavingUser()" /></div>
                  @if (isUserFieldInvalid('email')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.profile.emailErr' | t }}</div> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="userDepartment">{{ 'settings.users.department' | t }}</label>
                  <div class="field"><input id="userDepartment" type="text" formControlName="department" [disabled]="isSavingUser()" /></div>
                </div>
              </section>
              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'settings.password.title' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="userUsername">{{ 'settings.users.usernameLabel' | t }} <span class="req">*</span></label>
                  <div class="field" [class.is-error]="isUserFieldInvalid('username')"><span class="lead"><app-icon name="user" size="sm" /></span><input id="userUsername" class="mono" type="text" formControlName="username" [disabled]="isSavingUser() || !!editUserId()" /></div>
                  @if (isUserFieldInvalid('username')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.users.usernameErr' | t }}</div> }
                </div>
                <div class="fld">
                  <label class="fld-label" for="userPassword">{{ (editUserId() ? 'settings.users.passwordEdit' : 'settings.users.passwordNew') | t }}</label>
                  <div class="field" [class.is-error]="isUserFieldInvalid('password')"><span class="lead"><app-icon name="lock" size="sm" /></span><input id="userPassword" type="password" formControlName="password" [disabled]="isSavingUser()" autocomplete="new-password" /></div>
                  @if (isUserFieldInvalid('password')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'settings.users.passwordErr' | t }}</div> }
                  <span class="fld-help">{{ (editUserId() ? 'settings.users.passwordEditHint' : 'settings.users.passwordNewHint') | t }}</span>
                </div>
              </section>
              <section class="fsec">
                <div class="fsec-h"><span class="n">3</span><h3>{{ 'settings.users.role' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="userRole">{{ 'settings.users.role' | t }}</label>
                  <div class="field select"><select id="userRole" formControlName="role" [disabled]="isSavingUser()">
                    <option value="manager">{{ 'settings.users.roleManagerOpt' | t }}</option>
                    <option value="viewer">{{ 'settings.users.roleViewerOpt' | t }}</option>
                    <option value="auditor">{{ 'settings.users.roleAuditorOpt' | t }}</option>
                  </select></div>
                </div>
                @if (userForm.value.role === 'viewer' || userForm.value.role === 'auditor') {
                  <div class="setting-row">
                    <span class="t"><b id="piiLbl">{{ 'settings.users.piiRead' | t }}</b><span id="piiHint">{{ 'settings.users.piiReadHint' | t }}</span></span>
                    <label class="switch"><input type="checkbox" role="switch" formControlName="piiRead" aria-labelledby="piiLbl" aria-describedby="piiHint" /><span class="track"></span></label>
                  </div>
                }
              </section>
            </div>

            <div class="drawer-footer">
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeUserDrawer()" [disabled]="isSavingUser()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSavingUser()" [disabled]="userForm.invalid || isSavingUser()">
                <span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- User Delete Confirmation Modal -->
    @if (showUserDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm" role="alertdialog" aria-modal="true" aria-labelledby="userDelTitle">
          <div class="delete-modal-content">
            <button type="button" class="delete-modal-close" (click)="cancelDeleteUser()" [disabled]="isSavingUser()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
            <div class="delete-icon"><app-icon name="trash" /></div>
            <h3 class="delete-modal-title" id="userDelTitle">{{ 'settings.users.deleteTitle' | t }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ userToDelete()?.fullName }}</strong> {{ 'settings.users.deleteConfirm' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button type="button" class="btn btn-ghost" (click)="cancelDeleteUser()" [disabled]="isSavingUser()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn btn-danger" [class.is-loading]="isSavingUser()" (click)="confirmDeleteUser()" [disabled]="isSavingUser()">
              <span>{{ 'common.delete' | t }}</span>
            </button>
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styleUrls: ['../../drawer.css'],
  styles: [`
    :host { display: block; }
    /* shell: tab strip on narrow screens, grouped sub-nav at 1024px and up */
    .settings-tabs { margin: -4px 0 20px; }
    .settings-shell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; align-items: start; }
    .settings-subnav { display: none; }
    @media (min-width: 1024px) {
      .settings-tabs { display: none; }
      .settings-shell { grid-template-columns: 200px minmax(0, 1fr); }
      .settings-subnav { display: flex; position: sticky; top: 0; }
    }
    .subnav-label { padding: 16px 8px 6px; font-size: var(--text-xs); font-weight: 500; color: var(--fg-3); }
    .settings-subnav app-icon { color: var(--fg-3); }
    .settings-subnav button.active app-icon, .settings-subnav button:hover app-icon { color: var(--fg-2); }
    .settings-subnav .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .subnav-skel { display: flex; flex-direction: column; gap: 14px; padding: 18px 8px 0; }
    .tab-skel { flex: none; align-self: center; width: 88px; margin: 0 8px; }
    .settings-layout, .settings-content { display: flex; flex-direction: column; gap: 20px; width: 100%; min-width: 0; }
    .settings-content:empty { display: none; }

    /* overview hub */
    .hub-h { margin: 0 0 8px; font-size: var(--text-xs); font-weight: 500; color: var(--fg-3); }
    .settings-hub { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .hub-card {
      display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 14px 16px; border: 0; text-align: left;
      background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); font: inherit; color: inherit; cursor: pointer;
      transition: box-shadow var(--dur-1) var(--ease-out);
    }
    .hub-card:hover { box-shadow: var(--shadow-card-hover); }
    .hub-card:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .hub-ic { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--surface-sunken); color: var(--fg-2); box-shadow: inset 0 0 0 1px var(--line); }
    .hub-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .hub-t b { font-weight: 500; color: var(--fg); }
    .hub-t span { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .hub-go { flex: none; margin-top: 2px; color: var(--fg-3); opacity: 0; transform: translateX(-2px); transition: opacity var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out); }
    .hub-card:hover .hub-go, .hub-card:focus-visible .hub-go { opacity: 1; transform: none; }

    /* card header with title + description */
    .card-h.sh { padding-block: 12px; min-height: 56px; flex-wrap: wrap; row-gap: 8px; }
    .sh .hg { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sh .hg p { font-size: var(--text-xs); line-height: 16px; color: var(--fg-3); }
    .form-stack { display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .form-actions-note { margin-right: auto; min-width: 0; }
    .inline-form { display: flex; flex-direction: column; gap: 14px; box-shadow: inset 0 -1px 0 var(--line); }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 14px; align-items: start; }
    .fld-check { padding-top: 29px; }
    .settings-narrow-card { max-width: 760px; }
    .settings-narrow { max-width: 240px; }
    .settings-skel { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
    .w-act2 { width: 76px; }
    .w-act4 { width: 136px; }
    .src-cell { display: inline-flex; align-items: center; gap: 8px; }
    :host ::ng-deep .danger-ic:hover:not(:disabled) svg { color: var(--danger); }
    .thumb.av { border-radius: 50%; overflow: hidden; }
    .thumb.av img { width: 100%; height: 100%; object-fit: cover; }
    .settings-invite { flex-wrap: wrap; }
    .invite-url { word-break: break-all; font-size: var(--text-xs); }

    /* profile */
    .settings-avatar-section { margin-bottom: 0; }
    .settings-avatar { overflow: hidden; }
    .settings-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .settings-avatar-actions { gap: 4px; }
    .eye-btn { width: 24px; height: 24px; display: grid; place-items: center; border: 0; border-radius: var(--radius-xs); background: transparent; color: var(--fg-3); cursor: pointer; }
    .eye-btn:hover { color: var(--fg); background: var(--surface-hover); }
    .eye-btn:focus-visible { outline: none; box-shadow: var(--focus-ring-field); }
    .kv { margin: 0; padding-block: 4px; }
    .kv > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; box-shadow: inset 0 -1px 0 var(--line); }
    .kv > div:last-child { box-shadow: none; }
    .kv dt { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); }
    .kv dd { margin: 0; text-align: right; color: var(--fg); }
    .card-b:has(> .kv-row) { padding-block: 4px; }
    .kv-row { display: flex; align-items: center; gap: 10px; min-height: 40px; box-shadow: inset 0 -1px 0 var(--line); }
    .kv-row:last-child { box-shadow: none; }
    .kv-ic { display: flex; color: var(--fg-3); }
    .kv-t { flex: 1; min-width: 0; }
    .kv-v { font-size: var(--text-xs); }
    .card-f .btn-block { margin-block: 10px; }
    .tips-list { list-style: none; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: var(--text-xs); color: var(--fg-2); }
    .tips-list li { display: flex; align-items: flex-start; gap: 8px; }
    .tips-list app-icon { flex: none; margin-top: 1px; color: var(--success); }

    /* drawers */
    .drawer-form { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .drawer-body { display: flex; flex-direction: column; gap: 16px; }
    .drawer-body:has(> .fsec) { gap: 0; }

    @media (max-width: 1100px) { .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) {
      .settings-tabs { margin-inline: -16px; padding-inline: 12px; margin-bottom: 16px; }
      .settings-tabs .tab { flex-shrink: 0; }
      .settings-hub, .grid-4 { grid-template-columns: minmax(0, 1fr); }
      .hub-go { opacity: 1; transform: none; }
      .fld-check { padding-top: 0; }
      .settings-narrow { max-width: none; }
      .settings-avatar-section { flex-wrap: wrap; }
      .w-act2, .w-act4 { width: auto; }
      /* stacked rows have no hover: keep their actions visible instead of leaving a blank gap */
      :host ::ng-deep .table-responsive .row-act { opacity: 1; }
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
    return role === 'admin' ? 'settings.role.admin' : role === 'manager' ? 'settings.role.manager' : role === 'auditor' ? 'settings.role.auditor' : 'settings.role.viewer';
  }
  
  @ViewChild(ToastComponent) toast!: ToastComponent;

  activeTab = signal<SettingsTab>('dashboard');

  /** Navigation model shared by the tab strip, the grouped sub-nav and the overview hub (presentation only). */
  readonly navGroups: { key: string; label: string; items: { tab: SettingsTab; icon: string; label: string; desc: string; vis: NavVis }[] }[] = [
    { key: 'home', label: '', items: [{ tab: 'dashboard', icon: 'home', label: 'settings.overview', desc: '', vis: 'all' }] },
    { key: 'account', label: 'settings.group.account', items: [{ tab: 'profile', icon: 'user', label: 'settings.tab.profile', desc: 'settings.card.profileDesc', vis: 'all' }] },
    { key: 'catalog', label: 'settings.group.catalog', items: [
      { tab: 'categories', icon: 'tag', label: 'settings.tab.categories', desc: 'settings.card.categoriesDesc', vis: 'all' },
      { tab: 'units', icon: 'hash', label: 'settings.tab.units', desc: 'settings.card.unitsDesc', vis: 'all' },
    ] },
    { key: 'company', label: 'settings.group.company', items: [
      { tab: 'users', icon: 'users', label: 'settings.tab.users', desc: 'settings.card.usersDesc', vis: 'admin' },
      { tab: 'company', icon: 'building', label: 'settings.tab.company', desc: 'settings.card.companyDesc', vis: 'admin' },
      { tab: 'fiscal', icon: 'file', label: 'settings.tab.fiscal', desc: 'settings.card.fiscalDesc', vis: 'admin' },
    ] },
    { key: 'ebelge', label: 'settings.group.ebelge', items: [
      { tab: 'ebelge', icon: 'shield', label: 'settings.tab.ebelge', desc: 'settings.card.ebelgeDesc', vis: 'admin' },
      { tab: 'ebelgeProvider', icon: 'link', label: 'settings.tab.ebelgeProvider', desc: 'settings.card.ebelgeProviderDesc', vis: 'admin' },
      { tab: 'archive', icon: 'archive', label: 'settings.tab.archive', desc: 'settings.card.archiveDesc', vis: 'admin' },
      { tab: 'documents', icon: 'printer', label: 'settings.tab.documents', desc: 'settings.card.documentsDesc', vis: 'admin' },
    ] },
    { key: 'compliance', label: 'settings.group.compliance', items: [
      { tab: 'kvkk', icon: 'lock', label: 'settings.tab.kvkk', desc: 'settings.card.kvkkDesc', vis: 'kvkk' },
      { tab: 'compliance', icon: 'okc', label: 'settings.tab.compliance', desc: 'settings.card.complianceDesc', vis: 'admin' },
      { tab: 'inventoryAccounting', icon: 'bars', label: 'settings.tab.inventoryAccounting', desc: 'settings.card.inventoryAccountingDesc', vis: 'admin' },
      { tab: 'legalParams', icon: 'audit', label: 'settings.tab.legalParams', desc: 'settings.card.legalParamsDesc', vis: 'super' },
    ] },
    { key: 'finance', label: 'settings.group.finance', items: [
      { tab: 'taxRates', icon: 'receipt', label: 'settings.tab.taxRates', desc: 'settings.card.taxRatesDesc', vis: 'admin' },
      { tab: 'exchangeRates', icon: 'swap', label: 'settings.tab.exchangeRates', desc: 'settings.card.exchangeRatesDesc', vis: 'admin' },
    ] },
  ];
  /** Same visibility rules the tab strip used before (admin / auditor / super admin). */
  canSee(vis: NavVis): boolean {
    const p = this.ui.userProfile();
    if (vis === 'all') return true;
    if (vis === 'kvkk') return p?.role === 'admin' || p?.role === 'auditor';
    if (vis === 'admin') return p?.role === 'admin';
    return p?.role === 'admin' && !!p?.isSuperAdmin;
  }
  groupVisible(g: { items: { vis: NavVis }[] }): boolean { return g.items.some((i) => this.canSee(i.vis)); }

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

  /** Own GET /user/profile state: a slow or throttled profile shows a skeleton or a retry card, never a false empty state. */
  profileState = signal<'loading' | 'ready' | 'error'>(this.ui.userProfile() ? 'ready' : 'loading');
  /** No profile yet (neither ours nor the shell's) and the request is still running. */
  profilePending = computed(() => !this.ui.userProfile() && this.profileState() !== 'error');
  /** Catalog tabs work without the profile; every other pane depends on it (role, company, forms). */
  profileGate = computed<'ok' | 'pending' | 'error'>(() => {
    if (this.ui.userProfile() || this.activeTab() === 'categories' || this.activeTab() === 'units') return 'ok';
    return this.profileState() === 'error' ? 'error' : 'pending';
  });
  private formsPatched = false;
  private adminDataRequested = false;
  /** The shell may deliver the profile before (or instead of) our own request: fill the forms and admin lists from it. */
  private adoptShellProfile = effect(() => {
    const p = this.ui.userProfile();
    const state = this.profileState();
    if (!p) return;
    untracked(() => {
      if (!this.formsPatched) this.patchForms(p);
      if (p.role === 'admin' && state === 'error' && !this.adminDataRequested) this.loadAdminData();
    });
  });
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
  isLoadingUnits = signal(true);
  unitsError = signal(false);
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
    this.unitsError.set(false);
    this.inventoryService.getUnits().subscribe({
      next: (list) => { this.units.set(list); this.isLoadingUnits.set(false); },
      error: (err) => { this.isLoadingUnits.set(false); this.unitsError.set(!this.units().length); this.toast.show(this.errMsg(err, 'settings.units.loadFailed'), 'error'); },
    });
  }

  focusUnitForm() {
    document.getElementById('unitCode')?.focus();
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
  strengthColors = ['var(--danger-dot)', 'var(--warning-dot)', 'var(--warning-dot)', 'var(--success-dot)'];
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
  usersLoaded = signal(false);
  usersError = signal(false);
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
    role: ['viewer', Validators.required],
    piiRead: [false],
  });

  ngOnInit() {
    this.loadCategories();
    this.loadProfile();
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (['kvkk', 'profile', 'categories', 'users', 'company', 'fiscal', 'ebelge', 'ebelgeProvider', 'archive', 'documents', 'compliance', 'inventoryAccounting', 'legalParams', 'taxRates', 'exchangeRates', 'units'].includes(tab)) {
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
    this.profileState.set('loading');
    this.http.get(`${environment.apiUrl}/user/profile`).pipe(
      // Same back-off as the shell: one longer retry for 429 / 5xx / timeout, then the retry card.
      timeout(12000),
      retry({
        count: 1,
        delay: (err: HttpErrorResponse) => {
          if (!(err instanceof TimeoutError) && err?.status && err.status !== 429 && err.status < 500) throw err;
          const after = Number(err?.headers?.get?.('Retry-After'));
          return timer(after > 0 ? Math.min(after, 10) * 1000 : 2500);
        },
      }),
    ).subscribe({
      next: (profile: any) => {
        this.ui.userProfile.set(profile);
        this.i18n.applyLocale(profile?.locale);
        this.patchForms(profile);
        this.profileState.set('ready');
        if (profile.role === 'admin') this.loadAdminData();
      },
      error: () => {
        this.profileState.set('error');
        // Without any profile the retry card already says so; a toast only when stale data stays on screen.
        if (this.ui.userProfile()) this.toast?.show(this.i18n.t('settings.toast.profileLoadFailed'), 'error');
      }
    });
  }

  private patchForms(profile: any) {
    this.formsPatched = true;
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
  }

  private loadAdminData() {
    this.adminDataRequested = true;
    this.loadUsers();
    this.loadTaxRates();
    this.loadExchangeRates();
    if (!this.editTaxId() && !this.taxForm.dirty) this.resetTaxForm();
    if (!this.editFxId() && !this.fxForm.dirty) this.resetFxForm();
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

  private session = inject(SessionService);

  doLogout() {
    this.session.logout();
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
    this.usersError.set(false);
    this.http.get<any[]>(`${environment.apiUrl}/user/users`).subscribe({
      next: (data) => {
        this.users.set(data);
        this.usersLoaded.set(true);
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.isLoadingUsers.set(false);
        if (!this.usersLoaded()) this.usersError.set(true);
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
        role: user.role || 'viewer',
        piiRead: (user.permissions || []).includes('customers.pii.read'),
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
        role: 'viewer',
        piiRead: false,
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
    // WP7: extra permission on top of the role (customers.pii.read is a manager / admin default)
    data.permissions = data.piiRead && ['viewer', 'auditor'].includes(data.role) ? ['customers.pii.read'] : [];
    delete data.piiRead;

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
