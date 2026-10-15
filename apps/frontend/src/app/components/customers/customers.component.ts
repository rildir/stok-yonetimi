import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { tap } from 'rxjs/operators';
import { InventoryService } from '../../inventory.service';
import { Customer, CustomerAddress } from '../../models/inventory.models';
import { ComplianceService } from '../../services/compliance.service';
import { AddressFieldsComponent, addressFromForm, addressToForm, createAddressGroup } from '../shared/address-fields.component';
import { IdentityFieldsComponent, taxIdValidator } from '../shared/identity-fields.component';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { I18nService, TranslatePipe, NumberFormatPipe, AppDatePipe } from '../../i18n';
import { EBelgeService } from '../../services/ebelge.service';
import { apiError as apiErrorMessage } from '../../services/documents.service';
import { KvkkService, NOTICE_CHANNELS } from '../../services/kvkk.service';
import { CustomerConsentsComponent } from './customer-consents.component';
import { detectSpecialCategoryData, isMaskedValue } from '@stok/tr-compliance';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe, AddressFieldsComponent, IdentityFieldsComponent, CustomerConsentsComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .cust-registry { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-3); margin-bottom: var(--space-4); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-subtle); }
    .cust-registry-label { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--color-text-muted); }
    .cust-registry .btn { margin-left: auto; }
    .cust-sub { font-size: var(--text-2xs); color: var(--color-text-muted); margin-top: 2px; }
    .link { color: var(--color-primary-text); text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .ml-auto { margin-left: auto; margin-right: var(--space-2); }
    .upper { text-transform: uppercase; }
    @media (max-width: 640px) { .form-row { gap: var(--space-3); } }
    .filter-chips { display: flex; gap: var(--space-2); align-items: center; }
    .review-badge { margin-left: var(--space-2); }
    .check-row { display: flex; gap: var(--space-5); flex-wrap: wrap; font-size: var(--text-sm); }
    .check-row label { display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; }
    .pii-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .review-note { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-3); border-radius: var(--radius-md); border: var(--border-width) solid var(--color-warning-border); background: var(--color-warning-subtle); color: var(--color-warning-text); font-size: var(--text-sm); }
    .addr-list { display: flex; flex-direction: column; gap: var(--space-2); }
    .addr-item { display: flex; gap: var(--space-3); align-items: flex-start; justify-content: space-between; padding: var(--space-3); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-sm); }
    .addr-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .addr-item-actions { display: flex; gap: var(--space-1); flex-shrink: 0; }
    .addr-editor { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4); border: var(--border-width) dashed var(--color-border-strong); border-radius: var(--radius-md); }
    .addr-editor-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'customers.title' | t }}</h1>
        <p>{{ 'customers.subtitle' | t }}</p>
      </div>
      @if (canEdit()) {
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openDrawer()">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'customers.new' | t }}
          </button>
        </div>
      }
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'customers.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
      <div class="segmented filter-chips" role="group" [attr.aria-label]="'customers.filter.label' | t">
        <button type="button" [attr.aria-pressed]="!reviewOnly()" (click)="reviewOnly.set(false)">{{ 'customers.filter.all' | t }}</button>
        <button type="button" [attr.aria-pressed]="reviewOnly()" (click)="reviewOnly.set(true)">{{ 'customers.filter.needsReview' | t }} ({{ reviewCount() }})</button>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="skeleton-wrap" [attr.aria-label]="'common.loading' | t">
          @for (s of [1,2,3,4,5]; track s) { <div class="skeleton skeleton-row"></div> }
        </div>
      } @else if (customers().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <p class="empty-state-title">{{ 'customers.empty' | t }}</p>
          @if (canEdit()) {
            <button class="btn btn-primary" (click)="openDrawer()">{{ 'customers.addFirst' | t }}</button>
          }
        </div>
      } @else if (filteredCustomers().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
          <p class="empty-state-title">{{ 'customers.noResults' | t }}</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'customers.col.name' | t }}</th>
                <th>{{ 'customers.col.type' | t }}</th>
                <th>{{ 'customers.col.email' | t }}</th>
                <th>{{ 'customers.col.phone' | t }}</th>
                <th>{{ 'customers.col.location' | t }}</th>
                <th>{{ 'finance.currency' | t }}</th>
                <th class="num">{{ 'customers.col.orderCount' | t }}</th>
                <th>{{ 'customers.col.lastOrder' | t }}</th>
                @if (canEdit()) { <th class="th-actions">{{ 'common.actions' | t }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (c of filteredCustomers(); track c.id) {
                <tr>
                  <td [attr.data-label]="'customers.col.name' | t">
                    <strong>{{ c.name }}</strong>
                    @if (c.needsReview) { <span class="badge badge-warning review-badge" [title]="('customers.review.' + (c.reviewReason || 'GENERIC')) | t">{{ 'customers.filter.needsReview' | t }}</span> }
                    @if (c.processingRestricted) { <span class="badge badge-neutral review-badge" [title]="'kvkk.erase.restrictedUntil' | t: { date: (c.erasureRestrictedUntil | appDate) }">{{ 'kvkk.erase.restricted' | t }}</span> }
                    @if (c.identityNumber) { <div class="cust-sub">{{ c.identityType || 'VKN' }} <span class="mono">{{ c.identityNumber }}</span>@if (c.taxOfficeName) { · {{ c.taxOfficeName }} }</div> }
                    @if (c.eInvoiceRegistered) { <span class="badge badge-success" [title]="'ebelge.registry.checkedAt' | t: { date: (c.eInvoiceCheckedAt | appDate: 'datetime') }">{{ 'ebelge.registry.eFatura' | t }}</span> }
                    @if (c.eDespatchRegistered) { <span class="badge badge-neutral">{{ 'ebelge.registry.eIrsaliye' | t }}</span> }
                  </td>
                  <td [attr.data-label]="'customers.col.type' | t">
                    <span class="badge" [class.badge-primary]="c.type === 'company'" [class.badge-neutral]="c.type !== 'company'">
                      {{ (c.type === 'company' ? 'customers.type.company' : 'customers.type.individual') | t }}
                    </span>
                  </td>
                  <td [attr.data-label]="'customers.col.email' | t">
                    @if (c.email) { <a href="mailto:{{ c.email }}" class="link">{{ c.email }}</a> } @else { - }
                  </td>
                  <td [attr.data-label]="'customers.col.phone' | t">
                    @if (c.phone) { <a href="tel:{{ c.phone }}" class="link">{{ c.phone }}</a> } @else { - }
                  </td>
                  <td [attr.data-label]="'customers.col.location' | t">{{ location(c) || '-' }}</td>
                  <td [attr.data-label]="'finance.currency' | t">{{ c.currency || '-' }}</td>
                  <td class="num" [attr.data-label]="'customers.col.orderCount' | t">{{ (c.orderCount ?? 0) | num }}</td>
                  <td [attr.data-label]="'customers.col.lastOrder' | t">{{ c.lastOrderDate ? (c.lastOrderDate | appDate) : '-' }}</td>
                  @if (canEdit()) {
                    <td class="td-actions">
                      <button class="icon-btn edit-btn" [title]="'common.edit' | t" [attr.aria-label]="'common.edit' | t" (click)="openDrawer(c)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                      </button>
                      @if (canDelete()) {
                        <button class="icon-btn delete-btn" [title]="'common.delete' | t" [attr.aria-label]="'common.delete' | t" (click)="deleteCustomer(c)">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>
                        </button>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editId() ? 'customers.editTitle' : 'customers.addTitle') | t }}</span>
            @if (editId() && canDelete()) {
              <button type="button" class="btn btn-secondary btn-sm ml-auto" (click)="router.navigate(['/audit-log'], { queryParams: { entityType: 'customers', entityId: editId() } })">{{ 'auditLog.history' | t }}</button>
            }
            <button class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()" class="drawer-form">
            <div class="drawer-body">
              @if (editId() && editingCustomer(); as ec) {
                <div class="cust-registry">
                  <span class="cust-registry-label">{{ 'ebelge.registry.title' | t }}</span>
                  @if (ec.eInvoiceRegistered === true) { <span class="badge badge-success">{{ 'ebelge.registry.eFatura' | t }}</span> }
                  @else if (ec.eInvoiceRegistered === false) { <span class="badge badge-neutral">{{ 'ebelge.registry.eArsiv' | t }}</span> }
                  @else { <span class="badge badge-neutral">{{ 'ebelge.registry.unknown' | t }}</span> }
                  @if (ec.eDespatchRegistered) { <span class="badge badge-neutral">{{ 'ebelge.registry.eIrsaliye' | t }}</span> }
                  @if (ec.eInvoiceCheckedAt) { <span class="cust-sub">{{ 'ebelge.registry.checkedAt' | t: { date: (ec.eInvoiceCheckedAt | appDate: 'datetime') } }}</span> }
                  @if (canEdit()) { <button type="button" class="btn btn-secondary btn-sm" (click)="checkRegistry(ec)" [disabled]="registryBusy()">{{ 'ebelge.registry.check' | t }}</button> }
                </div>
              }
              <div class="form-field">
                <input id="custName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" />
                <label for="custName" class="form-label">{{ 'customers.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">{{ 'customers.form.nameRequired' | t }}</div> }
              </div>

              <div class="form-field">
                <select id="custType" formControlName="type" class="form-input has-value">
                  <option value="individual">{{ 'customers.type.individual' | t }}</option>
                  <option value="company">{{ 'customers.type.company' | t }}</option>
                </select>
                <label for="custType" class="form-label">{{ 'customers.form.type' | t }}</label>
              </div>

              <div class="form-field">
                <input id="custEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasValue('email')" />
                <label for="custEmail" class="form-label">{{ 'customers.form.email' | t }}</label>
                @if (isFieldInvalid('email')) { <div class="form-error">{{ 'customers.form.emailInvalid' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="custPhone" type="tel" formControlName="phone" class="form-input" [class.has-value]="hasValue('phone')" />
                <label for="custPhone" class="form-label">{{ 'customers.form.phone' | t }}</label>
              </div>

              <div class="form-section-title">{{ 'customers.section.identity' | t }}</div>
              @if (editingReview()) {
                <div class="review-note" role="note">{{ ('customers.review.' + (editingReview() || 'GENERIC')) | t }}</div>
              }
              <app-identity-fields [form]="form" idPrefix="cust" [types]="identityTypes" [provinceCode]="addressGroup.value.provinceCode"></app-identity-fields>
              @if (editId() && editingCustomer()?.piiMasked && hasMaskedPii()) {
                <div class="pii-row">
                  <span class="cust-sub">{{ 'customers.pii.masked' | t }}</span>
                  @if (canReadPii()) { <button type="button" class="btn btn-secondary btn-sm" (click)="revealPii()" [disabled]="revealBusy()">{{ 'customers.pii.reveal' | t }}</button> }
                </div>
              }
              @if (form.value.identityType === 'FOREIGN') {
                <div class="form-row">
                  <div class="form-field">
                    <input id="custNat" type="text" maxlength="2" formControlName="nationality" class="form-input mono upper" (input)="upper('nationality', $event)" />
                    <label for="custNat" class="form-label">{{ 'customers.form.nationality' | t }}</label>
                  </div>
                  <div class="form-field">
                    <input id="custPassport" type="text" formControlName="passportNo" class="form-input mono" />
                    <label for="custPassport" class="form-label">{{ 'customers.form.passportNo' | t }}</label>
                  </div>
                </div>
              }
              <div class="check-row">
                <label><input type="checkbox" formControlName="isVatTaxpayer" /> {{ 'customers.form.isVatTaxpayer' | t }}</label>
                <label><input type="checkbox" formControlName="isDesignatedBuyer" /> {{ 'customers.form.isDesignatedBuyer' | t }}</label>
              </div>

              <div class="form-section-title">{{ 'customers.section.address' | t }}</div>
              <app-address-fields [group]="addressGroup" idPrefix="cust"></app-address-fields>

              <div class="form-section-title">{{ 'customers.section.other' | t }}</div>
              <div class="form-field">
                <input id="custCurrency" type="text" formControlName="currency" maxlength="3" class="form-input mono upper" [class.has-value]="hasValue('currency')" (input)="upper('currency', $event)" />
                <label for="custCurrency" class="form-label">{{ 'customers.form.currency' | t }}</label>
                @if (isFieldInvalid('currency')) { <div class="form-error">{{ 'customers.form.currencyInvalid' | t }}</div> }
              </div>

              <div class="form-field">
                <textarea id="custNotes" formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')"></textarea>
                <label for="custNotes" class="form-label">{{ 'customers.form.notes' | t }}</label>
              </div>
              @if (notesWarning().length) {
                <div class="review-note" role="alert">{{ 'customers.notesSensitiveWarning' | t: { categories: notesWarningText() } }}</div>
              }

              <div class="form-section-title">{{ 'customers.section.kvkk' | t }}</div>
              <div class="form-row">
                <div class="form-field">
                  <input id="custNoticeAt" type="date" formControlName="noticeGivenAt" class="form-input has-value" />
                  <label for="custNoticeAt" class="form-label">{{ 'customers.notice.givenAt' | t }}</label>
                </div>
                <div class="form-field">
                  <input id="custNoticeVer" type="text" formControlName="noticeVersion" class="form-input" [class.has-value]="hasValue('noticeVersion')" />
                  <label for="custNoticeVer" class="form-label">{{ 'customers.notice.version' | t }}</label>
                </div>
                <div class="form-field">
                  <select id="custNoticeCh" formControlName="noticeChannel" class="form-input has-value">
                    <option value="">-</option>
                    @for (ch of noticeChannels; track ch) { <option [value]="ch">{{ 'kvkk.channel.' + ch | t }}</option> }
                  </select>
                  <label for="custNoticeCh" class="form-label">{{ 'customers.notice.channel' | t }}</label>
                </div>
              </div>
              <p class="cust-sub">{{ 'customers.notice.hint' | t }}</p>
              @if (editId()) {
                <div class="form-section-title">{{ 'customers.section.consents' | t }}</div>
                <app-customer-consents [customerId]="editId()!" [canEdit]="canEdit()"></app-customer-consents>
              }

              @if (editId()) {
                <div class="form-section-title">{{ 'customers.section.addresses' | t }}</div>
                <div class="addr-list">
                  @for (a of addresses(); track a.id) {
                    <div class="addr-item">
                      <div class="addr-item-main">
                        <strong>{{ ('customers.addressKind.' + a.kind) | t }}@if (a.label) { · {{ a.label }} }@if (a.isDefault) { <span class="badge badge-primary review-badge">{{ 'customers.address.default' | t }}</span> }</strong>
                        <span class="cust-sub">{{ formatAddress(a.address) }}</span>
                      </div>
                      <div class="addr-item-actions">
                        <button type="button" class="icon-btn edit-btn" [title]="'common.edit' | t" [attr.aria-label]="'common.edit' | t" (click)="editAddress(a)"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                        <button type="button" class="icon-btn delete-btn" [title]="'common.delete' | t" [attr.aria-label]="'common.delete' | t" (click)="removeAddress(a)"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
                      </div>
                    </div>
                  } @empty {
                    <p class="cust-sub">{{ 'customers.address.none' | t }}</p>
                  }
                  @if (addrEditorOpen()) {
                    <div class="addr-editor" [formGroup]="addrForm">
                      <div class="form-row">
                        <div class="form-field">
                          <select id="addrKind" formControlName="kind" class="form-input has-value">
                            <option value="DELIVERY">{{ 'customers.addressKind.DELIVERY' | t }}</option>
                            <option value="BILLING">{{ 'customers.addressKind.BILLING' | t }}</option>
                          </select>
                          <label for="addrKind" class="form-label">{{ 'customers.address.kind' | t }}</label>
                        </div>
                        <div class="form-field">
                          <input id="addrLabel" type="text" formControlName="label" class="form-input" />
                          <label for="addrLabel" class="form-label">{{ 'customers.address.label' | t }}</label>
                        </div>
                      </div>
                      <app-address-fields [group]="addrAddressGroup" idPrefix="caddr"></app-address-fields>
                      <div class="check-row"><label><input type="checkbox" formControlName="isDefault" /> {{ 'customers.address.default' | t }}</label></div>
                      <div class="addr-editor-actions">
                        <button type="button" class="btn btn-secondary btn-sm" (click)="addrEditorOpen.set(false)">{{ 'common.cancel' | t }}</button>
                        <button type="button" class="btn btn-primary btn-sm" [disabled]="addrAddressGroup.invalid || addrSaving()" (click)="saveAddress()">{{ 'common.save' | t }}</button>
                      </div>
                    </div>
                  } @else {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="newAddress()">{{ 'customers.address.add' | t }}</button>
                  }
                </div>
              }
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="form.invalid || form.pristine || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'customers.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class CustomersComponent implements OnInit {
  inventory = inject(InventoryService);
  compliance = inject(ComplianceService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  customers = signal<Customer[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  editId = signal<string | null>(null);
  registryBusy = signal(false);
  private ebelge = inject(EBelgeService);
  editingCustomer = computed(() => this.customers().find((c) => c.id === this.editId()) || null);

  /** GİB e-Fatura / e-İrsaliye registry ("e-Fatura mükellefi mi?") through the integrator. */
  checkRegistry(c: Customer) {
    this.registryBusy.set(true);
    this.ebelge.checkCustomer(c.id).subscribe({
      next: (r) => {
        this.registryBusy.set(false);
        if (r.reason === 'NO_TAX_ID') return this.ui.showToast(this.i18n.t('ebelge.registry.noTaxId'), 'info');
        this.customers.update((list) => list.map((x) => (x.id === c.id ? { ...x, eInvoiceRegistered: r.eInvoice?.registered ?? null, eDespatchRegistered: r.eDespatch?.registered ?? null, eInvoiceCheckedAt: r.eInvoice?.checkedAt ?? null } : x)));
        this.ui.showToast(this.i18n.t(r.eInvoice?.registered ? 'ebelge.registry.isRegistered' : 'ebelge.registry.notRegistered'), 'success');
      },
      error: (e) => {
        this.registryBusy.set(false);
        this.ui.showToast(apiErrorMessage(e, this.i18n.t('ebelge.registry.failed')), 'error');
      },
    });
  }
  searchQuery = signal('');
  reviewOnly = signal(false);
  addresses = signal<CustomerAddress[]>([]);
  addrEditorOpen = signal(false);
  addrEditId = signal<string | null>(null);
  addrSaving = signal(false);
  editingReview = signal<string | null>(null);
  readonly identityTypes = ['ANONYMOUS', 'TCKN', 'VKN', 'YKN', 'FOREIGN'];
  reviewCount = computed(() => this.customers().filter((c) => c.needsReview).length);

  canEdit = computed(() => ['admin', 'manager'].includes(this.ui.userProfile()?.role));
  canDelete = computed(() => this.ui.userProfile()?.role === 'admin');

  filteredCustomers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.reviewOnly() ? this.customers().filter((c) => c.needsReview) : this.customers();
    if (!q) return list;
    return list.filter(c =>
      [c.name, c.email, c.phone, c.identityNumber, c.taxOfficeName, c.address?.province, c.address?.district, c.address?.country]
        .some(v => !!v && v.toLowerCase().includes(q))
    );
  });

  addressGroup: FormGroup = createAddressGroup(this.fb);
  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['individual'],
    email: ['', [Validators.email]],
    phone: [''],
    identityType: ['ANONYMOUS'],
    identityNumber: [''],
    taxOfficeCode: [''],
    taxOfficeName: [''],
    isVatTaxpayer: [false],
    isDesignatedBuyer: [false],
    nationality: [''],
    passportNo: [''],
    address: this.addressGroup,
    currency: ['', [Validators.pattern(/^[A-Z]{3}$/)]],
    notes: [''],
    noticeGivenAt: [''],
    noticeVersion: [''],
    noticeChannel: [''],
  }, { validators: taxIdValidator((f) => f.value?.type || null) });

  // ---------------------------------------------------------------- WP7: KVKK
  readonly noticeChannels = NOTICE_CHANNELS;
  private kvkk = inject(KvkkService);
  revealBusy = signal(false);
  canReadPii = computed(() => !!this.ui.userProfile()?.permissions?.includes('customers.pii.read'));
  private notesValue = signal('');
  notesWarning = computed(() => detectSpecialCategoryData(this.notesValue()));
  notesWarningText = computed(() => this.notesWarning().map((c) => this.i18n.t('kvkk.special.' + c)).join(', '));

  hasMaskedPii(): boolean {
    const v = this.form.value;
    return [v.identityNumber, v.passportNo, v.email, v.phone].some((x) => isMaskedValue(x));
  }

  /** "Göster": clear identity / contact values (logged by the server as pii_view). */
  revealPii() {
    const id = this.editId();
    if (!id) return;
    this.revealBusy.set(true);
    this.inventory.revealCustomer(id).subscribe({
      next: (r) => {
        this.revealBusy.set(false);
        const patch: Record<string, unknown> = {};
        for (const k of ['identityNumber', 'passportNo', 'email', 'phone'] as const) if (r[k] !== undefined && r[k] !== null) patch[k] = r[k];
        this.form.patchValue(patch, { emitEvent: true });
        this.customers.update((list) => list.map((x) => (x.id === id ? { ...x, piiMasked: false } : x)));
      },
      error: (e) => {
        this.revealBusy.set(false);
        this.ui.showToast(e.error?.message || this.i18n.t('kvkk.error'), 'error');
      },
    });
  }

  addrAddressGroup: FormGroup = createAddressGroup(this.fb);
  addrForm: FormGroup = this.fb.group({ kind: ['DELIVERY'], label: [''], isDefault: [false], address: this.addrAddressGroup });

  ngOnInit() {
    this.form.get('notes')?.valueChanges.subscribe((v) => this.notesValue.set(v || ''));
    this.load();
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      if (params['review'] === '1') this.reviewOnly.set(true);
      if (params['open'] === 'new') {
        this.openDrawer();
        this.router.navigate([], { relativeTo: this.route, queryParams: { open: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    });
  }

  load() {
    this.isLoading.set(true);
    this.inventory.getCustomers().subscribe({
      next: data => { this.customers.set(data); this.isLoading.set(false); },
      error: err => {
        this.isLoading.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('customers.loadError'), 'error');
      }
    });
  }

  location(c: Customer): string {
    const a = c.address;
    if (!a) return '';
    return [a.district, a.province, a.country && a.country !== 'TR' ? a.country : null].filter(Boolean).join(' / ');
  }

  formatAddress(a: CustomerAddress['address']): string {
    return [a?.line1, a?.line2, [a?.postalCode, [a?.district, a?.province].filter(Boolean).join(' / ')].filter(Boolean).join(' '), a?.country !== 'TR' ? a?.country : null]
      .filter(Boolean)
      .join(', ');
  }

  hasValue(name: string): boolean {
    const v = this.form.get(name)?.value;
    return v !== null && v !== undefined && v !== '';
  }

  isFieldInvalid(name: string): boolean {
    const f = this.form.get(name);
    return f ? f.invalid && (f.dirty || f.touched) : false;
  }

  upper(name: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const v = input.value.toUpperCase().replace(/[^A-Z]/g, '');
    input.value = v;
    this.form.get(name)?.setValue(v);
  }

  openDrawer(c?: Customer) {
    if (!this.canEdit()) return;
    const country = this.ui.userProfile()?.company?.country || 'TR';
    const blank = {
      name: '', type: 'individual', email: '', phone: '', identityType: 'ANONYMOUS', identityNumber: '', taxOfficeCode: '', taxOfficeName: '',
      isVatTaxpayer: false, isDesignatedBuyer: false, nationality: '', passportNo: '', currency: '', notes: '',
      noticeGivenAt: '', noticeVersion: '', noticeChannel: '',
    };
    this.addrEditorOpen.set(false);
    this.addresses.set([]);
    if (c) {
      this.editId.set(c.id);
      this.editingReview.set(c.needsReview ? c.reviewReason || 'GENERIC' : null);
      const v: any = { ...blank };
      Object.keys(blank).forEach(k => { const val = (c as any)[k]; if (val !== null && val !== undefined) v[k] = val; });
      if (!c.identityType) v.identityType = c.type === 'company' ? 'VKN' : 'ANONYMOUS';
      if (c.noticeGivenAt) v.noticeGivenAt = String(c.noticeGivenAt).slice(0, 10);
      this.form.reset({ ...v, address: addressToForm(c.address, country) });
      this.compliance.listCustomerAddresses(c.id).subscribe({ next: (list) => this.addresses.set(list), error: () => undefined });
    } else {
      this.editId.set(null);
      this.editingReview.set(null);
      this.form.reset({ ...blank, currency: this.i18n.currency() || '', address: addressToForm(null, country) });
    }
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.editId.set(null);
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const raw = this.form.value;
    const data: Partial<Customer> = {};
    Object.keys(raw).forEach(k => {
      if (k === 'address') return;
      const v = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
      (data as any)[k] = v === '' ? null : v;
    });
    if (data.identityType === 'ANONYMOUS') data.identityNumber = null;
    // WP7: masked values (*******1234) are the stored ones - not sent back.
    for (const k of ['identityNumber', 'passportNo', 'email', 'phone'] as const) if (isMaskedValue((data as any)[k])) delete (data as any)[k];
    if (!['VKN', 'TCKN'].includes(String(data.identityType))) { data.taxOfficeCode = null; data.taxOfficeName = null; }
    data.address = addressFromForm(raw.address);
    const id = this.editId();
    const req = id ? this.inventory.updateCustomer(id, data) : this.inventory.createCustomer(data);
    req.subscribe({
      next: (saved: Customer) => {
        this.isSaving.set(false);
        if (saved?.kvkkWarnings?.length) this.ui.showToast(this.i18n.t('customers.notesSensitiveSaved'), 'info');
        this.closeDrawer();
        this.load();
        this.ui.showToast(this.i18n.t(id ? 'customers.updated' : 'customers.created'), 'success');
      },
      error: err => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('customers.actionFailed'), 'error');
      }
    });
  }

  // ---------------------------------------------------------------- billing / delivery addresses
  newAddress() {
    this.addrEditId.set(null);
    this.addrForm.reset({ kind: 'DELIVERY', label: '', isDefault: this.addresses().length === 0, address: addressToForm(null, this.ui.userProfile()?.company?.country || 'TR') });
    this.addrEditorOpen.set(true);
  }

  editAddress(a: CustomerAddress) {
    this.addrEditId.set(a.id || null);
    this.addrForm.reset({ kind: a.kind, label: a.label || '', isDefault: !!a.isDefault, address: addressToForm(a.address) });
    this.addrEditorOpen.set(true);
  }

  saveAddress() {
    const customerId = this.editId();
    if (!customerId) return;
    const v = this.addrForm.value;
    const payload: CustomerAddress = { kind: v.kind, label: v.label?.trim() || null, isDefault: !!v.isDefault, address: addressFromForm(v.address) };
    const id = this.addrEditId();
    this.addrSaving.set(true);
    const req = id ? this.compliance.updateCustomerAddress(customerId, id, payload) : this.compliance.addCustomerAddress(customerId, payload);
    req.subscribe({
      next: () => {
        this.addrSaving.set(false);
        this.addrEditorOpen.set(false);
        this.compliance.listCustomerAddresses(customerId).subscribe((list) => this.addresses.set(list));
        this.ui.showToast(this.i18n.t('customers.address.saved'), 'success');
      },
      error: (err) => {
        this.addrSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('customers.actionFailed'), 'error');
      },
    });
  }

  removeAddress(a: CustomerAddress) {
    const customerId = this.editId();
    if (!customerId || !a.id) return;
    this.compliance.deleteCustomerAddress(customerId, a.id).subscribe({
      next: () => this.addresses.update((list) => list.filter((x) => x.id !== a.id)),
      error: (err) => this.ui.showToast(err.error?.message || this.i18n.t('customers.actionFailed'), 'error'),
    });
  }

  deleteCustomer(c: Customer) {
    this.ui.openConfirm({
      title: this.i18n.t('customers.deleteTitle'),
      message: this.i18n.t('customers.deleteMessage', { name: c.name }),
      isDelete: true,
      onConfirm: () => this.inventory.deleteCustomer(c.id).pipe(
        tap({
          next: () => { this.load(); this.ui.showToast(this.i18n.t('customers.deleted'), 'success'); },
          error: err => this.ui.showToast(err.error?.message || this.i18n.t('customers.actionFailed'), 'error')
        })
      )
    });
  }
}
