import { Component, inject, signal, OnInit, computed, HostListener } from '@angular/core';
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
import { IconComponent } from '../shared/icon.component';
import { detectSpecialCategoryData, isMaskedValue } from '@stok/tr-compliance';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe, AddressFieldsComponent, IdentityFieldsComponent, CustomerConsentsComponent, IconComponent],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .link { color: var(--accent-text); text-decoration: none; }
    .link:hover { text-decoration: underline; text-underline-offset: 3px; }
    .c-toolbar { margin-bottom: 12px; }
    .c-search { flex: 1 1 260px; max-width: 400px; }
    .tbl tbody tr.c-row { cursor: pointer; }
    .tbl td.c-name { max-width: 290px; }
    .c-name .cell-prod { gap: 8px; }
    .c-name .cell-code { margin-left: 0; }
    .c-name .badge { flex: none; }
    .tbl td.c-mail { max-width: 190px; }
    .tbl td.c-loc { max-width: 140px; }
    .c-sec { color: var(--fg-3); }
    .c-skel { height: 14px; margin: 10px 0; }
    .c-badges { display: inline-flex; align-items: center; gap: 4px; }
    .c-badges .badge { margin-left: 0; }
    .c-mlist { display: none; }
    .c-mlist .mrow { cursor: pointer; }
    @media (max-width: 640px) {
      .c-search { max-width: none; flex-basis: 100%; }
      .c-search .trail { display: none; }
      .c-toolbar .seg { width: 100%; }
      .c-toolbar .seg button { flex: 1 1 auto; }
      .c-desk { display: none; }
      .c-mlist { display: block; }
    }

    /* drawer */
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; gap: 0; }
    .drawer-body.secs { gap: 0; padding-top: 8px; }
    .cust-registry { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; padding: 10px 12px;
      border-radius: var(--radius-md); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .cust-registry .lbl { font-size: var(--text-xs); font-weight: 500; color: var(--fg-2); }
    .cust-registry .badge { margin-left: 0; }
    .cust-registry .btn { margin-left: auto; }
    .cust-sub { font-size: var(--text-xs); color: var(--fg-3); }
    .checks { display: flex; gap: 8px 20px; flex-wrap: wrap; }
    .pii-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .addr-list { display: flex; flex-direction: column; gap: 8px; }
    .addr-item { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 12px;
      border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); font-size: var(--text-sm); }
    .addr-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .addr-item-main b { font-weight: 500; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .addr-item-main .badge { margin-left: 0; }
    .addr-item-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .addr-editor { display: flex; flex-direction: column; gap: 16px; padding: 14px; border-radius: var(--radius-md);
      background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
    .addr-editor-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .addr-add { align-self: flex-start; }
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
            <app-icon name="plus" />{{ 'customers.new' | t }}
          </button>
        </div>
      }
    </header>

    <div class="toolbar c-toolbar">
      <div class="seg" role="group" [attr.aria-label]="'customers.filter.label' | t">
        <button type="button" [attr.aria-pressed]="!reviewOnly()" (click)="reviewOnly.set(false)">{{ 'customers.filter.all' | t }} <span class="count">{{ customers().length }}</span></button>
        <button type="button" [attr.aria-pressed]="reviewOnly()" (click)="reviewOnly.set(true)">{{ 'customers.filter.needsReview' | t }} <span class="count">{{ reviewCount() }}</span></button>
      </div>
      <div class="field c-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [placeholder]="'customers.searchPlaceholder' | t" [attr.aria-label]="'customers.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
        <span class="trail"><kbd>/</kbd></span>
      </div>
    </div>

    <div class="card">
      @if (isLoading()) {
        <div class="card-b" [attr.aria-label]="'common.loading' | t">
          @for (s of [1,2,3,4,5,6]; track s) { <div class="skeleton skeleton-row c-skel"></div> }
        </div>
      } @else if (customers().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="users" /></div>
          <h3>{{ 'customers.empty' | t }}</h3>
          @if (canEdit()) {
            <div class="actions cluster">
              <button class="btn btn-primary" (click)="openDrawer()"><app-icon name="plus" />{{ 'customers.addFirst' | t }}</button>
            </div>
          }
        </div>
      } @else if (filteredCustomers().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="search" /></div>
          <h3>{{ 'customers.noResults' | t }}</h3>
          <div class="actions cluster">
            <button type="button" class="btn" (click)="searchQuery.set(''); reviewOnly.set(false)"><app-icon name="x" />{{ 'common.clear' | t }}</button>
          </div>
        </div>
      } @else {
        <div class="table-scroll c-desk">
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ 'customers.col.name' | t }}</th>
                <th>{{ 'customers.col.type' | t }}</th>
                <th>{{ 'customers.col.contact' | t }}</th>
                <th>{{ 'customers.col.location' | t }}</th>
                <th>{{ 'finance.currency' | t }}</th>
                <th class="r">{{ 'customers.col.orderCount' | t }}</th>
                <th>{{ 'customers.col.lastOrder' | t }}</th>
                @if (canEdit()) { <th class="w-act"><span class="sr">{{ 'common.actions' | t }}</span></th> }
              </tr>
            </thead>
            <tbody>
              @for (c of filteredCustomers(); track c.id) {
                <tr class="c-row" [class.is-selected]="isDrawerOpen() && editId() === c.id" (click)="openDrawer(c)">
                  <td class="c-name">
                    <div class="cell-prod" [title]="c.taxOfficeName || ''">
                      <span class="thumb">{{ initials(c.name) }}</span>
                      <b>{{ c.name }}</b>
                      @if (c.identityNumber) { <span class="cell-code">{{ c.identityType || 'VKN' }} {{ c.identityNumber }}</span> }
                      @if (c.needsReview) { <span class="badge badge-warning" [title]="('customers.review.' + (c.reviewReason || 'GENERIC')) | t"><span class="dot"></span>{{ 'customers.filter.needsReview' | t }}</span> }
                      @if (c.processingRestricted) { <span class="badge badge-neutral" [title]="'kvkk.erase.restrictedUntil' | t: { date: (c.erasureRestrictedUntil | appDate) }"><app-icon name="lock" size="xs" />{{ 'kvkk.erase.restricted' | t }}</span> }
                    </div>
                  </td>
                  <td>
                    <span class="c-badges">
                      <span class="badge badge-neutral">{{ (c.type === 'company' ? 'customers.type.company' : 'customers.type.individual') | t }}</span>
                      @if (c.eInvoiceRegistered) { <span class="badge badge-success" [title]="(c.eDespatchRegistered ? ('ebelge.registry.eIrsaliye' | t) + ' · ' : '') + ('ebelge.registry.checkedAt' | t: { date: (c.eInvoiceCheckedAt | appDate: 'datetime') })"><span class="dot"></span>{{ 'ebelge.registry.eFatura' | t }}</span> }
                      @else if (c.eDespatchRegistered) { <span class="badge badge-info">{{ 'ebelge.registry.eIrsaliye' | t }}</span> }
                    </span>
                  </td>
                  <td class="c-mail" [title]="(c.email || '') + (c.email && c.phone ? ' · ' : '') + (c.phone || '')">
                    @if (c.email) { <a href="mailto:{{ c.email }}" class="link" (click)="$event.stopPropagation()">{{ c.email }}</a> }
                    @else if (c.phone) { <a href="tel:{{ c.phone }}" class="link" (click)="$event.stopPropagation()">{{ c.phone }}</a> }
                    @else { <span class="c-sec">—</span> }
                  </td>
                  <td class="c-loc">@if (location(c)) { {{ location(c) }} } @else { <span class="c-sec">—</span> }</td>
                  <td>@if (c.currency) { <span class="mono">{{ c.currency }}</span> } @else { <span class="c-sec">—</span> }</td>
                  <td class="r">{{ (c.orderCount ?? 0) | num }}</td>
                  <td class="c-sec">{{ c.lastOrderDate ? (c.lastOrderDate | appDate) : '—' }}</td>
                  @if (canEdit()) {
                    <td class="w-act" (click)="$event.stopPropagation()">
                      <span class="td-actions">
                        <button type="button" class="btn btn-ghost btn-xs btn-icon row-act" [attr.data-tip]="'common.edit' | t" [attr.aria-label]="'common.edit' | t" (click)="openDrawer(c)">
                          <app-icon name="edit" size="sm" />
                        </button>
                        @if (canDelete()) {
                          <button type="button" class="btn btn-ghost btn-xs btn-icon row-act delete-btn" [attr.data-tip]="'common.delete' | t" [attr.aria-label]="'common.delete' | t" (click)="deleteCustomer(c)">
                            <app-icon name="trash" size="sm" />
                          </button>
                        }
                      </span>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="c-mlist">
          @for (c of filteredCustomers(); track c.id) {
            <div class="mrow" role="button" tabindex="0" (click)="openDrawer(c)" (keydown.enter)="openDrawer(c)">
              <span class="thumb">{{ initials(c.name) }}</span>
              <b>{{ c.name }}</b>
              <span class="v">{{ (c.orderCount ?? 0) | num }}</span>
              <span class="s">{{ c.email || c.phone || location(c) || ((c.type === 'company' ? 'customers.type.company' : 'customers.type.individual') | t) }}</span>
              <span class="s r">
                @if (c.needsReview) { <span class="badge badge-warning"><span class="dot"></span>{{ 'customers.filter.needsReview' | t }}</span> }
                @else { {{ c.lastOrderDate ? (c.lastOrderDate | appDate) : '—' }} }
              </span>
            </div>
          }
        </div>

        <div class="tbl-foot">
          <span>{{ 'customers.resultCount' | t: { shown: (filteredCustomers().length | num), total: (customers().length | num) } }}</span>
        </div>
      }
    </div>

    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" aria-labelledby="custDrawerTitle" (click)="$event.stopPropagation()">
          <div class="drawer-h">
            <div class="t">
              <div class="eyebrow"><span>{{ 'customers.title' | t }}</span></div>
              <h2 id="custDrawerTitle">{{ editId() ? (editingCustomer()?.name || ('customers.editTitle' | t)) : ('customers.addTitle' | t) }}</h2>
            </div>
            <div class="tools">
              @if (editId() && canDelete()) {
                <button type="button" class="btn btn-ghost btn-sm" (click)="router.navigate(['/audit-log'], { queryParams: { entityType: 'customers', entityId: editId() } })"><app-icon name="audit" />{{ 'auditLog.history' | t }}</button>
              }
              <button type="button" class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()" class="drawer-form">
            <div class="drawer-body secs">
              @if (editId() && editingCustomer(); as ec) {
                <div class="cust-registry">
                  <span class="lbl">{{ 'ebelge.registry.title' | t }}</span>
                  @if (ec.eInvoiceRegistered === true) { <span class="badge badge-success"><span class="dot"></span>{{ 'ebelge.registry.eFatura' | t }}</span> }
                  @else if (ec.eInvoiceRegistered === false) { <span class="badge badge-neutral">{{ 'ebelge.registry.eArsiv' | t }}</span> }
                  @else { <span class="badge badge-neutral">{{ 'ebelge.registry.unknown' | t }}</span> }
                  @if (ec.eDespatchRegistered) { <span class="badge badge-info">{{ 'ebelge.registry.eIrsaliye' | t }}</span> }
                  @if (ec.eInvoiceCheckedAt) { <span class="cust-sub">{{ 'ebelge.registry.checkedAt' | t: { date: (ec.eInvoiceCheckedAt | appDate: 'datetime') } }}</span> }
                  @if (canEdit()) { <button type="button" class="btn btn-sm" [class.is-loading]="registryBusy()" (click)="checkRegistry(ec)" [disabled]="registryBusy()"><app-icon name="refresh" />{{ 'ebelge.registry.check' | t }}</button> }
                </div>
              }

              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'customers.section.basic' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld span-2">
                    <label class="fld-label" for="custName">{{ 'customers.form.name' | t }} <span class="req">*</span></label>
                    <div class="field">
                      <input id="custName" type="text" formControlName="name" [attr.aria-invalid]="isFieldInvalid('name')" aria-describedby="custNameErr" />
                    </div>
                    @if (isFieldInvalid('name')) { <div class="fld-error" id="custNameErr"><app-icon name="alert" size="sm" />{{ 'customers.form.nameRequired' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="custType">{{ 'customers.form.type' | t }}</label>
                    <div class="field select">
                      <select id="custType" formControlName="type">
                        <option value="individual">{{ 'customers.type.individual' | t }}</option>
                        <option value="company">{{ 'customers.type.company' | t }}</option>
                      </select>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="custCurrency">{{ 'customers.form.currency' | t }}</label>
                    <div class="field">
                      <input id="custCurrency" type="text" formControlName="currency" maxlength="3" class="mono" [attr.aria-invalid]="isFieldInvalid('currency')" (input)="upper('currency', $event)" />
                    </div>
                    @if (isFieldInvalid('currency')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'customers.form.currencyInvalid' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="custEmail">{{ 'customers.form.email' | t }}</label>
                    <div class="field">
                      <input id="custEmail" type="email" formControlName="email" [attr.aria-invalid]="isFieldInvalid('email')" />
                    </div>
                    @if (isFieldInvalid('email')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'customers.form.emailInvalid' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="custPhone">{{ 'customers.form.phone' | t }}</label>
                    <div class="field">
                      <input id="custPhone" type="tel" formControlName="phone" />
                    </div>
                  </div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'customers.section.identity' | t }}</h3></div>
                @if (editingReview()) {
                  <div class="notice notice-warning" role="note"><app-icon name="warn" /><span class="t">{{ ('customers.review.' + (editingReview() || 'GENERIC')) | t }}</span></div>
                }
                <app-identity-fields [form]="form" idPrefix="cust" [types]="identityTypes" [provinceCode]="addressGroup.value.provinceCode"></app-identity-fields>
                @if (editId() && editingCustomer()?.piiMasked && hasMaskedPii()) {
                  <div class="pii-row">
                    <span class="cust-sub">{{ 'customers.pii.masked' | t }}</span>
                    @if (canReadPii()) { <button type="button" class="btn btn-sm" [class.is-loading]="revealBusy()" (click)="revealPii()" [disabled]="revealBusy()"><app-icon name="eye" />{{ 'customers.pii.reveal' | t }}</button> }
                  </div>
                }
                @if (form.value.identityType === 'FOREIGN') {
                  <div class="grid-2">
                    <div class="fld">
                      <label class="fld-label" for="custNat">{{ 'customers.form.nationality' | t }}</label>
                      <div class="field">
                        <input id="custNat" type="text" maxlength="2" formControlName="nationality" class="mono" (input)="upper('nationality', $event)" />
                      </div>
                    </div>
                    <div class="fld">
                      <label class="fld-label" for="custPassport">{{ 'customers.form.passportNo' | t }}</label>
                      <div class="field">
                        <input id="custPassport" type="text" formControlName="passportNo" class="mono" />
                      </div>
                    </div>
                  </div>
                }
                <div class="checks">
                  <label class="check"><input type="checkbox" formControlName="isVatTaxpayer" />{{ 'customers.form.isVatTaxpayer' | t }}</label>
                  <label class="check"><input type="checkbox" formControlName="isDesignatedBuyer" />{{ 'customers.form.isDesignatedBuyer' | t }}</label>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">3</span><h3>{{ 'customers.section.address' | t }}</h3></div>
                <app-address-fields [group]="addressGroup" idPrefix="cust"></app-address-fields>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">4</span><h3>{{ 'customers.section.other' | t }}</h3></div>
                <div class="fld">
                  <label class="fld-label" for="custNotes">{{ 'customers.form.notes' | t }}</label>
                  <div class="field has-area">
                    <textarea id="custNotes" formControlName="notes" rows="3"></textarea>
                  </div>
                </div>
                @if (notesWarning().length) {
                  <div class="notice notice-warning" role="alert"><app-icon name="warn" /><span class="t">{{ 'customers.notesSensitiveWarning' | t: { categories: notesWarningText() } }}</span></div>
                }
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">5</span><h3>{{ 'customers.section.kvkk' | t }}</h3><p>{{ 'customers.notice.hint' | t }}</p></div>
                <div class="grid-3">
                  <div class="fld">
                    <label class="fld-label" for="custNoticeAt">{{ 'customers.notice.givenAt' | t }}</label>
                    <div class="field">
                      <input id="custNoticeAt" type="date" formControlName="noticeGivenAt" />
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="custNoticeVer">{{ 'customers.notice.version' | t }}</label>
                    <div class="field">
                      <input id="custNoticeVer" type="text" formControlName="noticeVersion" class="mono" />
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="custNoticeCh">{{ 'customers.notice.channel' | t }}</label>
                    <div class="field select">
                      <select id="custNoticeCh" formControlName="noticeChannel">
                        <option value="">—</option>
                        @for (ch of noticeChannels; track ch) { <option [value]="ch">{{ 'kvkk.channel.' + ch | t }}</option> }
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              @if (editId()) {
                <section class="fsec">
                  <div class="fsec-h"><span class="n">6</span><h3>{{ 'customers.section.consents' | t }}</h3></div>
                  <app-customer-consents [customerId]="editId()!" [canEdit]="canEdit()"></app-customer-consents>
                </section>

                <section class="fsec">
                  <div class="fsec-h"><span class="n">7</span><h3>{{ 'customers.section.addresses' | t }}</h3></div>
                  <div class="addr-list">
                    @for (a of addresses(); track a.id) {
                      <div class="addr-item">
                        <div class="addr-item-main">
                          <b>{{ ('customers.addressKind.' + a.kind) | t }}@if (a.label) { · {{ a.label }} }@if (a.isDefault) { <span class="badge badge-info">{{ 'customers.address.default' | t }}</span> }</b>
                          <span class="cust-sub">{{ formatAddress(a.address) }}</span>
                        </div>
                        <div class="addr-item-actions">
                          <button type="button" class="btn btn-ghost btn-sm btn-icon" [attr.data-tip]="'common.edit' | t" [attr.aria-label]="'common.edit' | t" (click)="editAddress(a)"><app-icon name="edit" size="sm" /></button>
                          <button type="button" class="btn btn-ghost btn-sm btn-icon delete-btn" [attr.data-tip]="'common.delete' | t" [attr.aria-label]="'common.delete' | t" (click)="removeAddress(a)"><app-icon name="trash" size="sm" /></button>
                        </div>
                      </div>
                    } @empty {
                      <p class="cust-sub">{{ 'customers.address.none' | t }}</p>
                    }
                    @if (addrEditorOpen()) {
                      <div class="addr-editor" [formGroup]="addrForm">
                        <div class="grid-2">
                          <div class="fld">
                            <label class="fld-label" for="addrKind">{{ 'customers.address.kind' | t }}</label>
                            <div class="field select">
                              <select id="addrKind" formControlName="kind">
                                <option value="DELIVERY">{{ 'customers.addressKind.DELIVERY' | t }}</option>
                                <option value="BILLING">{{ 'customers.addressKind.BILLING' | t }}</option>
                              </select>
                            </div>
                          </div>
                          <div class="fld">
                            <label class="fld-label" for="addrLabel">{{ 'customers.address.label' | t }}</label>
                            <div class="field">
                              <input id="addrLabel" type="text" formControlName="label" />
                            </div>
                          </div>
                        </div>
                        <app-address-fields [group]="addrAddressGroup" idPrefix="caddr"></app-address-fields>
                        <label class="check"><input type="checkbox" formControlName="isDefault" />{{ 'customers.address.default' | t }}</label>
                        <div class="addr-editor-actions">
                          <button type="button" class="btn btn-ghost btn-sm" (click)="addrEditorOpen.set(false)">{{ 'common.cancel' | t }}</button>
                          <button type="button" class="btn btn-primary btn-sm" [class.is-loading]="addrSaving()" [disabled]="addrAddressGroup.invalid || addrSaving()" (click)="saveAddress()">{{ 'common.save' | t }}</button>
                        </div>
                      </div>
                    } @else {
                      <button type="button" class="btn btn-subtle btn-sm addr-add" (click)="newAddress()"><app-icon name="plus" />{{ 'customers.address.add' | t }}</button>
                    }
                  </div>
                </section>
              }
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-ghost" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSaving()" [disabled]="form.invalid || form.pristine || isSaving()">
                <span>{{ 'common.save' | t }}</span><kbd>Ctrl ↵</kbd>
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

  initials(name: string): string {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toLocaleUpperCase(this.i18n.lang() === 'tr' ? 'tr' : 'en');
  }

  /** Esc closes the drawer (unless a save is in flight). */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isDrawerOpen() && !this.isSaving()) this.closeDrawer();
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
